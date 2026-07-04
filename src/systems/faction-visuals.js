"use strict";

(function registerFactionVisuals(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants;

  const DEFAULT_FACTIONS = {
    blue: "korea",
    red: "russia"
  };

  function validFactionId(id, fallback) {
    return IronLine.playerFactionById?.(id)?.id || IronLine.playerSkinById?.(id)?.id || fallback;
  }

  function factionIdForTeam(game, team) {
    if (team === TEAM.RED) {
      if (game?.sessionMode !== "online") {
        return validFactionId(game?.matchConfig?.redFactionId || game?.onlineSession?.redFactionId, DEFAULT_FACTIONS.red);
      }
      return validFactionId(game?.onlineSession?.redFactionId, DEFAULT_FACTIONS.red);
    }

    if (team === TEAM.BLUE) {
      const localFaction = game?.localProfile?.factionId || game?.localProfile?.skinId;
      if (game?.sessionMode === "online") {
        return validFactionId(game?.onlineSession?.blueFactionId, DEFAULT_FACTIONS.blue);
      }
      return validFactionId(game?.matchConfig?.blueFactionId || localFaction, DEFAULT_FACTIONS.blue);
    }

    return DEFAULT_FACTIONS.blue;
  }

  function factionForId(id, fallbackId = DEFAULT_FACTIONS.blue) {
    return IronLine.playerFactionById?.(id) ||
      IronLine.playerSkinById?.(id) ||
      IronLine.playerFactionById?.(fallbackId) ||
      null;
  }

  function factionForUnit(game, unit) {
    const fallbackId = factionIdForTeam(game, unit?.team);
    const teamFactionOverrides = game?.sessionMode === "online" ||
      (game?.sessionMode !== "online" && unit?.team === TEAM.BLUE);
    const explicitId = teamFactionOverrides ? "" : (unit?.factionId || unit?.skinId);
    return factionForId(explicitId || fallbackId, fallbackId);
  }

  function factionIdForUnit(game, unit) {
    return factionForUnit(game, unit)?.id || factionIdForTeam(game, unit?.team);
  }

  function syncEntity(game, entity) {
    if (!entity) return entity;
    const factionId = factionIdForUnit(game, entity);
    entity.factionId = factionId;
    entity.skinId = factionId;
    return entity;
  }

  function syncGame(game) {
    if (!game) return;
    syncEntity(game, game.player);
    syncEntity(game, game.playerTank);
    for (const unit of game.infantry || []) syncEntity(game, unit);
    for (const crew of game.crews || []) syncEntity(game, crew);
    for (const tank of game.tanks || []) syncEntity(game, tank);
    for (const humvee of game.humvees || []) syncEntity(game, humvee);
  }

  function vehiclePalette(game, entity, fallback) {
    const faction = factionForUnit(game, entity);
    if (!faction) return fallback;
    return {
      hullColor: faction.cloth || fallback.hullColor,
      darkColor: faction.clothDark || fallback.darkColor,
      lightColor: faction.vest || fallback.lightColor,
      turretColor: faction.helmet || faction.vest || fallback.turretColor,
      accentColor: faction.accent || fallback.accentColor
    };
  }

  IronLine.factionVisuals = {
    factionIdForTeam,
    factionForUnit,
    factionIdForUnit,
    syncEntity,
    syncGame,
    vehiclePalette
  };
})(window);
