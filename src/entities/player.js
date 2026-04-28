"use strict";

(function registerPlayer(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, INFANTRY_WEAPONS, INFANTRY_CLASSES } = IronLine.constants;

  function equipmentForClass(classId) {
    return (INFANTRY_CLASSES[classId] || INFANTRY_CLASSES.infantry).equipment.slice();
  }

  function ammoForClass(classId) {
    const infantryClass = INFANTRY_CLASSES[classId] || INFANTRY_CLASSES.infantry;
    const ammo = {
      grenade: 0,
      rpg: 0,
      repairKit: 0
    };

    for (const weaponId of infantryClass.equipment || []) {
      const weapon = INFANTRY_WEAPONS[weaponId];
      if (weapon?.type === "gun" && weapon.ammoKey) {
        ammo[weapon.ammoKey] = weapon.defaultAmmo ?? 60;
      }
    }

    return {
      ...ammo,
      ...(infantryClass.defaultAmmo || {})
    };
  }

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
      gunKick: 0,
      machineGunAim: false,
      classId: "infantry",
      activeSlot: 0,
      weaponId: "machinegun",
      weaponInventory: equipmentForClass("infantry"),
      equipmentAmmo: ammoForClass("infantry"),
      getWeapon() {
        return INFANTRY_WEAPONS[this.weaponId] || INFANTRY_WEAPONS.machinegun;
      },
      setWeapon(weaponId) {
        if (!INFANTRY_WEAPONS[weaponId]) return false;
        this.weaponId = weaponId;
        return true;
      },
      setEquipmentSlot(index) {
        const weaponId = this.weaponInventory[index];
        if (!weaponId || !INFANTRY_WEAPONS[weaponId]) return false;
        this.activeSlot = index;
        return this.setWeapon(weaponId);
      },
      setClass(classId) {
        const infantryClass = INFANTRY_CLASSES[classId];
        if (!infantryClass) return false;
        this.classId = classId;
        this.weaponInventory = equipmentForClass(classId);
        this.activeSlot = 0;
        this.weaponId = this.weaponInventory[0];
        this.equipmentAmmo = ammoForClass(classId);
        return true;
      },
      alive: true
    };
  }

  IronLine.createPlayer = createPlayer;
})(window);
