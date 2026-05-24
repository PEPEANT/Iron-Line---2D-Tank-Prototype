"use strict";

(function registerHudAdminRoomControls(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  const methods = {
    renderAdminRoomSlotLocks(room = null) {
      const root = this.nodes.adminRoomSlotLocks;
      if (!root) return;
      if (!room?.id) {
        root.dataset.signature = "empty";
        root.textContent = "";
        const empty = document.createElement("span");
        empty.className = "admin-observer-empty";
        empty.textContent = "선택한 방이 없으면 슬롯 제어를 사용할 수 없습니다.";
        root.append(empty);
        return;
      }
      const playersBySlot = new Map(
        (room.players || [])
          .filter((player) => (player.participantType || "player") === "player" && player.slotId)
          .map((player) => [player.slotId, player])
      );
      const locked = new Set(room.slotLocks || []);
      const rows = (IronLine.roomSlotDefinitions?.() || []).map((slot) => {
        const player = playersBySlot.get(slot.id) || null;
        return {
          id: slot.id,
          label: slot.label,
          locked: locked.has(slot.id),
          occupied: Boolean(player),
          playerName: player?.name || player?.nickname || ""
        };
      });
      const signature = JSON.stringify([room.id, room.phase, rows]);
      if (root.dataset.signature === signature) return;
      root.dataset.signature = signature;
      root.textContent = "";
      for (const item of rows) {
        const row = document.createElement("div");
        row.className = "admin-room-slot-lock-row";
        row.dataset.team = item.id.startsWith("red-") ? "red" : "blue";
        const title = document.createElement("strong");
        title.textContent = item.label;
        const meta = document.createElement("span");
        meta.textContent = item.occupied
          ? `${item.playerName} 사용 중`
          : item.locked
            ? "닫힌 대기 슬롯"
            : "열린 대기 슬롯";
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.slotId = item.id;
        button.dataset.locked = String(item.locked);
        button.textContent = item.locked ? "열기" : "닫기";
        button.disabled = room.phase !== "waiting" || (!item.locked && item.occupied);
        button.addEventListener("click", () => {
          IronLine.game?.adminSetRoomSlotLock?.(room.id, item.id, !item.locked);
        });
        row.append(title, meta, button);
        root.append(row);
      }
    }
  };

  function installHudAdminRoomControls(Hud) {
    Object.assign(Hud.prototype, methods);
  }

  IronLine.installHudAdminRoomControls = installHudAdminRoomControls;
})(window);
