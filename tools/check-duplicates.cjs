"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sourceRoots = [path.join(root, "src"), path.join(root, "server")];

function collectJavaScriptFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJavaScriptFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }

  return files;
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

function duplicateClassMethods(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const findings = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const classMatch = lines[lineIndex].match(/^(\s*)class\s+([A-Za-z0-9_]+)/);
    if (!classMatch) continue;

    const className = classMatch[2];
    let depth = braceDelta(lines[lineIndex]);
    const methods = new Map();

    for (let i = lineIndex + 1; i < lines.length && depth > 0; i += 1) {
      const methodMatch = lines[i].match(/^    ([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/);
      if (methodMatch && depth === 1) {
        const name = methodMatch[1];
        if (!methods.has(name)) methods.set(name, []);
        methods.get(name).push(i + 1);
      }
      depth += braceDelta(lines[i]);
      lineIndex = i;
    }

    for (const [method, locations] of methods.entries()) {
      if (locations.length > 1) {
        findings.push({ className, method, locations });
      }
    }
  }

  return findings;
}

const files = sourceRoots.flatMap((directory) => (
  fs.existsSync(directory) ? collectJavaScriptFiles(directory) : []
));
let failed = false;

for (const file of files) {
  const findings = duplicateClassMethods(file);
  if (!findings.length) continue;
  failed = true;
  const relative = path.relative(root, file);
  for (const finding of findings) {
    console.error(
      `${relative}: duplicate ${finding.className}.${finding.method} at lines ${finding.locations.join(", ")}`
    );
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`Duplicate class-method check passed for ${files.length} JavaScript files.`);
}
