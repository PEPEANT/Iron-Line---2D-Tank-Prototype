"use strict";

(function registerInfantryBlastResponse(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const InfantryAI = IronLine.InfantryAI;
  if (!InfantryAI) return;

  const { clamp, distXY } = IronLine.math;

  const RESPONSE_SECONDS = 0.42;
  const THREAT_TTL_SECONDS = 0.9;
  const POST_BLAST_PRONE_ESCAPE_SECONDS = 3.2;
  const POST_BLAST_PRONE_ESCAPE_HOLD = 0.85;

  function nowFor(game) {
    if (Number.isFinite(game?.matchTime)) return game.matchTime;
    return typeof performance !== "undefined" ? performance.now() / 1000 : 0;
  }

  function wrapDamageRadius() {
    const combat = IronLine.combat;
    if (!combat?.damageRadius || combat.damageRadius.__blastResponseWrapped) return;

    const originalDamageRadius = combat.damageRadius;
    function damageRadiusWithBlastResponse(game, x, y, radius, damage, team, ammo = {}) {
      const candidates = [];
      for (const unit of game?.infantry || []) {
        if (!unit?.alive || unit.inVehicle || unit.team === team) continue;
        const distance = distXY(unit.x, unit.y, x, y);
        if (distance > radius + (unit.radius || 0)) continue;
        candidates.push({ unit, distance });
      }

      const result = originalDamageRadius.call(this, game, x, y, radius, damage, team, ammo);
      const at = nowFor(game);
      for (const item of candidates) {
        if (!item.unit.alive || item.unit.inVehicle) continue;
        item.unit.ai?.noteBlastThreat?.({
          x,
          y,
          radius,
          team,
          ammoId: ammo?.id || "blast",
          at,
          distance: item.distance,
          damage: Number(damage) || 0
        });
      }
      return result;
    }

    damageRadiusWithBlastResponse.__blastResponseWrapped = true;
    damageRadiusWithBlastResponse.__originalDamageRadius = originalDamageRadius;
    combat.damageRadius = damageRadiusWithBlastResponse;
  }

  Object.assign(InfantryAI.prototype, {
    shouldDeferSuppressedPostureForBlast() {
      const threat = this.lastBlastThreat;
      if (!threat) return false;
      const at = nowFor(this.game);
      if (at <= (this.blastProneEscapeSuppressUntil || 0)) return true;
      if (at > (threat.expiresAt || 0)) return this.shouldPostBlastProneEscape?.(threat, at);
      return (threat.pressure || 0) >= 0.62 || Boolean(threat.repeated);
    },

    shouldPostBlastProneEscape(threat, at = nowFor(this.game)) {
      if (!threat || threat.proneEscapeUsed) return false;
      const threatAt = Number(threat.at) || 0;
      if (!threatAt || at - threatAt > POST_BLAST_PRONE_ESCAPE_SECONDS) return false;
      if (!this.unit?.alive || !this.unit.isProne || this.state !== "prone-fire") return false;
      if ((Number(this.unit.suppression) || 0) < 50) return false;
      const weapon = this.weapon?.();
      const role = this.squadRole?.() || this.unit.squadRole || "";
      if (weapon?.id !== "rifle" || role === "support" || this.isSupportWeapon?.(weapon)) return false;
      return true;
    },

    noteBlastThreat(threat) {
      if (!threat || !Number.isFinite(threat.x) || !Number.isFinite(threat.y)) return;
      const radius = Math.max(1, Number(threat.radius) || 1);
      const distance = Math.max(0, Number(threat.distance) || distXY(this.unit.x, this.unit.y, threat.x, threat.y));
      const pressure = clamp(1 - distance / (radius + (this.unit.radius || 0)), 0, 1);
      const current = this.lastBlastThreat;
      const repeated = current && (threat.at || 0) - (current.at || 0) <= 4.5;
      this.lastBlastThreat = {
        ...threat,
        radius,
        distance,
        pressure,
        repeated,
        expiresAt: (Number(threat.at) || nowFor(this.game)) + THREAT_TTL_SECONDS
      };
      this.blastResponseTarget = null;
      this.blastResponseUntil = 0;
      this.blastProneEscapeSuppressUntil = 0;
    },

    handleBlastResponse(dt, order, contact, tankThreat, beforeX, beforeY) {
      const threat = this.lastBlastThreat;
      const at = nowFor(this.game);
      const threatAge = at - (Number(threat?.at) || 0);
      const activeThreat = threat && at <= (threat.expiresAt || 0);
      const lateProneEscape = this.shouldPostBlastProneEscape?.(threat, at);
      const continuingProneEscape = threat && at <= (this.blastProneEscapeSuppressUntil || 0);
      if (!threat || (!activeThreat && !lateProneEscape && !continuingProneEscape && threatAge > POST_BLAST_PRONE_ESCAPE_SECONDS)) {
        this.lastBlastThreat = null;
        this.blastResponseTarget = null;
        this.blastResponseUntil = 0;
        this.blastProneEscapeSuppressUntil = 0;
        return false;
      }
      if (!activeThreat && !lateProneEscape && !continuingProneEscape) return false;
      if (!order?.point || !this.unit?.alive || this.unit.inVehicle || (this.unit.hitReactTimer || 0) > 0.18) return false;

      if (!this.blastResponseTarget || at > (this.blastResponseUntil || 0)) {
        const selected = this.selectBlastResponseTarget(threat, order, contact, tankThreat);
        if (!selected?.target && lateProneEscape) threat.proneEscapeUsed = true;
        if (!selected?.target) return false;
        this.blastResponseKind = selected.kind;
        this.blastResponseTarget = selected.target;
        this.blastResponseUntil = at + (lateProneEscape ? POST_BLAST_PRONE_ESCAPE_HOLD : RESPONSE_SECONDS);
        if (lateProneEscape) {
          threat.proneEscapeUsed = true;
          this.blastProneEscapeSuppressUntil = at + POST_BLAST_PRONE_ESCAPE_HOLD;
          this.unit.proneHoldTimer = 0;
        }
      }

      const moveTarget = this.blastResponseTarget;
      if (!moveTarget) return false;

      this.clearProne(0.55, true);
      this.state = this.blastResponseKind === "cover" ? "cover" : "spread";
      this.target = contact || tankThreat || threat;
      this.faceContact(threat, dt);
      this.moveTo(dt, moveTarget);
      this.recordMovement(dt, beforeX, beforeY, moveTarget);
      this.updateDebug(moveTarget);

      if (distXY(this.unit.x, this.unit.y, moveTarget.x, moveTarget.y) <= (moveTarget.stopDistance || 14) + 10) {
        this.blastResponseUntil = Math.min(this.blastResponseUntil || at, at + 0.18);
      }
      return true;
    },

    selectBlastResponseTarget(threat, order, contact, tankThreat) {
      const role = order?.squadRole || this.unit.squadRole || this.squadRole?.() || "assault";
      const support = role === "support" || this.isSupportWeapon?.();
      const close = (threat.pressure || 0) >= 0.62 || (threat.distance || 0) <= (threat.radius || 0) * 0.42;
      const repeated = Boolean(threat.repeated);
      const suppression = Number(this.unit.suppression) || 0;

      if (support && !close && !repeated && suppression < 70) return null;

      const preferCover = close || repeated || support;
      if (preferCover) {
        const coverTarget = this.resolveCoverTarget(threat);
        if (coverTarget) return { kind: "cover", target: { ...coverTarget, blastResponse: true } };
      }

      const spreadTarget = this.tacticalSpreadTarget?.(threat);
      if (spreadTarget) return { kind: "spread", target: { ...spreadTarget, blastResponse: true } };

      if (!preferCover) {
        const coverTarget = this.resolveCoverTarget(threat);
        if (coverTarget) return { kind: "cover", target: { ...coverTarget, blastResponse: true } };
      }

      const fallback = this.blastFallbackTarget(threat, contact || tankThreat);
      return fallback ? { kind: "spread", target: fallback } : null;
    },

    blastFallbackTarget(threat, focus) {
      const awayAngle = Math.atan2(this.unit.y - threat.y, this.unit.x - threat.x);
      const focusAngle = focus ? Math.atan2(focus.y - this.unit.y, focus.x - this.unit.x) : awayAngle;
      for (const distance of [96, 132, 168]) {
        for (const offset of [0, 0.52, -0.52, Math.PI / 2, -Math.PI / 2]) {
          const angle = awayAngle + offset;
          if (Math.abs(angle - focusAngle) < 0.24 && distance < 130) continue;
          const candidate = this.clampMoveTarget({
            x: this.unit.x + Math.cos(angle) * distance,
            y: this.unit.y + Math.sin(angle) * distance,
            stopDistance: 14,
            final: false,
            blastResponse: true,
            tacticalSpread: true
          });
          if (this.pointPassable(candidate.x, candidate.y, this.unit.radius + 3) && this.canMoveDirect(candidate.x, candidate.y, 18)) {
            return candidate;
          }
        }
      }
      return null;
    }
  });

  const originalTrySuppressedPostureHold = InfantryAI.prototype.trySuppressedPostureHold;
  if (typeof originalTrySuppressedPostureHold === "function" && !originalTrySuppressedPostureHold.__blastResponseAware) {
    InfantryAI.prototype.trySuppressedPostureHold = function trySuppressedPostureHoldWithBlastResponse(dt) {
      if (this.shouldDeferSuppressedPostureForBlast?.()) return false;
      return originalTrySuppressedPostureHold.call(this, dt);
    };
    InfantryAI.prototype.trySuppressedPostureHold.__blastResponseAware = true;
  }

  wrapDamageRadius();
})(window);
