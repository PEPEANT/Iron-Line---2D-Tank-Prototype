"use strict";

(function registerWreckCover(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  function isVehicleWreck(vehicle) {
    return Boolean(vehicle && !vehicle.coverDestroyed && (!vehicle.alive || vehicle.hp <= 0 || vehicle.destructionPending));
  }

  function wreckCoverMaxHp(wreck) {
    if (!wreck) return 0;
    return wreck.vehicleType === "humvee" ? 155 : 285;
  }

  function damageVehicleWreck(game, wreck, amount, options = {}) {
    if (!isVehicleWreck(wreck) || amount <= 0) return false;
    wreck.coverMaxHp = Number.isFinite(wreck.coverMaxHp) ? wreck.coverMaxHp : wreckCoverMaxHp(wreck);
    wreck.coverHp = Number.isFinite(wreck.coverHp) ? wreck.coverHp : wreck.coverMaxHp;
    wreck.coverHp = Math.max(0, wreck.coverHp - amount);
    wreck.damageFlash = Math.max(wreck.damageFlash || 0, 0.28);
    wreck.lastArmorHit = {
      zone: "wreck",
      multiplier: 0,
      ammoId: options.ammoId || "",
      time: game?.matchTime || 0
    };
    if (wreck.coverHp > 0) return false;

    wreck.coverDestroyed = true;
    wreck.coverCollapsePulse = 0.9;
    game.effects.explosions.push({
      x: wreck.x,
      y: wreck.y,
      radius: 12,
      maxRadius: Math.max(54, (wreck.radius || 28) * 1.5),
      life: 0.34,
      maxLife: 0.34,
      color: "rgba(255, 187, 111, 0.58)",
      core: false
    });
    return true;
  }

  function shellWreckDamage(shell, wreck) {
    const ammo = shell?.ammo || {};
    const base =
      ammo.id === "he" ? ammo.directDamage || ammo.damage || 120 :
      ammo.id === "rpg" ? ammo.directDamage || ammo.damage || 92 :
      ammo.damage || ammo.directDamage || 52;
    const ammoScale =
      ammo.id === "he" ? 0.76 :
      ammo.id === "rpg" ? 0.58 :
      ammo.id === "ap" ? 0.52 :
      0.34;
    const vehicleScale = wreck?.vehicleType === "humvee" ? 1.28 : 1;
    return Math.max(8, base * ammoScale * vehicleScale);
  }

  IronLine.wreckCover = {
    isVehicleWreck,
    damageVehicleWreck,
    shellWreckDamage
  };
})(window);
