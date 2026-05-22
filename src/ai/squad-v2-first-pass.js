"use strict";

(function registerSquadV2FirstPass(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const proto = IronLine.SquadAI?.prototype;
  if (!proto || proto.__v2FirstPassPatch) return;

  const { clamp, distXY } = IronLine.math;
  const { hasLineOfSight } = IronLine.physics || {};

  const originalAssignOrder = proto.assignOrder;
  const originalComputeStatus = proto.computeStatus;
  const originalChooseTacticalMode = proto.chooseTacticalMode;
  const originalUpdateTactics = proto.updateTactics;
  const originalGetOrderFor = proto.getOrderFor;

  const REPORTS = {
    noCover: {
      kind: "noCover",
      severity: "warning",
      message: "Cover is thin; holding for a better line."
    },
    noLineOfSight: {
      kind: "noLineOfSight",
      severity: "info",
      message: "No clean line of sight; shifting position."
    },
    noArmorSupport: {
      kind: "noArmorSupport",
      severity: "warning",
      message: "Armor support requested before push."
    },
    highSuppression: {
      kind: "highSuppression",
      severity: "warning",
      message: "Heavy suppression; holding and returning fire."
    },
    pathBlocked: {
      kind: "pathBlocked",
      severity: "warning",
      message: "Path blocked; regrouping before moving."
    },
    heavyLosses: {
      kind: "heavyLosses",
      severity: "major",
      message: "Heavy losses; fallback may be needed."
    },
    noReconMark: {
      kind: "noReconMark",
      severity: "info",
      message: "Recon mark recommended before assault."
    },
    vehicleTrafficBlocked: {
      kind: "vehicleTrafficBlocked",
      severity: "warning",
      message: "Vehicle route blocked; waiting for clear lane."
    },
    assaultReady: {
      kind: "assaultReady",
      severity: "info",
      message: "Staging reached; assault approval requested."
    },
    retreatNeeded: {
      kind: "retreatNeeded",
      severity: "major",
      message: "Squad pressure critical; retreat recommended."
    }
  };

  function uniqueReasons(reasons) {
    return [...new Set((reasons || []).filter(Boolean))].slice(0, 6);
  }

  proto.ensureV2State = function ensureV2State() {
    if (!this.v2) {
      this.v2 = {
        radioReport: null,
        radioReportKey: "",
        lastRadioReportAt: 0,
        failureReasons: [],
        morale: null,
        assaultApproval: null,
        lastAssaultRequestAt: 0
      };
    }
    return this.v2;
  };

  proto.assignOrder = function assignOrderWithV2(order) {
    const v2 = this.ensureV2State();
    const previousKey = [
      this.order?.id || "",
      this.order?.objectiveName || this.order?.point?.name || "",
      this.order?.commandType || ""
    ].join(":");
    const nextKey = [
      order?.id || "",
      order?.objectiveName || order?.point?.name || "",
      order?.commandType || ""
    ].join(":");
    if (previousKey !== nextKey) {
      v2.assaultApproval = null;
      v2.failureReasons = [];
      v2.radioReport = null;
      v2.radioReportKey = "";
    }
    const result = originalAssignOrder.call(this, order);
    if (order?.commandSource === "player" && this.commandState === "assault") {
      this.approveV2Assault("player-command");
    }
    return result;
  };

  proto.computeStatus = function computeStatusWithV2() {
    const status = originalComputeStatus.call(this);
    const v2 = this.ensureV2State();
    status.v2Morale = this.v2MoraleFor(status);
    status.v2FailureReasons = this.v2FailureReasonsFor(status);
    status.v2AssaultApproval = this.v2AssaultApprovalSummary();
    v2.morale = status.v2Morale;
    v2.failureReasons = status.v2FailureReasons;
    this.v2Morale = status.v2Morale;
    this.v2FailureReasons = status.v2FailureReasons;
    return status;
  };

  proto.chooseTacticalMode = function chooseTacticalModeWithV2(status) {
    const desired = originalChooseTacticalMode.call(this, status);
    if (this.commandSource === "player" && this.commandLockActive?.()) {
      this.updateV2AssaultApproval(status, desired);
      return desired;
    }

    this.updateV2AssaultApproval(status, desired);
    if (this.v2ApprovalBlocksAssault(status, desired)) {
      return status?.cohesion > this.regroupCohesionThreshold?.(status) ? "regroup" : "pre-assault";
    }

    const morale = status?.v2Morale || this.v2MoraleFor(status);
    const risk = Number(status?.tacticalRisk || 0);
    if (desired === "advance" && risk >= 0.52 && morale.morale <= 0.34) return "support-fire";
    return desired;
  };

  proto.updateTactics = function updateTacticsWithV2(force = false, dt = 0.45) {
    const result = originalUpdateTactics.call(this, force, dt);
    this.updateV2RadioReport(this.status, this.tacticalMode);
    return result;
  };

  proto.getOrderFor = function getOrderForWithV2(unit) {
    const order = originalGetOrderFor.call(this, unit);
    if (!order) return order;
    return {
      ...order,
      v2Morale: this.v2Morale || this.status?.v2Morale || null,
      v2FailureReasons: (this.v2FailureReasons || this.status?.v2FailureReasons || []).slice(0, 6),
      v2RadioReport: this.v2?.radioReport || null,
      v2AssaultApproval: this.v2AssaultApprovalSummary()
    };
  };

  proto.v2MoraleFor = function v2MoraleFor(status = {}) {
    const leaderAlive = Boolean(this.leaderUnit?.());
    const playerNear = this.v2PlayerNear(status);
    const tankSupport = Boolean(status.friendlyTank?.vehicle && status.friendlyTank.distance <= 560);
    const loss = clamp(Number(status.casualtyRatio || 0), 0, 1);
    const suppression = clamp(Number(status.avgSuppression || 0) / 100, 0, 1);
    const risk = clamp(Number(status.tacticalRisk || 0), 0, 1);
    const cohesionPenalty = status.cohesion > 260 ? 0.12 : 0;
    const fatigue = clamp(loss * 0.44 + suppression * 0.36 + risk * 0.18 + cohesionPenalty, 0, 1);
    const morale = clamp(
      0.66 -
      loss * 0.36 -
      suppression * 0.32 -
      risk * 0.14 +
      (leaderAlive ? 0.08 : -0.12) +
      (playerNear ? 0.08 : 0) +
      (tankSupport ? 0.08 : 0),
      0,
      1
    );
    const assaultConfidence = clamp(
      morale +
      (tankSupport ? 0.1 : 0) +
      (playerNear ? 0.06 : 0) -
      (status.armorThreat?.distance < 760 ? 0.14 : 0) -
      (status.avgSuppression > 42 ? 0.12 : 0),
      0,
      1
    );
    return {
      morale: Math.round(morale * 100) / 100,
      fatigue: Math.round(fatigue * 100) / 100,
      assaultConfidence: Math.round(assaultConfidence * 100) / 100,
      leaderAlive,
      playerNear,
      tankSupport
    };
  };

  proto.v2PlayerNear = function v2PlayerNear(status = {}) {
    const player = this.game?.player;
    if (!player || player.hp <= 0 || player.team !== this.team || !status.center) return false;
    return distXY(player.x, player.y, status.center.x, status.center.y) <= 520;
  };

  proto.v2FailureReasonsFor = function v2FailureReasonsFor(status = {}) {
    const reasons = [];
    const combatThreat = status.lastThreat || status.armorThreat?.vehicle || null;
    const threat = combatThreat || this.order?.point || null;
    const active = this.activeUnits?.() || [];
    const maxStuck = active.reduce((max, unit) => Math.max(max, Number(unit.ai?.stuckTimer || 0)), 0);
    const risk = Number(status.tacticalRisk || 0);

    if (Number(status.casualtyRatio || 0) >= 0.34) reasons.push("heavyLosses");
    if (Number(status.avgSuppression || 0) >= 42 || Number(status.maxSuppression || 0) >= 72) reasons.push("highSuppression");
    if (status.armorThreat?.distance < 720 && !status.friendlyTank?.vehicle && !this.squadHasRpg?.()) reasons.push("noArmorSupport");
    if (maxStuck > 1.25 || (status.cohesion || 0) > this.regroupCohesionThreshold?.(status) * 1.25) reasons.push("pathBlocked");

    if (threat && status.center && risk >= 0.5) {
      const cover = this.squadTacticalCoverPoint?.(status, threat, "v2-cover-probe", {
        maxDistance: 560,
        requireCovered: false
      });
      if (!cover) reasons.push("noCover");
    }

    const leader = this.leaderUnit?.();
    if (leader && combatThreat && hasLineOfSight && !hasLineOfSight(this.game, leader, combatThreat, { padding: 3, ignoreSmoke: false })) {
      reasons.push("noLineOfSight");
    }

    if (this.v2NeedsReconMark(status)) reasons.push("noReconMark");
    if (this.v2VehicleTrafficBlocked(status)) reasons.push("vehicleTrafficBlocked");
    return uniqueReasons(reasons);
  };

  proto.v2NeedsReconMark = function v2NeedsReconMark(status = {}) {
    const objective = this.order?.point;
    if (!objective || this.squadType === "recon") return false;
    if (Number(status.tacticalRisk || 0) < 0.62 && Number(status.avgSuppression || 0) < 38) return false;
    const now = performance.now();
    return !(this.game.commandPings || []).some((ping) => (
      ping.type === "scan" &&
      ping.team === this.team &&
      (!ping.expiresAt || ping.expiresAt > now) &&
      distXY(ping.x, ping.y, objective.x, objective.y) <= (ping.radius || 420) + (objective.radius || 150)
    ));
  };

  proto.v2VehicleTrafficBlocked = function v2VehicleTrafficBlocked(status = {}) {
    const tank = status.friendlyTank?.vehicle;
    const debug = tank?.ai?.debug || {};
    return Boolean(debug.tacticalWaitForClear || debug.trafficHoldTarget || (debug.trafficHoldTimer || 0) > 0);
  };

  proto.updateV2AssaultApproval = function updateV2AssaultApproval(status = {}, desiredMode = "") {
    const v2 = this.ensureV2State();
    const now = performance.now();
    if (this.commandSource === "player" && this.commandState === "assault") {
      this.approveV2Assault("player-command");
      return v2.assaultApproval;
    }

    const current = v2.assaultApproval;
    if (current?.status === "approved" && now <= current.approvedUntil) return current;
    if (current?.status === "pending" && now > current.expiresAt) {
      current.status = "timed-out";
      current.blocking = false;
      current.timedOutAt = now;
    }

    if (!this.v2ShouldRequestAssaultApproval(status, desiredMode)) return v2.assaultApproval;
    if (current?.status === "pending" && now <= current.expiresAt) return current;
    if (now - (v2.lastAssaultRequestAt || 0) < 8000) return current || null;

    const request = {
      id: `assault-approval:${this.callSign}:${Math.floor(now)}`,
      status: "pending",
      blocking: true,
      requestedAt: now,
      expiresAt: now + 5200,
      objectiveName: this.order?.objectiveName || this.order?.point?.name || "",
      commanderSlotId: this.commanderSlotId || this.ownerSlotId || "",
      squadLeaderId: this.squadLeaderId || this.leaderUnit?.()?.callSign || "",
      confidence: status.v2Morale?.assaultConfidence ?? this.v2MoraleFor(status).assaultConfidence
    };
    v2.assaultApproval = request;
    v2.lastAssaultRequestAt = now;
    this.recordV2RadioReport({
      ...REPORTS.assaultReady,
      reason: "assaultApproval",
      approvalId: request.id,
      message: `${REPORTS.assaultReady.message} ${request.objectiveName}`.trim()
    }, ["assaultApproval"]);
    return request;
  };

  proto.v2ShouldRequestAssaultApproval = function v2ShouldRequestAssaultApproval(status = {}, desiredMode = "") {
    if (!this.order?.point || this.order.role === "hold") return false;
    if (this.commandSource === "player" || this.commandLockActive?.()) return false;
    if (status.alive < 2 || status.mountedCount > 0) return false;
    if ((status.v2FailureReasons || []).some((reason) => reason === "heavyLosses" || reason === "highSuppression")) return false;
    const radius = this.order.point.radius || 150;
    const nearOuter = status.objectiveDistance > radius + 80 && status.objectiveDistance < radius + 660;
    return nearOuter || desiredMode === "pre-assault" || this.tacticalMode === "pre-assault";
  };

  proto.v2ApprovalBlocksAssault = function v2ApprovalBlocksAssault(_status = {}, desiredMode = "") {
    const approval = this.ensureV2State().assaultApproval;
    if (!approval || approval.status !== "pending" || !approval.blocking) return false;
    if (performance.now() > approval.expiresAt) return false;
    return desiredMode === "advance" || desiredMode === "pre-assault";
  };

  proto.approveV2Assault = function approveV2Assault(source = "player") {
    const v2 = this.ensureV2State();
    const now = performance.now();
    const approval = {
      ...(v2.assaultApproval || {}),
      id: v2.assaultApproval?.id || `assault-approval:${this.callSign}:${Math.floor(now)}`,
      status: "approved",
      blocking: false,
      approvedBy: source,
      approvedAt: now,
      approvedUntil: now + 6500,
      objectiveName: this.order?.objectiveName || this.order?.point?.name || "",
      commanderSlotId: this.commanderSlotId || this.ownerSlotId || "",
      squadLeaderId: this.squadLeaderId || this.leaderUnit?.()?.callSign || ""
    };
    v2.assaultApproval = approval;
    return approval;
  };

  proto.v2AssaultApprovalSummary = function v2AssaultApprovalSummary() {
    const approval = this.ensureV2State().assaultApproval;
    if (!approval) return null;
    const now = performance.now();
    return {
      id: approval.id || "",
      status: approval.status || "",
      blocking: Boolean(approval.blocking && approval.status === "pending" && now <= approval.expiresAt),
      objectiveName: approval.objectiveName || "",
      commanderSlotId: approval.commanderSlotId || "",
      squadLeaderId: approval.squadLeaderId || "",
      confidence: Number(approval.confidence || 0),
      remaining: approval.status === "pending" ? Math.max(0, (approval.expiresAt - now) / 1000) : 0
    };
  };

  proto.updateV2RadioReport = function updateV2RadioReport(status = {}, mode = "") {
    if (!status || status.alive <= 0) return null;
    const reasons = uniqueReasons(status.v2FailureReasons || this.v2FailureReasons || []);
    const approval = this.v2AssaultApprovalSummary();
    if (approval?.blocking) {
      return this.recordV2RadioReport({
        ...REPORTS.assaultReady,
        reason: "assaultApproval",
        message: `${REPORTS.assaultReady.message} ${approval.objectiveName}`.trim()
      }, ["assaultApproval"]);
    }

    const report = this.v2ReportFor(status, mode, reasons);
    if (!report) return this.v2?.radioReport || null;
    return this.recordV2RadioReport(report, reasons);
  };

  proto.v2ReportFor = function v2ReportFor(status = {}, mode = "", reasons = []) {
    if (mode === "fallback" || reasons.includes("heavyLosses")) return { ...REPORTS.retreatNeeded, reason: "heavyLosses" };
    for (const reason of [
      "pathBlocked",
      "vehicleTrafficBlocked",
      "noArmorSupport",
      "noReconMark",
      "noCover",
      "highSuppression",
      "noLineOfSight"
    ]) {
      if (reasons.includes(reason)) return { ...REPORTS[reason], reason };
    }
    if (mode === "pre-assault" && Number(status.v2Morale?.assaultConfidence || 0) >= 0.46) {
      return { ...REPORTS.assaultReady, reason: "stagingReady" };
    }
    return null;
  };

  proto.recordV2RadioReport = function recordV2RadioReport(report, reasons = []) {
    if (!report) return null;
    const v2 = this.ensureV2State();
    const now = performance.now();
    const reasonKey = uniqueReasons(reasons).join(",");
    const key = `${report.kind || report.reason || "report"}:${reasonKey}:${this.tacticalMode}`;
    const repeatWindow = report.kind === "assaultReady" ? 2500 : 5200;
    if (v2.radioReportKey === key && now - (v2.lastRadioReportAt || 0) < repeatWindow) return v2.radioReport;

    const event = {
      kind: report.kind || report.reason || "status",
      reason: report.reason || report.kind || "",
      severity: report.severity || "info",
      message: report.message || "",
      at: Date.now(),
      squadId: this.callSign,
      team: this.team,
      tacticalMode: this.tacticalMode,
      commandState: this.commandState,
      commandSource: this.commandSource,
      commanderSlotId: this.commanderSlotId || this.ownerSlotId || "",
      squadLeaderId: this.squadLeaderId || this.leaderUnit?.()?.callSign || "",
      failureReasons: uniqueReasons(reasons)
    };
    v2.radioReport = event;
    v2.radioReportKey = key;
    v2.lastRadioReportAt = now;
    this.v2RadioReport = event;

    this.game.aiObservatory?.recordEvent?.({
      unitId: this.callSign,
      aiType: "squad",
      kind: "squad_radio",
      team: this.team,
      state: this.tacticalMode,
      order: this.order?.objectiveName || this.order?.point?.name || "",
      decision: event.kind,
      reason: event.reason,
      issues: event.failureReasons
    });
    this.game.battlefieldEvents?.push?.({
      type: "squad_radio",
      severity: event.severity,
      team: this.team,
      title: `${this.callSign} ${event.kind}`,
      detail: event.message,
      source: "ai-v2",
      chat: false
    });
    return event;
  };

  proto.__v2FirstPassPatch = true;
})(window);
