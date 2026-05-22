"use strict";

(function registerAiScaleReadiness(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { distXY } = IronLine.math;

  const PROFILES = [
    {
      id: "ai-8v8",
      label: "8vs8 AI",
      stage: 1,
      eventOnly: false,
      config: { blueInfantry: 8, redInfantry: 8, blueAiTanks: 1, redTanks: 1 },
      budget: { fpsMin: 45, frameMsMax: 26, aiMsMax: 12, tacticalMapMsMax: 16, renderMsMax: 18, snapshotBytesMax: 220000 }
    },
    {
      id: "ai-15v15",
      label: "15vs15 AI",
      stage: 2,
      eventOnly: false,
      config: { blueInfantry: 15, redInfantry: 15, blueAiTanks: 2, redTanks: 2 },
      budget: { fpsMin: 42, frameMsMax: 30, aiMsMax: 16, tacticalMapMsMax: 18, renderMsMax: 20, snapshotBytesMax: 280000 }
    },
    {
      id: "ai-25v25",
      label: "25vs25 AI",
      stage: 3,
      eventOnly: false,
      config: { blueInfantry: 25, redInfantry: 25, blueAiTanks: 3, redTanks: 3 },
      budget: { fpsMin: 36, frameMsMax: 34, aiMsMax: 22, tacticalMapMsMax: 24, renderMsMax: 24, snapshotBytesMax: 360000 }
    },
    {
      id: "ai-50v50-event",
      label: "50vs50 AI Event",
      stage: 4,
      eventOnly: true,
      config: { blueInfantry: 50, redInfantry: 50, blueAiTanks: 5, redTanks: 5 },
      budget: { fpsMin: 30, frameMsMax: 40, aiMsMax: 32, tacticalMapMsMax: 34, renderMsMax: 30, snapshotBytesMax: 520000 }
    }
  ];

  const LOD_RULES = {
    detailed: { updateRateMs: 100, reason: "on-screen or actively engaged" },
    normal: { updateRateMs: 250, reason: "near camera, ordered, or near objective" },
    reduced: { updateRateMs: 500, reason: "far off-screen and not engaged" },
    idle: { updateRateMs: 1000, reason: "dead, mounted, or waiting without contact" }
  };

  class AIScaleReadiness {
    constructor(game) {
      this.game = game;
    }

    profiles() {
      return PROFILES.map((profile) => ({ ...profile, config: { ...profile.config }, budget: { ...profile.budget } }));
    }

    profile(id = "ai-8v8") {
      return this.profiles().find((profile) => profile.id === id) || this.profiles()[0];
    }

    applyProfile(id = "ai-8v8") {
      const profile = this.profile(id);
      if (!this.game || this.game.matchStarted || this.game.countdownStarted) {
        return { accepted: false, reason: "match-active", profile };
      }
      this.game.matchConfig = {
        ...(this.game.matchConfig || this.game.defaultMatchConfig?.() || {}),
        ...profile.config,
        aiDensityPreset: profile.id
      };
      this.game.resetScenarioForMatch?.();
      return { accepted: true, reason: "", profile };
    }

    snapshot(options = {}) {
      return AIScaleReadiness.snapshot(this.game, options);
    }

    evaluate(profileId = this.game?.matchConfig?.aiDensityPreset || "ai-8v8", options = {}) {
      return AIScaleReadiness.evaluate(this.snapshot(options), this.profile(profileId));
    }

    static profiles() {
      return PROFILES.map((profile) => ({ ...profile, config: { ...profile.config }, budget: { ...profile.budget } }));
    }

    static profile(id = "ai-8v8") {
      return AIScaleReadiness.profiles().find((profile) => profile.id === id) || AIScaleReadiness.profiles()[0];
    }

    static snapshot(game, options = {}) {
      const samples = game?.perfMonitor?.samples || {};
      const sample = (key) => Number(samples[key]) || 0;
      const counts = AIScaleReadiness.counts(game);
      const lod = AIScaleReadiness.lodSummary(game);
      const memory = AIScaleReadiness.memorySnapshot();
      const networkSnapshotBytes = options.includeNetwork === false
        ? null
        : AIScaleReadiness.estimateObserverSnapshotBytes(game);
      const tacticalMapMs = sample("ai.tacticalMap");
      const observerMs = sample("ai.observer");
      const aiMs = sample("ai.commanders") + sample("ai.squads") + sample("ai.infantry") +
        sample("vehicles") + sample("drones");
      const structuralAiMs = tacticalMapMs + observerMs;
      const pathfindingAndMovementMs = sample("ai.squads") + sample("ai.infantry") + sample("vehicles");

      return {
        profileId: game?.matchConfig?.aiDensityPreset || "custom",
        matchStarted: Boolean(game?.matchStarted),
        counts,
        performance: {
          fps: sample("fps"),
          frameMs: sample("frame"),
          updateMs: sample("update"),
          aiMs,
          structuralAiMs,
          pathfindingAndMovementMs,
          renderMs: sample("render"),
          tacticalMapMs,
          commandersMs: sample("ai.commanders"),
          squadsMs: sample("ai.squads"),
          infantryMs: sample("ai.infantry"),
          vehiclesMs: sample("vehicles"),
          dronesMs: sample("drones"),
          observerMs,
          networkSnapshotBytes,
          memory
        },
        stateSummary: AIScaleReadiness.stateSummary(game),
        lod,
        lodRules: LOD_RULES,
        snapshotPolicy: {
          sendFullUnitDetailEveryTick: false,
          preferredPayload: ["squad summary", "vehicle summary", "drone summary", "commandState", "position", "hp", "major events"],
          avoid: ["per-frame full AI internals", "all unit debug fields", "full tactical map node list"]
        },
        scaleStages: AIScaleReadiness.profiles()
      };
    }

    static evaluate(snapshot, profile = AIScaleReadiness.profile("ai-8v8")) {
      const budget = profile.budget || {};
      const perf = snapshot?.performance || {};
      const checks = [
        { key: "fps", label: "FPS", value: perf.fps, pass: !budget.fpsMin || perf.fps >= budget.fpsMin, budget: `>=${budget.fpsMin}` },
        { key: "frameMs", label: "Frame time", value: perf.frameMs, pass: !budget.frameMsMax || perf.frameMs <= budget.frameMsMax, budget: `<=${budget.frameMsMax}ms` },
        { key: "aiMs", label: "Active AI update time", value: perf.aiMs, pass: !budget.aiMsMax || perf.aiMs <= budget.aiMsMax, budget: `<=${budget.aiMsMax}ms` },
        { key: "tacticalMapMs", label: "Tactical map structural time", value: perf.tacticalMapMs, pass: !budget.tacticalMapMsMax || perf.tacticalMapMs <= budget.tacticalMapMsMax, budget: `<=${budget.tacticalMapMsMax}ms` },
        { key: "renderMs", label: "Render time", value: perf.renderMs, pass: !budget.renderMsMax || perf.renderMs <= budget.renderMsMax, budget: `<=${budget.renderMsMax}ms` },
        {
          key: "networkSnapshotBytes",
          label: "Observer snapshot size",
          value: perf.networkSnapshotBytes,
          pass: perf.networkSnapshotBytes === null || !budget.snapshotBytesMax || perf.networkSnapshotBytes <= budget.snapshotBytesMax,
          budget: `<=${budget.snapshotBytesMax} bytes`
        }
      ];
      return {
        profileId: profile.id,
        label: profile.label,
        eventOnly: Boolean(profile.eventOnly),
        pass: checks.every((check) => check.pass),
        checks
      };
    }

    static counts(game) {
      const infantry = (game?.infantry || []).filter((unit) => unit.alive).length;
      const tanks = (game?.tanks || []).filter((tank) => tank.alive).length;
      const humvees = (game?.humvees || []).filter((vehicle) => vehicle.alive).length;
      const drones = (game?.drones || []).filter((drone) => drone.alive !== false && drone.destroyed !== true).length;
      return {
        infantry,
        squads: (game?.squads || []).length,
        tanks,
        humvees,
        vehicles: tanks + humvees,
        drones,
        totalAiActors: infantry + tanks + humvees + drones
      };
    }

    static stateSummary(game) {
      const now = global.performance?.now?.() || 0;
      const squads = game?.squads || [];
      const infantry = game?.infantry || [];
      const vehicles = [
        ...(game?.tanks || []),
        ...(game?.humvees || [])
      ].filter((vehicle) => vehicle?.alive !== false);
      const activeState = (state) => Boolean(state && state !== "idle");
      const vehicleOrder = (vehicle) => game?.commanders?.[vehicle.team]?.assignments?.get?.(vehicle) || vehicle.manualOrder || null;
      const stuckOf = (unit) => Number(unit?.ai?.debug?.stuckTimer || unit?.debug?.stuckTimer || unit?.ai?.stuckTimer || 0);
      const vehicleDebug = (vehicle) => vehicle?.ai?.debug || {};
      const actors = [
        ...infantry,
        ...vehicles,
        ...(game?.drones || []).filter((drone) => drone?.alive !== false && drone?.destroyed !== true)
      ];

      return {
        commandedSquads: squads.filter((squad) => activeState(squad.commandState) || squad.manualOrder).length,
        commandLockedSquads: squads.filter((squad) => Number(squad.commandLockUntil || 0) > now).length,
        commandedVehicles: vehicles.filter((vehicle) => vehicleOrder(vehicle)).length,
        commandLockedVehicles: vehicles.filter((vehicle) => Number(vehicleOrder(vehicle)?.commandLockUntil || 0) > now).length,
        stuckInfantry: infantry.filter((unit) => stuckOf(unit) > 1.4).length,
        stuckVehicles: vehicles.filter((vehicle) => Number(vehicleDebug(vehicle).stuckTimer || 0) > 1.4).length,
        trafficHoldingVehicles: vehicles.filter((vehicle) => Number(vehicleDebug(vehicle).trafficHoldTimer || 0) > 0).length,
        trafficHintVehicles: vehicles.filter((vehicle) => Boolean(vehicleDebug(vehicle).tacticalTrafficHint)).length,
        lodThrottledActors: actors.filter((actor) => Number(actor.aiLod?.updateRateMs || 100) > 100).length,
        lodSkippedActors: actors.filter((actor) => actor.aiLod?.skipped).length,
        lodDetailedActors: actors.filter((actor) => actor.aiLod?.lod === "detailed").length,
        lodReducedActors: actors.filter((actor) => actor.aiLod?.lod === "reduced" || actor.aiLod?.lod === "idle").length,
        waitOrBlockedVehicles: vehicles.filter((vehicle) => {
          const debug = vehicleDebug(vehicle);
          const state = String(debug.state || vehicle.ai?.state || "");
          return Number(debug.trafficHoldTimer || 0) > 0 ||
            Number(debug.stuckTimer || 0) > 1.4 ||
            state.includes("wait") ||
            state.includes("hold") ||
            state.includes("blocked");
        }).length
      };
    }

    static lodSummary(game) {
      const summary = {
        detailed: 0,
        normal: 0,
        reduced: 0,
        idle: 0,
        samples: []
      };
      const actors = [
        ...(game?.infantry || []),
        ...(game?.tanks || []),
        ...(game?.humvees || []),
        ...(game?.drones || [])
      ];
      for (const actor of actors) {
        const item = AIScaleReadiness.classifyActor(game, actor);
        summary[item.lod] = (summary[item.lod] || 0) + 1;
        if (summary.samples.length < 12) summary.samples.push(item);
      }
      return summary;
    }

    static classifyActor(game, actor) {
      if (!actor || actor.alive === false || actor.destroyed === true) {
        return { id: actor?.callSign || actor?.id || "", lod: "idle", reason: "not-active", updateRateMs: LOD_RULES.idle.updateRateMs };
      }
      const camera = game?.camera || {};
      const margin = 180;
      const viewWidth = camera.viewWidth || global.innerWidth || 1280;
      const viewHeight = camera.viewHeight || global.innerHeight || 720;
      const onScreen = actor.x >= (camera.x || 0) - margin &&
        actor.y >= (camera.y || 0) - margin &&
        actor.x <= (camera.x || 0) + viewWidth + margin &&
        actor.y <= (camera.y || 0) + viewHeight + margin;
      const player = game?.player || null;
      const distanceToPlayer = player ? distXY(actor.x, actor.y, player.x, player.y) : Infinity;
      const squadCommanded = Boolean(actor.squad?.manualOrder || (actor.squad?.commandState && actor.squad.commandState !== "idle"));
      const ordered = Boolean(actor.commandState || actor.manualOrder || squadCommanded);
      const engaged = Boolean(actor.ai?.target || actor.target || actor.suppressed || actor.lastThreat);

      if (onScreen || engaged || distanceToPlayer <= 720) {
        return { id: actor.callSign || actor.id || "", lod: "detailed", reason: onScreen ? "on-screen" : engaged ? "engaged" : "near-player", updateRateMs: LOD_RULES.detailed.updateRateMs };
      }
      if (ordered || distanceToPlayer <= 1550 || AIScaleReadiness.nearObjective(game, actor)) {
        return { id: actor.callSign || actor.id || "", lod: "normal", reason: ordered ? "ordered-offscreen" : "near-front", updateRateMs: LOD_RULES.normal.updateRateMs };
      }
      return { id: actor.callSign || actor.id || "", lod: "reduced", reason: "far-offscreen", updateRateMs: LOD_RULES.reduced.updateRateMs };
    }

    static nearObjective(game, actor) {
      return (game?.capturePoints || []).some((point) => distXY(actor.x, actor.y, point.x, point.y) <= 520);
    }

    static estimateObserverSnapshotBytes(game) {
      try {
        const snapshot = game?.observerBridge?.createSnapshot?.();
        if (!snapshot) return null;
        return JSON.stringify(snapshot).length;
      } catch (_error) {
        return null;
      }
    }

    static memorySnapshot() {
      const memory = global.performance?.memory;
      if (!memory) return { available: false };
      return {
        available: true,
        usedJSHeapSize: memory.usedJSHeapSize || 0,
        totalJSHeapSize: memory.totalJSHeapSize || 0,
        jsHeapSizeLimit: memory.jsHeapSizeLimit || 0
      };
    }
  }

  IronLine.AIScaleReadiness = AIScaleReadiness;
})(window);
