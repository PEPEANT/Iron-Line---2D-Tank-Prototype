"use strict";

function hookDiagnosticsScript() {
  return String.raw`
        const reportedRejectReason = (ai, report, weapon, options = {}) => {
          if (!report || !report.target) return "reported-missing";
          if (report.sourceType === "objective") return "reported-objective";
          if (!ai.isAliveEnemy?.(report.target)) return "reported-dead";

          const age = Math.max(0, (ai.game.matchTime || 0) - Number(report.lastSeenAt || 0));
          const confidence = Number(report.confidence || 0);
          const source = report.sourceType || "";
          const confirmed = report.certainty === "confirmed" || source === "scout" || source === "recon_drone";
          const launcher = weapon?.id === "grenadeLauncher";
          const aimGrace = options.aimGrace ? config.grenadeReportAimGrace ?? 0.55 : 0;
          const combatMaxAge = (launcher ? 1.05 : 0.82) + aimGrace;
          const reportMaxAge = (launcher ? 1.9 : 1.35) + aimGrace;
          const minConfidence = launcher ? 0.74 : 0.82;
          const combatFresh = source === "combat" && age <= combatMaxAge && confidence >= 0.64;
          if (combatFresh) return "";
          if (age > reportMaxAge) return "reported-too-old";
          if (confidence < minConfidence) return "reported-low-confidence";
          if (!(confirmed || (launcher && source === "attack_drone"))) return "reported-unconfirmed";
          return "";
        };

        const diagnoseNoSupportSource = (ai, target) => {
          const units = ai.sameSquadFireMoveUnits?.() || [];
          if (!units.length) return "no-squad-units";
          let supportWeapons = 0;
          let rangeRejected = 0;
          let suppressed = 0;
          let hitReact = 0;
          let stateNotReady = 0;
          for (const unit of units) {
            if (unit === ai.unit || !unit.alive || unit.inVehicle || unit.team !== ai.unit.team) continue;
            const weapon = unit.ai?.weapon?.() || IronLine.constants?.INFANTRY_WEAPONS?.[unit.weaponId];
            if (!weapon || !["lmg", "machinegun"].includes(weapon.id)) continue;
            supportWeapons += 1;
            if ((unit.hitReactTimer || 0) > 0) {
              hitReact += 1;
              continue;
            }
            if ((unit.suppression || 0) > 86) {
              suppressed += 1;
              continue;
            }
            const range = combat.smallArmsRange?.(weapon, unit, weapon.range) || weapon.range || 820;
            const distance = distXY(unit.x, unit.y, target?.x, target?.y);
            if (distance > range + 170) {
              rangeRejected += 1;
              continue;
            }
            const state = unit.ai?.state || "";
            const stateReady = ["support-fire", "support-align", "support-suppress-report", "prone-fire", "fire"].includes(state) || state.startsWith("support-");
            if (!stateReady) {
              stateNotReady += 1;
              continue;
            }
            return "score-threshold";
          }
          if (!supportWeapons) return "no-support-weapon";
          if (suppressed >= supportWeapons) return "support-suppressed";
          if (hitReact >= supportWeapons) return "support-hit-react";
          if (rangeRejected >= supportWeapons) return "support-out-of-range";
          if (stateNotReady >= supportWeapons) return "support-state-not-ready";
          if (suppressed) return "some-support-suppressed";
          if (rangeRejected) return "some-support-out-of-range";
          if (stateNotReady) return "some-support-state-not-ready";
          return "mixed-support-rejected";
        };
`;
}

module.exports = { hookDiagnosticsScript };
