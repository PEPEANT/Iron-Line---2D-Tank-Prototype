"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const hotspotBaselinePath = path.join(__dirname, "hotspot-baseline.json");

const trackedRoots = ["src", "server", "tools"];
const trackedTopLevelFiles = [
  "index.html",
  "admin.html",
  "editor.html",
  "styles.css",
  "admin-observer.css",
  "session-flow.css",
  "chat.css",
  "role-change.css",
  "map-editor.css"
];

const lineBudgets = new Map([
  ["src/main.js", 4650],
  ["src/systems/hud.js", 3300],
  ["src/systems/renderer.js", 3050],
  ["styles.css", 3100],
  ["src/ai/infantry-ai.js", 2850],
  ["src/tools/map-editor.js", 2400],
  ["tools/check-behavior-census.cjs", 950]
]);

const defaultBudgets = {
  ".js": 1600,
  ".cjs": 700,
  ".css": 1200,
  ".html": 900
};

const warningLineThreshold = 1000;
const warningByteThreshold = 100 * 1024;
const methodWarningLines = 220;
const maxMethodWarnings = 12;
const defaultRatchetAllowanceLines = 40;
const byteBudgets = new Map([
  ["src/main.js", 180 * 1024],
  ["src/systems/hud.js", 120 * 1024],
  ["src/systems/renderer.js", 118 * 1024],
  ["src/ai/infantry-ai.js", 118 * 1024],
  ["src/tools/map-editor.js", 92 * 1024]
]);

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function relative(filePath) {
  return toPosix(path.relative(root, filePath));
}

function collectFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }

  return files;
}

function trackedFiles() {
  const files = [];
  for (const directory of trackedRoots) files.push(...collectFiles(path.join(root, directory)));
  for (const file of trackedTopLevelFiles) {
    const fullPath = path.join(root, file);
    if (fs.existsSync(fullPath)) files.push(fullPath);
  }
  return files.filter((file) => Object.hasOwn(defaultBudgets, path.extname(file)));
}

function lineCount(file) {
  const text = fs.readFileSync(file, "utf8");
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

function readHotspotBaseline() {
  if (!fs.existsSync(hotspotBaselinePath)) {
    return { allowanceLines: defaultRatchetAllowanceLines, files: {} };
  }
  const baseline = JSON.parse(fs.readFileSync(hotspotBaselinePath, "utf8"));
  return {
    allowanceLines: Number.isFinite(baseline.allowanceLines)
      ? baseline.allowanceLines
      : defaultRatchetAllowanceLines,
    files: baseline.files && typeof baseline.files === "object" ? baseline.files : {}
  };
}

function writeHotspotBaseline(baseline) {
  const sortedFiles = {};
  for (const file of Object.keys(baseline.files).sort()) {
    sortedFiles[file] = baseline.files[file];
  }
  const payload = {
    allowanceLines: baseline.allowanceLines,
    files: sortedFiles
  };
  fs.writeFileSync(hotspotBaselinePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function braceDelta(line) {
  let delta = 0;
  let quote = "";
  let escaped = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote) {
      if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") delta += 1;
    else if (char === "}") delta -= 1;
  }

  return delta;
}

function longMethods(file) {
  if (!file.endsWith(".js")) return [];
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const findings = [];

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^    ([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)\s*\{/);
    if (!match) continue;

    let depth = braceDelta(lines[i]);
    let end = i;
    for (let j = i + 1; j < lines.length && depth > 0; j += 1) {
      depth += braceDelta(lines[j]);
      end = j;
    }

    const length = end - i + 1;
    if (length > methodWarningLines) {
      findings.push({
        method: match[1],
        start: i + 1,
        lines: length
      });
    }
    i = end;
  }

  return findings;
}

const files = trackedFiles();
const hotspotBaseline = readHotspotBaseline();
let hotspotBaselineLowered = false;
const errors = [];
const warnings = [];
const methodWarnings = [];

for (const file of files) {
  const rel = relative(file);
  const ext = path.extname(file);
  const lines = lineCount(file);
  const bytes = fs.statSync(file).size;
  const budget = lineBudgets.get(rel) || defaultBudgets[ext];
  const byteBudget = byteBudgets.get(rel);
  const ratchetBaseline = hotspotBaseline.files[rel];

  if (Number.isFinite(ratchetBaseline)) {
    const ratchetLimit = ratchetBaseline + hotspotBaseline.allowanceLines;
    if (lines > ratchetLimit) {
      errors.push(`${rel}: ${lines} lines exceeds ratchet ${ratchetBaseline} + ${hotspotBaseline.allowanceLines}. Move new code into a focused module.`);
    } else if (lines < ratchetBaseline) {
      hotspotBaseline.files[rel] = lines;
      hotspotBaselineLowered = true;
      warnings.push(`${rel}: ratchet lowered from ${ratchetBaseline} to ${lines} lines.`);
    }
  }

  if (lines > budget) {
    errors.push(`${rel}: ${lines} lines exceeds budget ${budget}. Move new code into a focused module.`);
  } else if (lines > warningLineThreshold) {
    warnings.push(`${rel}: ${lines} lines. Hotspot file; avoid adding new feature bodies here.`);
  }
  if (byteBudget && bytes > byteBudget) {
    errors.push(`${rel}: ${Math.round(bytes / 1024)}KB exceeds byte budget ${Math.round(byteBudget / 1024)}KB. Split this file before adding more behavior.`);
  } else if (bytes > warningByteThreshold) {
    warnings.push(`${rel}: ${Math.round(bytes / 1024)}KB. Size hotspot; split future work into a module.`);
  }

  for (const finding of longMethods(file)) {
    methodWarnings.push(`${rel}:${finding.start} ${finding.method}() is ${finding.lines} lines.`);
  }
}

if (warnings.length) {
  console.warn("Code health warnings:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (methodWarnings.length) {
  console.warn("Long method warnings:");
  for (const warning of methodWarnings.slice(0, maxMethodWarnings)) console.warn(`- ${warning}`);
  if (methodWarnings.length > maxMethodWarnings) {
    console.warn(`- ... ${methodWarnings.length - maxMethodWarnings} more long methods`);
  }
}

if (hotspotBaselineLowered) writeHotspotBaseline(hotspotBaseline);

if (errors.length) {
  console.error("Code health budget failures:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Code health check passed for ${files.length} files.`);
}
