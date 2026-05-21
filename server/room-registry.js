"use strict";

const {
  createChatMessage,
  createDefaultSlots,
  createObserverSnapshot,
  createParticipant,
  createRoomConfig,
  createSessionEvent
} = require("./schemas");

class RoomRegistry {
  constructor(options = {}) {
    this.rooms = new Map();
    this.now = options.now || (() => new Date().toISOString());
  }

  createRoom(input = {}) {
    const config = createRoomConfig(input);
    const room = {
      config,
      phase: "lobby",
      hostId: input.hostId || "",
      players: new Map(),
      spectators: new Map(),
      participants: new Map(),
      clients: new Map(),
      slots: createDefaultSlots(),
      commands: [],
      chat: [],
      events: [],
      combatEvents: [],
      worldState: null,
      createdAt: config.createdAt,
      updatedAt: this.now()
    };
    this.rooms.set(config.roomId, room);
    this.pushEvent(config.roomId, {
      type: "room_created",
      severity: "info",
      title: "방 생성",
      detail: `${config.name} 방이 생성되었습니다.`
    });
    return room;
  }

  getOrCreateRoom(roomId = "local") {
    return this.rooms.get(roomId) || this.createRoom({ roomId });
  }

  listRooms() {
    return Array.from(this.rooms.values()).map((room) => this.roomSummary(room));
  }

  joinRoom(roomId, client) {
    const room = this.getOrCreateRoom(roomId);
    const playerId = client.playerId || client.clientId;
    const previous = room.participants.get(playerId) || null;
    const participantType = this.resolveParticipantType(room, { ...client, playerId });
    const participant = createParticipant({
      ...client,
      playerId,
      participantType,
      joinedAt: previous?.joinedAt || this.now(),
      lastSeenAt: this.now()
    });
    room.clients.set(client.clientId, { ...client, playerId, participantType, joinedAt: this.now() });
    room.participants.set(playerId, participant);
    if (participantType === "player") {
      room.spectators.delete(playerId);
      room.players.set(playerId, participant);
      if (!room.hostId) room.hostId = playerId;
    } else {
      room.players.delete(playerId);
      room.spectators.set(playerId, participant);
    }
    this.pushParticipantEvent(room, previous, participant);
    room.updatedAt = this.now();
    return room;
  }

  resolveParticipantType(room, client = {}) {
    const requested = client.participantType || client.type || "";
    if (requested === "admin" || requested === "caster" || requested === "spectator") return requested;
    const occupiedSlots = room.slots.filter((slot) => slot.playerId).length;
    const locked = room.config.joinLocked || room.phase !== "lobby";
    if (locked || occupiedSlots >= room.config.maxHumans) return "spectator";
    return "player";
  }

  leaveClient(clientId) {
    for (const room of this.rooms.values()) {
      const client = room.clients.get(clientId);
      if (!client) continue;
      room.clients.delete(clientId);
      const participant = client.playerId ? room.participants.get(client.playerId) : null;
      if (participant) {
        participant.connected = false;
        participant.lastSeenAt = this.now();
        const slot = room.slots.find((item) => item.playerId === participant.playerId);
        if (slot && room.phase === "lobby") slot.ready = false;
        this.pushEvent(room.config.roomId, {
          type: "participant_left",
          severity: "info",
          title: "접속 종료",
          detail: `${participant.nickname || client.playerId} 연결이 종료되었습니다.`,
          actorId: participant.playerId
        });
      }
      const player = client.playerId ? room.players.get(client.playerId) : null;
      if (player) {
        player.connected = false;
        player.lastSeenAt = this.now();
      }
      const spectator = client.playerId ? room.spectators.get(client.playerId) : null;
      if (spectator) {
        spectator.connected = false;
        spectator.lastSeenAt = this.now();
      }
      room.updatedAt = this.now();
      return room;
    }
    return null;
  }

  assignSlot(roomId, playerId, slotId) {
    const room = this.getOrCreateRoom(roomId);
    const participant = room.participants.get(playerId);
    if (participant && participant.participantType !== "player") return { ok: false, reason: "spectator" };
    if (room.phase !== "lobby" || room.config.joinLocked) return { ok: false, reason: "locked" };
    const slot = room.slots.find((item) => item.id === slotId);
    if (!slot) return { ok: false, reason: "slot_not_found" };
    if (slot.playerId && slot.playerId !== playerId) return { ok: false, reason: "occupied" };
    for (const item of room.slots) {
      if (item.playerId === playerId) {
        item.playerId = null;
        item.nickname = "";
        item.ready = false;
        item.aiControlled = true;
      }
    }
    const player = room.players.get(playerId);
    slot.playerId = playerId;
    slot.nickname = player?.nickname || playerId;
    slot.ready = false;
    slot.aiControlled = false;
    if (player) {
      player.team = slot.team;
      player.slotId = slot.id;
    }
    this.pushEvent(room.config.roomId, {
      type: "slot_changed",
      severity: "info",
      title: "슬롯 변경",
      detail: `${slot.nickname} 님이 ${slot.label} 슬롯으로 이동했습니다.`,
      actorId: playerId
    });
    room.updatedAt = this.now();
    return { ok: true, slot };
  }

