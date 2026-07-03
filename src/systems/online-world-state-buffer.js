"use strict";

(function registerOnlineWorldStateBuffer(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { clamp, lerp, normalizeAngle } = IronLine.math;

  IronLine.installOnlineWorldStateBuffer = function installOnlineWorldStateBuffer(Game) {
    Object.assign(Game.prototype, {
      pushOnlineWorldStateSample(state, updatedAt) {
        const buffer = this.onlineWorldStateBuffer || (this.onlineWorldStateBuffer = []);
        const previous = buffer[buffer.length - 1];
        if (previous) {
          const gap = Math.max(60, Math.min(1500, updatedAt - previous.updatedAt));
          this.onlineWorldStateGapMs = this.onlineWorldStateGapMs
            ? this.onlineWorldStateGapMs * 0.7 + gap * 0.3
            : gap;
        }
        buffer.push({ state, updatedAt, receivedAt: Date.now() });
        while (buffer.length > 8) buffer.shift();
      },

      bufferedOnlineWorldState() {
        const buffer = this.onlineWorldStateBuffer || [];
        if (buffer.length < 2) return null;
        const newest = buffer[buffer.length - 1];
        const delay = Math.max(320, Math.min(760, (this.onlineWorldStateGapMs || 320) * 1.25));
        const estimatedHostNow = newest.updatedAt + Math.max(0, Date.now() - newest.receivedAt);
        const renderAt = estimatedHostNow - delay;
        let older = null;
        let newer = null;
        for (let i = buffer.length - 1; i >= 0; i -= 1) {
          if (buffer[i].updatedAt <= renderAt) {
            older = buffer[i];
            newer = buffer[i + 1] || null;
            break;
          }
        }
        if (!older || !newer) return null;
        const span = Math.max(1, newer.updatedAt - older.updatedAt);
        const t = clamp((renderAt - older.updatedAt) / span, 0, 1);
        return this.interpolateOnlineWorldStates(older.state, newer.state, t);
      },

      interpolateOnlineWorldStates(a, b, t) {
        const mix = (from, to) => lerp(Number(from) || 0, Number(to) || 0, t);
        const mixAngle = (from, to) => {
          const start = Number(from) || 0;
          return normalizeAngle(start + normalizeAngle((Number(to) || 0) - start) * t);
        };
        const previousVehicles = new Map((a.vehicles || []).map((item) => [item.id, item]));
        const vehicles = (b.vehicles || []).map((snap) => {
          const previous = previousVehicles.get(snap.id);
          if (!previous || snap.alive === false || previous.alive === false) return snap;
          return {
            ...snap,
            x: mix(previous.x, snap.x),
            y: mix(previous.y, snap.y),
            angle: mixAngle(previous.angle, snap.angle),
            turretAngle: mixAngle(previous.turretAngle, snap.turretAngle),
            machineGunAngle: mixAngle(previous.machineGunAngle, snap.machineGunAngle)
          };
        });
        const previousUnits = new Map((a.units || []).map((item) => [item.id, item]));
        const units = (b.units || []).map((snap) => {
          const previous = previousUnits.get(snap.id);
          if (!previous || snap.alive === false || previous.alive === false) return snap;
          return {
            ...snap,
            x: mix(previous.x, snap.x),
            y: mix(previous.y, snap.y),
            angle: mixAngle(previous.angle, snap.angle)
          };
        });
        return { ...b, vehicles, units };
      }
    });
  };
})(window);
