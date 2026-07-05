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
  "src/systems/map-objects.js"
].forEach((rel) => runFile(context, rel));

const IronLine = context.IronLine;
const world = {
  id: "connection-check",
  name: "Connection Check",
  width: 900,
  height: 700,
  roads: [],
  objects: [
    { id: "house-a", type: "house-small", x: 100, y: 100, rot: 0, scale: 1, tags: [] },
    { id: "house-b", type: "house-small", x: 360, y: 100, rot: 0, scale: 1, tags: [] }
  ],
  capturePoints: []
};
const errors = [];

IronLine.MapSchema.normalizeWorld(world, { catalog: IronLine.objectCatalog });

const connections = world.mapObjectConnections || [];
if (connections.length !== 1) errors.push(`expected one building connection, got ${connections.length}`);
const connection = connections[0] || {};
if (connection.wall !== "east" || connection.oppositeWall !== "west") {
  errors.push(`unexpected connection walls: ${connection.wall}/${connection.oppositeWall}`);
}

const walls = world.obstacles.filter((obstacle) => obstacle.interior);
const passage = { x: 360, y: 185 };
const wallAbove = { x: 360, y: 125 };
if (walls.some((wall) => pointInRect(passage, wall))) errors.push("shared-wall passage is still blocked");
if (!walls.some((wall) => pointInRect(wallAbove, wall))) errors.push("shared wall above the passage should remain solid");
if (world.objects[0].overrides || world.objects[1].overrides) errors.push("runtime connection must not merge or mutate object overrides");

if (errors.length) fail(errors);

console.log(`Map connection check passed: ${JSON.stringify({ connections: connections.length, walls: walls.length })}`);
