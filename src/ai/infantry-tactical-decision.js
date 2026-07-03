"use strict";

(function registerInfantryTacticalDecision(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const InfantryAI = IronLine.InfantryAI;
  if (!InfantryAI) return;

  const { clamp, distXY, angleTo, normalizeAngle, segmentDistanceToPoint } = IronLine.math;

  const REASON_LABELS = {
    tank_he_spread: "탱크 고폭탄 위험: 산개",
    cluster_spread: "밀집 위험: 산개",
    advance_priority: "진격 우선",
    suppression_prone: "제압 사격: 엎드림",
    defend_cover: "방어 위치: 엄폐",
    fire_contact: "교전 유지",
    hold_position: "위치 유지"
  };

  Object.assign(InfantryAI.prototype, {
    evaluateTacticalDecision(order, contact, tankThreat, context = {}) {
      const mode = order?.tacticalMode || this.unit.squad?.tacticalMode || order?.role || "advance";
      const role = order?.squadRole || this.unit.squadRole || this.squadRole?.() || "assault";
      const objectiveDistance = order?.point
        ? distXY(this.unit.x, this.unit.y, order.point.x, order.point.y)
        : Infinity;
      const objectiveRadius = order?.point?.radius || 150;
      const suppression = clamp((this.unit.suppression || 0) / 100, 0, 1);
      const cluster = this.friendlyClusterRisk();
      const tankCannon = this.tankCannonThreatScore(tankThreat);
      const tankMg = this.tankMachineGunThreatScore(tankThreat, contact);
      const softContact = contact && !contact.vehicleType;
      const attackIntent = !["hold", "hold-wall", "support-fire", "fallback", "regroup"].includes(mode) && order?.role !== "hold";
      const defendIntent = mode === "hold-wall" || mode === "support-fire" || order?.role === "hold";
      const nearObjective = objectiveDistance <= objectiveRadius + 130;
      const hasAntiTank = Boolean(this.hasRpg?.()) || (this.unit.equipmentAmmo?.grenade || 0) > 0;

      const scores = {
        advance: clamp(
          0.2 +
          (attackIntent ? 0.32 : 0) +
          (nearObjective ? 0.18 : 0) +
          (mode === "pre-assault" ? 0.14 : 0) -
          suppression * 0.22 -
          tankCannon * 0.12,
          0,
          1
        ),
        spread: clamp(
          cluster * 0.42 +
          tankCannon * 0.48 +
          (context.pressureThreat?.vehicleType ? 0.14 : 0) +
          (tankThreat && !hasAntiTank ? 0.08 : 0),
          0,
          1
        ),
        prone: clamp(
          suppression * 0.68 +
          tankMg * 0.28 +
          (softContact ? 0.18 : 0) +
          (role === "support" ? 0.12 : 0) +
          (defendIntent ? 0.12 : 0) -
          tankCannon * 0.34 -
          (attackIntent && nearObjective ? 0.12 : 0),
          0,
          1
        ),
        cover: clamp(
          suppression * 0.24 +
          tankCannon * 0.2 +
          tankMg * 0.16 +
          (defendIntent ? 0.18 : 0),
          0,
          1
        ),
        fire: clamp(
          (contact ? 0.34 : 0) +
          (tankThreat && hasAntiTank ? 0.22 : 0) +
          (role === "support" ? 0.08 : 0) -
          suppression * 0.18,
          0,
          1
        )
      };

      let decision = "advance";
      let reason = "advance_priority";
      let target = null;
      let score = scores.advance;

      if (scores.spread >= 0.5 && scores.spread >= scores.prone - 0.05 && scores.spread >= scores.cover - 0.06) {
        decision = "spread";
        reason = tankCannon >= 0.34 ? "tank_he_spread" : "cluster_spread";
        target = this.tacticalSpreadTarget(tankThreat || contact || order?.point);
        score = scores.spread;
      } else if (scores.prone >= 0.34 && scores.prone >= scores.advance - 0.06 && scores.prone >= scores.cover - 0.04) {
        decision = "prone";
        reason = "suppression_prone";
        score = scores.prone;
      } else if (scores.cover >= 0.48 && scores.cover >= scores.advance) {
        decision = "cover";
        reason = "defend_cover";
        score = scores.cover;
      } else if (scores.fire >= 0.46 && !attackIntent) {
        decision = "fire";
        reason = "fire_contact";
        score = scores.fire;
      } else if (!attackIntent && !contact && !tankThreat) {
        decision = "hold_position";
        reason = "hold_position";
        score = Math.max(scores.cover, 0.28);
      }

      if (decision === "spread" && !target) {
        decision = attackIntent ? "advance" : "cover";
        reason = attackIntent ? "advance_priority" : "defend_cover";
        score = attackIntent ? scores.advance : scores.cover;
      }

      return {
        decision,
        reason,
        reasonLabel: REASON_LABELS[reason] || reason,
        score: Math.round(score * 100) / 100,
        scores: Object.fromEntries(Object.entries(scores).map(([key, value]) => [key, Math.round(value * 100) / 100])),
        target,
        facts: {
          mode,
          role,
          objectiveDistance: Math.round(clamp(objectiveDistance, 0, 9999)),
          cluster: Math.round(cluster * 100) / 100,
          tankCannon: Math.round(tankCannon * 100) / 100,
          tankMg: Math.round(tankMg * 100) / 100,
          suppression: Math.round(suppression * 100) / 100,
          hasAntiTank
        }
      };
    },

    shouldExecuteTacticalSpread(decision, tankThreat) {
      if (!decision || decision.decision !== "spread" || !decision.target) return false;
      if (this.hasRpg?.() && tankThreat && (decision.scores?.fire || 0) >= (decision.scores?.spread || 0) - 0.04) return false;
      return (decision.scores?.spread || decision.score || 0) >= 0.5;
    },

    executeTacticalSpread(dt, decision, threat, beforeX, beforeY) {
      if (!this.shouldExecuteTacticalSpread(decision, threat) || !decision.target) return false;
      this.clearProne(0.8, true);
      this.state = "spread";
      this.target = threat || this.target || null;
      if (this.target) this.faceContact(this.target, dt);
      this.moveTo(dt, decision.target);
      this.recordMovement(dt, beforeX, beforeY, decision.target);
      this.updateDebug(decision.target);
      return true;
    },

    friendlyClusterRisk(radius = 132) {
      let pressure = 0;
      let count = 0;
      for (const other of this.game.infantry || []) {
        if (other === this.unit || !other.alive || other.inVehicle || other.team !== this.unit.team) continue;
        const distance = distXY(this.unit.x, this.unit.y, other.x, other.y);
        if (distance > radius || distance < 1) continue;
        count += 1;
        pressure += clamp((radius - distance) / radius, 0, 1);
      }
      return clamp(pressure / 2.4 + Math.max(0, count - 2) * 0.12, 0, 1);
    },

    tankCannonThreatScore(tank) {
      if (!tank?.alive || tank.team === this.unit.team) return 0;
      const distance = distXY(this.unit.x, this.unit.y, tank.x, tank.y);
      if (distance > 980) return 0;
      const ammoId = tank.loadedAmmo || tank.reload?.ammoId || "";
      const heIntent = ammoId === "he" || tank.weaponMode !== "mg";
      const laneRisk = this.tankCannonLaneRisk(tank);
      const distanceRisk = clamp(1 - distance / 980, 0, 1);
      return clamp((heIntent ? 0.24 : 0.08) + distanceRisk * 0.26 + laneRisk * 0.48 + this.friendlyClusterRisk(150) * 0.18, 0, 1);
    },

    tankMachineGunThreatScore(tank, contact) {
      const source = tank?.alive ? tank : contact;
      if (!source || source.team === this.unit.team) return 0;
      const distance = distXY(this.unit.x, this.unit.y, source.x, source.y);
      if (distance > 720) return 0;
      const mgIntent = source.weaponMode === "mg" || source.vehicleType === "humvee" || !source.vehicleType;
      return clamp((mgIntent ? 0.2 : 0.05) + clamp(1 - distance / 720, 0, 1) * 0.34 + clamp((this.unit.suppression || 0) / 100, 0, 1) * 0.28, 0, 1);
    },

    tankCannonLaneRisk(tank) {
      const laneLength = 980;
      const muzzle = (tank.radius || 40) + 28;
      const startX = tank.x + Math.cos(tank.turretAngle || tank.angle || 0) * muzzle;
      const startY = tank.y + Math.sin(tank.turretAngle || tank.angle || 0) * muzzle;
      const endX = startX + Math.cos(tank.turretAngle || tank.angle || 0) * laneLength;
      const endY = startY + Math.sin(tank.turretAngle || tank.angle || 0) * laneLength;
      const dx = endX - startX;
      const dy = endY - startY;
      const lengthSq = Math.max(1, dx * dx + dy * dy);
      const t = ((this.unit.x - startX) * dx + (this.unit.y - startY) * dy) / lengthSq;
      if (t < -0.05 || t > 1.02) return 0;
      const laneDistance = segmentDistanceToPoint(startX, startY, endX, endY, this.unit.x, this.unit.y);
      return clamp(1 - laneDistance / 145, 0, 1);
    },

    tacticalSpreadTarget(threat) {
      if (!threat) return null;
      const awayAngle = angleTo(threat.x, threat.y, this.unit.x, this.unit.y);
      const objective = this.order?.point || null;
      const objectiveAngle = objective ? angleTo(this.unit.x, this.unit.y, objective.x, objective.y) : awayAngle;
      const angles = [
        awayAngle + Math.PI / 2,
        awayAngle - Math.PI / 2,
        awayAngle,
        objectiveAngle + Math.PI / 2,
        objectiveAngle - Math.PI / 2,
        awayAngle + 0.72,
        awayAngle - 0.72
      ];
      const distances = [82, 116, 152, 188];
      let best = null;
      let bestScore = Infinity;

      for (const distance of distances) {
        for (const angle of angles) {
          const candidate = {
            x: this.unit.x + Math.cos(angle) * distance,
            y: this.unit.y + Math.sin(angle) * distance,
            stopDistance: 14,
            final: false,
            tacticalSpread: true
          };
          if (!this.pointPassable(candidate.x, candidate.y, this.unit.radius + 3)) continue;
          if (!this.canMoveDirect(candidate.x, candidate.y, 18)) continue;
          const threatDistance = distXY(candidate.x, candidate.y, threat.x, threat.y);
          const objectivePenalty = objective ? Math.max(0, distXY(candidate.x, candidate.y, objective.x, objective.y) - (objective.radius || 160) - 220) * 0.18 : 0;
          const friendPenalty = this.spreadFriendPenalty(candidate.x, candidate.y);
          const forwardPenalty = Math.abs(normalizeAngle(angle - objectiveAngle)) > Math.PI * 0.68 ? 20 : 0;
          const score = -threatDistance * 0.36 + objectivePenalty + friendPenalty + forwardPenalty + distance * 0.08;
          if (score < bestScore) {
            best = candidate;
            bestScore = score;
          }
        }
      }

      return best;
    },

    spreadFriendPenalty(x, y) {
      let penalty = 0;
      for (const other of this.game.infantry || []) {
        if (other === this.unit || !other.alive || other.inVehicle || other.team !== this.unit.team) continue;
        const distance = distXY(x, y, other.x, other.y);
        if (distance < 58) penalty += 120;
        else if (distance < 98) penalty += 50;
      }
      return penalty;
    }
  });
})(window);
