"use strict";

// 플레이어 조준 레티클 통일 — visual-overhaul-plan.md P2 (2026-07-06)
// 규격: 모든 무기 = 동일 골격(원 + 4갭 크로스 + 중앙 도트), 무기별 차이는 크기·확산만.
// 상태색: 사거리 내 = 앰버 / 사거리 밖 = 저알파 앰버 / 쿨다운·탄약 없음 = 레드.
// 소총·기관단총·저격에는 기존에 조준 표시가 아예 없었음 → 신설.
(function registerPlayerReticle(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const Renderer = IronLine.Renderer;
  if (!Renderer?.prototype) return;

  const COLOR_READY = "rgba(255, 209, 102, 0.85)";
  const COLOR_FAR = "rgba(255, 209, 102, 0.32)";
  const COLOR_BLOCKED = "rgba(255, 107, 94, 0.7)";

  const RETICLE_SIZE = {
    sniper: 6,
    pistol: 7,
    rifle: 8,
    smg: 9.5,
    lmg: 11,
    machinegun: 11,
    rpg: 13
  };

  function drawReticle(ctx, x, y, radius, color, lineWidth) {
    const gap = radius * 0.75;
    const arm = radius * 0.72;
    const corner = radius * 0.34;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - gap - arm, y);
    ctx.lineTo(x - gap, y);
    ctx.moveTo(x + gap, y);
    ctx.lineTo(x + gap + arm, y);
    ctx.moveTo(x, y - gap - arm);
    ctx.lineTo(x, y - gap);
    ctx.moveTo(x, y + gap);
    ctx.lineTo(x, y + gap + arm);
    ctx.moveTo(x - gap, y - gap - corner);
    ctx.lineTo(x - gap, y - gap);
    ctx.lineTo(x - gap - corner, y - gap);
    ctx.moveTo(x + gap, y - gap - corner);
    ctx.lineTo(x + gap, y - gap);
    ctx.lineTo(x + gap + corner, y - gap);
    ctx.moveTo(x - gap, y + gap + corner);
    ctx.lineTo(x - gap, y + gap);
    ctx.lineTo(x - gap - corner, y + gap);
    ctx.moveTo(x + gap, y + gap + corner);
    ctx.lineTo(x + gap, y + gap);
    ctx.lineTo(x + gap + corner, y + gap);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.1, radius * 0.16), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGunReticle(ctx, game, player, weapon) {
    const aimX = game.input.mouse.worldX;
    const aimY = game.input.mouse.worldY;
    const range = (weapon.range || 250) * 1.12;
    const inRange = Math.hypot(aimX - player.x, aimY - player.y) <= range;
    const ammo = weapon.ammoKey ? player.equipmentAmmo?.[weapon.ammoKey] || 0 : 1;
    const ready = player.rifleCooldown <= 0 && ammo > 0;
    const color = !ready ? COLOR_BLOCKED : inRange ? COLOR_READY : COLOR_FAR;
    const base = RETICLE_SIZE[weapon.id] || 8;
    const spread = 1 + (player.gunKick || 0) * 0.6;
    const pulse = 1 + Math.sin(performance.now() * 0.012) * 0.04;

    ctx.save();
    drawReticle(ctx, aimX, aimY, base * spread * pulse, color, inRange && ready ? 1.5 : 1.15);
    ctx.restore();
  }

  function drawRpgReticle(ctx, game, player, weapon) {
    const aim = game.resolvePlayerRpgAim?.(game.input.mouse.worldX, game.input.mouse.worldY, weapon);
    if (!aim) return;
    const aimReady = (player.rpgAimTime || 0) >= (player.isProne ? 0.42 : 0.34) && !aim.tooClose;
    const color = aim.tooClose ? COLOR_BLOCKED : aimReady ? COLOR_READY : COLOR_FAR;
    const pulse = 1 + Math.sin(performance.now() * 0.012) * 0.05;

    ctx.save();
    ctx.lineCap = "round";

    // RPG도 긴 조준선 없이 작은 조준점만 표시한다.

    // 최소사거리 위반은 조준점 색으로만 표현해서 화면 노이즈를 줄인다.
    drawReticle(ctx, aim.x, aim.y, RETICLE_SIZE.rpg * pulse, color, 1.8);
    ctx.restore();
  }

  Renderer.prototype.drawPlayerInfantryAim = function drawUnifiedInfantryAim(game) {
    const player = game.player;
    if (!player || player.controlledDrone) return;
    if (player.inTank || player.hp <= 0 || game.playerDowned || game.playerDeathActive) return;
    if (game.deploymentOpen || game.lobbyOpen || game.result) return;

    const weapon = player.getWeapon?.();
    if (!weapon) return;

    if (weapon.id === "rpg" && game.isPlayerRpgAimMode?.()) {
      drawRpgReticle(this.ctx, game, player, weapon);
      return;
    }

    if (weapon.type === "gun") {
      drawGunReticle(this.ctx, game, player, weapon);
    }
  };
})(window);
