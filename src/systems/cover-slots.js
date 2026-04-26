"use strict";

(function registerCoverSlots(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  class CoverSlotManager {
    constructor() {
      this.reservations = new Map();
    }

    update(dt) {
      for (const [key, reservation] of this.reservations) {
        reservation.timer -= dt;
        if (reservation.timer <= 0 || !reservation.unit?.alive) {
          this.reservations.delete(key);
        }
      }
    }

    keyFor(point) {
      return `${Math.round(point.x)}:${Math.round(point.y)}`;
    }

    isAvailable(unit, point) {
      const key = this.keyFor(point);
      const current = this.reservations.get(key);
      return !current || current.unit === unit || !current.unit?.alive || current.timer <= 0;
    }

    reserve(unit, point, duration = 1.2) {
      if (!unit || !point || !this.isAvailable(unit, point)) return null;

      const key = this.keyFor(point);
      this.reservations.set(key, {
        unit,
        x: point.x,
        y: point.y,
        timer: duration
      });
      return { ...point, coverSlotKey: key };
    }

    renew(unit, point, duration = 1.2) {
      if (!point?.coverSlotKey) return false;
      const current = this.reservations.get(point.coverSlotKey);
      if (!current || current.unit !== unit) return false;
      current.timer = Math.max(current.timer, duration);
      return true;
    }
  }

  IronLine.CoverSlotManager = CoverSlotManager;
})(window);
