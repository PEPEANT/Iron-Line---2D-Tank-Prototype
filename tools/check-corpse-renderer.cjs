"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fakeCtx() {
  const calls = [];
  const ctx = new Proxy({ calls }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args) => {
        calls.push({ prop, args });
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
  return ctx;
}

function createContext() {
  const sandbox = {
    console,
    Math,
    JSON,
    performance: { now: () => 1000 }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.IronLine = {
    constants: { TEAM: { BLUE: "blue", RED: "red" } },
    math: {
      clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
      },
      lerp(a, b, t) {
        return a + (b - a) * t;
      },
      roundRect(ctx, ...args) {
        ctx.calls.push({ prop: "roundRect", args });
      }
    },
    Renderer: function Renderer() {}
  };
  sandbox.IronLine.Renderer.prototype.assetStyle = (_slot, fallback) => fallback;
  return vm.createContext(sandbox);
}

const context = createContext();
vm.runInContext(read("src/systems/renderer-corpse.js"), context, { filename: "src/systems/renderer-corpse.js" });
const rendererSource = read("src/systems/renderer.js");

const renderer = Object.create(context.IronLine.Renderer.prototype);
renderer.ctx = fakeCtx();

const dead = { x: 100, y: 120, hp: 0, alive: false, team: "red", angle: 0, radius: 10, deathTime: 0, deathPoseAngle: Math.PI / 2 };
const wounded = { x: 140, y: 120, hp: 0, team: "blue", angle: 0, radius: 10, deathTime: 0, deathPoseAngle: Math.PI / 2 };

renderer.drawInfantryCorpse(dead);
renderer.drawInfantryCorpse(wounded, { wounded: true });

const calls = renderer.ctx.calls.map((call) => String(call.prop));
const errors = [];
if (typeof renderer.drawInfantryCorpse !== "function") errors.push("drawInfantryCorpse override did not install");
if (!calls.includes("ellipse")) errors.push("corpse renderer did not draw body shadow");
if (!calls.includes("arc")) errors.push("corpse renderer did not draw head or wounded ring");
if (!calls.includes("setLineDash")) errors.push("wounded renderer did not draw dashed revive marker");
if (!rendererSource.includes("drawGroundCorpses(game)")) errors.push("renderer must expose ground corpse pass");
if (rendererSource.indexOf("this.drawGroundCorpses(game);") > rendererSource.indexOf("for (const humvee of game.humvees || [])")) errors.push("ground corpses must render below vehicles");
if (!rendererSource.includes("if (!unit.alive) return;")) errors.push("dead infantry should not be redrawn over vehicles");

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log("Corpse renderer check passed");
