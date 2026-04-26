"use strict";

(function bootGame(global) {
  const IronLine = global.IronLine;
  const { TEAM, INFANTRY_WEAPONS } = IronLine.constants;
  const {
    clamp,
    lerp,
    approach,
    distXY,
    angleTo,
    normalizeAngle,
    rotateTowards,
    circleRectCollision,
    expandedRect,
    lineIntersectsRect,
    segmentDistanceToPoint
  } = IronLine.math;
  const { tryMoveCircle, resolveTankSpacing, hasLineOfSight } = IronLine.physics;

  class Game {
    constructor() {
      this.canvas = document.getElementById("game");
      this.canvas.addEventListener("pointerdown", () => this.canvas.focus());
      this.canvas.focus();
      this.world = IronLine.map01;
      this.camera = {
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: window.innerHeight
      };

      this.input = new IronLine.Input();
      this.renderer = new IronLine.Renderer(this.canvas, this.camera);
      this.hud = new IronLine.Hud();
      this.navGraph = new IronLine.NavGraph(this.world.navGraph, this.world);
      this.commanders = {
        [TEAM.BLUE]: new IronLine.CommanderAI(this, TEAM.BLUE, IronLine.commandPlans[TEAM.BLUE]),
        [TEAM.RED]: new IronLine.CommanderAI(this, TEAM.RED, IronLine.commandPlans[TEAM.RED])
      };
      this.debug = {
        ai: false,
        navGraph: false
      };

      this.projectiles = [];
      this.effects = {
        explosions: [],
        tracers: [],
        smokeClouds: [],
        scorchMarks: []
      };
      this.tanks = [];
      this.crews = [];
      this.infantry = [];
      this.squads = [];
      this.coverSlots = new IronLine.CoverSlotManager();
      this.capturePoints = [];
      this.player = IronLine.createPlayer(this.world.spawns.player);
      this.playerTank = null;
      this.result = "";
      this.lastTime = performance.now();

      this.setupScenario();
      window.addEventListener("resize", () => this.renderer.resize());
      requestAnimationFrame((now) => this.loop(now));
    }

    setupScenario() {
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
        ammo: { ap: 14, he: 9, smoke: 5 },
        maxHp: 125,
        maxSpeed: 190
      });
      this.tanks.push(this.playerTank);

      for (const spawn of this.world.spawns.blue) {
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

      const blueInfantry = this.spawnInfantry(this.world.spawns.infantryBlue || [], TEAM.BLUE);
      this.createSquads(TEAM.BLUE, blueInfantry, "B-SQD");

      for (const spawn of this.world.spawns.red) {
        const tank = new IronLine.Tank({
          x: spawn.x,
          y: spawn.y,
          team: TEAM.RED,
          callSign: spawn.callSign,
          angle: spawn.angle
        });
        tank.ai = new IronLine.TankAI(tank, this);
        this.tanks.push(tank);
        this.spawnCrewForTank(tank);
      }

      const redInfantry = this.spawnInfantry(this.world.spawns.infantryRed || [], TEAM.RED);
      this.createSquads(TEAM.RED, redInfantry, "R-SQD");
    }

    spawnInfantry(spawns, team) {
      const created = [];
      for (const spawn of spawns) {
        const unit = new IronLine.InfantryUnit({
          x: spawn.x,
          y: spawn.y,
          team,
          callSign: spawn.callSign,
          angle: spawn.angle,
          weaponId: spawn.weaponId
        });
        unit.ai = new IronLine.InfantryAI(unit, this);
        this.infantry.push(unit);
        created.push(unit);
      }
      return created;
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

    spawnCrewForTank(tank) {
      const spawn = this.findCrewSpawn(tank);
      const crew = new IronLine.CrewMember({
        x: spawn.x,
        y: spawn.y,
        team: tank.team,
        callSign: `${tank.callSign}-CREW`,
        angle: tank.angle,
        targetTank: tank
      });
      this.crews.push(crew);
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
          const routeBlocked = this.world.obstacles.some((obstacle) => (
            lineIntersectsRect(x, y, tank.x, tank.y, expandedRect(obstacle, 18))
          ));
          if (!blocked && !routeBlocked) return { x, y };
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
      this.updatePlayer(dt);

      for (const crew of this.crews) crew.update(this, dt);

      for (const commander of Object.values(this.commanders)) commander.update(dt);
      this.coverSlots.update(dt);
      for (const squad of this.squads) squad.update(dt);

      for (const unit of this.infantry) unit.update(this, dt);

      for (const tank of this.tanks) tank.update(this, dt);

      IronLine.combat.updateProjectiles(this, dt);
      IronLine.combat.updateEffects(this, dt);

      for (const point of this.capturePoints) point.update(this, dt);

      resolveTankSpacing(this, dt);
      this.updateCamera(dt);
      this.hud.update(this);
      this.updateResult();
    }

    updatePlayer(dt) {
      if (this.player.hp <= 0) return;

      this.updatePlayerSafeZone();
      if (this.input.consumePress("KeyF")) this.toggleTank();

      if (this.player.inTank) this.updateMountedPlayer(dt);
      else this.updateInfantryPlayer(dt);

      this.updatePlayerSafeZone();
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
      const tank = this.player.inTank;
      this.player.x = tank.x;
      this.player.y = tank.y;

      if (!tank.alive) {
        this.player.inTank = null;
        tank.playerControlled = false;
        this.player.hp = Math.max(0, this.player.hp - 44);
        return;
      }

      const turnInput = this.input.axis("KeyA", "ArrowLeft", "KeyD", "ArrowRight");
      const throttle = this.input.axis("KeyS", "ArrowDown", "KeyW", "ArrowUp");

      tank.angle = normalizeAngle(tank.angle + turnInput * tank.turnRate * dt);
      const targetSpeed = throttle * tank.maxSpeed;
      tank.speed = approach(tank.speed, targetSpeed, tank.accel * dt);
      if (Math.abs(throttle) < 0.01) tank.speed = approach(tank.speed, 0, tank.accel * 0.72 * dt);
      tank.speed *= 1 - 0.18 * dt;

      tryMoveCircle(this, tank, Math.cos(tank.angle) * tank.speed, Math.sin(tank.angle) * tank.speed, tank.radius, dt);

      const mouse = this.input.mouse;
      const targetTurret = angleTo(tank.x, tank.y, mouse.worldX, mouse.worldY);
      tank.turretAngle = rotateTowards(tank.turretAngle, targetTurret, tank.turretTurnRate * dt);

      if (this.input.consumePress("Digit1") || this.input.consumePress("Numpad1")) tank.beginLoad("ap");
      if (this.input.consumePress("Digit2") || this.input.consumePress("Numpad2")) tank.beginLoad("he");
      if (this.input.consumePress("Digit3") || this.input.consumePress("Numpad3")) tank.deploySmoke(this);

      if (mouse.down || this.input.keyDown("Space")) tank.fire(this);
    }

    updateInfantryPlayer(dt) {
      this.player.rifleCooldown = Math.max(0, this.player.rifleCooldown - dt);
      this.updateInfantryWeaponInput();
      const moveX = this.input.axis("KeyA", "ArrowLeft", "KeyD", "ArrowRight");
      const moveY = this.input.axis("KeyW", "ArrowUp", "KeyS", "ArrowDown");
      const length = Math.hypot(moveX, moveY);
      const infantrySpeed = 185;
      const vx = length > 0 ? (moveX / length) * infantrySpeed : 0;
      const vy = length > 0 ? (moveY / length) * infantrySpeed : 0;

      tryMoveCircle(this, this.player, vx, vy, this.player.radius, dt);

      const mouse = this.input.mouse;
      this.player.angle = angleTo(this.player.x, this.player.y, mouse.worldX, mouse.worldY);
      this.player.interactPulse += dt;

      if ((mouse.down || this.input.keyDown("Space")) && this.player.rifleCooldown <= 0) {
        const weapon = this.player.getWeapon();
        const target = this.findPlayerRifleTarget();
        const fired = target
          ? IronLine.combat.fireRifle(this, this.player, target, {
          weapon,
          range: weapon.range,
          damage: weapon.damageMin + Math.random() * (weapon.damageMax - weapon.damageMin),
          accuracyBonus: weapon.accuracyBonus + 0.08
          })
          : IronLine.combat.fireRifleAtPoint(this, this.player, mouse.worldX, mouse.worldY, {
            weapon,
            range: weapon.range,
            targetTeam: TEAM.RED
          });

        if (fired) {
          this.player.rifleCooldown = weapon.cooldown;
        }
      }
    }

    updateInfantryWeaponInput() {
      const keys = [
        ["Digit1", "Numpad1"],
        ["Digit2", "Numpad2"],
        ["Digit3", "Numpad3"]
      ];

      for (let i = 0; i < keys.length; i += 1) {
        if (!keys[i].some((code) => this.input.consumePress(code))) continue;
        const weaponId = this.player.weaponInventory[i];
        if (weaponId && INFANTRY_WEAPONS[weaponId]) {
          this.player.setWeapon(weaponId);
          this.player.rifleCooldown = Math.min(this.player.rifleCooldown, 0.12);
        }
      }
    }

    findPlayerRifleTarget() {
      const mouse = this.input.mouse;
      const weapon = this.player.getWeapon();
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
          item.rangeDistance <= weapon.range &&
          (item.aimDistance <= 30 + weapon.spread * 28 || item.cursorDistance <= 46 + weapon.spread * 18) &&
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

      const candidates = this.tanks
        .filter((tank) => tank.alive && tank.isPlayerTank && distXY(this.player.x, this.player.y, tank.x, tank.y) < 74)
        .sort((a, b) => distXY(this.player.x, this.player.y, a.x, a.y) - distXY(this.player.x, this.player.y, b.x, b.y));

      if (candidates.length > 0) {
        this.player.inTank = candidates[0];
        candidates[0].playerControlled = true;
        this.player.x = candidates[0].x;
        this.player.y = candidates[0].y;
      }
    }

    dismountTank(tank) {
      const offsets = [
        tank.angle + Math.PI / 2,
        tank.angle - Math.PI / 2,
        tank.angle + Math.PI,
        tank.angle
      ];

      for (const angle of offsets) {
        const x = clamp(tank.x + Math.cos(angle) * 55, this.player.radius, this.world.width - this.player.radius);
        const y = clamp(tank.y + Math.sin(angle) * 55, this.player.radius, this.world.height - this.player.radius);
        if (!this.world.obstacles.some((obstacle) => circleRectCollision(x, y, this.player.radius, obstacle))) {
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
      this.player.y = tank.y + 58;
    }

    updateCamera(dt) {
      const focus = this.player.inTank || this.player;
      const targetX = clamp(focus.x - this.camera.width / 2, 0, Math.max(0, this.world.width - this.camera.width));
      const targetY = clamp(focus.y - this.camera.height / 2, 0, Math.max(0, this.world.height - this.camera.height));
      this.camera.x = lerp(this.camera.x, targetX, 1 - Math.pow(0.001, dt));
      this.camera.y = lerp(this.camera.y, targetY, 1 - Math.pow(0.001, dt));
    }

    updateResult() {
      if (this.result) return;

      const blueOwned = this.capturePoints.every((point) => point.owner === TEAM.BLUE);
      const redOwned = this.capturePoints.every((point) => point.owner === TEAM.RED);
      const redAlive = this.tanks.some((tank) => tank.team === TEAM.RED && tank.alive);
      const blueAlive = this.tanks.some((tank) => tank.team === TEAM.BLUE && tank.alive);

      if (blueOwned || !redAlive) this.result = "BLUE VICTORY";
      if (redOwned || !blueAlive || this.player.hp <= 0) this.result = "MISSION LOST";
    }
  }

  IronLine.Game = Game;
  IronLine.game = new Game();
})(window);
