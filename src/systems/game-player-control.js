"use strict";

(function registerGamePlayerControl(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, AMMO, INFANTRY_WEAPONS, PLAYER_CLASS_ORDER } = IronLine.constants;
  const {
    clamp,
    distXY,
    angleTo,
    normalizeAngle,
    rotateTowards,
    circleRectCollision,
    expandedRect,
    lineIntersectsRect,
    segmentDistanceToPoint
  } = IronLine.math;
  const { tryMoveCircle, resolveTankSpacing, hasLineOfSight, circleIntersectsTank } = IronLine.physics;

  const gamePlayerControlMethods = {
    updateDebugToggles() {
      if (this.input.consumePress("KeyG")) {
        this.debug.ai = !this.debug.ai;
      }

      if (this.input.consumePress("KeyN")) {
        this.debug.navGraph = !this.debug.navGraph;
      }
    },
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
    },
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
    },
    mobileAutoLoadTank(tank) {
      if (!this.settings?.mobileControls || !tank || tank.loadedAmmo || tank.reload.active) return false;
      const ammoId = tank.ammo.ap > 0 ? "ap" : tank.ammo.he > 0 ? "he" : null;
      return ammoId ? tank.beginLoad(ammoId) : false;
    },
    cycleMobileWeapon() {
      if (this.result || this.deploymentOpen || !this.player?.alive) return false;
      if (this.player.inTank) return this.cycleMobileTankAmmo(this.player.inTank);
      return this.cyclePlayerEquipment();
    },
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
    },
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
    },
    clearTankFireOrder(tank) {
      if (tank) tank.fireOrder = null;
    },
    fireTankMachineGun(tank, targetX, targetY) {
      if (!tank?.canFireMachineGun?.()) return false;
      const target = this.findTankMachineGunTarget(tank, targetX, targetY);
      return tank.fireMachineGun(this, targetX, targetY, { target });
    },
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
    },
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
    },
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
    },
    applyVirtualAim(focus, distance) {
      const point = this.input.virtualAimPoint(focus, distance);
      if (!point) return;
      this.input.mouse.worldX = point.x;
      this.input.mouse.worldY = point.y;
    },
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
    },
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
    },
    tankMuzzlePoint(tank) {
      const muzzleDistance = tank.radius + 28;
      return {
        x: tank.x + Math.cos(tank.turretAngle) * muzzleDistance,
        y: tank.y + Math.sin(tank.turretAngle) * muzzleDistance
      };
    },
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
    },
    clearPlayerProneState() {
      if (!this.player) return;
      this.player.isProne = false;
      this.player.proneTransitionTimer = 0;
      this.player.proneTargetState = false;
    },
    updatePlayerProneTransition(dt) {
      const player = this.player;
      if (!player) return;
      player.proneTransitionTimer = Math.max(0, (player.proneTransitionTimer || 0) - dt);
      if (player.proneTransitionTimer <= 0) {
        player.isProne = Boolean(player.proneTargetState);
      }
    },
    requestPlayerProneToggle() {
      const player = this.player;
      if (!player || player.inTank || player.controlledDrone || player.hp <= 0) return false;
      if ((player.proneTransitionTimer || 0) > 0) return false;

      player.proneTargetState = !player.isProne;
      player.proneTransitionTimer = player.proneTransitionDuration || 0.3;
      player.boosting = false;
      player.boostRecoverDelay = Math.max(player.boostRecoverDelay || 0, 0.36);
      return true;
    },
    isPlayerProneTransitioning() {
      return (this.player?.proneTransitionTimer || 0) > 0;
    },
    isPlayerProneLike() {
      return Boolean(this.player?.isProne || this.isPlayerProneTransitioning());
    },
    updateInfantryPlayer(dt) {
      this.player.rifleCooldown = Math.max(0, this.player.rifleCooldown - dt);
      this.player.gunKick = Math.max(0, (this.player.gunKick || 0) - dt * 11);
      this.player.fireHoldTimer = Math.max(0, (this.player.fireHoldTimer || 0) - dt);
      this.updateInfantryWeaponInput();
      this.updatePlayerProneTransition(dt);
      if (this.input.consumePress("KeyC")) {
        this.requestPlayerProneToggle();
      }
      const mouse = this.input.mouse;
      const weapon = this.player.getWeapon();
      const primaryPressed = this.input.consumeMousePress(0);
      const wantsUse = mouse.leftDown || primaryPressed || this.input.keyDown("Space");
      const fireHoldMode = this.updatePlayerFireHoldIntent(weapon, wantsUse);
      const scoutAimMode = this.isPlayerScoutAimMode();
      const rpgAimMode = this.isPlayerRpgAimMode();
      const machineGunAimMode = this.isPlayerMachineGunAimMode();
      const pistolAimMode = this.isPlayerPistolAimMode();
      this.player.scoutAim = scoutAimMode;
      this.player.rpgAim = rpgAimMode;
      this.player.machineGunAim = machineGunAimMode;
      this.player.pistolAim = pistolAimMode;
      this.player.rpgAimTime = rpgAimMode ? Math.min((this.player.rpgAimTime || 0) + dt, 0.7) : 0;
      const moveX = this.input.axis("KeyA", "ArrowLeft", "KeyD", "ArrowRight");
      const moveY = this.input.axis("KeyW", "ArrowUp", "KeyS", "ArrowDown");
      const length = Math.hypot(moveX, moveY);
      const prone = this.isPlayerProneLike();
      const baseInfantrySpeed = prone
        ? scoutAimMode ? 0 : rpgAimMode ? 34 : machineGunAimMode ? 38 : pistolAimMode ? 42 : fireHoldMode ? 44 : 46
        : scoutAimMode ? 0 : rpgAimMode ? 68 : machineGunAimMode ? 82 : pistolAimMode ? 118 : fireHoldMode ? 118 : 155;
      const sprinting = this.updateBoostState(this.player, dt, length > 0.05, {
        disabled: prone || scoutAimMode || rpgAimMode || machineGunAimMode || pistolAimMode || fireHoldMode,
        drainTime: 1.18,
        recoverTime: 2,
        recoverDelay: 0.45
      });
      const infantrySpeed = baseInfantrySpeed * (sprinting ? 1.42 : 1);
      const vx = length > 0 ? (moveX / length) * infantrySpeed : 0;
      const vy = length > 0 ? (moveY / length) * infantrySpeed : 0;

      tryMoveCircle(this, this.player, vx, vy, this.player.radius, dt, { blockTanks: true, padding: 5 });
      this.applyVirtualAim(this.player, scoutAimMode ? 1050 : rpgAimMode ? 980 : machineGunAimMode ? 880 : pistolAimMode ? 560 : fireHoldMode ? 760 : 650);
      if (scoutAimMode) this.applyDroneDesignationAimAssist(dt);

      this.player.angle = angleTo(this.player.x, this.player.y, mouse.worldX, mouse.worldY);
      this.player.interactPulse += dt;

      const markerDesignatePressed = this.input.consumePress("KeyQ") || this.input.consumeMousePress(1);
      if (markerDesignatePressed && this.tryDesignateReconDroneFromMarker()) return;
      if (wantsUse && this.player.rifleCooldown <= 0) {
        this.player.lastShotCooldownScale = 1;
        const fired = this.usePlayerEquipment(weapon, mouse.worldX, mouse.worldY);
        if (fired) {
          const cooldownScale = this.player.lastShotCooldownScale || 1;
          this.player.rifleCooldown = (weapon?.cooldown || 0.35) * cooldownScale;
          this.player.lastShotCooldownScale = 1;
        }
      }
    },
    updatePlayerFireHoldIntent(weapon, wantsUse) {
      const player = this.player;
      if (!player || player.inTank || player.controlledDrone || player.hp <= 0) return false;
      if (!wantsUse || !this.isPlayerFireHoldWeapon(weapon) || !this.hasPlayerWeaponAmmo(weapon)) {
        return Boolean((player.fireHoldTimer || 0) > 0);
      }

      const heavy = weapon.id === "machinegun" || weapon.id === "lmg";
      const holdTime = heavy ? 0.34 : weapon.id === "smg" || weapon.id === "pistol" ? 0.24 : 0.28;
      player.fireHoldTimer = Math.max(player.fireHoldTimer || 0, holdTime, (weapon.cooldown || 0.2) + 0.08);
      return true;
    },
    isPlayerFireHoldWeapon(weapon) {
      return Boolean(weapon?.type === "gun" && weapon.id !== "sniper");
    },
    isPlayerScoutAimMode() {
      if (this.player.inTank || this.player.controlledDrone || this.player.hp <= 0 || !this.input.mouse.rightDown) return false;
      const weapon = this.player.getWeapon?.();
      return this.player.classId === "scout" && weapon?.id === "sniper";
    },
    isPlayerRpgAimMode() {
      if (this.player.inTank || this.player.controlledDrone || this.player.hp <= 0 || !this.input.mouse.rightDown) return false;
      const weapon = this.player.getWeapon?.();
      return this.player.classId === "engineer" && weapon?.id === "rpg";
    },
    isPlayerMachineGunAimMode() {
      if (this.player.inTank || this.player.controlledDrone || this.player.hp <= 0 || !this.input.mouse.rightDown) return false;
      const weapon = this.player.getWeapon?.();
      return weapon?.id === "machinegun" || weapon?.id === "lmg";
    },
    isPlayerPistolAimMode() {
      if (this.player.inTank || this.player.controlledDrone || this.player.hp <= 0 || !this.input.mouse.rightDown) return false;
      const weapon = this.player.getWeapon?.();
      return weapon?.id === "pistol";
    },
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
          if (classId) this.applyFullPlayerClassLoadout?.(classId, { resetAmmo: true, clearDrones: true });
          continue;
        }

        if (this.player.setEquipmentSlot(i)) {
          this.player.rifleCooldown = Math.min(this.player.rifleCooldown, 0.12);
        }
      }
    },

  };

  function installGamePlayerControl(Game) {
    Object.assign(Game.prototype, gamePlayerControlMethods);
  }

  IronLine.installGamePlayerControl = installGamePlayerControl;
})(window);
