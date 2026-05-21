"use strict";

(function registerInfantryWeaponDecision(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, INFANTRY_WEAPONS } = IronLine.constants;
  const { clamp, distXY, angleTo, normalizeAngle } = IronLine.math;
  const { hasLineOfSight } = IronLine.physics;
  const INFANTRY_CONFIG = IronLine.InfantryAIConfig;

  const infantryWeaponDecisionMethods = {
    grenadeWeapons() {
      return ["grenadeLauncher", "grenade"]
        .map((weaponId) => INFANTRY_WEAPONS[weaponId])
        .filter((weapon) => (
          weapon &&
          (this.unit.equipmentAmmo?.[weapon.ammoKey || weapon.id] || 0) > 0
        ));
    },
    hasGrenade(weaponId = "") {
      if (weaponId) {
        const weapon = INFANTRY_WEAPONS[weaponId];
        return Boolean(weapon && (this.unit.equipmentAmmo?.[weapon.ammoKey || weapon.id] || 0) > 0);
      }
      return this.grenadeWeapons().length > 0;
    },
    resetGrenadeAim(reason = "") {
      this.grenadeAimTargetKey = "";
      this.grenadeAimTime = 0;
      this.grenadeAimRequired = 0;
      this.grenadePreparing = false;
      this.grenadeWeaponId = "";
      if (reason) this.grenadeHoldReason = reason;
    },
    grenadeTargetKey(target) {
      const item = target?.target || target;
      if (!item) return "";
      return item.callSign || `${item.team || "target"}:${Math.round(item.x)}:${Math.round(item.y)}`;
    },
    updateGrenadeAim(target, dt = 0.033) {
      const weapon = target?.weapon || INFANTRY_WEAPONS.grenade;
      const key = this.grenadeTargetKey(target);
      if (!weapon || !key) {
        this.resetGrenadeAim("no-target");
        return false;
      }

      if (this.grenadeAimTargetKey !== key) {
        this.grenadeAimTargetKey = key;
        this.grenadeAimTime = 0;
      }

      this.grenadeWeaponId = weapon.id;
      const distance = distXY(this.unit.x, this.unit.y, target.x, target.y);
      const required = clamp(
        INFANTRY_CONFIG.grenadeAimMin +
          distance / Math.max(1, weapon.range || 360) * 0.32 +
          (target.reason === "light-vehicle" || target.reason === "armor-track" ? 0.16 : 0),
        INFANTRY_CONFIG.grenadeAimMin,
        INFANTRY_CONFIG.grenadeAimMax
      );
      const facingError = Math.abs(normalizeAngle(this.unit.angle - angleTo(this.unit.x, this.unit.y, target.x, target.y)));
      const facingGain = facingError < 0.18 ? 1 : facingError < 0.38 ? 0.52 : 0.18;

      this.grenadeAimRequired = required;
      this.grenadeAimTime = clamp(this.grenadeAimTime + dt * facingGain, 0, required);
      this.grenadePreparing = this.grenadeAimTime < required;
      return this.grenadeAimTime >= required;
    },
    grenadeSoftTargets() {
      const targets = [];

      for (const unit of this.game.infantry || []) {
        if (unit === this.unit || !unit.alive || unit.inVehicle || unit.team === this.unit.team) continue;
        targets.push(unit);
      }

      for (const crew of this.game.crews || []) {
        if (!crew.alive || crew.inTank || crew.team === this.unit.team) continue;
        targets.push(crew);
      }

      if (!this.game.player.inTank && this.game.player.hp > 0 && this.unit.team === TEAM.RED && !this.game.isPlayerInSafeZone?.()) {
        targets.push(this.game.player);
      }

      return targets;
    },
    selectGrenadeTarget(contact, tankThreat) {
      const weapons = this.grenadeWeapons();
      if (!weapons.length) {
        this.resetGrenadeAim?.("no-ammo");
        return null;
      }
      if (this.fireCooldown > 0 || this.grenadeCooldown > 0) return null;
      if (this.unit.suppression > 64) {
        this.resetGrenadeAim?.("suppressed");
        return null;
      }
      const hasLauncher = weapons.some((weapon) => weapon.id === "grenadeLauncher");
      if (!hasLauncher && tankThreat && distXY(this.unit.x, this.unit.y, tankThreat.x, tankThreat.y) < 340) {
        this.resetGrenadeAim?.("tank-threat");
        return null;
      }

      const softTargets = this.grenadeSoftTargets();
      let best = null;

      const addCandidate = (weapon, point, target, score, reason) => {
        const distance = distXY(this.unit.x, this.unit.y, point.x, point.y);
        if (distance < INFANTRY_CONFIG.grenadeMinRange || distance > weapon.range) return;
        if (!this.isGrenadePointSafe(point, weapon)) return;

        const candidate = {
          x: point.x,
          y: point.y,
          target,
          weapon,
          score: score + (weapon.id === "grenadeLauncher" ? 0.18 : 0) - distance / Math.max(weapon.range * 2.2, 1),
          reason,
          stopDistance: 0,
          final: false,
          grenade: true
        };
        if (!best || candidate.score > best.score) best = candidate;
      };

      for (const weapon of weapons) {
        for (const target of softTargets) {
          const visible = hasLineOfSight(this.game, this.unit, target, { padding: 3 });
          const report = visible ? null : this.game.getReportedContact?.(this.unit.team, target);
          const aimPoint = visible || contact === target
            ? target
            : report
              ? this.reportPoint(report)
              : null;
          if (!aimPoint) continue;

          const distance = distXY(this.unit.x, this.unit.y, aimPoint.x, aimPoint.y);
          if (distance > weapon.range + INFANTRY_CONFIG.grenadeClusterRadius) continue;

          const cluster = visible
            ? this.grenadeClusterAt(target, softTargets)
            : this.grenadeReportedClusterAt(aimPoint);
          const vehicleDistance = this.nearestKnownVehicleDistance(aimPoint);
          const covered = !visible;
          const nearVehicle = vehicleDistance <= INFANTRY_CONFIG.grenadeVehicleThreatRange;
          const score =
            cluster.count * 1.05 +
            Math.max(0, cluster.count - 1) * 0.28 +
            (covered ? 1.05 : 0) +
            (nearVehicle ? 1.15 : 0) +
            (target.classId === "engineer" ? 0.18 : 0);

          if (score >= INFANTRY_CONFIG.grenadeScoreThreshold) {
            addCandidate(weapon, cluster.center, target, score, covered ? "cover" : nearVehicle ? "vehicle" : "cluster");
          }
        }

        for (const vehicle of this.vehicleTargets()) {
          if (!vehicle.alive || vehicle.team === this.unit.team) continue;
          const armored = vehicle.vehicleType !== "humvee";
          if (armored && weapon.id !== "grenadeLauncher") continue;
          const visible = hasLineOfSight(this.game, this.unit, vehicle, { padding: 4 });
          const report = visible ? null : this.game.getReportedContact?.(this.unit.team, vehicle);
          const aimPoint = visible ? vehicle : report ? this.reportPoint(report) : null;
          if (!aimPoint) continue;
          addCandidate(weapon, aimPoint, vehicle, visible ? (armored ? 2.85 : 2.45) : (armored ? 2.45 : 2.22), armored ? "armor-track" : "light-vehicle");
        }
      }

      if (!best || best.score < INFANTRY_CONFIG.grenadeScoreThreshold) {
        this.resetGrenadeAim?.("no-target");
        return null;
      }
      return best;
    },
    grenadeClusterAt(target, targets) {
      const members = targets.filter((item) => (
        item.alive !== false &&
        distXY(target.x, target.y, item.x, item.y) <= INFANTRY_CONFIG.grenadeClusterRadius
      ));
      const center = members.reduce((sum, item) => ({
        x: sum.x + item.x,
        y: sum.y + item.y
      }), { x: 0, y: 0 });
      const count = Math.max(1, members.length);
      center.x /= count;
      center.y /= count;
      return { count, center };
    },
    grenadeReportedClusterAt(point) {
      const reports = this.game.getReportedContacts?.(this.unit.team) || [];
      const members = reports.filter((report) => (
        !this.isVehicleTarget(report.target) &&
        this.isAliveEnemy(report.target) &&
        distXY(point.x, point.y, report.x, report.y) <= INFANTRY_CONFIG.grenadeClusterRadius
      ));

      if (!members.length) return { count: 1, center: { x: point.x, y: point.y } };

      const center = members.reduce((sum, report) => ({
        x: sum.x + report.x,
        y: sum.y + report.y
      }), { x: 0, y: 0 });
      center.x /= members.length;
      center.y /= members.length;
      return { count: members.length, center };
    },
    nearestKnownVehicleDistance(point) {
      let best = Infinity;

      for (const vehicle of this.vehicleTargets()) {
        if (!vehicle.alive) continue;
        const visible = hasLineOfSight(this.game, this.unit, vehicle, { padding: 4 });
        const report = visible ? null : this.game.getReportedContact?.(this.unit.team, vehicle);
        const known = visible ? vehicle : report;
        if (!known) continue;
        best = Math.min(best, Math.max(0, distXY(point.x, point.y, known.x, known.y) - (vehicle.radius || 0)));
      }

      return best;
    },
    isGrenadePointSafe(point, weapon = INFANTRY_WEAPONS.grenade) {
      const safety = Math.max(INFANTRY_CONFIG.grenadeFriendlySafety, Math.min(78, (weapon?.splash || 110) * 0.44));

      for (const unit of this.game.infantry || []) {
        if (!unit.alive || unit.inVehicle || unit.team !== this.unit.team) continue;
        if (distXY(point.x, point.y, unit.x, unit.y) <= safety) return false;
      }

      for (const crew of this.game.crews || []) {
        if (!crew.alive || crew.inTank || crew.team !== this.unit.team) continue;
        if (distXY(point.x, point.y, crew.x, crew.y) <= safety) return false;
      }

      if (!this.game.player.inTank && this.game.player.hp > 0 && this.unit.team === TEAM.BLUE) {
        if (distXY(point.x, point.y, this.game.player.x, this.game.player.y) <= safety) return false;
      }

      return true;
    },
    tryThrowGrenade(target, dt = 0.033) {
      const weapon = target?.weapon || INFANTRY_WEAPONS.grenade;
      this.grenadePreparing = false;
      if (!weapon || !target || !this.hasGrenade(weapon.id)) {
        this.resetGrenadeAim("no-ammo");
        return false;
      }
      if (this.fireCooldown > 0 || this.grenadeCooldown > 0) return false;

      const distance = distXY(this.unit.x, this.unit.y, target.x, target.y);
      if (distance < INFANTRY_CONFIG.grenadeMinRange || distance > weapon.range) {
        this.resetGrenadeAim("range");
        return false;
      }
      if (!this.updateGrenadeAim(target, dt)) return false;

      const fired = IronLine.combat.throwGrenade(this.game, this.unit, target.x, target.y, { weapon });
      if (!fired) return false;

      const ammoKey = weapon.ammoKey || weapon.id || "grenade";
      this.unit.equipmentAmmo[ammoKey] = Math.max(0, (this.unit.equipmentAmmo[ammoKey] || 0) - 1);
      this.resetGrenadeAim();
      this.grenadeWeaponId = weapon.id;
      this.fireCooldown = weapon.cooldown + 0.38 + Math.random() * 0.28;
      this.grenadeCooldown = INFANTRY_CONFIG.grenadeCooldownMin +
        Math.random() * (INFANTRY_CONFIG.grenadeCooldownMax - INFANTRY_CONFIG.grenadeCooldownMin);
      this.unit.suppress(5, target.target || target);
      return true;
    },
    ownedAiDrone(role = "") {
      return (this.game.drones || []).find((drone) => (
        drone?.alive &&
        drone.owner === this.unit &&
        (!role || (role === "attack" ? drone.droneRole === "attack" : drone.droneRole !== "attack"))
      )) || null;
    },
    aiDroneTarget(contact, tankThreat, options = {}) {
      const attack = options.attack === true;
      const targets = [];
      const addTarget = (target, score = 0) => {
        if (!target || target.team === this.unit.team) return;
        const alive = target.alive !== undefined ? target.alive : target.hp > 0;
        if (!alive || target.inVehicle || target.inTank) return;
        const distance = distXY(this.unit.x, this.unit.y, target.x, target.y);
        targets.push({ target, distance, score });
      };

      if (tankThreat) addTarget(tankThreat, attack ? 320 : 180);
      for (const vehicle of this.vehicleTargets()) {
        if (!vehicle.alive || vehicle.team === this.unit.team) continue;
        const report = this.game.getReportedContact?.(this.unit.team, vehicle);
        const known = hasLineOfSight(this.game, this.unit, vehicle, { padding: 4 }) ? vehicle : report;
        if (!known) continue;
        addTarget(vehicle, (vehicle.vehicleType === "humvee" ? 240 : 300) + (vehicle.isPlayerTank ? 90 : 0));
      }
      if (contact) addTarget(contact, attack ? 90 : 140);
      for (const report of this.game.getReportedContacts?.(this.unit.team) || []) {
        if (!report.target || report.target.team === this.unit.team) continue;
        if (attack && !this.isVehicleTarget(report.target)) continue;
        addTarget(report.target, (report.confidence || 0.5) * 120);
      }

      const maxRange = attack ? INFANTRY_CONFIG.suicideDroneStrikeRange : INFANTRY_CONFIG.reconDroneObserveRange;
      return targets
        .filter((item) => item.distance <= maxRange)
        .sort((a, b) => (b.score - b.distance * 0.18) - (a.score - a.distance * 0.18))[0]?.target || null;
    },
    isAiDroneStrikeSafe(target, weapon = INFANTRY_WEAPONS.kamikazeDrone) {
      if (!target) return false;
      const vehicleTarget = Boolean(target.vehicleType || target.ammo);
      const safety = vehicleTarget
        ? Math.max(68, (weapon?.splash || 132) * 0.42)
        : Math.max(INFANTRY_CONFIG.suicideDroneFriendlySafety, (weapon?.splash || 132) * 0.64);
      for (const unit of this.game.infantry || []) {
        if (!unit.alive || unit.inVehicle || unit.team !== this.unit.team || unit === this.unit) continue;
        if (distXY(target.x, target.y, unit.x, unit.y) <= safety) return false;
      }
      for (const crew of this.game.crews || []) {
        if (!crew.alive || crew.inTank || crew.team !== this.unit.team) continue;
        if (distXY(target.x, target.y, crew.x, crew.y) <= safety) return false;
      }
      if (this.game.player?.team === this.unit.team && this.game.player.hp > 0 && !this.game.player.inTank) {
        if (distXY(target.x, target.y, this.game.player.x, this.game.player.y) <= safety) return false;
      }
      return true;
    },
    aiReconWaypoint(target, order = null) {
      const anchor = target || order?.point;
      if (!anchor) return null;
      const targetIsEnemy = target && target.team && target.team !== this.unit.team;
      if (!targetIsEnemy) {
        return {
          x: clamp(anchor.x, 20, this.game.world.width - 20),
          y: clamp(anchor.y, 20, this.game.world.height - 20)
        };
      }

      const weapon = INFANTRY_WEAPONS.reconDrone || {};
      const standoff = clamp((weapon.scanRange || 620) * 0.52, 260, 420);
      const fromTargetAngle = angleTo(target.x, target.y, this.unit.x, this.unit.y);
      const side = (this.seed % 2 === 0 ? 1 : -1) * 0.42;
      const angle = fromTargetAngle + side;
      return {
        x: clamp(target.x + Math.cos(angle) * standoff, 20, this.game.world.width - 20),
        y: clamp(target.y + Math.sin(angle) * standoff, 20, this.game.world.height - 20)
      };
    },
    launchAiReconDrone(target, order = null) {
      const weapon = INFANTRY_WEAPONS.reconDrone;
      if (!weapon || this.unit.classId !== "scout") return false;
      const existing = this.ownedAiDrone("recon");
      const waypoint = this.aiReconWaypoint(target, order);
      if (!waypoint) return false;

      if (existing) {
        if (this.droneCommandTimer <= 0) {
          this.game.setReconDroneWaypoint?.(existing, waypoint.x, waypoint.y) || existing.setWaypoint?.(waypoint.x, waypoint.y);
          this.droneCommandTimer = 1.1 + Math.random() * 0.45;
          this.aiDroneState = "recon-guide";
          return true;
        }
        return false;
      }

      if (this.droneCooldown > 0 || (this.unit.equipmentAmmo?.reconDrone || 0) <= 0 || this.unit.suppression > 70) return false;

      const angle = angleTo(this.unit.x, this.unit.y, waypoint.x, waypoint.y);
      const drone = new IronLine.ReconDrone({
        x: clamp(this.unit.x + Math.cos(angle) * 34, 12, this.game.world.width - 12),
        y: clamp(this.unit.y + Math.sin(angle) * 34, 12, this.game.world.height - 12),
        angle,
        team: this.unit.team,
        owner: this.unit,
        weapon,
        targetX: waypoint.x,
        targetY: waypoint.y,
        callSign: `${this.unit.callSign || "AI"}-UAV`
      });
      this.game.setReconDroneWaypoint?.(drone, waypoint.x, waypoint.y) || drone.setWaypoint?.(waypoint.x, waypoint.y);
      (this.game.drones || (this.game.drones = [])).push(drone);
      this.unit.equipmentAmmo.reconDrone = Math.max(0, (this.unit.equipmentAmmo.reconDrone || 0) - 1);
      this.droneCooldown = INFANTRY_CONFIG.droneDeployCooldownMin +
        Math.random() * (INFANTRY_CONFIG.droneDeployCooldownMax - INFANTRY_CONFIG.droneDeployCooldownMin);
      this.aiDroneState = "recon";
      return true;
    },
    launchAiSuicideDrone(target) {
      const weapon = INFANTRY_WEAPONS.kamikazeDrone;
      if (!weapon || this.unit.classId !== "engineer" || !target) return false;
      if (!this.isAiDroneStrikeSafe(target, weapon)) return false;
      const existing = this.ownedAiDrone("attack");

      if (existing) {
        existing.setAiTarget?.(target);
        if (existing.diveActive) {
          existing.boosting = true;
          this.aiDroneState = "strike";
          return true;
        }
        const droneDistance = distXY(existing.x, existing.y, target.x, target.y);
        const canLock = droneDistance <= (existing.lockAcquireRange || weapon.lockAcquireRange || 720) + (target.radius || 0) &&
          hasLineOfSight(this.game, existing, target, this.game.droneSightOptions?.(existing, { padding: 1 }) || { padding: 1 });
        if (canLock) {
          existing.lockOn?.(target);
          existing.boosting = true;
          if (existing.startAttackDive?.(this.game)) {
            this.aiDroneState = "strike";
            return true;
          }
        }
        existing.clearRoofLock?.();
        existing.setWaypoint?.(target.x, target.y);
        existing.boosting = droneDistance > 340;
        this.aiDroneState = "guide";
        return true;
      }

      const distance = distXY(this.unit.x, this.unit.y, target.x, target.y);
      if (distance < INFANTRY_CONFIG.suicideDronePreferredMin || distance > INFANTRY_CONFIG.suicideDronePreferredMax) return false;
      if (this.droneCooldown > 0 || (this.unit.equipmentAmmo?.kamikazeDrone || 0) <= 0 || this.unit.suppression > 78) return false;

      const angle = angleTo(this.unit.x, this.unit.y, target.x, target.y);
      const drone = new IronLine.SuicideDrone({
        x: clamp(this.unit.x + Math.cos(angle) * 34, 12, this.game.world.width - 12),
        y: clamp(this.unit.y + Math.sin(angle) * 34, 12, this.game.world.height - 12),
        angle,
        team: this.unit.team,
        owner: this.unit,
        weapon,
        aiControlled: true,
        aiTarget: target,
        targetX: target.x,
        targetY: target.y,
        callSign: `${this.unit.callSign || "AI"}-FPV`
      });
      drone.setAiTarget?.(target);
      drone.setWaypoint?.(target.x, target.y);
      drone.boosting = distance > 420;
      (this.game.drones || (this.game.drones = [])).push(drone);
      this.unit.equipmentAmmo.kamikazeDrone = Math.max(0, (this.unit.equipmentAmmo.kamikazeDrone || 0) - 1);
      this.droneCooldown = INFANTRY_CONFIG.droneDeployCooldownMin +
        Math.random() * (INFANTRY_CONFIG.droneDeployCooldownMax - INFANTRY_CONFIG.droneDeployCooldownMin);
      this.aiDroneState = "deploy";
      return true;
    },
    tryUseAiDrone(dt, order, contact, tankThreat) {
      this.aiDroneState = "";
      if (this.unit.inVehicle || this.fireCooldown > 0) return false;

      if (this.unit.classId === "scout") {
        const target = this.aiDroneTarget(contact, tankThreat, { attack: false }) || order?.point;
        if (!target) return false;
        const deployed = this.launchAiReconDrone(target, order);
        if (!deployed) return false;
        this.state = "recon-drone";
        this.target = contact || tankThreat || null;
        this.unit.speed = 0;
        this.updateDebug?.(target);
        return true;
      }

      if (this.unit.classId !== "engineer") return false;
      const target = this.aiDroneTarget(contact, tankThreat, { attack: true });
      if (!target) return false;
      const used = this.launchAiSuicideDrone(target);
      if (!used) return false;
      this.state = this.aiDroneState === "strike" ? "drone-strike" : this.aiDroneState === "guide" ? "drone-guide" : "drone-deploy";
      this.target = target;
      this.faceContact?.(target, dt);
      this.unit.speed = 0;
      this.updateDebug?.(null);
      return true;
    },
    vehicleTargets() {
      return [
        ...(this.game.tanks || []),
        ...(this.game.humvees || [])
      ];
    },
    hasRpg() {
      return this.unit.classId === "engineer" &&
        (this.unit.equipmentAmmo?.rpg || 0) > 0 &&
        Boolean(INFANTRY_WEAPONS.rpg);
    },
    rpgPressureCount(tank) {
      if (!tank) return 0;
      let count = 0;
      const weapon = INFANTRY_WEAPONS.rpg || {};
      const maxRange = Math.min(weapon.range || 980, INFANTRY_CONFIG.rpgPressureRadius);

      for (const unit of this.game.infantry || []) {
        if (!unit.alive || unit.inVehicle || unit.team !== this.unit.team || unit.classId !== "engineer") continue;
        if ((unit.equipmentAmmo?.rpg || 0) <= 0) continue;
        const distance = distXY(unit.x, unit.y, tank.x, tank.y);
        if (distance > maxRange) continue;
        count += 1;
      }

      return count;
    },
    rpgTargetKey(tank) {
      if (!tank) return "";
      return tank.callSign || `${tank.team || "veh"}:${Math.round(tank.x)}:${Math.round(tank.y)}`;
    },
    rpgShotProfile(tank, distance = null, pressureCount = null) {
      const d = distance ?? (tank ? distXY(this.unit.x, this.unit.y, tank.x, tank.y) : Infinity);
      const pressure = pressureCount ?? this.rpgPressureCount(tank);
      const targetSpeed = Math.abs(tank?.speed || 0);
      const stableLimit = tank?.vehicleType === "humvee"
        ? INFANTRY_CONFIG.rpgStableTargetSpeed * 1.45
        : INFANTRY_CONFIG.rpgStableTargetSpeed;
      const fastLimit = tank?.vehicleType === "humvee"
        ? INFANTRY_CONFIG.rpgFastTargetSpeed * 1.35
        : INFANTRY_CONFIG.rpgFastTargetSpeed;
      const aspectAngle = tank
        ? Math.abs(normalizeAngle(angleTo(tank.x, tank.y, this.unit.x, this.unit.y) - (tank.angle || 0)))
        : Math.PI / 2;
      const armoredTarget = tank?.vehicleType !== "humvee";
      const frontArmor = armoredTarget && aspectAngle < 0.72;
      const sideOrRear = !armoredTarget || aspectAngle > 1.05;
      const rearAspect = armoredTarget && aspectAngle > 2.35;
      const frontHoldRange = pressure >= 2
        ? INFANTRY_CONFIG.rpgFrontArmorHoldRange + 150
        : INFANTRY_CONFIG.rpgFrontArmorHoldRange;
      const frontArmorHold = frontArmor && d > frontHoldRange;
      const movingFast = targetSpeed > fastLimit &&
        !(sideOrRear && d < 520 && pressure >= 2);
      const stableTarget = targetSpeed <= stableLimit ||
        rearAspect ||
        (sideOrRear && targetSpeed <= fastLimit * 0.82);
      const jitter = ((this.seed % 7) - 3) * 0.035;
      const aimRequired = clamp(
        INFANTRY_CONFIG.rpgAimMin +
          targetSpeed / Math.max(1, fastLimit) * 0.42 +
          (frontArmor ? 0.28 : 0) -
          (sideOrRear ? 0.16 : 0) -
          Math.min(2, Math.max(0, pressure - 1)) * 0.08 +
          jitter,
        INFANTRY_CONFIG.rpgAimMin * 0.82,
        INFANTRY_CONFIG.rpgAimMax
      );

      return {
        distance: d,
        pressureCount: pressure,
        targetSpeed,
        stableLimit,
        fastLimit,
        aspectAngle,
        frontArmor,
        sideOrRear,
        rearAspect,
        frontArmorHold,
        movingFast,
        stableTarget,
        aimRequired,
        holdReason: movingFast ? "fast-target" : frontArmorHold ? "front-armor" : ""
      };
    },
    rpgVolleyBlocked(tank) {
      const squad = this.unit.squad;
      if (!squad) return false;
      const until = squad.rpgVolleyUntil || 0;
      if ((this.game.matchTime || 0) >= until) return false;
      const key = this.rpgTargetKey(tank);
      return !squad.rpgVolleyTargetKey || squad.rpgVolleyTargetKey === key;
    },
    markRpgVolley(tank) {
      const squad = this.unit.squad;
      if (!squad) return;
      const cooldown = INFANTRY_CONFIG.rpgVolleyCooldownMin +
        Math.random() * (INFANTRY_CONFIG.rpgVolleyCooldownMax - INFANTRY_CONFIG.rpgVolleyCooldownMin);
      squad.rpgVolleyUntil = (this.game.matchTime || 0) + cooldown;
      squad.rpgVolleyTargetKey = this.rpgTargetKey(tank);
    },
    resetRpgAim(reason = "") {
      this.rpgAimTargetKey = "";
      this.rpgAimTime = 0;
      this.rpgAimRequired = 0;
      if (reason) this.rpgHoldReason = reason;
    },
    updateRpgAim(tank, profile, dt = 0.033) {
      const key = this.rpgTargetKey(tank);
      if (!key) {
        this.resetRpgAim();
        return false;
      }

      if (this.rpgAimTargetKey !== key) {
        this.rpgAimTargetKey = key;
        this.rpgAimTime = 0;
      }

      const required = profile?.aimRequired || INFANTRY_CONFIG.rpgAimMin;
      this.rpgAimRequired = required;
      const facingError = Math.abs(normalizeAngle(this.unit.angle - angleTo(this.unit.x, this.unit.y, tank.x, tank.y)));
      const facingGain = facingError < 0.16 ? 1 : facingError < 0.34 ? 0.46 : 0.14;
      const stabilityGain = profile?.stableTarget ? 1 : 0.48;

      if (profile?.holdReason) {
        this.rpgHoldReason = profile.holdReason;
        this.rpgAimTime = Math.min(required * 0.72, this.rpgAimTime + dt * 0.25);
        return false;
      }

      if (this.rpgVolleyBlocked(tank)) {
        this.rpgHoldReason = "volley-cooldown";
        this.rpgAimTime = Math.min(required * 0.92, this.rpgAimTime + dt * 0.38);
        return false;
      }

      this.rpgAimTime = clamp(this.rpgAimTime + dt * facingGain * stabilityGain, 0, required);
      return this.rpgAimTime >= required;
    }


  };

  function installInfantryWeaponDecision(InfantryAI) {
    Object.assign(InfantryAI.prototype, infantryWeaponDecisionMethods);
  }

  IronLine.installInfantryWeaponDecision = installInfantryWeaponDecision;
  if (IronLine.InfantryAI) installInfantryWeaponDecision(IronLine.InfantryAI);
})(window);
