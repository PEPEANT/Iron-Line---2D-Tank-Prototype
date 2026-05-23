"use strict";

const {
  COMMAND_TYPES,
  createChatMessage,
  createCommandPacket,
  createDefaultSlots,
  createObserverSnapshot,
  createParticipant,
  createRoomConfig,
  createSessionEvent
} = require("./schemas");

const ROLE_SPECIALS = Object.freeze({
  infantry: "assault",
  engineer: "repair",
  recon: "scan",
  armor: "fire_support"
});

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
      combatServerSeq: 0,
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
      ...(previous || {}),
      ...client,
      playerId,
      participantType,
      team: client.team || previous?.team || "",
      slotId: client.slotId || previous?.slotId || "",
      roleId: client.roleId || previous?.roleId || "",
      classId: client.classId || previous?.classId || "",
      currentClassId: client.currentClassId || previous?.currentClassId || "",
      weaponId: client.weaponId || previous?.weaponId || "",
      position: client.position || previous?.position || null,
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
    if (requested === "player" && client.playerId && room.players.has(client.playerId)) return "player";
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
    const normalized = createCommandPacket({
      ...packet,
      roomId: room.config.roomId
    });
    const validation = this.validateCommand(room, normalized);
    if (!validation.ok) return validation;
    room.commands.push(normalized);
    if (room.commands.length > 120) room.commands.splice(0, room.commands.length - 120);
    this.pushEvent(roomId, {
      type: "command",
      severity: "info",
      title: "명령",
      detail: `${normalized.commanderSlotId || normalized.issuerPlayerId || "player"}: ${normalized.commandType || "command"}`,
      actorId: normalized.issuerPlayerId || normalized.playerId || ""
    });
    room.updatedAt = this.now();
    return { ok: true, packet: normalized };
  }

  validateCommand(room, packet = {}) {
    const playerId = packet.playerId || packet.issuerPlayerId || "";
    const slotId = packet.commanderSlotId || packet.slotId || "";
    const participant = room.players.get(playerId) || room.participants.get(playerId) || null;
    if (!participant) return { ok: false, reason: "missing-player" };
    if (participant.participantType && participant.participantType !== "player") return { ok: false, reason: "spectator" };
    const slot = room.slots.find((item) => item.id === slotId);
    if (!slot) return { ok: false, reason: "missing-slot" };
    if (slot.playerId !== playerId) return { ok: false, reason: "command-authority-required" };
    const role = packet.role || slot.role || "";
    if (role && role !== slot.role) return { ok: false, reason: "role-mismatch" };
    if (!this.commandTypeAllowedForRole(slot.role, packet.commandType || packet.type)) return { ok: false, reason: "role-command-restricted" };
    const targetSquadIds = Array.isArray(packet.targetSquadIds) ? packet.targetSquadIds : [];
    const targetVehicleIds = Array.isArray(packet.targetVehicleIds) ? packet.targetVehicleIds : [];
    if ((packet.targetAssetId || targetVehicleIds.length) && slot.role !== "armor") return { ok: false, reason: "vehicle-role-restricted" };
    if ((packet.targetSquadId || targetSquadIds.length) && slot.role === "armor") return { ok: false, reason: "squad-role-restricted" };
    const targetCheck = this.targetIdsLookValid(packet, slot);
    if (!targetCheck.ok) return targetCheck;
    if (room.commands.some((item) => (item.commandId || item.id) === packet.commandId)) return { ok: false, reason: "duplicate-command" };
    const latest = this.latestCommandForSlot(room, slot.id);
    if (latest && Number(packet.issuedAt) < Number(latest.issuedAt || latest.createdAt || 0)) return { ok: false, reason: "stale-command" };
    return { ok: true };
  }

  commandTypeAllowedForRole(role = "", type = "") {
    if (!COMMAND_TYPES.includes(type)) return false;
    if (["move", "attack", "defend", "rally", "cancel"].includes(type)) return true;
    return ROLE_SPECIALS[role] === type;
  }

  targetIdsLookValid(packet = {}, slot = null) {
    const squadIds = [
      packet.targetSquadId,
      ...(Array.isArray(packet.targetSquadIds) ? packet.targetSquadIds : [])
    ].filter(Boolean);
    const vehicleIds = [
      packet.targetAssetId,
      ...(Array.isArray(packet.targetVehicleIds) ? packet.targetVehicleIds : [])
    ].filter(Boolean);
    const validSquad = (id) => /^[BR]-SQD-\d+$/i.test(String(id || ""));
    const validVehicle = (id) => /^[BR]-\d+$/i.test(String(id || "")) || /^[A-Z][A-Z0-9_-]{1,24}$/.test(String(id || ""));
    if (!squadIds.every(validSquad) || !vehicleIds.every(validVehicle)) return { ok: false, reason: "invalid-target" };
    const expectedPrefix = slot?.team === "red" ? "R-" : "B-";
    const teamBoundIds = [...squadIds, ...vehicleIds].filter((id) => /^[BR]-/i.test(String(id || "")));
    if (teamBoundIds.some((id) => !String(id).toUpperCase().startsWith(expectedPrefix))) {
      return { ok: false, reason: "target-team-mismatch" };
    }
    return { ok: true };
  }

  latestCommandForSlot(room, slotId = "") {
    return (room.commands || [])
      .filter((item) => (item.commanderSlotId || item.slotId) === slotId)
      .sort((a, b) => Number(b.issuedAt || b.createdAt || 0) - Number(a.issuedAt || a.createdAt || 0))[0] || null;
  }

  pushCombatRequest(roomId, input = {}) {
    const room = this.getOrCreateRoom(roomId);
    if (!input || typeof input !== "object") return { ok: false, reason: "invalid-combat-packet" };
    const type = String(input.type || input.requestType || "player_shot").slice(0, 32);
    if (type === "player_respawn" || type === "respawn_request" || type === "server_respawn_confirm") {
      return this.confirmRespawn(room, input);
    }
    if (type === "player_death" || type === "death_request" || type === "server_death_confirm") {
      return this.confirmDeath(room, input);
    }
    if (type === "round_state" || type === "round_confirm" || type === "server_round_confirm") {
      return this.confirmRound(room, input);
    }
    if (type === "projectile_launch" || type === "projectile_impact") {
      return this.appendServerCombatEvents(room, [this.normalizeProjectileCombatEvent(room, input)]);
    }
    return this.confirmShot(room, input);
  }

  nextCombatServerSeq(room) {
    room.combatServerSeq = Math.max(0, Math.floor(Number(room.combatServerSeq) || 0)) + 1;
    return room.combatServerSeq;
  }

  combatEventKey(event = {}) {
    if (event.deathId) return `death:${event.deathId}`;
    if (event.respawnId) return `respawn:${event.respawnId}`;
    if (event.hitId) return `hit:${event.hitId}`;
    if (event.shotId) return `shot:${event.shotId}`;
    if (event.roundSeq) return `round:${event.roundSeq}`;
    return `id:${event.id || event.eventId || Date.now()}`;
  }

  appendServerCombatEvents(room, events = []) {
    const normalized = events.filter(Boolean);
    if (!normalized.length) return { ok: true, events: [], room };
    const nextEvents = Array.isArray(room.combatEvents) ? room.combatEvents.slice(-139) : [];
    const applied = [];
    for (const event of normalized) {
      const key = this.combatEventKey(event);
      const duplicateIndex = nextEvents.findIndex((item) => this.combatEventKey(item) === key || item?.id === event.id);
      if (duplicateIndex >= 0) {
        nextEvents[duplicateIndex] = { ...nextEvents[duplicateIndex], ...event };
        applied.push(nextEvents[duplicateIndex]);
      } else {
        nextEvents.push(event);
        applied.push(event);
      }
    }
    if (nextEvents.length > 140) nextEvents.splice(0, nextEvents.length - 140);
    room.combatEvents = nextEvents;
    room.updatedAt = this.now();
    return { ok: true, events: applied, room };
  }

  normalizeServerCombatEvent(room, input = {}) {
    const serverSeq = this.nextCombatServerSeq(room);
    const createdAt = Number(input.createdAt || input.confirmedAt) || Date.now();
    const type = String(input.type || "combat_event").slice(0, 32);
    const shotId = String(input.shotId || input.eventId || input.id || "").slice(0, 96);
    const id = String(input.id || input.eventId || `${room.config.roomId}:server:${type}:${serverSeq}`).slice(0, 128);
    return {
      ...input,
      id,
      eventId: String(input.eventId || id).slice(0, 128),
      roomId: room.config.roomId,
      type,
      serverAuthority: true,
      serverSeq,
      shotId,
      createdAt,
      confirmedAt: Number(input.confirmedAt) || createdAt,
      shooterId: String(input.shooterId || input.playerId || "").slice(0, 48),
      shooterName: String(input.shooterName || input.sender || "Player").slice(0, 24),
      shooterTeam: input.shooterTeam === "red" ? "red" : "blue",
      targetPlayerId: String(input.targetPlayerId || "").slice(0, 48),
      weaponId: String(input.weaponId || "rifle").slice(0, 32),
      damageCause: String(input.damageCause || input.cause || input.weaponId || "").slice(0, 48),
      damage: this.clampCombatNumber(input.damage, 0, 999, 0),
      targetHealthBefore: this.clampCombatNumber(input.targetHealthBefore, 0, 999, 0),
      targetHealthAfter: this.clampCombatNumber(input.targetHealthAfter, 0, 999, 0),
      targetStateSeq: Math.max(0, Math.floor(Number(input.targetStateSeq) || 0)),
      shooterStateSeq: Math.max(0, Math.floor(Number(input.shooterStateSeq || input.stateSeq) || 0))
    };
  }

  normalizeProjectileCombatEvent(room, input = {}) {
    const event = this.normalizeServerCombatEvent(room, input);
    const targetPlayerId = String(input.targetPlayerId || "").slice(0, 48);
    const shooterId = String(input.shooterId || input.playerId || "").slice(0, 48);
    const rawDamage = Number(input.damage ?? input.clientDamageClaim ?? 0);
    const damageClaim = Number.isFinite(rawDamage) ? rawDamage : 0;
    const hitClaim = Boolean(targetPlayerId && (input.hit || input.clientHitClaim || damageClaim > 0));
    if (!hitClaim) return { ...event, targetPlayerId };

    const shooter = this.combatPlayer(room, shooterId);
    const target = this.combatPlayer(room, targetPlayerId);
    const targetState = this.combatPlayerState(target || {});
    const shooterState = this.combatPlayerState(shooter || {});
    const shooterTeam = shooter?.team === "red" ? "red" : shooter?.team === "blue" ? "blue" : input.shooterTeam === "red" ? "red" : "blue";
    const targetTeam = target?.team === "red" ? "red" : "blue";
    let reason = "confirmed";
    if (!shooter) reason = "missing-shooter";
    else if (!target) reason = "invalid-target";
    else if (shooterId === targetPlayerId) reason = "self-hit";
    else if (shooterTeam === targetTeam) reason = "same-team";
    else if (!shooterState.alive) reason = "shooter-dead";
    else if (!targetState.alive) reason = "target-dead";

    const accepted = reason === "confirmed";
    const targetHealthBefore = target ? Math.max(0, targetState.hp) : 0;
    return {
      ...event,
      shooterId,
      shooterTeam,
      targetPlayerId,
      accepted,
      reason,
      hit: accepted,
      damage: accepted ? event.damage : 0,
      targetHealthBefore,
      targetHealthAfter: targetHealthBefore,
      targetStateSeq: targetState.stateSeq,
      shooterStateSeq: Number(input.shooterStateSeq || input.stateSeq || shooterState.stateSeq) || 0,
      confirmedAt: Number(event.confirmedAt) || Date.now()
    };
  }

  clampCombatNumber(value, min = 0, max = 1, fallback = min) {
    const numeric = Number(value);
    const safe = Number.isFinite(numeric) ? numeric : fallback;
    return Math.max(min, Math.min(max, safe));
  }

  combatPlayer(room, playerId = "") {
    const id = String(playerId || "");
    if (!id) return null;
    return room.players.get(id) || room.participants.get(id) || null;
  }

  combatPlayerState(player = {}) {
    const position = player.position || {};
    const hp = Number(position.hp ?? player.hp);
    const maxHp = Number(position.maxHp ?? player.maxHp);
    return {
      hp: Number.isFinite(hp) ? hp : 100,
      maxHp: Number.isFinite(maxHp) ? maxHp : 100,
      alive: position.alive !== false && player.alive !== false,
      stateSeq: Math.max(0, Math.floor(Number(position.stateSeq ?? player.stateSeq) || 0)),
      x: Number(position.x ?? player.x) || 0,
      y: Number(position.y ?? player.y) || 0
    };
  }

  updateCombatPlayerState(player = {}, patch = {}) {
    if (!player) return;
    player.hp = patch.hp ?? player.hp;
    player.maxHp = patch.maxHp ?? player.maxHp;
    player.alive = patch.alive ?? player.alive;
    player.deathState = patch.deathState || player.deathState;
    player.stateSeq = patch.stateSeq ?? player.stateSeq;
    player.x = patch.x ?? player.x;
    player.y = patch.y ?? player.y;
    player.position = {
      ...(player.position || {}),
      hp: patch.hp ?? player.position?.hp ?? player.hp,
      maxHp: patch.maxHp ?? player.position?.maxHp ?? player.maxHp,
      alive: patch.alive ?? player.position?.alive ?? player.alive,
      deathState: patch.deathState || player.position?.deathState || player.deathState,
      stateSeq: patch.stateSeq ?? player.position?.stateSeq ?? player.stateSeq,
      x: patch.x ?? player.position?.x ?? player.x,
      y: patch.y ?? player.position?.y ?? player.y,
      updatedAt: Date.now()
    };
  }

  serverWeaponDamage(input = {}) {
    const weaponId = String(input.weaponId || "rifle");
    const caps = {
      pistol: 22,
      rifle: 34,
      carbine: 30,
      machinegun: 28,
      sniper: 90,
      shotgun: 62,
      grenade: 90,
      grenadeLauncher: 96,
      rpg: 120,
      projectile: 120,
      shell: 120
    };
    const raw = Number(input.damage ?? input.clientDamageClaim ?? 0);
    const cap = caps[weaponId] || 42;
    if (!Number.isFinite(raw) || raw <= 0) return Math.min(cap, 24);
    return Math.max(0, Math.min(cap, Math.round(raw * 10) / 10));
  }

  confirmShot(room, input = {}) {
    const shooterId = String(input.shooterId || input.playerId || "").slice(0, 48);
    const targetPlayerId = String(input.targetPlayerId || "").slice(0, 48);
    const shotId = String(input.shotId || input.eventId || input.id || `${room.config.roomId}:shot:${shooterId}:${Date.now()}`).slice(0, 96);
    const hitId = String(input.hitId || `${shotId}:hit:${targetPlayerId || "none"}`).slice(0, 96);
    const existing = (room.combatEvents || []).filter((event) => event.shotId === shotId || (hitId && event.hitId === hitId));
    if (existing.length) return { ok: true, duplicate: true, events: existing, room };

    const shooter = this.combatPlayer(room, shooterId);
    const target = this.combatPlayer(room, targetPlayerId);
    const targetState = this.combatPlayerState(target || {});
    const shooterState = this.combatPlayerState(shooter || {});
    const shooterTeam = shooter?.team === "red" ? "red" : "blue";
    const targetTeam = target?.team === "red" ? "red" : "blue";
    const claimedTargetSeq = Math.max(0, Math.floor(Number(input.targetStateSeq) || 0));
    const hitClaim = Boolean((input.hit || input.clientHitClaim || targetPlayerId) && targetPlayerId);
    let accepted = Boolean(hitClaim && shooter && target && shooterState.alive && targetState.alive);
    let reason = accepted ? "confirmed" : "miss";
    if (!shooter) reason = "missing-shooter";
    else if (!target && hitClaim) reason = "invalid-target";
    else if (target && shooterId === targetPlayerId) reason = "self-hit";
    else if (target && shooterTeam === targetTeam) reason = "same-team";
    else if (!shooterState.alive) reason = "shooter-dead";
    else if (target && !targetState.alive) reason = "target-dead";
    else if (target && claimedTargetSeq > 0 && targetState.stateSeq > 0 && claimedTargetSeq < targetState.stateSeq) reason = "stale-state";
    else if (!hitClaim) reason = "miss";
    if (reason !== "confirmed") accepted = false;

    const damage = accepted ? this.serverWeaponDamage(input) : 0;
    const targetHealthBefore = target ? Math.max(0, targetState.hp) : 0;
    const targetHealthAfter = accepted ? Math.max(0, Math.round((targetHealthBefore - damage) * 10) / 10) : targetHealthBefore;
    if (accepted && target) {
      this.updateCombatPlayerState(target, {
        hp: targetHealthAfter,
        maxHp: targetState.maxHp,
        alive: targetHealthAfter > 0,
        deathState: targetHealthAfter > 0 ? "alive" : "dead",
        stateSeq: targetState.stateSeq
      });
    }

    const confirmedAt = Date.now();
    const hitConfirm = this.normalizeServerCombatEvent(room, {
      ...input,
      id: `${room.config.roomId}:server_hit_confirm:${shotId}`,
      eventId: `${room.config.roomId}:server_hit_confirm:${shotId}`,
      type: "server_hit_confirm",
      shotId,
      hitId,
      accepted,
      reason,
      shooterId,
      shooterName: input.shooterName || shooter?.nickname || shooter?.name || "Player",
      shooterTeam,
      targetPlayerId,
      hit: accepted,
      lethal: accepted && targetHealthAfter <= 0,
      damage,
      targetHealthBefore,
      targetHealthAfter,
      targetStateSeq: targetState.stateSeq,
      shooterStateSeq: Number(input.shooterStateSeq || input.stateSeq || shooterState.stateSeq) || 0,
      confirmedAt
    });
    const events = [hitConfirm];
    if (accepted && target && targetHealthAfter <= 0) {
      this.applyCombatDeathStats(room, shooterId, targetPlayerId);
      const death = this.createDeathConfirm(room, {
        ...input,
        deathId: input.deathId || `${room.config.roomId}:death:${targetPlayerId}:${targetState.stateSeq || confirmedAt}`,
        hitId,
        shotId,
        killerId: shooterId,
        shooterId,
        shooterName: hitConfirm.shooterName,
        shooterTeam: hitConfirm.shooterTeam,
        targetPlayerId,
        weaponId: hitConfirm.weaponId,
        damageCause: hitConfirm.damageCause || hitConfirm.weaponId,
        targetHealthBefore,
        targetHealthAfter: 0,
        targetStateSeq: targetState.stateSeq,
        confirmedAt
      });
      events.push(death);
    }
    return this.appendServerCombatEvents(room, events);
  }

  applyCombatDeathStats(room, killerId = "", targetPlayerId = "") {
    const killer = this.combatPlayer(room, killerId);
    const target = this.combatPlayer(room, targetPlayerId);
    if (killer && killerId && killerId !== targetPlayerId) {
      killer.stats = killer.stats || {};
      killer.stats.kills = Math.max(0, Math.floor(Number(killer.stats.kills) || 0)) + 1;
    }
    if (target) {
      target.stats = target.stats || {};
      target.stats.deaths = Math.max(0, Math.floor(Number(target.stats.deaths) || 0)) + 1;
    }
  }

  createDeathConfirm(room, input = {}) {
    const serverSeq = this.nextCombatServerSeq(room);
    const confirmedAt = Number(input.confirmedAt) || Date.now();
    const targetPlayerId = String(input.targetPlayerId || "").slice(0, 48);
    const killerId = String(input.killerId || input.shooterId || "").slice(0, 48);
    const deathId = String(input.deathId || `${room.config.roomId}:death:${targetPlayerId}:${input.targetStateSeq || confirmedAt}`).slice(0, 96);
    return {
      ...input,
      id: `${room.config.roomId}:server_death_confirm:${deathId}`,
      eventId: `${room.config.roomId}:server_death_confirm:${deathId}`,
      roomId: room.config.roomId,
      type: "server_death_confirm",
      serverAuthority: true,
      serverSeq,
      deathId,
      hitId: String(input.hitId || "").slice(0, 96),
      shotId: String(input.shotId || "").slice(0, 96),
      killerId,
      shooterId: String(input.shooterId || killerId).slice(0, 48),
      shooterName: String(input.shooterName || "Player").slice(0, 24),
      shooterTeam: input.shooterTeam === "red" ? "red" : "blue",
      targetPlayerId,
      weaponId: String(input.weaponId || "damage").slice(0, 32),
      damageCause: String(input.damageCause || input.weaponId || "damage").slice(0, 48),
      lethal: true,
      hit: true,
      targetHealthBefore: this.clampCombatNumber(input.targetHealthBefore, 0, 999, 0),
      targetHealthAfter: 0,
      targetStateSeq: Math.max(0, Math.floor(Number(input.targetStateSeq) || 0)),
      confirmedAt,
      createdAt: confirmedAt,
      killLogText: String(input.killLogText || `${killerId || "unknown"} -> ${targetPlayerId || "target"}`).slice(0, 96)
    };
  }

  confirmDeath(room, input = {}) {
    const targetPlayerId = String(input.targetPlayerId || "").slice(0, 48);
    if (!targetPlayerId) return { ok: false, reason: "missing-target" };
    const deathId = String(input.deathId || `${room.config.roomId}:death:${targetPlayerId}:${input.targetStateSeq || Date.now()}`).slice(0, 96);
    const existing = (room.combatEvents || []).filter((event) => event.deathId === deathId);
    if (existing.length) return { ok: true, duplicate: true, events: existing, room };
    const target = this.combatPlayer(room, targetPlayerId);
    const killerId = String(input.killerId || input.shooterId || "").slice(0, 48);
    const killer = this.combatPlayer(room, killerId);
    const targetState = this.combatPlayerState(target || {});
    const incomingSeq = Math.max(0, Math.floor(Number(input.targetStateSeq) || 0));
    if (killerId && killerId === targetPlayerId) {
      return { ok: false, reason: "self-death" };
    }
    if (killer && target && killer.team === target.team) {
      return { ok: false, reason: "same-team" };
    }
    if (target && targetState.alive && incomingSeq > 0 && targetState.stateSeq > incomingSeq) {
      return { ok: false, reason: "stale-death" };
    }
    if (target) {
      this.updateCombatPlayerState(target, {
        hp: 0,
        maxHp: targetState.maxHp,
        alive: false,
        deathState: "dead",
        stateSeq: Number(input.targetStateSeq) || targetState.stateSeq
      });
    }
    this.applyCombatDeathStats(room, killerId, targetPlayerId);
    const death = this.createDeathConfirm(room, {
      ...input,
      deathId,
      targetPlayerId,
      killerId,
      shooterTeam: killer?.team || input.shooterTeam
    });
    return this.appendServerCombatEvents(room, [death]);
  }

  confirmRespawn(room, input = {}) {
    const playerId = String(input.targetPlayerId || input.playerId || input.shooterId || "").slice(0, 48);
    if (!playerId) return { ok: false, reason: "missing-player" };
    const player = this.combatPlayer(room, playerId);
    if (!player) return { ok: false, reason: "missing-player" };
    const state = this.combatPlayerState(player);
    const stateSeq = Math.max(state.stateSeq + 1, Math.floor(Number(input.targetStateSeq || input.stateSeq) || 0));
    const x = Number(input.hitX ?? input.x2 ?? input.x ?? state.x) || state.x;
    const y = Number(input.hitY ?? input.y2 ?? input.y ?? state.y) || state.y;
    const hp = this.clampCombatNumber(input.targetHealthAfter ?? input.hp, 1, state.maxHp || 100, state.maxHp || 100);
    const respawnId = String(input.respawnId || `${room.config.roomId}:respawn:${playerId}:${stateSeq}`).slice(0, 96);
    const existing = (room.combatEvents || []).filter((event) => event.respawnId === respawnId);
    if (existing.length) return { ok: true, duplicate: true, events: existing, room };
    this.updateCombatPlayerState(player, {
      hp,
      maxHp: state.maxHp || hp,
      alive: true,
      deathState: "alive",
      stateSeq,
      x,
      y
    });
    const confirmedAt = Date.now();
    const respawn = {
      id: `${room.config.roomId}:server_respawn_confirm:${respawnId}`,
      eventId: `${room.config.roomId}:server_respawn_confirm:${respawnId}`,
      roomId: room.config.roomId,
      type: "server_respawn_confirm",
      serverAuthority: true,
      serverSeq: this.nextCombatServerSeq(room),
      respawnId,
      playerId,
      shooterId: playerId,
      shooterName: player.nickname || player.name || "Player",
      shooterTeam: player.team || "blue",
      targetPlayerId: playerId,
      weaponId: "respawn",
      damageCause: "respawn",
      targetHealthBefore: 0,
      targetHealthAfter: hp,
      hp,
      maxHp: state.maxHp || hp,
      targetStateSeq: stateSeq,
      stateSeq,
      x1: x,
      y1: y,
      x2: x,
      y2: y,
      hitX: x,
      hitY: y,
      alive: true,
      deathState: "alive",
      invulnerableUntil: Number(input.invulnerableUntil) || confirmedAt + 1200,
      confirmedAt,
      createdAt: confirmedAt
    };
    return this.appendServerCombatEvents(room, [respawn]);
  }

  confirmRound(room, input = {}) {
    const confirmedAt = Date.now();
    const event = {
      id: `${room.config.roomId}:server_round_confirm:${input.roundSeq || confirmedAt}`,
      eventId: `${room.config.roomId}:server_round_confirm:${input.roundSeq || confirmedAt}`,
      roomId: room.config.roomId,
      type: "server_round_confirm",
      serverAuthority: true,
      serverSeq: this.nextCombatServerSeq(room),
      roundSeq: Math.max(0, Math.floor(Number(input.roundSeq) || 0)),
      phase: String(input.phase || room.phase || "playing").slice(0, 18),
      blueScore: Math.max(0, Math.floor(Number(input.blueScore) || 0)),
      redScore: Math.max(0, Math.floor(Number(input.redScore) || 0)),
      winner: ["blue", "red", "draw", ""].includes(input.winner) ? input.winner : "",
      reason: String(input.reason || "").slice(0, 64),
      startedAt: input.startedAt || room.config.startedAt || 0,
      endedAt: input.endedAt || room.config.endedAt || 0,
      confirmedAt,
      createdAt: confirmedAt
    };
    return this.appendServerCombatEvents(room, [event]);
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
