"use strict";

(function registerEntryFlow(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  class EntryFlow {
    constructor(hud) {
      this.hud = hud;
      this.selectedMode = "offline";
      this.selectedFactionId = "";
      this.factionSignature = "";
      this.roomSignature = "";
      this.bound = false;
    }

    get nodes() {
      return this.hud.nodes;
    }

    ensure() {
      const ui = this.nodes;
      if (!ui || ui.entryScreen) {
        this.bind();
        return;
      }

      const screen = document.createElement("div");
      screen.id = "entryScreen";
      screen.className = "entry-screen hidden";
      screen.setAttribute("aria-label", "전장 입장");

      const card = document.createElement("div");
      card.className = "entry-card";

      const factionPane = document.createElement("section");
      factionPane.className = "entry-faction-pane";
      const head = document.createElement("div");
      head.className = "entry-head";
      head.innerHTML = `
        <span class="entry-mark">IRON LINE</span>
        <div>
          <h1>전장 입장</h1>
          <p id="entryIntro">왼쪽에서 세력을 고르고, 오른쪽에서 플레이 상태를 확인합니다.</p>
        </div>
      `;
      const skinWrap = document.createElement("div");
      skinWrap.className = "entry-skin-wrap";
      const skinLabel = document.createElement("span");
      skinLabel.className = "entry-label";
      skinLabel.textContent = "세력 스킨";
      const skinList = document.createElement("div");
      skinList.id = "entrySkinList";
      skinList.className = "entry-skin-list";
      const skinDetail = document.createElement("article");
      skinDetail.id = "entrySkinDetail";
      skinDetail.className = "entry-skin-detail";
      skinWrap.append(skinLabel, skinList, skinDetail);

      const onlineRooms = document.createElement("section");
      onlineRooms.id = "entryOnlineRooms";
      onlineRooms.className = "entry-online-rooms hidden";
      onlineRooms.innerHTML = `
        <div class="entry-online-head">
          <span>ONLINE ROOMS</span>
          <strong>참가 가능한 방</strong>
          <p>방 카드를 누르면 바로 대기방으로 입장합니다. 진행 중이거나 정원이 찬 방은 관전자로 들어갑니다.</p>
        </div>
        <div class="entry-online-toolbar">
          <button type="button" id="entryRoomRefreshButton">새로고침</button>
        </div>
        <div class="entry-online-list" id="entryOnlineRoomList"></div>
      `;
      factionPane.append(head, skinWrap, onlineRooms);

      const panel = document.createElement("section");
      panel.className = "entry-panel entry-session-pane";

      const nameField = document.createElement("label");
      nameField.className = "entry-field";
      const nameLabel = document.createElement("span");
      nameLabel.textContent = "닉네임";
      const nickname = document.createElement("input");
      nickname.id = "entryNickname";
      nickname.type = "text";
      nickname.maxLength = 16;
      nickname.autocomplete = "nickname";
      nickname.placeholder = "닉네임";
      nameField.append(nameLabel, nickname);

      const modeWrap = document.createElement("div");
      modeWrap.className = "entry-mode-wrap";
      const modeLabel = document.createElement("span");
      modeLabel.className = "entry-label";
      modeLabel.textContent = "모드";
      const modeList = document.createElement("div");
      modeList.id = "entryModeList";
      modeList.className = "entry-mode-list";
      modeWrap.append(modeLabel, modeList);

      const roomStatus = document.createElement("section");
      roomStatus.id = "entryRoomStatus";
      roomStatus.className = "entry-room-status";

      const status = document.createElement("p");
      status.id = "entryStatus";
      status.className = "entry-status";

      const enter = document.createElement("button");
      enter.id = "entryEnterButton";
      enter.type = "button";
      enter.className = "entry-enter";

      panel.append(nameField, modeWrap, roomStatus, status, enter);
      card.append(factionPane, panel);
      screen.append(card);
      document.body.prepend(screen);

      ui.entryScreen = screen;
      ui.entryIntro = head.querySelector("#entryIntro");
      ui.entryNickname = nickname;
      ui.entrySkinWrap = skinWrap;
      ui.entrySkinList = skinList;
      ui.entrySkinDetail = skinDetail;
      ui.entryOnlineRooms = onlineRooms;
      ui.entryOnlineRoomList = onlineRooms.querySelector("#entryOnlineRoomList");
      ui.entryRoomRefreshButton = onlineRooms.querySelector("#entryRoomRefreshButton");
      ui.entryModeList = modeList;
      ui.entryRoomStatus = roomStatus;
      ui.entryEnterButton = enter;
      ui.entryStatus = status;
      this.bind();
    }

    bind() {
      const ui = this.nodes;
      if (this.bound || !ui?.entryEnterButton || !ui.entryNickname) return;
      this.bound = true;
      ui.entryEnterButton.addEventListener("click", () => this.submit());
      ui.entryRoomRefreshButton?.addEventListener("click", () => {
        this.roomSignature = "";
        this.renderEntryRooms(IronLine.game);
      });
      ui.entryNickname.addEventListener("keydown", (event) => {
        if (event.key === "Enter") this.submit();
      });
    }

    entryProfile(game) {
      const fallbackFaction = IronLine.playerFactions?.[0]?.id || IronLine.playerSkins?.[0]?.id || "korea";
      const factionId = this.selectedFactionId || game.localProfile?.factionId || game.localProfile?.skinId || fallbackFaction;
      return {
        nickname: this.nodes.entryNickname?.value || game.localProfile?.nickname || "",
        factionId,
        skinId: factionId
      };
    }

    submit() {
      const game = IronLine.game;
      if (!game) return;
      const profile = this.entryProfile(game);
      if (this.selectedMode === "online") {
        this.roomSignature = "";
        this.renderEntryRooms(game);
        if (this.nodes.entryStatus) this.nodes.entryStatus.textContent = "방 카드를 선택하면 바로 대기방으로 입장합니다.";
        game.setLocalProfile?.(profile);
        return;
      }
      if (this.hud.sessionFlow?.submitEntry?.(this.selectedMode, profile)) return;
      game.completeEntryProfile(profile);
    }

    joinRoom(room) {
      const game = IronLine.game;
      if (!game || !room) return false;
      game.setLocalProfile?.(this.entryProfile(game));
      return Boolean(this.hud.sessionFlow?.joinOnlineRoom?.(room));
    }

    update(game) {
      this.ensure();
      const ui = this.nodes;
      if (!ui?.entryScreen) return;

      const visible = Boolean(game.entryOpen);
      ui.entryScreen.classList.toggle("hidden", !visible);
      document.body.classList.toggle("entry-open", visible);
      if (!visible) return;
      const onlineMode = this.selectedMode === "online";
      ui.entryScreen.classList.toggle("entry-online-mode", onlineMode);
      ui.entrySkinWrap?.classList.toggle("hidden", onlineMode);
      ui.entryOnlineRooms?.classList.toggle("hidden", !onlineMode);

      const profile = game.localProfile || {};
      const fallbackFaction = IronLine.playerFactions?.[0]?.id || IronLine.playerSkins?.[0]?.id || "korea";
      if (!this.selectedFactionId) this.selectedFactionId = profile.factionId || profile.skinId || fallbackFaction;
      if (ui.entryNickname && !ui.entryNickname.dataset.entrySeeded) {
        ui.entryNickname.value = profile.nickname || "";
        ui.entryNickname.dataset.entrySeeded = "1";
      }
      if (ui.entryIntro) {
        ui.entryIntro.textContent = onlineMode
          ? "닉네임만 정하고 바로 방 목록에서 대기방으로 입장합니다."
          : "세력과 닉네임을 정하고 오프라인 전투 설정으로 이동합니다.";
      }
      if (ui.entryStatus) {
        ui.entryStatus.textContent = onlineMode
          ? "온라인 세력은 방의 청팀/홍팀 설정을 따릅니다."
          : "선택한 세력은 외형, 전장 대사, 아이콘에만 반영됩니다. 전투 성능에는 영향을 주지 않습니다.";
      }
      if (ui.entryEnterButton) {
        ui.entryEnterButton.textContent = onlineMode ? "방 목록 새로고침" : "오프라인 전투";
      }
      this.renderModeCards();
      if (onlineMode) {
        this.renderEntryRooms(game);
      } else {
        this.renderSkinCards(game);
        this.renderSkinDetail(game);
      }
      this.renderRoomStatus(game);
    }

    renderModeCards() {
      const list = this.nodes.entryModeList;
      if (!list) return;
      if (list.dataset.ready !== "1") {
        const modes = [
          { id: "offline", title: "오프라인 전투", desc: "전장 설정으로 이동" },
          { id: "online", title: "온라인", desc: "방 목록과 로비" }
        ];
        list.textContent = "";
        for (const mode of modes) {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.entryMode = mode.id;
          button.innerHTML = `<strong>${mode.title}</strong><span>${mode.desc}</span>`;
          button.addEventListener("click", () => {
            this.selectedMode = mode.id;
            this.factionSignature = "";
            this.roomSignature = "";
            this.update(IronLine.game);
          });
          list.append(button);
        }
        list.dataset.ready = "1";
      }
      list.querySelectorAll("[data-entry-mode]").forEach((button) => {
        button.classList.toggle("active", button.dataset.entryMode === this.selectedMode);
      });
    }

    renderEntryRooms(game) {
      const list = this.nodes.entryOnlineRoomList;
      if (!list) return;
      const rooms = IronLine.roomRegistry?.listRooms?.() || [];
      const signature = JSON.stringify(rooms.map((room) => ({
        id: room.id,
        name: room.name,
        mode: room.mode,
        phase: room.phase,
        locked: room.locked,
        blueFactionId: room.blueFactionId,
        redFactionId: room.redFactionId,
        players: (room.players || []).length,
        spectators: (room.spectators || []).length,
        capacity: room.capacity
      })));
      if (this.roomSignature === signature) return;
      this.roomSignature = signature;
      list.textContent = "";

      if (rooms.length === 0) {
        const empty = document.createElement("div");
        empty.className = "entry-online-empty";
        empty.innerHTML = `
          <strong>참가 가능한 방 없음</strong>
          <span>관리자 운영센터에서 방을 만들면 이곳에 바로 표시됩니다.</span>
        `;
        list.append(empty);
        return;
      }

      for (const room of rooms) {
        const players = (room.players || []).filter((player) => (player.participantType || "player") === "player");
        const spectators = room.spectators || [];
        const capacity = room.capacity || 8;
        const spectatorJoin = room.phase === "playing" || room.locked || players.length >= capacity;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "entry-online-room";
        button.dataset.phase = room.phase || "waiting";
        button.classList.toggle("is-spectator-join", spectatorJoin);
        button.disabled = room.phase === "ended";
        button.innerHTML = `
          <span class="entry-online-room-main">
            <strong>${this.escape(room.name || room.id)}</strong>
            <small>${this.modeLabel(room.mode)} · ${this.phaseLabel(room.phase)}</small>
          </span>
          <span class="entry-online-room-meta">
            <em>${this.factionLabel(room.blueFactionId)} vs ${this.factionLabel(room.redFactionId)}</em>
            <em>슬롯 ${players.length}/${capacity} · 관전 ${spectators.length}</em>
          </span>
          <b>${spectatorJoin ? "관전 입장" : "대기방 입장"}</b>
        `;
        button.addEventListener("click", () => this.joinRoom(room));
        list.append(button);
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

    renderSkinCards(game) {
      const list = this.nodes.entrySkinList;
      const skins = IronLine.playerFactions || IronLine.playerSkins || [];
      if (!list || skins.length === 0) return;

      const selected = this.selectedFactionId || game.localProfile?.factionId || game.localProfile?.skinId || skins[0].id;
      const signature = `${selected}:${skins.map((skin) => skin.id).join("|")}`;
      if (this.factionSignature === signature) return;
      this.factionSignature = signature;
      list.textContent = "";

      for (const skin of skins) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `entry-skin-card${skin.id === selected ? " active" : ""}`;
        button.dataset.entrySkin = skin.id;
        button.setAttribute("aria-pressed", skin.id === selected ? "true" : "false");

        const preview = document.createElement("span");
        preview.className = "entry-skin-preview";
        preview.style.setProperty("--skin-cloth", skin.cloth);
        preview.style.setProperty("--skin-vest", skin.vest);
        preview.style.setProperty("--skin-accent", skin.accent);
        if (skin.logo) {
          const logo = document.createElement("img");
          logo.src = skin.logo;
          logo.alt = "";
          logo.loading = "lazy";
          preview.append(logo);
        }

        const text = document.createElement("span");
        text.className = "entry-skin-text";
        const name = document.createElement("strong");
        name.textContent = skin.name;
        const role = document.createElement("small");
        role.textContent = skin.role || skin.concept || "";
        text.append(name, role);
        button.append(preview, text);

        button.addEventListener("click", () => {
          this.selectedFactionId = skin.id;
          this.factionSignature = "";
          this.update(IronLine.game);
        });
        list.append(button);
      }
    }

    renderSkinDetail(game) {
      const detail = this.nodes.entrySkinDetail;
      const skins = IronLine.playerFactions || IronLine.playerSkins || [];
      if (!detail || skins.length === 0) return;

      const selectedId = this.selectedFactionId || game.localProfile?.factionId || game.localProfile?.skinId || skins[0].id;
      const skin = IronLine.playerFactionById?.(selectedId) || IronLine.playerSkinById?.(selectedId) || skins[0];
      if (!skin) return;

      detail.innerHTML = `
        <div class="entry-skin-detail-head">
          <span>${skin.category || "세력 스킨"}</span>
          <strong>${skin.name}</strong>
        </div>
        <p class="entry-skin-tagline">“${skin.tagline || skin.motto || "전장을 선택한 색으로 칠한다."}”</p>
        <p>${skin.description || skin.concept || ""}</p>
        <div class="entry-skin-meta">
          <span>${skin.rankNote || "참고 순위 없음"}</span>
          <span>2026년 5월 기준 참고 순위 · 게임 밸런스와 무관</span>
        </div>
      `;
    }

    renderRoomStatus(game) {
      const root = this.nodes.entryRoomStatus;
      if (!root) return;

      const selectedId = this.selectedFactionId || game.localProfile?.factionId || game.localProfile?.skinId || "";
      const skin = IronLine.playerFactionById?.(selectedId) || IronLine.playerSkinById?.(selectedId) || null;
      const nickname = String(this.nodes.entryNickname?.value || game.localProfile?.nickname || "Player").trim() || "Player";
      const modeOnline = this.selectedMode === "online";
      const rooms = modeOnline ? IronLine.roomRegistry?.listRooms?.() || [] : [];
      const openRooms = rooms.filter((room) => room.phase !== "ended");
      const roomLabel = modeOnline
        ? "방 목록"
        : "로컬 전투";
      const stateLabel = modeOnline
        ? openRooms.length > 0 ? `${openRooms.length}개 방 참가 가능` : "대기 중인 방 없음"
        : "설정 화면에서 전투 조건 선택";

      root.textContent = "";

      const title = document.createElement("div");
      title.className = "entry-room-title";
      const kicker = document.createElement("span");
      kicker.textContent = modeOnline ? "온라인 상태" : "플레이 상태";
      const strong = document.createElement("strong");
      strong.textContent = roomLabel;
      title.append(kicker, strong);

      const grid = document.createElement("div");
      grid.className = "entry-room-grid";
      const facts = modeOnline
        ? [
            ["플레이어", nickname],
            ["입장 방식", "방 카드 선택"],
            ["모드", "온라인"],
            ["상태", stateLabel]
          ]
        : [
            ["플레이어", nickname],
            ["세력", skin?.name || "선택 대기"],
            ["모드", "오프라인"],
            ["상태", stateLabel]
          ];
      for (const [label, value] of facts) {
        const item = document.createElement("div");
        item.className = "entry-room-fact";
        const small = document.createElement("span");
        small.textContent = label;
        const text = document.createElement("strong");
        text.textContent = value;
        item.append(small, text);
        grid.append(item);
      }

      root.append(title, grid);
    }
  }

  IronLine.EntryFlow = EntryFlow;
})(window);
