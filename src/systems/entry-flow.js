"use strict";

(function registerEntryFlow(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  class EntryFlow {
    constructor(hud) {
      this.hud = hud;
      this.stage = "main";
      this.selectedMode = "offline";
      this.selectedFactionId = "";
      this.factionSignature = "";
      this.roomSignature = "";
      this.bound = false;
      this.bootHidden = false;
      this.mainSeeded = false;
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
      screen.className = "entry-screen stage-main hidden";
      screen.setAttribute("aria-label", "전장 입장");

      const main = document.createElement("section");
      main.className = "entry-main";
      main.innerHTML = `
        <div class="entry-main-hero">
          <span class="entry-main-badge">${IronLine.gameVersion || "ALPHA R1.0"}</span>
          <h1>IRON LINE</h1>
        </div>
        <div class="entry-main-panel">
          <label class="entry-field">
            <span>닉네임</span>
            <input id="entryNickname" type="text" maxlength="16" autocomplete="nickname" placeholder="닉네임">
          </label>
          <button type="button" id="entryMainStart" class="entry-enter">입장</button>
          <button type="button" id="entryMainGuest" class="entry-guest">게스트 입장</button>
          <p class="entry-main-hint" id="entryMainHint"></p>
        </div>
      `;

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
        </div>
        <button type="button" id="entryBackButton" class="entry-back">← 메인</button>
      `;
      const skinWrap = document.createElement("div");
      skinWrap.className = "entry-skin-wrap";
      const skinLabel = document.createElement("span");
      skinLabel.className = "entry-label";
      skinLabel.textContent = "세력";
      const skinList = document.createElement("div");
      skinList.id = "entrySkinList";
      skinList.className = "entry-skin-list";
      skinWrap.append(skinLabel, skinList);

      const onlineRooms = document.createElement("section");
      onlineRooms.id = "entryOnlineRooms";
      onlineRooms.className = "entry-online-rooms hidden";
      onlineRooms.innerHTML = `
        <div class="entry-online-head">
          <strong>방 목록</strong>
        </div>
        <div class="entry-online-toolbar">
          <button type="button" id="entryRoomRefreshButton">새로고침</button>
        </div>
        <div class="entry-online-list" id="entryOnlineRoomList"></div>
      `;
      factionPane.append(head, skinWrap, onlineRooms);

      const panel = document.createElement("section");
      panel.className = "entry-panel entry-session-pane";

      const modeWrap = document.createElement("div");
      modeWrap.className = "entry-mode-wrap";
      const modeLabel = document.createElement("span");
      modeLabel.className = "entry-label";
      modeLabel.textContent = "모드";
      const modeList = document.createElement("div");
      modeList.id = "entryModeList";
      modeList.className = "entry-mode-list";
      modeWrap.append(modeLabel, modeList);

      const status = document.createElement("p");
      status.id = "entryStatus";
      status.className = "entry-status";

      const enter = document.createElement("button");
      enter.id = "entryEnterButton";
      enter.type = "button";
      enter.className = "entry-enter";

      panel.append(modeWrap, status, enter);
      card.append(factionPane, panel);
      screen.append(main, card);
      document.body.prepend(screen);

      ui.entryScreen = screen;
      ui.entryNickname = main.querySelector("#entryNickname");
      ui.entryMainStart = main.querySelector("#entryMainStart");
      ui.entryMainGuest = main.querySelector("#entryMainGuest");
      ui.entryMainHint = main.querySelector("#entryMainHint");
      ui.entryBackButton = head.querySelector("#entryBackButton");
      ui.entrySkinWrap = skinWrap;
      ui.entrySkinList = skinList;
      ui.entryOnlineRooms = onlineRooms;
      ui.entryOnlineRoomList = onlineRooms.querySelector("#entryOnlineRoomList");
      ui.entryRoomRefreshButton = onlineRooms.querySelector("#entryRoomRefreshButton");
      ui.entryModeList = modeList;
      ui.entryEnterButton = enter;
      ui.entryStatus = status;
      this.bind();
    }

    bind() {
      const ui = this.nodes;
      if (this.bound || !ui?.entryEnterButton || !ui.entryNickname) return;
      this.bound = true;
      ui.entryMainStart?.addEventListener("click", () => this.startFromMain(false));
      ui.entryMainGuest?.addEventListener("click", () => this.startFromMain(true));
      ui.entryBackButton?.addEventListener("click", () => this.setStage("main"));
      ui.entryEnterButton.addEventListener("click", () => this.submit());
      ui.entryRoomRefreshButton?.addEventListener("click", () => {
        this.roomSignature = "";
        IronLine.roomRegistry?.refreshRemoteRooms?.();
        this.renderEntryRooms(IronLine.game);
      });
      ui.entryNickname.addEventListener("keydown", (event) => {
        if (event.key === "Enter") this.startFromMain(false);
      });
      ui.entryNickname.addEventListener("input", () => this.setMainHint(""));
    }

    setMainHint(message, warn = false) {
      const hint = this.nodes.entryMainHint;
      if (!hint) return;
      hint.textContent = message;
      hint.classList.toggle("warn", Boolean(warn && message));
    }

    startFromMain(asGuest) {
      const ui = this.nodes;
      const game = IronLine.game;
      let nickname = String(ui.entryNickname?.value || "").trim();
      if (asGuest) {
        nickname = `게스트${Math.floor(100 + Math.random() * 900)}`;
        if (ui.entryNickname) ui.entryNickname.value = nickname;
      } else if (!nickname) {
        this.setMainHint("닉네임을 입력하거나 게스트로 입장하세요", true);
        ui.entryNickname?.focus();
        return;
      }
      this.setMainHint("");
      game?.setLocalProfile?.(this.entryProfile(game));
      this.setStage("lobby");
    }

    setStage(stage) {
      this.stage = stage;
      this.factionSignature = "";
      this.roomSignature = "";
      if (IronLine.game) this.update(IronLine.game);
    }

    entryProfile(game) {
      const fallbackFaction = IronLine.playerFactions?.[0]?.id || IronLine.playerSkins?.[0]?.id || "korea";
      const factionId = this.selectedFactionId || game?.localProfile?.factionId || game?.localProfile?.skinId || fallbackFaction;
      return {
        nickname: this.nodes.entryNickname?.value || game?.localProfile?.nickname || "",
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
        game.setLocalProfile?.(profile);
        return;
      }
      if (this.hud.sessionFlow?.submitEntry?.(this.selectedMode, profile)) return;
      game.completeEntryProfile(profile);
    }

    joinRoom(room, options = {}) {
      const game = IronLine.game;
      if (!game || !room) return false;
      game.setLocalProfile?.(this.entryProfile(game));
      return Boolean(this.hud.sessionFlow?.joinOnlineRoom?.(room, options));
    }

    hideBootScreen() {
      if (this.bootHidden) return;
      this.bootHidden = true;
      document.getElementById("bootScreen")?.classList.add("boot-done");
    }

    update(game) {
      this.ensure();
      const ui = this.nodes;
      if (!ui?.entryScreen) return;
      this.hideBootScreen();

      const visible = Boolean(game.entryOpen);
      ui.entryScreen.classList.toggle("hidden", !visible);
      document.body.classList.toggle("entry-open", visible);
      if (!visible) return;

      const profile = game.localProfile || {};
      if (ui.entryNickname && !this.mainSeeded) {
        ui.entryNickname.value = profile.nickname || "";
        this.mainSeeded = true;
      }

      const mainStage = this.stage === "main";
      ui.entryScreen.classList.toggle("stage-main", mainStage);
      if (mainStage) return;

      const onlineMode = this.selectedMode === "online";
      ui.entryScreen.classList.toggle("entry-online-mode", onlineMode);
      ui.entrySkinWrap?.classList.toggle("hidden", onlineMode);
      ui.entryOnlineRooms?.classList.toggle("hidden", !onlineMode);

      const fallbackFaction = IronLine.playerFactions?.[0]?.id || IronLine.playerSkins?.[0]?.id || "korea";
      if (!this.selectedFactionId) this.selectedFactionId = profile.factionId || profile.skinId || fallbackFaction;
      if (ui.entryStatus) {
        ui.entryStatus.textContent = "";
        ui.entryStatus.hidden = true;
      }
      if (ui.entryEnterButton) {
        ui.entryEnterButton.textContent = "시작";
        ui.entryEnterButton.classList.toggle("hidden", onlineMode);
      }
      this.renderModeCards();
      if (onlineMode) {
        this.renderEntryRooms(game);
      } else {
        this.renderSkinCards(game);
      }
    }

    renderModeCards() {
      const list = this.nodes.entryModeList;
      if (!list) return;
      if (list.dataset.ready !== "1") {
        const modes = [
          { id: "offline", title: "오프라인" },
          { id: "online", title: "온라인" }
        ];
        list.textContent = "";
        for (const mode of modes) {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.entryMode = mode.id;
          button.innerHTML = `<strong>${mode.title}</strong>`;
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
        capacity: room.capacity,
        spectatorCapacity: room.spectatorCapacity
      })));
      if (this.roomSignature === signature) return;
      this.roomSignature = signature;
      list.textContent = "";

      if (rooms.length === 0) {
        const empty = document.createElement("div");
        empty.className = "entry-online-empty";
        empty.innerHTML = `
          <strong>방 없음</strong>
        `;
        list.append(empty);
        return;
      }

      for (const room of rooms) {
        const players = (room.players || []).filter((player) => (player.participantType || "player") === "player");
        const spectators = room.spectators || [];
        const capacity = IronLine.roomRegistry?.effectiveRoomCapacity?.(room) ?? room.capacity ?? 8;
        const spectatorCapacity = IronLine.normalizeSpectatorCapacity?.(room.spectatorCapacity, 12) ?? 12;
        const spectatorFull = spectators.length >= spectatorCapacity;
        const spectatorJoin = room.phase === "playing" || room.locked || players.length >= capacity;
        const wrap = document.createElement("div");
        wrap.className = "entry-online-room-wrap";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "entry-online-room";
        button.dataset.phase = room.phase || "waiting";
        button.classList.toggle("is-spectator-join", spectatorJoin);
        button.disabled = room.phase === "ended" || (spectatorJoin && spectatorFull);
        button.innerHTML = `
          <span class="entry-online-room-main">
            <strong>${this.escape(room.name || room.id)}</strong>
            <small>${this.modeLabel(room.mode)} · ${this.phaseLabel(room.phase)}</small>
          </span>
          <span class="entry-online-room-meta">
            <em>${players.length}/${capacity} · 관전 ${spectators.length}/${spectatorCapacity}</em>
          </span>
          <b>${spectatorJoin ? (spectatorFull ? "관전 만석" : "관전") : "입장"}</b>
        `;
        button.addEventListener("click", () => this.joinRoom(room));
        wrap.append(button);
        if (room.phase !== "ended") {
          const spectator = document.createElement("button");
          spectator.type = "button";
          spectator.className = "entry-online-spectator";
          spectator.textContent = spectatorFull ? "만석" : "관전";
          spectator.disabled = spectatorFull;
          spectator.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.joinRoom(room, { participantType: "spectator" });
          });
          wrap.append(spectator);
        }
        list.append(wrap);
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
        text.append(name);
        button.append(preview, text);

        button.addEventListener("click", () => {
          this.selectedFactionId = skin.id;
          this.factionSignature = "";
          this.update(IronLine.game);
        });
        list.append(button);
      }
    }
  }

  IronLine.EntryFlow = EntryFlow;
})(window);
