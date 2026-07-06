"use strict";

(function registerOnlineRoomActions(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  function createOnlineRoom(flow, settings = {}) {
    const game = flow.game?.();
    if (!game || !flow.registry) return false;
    const match = game.matchConfig || game.defaultMatchConfig?.() || {};
    const profile = game.localProfile || {};
    const hostId = profile.playerId || game.onlineSession?.playerId || `host-${Date.now().toString(36)}`;
    const room = flow.registry.createRoom({
      name: settings.name || "온라인 방",
      mode: settings.mode || match.mode || "annihilation",
      blueFactionId: match.blueFactionId || profile.factionId || profile.skinId || "korea",
      redFactionId: match.redFactionId || "russia",
      difficulty: settings.difficulty || match.difficulty || "normal",
      aiDensityPreset: settings.aiDensityPreset || match.aiDensityPreset || "custom",
      blueAiTanks: settings.blueAiTanks ?? match.blueAiTanks,
      blueInfantry: settings.blueInfantry ?? match.blueInfantry,
      redTanks: settings.redTanks ?? match.redTanks,
      redInfantry: settings.redInfantry ?? match.redInfantry,
      aiFillEmptySlots: settings.aiFillEmptySlots !== false,
      capacity: settings.capacity ?? 8,
      spectatorCapacity: settings.spectatorCapacity ?? 0,
      createdBy: hostId,
      hostId
    });
    if (!room) return false;
    return flow.openLobby?.({ host: true, roomId: room.id, room, participantType: "player" }) || false;
  }

  function isRoomHost(flow, game = flow.game?.(), room = null) {
    const session = game?.onlineSession || {};
    const playerId = String(session.playerId || game?.localProfile?.playerId || "");
    if (!playerId) return false;
    const currentRoom = room || flow.registry?.getRoom?.(session.roomId || "") || null;
    const player = game?.localSessionPlayer?.();
    return Boolean(
      player?.host ||
      session.hostId === playerId ||
      currentRoom?.createdBy === playerId ||
      (currentRoom?.admins || []).some((admin) => admin.id === playerId)
    );
  }

  function startOnlineRoom(flow, game = flow.game?.()) {
    if (!game?.onlineSession?.roomId || !flow.registry) return false;
    const room = flow.registry.getRoom(game.onlineSession.roomId);
    if (!isRoomHost(flow, game, room)) return false;
    const started = flow.registry.startRoom(game.onlineSession.roomId, game.onlineSession.playerId);
    if (!started) return false;
    return game.beginDeploymentCountdown?.({ room: started, startedAt: started.startedAt }) || false;
  }

  function endOnlineRoom(flow, game = flow.game?.()) {
    if (!game?.onlineSession?.roomId || !flow.registry) return false;
    const roomId = game.onlineSession.roomId;
    const room = flow.registry.getRoom(roomId);
    if (!isRoomHost(flow, game, room)) return false;
    flow.registry.endRoom(roomId);
    flow.leaveOnlineRoom?.(game, "room_end");
    game.matchStarted = false;
    game.countdownStarted = false;
    game.roomListOpen = true;
    game.lobbyOpen = true;
    game.entryOpen = false;
    game.deploymentOpen = false;
    game.matchPhase = "rooms";
    game.hud?.update?.(game);
    return true;
  }

  IronLine.OnlineRoomActions = {
    createOnlineRoom,
    isRoomHost,
    startOnlineRoom,
    endOnlineRoom
  };
})(window);
