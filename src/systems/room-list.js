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
      screen.setAttribute("aria-label", "온라인 방 목록");

      const card = document.createElement("section");
      card.className = "room-list-card";
      card.innerHTML = `
        <header class="room-list-head">
          <span>온라인</span>
          <h2>방 목록</h2>
          <p>관리자가 생성한 테스트 방에 참가하거나 진행 중인 방을 관전합니다.</p>
        </header>
        <div class="room-list-toolbar">
          <button type="button" id="roomRefreshButton">새로고침</button>
          <button type="button" id="roomBackButton">처음으로</button>
        </div>
        <div class="room-list-items" id="roomListItems"></div>
      `;
      screen.append(card);
      document.body.append(screen);
      this.nodes = {
        screen,
        items: card.querySelector("#roomListItems"),
        refresh: card.querySelector("#roomRefreshButton"),
        back: card.querySelector("#roomBackButton")
      };
      this.nodes.refresh.addEventListener("click", () => {
        this.lastSignature = "";
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
      const signature = JSON.stringify(rooms);
      if (this.lastSignature === signature) return;
      this.lastSignature = signature;
      this.nodes.items.textContent = "";

      if (rooms.length === 0) {
        const empty = document.createElement("div");
        empty.className = "room-list-empty";
        empty.innerHTML = `
          <strong>생성된 방 없음</strong>
          <span>관리자 운영센터에서 방을 만든 뒤 다시 확인하세요.</span>
        `;
        this.nodes.items.append(empty);
        return;
      }

      for (const room of rooms) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "room-list-item";
        button.disabled = room.phase === "ended";
        const blueFaction = this.factionLabel(room.blueFactionId);
        const redFaction = this.factionLabel(room.redFactionId);
        const players = (room.players || []).filter((player) => player.participantType !== "spectator");
        const playerCount = players.length;
        const spectatorCount = (room.spectators || []).length;
        const capacity = room.capacity || 8;
        const spectatorJoin = room.phase === "playing" || room.locked || playerCount >= capacity;
        const joinLabel = spectatorJoin ? "관전 입장" : "참가";
        button.dataset.phase = room.phase || "waiting";
        button.classList.toggle("is-spectator-join", spectatorJoin);
        button.innerHTML = `
          <strong>${this.escape(room.name)}</strong>
          <span>${this.modeLabel(room.mode)} · ${this.phaseLabel(room.phase)} · ${blueFaction} vs ${redFaction} · 슬롯 ${playerCount}/${capacity} · 관전 ${spectatorCount}</span>
          <em>${this.escape(room.id)} · ${joinLabel}</em>
        `;
        button.addEventListener("click", () => this.flow.joinOnlineRoom(room));
        this.nodes.items.append(button);
      }
    }

    modeLabel(mode) {
      return mode === "conquest" ? "점령전" : "섬멸전";
    }

    phaseLabel(phase) {
      if (phase === "playing") return "진행 중";
      if (phase === "loading") return "로딩";
      if (phase === "ended") return "종료";
      return "대기";
    }

    factionLabel(id) {
      return IronLine.playerFactionById?.(id)?.name || IronLine.playerSkinById?.(id)?.name || "세력 미정";
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
