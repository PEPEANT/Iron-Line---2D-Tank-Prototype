"use strict";

(function registerCommandRadio(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants;

  class CommandRadio {
    constructor(hud) {
      this.hud = hud;
      this.selectedType = "move";
      this.selectedSquads = new Set();
      this.selectedVehicles = new Set();
      this.statusMessage = "";
      this.statusUntil = 0;
      this.open = false;
      this.needsObjective = false;
    }

    get nodes() {
      return this.hud.nodes;
    }

    ensure() {
      const ui = this.nodes;
      if (!ui || ui.commandPanel) return;

      const toggle = document.createElement("button");
      toggle.id = "commandRadioToggle";
      toggle.type = "button";
      toggle.className = "command-radio-toggle hidden";
      toggle.textContent = "무전";
      toggle.setAttribute("aria-label", "무전기 열기");
      toggle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.toggle();
      });

      const panel = document.createElement("section");
      panel.id = "commandPanel";
      panel.className = "command-panel hidden";
      panel.setAttribute("aria-label", "분대 무전기");

      const head = document.createElement("div");
      head.className = "command-head";
      const role = document.createElement("strong");
      role.id = "commandRole";
      role.textContent = "분대 무전";
      const status = document.createElement("span");
      status.id = "commandStatus";
      status.textContent = "명령 대기";
      head.append(role, status);

      const assets = document.createElement("div");
      assets.id = "commandAssets";
      assets.className = "command-assets";

      const buttons = document.createElement("div");
      buttons.className = "command-buttons";
      const commands = [
        ["move", "이동"],
        ["attack", "공격"],
        ["defend", "방어"],
        ["rally", "집결"],
        ["cancel", "취소"]
      ];
      for (const [type, label] of commands) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.commandType = type;
        button.textContent = label;
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          this.selectType(type);
        });
        buttons.append(button);
      }

      const specials = document.createElement("div");
      specials.id = "commandSpecials";
      specials.className = "command-specials hidden";

      const map = document.createElement("div");
      map.id = "commandMap";
      map.className = "deployment-map command-tactical-map hidden";
      map.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.issueFromMap();
      });

      const log = document.createElement("div");
      log.id = "commandLog";
      log.className = "command-log";

      panel.append(head, assets, buttons, log);
      panel.addEventListener("pointerdown", (event) => event.stopPropagation());
      panel.addEventListener("mousedown", (event) => event.stopPropagation());
      panel.addEventListener("click", (event) => event.stopPropagation());
      document.body.append(toggle, panel, map);

      ui.commandPanel = panel;
      ui.commandRadioToggle = toggle;
      ui.commandRole = role;
      ui.commandStatus = status;
      ui.commandAssets = assets;
      ui.commandButtons = Array.from(buttons.querySelectorAll("[data-command-type]"));
      ui.commandSpecials = specials;
      ui.commandMap = map;
      ui.commandLog = log;
    }

    toggle(forceOpen = null) {
      const nextOpen = forceOpen === null ? !this.open : Boolean(forceOpen);
      this.open = nextOpen;
      if (!nextOpen) this.clearObjectivePick();
      const game = IronLine.game;
      if (game) this.update(game);
    }

    clearObjectivePick() {
      this.needsObjective = false;
      const map = this.nodes.commandMap;
      if (!map) return;
      map.classList.add("hidden");
      map.dataset.commandMode = "";
    }

    update(game) {
      this.ensure();
      const ui = this.nodes;
      if (!ui.commandPanel) return;

      const visible = Boolean(game.matchStarted && !game.deploymentOpen && !game.lobbyOpen && !game.result && !game.playerDeathActive);
      ui.commandRadioToggle?.classList.toggle("hidden", !visible);
      ui.commandMap?.classList.toggle("hidden", true);
      if (!visible) {
        ui.commandPanel.classList.add("hidden");
        this.open = false;
        return;
      }

      ui.commandPanel.classList.toggle("hidden", !this.open);
      ui.commandRadioToggle?.classList.toggle("active", this.open);

      const player = game.localSessionPlayer?.();
      const slot = player ? game.sessionSlotById?.(player.slotId) : null;
      this.syncSelection(slot);
      if (slot && !(game.commandBus?.isTypeAllowedForSlot?.(slot, this.selectedType) ?? true)) {
        const fallback = ui.commandButtons?.find((button) => (
          game.commandBus?.isTypeAllowedForSlot?.(slot, button.dataset.commandType) ?? true
        ))?.dataset.commandType || "move";
        this.selectedType = fallback;
      }

      if (ui.commandRole) {
        const team = slot?.team === TEAM.RED ? "홍팀" : "청팀";
        ui.commandRole.textContent = slot ? `${team} ${slot.label}` : "분대 무전";
      }
      if (ui.commandStatus) {
        const label = this.commandLabel(this.selectedType);
        const cooldown = game.commandBus?.cooldownRemainingForSlot?.(slot, this.selectedType) || 0;
        const objectiveMode = this.selectedType === "attack" || this.selectedType === "defend";
        const defaultStatus = ["cancel", "move", "rally"].includes(this.selectedType)
          ? `${label}: 버튼으로 즉시 실행`
          : cooldown > 0
            ? `명령 대기 ${cooldown.toFixed(1)}초`
            : objectiveMode
              ? `${label}: 오른쪽 전술지도에서 거점 선택`
              : "명령 대기";
        ui.commandStatus.textContent = performance.now() < this.statusUntil ? this.statusMessage : defaultStatus;
      }

      ui.commandButtons?.forEach((button) => {
        const allowed = game.commandBus?.isTypeAllowedForSlot?.(slot, button.dataset.commandType) ?? true;
        button.disabled = !allowed;
        button.title = allowed ? "" : "현재 역할 권한 없음";
        button.classList.toggle("active", allowed && button.dataset.commandType === this.selectedType);
      });

      this.updateAssets(game, slot);
      const showMap = this.open && (this.selectedType === "attack" || this.selectedType === "defend");
      ui.commandMap?.classList.toggle("hidden", !showMap);
      if (ui.commandMap) {
        ui.commandMap.dataset.commandMode = showMap ? this.selectedType : "";
        ui.commandMap.setAttribute(
          "aria-label",
          this.selectedType === "attack" ? "공격할 거점 선택" : "방어할 거점 선택"
        );
      }
      if (showMap) this.hud.buildMapMarkers(game, ui.commandMap);
      this.updateLog(game);
    }

    syncSelection(slot) {
      const squadIds = new Set(slot?.squadIds || []);
      const vehicleIds = new Set(slot?.vehicleIds || []);
      for (const id of Array.from(this.selectedSquads)) {
        if (!squadIds.has(id)) this.selectedSquads.delete(id);
      }
      for (const id of Array.from(this.selectedVehicles)) {
        if (!vehicleIds.has(id)) this.selectedVehicles.delete(id);
      }
      if (this.selectedSquads.size > 0 || this.selectedVehicles.size > 0) return;
      for (const id of squadIds) this.selectedSquads.add(id);
      for (const id of vehicleIds) this.selectedVehicles.add(id);
    }

    updateAssets(game, slot) {
      const assets = this.nodes.commandAssets;
      if (!assets) return;
      const signature = JSON.stringify({
        slot: slot?.id || "",
        squads: slot?.squadIds || [],
        vehicles: slot?.vehicleIds || [],
        selectedSquads: Array.from(this.selectedSquads),
        selectedVehicles: Array.from(this.selectedVehicles),
        squadOrders: (slot?.squadIds || []).map((id) => this.assetCommandLabel(game, "squad", id)),
        vehicleOrders: (slot?.vehicleIds || []).map((id) => this.assetCommandLabel(game, "vehicle", id))
      });
      if (assets.dataset.signature === signature) return;
      assets.dataset.signature = signature;
      assets.textContent = "";

      const addButton = (kind, id, label) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.assetKind = kind;
        button.dataset.assetId = id;
        const commandLabel = this.assetCommandLabel(game, kind, id);
        button.textContent = commandLabel ? `${label} · ${commandLabel}` : label;
        const selected = kind === "squad" ? this.selectedSquads.has(id) : this.selectedVehicles.has(id);
        button.classList.toggle("active", selected);
        button.classList.toggle("ordered", Boolean(commandLabel));
        button.title = commandLabel ? `현재 명령: ${commandLabel}` : "명령 없음";
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          this.toggleAsset(kind, id);
        });
        assets.append(button);
      };

      for (const id of slot?.squadIds || []) addButton("squad", id, `분대 ${id}`);
      for (const id of slot?.vehicleIds || []) addButton("vehicle", id, `차량 ${id}`);
      if (!assets.childElementCount) {
        const empty = document.createElement("span");
        empty.textContent = "배정 자산 없음";
        assets.append(empty);
      }
    }

    toggleAsset(kind, id) {
      const set = kind === "vehicle" ? this.selectedVehicles : this.selectedSquads;
      if (set.has(id)) set.delete(id);
      else set.add(id);
      const game = IronLine.game;
      const slot = game?.sessionSlotById?.(game.localSessionPlayer?.()?.slotId);
      this.syncSelection(slot);
      if (this.nodes.commandAssets) this.nodes.commandAssets.dataset.signature = "";
      if (game) this.update(game);
    }

    selectType(type) {
      const game = IronLine.game;
      const slot = game?.sessionSlotById?.(game.localSessionPlayer?.()?.slotId);
      if (game?.commandBus && !game.commandBus.isTypeAllowedForSlot(slot, type)) {
        this.statusMessage = "현재 역할은 이 명령 권한이 없습니다";
        this.statusUntil = performance.now() + 1600;
        this.update(game);
        return;
      }
      this.selectedType = type;
      if (["move", "rally", "cancel"].includes(type) && game) {
        const point = this.immediateCommandPoint(game, type);
        const result = this.submitCurrentCommand(game, point, "", {
          followPlayer: type === "move"
        });
        this.showCommandResult(result);
        if (result?.accepted) {
          this.selectedType = "move";
          if (this.nodes.commandAssets) this.nodes.commandAssets.dataset.signature = "";
          this.update(game);
        }
      } else if (game) {
        this.needsObjective = type === "attack" || type === "defend";
        this.update(game);
      }
    }

    immediateCommandPoint(game, type) {
      if (!game?.player) return null;
      const offset = type === "rally" ? 80 : 0;
      return {
        x: game.player.x + Math.cos(game.player.angle || 0) * offset,
        y: game.player.y + Math.sin(game.player.angle || 0) * offset
      };
    }

    issueFromMap() {
      const game = IronLine.game;
      if (!game || (this.selectedType !== "attack" && this.selectedType !== "defend")) return;
      this.statusMessage = this.selectedType === "attack"
        ? "공격할 거점을 선택하세요"
        : "방어할 거점을 선택하세요";
      this.statusUntil = performance.now() + 1400;
      this.update(game);
    }

    submitCurrentCommand(game, point, objectiveName = "", extra = {}) {
      const slot = game.sessionSlotById?.(game.localSessionPlayer?.()?.slotId);
      const allSquads = new Set(slot?.squadIds || []);
      const allVehicles = new Set(slot?.vehicleIds || []);
      const targetSquadIds = Array.from(this.selectedSquads).filter((id) => allSquads.has(id));
      const targetVehicleIds = Array.from(this.selectedVehicles).filter((id) => allVehicles.has(id));
      return game.submitLocalCommand?.(this.selectedType, {
        ...extra,
        objectiveName,
        targetPoint: point,
        targetSquadIds,
        targetVehicleIds
      });
    }

    showCommandResult(result) {
      const status = this.nodes.commandStatus;
      if (!status) return;
      if (result?.accepted) {
        this.needsObjective = false;
        const squads = result.squadIds?.length || 0;
        const vehicles = result.vehicleIds?.length || 0;
        this.statusMessage = result.cancelled
          ? `명령 취소 · 분대 ${squads} / 차량 ${vehicles}`
          : `명령 전송 · 분대 ${squads} / 차량 ${vehicles}`;
      } else {
        const wait = Number.isFinite(result?.cooldownRemaining) ? ` ${result.cooldownRemaining.toFixed(1)}초` : "";
        this.statusMessage = `명령 실패 · ${this.commandRejectLabel(result?.reason)}${wait}`;
      }
      this.statusUntil = performance.now() + 1800;
      status.textContent = this.statusMessage;
      if (this.nodes.commandLog) this.nodes.commandLog.dataset.signature = "";
      if (IronLine.game) this.updateLog(IronLine.game);
    }

    handleObjectiveAccepted(game) {
      this.selectedType = "move";
      this.needsObjective = false;
      this.clearObjectivePick();
      this.update(game);
    }

    updateLog(game) {
      const log = this.nodes.commandLog;
      if (!log) return;
      const entries = (game.commandBus?.log || []).slice(-3).reverse();
      const signature = JSON.stringify(entries.map((entry) => entry.summary));
      if (log.dataset.signature === signature) return;
      log.dataset.signature = signature;
      log.textContent = "";
      for (const entry of entries) {
        const line = document.createElement("span");
        line.textContent = entry.summary;
        line.classList.toggle("rejected", !entry.accepted);
        log.append(line);
      }
    }

    commandLabel(type) {
      if (type === "attack") return "공격";
      if (type === "defend") return "방어";
      if (type === "rally") return "집결";
      if (type === "cancel") return "취소";
      if (type === "assault") return "돌격";
      if (type === "repair") return "수리";
      if (type === "scan") return "정찰";
      if (type === "fire_support") return "화력지원";
      if (type === "retreat") return "후퇴";
      return "이동";
    }

    assetCommandLabel(game, kind, id) {
      if (!game || !id) return "";
      if (kind === "squad") {
        const squad = game.squadById?.(id);
        if (!squad?.manualOrder) return "";
        const objective = squad.order?.objectiveName || squad.order?.point?.name || "";
        return `${this.commandLabel(squad.manualOrder.type)}${objective ? ` ${objective}` : ""}`;
      }
      const vehicle = game.vehicleById?.(id);
      if (!vehicle?.manualOrder) return "";
      const order = game.commanders?.[vehicle.team]?.assignments?.get(vehicle);
      const objective = order?.objectiveName || order?.point?.name || "";
      return `${this.commandLabel(vehicle.manualOrder.type)}${objective ? ` ${objective}` : ""}`;
    }

    commandRejectLabel(reason) {
      if (reason === "role-command-restricted") return "역할 권한 없음";
      if (reason === "vehicle-role-restricted") return "차량 권한 없음";
      if (reason === "missing-slot") return "슬롯 없음";
      if (reason === "team-mismatch") return "팀 불일치";
      if (reason === "no-assets") return "선택 자산 없음";
      if (reason === "missing-point") return "목표 없음";
      if (reason === "unknown-command") return "알 수 없는 명령";
      if (reason === "cooldown") return "대기";
      return reason || "오류";
    }
  }

  IronLine.CommandRadio = CommandRadio;
})(window);
