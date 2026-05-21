"use strict";

(function registerGameAdminActions(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM, INFANTRY_WEAPONS, INFANTRY_CLASSES } = IronLine.constants;
  const { clamp, angleTo } = IronLine.math;

  const gameAdminActionMethods = {
    updateAdminMessage(dt) {
      if (this.adminMessageTimer <= 0) return;
      this.adminMessageTimer = Math.max(0, this.adminMessageTimer - dt);
      if (this.adminMessageTimer <= 0) this.adminMessage = "";
    },
    adminNotify(message, ttl = 2.6) {
      this.adminMessage = message || "";
      this.adminMessageTimer = this.adminMessage ? ttl : 0;
      return Boolean(this.adminMessage);
    },
    adminTeam(teamId = "red") {
      return teamId === "blue" ? TEAM.BLUE : TEAM.RED;
    },
    adminTeamLabel(team) {
      return team === TEAM.BLUE || team === "blue" ? "아군" : "적군";
    },
    adminReadRoomPatch() {
      const match = this.matchConfig || this.defaultMatchConfig?.() || {};
      const bounds = this.matchSettingBounds?.() || {
        blueAiTanks: { min: 0, max: 8 },
        blueInfantry: { min: 4, max: 56 },
        redTanks: { min: 1, max: 10 },
        redInfantry: { min: 4, max: 64 }
      };
      const readInt = (id, fallback, limit) => {
        const value = document.getElementById(id)?.value;
        const numeric = Math.round(Number(value));
        return clamp(Number.isFinite(numeric) ? numeric : fallback, limit.min, limit.max);
      };
      const difficulty = document.getElementById("adminRoomDifficulty")?.value || match.difficulty || "normal";
      return {
        name: document.getElementById("adminRoomName")?.value || "온라인 테스트방",
        mode: document.getElementById("adminRoomMode")?.value || "conquest",
        blueFactionId: document.getElementById("adminBlueFaction")?.value || "singularity",
        redFactionId: document.getElementById("adminRedFaction")?.value || "military-gallery",
        capacity: readInt("adminRoomCapacity", 8, { min: 1, max: 8 }),
        difficulty: ["easy", "normal", "hard"].includes(difficulty) ? difficulty : "normal",
        aiDensityPreset: "custom",
        blueAiTanks: readInt("adminBlueTanks", match.blueAiTanks ?? 3, bounds.blueAiTanks),
        blueInfantry: readInt("adminBlueInfantry", match.blueInfantry ?? 21, bounds.blueInfantry),
        redTanks: readInt("adminRedTanks", match.redTanks ?? 5, bounds.redTanks),
        redInfantry: readInt("adminRedInfantry", match.redInfantry ?? 24, bounds.redInfantry)
      };
    },
    adminClassLabel(classId) {
      if (classId === "engineer") return "공병";
      if (classId === "scout") return "정찰병";
      return "보병";
    },
    adminWeaponLabel(weaponId) {
      const labels = {
        rifle: "소총",
        smg: "기관단총",
        lmg: "분대지원화기",
        machinegun: "기관총",
        pistol: "권총",
        sniper: "저격총",
        grenade: "수류탄",
        grenadeLauncher: "유탄발사기",
        rpg: "RPG",
        repairKit: "수리킷",
        reconDrone: "정찰드론",
        kamikazeDrone: "자폭드론"
      };
      return labels[weaponId] || weaponId || "병기";
    },
    adminCompatibleClassForWeapon(weaponId) {
      if (weaponId === "sniper" || weaponId === "reconDrone") return "scout";
      if (weaponId === "rpg" || weaponId === "repairKit" || weaponId === "kamikazeDrone") return "engineer";
      return null;
    },
    adminSetPlayerClass(classId) {
      if (!INFANTRY_CLASSES[classId] || !this.player) return false;
      const changed = this.player.setClass(classId);
      this.applyPlayerLoadoutOverrides();
      this.adminEnsurePlayerAmmo();
      this.player.rifleCooldown = 0;
      this.adminNotify(`${this.adminClassLabel(classId)}으로 변경`);
      return changed;
    },
    adminSetPlayerWeapon(weaponId) {
      const weapon = INFANTRY_WEAPONS[weaponId];
      if (!weapon || !this.player) return false;

      const compatibleClass = this.adminCompatibleClassForWeapon(weaponId);
      if (compatibleClass && this.player.classId !== compatibleClass) {
        this.player.setClass(compatibleClass);
        this.applyPlayerLoadoutOverrides();
      }

      const inventory = this.player.weaponInventory || (this.player.weaponInventory = []);
      let slotIndex = inventory.indexOf(weaponId);
      if (slotIndex < 0) {
        slotIndex = clamp(this.player.activeSlot || 0, 0, 2);
        inventory[slotIndex] = weaponId;
      }

      this.player.activeSlot = slotIndex;
      this.player.setWeapon(weaponId);
      this.adminEnsurePlayerAmmo(weapon);
      this.player.rifleCooldown = 0;
      this.adminNotify(`병기 변경: ${this.adminWeaponLabel(weaponId)}`);
      return true;
    },
    adminEnsurePlayerAmmo(weapon = null) {
      if (!this.player) return false;
      const ammo = this.player.equipmentAmmo || (this.player.equipmentAmmo = {});
      for (const item of Object.values(INFANTRY_WEAPONS || {})) {
        if (!item?.ammoKey) continue;
        if (item.type === "gun") ammo[item.ammoKey] = Math.max(ammo[item.ammoKey] || 0, item.defaultAmmo ?? 90);
      }
      ammo.grenade = Math.max(ammo.grenade || 0, 6);
      ammo.grenadeLauncher = Math.max(ammo.grenadeLauncher || 0, 4);
      ammo.rpg = Math.max(ammo.rpg || 0, 6);
      ammo.repairKit = Math.max(ammo.repairKit || 0, 4);
      ammo.reconDrone = Math.max(ammo.reconDrone || 0, 2);
      ammo.kamikazeDrone = Math.max(ammo.kamikazeDrone || 0, 3);
      if (weapon?.ammoKey) ammo[weapon.ammoKey] = Math.max(ammo[weapon.ammoKey] || 0, weapon.defaultAmmo ?? 1);
      return true;
    },
    handleAdminAction(action) {
      if (action === "export-backup") {
        this.adminOps?.downloadBackup?.("manual");
        this.adminNotify("운영 백업 JSON을 만들었습니다.");
        return true;
      }
      if (action === "save-local-backup") {
        this.adminOps?.saveLocalBackup?.("manual");
        this.adminNotify("브라우저 임시 백업을 저장했습니다.");
        return true;
      }
      if (action === "load-local-backup") {
        const result = this.adminOps?.restoreLocalBackup?.() || { ok: false, message: "백업 기능이 준비되지 않았습니다." };
        this.adminNotify(result.message || (result.ok ? "백업을 불러왔습니다." : "백업을 불러오지 못했습니다."));
        return Boolean(result.ok);
      }
      if (action?.startsWith?.("map-")) return this.handleAdminMapAction?.(action) || false;
      if (action?.startsWith?.("room-")) return this.handleAdminRoomAction(action);
      if (action === "refill-player") {
        this.refillTestLabPlayer();
        this.adminEnsurePlayerAmmo();
        this.adminNotify("플레이어 보급 완료");
        return true;
      }
      if (action === "reset-player") return this.adminResetPlayerPosition();
      if (action === "enter-test-lab") {
        this.activateTestLab(this.testLab || "drone");
        this.adminNotify("테스트랩 시작");
        return true;
      }
      if (action === "reset-test-lab") {
        this.activateTestLab(this.testLab || "drone");
        this.adminNotify("테스트랩 리셋");
        return true;
      }
      if (action === "toggle-ai") {
        this.testLabAiPaused = !this.testLabAiPaused;
        this.adminNotify(this.testLabAiPaused ? "AI 정지" : "AI 재개");
        return true;
      }
      if (action === "clear-effects") {
        this.adminClearEffects();
        this.adminNotify("이펙트 삭제");
        return true;
      }
      if (action === "debug-ai") {
        this.debug.ai = !this.debug.ai;
        this.adminNotify(this.debug.ai ? "AI 생각 표시 켬" : "AI 생각 표시 끔");
        return true;
      }
      if (action === "debug-nav") {
        this.debug.navGraph = !this.debug.navGraph;
        this.adminNotify(this.debug.navGraph ? "경로 그래프 켬" : "경로 그래프 끔");
        return true;
      }
      return false;
    },
    handleAdminRoomAction(action) {
      const registry = IronLine.roomRegistry;
      if (!registry) {
        this.adminNotify("방 레지스트리가 준비되지 않았습니다.");
        return false;
      }

      const selectedId = document.getElementById("adminRoomSelect")?.value || registry.selectedRoomId();
      const roomPatch = this.adminReadRoomPatch();
      let room = null;

      if (action === "room-create") {
        room = registry.createRoom(roomPatch);
        this.adminApplyRoom(room, { live: false });
        registry.refreshRemoteRooms?.();
        this.adminNotify(`방 생성: ${room.id}`);
        this.hud?.update?.(this);
        return true;
      }

      if (action === "room-select") {
        room = registry.selectRoom(selectedId);
        if (!room) {
          this.adminNotify("선택할 방이 없습니다.");
          return false;
        }
        this.adminApplyRoom(room, { live: false });
        this.adminNotify(`관전 방 선택: ${room.id}`);
        this.hud?.update?.(this);
        return true;
      }

      if (!selectedId) {
        this.adminNotify("선택된 방이 없습니다.");
        return false;
      }

      if (action === "room-save") {
        room = registry.updateRoom(selectedId, roomPatch);
        if (!room) return false;
        this.adminApplyRoom(room, { live: false });
        registry.refreshRemoteRooms?.();
        this.adminNotify(`방 설정 저장: ${room.id}`);
        this.hud?.update?.(this);
        return true;
      }

      if (action === "room-start") {
        registry.updateRoom(selectedId, roomPatch);
        room = registry.startRoom(selectedId);
        if (!room) return false;
        this.adminApplyRoom(room, { live: true });
        registry.refreshRemoteRooms?.();
        this.adminNotify(`관리자 시작: ${room.id}`);
        this.hud?.update?.(this);
        return true;
      }

      if (action === "room-end") {
        room = registry.endRoom(selectedId);
        if (!room) return false;
        if (this.onlineSession?.roomId === room.id) {
          this.matchStarted = false;
          this.countdownStarted = false;
          this.lobbyOpen = false;
          this.matchPhase = "ended";
          this.result = "ended";
          this.resultReason = "관리자가 방을 종료했습니다.";
        }
        registry.refreshRemoteRooms?.();
        this.adminNotify(`방 종료: ${room.id}`);
        this.hud?.update?.(this);
        return true;
      }

      if (action === "room-reset") {
        room = registry.resetRoom(selectedId);
        if (!room) return false;
        this.adminApplyRoom(room, { live: false });
        registry.refreshRemoteRooms?.();
        this.adminNotify(`방 초기화: ${room.id}`);
        this.hud?.update?.(this);
        return true;
      }

      if (action === "room-delete") {
        registry.deleteRoom(selectedId);
        registry.refreshRemoteRooms?.();
        this.adminNotify(`방 삭제: ${selectedId}`);
        this.hud?.update?.(this);
        return true;
      }

      return false;
    },
    adminApplyRoom(room, options = {}) {
      if (!room) return false;
      this.sessionMode = "online";
      this.onlineSession = this.onlineSession || this.createLocalSession?.() || {};
      this.onlineSession.roomId = room.id;
      this.onlineSession.hostId = "admin";
      this.onlineSession.joinLocked = Boolean(room.locked);
      this.onlineSession.aiFillEmptySlots = room.aiFillEmptySlots !== false;
      this.onlineSession.blueFactionId = room.blueFactionId || "korea";
      this.onlineSession.redFactionId = room.redFactionId || "russia";
      if (!this.onlineSession.roleSlots?.length) this.onlineSession.roleSlots = this.createRoleSlots?.() || [];
      this.onlineSession.players = Array.isArray(room.players) ? room.players.map((player) => ({ ...player })) : [];
      this.onlineSession.spectators = Array.isArray(room.spectators) ? room.spectators.map((player) => ({ ...player })) : [];
      this.hud?.sessionFlow?.syncRoomParticipants?.(this, room);
      this.adminApplyRoomMatchSettings(room);
      if (this.matchConfig.mode === "conquest") this.conquest = this.defaultConquestState?.() || this.conquest;
      else this.resetAnnihilationState?.();
      this.entryOpen = false;
      this.roomListOpen = false;
      this.deploymentOpen = false;
      this.lobbyOpen = false;
      this.result = "";
      this.resultReason = "";
      if (options.live) {
        this.resetScenarioForMatch?.();
        this.syncOnlineSlotAssets?.();
        this.countdownStarted = false;
        this.matchStarted = true;
        this.matchPhase = "live";
        this.startCountdown = 0;
        if (this.adminObserverMode) {
          if (this.player) Object.assign(this.player, { alive: false, hp: 0, inTank: null });
          if (this.playerTank) this.playerTank.playerControlled = false;
          this.adminCamera?.activate?.();
        }
      } else {
        this.countdownStarted = false;
        this.matchStarted = false;
        this.matchPhase = "waiting";
        this.startLoading = this.defaultStartLoadingState?.() || this.startLoading;
        if (this.adminObserverMode) this.adminCamera?.fitWorld?.();
      }
      IronLine.factionVisuals?.syncGame?.(this);
      return true;
    },
    adminApplyRoomMatchSettings(room = {}) {
      const bounds = this.matchSettingBounds?.() || {
        blueAiTanks: { min: 0, max: 8 },
        blueInfantry: { min: 4, max: 56 },
        redTanks: { min: 1, max: 10 },
        redInfantry: { min: 4, max: 64 }
      };
      this.matchConfig = this.matchConfig || this.defaultMatchConfig?.() || {};
      this.matchConfig.mode = room.mode || this.matchConfig.mode || "conquest";
      this.matchConfig.difficulty = ["easy", "normal", "hard"].includes(room.difficulty)
        ? room.difficulty
        : this.matchConfig.difficulty || "normal";
      for (const key of ["blueAiTanks", "blueInfantry", "redTanks", "redInfantry"]) {
        const limit = bounds[key];
        if (!limit) continue;
        const value = Number(room[key]);
        if (Number.isFinite(value)) this.matchConfig[key] = clamp(Math.round(value), limit.min, limit.max);
      }
      this.matchConfig.aiDensityPreset = room.aiDensityPreset || "custom";
      return this.matchConfig;
    },
    adminResetPlayerPosition() {
      if (!this.player) return false;
      const spawn = this.testLab ? { x: 2320, y: 3000 } : this.world.spawns.player;
      if (this.player.inTank) this.dismountTank(this.player.inTank);
      this.exitPlayerDroneControl();
      this.player.x = spawn.x;
      this.player.y = spawn.y;
      this.player.hp = this.player.maxHp || 100;
      this.player.alive = true;
      this.player.rifleCooldown = 0;
      this.adminNotify("플레이어 위치 초기화");
      return true;
    },
    adminClearEffects() {
      for (const key of Object.keys(this.effects || {})) {
        if (Array.isArray(this.effects[key])) this.effects[key] = [];
      }
      this.projectiles = [];
      return true;
    },
    adminRemovePlayerDrones() {
      const player = this.player;
      const before = this.drones.length;
      this.exitPlayerDroneControl();
      this.drones = (this.drones || []).filter((drone) => {
        const owned = drone.owner === player || drone === player?.activeDrone;
        if (owned) drone.alive = false;
        return !owned;
      });
      if (player) {
        player.activeDrone = null;
        player.controlledDrone = null;
      }
      this.adminNotify(`플레이어 드론 ${Math.max(0, before - this.drones.length)}기 제거`);
      return true;
    },
    adminSpawnPoint(location = "mouse", index = 0, total = 1) {
      let base = null;
      if (location === "player") base = { x: this.player.x + 92, y: this.player.y };
      else if (location === "roof") base = this.testLabRoofPoint || { x: 2680, y: 2680 };
      else if (location.startsWith("objective-")) {
        const objectiveIndex = { "objective-a": 0, "objective-b": 1, "objective-c": 2 }[location] ?? 0;
        const point = this.capturePoints[objectiveIndex] || this.world.capturePoints?.[objectiveIndex];
        base = point ? { x: point.x, y: point.y } : null;
      } else {
        base = { x: this.input.mouse.worldX, y: this.input.mouse.worldY };
      }

      if (!base) base = { x: this.player.x + 92, y: this.player.y };
      const ring = Math.max(1, Math.ceil(Math.sqrt(Math.max(1, total))));
      const angle = index / Math.max(1, total) * Math.PI * 2;
      const spread = total <= 1 ? 0 : 34 + Math.floor(index / ring) * 18;
      return {
        x: clamp(base.x + Math.cos(angle) * spread, 42, this.world.width - 42),
        y: clamp(base.y + Math.sin(angle) * spread, 42, this.world.height - 42)
      };
    },
    adminSpawnTestUnit(options = {}) {
      const team = this.adminTeam(options.team);
      const unitType = options.unitType || "infantry";
      const count = clamp(Math.round(Number(options.count) || 1), 1, 12);
      const location = options.location || "mouse";
      const createdInfantry = [];
      let created = 0;

      for (let i = 0; i < count; i += 1) {
        const airborne = unitType === "reconDrone" || unitType === "kamikazeDrone";
        const point = this.adminSpawnPoint(location === "roof" && !airborne ? "player" : location, i, count);
        if (unitType === "tank") this.adminSpawnTank(team, point);
        else if (unitType === "humvee") this.adminSpawnHumvee(team, point);
        else if (airborne) this.adminSpawnDrone(team, unitType, point, location);
        else {
          const unit = this.adminSpawnInfantry(team, unitType, point);
          if (unit) createdInfantry.push(unit);
        }
        created += 1;
      }

      if (createdInfantry.length > 0) {
        const prefix = `${team === TEAM.BLUE ? "B" : "R"}-ADM-${++this.adminSpawnSerial}`;
        this.createSquads(team, createdInfantry, prefix);
      }

      this.adminNotify(`${this.adminTeamLabel(team)} ${this.adminUnitLabel(unitType)} ${created}개 생성`);
      return true;
    },
    adminUnitLabel(unitType) {
      const labels = {
        infantry: "보병",
        engineer: "공병",
        scout: "정찰병",
        tank: "전차",
        humvee: "험비",
        reconDrone: "정찰드론",
        kamikazeDrone: "자폭드론"
      };
      return labels[unitType] || unitType || "유닛";
    },
    adminSpawnInfantry(team, unitType, point) {
      const classId = unitType === "engineer" ? "engineer" : unitType === "scout" ? "scout" : "infantry";
      const weaponId = classId === "scout" ? "sniper" : classId === "engineer" ? "rifle" : "machinegun";
      const unit = new IronLine.InfantryUnit({
        x: point.x,
        y: point.y,
        team,
        callSign: `${team === TEAM.BLUE ? "B" : "R"}-ADM-INF-${this.infantry.length + 1}`,
        factionId: IronLine.factionVisuals?.factionIdForTeam?.(this, team),
        angle: angleTo(point.x, point.y, this.player.x, this.player.y),
        classId,
        weaponId,
        equipmentAmmo: {
          grenade: classId === "infantry" ? 3 : 1,
          rpg: classId === "engineer" ? 3 : 0,
          repairKit: classId === "engineer" ? 3 : 0,
          reconDrone: classId === "scout" ? 1 : 0
        },
        grenadeAmmo: classId === "infantry" ? 3 : 1,
        rpgAmmo: classId === "engineer" ? 3 : 0,
        repairKitAmmo: classId === "engineer" ? 3 : 0
      });
      unit.ai = new IronLine.InfantryAI(unit, this);
      this.infantry.push(unit);
      return unit;
    },
    adminSpawnTank(team, point) {
      const tank = new IronLine.Tank({
        x: point.x,
        y: point.y,
        team,
        callSign: `${team === TEAM.BLUE ? "B" : "R"}-ADM-TNK-${this.tanks.length + 1}`,
        factionId: IronLine.factionVisuals?.factionIdForTeam?.(this, team),
        angle: team === TEAM.BLUE ? 0 : Math.PI
      });
      tank.ai = new IronLine.TankAI(tank, this);
      this.tanks.push(tank);
      this.spawnCrewForTank(tank, {
        callSign: `${tank.callSign}-DRV`,
        boardImmediately: true
      });
      return tank;
    },
    adminSpawnHumvee(team, point) {
      const humvee = new IronLine.Humvee({
        x: point.x,
        y: point.y,
        team,
        callSign: `${team === TEAM.BLUE ? "B" : "R"}-ADM-HMV-${(this.humvees || []).length + 1}`,
        factionId: IronLine.factionVisuals?.factionIdForTeam?.(this, team),
        angle: team === TEAM.BLUE ? 0 : Math.PI
      });
      humvee.ai = new IronLine.HumveeAI(humvee, this);
      this.humvees.push(humvee);
      this.spawnCrewForTank(humvee, {
        callSign: `${humvee.callSign}-DRV`,
        role: "driver",
        boardImmediately: true
      });
      return humvee;
    },
    adminSpawnDrone(team, unitType, point, location = "mouse") {
      const attack = unitType === "kamikazeDrone";
      const weapon = {
        ...(attack ? INFANTRY_WEAPONS.kamikazeDrone : INFANTRY_WEAPONS.reconDrone),
        batteryLimit: false,
        maxControlRange: 2600
      };
      const owner = team === TEAM.BLUE ? this.player : null;
      const drone = attack
        ? new IronLine.SuicideDrone({
          x: point.x,
          y: point.y,
          angle: team === TEAM.BLUE ? 0 : Math.PI,
          team,
          owner,
          weapon,
          targetX: point.x,
          targetY: point.y,
          callSign: `${team === TEAM.BLUE ? "B" : "R"}-ADM-FPV-${this.drones.length + 1}`
        })
        : new IronLine.ReconDrone({
          x: point.x,
          y: point.y,
          angle: 0,
          team,
          owner,
          weapon,
          targetX: point.x,
          targetY: point.y,
          callSign: `${team === TEAM.BLUE ? "B" : "R"}-ADM-UAV-${this.drones.length + 1}`
        });

      drone.recallable = team === TEAM.BLUE;
      if (!attack && location === "roof") this.setReconDroneWaypoint(drone, point.x, point.y);
      else drone.setWaypoint?.(point.x, point.y);
      this.drones.push(drone);
      if (owner) owner.activeDrone = drone;
      return drone;
    }


  };

  function installGameAdminActions(Game) {
    Object.assign(Game.prototype, gameAdminActionMethods);
  }

  IronLine.installGameAdminActions = installGameAdminActions;
})(window);
