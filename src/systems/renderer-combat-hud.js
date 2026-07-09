"use strict";

(function registerRendererCombatHud(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants || {};
  const { clamp, roundRect } = IronLine.math;
  const proto = IronLine.Renderer?.prototype;
  if (!proto) return;

  const DEG = 180 / Math.PI;
  const FALLBACK_FLAGS = {
    blue: "assets/factions/korea.png",
    red: "assets/factions/russia.png"
  };

  Object.assign(proto, {
    drawCombatCompassHud(game) {
      if (game.testLab) return;
      if (!this.shouldDrawCombatCompassHud(game)) return;
      const ctx = this.ctx;
      const camera = this.camera;
      const cx = Math.round(camera.width / 2);
      const top = 7;
      const heading = this.combatHudHeadingDegrees(game);
      const time = this.combatHudTimeText(game);
      const span = Math.min(620, Math.max(280, camera.width - 96));
      const compassY = top + 63;

      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      this.drawCombatScoreFlags(ctx, game, cx, top, camera);

      ctx.fillStyle = "rgba(5, 9, 8, 0.74)";
      roundRect(ctx, cx - 56, top, 112, 38, 19);
      ctx.fill();
      ctx.fillStyle = "rgba(237, 244, 239, 0.96)";
      ctx.font = "900 21px Inter, system-ui, sans-serif";
      ctx.fillText(time, cx, top + 19);

      this.drawCombatCompassScale(ctx, cx, compassY, span, heading);
      ctx.restore();
    },

    shouldDrawCombatCompassHud(game) {
      if (!game || game.result || game.entryOpen || game.deploymentOpen || game.lobbyOpen || game.roomListOpen) return false;
      if (game.tacticalMapOpen || game.playerDeathActive) return false;
      return Boolean(game.matchStarted || game.matchPhase === "live");
    },

    drawCombatScoreFlags(ctx, game, cx, top, camera) {
      const state = this.combatHudScoreState(game);
      if (!state) return;

      const compact = camera.width < 740;
      const cardW = compact ? 98 : 132;
      const cardH = compact ? 34 : 42;
      const centerGap = compact ? 70 : 84;
      const y = top + (compact ? 2 : 0);
      const leftX = Math.max(8, cx - centerGap - cardW);
      const rightX = Math.min(camera.width - cardW - 8, cx + centerGap);

      this.drawCombatScoreFlagCard(ctx, state.left, leftX, y, cardW, cardH, "left");
      this.drawCombatScoreFlagCard(ctx, state.right, rightX, y, cardW, cardH, "right");
    },

    drawCombatScoreFlagCard(ctx, entry, x, y, w, h, side) {
      if (!entry) return;
      const image = this.combatHudFlagImage(entry.logo);
      const accent = entry.team === TEAM.RED ? "rgba(255, 103, 97, 0.9)" : "rgba(79, 210, 255, 0.9)";

      ctx.save();
      roundRect(ctx, x, y, w, h, 5);
      ctx.fillStyle = "rgba(5, 9, 8, 0.72)";
      ctx.fill();
      ctx.clip();

      if (image?.complete && image.naturalWidth > 0) {
        this.drawCombatFlagCover(ctx, image, x, y, w, h);
      } else {
        const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
        gradient.addColorStop(0, entry.team === TEAM.RED ? "rgba(108, 26, 22, 0.95)" : "rgba(13, 67, 96, 0.95)");
        gradient.addColorStop(1, entry.team === TEAM.RED ? "rgba(36, 13, 12, 0.92)" : "rgba(7, 24, 32, 0.92)");
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, w, h);
      }

      ctx.fillStyle = side === "left"
        ? "rgba(0, 0, 0, 0.16)"
        : "rgba(0, 0, 0, 0.24)";
      ctx.fillRect(x, y, w, h);

      ctx.fillStyle = "rgba(237, 244, 239, 0.96)";
      ctx.strokeStyle = "rgba(0, 0, 0, 0.76)";
      ctx.lineWidth = 3;
      ctx.font = `900 ${w < 110 ? 21 : 25}px Rajdhani, Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const score = String(Math.max(0, Math.floor(entry.score || 0))).padStart(1, "0");
      ctx.strokeText(score, x + w / 2, y + h / 2 + 3);
      ctx.fillText(score, x + w / 2, y + h / 2 + 3);

      ctx.restore();

      ctx.save();
      roundRect(ctx, x, y, w, h, 5);
      ctx.strokeStyle = accent;
      ctx.globalAlpha = entry.local ? 0.58 : 0.38;
      ctx.lineWidth = entry.local ? 1.6 : 1.1;
      ctx.stroke();
      ctx.restore();
    },

    drawCombatFlagCover(ctx, image, x, y, w, h) {
      const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
      const dw = image.naturalWidth * scale;
      const dh = image.naturalHeight * scale;
      ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    },

    combatHudFlagImage(src) {
      if (!src || !global.Image) return null;
      if (!this.combatHudFlagImages) this.combatHudFlagImages = new Map();
      if (this.combatHudFlagImages.has(src)) return this.combatHudFlagImages.get(src);

      const image = new global.Image();
      image.decoding = "async";
      image.src = src;
      this.combatHudFlagImages.set(src, image);
      return image;
    },

    combatHudScoreState(game) {
      if (!TEAM?.BLUE || !TEAM?.RED) return null;
      const viewerTeam = game.adminObserverMode ? TEAM.BLUE : (game.player?.team || TEAM.BLUE);
      const leftTeam = viewerTeam === TEAM.RED ? TEAM.RED : TEAM.BLUE;
      const rightTeam = leftTeam === TEAM.RED ? TEAM.BLUE : TEAM.RED;
      const scores = this.combatHudTeamScores(game);
      return {
        left: this.combatHudScoreEntry(game, leftTeam, scores[leftTeam], leftTeam === viewerTeam),
        right: this.combatHudScoreEntry(game, rightTeam, scores[rightTeam], rightTeam === viewerTeam)
      };
    },

    combatHudTeamScores(game) {
      const mode = game.matchConfig?.mode;
      const primary = mode === "annihilation" ? game.annihilation?.score : game.conquest?.score;
      const fallback = mode === "annihilation" ? game.conquest?.score : game.annihilation?.score;
      return {
        [TEAM.BLUE]: Number(primary?.[TEAM.BLUE] ?? fallback?.[TEAM.BLUE] ?? 0) || 0,
        [TEAM.RED]: Number(primary?.[TEAM.RED] ?? fallback?.[TEAM.RED] ?? 0) || 0
      };
    },

    combatHudScoreEntry(game, team, score, local) {
      const fallbackId = team === TEAM.RED ? "russia" : "korea";
      const factionId = IronLine.factionVisuals?.factionIdForTeam?.(game, team) || fallbackId;
      const faction = IronLine.playerFactionById?.(factionId) || IronLine.playerSkinById?.(factionId);
      return {
        team,
        score,
        local,
        factionId,
        logo: faction?.logo || FALLBACK_FLAGS[team] || FALLBACK_FLAGS.blue
      };
    },

    drawCombatCompassScale(ctx, cx, y, span, heading) {
      const left = cx - span / 2;
      const right = cx + span / 2;
      const pixelsPerDegree = span / 126;
      const start = Math.floor((heading - 63) / 5) * 5;

      ctx.save();
      ctx.strokeStyle = "rgba(237, 244, 239, 0.7)";
      ctx.fillStyle = "rgba(237, 244, 239, 0.72)";
      ctx.lineWidth = 1.4;
      ctx.font = "800 14px Rajdhani, Inter, system-ui, sans-serif";

      for (let deg = start; deg <= heading + 63; deg += 5) {
        const normalized = this.normalizeCompassDegrees(deg);
        const delta = this.compassDeltaDegrees(normalized, heading);
        const x = cx + delta * pixelsPerDegree;
        if (x < left || x > right) continue;

        const major = normalized % 45 === 0;
        const medium = normalized % 15 === 0;
        const height = major ? 22 : medium ? 15 : 8;
        const alpha = clamp(1 - Math.abs(delta) / 76, 0.28, 0.86);
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(x, y - height / 2);
        ctx.lineTo(x, y + height / 2);
        ctx.stroke();

        if (major) {
          const label = String(normalized).padStart(3, "0");
          ctx.fillText(label, x, y + 25);
        }
      }

      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(237, 244, 239, 0.9)";
      ctx.beginPath();
      ctx.moveTo(cx, y + 36);
      ctx.lineTo(cx - 8, y + 47);
      ctx.lineTo(cx + 8, y + 47);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },

    combatHudHeadingDegrees(game) {
      const actor = game.player?.controlledDrone || game.player?.inTank || game.player;
      const angle = Number.isFinite(actor?.angle) ? actor.angle : 0;
      return this.normalizeCompassDegrees(Math.round(angle * DEG + 90));
    },

    combatHudTimeText(game) {
      const conquest = game.matchConfig?.mode === "conquest";
      const seconds = conquest
        ? game.conquest?.remaining ?? game.conquest?.duration ?? 0
        : game.matchStarted ? game.matchTime || 0 : 0;
      const safe = Math.max(0, Math.floor(seconds));
      const minutes = Math.floor(safe / 60).toString().padStart(2, "0");
      const rest = (safe % 60).toString().padStart(2, "0");
      return `${minutes}:${rest}`;
    },

    normalizeCompassDegrees(value) {
      return ((Math.round(value) % 360) + 360) % 360;
    },

    compassDeltaDegrees(value, center) {
      let delta = this.normalizeCompassDegrees(value) - this.normalizeCompassDegrees(center);
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      return delta;
    }
  });
})(window);