  setReady(roomId, playerId, ready) {
    const room = this.getOrCreateRoom(roomId);
    const participant = room.participants.get(playerId);
    if (participant && participant.participantType !== "player") return { ok: false, reason: "spectator" };
    const slot = room.slots.find((item) => item.playerId === playerId);
    if (!slot) return { ok: false, reason: "slot_required" };
    slot.ready = Boolean(ready);
    this.pushEvent(room.config.roomId, {
      type: "ready_changed",
      severity: "info",
      title: "준비 상태",
      detail: `${slot.nickname || playerId} 님이 ${slot.ready ? "준비 완료" : "준비 해제"} 상태가 되었습니다.`,
      actorId: playerId
    });
    room.updatedAt = this.now();
    return { ok: true, slot };
  }

  pushCommand(roomId, packet) {
    const room = this.getOrCreateRoom(roomId);
    room.commands.push(packet);
    if (room.commands.length > 120) room.commands.splice(0, room.commands.length - 120);
    this.pushEvent(roomId, {
      type: "command",
      severity: "info",
      title: "명령",
      detail: `${packet.slotId || packet.issuerPlayerId || "플레이어"}: ${packet.type || "command"}`,
      actorId: packet.issuerPlayerId || ""
    });
    room.updatedAt = this.now();
    return packet;
  }

  pushChat(roomId, input = {}) {
    const room = this.getOrCreateRoom(roomId);
    const participant = room.participants.get(input.senderId || input.playerId) || {};
    const slot = room.slots.find((item) => item.playerId === participant.playerId);
    const message = createChatMessage({
      ...input,
      roomId: room.config.roomId,
      senderId: participant.playerId || input.senderId || "",
      sender: participant.nickname || input.sender || "Player",
      participantType: participant.participantType || input.participantType || "player",
      team: slot?.team || participant.team || input.team || ""
    });
    if (!message.text) return null;
    room.chat.push(message);
    if (room.chat.length > 160) room.chat.splice(0, room.chat.length - 160);
    room.updatedAt = this.now();
    return message;
  }

  pushEvent(roomId, input = {}) {
    const room = this.getOrCreateRoom(roomId);
    const event = createSessionEvent({ ...input, roomId: room.config.roomId, createdAt: this.now() });
    room.events.push(event);
    if (room.events.length > 160) room.events.splice(0, room.events.length - 160);
    room.updatedAt = this.now();
    return event;
  }

  pushParticipantEvent(room, previous, participant) {
    const typeLabel = participant.participantType === "player" ? "플레이어" : "관전자";
    if (!previous) {
      this.pushEvent(room.config.roomId, {
        type: "participant_joined",
        severity: participant.participantType === "player" ? "info" : "spectator",
        title: `${typeLabel} 입장`,
        detail: `${participant.nickname} 님이 ${typeLabel}로 입장했습니다.`,
        actorId: participant.playerId
      });
      return;
    }
    if (previous.participantType !== participant.participantType) {
      this.pushEvent(room.config.roomId, {
        type: "participant_role_changed",
        severity: "info",
        title: "참가 형태 변경",
        detail: `${participant.nickname} 님이 ${typeLabel}로 전환되었습니다.`,
        actorId: participant.playerId
      });
    }
  }

  participantTeam(room, participant) {
    if (!participant) return "";
    const slot = room.slots.find((item) => item.playerId === participant.playerId || item.playerId === participant.id);
    return slot?.team || participant.team || "";
  }

  canReceiveChat(room, recipient, message) {
    if (!recipient || recipient.roomId !== room.config.roomId) return false;
    const participant = room.participants.get(recipient.playerId) || {};
    const type = participant.participantType || recipient.participantType || "player";
    if (type === "admin" || type === "caster") return true;
    if (message.channel === "team") return this.participantTeam(room, participant) === message.team;
    if (message.channel === "spectator") {
      if (room.config.spectatorChatVisibleToPlayers) return true;
      return type === "spectator";
    }
    if (message.channel === "caster") return true;
    return true;
  }

  lockRoom(roomId, locked = true) {
    const room = this.getOrCreateRoom(roomId);
    room.config.joinLocked = Boolean(locked);
    this.pushEvent(roomId, {
      type: locked ? "room_locked" : "room_unlocked",
      severity: "info",
      title: locked ? "방 잠금" : "방 잠금 해제",
      detail: locked ? "방 입장이 잠겼습니다." : "방 입장이 다시 열렸습니다."
    });
    room.updatedAt = this.now();
    return room;
  }

  snapshot(roomId = "local") {
    const room = this.getOrCreateRoom(roomId);
    return createObserverSnapshot({
      roomId: room.config.roomId,
      phase: room.phase,
      mode: room.config.mode,
      players: Array.from(room.players.values()),
      spectators: Array.from(room.spectators.values()),
      participants: Array.from(room.participants.values()),
      slots: room.slots,
      commands: room.commands.slice(-24),
      chat: room.chat.slice(-40),
      events: room.events.slice(-80),
      combatEvents: (room.combatEvents || []).slice(-80),
      worldState: room.worldState || null
    });
  }

  roomSummary(room) {
    return {
      roomId: room.config.roomId,
      phase: room.phase,
      mode: room.config.mode,
      clients: room.clients.size,
      players: room.players.size,
      spectators: room.spectators.size,
      casters: Array.from(room.spectators.values()).filter((item) => item.participantType === "caster").length,
      humanSlots: room.slots.filter((slot) => slot.playerId).length,
      aiSlots: room.slots.filter((slot) => !slot.playerId).length,
      locked: room.config.joinLocked,
      events: room.events.slice(-12),
      combatEvents: (room.combatEvents || []).slice(-12),
      worldState: room.worldState || null,
      updatedAt: room.updatedAt
    };
  }
}

module.exports = { RoomRegistry };
