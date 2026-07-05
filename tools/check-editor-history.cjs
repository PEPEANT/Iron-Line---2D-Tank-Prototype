"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function runFile(context, rel) {
  vm.runInContext(read(rel), context, { filename: rel });
}

function createBrowserLikeContext() {
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    URLSearchParams,
    Math,
    JSON,
    Function,
    addEventListener: () => {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.localStorage = {
    data: new Map(),
    getItem(key) {
      return this.data.has(key) ? this.data.get(key) : null;
    },
    setItem(key, value) {
      this.data.set(key, String(value));
    }
  };
  sandbox.document = {
    getElementById: () => null,
    querySelector: () => null,
    createElement: () => ({ addEventListener() {}, dataset: {}, prepend() {} })
  };
  sandbox.IronLine = {};
  return vm.createContext(sandbox);
}

function fail(lines) {
  for (const line of lines) console.error(line);
  process.exit(1);
}

const context = createBrowserLikeContext();
[
  "src/data/scenery-catalog.js",
  "src/data/object-catalog.js",
  "src/data/map-schema.js",
  "src/systems/map-objects.js",
  "src/data/map01.js",
  "src/data/map01-custom-layout.js",
  "src/tools/editor-objects.js",
  "src/tools/editor-history.js"
].forEach((rel) => runFile(context, rel));

const IronLine = context.IronLine;
const errors = [];

if (!IronLine.editorHistoryTools) errors.push("editorHistoryTools did not load");

if (!errors.length) {
  const history = IronLine.editorHistoryTools.createHistory("snapshot-0", 64);
  for (let i = 1; i <= 25; i += 1) {
    IronLine.editorHistoryTools.recordSnapshot(history, `snapshot-${i}`);
  }
  for (let i = 24; i >= 5; i -= 1) {
    const got = IronLine.editorHistoryTools.undoSnapshot(history, `snapshot-${i + 1}`);
    if (got !== `snapshot-${i}`) errors.push(`undo ${i} returned ${got}`);
  }
  for (let i = 6; i <= 25; i += 1) {
    const got = IronLine.editorHistoryTools.redoSnapshot(history, `snapshot-${i - 1}`);
    if (got !== `snapshot-${i}`) errors.push(`redo ${i} returned ${got}`);
  }

  const map = IronLine.map01;
  const script = `"use strict";
(function applyIronLineMapLayout(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  if (!IronLine.map01) return;
  IronLine.map01.width = ${JSON.stringify(map.width)};
  IronLine.map01.height = ${JSON.stringify(map.height)};
  IronLine.map01.roadWidth = ${JSON.stringify(map.roadWidth)};
  IronLine.map01.roads = ${JSON.stringify(map.roads)};
  IronLine.map01.obstacles = ${JSON.stringify(map.obstacles)};
  IronLine.map01.capturePoints = ${JSON.stringify(map.capturePoints)};
  IronLine.map01.safeZones = ${JSON.stringify(map.safeZones)};
  IronLine.map01.baseExitPoints = ${JSON.stringify(map.baseExitPoints)};
  IronLine.map01.spawns = ${JSON.stringify(map.spawns)};
  IronLine.map01.reconPoints = ${JSON.stringify(map.reconPoints)};
  IronLine.map01.navGraph = ${JSON.stringify(map.navGraph)};
})(window);`;
  const draft = IronLine.editorObjectTools.editorDraftFromEditorScript(script);
  if ((draft.safeZones || []).length !== (map.safeZones || []).length) errors.push("history draft lost safe zones");
  if (!draft.spawns?.blue?.length) errors.push("history draft lost spawns");
  if (!draft.navGraph?.nodes?.length) errors.push("history draft lost nav graph nodes");
}

if (errors.length) fail(errors);

console.log("Editor history check passed");
