"use strict";

(function registerTank(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { AMMO, INFANTRY_WEAPONS } = IronLine.constants;
  const { clamp, approach, distXY, normalizeAngle, segmentDistanceToPoint, circleRectCollision } = IronLine.math;
  const { tryMoveCircle } = IronLine.physics;

  class Tank {
    constructor(options) {
      this.x = options.x;
      this.y = options.y;
      this.team = options.team;
      this.callSign = options.callSign;
      this.factionId = options.factionId || options.skinId || "";
      this.skinId = this.factionId;
      this.angle = options.angle || 0;
      this.turretAngle = this.angle;
      this.radius = options.radius || 38;
      this.maxHp = options.maxHp || 110;
      this.hp = this.maxHp;
      this.speed = 0;
      this.turnVelocity = 0;
      this.turnRate = options.turnRate || 1.95;
      this.maxSpeed = options.maxSpeed || 145;
      this.accel = options.accel || 215;
      this.turretTurnRate = options.turretTurnRate || 1.65;
      this.aimTargetAngle = this.turretAngle;
      this.aimError = 0;
      this.weaponMode = "cannon";
      this.machineGunAngle = this.turretAngle;
      this.machineGunTurnRate = options.machineGunTurnRate || 3.1;
      this.machineGunCooldown = 0;
      this.machineGunKick = 0;
      this.loadedAmmo = null;
      this.reload = {
        active: false,
        ammoId: null,
        progress: 0,
        duration: 1
      };
      this.ammo = {
        ap: options.ammo?.ap ?? 12,
        he: options.ammo?.he ?? 8,
        mg: options.ammo?.mg ?? 120,
        smoke: options.ammo?.smoke ?? 1
      };
      this.fireCooldown = 0;
      this.smokeCooldown = 0;
      this.recoil = 0;
      this.fireKick = 0;
      this.fireOrder = null;
      this.trackPhase = 0;
      this.dustCooldown = 0;
      this.impactShake = 0;
      this.alive = true;
      this.ai = null;
      this.vehicleType = "tank";
      this.isPlayerTank = Boolean(options.isPlayerTank);
      this.crew = null;
      this.playerControlled = false;
      this.repairHoldTimer = 0;
      this.repairHoldSource = "";
      this.wreckTimer = 0;
      this.destructionPending = false;
      this.destructionTimer = 0;
      this.destructionDelay = 0;
      this.bailoutWindow = 0;
      this.lastBailout = null;
      this.criticalEffectTimer = 0;
      this.infantryAssault = null;
      this.assaultMobilityTimer = 0;
      this.assaultDisabledTimer = 0;
      this.assaultEffectPulse = 0;
    }

    hasCrew() {
      return Boolean(this.crew) || this.playerControlled;
    }

    occupantCount() {
      return (this.playerControlled ? 1 : 0) + (this.crew ? 1 : 0);
    }

    hasMachineGunner() {
      return this.alive && !this.destructionPending && Boolean(this.crew);
    }

    isOperational() {
      return this.alive && !this.destructionPending && this.hasCrew();
    }

    drive(game, dt, throttle = 0, turn = 0, options = {}) {
      if (!this.alive || this.destructionPending) {
        this.speed = 0;
        this.turnVelocity = 0;
        return { moved: 0, blocked: false };
      }

      const throttleInput = clamp(Number(throttle) || 0, -1, 1);
      const turnInput = clamp(Number(turn) || 0, -1, 1);
      const speedAbs = Math.abs(this.speed);
      const mobilityScale = this.assaultMobilityScale();
      const speedScale = (options.speedScale ?? 1) * mobilityScale.speed;
      const speedLimit = this.maxSpeed * speedScale;
      const speedRatio = clamp(speedAbs / Math.max(speedLimit, 1), 0, 1);
      const throttleActive = Math.abs(throttleInput) > 0.01;
      const reverseScale = options.reverseScale ?? 0.52;
      const targetSpeed = throttleInput * speedLimit * (throttleInput < -0.01 ? reverseScale : 1);
      const changingDirection = throttleActive &&
        Math.sign(targetSpeed) !== Math.sign(this.speed) &&
        speedAbs > 10;

      let accelScale = throttleInput < -0.01 ? 0.56 : 0.78;
      if (options.brake || changingDirection) accelScale = 1.42;
      if (!throttleActive) accelScale = options.coastScale ?? 0.46;

      const accel = (options.accel ?? this.accel) * (options.accelScale ?? 1) * accelScale;
      this.speed = approach(this.speed, targetSpeed, accel * dt);

      const drag = throttleActive ? (options.driveDrag ?? 0.22) : (options.coastDrag ?? 0.82);
      this.speed *= Math.max(0, 1 - drag * dt);
      if (Math.abs(this.speed) < 0.35) this.speed = 0;

      const turnAuthority = (0.62 + (1 - speedRatio) * 0.38) * (speedAbs < 16 ? 0.82 : 1);
      const targetTurnVelocity = turnInput * this.turnRate * turnAuthority * (options.turnScale ?? 1) * mobilityScale.turn;
      const turnAccel = this.turnRate * (options.turnAccel ?? 3.7) * (0.82 + (1 - speedRatio) * 0.38);
      this.turnVelocity = approach(this.turnVelocity, targetTurnVelocity, turnAccel * dt);

      const turnDrag = Math.abs(turnInput) > 0.01 ? (options.activeTurnDrag ?? 0.6) : (options.turnDrag ?? 5.2);
      this.turnVelocity *= Math.max(0, 1 - turnDrag * dt);
      if (Math.abs(this.turnVelocity) < 0.006) this.turnVelocity = 0;
      this.angle = normalizeAngle(this.angle + this.turnVelocity * dt);

      const beforeX = this.x;
      const beforeY = this.y;
      const beforeSpeed = this.speed;
      const result = tryMoveCircle(
        game,
        this,
        Math.cos(this.angle) * this.speed,
        Math.sin(this.angle) * this.speed,
        this.radius,
        dt,
        {
          collisionSpeedScale: 0,
          destroyObstaclesOnImpact: true,
          blockTanks: true,
          blockWrecks: true,
          padding: 4,
          impactSpeed: beforeSpeed,
          impactMass: 1.34,
          vehicleKind: "tank"
        }
      );
      const moved = distXY(beforeX, beforeY, this.x, this.y);
      const expectedMove = Math.abs(beforeSpeed) * dt;
      const blocked = Boolean(result?.blocked) || (expectedMove > 1 && moved < expectedMove * 0.42);

      if (blocked) {
        const impulse = clamp(Math.abs(beforeSpeed) / Math.max(speedLimit, 1), 0.18, 1);
        this.impactShake = Math.max(this.impactShake, impulse);
        this.speed *= options.collisionSpeedRetain ?? 0.55;
        this.turnVelocity *= 0.52;
      }

      if (moved > 0.01) this.trackPhase = (this.trackPhase + moved * 0.11) % 1000;
      if (options.dust !== false) this.emitTrackDust(game, moved, throttleInput, turnInput);

      return { moved, blocked };
    }

    emitTrackDust(game, moved, throttleInput, turnInput) {
      if (!game?.effects || moved < 0.7 || this.dustCooldown > 0) return;

      const speedRatio = clamp(Math.abs(this.speed) / Math.max(this.maxSpeed, 1), 0, 1);
      const effort = clamp(speedRatio * 0.74 + Math.abs(turnInput) * 0.22 + Math.abs(throttleInput) * 0.16, 0, 1);
      if (effort < 0.18) return;

      if (this.isOnRoad(game)) {
        this.emitTrackScuff(game, effort);
        this.dustCooldown = 0.08 + (1 - effort) * 0.08;
        return;
      }

      const puffs = game.effects.dustPuffs || (game.effects.dustPuffs = []);
      if (puffs.length > 150) puffs.shift();

      const direction = Math.sign(this.speed || throttleInput || 1);
      const side = (Math.floor(this.trackPhase / 7) % 2 === 0) ? -1 : 1;
      const c = Math.cos(this.angle);
      const s = Math.sin(this.angle);
      const rearOffset = -22 * direction;
      const trackOffset = side * 24;
      const life = 0.34 + effort * 0.2;
      const jitter = (Math.random() - 0.5) * 5;

      puffs.push({
        x: this.x + c * rearOffset - s * (trackOffset + jitter),
        y: this.y + s * rearOffset + c * (trackOffset + jitter),
        vx: -c * direction * (12 + effort * 18) + (Math.random() - 0.5) * 12,
        vy: -s * direction * (12 + effort * 18) + (Math.random() - 0.5) * 12,
        angle: this.angle + (Math.random() - 0.5) * 0.7,
        radius: 4 + effort * 3,
        maxRadius: 14 + effort * 13,
        life,
        maxLife: life,
        alpha: 0.15 + effort * 0.12
      });

      this.dustCooldown = 0.04 + (1 - effort) * 0.08;
    }

    isOnRoad(game, roadHalfWidth = null) {
      const worldRoadWidth = game?.world?.roadWidth || 84;
      for (const road of game?.world?.roads || []) {
        const halfWidth = roadHalfWidth ?? (road.width || worldRoadWidth) * 0.56;
        for (let i = 1; i < road.length; i += 1) {
          const a = road[i - 1];
          const b = road[i];
          if (segmentDistanceToPoint(a.x, a.y, b.x, b.y, this.x, this.y) <= halfWidth) return true;
        }
      }
      return false;
    }

    emitTrackScuff(game, effort) {
      if (effort < 0.22) return;

      const marks = game.effects.trackScuffs || (game.effects.trackScuffs = []);
      if (marks.length > 120) marks.shift();

      const direction = Math.sign(this.speed || 1);
      const side = (Math.floor(this.trackPhase / 8) % 2 === 0) ? -1 : 1;
      const c = Math.cos(this.angle);
      const s = Math.sin(this.angle);
      const centerOffset = -8 * direction;
      const trackOffset = side * 26;
      const length = 18 + effort * 20;
      const x = this.x + c * centerOffset - s * trackOffset;
      const y = this.y + s * centerOffset + c * trackOffset;
      const life = 1.2 + effort * 0.7;

      marks.push({
        x1: x - c * length * 0.5,
        y1: y - s * length * 0.5,
        x2: x + c * length * 0.5,
        y2: y + s * length * 0.5,
        life,
        maxLife: life,
        alpha: 0.08 + effort * 0.08
      });
    }

    boardCrew(crew) {
      if (!this.alive || this.crew && this.crew !== crew) return false;
      this.crew = crew;
      return true;
    }

    leaveCrew(crew) {
      if (this.crew === crew) this.crew = null;
    }

    beginLoad(ammoId) {
      if (!this.alive || !AMMO[ammoId] || AMMO[ammoId].equipment || this.ammo[ammoId] <= 0) return false;
      if (this.loadedAmmo) return this.loadedAmmo === ammoId;
      if (this.reload.active) return this.reload.ammoId === ammoId;

      this.fireOrder = null;
      this.reload.active = true;
      this.reload.ammoId = ammoId;
      this.reload.progress = 0;
      this.reload.duration = AMMO[ammoId].loadTime;
      return true;
    }

    update(game, dt, options = {}) {
      if (!this.alive) {
        this.wreckTimer += dt;
        if (!this.coverDestroyed && this.wreckTimer > 8) {
          this.coverDestroyed = true;
          this.coverCollapsePulse = Math.max(this.coverCollapsePulse || 0, 0.7);
        }
        return;
      }

      if (this.destructionPending) {
        this.updateDestructionPending(game, dt);
        return;
      }

      this.fireCooldown = Math.max(0, this.fireCooldown - dt);
      this.smokeCooldown = Math.max(0, this.smokeCooldown - dt);
      this.machineGunCooldown = Math.max(0, this.machineGunCooldown - dt);
      this.assaultMobilityTimer = Math.max(0, (this.assaultMobilityTimer || 0) - dt);
      this.assaultDisabledTimer = Math.max(0, (this.assaultDisabledTimer || 0) - dt);
      this.assaultEffectPulse = Math.max(0, (this.assaultEffectPulse || 0) - dt);
      this.repairHoldTimer = Math.max(0, (this.repairHoldTimer || 0) - dt);
      if (this.repairHoldTimer <= 0) this.repairHoldSource = "";
      this.recoil = Math.max(0, this.recoil - dt * 4);
      this.fireKick = Math.max(0, this.fireKick - dt * 5.2);
      this.machineGunKick = Math.max(0, this.machineGunKick - dt * 9);
      this.impactShake = Math.max(0, this.impactShake - dt * 3.8);
      this.dustCooldown = Math.max(0, this.dustCooldown - dt);
      if (this.weaponMode === "mg" && !this.hasMachineGunner()) this.weaponMode = "cannon";
      this.updateInfantryAssault(game, dt);

      if (this.reload.active) {
        this.reload.progress += dt;
        if (this.reload.progress >= this.reload.duration) {
          this.loadedAmmo = this.reload.ammoId;
          this.reload.active = false;
          this.reload.progress = this.reload.duration;
        }
      }

      const aiDt = options.aiDt ?? dt;
      if (!options.skipAi && aiDt > 0 && this.ai && !this.playerControlled && this.isOperational() && game.matchStarted !== false && !game.testLabAiPaused) {
        this.ai.update(aiDt);
      }
    }

    assaultMobilityScale() {
      if ((this.assaultDisabledTimer || 0) > 0) return { speed: 0.08, turn: 0.16 };
      if ((this.assaultMobilityTimer || 0) > 0) return { speed: 0.48, turn: 0.58 };
      return { speed: 1, turn: 1 };
    }

    assaultSlotPoint(attacker = null, game = null, slotIndex = null) {
      const slots = [
        Math.PI * 0.78,
        -Math.PI * 0.78,
        Math.PI,
        Math.PI * 0.52,
        -Math.PI * 0.52
      ];
      const index = Number.isFinite(slotIndex)
        ? Math.max(0, Math.min(slots.length - 1, slotIndex))
        : Math.abs(String(attacker?.callSign || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)) % slots.length;
      const angle = normalizeAngle(this.angle + slots[index]);
      const distance = (this.radius || 38) + (attacker?.radius || 10) + 18;
      const margin = Math.max(14, attacker?.radius || 10);
      return {
        x: clamp(this.x + Math.cos(angle) * distance, margin, Math.max(margin, (game?.world?.width || 0) - margin)),
        y: clamp(this.y + Math.sin(angle) * distance, margin, Math.max(margin, (game?.world?.height || 0) - margin)),
        angle,
        slotIndex: index,
        stopDistance: 9,
        final: true,
        tankAssaultSlot: true
      };
    }

    infantryAssaultContact(attacker = null, game = null, slotIndex = null) {
      const slot = this.assaultSlotPoint(attacker, game, slotIndex);
      const distanceToSlot = distXY(attacker?.x || 0, attacker?.y || 0, slot.x, slot.y);
      const distanceToTank = distXY(attacker?.x || 0, attacker?.y || 0, this.x, this.y);
      const attachRange = 24;
      const movingSlotRange = 44;
      const hullContactRange = (this.radius || 38) + (attacker?.radius || 10) + 28;
      return {
        slot,
        distanceToSlot,
        distanceToTank,
        attached: distanceToSlot <= attachRange || (distanceToSlot <= movingSlotRange && distanceToTank <= hullContactRange)
      };
    }

    canReserveInfantryAssault(attacker) {
      if (!this.alive || this.destructionPending || !attacker?.alive || attacker.inVehicle) return false;
      if (attacker.team === this.team) return false;
      const current = this.infantryAssault;
      return !current || current.attacker === attacker || !current.attacker?.alive;
    }

    reserveInfantryAssault(attacker, game, options = {}) {
      if (!this.canReserveInfantryAssault(attacker)) return null;
      const current = this.infantryAssault;
      if (current?.attacker === attacker) return current;
      const slot = this.assaultSlotPoint(attacker, game, options.slotIndex);
      this.infantryAssault = {
        attacker,
        team: attacker.team,
        progress: 0,
        phase: "approach",
        slotIndex: slot.slotIndex,
        attached: false,
        lastAttachedAt: game?.matchTime || 0,
        startedAt: game?.matchTime || 0,
        lastPhase: ""
      };
      return this.infantryAssault;
    }

    renewInfantryAssault(attacker) {
      if (this.infantryAssault?.attacker !== attacker) return false;
      this.infantryAssault.attached = true;
      return true;
    }

    cancelInfantryAssault(reason = "") {
      const state = this.infantryAssault;
      if (!state) return false;
      const attackerAi = state.attacker?.ai;
      if (attackerAi) {
        attackerAi.tankAssaultTarget = null;
        attackerAi.tankAssaultCooldown = Math.max(attackerAi.tankAssaultCooldown || 0, reason === "completed" ? 5.5 : 2.8);
      }
      this.infantryAssault = null;
      return true;
    }

    updateInfantryAssault(game, dt) {
      const state = this.infantryAssault;
      if (!state) return;
      const attacker = state.attacker;
      if (!attacker?.alive || attacker.inVehicle || attacker.team === this.team || this.destructionPending) {
        this.cancelInfantryAssault("invalid");
        return;
      }

      const contact = this.infantryAssaultContact(attacker, game, state.slotIndex);
      const distanceToSlot = contact.distanceToSlot;
      const distanceToTank = contact.distanceToTank;
      const committedAssault = state.attached || state.progress > 0.2;
      if (distanceToTank > (this.radius || 38) + 130 || (!committedAssault && attacker.suppression > 96)) {
        this.cancelInfantryAssault("broken");
        return;
      }

      const shakenOff = Math.abs(this.speed || 0) > 78 || Math.abs(this.turnVelocity || 0) > 0.82;
      if (contact.attached) {
        state.attached = true;
        state.phase = state.progress >= 7 ? "disabled" : state.progress >= 3 ? "planting" : "climbing";
        state.lastAttachedAt = game?.matchTime || state.lastAttachedAt;
        state.progress = clamp(state.progress + dt * (shakenOff ? 0.34 : 1), 0, 7.8);
      } else {
        state.attached = false;
        state.phase = "approach";
        state.progress = Math.max(0, state.progress - dt * 0.9);
      }

      if (shakenOff && !state.attached) state.progress = Math.max(0, state.progress - dt * 0.9);
      if (state.progress <= 0 && distanceToTank > (this.radius || 38) + 92) {
        this.cancelInfantryAssault("lost");
        return;
      }

      if (state.progress >= 3) this.assaultMobilityTimer = Math.max(this.assaultMobilityTimer || 0, 0.35);
      if (state.progress >= 7) this.assaultDisabledTimer = Math.max(this.assaultDisabledTimer || 0, 0.35);
      if (state.phase !== state.lastPhase) {
        state.lastPhase = state.phase;
        this.assaultEffectPulse = Math.max(this.assaultEffectPulse || 0, 0.4);
      }
    }

    updateDestructionPending(game, dt) {
      this.destructionTimer = Math.max(0, this.destructionTimer - dt);
      this.criticalEffectTimer = Math.max(0, this.criticalEffectTimer - dt);
      this.speed = 0;
      this.turnVelocity = 0;
      this.fireCooldown = Math.max(this.fireCooldown, 0.25);
      this.machineGunCooldown = Math.max(this.machineGunCooldown, 0.25);
      this.smokeCooldown = Math.max(this.smokeCooldown, 0.25);
      this.recoil = Math.max(0, this.recoil - dt * 3.2);
      this.fireKick = Math.max(0, this.fireKick - dt * 3.2);
      this.machineGunKick = 0;
      this.impactShake = Math.max(0.08, this.impactShake - dt * 1.2);

      if (this.criticalEffectTimer <= 0) {
        this.emitCriticalDamageEffects(game);
        this.criticalEffectTimer = 0.08 + Math.random() * 0.08;
      }

      if (this.destructionTimer <= 0) this.finalizeDestruction(game);
    }

    beginDestruction(game, options = {}) {
      if (this.destructionPending || !this.alive) return;

      this.hp = 0;
      this.destructionPending = true;
      const catastrophic = Boolean(options.catastrophic);
      this.destructionDelay = catastrophic
        ? 0.95 + Math.random() * 0.55
        : 1.65 + Math.random() * 0.85;
      this.destructionTimer = this.destructionDelay;
      this.bailoutWindow = this.destructionDelay;
      this.criticalEffectTimer = 0;
      this.speed = 0;
      this.turnVelocity = 0;
      this.reload.active = false;
      this.loadedAmmo = null;
      this.weaponMode = "cannon";
      this.fireOrder = null;
      this.impactShake = Math.max(this.impactShake, 0.42);
      this.tryEmergencyBailout(game, options);

      if (game?.effects) {
        game.effects.explosions.push({
          x: this.x + (Math.random() - 0.5) * 18,
          y: this.y + (Math.random() - 0.5) * 18,
          radius: 10,
          maxRadius: 36,
          life: 0.34,
          maxLife: 0.34,
          color: "rgba(255, 142, 72, 0.82)",
          core: true
        });
      }
    }

    tryEmergencyBailout(game, options = {}) {
      const catastrophic = Boolean(options.catastrophic);
      const result = {
        crew: false,
        player: false,
        catastrophic,
        cause: options.cause || options.weaponId || "destruction",
        window: this.bailoutWindow || this.destructionDelay || 0
      };

      if (this.crew?.alive) {
        const crewChance = catastrophic
          ? this.crew.dedicated || this.isPlayerTank ? 0.42 : 0.18
          : this.crew.dedicated || this.isPlayerTank ? 1 : 0.62;
        if (Math.random() <= crewChance) {
          result.crew = this.bailoutCrewMember(game, this.crew, { catastrophic });
        } else {
          this.crew.takeDamage(999);
        }
      }

      if (this.playerControlled && game?.player?.inTank === this) {
        const playerChance = catastrophic ? 0.48 : 1;
        if (Math.random() <= playerChance) {
          result.player = this.bailoutPlayer(game, { catastrophic });
        } else {
          game.player.inTank = null;
          this.playerControlled = false;
          this.playerSeat = "";
          game.applyPlayerDamage?.(999, this, "vehicle", {
            deathReason: "전차 치명 폭발로 탈출하지 못했습니다."
          });
        }
      }

      if (result.crew || result.player) {
        this.lastBailout = {
          ...result,
          time: game?.matchTime || 0
        };
        this.recordBailoutEvent(game, result);
      } else {
        this.lastBailout = {
          ...result,
          failed: true,
          time: game?.matchTime || 0
        };
      }

      return result;
    }

    bailoutPoint(game, occupant = null, options = {}) {
      const world = game?.world || {};
      const margin = Math.max(occupant?.radius || 10, 12);
      const width = Number.isFinite(world.width) ? world.width : this.x + 500;
      const height = Number.isFinite(world.height) ? world.height : this.y + 500;
      const baseDistance = (this.radius || 38) + margin + (options.catastrophic ? 46 : 34);
      const angles = [
        this.angle + Math.PI,
        this.angle + Math.PI / 2,
        this.angle - Math.PI / 2,
        this.angle + Math.PI * 0.72,
        this.angle - Math.PI * 0.72,
        this.angle
      ];
      const distances = [baseDistance, baseDistance + 28, baseDistance + 58];

      for (const distance of distances) {
        for (const angle of angles) {
          const x = clamp(this.x + Math.cos(angle) * distance, margin, Math.max(margin, width - margin));
          const y = clamp(this.y + Math.sin(angle) * distance, margin, Math.max(margin, height - margin));
          const blocked = (world.obstacles || []).some((obstacle) => (
            circleRectCollision(x, y, margin + 2, obstacle)
          ));
          if (!blocked) return { x, y, angle };
        }
      }

      const fallbackAngle = this.angle + Math.PI;
      return {
        x: clamp(this.x + Math.cos(fallbackAngle) * baseDistance, margin, Math.max(margin, width - margin)),
        y: clamp(this.y + Math.sin(fallbackAngle) * baseDistance, margin, Math.max(margin, height - margin)),
        angle: fallbackAngle
      };
    }

    bailoutCrewMember(game, crew, options = {}) {
      if (!crew?.alive) return false;
      const point = this.bailoutPoint(game, crew, options);
      crew.dismount?.(game);
      this.leaveCrew(crew);
      crew.targetTank = null;
      crew.inTank = null;
      crew.x = point.x;
      crew.y = point.y;
      crew.angle = point.angle;
      crew.speed = 0;
      crew.state = options.catastrophic ? "bailout-shocked" : "bailout";
      crew.mountTimer = 0;
      crew.maxSpeed = Math.min(crew.maxSpeed || 108, 92);
      const survivorHp = Math.round((crew.maxHp || 45) * (options.catastrophic ? 0.32 : 0.55));
      crew.hp = clamp(Math.min(crew.hp || crew.maxHp || 45, survivorHp), 12, crew.maxHp || 45);
      return true;
    }

    bailoutPlayer(game, options = {}) {
      if (!game?.player || game.player.inTank !== this) return false;
      const point = this.bailoutPoint(game, game.player, options);
      game.player.inTank = null;
      this.playerControlled = false;
      this.playerSeat = "";
      game.player.x = point.x;
      game.player.y = point.y;
      game.player.angle = point.angle;
      game.player.speed = 0;
      game.player.vehicleBailoutTimer = 1.25;
      const maxHp = game.player.maxHp || 100;
      const survivorHp = Math.round(maxHp * (options.catastrophic ? 0.28 : 0.42));
      game.player.hp = clamp(Math.min(game.player.hp || maxHp, survivorHp), 18, maxHp);
      game.lastPlayerDamage = {
        x: this.x,
        y: this.y,
        angle: Math.atan2(this.y - game.player.y, this.x - game.player.x),
        amount: 0,
        kind: "vehicle_bailout",
        label: "전차 탈출",
        ttl: 1.45,
        maxTtl: 1.45
      };
      return true;
    }

    recordBailoutEvent(game, result) {
      const targetLabel = this.callSign || "tank";
      game?.battlefieldEvents?.push?.({
        type: "tank_crew_bailout",
        severity: result.catastrophic ? "warning" : "info",
        team: this.team,
        title: "승무원 탈출",
        detail: `${targetLabel} 치명 손상 후 ${result.player ? "플레이어 " : ""}${result.crew ? "승무원 " : ""}탈출`,
        source: "vehicle",
        chat: false
      });
      game?.aiObservatory?.recordEvent?.({
        unitId: targetLabel,
        aiType: "tank",
        team: this.team,
        decision: "crew_bailout",
        reason: result.catastrophic ? "catastrophic_bailout" : "critical_bailout",
        score: result.window,
        scores: {
          crew: result.crew ? 1 : 0,
          player: result.player ? 1 : 0,
          catastrophic: result.catastrophic ? 1 : 0
        }
      });
    }

    emitCriticalDamageEffects(game) {
      if (!game?.effects) return;

      const smokePuffs = game.effects.gunSmokePuffs || (game.effects.gunSmokePuffs = []);
      const blastSparks = game.effects.blastSparks || (game.effects.blastSparks = []);
      const c = Math.cos(this.angle);
      const s = Math.sin(this.angle);
      const forward = -6 + Math.random() * 22;
      const side = (Math.random() - 0.5) * 34;
      const x = this.x + c * forward - s * side;
      const y = this.y + s * forward + c * side;

      if (smokePuffs.length > 180) smokePuffs.shift();
      smokePuffs.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 34 - c * 10,
        vy: (Math.random() - 0.5) * 34 - s * 10,
        angle: this.angle + (Math.random() - 0.5) * 1.2,
        radius: 7 + Math.random() * 4,
        maxRadius: 32 + Math.random() * 22,
        life: 0.72 + Math.random() * 0.28,
        maxLife: 0.9,
        alpha: 0.24 + Math.random() * 0.12,
        warm: Math.random() < 0.42
      });

      if (Math.random() < 0.55) {
        game.effects.explosions.push({
          x: x + (Math.random() - 0.5) * 8,
          y: y + (Math.random() - 0.5) * 8,
          radius: 5,
          maxRadius: 18 + Math.random() * 10,
          life: 0.16 + Math.random() * 0.08,
          maxLife: 0.22,
          color: "rgba(255, 116, 46, 0.72)",
          core: true
        });
      }

      if (Math.random() < 0.32) {
        const angle = this.angle + Math.PI + (Math.random() - 0.5) * 1.4;
        const speed = 70 + Math.random() * 120;
        blastSparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          length: 8 + Math.random() * 10,
          life: 0.16 + Math.random() * 0.12,
          maxLife: 0.28,
          color: "rgba(255, 183, 92, 0.78)"
        });
      }
    }

    finalizeDestruction(game) {
      if (!this.destructionPending && !this.alive) return;

      this.destructionPending = false;
      this.destructionTimer = 0;
      this.hp = 0;
      this.alive = false;
      this.speed = 0;
      this.turnVelocity = 0;
      this.reload.active = false;
      this.loadedAmmo = null;
      this.weaponMode = "cannon";
      this.fireOrder = null;
      this.machineGunKick = 0;
      if (this.crew) this.crew.takeDamage(999);

      if (!game?.effects) return;
      game.effects.scorchMarks.push({ x: this.x, y: this.y, radius: 58, alpha: 0.45 });
      game.effects.explosions.push({
        x: this.x,
        y: this.y,
        radius: 30,
        maxRadius: 138,
        life: 0.72,
        maxLife: 0.72,
        color: "rgba(255, 118, 72, 0.95)",
        core: true
      });
      game.effects.explosions.push({
        x: this.x + (Math.random() - 0.5) * 12,
        y: this.y + (Math.random() - 0.5) * 12,
        radius: 24,
        maxRadius: 168,
        life: 1.05,
        maxLife: 1.05,
        color: "rgba(58, 52, 44, 0.58)",
        smoke: true
      });
    }

    requestRepairHold(engineer, options = {}) {
      if (!this.alive || this.destructionPending || this.playerControlled) return false;
      const duration = options.duration ?? 0.65;
      this.repairHoldTimer = Math.max(this.repairHoldTimer || 0, duration);
      this.repairHoldSource = engineer?.callSign || this.repairHoldSource || "engineer";
      return true;
    }

    canFire() {
      return this.alive && !this.destructionPending && this.loadedAmmo && !AMMO[this.loadedAmmo]?.equipment && this.fireCooldown <= 0;
    }

    fire(game, options = {}) {
      if (!this.canFire()) return false;

      const ammo = AMMO[this.loadedAmmo];
      if (this.ammo[ammo.id] <= 0) {
        this.loadedAmmo = null;
        return false;
      }

      this.ammo[ammo.id] -= 1;
      const muzzleDistance = this.radius + 28;
      const muzzleX = this.x + Math.cos(this.turretAngle) * muzzleDistance;
      const muzzleY = this.y + Math.sin(this.turretAngle) * muzzleDistance;
      const aimError = options.aimError ?? this.aimError ?? 0;
      const baseVariance = ammo.id === "he" ? 0.018 : 0.01;
      const rushedVariance = clamp(Math.max(0, aimError - 0.08) / 0.55, 0, 1) * (ammo.id === "he" ? 0.055 : 0.035);
      const variance = baseVariance + rushedVariance;
      const shellAngle = this.turretAngle + (Math.random() - 0.5) * variance;
      const fuseDistance = options.fuseDistance ?? (options.target ? distXY(muzzleX, muzzleY, options.target.x, options.target.y) : null);
      const shellLife = ammo.id === "he" && fuseDistance
        ? clamp(fuseDistance / ammo.speed, 0.12, ammo.life || 3)
        : ammo.life || 3;

      const projectile = {
        x: muzzleX,
        y: muzzleY,
        previousX: muzzleX,
        previousY: muzzleY,
        vx: Math.cos(shellAngle) * ammo.speed,
        vy: Math.sin(shellAngle) * ammo.speed,
        team: this.team,
        owner: this,
        ammo,
        life: shellLife,
        radius: ammo.shellRadius
      };
      game.publishOnlineProjectileLaunch?.(projectile, {
        shooter: this,
        weaponId: ammo.id,
        aimX: options.target?.x,
        aimY: options.target?.y,
        fuseDistance
      });
      game.projectiles.push(projectile);

      game.effects.explosions.push({
        x: muzzleX,
        y: muzzleY,
        radius: 22,
        maxRadius: 30,
        life: 0.18,
        maxLife: 0.18,
        color: "rgba(255, 226, 160, 0.9)"
      });
      this.emitMuzzleBlast(game, muzzleX, muzzleY, shellAngle, ammo);
      IronLine.audio?.play?.("tank-fire", { game, x: muzzleX, y: muzzleY, volume: ammo.id === "he" ? 0.95 : 0.82 });

      this.fireCooldown = 0.18;
      this.loadedAmmo = null;
      this.fireOrder = null;
      this.recoil = 1;
      this.fireKick = 1;
      this.impactShake = Math.max(this.impactShake, ammo.id === "he" ? 0.38 : 0.3);
      this.speed -= Math.cos(normalizeAngle(this.turretAngle - this.angle)) * (ammo.id === "he" ? 34 : 28);
      this.turnVelocity += Math.sin(normalizeAngle(this.turretAngle - this.angle)) * 0.08;
      return true;
    }

    machineGunWeapon() {
      const base = INFANTRY_WEAPONS.machinegun || {};
      const movingSpread = clamp(Math.abs(this.speed) / Math.max(this.maxSpeed, 1), 0, 1) * 0.1;
      return {
        ...base,
        id: "machinegun",
        name: "기관총",
        shortName: "기관총",
        range: 760,
        vehicleMounted: true,
        tankDamage: 0.24,
        lightVehicleDamage: 1.45,
        cooldown: 0.075,
        damageMin: 4,
        damageMax: 6,
        accuracyBonus: 0.08,
        spread: 0.15 + movingSpread,
        suppressionHit: 24,
        suppressionMiss: 16,
        lineSuppression: 21,
        impactSuppression: 12,
        tracerLife: 0.075,
        visualLength: 18,
        visualWidth: 4
      };
    }

    machineGunMountPoint() {
      const baseAngle = this.turretAngle ?? this.angle;
      const forwardOffset = -4;
      const sideOffset = -15;
      return {
        x: this.x + Math.cos(baseAngle) * forwardOffset + Math.cos(baseAngle + Math.PI / 2) * sideOffset,
        y: this.y + Math.sin(baseAngle) * forwardOffset + Math.sin(baseAngle + Math.PI / 2) * sideOffset
      };
    }

    machineGunMuzzlePoint() {
      const mount = this.machineGunMountPoint();
      const muzzleDistance = 30;
      return {
        x: mount.x + Math.cos(this.machineGunAngle) * muzzleDistance,
        y: mount.y + Math.sin(this.machineGunAngle) * muzzleDistance
      };
    }

    canFireMachineGun() {
      return this.hasMachineGunner() && this.machineGunCooldown <= 0 && (this.ammo.mg || 0) > 0;
    }

    fireMachineGun(game, targetX, targetY, options = {}) {
      if (!this.canFireMachineGun()) return false;

      const weapon = this.machineGunWeapon();
      const mount = this.machineGunMountPoint();
      const muzzle = this.machineGunMuzzlePoint();
      const shooter = {
        x: mount.x,
        y: mount.y,
        team: this.team,
        radius: 2,
        angle: this.machineGunAngle,
        alive: true,
        hp: this.hp,
        weaponId: "machinegun",
        sourceVehicle: this
      };
      const target = options.target || null;
      const fired = target?.vehicleType
        ? IronLine.combat.fireRifleAtTank(game, shooter, target, {
          weapon,
          range: weapon.range,
          accuracyBonus: weapon.accuracyBonus + 0.08,
          tracerLife: weapon.tracerLife,
          tracerWidth: weapon.visualWidth,
          startX: muzzle.x,
          startY: muzzle.y,
          impactChance: 0.52
        })
        : target
          ? IronLine.combat.fireRifle(game, shooter, target, {
            weapon,
            range: weapon.range,
            baseAccuracy: 0.82,
            accuracyBonus: weapon.accuracyBonus,
            spread: weapon.spread,
            tracerLife: weapon.tracerLife,
            tracerWidth: weapon.visualWidth,
            startX: muzzle.x,
            startY: muzzle.y,
            impactChance: 0.42,
            tracerColor: this.team === IronLine.constants.TEAM.BLUE ? "rgba(184, 224, 255, 0.96)" : "rgba(255, 174, 159, 0.94)"
          })
          : IronLine.combat.fireRifleAtPoint(game, shooter, targetX, targetY, {
            weapon,
            range: weapon.range,
            spread: weapon.spread,
            targetTeam: this.team === IronLine.constants.TEAM.BLUE ? IronLine.constants.TEAM.RED : IronLine.constants.TEAM.BLUE,
            tracerLife: weapon.tracerLife,
            tracerWidth: weapon.visualWidth,
            startX: muzzle.x,
            startY: muzzle.y,
            impactChance: 0.48,
            tracerColor: this.team === IronLine.constants.TEAM.BLUE ? "rgba(184, 224, 255, 0.88)" : "rgba(255, 174, 159, 0.86)"
          });

      if (!fired) return false;
      this.ammo.mg = Math.max(0, (this.ammo.mg || 0) - 1);
      this.emitMachineGunFlash(game);
      this.machineGunCooldown = weapon.cooldown;
      this.machineGunKick = 1.35;
      this.impactShake = Math.max(this.impactShake, 0.055);
      this.speed -= Math.cos(normalizeAngle(this.machineGunAngle - this.angle)) * 1.15;
      this.turnVelocity += Math.sin(normalizeAngle(this.machineGunAngle - this.angle)) * 0.018;
      return true;
    }

    emitMachineGunFlash(game) {
      const flashes = game.effects.muzzleFlashes || (game.effects.muzzleFlashes = []);
      const smokePuffs = game.effects.gunSmokePuffs || (game.effects.gunSmokePuffs = []);
      const muzzle = this.machineGunMuzzlePoint();
      if (flashes.length > 90) flashes.shift();
      flashes.push({
        x: muzzle.x,
        y: muzzle.y,
        angle: this.machineGunAngle,
        length: 24,
        width: 10,
        life: 0.058,
        maxLife: 0.058,
        color: "rgba(255, 231, 148, 0.94)"
      });

      if (smokePuffs.length > 180) smokePuffs.shift();
      smokePuffs.push({
        x: muzzle.x - Math.cos(this.machineGunAngle) * 4,
        y: muzzle.y - Math.sin(this.machineGunAngle) * 4,
        vx: Math.cos(this.machineGunAngle) * (24 + Math.random() * 18),
        vy: Math.sin(this.machineGunAngle) * (24 + Math.random() * 18),
        angle: this.machineGunAngle + (Math.random() - 0.5) * 0.36,
        radius: 2.5,
        maxRadius: 11 + Math.random() * 5,
        life: 0.22,
        maxLife: 0.22,
        alpha: 0.12,
        warm: true
      });
    }

    emitMuzzleBlast(game, muzzleX, muzzleY, shellAngle, ammo) {
      const flashes = game.effects.muzzleFlashes || (game.effects.muzzleFlashes = []);
      const smokePuffs = game.effects.gunSmokePuffs || (game.effects.gunSmokePuffs = []);
      const blastScale = ammo.id === "he" ? 1.18 : 1;

      if (flashes.length > 90) flashes.shift();
      flashes.push({
        x: muzzleX,
        y: muzzleY,
        angle: shellAngle,
        length: 42 * blastScale,
        width: 24 * blastScale,
        life: 0.075,
        maxLife: 0.075,
        color: ammo.id === "he" ? "rgba(255, 185, 82, 0.96)" : "rgba(255, 234, 156, 0.95)"
      });

      const c = Math.cos(shellAngle);
      const s = Math.sin(shellAngle);
      const puffCount = ammo.id === "he" ? 8 : 6;
      for (let i = 0; i < puffCount; i += 1) {
        if (smokePuffs.length > 180) smokePuffs.shift();
        const spread = (Math.random() - 0.5) * 0.92;
        const distance = 8 + i * 5 + Math.random() * 10;
        const side = (Math.random() - 0.5) * 10;
        const speed = 42 + Math.random() * 40 + i * 5;
        const life = 0.48 + Math.random() * 0.26;
        smokePuffs.push({
          x: muzzleX + c * distance - s * side,
          y: muzzleY + s * distance + c * side,
          vx: Math.cos(shellAngle + spread) * speed + (Math.random() - 0.5) * 18,
          vy: Math.sin(shellAngle + spread) * speed + (Math.random() - 0.5) * 18,
          angle: shellAngle + spread,
          radius: 5 + Math.random() * 4,
          maxRadius: (22 + Math.random() * 14) * blastScale,
          life,
          maxLife: life,
          alpha: 0.18 + Math.random() * 0.12,
          warm: i < 2
        });
      }
    }

    deploySmoke(game) {
      const smoke = AMMO.smoke;
      if (!this.alive || this.destructionPending || this.smokeCooldown > 0 || this.ammo.smoke <= 0) return false;

      this.ammo.smoke -= 1;
      this.smokeCooldown = smoke.cooldown || 7;

      const offsets = [
        { angle: 0, distance: 0, spread: 0 },
        { angle: this.angle + Math.PI, distance: 46, spread: -0.38 },
        { angle: this.angle + Math.PI, distance: 46, spread: 0.38 },
        { angle: this.angle + Math.PI * 0.72, distance: 42, spread: 0 },
        { angle: this.angle - Math.PI * 0.72, distance: 42, spread: 0 }
      ];

      for (const offset of offsets) {
        const angle = offset.angle + offset.spread;
        game.effects.smokeClouds.push({
          x: this.x + Math.cos(angle) * offset.distance,
          y: this.y + Math.sin(angle) * offset.distance,
          radius: 34,
          maxRadius: 132 + Math.random() * 28,
          life: 9.5,
          maxLife: 9.5
        });
      }

      game.effects.explosions.push({
        x: this.x,
        y: this.y,
        radius: 16,
        maxRadius: 76,
        life: 0.42,
        maxLife: 0.42,
        color: "rgba(220, 226, 230, 0.65)"
      });

      return true;
    }

    takeDamage(game, amount, options = {}) {
      if (!this.alive) return;
      if (this.destructionPending) {
        this.impactShake = Math.max(this.impactShake, 0.22);
        if (amount > 36) this.destructionTimer = Math.min(this.destructionTimer, 0.42);
        return;
      }

      this.hp -= amount;
      game.effects.explosions.push({
        x: this.x + (Math.random() - 0.5) * 32,
        y: this.y + (Math.random() - 0.5) * 32,
        radius: 8,
        maxRadius: 34,
        life: 0.28,
        maxLife: 0.28,
        color: "rgba(255, 133, 92, 0.8)"
      });

      if (this.hp <= 0) {
        const overkill = Math.max(0, -this.hp);
        this.beginDestruction(game, {
          ...options,
          amount,
          overkill,
          catastrophic: Boolean(options.catastrophic) ||
            amount >= this.maxHp * 1.18 ||
            overkill >= this.maxHp * 0.48
        });
      }
    }
  }

  IronLine.Tank = Tank;
})(window);
