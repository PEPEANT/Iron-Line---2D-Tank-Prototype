"use strict";

function supportDiagnosticsScript() {
  return String.raw`
        const diagnoseSupportSuppressionPoint = (ai, order) => {
          const weapon = ai.weapon?.();
          const profile = ai.supportWeaponProfile?.(weapon);
          if (!profile) return { reason: "no-profile" };
          const mode = order?.tacticalMode || order?.role || "";
          const role = order?.squadRole || ai.unit?.squadRole || ai.squadRole?.() || "";
          const direct = ai.selectTarget?.();
          if (direct) {
            const assaultTask = ai.squadHasFireMoveAssault?.();
            const supportTask = mode === "support-fire" || role === "support" || role === "security" && mode === "hold-wall";
            if (!assaultTask && !supportTask) return { reason: "direct-no-task", mode, role };
            if (ai.hasGrenade?.("grenadeLauncher")) return { reason: "direct-grenade-launcher", mode, role };
            const cadence = supportTask ? 2 : 3;
            if (((Math.floor((ai.game.matchTime || 0) * 3) + (ai.seed % 7)) % cadence) !== 0) {
              return { reason: "direct-cadence", mode, role };
            }
            return { reason: "direct-ready", mode, role, point: direct };
          }

          const report = ai.selectReportedSoftContact?.();
          if (report) {
            if (ai.canUseSupportFireReport?.(report, profile.reportRange)) {
              return { reason: "report-ready", mode, role, point: report };
            }
            return { reason: "report-rejected", mode, role };
          }

          if (mode !== "support-fire") return { reason: "no-direct-report-mode:" + (mode || "none"), mode, role };
          const point = order?.supportPoint || order?.squadStatus?.lastThreat || order?.point;
          if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
            return { reason: "support-mode-no-point", mode, role };
          }
          if (distXY(ai.unit.x, ai.unit.y, point.x, point.y) > profile.reportRange) {
            return { reason: "support-point-too-far", mode, role, point };
          }
          return { reason: "support-point-ready", mode, role, point };
        };

        const diagnoseSupportSuppressionFire = (ai) => {
          if (!ai.unit?.alive) return { reason: "dead" };
          if (ai.unit.inVehicle) return { reason: "in-vehicle" };
          if ((ai.unit.hitReactTimer || 0) > 0) return { reason: "hit-react" };
          if (ai.fireCooldown > 0) return { reason: "fire-cooldown" };
          if ((ai.unit.suppression || 0) > 82) return { reason: "over-suppressed" };

          const weapon = ai.weapon?.();
          const profile = ai.supportWeaponProfile?.(weapon);
          if (!profile) return { reason: "no-profile" };
          const order = ai.resolveOrder?.();
          if (!order?.point) return { reason: "no-order-point" };

          const pointDiagnosis = diagnoseSupportSuppressionPoint(ai, order);
          inc(stats.supportFirePointReasonCounts, pointDiagnosis.reason);
          if (!pointDiagnosis.point) return { reason: pointDiagnosis.reason, weapon: weapon?.id || "" };

          const range = IronLine.combat?.smallArmsRange?.(weapon, ai.unit, weapon.range) || weapon.range;
          const distance = distXY(ai.unit.x, ai.unit.y, pointDiagnosis.point.x, pointDiagnosis.point.y);
          if (distance > range) return { reason: "out-of-range", weapon: weapon?.id || "" };
          if (!ai.isFacingSupportPoint?.(pointDiagnosis.point)) return { reason: "aligning", weapon: weapon?.id || "" };
          return { reason: "ready", weapon: weapon?.id || "" };
        };

        const originalTrySupportSuppressionFire = InfantryAI.prototype.trySupportSuppressionFire;
        if (originalTrySupportSuppressionFire) {
          InfantryAI.prototype.trySupportSuppressionFire = function tracedTrySupportSuppressionFire(dt = 0.033) {
            stats.supportFireCalls += 1;
            const diagnosis = diagnoseSupportSuppressionFire(this);
            const handled = originalTrySupportSuppressionFire.call(this, dt);
            if (handled) {
              stats.supportFireHandled += 1;
              inc(stats.supportFireReasonCounts, "handled");
              inc(stats.supportFireHandledByWeapon, this.weapon?.()?.id || "unknown");
            } else {
              inc(stats.supportFireReasonCounts, diagnosis.reason || "unknown");
            }
            return handled;
          };
        }
`;
}

module.exports = { supportDiagnosticsScript };
