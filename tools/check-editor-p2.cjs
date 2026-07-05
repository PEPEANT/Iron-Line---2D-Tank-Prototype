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
    URLSearchParams,
    Math,
    JSON,
    Function
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
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
  "src/tools/editor-objects.js"
].forEach((rel) => runFile(context, rel));

const IronLine = context.IronLine;
const errors = [];

if (!IronLine.editorObjectTools) errors.push("editorObjectTools did not load");
if (!IronLine.sceneryCatalog.__objectCatalogBridge) errors.push("object catalog bridge did not install");
if (!IronLine.sceneryCatalog.obstacleKinds.some((item) => item.kind === "supply-locker")) {
  errors.push("editor catalog bridge did not expose supply-locker");
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
})(window);`;

if (!errors.length) {
  const schema = IronLine.editorObjectTools.schemaFromEditorScript(script);
  const validation = IronLine.MapSchema.validateSchema(schema, IronLine.objectCatalog);
  if (!validation.ok) errors.push(...validation.errors);
  if (schema.story !== null) errors.push("exported schema story must be null");
  if (schema.objects.length !== map.obstacles.length) {
    errors.push(`schema object count mismatch: ${schema.objects.length} vs ${map.obstacles.length}`);
  }

  const draft = IronLine.editorObjectTools.editorDraftFromSchema(schema);
  if (draft.obstacles.length !== schema.objects.length) {
    errors.push(`draft obstacle count mismatch: ${draft.obstacles.length} vs ${schema.objects.length}`);
  }
  if (!Array.isArray(draft.roads) || draft.roads.length !== schema.roads.length) {
    errors.push("draft roads did not round-trip from schema");
  }
  if (draft.editMode !== "obstacle") errors.push("imported draft should reopen in obstacle mode");
}

if (errors.length) fail(errors);

console.log("Editor P2 check passed");
