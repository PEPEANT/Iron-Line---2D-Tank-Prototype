"use strict";

(function registerAdminOps(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants;

  const BACKUP_KIND = "iron-line-admin-backup";
  const BACKUP_VERSION = 1;
  const STORAGE_KEY = "iron-line-admin-backup-v1";
  const PLAYTEST_NOTES_KEY = "iron-line-playtest-notes-v1";

  class AdminOps {
    constructor(game) {
      this.game = game;
      this.storageKey = STORAGE_KEY;
      this.notesKey = PLAYTEST_NOTES_KEY;
      this.providers = [
        { id: "json", label: "JSON 파일", status: "active" },
        { id: "browser", label: "브라우저 임시 저장", status: "active" },
        { id: "drive", label: "외부 드라이브", status: "planned" }
      ];
      this.providers = [
        { id: "json", label: "JSON 파일", status: "active" },
        { id: "browser", label: "브라우저 임시 저장", status: "active" },
        { id: "drive", label: "외부 드라이브", status: "planned" }
      ];
    }

    createSnapshot(options = {}) {
      const game = this.game;
      const remote = this.remoteObserverSnapshot();
      let match = remote?.match || this.matchSnapshot(game);
      const roleSlots = remote?.roleSlots || this.roleSlotsSnapshot(game);
      const players = this.playersSnapshot(game, roleSlots, remote);
      const ai = remote?.ai || game.aiObservatory?.latest?.() || null;
      const commandLog = this.commandLogSnapshot(game, remote);
      const hasRoomRegistry = Boolean(IronLine.roomRegistry);
      const registryRooms = IronLine.roomRegistry?.listRooms?.() || [];
      const selectedRoomId = IronLine.roomRegistry?.selectedRoomId?.() || "";
      const selectedRegistryRoom = registryRooms.find((item) => item.id === selectedRoomId) || registryRooms[0] || null;
      if (selectedRegistryRoom) {
        const roomPhase = selectedRegistryRoom.phase || "";
        match = {
          ...match,
          mode: selectedRegistryRoom.mode || match.mode,
          phase: roomPhase || match.phase,
          started: Boolean(match.started || roomPhase === "playing"),
          lobbyOpen: Boolean(match.lobbyOpen || roomPhase === "waiting" || roomPhase === "lobby"),
          deploymentOpen: Boolean(match.deploymentOpen && roomPhase !== "playing")
        };
      }
      const eventSources = [
        ...(selectedRegistryRoom?.events?.slice?.(-80) || []),
        ...(remote?.events || []),
        ...(game.battlefieldEvents?.recent?.(80) || [])
      ];
      const eventMap = new Map();
      for (const event of eventSources) {
        if (event?.id) eventMap.set(event.id, event);
      }
      const eventTime = (event) => {
        const raw = event?.createdAt || 0;
        const numeric = Number(raw);
        return Number.isFinite(numeric) ? numeric : Date.parse(raw) || 0;
      };
      const events = Array.from(eventMap.values())
        .sort((a, b) => eventTime(a) - eventTime(b))
        .slice(-80);
      const teams = remote?.teams || {
        [TEAM.BLUE]: this.teamStats(game, TEAM.BLUE),
        [TEAM.RED]: this.teamStats(game, TEAM.RED)
      };

      const room = {
        id: selectedRegistryRoom?.id || remote?.roomId || game.onlineSession?.roomId || "local",
        name: selectedRegistryRoom?.name || remote?.roomId || game.onlineSession?.roomId || "local",
        configured: true,
        locked: Boolean(selectedRegistryRoom?.locked || game.onlineSession?.joinLocked || match.started || match.phase === "live"),
        allowMidMatchJoin: Boolean(game.onlineSession?.allowMidMatchJoin),
        mode: selectedRegistryRoom?.mode || match.mode || "annihilation",
        blueFactionId: selectedRegistryRoom?.blueFactionId || game.onlineSession?.blueFactionId || "korea",
        redFactionId: selectedRegistryRoom?.redFactionId || game.onlineSession?.redFactionId || "russia",
        phase: selectedRegistryRoom?.phase || match.phase || game.matchPhase || "deployment",
        players: selectedRegistryRoom?.players || players,
        spectators: selectedRegistryRoom?.spectators || [],
        capacity: selectedRegistryRoom?.capacity || 8,
        spectatorCapacity: selectedRegistryRoom?.spectatorCapacity || 12,
        difficulty: selectedRegistryRoom?.difficulty || game.matchConfig?.difficulty || "normal",
        aiDensityPreset: selectedRegistryRoom?.aiDensityPreset || game.matchConfig?.aiDensityPreset || "custom",
        blueAiTanks: selectedRegistryRoom?.blueAiTanks ?? game.matchConfig?.blueAiTanks ?? 3,
        blueInfantry: selectedRegistryRoom?.blueInfantry ?? game.matchConfig?.blueInfantry ?? 21,
        redTanks: selectedRegistryRoom?.redTanks ?? game.matchConfig?.redTanks ?? 5,
        redInfantry: selectedRegistryRoom?.redInfantry ?? game.matchConfig?.redInfantry ?? 24,
        playerCount: selectedRegistryRoom?.players?.filter?.((player) => player.participantType !== "spectator").length ?? players.length,
        spectatorCount: selectedRegistryRoom?.spectators?.length || 0,
        humanSlots: roleSlots.filter((slot) => slot.playerId && !slot.aiControlled).length,
        aiSlots: roleSlots.filter((slot) => slot.aiControlled || !slot.playerId).length,
        clients: (selectedRegistryRoom?.players?.length ?? players.length) + (selectedRegistryRoom?.spectators?.length || 0),
        viewers: (selectedRegistryRoom?.spectators?.length || 0) + (game.adminObserverMode ? 1 : 0),
        roleSlots
      };

      const server = {
        mode: "local-browser",
        roomCount: hasRoomRegistry ? registryRooms.length : 1,
        activeMatches: hasRoomRegistry ? registryRooms.filter((item) => item.phase === "playing").length : match.started ? 1 : 0,
        playerCount: room.playerCount,
        clientCount: room.clients + (game.adminObserverMode ? 1 : 0),
        adminCount: game.adminEnabled ? 1 : 0,
        spectatorCount: room.spectatorCount + (game.adminObserverMode ? 1 : 0),
        persistence: "json-export",
        source: remote ? "observer-snapshot" : "local-game"
      };

      const aiSummary = ai?.summary || {};
      const snapshot = {
        version: 1,
        kind: "iron-line-admin-snapshot",
        createdAt: Date.now(),
        roomId: room.id,
        server,
        rooms: registryRooms,
        selectedRoomId,
        room,
        players,
        match: {
          ...match,
          teams,
          capturePoints: remote?.capturePoints || this.capturePointSnapshot(game)
        },
        ai: {
          updatedAt: ai?.updatedAt || 0,
          summary: aiSummary,
          eventCount: Array.isArray(ai?.events) ? ai.events.length : 0,
          topIssues: this.topEntries(aiSummary.issueCounts, 4),
          topDecisions: this.topEntries(aiSummary.decisionCounts, 4),
          units: options.lite ? [] : (ai?.units || []).slice(0, 24),
          events: options.lite ? [] : (ai?.events || []).slice(-80)
        },
        commands: commandLog,
        events,
        map: this.mapSnapshot(game),
        backup: this.backupStatus(),
        providers: this.providers.slice()
      };

      return snapshot;
    }

    createBackup(reason = "manual") {
      const game = this.game;
      const snapshot = this.createSnapshot({ lite: false });
      const backup = {
        kind: BACKUP_KIND,
        version: BACKUP_VERSION,
        exportedAt: Date.now(),
        day: this.dayKey(),
        timezone: "Asia/Seoul",
        reason,
        summary: this.backupSummary(snapshot),
        data: {
          snapshot,
          roomConfig: {
            roomId: game.onlineSession?.roomId || snapshot.roomId,
            joinLocked: Boolean(game.onlineSession?.joinLocked),
            allowMidMatchJoin: Boolean(game.onlineSession?.allowMidMatchJoin),
            blueFactionId: game.onlineSession?.blueFactionId || snapshot.room?.blueFactionId || "korea",
            redFactionId: game.onlineSession?.redFactionId || snapshot.room?.redFactionId || "russia",
            roleSlots: this.roleSlotsSnapshot(game)
          },
          matchConfig: this.clonePlain(game.matchConfig || {}),
          conquest: this.clonePlain(game.conquest || {}),
          onlineSession: this.clonePlain(game.onlineSession || {}),
          aiEvents: this.clonePlain(game.aiObservatory?.events || snapshot.ai.events || []),
          commandLog: this.clonePlain(game.commandBus?.log || []),
          playtestNotes: this.playtestNotes(),
          map: this.mapSnapshot(game)
        }
      };
      return backup;
    }

    playtestNotes() {
      try {
        return localStorage.getItem(this.notesKey) || "";
      } catch (_error) {
        return "";
      }
    }

    savePlaytestNotes(text = "") {
      try {
        localStorage.setItem(this.notesKey, String(text || ""));
        return true;
      } catch (_error) {
        return false;
      }
    }

    clearPlaytestNotes() {
      return this.savePlaytestNotes("");
    }

    appendPlaytestNote(text = "") {
      const current = this.playtestNotes();
      const next = [current.trimEnd(), String(text || "").trim()].filter(Boolean).join("\n\n");
      this.savePlaytestNotes(next);
      return next;
    }

    playtestTimestamp() {
      return new Date().toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    }

    playtestIssueTemplate() {
      return [
        `## 이슈 - ${this.playtestTimestamp()}`,
        "- 심각도: blocker / major / minor / polish",
        "- 화면: 로비 / 관리자 / 채팅 / 인게임 / 관전",
        "- 발생 위치:",
        "- 재현 순서:",
        "- 기대 동작:",
        "- 실제 동작:",
        "- 추정 파일:"
      ].join("\n");
    }

    playtestStateBlock() {
      const snapshot = this.createSnapshot({ lite: true });
      const room = snapshot.room || {};
      const match = snapshot.match || {};
      const ai = snapshot.ai?.summary || {};
      const slots = (room.roleSlots || []).map((slot) => {
        const owner = slot.playerId ? slot.nickname || slot.playerId : "AI";
        return `  - ${slot.id}: ${owner}${slot.ready ? " / 준비" : ""}`;
      });
      const events = (snapshot.events || []).slice(-5).map((event) => `  - ${event.title}: ${event.detail}`);
      return [
        `## 상태 스냅샷 - ${this.playtestTimestamp()}`,
        `- 방: ${room.id || "local"} / ${room.phase || "unknown"} / ${room.mode || match.mode || "unknown"}`,
        `- 접속: 플레이어 ${room.playerCount || 0}/${room.capacity || (room.roleSlots || []).length || 0}, 관전 ${room.spectatorCount || 0}`,
        `- 전투: ${match.started ? "진행 중" : "대기"} / 시간 ${Math.round(match.time || 0)}초`,
        `- AI: ${ai.total || 0}개 / 경고 ${ai.warnings || 0}건`,
        "- 슬롯:",
        slots.length ? slots.join("\n") : "  - 없음",
        "- 최근 이벤트:",
        events.length ? events.join("\n") : "  - 없음"
      ].join("\n");
    }

    downloadPlaytestNotes() {
      const text = this.playtestNotes();
      const body = text.trim()
        ? text
        : `# Iron Line 플레이테스트 노트\n\n작성된 노트가 없습니다.\n`;
      const blob = new Blob([body], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `iron-line-playtest-${this.dayKey()}-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}.md`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1200);
      return body;
    }

    saveLocalBackup(reason = "manual") {
      const backup = this.createBackup(reason);
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(backup));
        backup.savedToLocal = true;
      } catch (_error) {
        backup.savedToLocal = false;
        backup.localError = "local-storage-failed";
      }
      return backup;
    }

    restoreLocalBackup() {
      try {
        const raw = localStorage.getItem(this.storageKey);
        if (!raw) return { ok: false, message: "브라우저에 저장된 백업이 없습니다." };
        return this.importBackupText(raw);
      } catch (_error) {
        return { ok: false, message: "브라우저 임시 저장소를 읽지 못했습니다." };
      }
    }

    importBackupText(text) {
      try {
        const backup = JSON.parse(text);
        return this.applyBackup(backup);
      } catch (_error) {
        return { ok: false, message: "백업 JSON을 읽지 못했습니다." };
      }
    }

    importBackupFile(file) {
      return new Promise((resolve) => {
        if (!file) {
          resolve({ ok: false, message: "선택된 파일이 없습니다." });
          return;
        }
        const reader = new FileReader();
        reader.addEventListener("load", () => resolve(this.importBackupText(String(reader.result || ""))));
        reader.addEventListener("error", () => resolve({ ok: false, message: "백업 파일을 열지 못했습니다." }));
        reader.readAsText(file, "utf-8");
      });
    }

    downloadBackup(reason = "manual") {
      const backup = this.createBackup(reason);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `iron-line-backup-${this.dayKey()}-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1200);
      return backup;
    }

    applyBackup(backup) {
      const normalized = this.normalizeBackup(backup);
      if (!normalized) return { ok: false, message: "Iron Line 백업 JSON이 아닙니다." };

      const game = this.game;
      const data = normalized.data || {};
      if (data.matchConfig && typeof data.matchConfig === "object") {
        const current = game.matchConfig || {};
        game.matchConfig = {
          ...current,
          ...this.safeMatchConfig(data.matchConfig)
        };
      }
      if (data.roomConfig && game.onlineSession) {
        game.onlineSession.joinLocked = Boolean(data.roomConfig.joinLocked);
        game.onlineSession.allowMidMatchJoin = Boolean(data.roomConfig.allowMidMatchJoin);
      }
      if (data.onlineSession?.roleSlots && game.onlineSession?.roleSlots) {
        this.applyRoleSlotBackup(data.onlineSession.roleSlots);
      }
      if (Array.isArray(data.aiEvents) && game.aiObservatory) {
        game.aiObservatory.events = data.aiEvents.slice(-game.aiObservatory.maxEvents || -120);
      }
      if (typeof data.playtestNotes === "string") {
        this.savePlaytestNotes(data.playtestNotes);
      }

      game.syncOnlineSlotAssets?.();
      game.hud?.invalidateDeploymentMap?.();
      game.hud?.update?.(game);
      return {
        ok: true,
        message: "백업 구조를 불러왔습니다. 전투 중 물리 상태는 직접 덮어쓰지 않았습니다.",
        summary: normalized.summary || this.backupSummary(data.snapshot)
      };
    }

    normalizeBackup(backup) {
      if (!backup || backup.kind !== BACKUP_KIND || !backup.data || typeof backup.data !== "object") return null;
      return {
        kind: BACKUP_KIND,
        version: BACKUP_VERSION,
        exportedAt: Number(backup.exportedAt) || Date.now(),
        day: typeof backup.day === "string" ? backup.day : this.dayKey(),
        timezone: "Asia/Seoul",
        reason: typeof backup.reason === "string" ? backup.reason.slice(0, 40) : "restore",
        summary: backup.summary || null,
        data: backup.data
      };
    }

    applyRoleSlotBackup(slots) {
      const gameSlots = this.game.onlineSession?.roleSlots || [];
      for (const saved of slots) {
        const slot = gameSlots.find((item) => item.id === saved.id);
        if (!slot) continue;
        slot.locked = Boolean(saved.locked);
        if (!this.game.matchStarted && !this.game.countdownStarted) {
          slot.playerId = saved.playerId || null;
          slot.aiControlled = Boolean(saved.aiControlled || !saved.playerId);
        }
      }
    }

    safeMatchConfig(input) {
      const out = {};
      if (["annihilation", "conquest"].includes(input.mode)) out.mode = input.mode;
      if (["easy", "normal", "hard"].includes(input.difficulty)) out.difficulty = input.difficulty;
      for (const key of ["blueAiTanks", "blueInfantry", "redTanks", "redInfantry"]) {
        const value = Number(input[key]);
        if (Number.isFinite(value)) out[key] = Math.max(0, Math.min(60, Math.round(value)));
      }
      return out;
    }

    remoteObserverSnapshot() {
      const snapshot = this.game.observerSnapshot || null;
      if (!snapshot?.sentAt) return null;
      return Date.now() - snapshot.sentAt <= 3600 ? snapshot : null;
    }

    matchSnapshot(game) {
      return {
        mode: game.matchConfig?.mode || "annihilation",
        phase: game.matchPhase || "deployment",
        started: Boolean(game.matchStarted),
        lobbyOpen: Boolean(game.lobbyOpen),
        deploymentOpen: Boolean(game.deploymentOpen),
        time: game.matchTime || 0,
        remaining: game.matchConfig?.mode === "conquest"
          ? game.conquest?.remaining ?? 0
          : game.annihilation?.state === "intermission" ? game.annihilation?.intermissionRemaining || 0 : game.matchTime || 0,
        score: {
          [TEAM.BLUE]: ["conquest", "annihilation"].includes(game.matchConfig?.mode) ? game.conquest?.score?.[TEAM.BLUE] || 0 : game.annihilation?.score?.[TEAM.BLUE] || 0,
          [TEAM.RED]: ["conquest", "annihilation"].includes(game.matchConfig?.mode) ? game.conquest?.score?.[TEAM.RED] || 0 : game.annihilation?.score?.[TEAM.RED] || 0
        },
        round: {
          current: game.annihilation?.round || 1,
          max: game.annihilation?.maxRounds || 1,
          state: game.annihilation?.state || ""
        }
      };
    }

    roleSlotsSnapshot(game) {
      return (game.onlineSession?.roleSlots || []).map((slot) => ({
        id: slot.id,
        team: slot.team,
        teamLabel: slot.teamLabel || this.teamName(slot.team),
        roleId: slot.roleId,
        role: slot.role,
        label: slot.label,
        playerId: slot.playerId || "",
        aiControlled: Boolean(slot.aiControlled),
        controllerType: slot.controllerType || (slot.playerId ? "human" : "bot"),
        botCommanderState: slot.botCommanderState || null,
        locked: Boolean(slot.locked),
        squadIds: (slot.squadIds || []).slice(),
        vehicleIds: (slot.vehicleIds || []).slice(),
        unitIds: (slot.unitIds || []).slice(),
        droneIds: (slot.droneIds || []).slice()
      }));
    }

    playersSnapshot(game, roleSlots, remote) {
      if (remote && !game.onlineSession?.players?.length) {
        return roleSlots
          .filter((slot) => slot.playerId)
          .map((slot) => ({
            id: slot.playerId,
            name: slot.playerId,
            nickname: slot.playerId,
            factionId: "",
            skinId: "",
            team: slot.team,
            slotId: slot.id,
            roleId: slot.roleId || "",
            position: null,
            ready: false,
            host: false
          }));
      }
      return (game.onlineSession?.players || []).map((player) => ({
        id: player.id,
        name: player.name || player.id,
        nickname: player.nickname || player.name || player.id,
        factionId: player.factionId || player.skinId || "",
        skinId: player.skinId || "",
        team: player.team,
        slotId: player.slotId || "",
        roleId: player.roleId || "",
        position: player.position || null,
        x: player.x ?? player.position?.x ?? null,
        y: player.y ?? player.position?.y ?? null,
        alive: player.alive !== false,
        inVehicle: Boolean(player.inVehicle || player.position?.inVehicle),
        ready: Boolean(player.ready),
        host: Boolean(player.host)
      }));
    }

    commandLogSnapshot(game, remote) {
      if (remote?.commands) return remote.commands.slice(-40);
      return (game.commandBus?.log || []).slice(-40).map((entry) => ({
        accepted: Boolean(entry.accepted),
        reason: entry.reason || "",
        summary: entry.summary || "",
        type: entry.packet?.type || "",
        slotId: entry.packet?.slotId || "",
        objectiveName: entry.packet?.objectiveName || "",
        issuedAt: entry.packet?.issuedAt || 0
      }));
    }

    capturePointSnapshot(game) {
      return (game.capturePoints || []).map((point) => ({
        name: point.name,
        x: Math.round(point.x || 0),
        y: Math.round(point.y || 0),
        owner: point.owner,
        progress: Number(point.progress || 0),
        contested: Boolean(point.contested)
      }));
    }

    mapSnapshot(game) {
      const world = game.world || {};
      return {
        id: world.id || "map01",
        width: world.width || 0,
        height: world.height || 0,
        safeZones: this.clonePlain(world.safeZones || []),
        capturePoints: this.capturePointSnapshot(game),
        scenery: (world.scenery || []).map((item) => ({
          id: item.id || "",
          kind: item.kind || item.type || "",
          x: Math.round(item.x || 0),
          y: Math.round(item.y || 0),
          destructible: Boolean(item.destructible),
          destroyed: Boolean(item.destroyed)
        }))
      };
    }

    backupStatus() {
      let local = null;
      try {
        const raw = localStorage.getItem(this.storageKey);
        if (raw) {
          const backup = JSON.parse(raw);
          local = {
            exportedAt: backup.exportedAt || 0,
            day: backup.day || "",
            summary: backup.summary || null,
            size: raw.length
          };
        }
      } catch (_error) {
        local = { error: true };
      }
      return {
        local,
        storageKey: this.storageKey,
        serverBackups: [],
        drive: { status: "planned" }
      };
    }

    backupSummary(snapshot) {
      const room = snapshot?.room || {};
      const match = snapshot?.match || {};
      const ai = snapshot?.ai || {};
      return {
        roomId: snapshot?.roomId || room.id || "local",
        phase: match.phase || "",
        mode: match.mode || "",
        players: room.playerCount || 0,
        roleSlots: Array.isArray(room.roleSlots) ? room.roleSlots.length : 0,
        aiUnits: ai.summary?.total || 0,
        aiEvents: ai.eventCount || 0,
        commands: Array.isArray(snapshot?.commands) ? snapshot.commands.length : 0
      };
    }

    teamStats(game, team) {
      const tanks = (game.tanks || []).filter((tank) => tank.team === team);
      const humvees = (game.humvees || []).filter((humvee) => humvee.team === team);
      const infantry = (game.infantry || []).filter((unit) => unit.team === team);
      const humans = game.humanTeamPresenceStats?.(team, { includeLocal: !game.adminObserverMode }) || { total: 0, alive: 0 };
      const vehicleTotal = tanks.length + humvees.length;
      const vehicleAlive = tanks.filter((tank) => tank.alive).length + humvees.filter((humvee) => humvee.alive).length;
      const infantryTotal = infantry.length + humans.total;
      const infantryAlive = infantry.filter((unit) => unit.alive).length + humans.alive;
      return {
        alive: vehicleAlive + infantryAlive,
        total: vehicleTotal + infantryTotal,
        vehicles: `${vehicleAlive}/${vehicleTotal}`,
        infantry: `${infantryAlive}/${infantryTotal}`
      };
    }

    topEntries(counts = {}, limit = 4) {
      return Object.entries(counts || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([label, count]) => ({ label, count }));
    }

    teamName(team) {
      return team === TEAM.RED ? "적팀" : "청팀";
    }

    clonePlain(value) {
      try {
        return JSON.parse(JSON.stringify(value ?? null));
      } catch (_error) {
        return null;
      }
    }

    dayKey(now = Date.now()) {
      return new Date(Number(now) + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    }
  }

  IronLine.AdminOps = AdminOps;
})(window);
