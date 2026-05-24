"use strict";

(function registerLobbyUI(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, MATCH_RULES, INFANTRY_CLASSES, INFANTRY_WEAPONS } = IronLine.constants;

  class LobbyUI {
    constructor(hud) {
      this.hud = hud;
      this.lobbyChatMode = "all";
      this.lobbyLocalChat = [];
      this.lobbyLoadoutOpen = false;
    }

    get nodes() {
      return this.hud.nodes;
    }

    ensureScreen() {
      const ui = this.nodes;
      if (ui.lobbyScreen) return;

      const screen = document.createElement("div");
      screen.id = "lobbyScreen";
      screen.className = "lobby-screen hidden";
      screen.setAttribute("aria-label", "전투 대기방");

      const card = document.createElement("div");
      card.className = "lobby-card";

      const mapWrap = document.createElement("section");
      mapWrap.className = "lobby-map-wrap";
      mapWrap.setAttribute("aria-label", "대기방 전술 지도");
      const map = document.createElement("div");
      map.id = "lobbyMap";
      map.className = "deployment-map lobby-map";
      const chat = document.createElement("section");
      chat.id = "lobbyChat";
      chat.className = "lobby-chat";
      chat.setAttribute("aria-label", "대기방 채팅");
      const chatHead = document.createElement("div");
      chatHead.className = "lobby-chat-head";
      const chatTitle = document.createElement("strong");
      chatTitle.textContent = "대기방 채팅";
      const chatMeta = document.createElement("span");
      chatMeta.id = "lobbyChatMeta";
      chatMeta.textContent = "온라인";
      chatHead.append(chatTitle, chatMeta);
      const chatLog = document.createElement("div");
      chatLog.id = "lobbyChatLog";
      chatLog.className = "lobby-chat-log";
      const chatForm = document.createElement("form");
      chatForm.id = "lobbyChatForm";
      chatForm.className = "lobby-chat-form";
      const chatMode = document.createElement("button");
      chatMode.id = "lobbyChatMode";
      chatMode.type = "button";
      chatMode.className = "lobby-chat-mode";
      chatMode.textContent = "전체";
      const chatInput = document.createElement("input");
      chatInput.id = "lobbyChatInput";
      chatInput.type = "text";
      chatInput.maxLength = 120;
      chatInput.autocomplete = "off";
      chatInput.placeholder = "대기방 메시지";
      chatForm.append(chatMode, chatInput);
      chat.append(chatHead, chatLog, chatForm);
      mapWrap.append(map, chat);

      const panel = document.createElement("section");
      panel.className = "lobby-panel";
      const header = document.createElement("div");
      header.className = "lobby-header";
      const title = document.createElement("h2");
      title.id = "lobbyModeTitle";
      const headerMeta = document.createElement("div");
      headerMeta.id = "lobbyHeaderMeta";
      headerMeta.className = "lobby-header-meta";
      header.append(title, headerMeta);

      const slots = document.createElement("div");
      slots.id = "lobbySlots";
      slots.className = "lobby-teams";
      const loadout = document.createElement("div");
      loadout.id = "lobbyLoadout";
      loadout.className = "lobby-loadout hidden";
      const summary = document.createElement("div");
      summary.id = "lobbySummary";
      summary.className = "lobby-summary hidden";

      const actions = document.createElement("div");
      actions.className = "lobby-actions";
      const team = document.createElement("button");
      team.id = "lobbyTeamButton";
      team.type = "button";
      team.textContent = "팀 변경";
      const ready = document.createElement("button");
      ready.id = "lobbyReadyButton";
      ready.type = "button";
      ready.textContent = "준비 완료";
      const loadoutButton = document.createElement("button");
      loadoutButton.id = "lobbyLoadoutButton";
      loadoutButton.type = "button";
      loadoutButton.textContent = "출전 장비";
      const readyActions = document.createElement("div");
      readyActions.className = "lobby-ready-actions";
      readyActions.append(ready, loadoutButton);
      const start = document.createElement("button");
      start.id = "lobbyStartButton";
      start.type = "button";
      start.className = "hidden";
      start.textContent = "전투 시작";
      const back = document.createElement("button");
      back.id = "lobbyBackButton";
      back.type = "button";
      back.textContent = "방 목록으로";
      actions.append(team, readyActions, start, back);

      panel.append(header, slots, loadout, summary, actions);
      card.append(mapWrap, panel);
      screen.append(card);
      document.body.insertBefore(screen, ui.deathScreen || ui.resultScreen || null);

      ui.lobbyScreen = screen;
      ui.lobbyMap = map;
      ui.lobbyChat = chat;
      ui.lobbyChatMeta = chatMeta;
      ui.lobbyChatLog = chatLog;
      ui.lobbyChatForm = chatForm;
      ui.lobbyChatMode = chatMode;
      ui.lobbyChatInput = chatInput;
      ui.lobbyModeTitle = title;
      ui.lobbyHeaderMeta = headerMeta;
      ui.lobbyStatus = null;
      ui.lobbyRoomCode = null;
      ui.lobbySlots = slots;
      ui.lobbyLoadout = loadout;
      ui.lobbySummary = summary;
      ui.lobbyTeamButton = team;
      ui.lobbyReadyActions = readyActions;
      ui.lobbyReadyButton = ready;
      ui.lobbyLoadoutButton = loadoutButton;
      ui.lobbyStartButton = start;
      ui.lobbyBackButton = back;

      team.addEventListener("click", () => IronLine.game?.toggleLocalTeam?.());
      ready.addEventListener("click", () => IronLine.game?.toggleLocalReady?.());
      loadoutButton.addEventListener("click", () => {
        this.lobbyLoadoutOpen = !this.lobbyLoadoutOpen;
        if (this.nodes.lobbyLoadout) this.nodes.lobbyLoadout.dataset.signature = "";
        this.update(IronLine.game);
      });
      start.addEventListener("click", () => IronLine.game?.beginDeploymentCountdown?.());
      back.addEventListener("click", () => {
        const game = IronLine.game;
        if (game && !this.hud.sessionFlow?.backFromLobby(game)) game.returnToDeployment?.();
      });
      chatMode.addEventListener("click", () => this.toggleLobbyChatMode());
      chatInput.addEventListener("keydown", (event) => event.stopPropagation());
      chatForm.addEventListener("submit", (event) => {
        event.preventDefault();
        this.submitLobbyChat();
      });
    }

    update(game) {
      const ui = this.nodes;
      if (!ui.lobbyScreen) return;

      ui.lobbyScreen.classList.toggle("hidden", !game.lobbyOpen || game.roomListOpen);
      if (!game.lobbyOpen || game.roomListOpen) return;

      const conquest = game.matchConfig?.mode === "conquest";
      const session = game.onlineSession || {};
      const localPlayer = session.players?.find((player) => player.id === session.playerId) || session.players?.[0];
      const localSpectator = (localPlayer?.participantType || "player") !== "player" || (session.participantType || "player") !== "player";
      const localTeam = localPlayer?.team === TEAM.RED ? TEAM.RED : TEAM.BLUE;
      const roleSlots = session.roleSlots || [];
      const filled = roleSlots.filter((slot) => slot.playerId).length;
      const room = IronLine.roomRegistry?.getRoom?.(session.roomId || "") || null;

      ui.lobbyScreen.dataset.mode = conquest ? "conquest" : "annihilation";
      if (ui.lobbyModeTitle) ui.lobbyModeTitle.textContent = conquest ? "점령전" : "섬멸전";
      this.updateHeaderMeta(game, { filled, total: roleSlots.length || 8, conquest, room });
      this.updateModeSummary(game, conquest);

      if (ui.lobbyTeamButton) {
        ui.lobbyTeamButton.textContent = localTeam === TEAM.BLUE ? "홍팀으로 이동" : "청팀으로 이동";
        ui.lobbyTeamButton.classList.toggle("hidden", Boolean(localSpectator));
      }
      if (ui.lobbyReadyButton) {
        ui.lobbyReadyButton.textContent = session.localReady ? "준비 해제" : "준비 완료";
        ui.lobbyReadyButton.classList.toggle("active", Boolean(session.localReady));
        ui.lobbyReadyButton.classList.toggle("hidden", Boolean(localSpectator));
      }
      if (ui.lobbyLoadoutButton) {
        ui.lobbyLoadoutButton.textContent = this.lobbyLoadoutOpen ? "장비 닫기" : "출전 장비";
        ui.lobbyLoadoutButton.classList.toggle("active", Boolean(this.lobbyLoadoutOpen));
        ui.lobbyLoadoutButton.classList.toggle("hidden", Boolean(localSpectator));
      }
      if (ui.lobbyReadyActions) ui.lobbyReadyActions.classList.toggle("hidden", Boolean(localSpectator));
      if (ui.lobbyStartButton) ui.lobbyStartButton.classList.add("hidden");
      if (ui.lobbyBackButton) ui.lobbyBackButton.textContent = game.sessionMode === "online" ? "방 목록으로" : "설정으로 돌아가기";

      this.updateSlots(game);
      this.updateLoadout(game, { localPlayer, localSpectator, session });
      this.updateLobbyChat(game, { localPlayer, localSpectator, session, room });
      this.hud.buildMapMarkers(game, ui.lobbyMap);
    }

    updateLobbyChat(game, options = {}) {
      const log = this.nodes.lobbyChatLog;
      const mode = this.nodes.lobbyChatMode;
      const meta = this.nodes.lobbyChatMeta;
      const input = this.nodes.lobbyChatInput;
      if (!log) return;

      const session = options.session || game.onlineSession || {};
      const localPlayer = options.localPlayer ||
        session.players?.find((player) => player.id === session.playerId) ||
        session.players?.[0] ||
        null;
      const modes = this.lobbyChatModes(game, localPlayer);
      if (!modes.includes(this.lobbyChatMode)) this.lobbyChatMode = modes[0] || "all";
      if (mode) mode.textContent = this.chatModeLabel(this.lobbyChatMode);
      if (input) input.disabled = Boolean(game.matchStarted || game.countdownStarted);

      const roomId = session.roomId || "";
      const room = options.room || IronLine.roomRegistry?.getRoom?.(roomId) || null;
      const messages = roomId
        ? (IronLine.roomRegistry?.recentChat?.(roomId, 36) || [])
        : this.lobbyLocalChat.slice(-36);
      const visible = messages.filter((message) => this.canSeeLobbyChat(game, message)).slice(-16);
      const signature = JSON.stringify({
        roomId,
        mode: this.lobbyChatMode,
        locked: Boolean(input?.disabled),
        count: visible.length,
        ids: visible.map((item) => item.id || `${item.sender}:${item.text}:${item.createdAt}`)
      });

      if (meta) {
        const spectators = (room?.spectators || session.spectators || []).length;
        const players = (room?.players || session.players || []).filter((player) => (player.participantType || "player") === "player").length;
        meta.textContent = `${players || 0}명 / 관전 ${spectators || 0}`;
      }

      if (log.dataset.signature === signature) return;
      log.dataset.signature = signature;
      log.textContent = "";

      if (visible.length <= 0) {
        const empty = document.createElement("div");
        empty.className = "lobby-chat-empty";
        empty.textContent = "아직 대기 중입니다.";
        log.append(empty);
        return;
      }

      for (const message of visible) {
        const row = document.createElement("div");
        row.className = `lobby-chat-message ${message.channel || "all"}`;
        const badge = document.createElement("b");
        badge.textContent = this.chatModeLabel(message.channel || "all");
        const body = document.createElement("span");
        body.textContent = `${message.sender || "Player"}: ${message.text || ""}`;
        row.append(badge, body);
        log.append(row);
      }
      log.scrollTop = log.scrollHeight;
    }

    submitLobbyChat() {
      const game = IronLine.game;
      const input = this.nodes.lobbyChatInput;
      if (!game || !input || game.matchStarted || game.countdownStarted) return false;
      const text = String(input.value || "").replace(/\s+/g, " ").trim();
      if (!text) return false;

      const session = game.onlineSession || {};
      const localPlayer = game.localSessionPlayer?.() || session.players?.[0] || {};
      const payload = {
        channel: this.lobbyChatMode,
        sender: game.localProfile?.nickname || localPlayer.name || localPlayer.nickname || "Player",
        text,
        team: localPlayer.team || game.player?.team || TEAM.BLUE,
        participantType: game.localSessionParticipantType?.() || localPlayer.participantType || "player",
        playerId: session.playerId || game.localProfile?.playerId || ""
      };
      const roomId = game.sessionMode === "online" ? session.roomId : "";
      const saved = roomId ? IronLine.roomRegistry?.pushChat?.(roomId, payload) : null;
      if (!saved) {
        this.lobbyLocalChat.push({
          ...payload,
          id: `local:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
          createdAt: Date.now()
        });
        if (this.lobbyLocalChat.length > 80) this.lobbyLocalChat.splice(0, this.lobbyLocalChat.length - 80);
      }
      input.value = "";
      if (this.nodes.lobbyChatLog) this.nodes.lobbyChatLog.dataset.signature = "";
      game.hud?.update?.(game);
      input.focus();
      return true;
    }

    toggleLobbyChatMode() {
      const game = IronLine.game;
      const localPlayer = game?.localSessionPlayer?.();
      const modes = this.lobbyChatModes(game, localPlayer);
      const index = Math.max(0, modes.indexOf(this.lobbyChatMode));
      this.lobbyChatMode = modes[(index + 1) % modes.length] || "all";
      if (this.nodes.lobbyChatLog) this.nodes.lobbyChatLog.dataset.signature = "";
      if (game) this.updateLobbyChat(game);
    }

    lobbyChatModes(game, localPlayer = null) {
      const participantType = game?.localSessionParticipantType?.() || localPlayer?.participantType || "player";
      if (participantType === "caster") return ["caster", "spectator", "all"];
      if (["spectator", "admin"].includes(participantType)) return ["spectator", "all"];
      return ["all", "team"];
    }

    chatModeLabel(mode) {
      if (mode === "team") return "팀";
      if (mode === "spectator") return "관전";
      if (mode === "caster") return "해설";
      if (mode === "system") return "알림";
      return "전체";
    }

    canSeeLobbyChat(game, message) {
      const channel = message?.channel || "all";
      if (channel === "system" || channel === "all" || channel === "caster") return true;
      const participantType = game.localSessionParticipantType?.() || "player";
      if (channel === "team") {
        const localPlayer = game.localSessionPlayer?.();
        return participantType !== "spectator" && message.team === (localPlayer?.team || game.player?.team || TEAM.BLUE);
      }
      if (channel === "spectator") {
        if (["spectator", "caster", "admin"].includes(participantType)) return true;
        const room = IronLine.roomRegistry?.getRoom?.(game.onlineSession?.roomId || "");
        return Boolean(room?.spectatorChatVisibleToPlayers);
      }
      return true;
    }

    updateModeSummary(game, conquest) {
      const root = this.nodes.lobbySummary;
      if (!root) return;
      const state = game.annihilation || game.defaultAnnihilationState?.();
      const objectiveTarget = game.annihilationObjectiveScoreTarget?.() || state?.targetScore || 300;
      const values = conquest ? [
        { label: "승리 조건", value: "거점 점수 우위" },
        { label: "경기 시간", value: this.hud.formatTime(game.conquest?.duration || MATCH_RULES?.conquestDuration || 20 * 60) },
        { label: "리스폰", value: "가능" },
        { label: "목표", value: "거점 유지" }
      ] : [
        { label: "승리 조건", value: "거점 점수 도달" },
        { label: "목표 점수", value: `${objectiveTarget}점` },
        { label: "라운드", value: "단판" },
        { label: "사망 처리", value: "관전 전환" }
      ];
      const signature = JSON.stringify(values);
      root.classList.remove("hidden");
      if (root.dataset.signature === signature) return;
      root.dataset.signature = signature;
      root.textContent = "";
      for (const item of values) {
        const tile = document.createElement("div");
        tile.className = "lobby-summary-tile";
        const label = document.createElement("span");
        label.textContent = item.label;
        const value = document.createElement("strong");
        value.textContent = item.value;
        tile.append(label, value);
        root.append(tile);
      }
    }

    updateHeaderMeta(game, options) {
      const root = this.nodes.lobbyHeaderMeta;
      if (!root) return;
      const roomId = game.onlineSession?.roomId || "대기";
      const time = options.conquest ? this.hud.formatTime(game.conquest?.duration || MATCH_RULES?.conquestDuration || 20 * 60) : "단판";
      const values = [
        { label: "방 코드", value: roomId },
        { label: "슬롯", value: `${options.filled}/${options.total}` },
        { label: "시간", value: time },
        { label: "상태", value: this.phaseLabel(options.room?.phase || "waiting") }
      ];
      const signature = JSON.stringify(values);
      if (root.dataset.signature === signature) return;
      root.dataset.signature = signature;
      root.textContent = "";
      for (const item of values) {
        const node = document.createElement("span");
        const label = document.createElement("small");
        label.textContent = item.label;
        const value = document.createElement("strong");
        value.textContent = item.value;
        node.append(label, value);
        root.append(node);
      }
    }

    updateSlots(game) {
      const slots = this.nodes.lobbySlots;
      if (!slots) return;
      const session = game.onlineSession || {};
      const players = session.players?.length ? session.players : [
        { id: "local-player", name: "플레이어", team: TEAM.BLUE, ready: false, host: false, slotId: "blue-infantry" }
      ];
      const slotPlayers = players.filter((player) => (player.participantType || "player") === "player");
      const spectators = [
        ...players.filter((player) => (player.participantType || "player") !== "player"),
        ...(session.spectators || [])
      ];
      const roleSlots = session.roleSlots?.length ? session.roleSlots : [];
      const signature = JSON.stringify({
        playerId: session.playerId,
        participantType: session.participantType || "player",
        players: players.map((player) => ({
          id: player.id,
          name: player.name,
          team: player.team,
          slotId: player.slotId,
          participantType: player.participantType || "player",
          roleId: player.roleId,
          classId: player.classId,
          currentClassId: player.currentClassId,
          weaponId: player.weaponId,
          weaponInventory: player.weaponInventory || [],
          ready: Boolean(player.ready)
        })),
        spectators: spectators.map((player) => ({ id: player.id, name: player.name, participantType: player.participantType })),
        roleSlots: roleSlots.map((slot) => ({
          id: slot.id,
          team: slot.team,
          roleId: slot.roleId,
          playerId: slot.playerId,
          currentClassId: slot.currentClassId,
          weaponId: slot.weaponId,
          equipmentAmmo: slot.equipmentAmmo || {},
          aiControlled: Boolean(slot.aiControlled),
          squadIds: slot.squadIds || [],
          vehicleIds: slot.vehicleIds || []
        })),
        blueFactionId: session.blueFactionId || "korea",
        redFactionId: session.redFactionId || "russia"
      });
      if (slots.dataset.signature === signature && slots.classList.contains("lobby-teams")) return;
      slots.dataset.signature = signature;
      slots.className = "lobby-teams";
      slots.textContent = "";

      this.renderTeam(slots, {
        team: TEAM.BLUE,
        title: "청팀",
        subtitle: "아군 슬롯",
        roleSlots: roleSlots.filter((slot) => slot.team !== TEAM.RED),
        players: slotPlayers,
        session
      });
      this.renderTeam(slots, {
        team: TEAM.RED,
        title: "홍팀",
        subtitle: "적군 슬롯",
        roleSlots: roleSlots.filter((slot) => slot.team === TEAM.RED),
        players: slotPlayers,
        session
      });
      if (spectators.length > 0) this.renderSpectators(slots, spectators, session);
    }

    renderSpectators(parent, spectators, session = {}) {
      const section = document.createElement("section");
      section.className = "lobby-team lobby-team-spectator";
      const head = document.createElement("div");
      head.className = "lobby-team-head";
      const titleWrap = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = "관전자";
      const subtitle = document.createElement("span");
      subtitle.textContent = "채팅과 자유 관전";
      titleWrap.append(title, subtitle);
      const count = document.createElement("em");
      count.textContent = `${spectators.length}`;
      head.append(titleWrap, count);

      const roster = document.createElement("div");
      roster.className = "lobby-roster";
      for (const player of spectators) {
        const row = document.createElement("div");
        row.className = "lobby-player-card spectator";
        row.classList.toggle("is-local", player.id === session.playerId);
        const avatar = document.createElement("div");
        avatar.className = "lobby-player-avatar";
        avatar.textContent = player.participantType === "caster" ? "해" : "관";
        const body = document.createElement("div");
        body.className = "lobby-player-main";
        const name = document.createElement("strong");
        name.textContent = player.name || player.nickname || "관전자";
        const meta = document.createElement("span");
        meta.textContent = player.participantType === "caster" ? "해설자" : "관전자";
        body.append(name, meta);
        row.append(avatar, body);
        roster.append(row);
      }
      section.append(head, roster);
      parent.append(section);
    }

    renderTeam(parent, options) {
      const side = options.team === TEAM.RED ? "red" : "blue";
      const roleSlots = options.roleSlots?.length ? options.roleSlots : [];
      const humans = roleSlots.filter((slot) => slot.playerId);
      const factionId = options.team === TEAM.RED
        ? (options.session?.redFactionId || "russia")
        : (options.session?.blueFactionId || "korea");
      const faction = IronLine.playerFactionById?.(factionId) || IronLine.playerSkinById?.(factionId);
      const team = document.createElement("section");
      team.className = `lobby-team lobby-team-${side}`;
      const head = document.createElement("div");
      head.className = "lobby-team-head";
      const titleWrap = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = options.title;
      const subtitle = document.createElement("span");
      subtitle.textContent = `${faction?.name || "세력 미정"} · ${options.subtitle}`;
      titleWrap.append(title, subtitle);
      const count = document.createElement("em");
      count.textContent = `${humans.length}/4`;
      head.append(titleWrap, count);

      const roster = document.createElement("div");
      roster.className = "lobby-roster";
      for (const slot of roleSlots) {
        roster.append(this.createRoleSlotCard(slot, options.players || [], options.session || {}));
      }

      team.append(head, roster);
      parent.append(team);
    }

    createRoleSlotCard(slot, players, session = {}) {
      const player = players.find((item) => item.id === slot.playerId) || null;
      const local = Boolean(player?.id && player.id === session.playerId);
      const ready = Boolean(player?.ready);
      const locked = Boolean(slot.locked);
      const card = document.createElement("div");
      card.className = "lobby-player-card";
      card.classList.toggle("is-local", local);
      card.classList.toggle("is-ready", ready);
      card.classList.toggle("is-ai", !player);
      card.classList.toggle("empty", !player);
      card.classList.toggle("locked", locked);

      const avatar = document.createElement("div");
      avatar.className = "lobby-player-avatar";
      avatar.textContent = this.roleInitial(slot.roleId);

      const body = document.createElement("div");
      body.className = "lobby-player-main";
      const name = document.createElement("strong");
      const lockedEmptySlotLabel = `${this.roleLabel(slot.roleId)} 쨌 닫힌 슬롯`;
      name.textContent = player ? `${this.roleLabel(slot.roleId)} · ${player.name || "Player"}` : "\ube48 \uc2ac\ub86f";
      const badges = document.createElement("span");
      if (!player && locked) name.textContent = lockedEmptySlotLabel;
      badges.textContent = player
        ? this.playerBadges({ local, ready, loadout: this.playerLoadoutText(player, slot) })
        : "";
      if (!player && locked) badges.textContent = "관리자 잠금";
      if (player) body.append(name, badges);
      else body.append(name);
      if (!player && locked) body.append(badges);

      const state = document.createElement("em");
      state.textContent = player ? (ready ? "준비" : "대기") : "";
      if (!player && locked) state.textContent = "닫힘";
      const canSelect = (!player || local) && !locked;
      if (canSelect) {
        const action = document.createElement("button");
        action.type = "button";
        action.className = "lobby-slot-action";
        action.textContent = local ? "현재" : "선택";
        action.disabled = local;
        action.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const game = IronLine.game;
          if (!game) return;
          if (game.hud?.sessionFlow?.requestLobbySlotAssignment) {
            game.hud.sessionFlow.requestLobbySlotAssignment(game, slot.id);
            return;
          }
          game.assignPlayerToSlot(session.playerId, slot.id);
        });
        card.append(avatar, body, action);
      } else {
        card.append(avatar, body, state);
      }
      return card;
    }

    updateLoadout(game, options = {}) {
      const root = this.nodes.lobbyLoadout;
      if (!root) return;
      const session = options.session || game.onlineSession || {};
      const localPlayer = options.localPlayer ||
        session.players?.find((player) => player.id === session.playerId) ||
        session.players?.[0] ||
        null;
      const localSpectator = options.localSpectator ||
        (localPlayer?.participantType || "player") !== "player" ||
        (session.participantType || "player") !== "player";
      if (!localPlayer || localSpectator) {
        root.classList.add("hidden");
        root.textContent = "";
        root.dataset.signature = "";
        return;
      }

      if (!this.lobbyLoadoutOpen) {
        root.classList.add("hidden");
        root.textContent = "";
        root.dataset.signature = "closed";
        return;
      }

      const slot = game.sessionSlotById?.(localPlayer.slotId) ||
        session.roleSlots?.find((item) => item.id === localPlayer.slotId) ||
        null;
      const classId = localPlayer.currentClassId ||
        localPlayer.classId ||
        game.player?.classId ||
        this.roleClassId(slot?.roleId || localPlayer.roleId || "infantry");
      const infantryClass = INFANTRY_CLASSES?.[classId] || INFANTRY_CLASSES?.infantry;
      const equipment = game.deploymentEquipmentForClass?.(classId) ||
        (infantryClass?.equipment || []).slice();
      const locked = Boolean(game.countdownStarted || game.matchStarted);
      const loadoutSlots = equipment.map((weaponId, index) => ({
        index,
        weaponId,
        choices: game.equipmentChoiceOptions?.(classId, index) || [weaponId]
      }));
      const roleOptions = this.loadoutRoleOptions(game, session, localPlayer, slot);
      const signature = JSON.stringify({
        classId,
        slotId: slot?.id || "",
        roleId: slot?.roleId || localPlayer.roleId || "",
        locked,
        equipment,
        loadoutSlots,
        roleOptions
      });

      root.classList.remove("hidden");
      if (root.dataset.signature === signature) return;
      root.dataset.signature = signature;
      root.textContent = "";
      root.classList.remove("is-collapsed");

      const head = document.createElement("div");
      head.className = "lobby-loadout-head";
      const titleWrap = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = "출전 장비";
      const meta = document.createElement("span");
      meta.textContent = `${this.roleLabel(slot?.roleId)} · ${this.classLabel(classId)}`;
      titleWrap.append(title, meta);
      const state = document.createElement("em");
      state.textContent = locked ? "경기 시작 중" : "언제든 변경 가능";
      head.append(titleWrap, state);

      const roleSection = document.createElement("section");
      roleSection.className = "lobby-loadout-roles";
      const roleLabel = document.createElement("span");
      roleLabel.className = "lobby-loadout-role-label";
      roleLabel.textContent = "역할";
      const roleChoices = document.createElement("div");
      roleChoices.className = "lobby-loadout-role-choices";
      for (const option of roleOptions) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "lobby-loadout-role";
        button.classList.toggle("active", option.active);
        button.classList.toggle("occupied", option.occupied || option.locked);
        button.disabled = locked || option.active || option.occupied || option.locked || !option.slotId;
        button.textContent = option.label;
        button.title = option.occupied
          ? `${option.occupiedName || "다른 플레이어"} 사용 중`
          : `${option.label} 역할 선택`;
        if (option.locked) button.title = "관리자가 닫아 둔 슬롯입니다.";
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const liveGame = IronLine.game;
          if (!liveGame || locked || option.active || option.occupied || option.locked) return;
          if (liveGame.countdownStarted || liveGame.matchStarted) return;
          const changed = liveGame.hud?.sessionFlow?.requestLobbySlotAssignment
            ? liveGame.hud.sessionFlow.requestLobbySlotAssignment(liveGame, option.slotId, { preserveReady: true })
            : liveGame.assignPlayerToSlot?.(session.playerId, option.slotId, { preserveReady: true });
          if (!changed) return;
          root.dataset.signature = "";
          if (this.nodes.lobbySlots) this.nodes.lobbySlots.dataset.signature = "";
          liveGame.hud?.update?.(liveGame);
        });
        roleChoices.append(button);
      }
      roleSection.append(roleLabel, roleChoices);

      const grid = document.createElement("div");
      grid.className = "lobby-loadout-slots";
      for (const item of loadoutSlots) {
        const row = document.createElement("section");
        row.className = "lobby-loadout-slot";
        const label = document.createElement("div");
        label.className = "lobby-loadout-slot-label";
        const key = document.createElement("b");
        key.textContent = `${item.index + 1}`;
        const labelText = document.createElement("span");
        labelText.textContent = this.loadoutSlotLabel(item.index, item.weaponId);
        label.append(key, labelText);

        const choices = document.createElement("div");
        choices.className = "lobby-loadout-choices";
        for (const weaponId of item.choices) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "lobby-loadout-choice";
          button.classList.toggle("active", weaponId === item.weaponId);
          button.disabled = locked || weaponId === item.weaponId;
          button.textContent = this.weaponLabel(weaponId);
          button.title = INFANTRY_WEAPONS?.[weaponId]?.name || weaponId;
          button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const liveGame = IronLine.game;
            if (!liveGame || locked) return;
            if (liveGame.countdownStarted || liveGame.matchStarted) return;
            if (liveGame.player?.classId !== classId) {
              liveGame.applyFullPlayerClassLoadout?.(classId, {
                resetAmmo: true,
                clearDrones: false
              });
            }
            const changed = liveGame.setLoadoutChoiceForClass?.(classId, item.index, weaponId, {
              resetAmmo: true,
              activeSlot: item.index
            });
            if (!changed) return;
            root.dataset.signature = "";
            if (this.nodes.lobbySlots) this.nodes.lobbySlots.dataset.signature = "";
            liveGame.hud?.update?.(liveGame);
          });
          choices.append(button);
        }

        row.append(label, choices);
        grid.append(row);
      }

      const hint = document.createElement("p");
      hint.className = "lobby-loadout-hint";
      hint.textContent = locked
        ? "경기 시작 중에는 장비를 변경할 수 없습니다."
        : "준비 완료 후에도 경기 시작 전까지 장비를 바꿀 수 있습니다.";
      root.append(head, roleSection, grid, hint);
    }

    loadoutRoleOptions(game, session = {}, localPlayer = null, activeSlot = null) {
      const playerTeam = activeSlot?.team || localPlayer?.team || TEAM.BLUE;
      const roleSlots = (session.roleSlots || game.onlineSession?.roleSlots || [])
        .filter((slot) => slot.team === playerTeam);
      const roleDefinitions = game.sessionRoleDefinitions?.() || [
        { id: "infantry", label: "보병" },
        { id: "engineer", label: "공병" },
        { id: "recon", label: "정찰" },
        { id: "armor", label: "기갑" }
      ];
      return roleDefinitions.map((role) => {
        const slot = roleSlots.find((item) => item.roleId === role.id) || null;
        const owner = slot?.playerId
          ? (session.players || []).find((player) => player.id === slot.playerId)
          : null;
        const locked = Boolean(slot?.locked);
        const occupied = Boolean(owner && owner.id !== localPlayer?.id);
        return {
          roleId: role.id,
          slotId: slot?.id || "",
          label: this.roleLabel(role.id) || role.label || role.id,
          active: Boolean(slot?.id && slot.id === localPlayer?.slotId),
          locked,
          occupied,
          occupiedName: owner?.name || owner?.nickname || ""
        };
      });
    }

    roleClassId(roleId) {
      return IronLine.playerLoadouts?.roleClassId?.(roleId) || "infantry";
    }

    classLabel(classId) {
      const infantryClass = INFANTRY_CLASSES?.[classId] || INFANTRY_CLASSES?.infantry;
      return infantryClass?.shortName || infantryClass?.name || "보병";
    }

    loadoutSlotLabel(slotIndex, weaponId) {
      if (slotIndex === 0) return "주무장";
      if (slotIndex === 1) {
        const type = INFANTRY_WEAPONS?.[weaponId]?.type;
        return type === "rpg" || type === "grenade" ? "화력장비" : "보조무장";
      }
      return "특수장비";
    }

    weaponLabel(weaponId) {
      const weapon = INFANTRY_WEAPONS?.[weaponId];
      return weapon?.shortName || weapon?.name || weaponId || "-";
    }

    playerLoadoutText(player, slot = null) {
      const classId = player.currentClassId || player.classId || slot?.currentClassId || this.roleClassId(player.roleId || slot?.roleId);
      const inventory = Array.isArray(player.weaponInventory) && player.weaponInventory.length > 0
        ? player.weaponInventory
        : [player.weaponId || slot?.weaponId].filter(Boolean);
      const weapons = inventory.slice(0, 3).map((weaponId) => this.weaponLabel(weaponId)).filter(Boolean);
      const label = this.classLabel(classId);
      return weapons.length > 0 ? `${label}: ${weapons.join("/")}` : label;
    }

    roleInitial(roleId) {
      if (roleId === "engineer") return "공";
      if (roleId === "recon") return "정";
      if (roleId === "armor") return "기";
      return "보";
    }

    roleLabel(roleId) {
      if (roleId === "engineer") return "공병";
      if (roleId === "recon") return "정찰";
      if (roleId === "armor") return "기갑";
      return "보병";
    }

    slotAssetText(slot) {
      const squadCount = slot.squadIds?.length || 0;
      const vehicleCount = slot.vehicleIds?.length || 0;
      const unitCount = slot.unitIds?.length || 0;
      const parts = [];
      if (squadCount) parts.push(`분대 ${squadCount}`);
      if (vehicleCount) parts.push(`차량 ${vehicleCount}`);
      if (unitCount) parts.push(`병력 ${unitCount}`);
      return parts.join(" / ");
    }

    playerBadges(flags) {
      const badges = [];
      if (flags.local) badges.push("나");
      badges.push(flags.ready ? "준비" : "미준비");
      if (flags.loadout) badges.push(flags.loadout);
      return badges.join(" · ");
    }

    phaseLabel(phase) {
      if (phase === "playing") return "진행 중";
      if (phase === "loading") return "로딩";
      if (phase === "ended") return "종료";
      return "관리자 대기";
    }
  }

  IronLine.LobbyUI = LobbyUI;
})(window);
