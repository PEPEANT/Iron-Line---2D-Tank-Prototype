"use strict";

(function registerRoomSlotConfig(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM = { BLUE: "blue", RED: "red" } } = IronLine.constants || {};

  const ROLE_SLOT_IDS = Object.freeze([
    "blue-infantry",
    "blue-engineer",
    "blue-recon",
    "blue-armor",
    "red-infantry",
    "red-engineer",
    "red-recon",
    "red-armor"
  ]);
  const DEFAULT_SPECTATOR_CAPACITY = 12;
  const MAX_SPECTATOR_CAPACITY = 12;

  function normalizeRoomSlotId(slotId = "") {
    const text = String(slotId || "");
    return text.endsWith("-scout") ? text.replace("-scout", "-recon") : text;
  }

  function roomSlotTeam(slotId = "") {
    if (String(slotId).startsWith("red-")) return TEAM.RED;
    if (String(slotId).startsWith("blue-")) return TEAM.BLUE;
    return "";
  }

  function roomSlotLabel(slotId = "") {
    const normalized = normalizeRoomSlotId(slotId);
    const side = normalized.startsWith("red-") ? "홍팀" : "청팀";
    if (normalized.includes("engineer")) return `${side} 공병`;
    if (normalized.includes("recon")) return `${side} 정찰`;
    if (normalized.includes("armor")) return `${side} 기갑`;
    return `${side} 보병`;
  }

  function roomSlotDefinitions() {
    return ROLE_SLOT_IDS.map((slotId) => ({
      id: slotId,
      team: roomSlotTeam(slotId),
      label: roomSlotLabel(slotId)
    }));
  }

  function normalizeRoomSlotLocks(room = {}) {
    const fromSlotLocks = Array.isArray(room.slotLocks) ? room.slotLocks : [];
    const fromRoleSlots = Array.isArray(room.roleSlots)
      ? room.roleSlots.filter((slot) => slot?.locked).map((slot) => slot?.id)
      : [];
    const fromSlots = Array.isArray(room.slots)
      ? room.slots.filter((slot) => slot?.locked).map((slot) => slot?.id)
      : [];
    return Array.from(new Set([...fromSlotLocks, ...fromRoleSlots, ...fromSlots]
      .map((slotId) => normalizeRoomSlotId(slotId))
      .filter((slotId) => ROLE_SLOT_IDS.includes(slotId))));
  }

  function effectiveRoomHumanCapacity(room = {}, fallbackCapacity = 8) {
    const requestedCapacity = Math.max(0, Math.round(Number(room.capacity) || fallbackCapacity));
    const locked = new Set(normalizeRoomSlotLocks(room));
    const occupied = new Set(
      (room.players || [])
        .map((player) => normalizeRoomSlotId(player?.slotId))
        .filter((slotId) => ROLE_SLOT_IDS.includes(slotId))
    );
    const availableHumanSlots = ROLE_SLOT_IDS.filter((slotId) => !locked.has(slotId) || occupied.has(slotId)).length;
    return Math.max(0, Math.min(requestedCapacity, availableHumanSlots));
  }

  function normalizeSpectatorCapacity(value, fallbackCapacity = DEFAULT_SPECTATOR_CAPACITY) {
    const rounded = Math.round(Number(value));
    const fallback = Math.round(Number(fallbackCapacity));
    const safe = Number.isFinite(rounded)
      ? rounded
      : (Number.isFinite(fallback) ? fallback : DEFAULT_SPECTATOR_CAPACITY);
    return Math.max(0, Math.min(MAX_SPECTATOR_CAPACITY, safe));
  }

  IronLine.roomSlotIds = ROLE_SLOT_IDS.slice();
  IronLine.normalizeRoomSlotId = normalizeRoomSlotId;
  IronLine.roomSlotTeam = roomSlotTeam;
  IronLine.roomSlotLabel = roomSlotLabel;
  IronLine.roomSlotDefinitions = roomSlotDefinitions;
  IronLine.normalizeRoomSlotLocks = normalizeRoomSlotLocks;
  IronLine.effectiveRoomHumanCapacity = effectiveRoomHumanCapacity;
  IronLine.normalizeSpectatorCapacity = normalizeSpectatorCapacity;
})(window);
