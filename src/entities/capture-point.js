"use strict";

(function registerCapturePoint(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants;
  const { clamp, distXY, lerp } = IronLine.math;

  class CapturePoint {
    constructor(name, x, y) {
      this.name = name;
      this.x = x;
      this.y = y;
      this.radius = 135;
      this.progress = 0;
      this.owner = TEAM.NEUTRAL;
      this.contested = false;
    }

    update(game, dt) {
      let bluePower = 0;
      let redPower = 0;

      for (const tank of game.tanks) {
        if (!tank.alive || distXY(tank.x, tank.y, this.x, this.y) > this.radius) continue;
        if (tank.team === TEAM.BLUE) bluePower += tank.isPlayerTank ? 1.2 : 1;
        if (tank.team === TEAM.RED) redPower += 1;
      }

      for (const humvee of game.humvees || []) {
        if (!humvee.alive || distXY(humvee.x, humvee.y, this.x, this.y) > this.radius) continue;
        if (humvee.team === TEAM.BLUE) bluePower += 0.45;
        if (humvee.team === TEAM.RED) redPower += 0.45;
      }

      for (const unit of game.infantry || []) {
        if (!unit.alive || distXY(unit.x, unit.y, this.x, this.y) > this.radius) continue;
        const morale = unit.morale ?? 1;
        const suppressionFactor = unit.suppressed ? 0.35 : 1;
        const infantryPower = 0.28 * morale * suppressionFactor;
        if (unit.team === TEAM.BLUE) bluePower += infantryPower;
        if (unit.team === TEAM.RED) redPower += infantryPower;
      }

      if (!game.player.inTank && game.player.hp > 0 && distXY(game.player.x, game.player.y, this.x, this.y) <= this.radius) {
        bluePower += 0.45;
      }

      this.contested = bluePower > 0 && redPower > 0;

      if (!this.contested && bluePower > 0) {
        this.progress += game.world.captureRate * dt * clamp(bluePower, 0, 2.2);
      } else if (!this.contested && redPower > 0) {
        this.progress -= game.world.captureRate * dt * clamp(redPower, 0, 2.2);
      } else if (!this.contested && bluePower === 0 && redPower === 0) {
        const ownerTarget = this.owner === TEAM.BLUE ? 1 : this.owner === TEAM.RED ? -1 : 0;
        this.progress = lerp(this.progress, ownerTarget, 0.18 * dt);
      }

      this.progress = clamp(this.progress, -1, 1);

      if (this.progress > 0.86) this.owner = TEAM.BLUE;
      else if (this.progress < -0.86) this.owner = TEAM.RED;
      else if (Math.abs(this.progress) < 0.18) this.owner = TEAM.NEUTRAL;
    }
  }

  IronLine.CapturePoint = CapturePoint;
})(window);
