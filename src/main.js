"use strict";

(function bootGame(global) {
  const IronLine = global.IronLine;
  const { TEAM, AMMO, INFANTRY_WEAPONS, INFANTRY_CLASSES, PLAYER_CLASS_ORDER } = IronLine.constants;
  const {
    clamp,
    lerp,
    distXY,
    angleTo,
    normalizeAngle,
    rotateTowards,
    pointInRect,
    circleRectCollision,
    expandedRect,
    lineIntersectsRect,
    segmentDistanceToPoint
  } = IronLine.math;
  const { tryMoveCircle, resolveTankSpacing, resolveInfantryTankSpacing, hasLineOfSight, circleIntersectsTank } = IronLine.physics;

  class Game {
    constructor() {
      this.canvas = document.getElementById("game");
      this.canvas.addEventListener("pointerdown", () => {
        this.canvas.focus();
        this.requestMobileFullscreen();
      });
      this.canvas.focus();
      this.world = IronLine.map01;
      this.camera = {
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: window.innerHeight,
        zoom: 1,
        viewWidth: window.innerWidth,
        viewHeight: window.innerHeight
      };

      this.input = new IronLine.Input();
      this.settings = this.defaultSettings();
      this.fullscreenRequestPending = false;
      this.input.setVirtualEnabled(this.settings.mobileControls);
      this.renderer = new IronLine.Renderer(this.canvas, this.camera);
      this.matchConfig = this.defaultMatchConfig();
      this.testLab = this.requestedTestLab();
      this.adminEnabled = this.requestedAdminMode();
      this.testLabAiPaused = false;
      this.testLabSpawnIndex = 0;
      this.testLabRoofPoint = null;
      this.adminMessage = "";
      this.adminMessageTimer = 0;
      this.adminSpawnSerial = 0;
      this.playerLoadoutOverrides = {};
      this.droneInteractHoldTime = 0;
      this.droneInteractHoldConsumed = false;
      this.droneInteractWasDown = false;
      this.droneInteractReleaseRequired = false;
      this.droneRecallHoldDuration = 0.48;
      this.droneDesignation = null;
      this.droneDesignationDuration = 7.5;
      this.scenarioDirty = false;
      this.hud = new IronLine.Hud();
      this.navGraph = new IronLine.NavGraph(this.world.navGraph, this.world);
      this.commanders = {};
      this.createCommanders();
      this.debug = {
        ai: false,
        navGraph: false
      };

      this.projectiles = [];
      this.effects = {
        explosions: [],
        blastRings: [],
        blastSparks: [],
        tracers: [],
        dustPuffs: [],
        trackScuffs: [],
        muzzleFlashes: [],
        gunSmokePuffs: [],
        smokeClouds: [],
        scorchMarks: []
      };
      this.tanks = [];
      this.humvees = [];
      this.crews = [];
      this.infantry = [];
      this.drones = [];
      this.squads = [];
      this.coverSlots = new IronLine.CoverSlotManager();
      this.teamReports = {
        [TEAM.BLUE]: new Map(),
        [TEAM.RED]: new Map()
      };
      this.capturePoints = [];
      this.player = IronLine.createPlayer(this.world.spawns.player);
      this.playerTank = null;
      this.result = "";
      this.resultReason = "";
      this.playerDeathActive = false;
      this.playerDeathReason = "";
      this.resetPlayerFeedbackState();
      this.deploymentOpen = true;
      this.countdownStarted = false;
      this.matchStarted = false;
      this.startCountdown = 5;
      this.matchTime = 0;
      this.objectiveHoldDuration = 12;
      this.objectiveHold = {
        [TEAM.BLUE]: 0,
        [TEAM.RED]: 0
      };
      this.lastTime = performance.now();

      this.setupScenario();
      if (this.testLab) this.activateTestLab(this.testLab);
      window.addEventListener("resize", () => this.renderer.resize());
      requestAnimationFrame((now) => this.loop(now));
    }

    requestedTestLab() {
      const params = new URLSearchParams(window.location.search || "");
      if (!params.has("testLab") && !params.has("lab")) return "";
      const value = params.get("testLab") || params.get("lab") || "drone";
      return String(value).toLowerCase() || "drone";
    }

    requestedAdminMode() {
      const params = new URLSearchParams(window.location.search || "");
      const value = params.get("admin") || params.get("debugAdmin") || "";
      return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
    }

    defaultMatchConfig() {
      const spawns = this.world.spawns;
      return {
        mode: "annihilation",
        difficulty: "normal",
        blueAiTanks: spawns.blue.length,
        blueInfantry: spawns.infantryBlue.length,
        redTanks: spawns.red.length,
        redInfantry: spawns.infantryRed.length
      };
    }

    createCommanders() {
      this.commanders = {
        [TEAM.BLUE]: new IronLine.CommanderAI(this, TEAM.BLUE, IronLine.commandPlans[TEAM.BLUE]),
        [TEAM.RED]: new IronLine.CommanderAI(this, TEAM.RED, IronLine.commandPlans[TEAM.RED])
      };
    }

    defaultSettings() {
      const mobileLike = window.matchMedia?.("(pointer: coarse)")?.matches ||
        (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);
      return {
        mobileLike: Boolean(mobileLike),
        mobileControls: Boolean(mobileLike)
      };
    }

    requestMobileFullscreen() {
      const wantsFullscreen = this.settings?.mobileLike || this.settings?.mobileControls;
      const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
      if (!wantsFullscreen || fullscreenElement || this.fullscreenRequestPending) return false;

      const target = document.documentElement;
      const requestFullscreen = target.requestFullscreen || target.webkitRequestFullscreen;
      if (!requestFullscreen) return false;

      const lockLandscape = () => {
        const orientation = global.screen?.orientation;
        if (!orientation?.lock) return;
        orientation.lock("landscape").catch(() => {});
      };

      try {
        this.fullscreenRequestPending = true;
        const result = requestFullscreen.call(target);
        if (result && typeof result.then === "function") {
          result
            .then(() => {
              this.fullscreenRequestPending = false;
              lockLandscape();
            })
            .catch(() => {
              this.fullscreenRequestPending = false;
            });
        } else {
          this.fullscreenRequestPending = false;
          lockLandscape();
        }
        return true;
      } catch (_error) {
        this.fullscreenRequestPending = false;
        return false;
      }
    }

    setDebugOption(key, enabled) {
      if (!Object.prototype.hasOwnProperty.call(this.debug, key)) return false;
      this.debug[key] = Boolean(enabled);
      return true;
    }

    setMobileControls(enabled) {
      this.settings.mobileControls = Boolean(enabled);
      this.input.setVirtualEnabled(this.settings.mobileControls);
      return true;
    }

    setupScenario() {
      const config = this.matchConfig || this.defaultMatchConfig();
      const difficulty = this.difficultyProfile(config.difficulty);
      this.capturePoints = this.world.capturePoints.map((point) => (
        new IronLine.CapturePoint(point.name, point.x, point.y)
      ));

      const playerSpawn = this.world.spawns.playerTank;
      this.playerTank = new IronLine.Tank({
        x: playerSpawn.x,
        y: playerSpawn.y,
        team: TEAM.BLUE,
        callSign: "RAVEN",
        angle: playerSpawn.angle,
        isPlayerTank: true,
        ammo: { ap: 14, he: 9, smoke: 1 },
        maxHp: 125,
        maxSpeed: 158,
        accel: 220,
        turnRate: 1.9,
        turretTurnRate: 1.45
      });
      this.playerTank.ai = new IronLine.TankAI(this.playerTank, this);
      this.tanks.push(this.playerTank);
      this.spawnCrewForTank(this.playerTank, {
        callSign: "RAVEN-MG",
        maxSpeed: 126,
        role: "machine-gunner",
        dedicated: true
      });

      for (const spawn of this.scaledSpawns(this.world.spawns.blue, config.blueAiTanks, "B-TNK", 32)) {
        const tank = new IronLine.Tank({
          x: spawn.x,
          y: spawn.y,
          team: TEAM.BLUE,
          callSign: spawn.callSign,
          angle: spawn.angle
        });
        tank.ai = new IronLine.TankAI(tank, this);
        this.tanks.push(tank);
        this.spawnCrewForTank(tank);
      }

      const blueInfantrySpawns = this.prepareInfantrySpawns(
        this.scaledSpawns(this.world.spawns.infantryBlue || [], config.blueInfantry, "B-INF", 18)
      );
      const blueInfantry = this.spawnInfantry(blueInfantrySpawns, TEAM.BLUE, difficulty);
      this.createSquads(TEAM.BLUE, blueInfantry, "B-SQD");

      for (const spawn of this.scaledSpawns(this.world.spawns.red, config.redTanks, "R-TNK", 34)) {
        const tank = new IronLine.Tank({
          x: spawn.x,
          y: spawn.y,
          team: TEAM.RED,
          callSign: spawn.callSign,
          angle: spawn.angle,
          maxHp: Math.round(110 * difficulty.enemyTankHp),
          maxSpeed: 145 * difficulty.enemyTankSpeed,
          turretTurnRate: 1.65 * difficulty.enemyTankAim
        });
        tank.ai = new IronLine.TankAI(tank, this);
        this.tanks.push(tank);
        this.spawnCrewForTank(tank);
      }

      const redInfantrySpawns = this.prepareInfantrySpawns(
        this.scaledSpawns(this.world.spawns.infantryRed || [], config.redInfantry, "R-INF", 18)
      );
      const redInfantry = this.spawnInfantry(redInfantrySpawns, TEAM.RED, difficulty);
      this.createSquads(TEAM.RED, redInfantry, "R-SQD");
      this.spawnHumvees(difficulty);
    }

    spawnHumvees(difficulty = this.difficultyProfile()) {
      const exits = this.world.baseExitPoints || {};
      const blueBase = exits.blue || this.world.spawns.playerTank;
      const redBase = exits.red || this.world.spawns.red?.[0] || { x: this.world.width - 420, y: 420 };
      const spawns = [
        {
          team: TEAM.BLUE,
          callSign: "B-HMV-1",
          x: blueBase.x - 78,
          y: blueBase.y + 118,
          angle: -0.18,
          maxHp: 72,
          maxSpeed: 252
        },
        {
          team: TEAM.BLUE,
          callSign: "B-HMV-2",
          x: blueBase.x - 148,
          y: blueBase.y + 64,
          angle: -0.12,
          maxHp: 70,
          maxSpeed: 250
        },
        {
          team: TEAM.RED,
          callSign: "R-HMV-1",
          x: redBase.x + 72,
          y: redBase.y - 116,
          angle: 3.02,
          maxHp: Math.round(68 * difficulty.enemyTankHp),
          maxSpeed: 248 * difficulty.enemyTankSpeed
        },
        {
          team: TEAM.RED,
          callSign: "R-HMV-2",
          x: redBase.x + 144,
          y: redBase.y - 64,
          angle: 3.08,
          maxHp: Math.round(66 * difficulty.enemyTankHp),
          maxSpeed: 246 * difficulty.enemyTankSpeed
        }
      ];

      const reserved = [];
      spawns.forEach((spawn, index) => {
        const point = this.findOpenSpawnNear(spawn, index, 0, 32, reserved);
        reserved.push(point);
        const humvee = new IronLine.Humvee({
          ...spawn,
          x: point.x,
          y: point.y
        });
        humvee.ai = new IronLine.HumveeAI(humvee, this);
        this.humvees.push(humvee);
        this.spawnCrewForTank(humvee, {
          callSign: `${spawn.callSign}-DRV`,
          maxSpeed: 116,
          role: "driver"
        });
      });
    }

    spawnInfantry(spawns, team, difficulty = this.difficultyProfile()) {
      const created = [];
      for (const spawn of spawns) {
        const unit = new IronLine.InfantryUnit({
          x: spawn.x,
          y: spawn.y,
          team,
          callSign: spawn.callSign,
          angle: spawn.angle,
          weaponId: spawn.weaponId,
          classId: spawn.classId,
          equipmentAmmo: spawn.equipmentAmmo,
          grenadeAmmo: spawn.grenadeAmmo,
          rpgAmmo: spawn.rpgAmmo,
          repairKitAmmo: spawn.repairKitAmmo
        });
        if (team === TEAM.RED) {
          unit.hp = Math.round(unit.hp * difficulty.enemyInfantryHp);
          unit.maxHp = unit.hp;
          unit.maxSpeed *= difficulty.enemyInfantrySpeed;
        }
        unit.ai = new IronLine.InfantryAI(unit, this);
        this.infantry.push(unit);
        created.push(unit);
      }
      return created;
    }

    prepareInfantrySpawns(spawns) {
      const prepared = spawns.map((spawn) => ({ ...spawn }));
      const desiredEngineers = Math.min(
        prepared.length,
        Math.ceil(prepared.length * 0.2)
      );
      let engineerCount = prepared.filter((spawn) => spawn.classId === "engineer").length;

      for (const spawn of prepared) {
        if (engineerCount >= desiredEngineers) break;
        if (spawn.classId && spawn.classId !== "infantry") continue;
        spawn.classId = "engineer";
        spawn.weaponId = spawn.weaponId || "rifle";
        engineerCount += 1;
      }

      for (const spawn of prepared) {
        if (spawn.classId !== "engineer") continue;
        const rpgAmmo = Math.max(3, Number(spawn.rpgAmmo ?? spawn.equipmentAmmo?.rpg ?? 0) || 0);
        const repairKitAmmo = Math.max(2, Number(spawn.repairKitAmmo ?? spawn.equipmentAmmo?.repairKit ?? 0) || 0);
        spawn.rpgAmmo = rpgAmmo;
        spawn.repairKitAmmo = repairKitAmmo;
        spawn.equipmentAmmo = {
          ...(spawn.equipmentAmmo || {}),
          rpg: rpgAmmo,
          repairKit: repairKitAmmo
        };
      }

      for (const spawn of prepared) {
        const classId = spawn.classId || "infantry";
        if (classId !== "infantry") continue;
        const grenadeAmmo = Math.max(1, Number(spawn.grenadeAmmo ?? spawn.equipmentAmmo?.grenade ?? 0) || 0);
        spawn.grenadeAmmo = grenadeAmmo;
        spawn.equipmentAmmo = {
          ...(spawn.equipmentAmmo || {}),
          grenade: grenadeAmmo
        };
      }

      return prepared;
    }

    difficultyProfile(id = this.matchConfig?.difficulty || "normal") {
      const profiles = {
        easy: {
          enemyTankHp: 0.86,
          enemyTankSpeed: 0.92,
          enemyTankAim: 0.9,
          enemyInfantryHp: 0.88,
          enemyInfantrySpeed: 0.94
        },
        normal: {
          enemyTankHp: 1,
          enemyTankSpeed: 1,
          enemyTankAim: 1,
          enemyInfantryHp: 1,
          enemyInfantrySpeed: 1
        },
        hard: {
          enemyTankHp: 1.15,
          enemyTankSpeed: 1.06,
          enemyTankAim: 1.08,
          enemyInfantryHp: 1.12,
          enemyInfantrySpeed: 1.05
        }
      };
      return profiles[id] || profiles.normal;
    }

    scaledSpawns(baseSpawns, count, prefix, radius = 18) {
      const safeCount = Math.max(0, Math.floor(Number(count) || 0));
      if (!baseSpawns.length || safeCount <= 0) return [];

      const result = [];
      for (let index = 0; index < safeCount; index += 1) {
        const base = baseSpawns[index % baseSpawns.length];
        const lap = Math.floor(index / baseSpawns.length);
        const point = this.findOpenSpawnNear(base, index, lap, radius, result);
        result.push({
          ...base,
          x: point.x,
          y: point.y,
          callSign: lap === 0 && base.callSign ? base.callSign : `${prefix}-${index + 1}`
        });
      }
      return result;
    }

    findOpenSpawnNear(base, index, lap, radius, reserved = []) {
      const spacing = radius * 3.2;
      const candidates = [{ x: base.x, y: base.y }];
      for (let ring = Math.max(1, lap); ring <= Math.max(3, lap + 3); ring += 1) {
        const count = 8 + ring * 4;
        for (let step = 0; step < count; step += 1) {
          const angle = index * 0.74 + step * Math.PI * 2 / count;
          candidates.push({
            x: base.x + Math.cos(angle) * spacing * ring,
            y: base.y + Math.sin(angle) * spacing * ring
          });
        }
      }

      for (const candidate of candidates) {
        const x = clamp(candidate.x, radius, this.world.width - radius);
        const y = clamp(candidate.y, radius, this.world.height - radius);
        if (this.spawnPointClear(x, y, radius, reserved)) return { x, y };
      }

      return {
        x: clamp(base.x, radius, this.world.width - radius),
        y: clamp(base.y, radius, this.world.height - radius)
      };
    }

    spawnPointClear(x, y, radius, reserved = []) {
      const blockedByObstacle = this.world.obstacles.some((obstacle) => circleRectCollision(x, y, radius, obstacle));
      if (blockedByObstacle) return false;
      const blockedByReserved = reserved.some((point) => distXY(x, y, point.x, point.y) < radius * 2 + 8);
      if (blockedByReserved) return false;
      return !circleIntersectsTank(this, null, x, y, radius, { padding: 8 });
    }

    createSquads(team, units, prefix) {
      const size = 5;
      for (let i = 0; i < units.length; i += size) {
        const squadUnits = units.slice(i, i + size);
        if (squadUnits.length === 0) continue;
        this.squads.push(new IronLine.SquadAI(this, {
          team,
          callSign: `${prefix}-${Math.floor(i / size) + 1}`,
          units: squadUnits
        }));
      }
    }

    spawnCrewForTank(tank, options = {}) {
      const spawn = options.boardImmediately ? { x: tank.x, y: tank.y } : this.findCrewSpawn(tank);
      const crew = new IronLine.CrewMember({
        x: spawn.x,
        y: spawn.y,
        team: tank.team,
        callSign: options.callSign || `${tank.callSign}-CREW`,
        angle: tank.angle,
        maxSpeed: options.maxSpeed,
        role: options.role,
        dedicated: options.dedicated,
        targetTank: tank
      });
      this.crews.push(crew);
      if (options.boardImmediately) crew.boardTargetTank();
      return crew;
    }

    findCrewSpawn(tank) {
      const angles = [
        tank.angle + Math.PI,
        tank.angle + Math.PI / 2,
        tank.angle - Math.PI / 2,
        tank.angle
      ];
      const distances = [125, 160, 195, 230];

      for (const distance of distances) {
        for (const angle of angles) {
          const x = clamp(tank.x + Math.cos(angle) * distance, 12, this.world.width - 12);
          const y = clamp(tank.y + Math.sin(angle) * distance, 12, this.world.height - 12);
          const blocked = this.world.obstacles.some((obstacle) => circleRectCollision(x, y, 12, obstacle));
          const tankBlocked = circleIntersectsTank(this, null, x, y, 12, { ignoreTank: tank, padding: 5 });
          const routeBlocked = this.world.obstacles.some((obstacle) => (
            lineIntersectsRect(x, y, tank.x, tank.y, expandedRect(obstacle, 18))
          ));
          if (!blocked && !tankBlocked && !routeBlocked) return { x, y };
        }
      }

      return { x: tank.x, y: tank.y + tank.radius + 42 };
    }

    loop(now) {
      const dt = Math.min(0.033, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this.update(dt);
      this.renderer.draw(this);
      this.input.endFrame();
      requestAnimationFrame((next) => this.loop(next));
    }

    update(dt) {
      this.input.updateWorld(this.camera);
      this.updateDebugToggles();
      this.updateTestLabHotkeys();
      this.updateAdminMessage(dt);
      this.updateCombatFeedback(dt);

      if (this.deploymentOpen) {
        this.updatePlayerSafeZone();
        this.updateCamera(dt);
        this.hud.update(this);
        return;
      }

      if (this.playerDowned && !this.playerDeathActive) {
        IronLine.combat.updateEffects(this, dt);
        this.updateCamera(dt);
        this.hud.update(this);
        return;
      }

      if (this.playerDeathActive) {
        this.updateDeathRestartInput();
        IronLine.combat.updateEffects(this, dt);
        this.updateCamera(dt);
        this.hud.update(this);
        return;
      }

      this.updatePlayer(dt);
      this.updatePlayerDeathState();
      if (this.playerDowned && !this.playerDeathActive) {
        IronLine.combat.updateEffects(this, dt);
        this.updateCamera(dt);
        this.hud.update(this);
        return;
      }
      if (this.playerDeathActive) {
        IronLine.combat.updateEffects(this, dt);
        this.updateCamera(dt);
        this.hud.update(this);
        return;
      }

      this.updateStartCountdown(dt);

      if (!this.matchStarted) {
        IronLine.combat.updateEffects(this, dt);
        resolveInfantryTankSpacing(this);
        this.updateCamera(dt);
        this.hud.update(this);
        return;
      }

      this.matchTime += dt;
      this.updateDroneDesignation(dt);
      for (const crew of this.crews) crew.update(this, dt);
      if (!this.testLabAiPaused) {
        for (const commander of Object.values(this.commanders)) commander.update(dt);
      }
      this.coverSlots.update(dt);
      if (!this.testLabAiPaused) {
        for (const squad of this.squads) squad.update(dt);
      }

      this.updateDrones(dt);
      for (const unit of this.infantry) unit.update(this, dt);
      this.updateTeamReports(dt);

      for (const tank of this.tanks) tank.update(this, dt);
      for (const humvee of this.humvees || []) humvee.update(this, dt);

      IronLine.combat.updateProjectiles(this, dt);
      IronLine.combat.updateEffects(this, dt);
      this.updatePlayerDeathState();
      if (this.playerDowned && !this.playerDeathActive) {
        this.updateCamera(dt);
        this.hud.update(this);
        return;
      }
      if (this.playerDeathActive) {
        this.updateCamera(dt);
        this.hud.update(this);
        return;
      }

      for (const point of this.capturePoints) point.update(this, dt);

      resolveTankSpacing(this, dt);
      resolveInfantryTankSpacing(this);
      this.updateCamera(dt);
      this.updateResult(dt);
      this.hud.update(this);
    }

    updateStartCountdown(dt) {
      if (this.matchStarted || this.deploymentOpen || !this.countdownStarted) return;
      this.startCountdown = Math.max(0, this.startCountdown - dt);
      if (this.startCountdown <= 0) this.matchStarted = true;
    }

    updateAdminMessage(dt) {
      if (this.adminMessageTimer <= 0) return;
      this.adminMessageTimer = Math.max(0, this.adminMessageTimer - dt);
      if (this.adminMessageTimer <= 0) this.adminMessage = "";
    }

    adminNotify(message, ttl = 2.6) {
      this.adminMessage = message || "";
      this.adminMessageTimer = this.adminMessage ? ttl : 0;
      return Boolean(this.adminMessage);
    }

    adminTeam(teamId = "red") {
      return teamId === "blue" ? TEAM.BLUE : TEAM.RED;
    }

    adminTeamLabel(team) {
      return team === TEAM.BLUE || team === "blue" ? "아군" : "적군";
    }

    adminClassLabel(classId) {
      if (classId === "engineer") return "공병";
      if (classId === "scout") return "정찰병";
      return "보병";
    }

    adminWeaponLabel(weaponId) {
      const labels = {
        rifle: "소총",
        smg: "기관단총",
        lmg: "분대지원화기",
        machinegun: "기관총",
        pistol: "권총",
        sniper: "저격총",
        grenade: "수류탄",
        rpg: "RPG",
        repairKit: "수리킷",
        reconDrone: "정찰드론",
        kamikazeDrone: "자폭드론"
      };
      return labels[weaponId] || weaponId || "병기";
    }

    adminCompatibleClassForWeapon(weaponId) {
      if (weaponId === "sniper" || weaponId === "reconDrone") return "scout";
      if (weaponId === "rpg" || weaponId === "repairKit" || weaponId === "kamikazeDrone") return "engineer";
      return null;
    }

    adminSetPlayerClass(classId) {
      if (!INFANTRY_CLASSES[classId] || !this.player) return false;
      const changed = this.player.setClass(classId);
      this.applyPlayerLoadoutOverrides();
      this.adminEnsurePlayerAmmo();
      this.player.rifleCooldown = 0;
      this.adminNotify(`${this.adminClassLabel(classId)}으로 변경`);
      return changed;
    }

    adminSetPlayerWeapon(weaponId) {
      const weapon = INFANTRY_WEAPONS[weaponId];
      if (!weapon || !this.player) return false;

      const compatibleClass = this.adminCompatibleClassForWeapon(weaponId);
      if (compatibleClass && this.player.classId !== compatibleClass) {
        this.player.setClass(compatibleClass);
        this.applyPlayerLoadoutOverrides();
      }

      const inventory = this.player.weaponInventory || (this.player.weaponInventory = []);
      let slotIndex = inventory.indexOf(weaponId);
      if (slotIndex < 0) {
        slotIndex = clamp(this.player.activeSlot || 0, 0, 2);
        inventory[slotIndex] = weaponId;
      }

      this.player.activeSlot = slotIndex;
      this.player.setWeapon(weaponId);
      this.adminEnsurePlayerAmmo(weapon);
      this.player.rifleCooldown = 0;
      this.adminNotify(`병기 변경: ${this.adminWeaponLabel(weaponId)}`);
      return true;
    }

    adminEnsurePlayerAmmo(weapon = null) {
      if (!this.player) return false;
      const ammo = this.player.equipmentAmmo || (this.player.equipmentAmmo = {});
      for (const item of Object.values(INFANTRY_WEAPONS || {})) {
        if (!item?.ammoKey) continue;
        if (item.type === "gun") ammo[item.ammoKey] = Math.max(ammo[item.ammoKey] || 0, item.defaultAmmo ?? 90);
      }
      ammo.grenade = Math.max(ammo.grenade || 0, 6);
      ammo.rpg = Math.max(ammo.rpg || 0, 6);
      ammo.repairKit = Math.max(ammo.repairKit || 0, 4);
      ammo.reconDrone = Math.max(ammo.reconDrone || 0, 2);
      ammo.kamikazeDrone = Math.max(ammo.kamikazeDrone || 0, 3);
      if (weapon?.ammoKey) ammo[weapon.ammoKey] = Math.max(ammo[weapon.ammoKey] || 0, weapon.defaultAmmo ?? 1);
      return true;
    }

    handleAdminAction(action) {
      if (action === "refill-player") {
        this.refillTestLabPlayer();
        this.adminEnsurePlayerAmmo();
        this.adminNotify("플레이어 보급 완료");
        return true;
      }
      if (action === "reset-player") return this.adminResetPlayerPosition();
      if (action === "enter-test-lab") {
        this.activateTestLab(this.testLab || "drone");
        this.adminNotify("테스트랩 시작");
        return true;
      }
      if (action === "reset-test-lab") {
        this.activateTestLab(this.testLab || "drone");
        this.adminNotify("테스트랩 리셋");
        return true;
      }
      if (action === "toggle-ai") {
        this.testLabAiPaused = !this.testLabAiPaused;
        this.adminNotify(this.testLabAiPaused ? "AI 정지" : "AI 재개");
        return true;
      }
      if (action === "clear-effects") {
        this.adminClearEffects();
        this.adminNotify("이펙트 삭제");
        return true;
      }
      if (action === "debug-ai") {
        this.debug.ai = !this.debug.ai;
        this.adminNotify(this.debug.ai ? "AI 생각 표시 켬" : "AI 생각 표시 끔");
        return true;
      }
      if (action === "debug-nav") {
        this.debug.navGraph = !this.debug.navGraph;
        this.adminNotify(this.debug.navGraph ? "경로 그래프 켬" : "경로 그래프 끔");
        return true;
      }
      return false;
    }

    adminResetPlayerPosition() {
      if (!this.player) return false;
      const spawn = this.testLab ? { x: 2320, y: 3000 } : this.world.spawns.player;
      if (this.player.inTank) this.dismountTank(this.player.inTank);
      this.exitPlayerDroneControl();
      this.player.x = spawn.x;
      this.player.y = spawn.y;
      this.player.hp = this.player.maxHp || 100;
      this.player.alive = true;
      this.player.rifleCooldown = 0;
      this.adminNotify("플레이어 위치 초기화");
      return true;
    }

    adminClearEffects() {
      for (const key of Object.keys(this.effects || {})) {
        if (Array.isArray(this.effects[key])) this.effects[key] = [];
      }
      this.projectiles = [];
      return true;
    }

    adminRemovePlayerDrones() {
      const player = this.player;
      const before = this.drones.length;
      this.exitPlayerDroneControl();
      this.drones = (this.drones || []).filter((drone) => {
        const owned = drone.owner === player || drone === player?.activeDrone;
        if (owned) drone.alive = false;
        return !owned;
      });
      if (player) {
        player.activeDrone = null;
        player.controlledDrone = null;
      }
      this.adminNotify(`플레이어 드론 ${Math.max(0, before - this.drones.length)}기 제거`);
      return true;
    }

    adminSpawnPoint(location = "mouse", index = 0, total = 1) {
      let base = null;
      if (location === "player") base = { x: this.player.x + 92, y: this.player.y };
      else if (location === "roof") base = this.testLabRoofPoint || { x: 2680, y: 2680 };
      else if (location.startsWith("objective-")) {
        const objectiveIndex = { "objective-a": 0, "objective-b": 1, "objective-c": 2 }[location] ?? 0;
        const point = this.capturePoints[objectiveIndex] || this.world.capturePoints?.[objectiveIndex];
        base = point ? { x: point.x, y: point.y } : null;
      } else {
        base = { x: this.input.mouse.worldX, y: this.input.mouse.worldY };
      }

      if (!base) base = { x: this.player.x + 92, y: this.player.y };
      const ring = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, total))));
      const angle = index / Math.max(1, total) * Math.PI * 2;
      const spread = total <= 1 ? 0 : 34 + Math.floor(index / ring) * 18;
      return {
        x: clamp(base.x + Math.cos(angle) * spread, 42, this.world.width - 42),
        y: clamp(base.y + Math.sin(angle) * spread, 42, this.world.height - 42)
      };
    }

    adminSpawnTestUnit(options = {}) {
      const team = this.adminTeam(options.team);
      const unitType = options.unitType || "infantry";
      const count = clamp(Math.round(Number(options.count) || 1), 1, 12);
      const location = options.location || "mouse";
      const createdInfantry = [];
      let created = 0;

      for (let i = 0; i < count; i += 1) {
        const airborne = unitType === "reconDrone" || unitType === "kamikazeDrone";
        const point = this.adminSpawnPoint(location === "roof" && !airborne ? "player" : location, i, count);
        if (unitType === "tank") this.adminSpawnTank(team, point);
        else if (unitType === "humvee") this.adminSpawnHumvee(team, point);
        else if (airborne) this.adminSpawnDrone(team, unitType, point, location);
        else {
          const unit = this.adminSpawnInfantry(team, unitType, point);
          if (unit) createdInfantry.push(unit);
        }
        created += 1;
      }

      if (createdInfantry.length > 0) {
        const prefix = `${team === TEAM.BLUE ? "B" : "R"}-ADM-${++this.adminSpawnSerial}`;
        this.createSquads(team, createdInfantry, prefix);
      }

      this.adminNotify(`${this.adminTeamLabel(team)} ${this.adminUnitLabel(unitType)} ${created}개 생성`);
      return true;
    }

    adminUnitLabel(unitType) {
      const labels = {
        infantry: "보병",
        engineer: "공병",
        scout: "정찰병",
        tank: "전차",
        humvee: "험비",
        reconDrone: "정찰드론",
        kamikazeDrone: "자폭드론"
      };
      return labels[unitType] || unitType || "유닛";
    }

    adminSpawnInfantry(team, unitType, point) {
      const classId = unitType === "engineer" ? "engineer" : unitType === "scout" ? "scout" : "infantry";
      const weaponId = classId === "scout" ? "sniper" : classId === "engineer" ? "rifle" : "machinegun";
      const unit = new IronLine.InfantryUnit({
        x: point.x,
        y: point.y,
        team,
        callSign: `${team === TEAM.BLUE ? "B" : "R"}-ADM-INF-${this.infantry.length + 1}`,
        angle: angleTo(point.x, point.y, this.player.x, this.player.y),
        classId,
        weaponId,
        equipmentAmmo: {
          grenade: classId === "infantry" ? 2 : 1,
          rpg: classId === "engineer" ? 3 : 0,
          repairKit: classId === "engineer" ? 3 : 0,
          reconDrone: classId === "scout" ? 1 : 0
        },
        grenadeAmmo: classId === "infantry" ? 2 : 1,
        rpgAmmo: classId === "engineer" ? 3 : 0,
        repairKitAmmo: classId === "engineer" ? 3 : 0
      });
      unit.ai = new IronLine.InfantryAI(unit, this);
      this.infantry.push(unit);
      return unit;
    }

    adminSpawnTank(team, point) {
      const tank = new IronLine.Tank({
        x: point.x,
        y: point.y,
        team,
        callSign: `${team === TEAM.BLUE ? "B" : "R"}-ADM-TNK-${this.tanks.length + 1}`,
        angle: team === TEAM.BLUE ? 0 : Math.PI
      });
      tank.ai = new IronLine.TankAI(tank, this);
      this.tanks.push(tank);
      this.spawnCrewForTank(tank, {
        callSign: `${tank.callSign}-DRV`,
        boardImmediately: true
      });
      return tank;
    }

    adminSpawnHumvee(team, point) {
      const humvee = new IronLine.Humvee({
        x: point.x,
        y: point.y,
        team,
        callSign: `${team === TEAM.BLUE ? "B" : "R"}-ADM-HMV-${(this.humvees || []).length + 1}`,
        angle: team === TEAM.BLUE ? 0 : Math.PI
      });
      humvee.ai = new IronLine.HumveeAI(humvee, this);
      this.humvees.push(humvee);
      this.spawnCrewForTank(humvee, {
        callSign: `${humvee.callSign}-DRV`,
        role: "driver",
        boardImmediately: true
      });
      return humvee;
    }

    adminSpawnDrone(team, unitType, point, location = "mouse") {
      const attack = unitType === "kamikazeDrone";
      const weapon = {
        ...(attack ? INFANTRY_WEAPONS.kamikazeDrone : INFANTRY_WEAPONS.reconDrone),
        batteryLimit: false,
        maxControlRange: 2600
      };
      const owner = team === TEAM.BLUE ? this.player : null;
      const drone = attack
        ? new IronLine.SuicideDrone({
          x: point.x,
          y: point.y,
          angle: team === TEAM.BLUE ? 0 : Math.PI,
          team,
          owner,
          weapon,
          targetX: point.x,
          targetY: point.y,
          callSign: `${team === TEAM.BLUE ? "B" : "R"}-ADM-FPV-${this.drones.length + 1}`
        })
        : new IronLine.ReconDrone({
          x: point.x,
          y: point.y,
          angle: 0,
          team,
          owner,
          weapon,
          targetX: point.x,
          targetY: point.y,
          callSign: `${team === TEAM.BLUE ? "B" : "R"}-ADM-UAV-${this.drones.length + 1}`
        });

      drone.recallable = team === TEAM.BLUE;
      if (!attack && location === "roof") this.setReconDroneWaypoint(drone, point.x, point.y);
      else drone.setWaypoint?.(point.x, point.y);
      this.drones.push(drone);
      if (owner) owner.activeDrone = drone;
      return drone;
    }

    selectDeploymentClass(classId) {
      if (!classId || this.matchStarted) return false;
      const changed = this.player.setClass(classId);
      if (changed) {
        this.applyPlayerLoadoutOverrides();
        this.player.rifleCooldown = Math.min(this.player.rifleCooldown, 0.12);
      }
      return changed;
    }

    equipmentChoiceOptions(classId, slotIndex) {
      const infantryClass = INFANTRY_CLASSES?.[classId] || INFANTRY_CLASSES?.infantry;
      const choices = infantryClass?.equipmentChoices?.[slotIndex] || infantryClass?.equipmentChoices?.[String(slotIndex)];
      if (Array.isArray(choices) && choices.length > 0) return choices.filter((weaponId) => INFANTRY_WEAPONS[weaponId]);
      const weaponId = infantryClass?.equipment?.[slotIndex];
      return weaponId && INFANTRY_WEAPONS[weaponId] ? [weaponId] : [];
    }

    deploymentEquipmentForClass(classId) {
      const infantryClass = INFANTRY_CLASSES?.[classId] || INFANTRY_CLASSES?.infantry;
      const equipment = (infantryClass?.equipment || []).slice();
      const overrides = this.playerLoadoutOverrides?.[classId] || {};
      for (const [slotKey, weaponId] of Object.entries(overrides)) {
        const slotIndex = Number(slotKey);
        if (this.equipmentChoiceOptions(classId, slotIndex).includes(weaponId)) {
          equipment[slotIndex] = weaponId;
        }
      }
      return equipment;
    }

    applyPlayerLoadoutOverrides(player = this.player) {
      if (!player) return;
      player.weaponInventory = this.deploymentEquipmentForClass(player.classId);
      if (!player.weaponInventory[player.activeSlot]) player.activeSlot = 0;
      player.weaponId = player.weaponInventory[player.activeSlot] || player.weaponInventory[0];
    }

    setDeploymentEquipmentChoice(slotIndex, weaponId) {
      if (!this.deploymentOpen || this.countdownStarted || this.matchStarted) return false;
      const classId = this.player.classId || "infantry";
      if (!this.equipmentChoiceOptions(classId, slotIndex).includes(weaponId)) return false;

      this.playerLoadoutOverrides[classId] = {
        ...(this.playerLoadoutOverrides[classId] || {}),
        [slotIndex]: weaponId
      };
      this.applyPlayerLoadoutOverrides();
      this.player.rifleCooldown = Math.min(this.player.rifleCooldown, 0.12);
      if (this.hud) this.hud.deploymentClassesBuilt = false;
      return true;
    }

    cycleDeploymentEquipmentChoice(slotIndex) {
      const classId = this.player.classId || "infantry";
      const choices = this.equipmentChoiceOptions(classId, slotIndex);
      if (choices.length < 2) return false;

      const current = this.deploymentEquipmentForClass(classId)[slotIndex];
      const currentIndex = Math.max(0, choices.indexOf(current));
      const next = choices[(currentIndex + 1) % choices.length];
      return this.setDeploymentEquipmentChoice(slotIndex, next);
    }

    setMatchMode(mode) {
      if (!this.deploymentOpen || this.countdownStarted || this.matchStarted) return false;
      if (mode !== "annihilation") return false;
      this.matchConfig.mode = mode;
      return true;
    }

    setMatchSetting(key, value) {
      if (!this.deploymentOpen || this.countdownStarted || this.matchStarted) return false;
      const bounds = this.matchSettingBounds();
      if (key === "difficulty") {
        if (!["easy", "normal", "hard"].includes(value)) return false;
        this.matchConfig.difficulty = value;
      } else if (bounds[key]) {
        const next = clamp(Math.round(Number(value) || bounds[key].min), bounds[key].min, bounds[key].max);
        this.matchConfig[key] = next;
      } else {
        return false;
      }

      this.scenarioDirty = true;
      this.resetScenarioForMatch();
      return true;
    }

    matchSettingBounds() {
      return {
        blueAiTanks: { min: 0, max: 6 },
        blueInfantry: { min: 4, max: 30 },
        redTanks: { min: 1, max: 8 },
        redInfantry: { min: 4, max: 34 }
      };
    }

    beginDeploymentCountdown() {
      if (this.matchStarted) return;
      this.requestMobileFullscreen();
      this.resetScenarioForMatch();
      this.deploymentOpen = false;
      this.countdownStarted = true;
      this.startCountdown = 5;
      this.canvas.focus();
    }

    resetPlayerFeedbackState() {
      this.playerDowned = false;
      this.playerDownedTimer = 0;
      this.playerDeathRevealDelay = 2.15;
      this.playerPendingDeathReason = "";
      this.playerDamageFlash = 0;
      this.lastPlayerDamage = null;
      this.playerDamageIndicators = [];
      this.playerDangerWarnings = [];
      this.screenShake = 0;
    }

    damageSourcePoint(source, options = {}) {
      if (options.x !== undefined && options.y !== undefined) return { x: options.x, y: options.y };
      if (source?.owner?.x !== undefined && source?.owner?.y !== undefined) {
        return { x: source.owner.x, y: source.owner.y };
      }
      if (source?.x !== undefined && source?.y !== undefined) return { x: source.x, y: source.y };
      return { x: this.player.x, y: this.player.y };
    }

    playerDamageLabel(kind = "damage", source = null, options = {}) {
      if (options.label) return options.label;
      const id = kind || source?.ammo?.id || source?.weaponId || "";
      if (id === "sniper") return "\uC800\uACA9";
      if (id === "rifle" || id === "machinegun" || id === "lmg" || id === "smg" || id === "pistol") return "\uCD1D\uACA9";
      if (id === "he") return "\uACE0\uD3ED\uD0C4 \uD3ED\uBC1C";
      if (id === "rpg") return "RPG \uD3ED\uBC1C";
      if (id === "grenade") return "\uC218\uB958\uD0C4 \uD3ED\uBC1C";
      if (id === "kamikazeDrone") return "\uC790\uD3ED\uB4DC\uB860 \uD3ED\uBC1C";
      if (id === "vehicle") return "\uCC28\uB7C9 \uD30C\uAD34";
      if (id === "projectile" || id === "shell") return "\uD3EC\uD0C4 \uC9C1\uACA9";
      if (id === "explosion") return "\uD3ED\uBC1C";
      return "\uD53C\uACA9";
    }

    playerDeathReasonFor(label) {
      return `${label}\uC73C\uB85C \uC804\uD22C \uBD88\uB2A5 \uC0C1\uD0DC\uAC00 \uB418\uC5C8\uC2B5\uB2C8\uB2E4.`;
    }

    addScreenShake(amount = 1.8, cap = 14) {
      this.screenShake = Math.min(cap, Math.max(this.screenShake || 0, amount));
    }

    applyPlayerDamage(amount, source = null, kind = "damage", options = {}) {
      if (!this.player || this.playerDeathActive || this.playerDowned || this.result || this.deploymentOpen) return false;
      const damage = Math.max(0, Number(amount) || 0);
      if (damage <= 0 || this.player.hp <= 0) return false;

      let label = this.playerDamageLabel(kind, source, options);
      if (this.player?.isProne && !String(label).includes("엎드림")) {
        label = `엎드림 중 ${label}`;
      }
      const sourcePoint = this.damageSourcePoint(source, options);
      this.player.hp = Math.max(0, this.player.hp - damage);
      const lethal = this.player.hp <= 0;

      const indicator = {
        x: sourcePoint.x,
        y: sourcePoint.y,
        angle: angleTo(this.player.x, this.player.y, sourcePoint.x, sourcePoint.y),
        amount: damage,
        kind,
        label,
        ttl: lethal ? Math.max(options.ttl || 1.85, 2.45) : options.ttl || 1.85,
        maxTtl: lethal ? Math.max(options.ttl || 1.85, 2.45) : options.ttl || 1.85
      };
      this.lastPlayerDamage = indicator;
      this.playerDamageIndicators.push(indicator);
      if (this.playerDamageIndicators.length > 5) this.playerDamageIndicators.shift();

      const maxHp = Math.max(1, this.player.maxHp || 100);
      this.playerDamageFlash = Math.max(this.playerDamageFlash || 0, clamp(0.18 + damage / maxHp * 0.95, 0.2, 0.86));
      this.addScreenShake(clamp(2.8 + damage * 0.16, 3, 12));

      if (this.player.hp <= 0) {
        this.beginPlayerDowned(options.deathReason || this.playerDeathReasonFor(label));
      }
      return true;
    }

    playerDangerLabel(kind = "danger", options = {}) {
      if (options.label) return options.label;
      if (kind === "sniper") return "\uC800\uACA9 \uC704\uD611";
      if (kind === "rifle" || kind === "machinegun" || kind === "lmg") return "\uCD1D\uACA9 \uBC29\uD5A5";
      if (kind === "rpg") return "RPG \uC811\uADFC";
      if (kind === "he" || kind === "shell") return "\uD3EC\uD0C4 \uC811\uADFC";
      if (kind === "grenade") return "\uC218\uB958\uD0C4 \uC704\uD5D8";
      if (kind === "kamikazeDrone") return "\uC790\uD3ED\uB4DC\uB860 \uC704\uD5D8";
      if (kind === "droneDetected") return "\uC790\uD3ED\uB4DC\uB860 \uBC1C\uAC01";
      return "\uC704\uD5D8";
    }

    warnPlayerDanger(source = null, kind = "danger", options = {}) {
      if (!this.player || this.playerDeathActive || this.playerDowned || this.result || this.deploymentOpen) return false;
      if (this.player.inTank || this.player.hp <= 0) return false;
      const sourcePoint = this.damageSourcePoint(source, options);
      let label = this.playerDangerLabel(kind, options);
      if (this.player?.isProne && !String(label).includes("엎드림")) {
        const fireLine = kind === "rifle" || kind === "machinegun" || kind === "lmg" || kind === "sniper";
        label = fireLine ? `엎드림 사선 ${label}` : `엎드림 중 ${label}`;
      }
      const key = options.key || source || `${kind}:${Math.round(sourcePoint.x / 20)}:${Math.round(sourcePoint.y / 20)}`;
      const ttl = options.ttl || 0.92;
      let warning = this.playerDangerWarnings.find((item) => item.key === key);
      if (!warning) {
        warning = { key, source };
        this.playerDangerWarnings.push(warning);
        if (this.playerDangerWarnings.length > 5) this.playerDangerWarnings.shift();
      }
      warning.x = sourcePoint.x;
      warning.y = sourcePoint.y;
      warning.angle = angleTo(this.player.x, this.player.y, sourcePoint.x, sourcePoint.y);
      warning.kind = kind;
      warning.label = label;
      warning.ttl = ttl;
      warning.maxTtl = ttl;
      return true;
    }

    updateCombatFeedback(dt) {
      this.playerDamageFlash = Math.max(0, (this.playerDamageFlash || 0) - dt * 1.7);
      this.screenShake = Math.max(0, (this.screenShake || 0) - dt * 9.6);

      const controlledDrone = this.player?.controlledDrone;
      if (controlledDrone?.diveActive) this.screenShake = Math.max(this.screenShake, 2.8);

      for (let i = this.playerDamageIndicators.length - 1; i >= 0; i -= 1) {
        this.playerDamageIndicators[i].ttl -= dt;
        if (this.playerDamageIndicators[i].ttl <= 0) this.playerDamageIndicators.splice(i, 1);
      }

      for (let i = this.playerDangerWarnings.length - 1; i >= 0; i -= 1) {
        this.playerDangerWarnings[i].ttl -= dt;
        if (this.playerDangerWarnings[i].ttl <= 0) this.playerDangerWarnings.splice(i, 1);
      }

      if (!this.playerDowned || this.playerDeathActive) return;
      this.playerDownedTimer = Math.max(0, this.playerDownedTimer - dt);
      this.playerDamageFlash = Math.max(this.playerDamageFlash, 0.18 + Math.sin(performance.now() * 0.008) * 0.06);
      if (this.playerDownedTimer <= 0) {
        this.handlePlayerDeath(this.playerPendingDeathReason || "\uC804\uD22C \uBD88\uB2A5 \uC0C1\uD0DC\uC785\uB2C8\uB2E4.", { fromDowned: true });
      }
    }

    resetScenarioForMatch() {
      const selectedClass = this.player?.classId || "infantry";
      this.projectiles = [];
      this.effects = {
        explosions: [],
        blastRings: [],
        blastSparks: [],
        tracers: [],
        dustPuffs: [],
        trackScuffs: [],
        muzzleFlashes: [],
        gunSmokePuffs: [],
        smokeClouds: [],
        scorchMarks: []
      };
      this.tanks = [];
      this.humvees = [];
      this.crews = [];
      this.infantry = [];
      this.drones = [];
      this.squads = [];
      this.coverSlots = new IronLine.CoverSlotManager();
      this.teamReports = {
        [TEAM.BLUE]: new Map(),
        [TEAM.RED]: new Map()
      };
      this.capturePoints = [];
      this.player = IronLine.createPlayer(this.world.spawns.player);
      this.player.setClass(selectedClass);
      this.applyPlayerLoadoutOverrides();
      this.playerTank = null;
      this.result = "";
      this.resultReason = "";
      this.playerDeathActive = false;
      this.playerDeathReason = "";
      this.resetPlayerFeedbackState();
      this.matchTime = 0;
      this.droneDesignation = null;
      this.objectiveHold = {
        [TEAM.BLUE]: 0,
        [TEAM.RED]: 0
      };
      this.createCommanders();
      this.setupScenario();
      if (this.testLab) this.activateTestLab(this.testLab);
      this.scenarioDirty = false;
      this.hud?.invalidateDeploymentMap?.();
    }

    updatePlayer(dt) {
      if (this.player.hp <= 0) {
        this.beginPlayerDowned("\uC801 \uACF5\uACA9\uC73C\uB85C \uC804\uD22C \uBD88\uB2A5 \uC0C1\uD0DC\uAC00 \uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
        return;
      }

      this.updatePlayerSafeZone();
      if (this.player.controlledDrone && !this.player.controlledDrone.alive) this.exitPlayerDroneControl();
      if (this.player.controlledDrone) {
        this.updateControlledDroneInteraction(dt);
        this.updatePlayerSafeZone();
        return;
      }

      this.resetDroneInteractHold();
      const interactPressed = this.input.consumePress("KeyE");
      if (interactPressed) {
        if (this.pickupPlayerDrone()) {
          this.updatePlayerSafeZone();
          return;
        }
        if (this.togglePlayerDroneControl()) {
          this.updatePlayerSafeZone();
          return;
        }
        this.toggleTank();
      }

      if (this.player.inTank) {
        this.clearPlayerProneState();
        this.updateMountedPlayer(dt);
      } else {
        this.updateInfantryPlayer(dt);
      }

      this.updatePlayerSafeZone();
    }

    updatePlayerDeathState() {
      if (this.playerDeathActive || this.result || this.deploymentOpen) return;
      if (this.playerDowned) return;
      if (this.player.hp <= 0) {
        this.beginPlayerDowned("\uC801 \uACF5\uACA9\uC73C\uB85C \uC804\uD22C \uBD88\uB2A5 \uC0C1\uD0DC\uAC00 \uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
      }
    }

    beginPlayerDowned(reason = "\uC804\uD22C \uBD88\uB2A5 \uC0C1\uD0DC\uC785\uB2C8\uB2E4.") {
      if (this.playerDeathActive || this.playerDowned || this.result) return;
      if (this.player.inTank) {
        this.player.inTank.playerControlled = false;
        this.player.inTank.playerSeat = "";
        this.player.inTank = null;
      }
      this.exitPlayerDroneControl();
      this.player.hp = 0;
      this.player.alive = false;
      this.player.deathTime = typeof performance !== "undefined" ? performance.now() / 1000 : 0;
      this.player.deathPoseAngle = this.player.angle + Math.PI / 2 + (Math.random() - 0.5) * 0.42;
      this.playerDowned = true;
      this.playerDownedTimer = this.playerDeathRevealDelay;
      this.playerPendingDeathReason = reason;
      this.playerDamageFlash = Math.max(this.playerDamageFlash || 0, 0.58);
      this.addScreenShake(10, 16);
      this.input.clear();
      this.hud?.toggleSettingsPanel?.(false);
    }

    handlePlayerDeath(reason = "\uC0AC\uB9DD\uD588\uC2B5\uB2C8\uB2E4.", options = {}) {
      if (this.playerDeathActive || this.result) return;
      if (!options.fromDowned && !options.immediate && !this.playerDowned) {
        this.beginPlayerDowned(reason);
        return;
      }
      if (this.player.inTank) {
        this.player.inTank.playerControlled = false;
        this.player.inTank = null;
      }
      this.exitPlayerDroneControl();
      this.player.hp = 0;
      this.player.alive = false;
      if (!this.player.deathTime) {
        this.player.deathTime = typeof performance !== "undefined" ? performance.now() / 1000 : 0;
        this.player.deathPoseAngle = this.player.angle + Math.PI / 2 + (Math.random() - 0.5) * 0.42;
      }
      this.playerDowned = false;
      this.playerDeathActive = true;
      this.playerDeathReason = reason;
      this.input.clear();
      this.hud?.toggleSettingsPanel?.(false);
    }

    updateDeathRestartInput() {
      if (this.input.consumePress("KeyR") || this.input.consumePress("Enter")) {
        this.restartMatchAfterDeath();
      }
    }

    restartMatchAfterDeath() {
      if (!this.playerDeathActive) return false;
      this.input.clear();
      this.resetScenarioForMatch();
      this.deploymentOpen = false;
      this.countdownStarted = true;
      this.matchStarted = false;
      this.startCountdown = 5;
      this.canvas.focus();
      return true;
    }

    activateTestLab(id = "drone") {
      this.testLab = id || "drone";
      this.deploymentOpen = false;
      this.countdownStarted = true;
      this.matchStarted = true;
      this.startCountdown = 0;
      this.result = "";
      this.resultReason = "";
      this.playerDeathActive = false;
      this.playerDeathReason = "";
      this.resetPlayerFeedbackState();
      this.matchTime = 0;
      this.droneDesignation = null;
      this.testLabAiPaused = true;
      this.testLabSpawnIndex = 0;
      this.testLabRoofPoint = { x: 2680, y: 2680 };

      this.projectiles = [];
      this.effects = {
        explosions: [],
        blastRings: [],
        blastSparks: [],
        tracers: [],
        dustPuffs: [],
        trackScuffs: [],
        muzzleFlashes: [],
        gunSmokePuffs: [],
        smokeClouds: [],
        scorchMarks: []
      };
      this.tanks = [];
      this.humvees = [];
      this.crews = [];
      this.infantry = [];
      this.drones = [];
      this.squads = [];
      this.coverSlots = new IronLine.CoverSlotManager();
      this.teamReports = {
        [TEAM.BLUE]: new Map(),
        [TEAM.RED]: new Map()
      };
      this.capturePoints = this.world.capturePoints.map((point) => (
        new IronLine.CapturePoint(point.name, point.x, point.y)
      ));
      this.playerTank = null;

      this.player = IronLine.createPlayer({ x: 2320, y: 3000 });
      this.player.setClass("scout");
      this.applyPlayerLoadoutOverrides();
      this.player.setEquipmentSlot?.(0);
      this.player.angle = angleTo(this.player.x, this.player.y, this.testLabRoofPoint.x, this.testLabRoofPoint.y);
      this.refillTestLabPlayer();

      this.spawnTestLabReconDrone();
      [
        { x: 2980, y: 2620, weaponId: "rifle" },
        { x: 3060, y: 2705, weaponId: "machinegun" },
        { x: 2960, y: 2835, weaponId: "rifle" },
        { x: 3100, y: 2870, weaponId: "rifle", classId: "engineer", rpgAmmo: 2 }
      ].forEach((spawn) => this.spawnTestLabInfantry(spawn));

      this.createCommanders();
      this.hud?.toggleSettingsPanel?.(false);
      this.hud?.invalidateDeploymentMap?.();
      this.canvas.focus();
    }

    refillTestLabPlayer() {
      if (!this.player) return false;
      this.player.hp = this.player.maxHp || 100;
      this.player.alive = true;
      this.player.rifleCooldown = 0;
      this.player.equipmentAmmo = {
        ...(this.player.equipmentAmmo || {}),
        sniper: 999,
        pistol: 999,
        reconDrone: Math.max(1, this.player.equipmentAmmo?.reconDrone || 0),
        grenade: 6,
        rpg: 6,
        repairKit: 4,
        kamikazeDrone: 3
      };

      const drone = this.activePlayerDrone();
      if (drone) {
        drone.hp = drone.maxHp || 26;
        drone.battery = drone.maxBattery || drone.battery || 36;
        drone.autoReturn = false;
        drone.recallable = true;
      }
      return true;
    }

    spawnTestLabReconDrone() {
      const roof = this.testLabRoofPoint || { x: 2680, y: 2680 };
      const weapon = {
        ...INFANTRY_WEAPONS.reconDrone,
        scanRange: 760,
        reportTtl: 4.5,
        maxControlRange: 2600,
        batteryLimit: false
      };
      const drone = new IronLine.ReconDrone({
        x: roof.x,
        y: roof.y,
        angle: 0,
        team: this.player.team,
        owner: this.player,
        weapon,
        targetX: roof.x,
        targetY: roof.y,
        callSign: "LAB-UAV"
      });
      this.setReconDroneWaypoint(drone, roof.x, roof.y);
      drone.recallable = true;
      this.drones.push(drone);
      this.player.activeDrone = drone;
      return drone;
    }

    placeTestLabDroneOnRoof() {
      const roof = this.testLabRoofPoint || { x: 2680, y: 2680 };
      const drone = this.activePlayerDrone() || this.spawnTestLabReconDrone();
      drone.autoReturn = false;
      drone.recallable = true;
      drone.setPosition?.(roof.x, roof.y, this);
      this.setReconDroneWaypoint(drone, roof.x, roof.y);
      drone.hp = drone.maxHp || drone.hp;
      drone.battery = drone.maxBattery || drone.battery;
      this.player.activeDrone = drone;
      this.effects.explosions.push({
        x: roof.x,
        y: roof.y,
        radius: 4,
        maxRadius: 20,
        life: 0.16,
        maxLife: 0.16,
        color: "rgba(143, 222, 207, 0.34)"
      });
      return drone;
    }

    spawnTestLabInfantry(spawn = {}) {
      const presets = [
        { x: 2980, y: 2620, weaponId: "rifle" },
        { x: 3060, y: 2705, weaponId: "machinegun" },
        { x: 2960, y: 2835, weaponId: "rifle" },
        { x: 3100, y: 2870, weaponId: "rifle", classId: "engineer", rpgAmmo: 2 },
        { x: 2860, y: 2470, weaponId: "rifle" },
        { x: 3180, y: 2540, weaponId: "machinegun" }
      ];
      const index = this.testLabSpawnIndex++;
      const preset = presets[index % presets.length];
      const lap = Math.floor(index / presets.length);
      const x = spawn.x ?? preset.x + lap * 42;
      const y = spawn.y ?? preset.y + lap * 28;
      const unit = new IronLine.InfantryUnit({
        ...preset,
        ...spawn,
        x,
        y,
        team: TEAM.RED,
        callSign: spawn.callSign || `LAB-INF-${index + 1}`,
        angle: angleTo(x, y, this.player.x, this.player.y),
        equipmentAmmo: {
          grenade: spawn.grenadeAmmo ?? 2,
          rpg: spawn.rpgAmmo ?? (spawn.classId === "engineer" ? 2 : 0)
        }
      });
      unit.ai = new IronLine.InfantryAI(unit, this);
      this.infantry.push(unit);
      return unit;
    }

    spawnTestLabTank() {
      const offset = this.tanks.length * 92;
      const tank = new IronLine.Tank({
        x: 3380 + offset,
        y: 2720,
        team: TEAM.RED,
        callSign: `LAB-TNK-${this.tanks.length + 1}`,
        angle: Math.PI,
        maxHp: 110
      });
      tank.ai = new IronLine.TankAI(tank, this);
      this.tanks.push(tank);
      this.spawnCrewForTank(tank, {
        callSign: `${tank.callSign}-DRV`,
        boardImmediately: true
      });
      return tank;
    }

    spawnTestLabHumvee() {
      const offset = (this.humvees || []).length * 86;
      const humvee = new IronLine.Humvee({
        x: 3300 + offset,
        y: 2920,
        team: TEAM.RED,
        callSign: `LAB-HMV-${(this.humvees || []).length + 1}`,
        angle: Math.PI,
        maxHp: 68
      });
      humvee.ai = new IronLine.HumveeAI(humvee, this);
      this.humvees.push(humvee);
      this.spawnCrewForTank(humvee, {
        callSign: `${humvee.callSign}-DRV`,
        role: "driver",
        boardImmediately: true
      });
      return humvee;
    }

    updateTestLabHotkeys() {
      if (!this.testLab) return;
      if (this.input.consumePress("F1")) this.spawnTestLabInfantry();
      if (this.input.consumePress("F2")) this.spawnTestLabTank();
      if (this.input.consumePress("F3")) this.spawnTestLabHumvee();
      if (this.input.consumePress("F4")) this.testLabAiPaused = !this.testLabAiPaused;
      if (this.input.consumePress("F5")) {
        this.refillTestLabPlayer();
        if (!this.activePlayerDrone()) this.spawnTestLabReconDrone();
      }
      if (this.input.consumePress("F6")) this.placeTestLabDroneOnRoof();
      if (this.input.consumePress("F7")) this.debug.ai = !this.debug.ai;
    }

    updatePlayerSafeZone() {
      this.player.inSafeZone = this.isPlayerInSafeZone();
    }

    isPlayerInSafeZone() {
      return !this.player.inTank && this.isPointInSafeZone(this.player.x, this.player.y, TEAM.BLUE);
    }

    isPointInSafeZone(x, y, team = null) {
      return (this.world.safeZones || []).some((zone) => (
        (!team || !zone.team || zone.team === team) &&
        distXY(x, y, zone.x, zone.y) <= zone.radius
      ));
    }

    boostKeyDown() {
      return this.input.keyDown("ShiftLeft") || this.input.keyDown("ShiftRight");
    }

    updateBoostState(entity, dt, wantsBoost, options = {}) {
      if (!entity) return false;

      const maxCharge = options.maxCharge ?? 1;
      if (entity.boostCharge === undefined) entity.boostCharge = maxCharge;
      if (entity.boostRecoverDelay === undefined) entity.boostRecoverDelay = 0;

      const canBoost = this.boostKeyDown() &&
        wantsBoost &&
        !options.disabled &&
        entity.boostCharge > 0.02;

      entity.boosting = Boolean(canBoost);
      if (entity.boosting) {
        entity.boostCharge = Math.max(0, entity.boostCharge - dt / (options.drainTime ?? 1.2));
        entity.boostRecoverDelay = options.recoverDelay ?? 0.55;
      } else {
        entity.boostRecoverDelay = Math.max(0, entity.boostRecoverDelay - dt);
        if (entity.boostRecoverDelay <= 0) {
          entity.boostCharge = Math.min(maxCharge, entity.boostCharge + dt / (options.recoverTime ?? 2));
        }
      }

      return entity.boosting;
    }

    findDroneRoofLockPoint(x, y, margin = 18) {
      const obstacle = (this.world.obstacles || []).find((item) => (
        item.kind === "building" &&
        pointInRect(x, y, item)
      ));
      if (!obstacle) return null;

      const pad = Math.max(8, margin || 0);
      const minX = obstacle.x + pad;
      const maxX = obstacle.x + obstacle.w - pad;
      const minY = obstacle.y + pad;
      const maxY = obstacle.y + obstacle.h - pad;
      return {
        x: minX <= maxX ? clamp(x, minX, maxX) : obstacle.x + obstacle.w / 2,
        y: minY <= maxY ? clamp(y, minY, maxY) : obstacle.y + obstacle.h / 2,
        obstacle
      };
    }

    setReconDroneWaypoint(drone, x, y) {
      if (!drone?.alive) return false;
      if (drone.droneRole !== "attack") {
        const roof = this.findDroneRoofLockPoint(x, y, (drone.radius || 10) + 8);
        if (roof) {
          drone.setRoofLock?.(roof.x, roof.y, roof.obstacle);
          drone.recallable = true;
          return true;
        }
      }

      drone.clearRoofLock?.();
      drone.setWaypoint?.(x, y);
      return false;
    }

    droneHasRoofCover(drone) {
      if (!drone?.isDrone || !drone.alive) return false;
      let x = drone.x;
      let y = drone.y;
      if (drone.roofLocked && drone.roofLockPoint) {
        const lockDistance = distXY(drone.x, drone.y, drone.roofLockPoint.x, drone.roofLockPoint.y);
        if (lockDistance <= (drone.radius || 0) + 14) {
          x = drone.roofLockPoint.x;
          y = drone.roofLockPoint.y;
        }
      }

      return (this.world.obstacles || []).some((obstacle) => (
        obstacle.kind === "building" &&
        pointInRect(x, y, obstacle)
      ));
    }

    droneSightOptions(drone, options = {}) {
      return this.droneHasRoofCover(drone)
        ? { ...options, ignoreObstacleContainingA: true }
        : options;
    }

    canEnemyDetectDrone(observer, drone, options = {}) {
      if (!observer || !drone?.isDrone || !drone.alive) return false;
      if (observer.team === drone.team) return true;
      if (this.droneHasRoofCover(drone)) return false;
      let detected = false;
      if (typeof drone.canBeDetectedBy === "function") {
        detected = drone.canBeDetectedBy(observer, this, options);
      } else {
        const range = options.range ?? Infinity;
        detected = distXY(observer.x, observer.y, drone.x, drone.y) <=
          range + (observer.radius || 0) + (drone.radius || 0);
      }

      if (detected) this.markPlayerDroneDetected(drone, observer);
      return detected;
    }

    markPlayerDroneDetected(drone, observer) {
      if (!drone?.alive || drone.team !== this.player?.team || observer?.team === drone.team) return;
      if (drone.droneRole !== "attack") return;
      drone.detectedTimer = Math.max(drone.detectedTimer || 0, drone.diveActive ? 1.25 : 0.95);
      drone.detectedBy = observer || null;
      if ((drone.detectedWarningCooldown || 0) > 0) return;
      drone.detectedWarningCooldown = 0.7;
      this.playerDangerWarnings.push({
        key: `drone-detected-${drone.callSign || "fpv"}`,
        source: observer,
        x: observer?.x ?? drone.x,
        y: observer?.y ?? drone.y,
        angle: angleTo(this.player.x, this.player.y, observer?.x ?? drone.x, observer?.y ?? drone.y),
        kind: "droneDetected",
        label: "\uC790\uD3ED\uB4DC\uB860 \uBC1C\uAC01",
        ttl: 1.15,
        maxTtl: 1.15
      });
      if (this.playerDangerWarnings.length > 5) this.playerDangerWarnings.shift();
    }

    updateDebugToggles() {
      if (this.input.consumePress("KeyG")) {
        this.debug.ai = !this.debug.ai;
      }

      if (this.input.consumePress("KeyN")) {
        this.debug.navGraph = !this.debug.navGraph;
      }
    }

    updateMountedPlayer(dt) {
      const vehicle = this.player.inTank;
      if (vehicle?.vehicleType === "humvee") {
        this.updateMountedHumvee(vehicle, dt);
        return;
      }

      const tank = vehicle;
      this.player.x = tank.x;
      this.player.y = tank.y;
      this.applyVirtualAim(tank, this.input.mouse.rightDown ? 1250 : 860);

      if (!tank.alive) {
        this.player.inTank = null;
        tank.playerControlled = false;
        this.applyPlayerDamage(44, tank, "vehicle", {
          deathReason: "\uD0D1\uC2B9 \uC804\uCC28 \uD30C\uAD34\uB85C \uC804\uD22C \uBD88\uB2A5 \uC0C1\uD0DC\uAC00 \uB418\uC5C8\uC2B5\uB2C8\uB2E4."
        });
        return;
      }

      if (!this.matchStarted) {
        tank.drive(this, dt, 0, 0, { dust: false, coastScale: 0.76, coastDrag: 1.05 });
        const mouse = this.input.mouse;
        const targetTurret = angleTo(tank.x, tank.y, mouse.worldX, mouse.worldY);
        tank.turretAngle = rotateTowards(tank.turretAngle, targetTurret, tank.turretTurnRate * dt);
        tank.aimTargetAngle = targetTurret;
        tank.aimError = Math.abs(normalizeAngle(tank.turretAngle - targetTurret));
        return;
      }

      this.mobileAutoLoadTank(tank);

      const turnInput = this.input.axis("KeyA", "ArrowLeft", "KeyD", "ArrowRight");
      const throttle = this.input.axis("KeyS", "ArrowDown", "KeyW", "ArrowUp");
      const mobileStickX = this.input.virtual.axisX || 0;
      const mobileStickY = this.input.virtual.axisY || 0;
      const mobileDriveAmount = Math.min(1, Math.hypot(mobileStickX, mobileStickY));
      const useMobileDriveAssist = Boolean(this.settings?.mobileControls && this.input.virtual.enabled && mobileDriveAmount > 0.16);

      let driveThrottle = throttle;
      let driveTurn = turnInput;

      if (useMobileDriveAssist) {
        const desiredAngle = Math.atan2(mobileStickY, mobileStickX);
        const forwardDiff = normalizeAngle(desiredAngle - tank.angle);
        const reverseDiff = normalizeAngle(desiredAngle - normalizeAngle(tank.angle + Math.PI));
        if (Math.abs(forwardDiff) > 2.2 && Math.abs(reverseDiff) < Math.abs(forwardDiff) - 0.28) {
          driveThrottle = -mobileDriveAmount * 0.48;
          driveTurn = clamp(reverseDiff * 1.15, -1, 1);
        } else {
          const alignment = clamp((Math.cos(forwardDiff) + 0.2) / 1.2, 0, 1);
          driveThrottle = mobileDriveAmount * (0.34 + alignment * 0.66);
          driveTurn = clamp(forwardDiff * 1.18, -1, 1);
        }
      }

      const boosting = this.updateBoostState(tank, dt, driveThrottle > 0.08, {
        drainTime: 1.05,
        recoverTime: 2.8,
        recoverDelay: 0.75
      });

      tank.drive(this, dt, driveThrottle, driveTurn, {
        brake: this.input.keyDown("Space") && Math.abs(driveThrottle) < 0.01,
        turnAccel: 3.9,
        driveDrag: boosting ? 0.12 : 0.18,
        speedScale: boosting ? 1.22 : 1,
        accelScale: boosting ? 1.28 : 1
      });

      if (this.input.consumePress("Digit1") || this.input.consumePress("Numpad1")) {
        this.clearTankFireOrder(tank);
        tank.weaponMode = "cannon";
        tank.beginLoad("ap");
      }
      if (this.input.consumePress("Digit2") || this.input.consumePress("Numpad2")) {
        this.clearTankFireOrder(tank);
        tank.weaponMode = "cannon";
        tank.beginLoad("he");
      }
      if (this.input.consumePress("Digit3") || this.input.consumePress("Numpad3")) {
        this.clearTankFireOrder(tank);
        if (tank.hasMachineGunner() && (tank.ammo.mg || 0) > 0) tank.weaponMode = "mg";
      }
      if (this.input.consumePress("KeyQ")) {
        this.clearTankFireOrder(tank);
        tank.deploySmoke(this);
      }

      const mouse = this.input.mouse;
      const heOrder = tank.fireOrder?.ammoId === "he" ? tank.fireOrder : null;
      if (tank.weaponMode === "mg") {
        const targetGun = angleTo(tank.x, tank.y, mouse.worldX, mouse.worldY);
        tank.machineGunAngle = rotateTowards(tank.machineGunAngle, targetGun, tank.machineGunTurnRate * dt);
        tank.aimTargetAngle = targetGun;
        tank.aimError = Math.abs(normalizeAngle(tank.machineGunAngle - targetGun));
      } else {
        const aimX = heOrder ? heOrder.currentX || heOrder.x : mouse.worldX;
        const aimY = heOrder ? heOrder.currentY || heOrder.y : mouse.worldY;
        const targetTurret = angleTo(tank.x, tank.y, aimX, aimY);
        tank.turretAngle = rotateTowards(tank.turretAngle, targetTurret, tank.turretTurnRate * dt);
        tank.aimTargetAngle = targetTurret;
        tank.aimError = Math.abs(normalizeAngle(tank.turretAngle - targetTurret));
      }

      if (tank.weaponMode === "mg") {
        if (mouse.leftDown) this.fireTankMachineGun(tank, mouse.worldX, mouse.worldY);
        this.input.consumeMousePress(0);
      } else if (this.input.consumeMousePress(0)) {
        if (tank.loadedAmmo === "he") this.queueHeFire(tank, mouse.worldX, mouse.worldY);
        else {
          this.clearTankFireOrder(tank);
          tank.fire(this, { aimError: tank.aimError });
        }
      }

      this.updatePlayerTankMachineGunner(tank, dt);
      this.updateHeFireOrder(tank, dt);
    }

    updateMountedHumvee(humvee, dt) {
      this.player.x = humvee.x;
      this.player.y = humvee.y;
      this.applyVirtualAim(humvee, this.input.mouse.rightDown ? 1050 : 760);

      if (!humvee.alive) {
        this.player.inTank = null;
        humvee.playerControlled = false;
        this.applyPlayerDamage(28, humvee, "vehicle", {
          deathReason: "\uD0D1\uC2B9 \uCC28\uB7C9 \uD30C\uAD34\uB85C \uC804\uD22C \uBD88\uB2A5 \uC0C1\uD0DC\uAC00 \uB418\uC5C8\uC2B5\uB2C8\uB2E4."
        });
        return;
      }

      const mouse = this.input.mouse;
      const targetGun = angleTo(humvee.x, humvee.y, mouse.worldX, mouse.worldY);
      humvee.machineGunAngle = rotateTowards(humvee.machineGunAngle, targetGun, humvee.machineGunTurnRate * dt);

      if (!this.matchStarted) {
        humvee.drive(this, dt, 0, 0, { dust: false, collisionSpeedRetain: 0.34 });
        return;
      }

      const turnInput = this.input.axis("KeyA", "ArrowLeft", "KeyD", "ArrowRight");
      const throttle = this.input.axis("KeyS", "ArrowDown", "KeyW", "ArrowUp");
      const mobileStickX = this.input.virtual.axisX || 0;
      const mobileStickY = this.input.virtual.axisY || 0;
      const mobileDriveAmount = Math.min(1, Math.hypot(mobileStickX, mobileStickY));
      const useMobileDriveAssist = Boolean(this.settings?.mobileControls && this.input.virtual.enabled && mobileDriveAmount > 0.16);

      let driveThrottle = throttle;
      let driveTurn = turnInput;

      if (useMobileDriveAssist) {
        const desiredAngle = Math.atan2(mobileStickY, mobileStickX);
        const forwardDiff = normalizeAngle(desiredAngle - humvee.angle);
        const reverseDiff = normalizeAngle(desiredAngle - normalizeAngle(humvee.angle + Math.PI));
        if (Math.abs(forwardDiff) > 2.18 && Math.abs(reverseDiff) < Math.abs(forwardDiff) - 0.28) {
          driveThrottle = -mobileDriveAmount * 0.46;
          driveTurn = clamp(reverseDiff * 1.16, -1, 1);
        } else {
          const alignment = clamp((Math.cos(forwardDiff) + 0.15) / 1.15, 0, 1);
          driveThrottle = mobileDriveAmount * (0.3 + alignment * 0.7);
          driveTurn = clamp(forwardDiff * 1.22, -1, 1);
        }
      }

      const boosting = this.updateBoostState(humvee, dt, driveThrottle > 0.08, {
        drainTime: 1.2,
        recoverTime: 2.25,
        recoverDelay: 0.55
      });

      humvee.drive(this, dt, driveThrottle, driveTurn, {
        brake: this.input.keyDown("Space") && Math.abs(driveThrottle) < 0.01,
        turnScale: boosting ? 0.98 : 1.03,
        collisionSpeedRetain: 0.34,
        speedScale: boosting ? 1.35 : 1,
        accelScale: boosting ? 1.24 : 1
      });

      if (mouse.leftDown) this.fireTankMachineGun(humvee, mouse.worldX, mouse.worldY);
      this.input.consumeMousePress(0);
    }

    mobileAutoLoadTank(tank) {
      if (!this.settings?.mobileControls || !tank || tank.loadedAmmo || tank.reload.active) return false;
      const ammoId = tank.ammo.ap > 0 ? "ap" : tank.ammo.he > 0 ? "he" : null;
      return ammoId ? tank.beginLoad(ammoId) : false;
    }

    cycleMobileWeapon() {
      if (this.result || this.deploymentOpen || !this.player?.alive) return false;
      if (this.player.inTank) return this.cycleMobileTankAmmo(this.player.inTank);
      return this.cyclePlayerEquipment();
    }

    cycleMobileTankAmmo(tank) {
      if (!tank?.alive) return false;
      if (tank.vehicleType === "humvee") return true;
      this.clearTankFireOrder(tank);
      const choices = ["ap", "he"].filter((ammoId) => (tank.ammo?.[ammoId] || 0) > 0);
      if (tank.hasMachineGunner?.() && (tank.ammo?.mg || 0) > 0) choices.push("mg");
      if (!choices.length) return false;

      const current = tank.weaponMode === "mg" ? "mg" : tank.reload.active ? tank.reload.ammoId : tank.loadedAmmo;
      const currentIndex = choices.indexOf(current);
      const nextAmmo = choices[(currentIndex + 1 + choices.length) % choices.length];
      if (nextAmmo === "mg") {
        tank.weaponMode = "mg";
        return true;
      }
      tank.weaponMode = "cannon";
      return tank.beginLoad(nextAmmo);
    }

    cyclePlayerEquipment() {
      const inventory = this.player?.weaponInventory || [];
      if (!inventory.length) return false;

      for (let step = 1; step <= inventory.length; step += 1) {
        const nextSlot = (this.player.activeSlot + step) % inventory.length;
        if (this.player.setEquipmentSlot(nextSlot)) {
          this.player.rifleCooldown = Math.min(this.player.rifleCooldown, 0.12);
          return true;
        }
      }
      return false;
    }

    clearTankFireOrder(tank) {
      if (tank) tank.fireOrder = null;
    }

    fireTankMachineGun(tank, targetX, targetY) {
      if (!tank?.canFireMachineGun?.()) return false;
      const target = this.findTankMachineGunTarget(tank, targetX, targetY);
      return tank.fireMachineGun(this, targetX, targetY, { target });
    }

    updatePlayerTankMachineGunner(tank, dt) {
      if (!tank?.hasMachineGunner?.() || (tank.ammo?.mg || 0) <= 0) return false;
      if (tank.weaponMode === "mg") return false;

      const target = this.findAutoTankMachineGunTarget(tank);
      if (!target) {
        tank.machineGunAngle = rotateTowards(
          tank.machineGunAngle,
          tank.turretAngle,
          tank.machineGunTurnRate * 0.7 * dt
        );
        return false;
      }

      const targetAngle = angleTo(tank.x, tank.y, target.x, target.y);
      tank.machineGunAngle = rotateTowards(tank.machineGunAngle, targetAngle, tank.machineGunTurnRate * dt);
      const aimError = Math.abs(normalizeAngle(tank.machineGunAngle - targetAngle));
      if (aimError > 0.16) return false;
      return tank.fireMachineGun(this, target.x, target.y, { target });
    }

    findAutoTankMachineGunTarget(tank) {
      const weapon = tank.machineGunWeapon?.() || INFANTRY_WEAPONS.machinegun;
      const muzzle = tank.machineGunMuzzlePoint?.() || { x: tank.x, y: tank.y };
      const range = weapon.range || 740;
      const candidates = [];

      const addTarget = (target, priority = 1) => {
        if (!target || !target.alive || target.team === tank.team) return;
        const distance = distXY(muzzle.x, muzzle.y, target.x, target.y);
        if (distance > range) return;
        if (!hasLineOfSight(this, muzzle, target, { padding: 4 })) return;
        const threatBonus =
          target.classId === "engineer" ? 220 :
          target.weaponId === "machinegun" || target.weaponId === "lmg" ? 120 :
          target.weaponId === "rpg" ? 180 :
          0;
        candidates.push({
          target,
          score: distance - threatBonus - priority * 80
        });
      };

      for (const unit of this.infantry || []) {
        if (!unit.inVehicle) addTarget(unit, unit.classId === "engineer" ? 3 : 2);
      }
      for (const crew of this.crews || []) {
        if (crew.inTank) continue;
        addTarget(crew, 1);
      }

      if (tank.team === TEAM.RED && !this.player.inTank && this.player.hp > 0 && !this.isPlayerInSafeZone?.()) {
        addTarget(this.player, 2);
      }

      return candidates.sort((a, b) => a.score - b.score)[0]?.target || null;
    }

    findTankMachineGunTarget(tank, targetX, targetY) {
      const weapon = tank.machineGunWeapon?.() || INFANTRY_WEAPONS.machinegun;
      const muzzle = tank.machineGunMuzzlePoint?.() || { x: tank.x, y: tank.y };
      const range = weapon.range || 740;
      const enemies = [];

      for (const unit of this.infantry || []) {
        if (!unit.alive || unit.inVehicle || unit.team === tank.team) continue;
        enemies.push(unit);
      }

      for (const crew of this.crews || []) {
        if (!crew.alive || crew.inTank || crew.team === tank.team) continue;
        enemies.push(crew);
      }

      if (!this.player.inTank && this.player.hp > 0 && tank.team === TEAM.RED && !this.isPlayerInSafeZone?.()) {
        enemies.push(this.player);
      }

      return enemies
        .map((target) => {
          const rangeDistance = distXY(muzzle.x, muzzle.y, target.x, target.y);
          if (rangeDistance > range) return null;
          const laneDistance = segmentDistanceToPoint(muzzle.x, muzzle.y, targetX, targetY, target.x, target.y);
          const cursorDistance = distXY(targetX, targetY, target.x, target.y);
          if (laneDistance > 42 + target.radius || cursorDistance > 120) return null;
          if (!hasLineOfSight(this, muzzle, target, { padding: 4 })) return null;
          return {
            target,
            score: laneDistance * 1.25 + cursorDistance * 0.55 + rangeDistance * 0.02
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.score - b.score)[0]?.target || null;
    }

    applyVirtualAim(focus, distance) {
      const point = this.input.virtualAimPoint(focus, distance);
      if (!point) return;
      this.input.mouse.worldX = point.x;
      this.input.mouse.worldY = point.y;
    }

    queueHeFire(tank, targetX, targetY) {
      if (!tank || tank.loadedAmmo !== "he") return false;
      const ammo = AMMO.he;
      const solution = this.resolveTankGroundAim(tank, targetX, targetY, ammo);
      tank.fireOrder = {
        ammoId: "he",
        x: solution.x,
        y: solution.y,
        currentX: solution.x,
        currentY: solution.y,
        requestedX: targetX,
        requestedY: targetY,
        blocked: solution.blocked,
        rangeClamped: solution.rangeClamped,
        ready: false,
        timer: 4.2
      };
      return true;
    }

    updateHeFireOrder(tank, dt) {
      const order = tank.fireOrder;
      if (!order) return false;
      order.timer -= dt;

      if (!tank.alive || tank.loadedAmmo !== order.ammoId || order.timer <= 0) {
        this.clearTankFireOrder(tank);
        return false;
      }

      const ammo = AMMO[order.ammoId] || AMMO.he;
      const solution = this.resolveTankGroundAim(tank, order.x, order.y, ammo);
      order.currentX = solution.x;
      order.currentY = solution.y;
      order.blocked = solution.blocked;
      order.rangeClamped = solution.rangeClamped;

      const targetAngle = angleTo(tank.x, tank.y, solution.x, solution.y);
      const aimError = Math.abs(normalizeAngle(tank.turretAngle - targetAngle));
      order.ready = aimError <= 0.075;
      tank.aimTargetAngle = targetAngle;
      tank.aimError = aimError;

      if (!order.ready || !tank.canFire()) return false;

      const muzzle = this.tankMuzzlePoint(tank);
      const fuseDistance = distXY(muzzle.x, muzzle.y, solution.x, solution.y);
      const fired = tank.fire(this, { aimError, fuseDistance });
      if (fired) this.clearTankFireOrder(tank);
      return fired;
    }

    tankMuzzlePoint(tank) {
      const muzzleDistance = tank.radius + 28;
      return {
        x: tank.x + Math.cos(tank.turretAngle) * muzzleDistance,
        y: tank.y + Math.sin(tank.turretAngle) * muzzleDistance
      };
    }

    resolveTankGroundAim(tank, targetX, targetY, ammo = AMMO.he) {
      const muzzle = this.tankMuzzlePoint(tank);
      const range = ammo.range || 1900;
      const rawDistance = distXY(muzzle.x, muzzle.y, targetX, targetY);
      const angle = rawDistance > 1
        ? angleTo(muzzle.x, muzzle.y, targetX, targetY)
        : tank.turretAngle;
      const travelDistance = clamp(rawDistance, 90, range);
      let lastX = muzzle.x;
      let lastY = muzzle.y;

      for (let distance = 16; distance <= travelDistance; distance += 16) {
        const x = muzzle.x + Math.cos(angle) * distance;
        const y = muzzle.y + Math.sin(angle) * distance;
        if (x < 0 || y < 0 || x > this.world.width || y > this.world.height) {
          return { x: lastX, y: lastY, blocked: true, rangeClamped: rawDistance > range };
        }

        const blocked = this.world.obstacles.some((obstacle) => lineIntersectsRect(lastX, lastY, x, y, obstacle));
        if (blocked) return { x: lastX, y: lastY, blocked: true, rangeClamped: rawDistance > range };

        lastX = x;
        lastY = y;
      }

      return {
        x: muzzle.x + Math.cos(angle) * travelDistance,
        y: muzzle.y + Math.sin(angle) * travelDistance,
        blocked: false,
        rangeClamped: rawDistance > range
      };
    }

    clearPlayerProneState() {
      if (!this.player) return;
      this.player.isProne = false;
      this.player.proneTransitionTimer = 0;
      this.player.proneTargetState = false;
    }

    updatePlayerProneTransition(dt) {
      const player = this.player;
      if (!player) return;
      player.proneTransitionTimer = Math.max(0, (player.proneTransitionTimer || 0) - dt);
      if (player.proneTransitionTimer <= 0) {
        player.isProne = Boolean(player.proneTargetState);
      }
    }

    requestPlayerProneToggle() {
      const player = this.player;
      if (!player || player.inTank || player.controlledDrone || player.hp <= 0) return false;
      if ((player.proneTransitionTimer || 0) > 0) return false;

      player.proneTargetState = !player.isProne;
      player.proneTransitionTimer = player.proneTransitionDuration || 0.3;
      player.boosting = false;
      player.boostRecoverDelay = Math.max(player.boostRecoverDelay || 0, 0.36);
      return true;
    }

    isPlayerProneTransitioning() {
      return (this.player?.proneTransitionTimer || 0) > 0;
    }

    isPlayerProneLike() {
      return Boolean(this.player?.isProne || this.isPlayerProneTransitioning());
    }

    updateInfantryPlayer(dt) {
      this.player.rifleCooldown = Math.max(0, this.player.rifleCooldown - dt);
      this.player.gunKick = Math.max(0, (this.player.gunKick || 0) - dt * 11);
      this.updateInfantryWeaponInput();
      this.updatePlayerProneTransition(dt);
      if (this.input.consumePress("KeyC")) {
        this.requestPlayerProneToggle();
      }
      const scoutAimMode = this.isPlayerScoutAimMode();
      const rpgAimMode = this.isPlayerRpgAimMode();
      const machineGunAimMode = this.isPlayerMachineGunAimMode();
      this.player.scoutAim = scoutAimMode;
      this.player.rpgAim = rpgAimMode;
      this.player.machineGunAim = machineGunAimMode;
      this.player.rpgAimTime = rpgAimMode ? Math.min((this.player.rpgAimTime || 0) + dt, 0.7) : 0;
      const moveX = this.input.axis("KeyA", "ArrowLeft", "KeyD", "ArrowRight");
      const moveY = this.input.axis("KeyW", "ArrowUp", "KeyS", "ArrowDown");
      const length = Math.hypot(moveX, moveY);
      const prone = this.isPlayerProneLike();
      const baseInfantrySpeed = prone
        ? scoutAimMode ? 0 : rpgAimMode ? 34 : machineGunAimMode ? 38 : 46
        : scoutAimMode ? 0 : rpgAimMode ? 68 : machineGunAimMode ? 82 : 155;
      const sprinting = this.updateBoostState(this.player, dt, length > 0.05, {
        disabled: prone || scoutAimMode || rpgAimMode || machineGunAimMode,
        drainTime: 1.18,
        recoverTime: 2,
        recoverDelay: 0.45
      });
      const infantrySpeed = baseInfantrySpeed * (sprinting ? 1.42 : 1);
      const vx = length > 0 ? (moveX / length) * infantrySpeed : 0;
      const vy = length > 0 ? (moveY / length) * infantrySpeed : 0;

      tryMoveCircle(this, this.player, vx, vy, this.player.radius, dt, { blockTanks: true, padding: 5 });
      this.applyVirtualAim(this.player, scoutAimMode ? 1050 : rpgAimMode ? 980 : machineGunAimMode ? 880 : 650);
      if (scoutAimMode) this.applyDroneDesignationAimAssist(dt);

      const mouse = this.input.mouse;
      this.player.angle = angleTo(this.player.x, this.player.y, mouse.worldX, mouse.worldY);
      this.player.interactPulse += dt;

      const weapon = this.player.getWeapon();
      const primaryPressed = this.input.consumeMousePress(0);
      const markerDesignatePressed = this.input.consumePress("KeyQ") || this.input.consumeMousePress(1);
      if (markerDesignatePressed && this.tryDesignateReconDroneFromMarker()) return;
      const wantsUse = mouse.leftDown || primaryPressed || this.input.keyDown("Space");
      if (wantsUse && this.player.rifleCooldown <= 0) {
        this.player.lastShotCooldownScale = 1;
        const fired = this.usePlayerEquipment(weapon, mouse.worldX, mouse.worldY);
        if (fired) {
          const cooldownScale = this.player.lastShotCooldownScale || 1;
          this.player.rifleCooldown = (weapon?.cooldown || 0.35) * cooldownScale;
          this.player.lastShotCooldownScale = 1;
        }
      }
    }

    isPlayerScoutAimMode() {
      if (this.player.inTank || this.player.controlledDrone || this.player.hp <= 0 || !this.input.mouse.rightDown) return false;
      const weapon = this.player.getWeapon?.();
      return this.player.classId === "scout" && weapon?.id === "sniper";
    }

    isPlayerRpgAimMode() {
      if (this.player.inTank || this.player.controlledDrone || this.player.hp <= 0 || !this.input.mouse.rightDown) return false;
      const weapon = this.player.getWeapon?.();
      return this.player.classId === "engineer" && weapon?.id === "rpg";
    }

    isPlayerMachineGunAimMode() {
      if (this.player.inTank || this.player.controlledDrone || this.player.hp <= 0 || !this.input.mouse.rightDown) return false;
      const weapon = this.player.getWeapon?.();
      return weapon?.id === "machinegun" || weapon?.id === "lmg";
    }

    updateInfantryWeaponInput() {
      const keys = [
        ["Digit1", "Numpad1"],
        ["Digit2", "Numpad2"],
        ["Digit3", "Numpad3"]
      ];

      for (let i = 0; i < keys.length; i += 1) {
        if (!keys[i].some((code) => this.input.consumePress(code))) continue;

        if (!this.matchStarted && this.player.inSafeZone) {
          const classId = PLAYER_CLASS_ORDER[i];
          if (classId && this.player.setClass(classId)) {
            this.applyPlayerLoadoutOverrides();
            this.player.rifleCooldown = Math.min(this.player.rifleCooldown, 0.12);
          }
          continue;
        }

        if (this.player.setEquipmentSlot(i)) {
          this.player.rifleCooldown = Math.min(this.player.rifleCooldown, 0.12);
        }
      }
    }

    activePlayerDrone() {
      const drone = this.player?.activeDrone;
      return drone?.alive ? drone : null;
    }

    activeReconDroneForSniper() {
      const drone = this.activePlayerDrone();
      if (!drone || drone.droneRole === "attack" || drone.autoReturn) return null;
      if (this.player?.controlledDrone === drone) return null;
      if (drone.owner && drone.owner !== this.player) return null;
      if ((drone.signalStrength?.() ?? 1) <= 0.08) return null;
      return drone;
    }

    reconDroneDesignationUiDrone() {
      const controlledDrone = this.player?.controlledDrone;
      if (controlledDrone?.alive && controlledDrone.droneRole !== "attack") return controlledDrone;

      const drone = this.activePlayerDrone();
      if (!drone || drone.droneRole === "attack" || drone.autoReturn) return null;
      if (drone.owner && drone.owner !== this.player) return null;
      if ((drone.signalStrength?.() ?? 1) <= 0.08) return null;
      return drone;
    }

    nearbyPlayerDroneForPickup(maxDistance = 62) {
      const drone = this.activePlayerDrone();
      if (!drone || this.player.controlledDrone === drone || !drone.recallable) return null;
      const distance = distXY(this.player.x, this.player.y, drone.x, drone.y);
      return distance <= maxDistance + (drone.radius || 0) + this.player.radius ? drone : null;
    }

    pickupPlayerDrone() {
      const drone = this.nearbyPlayerDroneForPickup();
      if (!drone) return false;
      return this.recoverPlayerDrone(drone);
    }

    recoverPlayerDrone(drone) {
      if (!drone) return false;
      this.exitPlayerDroneControl();
      const weapon = drone.weapon || INFANTRY_WEAPONS[drone.weaponId];
      if (weapon?.ammoKey) {
        const current = this.player.equipmentAmmo?.[weapon.ammoKey] || 0;
        const maxAmmo = weapon.defaultAmmo ?? 1;
        this.player.equipmentAmmo[weapon.ammoKey] = Math.min(maxAmmo, current + 1);
      }

      drone.alive = false;
      drone.autoReturn = false;
      drone.clearRoofLock?.();
      drone.pendingDestroyEffect = false;
      if (this.player.activeDrone === drone) this.player.activeDrone = null;
      this.drones = (this.drones || []).filter((item) => item !== drone);
      this.effects.explosions.push({
        x: this.player.x,
        y: this.player.y,
        radius: 4,
        maxRadius: 18,
        life: 0.16,
        maxLife: 0.16,
        color: "rgba(180, 194, 181, 0.34)"
      });
      return true;
    }

    droneCloseEnoughToRecover(drone, maxDistance = 34) {
      if (!drone?.alive || !this.player || this.player.hp <= 0) return false;
      const distance = distXY(this.player.x, this.player.y, drone.x, drone.y);
      return distance <= maxDistance + (drone.radius || 0) + this.player.radius;
    }

    deployReconDrone(weapon, targetX, targetY) {
      if (!this.matchStarted || this.player.inTank || this.player.classId !== "scout") return false;

      const existing = this.activePlayerDrone();
      if (existing) {
        existing.autoReturn = false;
        this.setReconDroneWaypoint(existing, targetX, targetY);
        return true;
      }

      if (!this.consumePlayerEquipmentAmmo(weapon)) return false;

      const angle = angleTo(this.player.x, this.player.y, targetX, targetY);
      const drone = new IronLine.ReconDrone({
        x: clamp(this.player.x + Math.cos(angle) * 34, 12, this.world.width - 12),
        y: clamp(this.player.y + Math.sin(angle) * 34, 12, this.world.height - 12),
        angle,
        team: this.player.team,
        owner: this.player,
        weapon,
        targetX,
        targetY
      });
      this.setReconDroneWaypoint(drone, targetX, targetY);

      this.drones.push(drone);
      this.player.activeDrone = drone;
      if (this.player.activeSlot === 2) this.player.setEquipmentSlot?.(0);
      this.effects.explosions.push({
        x: drone.x,
        y: drone.y,
        radius: 4,
        maxRadius: 22,
        life: 0.18,
        maxLife: 0.18,
        color: "rgba(150, 220, 255, 0.42)"
      });
      return true;
    }

    deploySuicideDrone(weapon, targetX, targetY) {
      if (!this.matchStarted || this.player.inTank || this.player.classId !== "engineer") return false;

      const existing = this.activePlayerDrone();
      if (existing) {
        existing.autoReturn = false;
        existing.setWaypoint(targetX, targetY);
        return true;
      }

      if (!this.consumePlayerEquipmentAmmo(weapon)) return false;

      const angle = angleTo(this.player.x, this.player.y, targetX, targetY);
      const drone = new IronLine.SuicideDrone({
        x: clamp(this.player.x + Math.cos(angle) * 34, 12, this.world.width - 12),
        y: clamp(this.player.y + Math.sin(angle) * 34, 12, this.world.height - 12),
        angle,
        team: this.player.team,
        owner: this.player,
        weapon,
        targetX,
        targetY
      });

      this.drones.push(drone);
      this.player.activeDrone = drone;
      this.effects.explosions.push({
        x: drone.x,
        y: drone.y,
        radius: 5,
        maxRadius: 24,
        life: 0.2,
        maxLife: 0.2,
        color: "rgba(255, 190, 104, 0.42)"
      });
      return true;
    }

    suicideDroneLockCandidates(drone = this.player?.controlledDrone, options = {}) {
      if (!drone?.alive || drone.droneRole !== "attack") return [];
      const targets = [];

      for (const vehicle of [...(this.tanks || []), ...(this.humvees || [])]) {
        if (vehicle.alive && vehicle.team !== drone.team) targets.push(vehicle);
      }
      for (const unit of this.infantry || []) {
        if (unit.alive && !unit.inVehicle && unit.team !== drone.team) targets.push(unit);
      }
      for (const crew of this.crews || []) {
        if (crew.alive && !crew.inTank && crew.team !== drone.team) targets.push(crew);
      }
      if (!this.player.inTank && this.player.hp > 0 && this.player.team !== drone.team && !this.isPlayerInSafeZone?.()) {
        targets.push(this.player);
      }

      const range = drone.lockAcquireRange || 720;
      const requireLineOfSight = options.requireLineOfSight !== false;
      return targets.filter((target) => (
        distXY(drone.x, drone.y, target.x, target.y) <= range + (target.radius || 0) &&
        (!requireLineOfSight || hasLineOfSight(this, drone, target, this.droneSightOptions(drone, { padding: 1 })))
      ));
    }

    suicideDroneLockOptions(drone = this.player?.controlledDrone, options = {}) {
      if (!drone?.alive || drone.droneRole !== "attack") return [];
      const mouse = this.input.mouse;
      const cursorTolerance = drone.lockCursorTolerance || 76;
      const aimTolerance = drone.lockAimTolerance || 48;

      return this.suicideDroneLockCandidates(drone, options)
        .map((target) => {
          const radius = target.radius || 10;
          const droneDistance = distXY(drone.x, drone.y, target.x, target.y);
          const cursorDistance = distXY(mouse.worldX, mouse.worldY, target.x, target.y);
          const aimDistance = segmentDistanceToPoint(
            drone.x,
            drone.y,
            mouse.worldX,
            mouse.worldY,
            target.x,
            target.y
          );
          const lockable = cursorDistance <= radius + cursorTolerance || aimDistance <= radius + aimTolerance;
          return {
            target,
            droneDistance,
            cursorDistance,
            aimDistance,
            lockable,
            score: cursorDistance * 0.7 + aimDistance * 0.55 + droneDistance * 0.018 - (lockable ? 130 : 0)
          };
        })
        .sort((a, b) => a.score - b.score);
    }

    findSuicideDroneLockTarget(drone = this.player?.controlledDrone) {
      return this.suicideDroneLockOptions(drone).filter((item) => item.lockable)[0]?.target || null;
    }

    lockSuicideDroneTarget(drone = this.player?.controlledDrone) {
      if (!drone?.alive || drone.droneRole !== "attack") return false;
      const target = this.findSuicideDroneLockTarget(drone);
      const locked = target ? drone.lockOn?.(target) : drone.lockGround?.(this.input.mouse.worldX, this.input.mouse.worldY);
      if (!locked) return false;

      const point = target || drone.lockPoint;
      this.effects.blastRings?.push({
        x: point.x,
        y: point.y,
        radius: target ? (target.radius || 12) + 10 : 10,
        maxRadius: target ? (target.radius || 12) + 34 : 34,
        life: 0.24,
        maxLife: 0.24,
        color: target ? "rgba(255, 209, 102, 0.74)" : "rgba(255, 190, 104, 0.45)",
        width: 2.4
      });
      return true;
    }

    emitSuicideDroneLockFeedback(drone, target = null) {
      const point = target || drone?.lockPoint || drone?.lockPosition?.();
      if (!point) return;
      this.effects.blastRings?.push({
        x: point.x,
        y: point.y,
        radius: target ? (target.radius || 12) + 10 : 10,
        maxRadius: target ? (target.radius || 12) + 34 : 36,
        life: 0.24,
        maxLife: 0.24,
        color: target ? "rgba(255, 209, 102, 0.74)" : "rgba(255, 190, 104, 0.45)",
        width: 2.4
      });
    }

    completeSuicideDroneLock(drone, target = null, point = null) {
      if (!drone?.alive) return false;
      const locked = target ? drone.lockOn?.(target) : drone.lockGround?.(point.x, point.y);
      if (!locked) return false;
      this.emitSuicideDroneLockFeedback(drone, target);
      return true;
    }

    updateSuicideDroneLocking(drone, dt) {
      if (!drone?.alive || drone.droneRole !== "attack") return false;
      if (drone.diveActive) {
        drone.clearLockAttempt?.();
        return false;
      }

      const freshLockPress = Boolean(this.input.mouse.pressedButtons?.has?.(0));
      if (drone.hasLock?.() && this.input.mouse.leftDown && !freshLockPress) return false;
      if (drone.hasLock?.() && freshLockPress) drone.clearLock?.();

      if (!this.input.mouse.leftDown) {
        if (drone.lockProgress > 0) drone.lockProgress = Math.max(0, drone.lockProgress - dt * 1.6);
        if (drone.lockProgress <= 0.001) drone.clearLockAttempt?.();
        return false;
      }

      this.input.consumeMousePress(0);

      if ((drone.signalStrength?.() ?? 1) <= 0.04) {
        drone.failLock?.("\uC2E0\uD638 \uB04A\uAE40");
        return false;
      }

      const target = this.findSuicideDroneLockTarget(drone);
      if (target) {
        drone.beginLockAttempt?.("target", target, { x: target.x, y: target.y }, drone.lockAcquireTime);
        if (drone.advanceLock?.(dt)) return this.completeSuicideDroneLock(drone, target);
        return false;
      }

      const blockedTarget = this.suicideDroneLockOptions(drone, { requireLineOfSight: false })
        .filter((item) => item.lockable)[0]?.target || null;
      if (blockedTarget) {
        drone.failLock?.("\uC2DC\uC57C \uCC28\uB2E8");
        return false;
      }

      const mouse = this.input.mouse;
      const range = drone.lockAcquireRange || 720;
      const pointDistance = distXY(drone.x, drone.y, mouse.worldX, mouse.worldY);
      if (pointDistance > range) {
        drone.failLock?.("\uAC70\uB9AC \uCD08\uACFC");
        return false;
      }

      const point = { x: mouse.worldX, y: mouse.worldY };
      drone.beginLockAttempt?.("ground", null, point, drone.groundLockAcquireTime || drone.lockAcquireTime);
      if (drone.advanceLock?.(dt * 0.86)) return this.completeSuicideDroneLock(drone, null, point);
      return false;
    }

    startSuicideDroneAttack(drone = this.player?.controlledDrone) {
      if (!drone?.alive || drone.droneRole !== "attack" || drone.diveActive) return false;
      drone.clearLockAttempt?.();

      if ((drone.signalStrength?.() ?? 1) <= 0.04) {
        drone.failLock?.("\uC2E0\uD638 \uB04A\uAE40");
        return false;
      }

      const target = this.findSuicideDroneLockTarget(drone);
      const mouse = this.input.mouse;
      let attackPoint = target ? null : { x: mouse.worldX, y: mouse.worldY };
      if (!target) {
        const range = drone.lockAcquireRange || 720;
        if (distXY(drone.x, drone.y, attackPoint.x, attackPoint.y) > range) {
          drone.failLock?.("\uAC70\uB9AC \uCD08\uACFC");
          return false;
        }
      }

      const locked = target ? drone.lockOn?.(target) : drone.lockGround?.(attackPoint.x, attackPoint.y);
      if (!locked || !drone.startAttackDive?.(this)) return false;

      this.addScreenShake(7.5, 14);
      this.effects.blastRings?.push({
        x: drone.x,
        y: drone.y,
        radius: 8,
        maxRadius: 42,
        life: 0.18,
        maxLife: 0.18,
        color: "rgba(255, 123, 72, 0.68)",
        width: 2.8
      });
      this.emitSuicideDroneLockFeedback(drone, target);
      return true;
    }

    togglePlayerDroneControl() {
      if (this.player.inTank) return false;
      if (this.player.controlledDrone) {
        this.exitPlayerDroneControl();
        return true;
      }

      const drone = this.activePlayerDrone();
      if (!drone) return false;

      drone.autoReturn = false;
      drone.clearRoofLock?.();
      this.player.controlledDrone = drone;
      drone.controlled = true;
      this.droneInteractReleaseRequired = true;
      this.resetDroneInteractHold();
      this.input.clearVirtual?.();
      return true;
    }

    exitPlayerDroneControl() {
      const drone = this.player?.controlledDrone;
      if (drone) {
        drone.controlled = false;
        drone.recallable = true;
        this.setReconDroneWaypoint(drone, drone.x, drone.y);
      }
      if (this.player) this.player.controlledDrone = null;
      this.droneInteractReleaseRequired = false;
    }

    resetDroneInteractHold() {
      this.droneInteractHoldTime = 0;
      this.droneInteractHoldConsumed = false;
      this.droneInteractWasDown = false;
    }

    updateControlledDroneInteraction(dt) {
      const drone = this.player.controlledDrone;
      const interactPressed = this.input.consumePress("KeyE");
      const interactDown = this.input.keyDown("KeyE");

      if (this.droneInteractReleaseRequired) {
        if (!interactDown) {
          this.droneInteractReleaseRequired = false;
          this.resetDroneInteractHold();
        }
        this.updateControlledDronePlayer(dt);
        return;
      }

      if (interactPressed && !interactDown) {
        this.exitPlayerDroneControl();
        this.resetDroneInteractHold();
        return;
      }

      if (interactDown) {
        this.droneInteractHoldTime = this.droneInteractWasDown ? this.droneInteractHoldTime + dt : dt;
        this.droneInteractWasDown = true;
        if (!this.droneInteractHoldConsumed && this.droneInteractHoldTime >= this.droneRecallHoldDuration) {
          this.droneInteractHoldConsumed = true;
          this.recallPlayerDrone(drone);
          this.resetDroneInteractHold();
          return;
        }
      } else if (this.droneInteractWasDown) {
        if (!this.droneInteractHoldConsumed) this.exitPlayerDroneControl();
        this.resetDroneInteractHold();
        return;
      }

      this.updateControlledDronePlayer(dt);
    }

    recallPlayerDrone(drone = this.activePlayerDrone()) {
      if (!drone?.alive || !this.player || this.player.hp <= 0) return false;
      if (this.player.controlledDrone === drone) this.exitPlayerDroneControl();
      drone.controlled = false;
      drone.autoReturn = true;
      drone.recallable = false;
      drone.clearRoofLock?.();
      drone.setWaypoint?.(this.player.x, this.player.y);
      this.effects.explosions.push({
        x: drone.x,
        y: drone.y,
        radius: 3,
        maxRadius: 15,
        life: 0.14,
        maxLife: 0.14,
        color: "rgba(255, 209, 102, 0.28)"
      });
      return true;
    }

    updateControlledDronePlayer(dt) {
      const drone = this.player.controlledDrone;
      if (!drone?.alive) {
        this.exitPlayerDroneControl();
        return;
      }

      const moveX = this.input.axis("KeyA", "ArrowLeft", "KeyD", "ArrowRight");
      const moveY = this.input.axis("KeyW", "ArrowUp", "KeyS", "ArrowDown");
      const length = Math.hypot(moveX, moveY);
      const attackDrone = drone.droneRole === "attack";
      const droneBoosting = attackDrone && this.updateBoostState(drone, dt, true, {
        drainTime: 0.62,
        recoverTime: 1.45,
        recoverDelay: 0.32
      });
      const boostOnlyMove = droneBoosting && length <= 0.05 && !drone.diveActive;
      if ((length > 0 || boostOnlyMove) && !drone.diveActive) {
        drone.clearRoofLock?.();
        const signalRatio = drone.signalRatio?.() ?? 0;
        const signalSlowdown = lerp(1, 0.58, clamp((signalRatio - 0.82) / 0.18, 0, 1));
        const boostScale = droneBoosting ? drone.boostSpeedMultiplier || 1.7 : 1;
        const speed = drone.speed * signalSlowdown * (this.input.mouse.rightDown ? 0.58 : 1) * boostScale;
        const dirX = boostOnlyMove ? Math.cos(drone.angle) : moveX / length;
        const dirY = boostOnlyMove ? Math.sin(drone.angle) : moveY / length;
        drone.setPosition(
          drone.x + dirX * speed * dt,
          drone.y + dirY * speed * dt,
          this
        );
      }
      if (droneBoosting) this.addScreenShake(drone.diveActive ? 4.2 : 2.1, drone.diveActive ? 10 : 6);

      this.applyVirtualAim(drone, 620);
      if (!drone.diveActive) {
        drone.angle = angleTo(drone.x, drone.y, this.input.mouse.worldX, this.input.mouse.worldY);
        drone.setWaypoint(drone.x, drone.y);
      }

      if (drone.droneRole !== "attack") {
        const primaryDesignate = this.input.consumeMousePress(0) || this.input.consumePress("Space");
        const secondaryDesignate = this.input.mouse.pressedButtons.has(2);
        if (primaryDesignate || secondaryDesignate) {
          const target = this.findReconDroneDesignationTarget(drone);
          if (target) {
            this.input.consumeMousePress(2);
            this.designateReconDroneTarget(target, drone);
          }
          return;
        }
      }

      if (drone.droneRole === "attack") {
        if (this.input.consumeMousePress(0)) this.startSuicideDroneAttack(drone);
      }
    }

    updateDrones(dt) {
      for (const drone of this.drones || []) {
        if (drone.alive && drone.autoReturn && this.player.hp > 0) {
          drone.setWaypoint?.(this.player.x, this.player.y);
        }
        if (drone.alive) drone.update(this, dt);
        if (drone.alive && drone.autoReturn && this.droneCloseEnoughToRecover(drone)) {
          this.recoverPlayerDrone(drone);
        }
        if (!drone.alive && drone.pendingDestroyEffect) drone.emitDestroyEffect(this);
      }

      if (this.player.controlledDrone && !this.player.controlledDrone.alive) this.exitPlayerDroneControl();
      if (this.player.activeDrone && !this.player.activeDrone.alive) this.player.activeDrone = null;
      this.drones = (this.drones || []).filter((drone) => drone.alive);
    }

    reconDroneTargetCandidates(drone, options = {}) {
      if (!drone?.alive || drone.droneRole === "attack") return [];
      const sniperOnly = options.sniperOnly !== false;
      const targets = [];

      for (const unit of this.infantry || []) {
        if (unit.alive && !unit.inVehicle && unit.team !== drone.team) targets.push(unit);
      }
      for (const crew of this.crews || []) {
        if (crew.alive && !crew.inTank && crew.team !== drone.team) targets.push(crew);
      }
      if (!sniperOnly) {
        for (const enemyDrone of this.drones || []) {
          if (enemyDrone.alive && enemyDrone.team !== drone.team) targets.push(enemyDrone);
        }
      }

      return targets.filter((target) => (
        distXY(drone.x, drone.y, target.x, target.y) <= (drone.scanRange || 0) + (target.radius || 0) + 32 &&
        hasLineOfSight(this, drone, target, this.droneSightOptions(drone, { padding: 1 }))
      ));
    }

    reconDroneDesignationOptions(drone = this.reconDroneDesignationUiDrone(), options = {}) {
      if (!drone?.alive || drone.droneRole === "attack") return [];

      const mouse = this.input.mouse;
      const aimTolerance = options.aimTolerance ?? 34;
      const markerTolerance = options.markerTolerance ?? 58;
      return this.reconDroneTargetCandidates(drone, { sniperOnly: true })
        .map((target) => {
          const radius = target.radius || 10;
          const markerX = target.x;
          const markerY = target.y - radius - 30;
          const droneDistance = distXY(drone.x, drone.y, target.x, target.y);
          const aimDistance = segmentDistanceToPoint(
            drone.x,
            drone.y,
            mouse.worldX,
            mouse.worldY,
            target.x,
            target.y
          );
          const cursorDistance = distXY(mouse.worldX, mouse.worldY, target.x, target.y);
          const labelDistance = distXY(mouse.worldX, mouse.worldY, markerX, markerY);
          const markerDistance = Math.min(cursorDistance, labelDistance);
          const hovered = markerDistance <= markerTolerance;
          const aimLocked = aimDistance <= aimTolerance;
          return {
            target,
            markerX,
            markerY,
            droneDistance,
            aimDistance,
            cursorDistance,
            labelDistance,
            markerDistance,
            hovered,
            aimLocked,
            lockable: hovered || aimLocked,
            score: markerDistance * 0.65 + aimDistance * 0.45 + droneDistance * 0.018 - (hovered ? 120 : 0) - (aimLocked ? 54 : 0)
          };
        })
        .sort((a, b) => a.score - b.score);
    }

    findReconDroneDesignationTarget(drone = this.reconDroneDesignationUiDrone()) {
      const options = this.reconDroneDesignationOptions(drone) || [];
      return options.filter((item) => item.lockable)[0]?.target || null;
    }

    tryDesignateReconDroneFromMarker(drone = this.reconDroneDesignationUiDrone()) {
      if (!drone?.alive || this.player?.controlledDrone === drone || drone.droneRole === "attack") return false;
      const target = this.findReconDroneDesignationTarget(drone);
      return target ? this.designateReconDroneTarget(target, drone) : false;
    }

    designateReconDroneTarget(target, drone = this.player?.controlledDrone) {
      if (!target || !drone?.alive || drone.droneRole === "attack") return false;
      const alive = target.alive !== undefined ? target.alive : target.hp > 0;
      if (!alive || target.team === this.player.team || target.vehicleType || target.inTank) return false;
      if (!hasLineOfSight(this, drone, target, this.droneSightOptions(drone, { padding: 1 }))) return false;

      this.droneDesignation = {
        target,
        drone,
        ttl: this.droneDesignationDuration,
        maxTtl: this.droneDesignationDuration
      };
      this.reportContact?.(this.player.team, target, drone, this.droneDesignationDuration);
      this.exitPlayerDroneControl();
      this.player.setEquipmentSlot?.(0);
      this.player.rifleCooldown = Math.max(this.player.rifleCooldown || 0, 0.16);
      this.input.mouse.leftDown = false;
      this.input.mouse.down = false;
      this.input.mouse.pressedButtons.delete(0);
      this.effects.explosions.push({
        x: target.x,
        y: target.y,
        radius: 3,
        maxRadius: 18,
        life: 0.18,
        maxLife: 0.18,
        color: "rgba(143, 222, 207, 0.34)"
      });
      return true;
    }

    updateDroneDesignation(dt) {
      const designation = this.droneDesignation;
      if (!designation) return;

      designation.ttl -= dt;
      const { target, drone } = designation;
      const alive = target?.alive !== undefined ? target.alive : target?.hp > 0;
      const observed = Boolean(
        alive &&
        drone?.alive &&
        target.team !== this.player.team &&
        !target.vehicleType &&
        !target.inTank &&
        distXY(drone.x, drone.y, target.x, target.y) <= (drone.scanRange || 0) + (target.radius || 0) + 42 &&
        hasLineOfSight(this, drone, target, this.droneSightOptions(drone, { padding: 1 }))
      );

      if (!observed || designation.ttl <= 0) {
        this.droneDesignation = null;
        return;
      }

      this.reportContact?.(this.player.team, target, drone, Math.max(0.3, designation.ttl));
    }

    droneDesignatedContact() {
      return this.droneDesignation?.target ? this.droneDesignation : null;
    }

    observedSniperRange(weapon, drone, designated = false) {
      const base = weapon?.range || INFANTRY_WEAPONS.sniper.range || 980;
      const control = drone?.maxControlRange || base * 2.25;
      const scanBonus = drone?.scanRange || 0;
      return designated
        ? Math.min(base * 2.85, control + scanBonus * 0.75)
        : Math.min(base * 2.45, control + scanBonus * 0.45);
    }

    scoutObservationCameraTarget() {
      if (!this.isPlayerScoutAimMode?.()) return null;
      const weapon = this.player?.getWeapon?.();
      if (!weapon || weapon.id !== "sniper") return null;

      const drone = this.activeReconDroneForSniper();
      if (!drone) return null;

      const designation = this.droneDesignatedContact();
      const designatedAlive = designation?.target?.alive !== undefined
        ? designation.target.alive
        : designation?.target?.hp > 0;
      if (designation?.drone === drone && designatedAlive) {
        const distance = distXY(this.player.x, this.player.y, designation.target.x, designation.target.y);
        return {
          x: designation.target.x,
          y: designation.target.y,
          drone,
          target: designation.target,
          designated: true,
          distance
        };
      }

      const observed = this.findObservedSniperTarget?.();
      if (observed?.target) {
        return {
          x: observed.target.x,
          y: observed.target.y,
          drone,
          target: observed.target,
          designated: Boolean(observed.designated),
          distance: observed.rangeDistance ?? distXY(this.player.x, this.player.y, observed.target.x, observed.target.y)
        };
      }

      const contacts = (this.reconDroneObservedContacts?.({ sniperOnly: true }) || [])
        .filter((target) => target && (target.alive !== false) && (target.hp === undefined || target.hp > 0));
      if (contacts.length > 0) {
        const mouse = this.input.mouse;
        const target = contacts
          .map((contact) => ({
            contact,
            score: distXY(mouse.worldX, mouse.worldY, contact.x, contact.y) * 0.68 +
              distXY(drone.x, drone.y, contact.x, contact.y) * 0.18 +
              distXY(this.player.x, this.player.y, contact.x, contact.y) * 0.035
          }))
          .sort((a, b) => a.score - b.score)[0]?.contact;
        if (target) {
          return {
            x: target.x,
            y: target.y,
            drone,
            target,
            designated: false,
            distance: distXY(this.player.x, this.player.y, target.x, target.y)
          };
        }
      }

      const distance = distXY(this.player.x, this.player.y, drone.x, drone.y);
      if (distance < 680) return null;
      return {
        x: drone.x,
        y: drone.y,
        drone,
        target: null,
        designated: false,
        distance
      };
    }

    scoutObservationCameraZoom(observation) {
      if (!observation) return 0.72;
      const dx = Math.abs((observation.x || 0) - this.player.x);
      const dy = Math.abs((observation.y || 0) - this.player.y);
      const fitZoom = Math.min(
        (this.camera.width - 180) / Math.max(360, dx + 360),
        (this.camera.height - 150) / Math.max(320, dy + 320)
      );
      return clamp(fitZoom, observation.target ? 0.5 : 0.54, 0.72);
    }

    scoutObservationCameraFocus(observation) {
      if (!observation) return null;
      const distance = observation.distance ?? distXY(this.player.x, this.player.y, observation.x, observation.y);
      const fitZoom = this.scoutObservationCameraZoom(observation);
      const canFrameBoth = fitZoom > 0.54 || distance < 1900;
      const weight = canFrameBoth
        ? 0.5
        : observation.target
          ? clamp((distance - 1100) / 1900, 0.64, 0.86)
          : clamp((distance - 1100) / 1900, 0.56, 0.78);
      return {
        x: lerp(this.player.x, observation.x, weight),
        y: lerp(this.player.y, observation.y, weight),
        zoom: fitZoom
      };
    }

    applyDroneDesignationAimAssist(dt, strengthScale = 1) {
      const designation = this.droneDesignatedContact();
      if (!designation?.target || !this.isPlayerScoutAimMode?.()) return false;
      const weapon = this.player?.getWeapon?.();
      if (!weapon || weapon.id !== "sniper") return false;

      const { target, drone } = designation;
      const range = this.observedSniperRange(weapon, drone, true);
      if (distXY(this.player.x, this.player.y, target.x, target.y) > range) return false;

      const cursorDistance = distXY(this.input.mouse.worldX, this.input.mouse.worldY, target.x, target.y);
      const closeAssist = clamp(1 - cursorDistance / 190, 0, 1);
      if (closeAssist <= 0) return false;

      const blend = clamp(dt * (1.1 + closeAssist * 1.9) * strengthScale, 0, 0.045);
      this.input.mouse.worldX = lerp(this.input.mouse.worldX, target.x, blend);
      this.input.mouse.worldY = lerp(this.input.mouse.worldY, target.y, blend);
      return true;
    }

    usePlayerEquipment(weapon, targetX, targetY) {
      if (!weapon) return false;
      const proneBusy = this.isPlayerProneTransitioning?.();
      const prone = Boolean(this.player?.isProne);
      if (proneBusy && (weapon.type === "grenade" || weapon.type === "rpg" || weapon.type === "drone" || weapon.type === "repair")) {
        return false;
      }

      if (weapon.type === "drone") {
        if (weapon.droneRole === "attack" || weapon.id === "kamikazeDrone") {
          return this.deploySuicideDrone(weapon, targetX, targetY);
        }
        return this.deployReconDrone(weapon, targetX, targetY);
      }

      if (weapon.type === "grenade") {
        if (!this.consumePlayerEquipmentAmmo(weapon)) return false;
        const thrown = IronLine.combat.throwGrenade(this, this.player, targetX, targetY, { weapon });
        if (thrown && prone) this.player.lastShotCooldownScale = Math.max(this.player.lastShotCooldownScale || 1, 1.45);
        return thrown;
      }

      if (weapon.type === "rpg") {
        return this.firePlayerRpg(weapon, targetX, targetY);
      }

      if (weapon.type === "repair") {
        return this.repairFriendlyTank(weapon);
      }

      return this.firePlayerGun(weapon, targetX, targetY);
    }

    firePlayerRpg(weapon, targetX, targetY) {
      if (!this.isPlayerRpgAimMode()) return false;
      if ((this.player.equipmentAmmo?.[weapon.ammoKey] || 0) <= 0) return false;

      const aim = this.resolvePlayerRpgAim(targetX, targetY, weapon);
      if (aim.tooClose) return false;

      const pronePenalty = this.player.isProne ? 0.18 : 0;
      const aimStability = clamp((this.player.rpgAimTime || 0) / 0.42 - pronePenalty, 0, 1);
      const fired = IronLine.combat.fireRpg(this, this.player, aim.requestedX, aim.requestedY, {
        weapon,
        aimStability
      });
      if (!fired) return false;

      this.player.equipmentAmmo[weapon.ammoKey] = Math.max(0, this.player.equipmentAmmo[weapon.ammoKey] - 1);
      this.player.rpgAimTime = 0;
      if (this.player.isProne) this.player.lastShotCooldownScale = Math.max(this.player.lastShotCooldownScale || 1, 1.35);
      return true;
    }

    resolvePlayerRpgAim(targetX = this.input.mouse.worldX, targetY = this.input.mouse.worldY, weapon = null) {
      const rpg = weapon || INFANTRY_WEAPONS.rpg;
      const range = rpg.range || 980;
      const minRange = rpg.minRange || 140;
      const muzzleDistance = this.player.radius + 16;
      const angle = angleTo(this.player.x, this.player.y, targetX, targetY);
      const muzzleX = this.player.x + Math.cos(angle) * muzzleDistance;
      const muzzleY = this.player.y + Math.sin(angle) * muzzleDistance;
      const rawDistance = distXY(this.player.x, this.player.y, targetX, targetY);
      const travelDistance = clamp(rawDistance, minRange, range);
      let lastX = muzzleX;
      let lastY = muzzleY;

      for (let distance = 14; distance <= travelDistance; distance += 14) {
        const x = muzzleX + Math.cos(angle) * distance;
        const y = muzzleY + Math.sin(angle) * distance;
        if (x < 0 || y < 0 || x > this.world.width || y > this.world.height) {
          return {
            x: lastX,
            y: lastY,
            requestedX: targetX,
            requestedY: targetY,
            blocked: true,
            tooClose: rawDistance < minRange,
            rangeClamped: rawDistance > range,
            minRange,
            range
          };
        }

        const blocked = this.world.obstacles.some((obstacle) => lineIntersectsRect(lastX, lastY, x, y, obstacle));
        if (blocked) {
          return {
            x: lastX,
            y: lastY,
            requestedX: targetX,
            requestedY: targetY,
            blocked: true,
            tooClose: rawDistance < minRange,
            rangeClamped: rawDistance > range,
            minRange,
            range
          };
        }

        lastX = x;
        lastY = y;
      }

      return {
        x: muzzleX + Math.cos(angle) * travelDistance,
        y: muzzleY + Math.sin(angle) * travelDistance,
        requestedX: targetX,
        requestedY: targetY,
        blocked: false,
        tooClose: rawDistance < minRange,
        rangeClamped: rawDistance > range,
        minRange,
        range
      };
    }

    firePlayerGun(weapon, targetX, targetY) {
      if (!this.hasPlayerWeaponAmmo(weapon)) return false;

      const scoped = this.isPlayerScoutAimMode() && weapon.id === "sniper";
      const machineGunAim = this.isPlayerMachineGunAimMode() && (weapon.id === "machinegun" || weapon.id === "lmg");
      const prone = Boolean(this.player.isProne);
      const proneAccuracyBonus = prone ? 0.06 : 0;
      const proneSpreadScale = prone ? 0.72 : 1;
      const range = scoped ? weapon.range * 1.28 : machineGunAim ? weapon.range * 1.08 : weapon.range;
      const directTarget = this.findPlayerRifleTarget();
      const observedTarget = !directTarget && scoped ? this.findObservedSniperTarget() : null;
      const target = directTarget || observedTarget?.target;
      const observedShot = Boolean(observedTarget && target === observedTarget.target);
      const fired = target
        ? IronLine.combat.fireRifle(this, this.player, target, observedShot ? {
          weapon,
          range: observedTarget.range,
          requireLineOfSight: false,
          accuracyDistance: observedTarget.rangeDistance,
          damage: (weapon.damageMin + Math.random() * (weapon.damageMax - weapon.damageMin)) * (observedTarget.designated ? 0.92 : 0.86),
          baseAccuracy: observedTarget.designated ? 0.66 : 0.6,
          accuracyFalloff: observedTarget.designated ? 0.42 : 0.46,
          minAccuracy: 0.14,
          maxAccuracy: observedTarget.designated ? 0.76 : 0.68,
          accuracyBonus: weapon.accuracyBonus + (observedTarget.designated ? 0.06 : 0.02) + proneAccuracyBonus,
          spread: weapon.spread * (observedTarget.designated ? 1.05 : 1.35) * proneSpreadScale,
          impactChance: 0.22,
          tracerColor: "rgba(143, 222, 207, 0.88)",
          tracerWidth: Math.max(1.4, (weapon.visualWidth || 2) * 0.82)
        } : {
          weapon,
          range,
          damage: weapon.damageMin + Math.random() * (weapon.damageMax - weapon.damageMin),
          accuracyBonus: weapon.accuracyBonus + 0.08 + (scoped ? 0.16 : machineGunAim ? 0.12 : 0) + proneAccuracyBonus,
          spread: (machineGunAim ? weapon.spread * 0.58 : weapon.spread) * proneSpreadScale,
          impactChance: machineGunAim ? 0.45 : 0.24
        })
        : IronLine.combat.fireRifleAtPoint(this, this.player, targetX, targetY, {
          weapon,
          range,
          spread: (scoped ? weapon.spread * 0.35 : machineGunAim ? weapon.spread * 0.58 : weapon.spread) * proneSpreadScale,
          targetTeam: TEAM.RED,
          impactChance: machineGunAim ? 0.46 : 0.28
        });
      if (fired) {
        if (observedShot) this.player.lastShotCooldownScale = observedTarget.designated ? 1.18 : 1.35;
        this.consumePlayerEquipmentAmmo(weapon);
        this.emitPlayerGunFeedback(weapon, machineGunAim || observedShot);
      }
      return fired;
    }

    effectivePlayerGunRange(weapon, baseRange) {
      return IronLine.combat?.smallArmsRange?.(weapon, this.player, baseRange) || baseRange;
    }

    emitPlayerGunFeedback(weapon, aimed = false) {
      const player = this.player;
      const angle = player.angle;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const side = aimed ? 0 : 6;
      const muzzleDistance = player.radius + (weapon.visualLength || 16) + 5;
      const muzzleX = player.x + c * muzzleDistance - s * side;
      const muzzleY = player.y + s * muzzleDistance + c * side;
      const heavy = weapon.id === "machinegun" || weapon.id === "lmg";
      const flashes = this.effects.muzzleFlashes || (this.effects.muzzleFlashes = []);
      const smokePuffs = this.effects.gunSmokePuffs || (this.effects.gunSmokePuffs = []);

      if (flashes.length > 90) flashes.shift();
      flashes.push({
        x: muzzleX,
        y: muzzleY,
        angle,
        length: heavy ? 18 : 12,
        width: heavy ? 8 : 5,
        life: heavy ? 0.055 : 0.045,
        maxLife: heavy ? 0.055 : 0.045,
        color: heavy ? "rgba(255, 228, 148, 0.92)" : "rgba(255, 236, 170, 0.82)"
      });

      if (smokePuffs.length > 180) smokePuffs.shift();
      smokePuffs.push({
        x: muzzleX - c * 4,
        y: muzzleY - s * 4,
        vx: c * (heavy ? 24 : 16) + (Math.random() - 0.5) * 10,
        vy: s * (heavy ? 24 : 16) + (Math.random() - 0.5) * 10,
        angle: angle + (Math.random() - 0.5) * 0.36,
        radius: heavy ? 2.8 : 1.9,
        maxRadius: heavy ? 11 + Math.random() * 5 : 7 + Math.random() * 3,
        life: heavy ? 0.22 : 0.15,
        maxLife: heavy ? 0.22 : 0.15,
        alpha: heavy ? 0.13 : 0.08,
        warm: true
      });

      player.gunKick = Math.max(player.gunKick || 0, heavy ? 1.35 : 0.8);
    }

    hasPlayerWeaponAmmo(weapon) {
      if (!weapon?.ammoKey) return true;
      return (this.player.equipmentAmmo?.[weapon.ammoKey] || 0) > 0;
    }

    consumePlayerEquipmentAmmo(weapon) {
      if (!weapon.ammoKey) return true;
      const current = this.player.equipmentAmmo[weapon.ammoKey] || 0;
      if (current <= 0) return false;
      this.player.equipmentAmmo[weapon.ammoKey] = current - 1;
      return true;
    }

    repairFriendlyTank(weapon) {
      const tank = this.findRepairTarget(weapon.range || 72);
      if (!tank) return false;
      if (!this.consumePlayerEquipmentAmmo(weapon)) return false;

      tank.hp = Math.min(tank.maxHp, tank.hp + (weapon.repairAmount || 28));
      this.effects.explosions.push({
        x: tank.x,
        y: tank.y,
        radius: 8,
        maxRadius: 42,
        life: 0.28,
        maxLife: 0.28,
        color: "rgba(120, 214, 140, 0.65)"
      });
      return true;
    }

    findRepairTarget(range) {
      const mouse = this.input.mouse;
      return [...(this.tanks || []), ...(this.humvees || [])]
        .filter((tank) => (
          tank.alive &&
          tank.team === TEAM.BLUE &&
          tank.hp < tank.maxHp &&
          distXY(this.player.x, this.player.y, tank.x, tank.y) <= range + tank.radius
        ))
        .map((tank) => ({
          tank,
          score: distXY(mouse.worldX, mouse.worldY, tank.x, tank.y) + distXY(this.player.x, this.player.y, tank.x, tank.y) * 0.25
        }))
        .sort((a, b) => a.score - b.score)[0]?.tank || null;
    }

    findPlayerRifleTarget() {
      const mouse = this.input.mouse;
      const weapon = this.player.getWeapon();
      const scoped = this.isPlayerScoutAimMode() && weapon.id === "sniper";
      const machineGunAim = this.isPlayerMachineGunAimMode() && (weapon.id === "machinegun" || weapon.id === "lmg");
      const baseRange = scoped ? weapon.range * 1.28 : machineGunAim ? weapon.range * 1.08 : weapon.range;
      const range = this.effectivePlayerGunRange(weapon, baseRange);
      const aimTolerance = scoped ? 16 + weapon.spread * 16 : machineGunAim ? 22 + weapon.spread * 12 : 30 + weapon.spread * 28;
      const cursorTolerance = scoped ? 28 + weapon.spread * 10 : machineGunAim ? 34 + weapon.spread * 12 : 46 + weapon.spread * 18;
      const candidates = [];

      for (const unit of this.infantry || []) {
        if (!unit.alive || unit.inVehicle || unit.team === TEAM.BLUE) continue;
        candidates.push(unit);
      }

      for (const crew of this.crews || []) {
        if (!crew.alive || crew.inTank || crew.team === TEAM.BLUE) continue;
        candidates.push(crew);
      }

      for (const drone of this.drones || []) {
        if (!drone.alive || drone.team === TEAM.BLUE) continue;
        candidates.push(drone);
      }

      return candidates
        .map((target) => {
          const rangeDistance = distXY(this.player.x, this.player.y, target.x, target.y);
          const aimDistance = segmentDistanceToPoint(
            this.player.x,
            this.player.y,
            mouse.worldX,
            mouse.worldY,
            target.x,
            target.y
          );
          const cursorDistance = distXY(mouse.worldX, mouse.worldY, target.x, target.y);
          return { target, rangeDistance, aimDistance, cursorDistance };
        })
        .filter((item) => (
          item.rangeDistance <= range &&
          (item.aimDistance <= aimTolerance || item.cursorDistance <= cursorTolerance) &&
          hasLineOfSight(this, this.player, item.target, { padding: 3 })
        ))
        .sort((a, b) => (
          a.aimDistance + a.cursorDistance * 0.18 + a.rangeDistance * 0.03 -
          (b.aimDistance + b.cursorDistance * 0.18 + b.rangeDistance * 0.03)
        ))[0]?.target || null;
    }

    reconDroneObservedContacts(options = {}) {
      const drone = this.activeReconDroneForSniper();
      if (!drone) return [];

      const sniperOnly = options.sniperOnly !== false;
      const contacts = (this.getReportedContacts?.(this.player.team) || [])
        .filter((report) => report.reporter === drone)
        .map((report) => report.target)
        .filter((target) => target && (!sniperOnly || (!target.vehicleType && !target.inTank)));

      for (const target of this.reconDroneTargetCandidates(drone, { sniperOnly })) {
        if (!contacts.includes(target)) contacts.push(target);
      }

      const designation = this.droneDesignatedContact();
      if (designation?.drone === drone && (!sniperOnly || (!designation.target.vehicleType && !designation.target.inTank))) {
        if (!contacts.includes(designation.target)) contacts.push(designation.target);
      }

      return contacts;
    }

    findObservedSniperTarget() {
      const weapon = this.player?.getWeapon?.();
      if (!weapon || weapon.id !== "sniper" || !this.isPlayerScoutAimMode?.()) return null;

      const drone = this.activeReconDroneForSniper();
      if (!drone) return null;

      const observedContacts = this.reconDroneObservedContacts({ sniperOnly: true });
      const mouse = this.input.mouse;
      const designation = this.droneDesignatedContact();
      const aimTolerance = 68 + weapon.spread * 28;
      const cursorTolerance = 124 + weapon.spread * 22;

      return observedContacts
        .map((target) => {
          const designated = designation?.target === target && designation.drone === drone;
          const range = this.observedSniperRange(weapon, drone, designated);
          const rangeDistance = distXY(this.player.x, this.player.y, target.x, target.y);
          const droneDistance = distXY(drone.x, drone.y, target.x, target.y);
          const aimDistance = segmentDistanceToPoint(
            this.player.x,
            this.player.y,
            mouse.worldX,
            mouse.worldY,
            target.x,
            target.y
          );
          const cursorDistance = distXY(mouse.worldX, mouse.worldY, target.x, target.y);
          return {
            target,
            drone,
            range,
            rangeDistance,
            droneDistance,
            aimDistance,
            cursorDistance,
            designated,
            confidence: this.getReportedContact?.(this.player.team, target)?.confidence || 0
          };
        })
        .filter((item) => (
          item &&
          item.rangeDistance <= item.range &&
          item.aimDistance <= (item.designated ? aimTolerance * 1.12 : aimTolerance) &&
          item.cursorDistance <= (item.designated ? cursorTolerance * 1.18 : cursorTolerance)
        ))
        .sort((a, b) => (
          a.aimDistance + a.cursorDistance * 0.24 + a.rangeDistance * 0.018 + a.droneDistance * 0.01 - a.confidence * 10 - (a.designated ? 48 : 0) -
          (b.aimDistance + b.cursorDistance * 0.24 + b.rangeDistance * 0.018 + b.droneDistance * 0.01 - b.confidence * 10 - (b.designated ? 48 : 0))
        ))[0] || null;
    }

    toggleTank() {
      if (this.player.inTank) {
        this.dismountTank(this.player.inTank);
        return;
      }

      const vehicle = this.findMountablePlayerVehicle();
      if (vehicle) {
        if (vehicle.vehicleType === "humvee" && vehicle.crew) {
          const crew = vehicle.crew;
          crew.dismount(this);
          crew.targetTank = vehicle;
          const angle = vehicle.angle + Math.PI / 2;
          crew.x = clamp(vehicle.x + Math.cos(angle) * (vehicle.radius + crew.radius + 18), crew.radius, this.world.width - crew.radius);
          crew.y = clamp(vehicle.y + Math.sin(angle) * (vehicle.radius + crew.radius + 18), crew.radius, this.world.height - crew.radius);
          crew.angle = vehicle.angle;
        }
        this.clearPlayerProneState();
        this.player.inTank = vehicle;
        vehicle.playerControlled = true;
        vehicle.playerSeat = "driver";
        vehicle.ai?.navigation?.clearPath?.(`player:${vehicle.callSign}`);
        this.player.x = vehicle.x;
        this.player.y = vehicle.y;
      }
    }

    findMountablePlayerVehicle(maxDistance = 104) {
      if (this.player.inTank) return this.player.inTank;
      const vehicles = [...(this.tanks || []), ...(this.humvees || [])];
      return vehicles
        .filter((vehicle) => (
          vehicle.alive &&
          vehicle.team === TEAM.BLUE &&
          distXY(this.player.x, this.player.y, vehicle.x, vehicle.y) < maxDistance + Math.max(0, (vehicle.radius || 0) - 30)
        ))
        .sort((a, b) => distXY(this.player.x, this.player.y, a.x, a.y) - distXY(this.player.x, this.player.y, b.x, b.y))[0] || null;
    }

    findMountablePlayerTank(maxDistance = 104) {
      const vehicle = this.findMountablePlayerVehicle(maxDistance);
      return vehicle?.vehicleType === "humvee" ? null : vehicle;
    }

    dismountTank(tank) {
      const offsets = [
        tank.angle + Math.PI / 2,
        tank.angle - Math.PI / 2,
        tank.angle + Math.PI,
        tank.angle
      ];

      for (const angle of offsets) {
        const dismountDistance = tank.radius + this.player.radius + 22;
        const x = clamp(tank.x + Math.cos(angle) * dismountDistance, this.player.radius, this.world.width - this.player.radius);
        const y = clamp(tank.y + Math.sin(angle) * dismountDistance, this.player.radius, this.world.height - this.player.radius);
        const blocked = this.world.obstacles.some((obstacle) => circleRectCollision(x, y, this.player.radius, obstacle)) ||
          circleIntersectsTank(this, this.player, x, y, this.player.radius, { ignoreTank: tank, padding: 5 });
        if (!blocked) {
          this.player.x = x;
          this.player.y = y;
          this.player.inTank = null;
          tank.playerControlled = false;
          tank.playerSeat = "";
          return;
        }
      }

      this.player.inTank = null;
      tank.playerControlled = false;
      tank.playerSeat = "";
      this.player.x = tank.x;
      this.player.y = tank.y + tank.radius + this.player.radius + 24;
    }

    updateCamera(dt) {
      const controlledDrone = this.player.controlledDrone?.alive ? this.player.controlledDrone : null;
      const focus = this.player.inTank || controlledDrone || this.player;
      const tankAimMode = Boolean(this.player.inTank && this.input.mouse.rightDown);
      const droneControlMode = Boolean(controlledDrone);
      const scoutAimMode = Boolean(!this.player.inTank && !droneControlMode && this.isPlayerScoutAimMode());
      const rpgAimMode = Boolean(!this.player.inTank && !droneControlMode && this.isPlayerRpgAimMode());
      const machineGunAimMode = Boolean(!this.player.inTank && !droneControlMode && this.isPlayerMachineGunAimMode());
      const scoutObservation = scoutAimMode ? this.scoutObservationCameraTarget() : null;
      const scoutObservationFocus = scoutObservation ? this.scoutObservationCameraFocus(scoutObservation) : null;
      const targetZoom = tankAimMode
        ? 0.76
        : scoutAimMode
          ? scoutObservationFocus?.zoom || 0.72
          : rpgAimMode ? 0.82 : droneControlMode ? 0.82 : machineGunAimMode ? 0.88 : 1;
      this.camera.zoom = lerp(this.camera.zoom || 1, targetZoom, 1 - Math.pow(0.0002, dt));
      this.camera.viewWidth = this.camera.width / this.camera.zoom;
      this.camera.viewHeight = this.camera.height / this.camera.zoom;

      let focusX = focus.x;
      let focusY = focus.y;
      if (scoutObservationFocus) {
        focusX = scoutObservationFocus.x;
        focusY = scoutObservationFocus.y;
      }
      if (tankAimMode || scoutAimMode || rpgAimMode || droneControlMode || machineGunAimMode) {
        const mouseDistance = distXY(focus.x, focus.y, this.input.mouse.worldX, this.input.mouse.worldY);
        const lookAhead = tankAimMode
          ? clamp(mouseDistance * 0.42, 0, 520)
          : scoutAimMode
            ? scoutObservationFocus ? clamp(mouseDistance * 0.18, 0, 220) : clamp(mouseDistance * 0.52, 0, 650)
            : rpgAimMode
              ? clamp(mouseDistance * 0.38, 0, 440)
              : droneControlMode
                ? clamp(mouseDistance * 0.34, 0, 360)
                : clamp(mouseDistance * 0.44, 0, 520);
        const lookAngle = angleTo(focus.x, focus.y, this.input.mouse.worldX, this.input.mouse.worldY);
        focusX += Math.cos(lookAngle) * lookAhead;
        focusY += Math.sin(lookAngle) * lookAhead;
      }

      const targetX = clamp(focusX - this.camera.viewWidth / 2, 0, Math.max(0, this.world.width - this.camera.viewWidth));
      const targetY = clamp(focusY - this.camera.viewHeight / 2, 0, Math.max(0, this.world.height - this.camera.viewHeight));
      this.camera.x = lerp(this.camera.x, targetX, 1 - Math.pow(0.001, dt));
      this.camera.y = lerp(this.camera.y, targetY, 1 - Math.pow(0.001, dt));
      this.input.updateWorld(this.camera);
      this.applyDroneDesignationAimAssist(dt, 0.7);
    }

    updateResult(dt) {
      if (this.result) return;
      if (this.playerDeathActive) return;
      if (this.matchConfig.mode !== "annihilation") return;
      this.updateAnnihilationResult(dt);
    }

    updateAnnihilationResult(dt) {
      const blueOwned = this.hasAllObjectives(TEAM.BLUE);
      const redOwned = this.hasAllObjectives(TEAM.RED);
      this.objectiveHold[TEAM.BLUE] = blueOwned ? this.objectiveHold[TEAM.BLUE] + dt : 0;
      this.objectiveHold[TEAM.RED] = redOwned ? this.objectiveHold[TEAM.RED] + dt : 0;

      if (this.objectiveHold[TEAM.BLUE] >= this.objectiveHoldDuration) {
        this.finishGame("BLUE VICTORY", "거점 완전 장악");
        return;
      }

      if (this.objectiveHold[TEAM.RED] >= this.objectiveHoldDuration) {
        this.finishGame("MISSION LOST", "거점 전부 상실");
        return;
      }

      if (!this.hasCombatPower(TEAM.RED)) {
        this.finishGame("BLUE VICTORY", "적 전투력 소멸");
        return;
      }

      if (!this.hasCombatPower(TEAM.BLUE)) {
        this.finishGame("MISSION LOST", "아군 전투력 소멸");
      }
    }

    hasAllObjectives(team) {
      return this.capturePoints.every((point) => (
        point.owner === team && !point.contested
      ));
    }

    hasCombatPower(team) {
      const tankAlive = this.tanks.some((tank) => tank.team === team && tank.alive);
      const humveeAlive = (this.humvees || []).some((humvee) => humvee.team === team && humvee.isOperational?.());
      const infantryAlive = (this.infantry || []).some((unit) => unit.team === team && unit.alive);
      const playerAlive = team === TEAM.BLUE && !this.playerDeathActive && this.player.hp > 0;
      return tankAlive || humveeAlive || infantryAlive || playerAlive;
    }

    reportContact(team, target, reporter, ttl = 3.4) {
      if (!target || target.team === team) return;
      if (target.inVehicle) return;
      const alive = target.alive !== undefined ? target.alive : target.hp > 0;
      if (!alive) return;

      const reports = this.teamReports?.[team];
      if (!reports) return;

      const current = reports.get(target);
      const confidence = reporter?.classId === "scout" ? 1 : 0.68;
      reports.set(target, {
        target,
        x: target.x,
        y: target.y,
        ttl: Math.max(ttl, current?.ttl || 0),
        reporter,
        confidence: Math.max(confidence, current?.confidence || 0)
      });
    }

    isReportedEnemy(team, target) {
      const report = this.teamReports?.[team]?.get(target);
      if (!report || report.ttl <= 0) return false;
      const alive = target?.alive !== undefined ? target.alive : target?.hp > 0;
      return Boolean(alive && !target.inVehicle && target.team !== team);
    }

    getReportedContact(team, target) {
      const report = this.teamReports?.[team]?.get(target);
      return this.isReportedEnemy(team, target) ? report : null;
    }

    getReportedContacts(team) {
      const reports = this.teamReports?.[team];
      if (!reports) return [];
      return Array.from(reports.values())
        .filter((report) => this.isReportedEnemy(team, report.target));
    }

    updateTeamReports(dt) {
      for (const reports of Object.values(this.teamReports || {})) {
        for (const [target, report] of reports) {
          report.ttl -= dt;
          const alive = target?.alive !== undefined ? target.alive : target?.hp > 0;
          if (!alive || report.ttl <= 0) reports.delete(target);
        }
      }
    }

    finishGame(result, reason) {
      this.result = result;
      this.resultReason = reason;
    }
  }

  IronLine.Game = Game;
  IronLine.game = new Game();
})(window);
