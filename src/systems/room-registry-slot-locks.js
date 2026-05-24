"use strict";

(function registerRoomRegistrySlotLocks(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const roleSlotIds = IronLine.roomSlotIds || [];

  if (!IronLine.RoomRegistry) return;

  Object.assign(IronLine.RoomRegistry.prototype, {
    normalizeRoomSlotLocks(room = {}) {
      return IronLine.normalizeRoomSlotLocks?.(room) || [];
    },

    effectiveRoomCapacity(room = {}) {
      const fallback = this.normalizeRoomNumber?.(room.capacity, { min: 0, max: 8, fallback: 8 }) ?? 8;
      return IronLine.effectiveRoomHumanCapacity?.(room, fallback) ?? fallback;
    },

    setSlotLocked(roomId, slotId, locked = true) {
      const room = this.getRoom(roomId);
      const normalizedSlotId = IronLine.normalizeRoomSlotId?.(slotId) || String(slotId || "");
      if (!room || !roleSlotIds.includes(normalizedSlotId) || room.phase !== "waiting") return null;
      const occupied = (room.players || []).some((player) => (IronLine.normalizeRoomSlotId?.(player.slotId) || player.slotId) === normalizedSlotId);
      if (occupied && locked) return null;
      const nextLocks = new Set(this.normalizeRoomSlotLocks(room));
      if (locked) nextLocks.add(normalizedSlotId);
      else nextLocks.delete(normalizedSlotId);
      return this.updateRoom(roomId, {
        slotLocks: Array.from(nextLocks),
        events: this.nextEvents(room, {
          type: locked ? "slot_locked" : "slot_unlocked",
          severity: "info",
          title: locked ? "슬롯 닫힘" : "슬롯 열림",
          detail: `${IronLine.roomSlotLabel?.(normalizedSlotId) || normalizedSlotId} 슬롯이 ${locked ? "닫혔" : "다시 열렸"}습니다.`
        })
      });
    }
  });
})(window);
