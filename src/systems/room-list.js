"use strict";

(function registerRoomList(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  class RoomList {
    constructor(flow) {
      this.flow = flow;
      this.nodes = {};
      this.lastSignature = "";
      this.unsubscribe = IronLine.roomRegistry?.onChange?.(() => {
        this.lastSignature = "";
        this.renderRooms();
      });
    }

    ensure() {
      if (this.nodes.screen) return;
      const screen = document.createElement("div");
      screen.id = "onlineRoomListScreen";
      screen.className = "room-list-screen hidden";
      screen.setAttribute("aria-label", "방 목록");

      const card = document.createElement("section");
      card.className = "room-list-card";
      card.innerHTML = `
        <header class="room-list-head">
          <h2>방 목록</h2>
        </header>
        <div class="room-list-toolbar">
          <button type="button" id="roomCreateButton" class="room-list-create">방 만들기</button>
          <button type="button" id="roomRefreshButton">새로고침</button>
          <button type="button" id="roomBackButton" class="room-list-muted">메인</button>
        </div>
        <div class="room-list-items" id="roomListItems"></div>
      `;
      screen.append(card);
      document.body.append(screen);
      this.nodes = {
        screen,
        items: card.querySelector("#roomListItems"),
        create: card.querySelector("#roomCreateButton"),
        refresh: card.querySelector("#roomRefreshButton"),
        back: card.querySelector("#roomBackButton")
      };
      this.nodes.create.addEventListener("click", () => this.flow.createOnlineRoom());
      this.nodes.refresh.addEventListener("click", () => {
        this.lastSignature = "";
        IronLine.roomRegistry?.refreshRemoteRooms?.();
        this.renderRooms();
      });
      this.nodes.back.addEventListener("click", () => this.flow.backToEntry());
    }

    update(game) {
      this.ensure();
      const visible = Boolean(game.roomListOpen);
      this.nodes.screen.classList.toggle("hidden", !visible);
      document.body.classList.toggle("room-list-open", visible);
      if (!visible) return;
      this.renderRooms();
    }

    renderRooms() {
      if (!this.nodes.items) return;
      const rooms = IronLine.roomRegistry?.listRooms?.() || [];
      const signature = JSON.stringify(rooms.map((room) => ({
        id: room.id,
        name: room.name,
        phase: room.phase,
        locked: room.locked,
        players: (room.players || []).filter((player) => (player.participantType || "player") === "player").length,
        capacity: room.capacity,
        updatedAt: room.updatedAt
      })));
      if (this.lastSignature === signature) return;
      this.lastSignature = signature;
      this.nodes.items.textContent = "";

      if (rooms.length === 0) {
        const empty = document.createElement("div");
        empty.className = "room-list-empty";
        empty.innerHTML = `
          <strong>방이 없습니다</strong>
          <span>방 만들기로 새 전장을 열 수 있습니다.</span>
        `;
        this.nodes.items.append(empty);
        return;
      }

      for (const room of rooms) {
        const players = (room.players || []).filter((player) => (player.participantType || "player") === "player");
        const playerCount = players.length;
        const capacity = IronLine.roomRegistry?.effectiveRoomCapacity?.(room) ?? room.capacity ?? 8;
        const full = playerCount >= capacity;
        const canJoin = room.phase !== "ended" && room.phase !== "playing" && room.phase !== "loading" && !room.locked && !full;
        const status = this.roomStatusLabel(room, full);

        const wrap = document.createElement("div");
        wrap.className = "room-list-item-wrap";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "room-list-item";
        button.dataset.phase = room.phase || "waiting";
        button.disabled = !canJoin;
        button.innerHTML = `
          <span class="room-list-title">
            <strong>${this.escape(room.name || "온라인 방")}</strong>
            <small>${status} · ${playerCount}/${capacity}명</small>
          </span>
          <span class="room-list-action">${canJoin ? "입장" : "마감"}</span>
        `;
        button.addEventListener("click", () => {
          if (canJoin) this.flow.joinOnlineRoom(room, { participantType: "player" });
        });
        wrap.append(button);
        this.nodes.items.append(wrap);
      }
    }

    roomStatusLabel(room, full = false) {
      if (room?.phase === "ended") return "종료";
      if (room?.phase === "playing") return "진행 중";
      if (room?.phase === "loading") return "로딩 중";
      if (room?.locked) return "잠김";
      if (full) return "가득 참";
      return "대기 중";
    }

    escape(value) {
      return String(value || "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
      })[char]);
    }
  }

  IronLine.RoomList = RoomList;
})(window);
