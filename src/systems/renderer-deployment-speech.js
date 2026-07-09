"use strict";

(function registerRendererDeploymentSpeech(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants || {};
  const { clamp, distXY, roundRect } = IronLine.math || {};
  const proto = IronLine.Renderer?.prototype;
  if (!proto) return;

  const speechBeats = [
    [0.2, 2.0, "\uBE7C\uC557\uAE34 \uB545\uC744 \uB2E4\uC2DC \uC218\uBCF5\uD558\uC790.", 0],
    [2.0, 3.7, "\uC804\uC0AC\uD55C \uC804\uC6B0\uB4E4\uC744 \uAE30\uB9AC\uBA70", 0],
    [3.7, 5.4, "\uC6B0\uB9AC \uB545\uACFC \uBD80\uBAA8\uD615\uC81C\uB97C \uC9C0\uD0A4\uC790.", 0],
    [5.4, 7.1, "\uBCD1\uC0AC\uB4E4\uC774\uC5EC, \uC900\uBE44\uD558\uB77C.", 0],
    [7.25, 8.25, "\uAC00\uC790!", 1],
    [7.9, 8.9, "\uD574\uBCF4\uC790!", 2],
    [9.05, 10.05, "\uB3CC\uACA9\uC55E\uC73C\uB85C!", 0]
  ];

  Object.assign(proto, {
    drawStartCountdown(game) {
      if (game.matchStarted || game.result || game.deploymentOpen || !game.countdownStarted) return;
      if (game.matchPhase === "loading") return this.drawMatchLoading(game);

      const ctx = this.ctx;
      const camera = this.camera;
      const countdownSeconds = game.matchCountdownSeconds?.() || 5;
      const countdown = Math.max(0, Number(game.startCountdown) || 0);
      const preparationRemaining = Math.max(0, countdown - countdownSeconds);
      if (preparationRemaining > 0.05) {
        this.drawDeploymentSpeechBubbles(game, preparationRemaining);
        return;
      }

      const remaining = Math.max(1, Math.ceil(countdown));
      const ready = countdown <= 0.8;
      ctx.save();
      ctx.fillStyle = "rgba(5, 9, 8, 0.18)";
      ctx.fillRect(0, 0, camera.width, camera.height);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = ready ? "#72e89a" : "#ffd166";
      ctx.font = "900 92px Inter, sans-serif";
      ctx.fillText(ready ? "출격" : `${remaining}`, camera.width / 2, camera.height * 0.34);
      ctx.fillStyle = "rgba(237, 244, 239, 0.92)";
      ctx.font = "900 18px Inter, sans-serif";
      ctx.fillText("기지에서 보급을 챙기고 출격하세요", camera.width / 2, camera.height * 0.34 + 78);
      ctx.fillStyle = "rgba(237, 244, 239, 0.64)";
      ctx.font = "800 12px Inter, sans-serif";
      ctx.fillText("E 보급상자 / 1~6 장비 선택 / F 탑승 / 우클릭 조준", camera.width / 2, camera.height * 0.34 + 108);
      ctx.restore();
    },

    drawDeploymentSpeechBubbles(game, preparationRemaining) {
      const prepTotal = Math.max(1, game.matchPreparationSeconds?.() || 10);
      const t = (clamp ? clamp((prepTotal - preparationRemaining) / prepTotal, 0, 1) : 0) * 10;
      const speakers = this.deploymentSpeechSpeakers(game);
      for (const [start, end, text, speakerIndex] of speechBeats) {
        if (t < start || t > end) continue;
        const fade = Math.min(1, Math.max(0, (t - start) / 0.28), Math.max(0, (end - t) / 0.28));
        this.drawDeploymentSpeechBubble(text, speakers[speakerIndex % speakers.length], fade);
      }
    },

    deploymentSpeechSpeakers(game) {
      const player = game.player && !game.player.inTank && game.player.hp > 0 ? [game.player] : [];
      const origin = game.player || game.world?.spawns?.player || { x: 0, y: 0 };
      const allies = (game.infantry || [])
        .filter((unit) => unit.team === (TEAM?.BLUE || "blue") && unit.hp > 0 && !unit.inTank)
        .sort((a, b) => (distXY?.(origin, a) || 0) - (distXY?.(origin, b) || 0))
        .slice(0, 6);
      const leader = allies.find((unit) => unit.isSquadLeader) || allies[0] || player[0] || origin;
      const soldiers = [...player, ...allies].filter((unit) => unit && unit !== leader);
      return [leader, ...soldiers.slice(0, 3), leader];
    },

    drawDeploymentSpeechBubble(text, unit, alpha = 1) {
      if (!unit) return;
      const ctx = this.ctx;
      const camera = this.camera;
      const zoom = camera.zoom || 1;
      const x = (unit.x - camera.x) * zoom;
      const y = (unit.y - camera.y) * zoom - (unit.isProne ? 36 : 54) * zoom;
      if (x < -80 || y < -40 || x > camera.width + 80 || y > camera.height + 60) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = text.length <= 6 ? "900 15px Inter, sans-serif" : "900 12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const width = Math.min(240, Math.max(64, ctx.measureText(text).width + 24));
      const height = text.length <= 6 ? 28 : 26;
      const left = Math.max(8, Math.min(camera.width - width - 8, x - width / 2));
      const top = Math.max(10, Math.min(camera.height - height - 26, y - height / 2));
      ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
      roundRect(ctx, left, top, width, height, 6);
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
      ctx.lineWidth = 1.4;
      roundRect(ctx, left, top, width, height, 6);
      ctx.stroke();
      const tailX = Math.max(left + 16, Math.min(left + width - 16, x));
      ctx.beginPath();
      ctx.moveTo(tailX - 6, top + height - 1);
      ctx.lineTo(tailX + 6, top + height - 1);
      ctx.lineTo(tailX, top + height + 9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(0, 0, 0, 0.92)";
      ctx.fillText(text, left + width / 2, top + height / 2 + 0.5);
      ctx.restore();
    }
  });
})(window);
