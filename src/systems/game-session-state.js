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

    requestedCombatOnlyRecoveryMode() {
      const params = new URLSearchParams(window.location.search || "");
      if (!params.has("p0CombatOnly") && !params.has("combatOnly")) return false;
      const value = params.has("p0CombatOnly") ? params.get("p0CombatOnly") : params.get("combatOnly");
      const normalized = String(value || "").toLowerCase();
      return normalized === "" || ["1", "true", "yes", "on"].includes(normalized);
    }

    isAdminStandalonePage() {
      return /admin\.html$/i.test(window.location.pathname || "") ||
        Boolean(document.body?.classList?.contains("admin-standalone-page"));
    }

    enterAdminObserverMode() {
      if (this.isAdminStandalonePage()) return this.enterAdminOpsMode();
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

    enterAdminOpsMode() {
      const room = this.ensureAdminControlRoom();
      this.matchConfig.mode = "conquest";
      this.deploymentOpen = false;
      this.lobbyOpen = false;
      this.roomListOpen = false;
      this.entryOpen = false;
      this.matchStarted = false;
      this.countdownStarted = false;
      this.startCountdown = 0;
      this.matchPhase = "waiting";
      this.debug.ai = false;
      this.debug.navGraph = false;
      if (this.player) Object.assign(this.player, { alive: false, hp: 0, inTank: null });
      if (this.playerTank) this.playerTank.playerControlled = false;
      if (room) this.adminApplyRoom?.(room, { live: false });
      this.adminCamera?.activate?.();
      this.adminCamera?.fitWorld?.();
      this.hud?.toggleAdminPanel?.(true);
      this.hud?.selectAdminTab?.("ops");
      this.hud?.update?.(this);
      return true;
    }

    ensureAdminControlRoom() {
      const registry = IronLine.roomRegistry;
      if (!registry) return null;
      const selectedRoom = registry.selectedRoom?.();
      if (selectedRoom) {
        registry.selectRoom?.(selectedRoom.id);
        return selectedRoom;
      }
      return registry.createRoom?.({
        name: "온라인 테스트방",
        mode: "conquest",
        blueFactionId: "singularity",
        redFactionId: "military-gallery"
      }) || null;
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
      const density = this.aiDensityProfile("large");
      const blueInfantryBase = spawns.infantryBlue?.length || 0;
      const redInfantryBase = spawns.infantryRed?.length || 0;
      const blueTankBase = spawns.blue?.length || 0;
      const redTankBase = spawns.red?.length || 0;
      return {
        mode: "annihilation",
        difficulty: "normal",
        blueFactionId: "korea",
        redFactionId: "russia",
        aiDensityPreset: density.id,
        preparationSeconds: 10,
        countdownSeconds: 5,
        blueAiTanks: this.defaultAiTankCount(blueTankBase, density.blueTankBonus),
        blueInfantry: this.defaultAiInfantryCount(blueInfantryBase, density.blueInfantryScale),
        redTanks: this.defaultAiTankCount(redTankBase, density.redTankBonus),
        redInfantry: this.defaultAiInfantryCount(redInfantryBase, density.redInfantryScale)
      };
    }

    aiDensityProfile(id = "large") {
      const profiles = {
        performance: {
          id: "performance",
          blueInfantryScale: 1.15,
          redInfantryScale: 1.25,
          blueTankBonus: 0,
          redTankBonus: 0
        },
        standard: {
          id: "standard",
          blueInfantryScale: 1.32,
          redInfantryScale: 1.45,
          blueTankBonus: 0,
          redTankBonus: 0
        },
        large: {
          id: "large",
          blueInfantryScale: 1.5,
          redInfantryScale: 1.7,
          blueTankBonus: 0,
          redTankBonus: 1
        }
      };
      return profiles[id] || profiles.large;
    }

    applyAiDensityPreset(id = "large") {
      if (this.matchStarted || this.countdownStarted) return false;
      const density = this.aiDensityProfile(id);
      const spawns = this.world.spawns;
      this.matchConfig.aiDensityPreset = density.id;
      this.matchConfig.blueAiTanks = this.defaultAiTankCount(spawns.blue?.length || 0, density.blueTankBonus);
      this.matchConfig.blueInfantry = this.defaultAiInfantryCount(spawns.infantryBlue?.length || 0, density.blueInfantryScale);
      this.matchConfig.redTanks = this.defaultAiTankCount(spawns.red?.length || 0, density.redTankBonus);
      this.matchConfig.redInfantry = this.defaultAiInfantryCount(spawns.infantryRed?.length || 0, density.redInfantryScale);
      this.scenarioDirty = true;
      this.resetScenarioForMatch?.();
      this.hud?.update?.(this);
      return true;
    }

    defaultAiInfantryCount(baseCount, scale = 1.5) {
      const base = Math.max(0, Math.floor(Number(baseCount) || 0));
      if (base <= 0) return 0;
      return Math.max(base, Math.round(base * scale));
    }

    defaultAiTankCount(baseCount, bonus = 0) {
      const base = Math.max(0, Math.floor(Number(baseCount) || 0));
      if (base <= 0) return 0;
      return Math.max(base, base + Math.max(0, Math.floor(Number(bonus) || 0)));
    }

    profileStorageKey() {
      return "iron-line-local-profile-v1";
    }

    sessionPlayerIdStorageKey() {
      return "iron-line-session-player-id-v1";
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
        const saved = raw ? JSON.parse(raw) : {};
        const profile = {
          ...fallback,
          clientId: typeof saved.clientId === "string" && saved.clientId ? saved.clientId : fallback.clientId,
          playerId: typeof saved.playerId === "string" && saved.playerId ? saved.playerId : fallback.playerId,
          nickname: this.sanitizeNickname(saved.nickname || fallback.nickname),
          factionId: this.normalizeFactionId(saved.factionId || saved.skinId || fallback.factionId),
          skinId: this.normalizeFactionId(saved.factionId || saved.skinId || fallback.skinId),
          createdAt: Number(saved.createdAt) || fallback.createdAt,
          updatedAt: Number(saved.updatedAt) || fallback.updatedAt
        };
        return this.applySessionPlayerIdToProfile(profile);
      } catch (_error) {
        return this.applySessionPlayerIdToProfile(fallback);
      }
    }

    saveLocalProfile(profile = this.localProfile) {
      try {
        const persistentPlayerId = profile?.persistentPlayerId || profile?.playerId;
        localStorage.setItem(this.profileStorageKey(), JSON.stringify({
          ...profile,
          playerId: persistentPlayerId
        }));
      } catch (_error) {
        // Local profile persistence is best-effort only.
      }
    }

    readSessionPlayerId() {
      try {
        const raw = sessionStorage.getItem(this.sessionPlayerIdStorageKey());
        if (!raw) return "";
        const saved = JSON.parse(raw);
        return typeof saved.playerId === "string" ? saved.playerId : "";
      } catch (_error) {
        return "";
      }
    }

    writeSessionPlayerId(playerId = "", basePlayerId = "") {
      try {
        if (!playerId) return;
        sessionStorage.setItem(this.sessionPlayerIdStorageKey(), JSON.stringify({
          playerId,
          basePlayerId,
          updatedAt: Date.now()
        }));
      } catch (_error) {
        // Session identity repair should not block joining.
      }
    }

    applySessionPlayerIdToProfile(profile = {}) {
      let sessionPlayerId = this.readSessionPlayerId();
      if (!sessionPlayerId) {
        sessionPlayerId = this.createId("player");
        this.writeSessionPlayerId(sessionPlayerId, profile.playerId || sessionPlayerId);
      }
      if (!sessionPlayerId || sessionPlayerId === profile.playerId) return profile;
      return {
        ...profile,
        persistentPlayerId: profile.persistentPlayerId || profile.playerId,
        playerId: sessionPlayerId
      };
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
            controllerType: "bot",
            locked: false,
            squadIds: [],
            vehicleIds: [],
            unitIds: [],
            droneIds: [],
            commandAuthorityPlayerId: "",
            commandAuthorityName: "",
            commandAuthoritySource: "",
            commandAuthorityUpdatedAt: 0,
            commandRequest: null
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
          blueFactionId: "singularity",
          redFactionId: "military-gallery",
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
        this.setSlotCommandAuthority(localSlot, profile.playerId, profile.nickname, "owner");
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
            weaponId: IronLine.playerDefaultLoadout?.weaponId || "rifle",
            weaponInventory: IronLine.playerDefaultLoadout?.weaponInventory?.() || ["rifle", "", "", "", "", ""],
            equipmentAmmo: IronLine.playerDefaultLoadout?.equipmentAmmo?.() || { rifle: 96 },
            stats: { kills: 0, deaths: 0 },
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
        duration: 0,
        remaining: 0,
        stepIndex: 0,
        steps: []
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

    assignPlayerToSlot(playerId, slotId, options = {}) {
      if (!this.onlineSession || this.matchStarted || this.countdownStarted) return false;
      const player = this.sessionPlayerById(playerId);
      const localSpectatorClaim = Boolean(
        player &&
        playerId === this.onlineSession.playerId &&
        ["spectator", "caster"].includes(player.participantType || this.onlineSession.participantType)
      );
      if (player?.participantType && player.participantType !== "player" && !localSpectatorClaim) return false;
      const nextSlot = this.sessionSlotById(slotId);
      if (!player || !nextSlot || nextSlot.locked) return false;
      const occupied = nextSlot.playerId && nextSlot.playerId !== playerId;
      if (occupied) return false;
      if (localSpectatorClaim && !this.convertLocalSpectatorToPlayer()) return false;
      const keepReady = Boolean(options.preserveReady && player.ready);
      const skipPublish = options.skipPublish === true;

      for (const slot of this.onlineSession.roleSlots || []) {
        if (slot.playerId === playerId) {
          slot.playerId = null;
          slot.aiControlled = true;
          slot.controllerType = this.onlineSession.aiFillEmptySlots === false ? "empty" : "bot";
          slot.ready = false;
          this.clearSlotCommandAuthority(slot, playerId);
        }
      }

      nextSlot.playerId = playerId;
      nextSlot.aiControlled = false;
      nextSlot.controllerType = "human";
      nextSlot.ready = keepReady;
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
        this.player.team = nextSlot.team;
        this.player.factionId = factionId;
        this.player.skinId = factionId;
      }
      const currentClassId = playerId === this.onlineSession.playerId && this.player
        ? (this.player.classId || player.currentClassId || player.classId || "infantry")
        : (player.currentClassId || player.classId || "infantry");
      if (playerId === this.onlineSession.playerId && this.player) {
        this.syncLocalCombatRoleState?.(this.player);
      } else {
        const equipment = Array.isArray(player.weaponInventory) && player.weaponInventory.length
          ? player.weaponInventory.slice()
          : (this.deploymentEquipmentForClass?.(currentClassId) || []);
        player.classId = currentClassId;
        player.currentClassId = currentClassId;
        player.combatRoleId = player.combatRoleId || IronLine.playerLoadouts?.classRoleId?.(currentClassId) || "infantry";
        player.weaponInventory = equipment.slice();
        player.weaponId = player.weaponId || equipment[0] || "machinegun";
        player.equipmentAmmo = player.equipmentAmmo || IronLine.playerLoadouts?.classAmmo?.(currentClassId, equipment) || {};
        nextSlot.currentClassId = currentClassId;
        nextSlot.weaponId = player.weaponId;
        nextSlot.equipmentAmmo = { ...(player.equipmentAmmo || {}) };
      }
      player.ready = keepReady;
      this.setSlotCommandAuthority(nextSlot, playerId, player.name || player.nickname || playerId, "owner");
      if (playerId === this.onlineSession.playerId) this.onlineSession.localReady = keepReady;
      IronLine.factionVisuals?.syncGame?.(this);
      this.syncOnlineSlotAssets();
      if (playerId === this.onlineSession.playerId && !skipPublish) {
        this.hud?.sessionFlow?.publishLocalPlayer?.(this, { force: true });
      }
      this.hud?.update?.(this);
      return true;
    }

    convertLocalSpectatorToPlayer() {
      const session = this.onlineSession;
      const player = this.localSessionPlayer?.();
      if (!session || !player) return false;
      const room = session.roomId ? IronLine.roomRegistry?.getRoom?.(session.roomId) : null;
      const phase = room?.phase || "waiting";
      if (room?.locked || ["playing", "loading", "ended"].includes(phase)) return false;
      session.participantType = "player";
      session.localReady = false;
      session.spectators = (session.spectators || []).filter((item) => item.id !== session.playerId);
      player.participantType = "player";
      player.ready = false;
      this.spectatorMode = false;
      this.casterMode = false;
      return true;
    }

    squadById(id) {
      return (this.squads || []).find((squad) => squad.callSign === id) || null;
    }

    vehicleById(id) {
      return [...(this.tanks || []), ...(this.humvees || [])].find((vehicle) => vehicle.callSign === id) || null;
    }

    handleSquadLeaderLoss(squad, lostLeader) {
      if (!squad || !lostLeader || squad.commandSlotOverrideId) return false;
      const player = this.localSessionPlayer?.();
      if (!player || (player.participantType || "player") !== "player" || player.team !== squad.team) return false;
      if (!this.localPlayerAlive()) return false;
      const ownerSlot = this.sessionSlotById?.(squad.ownerSlotId || "");
      if (ownerSlot?.playerId && ownerSlot.playerId !== player.id) return false;
      const successor = this.squadSuccessionCandidate(squad, ownerSlot);
      if (!successor || successor.player.id !== player.id) return false;
      const localSlot = successor.slot;
      if (!localSlot || squad.ownerSlotId === localSlot.id) return false;

      squad.commandSlotOverrideId = localSlot.id;
      squad.commandTransferReason = "leader_loss";
      this.syncOnlineSlotAssets?.();

      const transferCount = squad.activeUnits?.().length || 0;
      if (transferCount <= 0) return false;
      const teamLabel = squad.team === TEAM.RED ? "홍팀" : "청팀";
      const roleLabel = this.commandRoleLabel(ownerSlot?.roleId || squad.squadType || localSlot.roleId);
      const squadNo = this.squadSerialLabel(squad);
      const detail = `${teamLabel} ${roleLabel} ${squadNo}분대 분대장이 사망했습니다. 보병 ${transferCount}명이 내 분대로 편입됩니다.`;
      this.battlefieldEvents?.push?.({
        type: "squad_leader_lost",
        severity: "warning",
        team: squad.team,
        title: "분대장 사망",
        detail
      });
      this.hud?.update?.(this);
      return true;
    }

    squadSuccessionCandidate(squad, ownerSlot = null) {
      const center = squad.status?.center || squad.leaderUnit?.() || squad.order?.point;
      if (!center) return null;
      const candidates = [];
      for (const player of this.onlineSession?.players || []) {
        if (!player || (player.participantType || "player") !== "player") continue;
        if (player.team !== squad.team || player.alive === false) continue;
        const slot = this.sessionSlotById?.(player.slotId);
        if (!slot || slot.team !== squad.team || slot.id === ownerSlot?.id) continue;
        const distance = this.distanceFromSquadToSlotCommand(center, player, slot);
        if (!Number.isFinite(distance) || distance > 900) continue;
        candidates.push({ player, slot, distance });
      }
      candidates.sort((a, b) => a.distance - b.distance || String(a.player.id).localeCompare(String(b.player.id)));
      return candidates[0] || null;
    }

    distanceFromSquadToSlotCommand(center, player, slot) {
      const anchors = [];
      if (player.id === this.onlineSession?.playerId && this.player?.alive !== false) {
        anchors.push(this.player);
      }
      const position = player.position || player;
      if (Number.isFinite(position?.x) && Number.isFinite(position?.y)) anchors.push(position);
      for (const vehicleId of slot?.vehicleIds || []) {
        const vehicle = this.vehicleById?.(vehicleId);
        if (vehicle?.alive) anchors.push(vehicle);
      }
      for (const squadId of slot?.squadIds || []) {
        const owned = this.squadById?.(squadId);
        const ownedCenter = owned?.status?.center || owned?.leaderUnit?.();
        if (ownedCenter) anchors.push(ownedCenter);
      }
      if (!anchors.length) return Infinity;
      return anchors.reduce((best, anchor) => Math.min(best, Math.hypot(center.x - anchor.x, center.y - anchor.y)), Infinity);
    }

    commandRoleLabel(roleId = "") {
      if (roleId === "armor") return "기갑";
      if (roleId === "engineer") return "공병";
      if (roleId === "recon") return "정찰";
      return "보병";
    }

    squadSerialLabel(squad) {
      const match = /-(\d+)$/.exec(squad?.callSign || "");
      return match ? match[1] : (squad?.callSign || "");
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
      for (const vehicle of [...(this.tanks || []), ...(this.humvees || [])]) {
        vehicle.ownerSlotId = "";
      }

      const assignTeam = (team) => {
        const teamSlots = new Map(
          slots
            .filter((slot) => slot.team === team)
            .map((slot) => [slot.roleId, slot])
        );
        const teamSlotsById = new Map(
          slots
            .filter((slot) => slot.team === team)
            .map((slot) => [slot.id, slot])
        );
        const squads = (this.squads || [])
          .filter((squad) => squad.team === team)
          .sort((a, b) => a.callSign.localeCompare(b.callSign));
        const scouts = (this.infantry || [])
          .filter((unit) => unit.team === team && unit.classId === "scout")
          .map((unit) => unit.callSign);
        const vehicles = [...(this.tanks || []), ...(this.humvees || [])]
          .filter((vehicle) => vehicle.team === team && !vehicle.isPlayerTank)
          .sort((a, b) => a.callSign.localeCompare(b.callSign));
        const transferredSquads = squads.filter((squad) => (
          squad.commandSlotOverrideId && teamSlotsById.has(squad.commandSlotOverrideId)
        ));
        const transferSet = new Set(transferredSquads);
        const commandableSquads = squads.filter((squad) => !transferSet.has(squad));

        const squadBuckets = {
          infantry: commandableSquads.filter((squad) => (squad.squadType || "infantry") === "infantry"),
          engineer: commandableSquads.filter((squad) => squad.squadType === "engineer"),
          recon: commandableSquads.filter((squad) => squad.squadType === "recon"),
          armor: commandableSquads.filter((squad) => squad.squadType === "armor")
        };

        const assignPrimarySquad = (roleId, bucket) => {
          const slot = teamSlots.get(roleId);
          const squad = bucket.shift();
          if (!slot || !squad) return;
          slot.squadIds.push(squad.callSign);
          squad.ownerSlotId = slot.id;
        };

        assignPrimarySquad("infantry", squadBuckets.infantry);
        assignPrimarySquad("engineer", squadBuckets.engineer);
        assignPrimarySquad("recon", squadBuckets.recon);
        assignPrimarySquad("armor", squadBuckets.armor);

        for (const squad of transferredSquads) {
          const slot = teamSlotsById.get(squad.commandSlotOverrideId);
          if (!slot || slot.squadIds.includes(squad.callSign)) continue;
          slot.squadIds.push(squad.callSign);
          squad.ownerSlotId = slot.id;
        }

        const reconSlot = teamSlots.get("recon");
        if (reconSlot) reconSlot.unitIds = scouts;
        const armorSlot = teamSlots.get("armor");
        if (armorSlot) {
          const primaryVehicle = vehicles[0] || null;
          armorSlot.vehicleIds = primaryVehicle ? [primaryVehicle.callSign] : [];
          if (primaryVehicle) primaryVehicle.ownerSlotId = armorSlot.id;
        }
      };

      assignTeam(TEAM.BLUE);
      assignTeam(TEAM.RED);
      for (const slot of slots) {
        slot.aiControlled = !slot.playerId;
        slot.controllerType = slot.playerId
          ? "human"
          : this.onlineSession?.aiFillEmptySlots === false
            ? "empty"
            : "bot";
      }
      this.syncCommandAuthorityState();
    }

    playerDisplayName(playerId = "") {
      const player = this.sessionPlayerById(playerId);
      return player?.name || player?.nickname || playerId || "";
    }

    localPlayerAlive() {
      if (this.playerDeathActive || this.playerDowned) return false;
      return !this.player || this.player.hp > 0;
    }

    sessionPlayerActive(playerId = "") {
      if (!playerId) return false;
      const player = this.sessionPlayerById(playerId);
      if (!player || (player.participantType || "player") !== "player") return false;
      return player.alive !== false;
    }

    setSlotCommandAuthority(slot, playerId = "", playerName = "", source = "delegated") {
      if (!slot) return null;
      slot.commandAuthorityPlayerId = playerId || "";
      slot.commandAuthorityName = playerId ? (playerName || this.playerDisplayName(playerId) || playerId) : "";
      slot.commandAuthoritySource = playerId ? source : "";
      slot.commandAuthorityUpdatedAt = Date.now();
      if (playerId) slot.commandRequest = null;
      return slot;
    }

    clearSlotCommandAuthority(slot, playerId = "") {
      if (!slot) return null;
      if (playerId && slot.commandAuthorityPlayerId && slot.commandAuthorityPlayerId !== playerId) return slot;
      slot.commandAuthorityPlayerId = "";
      slot.commandAuthorityName = "";
      slot.commandAuthoritySource = "";
      slot.commandAuthorityUpdatedAt = Date.now();
      if (slot.commandRequest?.requesterId === playerId) slot.commandRequest = null;
      return slot;
    }

    slotHasAssets(slot) {
      return Boolean((slot?.squadIds?.length || 0) + (slot?.vehicleIds?.length || 0) + (slot?.unitIds?.length || 0));
    }

    canCommandSlot(slot, playerId = this.onlineSession?.playerId || "") {
      if (!slot || !playerId) return false;
      if (slot.playerId === playerId) return true;
      return Boolean(slot.playerId && slot.commandAuthorityPlayerId === playerId);
    }

    commandSlotsForPlayer(playerId = this.onlineSession?.playerId || "") {
      const player = this.sessionPlayerById(playerId);
      const team = player?.team || this.player?.team || TEAM.BLUE;
      return (this.onlineSession?.roleSlots || [])
        .filter((slot) => slot.team === team && this.slotHasAssets(slot) && this.canCommandSlot(slot, playerId));
    }

    commandAuthorityForSlot(slot, playerId = this.onlineSession?.playerId || "") {
      if (!slot) return { allowed: false, reason: "missing-slot" };
      if (this.canCommandSlot(slot, playerId)) return { allowed: true, reason: "" };
      if (!slot.playerId && slot.controllerType === "bot" && playerId === this.botCommanderIdForSlot(slot)) {
        return { allowed: true, reason: "" };
      }
      return { allowed: false, reason: "command-authority-required" };
    }

    botCommanderIdForSlot(slot) {
      return this.botCommander?.botIdForSlot?.(slot) || `bot:${slot?.id || "slot"}`;
    }

    commandRequestForLocal(slot) {
      const localId = this.onlineSession?.playerId || "";
      if (!slot?.commandRequest || !localId) return null;
      return slot.commandRequest.requesterId === localId ? slot.commandRequest : null;
    }

    requestCommandAuthority(slotId) {
      const slot = this.sessionSlotById(slotId);
      const player = this.localSessionPlayer?.();
      if (!slot || !player || player.participantType !== "player") return { ok: false, reason: "missing-slot" };
      if (slot.team !== player.team) return { ok: false, reason: "team-mismatch" };
      if (this.canCommandSlot(slot, player.id)) return { ok: true, status: "already-owned", slot };
      return { ok: false, reason: slot.playerId ? "manual-delegation-disabled" : "ai-slot-not-claimable" };
    }

    approveCommandAuthority(slotId) {
      const slot = this.sessionSlotById(slotId);
      const player = this.localSessionPlayer?.();
      const request = slot?.commandRequest;
      if (!slot || !player || !request) return { ok: false, reason: "missing-request" };
      if (slot.playerId !== player.id && this.onlineSession?.hostId !== player.id) return { ok: false, reason: "not-owner" };
      this.setSlotCommandAuthority(slot, request.requesterId, request.requesterName, "delegated");
      this.publishCommandAuthorityChange(slot, "approve");
      this.hud?.update?.(this);
      return { ok: true, status: "approved", slot };
    }

    denyCommandAuthority(slotId) {
      const slot = this.sessionSlotById(slotId);
      const player = this.localSessionPlayer?.();
      if (!slot || !player || !slot.commandRequest) return { ok: false, reason: "missing-request" };
      if (slot.playerId !== player.id && this.onlineSession?.hostId !== player.id) return { ok: false, reason: "not-owner" };
      const request = slot.commandRequest;
      slot.commandRequest = null;
      IronLine.roomRegistry?.resolveCommandAuthorityRequest?.(this.onlineSession?.roomId || "", request.id, false, {
        resolverId: player.id,
        resolverName: player.name || player.nickname || player.id
      });
      this.hud?.update?.(this);
      return { ok: true, status: "denied", slot };
    }

    releaseCommandAuthority(slotId) {
      const slot = this.sessionSlotById(slotId);
      const player = this.localSessionPlayer?.();
      if (!slot || !player || !this.canCommandSlot(slot, player.id)) return { ok: false, reason: "not-owner" };
      if (slot.playerId === player.id) {
        this.setSlotCommandAuthority(slot, player.id, player.name || player.nickname, "owner");
      } else {
        this.clearSlotCommandAuthority(slot, player.id);
      }
      this.publishCommandAuthorityChange(slot, "release");
      this.hud?.update?.(this);
      return { ok: true, status: "released", slot };
    }

    publishCommandAuthorityChange(slot, action = "update") {
      if (!this.onlineSession?.roomId || !slot) return;
      IronLine.roomRegistry?.updateCommandAuthority?.(this.onlineSession.roomId, {
        slotId: slot.id,
        playerId: slot.commandAuthorityPlayerId || "",
        playerName: slot.commandAuthorityName || "",
        source: slot.commandAuthoritySource || "",
        action
      });
    }

    publishCommandAuthorityRequest(slot) {
      if (!this.onlineSession?.roomId || !slot?.commandRequest) return;
      IronLine.roomRegistry?.requestCommandAuthority?.(this.onlineSession.roomId, slot.commandRequest);
    }

    applyRoomCommandAuthority(authorities = [], requests = []) {
      const bySlot = new Map((authorities || []).map((item) => [item.slotId, item]));
      for (const slot of this.onlineSession?.roleSlots || []) {
        const authority = bySlot.get(slot.id);
        if (authority && slot.playerId && authority.playerId === slot.playerId) {
          this.setSlotCommandAuthority(slot, authority.playerId, authority.playerName, "owner");
          slot.commandAuthorityUpdatedAt = authority.updatedAt || slot.commandAuthorityUpdatedAt || Date.now();
        } else if (slot.playerId) {
          this.setSlotCommandAuthority(slot, slot.playerId, this.playerDisplayName(slot.playerId), "owner");
        } else {
          this.clearSlotCommandAuthority(slot);
        }
        slot.commandRequest = null;
      }
      this.syncCommandAuthorityState();
    }

    syncCommandAuthorityState() {
      for (const slot of this.onlineSession?.roleSlots || []) {
        if (slot.playerId) {
          if (slot.commandAuthorityPlayerId !== slot.playerId || slot.commandAuthoritySource !== "owner") {
            this.setSlotCommandAuthority(slot, slot.playerId, this.playerDisplayName(slot.playerId), "owner");
          }
        } else if (slot.commandAuthorityPlayerId) {
          this.clearSlotCommandAuthority(slot);
        }

        slot.commandRequest = null;
      }
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
