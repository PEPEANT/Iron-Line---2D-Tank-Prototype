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
      this.lastPublishAt = 0;
      this.lastCleanupAt = 0;
      this.publishIntervalMs = 1000;
      window.addEventListener("pagehide", () => this.handlePageHide());
    }

    game() {
      return IronLine.game || null;
    }

    update(game) {
      if (!game.sessionMode) game.sessionMode = "offline";
      game.roomListOpen = Boolean(game.roomListOpen);
      this.syncCurrentRoom(game);
      if (game.result === "ended" && game.matchPhase === "ended") {
        game.resultReason = "\uad00\ub9ac\uc790\uac00 \ubc29\uc744 \uc885\ub8cc\ud588\uc2b5\ub2c8\ub2e4.";
      }
      this.cleanupRoomsIfNeeded();
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
      game.matchConfig.mode = "annihilation";
      game.resetAnnihilationState?.();
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
      game.matchConfig.mode = options.room?.mode || "annihilation";
      if (game.matchConfig.mode === "conquest") game.conquest = game.defaultConquestState?.() || game.conquest;
      else game.resetAnnihilationState?.();
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
      this.leaveOnlineRoom(game, "entry");
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
      this.leaveOnlineRoom(game, "rooms");
      game.roomListOpen = true;
      game.lobbyOpen = true;
      game.deploymentOpen = false;
      game.matchPhase = "rooms";
      if (game.onlineSession) game.onlineSession.localReady = false;
      for (const player of game.onlineSession?.players || []) player.ready = false;
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
      this.publishLocalPlayer(game, { force: true });
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

    publishLocalPlayer(game = this.game(), options = {}) {
      if (!game?.onlineSession?.roomId || !this.registry) return;
      const now = Date.now();
      if (!options.force && now - this.lastPublishAt < this.publishIntervalMs) return;
      this.lastPublishAt = now;
      const player = game.localSessionPlayer?.();
      if (!player) return;
      this.syncLocalPlayerPresence(game, player, now);
      this.registry.addOrUpdatePlayer(game.onlineSession.roomId, player);
    }

    syncLocalPlayerPresence(game, sessionPlayer, now = Date.now()) {
      const entity = game?.player;
      if (!entity || !sessionPlayer) return null;
      const mounted = entity.inTank || entity.inVehicle || null;
      const point = mounted?.alive !== false ? mounted : entity;
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return null;
      const alive = Boolean(!game.playerDeathActive && !game.playerDowned && entity.hp > 0);
      const position = {
        x: Math.round(point.x),
        y: Math.round(point.y),
        alive,
        inVehicle: Boolean(mounted),
        updatedAt: now
      };
      sessionPlayer.position = position;
      sessionPlayer.x = position.x;
      sessionPlayer.y = position.y;
      sessionPlayer.alive = alive;
      sessionPlayer.inVehicle = position.inVehicle;
      return position;
    }

    leaveOnlineRoom(game = this.game(), reason = "leave") {
      if (!game?.onlineSession?.roomId) return false;
      const roomId = game.onlineSession.roomId;
      const playerId = game.onlineSession.playerId;
      if (playerId) this.registry?.removeParticipant?.(roomId, playerId, reason);
      game.onlineSession.roomId = "";
      game.onlineSession.localReady = false;
      game.onlineSession.participantType = "player";
      game.onlineSession.spectators = [];
      const player = game.localSessionPlayer?.();
      if (player) {
        player.ready = false;
        player.participantType = "player";
      }
      return true;
    }

    handlePageHide() {
      const game = this.game();
      if (game?.sessionMode !== "online") return;
      if (!game.onlineSession?.roomId || !game.onlineSession?.playerId) return;
      this.registry?.removeParticipant?.(game.onlineSession.roomId, game.onlineSession.playerId, "pagehide");
    }

    cleanupRoomsIfNeeded() {
      const now = Date.now();
      if (now - this.lastCleanupAt < 10000) return;
      this.lastCleanupAt = now;
      this.registry?.cleanupStaleParticipants?.();
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

      game.matchConfig.mode = room.mode || game.matchConfig.mode || "annihilation";
      if (game.matchConfig.mode === "conquest" && !game.conquest) game.conquest = game.defaultConquestState?.() || game.conquest;
      if (game.matchConfig.mode === "annihilation" && !game.annihilation) game.resetAnnihilationState?.();
      game.onlineSession.joinLocked = Boolean(room.locked);
      game.onlineSession.aiFillEmptySlots = room.aiFillEmptySlots !== false;
      this.syncRoomParticipants(game, room);
      game.onlineSession.spectators = Array.isArray(room.spectators) ? room.spectators.slice() : [];
      game.onlineSession.blueFactionId = room.blueFactionId || "korea";
      game.onlineSession.redFactionId = room.redFactionId || "russia";
      game.applyRoomCommandAuthority?.(room.commandAuthorities || [], room.commandAuthorityRequests || []);
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
      if (game.result === "ended" && game.matchPhase === "ended") {
        game.resultReason = "관리자가 방을 종료했습니다.";
      }
    }

    syncRoomParticipants(game, room) {
      const session = game?.onlineSession;
      if (!session || !room) return;
      const previousLocal = game.localSessionPlayer?.();
      const roomPlayers = Array.isArray(room.players) ? room.players.slice() : [];
      const localId = session.playerId || previousLocal?.id || "";
      if (localId && previousLocal && !roomPlayers.some((player) => player.id === localId)) {
        roomPlayers.push(previousLocal);
      }
      if (roomPlayers.length > 0) session.players = roomPlayers;
      session.spectators = Array.isArray(room.spectators) ? room.spectators.slice() : [];
      const playerBySlot = new Map(
        roomPlayers
          .filter((player) => (player.participantType || "player") === "player" && player.slotId)
          .map((player) => [player.slotId, player])
      );
      for (const slot of session.roleSlots || []) {
        const player = playerBySlot.get(slot.id) || null;
        slot.playerId = player?.id || null;
        slot.nickname = player?.name || player?.nickname || "";
        slot.ready = Boolean(player?.ready);
        slot.aiControlled = !player;
        if (player && !slot.commandAuthorityPlayerId) {
          game.setSlotCommandAuthority?.(slot, player.id, player.name || player.nickname || player.id, "owner");
        }
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
