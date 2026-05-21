"use strict";

(function registerCommandRadioChannels(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants;
  const proto = IronLine.CommandRadio?.prototype;
  if (!proto) return;

  Object.assign(proto, {
    updateAuthority() {
      const root = this.nodes.commandAuthority;
      if (!root) return;
      root.hidden = true;
      root.textContent = "";
      root.dataset.signature = "";
    },

    updateAssets(game, slot) {
      const assets = this.nodes.commandAssets;
      if (!assets) return;
      const channelAssets = this.channelAssets(slot);
      const signature = JSON.stringify({
        channel: this.channel,
        slot: slot?.id || "",
        squads: channelAssets.squads,
        vehicles: channelAssets.vehicles,
        selectedSquads: Array.from(this.selectedSquads),
        selectedVehicles: Array.from(this.selectedVehicles),
        squadOrders: channelAssets.squads.map((id) => this.assetCommandLabel(game, "squad", id)),
        vehicleOrders: channelAssets.vehicles.map((id) => this.assetCommandLabel(game, "vehicle", id))
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

      for (const id of channelAssets.squads) addButton("squad", id, this.assetName(game, "squad", id));
      for (const id of channelAssets.vehicles) addButton("vehicle", id, this.assetName(game, "vehicle", id));
      if (!assets.childElementCount) {
        const empty = document.createElement("span");
        empty.textContent = this.channel === "armor" ? "배정된 기갑 자산 없음" : "배정된 분대 없음";
        assets.append(empty);
      }
    },

    updateMemory(game, slot) {
      const memory = this.nodes.commandMemory;
      if (!memory) return;
      const rows = this.commandMemoryRows(game, slot);
      const signature = JSON.stringify(rows);
      if (memory.dataset.signature === signature) return;
      memory.dataset.signature = signature;
      memory.textContent = "";

      if (!rows.length) {
        const empty = document.createElement("span");
        empty.className = "empty";
        empty.textContent = "현재 기억 중인 명령 없음";
        memory.append(empty);
      } else {
        for (const row of rows.slice(0, 4)) {
          const line = document.createElement("span");
          line.className = "ordered";
          line.textContent = row;
          memory.append(line);
        }
      }
      this.nodes.commandRadioToggle?.classList.toggle("has-orders", rows.length > 0);
      this.nodes.commandRadioToggle?.setAttribute("title", rows.length ? rows[0] : "무전기 열기");
    },

    commandMemoryRows(game, slot) {
      const assets = this.channelAssets(slot);
      const rows = [];
      for (const id of assets.squads) {
        const order = this.assetCommandLabel(game, "squad", id);
        if (order) rows.push(`${this.assetName(game, "squad", id)} → ${order}`);
      }
      for (const id of assets.vehicles) {
        const order = this.assetCommandLabel(game, "vehicle", id);
        if (order) rows.push(`${this.assetName(game, "vehicle", id)} → ${order}`);
      }
      return rows;
    },

    selectedAssetSummary(game, slot) {
      const assets = this.channelAssets(slot);
      const selectedSquads = assets.squads.filter((id) => this.selectedSquads.has(id));
      const selectedVehicles = assets.vehicles.filter((id) => this.selectedVehicles.has(id));
      const supportSquads = this.channel === "armor" ? (slot?.squadIds || []) : selectedSquads;
      const infantry = supportSquads
        .map((id) => game?.squadById?.(id))
        .reduce((sum, squad) => sum + (squad?.activeUnits?.().length || 0), 0);
      const leaders = selectedSquads
        .map((id) => game?.squadById?.(id))
        .filter((squad) => squad?.leaderUnit?.()).length;
      if (this.channel === "armor") {
        if (!selectedVehicles.length) return "선택한 기갑 없음";
        return `기갑조 · 전차 ${selectedVehicles.length} / 보병 ${infantry}`;
      }
      if (!selectedSquads.length) return "선택한 분대 없음";
      return `보병 분대 · 분대장 ${leaders} / 보병 ${infantry}`;
    },

    updateLog(game) {
      const log = this.nodes.commandLog;
      if (!log) return;
      const entries = (game.commandBus?.log || []).slice(-3).reverse();
      const signature = JSON.stringify(entries.map((entry) => `${entry.packet?.id || ""}:${entry.accepted}:${entry.reason || ""}`));
      if (log.dataset.signature === signature) return;
      log.dataset.signature = signature;
      log.textContent = "";
      for (const entry of entries) {
        const line = document.createElement("span");
        line.textContent = this.commandLogLine(game, entry);
        line.classList.toggle("rejected", !entry.accepted);
        log.append(line);
      }
    },

    assetName(game, kind, id) {
      return kind === "vehicle" ? this.vehicleDisplayName(game, id) : this.squadDisplayName(game, id);
    },

    squadDisplayName(game, id) {
      const squad = game?.squadById?.(id);
      const slot = game?.sessionSlotById?.(squad?.ownerSlotId || "");
      const role = this.roleAssetLabel(slot?.roleId || "infantry");
      const ids = slot?.squadIds?.length ? slot.squadIds : [id];
      const index = Math.max(1, ids.indexOf(id) + 1);
      const count = squad?.activeUnits?.().length || squad?.units?.filter((unit) => unit.alive)?.length || 0;
      return `${role} ${count}명 · ${index}분대`;
    },

    vehicleDisplayName(game, id) {
      const vehicle = game?.vehicleById?.(id);
      const slot = game?.sessionSlotById?.(vehicle?.ownerSlotId || "blue-armor");
      const ids = slot?.vehicleIds?.length ? slot.vehicleIds : [id];
      const index = Math.max(1, ids.indexOf(id) + 1);
      return `기갑 ${index}호차`;
    },

    slotDisplayName(game, slotId = "") {
      const slot = game?.sessionSlotById?.(slotId);
      if (!slot) return slotId || "-";
      const team = slot.team === TEAM.RED ? "홍팀" : "청팀";
      return `${team} ${this.roleAssetLabel(slot.roleId)}`;
    },

    slotAuthorityLabel(game, slot, owner = "") {
      if (game?.canCommandSlot?.(slot, game.onlineSession?.playerId)) {
        if (slot.commandAuthoritySource === "succession") return "승계 지휘";
        if (slot.commandAuthoritySource === "claimed") return "인수 지휘";
        if (slot.playerId === game.onlineSession?.playerId) return "내 분대";
        return "위임 지휘";
      }
      if (slot.commandRequest?.requesterId === game.onlineSession?.playerId) return "요청 중";
      if (owner) return `${owner} 지휘`;
      return slot.playerId ? "분대장 지휘" : "AI 대기";
    },

    authorityActionFor(game, slot, localId = "") {
      if (!game || !slot || !localId) return null;
      const active = game.canCommandSlot?.(slot, localId);
      const request = slot.commandRequest;
      if (request && slot.playerId === localId) {
        return {
          label: "승인",
          run: () => game.approveCommandAuthority?.(slot.id)
        };
      }
      if (active && slot.playerId !== localId) {
        return {
          label: "해제",
          run: () => game.releaseCommandAuthority?.(slot.id)
        };
      }
      if (!active && !slot.playerId) {
        return {
          label: "인수",
          run: () => game.requestCommandAuthority?.(slot.id)
        };
      }
      if (!active && slot.playerId !== localId) {
        return {
          label: request?.requesterId === localId ? "요청중" : "요청",
          disabled: request?.requesterId === localId,
          run: () => game.requestCommandAuthority?.(slot.id)
        };
      }
      return null;
    },

    commandLogLine(game, entry) {
      const packet = entry.packet || {};
      const assets = [
        ...(packet.targetSquadIds || []).map((id) => this.assetName(game, "squad", id)),
        ...(packet.targetVehicleIds || []).map((id) => this.assetName(game, "vehicle", id))
      ];
      const target = packet.objectiveName || (packet.targetPoint ? "좌표" : "");
      const status = entry.accepted ? "승인" : `거절:${this.commandRejectLabel(entry.reason)}`;
      const assetText = assets.length ? assets.slice(0, 2).join(" · ") : this.slotDisplayName(game, packet.slotId);
      return `${status} ${this.commandLabel(packet.type)} ${assetText}${target ? ` → ${target}` : ""}`;
    },

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
    },

    channelLabel(channel = "infantry") {
      if (channel === "infantry") return "보병";
      if (channel === "armor") return "기갑";
      return "보병";
    },

    roleAssetLabel(roleId = "") {
      if (roleId === "engineer") return "공병";
      if (roleId === "recon") return "정찰";
      if (roleId === "armor") return "기갑";
      return "보병";
    },

    commandLabel(type) {
      if (type === "attack") return "공격";
      if (type === "defend") return "방어";
      if (type === "rally") return "집결";
      if (type === "close") return "닫기";
      if (type === "cancel") return "취소";
      if (type === "assault") return "돌격";
      if (type === "repair") return "수리";
      if (type === "scan") return "정찰";
      if (type === "fire_support") return "화력지원";
      if (type === "retreat") return "후퇴";
      return "이동";
    },

    commandRejectLabel(reason) {
      if (reason === "role-command-restricted") return "역할 권한 없음";
      if (reason === "vehicle-role-restricted") return "기갑 권한 없음";
      if (reason === "missing-slot") return "슬롯 없음";
      if (reason === "team-mismatch") return "팀 불일치";
      if (reason === "no-assets") return "선택 자산 없음";
      if (reason === "missing-point") return "목표 없음";
      if (reason === "unknown-command") return "알 수 없는 명령";
      if (reason === "cooldown") return "대기";
      return reason || "오류";
    }
  });
})(window);
