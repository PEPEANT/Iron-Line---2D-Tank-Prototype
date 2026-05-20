"use strict";

function createAdminSnapshot(registry, options = {}) {
  const rooms = registry.listRooms();
  const activeRoomId = options.roomId || rooms[0]?.roomId || "local";
  const observer = registry.snapshot(activeRoomId);
  const totals = rooms.reduce((acc, room) => {
    acc.clients += room.clients;
    acc.players += room.players;
    acc.spectators += room.spectators || 0;
    acc.humanSlots += room.humanSlots;
    acc.aiSlots += room.aiSlots;
    return acc;
  }, { clients: 0, players: 0, spectators: 0, humanSlots: 0, aiSlots: 0 });

  return {
    serverTime: new Date().toISOString(),
    roomCount: rooms.length,
    clientCount: totals.clients,
    playerCount: totals.players,
    spectatorCount: totals.spectators,
    humanSlots: totals.humanSlots,
    aiSlots: totals.aiSlots,
    rooms,
    observer
  };
}

module.exports = { createAdminSnapshot };
