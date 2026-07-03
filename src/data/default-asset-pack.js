"use strict";

(function registerDefaultAssetPack(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  IronLine.defaultAssetPack = {
    id: "iron-line-default",
    version: 1,
    label: "Iron Line Default Canvas Pack",
    basePath: "assets/packs/default/",
    lockedGameplay: true,
    slots: {
      "combat.tracer.line": {
        type: "effect-style",
        priority: "p0",
        style: {
          alpha: 0.42,
          maxWidth: 1.2,
          mobileMinWidth: 1.8,
          color: "rgba(255, 236, 172, 0.82)"
        }
      },
      "combat.muzzle.flash": {
        type: "effect-style",
        priority: "p0",
        style: {
          outerColor: "rgba(255, 226, 160, 0.92)",
          innerColor: "rgba(255, 248, 210, 0.9)",
          mobileScale: 1.12
        }
      },
      "combat.gun-smoke.puff": {
        type: "effect-style",
        priority: "p1",
        style: {
          warmColor: "#d7c1a0",
          coolColor: "#bfc5bf",
          alphaScale: 1
        }
      },
      "combat.explosion.core": {
        type: "effect-style",
        priority: "p0",
        style: {
          coreColor: "rgba(255, 246, 198, 1)",
          coreAlpha: 0.9,
          midAlpha: 0.78,
          edgeAlpha: 0.28,
          outerColor: "rgba(0, 0, 0, 0)"
        }
      },
      "combat.explosion.smoke": {
        type: "effect-style",
        priority: "p0",
        style: {
          coreColor: "rgba(45, 41, 35, 1)",
          coreAlpha: 0.42,
          midAlpha: 0.28,
          outerColor: "rgba(42, 38, 31, 0)"
        }
      },
      "combat.blast.ring": {
        type: "effect-style",
        priority: "p0",
        style: {
          color: "rgba(255, 238, 178, 0.65)",
          width: 5
        }
      },
      "combat.impact.spark": {
        type: "effect-style",
        priority: "p0",
        style: {
          color: "rgba(255, 172, 92, 0.86)",
          width: 2.2,
          mobileMinWidth: 1.6
        }
      },
      "combat.smoke.cloud": {
        type: "effect-style",
        priority: "p0",
        style: {
          coreColor: "rgba(223, 231, 233, 1)",
          bodyColor: "rgba(185, 196, 199, 1)",
          coreAlpha: 0.36,
          bodyAlpha: 0.24
        }
      },
      "vehicle.wreck.tank": {
        type: "canvas-style",
        priority: "p1",
        style: {
          hullColor: "#151615",
          plateColor: "#25231f",
          emberColor: "rgba(255, 174, 96, 0.18)"
        }
      },
      "vehicle.wreck.humvee": {
        type: "canvas-style",
        priority: "p1",
        style: {
          hullColor: "#191a18",
          emberColor: "rgba(255, 120, 70, 0.16)"
        }
      },
      "lobby.background.operation": {
        type: "image",
        priority: "p1",
        src: "../../home/subok-gameplay-hero.png",
        fallback: {
          cssGradient: "linear-gradient(135deg, #0b1110 0%, #18201c 54%, #251d18 100%)"
        }
      },
      "lobby.hero.screenshot": {
        type: "image",
        priority: "p1",
        src: "../../home/subok-gameplay-hero.png"
      }
    }
  };
})(window);
