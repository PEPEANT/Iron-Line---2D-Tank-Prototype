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
      this.lastPlayerStateAt = 0;
      this.lastCleanupAt = 0;
      this.publishIntervalMs = 180;
      this.playerStateIntervalMs = 75;
      this.playerStateSocket = null;
      this.playerStateSocketRoomId = "";
      this.playerStateSocketPlayerId = "";
      this.playerStateSocketOpen = false;
      this.playerStateSocketLastAttempt = 0;
      this.remotePlayerStateBuffer = new Map();
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

    joinOnlineRoom(room, options = {}) {
      const selected = room?.id ? this.registry?.selectRoom?.(room.id) || room : room;
      const game = this.game();
      const playerId = game?.localProfile?.playerId || game?.onlineSession?.playerId || "";
      if (game?.combatOnlyRecoveryMode && this.isSpectatorType(options.participantType)) {
        this.handleJoinDenied("P0 전투 복구 모드에서는 관전 입장을 잠시 비활성화했습니다.");
        return false;
      }
      if (this.isPlayerKicked(selected, playerId)) {
        this.handleJoinDenied("관리자에 의해 강퇴된 방에는 다시 입장할 수 없습니다.");
        return false;
      }
      const participantType = this.resolveParticipantType(selected, options);
      if (this.isSpectatorType(participantType) && this.isSpectatorFull(selected, playerId)) {
        this.handleJoinDenied("관전자 정원이 가득 찼습니다.");
        return false;
      }
      if (game?.combatOnlyRecoveryMode && this.isSpectatorType(participantType)) {
        this.handleJoinDenied("P0 combat-only recovery mode has spectator entry disabled for active rooms.");
        return false;
      }
      return this.openLobby({
        host: false,
        roomId: selected?.id || room?.id || "",
        room: selected || room,
        participantType
      });
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
      this.applyRoomMatchSettings(game, options.room);
      if (game.matchConfig.mode === "conquest") game.conquest = game.defaultConquestState?.() || game.conquest;
      else game.resetAnnihilationState?.();
      if (!this.prepareOnlineSession(game, options)) return false;
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
      if (this.isPlayerKicked(room, game.localProfile?.playerId || session.playerId)) {
        this.handleJoinDenied("관리자에 의해 강퇴된 방에는 다시 입장할 수 없습니다.");
        return false;
      }
      if (this.isSpectatorType(participantType) && this.isSpectatorFull(room, game.localProfile?.playerId || session.playerId)) {
        this.handleJoinDenied("관전자 정원이 가득 찼습니다.");
        return false;
      }
      if (game.combatOnlyRecoveryMode && this.isSpectatorType(participantType)) {
        this.handleJoinDenied("P0 combat-only recovery mode has spectator entry disabled.");
        return false;
      }
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
        game.assignPlayerToSlot?.(session.playerId, this.resolveJoinSlot(game, room, player));
        this.applyRoomFactionToLocalPlayer(game);
      } else {
        for (const slot of session.roleSlots || []) {
          if (slot.playerId === session.playerId) {
            slot.playerId = null;
            slot.aiControlled = true;
          }
        }
      }
      return this.publishLocalPlayer(game, { force: true }) !== false;
    }

    resolveJoinSlot(game, room = null, player = null) {
      const slots = game?.onlineSession?.roleSlots || game?.createRoleSlots?.() || [];
      const localId = game?.onlineSession?.playerId || player?.id || "";
      const validIds = new Set(slots.map((slot) => slot.id));
      const occupied = new Set(
        (room?.players || [])
          .filter((item) => item.id !== localId && (item.participantType || "player") === "player")
          .map((item) => this.normalizeJoinSlotId(item.slotId))
          .filter((slotId) => validIds.has(slotId))
      );
      const requested = this.normalizeJoinSlotId(player?.slotId || "");
      if (requested && validIds.has(requested) && !occupied.has(requested)) return requested;
      const teamOrder = this.joinSlotTeamOrder(occupied);
      for (const team of teamOrder) {
        const slot = slots.find((item) => item.team === team && !occupied.has(item.id));
        if (slot) return slot.id;
      }
      return slots.find((slot) => !occupied.has(slot.id))?.id || requested || "blue-infantry";
    }

    joinSlotTeamOrder(occupied = new Set()) {
      let blue = 0;
      let red = 0;
      for (const slotId of occupied) {
        if (slotId.startsWith("red-")) red += 1;
        else if (slotId.startsWith("blue-")) blue += 1;
      }
      return blue <= red ? [TEAM.BLUE, TEAM.RED] : [TEAM.RED, TEAM.BLUE];
    }

    normalizeJoinSlotId(slotId = "") {
      const text = String(slotId || "");
      return text.endsWith("-scout") ? text.replace("-scout", "-recon") : text;
    }

    resolveParticipantType(room, options = {}) {
      if (["player", "spectator", "caster", "admin"].includes(options.participantType)) return options.participantType;
      if (!room) return "player";
      const players = (room.players || []).filter((player) => player.participantType !== "spectator");
      const full = players.length >= (room.capacity || 8);
      if (room.phase === "playing" || room.phase === "loading" || room.locked || full) return "spectator";
      return "player";
    }

    isSpectatorType(participantType) {
      return participantType === "spectator" || participantType === "caster";
    }

    isPlayerKicked(room = null, playerId = "") {
      const id = String(playerId || "");
      if (!room || !id) return false;
      return (room.moderation || []).some((item) => item.type === "kick" && item.playerId === id);
    }

    isSpectatorFull(room = null, playerId = "") {
      if (!room) return false;
      const capacity = Math.max(0, Math.round(Number(room.spectatorCapacity) || 12));
      const id = String(playerId || "");
      const spectators = Array.isArray(room.spectators) ? room.spectators : [];
      const alreadyInside = id && spectators.some((item) => item.id === id);
      return !alreadyInside && spectators.length >= capacity;
    }

    handleJoinDenied(message = "") {
      const game = this.game();
      if (game) {
        game.roomListOpen = true;
        game.lobbyOpen = true;
        game.matchPhase = "rooms";
        game.adminNotify?.(message);
      }
      const status = this.hud?.nodes?.entryStatus;
      if (status) status.textContent = message;
      game?.hud?.update?.(game);
      return false;
    }

    isHost(game = this.game()) {
      const player = game?.localSessionPlayer?.();
      return Boolean(player?.host || (game?.onlineSession?.hostId && game.onlineSession.hostId === game.onlineSession.playerId));
    }

    publishLocalPlayer(game = this.game(), options = {}) {
      if (!game?.onlineSession?.roomId || !this.registry) return;
      const room = this.registry.getRoom(game.onlineSession.roomId);
      if (this.isLocalKicked(game, room)) {
        this.handleLocalKick(game, room);
        return;
      }
      const now = Date.now();
      const player = game.localSessionPlayer?.();
      if (!player) return;
      const shouldRelayState = options.force || now - this.lastPlayerStateAt >= this.playerStateIntervalMs;
      const shouldPublishParticipant = options.force || now - this.lastPublishAt >= this.publishIntervalMs;
      if (!shouldRelayState && !shouldPublishParticipant) return true;
      const position = this.syncLocalPlayerPresence(game, player, now);
      if (shouldRelayState && position) {
        this.lastPlayerStateAt = now;
        this.publishPlayerStateRelay(game, player, position, now);
      }
      if (!shouldPublishParticipant) return true;
      this.lastPublishAt = now;
      const saved = this.registry.addOrUpdatePlayer(game.onlineSession.roomId, player);
      if (!saved) {
        const latestRoom = this.registry.getRoom(game.onlineSession.roomId);
        if (this.isLocalKicked(game, latestRoom)) {
          this.handleLocalKick(game, latestRoom);
          return false;
        }
        if (this.isSpectatorType(player.participantType) && this.isSpectatorFull(latestRoom, player.id)) {
          this.handleJoinDenied("관전자 정원이 가득 찼습니다.");
          return false;
        }
      }
      return Boolean(saved);
    }

    playerStateSocketUrl() {
      if (typeof WebSocket !== "function") return "";
      const base = this.registry?.apiBase || global.location?.origin || "";
      try {
        const url = new URL(base || global.location.href);
        const protocol = url.protocol === "https:" ? "wss:" : "ws:";
        return `${protocol}//${url.host}/ws`;
      } catch (_error) {
        return "";
      }
    }

    ensurePlayerStateSocket(game = this.game()) {
      const session = game?.onlineSession || {};
      const roomId = session.roomId || "";
      const playerId = session.playerId || "";
      if (!roomId || !playerId || typeof WebSocket !== "function") return false;
      const sameSocket = this.playerStateSocket &&
        this.playerStateSocketRoomId === roomId &&
        this.playerStateSocketPlayerId === playerId;
      if (sameSocket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(this.playerStateSocket.readyState)) return true;
      const now = Date.now();
      if (now - this.playerStateSocketLastAttempt < 1200) return false;
      this.closePlayerStateSocket();
      const url = this.playerStateSocketUrl();
      if (!url) return false;
      this.playerStateSocketLastAttempt = now;
      this.playerStateSocketRoomId = roomId;
      this.playerStateSocketPlayerId = playerId;
      try {
        const socket = new WebSocket(url);
        this.playerStateSocket = socket;
        socket.addEventListener("open", () => {
          this.playerStateSocketOpen = true;
          socket.send(JSON.stringify({
            type: "join",
            roomId,
            playerId,
            nickname: game.localSessionPlayer?.()?.name || game.localProfile?.nickname || playerId,
            participantType: session.participantType || "player"
          }));
        });
        socket.addEventListener("message", (event) => this.handlePlayerStateSocketMessage(event.data));
        socket.addEventListener("close", () => { this.playerStateSocketOpen = false; });
        socket.addEventListener("error", () => { this.playerStateSocketOpen = false; });
        return true;
      } catch (_error) {
        this.closePlayerStateSocket();
        return false;
      }
    }

    closePlayerStateSocket() {
      if (this.playerStateSocket) {
        try { this.playerStateSocket.close(); } catch (_error) {}
      }
      this.playerStateSocket = null;
      this.playerStateSocketOpen = false;
      this.playerStateSocketRoomId = "";
      this.playerStateSocketPlayerId = "";
    }

    publishPlayerStateRelay(game, player, position, now = Date.now()) {
      if ((game?.onlineSession?.participantType || "player") !== "player") return false;
      if (!this.ensurePlayerStateSocket(game)) return false;
      const socket = this.playerStateSocket;
      if (!socket || socket.readyState !== WebSocket.OPEN) return false;
      try {
        socket.send(JSON.stringify({
          type: "player_state",
          roomId: game.onlineSession.roomId,
          playerId: game.onlineSession.playerId,
          name: player.name || player.nickname || game.onlineSession.playerId,
          team: player.team || game.player?.team || TEAM.BLUE,
          slotId: player.slotId || "",
          classId: player.classId || "",
          currentClassId: player.currentClassId || player.classId || "",
          weaponId: player.weaponId || position.weaponId || "",
          factionId: player.factionId || player.skinId || "",
          skinId: player.skinId || player.factionId || "",
          state: position,
          sentAt: now
        }));
        return true;
      } catch (_error) {
        this.playerStateSocketOpen = false;
        return false;
      }
    }

    handlePlayerStateSocketMessage(raw) {
      let message = null;
      try { message = JSON.parse(String(raw || "{}")); } catch (_error) { return; }
      if (message?.type !== "player_state") return;
      this.applyRemotePlayerState(message.payload || {});
    }

    applyRemotePlayerState(payload = {}, game = this.game()) {
      const session = game?.onlineSession || {};
      const playerId = String(payload.playerId || "");
      if (!session.roomId || payload.roomId !== session.roomId || !playerId || playerId === session.playerId) return false;
      const incoming = this.normalizeRemotePlayerState(payload.state || {});
      if (!incoming) return false;
      const players = Array.isArray(session.players) ? session.players.slice() : [];
      const index = players.findIndex((item) => item.id === playerId);
      const previous = index >= 0 ? players[index] : null;
      if (previous?.position && this.isStaleRemotePlayerState(previous.position, incoming)) return false;
      const payloadTeam = payload.team === TEAM.RED ? TEAM.RED : payload.team === TEAM.BLUE ? TEAM.BLUE : "";
      const team = payloadTeam || previous?.team || TEAM.BLUE;
      const next = {
        ...(previous || {}),
        id: playerId,
        playerId,
        name: previous?.name || payload.name || playerId,
        nickname: previous?.nickname || payload.name || playerId,
        team,
        slotId: payload.slotId || previous?.slotId || "",
        classId: previous?.classId || payload.classId || payload.currentClassId || "",
        currentClassId: previous?.currentClassId || payload.currentClassId || payload.classId || "",
        weaponId: payload.weaponId || incoming.weaponId || previous?.weaponId || "",
        participantType: "player",
        factionId: previous?.factionId || payload.factionId || payload.skinId || "",
        skinId: previous?.skinId || payload.skinId || payload.factionId || "",
        position: { ...(previous?.position || {}), ...incoming },
        x: incoming.x,
        y: incoming.y,
        hp: incoming.hp,
        maxHp: incoming.maxHp,
        stateSeq: incoming.stateSeq,
        alive: incoming.alive,
        deathState: incoming.deathState,
        updatedAt: incoming.updatedAt,
        stateRelayReceivedAt: Date.now()
      };
      if (index >= 0) players[index] = next;
      else players.push(next);
      session.players = players;
      this.remotePlayerStateBuffer.set(playerId, next);
      return true;
    }

    normalizeRemotePlayerState(state = {}) {
      const x = Number(state.x);
      const y = Number(state.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      const now = Date.now();
      const numberOrNull = (value) => Number.isFinite(Number(value)) ? Math.round(Number(value)) : null;
      return {
        x: Math.round(x),
        y: Math.round(y),
        stateSeq: Math.max(0, Math.floor(Number(state.stateSeq) || 0)),
        stateUpdatedAt: Number(state.stateUpdatedAt || state.updatedAt || now) || now,
        updatedAt: Number(state.updatedAt || state.stateUpdatedAt || now) || now,
        alive: state.alive !== false,
        deathState: String(state.deathState || (state.alive === false ? "dead" : "alive")).slice(0, 16),
        hp: Math.max(0, Math.min(999, Number(state.hp ?? 100) || 0)),
        maxHp: Math.max(1, Math.min(999, Number(state.maxHp ?? 100) || 100)),
        weaponId: String(state.weaponId || "").slice(0, 32),
        movementState: String(state.movementState || "").slice(0, 24),
        inVehicle: Boolean(state.inVehicle),
        vehicleId: String(state.vehicleId || "").slice(0, 36),
        vehicleType: String(state.vehicleType || "").slice(0, 18),
        vehicleHp: Math.max(0, Math.min(999, Number(state.vehicleHp) || 0)),
        vehicleMaxHp: Math.max(0, Math.min(999, Number(state.vehicleMaxHp) || 0)),
        angle: Number.isFinite(Number(state.angle)) ? Number(state.angle) : 0,
        turretAngle: Number.isFinite(Number(state.turretAngle)) ? Number(state.turretAngle) : 0,
        machineGunAngle: Number.isFinite(Number(state.machineGunAngle)) ? Number(state.machineGunAngle) : 0,
        aimX: numberOrNull(state.aimX),
        aimY: numberOrNull(state.aimY),
        droneId: String(state.droneId || "").slice(0, 36),
        droneType: String(state.droneType || "").slice(0, 18),
        droneX: numberOrNull(state.droneX),
        droneY: numberOrNull(state.droneY),
        droneAngle: Number.isFinite(Number(state.droneAngle)) ? Number(state.droneAngle) : 0,
        droneControlled: Boolean(state.droneControlled)
      };
    }

    isStaleRemotePlayerState(previous = {}, incoming = {}) {
      const previousSeq = Math.max(0, Math.floor(Number(previous.stateSeq) || 0));
      const incomingSeq = Math.max(0, Math.floor(Number(incoming.stateSeq) || 0));
      if (incomingSeq && previousSeq && incomingSeq < previousSeq) return true;
      if (incomingSeq > previousSeq) return false;
      return Number(incoming.updatedAt || 0) < Number(previous.updatedAt || 0);
    }

    syncLocalPlayerPresence(game, sessionPlayer, now = Date.now()) {
      const entity = game?.player;
      if (!entity || !sessionPlayer) return null;
      this.syncLocalPlayerEntityFromSession(game, sessionPlayer);
      const mounted = entity.inTank || entity.inVehicle || null;
      let point = mounted?.alive !== false ? mounted : entity;
      if (!this.isUsablePresencePoint(game, point)) {
        point = this.fallbackPresencePoint(game, sessionPlayer);
      }
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return null;
      const alive = Boolean(!game.playerDeathActive && !game.playerDowned && entity.hp > 0);
      const pointAngle = Number.isFinite(point.angle) ? point.angle : entity.angle || 0;
      const mouse = game?.input?.mouse || {};
      const aimX = Number.isFinite(Number(mouse.worldX)) ? Number(mouse.worldX) : point.x + Math.cos(pointAngle) * 180;
      const aimY = Number.isFinite(Number(mouse.worldY)) ? Number(mouse.worldY) : point.y + Math.sin(pointAngle) * 180;
      game.onlinePlayerStateSeq = Math.max(0, Math.floor(Number(game.onlinePlayerStateSeq) || 0)) + 1;
      const health = IronLine.OnlineCombatStabilizer?.playerHealthSnapshot?.(game) || { hp: entity.hp || 0, maxHp: entity.maxHp || 100 };
      const currentWeapon = entity.getWeapon?.() || null;
      const speed = Math.hypot(Number(entity.vx) || 0, Number(entity.vy) || 0);
      const controlledDrone = entity.controlledDrone?.alive ? entity.controlledDrone : null;
      const activeDrone = controlledDrone || game.activePlayerDrone?.() || null;
      const hasDrone = Boolean(activeDrone?.alive !== false && Number.isFinite(activeDrone?.x) && Number.isFinite(activeDrone?.y));
      const position = {
        x: Math.round(point.x),
        y: Math.round(point.y),
        stateSeq: game.onlinePlayerStateSeq,
        stateUpdatedAt: now,
        alive,
        deathState: game.playerDeathActive ? "dead" : game.playerDowned ? "downed" : alive ? "alive" : "dead",
        hp: health.hp,
        maxHp: health.maxHp,
        weaponId: currentWeapon?.id || entity.weaponId || sessionPlayer.weaponId || "",
        movementState: mounted ? "vehicle" : speed > 6 ? "moving" : "idle",
        inVehicle: Boolean(mounted),
        vehicleId: mounted?.callSign || mounted?.id || "",
        vehicleType: mounted?.vehicleType || "",
        vehicleHp: mounted ? Math.round(Number(mounted.hp) || 0) : 0,
        vehicleMaxHp: mounted ? Math.round(Number(mounted.maxHp) || 0) : 0,
        angle: pointAngle,
        turretAngle: Number.isFinite(mounted?.turretAngle) ? mounted.turretAngle : 0,
        machineGunAngle: Number.isFinite(mounted?.machineGunAngle) ? mounted.machineGunAngle : 0,
        aimX: Math.round(aimX),
        aimY: Math.round(aimY),
        droneId: hasDrone ? activeDrone.callSign || activeDrone.id || "" : "",
        droneType: hasDrone ? activeDrone.droneRole || activeDrone.weaponId || "drone" : "",
        droneX: hasDrone ? Math.round(activeDrone.x) : null,
        droneY: hasDrone ? Math.round(activeDrone.y) : null,
        droneAngle: hasDrone && Number.isFinite(activeDrone.angle) ? activeDrone.angle : 0,
        droneControlled: Boolean(controlledDrone && activeDrone === controlledDrone),
        updatedAt: now
      };
      sessionPlayer.position = position;
      sessionPlayer.x = position.x;
      sessionPlayer.y = position.y;
      sessionPlayer.alive = alive;
      sessionPlayer.hp = position.hp;
      sessionPlayer.maxHp = position.maxHp;
      sessionPlayer.stateSeq = position.stateSeq;
      sessionPlayer.weaponId = position.weaponId;
      sessionPlayer.inVehicle = position.inVehicle;
      sessionPlayer.vehicleId = position.vehicleId;
      sessionPlayer.vehicleType = position.vehicleType;
      sessionPlayer.aimX = position.aimX;
      sessionPlayer.aimY = position.aimY;
      sessionPlayer.droneId = position.droneId;
      sessionPlayer.droneType = position.droneType;
      sessionPlayer.droneControlled = position.droneControlled;
      return position;
    }

    syncLocalPlayerEntityFromSession(game, sessionPlayer) {
      if (!game?.player || !sessionPlayer) return;
      if (sessionPlayer.team) game.player.team = sessionPlayer.team;
      const factionId = sessionPlayer.team === TEAM.RED
        ? (game.onlineSession?.redFactionId || sessionPlayer.factionId || sessionPlayer.skinId || "russia")
        : (game.onlineSession?.blueFactionId || sessionPlayer.factionId || sessionPlayer.skinId || "korea");
      game.player.factionId = factionId;
      game.player.skinId = factionId;
    }

    isUsablePresencePoint(game, point) {
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return false;
      const nearOrigin = Math.abs(point.x) < 4 && Math.abs(point.y) < 4;
      const originOutsidePlay = !game?.world?.safeZones?.some?.((zone) => Math.hypot((zone.x || 0) - point.x, (zone.y || 0) - point.y) < (zone.radius || 0));
      return !(nearOrigin && originOutsidePlay);
    }

    fallbackPresencePoint(game, sessionPlayer) {
      const team = sessionPlayer?.team || game?.player?.team || TEAM.BLUE;
      const spawn = game?.respawnPointForTeam?.(team) ||
        (team === TEAM.RED ? game?.world?.spawns?.red?.[0] : game?.world?.spawns?.player) ||
        game?.world?.spawns?.player;
      if (spawn && Number.isFinite(spawn.x) && Number.isFinite(spawn.y)) return spawn;
      const zone = (game?.world?.safeZones || []).find((item) => item.team === team) || game?.world?.safeZones?.[0];
      return zone && Number.isFinite(zone.x) && Number.isFinite(zone.y) ? zone : null;
    }

    leaveOnlineRoom(game = this.game(), reason = "leave") {
      if (!game?.onlineSession?.roomId) return false;
      const roomId = game.onlineSession.roomId;
      const playerId = game.onlineSession.playerId;
      if (playerId) this.registry?.removeParticipant?.(roomId, playerId, reason);
      this.closePlayerStateSocket();
      this.remotePlayerStateBuffer.clear();
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
      this.closePlayerStateSocket();
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
      if (this.isLocalKicked(game, room)) {
        this.handleLocalKick(game, room);
        return;
      }

      this.applyRoomMatchSettings(game, room);
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
        else game.beginDeploymentCountdown?.({ room, startedAt: room.startedAt });
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

    isLocalKicked(game = this.game(), room = null) {
      const playerId = game?.onlineSession?.playerId || game?.localProfile?.playerId || "";
      return this.isPlayerKicked(room, playerId);
    }

    handleLocalKick(game = this.game(), room = null) {
      if (!game?.onlineSession) return false;
      const kick = (room?.moderation || []).find((item) => item.type === "kick" && item.playerId === game.onlineSession.playerId);
      game.chat?.addSystemMessage?.(kick?.reason || "관리자에 의해 방에서 강퇴되었습니다.");
      game.onlineSession.roomId = "";
      game.onlineSession.localReady = false;
      game.onlineSession.participantType = "player";
      game.onlineSession.spectators = [];
      game.matchStarted = false;
      game.countdownStarted = false;
      game.lobbyOpen = false;
      game.roomListOpen = true;
      game.entryOpen = true;
      game.matchPhase = "rooms";
      const player = game.localSessionPlayer?.();
      if (player) {
        player.ready = false;
        player.participantType = "player";
      }
      game.adminNotify?.("관리자에 의해 방에서 나갔습니다.");
      game.hud?.update?.(game);
      return true;
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
      this.applyBufferedPlayerStates(game, roomPlayers);
      if (roomPlayers.length > 0) session.players = roomPlayers;
      session.spectators = Array.isArray(room.spectators) ? room.spectators.slice() : [];
      const localPlayer = localId ? roomPlayers.find((player) => player.id === localId) : null;
      if (localPlayer && (localPlayer.participantType || "player") === "player") {
        session.localReady = Boolean(localPlayer.ready);
      }
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
        slot.controllerType = player
          ? "human"
          : session.aiFillEmptySlots === false
            ? "empty"
            : "bot";
        if (player && !slot.commandAuthorityPlayerId) {
          game.setSlotCommandAuthority?.(slot, player.id, player.name || player.nickname || player.id, "owner");
        }
      }
    }

    applyBufferedPlayerStates(game, roomPlayers = []) {
      if (!this.remotePlayerStateBuffer.size) return;
      const now = Date.now();
      const localId = game?.onlineSession?.playerId || "";
      for (const [playerId, buffered] of this.remotePlayerStateBuffer.entries()) {
        if (!buffered || playerId === localId) continue;
        if (now - (Number(buffered.stateRelayReceivedAt) || 0) > 1500) {
          this.remotePlayerStateBuffer.delete(playerId);
          continue;
        }
        const index = roomPlayers.findIndex((player) => player.id === playerId);
        if (index < 0) {
          roomPlayers.push(buffered);
          continue;
        }
        const current = roomPlayers[index];
        if (!this.isStaleRemotePlayerState(current.position || current, buffered.position || buffered)) {
          const bufferedTeam = buffered.team === TEAM.RED ? TEAM.RED : buffered.team === TEAM.BLUE ? TEAM.BLUE : "";
          roomPlayers[index] = {
            ...current,
            ...buffered,
            team: bufferedTeam || current.team,
            slotId: buffered.slotId || current.slotId,
            ready: current.ready,
            host: current.host
          };
        }
      }
    }

    makeRoomId() {
      return `ROOM-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    applyRoomMatchSettings(game = this.game(), room = null) {
      if (!game) return null;
      game.matchConfig = game.matchConfig || game.defaultMatchConfig?.() || {};
      if (!room) {
        game.matchConfig.mode = game.matchConfig.mode || "annihilation";
        return game.matchConfig;
      }
      const bounds = game.matchSettingBounds?.() || {
        blueAiTanks: { min: 0, max: 8 },
        blueInfantry: { min: 4, max: 56 },
        redTanks: { min: 1, max: 10 },
        redInfantry: { min: 4, max: 64 }
      };
      game.matchConfig.mode = room.mode || game.matchConfig.mode || "annihilation";
      game.matchConfig.difficulty = ["easy", "normal", "hard"].includes(room.difficulty)
        ? room.difficulty
        : game.matchConfig.difficulty || "normal";
      for (const key of ["blueAiTanks", "blueInfantry", "redTanks", "redInfantry"]) {
        const limit = bounds[key];
        const raw = Number(room[key]);
        if (!limit || !Number.isFinite(raw)) continue;
        game.matchConfig[key] = Math.max(limit.min, Math.min(limit.max, Math.round(raw)));
      }
      game.matchConfig.aiDensityPreset = room.aiDensityPreset || "custom";
      return game.matchConfig;
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
        game.player.team = player.team || game.player.team;
        game.player.factionId = factionId;
        game.player.skinId = factionId;
        IronLine.factionVisuals?.syncEntity?.(game, game.player);
      }
      return factionId;
    }
  }

  IronLine.SessionFlow = SessionFlow;
})(window);
