"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const reportsDir = path.join(root, "reports");

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

const defaultBudgets = {
  ".js": 1600,
  ".cjs": 700,
  ".css": 1200,
  ".html": 900
};

const lineBudgets = new Map([
  ["src/main.js", 4650],
  ["src/systems/hud.js", 3300],
  ["src/systems/renderer.js", 3050],
  ["styles.css", 3100],
  ["src/ai/infantry-ai.js", 2850],
  ["src/tools/map-editor.js", 2400]
]);

const byteBudgets = new Map([
  ["src/main.js", 180 * 1024],
  ["src/systems/hud.js", 120 * 1024],
  ["src/systems/renderer.js", 118 * 1024],
  ["src/ai/infantry-ai.js", 118 * 1024],
  ["src/tools/map-editor.js", 92 * 1024]
]);

const methodWarningLines = 220;
const warningLineThreshold = 1000;
const warningByteThreshold = 100 * 1024;

const refactorHints = {
  "src/main.js": [
    "session-state.js",
    "match-flow.js",
    "respawn-system.js",
    "admin-actions.js"
  ],
  "src/systems/renderer.js": [
    "minimap-renderer.js",
    "drone-renderer.js",
    "debug-renderer.js",
    "overlay-renderer.js"
  ],
  "src/systems/hud.js": [
    "admin-ui.js",
    "settings-ui.js",
    "mobile-controls-ui.js",
    "result-ui.js"
  ],
  "src/ai/infantry-ai.js": [
    "infantry-fire-decision.js",
    "infantry-cover-decision.js",
    "infantry-transport-decision.js",
    "infantry-movement.js"
  ],
  "src/tools/map-editor.js": [
    "map-editor-palette.js",
    "map-editor-resize.js",
    "map-editor-road-tools.js"
  ],
  "src/systems/combat.js": [
    "projectile-system.js",
    "damage-system.js",
    "explosion-effects.js"
  ],
  "src/ai/commander-ai.js": [
    "objective-planner.js",
    "squad-assignment.js",
    "commander-threats.js"
  ],
  "styles.css": [
    "lobby.css",
    "deployment.css",
    "admin.css",
    "renderer-overlays.css"
  ]
};

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
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "reports") {
      continue;
    }
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }

  return files;
}

function trackedFiles() {
  const files = [];

  for (const directory of trackedRoots) {
    files.push(...collectFiles(path.join(root, directory)));
  }

  for (const file of trackedTopLevelFiles) {
    const fullPath = path.join(root, file);
    if (fs.existsSync(fullPath)) files.push(fullPath);
  }

  return files
    .filter((file) => Object.hasOwn(defaultBudgets, path.extname(file)))
    .sort((a, b) => relative(a).localeCompare(relative(b)));
}

function readText(file) {
  return fs.readFileSync(file, "utf8");
}

function lineCount(text) {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

function braceDelta(line) {
  const source = line
    .replace(/\/(?:\\.|[^/\\])+\/[dgimsuy]*/g, "/re/")
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, "\"\"");
  let delta = 0;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === "{") delta += 1;
    else if (char === "}") delta -= 1;
  }

  return delta;
}

