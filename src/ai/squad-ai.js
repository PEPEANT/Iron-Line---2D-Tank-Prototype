"use strict";

(function registerSquadAI(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { distXY, angleTo } = IronLine.math;

  class SquadAI {
    constructor(game, options) {
      this.game = game;
      this.team = options.team;
      this.callSign = options.callSign;
      this.units = [];
      this.order = null;
      this.roleMap = new Map();
      this.summary = "";

      for (const unit of options.units || []) this.addUnit(unit);
      this.rebuildRoles();
    }

    addUnit(unit) {
      if (!unit || this.units.includes(unit)) return;
      this.units.push(unit);
      unit.squad = this;
      unit.squadId = this.callSign;
    }

    activeUnits() {
      return this.units
        .filter((unit) => unit.alive && unit.ai)
        .sort((a, b) => a.callSign.localeCompare(b.callSign));
    }

    update() {
      this.rebuildRoles();
      const alive = this.activeUnits().length;
      this.summary = `${this.callSign}:${this.order?.objectiveName || "-"} ${alive}/${this.units.length}`;
    }

    assignOrder(order) {
      this.order = order;
      this.rebuildRoles();
    }

    getOrderFor(unit) {
      if (!this.order?.point || !unit?.alive) return null;

      const active = this.activeUnits();
      const role = this.roleMap.get(unit) || "assault";
      unit.squadRole = role;
      const roleUnits = active.filter((item) => (this.roleMap.get(item) || "assault") === role);
      const roleSlotIndex = Math.max(0, roleUnits.indexOf(unit));
      const roleSlotCount = Math.max(1, roleUnits.length);
      const approachAngle = this.approachAngle(this.order.point);

      return {
        ...this.order,
        id: `${this.order.id}:${this.callSign}:${unit.callSign}:${role}`,
        squadId: this.callSign,
        squadRole: role,
        roleSlotIndex,
        roleSlotCount,
        formation: this.formationForRole(role, approachAngle)
      };
    }

    rebuildRoles() {
      const units = this.activeUnits();
      const lmg = units.find((unit) => unit.weaponId === "lmg");
      this.roleMap.clear();

      if (lmg) this.roleMap.set(lmg, "support");

      const remaining = units.filter((unit) => unit !== lmg);
      remaining.forEach((unit, index) => {
        const role = unit.weaponId === "smg" || index === 0 ? "assault" : "security";
        this.roleMap.set(unit, role);
      });
    }

    approachAngle(point) {
      const active = this.activeUnits();
      if (active.length === 0 || !point) return 0;
      const center = active.reduce((sum, unit) => ({
        x: sum.x + unit.x,
        y: sum.y + unit.y
      }), { x: 0, y: 0 });
      center.x /= active.length;
      center.y /= active.length;
      return angleTo(point.x, point.y, center.x, center.y);
    }

    formationForRole(role, approachAngle) {
      if (role === "support") {
        return {
          angle: approachAngle,
          distance: 168,
          spacing: 46,
          stopDistance: 18,
          allowOutside: true
        };
      }

      if (role === "security") {
        return {
          angle: approachAngle,
          distance: 92,
          spacing: 58,
          sideBias: 1,
          stopDistance: 22,
          allowOutside: true
        };
      }

      return {
        angle: approachAngle,
        distance: 42,
        spacing: 34,
        stopDistance: 22,
        allowOutside: false
      };
    }

    distanceTo(point) {
      const active = this.activeUnits();
      if (active.length === 0 || !point) return Infinity;
      const total = active.reduce((sum, unit) => sum + distXY(unit.x, unit.y, point.x, point.y), 0);
      return total / active.length;
    }
  }

  IronLine.SquadAI = SquadAI;
})(window);
