"use strict";

function createRoomDetailExporters(exportClientRoom) {
  function exportRoomSummary(room) {
    const full = exportClientRoom(room);
    const slim = (item) => item ? ({
      id: item.id,
      name: item.name,
      team: item.team,
      slotId: item.slotId,
      participantType: item.participantType,
      ready: item.ready,
      host: item.host,
      updatedAt: item.updatedAt
    }) : null;
    const { moderation, commandAuthorities, commandAuthorityRequests, chat, events, commands, combatEvents, worldState, ...summary } = full;
    return {
      ...summary,
      summary: true,
      players: full.players.map(slim).filter(Boolean),
      spectators: full.spectators.map(slim).filter(Boolean),
      admins: full.admins.map(slim).filter(Boolean),
      playerCount: full.players.length,
      spectatorCount: full.spectators.length,
      adminCount: full.admins.length,
      chatCount: full.chat.length,
      eventCount: full.events.length,
      commandCount: full.commands.length,
      combatEventCount: full.combatEvents.length,
      worldStateUpdatedAt: full.worldState?.updatedAt || 0
    };
  }

  function combatEventSeq(event = {}) {
    return Math.max(0, Math.floor(Number(event.serverSeq || event.combatServerSeq || event.sequence) || 0));
  }

  function detailCursors(room = {}) {
    const combatEvents = Array.isArray(room.combatEvents) ? room.combatEvents : [];
    const latestCombatSeq = combatEvents.reduce((max, event) => Math.max(max, combatEventSeq(event)), Math.max(0, Math.floor(Number(room.combatServerSeq) || 0)));
    return {
      combatServerSeq: latestCombatSeq,
      worldStateUpdatedAt: Math.max(0, Math.floor(Number(room.worldState?.updatedAt) || 0)),
      chatUpdatedAt: room.chat?.length ? Math.max(...room.chat.map((item) => Number(item.createdAt || item.updatedAt) || 0)) : 0,
      eventsUpdatedAt: room.events?.length ? Math.max(...room.events.map((item) => Number(item.createdAt || item.updatedAt) || 0)) : 0,
      commandsUpdatedAt: room.commands?.length ? Math.max(...room.commands.map((item) => Number(item.issuedAt || item.createdAt || item.updatedAt) || 0)) : 0
    };
  }

  function exportClientRoomDetail(room, options = {}) {
    const full = exportClientRoom(room);
    const cursors = detailCursors(full);
    if (!options.delta || options.view !== "player") return { room: full, cursors };
    const combatAfter = Math.max(0, Math.floor(Number(options.combatAfter) || 0));
    const worldStateAfter = Math.max(0, Math.floor(Number(options.worldStateAfter) || 0));
    const events = Array.isArray(full.combatEvents) ? full.combatEvents : [];
    const hasCursor = combatAfter > 0;
    const cursorTooOld = hasCursor && events.length > 0 && combatAfter < combatEventSeq(events[0]);
    return {
      room: {
        ...full,
        detailDelta: true,
        combatEvents: !hasCursor || cursorTooOld ? events.slice(-24) : events.filter((event) => combatEventSeq(event) > combatAfter),
        worldState: full.worldState && Number(full.worldState.updatedAt || 0) > worldStateAfter ? full.worldState : null,
        worldStateUpdatedAt: cursors.worldStateUpdatedAt
      },
      cursors
    };
  }

  return {
    exportClientRoomDetail,
    exportRoomSummary
  };
}

module.exports = {
  createRoomDetailExporters
};
