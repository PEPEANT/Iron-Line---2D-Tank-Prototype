"use strict";

(function registerSessionFlow(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants;

  class SessionFlow {
    constructor(hud) {
      this.hud = hud;
      this.registry = IronLine.roomRegistry || null;
      this.offline = IronLine.OfflineSetup ? new IronLine.OfflineSetup(this) : null;
      this.rooms = IronLine.RoomList ? new IronLine.RoomList(this) : null;
      this.onlineLobby = IronLine.OnlineLobby ? new IronLine.OnlineLobby(this) : null;
    }

    game() {
      return IronLine.game || null;
    }

    update(game) {
      if (!game.sessionMode) game.sessionMode = "offline";
      game.roomListOpen = Boolean(game.roomListOpen);
      this.syncCurrentRoom(game);
      this.rooms?.update(game);
      this.onlineLobby?.update(game);
      document.body.classList.toggle("session-online", game.sessionMode === "online");
      document.body.classList.toggle("session-offline", game.sessionMode !== "online");
    }

    submitEntry(mode, profile) {
      return mode === "online" ? this.enterOnline(profile) : this.offline?.enter(profile);
    }

    enterOnline(profile) {
      const game = this.game();
      if (!game) return false;
      game.setLocalProfile?.(profile);
      game.sessionMode = "online";
      game.entryOpen = false;
      game.deploymentOpen = false;
      game.lobbyOpen = true;
      game.roomListOpen = true;
      game.matchPhase = "rooms";
      game.matchConfig.mode = "conquest";
      game.conquest = game.defaultConquestState?.() || game.conquest;
      if (game.onlineSession) game.onlineSession.roomId = "";
      this.prepareOnlineSession(game, { host: false });
      game.hud?.update?.(game);
      return true;
    }

    createOnlineRoom() {
      return false;
    }

    joinOnlineRoom(room) {
      const selected = room?.id ? this.registry?.selectRoom?.(room.id) || room : room;
      return this.openLobby({ host: false, roomId: selected?.id || room?.id || "", room: selected || room });
    }

    openLobby(options = {}) {
      const game = this.game();
      if (!game) return false;
      game.sessionMode = "online";
      game.roomListOpen = false;
      game.entryOpen = false;
      game.deploymentOpen = false;
      game.lobbyOpen = true;
      game.matchPhase = "lobby";
      game.matchConfig.mode = options.room?.mode || "conquest";
      game.conquest = game.defaultConquestState?.() || game.conquest;
      this.prepareOnlineSession(game, options);
      game.resetScenarioForMatch?.();
      game.syncOnlineSlotAssets?.();
      if (game.isLocalSpectator?.() && options.room?.phase === "playing") {
        game.enterSpectatorMode?.({ roomId: game.onlineSession?.roomId, participantType: game.onlineSession?.participantType || "spectator" });
      }
      game.hud?.invalidateDeploymentMap?.();
      game.hud?.update?.(game);
      game.canvas?.focus?.();
      return true;
    }

    backToEntry() {
      const game = this.game();
      if (!game) return false;
      game.entryOpen = true;
      game.deploymentOpen = false;
      game.lobbyOpen = false;
      game.roomListOpen = false;
      game.matchPhase = "entry";
      game.hud?.update?.(game);
      return true;
    }

    startFromDeployment(game) {
      return this.offline?.startBattle(game) || false;
    }

    backFromLobby(game) {
      if (game.sessionMode !== "online" || game.matchStarted || game.countdownStarted) return false;
      game.roomListOpen = true;
      game.lobbyOpen = true;
      game.deploymentOpen = false;
      game.matchPhase = "rooms";
      game.onlineSession.localReady = false;
      for (const player of game.onlineSession.players || []) player.ready = false;
      game.hud?.update?.(game);
      return true;
    }

    prepareOnlineSession(game, options = {}) {
      const session = game.onlineSession || (game.onlineSession = {});
      const player = game.localSessionPlayer?.() || session.players?.[0];
      const room = options.room || this.registry?.getRoom?.(options.roomId) || null;
      const participantType = this.resolveParticipantType(room, options);
      session.roomId = options.roomId || room?.id || session.roomId || "";
      session.playerId = game.localProfile?.playerId || session.playerId;
      session.hostId = options.host ? session.playerId : room?.createdBy || "admin";
      session.participantType = participantType;
      session.localReady = false;
      session.joinLocked = Boolean(room?.locked);
      session.allowMidMatchJoin = false;
      session.aiFillEmptySlots = room?.aiFillEmptySlots ?? session.aiFillEmptySlots !== false;
      session.spectators = Array.isArray(room?.spectators) ? room.spectators.slice() : [];
      session.blueFactionId = room?.blueFactionId || session.blueFactionId || "korea";
      session.redFactionId = room?.redFactionId || session.redFactionId || "russia";
      if (player) {
        player.host = options.host === true && participantType === "player";
        player.participantType = participantType;
        player.team = participantType === "player" ? (player.team || TEAM.BLUE) : "";
        player.slotId = participantType === "player" ? player.slotId : "";
        player.roleId = participantType === "player" ? player.roleId : "spectator";
        player.role = participantType === "player" ? player.role : "spectator";
        player.ready = false;
      }
      if (participantType === "player") {
        game.assignPlayerToSlot?.(session.playerId, player?.slotId || "blue-infantry");
        this.applyRoomFactionToLocalPlayer(game);
      } else {
        for (const slot of session.roleSlots || []) {
          if (slot.playerId === session.playerId) {
            slot.playerId = null;
            slot.aiControlled = true;
          }
        }
      }
      this.publishLocalPlayer(game);
    }

    resolveParticipantType(room, options = {}) {
      if (["spectator", "caster", "admin"].includes(options.participantType)) return options.participantType;
      if (!room) return "player";
      const players = (room.players || []).filter((player) => player.participantType !== "spectator");
      const full = players.length >= (room.capacity || 8);
      if (room.phase === "playing" || room.phase === "loading" || room.locked || full) return "spectator";
      return "player";
    }

    isHost(game = this.game()) {
      const player = game?.localSessionPlayer?.();
      return Boolean(player?.host || (game?.onlineSession?.hostId && game.onlineSession.hostId === game.onlineSession.playerId));
    }

    publishLocalPlayer(game = this.game()) {
      if (!game?.onlineSession?.roomId || !this.registry) return;
      const player = game.localSessionPlayer?.();
      if (!player) return;
      this.registry.addOrUpdatePlayer(game.onlineSession.roomId, player);
    }

    syncCurrentRoom(game = this.game()) {
      if (!game || game.sessionMode !== "online" || !game.onlineSession?.roomId || !this.registry) return;
      const room = this.registry.getRoom(game.onlineSession.roomId);
      if (!room) {
        if (game.lobbyOpen && !game.matchStarted && !game.countdownStarted) {
          game.roomListOpen = true;
          game.matchPhase = "rooms";
        }
        return;
      }

      game.matchConfig.mode = room.mode || game.matchConfig.mode;
      if (room.mode === "conquest" && !game.conquest) game.conquest = game.defaultConquestState?.() || game.conquest;
      game.onlineSession.joinLocked = Boolean(room.locked);
      game.onlineSession.aiFillEmptySlots = room.aiFillEmptySlots !== false;
      game.onlineSession.spectators = Array.isArray(room.spectators) ? room.spectators.slice() : [];
      game.onlineSession.blueFactionId = room.blueFactionId || "korea";
      game.onlineSession.redFactionId = room.redFactionId || "russia";
      this.applyRoomFactionToLocalPlayer(game);
      IronLine.factionVisuals?.syncGame?.(game);
      this.publishLocalPlayer(game);

      if (room.phase === "playing" && game.lobbyOpen && !game.matchStarted && !game.countdownStarted) {
        if (game.isLocalSpectator?.()) game.enterSpectatorMode?.({ roomId: room.id, participantType: game.onlineSession?.participantType || "spectator" });
        else game.beginDeploymentCountdown?.();
      } else if (room.phase === "ended" && game.matchStarted) {
        game.matchStarted = false;
        game.countdownStarted = false;
        game.matchPhase = "ended";
        game.lobbyOpen = true;
        game.result = "ended";
        game.resultReason = "관리자가 방을 종료했습니다.";
      }
    }

    makeRoomId() {
      return `ROOM-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    applyRoomFactionToLocalPlayer(game = this.game()) {
      const session = game?.onlineSession;
      if (!session) return "";
      const player = game.localSessionPlayer?.();
      if (!player) return "";
      const factionId = player.team === TEAM.RED
        ? (session.redFactionId || "russia")
        : (session.blueFactionId || "korea");
      player.factionId = factionId;
      player.skinId = factionId;
      if (game.player && player.id === session.playerId) {
        game.player.factionId = factionId;
        game.player.skinId = factionId;
        IronLine.factionVisuals?.syncEntity?.(game, game.player);
      }
      return factionId;
    }
  }

  IronLine.SessionFlow = SessionFlow;
})(window);
