"use strict";

(function registerRoomList(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  class RoomList {
    constructor(flow) {
      this.flow = flow;
      this.nodes = {};
      this.lastSignature = "";
      this.createPanelOpen = false;
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
        <form id="roomCreatePanel" class="room-create-panel hidden">
          <label class="room-create-name">
            <span>방 이름</span>
            <input id="roomCreateName" type="text" maxlength="32" autocomplete="off">
          </label>
          <div class="room-create-grid">
            <label>
              <span>모드</span>
              <select id="roomCreateMode">
                <option value="annihilation">섬멸전</option>
                <option value="conquest">점령전</option>
              </select>
            </label>
            <label>
              <span>난이도</span>
              <select id="roomCreateDifficulty">
                <option value="normal">보통</option>
                <option value="easy">쉬움</option>
                <option value="hard">어려움</option>
              </select>
            </label>
            <label>
              <span>인원</span>
              <input id="roomCreateCapacity" type="number" min="1" max="8" step="1">
            </label>
            <label>
              <span>청 전차</span>
              <input id="roomCreateBlueTanks" type="number" min="0" max="8" step="1">
            </label>
            <label>
              <span>청 보병</span>
              <input id="roomCreateBlueInfantry" type="number" min="4" max="56" step="1">
            </label>
            <label>
              <span>홍 전차</span>
              <input id="roomCreateRedTanks" type="number" min="1" max="10" step="1">
            </label>
            <label>
              <span>홍 보병</span>
              <input id="roomCreateRedInfantry" type="number" min="4" max="64" step="1">
            </label>
          </div>
          <label class="room-create-check">
            <input id="roomCreateAiFill" type="checkbox">
            <span>빈 슬롯 AI 지휘 유지</span>
          </label>
          <div class="room-create-actions">
            <button type="submit">생성</button>
            <button type="button" id="roomCreateCancel" class="room-list-muted">취소</button>
          </div>
        </form>
        <div class="room-list-items" id="roomListItems"></div>
      `;
      screen.append(card);
      document.body.append(screen);
      this.nodes = {
        screen,
        items: card.querySelector("#roomListItems"),
        create: card.querySelector("#roomCreateButton"),
        refresh: card.querySelector("#roomRefreshButton"),
        back: card.querySelector("#roomBackButton"),
        createPanel: card.querySelector("#roomCreatePanel"),
        createCancel: card.querySelector("#roomCreateCancel"),
        createName: card.querySelector("#roomCreateName"),
        createMode: card.querySelector("#roomCreateMode"),
        createDifficulty: card.querySelector("#roomCreateDifficulty"),
        createCapacity: card.querySelector("#roomCreateCapacity"),
        createBlueTanks: card.querySelector("#roomCreateBlueTanks"),
        createBlueInfantry: card.querySelector("#roomCreateBlueInfantry"),
        createRedTanks: card.querySelector("#roomCreateRedTanks"),
        createRedInfantry: card.querySelector("#roomCreateRedInfantry"),
        createAiFill: card.querySelector("#roomCreateAiFill")
      };
      this.nodes.create.addEventListener("click", () => this.setCreatePanelOpen(!this.createPanelOpen));
      this.nodes.createCancel.addEventListener("click", () => this.setCreatePanelOpen(false));
      this.nodes.createPanel.addEventListener("submit", (event) => {
        event.preventDefault();
        const created = this.flow.createOnlineRoom(this.readCreateSettings());
        if (created) this.setCreatePanelOpen(false);
      });
      this.nodes.refresh.addEventListener("click", () => {
        this.lastSignature = "";
        IronLine.roomRegistry?.refreshRemoteRooms?.();
        IronLine.roomRegistry?.cleanupStaleParticipants?.();
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

    setCreatePanelOpen(open) {
      this.createPanelOpen = Boolean(open);
      if (this.createPanelOpen) this.populateCreateSettings();
      this.nodes.createPanel?.classList.toggle("hidden", !this.createPanelOpen);
      this.nodes.create?.classList.toggle("active", this.createPanelOpen);
      if (this.nodes.create) this.nodes.create.textContent = this.createPanelOpen ? "닫기" : "방 만들기";
    }

    populateCreateSettings() {
      const game = IronLine.game || null;
      const match = game?.matchConfig || game?.defaultMatchConfig?.() || {};
      const roomCount = IronLine.roomRegistry?.listRooms?.().length || 0;
      if (this.nodes.createName) this.nodes.createName.value = `온라인 방 ${roomCount + 1}`;
      if (this.nodes.createMode) this.nodes.createMode.value = match.mode || "annihilation";
      if (this.nodes.createDifficulty) this.nodes.createDifficulty.value = match.difficulty || "normal";
      if (this.nodes.createCapacity) this.nodes.createCapacity.value = "8";
      if (this.nodes.createBlueTanks) this.nodes.createBlueTanks.value = String(match.blueAiTanks ?? 3);
      if (this.nodes.createBlueInfantry) this.nodes.createBlueInfantry.value = String(match.blueInfantry ?? 21);
      if (this.nodes.createRedTanks) this.nodes.createRedTanks.value = String(match.redTanks ?? 5);
      if (this.nodes.createRedInfantry) this.nodes.createRedInfantry.value = String(match.redInfantry ?? 24);
      if (this.nodes.createAiFill) this.nodes.createAiFill.checked = true;
    }

    readCreateSettings() {
      const numberValue = (node, fallback) => {
        const value = Math.round(Number(node?.value));
        return Number.isFinite(value) ? value : fallback;
      };
      return {
        name: String(this.nodes.createName?.value || "온라인 방").trim().slice(0, 32) || "온라인 방",
        mode: this.nodes.createMode?.value === "conquest" ? "conquest" : "annihilation",
        difficulty: ["easy", "normal", "hard"].includes(this.nodes.createDifficulty?.value) ? this.nodes.createDifficulty.value : "normal",
        capacity: numberValue(this.nodes.createCapacity, 8),
        blueAiTanks: numberValue(this.nodes.createBlueTanks, 3),
        blueInfantry: numberValue(this.nodes.createBlueInfantry, 21),
        redTanks: numberValue(this.nodes.createRedTanks, 5),
        redInfantry: numberValue(this.nodes.createRedInfantry, 24),
        aiFillEmptySlots: this.nodes.createAiFill?.checked !== false
      };
    }

    renderRooms() {
      if (!this.nodes.items) return;
      const registry = IronLine.roomRegistry;
      const rooms = registry?.listVisibleRooms?.() || registry?.listRooms?.() || [];
      const signature = JSON.stringify({
        createPanelOpen: this.createPanelOpen,
        rooms: rooms.map((room) => ({
          id: room.id,
          name: room.name,
          phase: room.phase,
          locked: room.locked,
          players: (room.players || []).filter((player) => (player.participantType || "player") === "player").length,
          capacity: room.capacity,
          blueAiTanks: room.blueAiTanks,
          blueInfantry: room.blueInfantry,
          redTanks: room.redTanks,
          redInfantry: room.redInfantry,
          updatedAt: room.updatedAt
        }))
      });
      if (this.lastSignature === signature) return;
      this.lastSignature = signature;
      this.nodes.items.textContent = "";

      if (rooms.length === 0) {
        const empty = document.createElement("div");
        empty.className = "room-list-empty";
        empty.innerHTML = `
          <strong>방이 없습니다</strong>
          <span>방 만들기에서 AI 수와 모드를 정한 뒤 시작할 수 있습니다.</span>
        `;
        this.nodes.items.append(empty);
        return;
      }

      for (const room of rooms) {
        const players = (room.players || []).filter((player) => (player.participantType || "player") === "player");
        const playerCount = players.length;
        const capacity = registry?.effectiveRoomCapacity?.(room) ?? room.capacity ?? 8;
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
            <small>${status} · ${playerCount}/${capacity}명 · AI ${room.blueInfantry ?? 0}/${room.redInfantry ?? 0}</small>
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
