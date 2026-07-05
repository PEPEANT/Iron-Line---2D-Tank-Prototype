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
  sandbox.IronLine = {
    math: {
      clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
      },
      roundRect() {}
    }
  };
  return vm.createContext(sandbox);
}

function pointInRect(point, rect) {
  return point.x >= rect.x && point.y >= rect.y && point.x <= rect.x + rect.w && point.y <= rect.y + rect.h;
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
  "src/tools/editor-objects.js"
].forEach((rel) => runFile(context, rel));

const IronLine = context.IronLine;
const errors = [];
const schema = {
  schemaVersion: 1,
  id: "interior-check",
  name: "Interior Check",
  world: { width: 900, height: 700 },
  roads: [],
  objects: [
    {
      id: "house-1",
      type: "house-small",
      x: 120,
      y: 160,
      rot: 0,
      scale: 1,
      interior: { mode: "open", variantSeed: "check" },
      tags: []
    }
  ],
  zones: [],
  story: null
};
const runtimeWorld = {
  id: schema.id,
  name: schema.name,
  width: schema.world.width,
  height: schema.world.height,
  roads: schema.roads,
  objects: schema.objects,
  capturePoints: []
};

IronLine.MapSchema.normalizeWorld(runtimeWorld, { catalog: IronLine.objectCatalog });

const walls = runtimeWorld.obstacles.filter((obstacle) => obstacle.parentObjectId === "house-1");
if (walls.length < 6) errors.push(`expected interior wall segments, got ${walls.length}`);
if (runtimeWorld.obstacles.some((obstacle) => obstacle.mapObjectId === "house-1" && obstacle.kind === "house-small")) {
  errors.push("house-small should not create a solid footprint obstacle");
}
if ((runtimeWorld.mapObjectRoofs || []).length !== 1) errors.push("house-small should create one cutaway roof");

const doorPoint = { x: 120 + 130, y: 160 + 161 };
const southWallPoint = { x: 120 + 42, y: 160 + 161 };
if (walls.some((wall) => pointInRect(doorPoint, wall))) errors.push("front door gap is blocked by a wall segment");
if (!walls.some((wall) => pointInRect(southWallPoint, wall))) errors.push("south wall solid segment is missing");

const validation = IronLine.MapSchema.validateSchema(schema, IronLine.objectCatalog);
if (!validation.ok) errors.push(...validation.errors);

const draft = IronLine.editorObjectTools.editorDraftFromSchema(schema);
if (draft.obstacles.length !== 1) errors.push("editor import should keep house-small as one placement object");
if (draft.obstacles[0]?.kind !== "house-small") errors.push("editor import lost house-small kind");

context.IronLine.Renderer = function Renderer() {};
context.IronLine.Renderer.prototype.drawObstacles = function drawObstacles() {};
runFile(context, "src/systems/renderer-map-objects.js");
if (typeof context.IronLine.Renderer.prototype.drawMapObjectOverlays !== "function") {
  errors.push("renderer map-object overlay hook did not install");
}

if (errors.length) fail(errors);

console.log(`Map interior check passed: ${JSON.stringify({ walls: walls.length, roofs: runtimeWorld.mapObjectRoofs.length })}`);