function methodName(line) {
  const classMethod = line.match(/^(\s+)([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)\s*\{/);
  if (classMethod && classMethod[1].length >= 2 && classMethod[1].length <= 6) {
    return classMethod[2];
  }

  const patterns = [
    /^\s*(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)\s*\{/,
    /^\s*(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/,
    /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) return match[1];
  }

  return "";
}

function longMethods(file, text) {
  if (!file.endsWith(".js") && !file.endsWith(".cjs")) return [];

  const lines = text.split(/\r?\n/);
  const findings = [];

  for (let i = 0; i < lines.length; i += 1) {
    const name = methodName(lines[i]);
    if (!name) continue;

    let depth = braceDelta(lines[i]);
    if (depth <= 0) continue;

    let end = i;
    for (let j = i + 1; j < lines.length && depth > 0; j += 1) {
      depth += braceDelta(lines[j]);
      end = j;
    }

    const length = end - i + 1;
    if (length > methodWarningLines) {
      findings.push({
        method: name,
        start: i + 1,
        lines: length
      });
    }
    i = end;
  }

  return findings;
}

function featureWarnings(rel, text) {
  const warnings = [];
  const probes = {
    admin: /admin|observer|operator/i,
    lobby: /lobby|room|slot/i,
    deployment: /deployment|loadout/i,
    respawn: /respawn|death/i,
    minimap: /minimap|tactical/i,
    drone: /drone/i,
    debug: /debug|laboratory|observatory/i,
    chat: /chat|message/i,
    role: /role|class/i
  };

  const hits = Object.entries(probes)
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name);

  if (hits.length >= 5 && rel.startsWith("src/")) {
    warnings.push(`mixed concerns: ${hits.slice(0, 6).join(", ")}`);
  }

  if (rel === "src/main.js" && hits.includes("admin") && hits.includes("lobby") && hits.includes("respawn")) {
    warnings.push("main flow still owns admin/lobby/respawn behavior");
  }

  if (rel === "src/systems/renderer.js" && hits.includes("minimap") && hits.includes("drone") && hits.includes("debug")) {
    warnings.push("renderer mixes minimap, drone and debug drawing");
  }

  if (rel === "src/systems/hud.js" && hits.includes("lobby") && hits.includes("deployment")) {
    warnings.push("hud still coordinates multiple UI flows");
  }

  return warnings;
}

function riskLevel(score) {
  if (score >= 100) return "critical";
  if (score >= 75) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function analyzeFile(file) {
  const rel = relative(file);
  const ext = path.extname(file);
  const text = readText(file);
  const lines = lineCount(text);
  const bytes = fs.statSync(file).size;
  const lineBudget = lineBudgets.get(rel) || defaultBudgets[ext];
  const byteBudget = byteBudgets.get(rel) || null;
  const methods = longMethods(file, text);
  const warnings = [];
  const lineRatio = lineBudget ? lines / lineBudget : 0;
  const byteRatio = byteBudget ? bytes / byteBudget : bytes / warningByteThreshold;

  if (lines > lineBudget) warnings.push(`over line budget ${lines}/${lineBudget}`);
  else if (lines > warningLineThreshold) warnings.push(`line hotspot ${lines} lines`);

  if (byteBudget && bytes > byteBudget) warnings.push(`over byte budget ${Math.round(bytes / 1024)}KB/${Math.round(byteBudget / 1024)}KB`);
  else if (bytes > warningByteThreshold) warnings.push(`size hotspot ${Math.round(bytes / 1024)}KB`);

  warnings.push(...featureWarnings(rel, text));

  const score = Math.round(
    Math.max(lineRatio, byteRatio) * 70 +
    methods.length * 12 +
    warnings.length * 7
  );

  return {
    path: rel,
    ext,
    lines,
    kb: Number((bytes / 1024).toFixed(1)),
    lineBudget,
    byteBudgetKb: byteBudget ? Math.round(byteBudget / 1024) : null,
    lineRatio: Number(lineRatio.toFixed(2)),
    byteRatio: Number(byteRatio.toFixed(2)),
    riskScore: score,
    riskLevel: riskLevel(score),
    mustSplitBeforeFeature: lineRatio >= 0.95 || (byteBudget && byteRatio >= 0.95) || methods.length >= 2,
    warnings,
    longMethods: methods,
    suggestedModules: refactorHints[rel] || []
  };
}

function makeSummary(files) {
  const byLevel = files.reduce((summary, file) => {
    summary[file.riskLevel] = (summary[file.riskLevel] || 0) + 1;
    return summary;
  }, {});

  return {
    generatedAt: new Date().toISOString(),
    fileCount: files.length,
    critical: byLevel.critical || 0,
    high: byLevel.high || 0,
    medium: byLevel.medium || 0,
    low: byLevel.low || 0,
    mustSplitBeforeFeature: files.filter((file) => file.mustSplitBeforeFeature).length
  };
}

function markdownTable(rows, headers) {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  return [head, sep, ...rows.map((row) => `| ${row.join(" | ")} |`)].join("\n");
}

function makeMarkdown(report) {
  const topFiles = report.files.slice(0, 12);
  const longMethodsRows = report.files
    .flatMap((file) => file.longMethods.map((method) => [
      file.path,
      `${method.method}()`,
      String(method.start),
      String(method.lines)
    ]))
    .sort((a, b) => Number(b[3]) - Number(a[3]))
    .slice(0, 12);

  const splitRows = report.files
    .filter((file) => file.mustSplitBeforeFeature || file.suggestedModules.length)
    .slice(0, 10)
    .map((file) => [
      file.path,
      file.riskLevel,
      file.suggestedModules.length ? file.suggestedModules.join(", ") : "split next feature into a new module"
    ]);

  const lines = [
    "# Code Health Report",
    "",
    `Generated: ${report.summary.generatedAt}`,
    "",
    "## Summary",
    "",
    markdownTable([
      ["Files", String(report.summary.fileCount)],
      ["Critical", String(report.summary.critical)],
      ["High", String(report.summary.high)],
      ["Medium", String(report.summary.medium)],
      ["Must split before feature", String(report.summary.mustSplitBeforeFeature)]
    ], ["Metric", "Value"]),
    "",
    "## Top Risk Files",
    "",
    markdownTable(topFiles.map((file) => [
      file.path,
      file.riskLevel,
      String(file.riskScore),
      `${file.lines}/${file.lineBudget}`,
      `${file.kb}${file.byteBudgetKb ? `/${file.byteBudgetKb}` : ""}KB`,
      file.warnings.join("<br>") || "-"
    ]), ["File", "Risk", "Score", "Lines", "Size", "Warnings"]),
    "",
    "## Long Methods",
    "",
    longMethodsRows.length
      ? markdownTable(longMethodsRows, ["File", "Method", "Start", "Lines"])
      : "No long methods above the configured threshold.",
    "",
    "## Suggested Refactor Order",
    "",
    splitRows.length
      ? markdownTable(splitRows, ["File", "Risk", "Next modules"])
      : "No split candidates found.",
    "",
    "## Rule",
    "",
    "- Files marked `critical` or `mustSplitBeforeFeature` should not receive new feature bodies.",
    "- Add new behavior as focused modules, then keep the large file as a coordinator only.",
    "- Use `npm run health` before large patches and after refactors."
  ];

  return `${lines.join("\n")}\n`;
}

function main() {
  const files = trackedFiles().map(analyzeFile)
    .sort((a, b) => b.riskScore - a.riskScore || b.lines - a.lines);
  const report = {
    summary: makeSummary(files),
    files
  };

  fs.mkdirSync(reportsDir, { recursive: true });
  const jsonPath = path.join(reportsDir, "code-health.json");
  const mdPath = path.join(reportsDir, "code-health.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(mdPath, makeMarkdown(report), "utf8");

  console.log(`Code health report written:`);
  console.log(`- ${relative(jsonPath)}`);
  console.log(`- ${relative(mdPath)}`);
  console.log("");
  console.log("Top risk files:");
  for (const file of files.slice(0, 8)) {
    console.log(`- ${file.path}: ${file.riskLevel} score=${file.riskScore} lines=${file.lines}/${file.lineBudget}`);
  }
}

main();
