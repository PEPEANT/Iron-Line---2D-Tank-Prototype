"use strict";

(function registerGameSessionState(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, MATCH_RULES } = IronLine.constants;

  class GameSessionState {
    requestedTestLab() {
      const params = new URLSearchParams(window.location.search || "");
      if (!params.has("testLab") && !params.has("lab")) return "";
      const value = params.get("testLab") || params.get("lab") || "drone";
      return String(value).toLowerCase() || "drone";
    }

    requestedAdminMode() {
      const params = new URLSearchParams(window.location.search || "");
      const value = params.get("admin") || params.get("debugAdmin") || "";
      return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
    }

    requestedObserverMode() {
      const params = new URLSearchParams(window.location.search || "");
      const value = params.get("observer") || params.get("adminObserver") || "";
      if (/admin\.html$/i.test(window.location.pathname || "")) return true;
      return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
    }

    enterAdminObserverMode() {
      this.setMatchMode?.("conquest");
      this.deploymentOpen = false;
      this.lobbyOpen = false;
      this.matchStarted = true;
      this.countdownStarted = false;
      this.startCountdown = 0;
      this.matchPhase = "live";
      this.debug.ai = true;
      if (this.player) Object.assign(this.player, { alive: false, hp: 0, inTank: null });
      if (this.playerTank) this.playerTank.playerControlled = false;
      this.adminCamera?.activate?.();
      this.hud?.openAdminObserver?.();
    }

    enterSpectatorMode(options = {}) {
      this.spectatorMode = true;
      this.casterMode = options.participantType === "caster";
      this.adminObserverMode = true;
      this.deploymentOpen = false;
      this.lobbyOpen = false;
      this.roomListOpen = false;
      this.entryOpen = false;
      this.matchStarted = true;
      this.countdownStarted = false;
      this.startCountdown = 0;
      this.matchPhase = "live";
      if (this.onlineSession) this.onlineSession.participantType = options.participantType || this.onlineSession.participantType || "spectator";
      if (this.player) Object.assign(this.player, { alive: false, hp: 0, inTank: null });
      if (this.playerTank) this.playerTank.playerControlled = false;
      this.adminCamera?.activate?.();
      if (!this.chat && IronLine.ChatSystem) this.chat = new IronLine.ChatSystem(this);
      this.chat?.addSystemMessage?.(this.casterMode ? "해설자 관전으로 입장했습니다." : "관전자로 입장했습니다.");
      this.hud?.update?.(this);
      this.canvas?.focus?.();
      return true;
    }

    defaultMatchConfig() {
      const spawns = this.world.spawns;
      return {
        mode: "annihilation",
        difficulty: "normal",
        blueAiTanks: spawns.blue.length,
        blueInfantry: spawns.infantryBlue.length,
        redTanks: spawns.red.length,
        redInfantry: spawns.infantryRed.length
      };
    }

    profileStorageKey() {
      return "iron-line-local-profile-v1";
    }

    createId(prefix = "player") {
      if (global.crypto?.randomUUID) return `${prefix}-${global.crypto.randomUUID().slice(0, 8)}`;
      return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000).toString(36)}`;
    }

    defaultLocalProfile() {
      const factionId = IronLine.playerFactions?.[0]?.id || IronLine.playerSkins?.[0]?.id || "korea";
      return {
        clientId: this.createId("client"),
        playerId: this.createId("player"),
        nickname: "Player",
        factionId,
        skinId: factionId,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
    }

    sanitizeNickname(value = "") {
      const nickname = String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 16);
      return nickname || "Player";
    }

    normalizeSkinId(value = "") {
      return this.normalizeFactionId(value);
    }

    normalizeFactionId(value = "") {
      const fallback = IronLine.playerFactions?.[0]?.id || IronLine.playerSkins?.[0]?.id || "korea";
      return IronLine.playerFactionById?.(value)?.id || IronLine.playerSkinById?.(value)?.id || fallback;
    }

    loadLocalProfile() {
      const fallback = this.defaultLocalProfile();
      try {
        const raw = localStorage.getItem(this.profileStorageKey());
        if (!raw) return fallback;
        const saved = JSON.parse(raw);
        return {
          ...fallback,
          clientId: typeof saved.clientId === "string" && saved.clientId ? saved.clientId : fallback.clientId,
          playerId: typeof saved.playerId === "string" && saved.playerId ? saved.playerId : fallback.playerId,
          nickname: this.sanitizeNickname(saved.nickname || fallback.nickname),
          factionId: this.normalizeFactionId(saved.factionId || saved.skinId || fallback.factionId),
          skinId: this.normalizeFactionId(saved.factionId || saved.skinId || fallback.skinId),
          createdAt: Number(saved.createdAt) || fallback.createdAt,
          updatedAt: Number(saved.updatedAt) || fallback.updatedAt
        };
      } catch (_error) {
        return fallback;
      }
    }

    saveLocalProfile(profile = this.localProfile) {
      try {
        localStorage.setItem(this.profileStorageKey(), JSON.stringify(profile));
      } catch (_error) {
        // Local profile persistence is best-effort only.
      }
    }

    setLocalProfile(input = {}) {
      const previous = this.localProfile || this.defaultLocalProfile();
      this.localProfile = {
        ...previous,
        nickname: this.sanitizeNickname(input.nickname ?? previous.nickname),
        factionId: this.normalizeFactionId(input.factionId ?? input.skinId ?? previous.factionId ?? previous.skinId),
        skinId: this.normalizeFactionId(input.factionId ?? input.skinId ?? previous.factionId ?? previous.skinId),
        updatedAt: Date.now()
      };
      this.saveLocalProfile(this.localProfile);
      this.applyLocalProfile();
      return this.localProfile;
    }

    applyLocalProfile() {
      const profile = this.localProfile || this.defaultLocalProfile();
      const factionId = this.normalizeFactionId(profile.factionId || profile.skinId);
      if (this.player) {
        this.player.factionId = factionId;
        this.player.skinId = factionId;
        IronLine.factionVisuals?.syncEntity?.(this, this.player);
      }
      if (!this.onlineSession) return;
      this.onlineSession.playerId = profile.playerId;
      if (!this.onlineSession.hostId || this.onlineSession.hostId === "local-player") this.onlineSession.hostId = profile.playerId;
      const localPlayer = this.onlineSession.players?.[0];
      if (localPlayer) {
        localPlayer.id = profile.playerId;
        localPlayer.name = profile.nickname;
        localPlayer.nickname = profile.nickname;
        localPlayer.factionId = factionId;
        localPlayer.skinId = factionId;
      }
      for (const slot of this.onlineSession.roleSlots || []) {
        if (slot.playerId === "local-player") slot.playerId = profile.playerId;
      }
      IronLine.factionVisuals?.syncGame?.(this);
    }

    completeEntryProfile(input = {}) {
      this.setLocalProfile(input);
      this.entryOpen = false;
      this.deploymentOpen = !this.entryOpen;
      this.lobbyOpen = false;
      this.matchPhase = "deployment";
      this.hud?.invalidateDeploymentMap?.();
      this.hud?.update?.(this);
      this.canvas.focus();
      return true;
    }

    sessionRoleDefinitions() {
      return [
        { id: "infantry", label: "보병", role: "infantry_leader" },
        { id: "engineer", label: "공병", role: "engineer_leader" },
        { id: "recon", label: "정찰", role: "recon_leader" },
        { id: "armor", label: "기갑", role: "armor_leader" }
      ];
    }

    createRoleSlots() {
      const teams = [
        { id: "blue", team: TEAM.BLUE, label: "청팀" },
        { id: "red", team: TEAM.RED, label: "홍팀" }
      ];
      const slots = [];
      for (const side of teams) {
        for (const role of this.sessionRoleDefinitions()) {
          slots.push({
            id: `${side.id}-${role.id}`,
            team: side.team,
            teamLabel: side.label,
            roleId: role.id,
            role: role.role,
            label: role.label,
            playerId: null,
            aiControlled: true,
            locked: false,
            squadIds: [],
            vehicleIds: [],
            unitIds: [],
            droneIds: []
          });
        }
      }
      return slots;
    }

    createLocalSession() {
      const suffix = Math.floor(1000 + Math.random() * 9000);
      const profile = this.localProfile || this.defaultLocalProfile();
      const roleSlots = this.createRoleSlots();
      if (this.adminObserverMode) {
        return {
          roomId: `관전-${suffix}`,
          playerId: "",
          hostId: "",
          blueFactionId: "korea",
          redFactionId: "russia",
          localReady: true,
          joinLocked: true,
          allowMidMatchJoin: false,
          participantType: "admin",
          roleSlots,
          players: []
        };
      }
      const localSlot = roleSlots.find((slot) => slot.id === "blue-infantry");
      if (localSlot) {
        localSlot.playerId = profile.playerId;
        localSlot.aiControlled = false;
      }
      return {
        roomId: `로컬-${suffix}`,
        playerId: profile.playerId,
        hostId: profile.playerId,
        blueFactionId: "korea",
        redFactionId: "russia",
        localReady: false,
        joinLocked: false,
        allowMidMatchJoin: false,
        participantType: "player",
        roleSlots,
        players: [
          {
            id: profile.playerId,
            name: profile.nickname,
            nickname: profile.nickname,
            factionId: profile.factionId || profile.skinId,
            skinId: profile.factionId || profile.skinId,
            team: TEAM.BLUE,
            slotId: "blue-infantry",
            roleId: "infantry",
            role: "infantry_leader",
            classId: "infantry",
            currentClassId: "infantry",
            combatRoleId: "infantry",
            weaponId: "machinegun",
            weaponInventory: ["machinegun", "pistol", "grenade"],
            equipmentAmmo: { grenade: 3 },
            participantType: "player",
            ready: false,
            host: true
          }
        ]
      };
    }

    defaultConquestState() {
      const duration = MATCH_RULES?.conquestDuration || 20 * 60;
      return {
        duration,
        remaining: duration,
        scoreRate: 0.65,
        respawnDelay: {
          player: 9,
          infantry: 14,
          vehicle: 24
        },
        score: {
          [TEAM.BLUE]: 0,
          [TEAM.RED]: 0
        }
      };
    }

    defaultStartLoadingState() {
      return {
        active: false,
        duration: 2.8,
        remaining: 0,
        stepIndex: 0,
        steps: [
          "방 슬롯 잠금",
          "AI 분대 배치",
          "관리자 관측 연결",
          "전투 시작 준비"
        ]
      };
    }

    isConquestMode() {
      return this.matchConfig?.mode === "conquest";
    }

    sessionPlayerById(playerId) {
      return this.onlineSession?.players?.find((player) => player.id === playerId) || null;
    }

    sessionSlotById(slotId) {
      return this.onlineSession?.roleSlots?.find((slot) => slot.id === slotId) || null;
    }

    localSessionPlayer() {
      return this.sessionPlayerById(this.onlineSession?.playerId) || this.onlineSession?.players?.[0] || null;
    }

    localSessionParticipantType() {
      return this.localSessionPlayer()?.participantType || this.onlineSession?.participantType || "player";
    }

    isLocalSpectator() {
      return ["spectator", "caster", "admin"].includes(this.localSessionParticipantType());
    }

    assignPlayerToSlot(playerId, slotId) {
      if (!this.onlineSession || this.matchStarted || this.countdownStarted) return false;
      const player = this.sessionPlayerById(playerId);
      if (player?.participantType && player.participantType !== "player") return false;
      const nextSlot = this.sessionSlotById(slotId);
      if (!player || !nextSlot || nextSlot.locked) return false;
      const occupied = nextSlot.playerId && nextSlot.playerId !== playerId;
      if (occupied) return false;

      for (const slot of this.onlineSession.roleSlots || []) {
        if (slot.playerId === playerId) {
          slot.playerId = null;
          slot.aiControlled = true;
        }
      }

      nextSlot.playerId = playerId;
      nextSlot.aiControlled = false;
      player.slotId = nextSlot.id;
      player.roleId = nextSlot.roleId;
      player.role = nextSlot.role;
      player.team = nextSlot.team;
      const factionId = nextSlot.team === TEAM.RED
        ? (this.onlineSession.redFactionId || "russia")
        : (this.onlineSession.blueFactionId || "korea");
      player.factionId = factionId;
      player.skinId = factionId;
      if (playerId === this.onlineSession.playerId && this.player) {
        this.player.factionId = factionId;
        this.player.skinId = factionId;
      }
      player.ready = false;
      if (playerId === this.onlineSession.playerId) this.onlineSession.localReady = false;
      IronLine.factionVisuals?.syncGame?.(this);
      this.syncOnlineSlotAssets();
      this.hud?.update?.(this);
      return true;
    }

    squadById(id) {
      return (this.squads || []).find((squad) => squad.callSign === id) || null;
    }

    vehicleById(id) {
      return [...(this.tanks || []), ...(this.humvees || [])].find((vehicle) => vehicle.callSign === id) || null;
    }

    syncOnlineSlotAssets() {
      const slots = this.onlineSession?.roleSlots || [];
      for (const slot of slots) {
        slot.squadIds = [];
        slot.vehicleIds = [];
        slot.unitIds = [];
        slot.droneIds = [];
      }

      for (const squad of this.squads || []) {
        squad.ownerSlotId = "";
      }

      const assignTeam = (team, sideId) => {
        const teamSlots = new Map(
          slots
            .filter((slot) => slot.team === team)
            .map((slot) => [slot.roleId, slot])
        );
        const squads = (this.squads || [])
          .filter((squad) => squad.team === team)
          .sort((a, b) => a.callSign.localeCompare(b.callSign));
        const scouts = (this.infantry || [])
          .filter((unit) => unit.team === team && unit.classId === "scout")
          .map((unit) => unit.callSign);
        const vehicles = [...(this.tanks || []), ...(this.humvees || [])]
          .filter((vehicle) => vehicle.team === team && !vehicle.isPlayerTank)
          .sort((a, b) => a.callSign.localeCompare(b.callSign))
          .map((vehicle) => vehicle.callSign);

        const squadBuckets = {
          infantry: squads.slice(0, 1),
          engineer: squads.slice(1, 2),
          recon: squads.slice(2, 3),
          armor: squads.slice(3)
        };
        if (squads.length > 0 && squadBuckets.armor.length === 0) squadBuckets.armor = squads.slice(-1);

        for (const [roleId, bucket] of Object.entries(squadBuckets)) {
          const slot = teamSlots.get(roleId);
          if (!slot) continue;
          slot.squadIds = bucket.map((squad) => squad.callSign);
          for (const squad of bucket) squad.ownerSlotId = slot.id;
        }

        const reconSlot = teamSlots.get("recon");
        if (reconSlot) reconSlot.unitIds = scouts;
        const armorSlot = teamSlots.get("armor");
        if (armorSlot) armorSlot.vehicleIds = vehicles;
      };

      assignTeam(TEAM.BLUE, "blue");
      assignTeam(TEAM.RED, "red");
      for (const slot of slots) slot.aiControlled = !slot.playerId;
    }
  }

  GameSessionState.prototype.enterSpectatorMode = function enterSpectatorMode(options = {}) {
    this.spectatorMode = true;
    this.casterMode = options.participantType === "caster";
    this.adminObserverMode = true;
    this.deploymentOpen = false;
    this.lobbyOpen = false;
    this.roomListOpen = false;
    this.entryOpen = false;
    this.matchStarted = true;
    this.countdownStarted = false;
    this.startCountdown = 0;
    this.matchPhase = "live";
    if (this.onlineSession) this.onlineSession.participantType = options.participantType || this.onlineSession.participantType || "spectator";
    if (this.player) Object.assign(this.player, { alive: false, hp: 0, inTank: null });
    if (this.playerTank) this.playerTank.playerControlled = false;
    this.adminCamera?.activate?.();
    if (!this.chat && IronLine.ChatSystem) this.chat = new IronLine.ChatSystem(this);
    this.chat?.addSystemMessage?.(this.casterMode ? "해설자 관전으로 입장했습니다." : "관전자로 입장했습니다.");
    this.hud?.update?.(this);
    this.canvas?.focus?.();
    return true;
  };

  IronLine.installGameSessionState = function installGameSessionState(Game) {
    for (const name of Object.getOwnPropertyNames(GameSessionState.prototype)) {
      if (name === "constructor") continue;
      Object.defineProperty(
        Game.prototype,
        name,
        Object.getOwnPropertyDescriptor(GameSessionState.prototype, name)
      );
    }
  };
})(window);
