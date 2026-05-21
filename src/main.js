"use strict";

(function bootGame(global) {
  const IronLine = global.IronLine;
  const FULLSCREEN_DISABLED_KEY = "iron-line-fullscreen-disabled-v1";
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
      });
      this.setupMobileCameraGestures?.();
      this.canvas.addEventListener("wheel", (event) => this.onPlayerCameraWheel(event), { passive: false });
      this.canvas.focus();
      this.liveWorld = IronLine.map01;
      this.testLabWorld = null;
      this.world = this.liveWorld;
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
      this.fullscreenWasActive = this.isFullscreenActive();
      this.testLab = this.requestedTestLab();
      this.adminObserverMode = this.requestedObserverMode();
      this.installFullscreenPreferenceListener();
      this.installInitialFullscreen();
      this.cameraZoomPreference = 1;
      this.input.setVirtualEnabled(this.settings.mobileControls);
      this.renderer = new IronLine.Renderer(this.canvas, this.camera);
      this.matchConfig = this.defaultMatchConfig();
      this.matchPhase = "deployment";
      this.lobbyOpen = false;
      this.spectatorMode = false;
      this.casterMode = false;
      this.adminCamera = IronLine.AdminObserverCamera ? new IronLine.AdminObserverCamera(this) : null;
      this.adminEnabled = this.requestedAdminMode() || this.adminObserverMode;
      this.localProfile = this.loadLocalProfile();
      this.entryOpen = !this.adminObserverMode && !this.testLab;
      this.onlineSession = this.createLocalSession();
      this.scoreboardStats = {};
      this.onlineCombatSeenIds = new Set();
      this.onlineWorldSyncTimer = 0;
      this.onlineWorldAppliedAt = 0;
      this.tacticalMapOpen = false;
      this.commandBus = new IronLine.CommandBus(this);
      this.aiObservatory = IronLine.AIObservatory ? new IronLine.AIObservatory(this) : null;
      this.observerBridge = IronLine.ObserverBridge ? new IronLine.ObserverBridge(this) : null;
      this.battlefieldEvents = IronLine.BattlefieldEvents ? new IronLine.BattlefieldEvents(this) : null;
      this.adminOps = IronLine.AdminOps ? new IronLine.AdminOps(this) : null;
      this.chat = !this.adminObserverMode && IronLine.ChatSystem ? new IronLine.ChatSystem(this) : null;
      this.roleChange = !this.adminObserverMode && IronLine.RoleChangeSystem ? new IronLine.RoleChangeSystem(this) : null;
      this.perfMonitor = IronLine.PerformanceMonitor ? new IronLine.PerformanceMonitor() : null;
      this.aiObservatoryTick = 0;
      this.observerSnapshot = null;
      this.conquest = this.defaultConquestState();
      this.annihilation = this.defaultAnnihilationState?.() || null;
      this.playerRoundSpectator = false;
      this.respawnTimers = new WeakMap();
      this.playerRespawnTimer = 0;
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
        navGraph: false,
        performance: false
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
      this.commandPings = [];
      this.coverSlots = new IronLine.CoverSlotManager();
      this.teamReports = {
        [TEAM.BLUE]: new Map(),
        [TEAM.RED]: new Map()
      };
      this.capturePoints = [];
      this.player = IronLine.createPlayer(this.world.spawns.player);
      this.applyLocalProfile();
      this.playerTank = null;
      this.result = "";
      this.resultReason = "";
      this.playerDeathActive = false;
      this.playerDeathReason = "";
      this.resetPlayerFeedbackState();
      this.deploymentOpen = !this.entryOpen;
      this.countdownStarted = false;
      this.matchStarted = false;
      this.startCountdown = 5;
      this.startLoading = this.defaultStartLoadingState();
      this.matchTime = 0;
      this.objectiveHoldDuration = 12;
      this.objectiveHold = {
        [TEAM.BLUE]: 0,
        [TEAM.RED]: 0
      };
      this.lastTime = performance.now();

      this.resetWorldSceneryState();
      this.setupScenario();
      this.syncOnlineSlotAssets();
      if (this.testLab) this.activateTestLab(this.testLab);
      if (this.adminObserverMode) this.enterAdminObserverMode();
      this.testLabUI = IronLine.TestLabUI ? new IronLine.TestLabUI(this) : null;
      window.addEventListener("resize", () => this.renderer.resize());
      requestAnimationFrame((now) => this.loop(now));
    }

    createCommanders() {
      this.commanders = {
        [TEAM.BLUE]: new IronLine.CommanderAI(this, TEAM.BLUE, IronLine.commandPlans[TEAM.BLUE]),
        [TEAM.RED]: new IronLine.CommanderAI(this, TEAM.RED, IronLine.commandPlans[TEAM.RED])
      };
    }

    setWorld(world) {
      if (!world || this.world === world) return;
      this.world = world;
      this.navGraph = new IronLine.NavGraph(this.world.navGraph, this.world);
    }

    useLiveWorld() {
      this.setWorld(this.liveWorld || IronLine.map01);
    }

    useTestLabWorld() {
      this.testLabWorld = IronLine.createTestLabMap?.() || IronLine.testLabMap || this.liveWorld || IronLine.map01;
      this.setWorld(this.testLabWorld);
    }

    defaultSettings() {
      const mobileLike = window.matchMedia?.("(pointer: coarse)")?.matches ||
        (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);
      return {
        mobileLike: Boolean(mobileLike),
        mobileControls: Boolean(mobileLike),
        fullscreenDisabled: this.loadFullscreenDisabled()
      };
    }

    installInitialFullscreen() {
      if (this.adminObserverMode || this.isAdminStandalonePage?.()) return;
      if (this.settings?.fullscreenDisabled) return;
      let inputAttempted = false;
      const trigger = () => {
        if (inputAttempted) return;
        inputAttempted = true;
        this.requestAppFullscreen();
      };
      for (const type of ["pointerdown", "touchstart", "mousedown", "keydown"]) {
        window.addEventListener(type, trigger, { capture: true, once: true, passive: true });
      }
    }

    installFullscreenPreferenceListener() {
      const sync = () => {
        const active = this.isFullscreenActive();
        if (!active && this.fullscreenWasActive) this.setFullscreenDisabled(true);
        this.fullscreenWasActive = active;
      };
      document.addEventListener("fullscreenchange", sync);
      document.addEventListener("webkitfullscreenchange", sync);
    }

    loadFullscreenDisabled() {
      try {
        return localStorage.getItem(FULLSCREEN_DISABLED_KEY) === "1";
      } catch (_error) {
        return false;
      }
    }

    setFullscreenDisabled(disabled) {
      const value = Boolean(disabled);
      if (this.settings) this.settings.fullscreenDisabled = value;
      try {
        if (value) localStorage.setItem(FULLSCREEN_DISABLED_KEY, "1");
        else localStorage.removeItem(FULLSCREEN_DISABLED_KEY);
      } catch (_error) {}
      return value;
    }

    isFullscreenActive() {
      return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
    }

    requestMobileFullscreen() {
      return this.requestAppFullscreen();
    }

    requestAppFullscreen(options = {}) {
      if (this.adminObserverMode || this.isAdminStandalonePage?.()) return false;
      if (this.settings?.fullscreenDisabled && !options.userInitiated) return false;
      if (options.userInitiated) this.setFullscreenDisabled(false);
      if (this.isFullscreenActive() || this.fullscreenRequestPending) return false;
      if (!options.userInitiated && navigator.userActivation && !navigator.userActivation.isActive) return false;

      const target = document.documentElement;
      const requestFullscreen = target.requestFullscreen || target.webkitRequestFullscreen;
      if (!requestFullscreen) return false;

      const lockLandscape = () => {
        if (!this.settings?.mobileLike && !this.settings?.mobileControls) return;
        const orientation = global.screen?.orientation;
        if (!orientation?.lock) return;
        orientation.lock("landscape").catch(() => {});
      };

      try {
        this.fullscreenRequestPending = true;
        const result = target.requestFullscreen
          ? target.requestFullscreen({ navigationUI: "hide" })
          : requestFullscreen.call(target);
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

    exitAppFullscreen(options = {}) {
      if (this.adminObserverMode || this.isAdminStandalonePage?.()) return false;
      if (options.persist !== false) this.setFullscreenDisabled(true);
      const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
      if (!this.isFullscreenActive() || !exitFullscreen) return false;
      try {
        const result = document.exitFullscreen ? document.exitFullscreen() : exitFullscreen.call(document);
        if (result?.catch) result.catch(() => {});
        return true;
      } catch (_error) {
        return false;
      }
    }

    toggleAppFullscreen() {
      if (this.isFullscreenActive()) return this.exitAppFullscreen({ persist: true });
      return this.requestAppFullscreen({ userInitiated: true });
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

    onPlayerCameraWheel(event) {
      if (this.adminObserverMode || this.entryOpen || this.deploymentOpen || this.lobbyOpen || this.roomListOpen || this.result) return;
      if (!this.matchStarted || this.playerDeathActive || this.playerDowned) return;
      if (event.target?.closest?.("#adminPanel, #chatPanel, #settingsPanel, .command-panel, .deployment-map")) return;
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.1 : 0.9;
      this.cameraZoomPreference = clamp((this.cameraZoomPreference || 1) * factor, 0.78, 1.45);
    }

    resetWorldSceneryState() {
      const vehicleBreakableScenery = new Set(["brush", "tree", "rubble", "sandbag", "barricade", "wood-fence", "streetlight", "billboard", "bench"]);
      for (const item of this.world?.scenery || []) {
        if (item.baseStopsProjectiles === undefined) item.baseStopsProjectiles = item.stopsProjectiles !== false;
        if (item.type === "brush" || item.type === "tree") {
          item.destructible = true;
          item.maxHp = item.maxHp || item.baseHp || item.hp || (item.type === "tree" ? 64 : 34);
          item.hp = item.maxHp;
        } else if (vehicleBreakableScenery.has(item.type || item.kind)) {
          item.destructible = true;
          item.maxHp = item.maxHp || item.baseHp || item.hp || IronLine.combat?.obstacleImpactHp?.(item.type || item.kind) || 42;
          item.hp = item.maxHp;
        }
        if (!item.destructible) {
          item.destroyed = false;
          item.damageFlash = 0;
          item.destroyTimer = 0;
          item.stopsProjectiles = item.baseStopsProjectiles;
          continue;
        }
        item.maxHp = item.maxHp || item.baseHp || item.hp || 1;
        item.baseHp = item.baseHp || item.maxHp;
        item.hp = item.maxHp;
        item.destroyed = false;
        item.damageFlash = 0;
        item.destroyTimer = 0;
        item.stopsProjectiles = item.baseStopsProjectiles;
      }

      const vehicleBreakableKinds = ["building", "base-wall", "concrete", "sandbag", "barricade", "wood-fence", "tree", "brush", "rubble"];
      for (const obstacle of this.world?.obstacles || []) {
        if (obstacle.baseStopsProjectiles === undefined) obstacle.baseStopsProjectiles = obstacle.stopsProjectiles !== false;
        const breakableByVehicle = obstacle.destructible || vehicleBreakableKinds.includes(obstacle.kind);
        if (!breakableByVehicle) {
          obstacle.destroyed = false;
          obstacle.damageFlash = 0;
          obstacle.destroyTimer = 0;
          obstacle.stopsProjectiles = obstacle.baseStopsProjectiles;
          continue;
        }
        obstacle.destructible = true;
        obstacle.type = obstacle.type || obstacle.kind;
        obstacle.shape = obstacle.shape || "rect";
        obstacle.maxHp = obstacle.maxHp || obstacle.baseHp || obstacle.hp || IronLine.combat?.obstacleImpactHp?.(obstacle.kind) || 72;
        obstacle.baseHp = obstacle.baseHp || obstacle.maxHp;
        obstacle.hp = obstacle.maxHp;
        obstacle.destroyed = false;
        obstacle.damageFlash = 0;
        obstacle.destroyTimer = 0;
        obstacle.stopsProjectiles = obstacle.baseStopsProjectiles;
      }
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
        factionId: IronLine.factionVisuals?.factionIdForTeam?.(this, TEAM.BLUE),
        angle: playerSpawn.angle,
        isPlayerTank: true,
        ammo: { ap: 14, he: 9, smoke: 1 },
        maxHp: 125,
        maxSpeed: 158,
        accel: 220,
        turnRate: 1.9,
        turretTurnRate: 1.45
      });
      this.tagRespawn(this.playerTank, "vehicle", playerSpawn);
      this.playerTank.ai = new IronLine.TankAI(this.playerTank, this);
      this.tanks.push(this.playerTank);
      this.spawnCrewForTank(this.playerTank, {
        callSign: "RAVEN-MG",
        maxSpeed: 126,
        role: "machine-gunner",
        dedicated: true,
        boardImmediately: true
      });

      for (const spawn of this.scaledSpawns(this.world.spawns.blue, config.blueAiTanks, "B-TNK", 44)) {
        const tank = new IronLine.Tank({
          x: spawn.x,
          y: spawn.y,
          team: TEAM.BLUE,
          callSign: spawn.callSign,
          factionId: IronLine.factionVisuals?.factionIdForTeam?.(this, TEAM.BLUE),
          angle: spawn.angle
        });
        this.tagRespawn(tank, "vehicle", spawn);
        tank.ai = new IronLine.TankAI(tank, this);
        this.tanks.push(tank);
        this.spawnCrewForTank(tank);
      }

      const blueInfantrySpawns = this.prepareInfantrySpawns(
        this.scaledSpawns(this.world.spawns.infantryBlue || [], config.blueInfantry, "B-INF", 18)
      );
      const blueInfantry = this.spawnInfantry(blueInfantrySpawns, TEAM.BLUE, difficulty);
      this.createSquads(TEAM.BLUE, blueInfantry, "B-SQD");

      for (const spawn of this.scaledSpawns(this.world.spawns.red, config.redTanks, "R-TNK", 44)) {
        const tank = new IronLine.Tank({
          x: spawn.x,
          y: spawn.y,
          team: TEAM.RED,
          callSign: spawn.callSign,
          factionId: IronLine.factionVisuals?.factionIdForTeam?.(this, TEAM.RED),
          angle: spawn.angle,
          maxHp: Math.round(110 * difficulty.enemyTankHp),
          maxSpeed: 145 * difficulty.enemyTankSpeed,
          turretTurnRate: 1.65 * difficulty.enemyTankAim
        });
        this.tagRespawn(tank, "vehicle", spawn);
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
      IronLine.factionVisuals?.syncGame?.(this);
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
        const point = this.findOpenSpawnNear(spawn, index, 0, 42, reserved);
        reserved.push(point);
        const humvee = new IronLine.Humvee({
          ...spawn,
          x: point.x,
          y: point.y,
          factionId: IronLine.factionVisuals?.factionIdForTeam?.(this, spawn.team)
        });
        this.tagRespawn(humvee, "vehicle", { ...spawn, x: point.x, y: point.y });
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
          factionId: spawn.factionId || IronLine.factionVisuals?.factionIdForTeam?.(this, team),
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
        this.tagRespawn(unit, "infantry", spawn);
        unit.ai = new IronLine.InfantryAI(unit, this);
        this.infantry.push(unit);
        created.push(unit);
      }
      return created;
    }

    tagRespawn(entity, kind, spawn) {
      if (!entity || !spawn) return entity;
      entity.respawn = {
        kind,
        x: Math.round(spawn.x),
        y: Math.round(spawn.y),
        angle: spawn.angle || entity.angle || 0,
        ammo: entity.ammo ? { ...entity.ammo } : null
      };
      return entity;
    }

    prepareInfantrySpawns(spawns) {
      const prepared = spawns.map((spawn) => ({ ...spawn }));
      const spawnHash = (spawn) => String(spawn.callSign || `${spawn.x}:${spawn.y}`)
        .split("")
        .reduce((sum, char) => sum + char.charCodeAt(0), 0);
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

      const desiredSupport = Math.min(
        prepared.length,
        Math.ceil(prepared.length * 0.18)
      );
      let supportCount = prepared.filter((spawn) => (
        spawn.weaponId === "machinegun" || spawn.weaponId === "lmg"
      )).length;
      for (const spawn of prepared) {
        if (supportCount >= desiredSupport) break;
        if ((spawn.classId || "infantry") !== "infantry") continue;
        if (spawn.weaponId && spawn.weaponId !== "rifle" && spawn.weaponId !== "smg") continue;
        spawn.weaponId = spawnHash(spawn) % 3 === 0 ? "lmg" : "machinegun";
        supportCount += 1;
      }

      for (const spawn of prepared) {
        if (spawn.classId !== "engineer") continue;
        const variant = spawnHash(spawn);
        const rpgAmmo = Math.max(3, Number(spawn.rpgAmmo ?? spawn.equipmentAmmo?.rpg ?? 0) || 0);
        const repairKitAmmo = Math.max(2, Number(spawn.repairKitAmmo ?? spawn.equipmentAmmo?.repairKit ?? 0) || 0);
        const grenadeLauncherAmmo = Math.max(variant % 3 === 0 ? 2 : 0, Number(spawn.grenadeLauncherAmmo ?? spawn.equipmentAmmo?.grenadeLauncher ?? 0) || 0);
        const kamikazeDroneAmmo = Math.max(variant % 2 === 0 ? 1 : 0, Number(spawn.kamikazeDroneAmmo ?? spawn.equipmentAmmo?.kamikazeDrone ?? 0) || 0);
        spawn.rpgAmmo = rpgAmmo;
        spawn.repairKitAmmo = repairKitAmmo;
        spawn.grenadeLauncherAmmo = grenadeLauncherAmmo;
        spawn.kamikazeDroneAmmo = kamikazeDroneAmmo;
        spawn.equipmentAmmo = {
          ...(spawn.equipmentAmmo || {}),
          rpg: rpgAmmo,
          repairKit: repairKitAmmo,
          grenadeLauncher: grenadeLauncherAmmo,
          kamikazeDrone: kamikazeDroneAmmo
        };
      }

      for (const spawn of prepared) {
        const classId = spawn.classId || "infantry";
        if (classId === "scout") {
          const reconDroneAmmo = 1;
          spawn.reconDroneAmmo = reconDroneAmmo;
          spawn.equipmentAmmo = {
            ...(spawn.equipmentAmmo || {}),
            reconDrone: reconDroneAmmo
          };
          continue;
        }
        if (classId !== "infantry") continue;
        const variant = spawnHash(spawn);
        const grenadeAmmo = Math.max(3, Number(spawn.grenadeAmmo ?? spawn.equipmentAmmo?.grenade ?? 0) || 0);
        const grenadeLauncherAmmo = Math.max(variant % 5 === 0 ? 2 : 0, Number(spawn.grenadeLauncherAmmo ?? spawn.equipmentAmmo?.grenadeLauncher ?? 0) || 0);
        spawn.grenadeAmmo = grenadeAmmo;
        spawn.grenadeLauncherAmmo = grenadeLauncherAmmo;
        spawn.equipmentAmmo = {
          ...(spawn.equipmentAmmo || {}),
          grenade: grenadeAmmo,
          grenadeLauncher: grenadeLauncherAmmo
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
      const reservedGap = radius >= 30 ? radius * 2.75 : radius * 2 + 8;
      const blockedByReserved = reserved.some((point) => distXY(x, y, point.x, point.y) < reservedGap);
      if (blockedByReserved) return false;
      return !circleIntersectsTank(this, null, x, y, radius, { padding: radius >= 30 ? 24 : 8 });
    }

    createSquads(team, units, prefix) {
      const size = 5;
      const created = [];
      const sorted = (units || [])
        .filter((unit) => unit?.alive !== false)
        .sort((a, b) => a.callSign.localeCompare(b.callSign));
      const scouts = sorted.filter((unit) => unit.classId === "scout");
      const engineers = sorted.filter((unit) => unit.classId === "engineer");
      const support = sorted.filter((unit) => (
        unit.classId !== "scout" &&
        unit.classId !== "engineer" &&
        (unit.weaponId === "machinegun" || unit.weaponId === "lmg")
      ));
      const line = sorted.filter((unit) => (
        unit.classId !== "scout" &&
        unit.classId !== "engineer" &&
        unit.weaponId !== "machinegun" &&
        unit.weaponId !== "lmg"
      ));

      const buckets = [];
      const addBucket = (squadType) => {
        const bucket = { squadType, units: [] };
        buckets.push(bucket);
        return bucket;
      };
      const putInBucket = (bucket, unit) => {
        if (!bucket || !unit || bucket.units.length >= size) return false;
        bucket.units.push(unit);
        return true;
      };
      const leastFilled = (type) => buckets
        .filter((bucket) => bucket.squadType === type && bucket.units.length < size)
        .sort((a, b) => a.units.length - b.units.length)[0] || addBucket(type);

      const engineerSquadCount = engineers.length ? Math.max(1, Math.ceil(engineers.length / 3)) : 0;
      for (let index = 0; index < engineerSquadCount; index += 1) addBucket("engineer");
      engineers.forEach((unit, index) => putInBucket(buckets[index % Math.max(1, engineerSquadCount)], unit));

      const combatCount = support.length + line.length;
      const infantrySquadCount = Math.max(0, Math.ceil(combatCount / size));
      for (let index = 0; index < infantrySquadCount; index += 1) addBucket("infantry");
      for (const unit of support) putInBucket(leastFilled("infantry"), unit);
      for (const unit of line) {
        const target = buckets
          .filter((bucket) => bucket.units.length < size)
          .sort((a, b) => a.units.length - b.units.length)[0] || addBucket("infantry");
        putInBucket(target, unit);
      }

      for (let i = 0; i < scouts.length; i += 3) {
        const bucket = addBucket("recon");
        bucket.units.push(...scouts.slice(i, i + 3));
      }

      let serial = 1;
      for (const bucket of buckets.filter((item) => item.units.length > 0)) {
        const squad = new IronLine.SquadAI(this, {
          team,
          callSign: `${prefix}-${serial}`,
          squadType: bucket.squadType,
          units: bucket.units
        });
        this.squads.push(squad);
        created.push(squad);
        serial += 1;
      }
      return created;
    }

    spawnCrewForTank(tank, options = {}) {
      const boardImmediately = options.boardImmediately ?? true;
      const spawn = boardImmediately ? { x: tank.x, y: tank.y } : this.findCrewSpawn(tank);
      const crew = new IronLine.CrewMember({
        x: spawn.x,
        y: spawn.y,
        team: tank.team,
        callSign: options.callSign || `${tank.callSign}-CREW`,
        factionId: options.factionId || tank.factionId || IronLine.factionVisuals?.factionIdForTeam?.(this, tank.team),
        angle: tank.angle,
        maxSpeed: options.maxSpeed,
        role: options.role,
        dedicated: options.dedicated,
        targetTank: tank
      });
      this.crews.push(crew);
      if (boardImmediately) crew.boardTargetTank();
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
      const rawDt = (now - this.lastTime) / 1000;
      const dt = Number.isFinite(rawDt) ? Math.min(0.033, Math.max(0, rawDt)) : 0;
      this.lastTime = now;
      this.perfMonitor?.beginFrame(dt);
      try {
        this.perfMonitor?.begin("update");
        this.update(dt);
        this.perfMonitor?.end("update");
        this.perfMonitor?.begin("render");
        this.renderer.draw(this);
        this.perfMonitor?.end("render");
        this.perfMonitor?.finishFrame(this);
        this.input.endFrame();
      } catch (error) {
        this.handleLoopError(error);
      }
      requestAnimationFrame((next) => this.loop(next));
    }

    handleLoopError(error) {
      const now = performance.now();
      if (!this.lastLoopErrorAt || now - this.lastLoopErrorAt > 1500) {
        console.error("Iron Line frame error", error);
        this.lastLoopErrorAt = now;
      }
      this.input.clear();
    }

    update(dt) {
      this.input.updateWorld(this.camera);
      this.updateDebugToggles();
      this.updateTestLabHotkeys();
      this.testLabUI?.update?.(this, dt);
      this.updateCommandRadioHotkey();
      this.updateTacticalMapHotkey();
      this.updateAdminMessage(dt);
      this.updateCombatFeedback(dt);
      this.observerBridge?.update(dt);
      this.chat?.update?.(dt);
      this.roleChange?.update?.(dt);
      this.battlefieldEvents?.update?.(dt);
      this.updateOnlineCombatEvents(dt);
      this.updateOnlineWorldSync(dt);

      if (this.adminObserverMode) {
        this.updateBattlefield(dt);
        this.updateCamera(dt);
        this.hud.update(this);
        return;
      }

      if (this.entryOpen || this.deploymentOpen || this.lobbyOpen) {
        this.updatePlayerSafeZone();
        this.updateCamera(dt);
        this.hud.update(this);
        return;
      }

      if (this.result) {
        IronLine.combat.updateEffects(this, dt);
        this.updateCamera(dt);
        this.hud.update(this);
        return;
      }

      if (this.playerDowned && !this.playerDeathActive) {
        const battleContinues = this.battleContinuesAfterPlayerDeath?.() || (this.isConquestMode() && this.matchStarted);
        if (battleContinues) this.updateBattlefield(dt);
        else IronLine.combat.updateEffects(this, dt);
        this.updateCamera(dt);
        this.hud.update(this);
        return;
      }

      if (this.playerDeathActive) {
        if (!this.isRoundSpectatorMode?.()) this.updateDeathRestartInput();
        const battleContinues = this.battleContinuesAfterPlayerDeath?.() || (this.isConquestMode() && this.matchStarted);
        if (battleContinues) this.updateBattlefield(dt);
        else IronLine.combat.updateEffects(this, dt);
        this.updateCamera(dt);
        this.hud.update(this);
        return;
      }

      this.updatePlayer(dt);
      this.updatePlayerDeathState();
      if (this.playerDowned && !this.playerDeathActive) {
        const battleContinues = this.battleContinuesAfterPlayerDeath?.() || (this.isConquestMode() && this.matchStarted);
        if (battleContinues) this.updateBattlefield(dt);
        else IronLine.combat.updateEffects(this, dt);
        this.updateCamera(dt);
        this.hud.update(this);
        return;
      }
      if (this.playerDeathActive) {
        const battleContinues = this.battleContinuesAfterPlayerDeath?.() || (this.isConquestMode() && this.matchStarted);
        if (battleContinues) this.updateBattlefield(dt);
        else IronLine.combat.updateEffects(this, dt);
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

      this.updateBattlefield(dt);
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

      this.updateCamera(dt);
      this.hud.update(this);
    }

    updateBattlefield(dt) {
      if (!this.matchStarted || this.result) return;
      const perf = this.perfMonitor;
      perf?.begin("battlefield");
      if (this.updateAnnihilationIntermission?.(dt)) {
        perf?.begin("combat.effects");
        IronLine.combat.updateEffects(this, dt);
        perf?.end("combat.effects");
        this.updateAiObservatoryBudgeted(dt);
        perf?.end("battlefield");
        return;
      }

      this.matchTime += dt;
      this.updateDroneDesignation(dt);
      this.updateConquestRespawns(dt);
      perf?.begin("crews");
      for (const crew of this.crews) crew.update(this, dt);
      perf?.end("crews");
      if (!this.testLabAiPaused) {
        perf?.begin("ai.commanders");
        for (const commander of Object.values(this.commanders)) commander.update(dt);
        perf?.end("ai.commanders");
      }
      this.refreshFollowPlayerOrders();
      this.coverSlots.update(dt);
      if (!this.testLabAiPaused) {
        perf?.begin("ai.squads");
        for (const squad of this.squads) squad.update(dt);
        perf?.end("ai.squads");
      }

      perf?.begin("drones");
      this.updateDrones(dt);
      perf?.end("drones");
      perf?.begin("ai.infantry");
      for (const unit of this.infantry) unit.update(this, dt);
      perf?.end("ai.infantry");
      perf?.begin("reports");
      this.updateTeamReports(dt);
      perf?.end("reports");

      perf?.begin("vehicles");
      for (const tank of this.tanks) tank.update(this, dt);
      for (const humvee of this.humvees || []) humvee.update(this, dt);
      perf?.end("vehicles");

      perf?.begin("combat.projectiles");
      IronLine.combat.updateProjectiles(this, dt);
      perf?.end("combat.projectiles");
      perf?.begin("combat.effects");
      IronLine.combat.updateEffects(this, dt);
      perf?.end("combat.effects");

      perf?.begin("objectives");
      for (const point of this.capturePoints) point.update(this, dt);
      this.updateConquestScoring(dt);
      perf?.end("objectives");

      perf?.begin("spacing");
      resolveTankSpacing(this, dt);
      resolveInfantryTankSpacing(this);
      perf?.end("spacing");
      perf?.begin("result");
      this.updateResult(dt);
      perf?.end("result");
      this.updateAiObservatoryBudgeted(dt);
      perf?.end("battlefield");
    }

    updateAiObservatoryBudgeted(dt) {
      if (!this.aiObservatory?.update) return;
      this.aiObservatoryTick = (this.aiObservatoryTick || 0) + dt;
      const interval = this.adminObserverMode ? 0.16 : 0.24;
      if (this.aiObservatoryTick < interval) return;
      const elapsed = this.aiObservatoryTick;
      this.aiObservatoryTick = 0;
      this.perfMonitor?.begin("ai.observer");
      this.aiObservatory.update(elapsed);
      this.perfMonitor?.end("ai.observer");
    }

    refreshFollowPlayerOrders() {
      const player = this.player;
      if (!player || player.hp <= 0) return;
      const updatePoint = (order) => {
        if (!order?.followPlayer || !order.point) return;
        order.point.x = player.x;
        order.point.y = player.y;
        order.point.name = "플레이어";
      };
      for (const squad of this.squads || []) updatePoint(squad.order);
      for (const vehicle of [...(this.tanks || []), ...(this.humvees || [])]) {
        const order = this.commanders?.[vehicle.team]?.assignments?.get(vehicle);
        updatePoint(order);
      }
    }

    updateConquestScoring(dt) {
      const objectiveScoringMode = this.isConquestMode() || this.isAnnihilationMode?.();
      if (!objectiveScoringMode || !this.matchStarted || this.result) return;
      if (this.isConquestMode()) this.conquest.remaining = Math.max(0, this.conquest.duration - this.matchTime);
      for (const point of this.capturePoints) {
        if (point.owner !== TEAM.BLUE && point.owner !== TEAM.RED) continue;
        if (point.contested) continue;
        this.conquest.score[point.owner] += this.conquest.scoreRate * dt;
      }
      if (this.isAnnihilationMode?.()) this.syncAnnihilationObjectiveScore?.();
    }

    updateConquestRespawns(dt) {
      if (!this.isConquestMode() || !this.matchStarted || this.result) return;

      if (this.playerDeathActive || this.playerDowned) {
        this.playerRespawnTimer = Math.max(0, (this.playerRespawnTimer || this.conquest.respawnDelay.player) - dt);
        if (this.playerRespawnTimer <= 0 && this.playerDeathActive) this.respawnPlayerForConquest();
      }

      for (const unit of this.infantry) {
        if (unit.alive) {
          this.respawnTimers.delete(unit);
          continue;
        }
        this.tickRespawn(unit, dt, this.conquest.respawnDelay.infantry, () => this.respawnInfantryUnit(unit));
      }

      for (const vehicle of [...this.tanks, ...(this.humvees || [])]) {
        if (vehicle.isPlayerTank) continue;
        if (vehicle.alive || vehicle.destructionPending) {
          if (vehicle.alive) this.respawnTimers.delete(vehicle);
          continue;
        }
        this.tickRespawn(vehicle, dt, this.conquest.respawnDelay.vehicle, () => this.respawnVehicle(vehicle));
      }
    }

    tickRespawn(entity, dt, delay, respawn) {
      const current = this.respawnTimers.has(entity) ? this.respawnTimers.get(entity) : delay;
      const next = Math.max(0, current - dt);
      if (next > 0) {
        this.respawnTimers.set(entity, next);
        return false;
      }
      this.respawnTimers.delete(entity);
      respawn();
      return true;
    }

    respawnInfantryUnit(unit) {
      const spawn = unit.respawn || this.respawnPointForTeam(unit.team);
      const point = this.findOpenSpawnNear(spawn, 0, 0, unit.radius || 10);
      unit.x = point.x;
      unit.y = point.y;
      unit.angle = spawn.angle || unit.angle || 0;
      unit.hp = unit.maxHp;
      unit.alive = true;
      unit.deathTime = 0;
      unit.deathPoseAngle = 0;
      unit.speed = 0;
      unit.suppression = 0;
      unit.suppressed = false;
      unit.suppressionTimer = 0;
      unit.lastThreat = null;
      unit.inVehicle = null;
      unit.transportVehicle = null;
      unit.transportCooldown = 1.2;
      IronLine.factionVisuals?.syncEntity?.(this, unit);
      unit.ai = new IronLine.InfantryAI(unit, this);
    }

    respawnVehicle(vehicle) {
      const spawn = vehicle.respawn || this.respawnPointForTeam(vehicle.team);
      const vehicleClearanceRadius = Math.max(vehicle.radius || 34, vehicle.vehicleType === "humvee" ? 42 : 44);
      const point = this.findOpenSpawnNear(spawn, 0, 0, vehicleClearanceRadius);
      vehicle.x = point.x;
      vehicle.y = point.y;
      vehicle.angle = spawn.angle || vehicle.angle || 0;
      vehicle.turretAngle = vehicle.angle;
      vehicle.machineGunAngle = vehicle.angle;
      vehicle.hp = vehicle.maxHp;
      vehicle.alive = true;
      vehicle.speed = 0;
      vehicle.turnVelocity = 0;
      vehicle.wreckTimer = 0;
      vehicle.coverDestroyed = false;
      vehicle.coverHp = undefined;
      vehicle.coverMaxHp = undefined;
      vehicle.coverCollapsePulse = 0;
      vehicle.destructionPending = false;
      vehicle.destructionTimer = 0;
      vehicle.loadedAmmo = null;
      vehicle.reload = vehicle.reload || { active: false, ammoId: null, progress: 0, duration: 1 };
      vehicle.reload.active = false;
      vehicle.reload.ammoId = null;
      vehicle.reload.progress = 0;
      vehicle.weaponMode = vehicle.vehicleType === "humvee" ? "mg" : "cannon";
      if (spawn.ammo) vehicle.ammo = { ...spawn.ammo };
      if (Array.isArray(vehicle.passengers)) {
        for (const passenger of vehicle.passengers) {
          if (passenger?.inVehicle === vehicle) passenger.inVehicle = null;
        }
        vehicle.passengers = [];
      }
      if (vehicle.vehicleType === "humvee") vehicle.ai = new IronLine.HumveeAI(vehicle, this);
      else vehicle.ai = new IronLine.TankAI(vehicle, this);
      IronLine.factionVisuals?.syncEntity?.(this, vehicle);
      this.respawnCrewForVehicle(vehicle);
    }

    respawnCrewForVehicle(vehicle) {
      let crew = this.crews.find((item) => item.targetTank === vehicle || item.callSign === `${vehicle.callSign}-DRV` || item.callSign === `${vehicle.callSign}-CREW`);
      if (!crew) {
        this.spawnCrewForTank(vehicle, {
          callSign: vehicle.vehicleType === "humvee" ? `${vehicle.callSign}-DRV` : `${vehicle.callSign}-CREW`,
          role: vehicle.isPlayerTank ? "machine-gunner" : vehicle.vehicleType === "humvee" ? "driver" : "crew",
          dedicated: Boolean(vehicle.isPlayerTank),
          boardImmediately: true
        });
        return;
      }

      const spawn = { x: vehicle.x, y: vehicle.y };
      if (crew.inTank) crew.inTank.leaveCrew?.(crew);
      vehicle.crew = null;
      crew.x = spawn.x;
      crew.y = spawn.y;
      crew.angle = vehicle.angle;
      crew.hp = crew.maxHp;
      crew.alive = true;
      crew.deathTime = 0;
      crew.deathPoseAngle = 0;
      crew.speed = 0;
      crew.targetTank = vehicle;
      crew.inTank = null;
      crew.state = "mounting";
      crew.mountTimer = 0;
      if (vehicle.isPlayerTank) {
        crew.role = "machine-gunner";
        crew.dedicated = true;
      }
      crew.boardTargetTank();
      IronLine.factionVisuals?.syncEntity?.(this, crew);
    }

    respawnPlayerForConquest(immediate = false) {
      if (!this.isConquestMode()) return false;
      const spawn = this.world.spawns.player || this.respawnPointForTeam(TEAM.BLUE);
      const point = this.findOpenSpawnNear(spawn, 0, 0, this.player.radius || 10);
      if (this.player.inTank) {
        this.player.inTank.playerControlled = false;
        this.player.inTank = null;
      }
      this.exitPlayerDroneControl();
      this.player.x = point.x;
      this.player.y = point.y;
      this.player.angle = spawn.angle || this.player.angle || 0;
      this.player.hp = this.player.maxHp;
      this.player.alive = true;
      this.player.deathTime = 0;
      this.player.deathPoseAngle = 0;
      this.player.speed = 0;
      this.playerRespawnTimer = 0;
      this.playerDeathActive = false;
      this.playerDeathReason = "";
      this.resetPlayerFeedbackState();
      this.player.setClass?.(this.player.classId || "infantry");
      IronLine.factionVisuals?.syncEntity?.(this, this.player);
      this.applyPlayerLoadoutOverrides();
      if (immediate) this.input.clear();
      return true;
    }

    respawnPointForTeam(team) {
      const exits = this.world.baseExitPoints || {};
      if (team === TEAM.RED) return exits.red || this.world.spawns.red?.[0] || { x: this.world.width - 420, y: 420, angle: Math.PI };
      return exits.blue || this.world.spawns.player || { x: 420, y: this.world.height - 420, angle: 0 };
    }

    updateStartCountdown(dt) {
      if (this.matchStarted || this.deploymentOpen || this.lobbyOpen || !this.countdownStarted) return;
      if (this.matchPhase === "loading") {
        const loading = this.startLoading || this.defaultStartLoadingState();
        loading.active = true;
        loading.remaining = Math.max(0, (loading.remaining || loading.duration || 0) - dt);
        const progress = 1 - loading.remaining / Math.max(0.1, loading.duration || 1);
        loading.stepIndex = Math.min(
          (loading.steps || []).length - 1,
          Math.max(0, Math.floor(progress * Math.max(1, (loading.steps || []).length)))
        );
        this.startLoading = loading;
        if (loading.remaining > 0) return;
        loading.active = false;
        this.matchPhase = "countdown";
      }
      this.startCountdown = Math.max(0, this.startCountdown - dt);
      if (this.startCountdown <= 0) {
        this.matchStarted = true;
        this.matchPhase = "live";
        if (this.startLoading) this.startLoading.active = false;
      }
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
      if ((!this.deploymentOpen && !this.lobbyOpen) || this.countdownStarted || this.matchStarted) return false;
      if (!["annihilation", "conquest"].includes(mode)) return false;
      this.matchConfig.mode = mode;
      this.conquest = this.defaultConquestState();
      if (mode === "annihilation") this.resetAnnihilationState?.();
      this.hud?.invalidateDeploymentMap?.();
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
        blueAiTanks: { min: 0, max: 8 },
        blueInfantry: { min: 4, max: 56 },
        redTanks: { min: 1, max: 10 },
        redInfantry: { min: 4, max: 64 }
      };
    }

    enterLobby() {
      if (this.matchStarted || this.countdownStarted) return false;
      this.resetScenarioForMatch();
      this.deploymentOpen = false;
      this.lobbyOpen = true;
      this.matchPhase = "lobby";
      this.onlineSession.localReady = false;
      for (const player of this.onlineSession.players || []) player.ready = false;
      this.result = "";
      this.resultReason = "";
      this.hud?.toggleSettingsPanel?.(false);
      this.hud?.invalidateDeploymentMap?.();
      this.hud?.update?.(this);
      this.canvas.focus();
      return true;
    }

    returnToDeployment() {
      if (this.matchStarted || this.countdownStarted) return false;
      this.lobbyOpen = false;
      this.deploymentOpen = !this.entryOpen;
      this.matchPhase = "deployment";
      this.result = "";
      this.resultReason = "";
      this.startLoading = this.defaultStartLoadingState();
      this.hud?.invalidateDeploymentMap?.();
      this.hud?.update?.(this);
      this.canvas.focus();
      return true;
    }

    toggleLocalReady() {
      if (!this.lobbyOpen || this.matchStarted || this.countdownStarted) return false;
      this.onlineSession.localReady = !this.onlineSession.localReady;
      const player = this.localSessionPlayer();
      if (player) player.ready = this.onlineSession.localReady;
      this.hud?.sessionFlow?.publishLocalPlayer?.(this, { force: true });
      this.hud?.update?.(this);
      return true;
    }

    toggleLocalTeam() {
      if (!this.lobbyOpen || this.matchStarted || this.countdownStarted) return false;
      const player = this.localSessionPlayer();
      if (!player) return false;
      const currentSlot = this.sessionSlotById(player.slotId);
      const nextSide = player.team === TEAM.BLUE ? "red" : "blue";
      const roleId = currentSlot?.roleId || player.roleId || "infantry";
      return this.assignPlayerToSlot(player.id, `${nextSide}-${roleId}`);
    }

    submitLocalCommand(type, options = {}) {
      const player = this.localSessionPlayer();
      if (!player) return { accepted: false, reason: "missing-player" };
      const slot = this.sessionSlotById(options.slotId || player.slotId);
      if (!slot) return { accepted: false, reason: "missing-slot" };
      return this.commandBus.submit({
        ...options,
        type,
        issuerPlayerId: player.id,
        team: slot.team || player.team,
        slotId: slot.id,
        slotRole: slot.role,
        authority: slot.playerId === player.id ? "owned_squad" : "delegated_squad"
      });
    }

    beginDeploymentCountdown() {
      if (this.matchStarted) return false;
      if (this.deploymentOpen) return this.enterLobby();
      if (!this.lobbyOpen) return false;
      this.resetScenarioForMatch();
      this.deploymentOpen = false;
      this.lobbyOpen = false;
      this.matchPhase = "loading";
      this.countdownStarted = true;
      this.startCountdown = 4;
      this.startLoading = this.defaultStartLoadingState();
      this.startLoading.active = true;
      this.startLoading.remaining = this.startLoading.duration;
      this.startLoading.stepIndex = 0;
      this.canvas.focus();
      return true;
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

    scoreboardPlayerIdFor(entity) {
      if (!entity) return "";
      if (entity === this.player) return this.onlineSession?.playerId || "local-player";
      return entity.playerId || entity.ownerPlayerId || "";
    }

    ensureScoreboardStats(playerId = this.onlineSession?.playerId || "local-player") {
      if (!playerId) return { kills: 0, deaths: 0 };
      this.scoreboardStats = this.scoreboardStats || {};
      const sessionPlayer = this.sessionPlayerById?.(playerId);
      const existing = this.scoreboardStats[playerId] || sessionPlayer?.stats || {};
      const stats = {
        kills: Math.max(0, Math.floor(Number(existing.kills) || 0)),
        deaths: Math.max(0, Math.floor(Number(existing.deaths) || 0))
      };
      this.scoreboardStats[playerId] = stats;
      if (sessionPlayer) sessionPlayer.stats = { ...stats };
      return stats;
    }

    syncScoreboardStatsToSession(playerId = this.onlineSession?.playerId || "local-player", options = {}) {
      if (!playerId) return;
      const stats = this.ensureScoreboardStats(playerId);
      const sessionPlayer = this.sessionPlayerById?.(playerId);
      if (sessionPlayer) sessionPlayer.stats = { ...stats };
      if (options.publish !== false && this.sessionMode === "online" && this.onlineSession?.roomId && sessionPlayer) {
        IronLine.roomRegistry?.addOrUpdatePlayer?.(this.onlineSession.roomId, sessionPlayer);
      }
    }

    onlineCombatRoom() {
      if (this.sessionMode !== "online" || !this.onlineSession?.roomId) return null;
      return IronLine.roomRegistry?.getRoom?.(this.onlineSession.roomId) || null;
    }

    onlineCombatActiveForLocalPlayer() {
      if (this.sessionMode !== "online" || !this.onlineSession?.roomId || !this.matchStarted) return false;
      if (this.isLocalSpectator?.()) return false;
      if (!this.player || this.playerDeathActive || this.playerDowned || this.player.hp <= 0) return false;
      return !this.lobbyOpen && !this.deploymentOpen;
    }

    updateOnlineCombatEvents(_dt) {
      const room = this.onlineCombatRoom();
      if (!room) return;
      const events = IronLine.roomRegistry?.recentCombatEvents?.(room.id, 90) || room.combatEvents || [];
      const localId = this.onlineSession?.playerId || "";
      const now = Date.now();
      this.onlineCombatSeenIds = this.onlineCombatSeenIds || new Set();

      for (const event of events) {
        if (!event?.id || this.onlineCombatSeenIds.has(event.id)) continue;
        this.onlineCombatSeenIds.add(event.id);
        const createdAt = this.onlineCombatEventTime(event);
        if (createdAt && now - createdAt > 6500) continue;
        if (event.shooterId === localId) continue;
        this.applyOnlineCombatEvent(event);
      }

      if (this.onlineCombatSeenIds.size > 420) {
        const staleCount = this.onlineCombatSeenIds.size - 320;
        let index = 0;
        for (const id of this.onlineCombatSeenIds) {
          this.onlineCombatSeenIds.delete(id);
          index += 1;
          if (index >= staleCount) break;
        }
      }
    }

    onlineCombatEventTime(event = {}) {
      const numeric = Number(event.createdAt);
      if (Number.isFinite(numeric) && numeric > 0) return numeric;
      const parsed = Date.parse(event.createdAt || "");
      return Number.isFinite(parsed) ? parsed : 0;
    }

    applyOnlineCombatEvent(event = {}) {
      if (event.type === "projectile_launch") {
        this.emitOnlineProjectileLaunch(event);
        return true;
      }
      if (event.type === "projectile_impact") {
        this.emitOnlineProjectileImpact(event);
        return this.applyOnlineProjectileImpactDamage(event);
      }

      this.emitOnlineCombatTracer(event);
      const localId = this.onlineSession?.playerId || "";
      if (!this.onlineCombatActiveForLocalPlayer()) return false;
      if (!event.hit || event.targetPlayerId !== localId) return false;
      if (this.isPlayerInSafeZone?.()) return false;

      const source = {
        x: Number(event.x1) || Number(event.hitX) || this.player.x,
        y: Number(event.y1) || Number(event.hitY) || this.player.y,
        team: event.shooterTeam === TEAM.RED ? TEAM.RED : TEAM.BLUE,
        ownerPlayerId: event.shooterId || ""
      };
      return this.applyPlayerDamage(event.damage, source, event.weaponId || "rifle", {
        label: "\uc628\ub77c\uc778 \ud53c\uaca9",
        deathReason: `${event.shooterName || "Player"}\uc758 \uacf5\uaca9\uc73c\ub85c \uc804\ud22c \ubd88\ub2a5 \uc0c1\ud0dc\uac00 \ub418\uc5c8\uc2b5\ub2c8\ub2e4.`,
        x: source.x,
        y: source.y
      });
    }

    emitOnlineCombatTracer(event = {}) {
      const x1 = Number(event.x1);
      const y1 = Number(event.y1);
      const x2 = Number(event.x2 ?? event.hitX);
      const y2 = Number(event.y2 ?? event.hitY);
      if (![x1, y1, x2, y2].every(Number.isFinite)) return false;
      const tracers = this.effects.tracers || (this.effects.tracers = []);
      if (tracers.length > 180) tracers.shift();
      const blue = event.shooterTeam !== TEAM.RED;
      tracers.push({
        x1,
        y1,
        x2,
        y2,
        life: Number(event.ttl) || 0.12,
        maxLife: Number(event.ttl) || 0.12,
        color: blue ? "rgba(129, 230, 161, 0.9)" : "rgba(255, 150, 133, 0.9)",
        width: event.weaponId === "sniper" ? 3.4 : 2.6,
        length: event.weaponId === "sniper" ? 26 : 18
      });
      return true;
    }

    publishOnlineGunShot(weapon, targetX, targetY, options = {}) {
      if (!this.onlineCombatActiveForLocalPlayer()) return null;
      const roomId = this.onlineSession?.roomId || "";
      const localPlayer = this.localSessionPlayer?.();
      if (!roomId || !localPlayer) return null;

      const line = this.onlineGunShotLine(weapon, targetX, targetY, options);
      if (!line) return null;
      const hitTarget = this.findOnlineGunHitTarget(weapon, line, options);
      const hitChance = hitTarget ? this.onlineGunHitChance(weapon, hitTarget.distance, line.range, options) : 0;
      const hit = Boolean(hitTarget && Math.random() < hitChance);
      const damage = hit ? this.onlineGunDamage(weapon, hitTarget.distance, line.range) : 0;
      const endX = hit ? hitTarget.point.x : line.x2;
      const endY = hit ? hitTarget.point.y : line.y2;

      const event = IronLine.roomRegistry?.pushCombatEvent?.(roomId, {
        type: "small_arms",
        shooterId: this.onlineSession.playerId,
        shooterName: localPlayer.name || localPlayer.nickname || "Player",
        shooterTeam: localPlayer.team || this.player.team || TEAM.BLUE,
        targetPlayerId: hit ? hitTarget.player.id : "",
        weaponId: weapon?.id || "rifle",
        damage,
        hit,
        x1: line.x1,
        y1: line.y1,
        x2: endX,
        y2: endY,
        hitX: endX,
        hitY: endY,
        angle: line.angle,
        ttl: weapon?.tracerLife || 0.1
      });
      if (event?.id) this.onlineCombatSeenIds?.add?.(event.id);
      return event;
    }

    isOnlineLocalShooter(shooter = null) {
      if (!this.onlineCombatActiveForLocalPlayer()) return false;
      if (shooter === this.player) return true;
      const mounted = this.player?.inTank || null;
      return Boolean(mounted && shooter === mounted && mounted.playerControlled);
    }

    onlineShooterInfo(shooter = null) {
      const localPlayer = this.localSessionPlayer?.() || {};
      const mounted = this.player?.inTank || null;
      const vehicle = shooter?.vehicleType ? shooter : mounted;
      return {
        id: this.onlineSession?.playerId || "",
        name: localPlayer.name || localPlayer.nickname || "Player",
        team: localPlayer.team || shooter?.team || this.player?.team || TEAM.BLUE,
        vehicleId: vehicle?.callSign || vehicle?.id || "",
        vehicleType: vehicle?.vehicleType || ""
      };
    }

    publishOnlineProjectileLaunch(projectile = null, options = {}) {
      const shooter = options.shooter || projectile?.owner || null;
      if (!projectile || !this.isOnlineLocalShooter(shooter)) return null;
      const roomId = this.onlineSession?.roomId || "";
      if (!roomId) return null;
      const ammo = projectile.ammo || {};
      const shooterInfo = this.onlineShooterInfo(shooter);
      const projectileId = `${roomId}:proj:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
      projectile.onlineCombatId = projectileId;
      projectile.onlineShooterId = shooterInfo.id;
      const speed = Math.hypot(projectile.vx || 0, projectile.vy || 0);
      const event = IronLine.roomRegistry?.pushCombatEvent?.(roomId, {
        id: `${projectileId}:launch`,
        type: "projectile_launch",
        projectileId,
        shooterId: shooterInfo.id,
        shooterName: shooterInfo.name,
        shooterTeam: shooterInfo.team,
        targetVehicleId: shooterInfo.vehicleId,
        weaponId: options.weaponId || ammo.sourceWeaponId || ammo.id || "projectile",
        damage: ammo.directDamage || ammo.damage || 0,
        radius: ammo.splash || ammo.directExplosionRadius || 0,
        x1: projectile.x,
        y1: projectile.y,
        x2: Number.isFinite(options.aimX) ? options.aimX : projectile.x + Math.cos(Math.atan2(projectile.vy || 0, projectile.vx || 1)) * Math.min(speed * Math.max(projectile.life || 0.35, 0.25), ammo.range || 1200),
        y2: Number.isFinite(options.aimY) ? options.aimY : projectile.y + Math.sin(Math.atan2(projectile.vy || 0, projectile.vx || 1)) * Math.min(speed * Math.max(projectile.life || 0.35, 0.25), ammo.range || 1200),
        vx: projectile.vx || 0,
        vy: projectile.vy || 0,
        speed,
        angle: Math.atan2(projectile.vy || 0, projectile.vx || 1),
        ttl: ammo.id === "rpg" ? 0.16 : 0.12,
        smoke: ammo.id === "smoke"
      });
      if (event?.id) this.onlineCombatSeenIds?.add?.(event.id);
      return event;
    }

    publishOnlineProjectileImpact(shell = null, options = {}) {
      if (!shell?.onlineCombatId || shell.onlineShooterId !== this.onlineSession?.playerId) return null;
      const roomId = this.onlineSession?.roomId || "";
      if (!roomId) return null;
      const ammo = shell.ammo || {};
      const shooterInfo = this.onlineShooterInfo(shell.owner || null);
      const hitTank = options.hitTank || null;
      const event = IronLine.roomRegistry?.pushCombatEvent?.(roomId, {
        id: `${shell.onlineCombatId}:impact`,
        type: "projectile_impact",
        projectileId: shell.onlineCombatId,
        shooterId: shooterInfo.id,
        shooterName: shooterInfo.name,
        shooterTeam: shooterInfo.team || shell.team,
        targetVehicleId: hitTank?.callSign || hitTank?.id || "",
        weaponId: ammo.sourceWeaponId || ammo.id || "projectile",
        damage: ammo.directDamage || ammo.damage || 0,
        radius: ammo.splash || ammo.directExplosionRadius || (ammo.id === "ap" ? 52 : 0),
        splash: ammo.splash || 0,
        x1: shell.previousX ?? shell.x,
        y1: shell.previousY ?? shell.y,
        x2: shell.x,
        y2: shell.y,
        hitX: shell.x,
        hitY: shell.y,
        vx: shell.vx || 0,
        vy: shell.vy || 0,
        angle: Math.atan2(shell.vy || 0, shell.vx || 1),
        smoke: ammo.id === "smoke"
      });
      if (event?.id) this.onlineCombatSeenIds?.add?.(event.id);
      return event;
    }

    emitOnlineProjectileLaunch(event = {}) {
      const x1 = Number(event.x1);
      const y1 = Number(event.y1);
      const vx = Number(event.vx);
      const vy = Number(event.vy);
      if (![x1, y1, vx, vy].every(Number.isFinite)) return false;
      const speed = Math.max(1, Math.hypot(vx, vy));
      const duration = event.weaponId === "rpg" ? 0.22 : 0.14;
      const x2 = x1 + vx / speed * Math.min(speed * duration, event.weaponId === "rpg" ? 260 : 360);
      const y2 = y1 + vy / speed * Math.min(speed * duration, event.weaponId === "rpg" ? 260 : 360);
      const tracers = this.effects.tracers || (this.effects.tracers = []);
      if (tracers.length > 180) tracers.shift();
      tracers.push({
        x1,
        y1,
        x2,
        y2,
        life: event.weaponId === "rpg" ? 0.18 : 0.12,
        maxLife: event.weaponId === "rpg" ? 0.18 : 0.12,
        color: event.weaponId === "rpg" ? "rgba(255, 199, 120, 0.78)" : "rgba(255, 236, 172, 0.82)",
        width: event.weaponId === "rpg" ? 3.2 : 3.8,
        length: event.weaponId === "rpg" ? 26 : 34
      });
      return true;
    }

    emitOnlineProjectileImpact(event = {}) {
      const x = Number(event.hitX ?? event.x2);
      const y = Number(event.hitY ?? event.y2);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      if (event.smoke) {
        this.effects.smokeClouds.push({
          x,
          y,
          radius: 42,
          maxRadius: 142,
          life: 8.5,
          maxLife: 8.5
        });
      }
      const radius = Math.max(28, Number(event.radius || event.splash || 72));
      const blastRings = this.effects.blastRings || (this.effects.blastRings = []);
      blastRings.push({
        x,
        y,
        radius: 8,
        maxRadius: Math.min(radius * 0.72, 180),
        life: 0.18,
        maxLife: 0.18,
        color: event.smoke ? "rgba(220, 226, 230, 0.62)" : "rgba(255, 238, 178, 0.72)",
        width: event.weaponId === "grenade" || event.weaponId === "grenadeLauncher" ? 2.8 : 5
      });
      this.effects.explosions.push({
        x,
        y,
        radius: event.weaponId === "grenade" ? 7 : 18,
        maxRadius: event.smoke ? 70 : Math.min(radius * 0.58, 150),
        life: event.smoke ? 0.58 : 0.42,
        maxLife: event.smoke ? 0.58 : 0.42,
        color: event.smoke ? "rgba(220, 226, 230, 0.7)" : "rgba(255, 145, 58, 0.86)",
        core: true,
        smoke: false
      });
      this.effects.scorchMarks.push({
        x,
        y,
        radius: Math.min(radius * 0.36, 58),
        alpha: event.smoke ? 0.06 : 0.2
      });
      return true;
    }

    applyOnlineProjectileImpactDamage(event = {}) {
      if (!this.onlineCombatActiveForLocalPlayer()) return false;
      if (event.smoke) return false;
      const localTeam = this.localSessionPlayer?.()?.team || this.player?.team || TEAM.BLUE;
      if ((event.shooterTeam || TEAM.BLUE) === localTeam) return false;
      const x = Number(event.hitX ?? event.x2);
      const y = Number(event.hitY ?? event.y2);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      if (this.isPlayerInSafeZone?.()) return false;

      const mounted = this.player?.inTank || null;
      const target = mounted?.alive ? mounted : this.player;
      if (!target || target.hp <= 0) return false;
      const radius = Math.max(1, Number(event.radius || event.splash || 1));
      const d = distXY(x, y, target.x, target.y);
      if (d > radius + (target.radius || this.player.radius || 10)) return false;
      const falloff = clamp(1 - d / Math.max(1, radius + (target.radius || 0)), 0.18, 1);
      const baseDamage = Number(event.damage) || (event.weaponId === "rpg" ? 52 : event.weaponId === "he" ? 60 : 38);
      const source = {
        x,
        y,
        team: event.shooterTeam === TEAM.RED ? TEAM.RED : TEAM.BLUE,
        ownerPlayerId: event.shooterId || ""
      };

      if (mounted?.alive) {
        const vehicleScale = mounted.vehicleType === "humvee" ? 0.72 : 0.42;
        mounted.takeDamage?.(this, baseDamage * falloff * vehicleScale);
        if (!mounted.alive) {
          this.applyPlayerDamage(28, source, event.weaponId || "explosion", {
            label: "\uc628\ub77c\uc778 \ucc28\ub7c9 \ud53c\uaca9",
            x,
            y
          });
        }
        return true;
      }

      return this.applyPlayerDamage(baseDamage * falloff, source, event.weaponId || "explosion", {
        label: event.weaponId === "rpg" ? "RPG \ud3ed\ubc1c" : "\uc628\ub77c\uc778 \ud3ed\ubc1c",
        x,
        y
      });
    }

    onlineGunShotLine(weapon, targetX, targetY, options = {}) {
      if (!this.player || !weapon) return null;
      const scoped = this.isPlayerScoutAimMode?.() && weapon.id === "sniper";
      const machineGunAim = this.isPlayerMachineGunAimMode?.() && (weapon.id === "machinegun" || weapon.id === "lmg");
      const pistolAim = this.isPlayerPistolAimMode?.() && weapon.id === "pistol";
      const baseRange = scoped ? weapon.range * 1.28 : machineGunAim ? weapon.range * 1.08 : pistolAim ? weapon.range * 1.12 : weapon.range;
      const range = this.effectivePlayerGunRange(weapon, options.range || baseRange || 560);
      const angle = angleTo(this.player.x, this.player.y, targetX, targetY);
      const spread = (weapon.spread || 0.22) * (options.aimed ? 0.035 : 0.08);
      const shotAngle = angle + (Math.random() - 0.5) * spread;
      const muzzleDistance = this.player.radius + (weapon.visualLength || 16) + 5;
      const x1 = this.player.x + Math.cos(shotAngle) * muzzleDistance;
      const y1 = this.player.y + Math.sin(shotAngle) * muzzleDistance;
      const aimDistance = Math.max(1, distXY(this.player.x, this.player.y, targetX, targetY));
      const distance = Math.min(range, aimDistance);
      return {
        x1,
        y1,
        x2: x1 + Math.cos(shotAngle) * distance,
        y2: y1 + Math.sin(shotAngle) * distance,
        angle: shotAngle,
        range
      };
    }

    findOnlineGunHitTarget(weapon, line, options = {}) {
      const localId = this.onlineSession?.playerId || "";
      const localTeam = this.localSessionPlayer?.()?.team || this.player?.team || TEAM.BLUE;
      const now = Date.now();
      const baseRadius = weapon?.id === "sniper" ? 13 : weapon?.id === "pistol" ? 15 : 18;
      const candidates = [];
      for (const player of this.onlineSession?.players || []) {
        if (!player || player.id === localId || (player.participantType || "player") !== "player") continue;
        if (player.alive === false || player.team === localTeam) continue;
        const point = this.onlineCombatPlayerPoint(player);
        if (!point || point.inVehicle) continue;
        if (now - point.updatedAt > 7500) continue;
        const distance = distXY(line.x1, line.y1, point.x, point.y);
        if (distance > line.range + baseRadius) continue;
        const laneDistance = segmentDistanceToPoint(line.x1, line.y1, line.x2, line.y2, point.x, point.y);
        if (laneDistance > baseRadius + (options.extraHitRadius || 0)) continue;
        if (!hasLineOfSight(this, { x: line.x1, y: line.y1 }, point, { padding: 3 })) continue;
        candidates.push({ player, point, distance, laneDistance });
      }
      candidates.sort((a, b) => (
        a.laneDistance + a.distance * 0.012 -
        (b.laneDistance + b.distance * 0.012)
      ));
      return candidates[0] || null;
    }

    onlineCombatPlayerPoint(player = {}) {
      const raw = player.position || player;
      const x = Number(raw.x);
      const y = Number(raw.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      const nearOrigin = Math.abs(x) < 4 && Math.abs(y) < 4;
      if (nearOrigin) return null;
      return {
        x,
        y,
        inVehicle: Boolean(raw.inVehicle || player.inVehicle),
        updatedAt: Number(raw.updatedAt || player.updatedAt || 0) || Date.now()
      };
    }

    onlineGunHitChance(weapon, distance, range, options = {}) {
      const ratio = range > 0 ? clamp(distance / range, 0, 1) : 0;
      const aimed = options.aimed ? 0.08 : 0;
      const base = weapon?.id === "sniper"
        ? 0.86
        : (weapon?.id === "machinegun" || weapon?.id === "lmg") ? 0.68
          : weapon?.id === "pistol" ? 0.7 : 0.76;
      return clamp(base - ratio * 0.34 + (weapon?.accuracyBonus || 0) + aimed, 0.18, 0.9);
    }

    onlineGunDamage(weapon, distance, range) {
      const min = Number(weapon?.damageMin) || 5;
      const max = Number(weapon?.damageMax) || min + 2;
      const ratio = range > 0 ? clamp(distance / range, 0, 1) : 0;
      const falloff = weapon?.id === "sniper" ? 0.92 : 0.78 - ratio * 0.18;
      return Math.max(1, Math.round((min + Math.random() * (max - min)) * falloff * 10) / 10);
    }

    updateOnlineWorldSync(dt) {
      if (this.sessionMode !== "online" || !this.onlineSession?.roomId || !this.matchStarted || this.result) return;
      const room = this.onlineCombatRoom();
      if (!room) return;
      if (this.isOnlineWorldHost(room)) {
        this.onlineWorldSyncTimer = Math.max(0, (this.onlineWorldSyncTimer || 0) - dt);
        if (this.onlineWorldSyncTimer <= 0) {
          this.onlineWorldSyncTimer = 1.8;
          IronLine.roomRegistry?.updateWorldState?.(room.id, this.captureOnlineWorldState(room));
        }
        return;
      }
      this.applyOnlineWorldState(room.worldState);
    }

    onlineWorldHostPlayerId(room = this.onlineCombatRoom()) {
      const players = (room?.players || [])
        .filter((player) => player && (player.participantType || "player") === "player" && player.alive !== false);
      if (!players.length) return "";
      const explicit = players.find((player) => player.host);
      if (explicit?.id) return explicit.id;
      const slots = this.onlineSession?.roleSlots || [];
      const slotOrder = new Map(slots.map((slot, index) => [slot.id, index]));
      players.sort((a, b) => (
        (slotOrder.get(a.slotId) ?? 999) - (slotOrder.get(b.slotId) ?? 999) ||
        String(a.id || "").localeCompare(String(b.id || ""))
      ));
      return players[0]?.id || "";
    }

    isOnlineWorldHost(room = this.onlineCombatRoom()) {
      const localId = this.onlineSession?.playerId || "";
      if (!localId || this.isLocalSpectator?.()) return false;
      return this.onlineWorldHostPlayerId(room) === localId;
    }

    onlineVehicleControllerId(vehicle = null) {
      const id = vehicle?.callSign || vehicle?.id || "";
      if (!id || this.sessionMode !== "online") return "";
      for (const player of this.onlineSession?.players || []) {
        const position = player?.position || player;
        if (position?.inVehicle && (position.vehicleId || player.vehicleId) === id) return player.id || "";
      }
      return "";
    }

    captureOnlineWorldState(room = this.onlineCombatRoom()) {
      const localId = this.onlineSession?.playerId || "";
      const vehiclePresence = new Map();
      for (const player of room?.players || []) {
        const position = player?.position || player;
        const vehicleId = String(position?.vehicleId || player?.vehicleId || "");
        if (!vehicleId || !position?.inVehicle) continue;
        vehiclePresence.set(vehicleId, { player, position });
      }
      const vehicles = [...(this.tanks || []), ...(this.humvees || [])]
        .map((vehicle) => {
          const id = vehicle.callSign || vehicle.id || "";
          const presence = vehiclePresence.get(id);
          const position = presence?.position || null;
          const controllerId = presence?.player?.id || (vehicle.playerControlled ? localId : "");
          return {
            id,
            type: vehicle.vehicleType || position?.vehicleType || "tank",
            team: vehicle.team,
            x: Number.isFinite(Number(position?.x)) ? Number(position.x) : vehicle.x,
            y: Number.isFinite(Number(position?.y)) ? Number(position.y) : vehicle.y,
            angle: Number.isFinite(Number(position?.angle)) ? Number(position.angle) : vehicle.angle,
            turretAngle: Number.isFinite(Number(position?.turretAngle)) ? Number(position.turretAngle) : (vehicle.turretAngle ?? vehicle.angle),
            machineGunAngle: Number.isFinite(Number(position?.machineGunAngle)) ? Number(position.machineGunAngle) : (vehicle.machineGunAngle ?? vehicle.angle),
            hp: Number(position?.vehicleHp) || vehicle.hp,
            maxHp: Number(position?.vehicleMaxHp) || vehicle.maxHp,
            alive: (position?.alive ?? vehicle.alive) !== false && (Number(position?.vehicleHp) || vehicle.hp) > 0,
            controllerId
          };
        })
        .filter((item) => item.id);
      const units = [...(this.infantry || []), ...(this.crews || [])]
        .map((unit) => ({
          id: unit.callSign || unit.id || "",
          team: unit.team,
          x: unit.x,
          y: unit.y,
          angle: unit.angle,
          hp: unit.hp,
          maxHp: unit.maxHp,
          alive: unit.alive !== false && unit.hp > 0,
          inVehicle: Boolean(unit.inVehicle || unit.inTank)
        }))
        .filter((item) => item.id)
        .slice(0, 96);
      const capturePoints = (this.capturePoints || []).map((point) => ({
        id: point.name,
        owner: point.owner,
        progress: point.progress,
        contested: point.contested
      }));
      return {
        roomId: room?.id || this.onlineSession?.roomId || "",
        hostId: localId,
        tick: Math.floor((this.matchTime || 0) * 10),
        vehicles,
        units,
        capturePoints
      };
    }

    applyOnlineWorldState(state = null) {
      if (!state || state.hostId === this.onlineSession?.playerId) return false;
      const updatedAt = Number(state.updatedAt) || 0;
      if (!updatedAt || updatedAt <= (this.onlineWorldAppliedAt || 0)) return false;
      if (Date.now() - updatedAt > 7000) return false;
      this.onlineWorldAppliedAt = updatedAt;

      const vehicleById = new Map(
        [...(this.tanks || []), ...(this.humvees || [])]
          .map((vehicle) => [vehicle.callSign || vehicle.id || "", vehicle])
          .filter(([id]) => id)
      );
      for (const snap of state.vehicles || []) {
        const vehicle = vehicleById.get(snap.id);
        if (!vehicle || vehicle === this.player?.inTank) continue;
        const alive = snap.alive !== false && Number(snap.hp) > 0;
        if (!alive) {
          vehicle.hp = 0;
          vehicle.alive = false;
          vehicle.playerControlled = false;
          vehicle.wreckTimer = vehicle.wreckTimer || 0;
          continue;
        }
        vehicle.alive = true;
        vehicle.destructionPending = false;
        vehicle.hp = Math.max(1, Math.min(vehicle.maxHp || snap.maxHp || 1, Number(snap.hp) || 1));
        vehicle.x = lerp(vehicle.x, Number(snap.x) || vehicle.x, 0.72);
        vehicle.y = lerp(vehicle.y, Number(snap.y) || vehicle.y, 0.72);
        vehicle.angle = normalizeAngle(lerp(vehicle.angle, Number(snap.angle) || vehicle.angle, 0.62));
        if (vehicle.turretAngle !== undefined) vehicle.turretAngle = normalizeAngle(lerp(vehicle.turretAngle, Number(snap.turretAngle) || vehicle.turretAngle, 0.68));
        if (vehicle.machineGunAngle !== undefined) vehicle.machineGunAngle = normalizeAngle(lerp(vehicle.machineGunAngle, Number(snap.machineGunAngle) || vehicle.machineGunAngle, 0.68));
        vehicle.playerControlled = Boolean(snap.controllerId);
      }

      const unitById = new Map(
        [...(this.infantry || []), ...(this.crews || [])]
          .map((unit) => [unit.callSign || unit.id || "", unit])
          .filter(([id]) => id)
      );
      for (const snap of state.units || []) {
        const unit = unitById.get(snap.id);
        if (!unit) continue;
        const alive = snap.alive !== false && Number(snap.hp) > 0;
        if (!alive) {
          unit.hp = 0;
          unit.alive = false;
          continue;
        }
        if (unit.inTank || unit.inVehicle) continue;
        unit.alive = true;
        unit.hp = Math.max(1, Math.min(unit.maxHp || snap.maxHp || 1, Number(snap.hp) || 1));
        unit.x = lerp(unit.x, Number(snap.x) || unit.x, 0.7);
        unit.y = lerp(unit.y, Number(snap.y) || unit.y, 0.7);
        unit.angle = normalizeAngle(lerp(unit.angle, Number(snap.angle) || unit.angle, 0.55));
      }

      const pointById = new Map((this.capturePoints || []).map((point) => [point.name, point]));
      for (const snap of state.capturePoints || []) {
        const point = pointById.get(snap.id);
        if (!point) continue;
        point.owner = snap.owner || TEAM.NEUTRAL;
        point.progress = clamp(Number(snap.progress) || 0, -1, 1);
        point.contested = Boolean(snap.contested);
      }
      return true;
    }

    recordCombatKill(source = null, victim = null, kind = "kill") {
      const killer = source?.owner || source;
      const playerId = this.scoreboardPlayerIdFor(killer);
      if (!playerId || playerId !== (this.onlineSession?.playerId || "local-player")) return false;
      if (victim === this.player) return false;
      const stats = this.ensureScoreboardStats(playerId);
      stats.kills += 1;
      this.syncScoreboardStatsToSession(playerId, { publish: true });
      this.battlefieldEvents?.push?.({
        type: "score_kill",
        team: this.player?.team || TEAM.BLUE,
        title: "킬 기록",
        detail: `${this.localSessionPlayer?.()?.name || "Player"} ${kind}`
      });
      return true;
    }

    recordLocalPlayerDeath(source = null, kind = "death") {
      const playerId = this.onlineSession?.playerId || "local-player";
      const stats = this.ensureScoreboardStats(playerId);
      stats.deaths += 1;
      this.syncScoreboardStatsToSession(playerId, { publish: true });
      return true;
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
        this.recordLocalPlayerDeath(source, kind);
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

    resetScenarioForMatch(options = {}) {
      const preservedAnnihilation = options.preserveAnnihilation || null;
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
      this.commandPings = [];
      this.coverSlots = new IronLine.CoverSlotManager();
      this.teamReports = {
        [TEAM.BLUE]: new Map(),
        [TEAM.RED]: new Map()
      };
      this.capturePoints = [];
      const localSessionPlayer = this.localSessionPlayer?.();
      const localTeam = localSessionPlayer?.team || TEAM.BLUE;
      const playerSpawn = this.respawnPointForTeam?.(localTeam) || this.world.spawns.player;
      this.player = IronLine.createPlayer(playerSpawn);
      this.player.team = localTeam;
      if (Number.isFinite(playerSpawn?.angle)) this.player.angle = playerSpawn.angle;
      this.applyLocalProfile();
      this.player.setClass(selectedClass);
      this.applyPlayerLoadoutOverrides();
      this.playerTank = null;
      this.result = "";
      this.resultReason = "";
      this.playerDeathActive = false;
      this.playerDeathReason = "";
      this.resetPlayerFeedbackState();
      this.matchTime = 0;
      this.startLoading = this.defaultStartLoadingState();
      this.conquest = this.defaultConquestState();
      this.annihilation = preservedAnnihilation || this.defaultAnnihilationState?.() || this.annihilation;
      this.playerRoundSpectator = false;
      this.respawnTimers = new WeakMap();
      this.playerRespawnTimer = 0;
      this.droneDesignation = null;
      this.objectiveHold = {
        [TEAM.BLUE]: 0,
        [TEAM.RED]: 0
      };
      this.createCommanders();
      this.resetWorldSceneryState();
      this.setupScenario();
      this.syncOnlineSlotAssets();
      this.commandBus?.resetMatch();
      this.aiObservatory?.reset?.();
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
      const mountPressed = this.input.consumePress("KeyF");
      if (interactPressed) {
        if (this.roleChange?.handleInteractPressed?.()) {
          this.updatePlayerSafeZone();
          return;
        }
        if (this.pickupPlayerDrone()) {
          this.updatePlayerSafeZone();
          return;
        }
        if (this.togglePlayerDroneControl()) {
          this.updatePlayerSafeZone();
          return;
        }
      }
      if (mountPressed) {
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
      if (this.isConquestMode() && this.matchStarted) {
        this.playerRespawnTimer = this.conquest.respawnDelay.player;
      } else if (this.isRoundSpectatorMode?.()) {
        this.playerRoundSpectator = true;
        this.chat?.addSystemMessage?.("경기가 끝날 때까지 관전합니다.");
      }
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
      if (this.isRoundSpectatorMode?.()) return false;
      if (this.isConquestMode() && this.matchStarted) {
        return this.respawnPlayerForConquest(true);
      }
      this.input.clear();
      this.resetScenarioForMatch();
      this.deploymentOpen = false;
      this.countdownStarted = true;
      this.matchStarted = false;
      this.startCountdown = 5;
      this.canvas.focus();
      return true;
    }

    returnToMainMenu() {
      this.input.clear();
      this.testLab = "";
      this.useLiveWorld();
      this.hud?.sessionFlow?.leaveOnlineRoom?.(this, "main-menu");
      this.resetScenarioForMatch();
      this.entryOpen = !this.adminObserverMode;
      this.deploymentOpen = false;
      this.lobbyOpen = false;
      this.roomListOpen = false;
      this.spectatorMode = false;
      this.casterMode = false;
      this.matchPhase = this.entryOpen ? "entry" : "ended";
      this.countdownStarted = false;
      this.matchStarted = false;
      this.startCountdown = 5;
      this.startLoading = this.defaultStartLoadingState();
      this.result = "";
      this.resultReason = "";
      this.playerDeathActive = false;
      this.playerDeathReason = "";
      this.onlineSession.localReady = false;
      this.onlineSession.participantType = "player";
      for (const player of this.onlineSession.players || []) player.ready = false;
      this.resetPlayerFeedbackState();
      this.hud?.toggleSettingsPanel?.(false);
      this.hud?.invalidateDeploymentMap?.();
      this.hud?.update?.(this);
      this.canvas.focus();
      return true;
    }

    activateTestLab(id = "drone") {
      this.testLab = id || "drone";
      this.useTestLabWorld();
      this.deploymentOpen = false;
      this.lobbyOpen = false;
      this.matchPhase = "live";
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
      this.testLabRoofPoint = this.world.testLab?.roofPoint || { x: 2680, y: 2680 };

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
      this.testLabUI?.setMode?.(this.testLab);
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
        callSign: "실험드론"
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
        callSign: spawn.callSign || `실험보병-${index + 1}`,
        factionId: spawn.factionId || IronLine.factionVisuals?.factionIdForTeam?.(this, TEAM.RED),
        angle: angleTo(x, y, this.player.x, this.player.y),
        equipmentAmmo: {
          grenade: spawn.grenadeAmmo ?? 3,
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
        callSign: `실험전차-${this.tanks.length + 1}`,
        factionId: IronLine.factionVisuals?.factionIdForTeam?.(this, TEAM.RED),
        angle: Math.PI,
        maxHp: 110
      });
      tank.ai = new IronLine.TankAI(tank, this);
      this.tanks.push(tank);
      this.spawnCrewForTank(tank, {
        callSign: `${tank.callSign}-승무원`,
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
        callSign: `실험험비-${(this.humvees || []).length + 1}`,
        factionId: IronLine.factionVisuals?.factionIdForTeam?.(this, TEAM.RED),
        angle: Math.PI,
        maxHp: 68
      });
      humvee.ai = new IronLine.HumveeAI(humvee, this);
      this.humvees.push(humvee);
      this.spawnCrewForTank(humvee, {
        callSign: `${humvee.callSign}-승무원`,
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

    updateCommandRadioHotkey() {
      if (!this.input.consumePress("Digit4")) return;
      const canUseRadio = this.matchStarted &&
        !this.deploymentOpen &&
        !this.lobbyOpen &&
        !this.entryOpen &&
        !this.result &&
        !this.playerDeathActive &&
        !this.adminObserverMode;
      if (!canUseRadio) return;
      this.hud?.toggleCommandRadio?.();
    }

    updateTacticalMapHotkey() {
      const active = this.matchStarted &&
        !this.entryOpen &&
        !this.deploymentOpen &&
        !this.lobbyOpen &&
        !this.roomListOpen &&
        !this.result;
      if (!active) {
        this.tacticalMapOpen = false;
        return;
      }
      if (this.input.consumePress("KeyM")) this.toggleTacticalMap();
    }

    toggleTacticalMap(force = null) {
      const active = this.matchStarted &&
        !this.entryOpen &&
        !this.deploymentOpen &&
        !this.lobbyOpen &&
        !this.roomListOpen &&
        !this.result;
      this.tacticalMapOpen = active && (force === null ? !this.tacticalMapOpen : Boolean(force));
      return this.tacticalMapOpen;
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

    playerRoleChangeZone() {
      if (!this.isConquestMode() || !this.matchStarted || !this.player || this.player.inTank) return null;
      const player = this.player;
      if (this.isPointInSafeZone(player.x, player.y, TEAM.BLUE)) {
        return { reason: "base", label: "아군 본진" };
      }

      const spawnPoints = [
        this.world.spawns?.player,
        this.world.baseExitPoints?.blue,
        ...(this.world.spawns?.blue || [])
      ].filter(Boolean);
      for (const point of spawnPoints) {
        if (distXY(player.x, player.y, point.x, point.y) <= 220) {
          return { reason: "spawn", label: "아군 스폰 지점" };
        }
      }

      for (const point of this.capturePoints || []) {
        const commandPost = point.commandPost || point.roleChangeZone || point.isCommandPost;
        if (commandPost && point.owner === TEAM.BLUE && distXY(player.x, player.y, point.x, point.y) <= 260) {
          return { reason: "command", label: "아군 사령부 거점" };
        }
      }
      return null;
    }

    applyConquestRoleChange(classId, reason = "") {
      if (!this.isConquestMode() || !this.matchStarted || !INFANTRY_CLASSES[classId]) return false;
      const deathReady = this.playerDeathActive || this.playerDowned;
      if (!deathReady && !this.playerRoleChangeZone()) return false;
      const changed = this.player.setClass(classId);
      IronLine.factionVisuals?.syncEntity?.(this, this.player);
      this.applyPlayerLoadoutOverrides();
      this.player.rifleCooldown = 0;
      this.droneDesignation = null;
      this.chat?.addSystemMessage?.(`${this.roleChangeLabel(classId)} 역할로 변경했습니다.`);
      this.hud?.update?.(this);
      return changed;
    }

    roleChangeLabel(classId) {
      if (classId === "engineer") return "공병";
      if (classId === "scout") return "정찰";
      return "보병";
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
      const pistolAim = this.isPlayerPistolAimMode?.() && weapon.id === "pistol";
      const prone = Boolean(this.player.isProne);
      const proneAccuracyBonus = prone ? 0.06 : 0;
      const proneSpreadScale = prone ? 0.72 : 1;
      const range = scoped ? weapon.range * 1.28 : machineGunAim ? weapon.range * 1.08 : pistolAim ? weapon.range * 1.12 : weapon.range;
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
          accuracyBonus: weapon.accuracyBonus + 0.08 + (scoped ? 0.16 : machineGunAim ? 0.12 : pistolAim ? 0.14 : 0) + proneAccuracyBonus,
          spread: (machineGunAim ? weapon.spread * 0.58 : pistolAim ? weapon.spread * 0.66 : weapon.spread) * proneSpreadScale,
          impactChance: machineGunAim ? 0.45 : pistolAim ? 0.34 : 0.24
        })
        : IronLine.combat.fireRifleAtPoint(this, this.player, targetX, targetY, {
          weapon,
          range,
          spread: (scoped ? weapon.spread * 0.35 : machineGunAim ? weapon.spread * 0.58 : pistolAim ? weapon.spread * 0.66 : weapon.spread) * proneSpreadScale,
          targetTeam: TEAM.RED,
          impactChance: machineGunAim ? 0.46 : pistolAim ? 0.36 : 0.28
        });
      if (fired) {
        this.publishOnlineGunShot(weapon, targetX, targetY, {
          aimed: scoped || machineGunAim || pistolAim || observedShot,
          range
        });
        if (observedShot) this.player.lastShotCooldownScale = observedTarget.designated ? 1.18 : 1.35;
        this.consumePlayerEquipmentAmmo(weapon);
        this.emitPlayerGunFeedback(weapon, machineGunAim || pistolAim || observedShot);
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
      const pistolAim = this.isPlayerPistolAimMode?.() && weapon.id === "pistol";
      const baseRange = scoped ? weapon.range * 1.28 : machineGunAim ? weapon.range * 1.08 : pistolAim ? weapon.range * 1.12 : weapon.range;
      const range = this.effectivePlayerGunRange(weapon, baseRange);
      const aimTolerance = scoped ? 16 + weapon.spread * 16 : machineGunAim ? 22 + weapon.spread * 12 : pistolAim ? 20 + weapon.spread * 12 : 30 + weapon.spread * 28;
      const cursorTolerance = scoped ? 28 + weapon.spread * 10 : machineGunAim ? 34 + weapon.spread * 12 : pistolAim ? 34 + weapon.spread * 12 : 46 + weapon.spread * 18;
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
      const playerTeam = this.localSessionPlayer?.()?.team || this.player.team || TEAM.BLUE;
      return vehicles
        .filter((vehicle) => (
          vehicle.alive &&
          vehicle.team === playerTeam &&
          (!this.onlineVehicleControllerId?.(vehicle) || this.onlineVehicleControllerId?.(vehicle) === this.onlineSession?.playerId) &&
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
      if (this.adminCamera?.update(dt)) return;
      if (this.isRoundSpectatorMode?.()) {
        const fitZoom = Math.min(
          this.camera.width / Math.max(1, this.world.width),
          this.camera.height / Math.max(1, this.world.height)
        ) * 0.9;
        const targetZoom = clamp(fitZoom, 0.16, 1);
        this.camera.zoom = lerp(this.camera.zoom || 1, targetZoom, 1 - Math.pow(0.0002, dt));
        this.camera.viewWidth = this.camera.width / this.camera.zoom;
        this.camera.viewHeight = this.camera.height / this.camera.zoom;
        this.camera.x = clamp(this.world.width / 2 - this.camera.viewWidth / 2, 0, Math.max(0, this.world.width - this.camera.viewWidth));
        this.camera.y = clamp(this.world.height / 2 - this.camera.viewHeight / 2, 0, Math.max(0, this.world.height - this.camera.viewHeight));
        this.input.updateWorld(this.camera);
        return;
      }
      const controlledDrone = this.player.controlledDrone?.alive ? this.player.controlledDrone : null;
      const focus = this.player.inTank || controlledDrone || this.player;
      const tankAimMode = Boolean(this.player.inTank && this.input.mouse.rightDown);
      const droneControlMode = Boolean(controlledDrone);
      const scoutAimMode = Boolean(!this.player.inTank && !droneControlMode && this.isPlayerScoutAimMode());
      const rpgAimMode = Boolean(!this.player.inTank && !droneControlMode && this.isPlayerRpgAimMode());
      const machineGunAimMode = Boolean(!this.player.inTank && !droneControlMode && this.isPlayerMachineGunAimMode());
      const pistolAimMode = Boolean(!this.player.inTank && !droneControlMode && this.isPlayerPistolAimMode?.());
      const scoutObservation = scoutAimMode ? this.scoutObservationCameraTarget() : null;
      const scoutObservationFocus = scoutObservation ? this.scoutObservationCameraFocus(scoutObservation) : null;
      const cameraZoomPreference = this.cameraZoomPreference || 1;
      const aimingCameraMode = tankAimMode || scoutAimMode || rpgAimMode || droneControlMode || machineGunAimMode || pistolAimMode;
      const tacticalZoomCap = scoutAimMode
        ? 1
        : tankAimMode || rpgAimMode || droneControlMode
          ? 1.05
          : machineGunAimMode ? 1.08 : pistolAimMode ? 1.12 : 1.45;
      const effectiveZoomPreference = aimingCameraMode
        ? Math.min(cameraZoomPreference, tacticalZoomCap)
        : cameraZoomPreference;
      const baseTargetZoom = tankAimMode
        ? 0.76
        : scoutAimMode
          ? scoutObservationFocus?.zoom || 0.72
          : rpgAimMode ? 0.82 : droneControlMode ? 0.82 : machineGunAimMode ? 0.88 : pistolAimMode ? 0.94 : 1;
      const targetZoom = clamp(baseTargetZoom * effectiveZoomPreference, 0.6, 1.45);
      this.camera.zoom = lerp(this.camera.zoom || 1, targetZoom, 1 - Math.pow(0.0002, dt));
      this.camera.viewWidth = this.camera.width / this.camera.zoom;
      this.camera.viewHeight = this.camera.height / this.camera.zoom;

      let focusX = focus.x;
      let focusY = focus.y;
      if (scoutObservationFocus) {
        focusX = scoutObservationFocus.x;
        focusY = scoutObservationFocus.y;
      }
      if (tankAimMode || scoutAimMode || rpgAimMode || droneControlMode || machineGunAimMode || pistolAimMode) {
        const mouseDistance = distXY(focus.x, focus.y, this.input.mouse.worldX, this.input.mouse.worldY);
        const lookAhead = (tankAimMode
          ? clamp(mouseDistance * 0.42, 0, 520)
          : scoutAimMode
            ? scoutObservationFocus ? clamp(mouseDistance * 0.18, 0, 220) : clamp(mouseDistance * 0.52, 0, 650)
            : rpgAimMode
              ? clamp(mouseDistance * 0.38, 0, 440)
              : droneControlMode
                ? clamp(mouseDistance * 0.34, 0, 360)
                : pistolAimMode
                  ? clamp(mouseDistance * 0.32, 0, 300)
                  : clamp(mouseDistance * 0.44, 0, 520)) *
          (effectiveZoomPreference > 1 ? clamp(1 - (effectiveZoomPreference - 1) * 0.72, 0.58, 1) : 1);
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
      if (this.playerDeathActive && this.matchConfig.mode !== "conquest" && !this.isRoundSpectatorMode?.()) return;
      if (this.matchConfig.mode === "conquest") {
        this.updateConquestResult();
        return;
      }
      this.updateAnnihilationResult(dt);
    }

    updateConquestResult() {
      if ((this.conquest?.remaining ?? 0) > 0) return;
      const blueScore = Math.floor(this.conquest.score[TEAM.BLUE] || 0);
      const redScore = Math.floor(this.conquest.score[TEAM.RED] || 0);
      if (blueScore > redScore) {
        this.finishGame("BLUE VICTORY", `점령전 종료: 아군 ${blueScore}점 / 적군 ${redScore}점`);
      } else if (redScore > blueScore) {
        this.finishGame("MISSION LOST", `점령전 종료: 아군 ${blueScore}점 / 적군 ${redScore}점`);
      } else {
        this.finishGame("DRAW", `점령전 종료: 양 팀 ${blueScore}점`);
      }
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

    finishGame(result, reason) {
      this.result = result;
      this.resultReason = reason;
      this.matchStarted = false;
      this.countdownStarted = false;
      this.matchPhase = "ended";
      this.input.clear();
    }
  }

  IronLine.installPlayerLoadout?.(Game);
  IronLine.installGameSessionState?.(Game);
  IronLine.installGameAdminActions?.(Game);
  IronLine.installGameAdminMapActions?.(Game);
  IronLine.installGameDroneSystem?.(Game);
  IronLine.installGamePlayerControl?.(Game);
  IronLine.installFogOfWar?.(Game);
  IronLine.installAnnihilationRounds?.(Game);
  IronLine.installMobileCameraGestures?.(Game);
  IronLine.Game = Game;
  IronLine.game = new Game();
})(window);
