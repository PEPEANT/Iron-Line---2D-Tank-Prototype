"use strict";

// 폭발 그을림 보편화 — visual-overhaul-plan.md P3 (2026-07-06)
// 명시적 scorch를 만들지 않는 폭발원(전차 사망, 드론 시스템, 기타)에
// 자동으로 지면 그을림을 남긴다. explosion-debris.js와 같은 감시 패턴.
// 이미 자체 scorch를 만드는 경로는 explosion.scorched 플래그로 중복 방지.
(function registerExplosionScorch(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const MIN_RADIUS = 20;

  function seedScorch(game, explosion) {
    if (!game?.effects?.scorchMarks || !explosion) return;
    if (explosion.smoke || explosion.scorched || explosion.__scorchSeeded) return;
    const radius = explosion.maxRadius || explosion.radius || 0;
    if (radius < MIN_RADIUS) return;
    explosion.__scorchSeeded = true;
    game.effects.scorchMarks.push({
      x: explosion.x,
      y: explosion.y,
      radius: radius * 0.6 + Math.random() * 12,
      alpha: 0.2 + Math.random() * 0.08
    });
  }

  if (IronLine.combat?.updateEffects) {
    const baseUpdateEffects = IronLine.combat.updateEffects;
    IronLine.combat.updateEffects = function updateEffectsWithExplosionScorch(game, dt) {
      for (const explosion of game?.effects?.explosions || []) seedScorch(game, explosion);
      return baseUpdateEffects.call(this, game, dt);
    };
  }
})(window);
