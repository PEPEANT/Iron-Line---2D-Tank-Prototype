"use strict";

(function registerConstants(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  const TEAM = {
    BLUE: "blue",
    RED: "red",
    NEUTRAL: "neutral"
  };

  const TEAM_COLORS = {
    blue: "#64b5f6",
    red: "#ff6761",
    neutral: "#d6d1bd"
  };

  const AMMO = {
    ap: {
      id: "ap",
      name: "철갑탄",
      loadTime: 1.45,
      speed: 940,
      damage: 72,
      infantryDamage: 72,
      splash: 0,
      range: 2400,
      life: 3.4,
      shellRadius: 4,
      directExplosionRadius: 36,
      directScorchRadius: 18,
      color: "#fff2a8"
    },
    he: {
      id: "he",
      name: "고폭탄",
      loadTime: 2.2,
      speed: 610,
      damage: 48,
      tankDamageScale: 0.42,
      infantryDamageScale: 1.18,
      suppressionBase: 34,
      suppressionMax: 74,
      splash: 158,
      range: 1900,
      life: 3.1,
      shellRadius: 6,
      explosionStart: 30,
      explosionLife: 0.68,
      scorchRadius: 54,
      color: "#ffb45c"
    },
    smoke: {
      id: "smoke",
      name: "연막탄",
      equipment: true,
      cooldown: 7,
      damage: 0,
      splash: 0,
      color: "#d8dde2"
    }
  };

  const AI_CONFIG = {
    sightRange: 1500,
    lineOfFireRange: 1400,
    immediateThreatRange: 640,
    lostContactGrace: 2.1,
    objectiveLeashRadius: 760,
    holdLeashRadius: 560,
    objectiveThreatExtra: 480,
    maxPursuitFromOrder: 720,
    blockedShotRepositionRange: 1450,
    retreatHealthRatio: 0.34,
    reconReassignInterval: 36,
    desiredRange: {
      ap: 980,
      he: 760,
      fallback: 880
    }
  };

  IronLine.constants = { TEAM, TEAM_COLORS, AMMO, AI_CONFIG };
})(window);
