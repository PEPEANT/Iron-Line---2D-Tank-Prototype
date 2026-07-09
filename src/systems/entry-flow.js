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
      this.mainNicknameVisible = false;
      this.mainOnlinePending = false;
      this.accountMode = "login";
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
          <img class="entry-main-title" src="assets/ui/soubok-title.png" alt="수복">
          <h1>수복</h1>
        </div>
        <div class="entry-main-panel">
          <div class="entry-main-actions">
            <button type="button" id="entryMainCustom" class="entry-art-button" aria-label="커스텀 모드">
              <img src="assets/ui/soubok-button-custom.png" alt="" aria-hidden="true">
            </button>
            <button type="button" id="entryMainOnline" class="entry-art-button" aria-label="온라인 접속">
              <img src="assets/ui/soubok-button-online.png" alt="" aria-hidden="true">
            </button>
            <button type="button" id="entryMainStory" class="entry-art-button" aria-label="스토리 모드">
              <img src="assets/ui/soubok-button-story.png" alt="" aria-hidden="true">
            </button>
          </div>
          <label class="entry-field entry-nickname-field hidden">
            <span>닉네임</span>
            <input id="entryNickname" type="text" maxlength="16" autocomplete="nickname" placeholder="닉네임">
          </label>
          <button type="button" id="entryMainStart" class="entry-enter hidden">입장하기</button>
          <p class="entry-main-hint" id="entryMainHint"></p>
        </div>
      `;

      const mainSoldier = document.createElement("img");
      mainSoldier.className = "entry-main-soldier";
      mainSoldier.src = "assets/ui/soubok-soldier.png";
      mainSoldier.alt = "";
      mainSoldier.setAttribute("aria-hidden", "true");

      const mainRefugee = document.createElement("img");
      mainRefugee.className = "entry-main-extra entry-main-refugee";
      mainRefugee.src = "assets/ui/soubok-refugee.png";
      mainRefugee.alt = "";
      mainRefugee.setAttribute("aria-hidden", "true");

      const mainNorthSoldier = document.createElement("img");
      mainNorthSoldier.className = "entry-main-extra entry-main-north-soldier";
      mainNorthSoldier.src = "assets/ui/soubok-north-soldier.png";
      mainNorthSoldier.alt = "";
      mainNorthSoldier.setAttribute("aria-hidden", "true");

      const account = document.createElement("aside");
      account.className = "entry-account-widget";
      account.innerHTML = `
        <button type="button" id="entryAccountButton" class="entry-account-button" aria-label="계정">
          <span class="entry-account-icon" aria-hidden="true"></span>
        </button>
        <div id="entryAccountPanel" class="entry-account-panel hidden">
          <strong>계정</strong>
          <div class="entry-account-tabs">
            <button type="button" data-entry-account-mode="login" class="active">로그인</button>
            <button type="button" data-entry-account-mode="signup">회원가입</button>
          </div>
          <label class="entry-account-field">
            <span>닉네임</span>
            <input id="entryAccountNickname" type="text" maxlength="16" autocomplete="nickname" placeholder="닉네임">
          </label>
          <button type="button" id="entryAccountSave" class="entry-account-save">저장</button>
          <button type="button" id="entryAccountReset" class="entry-account-reset hidden">초기화</button>
          <p id="entryAccountStatus" class="entry-account-status"></p>
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
      screen.append(mainRefugee, mainNorthSoldier, mainSoldier, main, card, account);
      document.body.prepend(screen);

      ui.entryScreen = screen;
      ui.entryMainActions = main.querySelector(".entry-main-actions");
      ui.entryMainCustom = main.querySelector("#entryMainCustom");
      ui.entryMainOnline = main.querySelector("#entryMainOnline");
      ui.entryMainStory = main.querySelector("#entryMainStory");
      ui.entryNicknameField = main.querySelector(".entry-nickname-field");
      ui.entryNickname = main.querySelector("#entryNickname");
      ui.entryMainStart = main.querySelector("#entryMainStart");
      ui.entryMainHint = main.querySelector("#entryMainHint");
      ui.entryAccountButton = account.querySelector("#entryAccountButton");
      ui.entryAccountPanel = account.querySelector("#entryAccountPanel");
      ui.entryAccountModes = Array.from(account.querySelectorAll("[data-entry-account-mode]"));
      ui.entryAccountNickname = account.querySelector("#entryAccountNickname");
      ui.entryAccountSave = account.querySelector("#entryAccountSave");
      ui.entryAccountReset = account.querySelector("#entryAccountReset");
      ui.entryAccountStatus = account.querySelector("#entryAccountStatus");
      ui.entryBackButton = head.querySelector("#entryBackButton");
      ui.entrySkinWrap = skinWrap;
      ui.entrySkinList = skinList;
      ui.entryOnlineRooms = onlineRooms;
      ui.entryOnlineRoomList = onlineRooms.querySelector("#entryOnlineRoomList");
      ui.entryRoomRefreshButton = onlineRooms.querySelector("#entryRoomRefreshButton");
      ui.entryModeList = modeList;
      ui.entryEnterButton = enter;
      ui.entryStatus = status;
      this.syncPublicOnlineEntry();
      this.bind();
    }

    bind() {
      const ui = this.nodes;
      if (this.bound || !ui?.entryEnterButton || !ui.entryNickname) return;
      this.bound = true;
      ui.entryMainCustom?.addEventListener("click", () => this.startOfflineFromMain());
      ui.entryMainOnline?.addEventListener("click", () => {
        if (!this.isPublicOnlineEntryHidden()) this.showOnlineNickname();
      });
      ui.entryMainStory?.addEventListener("click", () => this.openStoryMode());
      ui.entryMainStart?.addEventListener("click", () => this.startOnlineFromMain());
      ui.entryAccountButton?.addEventListener("click", () => this.toggleAccountPanel());
      ui.entryAccountModes?.forEach((button) => {
        button.addEventListener("click", () => this.setAccountMode(button.dataset.entryAccountMode || "login"));
      });
      ui.entryAccountSave?.addEventListener("click", () => this.saveLocalAccount());
      ui.entryAccountReset?.addEventListener("click", () => this.resetLocalAccount());
      ui.entryAccountNickname?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") this.saveLocalAccount();
      });
      ui.entryBackButton?.addEventListener("click", () => this.setStage("main"));
      ui.entryEnterButton.addEventListener("click", () => this.submit());
      ui.entryRoomRefreshButton?.addEventListener("click", () => {
        this.roomSignature = "";
        IronLine.roomRegistry?.refreshRemoteRooms?.();
        this.renderEntryRooms(IronLine.game);
      });
      ui.entryNickname.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && this.mainOnlinePending) this.startOnlineFromMain();
      });
      ui.entryNickname.addEventListener("input", () => this.setMainHint(""));
    }

    isPublicOnlineEntryHidden() {
      try {
        const hostname = String(global.location?.hostname || "").toLowerCase();
        const params = new URLSearchParams(global.location?.search || "");
        const normalized = (value) => String(value || "").trim().toLowerCase();
        const explicitOnline = normalized(params.get("showOnline") || params.get("publicOnline"));
        const roomsApi = normalized(params.get("roomsApi") || params.get("apiBase"));
        if (["1", "true", "yes", "on"].includes(explicitOnline)) return false;
        if (roomsApi === "local" || roomsApi === "relative") return false;
        if (!hostname || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return false;
        return hostname === "pepeant.github.io";
      } catch (_error) {
        return false;
      }
    }

    syncPublicOnlineEntry() {
      const hidden = this.isPublicOnlineEntryHidden();
      const ui = this.nodes;
      if (ui.entryMainOnline) {
        ui.entryMainOnline.hidden = hidden;
        ui.entryMainOnline.disabled = hidden;
        ui.entryMainOnline.setAttribute("aria-hidden", hidden ? "true" : "false");
      }
      if (hidden && this.selectedMode === "online") this.selectedMode = "offline";
      if (hidden && this.mainOnlinePending) {
        this.mainNicknameVisible = false;
        this.mainOnlinePending = false;
        ui.entryMainActions?.classList.remove("hidden");
        ui.entryNicknameField?.classList.add("hidden");
        ui.entryNicknameField?.classList.remove("locked");
        ui.entryMainStart?.classList.add("hidden");
        ui.entryScreen?.classList.remove("main-nickname-open");
      }
      return hidden;
    }

    mainFallbackNickname() {
      return this.lockedNickname() ||
        this.nodes.entryNickname?.value ||
        IronLine.game?.localProfile?.nickname ||
        "Player";
    }

    accountStorageKey() {
      return "iron-line-local-account-v1";
    }

    readLocalAccount() {
      try {
        const raw = localStorage.getItem(this.accountStorageKey());
        if (!raw) return null;
        const account = JSON.parse(raw);
        const nickname = String(account?.nickname || "").trim().slice(0, 16);
        if (!nickname) return null;
        return {
          nickname,
          mode: account.mode === "signup" ? "signup" : "login",
          locked: account.locked !== false,
          updatedAt: Number(account.updatedAt) || Date.now()
        };
      } catch (_error) {
        return null;
      }
    }

    writeLocalAccount(account) {
      try {
        localStorage.setItem(this.accountStorageKey(), JSON.stringify({
          ...account,
          updatedAt: Date.now()
        }));
      } catch (_error) {}
    }

    lockedNickname() {
      const account = this.readLocalAccount();
      return account?.locked ? account.nickname : "";
    }

    startOfflineFromMain() {
      const game = IronLine.game;
      if (!game) return;
      game.storyChapterId = "";
      this.setMainHint("");
      const blueFactionId = game.matchConfig?.blueFactionId ||
        game.localProfile?.factionId ||
        game.localProfile?.skinId ||
        "korea";
      game?.setLocalProfile?.({
        ...this.entryProfile(game),
        nickname: this.mainFallbackNickname(),
        factionId: blueFactionId,
        skinId: blueFactionId
      });
      this.selectedMode = "offline";
      this.submit();
    }

    showOnlineNickname() {
      if (this.isPublicOnlineEntryHidden()) return;
      const ui = this.nodes;
      const locked = this.lockedNickname();
      this.mainNicknameVisible = true;
      this.mainOnlinePending = true;
      ui.entryMainActions?.classList.add("hidden");
      ui.entryNicknameField?.classList.remove("hidden");
      ui.entryMainStart?.classList.remove("hidden");
      ui.entryScreen?.classList.add("main-nickname-open");
      if (ui.entryMainStart) ui.entryMainStart.textContent = "입장하기";
      if (ui.entryNickname) {
        ui.entryNickname.value = locked || ui.entryNickname.value || "";
        ui.entryNickname.disabled = Boolean(locked);
      }
      ui.entryNicknameField?.classList.toggle("locked", Boolean(locked));
      this.setMainHint(locked ? "닉네임 변경은 계정 초기화 후 가능합니다." : "");
      if (!locked) {
        ui.entryNickname?.focus();
        ui.entryNickname?.select?.();
      }
    }

    openStoryMode() {
      this.mainNicknameVisible = false;
      this.mainOnlinePending = false;
      if (!IronLine.storyMode?.open?.()) {
        this.setMainHint("스토리 모드는 준비 중입니다.", true);
      }
      this.update(IronLine.game);
    }

    startOnlineFromMain() {
      if (this.isPublicOnlineEntryHidden()) return;
      this.selectedMode = "online";
      const ui = this.nodes;
      const locked = this.lockedNickname();
      const nickname = locked || String(ui.entryNickname?.value || "").trim();
      if (!nickname) {
        this.setMainHint("닉네임을 입력하세요.", true);
        ui.entryNickname?.focus();
        return;
      }
      if (ui.entryNickname) ui.entryNickname.value = nickname;
      if (!locked) this.lockNickname(nickname, "login");
      this.setMainHint("");
      const game = IronLine.game;
      const profile = this.entryProfile(game);
      game?.setLocalProfile?.(profile);
      if (!this.hud.sessionFlow?.submitEntry?.("online", profile)) this.submit();
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
      if (stage === "main") {
        this.resetMainControls();
      }
      this.factionSignature = "";
      this.roomSignature = "";
      if (IronLine.game) this.update(IronLine.game);
    }

    resetMainControls() {
      const ui = this.nodes;
      this.mainNicknameVisible = false;
      this.mainOnlinePending = false;
      ui.entryMainActions?.classList.remove("hidden");
      ui.entryNicknameField?.classList.add("hidden");
      ui.entryNicknameField?.classList.remove("locked");
      ui.entryMainStart?.classList.add("hidden");
      ui.entryScreen?.classList.remove("main-nickname-open");
      if (ui.entryNickname) ui.entryNickname.disabled = false;
      this.setMainHint("");
      this.syncAccountPanel();
    }

    entryProfile(game) {
      const fallbackFaction = IronLine.playerFactions?.[0]?.id || IronLine.playerSkins?.[0]?.id || "korea";
      const factionId = this.selectedFactionId || game?.localProfile?.factionId || game?.localProfile?.skinId || fallbackFaction;
      return {
        nickname: this.lockedNickname() || this.nodes.entryNickname?.value || game?.localProfile?.nickname || "",
        factionId,
        skinId: factionId
      };
    }

    submit() {
      const game = IronLine.game;
      if (!game) return;
      const profile = this.entryProfile(game);
      if (this.selectedMode === "online") {
        if (this.isPublicOnlineEntryHidden()) {
          this.selectedMode = "offline";
          return this.submit();
        }
        this.roomSignature = "";
        game.setLocalProfile?.(profile);
        if (this.hud.sessionFlow?.submitEntry?.("online", profile)) return;
        this.renderEntryRooms(game);
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
      this.syncAccountPanel();
      const publicOnlineHidden = this.syncPublicOnlineEntry();

      const profile = game.localProfile || {};
      if (ui.entryNickname && !this.mainSeeded) {
        ui.entryNickname.value = this.lockedNickname() || profile.nickname || "";
        this.mainSeeded = true;
      }

      const mainStage = this.stage === "main";
      ui.entryScreen.classList.toggle("stage-main", mainStage);
      ui.entryScreen.classList.toggle("main-nickname-open", Boolean(mainStage && this.mainNicknameVisible));
      if (mainStage) {
        ui.entryMainActions?.classList.toggle("hidden", Boolean(this.mainNicknameVisible));
        ui.entryMainOnline?.toggleAttribute("hidden", publicOnlineHidden);
        if (ui.entryMainOnline) ui.entryMainOnline.disabled = publicOnlineHidden;
        ui.entryNicknameField?.classList.toggle("hidden", !this.mainNicknameVisible);
        ui.entryNicknameField?.classList.toggle("locked", Boolean(this.lockedNickname() && this.mainNicknameVisible));
        if (ui.entryNickname) ui.entryNickname.disabled = Boolean(this.lockedNickname() && this.mainNicknameVisible);
        ui.entryMainStart?.classList.toggle("hidden", !this.mainNicknameVisible);
        if (ui.entryMainStart) ui.entryMainStart.textContent = "입장하기";
        return;
      }

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
      const publicOnlineHidden = this.isPublicOnlineEntryHidden();
      const signature = publicOnlineHidden ? "offline" : "offline-online";
      if (list.dataset.modeSignature !== signature) {
        const modes = [{ id: "offline", title: "오프라인" }];
        if (!publicOnlineHidden) modes.push({ id: "online", title: "온라인" });
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
        list.dataset.modeSignature = signature;
      }
      if (publicOnlineHidden && this.selectedMode === "online") this.selectedMode = "offline";
      list.querySelectorAll("[data-entry-mode]").forEach((button) => {
        button.classList.toggle("active", button.dataset.entryMode === this.selectedMode);
      });
    }

    renderEntryRooms(game) {
      const list = this.nodes.entryOnlineRoomList;
      if (!list) return;
      const rooms = IronLine.roomRegistry?.listVisibleRooms?.() || IronLine.roomRegistry?.listRooms?.() || [];
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

    toggleAccountPanel(force = null) {
      const panel = this.nodes.entryAccountPanel;
      if (!panel) return;
      const open = force === null ? panel.classList.contains("hidden") : Boolean(force);
      panel.classList.toggle("hidden", !open);
      if (open) {
        this.syncAccountPanel();
        this.nodes.entryAccountNickname?.focus();
      }
    }

    setAccountMode(mode = "login") {
      this.accountMode = mode === "signup" ? "signup" : "login";
      this.syncAccountPanel();
    }

    syncAccountPanel() {
      const ui = this.nodes;
      if (!ui.entryAccountPanel) return;
      const account = this.readLocalAccount();
      const locked = Boolean(account?.locked);
      const nickname = account?.nickname || IronLine.game?.localProfile?.nickname || "";
      ui.entryAccountModes?.forEach((button) => {
        button.classList.toggle("active", button.dataset.entryAccountMode === this.accountMode);
        button.disabled = locked;
      });
      if (ui.entryAccountNickname) {
        if (locked || document.activeElement !== ui.entryAccountNickname) {
          ui.entryAccountNickname.value = locked ? account.nickname : nickname;
        }
        ui.entryAccountNickname.disabled = locked;
      }
      if (ui.entryAccountSave) {
        ui.entryAccountSave.textContent = this.accountMode === "signup" ? "회원가입" : "로그인";
        ui.entryAccountSave.classList.toggle("hidden", locked);
      }
      ui.entryAccountReset?.classList.toggle("hidden", !locked);
      if (ui.entryAccountStatus) {
        ui.entryAccountStatus.textContent = locked
          ? `${account.nickname} 계정으로 고정됨`
          : "닉네임은 저장 후 초기화 전까지 고정됩니다.";
      }
    }

    lockNickname(nickname, mode = "login") {
      const clean = String(nickname || "").replace(/\s+/g, " ").trim().slice(0, 16);
      if (!clean) return false;
      this.writeLocalAccount({
        nickname: clean,
        mode: mode === "signup" ? "signup" : "login",
        locked: true
      });
      IronLine.game?.setLocalProfile?.({
        ...(IronLine.game?.localProfile || {}),
        nickname: clean
      });
      if (this.nodes.entryNickname) this.nodes.entryNickname.value = clean;
      this.syncAccountPanel();
      return true;
    }

    saveLocalAccount() {
      const nickname = String(this.nodes.entryAccountNickname?.value || "").trim();
      if (!nickname) {
        if (this.nodes.entryAccountStatus) this.nodes.entryAccountStatus.textContent = "닉네임을 입력하세요.";
        return false;
      }
      this.lockNickname(nickname, this.accountMode);
      if (this.nodes.entryAccountStatus) this.nodes.entryAccountStatus.textContent = `${nickname} 계정으로 저장됨`;
      return true;
    }

    resetLocalAccount() {
      try {
        localStorage.removeItem(this.accountStorageKey());
      } catch (_error) {}
      const game = IronLine.game;
      game?.setLocalProfile?.({
        ...(game.localProfile || {}),
        nickname: "Player"
      });
      if (this.nodes.entryNickname) {
        this.nodes.entryNickname.value = "";
        this.nodes.entryNickname.disabled = false;
      }
      if (this.nodes.entryAccountNickname) {
        this.nodes.entryAccountNickname.value = "";
        this.nodes.entryAccountNickname.disabled = false;
      }
      this.mainSeeded = false;
      this.setMainHint("");
      this.syncAccountPanel();
      return true;
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
