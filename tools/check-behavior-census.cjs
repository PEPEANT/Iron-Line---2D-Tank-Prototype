"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const { WebSocket } = require("ws");
const { summaryMarkdown } = require("./behavior-census-report.cjs");
const { hookDiagnosticsScript } = require("./behavior-census-hook-diagnostics.cjs");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_CENSUS_PORT || 4210);
const cdpPort = Number(process.env.IRONLINE_CENSUS_CDP_PORT || 9250);
const durationMs = Number(process.env.IRONLINE_CENSUS_DURATION_MS || 180000);
const intervalMs = Number(process.env.IRONLINE_CENSUS_INTERVAL_MS || 500);
const appUrl = `http://127.0.0.1:${appPort}/index.html`;
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const userDataDir = path.join(root, ".tmp-chrome-behavior-census");

function requestJson(port, pathname, timeout = 1200) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: "127.0.0.1", port, path: pathname, timeout }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        try {
          resolve(JSON.parse(raw));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
    request.on("timeout", () => request.destroy(new Error(`${pathname} timed out`)));
  });
}

async function waitForApp() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 9000) {
    try {
      const build = await requestJson(appPort, "/api/build", 1200);
      if (build?.ok) return build;
    } catch (_error) {
      await new Promise((resolve) => setTimeout(resolve, 220));
    }
  }
  throw new Error("Static server did not expose /api/build in time.");
}

async function waitForCdpPage() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    try {
      const list = await requestJson(cdpPort, "/json/list", 1200);
      const page = list.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
      if (page) return page;
    } catch (_error) {
      await new Promise((resolve) => setTimeout(resolve, 220));
    }
  }
  throw new Error("Chrome did not expose a CDP page in time.");
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let sequence = 0;
    const pending = new Map();
    ws.on("open", () => {
      resolve({
        send(method, params = {}) {
          const id = ++sequence;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((res, rej) => pending.set(id, { res, rej, method }));
        },
        close() {
          ws.close();
        }
      });
    });
    ws.on("message", (raw) => {
      const message = JSON.parse(raw.toString());
      if (!message.id) return;
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id);
      if (message.error) item.rej(new Error(`${item.method}: ${message.error.message}`));
      else item.res(message.result);
    });
    ws.on("error", reject);
  });
}

async function evaluate(client, expression, timeout = 240000) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime exception");
  }
  return result.result.value;
}

