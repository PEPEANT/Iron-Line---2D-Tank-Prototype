"use strict";

(function bootGame(global) {
  const IronLine = global.IronLine;
  const { TEAM, AMMO, INFANTRY_WEAPONS, PLAYER_CLASS_ORDER } = IronLine.constants;
  const {
    clamp,
    lerp,
    distXY,
    angleTo,
    normalizeAngle,
    rotateTowards,
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
      window.addEventListener("resize", () => this.renderer.resize());
      requestAnimationFrame((now) => this.loop(now));
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

      const blueInfantry = this.spawnInfantry(
        this.scaledSpawns(this.world.spawns.infantryBlue || [], config.blueInfantry, "B-INF", 18),
        TEAM.BLUE,
        difficulty
      );
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

      const redInfantry = this.spawnInfantry(
        this.scaledSpawns(this.world.spawns.infantryRed || [], config.redInfantry, "R-INF", 18),
        TEAM.RED,
        difficulty
      );
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
          team: TEAM.RED,
          callSign: "R-HMV-1",
          x: redBase.x + 72,
          y: redBase.y - 116,
          angle: 3.02,
          maxHp: Math.round(68 * difficulty.enemyTankHp),
          maxSpeed: 248 * difficulty.enemyTankSpeed
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

      if (this.deploymentOpen) {
        this.updatePlayerSafeZone();
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
      for (const crew of this.crews) crew.update(this, dt);
      for (const commander of Object.values(this.commanders)) commander.update(dt);
      this.coverSlots.update(dt);
      for (const squad of this.squads) squad.update(dt);

      for (const unit of this.infantry) unit.update(this, dt);
      this.updateTeamReports(dt);

      for (const tank of this.tanks) tank.update(this, dt);
      for (const humvee of this.humvees || []) humvee.update(this, dt);

      IronLine.combat.updateProjectiles(this, dt);
      IronLine.combat.updateEffects(this, dt);
      this.updatePlayerDeathState();
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

    selectDeploymentClass(classId) {
      if (!classId || this.matchStarted) return false;
      const changed = this.player.setClass(classId);
      if (changed) this.player.rifleCooldown = Math.min(this.player.rifleCooldown, 0.12);
      return changed;
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
      this.squads = [];
      this.coverSlots = new IronLine.CoverSlotManager();
      this.teamReports = {
        [TEAM.BLUE]: new Map(),
        [TEAM.RED]: new Map()
      };
      this.capturePoints = [];
      this.player = IronLine.createPlayer(this.world.spawns.player);
      this.player.setClass(selectedClass);
      this.playerTank = null;
      this.result = "";
      this.resultReason = "";
      this.playerDeathActive = false;
      this.playerDeathReason = "";
      this.matchTime = 0;
      this.objectiveHold = {
        [TEAM.BLUE]: 0,
        [TEAM.RED]: 0
      };
      this.createCommanders();
      this.setupScenario();
      this.scenarioDirty = false;
      this.hud?.invalidateDeploymentMap?.();
    }

    updatePlayer(dt) {
      if (this.player.hp <= 0) {
        this.handlePlayerDeath("적 공격으로 쓰러졌습니다.");
        return;
      }

      this.updatePlayerSafeZone();
      if (this.input.consumePress("KeyE")) this.toggleTank();

      if (this.player.inTank) this.updateMountedPlayer(dt);
      else this.updateInfantryPlayer(dt);

      this.updatePlayerSafeZone();
    }

    updatePlayerDeathState() {
      if (this.playerDeathActive || this.result || this.deploymentOpen) return;
      if (this.player.hp <= 0) this.handlePlayerDeath("적 공격으로 쓰러졌습니다.");
    }

    handlePlayerDeath(reason = "사망했습니다.") {
      if (this.playerDeathActive || this.result) return;
      if (this.player.inTank) {
        this.player.inTank.playerControlled = false;
        this.player.inTank = null;
      }
      this.player.hp = 0;
      this.player.alive = false;
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
        this.player.hp = Math.max(0, this.player.hp - 44);
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

      tank.drive(this, dt, driveThrottle, driveTurn, {
        brake: this.input.keyDown("Space") && Math.abs(driveThrottle) < 0.01,
        turnAccel: 3.9,
        driveDrag: 0.18
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
        this.player.hp = Math.max(0, this.player.hp - 28);
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

      humvee.drive(this, dt, driveThrottle, driveTurn, {
        brake: this.input.keyDown("Space") && Math.abs(driveThrottle) < 0.01,
        turnScale: 1.03,
        collisionSpeedRetain: 0.34
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

      for (const unit of this.infantry || []) addTarget(unit, unit.classId === "engineer" ? 3 : 2);
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
        if (!unit.alive || unit.team === tank.team) continue;
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

    updateInfantryPlayer(dt) {
      this.player.rifleCooldown = Math.max(0, this.player.rifleCooldown - dt);
      this.player.gunKick = Math.max(0, (this.player.gunKick || 0) - dt * 11);
      this.updateInfantryWeaponInput();
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
      const infantrySpeed = scoutAimMode ? 0 : rpgAimMode ? 68 : machineGunAimMode ? 82 : 155;
      const vx = length > 0 ? (moveX / length) * infantrySpeed : 0;
      const vy = length > 0 ? (moveY / length) * infantrySpeed : 0;

      tryMoveCircle(this, this.player, vx, vy, this.player.radius, dt, { blockTanks: true, padding: 5 });
      this.applyVirtualAim(this.player, scoutAimMode ? 1050 : rpgAimMode ? 980 : machineGunAimMode ? 880 : 650);

      const mouse = this.input.mouse;
      this.player.angle = angleTo(this.player.x, this.player.y, mouse.worldX, mouse.worldY);
      this.player.interactPulse += dt;

      if ((mouse.leftDown || this.input.keyDown("Space")) && this.player.rifleCooldown <= 0) {
        const weapon = this.player.getWeapon();
        const fired = this.usePlayerEquipment(weapon, mouse.worldX, mouse.worldY);
        if (fired) this.player.rifleCooldown = weapon.cooldown || 0.35;
      }
    }

    isPlayerScoutAimMode() {
      if (this.player.inTank || this.player.hp <= 0 || !this.input.mouse.rightDown) return false;
      const weapon = this.player.getWeapon?.();
      return this.player.classId === "scout" && weapon?.id === "sniper";
    }

    isPlayerRpgAimMode() {
      if (this.player.inTank || this.player.hp <= 0 || !this.input.mouse.rightDown) return false;
      const weapon = this.player.getWeapon?.();
      return this.player.classId === "engineer" && weapon?.id === "rpg";
    }

    isPlayerMachineGunAimMode() {
      if (this.player.inTank || this.player.hp <= 0 || !this.input.mouse.rightDown) return false;
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
            this.player.rifleCooldown = Math.min(this.player.rifleCooldown, 0.12);
          }
          continue;
        }

        if (this.player.setEquipmentSlot(i)) {
          this.player.rifleCooldown = Math.min(this.player.rifleCooldown, 0.12);
        }
      }
    }

    usePlayerEquipment(weapon, targetX, targetY) {
      if (!weapon) return false;

      if (weapon.type === "grenade") {
        if (!this.consumePlayerEquipmentAmmo(weapon)) return false;
        return IronLine.combat.throwGrenade(this, this.player, targetX, targetY, { weapon });
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

      const aimStability = clamp((this.player.rpgAimTime || 0) / 0.42, 0, 1);
      const fired = IronLine.combat.fireRpg(this, this.player, aim.requestedX, aim.requestedY, {
        weapon,
        aimStability
      });
      if (!fired) return false;

      this.player.equipmentAmmo[weapon.ammoKey] = Math.max(0, this.player.equipmentAmmo[weapon.ammoKey] - 1);
      this.player.rpgAimTime = 0;
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
      const range = scoped ? weapon.range * 1.28 : machineGunAim ? weapon.range * 1.08 : weapon.range;
      const target = this.findPlayerRifleTarget();
      const fired = target
        ? IronLine.combat.fireRifle(this, this.player, target, {
        weapon,
        range,
        damage: weapon.damageMin + Math.random() * (weapon.damageMax - weapon.damageMin),
        accuracyBonus: weapon.accuracyBonus + 0.08 + (scoped ? 0.16 : machineGunAim ? 0.12 : 0),
        spread: machineGunAim ? weapon.spread * 0.58 : weapon.spread,
        impactChance: machineGunAim ? 0.45 : 0.24
        })
        : IronLine.combat.fireRifleAtPoint(this, this.player, targetX, targetY, {
          weapon,
          range,
          spread: scoped ? weapon.spread * 0.35 : machineGunAim ? weapon.spread * 0.58 : weapon.spread,
          targetTeam: TEAM.RED,
          impactChance: machineGunAim ? 0.46 : 0.28
        });
      if (fired) {
        this.consumePlayerEquipmentAmmo(weapon);
        this.emitPlayerGunFeedback(weapon, machineGunAim);
      }
      return fired;
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
      const range = scoped ? weapon.range * 1.28 : machineGunAim ? weapon.range * 1.08 : weapon.range;
      const aimTolerance = scoped ? 16 + weapon.spread * 16 : machineGunAim ? 22 + weapon.spread * 12 : 30 + weapon.spread * 28;
      const cursorTolerance = scoped ? 28 + weapon.spread * 10 : machineGunAim ? 34 + weapon.spread * 12 : 46 + weapon.spread * 18;
      const candidates = [];

      for (const unit of this.infantry || []) {
        if (!unit.alive || unit.team === TEAM.BLUE) continue;
        candidates.push(unit);
      }

      for (const crew of this.crews || []) {
        if (!crew.alive || crew.inTank || crew.team === TEAM.BLUE) continue;
        candidates.push(crew);
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
        this.player.inTank = vehicle;
        vehicle.playerControlled = true;
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
          return;
        }
      }

      this.player.inTank = null;
      tank.playerControlled = false;
      this.player.x = tank.x;
      this.player.y = tank.y + tank.radius + this.player.radius + 24;
    }

    updateCamera(dt) {
      const focus = this.player.inTank || this.player;
      const tankAimMode = Boolean(this.player.inTank && this.input.mouse.rightDown);
      const scoutAimMode = Boolean(!this.player.inTank && this.isPlayerScoutAimMode());
      const rpgAimMode = Boolean(!this.player.inTank && this.isPlayerRpgAimMode());
      const machineGunAimMode = Boolean(!this.player.inTank && this.isPlayerMachineGunAimMode());
      const targetZoom = tankAimMode ? 0.76 : scoutAimMode ? 0.72 : rpgAimMode ? 0.82 : machineGunAimMode ? 0.88 : 1;
      this.camera.zoom = lerp(this.camera.zoom || 1, targetZoom, 1 - Math.pow(0.0002, dt));
      this.camera.viewWidth = this.camera.width / this.camera.zoom;
      this.camera.viewHeight = this.camera.height / this.camera.zoom;

      let focusX = focus.x;
      let focusY = focus.y;
      if (tankAimMode || scoutAimMode || rpgAimMode || machineGunAimMode) {
        const mouseDistance = distXY(focus.x, focus.y, this.input.mouse.worldX, this.input.mouse.worldY);
        const lookAhead = tankAimMode
          ? clamp(mouseDistance * 0.42, 0, 520)
          : scoutAimMode
            ? clamp(mouseDistance * 0.52, 0, 650)
            : rpgAimMode
              ? clamp(mouseDistance * 0.38, 0, 440)
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
      const alive = target.alive !== undefined ? target.alive : target.hp > 0;
      if (!alive) return;

      const reports = this.teamReports?.[team];
      if (!reports) return;

      const current = reports.get(target);
      reports.set(target, {
        target,
        x: target.x,
        y: target.y,
        ttl: Math.max(ttl, current?.ttl || 0),
        reporter,
        confidence: reporter?.classId === "scout" ? 1 : 0.7
      });
    }

    isReportedEnemy(team, target) {
      const report = this.teamReports?.[team]?.get(target);
      if (!report || report.ttl <= 0) return false;
      const alive = target?.alive !== undefined ? target.alive : target?.hp > 0;
      return Boolean(alive && target.team !== team);
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
