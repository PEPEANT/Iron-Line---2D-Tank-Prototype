"use strict";

(function registerPlayer(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, INFANTRY_WEAPONS } = IronLine.constants;

  function createPlayer(spawn) {
    return {
      x: spawn.x,
      y: spawn.y,
      team: TEAM.BLUE,
      radius: 12,
      hp: 100,
      maxHp: 100,
      angle: -0.4,
      inTank: null,
      interactPulse: 0,
      rifleCooldown: 0,
      weaponId: "rifle",
      weaponInventory: ["rifle", "smg", "lmg"],
      getWeapon() {
        return INFANTRY_WEAPONS[this.weaponId] || INFANTRY_WEAPONS.rifle;
      },
      setWeapon(weaponId) {
        if (!INFANTRY_WEAPONS[weaponId]) return false;
        this.weaponId = weaponId;
        return true;
      },
      alive: true
    };
  }

  IronLine.createPlayer = createPlayer;
})(window);
