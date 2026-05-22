"use strict";

(function registerHudAdminUi(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants;

  const hudAdminUiMethods = {
      ensureAdminOpsPanel() {
      const ui = this.nodes;
      const panel = ui.adminPanel;
      if (!panel || panel.querySelector("[data-admin-tab='ops']")) return;

      const tabs = panel.querySelector(".admin-tabs");
      const opsTab = document.createElement("button");
      opsTab.type = "button";
      opsTab.dataset.adminTab = "ops";
      opsTab.textContent = "운영센터";
      tabs?.prepend(opsTab);

      const page = document.createElement("div");
      page.className = "admin-page admin-ops-page";
      page.dataset.adminPage = "ops";

      const stats = document.createElement("div");
      stats.id = "adminOpsStats";
      stats.className = "admin-observer-stats admin-ops-stats";

      const rooms = document.createElement("div");
      rooms.id = "adminOpsRooms";
      rooms.className = "admin-observer-list admin-ops-rooms";

      const lobby = document.createElement("div");
      lobby.id = "adminOpsLobby";
      lobby.className = "admin-ops-lobby";
      const lobbyStatus = document.createElement("div");
      lobbyStatus.id = "adminOpsLobbyStatus";
      lobbyStatus.className = "admin-ops-lobby-status";
      const lobbyChat = document.createElement("div");
      lobbyChat.id = "adminOpsLobbyChat";
      lobbyChat.className = "admin-ops-lobby-chat";
      const lobbyForm = document.createElement("form");
      lobbyForm.id = "adminOpsLobbyChatForm";
      lobbyForm.className = "admin-ops-lobby-chat-form";
      const lobbyInput = document.createElement("input");
      lobbyInput.id = "adminOpsLobbyChatInput";
      lobbyInput.type = "text";
      lobbyInput.maxLength = 120;
      lobbyInput.autocomplete = "off";
      lobbyInput.placeholder = "관리자 메시지";
      const lobbySend = document.createElement("button");
      lobbySend.type = "submit";
      lobbySend.textContent = "전송";
      lobbyForm.append(lobbyInput, lobbySend);
      lobby.append(lobbyStatus, lobbyChat, lobbyForm);

      const events = document.createElement("div");
      events.id = "adminOpsEvents";
      events.className = "admin-observer-list admin-ops-events";

      const roomControls = document.createElement("div");
      roomControls.id = "adminRoomControls";
      roomControls.className = "admin-room-controls";
      roomControls.innerHTML = `
        <div class="admin-room-control-grid">
          <label>
            <span>방 이름</span>
            <input id="adminRoomName" type="text" maxlength="32" value="온라인 테스트방">
          </label>
          <label>
            <span>모드</span>
            <select id="adminRoomMode">
              <option value="conquest" selected>점령전</option>
              <option value="annihilation">섬멸전</option>
            </select>
          </label>
          <label>
            <span>청팀 세력</span>
            <select id="adminBlueFaction"></select>
          </label>
          <label>
            <span>홍팀 세력</span>
            <select id="adminRedFaction"></select>
          </label>
          <label>
            <span>선택 방</span>
            <select id="adminRoomSelect"></select>
          </label>
        </div>
        <div class="admin-room-detail-grid">
          <label>
            <span>인원 제한</span>
            <input id="adminRoomCapacity" type="number" min="1" max="8" step="1" value="8">
          </label>
          <label>
            <span>AI 난이도</span>
            <select id="adminRoomDifficulty">
              <option value="easy">쉬움</option>
              <option value="normal" selected>보통</option>
              <option value="hard">어려움</option>
            </select>
          </label>
          <label>
            <span>청팀 전차</span>
            <input id="adminBlueTanks" type="number" min="0" max="8" step="1" value="3">
          </label>
          <label>
            <span>홍팀 전차</span>
            <input id="adminRedTanks" type="number" min="1" max="10" step="1" value="5">
          </label>
          <label>
            <span>청팀 보병</span>
            <input id="adminBlueInfantry" type="number" min="4" max="56" step="1" value="21">
          </label>
          <label>
            <span>홍팀 보병</span>
            <input id="adminRedInfantry" type="number" min="4" max="64" step="1" value="24">
          </label>
        </div>
        <div class="admin-grid-actions admin-room-actions">
          <button type="button" data-admin-action="room-create">방 생성</button>
          <button type="button" data-admin-action="room-save">설정 저장</button>
          <button type="button" data-admin-action="room-start">선택 방 시작</button>
          <button type="button" data-admin-action="room-end">선택 방 종료</button>
          <button type="button" data-admin-action="room-reset">초기화</button>
          <button type="button" data-admin-action="room-delete">삭제</button>
        </div>
      `;
      const roomLive = document.createElement("div");
      roomLive.className = "admin-room-live-chat";
      const roomLiveHead = document.createElement("div");
      roomLiveHead.className = "admin-room-live-chat-head";
      const roomLiveTitle = document.createElement("strong");
      roomLiveTitle.textContent = "대기방 / 인게임 채팅";
      const roomLiveMeta = document.createElement("span");
      roomLiveMeta.textContent = "관리자와 참가자 공용";
      roomLiveHead.append(roomLiveTitle, roomLiveMeta);
      roomLive.append(roomLiveHead, lobby);
      roomControls.prepend(roomLive);

      const backup = document.createElement("div");
      backup.id = "adminOpsBackup";
      backup.className = "admin-observer-list admin-ops-backup";

      const testHub = IronLine.createAdminTestHubBlock?.(this) || document.createElement("div");
      const mapTools = IronLine.createAdminMapToolsBlock?.(this) || document.createElement("div");
      const notes = this.createAdminPlaytestNotesBlock();

      const actions = document.createElement("div");
      actions.className = "admin-grid-actions";
      actions.append(
        this.adminActionButton("export-backup", "JSON 내보내기"),
        this.adminActionButton("save-local-backup", "임시 저장"),
        this.adminActionButton("load-local-backup", "임시 불러오기")
      );

      const fileLabel = document.createElement("label");
      fileLabel.className = "admin-file-button";
      fileLabel.textContent = "JSON 가져오기";
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "application/json,.json";
      fileInput.id = "adminBackupFile";
      fileLabel.append(fileInput);
      actions.append(fileLabel);

      const hint = document.createElement("p");
      hint.className = "admin-hint";
      hint.textContent = "외부 드라이브 연동은 다음 단계입니다. 지금은 운영 상태를 JSON으로 내보내고 브라우저에 임시 저장하는 구조입니다.";

      page.append(
        this.adminObserverBlock("운영 대시보드", stats),
        this.adminObserverBlock("방 / 로비 현황", rooms),
        this.adminObserverBlock("방 제어", roomControls),
        this.adminObserverBlock("전황 이벤트", events),
        this.adminObserverBlock("테스트 허브", testHub),
        this.adminObserverBlock("맵 도구", mapTools),
        this.adminObserverBlock("플레이테스트 노트", notes),
        this.adminObserverBlock("백업 / 복원", backup),
        actions,
        hint
      );
      panel.append(page);

      ui.adminTabs = Array.from(document.querySelectorAll("[data-admin-tab]"));
      ui.adminPages = Array.from(document.querySelectorAll("[data-admin-page]"));
      ui.adminActionButtons = Array.from(document.querySelectorAll("[data-admin-action]"));
      ui.adminOpsStats = stats;
      ui.adminRoomControls = roomControls;
      ui.adminRoomName = roomControls.querySelector("#adminRoomName");
      ui.adminRoomMode = roomControls.querySelector("#adminRoomMode");
      ui.adminBlueFaction = roomControls.querySelector("#adminBlueFaction");
      ui.adminRedFaction = roomControls.querySelector("#adminRedFaction");
      ui.adminRoomSelect = roomControls.querySelector("#adminRoomSelect");
      ui.adminRoomCapacity = roomControls.querySelector("#adminRoomCapacity");
      ui.adminRoomDifficulty = roomControls.querySelector("#adminRoomDifficulty");
      ui.adminBlueTanks = roomControls.querySelector("#adminBlueTanks");
      ui.adminRedTanks = roomControls.querySelector("#adminRedTanks");
      ui.adminBlueInfantry = roomControls.querySelector("#adminBlueInfantry");
      ui.adminRedInfantry = roomControls.querySelector("#adminRedInfantry");
      ui.adminOpsLobby = lobby;
      ui.adminOpsLobbyStatus = lobbyStatus;
      ui.adminOpsLobbyChat = lobbyChat;
      ui.adminOpsLobbyChatForm = lobbyForm;
      ui.adminOpsLobbyChatInput = lobbyInput;
      ui.adminOpsRooms = rooms;
      ui.adminOpsEvents = events;
      ui.adminMapToolsSummary = mapTools.querySelector?.("#adminMapToolsSummary") || null;
      ui.adminPlaytestNotes = notes;
      ui.adminPlaytestNotesInput = notes.querySelector("#adminPlaytestNotesInput");
      ui.adminOpsBackup = backup;
      ui.adminBackupFile = fileInput;
      lobbyForm.addEventListener("submit", (event) => {
        event.preventDefault();
        this.submitAdminLobbyChat();
      });
      },
      adminActionButton(action, label) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.adminAction = action;
      button.textContent = label;
      return button;
      },
      ensureAdminObserverPanel() {
      const ui = this.nodes;
      const panel = ui.adminPanel;
      if (!panel || panel.querySelector("[data-admin-tab='observer']")) return;

      const tabs = panel.querySelector(".admin-tabs");
      const observerTab = document.createElement("button");
      observerTab.type = "button";
      observerTab.dataset.adminTab = "observer";
      observerTab.textContent = "관전";
      tabs?.append(observerTab);

      const page = document.createElement("div");
      page.className = "admin-page admin-observer-page";
      page.dataset.adminPage = "observer";

      const map = document.createElement("div");
      map.id = "adminObserverMap";
      map.className = "deployment-map admin-observer-map";
      map.setAttribute("aria-label", "운영자 전술 지도");

      const stats = document.createElement("div");
      stats.id = "adminObserverStats";
      stats.className = "admin-observer-stats";

      const slots = document.createElement("div");
      slots.id = "adminObserverSlots";
      slots.className = "admin-observer-list";

      const squads = document.createElement("div");
      squads.id = "adminObserverSquads";
      squads.className = "admin-observer-list";

      const details = document.createElement("div");
      details.id = "adminObserverDetails";
      details.className = "admin-observer-list admin-observer-details";

      const commands = document.createElement("div");
      commands.id = "adminObserverCommands";
      commands.className = "admin-observer-list";

      page.append(
        this.adminObserverBlock("지도", map),
        this.adminObserverBlock("전장 요약", stats),
        this.adminObserverBlock("슬롯", slots),
        this.adminObserverBlock("분대 상태", squads),
        this.adminObserverBlock("선택 상세", details),
        this.adminObserverBlock("최근 명령", commands)
      );
      panel.append(page);

      ui.adminTabs = Array.from(document.querySelectorAll("[data-admin-tab]"));
      ui.adminPages = Array.from(document.querySelectorAll("[data-admin-page]"));
      ui.adminObserverMap = map;
      ui.adminObserverStats = stats;
      ui.adminObserverSlots = slots;
      ui.adminObserverSquads = squads;
      ui.adminObserverDetails = details;
      ui.adminObserverCommands = commands;
      },
      adminObserverBlock(title, content) {
      const block = document.createElement("section");
      block.className = "admin-observer-block";
      const label = document.createElement("span");
      label.className = "admin-section-label";
      label.textContent = title;
      block.append(label, content);
      return block;
      },
      ensureAdminAiLabPanel() {
      const ui = this.nodes;
      const aiPage = ui.adminPages.find((page) => page.dataset.adminPage === "ai");
      if (!aiPage || aiPage.querySelector("#adminAiStats")) return;

      const stats = document.createElement("div");
      stats.id = "adminAiStats";
      stats.className = "admin-observer-stats admin-ai-stats";

      const units = document.createElement("div");
      units.id = "adminAiUnits";
      units.className = "admin-observer-list admin-ai-units";

      const network = document.createElement("div");
      network.id = "adminAiNetwork";
      network.className = "admin-ai-network";

      const events = document.createElement("div");
      events.id = "adminAiEvents";
      events.className = "admin-observer-list admin-ai-events";

      aiPage.append(
        this.adminObserverBlock("AI 연구실", stats),
        this.adminObserverBlock("관측 대상", units),
        this.adminObserverBlock("판단망", network),
        this.adminObserverBlock("판단 로그", events)
      );

      ui.adminAiStats = stats;
      ui.adminAiUnits = units;
      ui.adminAiNetwork = network;
      ui.adminAiEvents = events;
      },
      setDeploymentLoadoutOpen(open) {
      this.deploymentLoadoutOpen = Boolean(open);
      const keepClassList = this.nodes.deploymentScreen?.classList.contains("mobile-deployment");
      this.nodes.deploymentClassList?.classList.toggle("hidden", this.deploymentLoadoutOpen && !keepClassList);
      this.nodes.deploymentLoadout?.classList.toggle("hidden", !this.deploymentLoadoutOpen);
      },
      setDeploymentMapOpen(open) {
      this.deploymentMapOpen = Boolean(open);
      this.nodes.deploymentScreen?.classList.toggle("mobile-map-open", this.deploymentMapOpen);
      },
      toggleSettingsPanel(force = null) {
      const panel = this.nodes.settingsPanel;
      if (!panel) return;
      const open = force === null ? panel.classList.contains("hidden") : Boolean(force);
      panel.classList.toggle("hidden", !open);
      },
      toggleAdminPanel(force = null) {
      if (!IronLine.game?.adminEnabled) return;
      const panel = this.nodes.adminPanel;
      if (!panel) return;
      const open = force === null ? panel.classList.contains("hidden") : Boolean(force);
      panel.classList.toggle("hidden", !open);
      if (open) this.toggleSettingsPanel(false);
      },
      openAdminObserver() {
      if (!IronLine.game?.adminEnabled) return;
      this.toggleAdminPanel(true);
      this.selectAdminTab("observer");
      document.body.classList.toggle("admin-observer-mode", Boolean(IronLine.game?.adminObserverMode));
      },
      selectAdminTab(tabId = "player") {
      const activeId = tabId || "player";
      this.nodes.adminTabs.forEach((button) => {
        button.classList.toggle("active", button.dataset.adminTab === activeId);
      });
      this.nodes.adminPages.forEach((page) => {
        page.classList.toggle("active", page.dataset.adminPage === activeId);
      });
      },
      runAdminAction(action) {
      const game = IronLine.game;
      if (!game?.adminEnabled) return false;
      if (!game || !action) return false;
      if (action?.startsWith?.("note-")) return this.runPlaytestNoteAction(action);
      if (action === "spawn-selected") {
        return game.adminSpawnTestUnit({
          team: this.nodes.adminSpawnTeam?.value || "red",
          unitType: this.nodes.adminSpawnUnit?.value || "infantry",
          count: this.nodes.adminSpawnCount?.value || 1,
          location: this.nodes.adminSpawnLocation?.value || "mouse"
        });
      }
      return game.handleAdminAction(action);
      },
      bindVirtualStick(stick, type) {
      if (!stick) return;
      const knob = stick.querySelector("span");
      let pointerId = null;

      const update = (event) => {
        const game = IronLine.game;
        if (!game?.input?.virtual.enabled) return;
        const rect = stick.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const max = rect.width * 0.34;
        const rawX = event.clientX - centerX;
        const rawY = event.clientY - centerY;
        const length = Math.hypot(rawX, rawY);
        const scale = length > max ? max / Math.max(length, 1) : 1;
        const x = rawX * scale;
        const y = rawY * scale;
        if (knob) knob.style.transform = `translate(${x}px, ${y}px)`;

        if (type === "move") game.input.setVirtualAxis(x / max, y / max);
        else game.input.setVirtualAim(x / max, y / max);
      };

      const reset = () => {
        if (type === "move") {
          const game = IronLine.game;
          game?.input?.setVirtualAxis(0, 0);
          if (knob) knob.style.transform = "";
        }
        pointerId = null;
      };

      stick.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        pointerId = event.pointerId;
        stick.setPointerCapture?.(pointerId);
        update(event);
      });
      stick.addEventListener("pointermove", (event) => {
        if (pointerId !== event.pointerId) return;
        event.preventDefault();
        update(event);
      });
      stick.addEventListener("pointerup", (event) => {
        if (pointerId !== event.pointerId) return;
        event.preventDefault();
        reset();
      });
      stick.addEventListener("pointercancel", reset);
      },
      bindVirtualButtons() {
      const bindHold = (button, onDown, onUp) => {
        let pointerId = null;
        button.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          pointerId = event.pointerId;
          button.setPointerCapture?.(pointerId);
          onDown();
        });
        const release = (event) => {
          if (pointerId !== null && event?.pointerId !== undefined && event.pointerId !== pointerId) return;
          event?.preventDefault?.();
          pointerId = null;
          onUp();
        };
        button.addEventListener("pointerup", release);
        button.addEventListener("pointercancel", release);
        button.addEventListener("pointerleave", release);
      };

      const bindTap = (button, onTap) => {
        if (!button) return;
        let pointerId = null;
        button.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          pointerId = event.pointerId;
          button.setPointerCapture?.(pointerId);
          button.classList.add("pressed");
          onTap();
        });
        const release = (event) => {
          if (pointerId !== null && event?.pointerId !== undefined && event.pointerId !== pointerId) return;
          event?.preventDefault?.();
          pointerId = null;
          button.classList.remove("pressed");
        };
        button.addEventListener("pointerup", release);
        button.addEventListener("pointercancel", release);
        button.addEventListener("pointerleave", release);
      };

      this.nodes.mobileKeyButtons.forEach((button) => {
        bindHold(
          button,
          () => IronLine.game?.input?.setVirtualKey(button.dataset.mobileKey, true),
          () => IronLine.game?.input?.setVirtualKey(button.dataset.mobileKey, false)
        );
      });

      this.nodes.mobileMouseButtons.forEach((button) => {
        const buttonId = Number(button.dataset.mobileMouse);
        bindHold(
          button,
          () => IronLine.game?.input?.setVirtualMouseButton(buttonId, true),
          () => IronLine.game?.input?.setVirtualMouseButton(buttonId, false)
        );
      });

      bindTap(this.nodes.mobileWeaponButton, () => IronLine.game?.cycleMobileWeapon?.());
      bindTap(this.nodes.mobileRoleButton, () => IronLine.game?.roleChange?.openPanel?.());
      bindTap(this.nodes.mobileChatButton, () => IronLine.game?.chat?.openInput?.());
      bindTap(this.nodes.mobileSpectatorChatButton, () => IronLine.game?.chat?.openInput?.());
      bindTap(this.nodes.mobileSpectatorHomeButton, () => {
        const game = IronLine.game;
        if (!game?.adminCamera) return;
        game.adminCamera.followTarget = null;
        game.adminCamera.fitWorld?.();
      });
      },
      update(game) {
      const ui = this.nodes;
      document.body.classList.toggle("admin-observer-mode", Boolean(game.adminObserverMode));

      this.sessionFlow?.update(game);
      this.entryFlow?.update(game);
      this.updateObjectiveStrip(game);
      this.updateDeployment(game);
      this.updateLobby(game);
      this.commandRadio?.update(game);
      this.updateDeathScreen(game);
      this.updateResultScreen(game);
      this.updateScoreboard(game);
      this.updateSettings(game);
      this.updateAdminPanel(game);
      this.updateSpectatorPanel?.(game);
      this.updateMobileControls(game);

      const inTank = Boolean(game.player.inTank);
      const showWeaponPanel = !game.entryOpen && !game.deploymentOpen && !game.lobbyOpen && !game.result && !game.playerDeathActive && game.player.hp > 0 && !this.mobileControlsVisible;
      ui.bottomHud?.classList.toggle("hidden", !showWeaponPanel);
      ui.bottomHud?.classList.toggle("infantry-weapons", showWeaponPanel && !inTank);
      this.updateProneIndicator(game, showWeaponPanel && !inTank);
      if (!showWeaponPanel) return;

      if (inTank) this.updateTankWeapons(game.player.inTank);
      else this.updateInfantryWeapons(game.player, game);
      },
      updateProneIndicator(game, visible) {
      const indicator = this.nodes.proneIndicator;
      if (!indicator) return;
      const player = game.player;
      const transitioning = (player.proneTransitionTimer || 0) > 0;
      const active = visible && !player.controlledDrone && (player.isProne || transitioning);
      indicator.classList.toggle("hidden", !active);
      indicator.classList.toggle("transitioning", transitioning);
      if (!active) return;
      indicator.textContent = transitioning
        ? player.proneTargetState ? "PRONE" : "STAND"
        : "PRONE";
      },
      updateSettings(game) {
      this.nodes.debugControls.forEach((control) => {
        const key = control.dataset.debugOption;
        if (key) control.checked = Boolean(game.debug?.[key]);
      });

      if (this.nodes.mobileControlsToggle) {
        this.nodes.mobileControlsToggle.checked = Boolean(game.settings?.mobileControls);
      }

      this.updateFullscreenSettingButton?.(game);
      this.nodes.settingsButton?.setAttribute(
        "aria-expanded",
        String(!this.nodes.settingsPanel?.classList.contains("hidden"))
      );
      },
      updateAdminPanel(game) {
      const ui = this.nodes;
      if (!game.adminEnabled) {
        ui.adminButton?.classList.add("hidden");
        ui.adminButton?.setAttribute("aria-hidden", "true");
        ui.adminPanel?.classList.add("hidden");
        return;
      }
      ui.adminButton?.classList.remove("hidden");
      ui.adminButton?.setAttribute("aria-hidden", "false");
      ui.adminButton?.setAttribute(
        "aria-expanded",
        String(!ui.adminPanel?.classList.contains("hidden"))
      );
      if (game.adminObserverMode && ui.adminPanel?.classList.contains("hidden")) {
        ui.adminPanel.classList.remove("hidden");
        this.selectAdminTab(game.isAdminStandalonePage?.() ? "ops" : "observer");
      }

      if (ui.adminStatus) {
        const mode = game.testLab ? `테스트 ${game.testLab}` : game.matchStarted ? "실전 진행 중" : "배치 준비";
        const ai = game.testLabAiPaused ? "AI 정지" : "AI 작동";
        ui.adminStatus.textContent = game.adminMessage || `${mode} · ${ai}`;
      }

      ui.adminClassButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.adminClass === game.player?.classId);
      });

      if (ui.adminWeaponSelect && document.activeElement !== ui.adminWeaponSelect) {
        const weaponId = game.player?.weaponId || "machinegun";
        if (ui.adminWeaponSelect.value !== weaponId) ui.adminWeaponSelect.value = weaponId;
      }

      this.updateAdminOps(game);
      this.updateAdminObserver(game);
      this.updateAdminAiLab(game);
      },
      isAdminPageActive(pageId) {
      const ui = this.nodes;
      const panelVisible = Boolean(
        ui.adminPanel &&
        (!ui.adminPanel.classList.contains("hidden") || IronLine.game?.adminObserverMode)
      );
      return Boolean(
        panelVisible &&
        ui.adminPages.find((page) => page.dataset.adminPage === pageId)?.classList.contains("active")
      );
      },
      updateAdminOps(game) {
      if (!this.isAdminPageActive("ops")) return;

      const snapshot = game.adminOps?.createSnapshot?.({ lite: true }) || null;
      this.updateAdminOpsStats(snapshot);
      this.updateAdminRoomControls(snapshot);
      this.updateAdminOpsLobby(snapshot);
      this.updateAdminOpsRooms(snapshot);
      this.updateAdminOpsEvents(snapshot);
      this.updateAdminMapTools(snapshot);
      this.bindPlaytestNotes();
      this.updateAdminOpsBackup(snapshot);
      },
      updateAdminMapTools(snapshot) {
      const root = this.nodes.adminMapToolsSummary;
      if (!root || !snapshot) return;
      const map = snapshot.map || {};
      const scenery = Array.isArray(map.scenery) ? map.scenery : [];
      const rows = [
        { title: "맵 크기", meta: `${Math.round(map.width || 0)} x ${Math.round(map.height || 0)}` },
        { title: "거점", meta: `${map.capturePoints?.length || 0}개` },
        { title: "안전구역", meta: `${map.safeZones?.length || 0}개` },
        { title: "오브젝트", meta: `${scenery.length}개 · 파괴 가능 ${scenery.filter((item) => item.destructible).length}개` }
      ];
      const signature = JSON.stringify(rows);
      if (root.dataset.signature === signature) return;
      root.dataset.signature = signature;
      root.textContent = "";
      for (const item of rows) {
        const row = document.createElement("div");
        row.className = "admin-observer-row";
        const title = document.createElement("strong");
        title.textContent = item.title;
        const meta = document.createElement("span");
        meta.textContent = item.meta;
        row.append(title, meta);
        root.append(row);
      }
      },
      updateAdminRoomControls(snapshot) {
      const select = this.nodes.adminRoomSelect;
      if (!select || !snapshot) return;
      const rooms = snapshot.rooms || [];
      const selectedId = snapshot.selectedRoomId || rooms[0]?.id || "";
      const selectedRoom = rooms.find((room) => room.id === selectedId) || rooms[0] || null;
      const roomKey = selectedRoom?.id || "";
      const roomChanged = this.nodes.adminRoomControls?.dataset.selectedRoomKey !== roomKey;
      this.updateAdminFactionSelect(this.nodes.adminBlueFaction, selectedRoom?.blueFactionId || "singularity", roomChanged);
      this.updateAdminFactionSelect(this.nodes.adminRedFaction, selectedRoom?.redFactionId || "military-gallery", roomChanged);
      if (selectedRoom) {
        this.setAdminRoomControlValue(this.nodes.adminRoomName, selectedRoom.name || "", roomChanged);
        this.setAdminRoomControlValue(this.nodes.adminRoomMode, selectedRoom.mode || "conquest", roomChanged);
        this.setAdminRoomControlValue(this.nodes.adminRoomCapacity, selectedRoom.capacity || 8, roomChanged);
        this.setAdminRoomControlValue(this.nodes.adminRoomDifficulty, selectedRoom.difficulty || "normal", roomChanged);
        this.setAdminRoomControlValue(this.nodes.adminBlueTanks, selectedRoom.blueAiTanks ?? 3, roomChanged);
        this.setAdminRoomControlValue(this.nodes.adminRedTanks, selectedRoom.redTanks ?? 5, roomChanged);
        this.setAdminRoomControlValue(this.nodes.adminBlueInfantry, selectedRoom.blueInfantry ?? 21, roomChanged);
        this.setAdminRoomControlValue(this.nodes.adminRedInfantry, selectedRoom.redInfantry ?? 24, roomChanged);
      }
      if (this.nodes.adminRoomControls) this.nodes.adminRoomControls.dataset.selectedRoomKey = roomKey;
      const signature = JSON.stringify({
        rooms: rooms.map((room) => [
          room.id,
          room.name,
          room.phase,
          room.mode,
          room.blueFactionId,
          room.redFactionId,
          this.adminRoomPlayerCount(room),
          this.adminRoomSpectatorCount(room),
          room.capacity,
          room.spectatorCapacity,
          room.difficulty,
          room.blueAiTanks,
          room.blueInfantry,
          room.redTanks,
          room.redInfantry
        ]),
        selectedId
      });
      if (select.dataset.signature === signature) return;
      select.dataset.signature = signature;
      select.textContent = "";
      if (rooms.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "생성된 방 없음";
        select.append(option);
        select.disabled = true;
        return;
      }
      select.disabled = false;
      for (const room of rooms) {
        const option = document.createElement("option");
        option.value = room.id;
        option.textContent = `${room.id} · ${room.name} · ${this.adminRoomPhaseLabel(room.phase)}`;
        option.selected = room.id === selectedId;
        select.append(option);
      }
      },
      updateAdminFactionSelect(select, selectedId, forceValue = false) {
      if (!select) return;
      const factions = IronLine.playerFactions || IronLine.playerSkins || [];
      const signature = `${selectedId}:${factions.map((faction) => faction.id).join("|")}`;
      if (select.dataset.signature !== signature) {
        select.dataset.signature = signature;
        select.textContent = "";
        for (const faction of factions) {
          const option = document.createElement("option");
          option.value = faction.id;
          option.textContent = faction.name;
          option.selected = faction.id === selectedId;
          select.append(option);
        }
      }
      if (forceValue || !select.value) select.value = selectedId;
      },
      adminRoomPlayerCount(room = {}) {
      return room.playerCount ?? (room.players || []).filter((player) => player.participantType !== "spectator").length;
      },
      adminRoomSpectatorCount(room = {}) {
      return room.spectatorCount ?? (room.spectators || []).length;
      },
      updateAdminOpsStats(snapshot) {
      const root = this.nodes.adminOpsStats;
      if (!root || !snapshot) return;
      const server = snapshot.server || {};
      const room = snapshot.room || {};
      const match = snapshot.match || {};
      const ai = snapshot.ai?.summary || {};
      const playerCount = this.adminRoomPlayerCount(room);
      const spectatorCount = server.spectatorCount ?? this.adminRoomSpectatorCount(room);
      const spectatorCapacity = Math.max(0, Math.round(Number(room.spectatorCapacity) || 12));
      const values = [
        { label: "연결", value: `${server.clientCount || 0}명` },
        { label: "관리자", value: `${server.adminCount || 0}명` },
        { label: "방", value: `${server.roomCount || 0}개` },
        { label: "플레이어", value: `${playerCount || 0}/${(room.roleSlots || []).length || room.capacity || 0}` },
        { label: "관전", value: `${spectatorCount || 0}/${spectatorCapacity}` },
        { label: "경기", value: match.started ? "진행 중" : room.phase === "lobby" ? "로비" : "대기" },
        { label: "모드", value: match.mode === "conquest" ? "점령전" : "섬멸전" },
        { label: "난이도", value: this.adminDifficultyLabel(room.difficulty || match.difficulty) },
        { label: "전차", value: `${room.blueAiTanks ?? "-"} / ${room.redTanks ?? "-"}` },
        { label: "보병", value: `${room.blueInfantry ?? "-"} / ${room.redInfantry ?? "-"}` },
        { label: "AI", value: `${ai.total || 0}개` },
        { label: "경고", value: `${ai.warnings || 0}건` },
        { label: "저장", value: snapshot.backup?.local ? "임시 있음" : "임시 없음" }
      ];
      const signature = JSON.stringify(values);
      if (root.dataset.signature === signature) return;
      root.dataset.signature = signature;
      root.textContent = "";
      for (const item of values) {
        const tile = document.createElement("div");
        const label = document.createElement("span");
        label.textContent = item.label;
        const value = document.createElement("strong");
        value.textContent = item.value;
        tile.append(label, value);
        root.append(tile);
      }
      },
      updateAdminOpsRooms(snapshot) {
      const root = this.nodes.adminOpsRooms;
      if (!root || !snapshot) return;
      const rooms = Array.isArray(snapshot.rooms) ? snapshot.rooms : [snapshot.room || {}];
      const selectedId = snapshot.selectedRoomId || snapshot.room?.id || "";
      if (rooms.length === 0) {
        root.textContent = "";
        const empty = document.createElement("span");
        empty.className = "admin-observer-empty";
        empty.textContent = "생성된 방이 없습니다. 방 제어에서 새 방을 만드세요.";
        root.append(empty);
        return;
      }
      const rows = rooms.map((room) => {
        const players = this.adminRoomPlayerCount(room);
        const spectators = this.adminRoomSpectatorCount(room);
        const capacity = room.capacity || 8;
        const spectatorCapacity = Math.max(0, Math.round(Number(room.spectatorCapacity) || 12));
        return {
          id: room.id || "local",
          phase: room.phase || "waiting",
          title: `${room.id || "local"} · ${room.name || "전장"}`,
          meta: `${this.adminRoomPhaseLabel(room.phase)} · ${room.mode === "conquest" ? "점령전" : "섬멸전"} · ${this.factionName(room.blueFactionId)} vs ${this.factionName(room.redFactionId)} · 슬롯 ${players}/${capacity} · 관전 ${spectators}/${spectatorCapacity} · 전차 ${room.blueAiTanks ?? 0}/${room.redTanks ?? 0} · AI ${this.adminDifficultyLabel(room.difficulty)}${this.adminRoomPlayerNames?.(room) || ""}`,
          selected: room.id === selectedId
        };
      });
      const signature = JSON.stringify(rows);
      if (root.dataset.signature === signature) return;
      root.dataset.signature = signature;
      root.textContent = "";
      for (const item of rows) {
        const row = document.createElement("div");
        row.className = "admin-observer-row";
        row.dataset.phase = item.phase;
        row.classList.toggle("selected", Boolean(item.selected));
        row.addEventListener("click", () => {
          IronLine.roomRegistry?.selectRoom?.(item.id);
          const select = this.nodes.adminRoomSelect;
          if (select) select.value = item.id;
          const game = IronLine.game;
          game?.handleAdminAction?.("room-select");
          root.dataset.signature = "";
        });
        const title = document.createElement("strong");
        title.textContent = item.title;
        const meta = document.createElement("span");
        meta.textContent = item.meta;
        row.append(title, meta);
        root.append(row);
      }
      },
      factionName(id) {
      return IronLine.playerFactionById?.(id)?.name || IronLine.playerSkinById?.(id)?.name || "세력 미정";
      },
      adminRoomPhaseLabel(phase) {
      if (phase === "playing") return "진행 중";
      if (phase === "loading") return "로딩";
      if (phase === "ended") return "종료";
      return "대기";
      },
      updateAdminOpsEvents(snapshot) {
      const root = this.nodes.adminOpsEvents;
      if (!root || !snapshot) return;
      const events = Array.isArray(snapshot.events) ? snapshot.events.slice(-18).reverse() : [];
      const signature = JSON.stringify(events.map((event) => [event.id, event.type, event.title, event.detail, event.severity]));
      if (root.dataset.signature === signature) return;
      root.dataset.signature = signature;
      root.textContent = "";
      if (events.length === 0) {
        const empty = document.createElement("span");
        empty.className = "admin-observer-empty";
        empty.textContent = "아직 기록된 전황 이벤트가 없습니다.";
        root.append(empty);
        return;
      }
      for (const event of events) {
        const row = document.createElement("div");
        row.className = "admin-event-row";
        row.dataset.severity = event.severity || "info";
        const title = document.createElement("strong");
        title.textContent = event.title || this.eventTypeLabel(event.type);
        const meta = document.createElement("span");
        meta.textContent = `${this.eventTimeLabel(event.createdAt)} · ${event.detail || this.eventTypeLabel(event.type)}`;
        row.append(title, meta);
        root.append(row);
      }
      },
      eventTypeLabel(type) {
      const labels = {
        participant_joined: "참가자 입장",
        participant_role_changed: "참가 형태 변경",
        ready_changed: "준비 상태 변경",
        slot_changed: "슬롯 변경",
        room_created: "방 생성",
        room_started: "방 시작",
        room_ended: "방 종료",
        room_reset: "방 초기화",
        match_started: "전투 시작",
        match_ended: "전투 종료",
        objective_captured: "거점 점령",
        player_down: "플레이어 전투 불능",
        vehicle_destroyed: "차량 파괴"
      };
      return labels[type] || "전황 이벤트";
      },
      eventTimeLabel(value) {
      let time = Number(value);
      if (!Number.isFinite(time)) time = Date.parse(value);
      if (!Number.isFinite(time)) return "방금";
      const date = new Date(time);
      if (Number.isNaN(date.getTime())) return "방금";
      return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      },
      updateAdminOpsBackup(snapshot) {
      const root = this.nodes.adminOpsBackup;
      if (!root || !snapshot) return;
      const backup = snapshot.backup || {};
      const local = backup.local || null;
      const providers = snapshot.providers || [];
      const rows = [
        {
          title: "브라우저 임시 저장",
          meta: local ? `${this.formatAbsoluteTime(local.exportedAt)} · ${Math.round((local.size || 0) / 1024)}KB` : "저장된 백업 없음"
        },
        {
          title: "서버 백업",
          meta: "서버 연동 후 자동 보관 예정"
        },
        {
          title: "외부 드라이브",
          meta: "Drive API는 다음 단계에서 Provider로 연결"
        },
        ...providers.map((provider) => ({
          title: provider.label,
          meta: provider.status === "active" ? "사용 가능" : "대기 중"
        }))
      ];
      const signature = JSON.stringify(rows);
      if (root.dataset.signature === signature) return;
      root.dataset.signature = signature;
      root.textContent = "";
      for (const item of rows) {
        const row = document.createElement("div");
        row.className = "admin-observer-row";
        const title = document.createElement("strong");
        title.textContent = item.title;
        const meta = document.createElement("span");
        meta.textContent = item.meta;
        row.append(title, meta);
        root.append(row);
      }
      },
      formatAbsoluteTime(value) {
      const time = Number(value) || 0;
      if (!time) return "-";
      const date = new Date(time);
      const hh = String(date.getHours()).padStart(2, "0");
      const mm = String(date.getMinutes()).padStart(2, "0");
      return `${date.getMonth() + 1}/${date.getDate()} ${hh}:${mm}`;
      },
      updateAdminObserver(game) {
      const ui = this.nodes;
      if (!this.isAdminPageActive("observer")) return;

      const snapshot = this.adminObserverSnapshot(game);
      if (snapshot) this.buildAdminSnapshotMap(snapshot, ui.adminObserverMap);
      else this.buildMapMarkers(game, ui.adminObserverMap);
      this.updateAdminObserverStats(game, snapshot);
      this.updateAdminObserverSlots(game, snapshot);
      this.updateAdminObserverSquads(game, snapshot);
      this.updateAdminObserverDetails(game, snapshot);
      this.updateAdminObserverCommands(game, snapshot);
      },
      adminObserverSnapshot(game) {
      const snapshot = game.observerSnapshot || null;
      if (!snapshot) return null;
      const age = Date.now() - (snapshot.sentAt || 0);
      return age <= 2600 ? snapshot : null;
      },
      updateAdminObserverStats(game, snapshot = null) {
      const root = this.nodes.adminObserverStats;
      if (!root) return;
      const blue = snapshot?.teams?.[TEAM.BLUE] || this.teamStats(game, TEAM.BLUE);
      const red = snapshot?.teams?.[TEAM.RED] || this.teamStats(game, TEAM.RED);
      const activeCommands = snapshot
        ? (snapshot.commands || []).filter((entry) => entry.accepted).length
        : (game.commandBus?.log || []).filter((entry) => entry.accepted).length;
      const match = snapshot?.match || {};
      const localScore = ["conquest", "annihilation"].includes(game.matchConfig?.mode) ? game.conquest?.score : game.annihilation?.score;
      const localTime = game.matchConfig?.mode === "conquest"
        ? game.conquest?.remaining ?? 0
        : game.annihilation?.state === "intermission" ? game.annihilation?.intermissionRemaining || 0 : game.matchTime || 0;
      const values = [
        { label: "연결", value: snapshot ? "플레이어 화면" : "로컬 관전" },
        { label: "상태", value: snapshot ? match.started ? "전투 중" : match.lobbyOpen ? "로비" : "배치" : game.matchStarted ? "전투 중" : game.lobbyOpen ? "로비" : "배치" },
        { label: "시간", value: this.formatTime(snapshot ? match.remaining ?? 0 : localTime) },
        { label: "청팀", value: `${blue.alive}/${blue.total}` },
        { label: "홍팀", value: `${red.alive}/${red.total}` },
        { label: "점수", value: snapshot ? `${Math.floor(match.score?.[TEAM.BLUE] || 0)} : ${Math.floor(match.score?.[TEAM.RED] || 0)}` : `${Math.floor(localScore?.[TEAM.BLUE] || 0)} : ${Math.floor(localScore?.[TEAM.RED] || 0)}` },
        { label: "명령", value: String(activeCommands) }
      ];
      const signature = JSON.stringify(values);
      if (root.dataset.signature === signature) return;
      root.dataset.signature = signature;
      root.textContent = "";
      for (const item of values) {
        const tile = document.createElement("div");
        const label = document.createElement("span");
        label.textContent = item.label;
        const value = document.createElement("strong");
        value.textContent = item.value;
        tile.append(label, value);
        root.append(tile);
      }
      },
      updateAdminObserverSlots(game, snapshot = null) {
      const root = this.nodes.adminObserverSlots;
      if (!root) return;
      const slots = snapshot?.roleSlots || game.onlineSession?.roleSlots || [];
      const signature = JSON.stringify(slots.map((slot) => [
        slot.id,
        slot.playerId,
        slot.aiControlled,
        slot.squadIds?.join(","),
        slot.vehicleIds?.join(",")
      ]));
      if (root.dataset.signature === signature) return;
      root.dataset.signature = signature;
      root.textContent = "";
      for (const slot of slots) {
        const row = document.createElement("div");
        row.className = `admin-observer-row team-${slot.team === TEAM.RED ? "red" : "blue"}`;
        row.dataset.inspectKind = "slot";
        row.dataset.inspectId = slot.id;
        row.classList.toggle("selected", this.isAdminInspectSelected("slot", slot.id));
        row.addEventListener("click", () => this.selectAdminInspectTarget("slot", slot.id));
        const title = document.createElement("strong");
        title.textContent = `${this.teamName(slot.team)} ${slot.label}`;
        const meta = document.createElement("span");
        const owner = slot.playerId ? this.adminSlotPlayerLabel?.(game, snapshot, slot) || "플레이어" : "AI";
        const assets = [`분대 ${slot.squadIds?.length || 0}`];
        if ((slot.vehicleIds?.length || 0) > 0) assets.push(`차량 ${slot.vehicleIds.length}`);
        meta.textContent = `${owner} · ${assets.join(" / ")}`;
        row.append(title, meta);
        root.append(row);
      }
      },
      updateAdminObserverSquads(game, snapshot = null) {
      const root = this.nodes.adminObserverSquads;
      if (!root) return;
      const rows = snapshot ? (snapshot.squads || [])
        .sort((a, b) => `${a.team}:${a.id}`.localeCompare(`${b.team}:${b.id}`))
        .slice(0, 14)
        .map((squad) => ({
          id: squad.id,
          team: squad.team,
          alive: `${squad.alive}/${squad.total}`,
          mode: squad.mode || "-",
          order: squad.order || "자동"
        })) : (game.squads || [])
        .filter((squad) => squad.units?.length)
        .sort((a, b) => `${a.team}:${a.callSign}`.localeCompare(`${b.team}:${b.callSign}`))
        .slice(0, 14)
        .map((squad) => {
          const active = squad.activeUnits?.().length || 0;
          const total = (squad.units || []).filter((unit) => unit.classId !== "scout").length || squad.units.length;
          const order = squad.manualOrder
            ? `${this.commandLabel(squad.manualOrder.type)} ${squad.order?.objectiveName || ""}`.trim()
            : squad.order?.objectiveName || "자동";
          return {
            id: squad.callSign,
            team: squad.team,
            alive: `${active}/${total}`,
            mode: `${squad.tacticalMode || "-"}${squad.commandState ? `/${squad.commandState}` : ""}`,
            order
          };
        });
      const signature = JSON.stringify(rows);
      if (root.dataset.signature === signature) return;
      root.dataset.signature = signature;
      root.textContent = "";
      for (const item of rows) {
        const row = document.createElement("div");
        row.className = `admin-observer-row team-${item.team === TEAM.RED ? "red" : "blue"}`;
        row.dataset.inspectKind = "squad";
        row.dataset.inspectId = item.id;
        row.classList.toggle("selected", this.isAdminInspectSelected("squad", item.id));
        row.addEventListener("click", () => this.selectAdminInspectTarget("squad", item.id));
        const title = document.createElement("strong");
        title.textContent = `${item.id} · ${item.alive}`;
        const meta = document.createElement("span");
        meta.textContent = `${item.mode} · ${item.order}`;
        row.append(title, meta);
        root.append(row);
      }
      },
      updateAdminObserverCommands(game, snapshot = null) {
      const root = this.nodes.adminObserverCommands;
      if (!root) return;
      const entries = snapshot
        ? (snapshot.commands || []).slice(-8).reverse()
        : (game.commandBus?.log || []).slice(-8).reverse();
      const signature = JSON.stringify(entries.map((entry) => entry.summary));
      if (root.dataset.signature === signature) return;
      root.dataset.signature = signature;
      root.textContent = "";
      if (entries.length === 0) {
        const empty = document.createElement("span");
        empty.className = "admin-observer-empty";
        empty.textContent = "아직 명령 없음";
        root.append(empty);
        return;
      }
      for (const entry of entries) {
        const row = document.createElement("div");
        row.className = `admin-observer-row ${entry.accepted ? "" : "rejected"}`;
        const title = document.createElement("strong");
        title.textContent = entry.accepted
          ? this.commandLabel(entry.packet?.type || entry.type)
          : `거부 ${this.commandLabel(entry.packet?.type || entry.type)}`;
        const meta = document.createElement("span");
        meta.textContent = entry.summary;
        row.append(title, meta);
        root.append(row);
      }
      },
      selectAdminInspectTarget(kind, id) {
      if (!kind || !id) return;
      this.adminInspectTarget = { kind, id: String(id) };
      for (const key of ["adminObserverSlots", "adminObserverSquads", "adminObserverDetails", "adminAiUnits", "adminAiNetwork", "adminAiEvents"]) {
        const node = this.nodes[key];
        if (node) node.dataset.signature = "";
      }
      const map = this.nodes.adminObserverMap;
      if (map) {
        map.dataset.snapshotReady = "";
        map.dataset.markersReady = "";
        map.dataset.nextSnapshotRefresh = "0";
        map.dataset.nextMarkerRefresh = "0";
      }
      const game = IronLine.game;
      if (game) {
        game.adminCamera?.followInspectTarget?.(kind, id);
        this.updateAdminObserver(game);
        this.updateAdminAiLab(game);
      }
      },
      isAdminInspectSelected(kind, id) {
      return this.adminInspectTarget?.kind === kind && this.adminInspectTarget?.id === String(id || "");
      },
      updateAdminObserverDetails(game, snapshot = null) {
      const root = this.nodes.adminObserverDetails;
      if (!root) return;
      const target = this.resolveAdminInspectTarget(game, snapshot);
      const signature = JSON.stringify(target);
      if (root.dataset.signature === signature) return;
      root.dataset.signature = signature;
      root.textContent = "";

      if (!target) {
        const empty = document.createElement("span");
        empty.className = "admin-observer-empty";
        empty.textContent = "지도나 목록에서 분대, 차량, 거점을 선택하세요.";
        root.append(empty);
        return;
      }

      const header = document.createElement("div");
      header.className = `admin-observer-row ${target.team ? `team-${target.team === TEAM.RED ? "red" : "blue"}` : ""}`;
      const title = document.createElement("strong");
      title.textContent = target.title;
      const meta = document.createElement("span");
      meta.textContent = target.meta || "";
      header.append(title, meta);
      root.append(header);

      for (const item of target.rows || []) {
        const row = document.createElement("div");
        row.className = "admin-observer-row compact";
        const label = document.createElement("strong");
        label.textContent = item.label;
        const value = document.createElement("span");
        value.textContent = item.value;
        row.append(label, value);
        root.append(row);
      }
      },
      resolveAdminInspectTarget(game, snapshot = null) {
      const current = this.adminInspectTarget || {};
      const squads = snapshot?.squads || this.localSquadSnapshots(game);
      const vehicles = snapshot?.vehicles || this.localVehicleSnapshots(game);
      const points = snapshot?.capturePoints || this.localObjectiveSnapshots(game);
      const slots = snapshot?.roleSlots || game.onlineSession?.roleSlots || [];
      const aiUnits = this.adminAiSnapshot(game)?.units || [];

      let kind = current.kind;
      let id = current.id;
      if (!id) {
        const first = squads[0] || vehicles[0] || points[0] || slots[0];
        if (!first) return null;
        kind = first.kind || (first.name ? "objective" : first.squadIds ? "slot" : "squad");
        id = first.id || first.name;
        this.adminInspectTarget = { kind, id: String(id) };
      }

      if (kind === "slot") return this.adminSlotDetail(slots.find((slot) => slot.id === id), squads, vehicles, aiUnits);
      if (kind === "vehicle") return this.adminVehicleDetail(vehicles.find((vehicle) => vehicle.id === id), this.adminAiUnitById(aiUnits, "vehicle", id));
      if (kind === "crew") return this.adminCrewDetail(aiUnits.find((unit) => unit.kind === "crew" && unit.id === id));
      if (kind === "objective") return this.adminObjectiveDetail(points.find((point) => point.name === id));
      return this.adminSquadDetail(squads.find((squad) => squad.id === id), slots, this.adminAiUnitById(aiUnits, "squad", id));
      },
      adminSlotDetail(slot, squads = [], vehicles = [], aiUnits = []) {
      if (!slot) return null;
      const slotSquads = squads.filter((squad) => (slot.squadIds || []).includes(squad.id));
      const slotVehicles = vehicles.filter((vehicle) => (slot.vehicleIds || []).includes(vehicle.id));
      const slotAi = aiUnits.filter((unit) => (slot.squadIds || []).includes(unit.id) || (slot.vehicleIds || []).includes(unit.id));
      const issueCount = slotAi.reduce((total, unit) => total + (unit.issues?.length || 0), 0);
      return {
        title: `${this.teamName(slot.team)} ${slot.label || slot.roleId}`,
        team: slot.team,
        meta: slot.playerId ? `플레이어 ${slot.playerId}` : "AI 운용 슬롯",
        rows: [
          { label: "AI 주의", value: issueCount ? `${issueCount}` : "0" },
          { label: "상태", value: slot.locked ? "잠금" : "대기 가능" },
          { label: "분대", value: slotSquads.length ? slotSquads.map((squad) => `${squad.id} ${squad.alive}/${squad.total}`).join(" / ") : "없음" },
          { label: "차량", value: slotVehicles.length ? slotVehicles.map((vehicle) => `${vehicle.id} ${Math.round(vehicle.hp || 0)}`).join(" / ") : "없음" },
          { label: "권한", value: slot.role || slot.roleId || "-" }
        ]
      };
      },
      adminSquadDetail(squad, slots = [], aiUnit = null) {
      if (!squad) return null;
      const slot = slots.find((item) => (item.squadIds || []).includes(squad.id));
      return {
        title: `분대 ${squad.id}`,
        team: squad.team,
        meta: `${this.teamName(squad.team)} · ${squad.alive}/${squad.total}`,
        rows: [
          ...this.adminAiDecisionRows(aiUnit),
          { label: "슬롯", value: slot ? `${slot.label || slot.roleId} ${slot.playerId ? "플레이어" : "AI"}` : "미배정" },
          { label: "상태", value: squad.mode || squad.state || "-" },
          { label: "명령", value: squad.order || "자동" },
          { label: "목표", value: squad.objective || squad.target || "없음" },
          { label: "좌표", value: `${Math.round(squad.x || 0)}, ${Math.round(squad.y || 0)}` }
        ]
      };
      },
      adminVehicleDetail(vehicle, aiUnit = null) {
      if (!vehicle) return null;
      return {
        title: `차량 ${vehicle.id}`,
        team: vehicle.team,
        meta: `${this.teamName(vehicle.team)} · ${vehicle.type || "vehicle"}`,
        rows: [
          ...this.adminAiDecisionRows(aiUnit),
          { label: "체력", value: `${Math.round(vehicle.hp || 0)} / ${Math.round(vehicle.maxHp || 1)}` },
          { label: "상태", value: vehicle.state || "-" },
          { label: "목표", value: vehicle.target || "없음" },
          { label: "탑승", value: String(vehicle.passengers || 0) },
          { label: "좌표", value: `${Math.round(vehicle.x || 0)}, ${Math.round(vehicle.y || 0)}` }
        ]
      };
      },
      adminAiUnitById(units = [], kind = "", id = "") {
      const targetKind = kind === "vehicle" ? "vehicle" : "squad";
      return (units || []).find((unit) => unit.id === id && unit.kind === targetKind) || null;
      },
      adminCrewDetail(unit = null) {
      if (!unit) return null;
      return {
        title: `승무원 ${unit.id}`,
        team: unit.team,
        meta: `${this.teamName(unit.team)} · ${unit.state || "-"}`,
        rows: [
          ...this.adminAiDecisionRows(unit),
          { label: "대상 차량", value: unit.target || "없음" },
          { label: "체력", value: `${Math.round(unit.hp || 0)} / ${Math.round(unit.maxHp || 1)}` },
          { label: "좌표", value: `${Math.round(unit.x || 0)}, ${Math.round(unit.y || 0)}` }
        ]
      };
      },
      adminAiDecisionRows(unit) {
      if (!unit) return [{ label: "AI", value: "관측 대기" }];
      const decision = unit.decision || {};
      const score = Math.round((decision.score || 0) * 100);
      const scoreParts = Object.entries(decision.scores || {})
        .slice(0, 3)
        .map(([key, value]) => `${this.aiDecisionLabel(key)} ${Math.round((value || 0) * 100)}%`)
        .join(" / ");
      const sample = (unit.sample || [])
        .slice(0, 3)
        .map((member) => `${member.id}:${this.aiDecisionLabel(member.decision?.decision || member.state)}`)
        .join(" / ");
      const rows = [
        { label: "AI", value: `${this.aiDecisionLabel(decision.decision)} ${score}%` },
        { label: "이유", value: decision.reasonLabel || decision.reason || "-" },
        { label: "문제", value: (unit.issues || []).join(", ") || "없음" },
        { label: "끼임", value: `${Number(unit.stuck || 0).toFixed(1)}s` }
      ];
      if (scoreParts) rows.push({ label: "점수", value: scoreParts });
      if (sample) rows.push({ label: "대상", value: sample });
      if (unit.pathLength !== undefined) rows.push({ label: "경로", value: `${unit.pathIndex || 0}/${unit.pathLength || 0}` });
      return rows;
      },
      adminObjectiveDetail(point) {
      if (!point) return null;
      return {
        title: `거점 ${point.name}`,
        team: point.owner,
        meta: point.contested ? "교전 중" : "안정",
        rows: [
          { label: "소유", value: point.owner ? this.teamName(point.owner) : "중립" },
          { label: "진행률", value: `${Math.round((point.progress || 0) * 100)}%` },
          { label: "좌표", value: `${Math.round(point.x || 0)}, ${Math.round(point.y || 0)}` }
        ]
      };
      },
      localSquadSnapshots(game) {
      return (game.squads || [])
        .filter((squad) => squad.units?.length)
        .map((squad) => {
          const active = squad.activeUnits?.() || [];
          const centerUnits = active.length ? active : squad.units.filter((unit) => unit.alive);
          const center = centerUnits.length
            ? centerUnits.reduce((sum, unit) => ({ x: sum.x + unit.x, y: sum.y + unit.y }), { x: 0, y: 0 })
            : null;
          if (center) {
            center.x /= centerUnits.length;
            center.y /= centerUnits.length;
          }
          const total = (squad.units || []).filter((unit) => unit.classId !== "scout").length || squad.units.length;
          return {
            kind: "squad",
            id: squad.callSign,
            team: squad.team,
            x: center?.x || squad.order?.point?.x || 0,
            y: center?.y || squad.order?.point?.y || 0,
            alive: active.length,
            total,
            mode: squad.tacticalMode || "",
            order: squad.manualOrder
              ? `${this.commandLabel(squad.manualOrder.type)} ${squad.order?.objectiveName || ""}`.trim()
              : squad.order?.objectiveName || "자동",
            objective: squad.order?.objectiveName || squad.order?.point?.name || "",
            target: squad.status?.lastThreat?.callSign || squad.status?.armorThreat?.vehicle?.callSign || ""
          };
        });
      },
      localVehicleSnapshots(game) {
      return [...(game.tanks || []), ...(game.humvees || [])]
        .filter((vehicle) => vehicle.alive)
        .map((vehicle) => ({
          kind: "vehicle",
          id: vehicle.callSign,
          team: vehicle.team,
          x: vehicle.x,
          y: vehicle.y,
          hp: vehicle.hp,
          maxHp: vehicle.maxHp,
          type: vehicle.vehicleType || "tank",
          state: vehicle.ai?.debug?.state || vehicle.ai?.state || "",
          target: vehicle.ai?.debug?.target?.callSign || vehicle.ai?.target?.callSign || vehicle.ai?.targetTank?.callSign || "",
          passengers: vehicle.passengerCount?.() || 0
        }));
      },
      localObjectiveSnapshots(game) {
      return (game.capturePoints || []).map((point) => ({
        name: point.name,
        x: point.x,
        y: point.y,
        owner: point.owner,
        progress: point.progress || 0,
        contested: Boolean(point.contested)
      }));
      },
      updateAdminAiLab(game) {
      if (!this.isAdminPageActive("ai")) return;

      const snapshot = this.adminAiSnapshot(game);
      this.updateAdminAiStats(snapshot);
      this.updateAdminAiUnits(snapshot);
      this.updateAdminAiNetwork(snapshot);
      this.updateAdminAiEvents(snapshot);
      },
      adminAiSnapshot(game) {
      const remote = this.adminObserverSnapshot(game)?.ai || null;
      if (remote?.updatedAt && Date.now() - remote.updatedAt <= 3200) return remote;
      return game.aiObservatory?.latest?.() || null;
      },
      updateAdminAiStats(snapshot) {
      const root = this.nodes.adminAiStats;
      if (!root) return;
      const summary = snapshot?.summary || {};
      const issueCounts = summary.issueCounts || {};
      const decisionCounts = summary.decisionCounts || {};
      const topIssues = Object.entries(issueCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([label, count]) => `${label} ${count}`)
        .join(" / ") || "없음";
      const topDecisions = Object.entries(decisionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([label, count]) => `${this.aiDecisionLabel(label)} ${count}`)
        .join(" / ") || "없음";
      const values = [
        { label: "상태", value: snapshot?.paused ? "AI 정지" : "AI 동작" },
        { label: "분대", value: String(summary.squads || 0) },
        { label: "차량", value: String(summary.vehicles || 0) },
        { label: "승무원", value: String(summary.crews || 0) },
        { label: "주의", value: String(summary.warnings || 0) },
        { label: "주요 판단", value: topDecisions },
        { label: "주요 문제", value: topIssues }
      ];
      const signature = JSON.stringify(values);
      if (root.dataset.signature === signature) return;
      root.dataset.signature = signature;
      root.textContent = "";
      for (const item of values) {
        const tile = document.createElement("div");
        const label = document.createElement("span");
        label.textContent = item.label;
        const value = document.createElement("strong");
        value.textContent = item.value;
        tile.append(label, value);
        root.append(tile);
      }
      },
      updateAdminAiUnits(snapshot) {
      const root = this.nodes.adminAiUnits;
      if (!root) return;
      const units = (snapshot?.units || [])
        .slice()
        .sort((a, b) => {
          const aw = (a.issues || []).length;
          const bw = (b.issues || []).length;
          if (aw !== bw) return bw - aw;
          const as = a.decision?.score || 0;
          const bs = b.decision?.score || 0;
          if (as !== bs) return bs - as;
          return `${a.team}:${a.id}`.localeCompare(`${b.team}:${b.id}`);
        })
        .slice(0, 18);
      const signature = JSON.stringify(units.map((unit) => [
        unit.id,
        unit.state,
        unit.order,
        unit.target,
        unit.stuck,
        unit.decision?.decision,
        unit.decision?.reason,
        unit.decision?.score,
        (unit.issues || []).join(",")
      ]));
      if (root.dataset.signature === signature) return;
      root.dataset.signature = signature;
      root.textContent = "";
      if (!units.length) {
        const empty = document.createElement("span");
        empty.className = "admin-observer-empty";
        empty.textContent = "관측할 AI 없음";
        root.append(empty);
        return;
      }
      for (const unit of units) {
        const row = document.createElement("div");
        row.className = `admin-observer-row team-${unit.team === TEAM.RED ? "red" : "blue"} ${unit.issues?.length ? "rejected" : ""}`;
        const inspectKind = unit.kind === "vehicle" ? "vehicle" : unit.kind === "crew" ? "crew" : "squad";
        row.dataset.inspectKind = inspectKind;
        row.dataset.inspectId = unit.id;
        row.classList.toggle("selected", this.isAdminInspectSelected(inspectKind, unit.id));
        row.addEventListener("click", () => this.selectAdminInspectTarget(inspectKind, unit.id));
        const title = document.createElement("strong");
        const count = unit.kind === "squad" ? ` ${unit.alive}/${unit.total}` : ` ${unit.hp}/${unit.maxHp}`;
        title.textContent = `${unit.id}${count}`;
        const meta = document.createElement("span");
        const issue = (unit.issues || []).join(", ");
        const decision = unit.decision
          ? ` · 판단 ${this.aiDecisionLabel(unit.decision.decision)} ${Math.round((unit.decision.score || 0) * 100)}% · 이유 ${unit.decision.reasonLabel || unit.decision.reason}`
          : "";
        meta.textContent = `${unit.state || "-"} · ${unit.order || "자동"}${unit.target ? ` · 목표 ${unit.target}` : ""}${decision}${issue ? ` · ${issue}` : ""}`;
        row.append(title, meta);
        root.append(row);
      }
      },
      updateAdminAiNetwork(snapshot) {
      const root = this.nodes.adminAiNetwork;
      if (!root) return;
      const units = snapshot?.units || [];
      const selected = this.resolveSelectedAiNetworkUnit(units);
      const signature = JSON.stringify(selected ? {
        id: selected.id,
        kind: selected.kind,
        state: selected.state,
        order: selected.order,
        target: selected.target,
        decision: selected.decision,
        issues: selected.issues
      } : null);
      if (root.dataset.signature === signature) return;
      root.dataset.signature = signature;
      root.textContent = "";

      if (!selected) {
        const empty = document.createElement("span");
        empty.className = "admin-observer-empty";
        empty.textContent = "AI 목록에서 대상을 선택하면 감각 입력 -> 판단망 -> 행동 출력 흐름을 표시합니다.";
        root.append(empty);
        return;
      }

      const graph = document.createElement("div");
      graph.className = "admin-ai-network-graph";
      graph.append(
        this.aiNetworkColumn("입력", this.aiNetworkInputs(selected)),
        this.aiNetworkColumn("판단망", this.aiNetworkScores(selected)),
        this.aiNetworkColumn("출력", this.aiNetworkOutputs(selected))
      );
      root.append(graph);
      },
      resolveSelectedAiNetworkUnit(units = []) {
      const current = this.adminInspectTarget || {};
      const mappedKind = current.kind === "vehicle" ? "vehicle" : current.kind === "crew" ? "crew" : "squad";
      return units.find((unit) => unit.kind === mappedKind && unit.id === current.id) ||
        units.find((unit) => (unit.issues || []).length > 0) ||
        units[0] ||
        null;
      },
      aiNetworkColumn(title, rows) {
      const column = document.createElement("div");
      column.className = "admin-ai-network-column";
      const head = document.createElement("strong");
      head.textContent = title;
      column.append(head);
      for (const row of rows) {
        const node = document.createElement("div");
        node.className = `admin-ai-node ${row.active ? "active" : ""} ${row.muted ? "muted" : ""}`;
        const label = document.createElement("span");
        label.textContent = row.label;
        const value = document.createElement("em");
        value.textContent = row.value;
        node.append(label, value);
        column.append(node);
      }
      return column;
      },
      aiNetworkInputs(unit) {
      const facts = unit.decision?.facts || {};
      const rows = [
        { label: "대상", value: facts.targetId || unit.target || "없음", active: Boolean(facts.targetId || unit.target) },
        { label: "시야", value: facts.visible === undefined ? "-" : facts.visible ? "확보" : "차단", active: facts.visible === true, muted: facts.visible === false },
        { label: "사거리", value: facts.inRange === undefined ? "-" : facts.inRange ? "내부" : "외부", active: facts.inRange === true, muted: facts.inRange === false },
        { label: "아군 사선", value: facts.friendlyBlocked ? "위험" : "안전", active: facts.friendlyBlocked, muted: !facts.friendlyBlocked },
        { label: "끼임", value: unit.stuck ? `${Number(unit.stuck).toFixed(1)}s` : "없음", active: Number(unit.stuck || 0) > 0.9 },
        { label: "탑승/좌석", value: facts.mounted ? "탑승" : facts.playerControlled ? "플레이어 점유" : facts.seatOccupied ? "좌석 점유" : unit.passengers ? `${unit.passengers}명` : "-", active: facts.playerControlled || facts.seatOccupied || facts.mounted }
      ];
      return rows;
      },
      aiNetworkScores(unit) {
      const scores = unit.decision?.scores || {};
      const entries = Object.entries(scores).slice(0, 5);
      if (!entries.length) return [{ label: "판단 점수", value: `${Math.round((unit.decision?.score || 0) * 100)}%`, active: true }];
      const best = entries.reduce((top, entry) => (entry[1] || 0) > (top[1] || 0) ? entry : top, entries[0]);
      return entries.map(([key, value]) => ({
        label: this.aiDecisionLabel(key),
        value: `${Math.round((value || 0) * 100)}%`,
        active: key === best[0]
      }));
      },
      aiNetworkOutputs(unit) {
      const decision = unit.decision || {};
      return [
        { label: "선택 행동", value: this.aiDecisionLabel(decision.decision), active: true },
        { label: "이유", value: decision.reasonLabel || decision.reason || "-", active: true },
        { label: "문제", value: (unit.issues || []).join(", ") || "없음", active: (unit.issues || []).length > 0 },
        { label: "명령", value: unit.order || "자동", active: Boolean(unit.order) }
      ];
      },
      updateAdminAiEvents(snapshot) {
      const root = this.nodes.adminAiEvents;
      if (!root) return;
      const events = (snapshot?.events || []).slice(-10).reverse();
      const signature = JSON.stringify(events.map((event) => event.id));
      if (root.dataset.signature === signature) return;
      root.dataset.signature = signature;
      root.textContent = "";
      if (!events.length) {
        const empty = document.createElement("span");
        empty.className = "admin-observer-empty";
        empty.textContent = "아직 판단 로그 없음";
        root.append(empty);
        return;
      }
      for (const event of events) {
        const row = document.createElement("div");
        row.className = `admin-observer-row team-${event.team === TEAM.RED ? "red" : "blue"} ${event.issues?.length ? "rejected" : ""}`;
        if (event.unitId) {
          const inspectKind = event.aiType === "tank" || event.aiType === "humvee" || event.kind === "vehicle" ? "vehicle" : event.aiType === "crew" || event.kind === "crew" ? "crew" : "squad";
          row.dataset.inspectKind = inspectKind;
          row.dataset.inspectId = event.unitId;
          row.classList.toggle("selected", this.isAdminInspectSelected(inspectKind, event.unitId));
          row.addEventListener("click", () => this.selectAdminInspectTarget(inspectKind, event.unitId));
        }
        const title = document.createElement("strong");
        title.textContent = `${event.time}s ${event.unitId}`;
        const meta = document.createElement("span");
        const issues = (event.issues || []).join(", ");
        const decision = event.decision
          ? ` · 판단 ${this.aiDecisionLabel(event.decision)} ${Math.round((event.score || 0) * 100)}%`
          : "";
        const reason = event.reasonLabel || event.reason;
        meta.textContent = `${event.state || "-"} · ${event.order || "자동"}${event.target ? ` · 목표 ${event.target}` : ""}${decision}${reason ? ` · 이유 ${reason}` : ""}${issues ? ` · ${issues}` : ""}`;
        row.append(title, meta);
        root.append(row);
      }
      },
      aiDecisionLabel(decision) {
      return IronLine.adminAiDecisionLabel?.(decision) || decision || "-";
      },
      teamName(team) {
      if (team === TEAM.RED) return "홍팀";
      if (team === TEAM.BLUE) return "청팀";
      return "중립";
    }
  };

  function installHudAdminUi(Hud) {
    Object.assign(Hud.prototype, hudAdminUiMethods);
  }

  IronLine.installHudAdminUi = installHudAdminUi;
})(window);