function pageScenario(ms, sampleMs) {
  return String.raw`
new Promise((resolve, reject) => {
  const DURATION_MS = ${ms};
  const INTERVAL_MS = ${sampleMs};
  const MAX_EVENTS = 20000;

  const waitForGame = () => new Promise((done, fail) => {
    const startedAt = Date.now();
    const tick = () => {
      const IronLine = window.IronLine;
      if (IronLine?.game && IronLine?.InfantryAI && IronLine?.InfantryUnit && IronLine?.combat) return done(IronLine.game);
      if (Date.now() - startedAt > 9000) return fail(new Error("game missing"));
      setTimeout(tick, 100);
    };
    tick();
  });

  const idFor = (item) => item?.callSign || item?.id || "";
  const round = (value, digits = 2) => {
    const scale = 10 ** digits;
    return Math.round((Number(value) || 0) * scale) / scale;
  };
  const squadFor = (unit) => unit?.squad?.callSign || unit?.squad?.id || unit?.squadId || "";
  const weaponFor = (unit, options = {}) => options?.weapon?.id || unit?.weaponId || unit?.getWeapon?.()?.id || "";

  function runSampling(game) {
    return new Promise((done) => {
      const startWall = Date.now();
      const elapsed = () => round((Date.now() - startWall) / 1000, 2);
      const events = [];
      const frames = [];
      const prevPos = new Map();
      const prevAlive = new Set();
      const firstSeen = new Map();
      const shotUnitsTick = new Set();
      const stats = {
        grenadeBudgetCalls: 0,
        grenadeBudgetNull: 0,
        grenadeBudgetNonNull: 0,
        grenadeEvaluationCalls: 0,
        grenadeEvaluationNull: 0,
        grenadeEvaluationNonNull: 0,
        grenadeReasonCounts: {},
        grenadeCandidateRejectCounts: {},
        grenadeTryFailReasons: {},
        grenadeBestScoreMax: 0,
        grenadeBestScoreTotal: 0,
        grenadeBestScoreSamples: 0,
        grenadeTryCalls: 0,
        grenadeTryOk: 0,
        throwGrenadeCalls: 0,
        throwGrenadeOk: 0,
        shotTarget: 0,
        shotPoint: 0,
        shotTargetLosFalse: 0,
        fireMoveCalls: 0,
        fireMoveOk: 0,
        fireMoveReasonCounts: {},
        fireMoveBlockedModeCounts: {},
        fireMoveNoSupportCounts: {},
        fireMoveReasonByStateCounts: {},
        fireMoveReasonByWeaponCounts: {},
        fireMoveOkByState: {},
        fireMoveOkByWeapon: {},
        fireMoveTargetSourceCounts: {},
        teamworkEligibleTicks: 0,
        teamworkTicks: 0
      };

      const pushEvent = (event) => {
        if (events.length >= MAX_EVENTS) events.shift();
        events.push({ t: elapsed(), ...event });
      };

      const inc = (bucket, key, amount = 1) => {
        const safeKey = key || "unknown";
        bucket[safeKey] = (bucket[safeKey] || 0) + amount;
      };

      function installHooks() {
        const IronLine = window.IronLine;
        const InfantryAI = IronLine.InfantryAI;
        const combat = IronLine.combat;
        const physics = IronLine.physics || {};
        const math = IronLine.math || {};
        const config = IronLine.InfantryAIConfig || {};
        const distXY = math.distXY || ((x1, y1, x2, y2) => Math.hypot((x2 || 0) - (x1 || 0), (y2 || 0) - (y1 || 0)));

${hookDiagnosticsScript()}

        const diagnoseGrenadeTry = (ai, target, dt = 0.033) => {
          const weapon = target?.weapon || IronLine.constants?.INFANTRY_WEAPONS?.grenade;
          if (!weapon || !target || !ai.hasGrenade?.(weapon.id)) return "no-ammo";
          if (ai.fireCooldown > 0) return "fire-cooldown";
          if (ai.grenadeCooldown > 0) return "grenade-cooldown";

          const distance = distXY(ai.unit.x, ai.unit.y, target.x, target.y);
          if (distance < (config.grenadeMinRange ?? 86) || distance > weapon.range) return "range";

          const subject = target?.target || null;
          if (!subject || !ai.isAliveEnemy?.(subject)) return "invalid-target";
          if (!ai.isGrenadePointSafe?.(target, weapon)) return "unsafe-friendly";

          const visible = physics.hasLineOfSight?.(ai.game, ai.unit, subject, {
            padding: ai.isVehicleTarget?.(subject) ? 4 : 3
          }) !== false;
          if (!visible) {
            const reportReason = reportedRejectReason(ai, ai.game.getReportedContact?.(ai.unit.team, subject), weapon, {
              aimGrace: Boolean(ai.grenadePreparing || (ai.grenadeTargetGraceTimer || 0) > 0)
            });
            if (reportReason) return "stale-" + reportReason;
          }

          const key = ai.grenadeTargetKey?.(target) || "";
          if (!key) return "no-target-key";
          const currentAimTime = ai.grenadeAimTargetKey === key ? ai.grenadeAimTime || 0 : 0;
          const required = math.clamp
            ? math.clamp(
              (config.grenadeAimMin ?? 0.42) +
                distance / Math.max(1, weapon.range || 360) * 0.32 +
                (target.reason === "light-vehicle" || target.reason === "armor-track" ? 0.16 : 0),
              config.grenadeAimMin ?? 0.42,
              config.grenadeAimMax ?? 0.95
            )
            : (config.grenadeAimMin ?? 0.42);
          const angleTo = math.angleTo || ((x1, y1, x2, y2) => Math.atan2((y2 || 0) - (y1 || 0), (x2 || 0) - (x1 || 0)));
          const normalizeAngle = math.normalizeAngle || ((angle) => Math.atan2(Math.sin(angle), Math.cos(angle)));
          const facingError = Math.abs(normalizeAngle((ai.unit.angle || 0) - angleTo(ai.unit.x, ai.unit.y, target.x, target.y)));
          const facingGain = facingError < 0.18 ? 1 : facingError < 0.38 ? 0.52 : 0.18;
          if (currentAimTime + dt * facingGain < required) return "aiming";
          return "ready";
        };

        const diagnoseGrenadeTarget = (ai, contact, tankThreat) => {
          const weapons = ai.grenadeWeapons?.() || [];
          const reject = (reason) => inc(stats.grenadeCandidateRejectCounts, reason);
          const threshold = config.grenadeScoreThreshold ?? 2;
          const clusterRadius = config.grenadeClusterRadius ?? 112;
          const minRange = config.grenadeMinRange ?? 86;
          const vehicleThreatRange = config.grenadeVehicleThreatRange ?? 150;
          let bestScore = -Infinity;
          let candidateCount = 0;
          let softTargetsSeen = 0;
          let vehiclesSeen = 0;
          let visibleOrUsableTargets = 0;
          const localRejects = {};

          const localReject = (reason) => {
            inc(localRejects, reason);
            reject(reason);
          };
          const entrenchedBonus = (target) => (target?.isProne ? 0.72 : 0) + ((target?.suppression || 0) >= 45 ? 0.45 : (target?.suppression || 0) >= 30 ? 0.24 : 0);

          if (!weapons.length) return { reason: "no-ammo", bestScore, candidateCount };
          if (ai.fireCooldown > 0) return { reason: "fire-cooldown", bestScore, candidateCount };
          if (ai.grenadeCooldown > 0) return { reason: "grenade-cooldown", bestScore, candidateCount };
          if ((ai.unit?.suppression || 0) > 64) return { reason: "suppressed", bestScore, candidateCount };

          const hasLauncher = weapons.some((weapon) => weapon.id === "grenadeLauncher");
          if (!hasLauncher && tankThreat && distXY(ai.unit.x, ai.unit.y, tankThreat.x, tankThreat.y) < 340) {
            return { reason: "near-tank-without-launcher", bestScore, candidateCount };
          }

          const addCandidate = (weapon, point, score) => {
            const distance = distXY(ai.unit.x, ai.unit.y, point.x, point.y);
            if (distance < minRange) {
              localReject("candidate-too-close");
              return;
            }
            if (distance > weapon.range) {
              localReject("candidate-too-far");
              return;
            }
            if (!ai.isGrenadePointSafe?.(point, weapon)) {
              localReject("unsafe-friendly");
              return;
            }
            candidateCount += 1;
            const finalScore = score + (weapon.id === "grenadeLauncher" ? 0.18 : 0) - distance / Math.max(weapon.range * 2.2, 1);
            bestScore = Math.max(bestScore, finalScore);
          };

          const softTargets = ai.grenadeSoftTargets?.() || [];
          softTargetsSeen = softTargets.length;

          for (const weapon of weapons) {
            for (const target of softTargets) {
              const visible = physics.hasLineOfSight?.(ai.game, ai.unit, target, { padding: 3 }) !== false;
              const report = visible ? null : ai.game.getReportedContact?.(ai.unit.team, target);
              if (!visible) {
                const reportReason = reportedRejectReason(ai, report, weapon);
                if (reportReason) {
                  localReject(reportReason);
                  continue;
                }
              }
              visibleOrUsableTargets += 1;
              const aimPoint = visible
                ? target
                : report
                  ? ai.reportPoint?.(report)
                  : null;
              if (!aimPoint) {
                localReject("no-aim-point");
                continue;
              }

              const distance = distXY(ai.unit.x, ai.unit.y, aimPoint.x, aimPoint.y);
              if (distance > weapon.range + clusterRadius) {
                localReject("soft-precheck-too-far");
                continue;
              }

              const cluster = visible
                ? ai.grenadeClusterAt?.(target, softTargets) || { count: 1, center: target }
                : ai.grenadeReportedClusterAt?.(aimPoint) || { count: 1, center: aimPoint };
              const vehicleDistance = ai.nearestKnownVehicleDistance?.(aimPoint) ?? Infinity;
              const covered = !visible;
              const nearVehicle = vehicleDistance <= vehicleThreatRange;
              const score =
                cluster.count * 1.05 +
                Math.max(0, cluster.count - 1) * 0.28 +
                (covered ? 1.05 : 0) +
                (nearVehicle ? 1.15 : 0) +
                (target.classId === "engineer" ? 0.18 : 0) +
                entrenchedBonus(target);

              if (score >= threshold) addCandidate(weapon, cluster.center, score);
              else {
                bestScore = Math.max(bestScore, score);
                localReject("soft-score-below-threshold");
              }
            }

            for (const vehicle of ai.vehicleTargets?.() || []) {
              if (!vehicle.alive || vehicle.team === ai.unit.team) continue;
              vehiclesSeen += 1;
              const armored = vehicle.vehicleType !== "humvee";
              if (armored && weapon.id !== "grenadeLauncher") {
                localReject("armor-needs-launcher");
                continue;
              }
              const visible = physics.hasLineOfSight?.(ai.game, ai.unit, vehicle, { padding: 4 }) !== false;
              const report = visible ? null : ai.game.getReportedContact?.(ai.unit.team, vehicle);
              if (!visible) {
                const reportReason = reportedRejectReason(ai, report, weapon);
                if (reportReason) {
                  localReject("vehicle-" + reportReason);
                  continue;
                }
              }
              visibleOrUsableTargets += 1;
              const aimPoint = visible ? vehicle : report ? ai.reportPoint?.(report) : null;
              if (!aimPoint) {
                localReject("vehicle-no-aim-point");
                continue;
              }
              addCandidate(weapon, aimPoint, visible ? (armored ? 2.85 : 2.45) : (armored ? 2.45 : 2.22));
            }
          }

          if (Number.isFinite(bestScore)) {
            stats.grenadeBestScoreMax = Math.max(stats.grenadeBestScoreMax, bestScore);
            stats.grenadeBestScoreTotal += bestScore;
            stats.grenadeBestScoreSamples += 1;
          }

          if (candidateCount > 0 && bestScore >= threshold) return { reason: "candidate-ready", bestScore, candidateCount };
          if (candidateCount > 0) return { reason: "candidate-final-score-below-threshold", bestScore, candidateCount };
          if (localRejects["unsafe-friendly"]) return { reason: "unsafe-friendly", bestScore, candidateCount };
          if (localRejects["soft-score-below-threshold"]) return { reason: "soft-score-below-threshold", bestScore, candidateCount };
          if (visibleOrUsableTargets <= 0 && softTargetsSeen + vehiclesSeen > 0) return { reason: "no-visible-or-usable-report", bestScore, candidateCount };
          if (softTargetsSeen + vehiclesSeen <= 0) return { reason: "no-known-enemies", bestScore, candidateCount };
          if (Number.isFinite(bestScore)) return { reason: "best-score-below-threshold", bestScore, candidateCount };
          return { reason: "no-target", bestScore, candidateCount };
        };

        const originalFireRifle = combat.fireRifle;
        combat.fireRifle = function tracedFireRifle(gameArg, shooter, target, options = {}) {
          let fired = false;
          try {
            fired = originalFireRifle.call(this, gameArg, shooter, target, options);
          } finally {
            if (fired) {
              const los = physics.hasLineOfSight
                ? physics.hasLineOfSight(gameArg, shooter, target, { padding: 3 }) !== false
                : null;
              const shooterId = idFor(shooter);
              shotUnitsTick.add(shooterId);
              stats.shotTarget += 1;
              if (los === false) stats.shotTargetLosFalse += 1;
              pushEvent({
                type: "shot",
                mode: "target",
                from: shooterId,
                team: shooter?.team || "",
                squad: squadFor(shooter),
                weapon: weaponFor(shooter, options),
                los,
                x: round(shooter?.x, 1),
                y: round(shooter?.y, 1),
                tx: round(target?.x, 1),
                ty: round(target?.y, 1),
                target: idFor(target),
                targetTeam: target?.team || ""
              });
            }
          }
          return fired;
        };

        const originalFireRifleAtPoint = combat.fireRifleAtPoint;
        if (originalFireRifleAtPoint) {
          combat.fireRifleAtPoint = function tracedFireRifleAtPoint(gameArg, shooter, aimX, aimY, options = {}) {
            let fired = false;
            try {
              fired = originalFireRifleAtPoint.call(this, gameArg, shooter, aimX, aimY, options);
            } finally {
              if (fired) {
                const shooterId = idFor(shooter);
                shotUnitsTick.add(shooterId);
                stats.shotPoint += 1;
                pushEvent({
                  type: "shot",
                  mode: "point",
                  from: shooterId,
                  team: shooter?.team || "",
                  squad: squadFor(shooter),
                  weapon: weaponFor(shooter, options),
                  los: null,
                  x: round(shooter?.x, 1),
                  y: round(shooter?.y, 1),
                  tx: round(aimX, 1),
                  ty: round(aimY, 1),
                  targetTeam: options?.targetTeam || ""
                });
              }
            }
            return fired;
          };
        }

        const originalThrowGrenade = combat.throwGrenade;
        if (originalThrowGrenade) {
          combat.throwGrenade = function tracedThrowGrenade(gameArg, shooter, aimX, aimY, options = {}) {
            stats.throwGrenadeCalls += 1;
            const result = originalThrowGrenade.call(this, gameArg, shooter, aimX, aimY, options);
            if (result) stats.throwGrenadeOk += 1;
            pushEvent({
              type: "grenade-launch",
              ok: Boolean(result),
              from: idFor(shooter),
              team: shooter?.team || "",
              squad: squadFor(shooter),
              weapon: options?.weapon?.id || "grenade",
              x: round(shooter?.x, 1),
              y: round(shooter?.y, 1),
              tx: round(aimX, 1),
              ty: round(aimY, 1)
            });
            return result;
          };
        }

        const originalSelectGrenadeTargetBudgeted = InfantryAI.prototype.selectGrenadeTargetBudgeted;
        if (originalSelectGrenadeTargetBudgeted) {
          InfantryAI.prototype.selectGrenadeTargetBudgeted = function tracedSelectGrenadeTargetBudgeted(contact, tankThreat) {
            stats.grenadeBudgetCalls += 1;
            const result = originalSelectGrenadeTargetBudgeted.call(this, contact, tankThreat);
            if (result) stats.grenadeBudgetNonNull += 1;
            else stats.grenadeBudgetNull += 1;
            return result;
          };
        }

        const originalSelectGrenadeTarget = InfantryAI.prototype.selectGrenadeTarget;
        if (originalSelectGrenadeTarget) {
          InfantryAI.prototype.selectGrenadeTarget = function tracedSelectGrenadeTarget(contact, tankThreat) {
            const diagnosis = diagnoseGrenadeTarget(this, contact, tankThreat);
            stats.grenadeEvaluationCalls += 1;
            const result = originalSelectGrenadeTarget.call(this, contact, tankThreat);
            if (result) {
              stats.grenadeEvaluationNonNull += 1;
              inc(stats.grenadeReasonCounts, "ok");
            } else {
              stats.grenadeEvaluationNull += 1;
              inc(stats.grenadeReasonCounts, diagnosis.reason || "unknown");
            }
            return result;
          };
        }

        const originalTryThrowGrenade = InfantryAI.prototype.tryThrowGrenade;
        if (originalTryThrowGrenade) {
          InfantryAI.prototype.tryThrowGrenade = function tracedTryThrowGrenade(target, dt) {
            stats.grenadeTryCalls += 1;
            const failReason = diagnoseGrenadeTry(this, target, dt);
            let ok = false;
            try {
              ok = originalTryThrowGrenade.call(this, target, dt);
              return ok;
            } finally {
              if (ok) stats.grenadeTryOk += 1;
              else inc(stats.grenadeTryFailReasons, failReason);
              pushEvent({
                type: "grenade",
                ok: Boolean(ok),
                reason: ok ? "ok" : failReason,
                from: idFor(this.unit),
                team: this.unit?.team || "",
                squad: squadFor(this.unit),
                weapon: target?.weapon?.id || "grenade",
                x: round(this.unit?.x, 1),
                y: round(this.unit?.y, 1),
                tx: round(target?.x, 1),
                ty: round(target?.y, 1),
                state: this.state || ""
              });
            }
          };
        }

        const originalExecuteFireMoveAdvance = InfantryAI.prototype.executeFireMoveAdvance;
        if (originalExecuteFireMoveAdvance) {
          InfantryAI.prototype.executeFireMoveAdvance = function tracedExecuteFireMoveAdvance(dt, order, contact, tankThreat, reportedContact, beforeX, beforeY) {
            stats.fireMoveCalls += 1;
            const diagnosis = this.diagnoseFireMoveAdvance?.(order, contact, tankThreat, reportedContact) || { reason: "diagnostic-missing" };
            const weaponId = this.weapon?.()?.id || this.unit?.weaponId || "unknown";
            const result = originalExecuteFireMoveAdvance.call(this, dt, order, contact, tankThreat, reportedContact, beforeX, beforeY);
            if (result) {
              const state = this.state || diagnosis.state || "unknown";
              stats.fireMoveOk += 1;
              inc(stats.fireMoveReasonCounts, "ok");
              inc(stats.fireMoveReasonByStateCounts, "ok:" + state);
              inc(stats.fireMoveReasonByWeaponCounts, "ok:" + weaponId);
              inc(stats.fireMoveOkByState, state);
              inc(stats.fireMoveOkByWeapon, weaponId);
              inc(stats.fireMoveTargetSourceCounts, diagnosis.targetSource || "unknown");
              pushEvent({
                type: "fire-move",
                ok: true,
                from: idFor(this.unit),
                team: this.unit?.team || "",
                squad: squadFor(this.unit),
                state,
                targetSource: diagnosis.targetSource || "",
                x: round(this.unit?.x, 1),
                y: round(this.unit?.y, 1),
                mode: diagnosis.mode || "",
                role: diagnosis.role || ""
              });
            } else {
              const reason = diagnosis.reason || "unknown";
              const state = diagnosis.state || "pre-profile";
              inc(stats.fireMoveReasonCounts, reason);
              inc(stats.fireMoveReasonByStateCounts, reason + ":" + state);
              inc(stats.fireMoveReasonByWeaponCounts, reason + ":" + weaponId);
              if (diagnosis.reason === "blocked-mode") inc(stats.fireMoveBlockedModeCounts, diagnosis.mode || "unknown");
              if (diagnosis.reason === "no-support-source") inc(stats.fireMoveNoSupportCounts, diagnoseNoSupportSource(this, diagnosis.target || reportedContact || contact));
              if (diagnosis.targetSource) inc(stats.fireMoveTargetSourceCounts, diagnosis.targetSource);
            }
            return result;
          };
        }

        const originalEnterProne = InfantryAI.prototype.enterProne;
        if (originalEnterProne) {
          InfantryAI.prototype.enterProne = function tracedEnterProne(options = {}) {
            const before = Boolean(this.unit?.isProne);
            const result = originalEnterProne.call(this, options);
            if (!before && this.unit?.isProne) {
              pushEvent({
                type: "prone-enter",
                from: idFor(this.unit),
                team: this.unit?.team || "",
                squad: squadFor(this.unit),
                state: this.state || "",
                mode: options?.mode || "",
                role: options?.role || this.squadRole?.() || "",
                sup: round(this.unit?.suppression, 1),
                x: round(this.unit?.x, 1),
                y: round(this.unit?.y, 1)
              });
            }
            return result;
          };
        }

        const originalClearProne = InfantryAI.prototype.clearProne;
        if (originalClearProne) {
          InfantryAI.prototype.clearProne = function tracedClearProne(cooldown, instant) {
            const before = Boolean(this.unit?.isProne);
            const result = originalClearProne.call(this, cooldown, instant);
            if (before && !this.unit?.isProne) {
              pushEvent({
                type: "prone-exit",
                from: idFor(this.unit),
                team: this.unit?.team || "",
                squad: squadFor(this.unit),
                state: this.state || "",
                instant: Boolean(instant),
                sup: round(this.unit?.suppression, 1),
                x: round(this.unit?.x, 1),
                y: round(this.unit?.y, 1)
              });
            }
            return result;
          };
        }
      }

      installHooks();

      const timer = setInterval(() => {
        const t = elapsed();
        const units = [];
        const aliveNow = new Set();
        const moversBySquad = new Map();
        const shootersBySquad = new Map();

        for (const unit of game.infantry || []) {
          const id = idFor(unit);
          if (!id) continue;
          if (!firstSeen.has(id)) firstSeen.set(id, t);
          const alive = unit.alive !== false && unit.hp > 0;
          const squad = squadFor(unit);
          const prev = prevPos.get(id);
          const moved = prev && Math.hypot((unit.x || 0) - prev.x, (unit.y || 0) - prev.y) > 9;
          prevPos.set(id, { x: unit.x || 0, y: unit.y || 0 });
          if (alive) {
            aliveNow.add(id);
            if (moved && squad) moversBySquad.set(squad, (moversBySquad.get(squad) || 0) + 1);
          }
          units.push({
            id,
            team: unit.team || "",
            x: round(unit.x, 1),
            y: round(unit.y, 1),
            hp: round(unit.hp, 1),
            maxHp: round(unit.maxHp || unit.hp || 0, 1),
            state: unit.ai?.state || "",
            sup: round(unit.suppression, 1),
            prone: Boolean(unit.isProne),
            squad,
            weapon: unit.weaponId || "",
            alive
          });
        }

        for (const id of shotUnitsTick) {
          const unit = (game.infantry || []).find((item) => idFor(item) === id);
          const squad = squadFor(unit);
          if (squad) shootersBySquad.set(squad, (shootersBySquad.get(squad) || 0) + 1);
        }

        let squadEligible = 0;
        let squadTeamwork = 0;
        for (const squad of game.squads || []) {
          const id = squad.callSign || squad.id || "";
          const active = squad.activeUnits?.() || [];
          if (!id || active.length < 2) continue;
          const shooters = shootersBySquad.get(id) || 0;
          const movers = moversBySquad.get(id) || 0;
          if (shooters > 0 || movers > 0) {
            squadEligible += 1;
            if (shooters > 0 && movers > 0) squadTeamwork += 1;
          }
        }
        stats.teamworkEligibleTicks += squadEligible;
        stats.teamworkTicks += squadTeamwork;

        for (const id of prevAlive) {
          if (!aliveNow.has(id)) {
            const last = units.find((unit) => unit.id === id);
            pushEvent({
              type: "death",
              id,
              team: last?.team || "",
              squad: last?.squad || "",
              x: last?.x || 0,
              y: last?.y || 0,
              lifetime: round(t - (firstSeen.get(id) || 0), 1)
            });
          }
        }
        prevAlive.clear();
        for (const id of aliveNow) prevAlive.add(id);

        frames.push({
          t,
          units,
          squadwork: { eligible: squadEligible, teamwork: squadTeamwork }
        });

        shotUnitsTick.clear();

        if (Date.now() - startWall >= DURATION_MS) {
          clearInterval(timer);
          done({
            meta: {
              startedAt: new Date().toISOString(),
              profile: "ai-15v15",
              durationMs: DURATION_MS,
              intervalMs: INTERVAL_MS,
              maxEvents: MAX_EVENTS,
              location: window.location.href
            },
            frames,
            events,
            stats
          });
        }
      }, INTERVAL_MS);
    });
  }

  waitForGame().then((game) => {
    game.aiScaleReadiness?.applyProfile?.("ai-15v15");

    const clickIf = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return false;
      node.click?.();
      return true;
    };

    clickIf("#entryMainGuest");
    setTimeout(() => clickIf("#entryEnterButton"), 180);
    setTimeout(() => {
      clickIf("#deploymentStart");
      const startedAt = Date.now();
      const waitForLive = () => {
        if (!game.matchStarted && Date.now() - startedAt <= 12000) return setTimeout(waitForLive, 100);
        if (!game.matchStarted) return reject(new Error("match did not start"));
        runSampling(game).then(resolve).catch(reject);
      };
      waitForLive();
    }, 560);
  }).catch(reject);
})
`;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function countBy(items, keyFn) {
  const result = {};
  for (const item of items) {
    const key = keyFn(item) || "unknown";
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function summarize(data) {
  const frames = data.frames || [];
  const events = data.events || [];
  const stats = data.stats || {};
  const shots = events.filter((event) => event.type === "shot");
  const targetShots = shots.filter((event) => event.mode === "target");
  const pointShots = shots.filter((event) => event.mode === "point");
  const losFalseShots = targetShots.filter((event) => event.los === false);
  const grenadeDecisions = events.filter((event) => event.type === "grenade");
  const grenadeOk = grenadeDecisions.filter((event) => event.ok);
  const grenadeLaunches = events.filter((event) => event.type === "grenade-launch");
  const deaths = events.filter((event) => event.type === "death");
  const proneEnter = events.filter((event) => event.type === "prone-enter");
  const proneExit = events.filter((event) => event.type === "prone-exit");
  const durations = [];
  const open = new Map();
  for (const event of events) {
    if (event.type === "prone-enter") open.set(event.from, event.t);
    else if (event.type === "prone-exit" && open.has(event.from)) {
      durations.push(Math.max(0, event.t - open.get(event.from)));
      open.delete(event.from);
    }
  }

  const suppressionShots = pointShots.length + losFalseShots.length;
  const finalFrame = frames[frames.length - 1] || { units: [] };
  const finalAlive = finalFrame.units.filter((unit) => unit.alive);
  const aliveByTeam = countBy(finalAlive, (unit) => unit.team);
  const allUnits = new Map();
  for (const frame of frames) {
    for (const unit of frame.units || []) {
      const item = allUnits.get(unit.id) || { maxSup: 0, proneSamples: 0, samples: 0 };
      item.maxSup = Math.max(item.maxSup, Number(unit.sup) || 0);
      item.proneSamples += unit.prone ? 1 : 0;
      item.samples += 1;
      allUnits.set(unit.id, item);
    }
  }
  const maxSuppression = Array.from(allUnits.values()).map((unit) => unit.maxSup);

  const teamworkRatio = stats.teamworkEligibleTicks
    ? stats.teamworkTicks / stats.teamworkEligibleTicks
    : 0;
  const grenadeSuccessRate = stats.grenadeTryCalls
    ? stats.grenadeTryOk / stats.grenadeTryCalls
    : 0;
  const evaluationNullRate = stats.grenadeEvaluationCalls
    ? stats.grenadeEvaluationNull / stats.grenadeEvaluationCalls
    : 0;
  const budgetNullRate = stats.grenadeBudgetCalls
    ? stats.grenadeBudgetNull / stats.grenadeBudgetCalls
    : 0;
  const grenadeBestScoreAverage = stats.grenadeBestScoreSamples
    ? stats.grenadeBestScoreTotal / stats.grenadeBestScoreSamples
    : 0;

  return {
    durationSeconds: Math.round((data.meta?.durationMs || 0) / 1000),
    frames: frames.length,
    events: events.length,
    shots: shots.length,
    targetShots: targetShots.length,
    pointShots: pointShots.length,
    losFalseShots: losFalseShots.length,
    suppressionShotRatio: Number((suppressionShots / Math.max(1, shots.length)).toFixed(3)),
    grenadeDecisionCalls: grenadeDecisions.length,
    grenadeDecisionOk: grenadeOk.length,
    grenadeSuccessRate: Number(grenadeSuccessRate.toFixed(3)),
    grenadeLaunches: grenadeLaunches.length,
    grenadeLaunchOk: grenadeLaunches.filter((event) => event.ok).length,
    grenadeBudgetCalls: stats.grenadeBudgetCalls || 0,
    grenadeBudgetNull: stats.grenadeBudgetNull || 0,
    grenadeBudgetNullRate: Number(budgetNullRate.toFixed(3)),
    grenadeEvaluationCalls: stats.grenadeEvaluationCalls || 0,
    grenadeEvaluationNull: stats.grenadeEvaluationNull || 0,
    grenadeEvaluationNullRate: Number(evaluationNullRate.toFixed(3)),
    grenadeReasonCounts: stats.grenadeReasonCounts || {},
    grenadeCandidateRejectCounts: stats.grenadeCandidateRejectCounts || {},
    grenadeTryFailReasons: stats.grenadeTryFailReasons || {},
    grenadeBestScoreMax: Number((stats.grenadeBestScoreMax || 0).toFixed(3)),
    grenadeBestScoreAverage: Number(grenadeBestScoreAverage.toFixed(3)),
    grenadeOkByWeapon: countBy(grenadeOk, (event) => event.weapon),
    grenadeLaunchByWeapon: countBy(grenadeLaunches.filter((event) => event.ok), (event) => event.weapon),
    fireMoveCalls: stats.fireMoveCalls || 0,
    fireMoveOk: stats.fireMoveOk || 0,
    fireMoveOkRate: Number(((stats.fireMoveOk || 0) / Math.max(1, stats.fireMoveCalls || 0)).toFixed(3)),
    fireMoveReasonCounts: stats.fireMoveReasonCounts || {},
    fireMoveBlockedModeCounts: stats.fireMoveBlockedModeCounts || {},
    fireMoveNoSupportCounts: stats.fireMoveNoSupportCounts || {},
    fireMoveReasonByStateCounts: stats.fireMoveReasonByStateCounts || {},
    fireMoveReasonByWeaponCounts: stats.fireMoveReasonByWeaponCounts || {},
    fireMoveOkByState: stats.fireMoveOkByState || {},
    fireMoveOkByWeapon: stats.fireMoveOkByWeapon || {},
    fireMoveTargetSourceCounts: stats.fireMoveTargetSourceCounts || {},
    teamworkTicks: stats.teamworkTicks || 0,
    teamworkEligibleTicks: stats.teamworkEligibleTicks || 0,
    teamworkRatio: Number(teamworkRatio.toFixed(3)),
    proneEnter: proneEnter.length,
    proneExit: proneExit.length,
    proneHoldAverageSeconds: durations.length
      ? Number((durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(2))
      : 0,
    deaths: deaths.length,
    finalAliveByTeam: {
      blue: aliveByTeam.blue || 0,
      red: aliveByTeam.red || 0
    },
    unitMaxSuppression: {
      p50: percentile(maxSuppression, 0.5),
      p75: percentile(maxSuppression, 0.75),
      p95: percentile(maxSuppression, 0.95),
      max: Math.max(0, ...maxSuppression)
    },
    shotsByWeapon: countBy(shots, (event) => event.weapon),
    pointShotsByWeapon: countBy(pointShots, (event) => event.weapon)
  };
}

async function main() {
  const server = spawn(process.execPath, ["tools/static-server.cjs", String(appPort)], {
    cwd: root,
    stdio: "ignore",
    env: { ...process.env, PORT: String(appPort) }
  });
  const chrome = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--no-first-run",
    "--disable-extensions",
    appUrl
  ], { stdio: "ignore" });

  let client = null;
  try {
    await waitForApp();
    const page = await waitForCdpPage();
    client = await connectCdp(page.webSocketDebuggerUrl);
    await client.send("Page.enable");
    await client.send("Page.navigate", { url: appUrl });
    await new Promise((resolve) => setTimeout(resolve, 1400));
    await client.send("Runtime.enable");
    const data = await evaluate(client, pageScenario(durationMs, intervalMs), durationMs + 70000);
    const summary = summarize(data);
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const outDir = path.join(root, "reports", "playtests", `behavior-census-${stamp}`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "result.json"), JSON.stringify(data));
    fs.writeFileSync(path.join(outDir, "report.md"), summaryMarkdown(summary, outDir));
    console.log(JSON.stringify(summary, null, 2));
    console.log(`Report: ${path.join(outDir, "report.md")}`);
  } finally {
    if (client) client.close();
    chrome.kill();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
