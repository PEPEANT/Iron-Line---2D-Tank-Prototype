"use strict";

(function registerInfantryRepairDecision(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const InfantryAI = IronLine.InfantryAI;
  if (!InfantryAI) return;

  const { INFANTRY_WEAPONS } = IronLine.constants;
  const { distXY } = IronLine.math;

  Object.assign(InfantryAI.prototype, {
    repairWorkRange(tank, bonus = 0) {
      const weapon = INFANTRY_WEAPONS.repairKit;
      return (weapon?.range || 72) + (tank?.radius || 0) + bonus;
    },

    repairDecisionFor(tank, distance, range, reason, score = 0.38) {
      return {
        decision: reason === "repair_applied" ? "repair" : "hold_repair",
        reason,
        reasonLabel: this.repairReasonLabel(reason),
        score,
        scores: {
          repair: score,
          move: reason === "approaching" ? 0.72 : 0.18
        },
        facts: {
          targetId: tank?.callSign || "",
          hp: Math.round(tank?.hp || 0),
          maxHp: Math.round(tank?.maxHp || 0),
          distance: Math.round(distance || 0),
          range: Math.round(range || 0),
          repairAmmo: this.unit.equipmentAmmo?.repairKit || 0,
          cooldown: Math.round((this.fireCooldown || 0) * 10) / 10
        }
      };
    },

    repairReasonLabel(reason) {
      if (reason === "approaching") return "수리 위치로 이동";
      if (reason === "out_of_range") return "수리 거리 밖";
      if (reason === "kit_cooldown") return "수리킷 재사용 대기";
      if (reason === "no_repair_kit") return "수리킷 없음";
      if (reason === "repair_applied") return "수리 적용";
      if (reason === "target_invalid") return "대상 없음";
      if (reason === "already_repaired") return "이미 수리됨";
      return reason || "-";
    },

    tryRepairTank(tank, options = {}) {
      const weapon = INFANTRY_WEAPONS.repairKit;
      const distance = tank ? distXY(this.unit.x, this.unit.y, tank.x, tank.y) : Infinity;
      const range = this.repairWorkRange(tank, options.rangeBonus || 0);
      if (!weapon || !tank || !tank.alive) {
        this.repairDecision = this.repairDecisionFor(tank, distance, range, "target_invalid", 0.08);
        return false;
      }
      if (tank.hp >= tank.maxHp) {
        this.repairDecision = this.repairDecisionFor(tank, distance, range, "already_repaired", 0.18);
        return false;
      }
      if ((this.unit.equipmentAmmo?.repairKit || 0) <= 0) {
        this.repairDecision = this.repairDecisionFor(tank, distance, range, "no_repair_kit", 0.12);
        return false;
      }
      if (distance > range) {
        this.repairDecision = this.repairDecisionFor(tank, distance, range, "out_of_range", 0.24);
        return false;
      }
      if (this.fireCooldown > 0) {
        this.repairDecision = this.repairDecisionFor(tank, distance, range, "kit_cooldown", 0.46);
        return false;
      }

      this.unit.equipmentAmmo.repairKit = Math.max(0, (this.unit.equipmentAmmo.repairKit || 0) - 1);
      const beforeHp = tank.hp;
      tank.hp = Math.min(tank.maxHp, tank.hp + (weapon.repairAmount || 28));
      this.fireCooldown = (weapon.cooldown || 1.1) + 0.32 + Math.random() * 0.22;
      this.repairDecision = this.repairDecisionFor(tank, distance, range, "repair_applied", 0.96);
      this.repairDecision.facts.repaired = Math.round(tank.hp - beforeHp);

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
  });
})(window);
