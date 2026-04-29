"use strict";

(function registerInfantryAI(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, AMMO, INFANTRY_WEAPONS } = IronLine.constants;
  const { clamp, distXY, angleTo, approach, normalizeAngle, rotateTowards, expandedRect, lineIntersectsRect, circleRectCollision, segmentDistanceToPoint } = IronLine.math;
  const { tryMoveCircle, hasLineOfSight, circleIntersectsTank } = IronLine.physics;

  const INFANTRY_CONFIG = {
    sightRange: 620,
    coverThreatRange: 720,
    coverDuration: 2.7,
    suppressedThreshold: 58,
    tankHarassRange: 600,
    tankHarassMinGroup: 2,
    tankEvadeRange: 620,
    rpgDangerRange: 275,
    rpgPreferredMin: 430,
    rpgPreferredMax: 780,
    rpgPressureRadius: 820,
    rpgMinRange: 190,
    rpgPanicRange: 330,
    rpgAimMin: 1.0,
    rpgAimMax: 1.7,
    rpgStableTargetSpeed: 58,
    rpgFastTargetSpeed: 112,
    rpgFrontArmorHoldRange: 520,
    rpgVolleyCooldownMin: 2.35,
    rpgVolleyCooldownMax: 3.15,
    sharedContactTtl: 2.35,
    sharedVehicleContactTtl: 2.8,
    reportedSoftContactRange: 760,
    reportedVehicleContactRange: 1120,
    reportedInvestigateStopDistance: 132,
    grenadeMinRange: 86,
    grenadeClusterRadius: 112,
    grenadeVehicleThreatRange: 150,
    grenadeFriendlySafety: 56,
    grenadeScoreThreshold: 2,
    grenadeCooldownMin: 5.4,
    grenadeCooldownMax: 8.2,
    repairSearchRange: 760,
    repairUnsafeEnemyRange: 540,
    repairHoldDistance: 58,
    scoutSightRange: 1080,
    scoutReportRange: 1220,
    scoutReportTtl: 3.8,
    scoutWatchMin: 2.2,
    scoutWatchMax: 4.8,
    scoutPatrolMinDistance: 54,
    scoutPatrolMaxDistance: 118,
    visionHalfAngle: 1.33,
    scoutVisionHalfAngle: 1.68,
    peripheralAwarenessRange: 150,
    rearAwarenessRange: 82,
    reactionDelayMin: 0.18,
    reactionDelayMax: 0.82,
    fireFacingTolerance: 0.42
  };

  class InfantryAI {
    constructor(unit, game) {
      this.unit = unit;
      this.game = game;
      this.state = "advance";
      this.order = null;
      this.path = [];
      this.pathIndex = 0;
      this.orderId = "";
      this.repathTimer = 0;
      this.stuckTimer = 0;
      this.fireCooldown = Math.random() * 0.35;
      this.grenadeCooldown = 1.4 + Math.random() * 2.2;
      this.coverTimer = 0;
      this.coverTarget = null;
      this.reconPostId = "";
      this.reconWatchTimer = 0;
      this.reconPatrolTarget = null;
      this.reconPatrolStep = 0;
      this.reconEgressTimer = 0;
      this.reconEgressSkipUntil = 0;
      this.recoveryTarget = null;
      this.recoveryTimer = 0;
      this.reportTimer = Math.random() * 0.35;
      this.target = null;
      this.awarenessTarget = null;
      this.awarenessTimer = 0;
      this.reactionDelay = 0;
      this.rpgAimTargetKey = "";
      this.rpgAimTime = 0;
      this.rpgAimRequired = 0;
      this.rpgHoldReason = "";
      this.moveHeading = unit.angle;
      this.seed = this.hash(unit.callSign);
      this.thoughtText = "";
      this.thoughtTimer = 0;
      this.thoughtCooldown = 1 + (this.seed % 9) * 0.28;
      this.lastThoughtKey = "";
      this.debug = {
        state: this.state,
        goal: "",
        target: null,
        coverTarget: null,
        moveTarget: null,
        weaponId: this.unit.weaponId,
        classId: this.unit.classId,
        rpgAmmo: this.unit.equipmentAmmo?.rpg || 0,
        rpgAim: 0,
        rpgAimRequired: 0,
        rpgHoldReason: "",
        grenadeAmmo: this.unit.equipmentAmmo?.grenade || 0,
        repairAmmo: this.unit.equipmentAmmo?.repairKit || 0,
        squadId: "",
        squadRole: "",
        tacticalTimerRemaining: 0,
        isProne: false,
        transportMode: "",
        transportVehicleId: "",
        scoutReports: 0,
        coverQuality: 0,
        suppression: 0,
        morale: 1,
        thought: "",
        path: [],
        pathIndex: 0,
        stuckTimer: 0
      };
    }

    hash(value) {
      return String(value).split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
    }

    weapon() {
      return INFANTRY_WEAPONS[this.unit.weaponId] || INFANTRY_WEAPONS.rifle;
    }

    squadRole() {
      const weapon = this.weapon();
      if (this.order?.squadRole || this.unit.squadRole) return this.order?.squadRole || this.unit.squadRole;
      return weapon.id === "lmg" || weapon.id === "machinegun" ? "support" : "assault";
    }

    isSupportWeapon(weapon = this.weapon()) {
      return weapon.id === "lmg" || weapon.id === "machinegun";
    }

    proneSuppressionThreshold(role = this.squadRole(), weapon = this.weapon(), mode = "contact") {
      if (this.isSupportWeapon(weapon) || role === "support") return mode === "suppressed" ? 30 : 24;
      if (role === "security") return mode === "suppressed" ? 40 : 34;
      return mode === "suppressed" ? 56 : 48;
    }

    canEnterProne(options = {}) {
      const weapon = options.weapon || this.weapon();
      const role = options.role || this.squadRole();
      if (options.force) return true;
      if ((this.unit.proneCooldown || 0) > 0) return false;
      if (weapon.id === "rpg") return false;

      const threshold = this.proneSuppressionThreshold(role, weapon, options.mode);
      if ((this.unit.suppression || 0) < threshold) return false;

      if (options.distance !== undefined && weapon.desiredRange) {
        const minScale = role === "support" || this.isSupportWeapon(weapon) ? 0.58 : role === "security" ? 0.72 : 0.92;
        if (options.distance < weapon.desiredRange * minScale) return false;
      }

      return true;
    }

    enterProne(options = {}) {
      if (!this.canEnterProne(options)) return false;
      this.unit.isProne = true;
      this.unit.proneHoldTimer = Math.max(this.unit.proneHoldTimer || 0, options.hold || 1.15);
      return true;
    }

    clearProne(cooldown = 1.2, instant = false) {
      if (this.unit.isProne && !instant) {
        this.unit.proneCooldown = Math.max(this.unit.proneCooldown || 0, cooldown);
      }
      this.unit.isProne = false;
    }

    sightRange() {
      return this.unit.classId === "scout" ? INFANTRY_CONFIG.scoutSightRange : INFANTRY_CONFIG.sightRange;
    }

    update(dt) {
      const beforeX = this.unit.x;
      const beforeY = this.unit.y;
      this.thoughtTimer = Math.max(0, this.thoughtTimer - dt);
      this.thoughtCooldown = Math.max(0, this.thoughtCooldown - dt);
      if (this.unit.inVehicle) {
        this.clearProne(0, true);
        this.state = "mounted-transport";
        this.unit.speed = approach(this.unit.speed, 0, 260 * dt);
        this.updateDebug(null);
        return;
      }
      this.repathTimer = Math.max(0, this.repathTimer - dt);
      this.fireCooldown = Math.max(0, this.fireCooldown - dt);
      this.grenadeCooldown = Math.max(0, this.grenadeCooldown - dt);
      this.coverTimer = Math.max(0, this.coverTimer - dt);
      this.reportTimer = Math.max(0, this.reportTimer - dt);
      this.rpgHoldReason = "";

      const order = this.resolveOrder();
      this.order = order;
      const contact = this.selectTarget();
      const tankThreat = this.selectTankThreat();
      this.updateTargetAwareness(contact || tankThreat, dt);
      this.target = contact;
      if (this.unit.classId === "scout") this.updateScoutReports();
      else this.shareVisibleContacts(contact, tankThreat);
      const reportedVehicleThreat = tankThreat ? null : this.selectReportedVehicleThreat();
      const reportedContact = contact ? null : this.selectReportedSoftContact();

      if (!order?.point) {
        this.clearProne(0, true);
        this.state = "idle";
        this.unit.speed = approach(this.unit.speed, 0, 180 * dt);
        this.faceContact(contact, dt);
        this.updateDebug(null);
        return;
      }

      if (this.handleTransportOrder(dt, order, contact, tankThreat, beforeX, beforeY)) return;

      const pressureThreat = this.unit.suppression >= INFANTRY_CONFIG.suppressedThreshold
        ? contact || tankThreat || this.unit.lastThreat
        : null;
      if (pressureThreat) {
        const coverTarget = this.resolveCoverTarget(pressureThreat);
        this.state = "suppressed";
        this.target = contact || tankThreat || pressureThreat;
        this.faceContact(this.target, dt);
        if (contact && this.unit.suppression < 84) this.tryFire(contact);

        if (coverTarget) {
          this.moveTo(dt, coverTarget);
          this.recordMovement(dt, beforeX, beforeY, coverTarget);
          this.updateDebug(coverTarget);
          return;
        }

        if (!pressureThreat.vehicleType && this.enterProne({ mode: "suppressed", hold: 1.35 })) {
          this.state = "prone-fire";
          if (contact && this.unit.suppression < 88) this.tryFire(contact);
          this.unit.speed = approach(this.unit.speed, 0, 280 * dt);
          this.updateDebug(null);
          return;
        }

        if ((this.unit.proneHoldTimer || 0) <= 0) this.clearProne(1.25);
        this.unit.speed = approach(this.unit.speed, 0, 260 * dt);
        this.updateDebug(null);
        return;
      }

      const fireLaneEscape = this.findFriendlyTankFireLaneEscape();
      if (fireLaneEscape && (!contact || this.unit.suppression < 42)) {
        this.state = "avoid-fire-lane";
        this.moveTo(dt, fireLaneEscape);
        this.recordMovement(dt, beforeX, beforeY, fireLaneEscape);
        this.updateDebug(fireLaneEscape);
        return;
      }

      if (this.unit.classId === "scout" && order.role === "recon") {
        this.updateReconOrder(dt, order, contact, tankThreat, beforeX, beforeY);
        return;
      }

      if (this.handleSquadTacticalOrder(dt, order, contact, tankThreat, beforeX, beforeY)) return;

      const repairTarget = this.selectRepairTarget(contact, tankThreat);
      if (repairTarget) {
        const weapon = INFANTRY_WEAPONS.repairKit;
        const repairDistance = distXY(this.unit.x, this.unit.y, repairTarget.x, repairTarget.y);
        const repairHoldRange = (weapon.range || 72) + repairTarget.radius + 150;
        this.state = "repair-tank";
        this.target = repairTarget;
        this.faceContact(repairTarget, dt);
        if (repairDistance <= repairHoldRange) {
          repairTarget.requestRepairHold?.(this.unit, {
            duration: repairDistance <= (weapon.range || 72) + repairTarget.radius + 18 ? 0.82 : 0.48
          });
        }

        if (repairDistance > (weapon.range || 72) + repairTarget.radius - 6) {
          const repairMoveTarget = this.repairMoveTarget(repairTarget);
          this.moveTo(dt, repairMoveTarget);
          this.recordMovement(dt, beforeX, beforeY, repairMoveTarget);
          this.updateDebug(repairMoveTarget);
          return;
        }

        this.unit.speed = approach(this.unit.speed, 0, 260 * dt);
        this.tryRepairTank(repairTarget);
        this.updateDebug(null);
        return;
      }

      const grenadeTarget = this.selectGrenadeTarget(contact, tankThreat);
      if (grenadeTarget && this.tryThrowGrenade(grenadeTarget)) {
        this.state = "grenade";
        this.target = grenadeTarget.target || contact;
        this.faceContact(grenadeTarget, dt);
        this.unit.speed = approach(this.unit.speed, 0, 260 * dt);
        this.updateDebug(grenadeTarget);
        return;
      }

      if (tankThreat) {
        const tankDistance = distXY(this.unit.x, this.unit.y, tankThreat.x, tankThreat.y);
        const hasRpg = this.hasRpg();
        const pressureCount = hasRpg ? this.rpgPressureCount(tankThreat) : 0;
        let coverResolved = false;
        let coverTarget = null;
        let evadeResolved = false;
        let evadeTarget = null;
        const getCoverTarget = () => {
          if (!coverResolved) {
            coverTarget = this.resolveCoverTarget(tankThreat);
            coverResolved = true;
          }
          return coverTarget;
        };
        const getEvadeTarget = () => {
          if (!evadeResolved) {
            evadeTarget = this.vehicleEvadeTarget(tankThreat, order);
            evadeResolved = true;
          }
          return evadeTarget;
        };

        if (tankDistance < (hasRpg ? INFANTRY_CONFIG.rpgDangerRange : 330)) {
          const closeEvadeTarget = getEvadeTarget();
          if (closeEvadeTarget) {
            this.state = "evade-tank";
            this.target = tankThreat;
            this.faceContact(tankThreat, dt);
            this.moveTo(dt, closeEvadeTarget);
            this.recordMovement(dt, beforeX, beforeY, closeEvadeTarget);
            this.updateDebug(closeEvadeTarget);
            return;
          }
        }

        if (hasRpg) {
          const canFireRpg = this.canFireRpgAtTank(tankThreat, tankDistance);
          const rpgProfile = this.rpgShotProfile(tankThreat, tankDistance, pressureCount);
          const wantsBetterPosition = !canFireRpg ||
            tankDistance < INFANTRY_CONFIG.rpgPreferredMin ||
            tankDistance > INFANTRY_CONFIG.rpgPreferredMax ||
            rpgProfile.frontArmorHold;
          const rpgPosition = wantsBetterPosition
            ? this.rpgFirePosition(tankThreat, order, pressureCount)
            : null;

          if (canFireRpg) {
            this.state = "rpg-attack";
            this.target = tankThreat;
            this.faceContact(tankThreat, dt);
            this.tryFireRpgAtTank(tankThreat, dt, rpgProfile);

            if (
              rpgPosition &&
              distXY(this.unit.x, this.unit.y, rpgPosition.x, rpgPosition.y) > (rpgPosition.stopDistance || 18) + 12
            ) {
              this.moveTo(dt, rpgPosition);
              this.recordMovement(dt, beforeX, beforeY, rpgPosition);
              this.updateDebug(rpgPosition);
              return;
            }

            if (tankDistance < INFANTRY_CONFIG.rpgPanicRange) {
              const coverTarget = getCoverTarget();
              if (coverTarget) {
                this.moveTo(dt, coverTarget);
                this.recordMovement(dt, beforeX, beforeY, coverTarget);
                this.updateDebug(coverTarget);
                return;
              }
            }

            this.unit.speed = approach(this.unit.speed, 0, 220 * dt);
            this.updateDebug(null);
            return;
          }

          if (rpgPosition) {
            this.state = "rpg-position";
            this.target = tankThreat;
            this.faceContact(tankThreat, dt);
            this.moveTo(dt, rpgPosition);
            this.recordMovement(dt, beforeX, beforeY, rpgPosition);
            this.updateDebug(rpgPosition);
            return;
          }
        }

        if (!hasRpg && (!contact || tankDistance < INFANTRY_CONFIG.tankEvadeRange)) {
          const fallbackEvadeTarget = getEvadeTarget();
          if (fallbackEvadeTarget) {
            this.state = "evade-tank";
            this.target = tankThreat;
            this.faceContact(tankThreat, dt);
            this.moveTo(dt, fallbackEvadeTarget);
            this.recordMovement(dt, beforeX, beforeY, fallbackEvadeTarget);
            this.updateDebug(fallbackEvadeTarget);
            return;
          }
        }

        const canHarassTank = this.canHarassTank(tankThreat, tankDistance);
        if (canHarassTank) {
          this.state = "harass-tank";
          this.target = tankThreat;
          this.faceContact(tankThreat, dt);
          this.tryFireTank(tankThreat);

          if (tankDistance < 420) {
            const coverTarget = getCoverTarget();
            if (coverTarget) {
              this.moveTo(dt, coverTarget);
              this.recordMovement(dt, beforeX, beforeY, coverTarget);
              this.updateDebug(coverTarget);
              return;
            }
          }

          this.unit.speed = approach(this.unit.speed, 0, 220 * dt);
          this.updateDebug(null);
          return;
        }

        if (!contact || tankDistance < 520) {
          const coverTarget = getCoverTarget();
          if (coverTarget) {
            this.state = "cover";
            this.target = contact || tankThreat;
            this.faceContact(this.target, dt);
            if (contact) this.tryFire(contact);
            this.moveTo(dt, coverTarget);
            this.recordMovement(dt, beforeX, beforeY, coverTarget);
            this.updateDebug(coverTarget);
            return;
          }
        }

        const lateEvadeTarget = getEvadeTarget();
        if (lateEvadeTarget && (!contact || tankDistance < INFANTRY_CONFIG.tankEvadeRange)) {
          this.state = "evade-tank";
          this.target = tankThreat;
          this.faceContact(tankThreat, dt);
          this.moveTo(dt, lateEvadeTarget);
          this.recordMovement(dt, beforeX, beforeY, lateEvadeTarget);
          this.updateDebug(lateEvadeTarget);
          return;
        }
      }

      if (reportedVehicleThreat) {
        if (this.handleReportedVehicleThreat(dt, order, reportedVehicleThreat, contact, beforeX, beforeY)) return;
      }

      if (contact) {
        const weapon = this.weapon();
        const distance = distXY(this.unit.x, this.unit.y, contact.x, contact.y);
        const tooClose = distance < weapon.desiredRange * 0.62;
        const outOfRange = distance > weapon.range * 0.92;
        this.state = tooClose ? "cover" : "fire";
        this.faceContact(contact, dt);
        this.tryFire(contact);

        if (tooClose) {
          const coverTarget = this.resolveCoverTarget(contact);
          if (coverTarget) {
            this.moveTo(dt, coverTarget);
            this.recordMovement(dt, beforeX, beforeY, coverTarget);
            this.updateDebug(coverTarget);
            return;
          }
        }

        if (outOfRange) {
          const approachTarget = {
            x: contact.x,
            y: contact.y,
            stopDistance: weapon.desiredRange,
            final: false
          };
          this.moveTo(dt, approachTarget);
          this.recordMovement(dt, beforeX, beforeY, approachTarget);
          this.updateDebug(approachTarget);
          return;
        }

        if (this.enterProne({ mode: "contact", weapon, distance, hold: 1.2 })) {
          this.state = "prone-fire";
        } else if ((this.unit.proneHoldTimer || 0) <= 0 && this.unit.isProne) {
          this.clearProne(1.35);
        }
        this.unit.speed = approach(this.unit.speed, 0, 240 * dt);
        this.updateDebug(null);
        return;
      }

      if (reportedContact) {
        const reportMoveTarget = this.reportInvestigateTarget(reportedContact, this.weapon().desiredRange);
        this.state = "report-move";
        this.target = reportedContact.target;
        this.faceContact(reportedContact, dt);
        this.moveTo(dt, reportMoveTarget);
        this.recordMovement(dt, beforeX, beforeY, reportMoveTarget);
        this.updateDebug(reportMoveTarget);
        return;
      }

      const moveTarget = this.nextMoveTarget(order);
      this.state = distXY(this.unit.x, this.unit.y, order.point.x, order.point.y) <= order.point.radius - 18
        ? "secure"
        : "advance";

      this.moveTo(dt, moveTarget);
      this.recordMovement(dt, beforeX, beforeY, moveTarget);
      this.updateDebug(moveTarget);
    }

    handleSquadTacticalOrder(dt, order, contact, tankThreat, beforeX, beforeY) {
      const mode = order?.tacticalMode || "advance";
      const role = order?.squadRole || this.unit.squadRole || "assault";
      if (!order?.point || mode === "advance" || mode === "hold") return false;

      if (mode === "rally-with-tank" && (contact || tankThreat)) {
        const objectiveOrder = {
          ...order,
          id: `${order.id}:objective-contact`,
          point: order.objectivePoint || order.point,
          formation: order.objectiveFormation || order.formation
        };
        const moveTarget = this.nextMoveTarget(objectiveOrder);
        this.state = contact ? "fire" : "advance";
        this.target = contact || tankThreat;
        this.faceContact(this.target, dt);
        if (contact && this.unit.suppression < 76) this.tryFire(contact);
        this.moveTo(dt, moveTarget);
        this.recordMovement(dt, beforeX, beforeY, moveTarget);
        this.updateDebug(moveTarget);
        return true;
      }

      if (mode === "fallback" || mode === "regroup" || mode === "rally-with-tank") {
        const moveTarget = this.nextMoveTarget(order);
        const target = contact || tankThreat || null;
        this.state = mode === "fallback"
          ? "squad-fallback"
          : mode === "regroup"
            ? "squad-regroup"
            : "rally-tank";
        this.target = target;

        if (target) {
          this.faceContact(target, dt);
          if (contact && mode !== "regroup" && this.unit.suppression < 76) this.tryFire(contact);
        }

        this.moveTo(dt, moveTarget);
        this.recordMovement(dt, beforeX, beforeY, moveTarget);
        this.updateDebug(moveTarget);
        return true;
      }

      if (mode === "support-fire" && (role === "support" || role === "security")) {
        if (contact || tankThreat) return false;

        const moveTarget = this.nextMoveTarget(order);
        const distance = distXY(this.unit.x, this.unit.y, moveTarget.x, moveTarget.y);
        this.state = distance <= (moveTarget.stopDistance || 18) + 16 ? "support-fire" : "support-position";
        this.target = null;

        if (distance <= (moveTarget.stopDistance || 18) + 16) {
          if (role === "support") {
            this.enterProne({ force: true, hold: 2.2 });
          } else if (!this.enterProne({ mode: "support-fire", role, hold: 1.45 })) {
            if ((this.unit.proneHoldTimer || 0) <= 0) this.clearProne(1);
          }
          this.unit.speed = approach(this.unit.speed, 0, 260 * dt);
          this.faceContact(order.point, dt);
          this.updateDebug(moveTarget);
          return true;
        }

        this.moveTo(dt, moveTarget);
        this.recordMovement(dt, beforeX, beforeY, moveTarget);
        this.updateDebug(moveTarget);
        return true;
      }

      if (mode === "pre-assault" || mode === "hold-wall") {
        const moveTarget = this.nextMoveTarget(order);
        const distance = distXY(this.unit.x, this.unit.y, moveTarget.x, moveTarget.y);
        const settled = distance <= (moveTarget.stopDistance || 18) + 18;
        const target = contact || tankThreat || order.squadStatus?.lastThreat || order.point;
        this.state = mode === "pre-assault"
          ? settled ? "pre-assault" : "pre-assault-position"
          : settled ? "hold-wall" : "hold-wall-position";
        this.target = contact || tankThreat || null;

        if (target) {
          this.faceContact(target, dt);
          if (settled && contact && this.unit.suppression < 78) this.tryFire(contact);
        }

        if (settled) {
          const support = role === "support" || this.isSupportWeapon();
          const defensiveProne = support || (mode === "hold-wall" && role === "security" && this.unit.suppression > 18);
          const assaultProne = mode === "hold-wall" && role === "assault" && this.unit.suppression > 52;
          if (defensiveProne || assaultProne) {
            this.enterProne({ force: defensiveProne, role, mode: "planned", hold: 1.8 });
          } else if ((this.unit.proneHoldTimer || 0) <= 0) {
            this.clearProne(1);
          }
          this.unit.speed = approach(this.unit.speed, 0, 260 * dt);
          this.updateDebug(moveTarget);
          return true;
        }

        this.moveTo(dt, moveTarget);
        this.recordMovement(dt, beforeX, beforeY, moveTarget);
        this.updateDebug(moveTarget);
        return true;
      }

      return false;
    }

    handleTransportOrder(dt, order, contact, tankThreat, beforeX, beforeY) {
      const transport = order?.transport;
      const vehicle = transport?.vehicle;
      if (!transport || !vehicle?.alive) return false;
      if (!(transport.passengerIds || []).includes(this.unit.callSign)) return false;
      if (this.unit.inVehicle === vehicle) {
        this.state = "mounted-transport";
        this.target = vehicle;
        this.unit.speed = approach(this.unit.speed, 0, 260 * dt);
        this.updateDebug(null);
        return true;
      }
      if (!vehicle.canBoardPassenger?.(this.unit)) return false;

      const urgent = transport.mode === "remount";
      if ((contact || tankThreat) && !urgent) return false;
      if ((this.unit.transportCooldown || 0) > 0 && !urgent) return false;

      const boardDistance = distXY(this.unit.x, this.unit.y, vehicle.x, vehicle.y);
      const maxBoardChase = urgent ? 460 : 340;
      if (boardDistance > maxBoardChase) return false;

      const boardTarget = this.transportBoardTarget(vehicle);
      const nearEnoughToBoard = boardDistance <= vehicle.radius + this.unit.radius + 24;
      if (!nearEnoughToBoard && !this.canMoveDirect(boardTarget.x, boardTarget.y, 18)) return false;

      this.state = urgent ? "reboard-transport" : "board-transport";
      this.target = vehicle;
      this.faceContact(vehicle, dt);

      if (boardDistance <= vehicle.radius + this.unit.radius + 22) {
        if (vehicle.boardPassenger(this.unit)) {
          this.state = "mounted-transport";
          this.updateDebug(boardTarget);
          return true;
        }
      }

      this.moveTo(dt, boardTarget);
      this.recordMovement(dt, beforeX, beforeY, boardTarget);
      this.updateDebug(boardTarget);
      return true;
    }

    transportBoardTarget(vehicle) {
      const side = this.seed % 2 === 0 ? -1 : 1;
      const angles = [
        vehicle.angle + Math.PI / 2 * side,
        vehicle.angle - Math.PI / 2 * side,
        vehicle.angle + Math.PI,
        vehicle.angle
      ];
      const distances = [vehicle.radius + this.unit.radius + 18, vehicle.radius + this.unit.radius + 30, vehicle.radius + this.unit.radius + 42];

      for (const distance of distances) {
        for (const angle of angles) {
          const candidate = {
            x: vehicle.x + Math.cos(angle) * distance,
            y: vehicle.y + Math.sin(angle) * distance,
            stopDistance: 12,
            final: false,
            transportBoard: true
          };
          if (this.pointPassable(candidate.x, candidate.y, this.unit.radius + 3)) return candidate;
        }
      }

      return {
        x: vehicle.x,
        y: vehicle.y,
        stopDistance: vehicle.radius + this.unit.radius + 16,
        final: false,
        transportBoard: true
      };
    }

    selectTarget() {
      const candidates = [];

      for (const unit of this.game.infantry || []) {
        if (unit === this.unit || !unit.alive || unit.inVehicle || unit.team === this.unit.team) continue;
        candidates.push(unit);
      }

      for (const crew of this.game.crews || []) {
        if (!crew.alive || crew.inTank || crew.team === this.unit.team) continue;
        candidates.push(crew);
      }

      for (const drone of this.game.drones || []) {
        if (!drone.alive || drone.team === this.unit.team) continue;
        if (this.game.droneHasRoofCover?.(drone)) continue;
        if (this.game.canEnemyDetectDrone && !this.game.canEnemyDetectDrone(this.unit, drone, {
          range: this.sightRange()
        })) continue;
        candidates.push(drone);
      }

      if (!this.game.player.inTank && this.game.player.hp > 0 && this.unit.team === TEAM.RED && !this.game.isPlayerInSafeZone?.()) {
        candidates.push(this.game.player);
      }

      return candidates
        .map((target) => {
          const distance = distXY(this.unit.x, this.unit.y, target.x, target.y);
          let priority = 0;
          if (target.isDrone) {
            const attackDrone = target.droneRole === "attack";
            priority += attackDrone ? 190 : 54;
            if (attackDrone && target.diveActive) priority += 170;
            if (attackDrone && distance < 220) priority += 82;
            if (target.controlled) priority += 44;
          }
          return {
            target,
            distance,
            score: distance - priority
          };
        })
        .filter((item) => (
          item.distance <= Math.max(this.sightRange(), this.weapon().range + 80) &&
          this.canVisuallyAcquireTarget(item.target, {
            distance: item.distance,
            range: Math.max(this.sightRange(), this.weapon().range + 80),
            padding: 3
          })
        ))
        .sort((a, b) => a.score - b.score)[0]?.target || null;
    }

    isAliveEnemy(target) {
      if (!target || target.team === this.unit.team) return false;
      if (target.inVehicle) return false;
      const alive = target.alive !== undefined ? target.alive : target.hp > 0;
      return Boolean(alive);
    }

    directlySeesTarget(target, options = {}) {
      if (!this.isAliveEnemy(target)) return false;
      const range = options.range ?? Math.max(this.sightRange(), this.weapon().range + 80);
      if (target.isDrone && this.game.canEnemyDetectDrone && !this.game.canEnemyDetectDrone(this.unit, target, { range })) {
        return false;
      }
      if (distXY(this.unit.x, this.unit.y, target.x, target.y) > range) return false;
      if (options.requireFacing !== false && !this.hasFacingAwareness(target, range)) return false;
      return hasLineOfSight(this.game, this.unit, target, { padding: options.padding ?? 3 });
    }

    canVisuallyAcquireTarget(target, options = {}) {
      if (!this.isAliveEnemy(target)) return false;
      const range = options.range ?? Math.max(this.sightRange(), this.weapon().range + 80);
      const distance = options.distance ?? distXY(this.unit.x, this.unit.y, target.x, target.y);
      if (distance > range) return false;
      if (target.isDrone && this.game.canEnemyDetectDrone && !this.game.canEnemyDetectDrone(this.unit, target, { range })) {
        return false;
      }
      if (!this.hasFacingAwareness(target, range, distance)) return false;
      return hasLineOfSight(this.game, this.unit, target, { padding: options.padding ?? 3 });
    }

    hasFacingAwareness(target, range = this.sightRange(), distance = null) {
      if (!target) return false;
      const targetDistance = distance ?? distXY(this.unit.x, this.unit.y, target.x, target.y);
      if (targetDistance <= INFANTRY_CONFIG.rearAwarenessRange + (target.radius || 0)) return true;

      const angle = angleTo(this.unit.x, this.unit.y, target.x, target.y);
      const diff = Math.abs(normalizeAngle(angle - this.unit.angle));
      const halfAngle = this.unit.classId === "scout"
        ? INFANTRY_CONFIG.scoutVisionHalfAngle
        : INFANTRY_CONFIG.visionHalfAngle;
      if (diff <= halfAngle) return true;

      const peripheralRange = INFANTRY_CONFIG.peripheralAwarenessRange +
        (this.unit.classId === "scout" ? 70 : 0) +
        (this.unit.suppression > 45 ? 40 : 0);
      if (targetDistance <= peripheralRange + (target.radius || 0)) return true;

      const report = this.game.getReportedContact?.(this.unit.team, target);
      return Boolean(report && targetDistance <= Math.min(range, peripheralRange + 150));
    }

    updateTargetAwareness(target, dt) {
      if (!target) {
        this.awarenessTarget = null;
        this.awarenessTimer = 0;
        this.reactionDelay = 0;
        return;
      }

      if (this.awarenessTarget !== target) {
        this.awarenessTarget = target;
        this.awarenessTimer = 0;
        this.reactionDelay = this.reactionDelayFor(target);
        return;
      }

      this.awarenessTimer += dt;
    }

    reactionDelayFor(target) {
      const distance = distXY(this.unit.x, this.unit.y, target.x, target.y);
      const angle = angleTo(this.unit.x, this.unit.y, target.x, target.y);
      const diff = Math.abs(normalizeAngle(angle - this.unit.angle));
      const halfAngle = this.unit.classId === "scout"
        ? INFANTRY_CONFIG.scoutVisionHalfAngle
        : INFANTRY_CONFIG.visionHalfAngle;
      let delay = this.unit.classId === "scout" ? 0.2 : 0.28;

      if (diff > halfAngle) delay += 0.38;
      else if (diff > halfAngle * 0.72) delay += 0.16;
      if (distance <= INFANTRY_CONFIG.rearAwarenessRange + (target.radius || 0)) delay *= 0.72;
      if (target.isDrone) delay += target.droneRole === "attack" ? 0.34 : 0.42;
      if (this.unit.suppression > 45) delay *= 0.72;
      return clamp(delay, INFANTRY_CONFIG.reactionDelayMin, INFANTRY_CONFIG.reactionDelayMax);
    }

    isReadyToFireAt(target) {
      if (!target || this.awarenessTarget !== target) return false;
      return this.awarenessTimer >= this.reactionDelay;
    }

    isFacingTarget(target, tolerance = INFANTRY_CONFIG.fireFacingTolerance) {
      if (!target) return false;
      const targetAngle = angleTo(this.unit.x, this.unit.y, target.x, target.y);
      return Math.abs(normalizeAngle(this.unit.angle - targetAngle)) <= tolerance;
    }

    isVehicleTarget(target) {
      return this.vehicleTargets().includes(target);
    }

    reportPoint(report, stopDistance = INFANTRY_CONFIG.reportedInvestigateStopDistance) {
      return {
        x: report.x,
        y: report.y,
        target: report.target,
        reported: true,
        stopDistance,
        final: false
      };
    }

    shareVisibleContacts(contact, tankThreat) {
      if (this.reportTimer > 0) return;
      if (!contact && !tankThreat) return;

      this.reportTimer = 0.46 + Math.random() * 0.34;
      if (contact && this.directlySeesTarget(contact, { padding: 3 })) {
        this.game.reportContact?.(this.unit.team, contact, this.unit, INFANTRY_CONFIG.sharedContactTtl);
      }
      if (tankThreat && this.directlySeesTarget(tankThreat, {
        padding: 4,
        range: INFANTRY_CONFIG.coverThreatRange
      })) {
        this.game.reportContact?.(this.unit.team, tankThreat, this.unit, INFANTRY_CONFIG.sharedVehicleContactTtl);
      }
    }

    selectReportedVehicleThreat() {
      const vehicles = new Set(this.vehicleTargets());
      const reports = this.game.getReportedContacts?.(this.unit.team) || [];
      const maxRange = this.hasRpg()
        ? INFANTRY_CONFIG.reportedVehicleContactRange
        : INFANTRY_CONFIG.coverThreatRange + 180;

      return reports
        .filter((report) => vehicles.has(report.target) && this.isAliveEnemy(report.target))
        .map((report) => ({
          ...this.reportPoint(report),
          distance: distXY(this.unit.x, this.unit.y, report.x, report.y),
          confidence: report.confidence || 0.5
        }))
        .filter((report) => report.distance <= maxRange)
        .sort((a, b) => {
          const aScore = a.distance - a.confidence * 150 - (a.target.isPlayerTank ? 80 : 0);
          const bScore = b.distance - b.confidence * 150 - (b.target.isPlayerTank ? 80 : 0);
          return aScore - bScore;
        })[0] || null;
    }

    selectReportedSoftContact() {
      const reports = this.game.getReportedContacts?.(this.unit.team) || [];
      const weapon = this.weapon();
      const maxRange = Math.max(INFANTRY_CONFIG.reportedSoftContactRange, weapon.range + 170);

      return reports
        .filter((report) => !this.isVehicleTarget(report.target) && this.isAliveEnemy(report.target))
        .map((report) => ({
          ...this.reportPoint(report),
          distance: distXY(this.unit.x, this.unit.y, report.x, report.y),
          confidence: report.confidence || 0.5
        }))
        .filter((report) => report.distance <= maxRange)
        .sort((a, b) => (a.distance - a.confidence * 120) - (b.distance - b.confidence * 120))[0] || null;
    }

    reportInvestigateTarget(report, stopDistance = INFANTRY_CONFIG.reportedInvestigateStopDistance) {
      return {
        x: report.x,
        y: report.y,
        stopDistance: clamp(stopDistance, 80, 520),
        final: false,
        reported: true,
        target: report.target
      };
    }

    handleReportedVehicleThreat(dt, order, report, contact, beforeX, beforeY) {
      const reportDistance = distXY(this.unit.x, this.unit.y, report.x, report.y);
      const hasRpg = this.hasRpg();
      const reportThreatPoint = this.reportPoint(report, 18);

      if (reportDistance < (hasRpg ? INFANTRY_CONFIG.rpgPanicRange : 380)) {
        const evadeTarget = this.vehicleEvadeTarget(reportThreatPoint, order);
        const coverTarget = evadeTarget ? null : this.resolveCoverTarget(reportThreatPoint);
        const moveTarget = evadeTarget || coverTarget;
        if (moveTarget) {
          this.state = evadeTarget ? "evade-tank" : "cover";
          this.target = report.target;
          this.faceContact(reportThreatPoint, dt);
          this.moveTo(dt, moveTarget);
          this.recordMovement(dt, beforeX, beforeY, moveTarget);
          this.updateDebug(moveTarget);
          return true;
        }
      }

      if (hasRpg && !contact) {
        const rpgPosition = this.rpgFirePosition(reportThreatPoint, order, 1);
        if (rpgPosition) {
          this.state = "rpg-position";
          this.target = report.target;
          this.faceContact(reportThreatPoint, dt);
          this.moveTo(dt, rpgPosition);
          this.recordMovement(dt, beforeX, beforeY, rpgPosition);
          this.updateDebug(rpgPosition);
          return true;
        }
      }

      if (!contact && reportDistance < 620) {
        const coverTarget = this.resolveCoverTarget(reportThreatPoint);
        if (coverTarget) {
          this.state = "cover";
          this.target = report.target;
          this.faceContact(reportThreatPoint, dt);
          this.moveTo(dt, coverTarget);
          this.recordMovement(dt, beforeX, beforeY, coverTarget);
          this.updateDebug(coverTarget);
          return true;
        }
      }

      if (!contact) {
        const moveTarget = this.reportInvestigateTarget(report, hasRpg ? INFANTRY_CONFIG.rpgPreferredMin : this.weapon().desiredRange);
        this.state = "report-move";
        this.target = report.target;
        this.faceContact(reportThreatPoint, dt);
        this.moveTo(dt, moveTarget);
        this.recordMovement(dt, beforeX, beforeY, moveTarget);
        this.updateDebug(moveTarget);
        return true;
      }

      return false;
    }

    hasGrenade() {
      return (this.unit.equipmentAmmo?.grenade || 0) > 0 &&
        Boolean(INFANTRY_WEAPONS.grenade);
    }

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
    }

    selectGrenadeTarget(contact, tankThreat) {
      const weapon = INFANTRY_WEAPONS.grenade;
      if (!weapon || !this.hasGrenade()) return null;
      if (this.fireCooldown > 0 || this.grenadeCooldown > 0) return null;
      if (this.unit.suppression > 64) return null;
      if (tankThreat && distXY(this.unit.x, this.unit.y, tankThreat.x, tankThreat.y) < 340) return null;

      const softTargets = this.grenadeSoftTargets();
      let best = null;

      const addCandidate = (point, target, score, reason) => {
        const distance = distXY(this.unit.x, this.unit.y, point.x, point.y);
        if (distance < INFANTRY_CONFIG.grenadeMinRange || distance > weapon.range) return;
        if (!this.isGrenadePointSafe(point)) return;

        const candidate = {
          x: point.x,
          y: point.y,
          target,
          score: score - distance / Math.max(weapon.range * 2.2, 1),
          reason,
          stopDistance: 0,
          final: false,
          grenade: true
        };
        if (!best || candidate.score > best.score) best = candidate;
      };

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
          addCandidate(cluster.center, target, score, covered ? "cover" : nearVehicle ? "vehicle" : "cluster");
        }
      }

      for (const vehicle of this.vehicleTargets()) {
        if (!vehicle.alive || vehicle.team === this.unit.team || vehicle.vehicleType !== "humvee") continue;
        const visible = hasLineOfSight(this.game, this.unit, vehicle, { padding: 4 });
        const report = visible ? null : this.game.getReportedContact?.(this.unit.team, vehicle);
        const aimPoint = visible ? vehicle : report ? this.reportPoint(report) : null;
        if (!aimPoint) continue;
        addCandidate(aimPoint, vehicle, visible ? 2.45 : 2.22, "light-vehicle");
      }

      return best && best.score >= INFANTRY_CONFIG.grenadeScoreThreshold ? best : null;
    }

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
    }

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
    }

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
    }

    isGrenadePointSafe(point) {
      const safety = INFANTRY_CONFIG.grenadeFriendlySafety;

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
    }

    tryThrowGrenade(target) {
      const weapon = INFANTRY_WEAPONS.grenade;
      if (!weapon || !target || !this.hasGrenade()) return false;
      if (this.fireCooldown > 0 || this.grenadeCooldown > 0) return false;

      const distance = distXY(this.unit.x, this.unit.y, target.x, target.y);
      if (distance < INFANTRY_CONFIG.grenadeMinRange || distance > weapon.range) return false;

      const fired = IronLine.combat.throwGrenade(this.game, this.unit, target.x, target.y, { weapon });
      if (!fired) return false;

      this.unit.equipmentAmmo.grenade = Math.max(0, (this.unit.equipmentAmmo.grenade || 0) - 1);
      this.fireCooldown = weapon.cooldown + 0.38 + Math.random() * 0.28;
      this.grenadeCooldown = INFANTRY_CONFIG.grenadeCooldownMin +
        Math.random() * (INFANTRY_CONFIG.grenadeCooldownMax - INFANTRY_CONFIG.grenadeCooldownMin);
      this.unit.suppress(5, target.target || target);
      return true;
    }

    vehicleTargets() {
      return [
        ...(this.game.tanks || []),
        ...(this.game.humvees || [])
      ];
    }

    hasRpg() {
      return this.unit.classId === "engineer" &&
        (this.unit.equipmentAmmo?.rpg || 0) > 0 &&
        Boolean(INFANTRY_WEAPONS.rpg);
    }

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
    }

    rpgTargetKey(tank) {
      if (!tank) return "";
      return tank.callSign || `${tank.team || "veh"}:${Math.round(tank.x)}:${Math.round(tank.y)}`;
    }

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
    }

    rpgVolleyBlocked(tank) {
      const squad = this.unit.squad;
      if (!squad) return false;
      const until = squad.rpgVolleyUntil || 0;
      if ((this.game.matchTime || 0) >= until) return false;
      const key = this.rpgTargetKey(tank);
      return !squad.rpgVolleyTargetKey || squad.rpgVolleyTargetKey === key;
    }

    markRpgVolley(tank) {
      const squad = this.unit.squad;
      if (!squad) return;
      const cooldown = INFANTRY_CONFIG.rpgVolleyCooldownMin +
        Math.random() * (INFANTRY_CONFIG.rpgVolleyCooldownMax - INFANTRY_CONFIG.rpgVolleyCooldownMin);
      squad.rpgVolleyUntil = (this.game.matchTime || 0) + cooldown;
      squad.rpgVolleyTargetKey = this.rpgTargetKey(tank);
    }

    resetRpgAim(reason = "") {
      this.rpgAimTargetKey = "";
      this.rpgAimTime = 0;
      this.rpgAimRequired = 0;
      if (reason) this.rpgHoldReason = reason;
    }

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

    selectTankThreat() {
      return this.vehicleTargets()
        .filter((tank) => tank.alive && tank.team !== this.unit.team)
        .map((tank) => ({
          tank,
          distance: distXY(this.unit.x, this.unit.y, tank.x, tank.y)
        }))
        .filter((item) => (
          item.distance <= (this.unit.classId === "scout" ? INFANTRY_CONFIG.scoutReportRange : INFANTRY_CONFIG.coverThreatRange) &&
          hasLineOfSight(this.game, this.unit, item.tank, { padding: 4 })
        ))
        .sort((a, b) => a.distance - b.distance)[0]?.tank || null;
    }

    updateScoutReports() {
      let count = 0;

      for (const tank of this.vehicleTargets()) {
        if (!tank.alive || tank.team === this.unit.team) continue;
        const distance = distXY(this.unit.x, this.unit.y, tank.x, tank.y);
        if (distance > INFANTRY_CONFIG.scoutReportRange) continue;
        if (!hasLineOfSight(this.game, this.unit, tank, { padding: 4 })) continue;
        this.game.reportContact?.(this.unit.team, tank, this.unit, INFANTRY_CONFIG.scoutReportTtl);
        count += 1;
      }

      for (const unit of this.game.infantry || []) {
        if (!unit.alive || unit.inVehicle || unit.team === this.unit.team) continue;
        const distance = distXY(this.unit.x, this.unit.y, unit.x, unit.y);
        if (distance > this.sightRange()) continue;
        if (!hasLineOfSight(this.game, this.unit, unit, { padding: 3 })) continue;
        this.game.reportContact?.(this.unit.team, unit, this.unit, INFANTRY_CONFIG.scoutReportTtl * 0.82);
        count += 1;
      }

      this.debug.scoutReports = count;
    }

    updateReconOrder(dt, order, contact, tankThreat, beforeX, beforeY) {
      this.refreshReconPost(order);
      const threat = this.closestReconThreat(contact, tankThreat);
      if (threat?.tooClose) {
        const coverTarget = this.resolveCoverTarget(threat.target);
        const evadeTarget = coverTarget || this.reconEvadeTarget(threat.target, order);
        this.state = "recon-evade";
        this.target = threat.target;
        this.faceContact(threat.target, dt);

        if (evadeTarget) {
          this.moveTo(dt, evadeTarget);
          this.recordMovement(dt, beforeX, beforeY, evadeTarget);
          this.updateDebug(evadeTarget);
          return;
        }

        this.unit.speed = approach(this.unit.speed, 0, 260 * dt);
        this.updateDebug(null);
        return;
      }

      const egressTarget = this.reconEgressTarget(order);
      if (egressTarget) {
        this.reconEgressTimer = this.state === "recon-egress" ? this.reconEgressTimer + dt : dt;
        if (this.shouldSkipReconEgress(order)) {
          this.reconEgressSkipUntil = (this.game.matchTime || 0) + 5.5;
          this.reconEgressTimer = 0;
          this.path = [];
          this.pathIndex = 0;
          this.repathTimer = 0;
        } else {
          this.state = "recon-egress";
          this.moveTo(dt, egressTarget);
          this.recordMovement(dt, beforeX, beforeY, egressTarget);
          this.updateDebug(egressTarget);
          return;
        }
      } else {
        this.reconEgressTimer = 0;
      }

      const weapon = this.weapon();
      if (contact) {
        const distance = distXY(this.unit.x, this.unit.y, contact.x, contact.y);
        const canSnipe = weapon.id === "sniper" &&
          distance >= Math.max(260, weapon.desiredRange * 0.44) &&
          distance <= weapon.range &&
          hasLineOfSight(this.game, this.unit, contact, { padding: 3 });

        if (canSnipe) {
          this.state = "recon-snipe";
          this.target = contact;
          this.faceContact(contact, dt);
          this.unit.speed = approach(this.unit.speed, 0, 300 * dt);
          this.tryFire(contact);
          this.updateDebug(null);
          return;
        }
      }

      const distanceToPost = distXY(this.unit.x, this.unit.y, order.point.x, order.point.y);
      if (distanceToPost <= (order.point.radius || 130)) {
        const patrolTarget = this.activeReconPatrolTarget(order);
        if (patrolTarget) {
          this.state = "recon-patrol";
          this.moveTo(dt, patrolTarget);
          this.recordMovement(dt, beforeX, beforeY, patrolTarget);
          this.updateDebug(patrolTarget);
          return;
        }

        this.state = "recon-watch";
        this.reconWatchTimer -= dt;
        this.unit.speed = approach(this.unit.speed, 0, 220 * dt);
        this.scanReconPost(dt, order, tankThreat);

        if (this.reconWatchTimer <= 0) {
          this.reconPatrolTarget = this.pickReconPatrolTarget(order);
          this.reconWatchTimer = this.nextReconWatchDuration();
        }

        this.updateDebug(this.reconPatrolTarget);
        return;
      }

      const moveTarget = this.nextMoveTarget(order);
      this.state = "recon-move";
      this.moveTo(dt, moveTarget);
      this.recordMovement(dt, beforeX, beforeY, moveTarget);
      this.updateDebug(moveTarget);
    }

    refreshReconPost(order) {
      const nextPostId = `${order?.objectiveName || ""}:${Math.round(order?.point?.x || 0)}:${Math.round(order?.point?.y || 0)}`;
      if (this.reconPostId === nextPostId) return;
      this.reconPostId = nextPostId;
      this.reconPatrolTarget = null;
      this.reconWatchTimer = this.nextReconWatchDuration();
      this.reconPatrolStep = 0;
      this.reconEgressTimer = 0;
      this.reconEgressSkipUntil = 0;
    }

    nextReconWatchDuration() {
      const span = INFANTRY_CONFIG.scoutWatchMax - INFANTRY_CONFIG.scoutWatchMin;
      return INFANTRY_CONFIG.scoutWatchMin + Math.random() * Math.max(0.1, span);
    }

    activeReconPatrolTarget(order) {
      const target = this.reconPatrolTarget;
      if (!target) return null;
      const reachedTarget = distXY(this.unit.x, this.unit.y, target.x, target.y) <= (target.stopDistance || 18) + 6;
      const leftPost = distXY(this.unit.x, this.unit.y, order.point.x, order.point.y) > (order.point.radius || 130) + 56;
      if (reachedTarget || leftPost || !this.pointPassable(target.x, target.y, this.unit.radius + 3)) {
        this.reconPatrolTarget = null;
        this.reconWatchTimer = this.nextReconWatchDuration();
        return null;
      }
      return target;
    }

    pickReconPatrolTarget(order) {
      const radius = order.point.radius || 130;
      const baseAngle = this.seed * 0.31 + this.reconPatrolStep * 1.17 + (this.game.matchTime || 0) * 0.08;
      this.reconPatrolStep += 1;

      for (let step = 0; step < 14; step += 1) {
        const angle = baseAngle + step * Math.PI * 2 / 14;
        const distance = INFANTRY_CONFIG.scoutPatrolMinDistance +
          (step % 4) / 3 * (INFANTRY_CONFIG.scoutPatrolMaxDistance - INFANTRY_CONFIG.scoutPatrolMinDistance);
        const candidate = {
          x: order.point.x + Math.cos(angle) * Math.min(distance, radius - 18),
          y: order.point.y + Math.sin(angle) * Math.min(distance, radius - 18),
          stopDistance: 16,
          final: false,
          reconPatrol: true
        };
        if (distXY(this.unit.x, this.unit.y, candidate.x, candidate.y) < INFANTRY_CONFIG.scoutPatrolMinDistance) continue;
        if (!this.pointPassable(candidate.x, candidate.y, this.unit.radius + 3)) continue;
        if (!this.canMoveDirect(candidate.x, candidate.y, 18)) continue;
        return candidate;
      }

      return null;
    }

    scanReconPost(dt, order, tankThreat) {
      if (tankThreat) {
        this.faceContact(tankThreat);
        return;
      }

      const outwardAngle = angleTo(order.point.x, order.point.y, this.unit.x, this.unit.y);
      const sweep = Math.sin(((this.game.matchTime || 0) + this.seed * 0.13) * 0.9) * 0.72;
      this.unit.angle = rotateTowards(this.unit.angle, outwardAngle + sweep, 1.55 * dt);
      this.moveHeading = this.unit.angle;
    }

    reconEgressTarget(order) {
      if ((this.game.matchTime || 0) < this.reconEgressSkipUntil) return null;
      const point = order?.egressPoint;
      if (!point) return null;
      const insideBase = this.game.isPointInSafeZone?.(this.unit.x, this.unit.y, this.unit.team);
      if (!insideBase) return null;
      const stopDistance = point.radius || 70;
      if (distXY(this.unit.x, this.unit.y, point.x, point.y) <= stopDistance) return null;
      if (!this.canMoveDirect(point.x, point.y, 18)) {
        const routedTarget = this.nextMoveTarget({
          ...order,
          id: `${order.id}:egress`,
          point: {
            name: `${order.objectiveName || "recon"}-egress`,
            x: point.x,
            y: point.y,
            radius: stopDistance
          },
          formation: null,
          slotIndex: 0,
          slotCount: 1
        });
        return {
          ...routedTarget,
          reconEgress: true
        };
      }
      return {
        x: point.x,
        y: point.y,
        stopDistance,
        final: false,
        reconEgress: true
      };
    }

    shouldSkipReconEgress(order) {
      const point = order?.egressPoint;
      if (!point) return false;
      const exitRadius = point.radius || 70;
      const exitDistance = distXY(this.unit.x, this.unit.y, point.x, point.y);
      const nearExit = exitDistance <= exitRadius + 120;
      const recoveryActive = this.recoveryTimer > 0 && this.reconEgressTimer > 1.1;
      const waitedNearExit = this.reconEgressTimer > 2.2 && nearExit;
      const waitedTooLong = this.reconEgressTimer > 4.6 && exitDistance <= exitRadius + 240;
      return (recoveryActive && nearExit) || waitedNearExit || waitedTooLong;
    }

    closestReconThreat(contact, tankThreat) {
      const threats = [];
      if (contact) {
        threats.push({
          target: contact,
          distance: distXY(this.unit.x, this.unit.y, contact.x, contact.y),
          dangerDistance: 300
        });
      }

      if (tankThreat) {
        threats.push({
          target: tankThreat,
          distance: distXY(this.unit.x, this.unit.y, tankThreat.x, tankThreat.y),
          dangerDistance: 560
        });
      }

      return threats
        .map((item) => ({
          ...item,
          tooClose: item.distance <= item.dangerDistance
        }))
        .sort((a, b) => a.distance - b.distance)[0] || null;
    }

    reconEvadeTarget(threat, order) {
      if (!threat) return null;
      const awayAngle = angleTo(threat.x, threat.y, this.unit.x, this.unit.y);
      const postAngle = order?.point ? angleTo(threat.x, threat.y, order.point.x, order.point.y) : awayAngle;
      const maxPostDistance = order?.point ? (order.point.radius || 130) + 390 : Infinity;
      const angles = [
        awayAngle,
        awayAngle + 0.72,
        awayAngle - 0.72,
        postAngle,
        postAngle + 0.48,
        postAngle - 0.48
      ];
      const distances = [92, 132, 176, 222];

      for (const distance of distances) {
        for (const angle of angles) {
          const candidate = {
            x: this.unit.x + Math.cos(angle) * distance,
            y: this.unit.y + Math.sin(angle) * distance,
            stopDistance: 18,
            final: false,
            reconEvade: true
          };
          if (order?.point && distXY(candidate.x, candidate.y, order.point.x, order.point.y) > maxPostDistance) continue;
          if (this.pointPassable(candidate.x, candidate.y, this.unit.radius + 3)) return candidate;
        }
      }

      return null;
    }

    vehicleEvadeTarget(threat, order) {
      if (!threat) return null;
      const currentDistance = distXY(this.unit.x, this.unit.y, threat.x, threat.y);
      const awayAngle = angleTo(threat.x, threat.y, this.unit.x, this.unit.y);
      const objectiveAwayAngle = order?.point ? angleTo(threat.x, threat.y, order.point.x, order.point.y) : awayAngle;
      const angles = [
        awayAngle,
        awayAngle + 0.58,
        awayAngle - 0.58,
        awayAngle + 1.05,
        awayAngle - 1.05,
        objectiveAwayAngle
      ];
      const distances = [96, 138, 184, 236];

      for (const distance of distances) {
        for (const angle of angles) {
          const candidate = {
            x: this.unit.x + Math.cos(angle) * distance,
            y: this.unit.y + Math.sin(angle) * distance,
            stopDistance: 18,
            final: false,
            tankEvade: true
          };
          if (!this.pointPassable(candidate.x, candidate.y, this.unit.radius + 3)) continue;
          if (!this.canMoveDirect(candidate.x, candidate.y, 18)) continue;
          if (distXY(candidate.x, candidate.y, threat.x, threat.y) < currentDistance + 36) continue;
          return candidate;
        }
      }

      return null;
    }

    rpgFirePosition(threat, order, pressureCount = 1) {
      const weapon = INFANTRY_WEAPONS.rpg;
      if (!weapon || !threat || !this.hasRpg()) return null;

      const currentDistance = distXY(this.unit.x, this.unit.y, threat.x, threat.y);
      const awayAngle = angleTo(threat.x, threat.y, this.unit.x, this.unit.y);
      const objectiveAngle = order?.point ? angleTo(threat.x, threat.y, order.point.x, order.point.y) : awayAngle;
      const seedOffset = ((this.seed % 5) - 2) * 0.18;
      const angles = [
        awayAngle + seedOffset,
        awayAngle + 0.48 + seedOffset,
        awayAngle - 0.48 + seedOffset,
        awayAngle + 0.92,
        awayAngle - 0.92,
        objectiveAngle
      ];
      const distances = [
        clamp(currentDistance, INFANTRY_CONFIG.rpgPreferredMin, INFANTRY_CONFIG.rpgPreferredMax),
        560,
        680,
        760,
        460
      ];
      let best = null;
      let bestScore = Infinity;

      for (const distance of distances) {
        if (distance < INFANTRY_CONFIG.rpgDangerRange || distance < (weapon.minRange || 0) + 48) continue;
        if (distance > (weapon.range || 980) - 24) continue;

        for (const angle of angles) {
          const candidate = {
            x: threat.x + Math.cos(angle) * distance,
            y: threat.y + Math.sin(angle) * distance,
            stopDistance: 18,
            final: false,
            rpgPosition: true
          };

          if (!this.pointPassable(candidate.x, candidate.y, this.unit.radius + 3)) continue;
          if (!this.canMoveDirect(candidate.x, candidate.y, 18)) continue;
          if (!hasLineOfSight(this.game, candidate, threat, { padding: 4 })) continue;

          const moveDistance = distXY(this.unit.x, this.unit.y, candidate.x, candidate.y);
          const rangePenalty = Math.abs(distance - (weapon.desiredRange || 610)) * 0.22;
          const coverBonus = this.rpgCoverScore(candidate) * 115;
          const pressureBonus = Math.min(3, pressureCount) * 18;
          const score = moveDistance * 0.58 + rangePenalty - coverBonus - pressureBonus;
          if (score < bestScore) {
            best = candidate;
            bestScore = score;
          }
        }
      }

      return best;
    }

    rpgCoverScore(point) {
      let best = 0;

      for (const obstacle of this.game.world.obstacles || []) {
        const nearestX = clamp(point.x, obstacle.x, obstacle.x + obstacle.w);
        const nearestY = clamp(point.y, obstacle.y, obstacle.y + obstacle.h);
        const distance = distXY(point.x, point.y, nearestX, nearestY);
        if (distance > 112) continue;
        best = Math.max(best, 1 - Math.abs(distance - 44) / 90);
      }

      return clamp(best, 0, 1);
    }

    selectRepairTarget(contact, tankThreat) {
      const weapon = INFANTRY_WEAPONS.repairKit;
      const repairAmmo = this.unit.equipmentAmmo?.repairKit || 0;
      if (this.unit.classId !== "engineer" || !weapon || repairAmmo <= 0) return null;
      if (contact) return null;

      const enemyTankDistance = tankThreat
        ? distXY(this.unit.x, this.unit.y, tankThreat.x, tankThreat.y)
        : Infinity;
      if (enemyTankDistance <= INFANTRY_CONFIG.repairUnsafeEnemyRange) return null;

      const orderedTarget = this.order?.repairTarget;
      if (orderedTarget?.alive && orderedTarget.team === this.unit.team && orderedTarget.hp < orderedTarget.maxHp * 0.94) {
        const distance = distXY(this.unit.x, this.unit.y, orderedTarget.x, orderedTarget.y);
        const closeEnoughToWork = distance <= (weapon.range || 72) + orderedTarget.radius + 12;
        const inCommanderRepairRange = distance <= INFANTRY_CONFIG.repairSearchRange * 1.55 + orderedTarget.radius;
        const canReachDirectly = closeEnoughToWork || this.canMoveDirect(orderedTarget.x, orderedTarget.y, 36);
        if (inCommanderRepairRange && canReachDirectly && this.isRepairTargetSafe(orderedTarget, tankThreat)) {
          return orderedTarget;
        }
      }

      return this.vehicleTargets()
        .filter((tank) => {
          const distance = distXY(this.unit.x, this.unit.y, tank.x, tank.y);
          const closeEnoughToWork = distance <= (weapon.range || 72) + tank.radius + 12;
          const canReachDirectly = closeEnoughToWork || this.canMoveDirect(tank.x, tank.y, 36);
          return (
            tank.alive &&
            tank.team === this.unit.team &&
            tank.hp < tank.maxHp * 0.94 &&
            distance <= INFANTRY_CONFIG.repairSearchRange + tank.radius &&
            canReachDirectly &&
            this.isRepairTargetSafe(tank, tankThreat)
          );
        })
        .map((tank) => {
          const distance = distXY(this.unit.x, this.unit.y, tank.x, tank.y);
          const damageRatio = 1 - tank.hp / Math.max(1, tank.maxHp);
          const routePenalty = this.canMoveDirect(tank.x, tank.y, 36) ? 0 : 260;
          const playerBonus = tank.isPlayerTank ? -90 : 0;
          return {
            tank,
            score: distance * 0.55 - damageRatio * 420 + routePenalty + playerBonus
          };
        })
        .sort((a, b) => a.score - b.score)[0]?.tank || null;
    }

    isRepairTargetSafe(tank, tankThreat) {
      if (!tankThreat || !tankThreat.alive) return true;
      const distance = distXY(tank.x, tank.y, tankThreat.x, tankThreat.y);
      if (distance > INFANTRY_CONFIG.repairUnsafeEnemyRange + 140) return true;
      return !hasLineOfSight(this.game, tank, tankThreat, { padding: 4 });
    }

    repairMoveTarget(tank) {
      const weapon = INFANTRY_WEAPONS.repairKit;
      const preferredAngles = [
        tank.angle + Math.PI,
        tank.angle + Math.PI / 2,
        tank.angle - Math.PI / 2,
        angleTo(tank.x, tank.y, this.unit.x, this.unit.y),
        tank.angle
      ];
      const distances = [tank.radius + 54, tank.radius + 74, tank.radius + 96];
      let best = null;
      let bestScore = Infinity;

      for (const distance of distances) {
        for (const angle of preferredAngles) {
          const candidate = {
            x: tank.x + Math.cos(angle) * distance,
            y: tank.y + Math.sin(angle) * distance,
            stopDistance: 13,
            final: false,
            repair: true
          };
          if (!this.pointPassable(candidate.x, candidate.y, this.unit.radius + 3)) continue;

          const routePenalty = this.canMoveDirect(candidate.x, candidate.y, 26) ? 0 : 150;
          const rearBias = Math.abs(normalizeAngle(angle - (tank.angle + Math.PI))) * 12;
          const score = distXY(this.unit.x, this.unit.y, candidate.x, candidate.y) + routePenalty + rearBias;
          if (score < bestScore) {
            best = candidate;
            bestScore = score;
          }
        }
      }

      return best || {
        x: tank.x,
        y: tank.y,
        stopDistance: (weapon.range || 72) + tank.radius - 10,
        final: false,
        repair: true
      };
    }

    tryRepairTank(tank) {
      const weapon = INFANTRY_WEAPONS.repairKit;
      if (!weapon || !tank || !tank.alive || tank.hp >= tank.maxHp) return false;
      if (this.fireCooldown > 0) return false;
      if ((this.unit.equipmentAmmo?.repairKit || 0) <= 0) return false;
      if (distXY(this.unit.x, this.unit.y, tank.x, tank.y) > (weapon.range || 72) + tank.radius) return false;

      this.unit.equipmentAmmo.repairKit = Math.max(0, (this.unit.equipmentAmmo.repairKit || 0) - 1);
      tank.hp = Math.min(tank.maxHp, tank.hp + (weapon.repairAmount || 28));
      this.fireCooldown = (weapon.cooldown || 1.1) + 0.32 + Math.random() * 0.22;

      this.game.effects.explosions.push({
        x: tank.x,
        y: tank.y,
        radius: 8,
        maxRadius: 48,
        life: 0.34,
        maxLife: 0.34,
        color: "rgba(120, 214, 140, 0.68)"
      });
      return true;
    }

    faceContact(target, dt = 0) {
      if (!target) return;
      const targetAngle = angleTo(this.unit.x, this.unit.y, target.x, target.y);
      const turnRate = this.unit.classId === "scout" ? 8.6 : 7.2;
      this.unit.angle = dt > 0
        ? rotateTowards(this.unit.angle, targetAngle, turnRate * dt)
        : targetAngle;
      this.moveHeading = this.unit.angle;
    }

    tryFire(target) {
      if (this.fireCooldown > 0 || !target) return false;
      if (!this.isReadyToFireAt(target) || !this.isFacingTarget(target)) return false;
      const weapon = this.weapon();
      const range = IronLine.combat?.smallArmsRange?.(weapon, this.unit, weapon.range) || weapon.range;
      if (distXY(this.unit.x, this.unit.y, target.x, target.y) > range) return false;
      if (this.unit.suppressed && this.unit.suppression > 72 && Math.random() < 0.48) {
        this.fireCooldown = Math.min(weapon.cooldown, 0.22 + Math.random() * 0.24);
        return false;
      }

      const suppressionPenalty = clamp(this.unit.suppression / 165, 0, 0.36);
      const reconSnipeBonus = this.state === "recon-snipe" || this.state === "recon-watch" ? 0.12 : 0;
      const fired = IronLine.combat.fireRifle(this.game, this.unit, target, {
        weapon,
        range: weapon.range,
        damage: weapon.damageMin + Math.random() * (weapon.damageMax - weapon.damageMin),
        accuracyBonus: weapon.accuracyBonus + (this.state === "secure" ? 0.06 : 0) + reconSnipeBonus - suppressionPenalty
      });
      if (fired) this.fireCooldown = weapon.cooldown + suppressionPenalty * 0.7 + Math.random() * weapon.cooldown * 0.45;
      return fired;
    }

    canHarassTank(tank, distance) {
      const weaponRange = IronLine.combat?.smallArmsRange?.(this.weapon(), this.unit, this.weapon().range) || this.weapon().range;
      if (!tank || distance > Math.min(weaponRange, INFANTRY_CONFIG.tankHarassRange)) return false;
      if (distance < 210 || this.unit.suppression > 68) return false;
      if (!hasLineOfSight(this.game, this.unit, tank, { padding: 3 })) return false;
      return this.friendlyInfantryNearTank(tank, 230) >= INFANTRY_CONFIG.tankHarassMinGroup;
    }

    friendlyInfantryNearTank(tank, radius) {
      let count = 0;
      for (const unit of this.game.infantry || []) {
        if (!unit.alive || unit.inVehicle || unit.team !== this.unit.team) continue;
        if (distXY(unit.x, unit.y, tank.x, tank.y) <= radius) count += 1;
      }
      return count;
    }

    tryFireTank(tank) {
      if (this.fireCooldown > 0 || !tank) return false;
      const weapon = this.weapon();
      const range = IronLine.combat?.smallArmsRange?.(weapon, this.unit, weapon.range) || weapon.range;
      const suppressionPenalty = clamp(this.unit.suppression / 180, 0, 0.32);
      const fired = IronLine.combat.fireRifleAtTank(this.game, this.unit, tank, {
        weapon,
        range: weapon.range,
        accuracyBonus: -0.02 - suppressionPenalty
      });
      if (fired) this.fireCooldown = weapon.cooldown + suppressionPenalty * 0.5 + Math.random() * weapon.cooldown * 0.38;
      return fired;
    }

    canFireRpgAtTank(tank, distance) {
      const weapon = INFANTRY_WEAPONS.rpg;
      if (!weapon || !tank || !tank.alive) return false;
      const rpgAmmo = this.unit.equipmentAmmo?.rpg || 0;
      if (this.unit.classId !== "engineer") return false;
      if (rpgAmmo <= 0) return false;
      if (distance < Math.max(INFANTRY_CONFIG.rpgMinRange, INFANTRY_CONFIG.rpgDangerRange, weapon.minRange || 0) || distance > weapon.range) return false;
      const pressureCount = this.rpgPressureCount(tank);
      if (distance < INFANTRY_CONFIG.rpgPanicRange && pressureCount < 2) return false;
      if (this.unit.suppression > (pressureCount >= 2 ? 84 : 72)) return false;
      if (!hasLineOfSight(this.game, this.unit, tank, { padding: 4 })) return false;
      return this.hasSafeRpgImpact(tank, weapon);
    }

    hasSafeRpgImpact(tank, weapon) {
      const dangerRadius = (weapon.splash || 92) + 22;

      if (!this.game.player.inTank && this.game.player.hp > 0 && this.unit.team === TEAM.RED && !this.game.isPlayerInSafeZone?.()) {
        if (distXY(this.game.player.x, this.game.player.y, tank.x, tank.y) <= dangerRadius) return false;
      }

      return true;
    }

    tryFireRpgAtTank(tank, dt = 0.033, profile = null) {
      if (!tank) return false;
      const weapon = INFANTRY_WEAPONS.rpg;
      const distance = distXY(this.unit.x, this.unit.y, tank.x, tank.y);
      if (!this.canFireRpgAtTank(tank, distance)) {
        this.resetRpgAim("no-shot");
        return false;
      }

      const pressureCount = this.rpgPressureCount(tank);
      const shotProfile = profile || this.rpgShotProfile(tank, distance, pressureCount);
      if (!this.updateRpgAim(tank, shotProfile, dt) || this.fireCooldown > 0) return false;

      const rangeStability = clamp(
        (distance - INFANTRY_CONFIG.rpgDangerRange) /
          Math.max(1, INFANTRY_CONFIG.rpgPreferredMax - INFANTRY_CONFIG.rpgDangerRange),
        0,
        1
      );
      const aimStability = clamp(
        0.56 +
          rangeStability * 0.22 +
          Math.min(3, pressureCount) * 0.035 +
          (shotProfile.sideOrRear ? 0.06 : 0) -
          (shotProfile.frontArmor ? 0.05 : 0) -
          clamp(shotProfile.targetSpeed / Math.max(1, shotProfile.fastLimit), 0, 1) * 0.11 -
          this.unit.suppression / 180,
        0.48,
        0.94
      );
      const fired = IronLine.combat.fireRpg(this.game, this.unit, tank.x, tank.y, { weapon, aimStability });
      if (!fired) return false;

      this.unit.equipmentAmmo.rpg = Math.max(0, (this.unit.equipmentAmmo.rpg || 0) - 1);
      this.unit.suppress(10, tank);
      this.fireCooldown = weapon.cooldown + 0.42 + Math.random() * 0.36 - Math.min(3, pressureCount) * 0.06;
      this.markRpgVolley(tank);
      this.resetRpgAim("fired");
      return true;
    }

    resolveCoverTarget(threat) {
      if (this.coverTarget && this.coverTimer > 0 && this.isReusableCoverTarget(this.coverTarget, threat)) {
        if (this.game.coverSlots?.renew(this.unit, this.coverTarget, 1.4) || !this.game.coverSlots) {
          return this.coverTarget;
        }
        if (this.game.coverSlots?.isAvailable(this.unit, this.coverTarget)) {
          this.coverTarget = this.game.coverSlots.reserve(this.unit, this.coverTarget, 1.4) || this.coverTarget;
          return this.coverTarget;
        }
        this.coverTarget = null;
      }

      this.coverTarget = this.findCoverPoint(threat);
      this.coverTimer = INFANTRY_CONFIG.coverDuration;
      return this.coverTarget;
    }

    isReusableCoverTarget(point, threat) {
      if (!point || !this.pointPassable(point.x, point.y, this.unit.radius + 3)) return false;
      if (!threat || typeof threat.x !== "number" || typeof threat.y !== "number") return true;
      return !hasLineOfSight(this.game, threat, point, { padding: 3, ignoreSmoke: true });
    }

    findCoverPoint(threat) {
      let best = null;
      let bestQuality = -Infinity;

      for (const obstacle of this.game.world.obstacles) {
        const samples = this.coverSamplesForObstacle(obstacle, threat);
        for (const point of samples) {
          if (!this.pointPassable(point.x, point.y, this.unit.radius + 3)) continue;
          if (this.game.coverSlots && !this.game.coverSlots.isAvailable(this.unit, point)) continue;
          if (hasLineOfSight(this.game, threat, point, { padding: 3, ignoreSmoke: true })) continue;

          const selfDistance = distXY(this.unit.x, this.unit.y, point.x, point.y);
          const maxMove = this.coverSearchRadius();
          if (selfDistance > maxMove) continue;

          const quality = this.evaluateCoverPoint(point, obstacle, threat, selfDistance);
          if (quality.total > bestQuality) {
            best = {
              ...point,
              stopDistance: 14,
              final: false,
              cover: true,
              coverQuality: quality.total,
              coverMetrics: quality.metrics
            };
            bestQuality = quality.total;
          }
        }
      }

      return best && this.game.coverSlots
        ? this.game.coverSlots.reserve(this.unit, best, 1.4) || best
        : best;
    }

    coverSearchRadius() {
      const role = this.order?.squadRole || this.unit.squadRole || "assault";
      if (role === "scout") return 520;
      if (role === "support") return 440;
      if (role === "security") return 400;
      return 360;
    }

    evaluateCoverPoint(point, obstacle, threat, selfDistance) {
      const role = this.order?.squadRole || this.unit.squadRole || "assault";
      const threatDistance = distXY(point.x, point.y, threat.x, threat.y);
      const primaryBlock = lineIntersectsRect(
        threat.x,
        threat.y,
        point.x,
        point.y,
        expandedRect(obstacle, 4)
      );

      const metrics = {
        block: primaryBlock ? 1 : 0.72,
        fire: this.coverFireScore(point, threat),
        objective: this.coverObjectiveScore(point, role),
        move: 1 - clamp(selfDistance / this.coverSearchRadius(), 0, 1),
        safety: clamp((threatDistance - 90) / 520, 0, 1)
      };

      const weights = this.coverWeights(role);
      return {
        total: (
          metrics.block * weights.block +
          metrics.fire * weights.fire +
          metrics.objective * weights.objective +
          metrics.move * weights.move +
          metrics.safety * weights.safety
        ) * 100,
        metrics
      };
    }

    coverWeights(role) {
      if (role === "scout") {
        return { block: 0.24, fire: 0.32, objective: 0.16, move: 0.08, safety: 0.2 };
      }
      if (role === "support") {
        return { block: 0.3, fire: 0.3, objective: 0.16, move: 0.12, safety: 0.12 };
      }
      if (role === "security") {
        return { block: 0.32, fire: 0.24, objective: 0.2, move: 0.13, safety: 0.11 };
      }
      return { block: 0.34, fire: 0.16, objective: 0.28, move: 0.15, safety: 0.07 };
    }

    coverObjectiveScore(point, role) {
      if (!this.order?.point) return 0.5;

      const distance = distXY(point.x, point.y, this.order.point.x, this.order.point.y);
      const preferred = role === "support"
        ? this.order.point.radius + 145
        : role === "scout"
          ? this.order.point.radius + 205
          : role === "security"
            ? this.order.point.radius + 95
            : this.order.point.radius + 45;
      const falloff = role === "support" || role === "scout" ? 300 : 230;
      const distanceScore = 1 - clamp(Math.max(0, distance - preferred) / falloff, 0, 1);
      const sightScore = hasLineOfSight(this.game, point, this.order.point, { padding: 2, ignoreSmoke: true }) ? 0.18 : 0;
      return clamp(distanceScore + sightScore, 0, 1);
    }

    coverFireScore(point, threat) {
      if (!threat) return 0;

      const directAngle = angleTo(point.x, point.y, threat.x, threat.y);
      const sideAngle = directAngle + Math.PI / 2;
      const peekOptions = [
        { side: -1, forward: 10 },
        { side: 1, forward: 10 },
        { side: -1, forward: -8 },
        { side: 1, forward: -8 }
      ];

      let best = 0;
      for (const option of peekOptions) {
        const peek = {
          x: point.x + Math.cos(sideAngle) * option.side * 28 + Math.cos(directAngle) * option.forward,
          y: point.y + Math.sin(sideAngle) * option.side * 28 + Math.sin(directAngle) * option.forward
        };
        if (!this.pointPassable(peek.x, peek.y, this.unit.radius + 2)) continue;

        const canSeeThreat = hasLineOfSight(this.game, peek, threat, { padding: 2, ignoreSmoke: true });
        const canSeeObjective = this.order?.point
          ? hasLineOfSight(this.game, peek, this.order.point, { padding: 2, ignoreSmoke: true })
          : false;
        const value = (canSeeThreat ? 0.78 : 0) + (canSeeObjective ? 0.22 : 0);
        best = Math.max(best, value);
      }

      return clamp(best, 0, 1);
    }

    coverSamplesForObstacle(obstacle, threat) {
      const offset = 34;
      const points = [
        { x: obstacle.x - offset, y: obstacle.y + obstacle.h * 0.25 },
        { x: obstacle.x - offset, y: obstacle.y + obstacle.h * 0.75 },
        { x: obstacle.x + obstacle.w + offset, y: obstacle.y + obstacle.h * 0.25 },
        { x: obstacle.x + obstacle.w + offset, y: obstacle.y + obstacle.h * 0.75 },
        { x: obstacle.x + obstacle.w * 0.25, y: obstacle.y - offset },
        { x: obstacle.x + obstacle.w * 0.75, y: obstacle.y - offset },
        { x: obstacle.x + obstacle.w * 0.25, y: obstacle.y + obstacle.h + offset },
        { x: obstacle.x + obstacle.w * 0.75, y: obstacle.y + obstacle.h + offset }
      ];

      return points.sort((a, b) => (
        distXY(a.x, a.y, threat.x, threat.y) - distXY(b.x, b.y, threat.x, threat.y)
      ));
    }

    resolveOrder() {
      const commander = this.game.commanders?.[this.unit.team];
      const ordered = commander?.getInfantryOrderFor(this.unit);
      if (ordered?.role === "repair") return ordered;

      const squadOrder = this.unit.squad?.getOrderFor?.(this.unit);
      if (squadOrder) return squadOrder;

      if (ordered) return ordered;

      const point = this.chooseFallbackPoint();
      if (!point) return null;
      return {
        id: `${this.unit.team}:infantry-fallback:${point.name}`,
        team: this.unit.team,
        point,
        objectiveName: point.name,
        role: "infantry",
        stance: "advance",
        slotIndex: 0,
        slotCount: 1
      };
    }

    chooseFallbackPoint() {
      const enemyOwner = this.unit.team === TEAM.BLUE ? TEAM.RED : TEAM.BLUE;
      const candidates = this.game.capturePoints
        .filter((point) => point.owner !== this.unit.team)
        .map((point) => {
          let score = distXY(this.unit.x, this.unit.y, point.x, point.y);
          if (point.owner === enemyOwner) score -= 240;
          if (point.contested) score -= 160;
          return { point, score };
        })
        .sort((a, b) => a.score - b.score);
      return candidates[0]?.point || this.game.capturePoints[0] || null;
    }

    nextMoveTarget(order) {
      if (this.orderId !== order.id) {
        this.orderId = order.id;
        this.path = [];
        this.pathIndex = 0;
        this.repathTimer = 0;
      }

      const finalTarget = this.formationTarget(order);
      if (this.canMoveDirect(finalTarget.x, finalTarget.y, 24)) {
        this.path = [];
        this.pathIndex = 0;
        return finalTarget;
      }

      if (this.path.length === 0 || this.repathTimer <= 0) this.rebuildPath(order);

      while (
        this.pathIndex < this.path.length &&
        distXY(this.unit.x, this.unit.y, this.path[this.pathIndex].x, this.path[this.pathIndex].y) < 66
      ) {
        this.pathIndex += 1;
      }

      if (this.pathIndex >= this.path.length) return finalTarget;
      const node = this.path[this.pathIndex];
      return { x: node.x, y: node.y, stopDistance: 42, final: false };
    }

    formationTarget(order) {
      const formation = order.formation;
      const count = Math.max(1, formation ? order.roleSlotCount || 1 : order.slotCount || 1);
      const slot = clamp(formation ? order.roleSlotIndex || 0 : order.slotIndex || 0, 0, count - 1);
      let target = null;

      if (formation) {
        const sideIndex = slot - (count - 1) / 2 + (formation.sideBias || 0) * 0.35;
        const forwardX = Math.cos(formation.angle);
        const forwardY = Math.sin(formation.angle);
        const sideX = Math.cos(formation.angle + Math.PI / 2);
        const sideY = Math.sin(formation.angle + Math.PI / 2);
        const sideOffset = sideIndex * (formation.spacing || 36);
        target = {
          x: order.point.x + forwardX * formation.distance + sideX * sideOffset,
          y: order.point.y + forwardY * formation.distance + sideY * sideOffset,
          stopDistance: formation.stopDistance || 24,
          final: true
        };
      } else {
        const angle = this.seed * 0.37 + slot * Math.PI * 2 / count;
        const radius = 46 + slot % 3 * 18;
        target = {
          x: order.point.x + Math.cos(angle) * radius,
          y: order.point.y + Math.sin(angle) * radius,
          stopDistance: 24,
          final: true
        };
      }

      if (formation?.allowOutside && this.pointPassable(target.x, target.y, this.unit.radius + 3)) {
        return target;
      }

      return this.safeFormationTarget(order, target);
    }

    safeFormationTarget(order, target) {
      const allowOutside = Boolean(order.formation?.allowOutside);
      if (this.pointPassable(target.x, target.y, this.unit.radius + 3)) return target;

      const baseAngle = this.seed * 0.51;
      const radii = allowOutside ? [96, 132, 168, 204] : [72, 96, 118, 132];
      for (const radius of radii) {
        for (let step = 0; step < 14; step += 1) {
          const angle = baseAngle + step * Math.PI * 2 / 14;
          const candidate = {
            x: order.point.x + Math.cos(angle) * radius,
            y: order.point.y + Math.sin(angle) * radius,
            stopDistance: target.stopDistance || 24,
            final: true
          };
          if (!allowOutside && distXY(candidate.x, candidate.y, order.point.x, order.point.y) > order.point.radius - 4) continue;
          if (this.pointPassable(candidate.x, candidate.y, this.unit.radius + 3)) return candidate;
        }
      }

      return target;
    }

    rebuildPath(order) {
      if (!this.game.navGraph) return;
      const rawPath = this.game.navGraph.findPathBetween(this.unit, order.point, { padding: 24 });
      this.path = rawPath.filter((node) => distXY(this.unit.x, this.unit.y, node.x, node.y) > 52);
      this.pathIndex = 0;
      this.repathTimer = 2.8 + Math.random() * 0.9;
    }

    moveTo(dt, target) {
      this.clearProne(1.35);
      target = this.activeMoveTarget(dt, target);
      const dx = target.x - this.unit.x;
      const dy = target.y - this.unit.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= (target.stopDistance || 20) + (target.final ? 8 : 2)) {
        this.unit.speed = approach(this.unit.speed, 0, 260 * dt);
        return;
      }

      const desiredAngle = angleTo(this.unit.x, this.unit.y, target.x, target.y);
      const steer = this.avoidanceVector(Math.cos(desiredAngle), Math.sin(desiredAngle));
      const steerAngle = Math.atan2(steer.y, steer.x);
      this.moveHeading = rotateTowards(this.moveHeading, steerAngle, 5.2 * dt);
      this.unit.angle = this.moveHeading;
      const moraleSpeed = clamp(this.unit.morale + 0.22, 0.58, 1);
      const weaponSpeed = this.weapon().moveSpeedMultiplier || 1;
      const targetSpeed = this.unit.maxSpeed * clamp(distance / 180, 0.45, 1) * moraleSpeed * weaponSpeed;
      this.unit.speed = approach(this.unit.speed, targetSpeed, 320 * dt);
      tryMoveCircle(
        this.game,
        this.unit,
        Math.cos(this.unit.angle) * this.unit.speed,
        Math.sin(this.unit.angle) * this.unit.speed,
        this.unit.radius,
        dt,
        { blockTanks: true, padding: 5 }
      );
    }

    avoidanceVector(vx, vy) {
      let ax = vx;
      let ay = vy;

      for (const obstacle of this.game.world.obstacles) {
        const expanded = expandedRect(obstacle, 28);
        const lookX = this.unit.x + vx * 52;
        const lookY = this.unit.y + vy * 52;
        if (!lineIntersectsRect(this.unit.x, this.unit.y, lookX, lookY, expanded)) continue;

        const nearestX = clamp(this.unit.x, obstacle.x, obstacle.x + obstacle.w);
        const nearestY = clamp(this.unit.y, obstacle.y, obstacle.y + obstacle.h);
        const awayX = this.unit.x - nearestX;
        const awayY = this.unit.y - nearestY;
        const distance = Math.max(1, Math.hypot(awayX, awayY));
        ax += (awayX / distance) * 0.75;
        ay += (awayY / distance) * 0.75;
      }

      for (const other of this.game.infantry || []) {
        if (other === this.unit || !other.alive || other.inVehicle) continue;
        const distance = distXY(this.unit.x, this.unit.y, other.x, other.y);
        if (distance > 32 || distance < 1) continue;
        ax += ((this.unit.x - other.x) / distance) * (32 - distance) / 22;
        ay += ((this.unit.y - other.y) / distance) * (32 - distance) / 22;
      }

      for (const tank of [...(this.game.tanks || []), ...(this.game.humvees || [])]) {
        if (!tank.alive) continue;
        const distance = distXY(this.unit.x, this.unit.y, tank.x, tank.y);
        if (distance > 86 || distance < 1) continue;
        ax += ((this.unit.x - tank.x) / distance) * (86 - distance) / 34;
        ay += ((this.unit.y - tank.y) / distance) * (86 - distance) / 34;
      }

      const laneAvoidance = this.friendlyTankFireLaneAvoidance();
      ax += laneAvoidance.x;
      ay += laneAvoidance.y;

      const length = Math.max(0.001, Math.hypot(ax, ay));
      return { x: ax / length, y: ay / length };
    }

    friendlyTankFireLaneAvoidance() {
      const danger = this.friendlyTankFireLaneDanger();
      if (!danger) return { x: 0, y: 0 };
      return {
        x: danger.awayX * danger.force,
        y: danger.awayY * danger.force
      };
    }

    findFriendlyTankFireLaneEscape() {
      const danger = this.friendlyTankFireLaneDanger();
      if (!danger || danger.force < 0.24) return null;

      const distances = [82, 118, 154];
      const sideAngles = [
        Math.atan2(danger.awayY, danger.awayX),
        danger.laneAngle + Math.PI / 2,
        danger.laneAngle - Math.PI / 2
      ];

      for (const distance of distances) {
        for (const angle of sideAngles) {
          const candidate = {
            x: this.unit.x + Math.cos(angle) * distance,
            y: this.unit.y + Math.sin(angle) * distance,
            stopDistance: 12,
            final: false,
            fireLaneEscape: true
          };
          if (this.pointPassable(candidate.x, candidate.y, this.unit.radius + 3)) return candidate;
        }
      }

      return null;
    }

    friendlyTankFireLaneDanger() {
      let best = null;

      for (const tank of this.game.tanks || []) {
        if (!tank.alive || tank.team !== this.unit.team) continue;
        if (tank.isPlayerTank && !tank.playerControlled) continue;
        if (!tank.isOperational?.() && !tank.playerControlled) continue;

        const combatTarget = tank.ai?.combat?.target || tank.ai?.targetTank || null;
        const hasLiveTarget = combatTarget &&
          combatTarget.alive !== false &&
          combatTarget.team !== this.unit.team;
        if (!tank.playerControlled && !hasLiveTarget) continue;

        const ammoId = tank.loadedAmmo || tank.reload?.ammoId || "ap";
        const ammo = AMMO[ammoId] || AMMO.ap;
        const targetDistance = hasLiveTarget
          ? distXY(tank.x, tank.y, combatTarget.x, combatTarget.y)
          : ammo.range || 1200;
        const targetAimDiff = hasLiveTarget
          ? Math.abs(normalizeAngle(tank.turretAngle - angleTo(tank.x, tank.y, combatTarget.x, combatTarget.y)))
          : 0;
        if (!tank.playerControlled && targetAimDiff > 0.26 && !tank.canFire?.()) continue;

        const muzzleDistance = tank.radius + 30;
        const startX = tank.x + Math.cos(tank.turretAngle) * muzzleDistance;
        const startY = tank.y + Math.sin(tank.turretAngle) * muzzleDistance;
        const laneLength = Math.min(ammo.range || 1200, tank.playerControlled ? 1150 : targetDistance + 170);
        const endX = startX + Math.cos(tank.turretAngle) * laneLength;
        const endY = startY + Math.sin(tank.turretAngle) * laneLength;
        const laneDx = endX - startX;
        const laneDy = endY - startY;
        const laneLenSq = Math.max(1, laneDx * laneDx + laneDy * laneDy);
        const t = ((this.unit.x - startX) * laneDx + (this.unit.y - startY) * laneDy) / laneLenSq;
        if (t < 0 || t > 1) continue;

        const laneDistance = segmentDistanceToPoint(startX, startY, endX, endY, this.unit.x, this.unit.y);
        const laneWidth = (ammo.id === "he" ? 58 : 38) + this.unit.radius;
        if (laneDistance > laneWidth) continue;

        const closestX = startX + laneDx * t;
        const closestY = startY + laneDy * t;
        let awayX = this.unit.x - closestX;
        let awayY = this.unit.y - closestY;
        const awayLength = Math.hypot(awayX, awayY);
        if (awayLength < 0.001) {
          awayX = Math.cos(tank.turretAngle + Math.PI / 2);
          awayY = Math.sin(tank.turretAngle + Math.PI / 2);
        } else {
          awayX /= awayLength;
          awayY /= awayLength;
        }

        const reloadReady = tank.reload?.active && tank.reload.duration > 0
          ? clamp(tank.reload.progress / tank.reload.duration, 0, 1)
          : 0;
        const fireReady = tank.canFire?.()
          ? 1
          : reloadReady > 0.68
            ? 0.46
            : tank.playerControlled ? 0.36 : 0.18;
        const force = clamp((laneWidth - laneDistance) / laneWidth, 0, 1) * fireReady;
        if (!best || force > best.force) {
          best = {
            tank,
            force,
            awayX,
            awayY,
            laneAngle: tank.turretAngle
          };
        }
      }

      return best;
    }

    canMoveDirect(x, y, padding = 24) {
      return !this.game.world.obstacles.some((obstacle) => (
        lineIntersectsRect(this.unit.x, this.unit.y, x, y, expandedRect(obstacle, padding))
      ));
    }

    pointPassable(x, y, radius) {
      if (x < radius || y < radius || x > this.game.world.width - radius || y > this.game.world.height - radius) {
        return false;
      }
      return !this.game.world.obstacles.some((obstacle) => circleRectCollision(x, y, radius, obstacle)) &&
        !circleIntersectsTank(this.game, this.unit, x, y, radius, { padding: 5 });
    }

    recordMovement(dt, beforeX, beforeY, target) {
      const moved = distXY(beforeX, beforeY, this.unit.x, this.unit.y);
      const trying = target && distXY(this.unit.x, this.unit.y, target.x, target.y) > (target.stopDistance || 20) + 8;
      if (trying && moved < 12 * dt) this.stuckTimer += dt;
      else this.stuckTimer = Math.max(0, this.stuckTimer - dt * 1.8);

      if (this.stuckTimer > 0.9) {
        this.path = [];
        this.pathIndex = 0;
        this.repathTimer = 0;
        this.startMovementRecovery(target);
        this.stuckTimer = 0;
      }
    }

    activeMoveTarget(dt, target) {
      if (this.recoveryTimer <= 0 || !this.recoveryTarget || target?.recovery) {
        if (this.recoveryTimer <= 0) this.recoveryTarget = null;
        return target;
      }

      this.recoveryTimer = Math.max(0, this.recoveryTimer - dt);
      const reached = distXY(this.unit.x, this.unit.y, this.recoveryTarget.x, this.recoveryTarget.y) <=
        (this.recoveryTarget.stopDistance || 12) + 6;
      const passable = this.pointPassable(this.recoveryTarget.x, this.recoveryTarget.y, this.unit.radius + 3);
      if (reached || !passable) {
        this.recoveryTarget = null;
        this.recoveryTimer = 0;
        return target;
      }

      return this.recoveryTarget;
    }

    startMovementRecovery(target) {
      const recovery = this.findMovementRecoveryTarget(target);
      if (!recovery) return false;
      this.recoveryTarget = recovery;
      this.recoveryTimer = 0.72;
      return true;
    }

    findMovementRecoveryTarget(target) {
      if (!target) return null;

      const desiredAngle = angleTo(this.unit.x, this.unit.y, target.x, target.y);
      const angles = [
        desiredAngle + Math.PI / 2,
        desiredAngle - Math.PI / 2,
        desiredAngle + Math.PI,
        desiredAngle + 0.68,
        desiredAngle - 0.68
      ];
      const distances = [52, 76, 104];

      for (const distance of distances) {
        for (const angle of angles) {
          const candidate = {
            x: this.unit.x + Math.cos(angle) * distance,
            y: this.unit.y + Math.sin(angle) * distance,
            stopDistance: 10,
            final: false,
            recovery: true
          };
          if (!this.pointPassable(candidate.x, candidate.y, this.unit.radius + 3)) continue;
          if (!this.canMoveDirect(candidate.x, candidate.y, 14)) continue;
          return candidate;
        }
      }

      return null;
    }

    updateDebug(moveTarget) {
      this.updateThoughtBubble();
      const transportDebug = this.activeTransportDebug();
      this.debug.state = this.state;
      this.debug.goal = this.order?.objectiveName || "";
      this.debug.target = this.target;
      this.debug.coverTarget = this.coverTarget;
      this.debug.moveTarget = moveTarget;
      this.debug.weaponId = this.unit.weaponId;
      this.debug.classId = this.unit.classId;
      this.debug.rpgAmmo = this.unit.equipmentAmmo?.rpg || 0;
      this.debug.rpgAim = this.rpgAimTime || 0;
      this.debug.rpgAimRequired = this.rpgAimRequired || 0;
      this.debug.rpgHoldReason = this.rpgHoldReason || "";
      this.debug.grenadeAmmo = this.unit.equipmentAmmo?.grenade || 0;
      this.debug.repairAmmo = this.unit.equipmentAmmo?.repairKit || 0;
      this.debug.squadId = this.order?.squadId || this.unit.squadId || "";
      this.debug.squadRole = this.order?.squadRole || this.unit.squadRole || "";
      this.debug.tacticalMode = this.order?.tacticalMode || this.unit.squad?.tacticalMode || "";
      this.debug.tacticalTimerRemaining = this.order?.tacticalTimerRemaining || 0;
      this.debug.isProne = Boolean(this.unit.isProne);
      this.debug.supportRequest = this.order?.supportRequest?.type || this.order?.supportRequestType || this.unit.squad?.supportRequest?.type || "";
      this.debug.transportMode = transportDebug.mode;
      this.debug.transportVehicleId = transportDebug.vehicleId;
      if (this.unit.classId !== "scout") this.debug.scoutReports = 0;
      this.debug.coverQuality = this.coverTarget?.coverQuality || 0;
      this.debug.suppression = this.unit.suppression;
      this.debug.morale = this.unit.morale;
      this.debug.thought = this.thoughtText;
      this.debug.path = this.path;
      this.debug.pathIndex = this.pathIndex;
      this.debug.stuckTimer = this.stuckTimer;
    }

    activeTransportDebug() {
      if (this.unit.inVehicle) {
        return {
          mode: "ride",
          vehicleId: this.unit.inVehicle.callSign || ""
        };
      }

      if (this.state !== "board-transport" && this.state !== "reboard-transport") {
        return { mode: "", vehicleId: "" };
      }

      return {
        mode: this.state === "reboard-transport" ? "remount" : "mount",
        vehicleId: this.order?.transport?.vehicleId || this.target?.callSign || ""
      };
    }

    updateThoughtBubble() {
      const thought = this.thoughtCandidate();
      if (!thought) {
        if (String(this.lastThoughtKey || "").startsWith("transport:")) {
          this.thoughtTimer = Math.min(this.thoughtTimer, 0.25);
        }
        return;
      }

      const changed = thought.key !== this.lastThoughtKey;
      const repeat = thought.repeat && this.thoughtTimer <= 0 && this.thoughtCooldown <= 0;
      if (!changed && !repeat) return;
      if (!changed && this.thoughtCooldown > 0) return;

      this.thoughtText = thought.text;
      this.thoughtTimer = thought.duration || 2.15;
      this.thoughtCooldown = (thought.cooldown || 5.2) + (this.seed % 7) * 0.18;
      this.lastThoughtKey = thought.key;
    }

    thoughtLine(lines, salt = "") {
      if (!Array.isArray(lines) || lines.length === 0) return "";
      return lines[(this.seed + this.hash(salt)) % lines.length];
    }

    thoughtCandidate() {
      const order = this.order || {};
      const role = order.squadRole || this.unit.squadRole || this.squadRole();
      const mode = order.tacticalMode || this.unit.squad?.tacticalMode || "";
      const slotIndex = order.roleSlotIndex || 0;
      const voiceLead = role === "assault" && slotIndex === 0;
      const roleVoice = slotIndex === 0 || role === "support" || role === "scout";
      const supportRequest = order.supportRequest?.type || order.supportRequestType || this.unit.squad?.supportRequest?.type || "";
      const squadStatus = order.squadStatus || this.unit.squad?.status || {};
      const grouped = (squadStatus.cohesion || Infinity) < 130;

      if (this.unit.inVehicle || this.state === "mounted-transport") {
        return { key: "transport:ride", text: this.thoughtLine(["차량 이동 중", "하차 지점까지 이동"], "transport-ride"), repeat: true, cooldown: 6.4 };
      }
      if (this.state === "reboard-transport" && roleVoice) {
        return { key: "transport:remount", text: this.thoughtLine(["후퇴 차량 탑승", "부상자 태우고 이탈", "재탑승 후 빠진다"], "transport-remount"), repeat: true, cooldown: 5.2 };
      }
      if (this.state === "board-transport" && roleVoice) {
        return { key: "transport:mount", text: this.thoughtLine(["차량 도착, 탑승", "수송차에 오른다", "빠르게 탑승"], "transport-mount"), repeat: true, cooldown: 5.8 };
      }

      if (this.target?.weaponId === "sniper" && roleVoice) {
        return { key: "report:sniper", text: this.thoughtLine(["적 저격수 발견", "저격수 위치 보고", "원거리 사수 확인"], "sniper-report"), repeat: true, cooldown: 6.2 };
      }

      if (this.state === "repair-tank") {
        return { key: "state:repair", text: this.thoughtLine(["손상 차량 수리", "공병, 수리 들어간다"], "repair"), repeat: true, cooldown: 5.4 };
      }
      if (this.state === "avoid-fire-lane") {
        return { key: "state:fire-lane", text: "아군 사선 비운다", repeat: false };
      }
      if (this.state === "suppressed") {
        return { key: "state:suppressed", text: this.thoughtLine(["제압당함, 낮게", "탄막 심하다, 엎드려", "엄폐 필요"], "suppressed"), repeat: true, cooldown: 4.7 };
      }
      if (this.state === "prone-fire") {
        const text = role === "support"
          ? this.thoughtLine(["엎드려 엄호", "LMG 낮게 깔아", "지원화기 고정"], "prone-support")
          : this.thoughtLine(["낮게 쏜다", "엎드려 반격", "자세 낮춰"], "prone-assault");
        return { key: `state:prone:${role}`, text, repeat: true, cooldown: 5.2 };
      }
      if (this.state === "cover") {
        return { key: "state:cover", text: "엄폐로 이동", repeat: false };
      }
      if (this.state === "rpg-position") {
        return { key: "state:rpg-position", text: "RPG 각 잡는다", repeat: true, cooldown: 5.2 };
      }
      if (this.state === "rpg-attack") {
        return { key: "state:rpg-attack", text: "RPG 발사", repeat: false };
      }
      if (this.state === "recon-move") {
        return { key: "recon:move", text: this.thoughtLine(["측면 정찰 이동", "외곽으로 돈다", "관측점으로 이동"], "recon-move"), repeat: true, cooldown: 6.2 };
      }
      if (this.state === "recon-watch") {
        const reportText = (this.debug.scoutReports || 0) > 0
          ? this.thoughtLine(["적 위치 보고", "접촉 보고 올린다", "표적 좌표 공유"], "recon-report")
          : this.thoughtLine(["외곽 감시 중", "사각 감시 유지", "측면 보고 대기"], "recon-watch");
        return { key: "recon:watch", text: reportText, repeat: true, cooldown: 6.8 };
      }
      if (this.state === "recon-snipe") {
        return { key: "recon:snipe", text: this.thoughtLine(["측면 사선 잡았다", "쏘고 위치 바꾼다", "원거리에서 끊는다"], "recon-snipe"), repeat: true, cooldown: 5.7 };
      }
      if (this.state === "recon-evade") {
        return { key: "recon:evade", text: this.thoughtLine(["위치 노출, 이탈", "들켰다, 빠진다"], "recon-evade"), repeat: false };
      }

      if (supportRequest && voiceLead) {
        const requestText = {
          "need-armor-support": this.thoughtLine(["장갑 지원 요청", "전차 지원 필요"], "need-armor"),
          "need-fire-support": this.thoughtLine(["화력지원 요청", "기관총 지원 필요", "지원 화력 불러"], "need-fire"),
          "need-regroup": this.thoughtLine(["분대 재집결", "흩어졌다, 다시 모여"], "need-regroup")
        }[supportRequest] || "지원 요청";
        return { key: `request:${supportRequest}`, text: requestText, repeat: true, cooldown: 6 };
      }

      if (mode === "pre-assault" && roleVoice) {
        const text = role === "support"
          ? this.thoughtLine(["LMG 자리 잡는다", "엄호조 사선 확보", "지원화기 준비"], "pre-support")
          : role === "security"
            ? this.thoughtLine(["측면 경계 선다", "우회로 확인", "측면 차단 준비"], "pre-security")
            : grouped
              ? this.thoughtLine(["분대 집결, 진입 준비", "엄호 확인 후 돌입", "대형 맞추고 진입"], "pre-assault-grouped")
              : this.thoughtLine(["돌격조 전진 준비", "엄호 기다린 뒤 진입"], "pre-assault");
        return { key: `mode:pre-assault:${role}`, text, repeat: true, cooldown: 5.6 };
      }
      if (mode === "support-fire" && roleVoice) {
        const text = role === "support"
          ? this.thoughtLine(["엄호 사격 유지", "돌격조 가려준다", "사선 열어둔다"], "support-role")
          : role === "security"
            ? this.thoughtLine(["측면을 막는다", "우회 접근 차단"], "security-role")
            : this.thoughtLine(["엄호 받으며 전진", "짧게 뛰고 멈춘다", "엄호선 맞춰 이동"], "assault-support-fire");
        return { key: `mode:support-fire:${role}`, text, repeat: true, cooldown: 5.4 };
      }
      if (mode === "hold-wall" && roleVoice) {
        const text = role === "support"
          ? this.thoughtLine(["벽 뒤에서 엄호", "방어 사선 유지"], "hold-support")
          : this.thoughtLine(["엄폐선 유지", "벽 뒤에서 버틴다"], "hold-wall");
        return { key: `mode:hold-wall:${role}`, text, repeat: true, cooldown: 6.2 };
      }
      if (mode === "fallback" && voiceLead) {
        return { key: "mode:fallback", text: this.thoughtLine(["압박 크다, 후퇴", "뒤로 빼서 재정비"], "fallback"), repeat: true, cooldown: 5.4 };
      }
      if (mode === "regroup" && voiceLead) {
        return { key: "mode:regroup", text: this.thoughtLine(["분대 재집결", "대형 다시 맞춘다", "모여서 다시 간다"], "regroup"), repeat: true, cooldown: 5.8 };
      }
      if (mode === "rally-with-tank" && voiceLead) {
        return { key: "mode:rally-tank", text: this.thoughtLine(["전차 엄호선 맞춘다", "장갑 지원에 맞춰 진입", "전차 뒤에서 진입"], "rally-tank"), repeat: true, cooldown: 6 };
      }
      if ((mode === "hold" || order.role === "hold") && voiceLead) {
        return { key: "mode:hold", text: "구역 유지 중", repeat: true, cooldown: 7 };
      }
      if (!order.point && voiceLead) {
        return { key: "state:idle", text: "명령 대기", repeat: true, cooldown: 7.2 };
      }

      return null;
    }
  }

  IronLine.InfantryAI = InfantryAI;
})(window);
