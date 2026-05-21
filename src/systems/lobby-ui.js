"use strict";

(function registerLobbyUI(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, MATCH_RULES } = IronLine.constants;

  class LobbyUI {
    constructor(hud) {
      this.hud = hud;
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
      mapWrap.append(map);

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
      const start = document.createElement("button");
      start.id = "lobbyStartButton";
      start.type = "button";
      start.className = "hidden";
      start.textContent = "전투 시작";
      const back = document.createElement("button");
      back.id = "lobbyBackButton";
      back.type = "button";
      back.textContent = "방 목록으로";
      actions.append(team, ready, start, back);

      panel.append(header, slots, summary, actions);
      card.append(mapWrap, panel);
      screen.append(card);
      document.body.insertBefore(screen, ui.deathScreen || ui.resultScreen || null);

      ui.lobbyScreen = screen;
      ui.lobbyMap = map;
      ui.lobbyModeTitle = title;
      ui.lobbyHeaderMeta = headerMeta;
      ui.lobbyStatus = null;
      ui.lobbyRoomCode = null;
      ui.lobbySlots = slots;
      ui.lobbySummary = summary;
      ui.lobbyTeamButton = team;
      ui.lobbyReadyButton = ready;
      ui.lobbyStartButton = start;
      ui.lobbyBackButton = back;

      team.addEventListener("click", () => IronLine.game?.toggleLocalTeam?.());
      ready.addEventListener("click", () => IronLine.game?.toggleLocalReady?.());
      start.addEventListener("click", () => IronLine.game?.beginDeploymentCountdown?.());
      back.addEventListener("click", () => {
        const game = IronLine.game;
        if (game && !this.hud.sessionFlow?.backFromLobby(game)) game.returnToDeployment?.();
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
      if (ui.lobbyStartButton) ui.lobbyStartButton.classList.add("hidden");
      if (ui.lobbyBackButton) ui.lobbyBackButton.textContent = game.sessionMode === "online" ? "방 목록으로" : "설정으로 돌아가기";

      this.updateSlots(game);
      this.hud.buildMapMarkers(game, ui.lobbyMap);
    }

    updateModeSummary(game, conquest) {
      const root = this.nodes.lobbySummary;
      if (!root) return;
      const state = game.annihilation || game.defaultAnnihilationState?.();
      const values = conquest ? [
        { label: "승리 조건", value: "거점 점수 우위" },
        { label: "경기 시간", value: this.hud.formatTime(game.conquest?.duration || MATCH_RULES?.conquestDuration || 20 * 60) },
        { label: "리스폰", value: "가능" },
        { label: "목표", value: "거점 유지" }
      ] : [
        { label: "승리 조건", value: "전 병력 섬멸" },
        { label: "라운드", value: `${state?.targetScore || 2}선승 / ${state?.maxRounds || 3}판` },
        { label: "사망 처리", value: "라운드 관전" },
        { label: "재정비", value: `${Math.round(state?.intermissionDuration || 20)}초` }
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
      const time = options.conquest ? this.hud.formatTime(game.conquest?.duration || MATCH_RULES?.conquestDuration || 20 * 60) : "3판 2선승";
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
          ready: Boolean(player.ready)
        })),
        spectators: spectators.map((player) => ({ id: player.id, name: player.name, participantType: player.participantType })),
        roleSlots: roleSlots.map((slot) => ({
          id: slot.id,
          team: slot.team,
          roleId: slot.roleId,
          playerId: slot.playerId,
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
      const card = document.createElement("div");
      card.className = "lobby-player-card";
      card.classList.toggle("is-local", local);
      card.classList.toggle("is-ready", ready);
      card.classList.toggle("is-ai", !player);

      const avatar = document.createElement("div");
      avatar.className = "lobby-player-avatar";
      avatar.textContent = this.roleInitial(slot.roleId);

      const body = document.createElement("div");
      body.className = "lobby-player-main";
      const name = document.createElement("strong");
      name.textContent = `${this.roleLabel(slot.roleId)} · ${player?.name || "AI 대기"}`;
      const assets = this.slotAssetText(slot);
      const badges = document.createElement("span");
      badges.textContent = player
        ? this.playerBadges({ local, ready })
        : `AI 운용${assets ? ` · ${assets}` : ""}`;
      body.append(name, badges);

      const state = document.createElement("em");
      state.textContent = player ? (ready ? "준비" : "대기") : "AI";
      const canSelect = !player || local;
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
          if (game) game.assignPlayerToSlot(session.playerId, slot.id);
        });
        card.append(avatar, body, action);
      } else {
        card.append(avatar, body, state);
      }
      return card;
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
