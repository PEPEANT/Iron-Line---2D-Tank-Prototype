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
    JSON
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
  "src/data/map01-custom-layout.js"
].forEach((rel) => runFile(context, rel));

const IronLine = context.IronLine;
const world = IronLine.map01;
const errors = [];
const warnings = [];

if (!world) errors.push("IronLine.map01 did not load");
if (!IronLine.objectCatalog) errors.push("IronLine.objectCatalog did not load");
if (!IronLine.MapSchema) errors.push("IronLine.MapSchema did not load");

if (!errors.length) {
  const catalogEntries = IronLine.objectCatalog.all();
  const schema = IronLine.MapSchema.exportWorld(world);
  const validation = IronLine.MapSchema.validateSchema(schema, IronLine.objectCatalog);
  errors.push(...validation.errors);
  warnings.push(...validation.warnings);

  if (!Array.isArray(world.objects) || world.objects.length === 0) {
    errors.push("map01 has no schema objects");
  }
  if (!Array.isArray(world.obstacles) || world.obstacles.length === 0) {
    errors.push("map01 has no runtime obstacles after object normalization");
  }
  if ((world.objects || []).length !== (world.obstacles || []).length) {
    errors.push(`object/obstacle count mismatch: ${world.objects?.length || 0} objects vs ${world.obstacles?.length || 0} obstacles`);
  }
  if (schema.story !== null) {
    errors.push("schema story must stay null in v1");
  }
  if (!catalogEntries.some((entry) => entry.id === "supply-locker")) {
    errors.push("object catalog is missing supply-locker");
  }
  if (!catalogEntries.some((entry) => entry.category === "건물")) {
    errors.push("object catalog has no 건물 category entries");
  }
  if (!catalogEntries.some((entry) => entry.category === "구조물")) {
    errors.push("object catalog has no 구조물 category entries");
  }
  if (!catalogEntries.some((entry) => entry.category === "장식")) {
    errors.push("object catalog has no 장식 category entries");
  }
}

if (errors.length) fail(errors);

const summary = {
  mapId: world.id,
  schemaVersion: world.schemaVersion,
  objects: world.objects.length,
  runtimeObstacles: world.obstacles.length,
  zones: world.zones?.length || 0,
  catalogEntries: IronLine.objectCatalog.all().length,
  warnings
};

console.log(`Map schema check passed: ${JSON.stringify(summary)}`);
