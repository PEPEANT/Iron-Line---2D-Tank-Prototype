"use strict";

(function registerCommanderPresence(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const CommanderAI = IronLine.CommanderAI;
  const { TEAM } = IronLine.constants || {};
  const { distXY } = IronLine.math || {};

  if (!CommanderAI || CommanderAI.prototype.commanderPresenceInstalled) return;

  const proto = CommanderAI.prototype;
  const baseUpdate = proto.update;
  const baseRebuildInfantryAssignments = proto.rebuildInfantryAssignments;

  function nowMs() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }

  function nowSeconds() {
    return nowMs() / 1000;
  }

  function localTeam(game) {
    return game?.localPlayerTeam?.() ||
      game?.localSessionPlayer?.()?.team ||
      game?.player?.team ||
      TEAM?.BLUE ||
      "blue";
  }

  function squadKey(squad) {
    return squad?.callSign || squad?.id || "squad";
  }

  function orderTargetName(order) {
    return order?.objectiveName || order?.point?.name || "";
  }

  function objectiveLabel(order) {
    const name = orderTargetName(order) || "목표";
    return name.length === 1 ? `${name}거점` : name;
  }

  function actionLabel(order, options = {}) {
    if (options.action) return options.action;
    if (order?.role === "hold" || order?.stance === "hold") return "사수";
    if (order?.role === "support" || order?.stance === "overwatch") return "화력지원";
    if (order?.role === "transport" || order?.role === "escort") return "기동지원";
    if (order?.role === "recon") return "정찰";
    if (order?.stance === "assault") return "돌격";
    return "공세";
  }

  function activeUnitsOf(squad) {
    return squad?.activeUnits?.() || [];
  }

  function pointDistance(squad, point) {
    if (!point) return Infinity;
    if (squad?.distanceTo) return squad.distanceTo(point);
    const units = activeUnitsOf(squad);
    if (!units.length) return Infinity;
    const total = units.reduce((sum, unit) => sum + distXY(unit.x, unit.y, point.x, point.y), 0);
    return total / units.length;
  }

  function playerSquadIds(game) {
    const ids = new Set();
    const player = game?.player || null;
    const local = game?.localSessionPlayer?.() || null;
    const slot = local?.slotId ? game?.sessionSlotById?.(local.slotId) : null;
    for (const id of [player?.squadId, player?.squad?.callSign, local?.squadId]) {
      if (id) ids.add(id);
    }
    for (const id of slot?.squadIds || []) ids.add(id);
    return ids;
  }

  function isLocalPlayerSquad(game, squad) {
    const ids = playerSquadIds(game);
    if (ids.has(squadKey(squad))) return true;
    const player = game?.player || null;
    return Boolean(player && activeUnitsOf(squad).includes(player));
  }

  function squadLabel(game, squad) {
    if (isLocalPlayerSquad(game, squad)) return "★내 분대";
    return squadKey(squad);
  }

  Object.defineProperty(proto, "commanderPresenceInstalled", { value: true });

  proto.update = function updateWithCommanderPresence(dt) {
    const result = baseUpdate.call(this, dt);
    this.commanderPresenceMaybeReassault(Number(dt) || 0);
    return result;
  };

  proto.rebuildInfantryAssignments = function rebuildInfantryAssignmentsWithPresence(...args) {
    const result = baseRebuildInfantryAssignments.apply(this, args);
    this.commanderPresenceReportSquadOrders();
    return result;
  };

  proto.commanderPresenceReportSquadOrders = function commanderPresenceReportSquadOrders() {
    for (const [squad, order] of this.squadAssignments || []) {
      this.commanderPresenceEmitSquadOrder(squad, order);
    }
  };

  proto.commanderPresenceEmitSquadOrder = function commanderPresenceEmitSquadOrder(squad, order, options = {}) {
    if (!squad || !order?.point || !this.game?.battlefieldEvents?.push) return false;
    if (this.team !== localTeam(this.game)) return false;

    const target = orderTargetName(order);
    const key = `${squadKey(squad)}:${target}`;
    if (!options.force && this.commanderPresenceLastOrderKey?.get(squadKey(squad)) === key) return false;

    const now = Date.now();
    this.commanderPresenceLastOrderKey = this.commanderPresenceLastOrderKey || new Map();
    this.commanderPresenceRateLog = (this.commanderPresenceRateLog || []).filter((time) => now - time < 60000);
    if (this.commanderPresenceRateLog.length >= 6) return false;

    this.commanderPresenceLastOrderKey.set(squadKey(squad), key);
    this.commanderPresenceRateLog.push(now);

    const detail = `[지휘] ${squadLabel(this.game, squad)} -> ${objectiveLabel(order)} ${actionLabel(order, options)}`;
    this.game.battlefieldEvents.push({
      id: `commander-order:${this.team}:${squadKey(squad)}:${target}:${Math.floor(now / 1000)}`,
      type: "commander_order",
      severity: options.severity || "info",
      team: this.team,
      title: "지휘 명령",
      detail,
      source: "commander"
    });
    return true;
  };

  proto.commanderPresenceMaybeReassault = function commanderPresenceMaybeReassault(dt) {
    this.commanderPresenceReassaultTimer = (this.commanderPresenceReassaultTimer || 0) + Math.max(0, dt);
    if (this.commanderPresenceReassaultTimer < 15) return null;
    this.commanderPresenceReassaultTimer = 0;

    const target = this.commanderPresenceNextUnownedObjective();
    if (!target) return null;
    if (!this.commanderPresenceHasInfantryAdvantage()) return null;
    if (this.commanderPresenceHadRecentTeamDeath(10)) return null;

    const squad = this.commanderPresencePickHoldSquad(target);
    if (!squad) return null;

    const order = this.createOrder(target, {
      id: `${this.team}:reassault:${target.name}:${squadKey(squad)}:${Math.floor(nowSeconds() / 15)}`,
      role: "infantry",
      stance: "advance",
      priority: -4,
      slotIndex: 0,
      slotCount: 1
    });
    order.commandType = "assault";
    order.commandReason = "reassault";

    this.squadAssignments.set(squad, order);
    squad.assignOrder?.(order);
    for (const unit of activeUnitsOf(squad)) {
      const unitOrder = squad.getOrderFor?.(unit) || order;
      this.infantryAssignments.set(unit, unitOrder);
    }
    this.commanderPresenceEmitSquadOrder(squad, order, { force: true, action: "공세 재개", severity: "major" });
    return order;
  };

  proto.commanderPresenceNextUnownedObjective = function commanderPresenceNextUnownedObjective() {
    const seen = new Set();
    const ordered = (this.objectiveOrder || [])
      .map((name) => (this.game?.capturePoints || []).find((point) => point.name === name))
      .filter((point) => {
        if (!point || seen.has(point.name)) return false;
        seen.add(point.name);
        return true;
      });
    const rest = (this.game?.capturePoints || []).filter((point) => point && !seen.has(point.name));
    return ordered.concat(rest).find((point) => point.owner !== this.team) || null;
  };

  proto.commanderPresenceHasInfantryAdvantage = function commanderPresenceHasInfantryAdvantage() {
    const friendly = this.commanderPresenceAliveInfantry(this.team);
    const enemyTeam = this.team === TEAM?.RED ? TEAM?.BLUE : TEAM?.RED;
    const enemy = this.commanderPresenceAliveInfantry(enemyTeam);
    return friendly >= Math.max(1, enemy) * 1.4;
  };

  proto.commanderPresenceAliveInfantry = function commanderPresenceAliveInfantry(team) {
    return (this.game?.infantry || []).filter((unit) => unit?.alive && unit.team === team).length;
  };

  proto.commanderPresenceHadRecentTeamDeath = function commanderPresenceHadRecentTeamDeath(seconds) {
    const now = nowSeconds();
    return (this.game?.infantry || []).some((unit) => (
      unit?.team === this.team &&
      unit.alive === false &&
      Number.isFinite(unit.deathTime) &&
      unit.deathTime > 0 &&
      now - unit.deathTime <= seconds
    ));
  };

  proto.commanderPresencePickHoldSquad = function commanderPresencePickHoldSquad(target) {
    const candidates = (this.game?.squads || [])
      .filter((squad) => (
        squad?.team === this.team &&
        activeUnitsOf(squad).length > 0 &&
        !this.isManualSquad?.(squad)
      ))
      .map((squad) => ({ squad, order: this.squadAssignments?.get(squad) || squad.order || null }))
      .filter(({ squad, order }) => (
        order?.role === "hold" ||
        order?.stance === "hold" ||
        String(squad?.tacticalMode || "").startsWith("hold")
      ))
      .sort((a, b) => pointDistance(a.squad, target) - pointDistance(b.squad, target));
    return candidates[0]?.squad || null;
  };
})(window);
