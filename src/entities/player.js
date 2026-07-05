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
      rifle: 0,
      smg: 0,
      lmg: 0,
      machinegun: 0,
      pistol: 0,
      sniper: 0,
      grenade: 0,
      grenadeLauncher: 0,
      rpg: 0,
      repairKit: 0,
      reconDrone: 0,
      kamikazeDrone: 0
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

  function defaultPlayerInventory() {
    return IronLine.playerDefaultLoadout?.weaponInventory?.() || ["rifle", "", "", "", "", ""];
  }

  function defaultPlayerAmmo() {
    return IronLine.playerDefaultLoadout?.equipmentAmmo?.() || {
      ...ammoForClass("infantry"),
      grenade: 0,
      grenadeLauncher: 0
    };
  }

  function playerEquipmentForClass(classId) {
    return classId === "infantry" ? defaultPlayerInventory() : equipmentForClass(classId);
  }

  function playerAmmoForClass(classId) {
    return classId === "infantry" ? defaultPlayerAmmo() : ammoForClass(classId);
  }

  function createPlayer(spawn) {
    const defaultInventory = defaultPlayerInventory();
    const defaultWeapon = IronLine.playerDefaultLoadout?.weaponId || defaultInventory[0] || "rifle";
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
      fireHoldTimer: 0,
      fireMode: "auto",
      fireModes: { rifle: "auto" },
      machineGunAim: false,
      isProne: false,
      proneTransitionTimer: 0,
      proneTransitionDuration: 0.3,
      proneTargetState: false,
      deathTime: 0,
      deathPoseAngle: 0,
      classId: "infantry",
      factionId: "korea",
      skinId: "korea",
      activeSlot: 0,
      activeDrone: null,
      controlledDrone: null,
      weaponId: defaultWeapon,
      boostCharge: 1,
      boostRecoverDelay: 0,
      boosting: false,
      weaponInventory: defaultInventory,
      equipmentAmmo: defaultPlayerAmmo(),
      getWeapon() {
        return INFANTRY_WEAPONS[this.weaponId] || INFANTRY_WEAPONS.rifle || INFANTRY_WEAPONS.machinegun;
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
        this.weaponInventory = playerEquipmentForClass(classId);
        this.activeSlot = 0;
        this.weaponId = this.weaponInventory[0] || "rifle";
        this.equipmentAmmo = playerAmmoForClass(classId);
        return true;
      },
      alive: true
    };
  }

  IronLine.createPlayer = createPlayer;
})(window);
