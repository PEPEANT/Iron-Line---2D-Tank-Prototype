"use strict";

(function registerSupplyCrates(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants || {};
  const { clamp, distXY } = IronLine.math || {};

  const HOLD_SECONDS = 0.9;
  const CRATE_SIZE = { w: 42, h: 28 };
  const CRATE_RADIUS = 46;

  function centerOfRect(item) {
    return {
      x: (Number(item?.x) || 0) + (Number(item?.w) || 0) * 0.5,
      y: (Number(item?.y) || 0) + (Number(item?.h) || 0) * 0.5
    };
  }

  function anchorPoint(world, team) {
    const key = team === TEAM?.RED ? "red" : "blue";
    return world?.baseExitPoints?.[key] ||
      (team === TEAM?.RED ? world?.spawns?.red?.[0] : world?.spawns?.player) ||
      { x: world?.width ? world.width * 0.5 : 0, y: world?.height ? world.height * 0.5 : 0 };
  }

  function objectiveAnchor(world) {
    const points = world?.capturePoints || [];
    if (!points.length) return { x: world?.width ? world.width * 0.5 : 0, y: world?.height ? world.height * 0.5 : 0 };
    return points[Math.floor(points.length / 2)] || points[0];
  }

  function crateRect(id, team, point, dx, dy) {
    return {
      id,
      type: "supply-crate",
      name: "보급상자",
      team,
      x: Math.round((Number(point.x) || 0) + dx - CRATE_SIZE.w * 0.5),
      y: Math.round((Number(point.y) || 0) + dy - CRATE_SIZE.h * 0.5),
      w: CRATE_SIZE.w,
      h: CRATE_SIZE.h,
      interactionRadius: CRATE_RADIUS,
      collision: true,
      cover: "light",
      blocksMovement: true,
      stopsProjectiles: true,
      stock: IronLine.supplyLoadout?.cloneStock?.(),
      systemGeneratedSupplyCrate: true,
      destroyed: false,
      damageFlash: 0,
      floatText: "",
      floatTimer: 0
    };
  }

  function defaultSupplyCrates(world) {
    const blue = anchorPoint(world, TEAM?.BLUE || "blue");
    const red = anchorPoint(world, TEAM?.RED || "red");
    const mid = objectiveAnchor(world);
    const maxX = Math.max(CRATE_SIZE.w, (world?.width || 0) - CRATE_SIZE.w);
    const maxY = Math.max(CRATE_SIZE.h, (world?.height || 0) - CRATE_SIZE.h);
    return [
      crateRect("supply-blue-base", TEAM?.BLUE || "blue", blue, -78, -64),
      crateRect("supply-red-base", TEAM?.RED || "red", red, 78, 64),
      crateRect("supply-mid-field", TEAM?.NEUTRAL || "neutral", mid, 0, -118)
    ].map((crate) => ({
      ...crate,
      x: clamp ? clamp(crate.x, 12, maxX) : crate.x,
      y: clamp ? clamp(crate.y, 12, maxY) : crate.y
    }));
  }

  function ensurePanel() {
    let panel = document.getElementById("supplyCratePanel");
    if (panel) return panel;

    panel = document.createElement("section");
    panel.id = "supplyCratePanel";
    panel.className = "supply-crate-panel hidden";
    panel.setAttribute("aria-label", "보급상자");
    panel.innerHTML = `
      <header>
        <strong data-supply-title>보급상자</strong>
        <button type="button" data-supply-close aria-label="닫기">&times;</button>
      </header>
      <div class="supply-crate-grid" data-supply-grid></div>
    `;
    panel.querySelector("[data-supply-close]")?.addEventListener("click", () => IronLine.game?.closeSupplyCratePanel?.());
    const shieldGamePointerEvent = (event) => event.stopPropagation();
    [
      "pointerdown",
      "pointerup",
      "mousedown",
      "mouseup",
      "click",
      "dblclick",
      "contextmenu"
    ].forEach((type) => panel.addEventListener(type, shieldGamePointerEvent));
    document.body.append(panel);
    return panel;
  }

  function installHudMobilePatch() {
    const Hud = IronLine.Hud;
    if (!Hud?.prototype || Hud.prototype.updateMobileControlsWithSupply) return;
    const base = Hud.prototype.updateMobileControls;
    Hud.prototype.updateMobileControls = function updateMobileControlsWithSupply(game) {
      const result = base?.call(this, game);
      const crate = game?.nearbySupplyCrate?.();
      const inTank = Boolean(game?.player?.inTank);
      const controlledDrone = Boolean(game?.player?.controlledDrone);
      const activeScreen = game && !game.entryOpen && !game.deploymentOpen && !game.lobbyOpen && !game.roomListOpen && !game.result;
      const canSupply = Boolean(crate && activeScreen && !inTank && !controlledDrone && !game.playerDeathActive && !game.playerDowned);
      if (canSupply) {
        this.nodes?.mobileControls?.classList.toggle("can-interact", true);
        if (this.nodes?.mobileInteractButton) {
          this.nodes.mobileInteractButton.textContent = "보급";
          this.nodes.mobileInteractButton.dataset.mobileKey = "KeyE";
          this.nodes.mobileInteractButton.setAttribute("aria-label", "보급상자 열기");
        }
      }
      return result;
    };
    Hud.prototype.updateMobileControlsWithSupply = true;
  }

  function installSupplyCrates(Game) {
    const proto = Game?.prototype;
    if (!proto) return;

    const baseSetupScenario = proto.setupScenario;
    proto.setupScenario = function setupScenarioWithSupplyCrates(...args) {
      const result = baseSetupScenario.call(this, ...args);
      this.ensureSupplyCrates?.({ resetStock: true });
      return result;
    };

    const baseActivateTestLab = proto.activateTestLab;
    if (baseActivateTestLab) {
      proto.activateTestLab = function activateTestLabWithSupplyCrates(...args) {
        const result = baseActivateTestLab.call(this, ...args);
        this.ensureSupplyCrates?.({ resetStock: true });
        return result;
      };
    }

    const baseUpdate = proto.update;
    proto.update = function updateWithSupplyCrates(dt) {
      if (this.supplyCrateUi?.open && this.input?.consumePress?.("Escape")) this.closeSupplyCratePanel();
      const result = baseUpdate.call(this, dt);
      this.updateSupplyCrateInteraction?.(dt);
      this.updateSupplyCrateFloatText?.(dt);
      return result;
    };

    Object.assign(proto, {
      ensureSupplyCrates(options = {}) {
        const world = this.world;
        if (!world) return [];
        const existingById = new Map((world.supplyCrates || []).map((crate) => [crate.id, crate]));
        const crates = defaultSupplyCrates(world).map((crate) => ({
          ...crate,
          stock: options.resetStock || !existingById.has(crate.id)
            ? IronLine.supplyLoadout?.cloneStock?.(crate.stock)
            : IronLine.supplyLoadout?.cloneStock?.(existingById.get(crate.id)?.stock)
        }));
        world.supplyCrates = crates;
        world.scenery = (world.scenery || []).filter((item) => !item.systemGeneratedSupplyCrate);
        world.scenery.push(...crates);
        this.supplyCrates = crates;
        return crates;
      },

      supplyCrateList() {
        if (!this.world?.supplyCrates?.length) this.ensureSupplyCrates?.();
        return this.world?.supplyCrates || [];
      },

      nearbySupplyCrate(maxDistance = null) {
        if (this.sessionMode === "online") return null;
        const player = this.player;
        if (!player || player.hp <= 0 || player.inTank || player.controlledDrone) return null;
        const crates = this.supplyCrateList();
        let best = null;
        let bestDistance = Infinity;
        for (const crate of crates) {
          if (!crate || crate.destroyed) continue;
          if (crate.team && crate.team !== TEAM?.NEUTRAL && crate.team !== player.team) continue;
          const center = centerOfRect(crate);
          const limit = maxDistance ?? (Number(crate.interactionRadius) || CRATE_RADIUS);
          const distance = distXY ? distXY(player.x, player.y, center.x, center.y) : Math.hypot(player.x - center.x, player.y - center.y);
          if (distance <= limit + player.radius && distance < bestDistance) {
            best = crate;
            bestDistance = distance;
          }
        }
        return best;
      },

      updateSupplyCrateInteraction(dt) {
        const active = this.matchStarted && !this.result && !this.deploymentOpen && !this.lobbyOpen && !this.entryOpen && !this.playerDeathActive && !this.playerDowned;
        if (!active || this.supplyCrateUi?.open) {
          this.resetSupplyCrateHold?.();
          return;
        }

        const crate = this.nearbySupplyCrate?.();
        const interactConsumed = Boolean(this.input?.wasConsumed?.("KeyE"));
        const holding = Boolean(crate && !interactConsumed && this.input?.keyDown?.("KeyE"));
        const moveX = this.input?.axis?.("KeyA", "ArrowLeft", "KeyD", "ArrowRight") || 0;
        const moveY = this.input?.axis?.("KeyW", "ArrowUp", "KeyS", "ArrowDown") || 0;
        if (!holding || Math.hypot(moveX, moveY) > 0.12) {
          this.resetSupplyCrateHold?.();
          return;
        }

        if (!this.supplyCrateHold || this.supplyCrateHold.crate !== crate) {
          this.supplyCrateHold = { crate, elapsed: 0, ratio: 0 };
        }
        this.supplyCrateHold.elapsed += dt;
        this.supplyCrateHold.ratio = clamp ? clamp(this.supplyCrateHold.elapsed / HOLD_SECONDS, 0, 1) : Math.min(1, this.supplyCrateHold.elapsed / HOLD_SECONDS);
        if (this.supplyCrateHold.elapsed >= HOLD_SECONDS) {
          this.openSupplyCratePanel(crate);
          this.resetSupplyCrateHold();
        }
      },

      resetSupplyCrateHold() {
        this.supplyCrateHold = null;
      },

      updateSupplyCrateFloatText(dt) {
        for (const crate of this.supplyCrateList?.() || []) {
          if (crate.floatTimer > 0) crate.floatTimer = Math.max(0, crate.floatTimer - dt);
        }
      },

      openSupplyCratePanel(crate) {
        if (!crate) return false;
        this.supplyCrateUi = { open: true, crateId: crate.id };
        this.renderSupplyCratePanel(crate);
        this.canvas?.focus?.();
        return true;
      },

      closeSupplyCratePanel() {
        this.supplyCrateUi = { open: false, crateId: "" };
        ensurePanel().classList.add("hidden");
        this.canvas?.focus?.();
      },

      currentSupplyCrate() {
        const id = this.supplyCrateUi?.crateId || "";
        return this.supplyCrateList?.().find((crate) => crate.id === id) || null;
      },

      renderSupplyCratePanel(crate = this.currentSupplyCrate()) {
        const panel = ensurePanel();
        if (!crate) {
          panel.classList.add("hidden");
          return;
        }
        panel.classList.remove("hidden");
        const title = panel.querySelector("[data-supply-title]");
        if (title) title.textContent = crate.name || "보급상자";
        const grid = panel.querySelector("[data-supply-grid]");
        if (!grid) return;
        grid.textContent = "";
        const bySlot = new Map();
        for (const item of IronLine.supplyLoadout?.itemList?.() || []) {
          if (!IronLine.constants?.INFANTRY_WEAPONS?.[item.weaponId]) continue;
          if (!bySlot.has(item.slotIndex)) bySlot.set(item.slotIndex, []);
          bySlot.get(item.slotIndex).push(item);
        }
        for (const slotIndex of [...bySlot.keys()].sort((a, b) => a - b)) {
          const section = document.createElement("div");
          section.className = "supply-crate-cat";
          const label = document.createElement("h4");
          label.innerHTML = `<span>${slotIndex + 1}</span>${IronLine.supplyLoadout?.slotRole?.(slotIndex) || ""}`;
          const items = document.createElement("div");
          items.className = "supply-crate-cat-grid";
          for (const item of bySlot.get(slotIndex)) {
            const weapon = IronLine.constants.INFANTRY_WEAPONS[item.weaponId];
            const stock = Math.max(0, Number(crate.stock?.[item.stockKey]) || 0);
            const button = document.createElement("button");
            button.type = "button";
            button.className = "supply-crate-item";
            button.dataset.supplyItem = item.id;
            button.disabled = stock <= 0;
            button.innerHTML = `
              <span class="supply-crate-item-art"><img src="assets/weapons/${item.weaponId}.png" alt=""></span>
              <strong>${weapon.name || weapon.shortName || item.weaponId}</strong>
              <b>${stock}</b>
            `;
            button.addEventListener("click", () => this.takeSupplyItem(crate, item.id));
            items.append(button);
          }
          section.append(label, items);
          grid.append(section);
        }
      },

      takeSupplyItem(crate, itemId) {
        const item = IronLine.supplyLoadout?.items?.[itemId];
        const stockKey = item?.stockKey || itemId;
        if (!crate?.stock || (crate.stock[stockKey] || 0) <= 0) return false;
        const result = IronLine.supplyLoadout?.applyItemToPlayer?.(this.player, itemId);
        if (!result?.ok) return false;
        crate.stock[stockKey] = Math.max(0, (Number(crate.stock[stockKey]) || 0) - 1);
        crate.floatText = `+ ${result.label}`;
        crate.floatTimer = 1.2;
        crate.damageFlash = Math.max(crate.damageFlash || 0, 0.34);
        this.player.rifleCooldown = Math.min(this.player.rifleCooldown || 0, 0.12);
        this.input?.consumeMousePress?.(0);
        this.input?.setMouseButton?.(0, false);
        this.renderSupplyCratePanel(crate);
        this.hud?.update?.(this);
        return true;
      }
    });
  }

  installHudMobilePatch();
  IronLine.installSupplyCrates = installSupplyCrates;
})(window);
