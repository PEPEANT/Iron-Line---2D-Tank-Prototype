"use strict";

(function registerGameDroneSystem(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, AMMO, INFANTRY_WEAPONS } = IronLine.constants;
  const {
    clamp,
    distXY,
    angleTo,
    lerp,
    normalizeAngle,
    rotateTowards,
    pointInRect,
    circleRectCollision,
    expandedRect,
    lineIntersectsRect,
    segmentDistanceToPoint
  } = IronLine.math;
  const { tryMoveCircle, resolveTankSpacing, hasLineOfSight, circleIntersectsTank } = IronLine.physics;

  const gameDroneSystemMethods = {
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
    },
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
    },
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
    },
    droneSightOptions(drone, options = {}) {
      return this.droneHasRoofCover(drone)
        ? { ...options, ignoreObstacleContainingA: true }
        : options;
    },
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
    },
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
    },
    activePlayerDrone() {
      const drone = this.player?.activeDrone;
      return drone?.alive ? drone : null;
    },
    activeReconDroneForSniper() {
      const drone = this.activePlayerDrone();
      if (!drone || drone.droneRole === "attack" || drone.autoReturn) return null;
      if (this.player?.controlledDrone === drone) return null;
      if (drone.owner && drone.owner !== this.player) return null;
      if ((drone.signalStrength?.() ?? 1) <= 0.08) return null;
      return drone;
    },
    reconDroneDesignationUiDrone() {
      const controlledDrone = this.player?.controlledDrone;
      if (controlledDrone?.alive && controlledDrone.droneRole !== "attack") return controlledDrone;

      const drone = this.activePlayerDrone();
      if (!drone || drone.droneRole === "attack" || drone.autoReturn) return null;
      if (drone.owner && drone.owner !== this.player) return null;
      if ((drone.signalStrength?.() ?? 1) <= 0.08) return null;
      return drone;
    },
    nearbyPlayerDroneForPickup(maxDistance = 62) {
      const drone = this.activePlayerDrone();
      if (!drone || this.player.controlledDrone === drone || !drone.recallable) return null;
      const distance = distXY(this.player.x, this.player.y, drone.x, drone.y);
      return distance <= maxDistance + (drone.radius || 0) + this.player.radius ? drone : null;
    },
    pickupPlayerDrone() {
      const drone = this.nearbyPlayerDroneForPickup();
      if (!drone) return false;
      return this.recoverPlayerDrone(drone);
    },
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
    },
    droneCloseEnoughToRecover(drone, maxDistance = 34) {
      if (!drone?.alive || !this.player || this.player.hp <= 0) return false;
      const distance = distXY(this.player.x, this.player.y, drone.x, drone.y);
      return distance <= maxDistance + (drone.radius || 0) + this.player.radius;
    },
    deployReconDrone(weapon, targetX, targetY) {
      if (!this.matchStarted || this.player.inTank) return false;

      const existing = this.activePlayerDrone();
      if (existing) {
        existing.autoReturn = false;
        this.setReconDroneWaypoint(existing, targetX, targetY);
        this.returnPlayerToPrimaryAfterDroneUse(weapon);
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
        deployDelay: 1.25,
        targetX,
        targetY
      });
      this.setReconDroneWaypoint(drone, targetX, targetY);

      this.drones.push(drone);
      this.player.activeDrone = drone;
      this.returnPlayerToPrimaryAfterDroneUse(weapon);
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
    },
    deploySuicideDrone(weapon, targetX, targetY) {
      if (!this.matchStarted || this.player.inTank) return false;

      const existing = this.activePlayerDrone();
      if (existing) {
        existing.autoReturn = false;
        existing.setWaypoint(targetX, targetY);
        this.returnPlayerToPrimaryAfterDroneUse(weapon);
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
        deployDelay: 1.55,
        targetX,
        targetY
      });

      this.drones.push(drone);
      this.player.activeDrone = drone;
      this.returnPlayerToPrimaryAfterDroneUse(weapon);
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
    },
    returnPlayerToPrimaryAfterDroneUse(weapon = null) {
      const player = this.player;
      if (!player || !player.setEquipmentSlot) return false;
      const activeWeapon = player.getWeapon?.();
      if (activeWeapon?.type !== "drone" && (!weapon?.id || player.weaponId !== weapon.id)) return false;
      return player.setEquipmentSlot(0);
    },
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
    },
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
    },
    findSuicideDroneLockTarget(drone = this.player?.controlledDrone) {
      return this.suicideDroneLockOptions(drone).filter((item) => item.lockable)[0]?.target || null;
    },
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
    },
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
    },
    completeSuicideDroneLock(drone, target = null, point = null) {
      if (!drone?.alive) return false;
      const locked = target ? drone.lockOn?.(target) : drone.lockGround?.(point.x, point.y);
      if (!locked) return false;
      this.emitSuicideDroneLockFeedback(drone, target);
      return true;
    },
    updateSuicideDroneLocking(drone, dt) {
      if (!drone?.alive || drone.droneRole !== "attack") return false;
      if (drone.isDeploying?.()) {
        drone.clearLockAttempt?.();
        return false;
      }
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
    },
    startSuicideDroneAttack(drone = this.player?.controlledDrone) {
      if (!drone?.alive || drone.droneRole !== "attack" || drone.diveActive) return false;
      if (drone.isDeploying?.()) return false;
      drone.clearLockAttempt?.();

      if ((drone.signalStrength?.() ?? 1) <= 0.04) {
        drone.failLock?.("\uC2E0\uD638 \uB04A\uAE40");
        return false;
      }

      const mouse = this.input.mouse;
      const attackAngle = angleTo(drone.x, drone.y, mouse.worldX, mouse.worldY);
      if (!drone.startDumbFire?.(this, attackAngle)) return false;

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
      return true;
    },
    togglePlayerDroneControl() {
      if (this.player.inTank) return false;
      if (this.player.controlledDrone) {
        this.exitPlayerDroneControl();
        return true;
      }

      const drone = this.activePlayerDrone();
      if (!drone) return false;
      if (drone.isDeploying?.()) return false;

      drone.autoReturn = false;
      drone.clearRoofLock?.();
      this.player.controlledDrone = drone;
      drone.controlled = true;
      this.droneInteractReleaseRequired = true;
      this.resetDroneInteractHold();
      this.input.clearVirtual?.();
      this.canvas?.focus?.();
      return true;
    },
    exitPlayerDroneControl() {
      const drone = this.player?.controlledDrone;
      if (drone) {
        drone.controlled = false;
        drone.recallable = true;
        this.setReconDroneWaypoint(drone, drone.x, drone.y);
      }
      if (this.player) this.player.controlledDrone = null;
      this.droneInteractReleaseRequired = false;
      this.canvas?.focus?.();
    },
    resetDroneInteractHold() {
      this.droneInteractHoldTime = 0;
      this.droneInteractHoldConsumed = false;
      this.droneInteractWasDown = false;
    },
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
    },
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
    },
    updateControlledDronePlayer(dt) {
      const drone = this.player.controlledDrone;
      if (!drone?.alive) {
        this.exitPlayerDroneControl();
        return;
      }
      if (drone.isDeploying?.()) return;

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
    },
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
    },
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
    },
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
    },
    findReconDroneDesignationTarget(drone = this.reconDroneDesignationUiDrone()) {
      const options = this.reconDroneDesignationOptions(drone) || [];
      return options.filter((item) => item.lockable)[0]?.target || null;
    },
    tryDesignateReconDroneFromMarker(drone = this.reconDroneDesignationUiDrone()) {
      if (!drone?.alive || this.player?.controlledDrone === drone || drone.droneRole === "attack") return false;
      const target = this.findReconDroneDesignationTarget(drone);
      return target ? this.designateReconDroneTarget(target, drone) : false;
    },
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
    },
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
    },
    droneDesignatedContact() {
      return this.droneDesignation?.target ? this.droneDesignation : null;
    },
    observedSniperRange(weapon, drone, designated = false) {
      const base = weapon?.range || INFANTRY_WEAPONS.sniper.range || 980;
      const control = drone?.maxControlRange || base * 2.25;
      const scanBonus = drone?.scanRange || 0;
      return designated
        ? Math.min(base * 2.85, control + scanBonus * 0.75)
        : Math.min(base * 2.45, control + scanBonus * 0.45);
    },
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
    },
    scoutObservationCameraZoom(observation) {
      if (!observation) return 0.72;
      const dx = Math.abs((observation.x || 0) - this.player.x);
      const dy = Math.abs((observation.y || 0) - this.player.y);
      const fitZoom = Math.min(
        (this.camera.width - 180) / Math.max(360, dx + 360),
        (this.camera.height - 150) / Math.max(320, dy + 320)
      );
      return clamp(fitZoom, observation.target ? 0.5 : 0.54, 0.72);
    },
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
    },
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
    },
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
        if ((this.player.equipmentAmmo?.[weapon.ammoKey] || 0) <= 0) return false;
        const thrown = IronLine.combat.throwGrenade(this, this.player, targetX, targetY, { weapon });
        if (!thrown) return false;
        this.consumePlayerEquipmentAmmo(weapon);
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


  };

  function installGameDroneSystem(Game) {
    Object.assign(Game.prototype, gameDroneSystemMethods);
  }

  IronLine.installGameDroneSystem = installGameDroneSystem;
})(window);

