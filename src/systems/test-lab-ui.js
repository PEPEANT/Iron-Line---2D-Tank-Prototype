"use strict";

(function registerTestLabUI(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  const TAB_META = {
    infantry: { label: "보병" },
    vehicle: { label: "차량" },
    object: { label: "오브젝트" }
  };

  const CLASS_CARDS = [
    { classId: "engineer", weaponId: "machinegun", label: "공병", sub: "대전차/수리" },
    { classId: "scout", weaponId: "sniper", label: "정찰병", sub: "저격/감시" }
  ];

  const VEHICLE_CARDS = [
    { id: "tank", label: "전차", sub: "승무원 자동 탑승" },
    { id: "humvee", label: "험비", sub: "기관총 차량" },
    { id: "recon-drone", label: "정찰드론", sub: "플레이어 드론" }
  ];

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
  }

  function countAlive(list) {
    return (list || []).filter((item) => item?.alive !== false).length;
  }

  function buildInfantryCards() {
    const weapons = IronLine.constants?.INFANTRY_WEAPONS || {};
    const playable = IronLine.constants?.PLAYABLE_INFANTRY_WEAPON_IDS || ["rifle", "smg", "lmg", "machinegun", "pistol", "sniper", "rpg", "grenadeLauncher", "reconDrone", "kamikazeDrone", "repairKit", "grenade"];
    const cards = playable
      .map((weaponId) => weapons[weaponId])
      .filter((weapon) => weapon?.id)
      .map((weapon) => ({
        id: `inf-${weapon.id}`,
        tab: "infantry",
        kind: "infantry",
        weaponId: weapon.id,
        classId: ["rpg", "grenadeLauncher", "repairKit"].includes(weapon.id) ? "engineer" : weapon.id === "sniper" || weapon.type === "drone" ? "scout" : "infantry",
        label: weapon.name || weapon.id,
        sub: `사거리 ${Math.round(weapon.range || 0)}`
      }));
    for (const preset of CLASS_CARDS) {
      cards.push({
        id: `inf-class-${preset.classId}`,
        tab: "infantry",
        kind: "infantry",
        weaponId: preset.weaponId,
        classId: preset.classId,
        label: preset.label,
        sub: preset.sub
      });
    }
    return cards;
  }

  function buildVehicleCards() {
    return VEHICLE_CARDS.map((vehicle) => ({
      id: `veh-${vehicle.id}`,
      tab: "vehicle",
      kind: vehicle.id,
      label: vehicle.label,
      sub: vehicle.sub
    }));
  }

  function buildObjectCards() {
    const catalog = IronLine.sceneryCatalog?.obstacleKinds || [];
    const cards = [];
    for (const item of catalog) {
      const variants = item.variants?.length ? item.variants : [["", item.label || item.kind]];
      for (const [variantId, variantLabel] of variants) {
        cards.push({
          id: `obj-${item.kind}-${variantId || "default"}`,
          tab: "object",
          kind: "object",
          objectKind: item.kind,
          variant: variantId,
          label: variantLabel || item.label || item.kind,
          sub: item.label || item.kind,
          size: IronLine.sceneryCatalog?.defaultSize?.(item.kind) || item.defaultSize || { w: 160, h: 60 },
          destructible: Boolean(item.destructible)
        });
      }
    }
    return cards;
  }

  class TestLabUI {
    constructor(game) {
      this.game = game;
      this.root = null;
      this.ghost = null;
      this.bound = false;
      this.collapsed = window.innerWidth <= 1100;
      this.tab = "infantry";
      this.team = IronLine.constants?.TEAM?.RED || "red";
      this.placement = null;
      this.cards = [...buildInfantryCards(), ...buildVehicleCards(), ...buildObjectCards()];
      this.spawnSerial = 0;
      this.placedObjectSerial = 0;
      this.counterSignature = "";
      this.ensure();
      this.bindPlacementInput();
      this.root?.classList.toggle("hidden", !game?.testLab);
    }

    // main.js에서 모드 문자열을 넘기지만 샌드박스는 단일 모드라 무시한다.
    setMode() {}

    cardById(id) {
      return this.cards.find((card) => card.id === id) || null;
    }

    ensure() {
      if (this.root || typeof document === "undefined") return;
      this.root = document.createElement("section");
      this.root.className = "test-lab-panel";
      this.root.setAttribute("aria-label", "샌드박스 실험장 패널");
      document.body.append(this.root);
      this.ghost = document.createElement("div");
      this.ghost.className = "test-lab-ghost hidden";
      document.body.append(this.ghost);
      this.render();
      this.bind();
    }

    bind() {
      if (this.bound || !this.root) return;
      this.bound = true;
      this.root.addEventListener("click", (event) => this.onClick(event));
    }

    bindPlacementInput() {
      const canvas = this.game?.canvas;
      if (!canvas || this.placementBound) return;
      this.placementBound = true;
      canvas.addEventListener("mousedown", (event) => this.onCanvasMouseDown(event), true);
      window.addEventListener("mousemove", (event) => this.onWindowMouseMove(event));
      window.addEventListener("keydown", (event) => {
        if (event.code === "Escape" && this.placement) {
          event.stopPropagation();
          this.cancelPlacement();
        }
      }, true);
    }

    onCanvasMouseDown(event) {
      if (!this.placement || !this.game?.testLab) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.button === 2) {
        this.cancelPlacement();
        return;
      }
      if (event.button !== 0) return;
      const camera = this.game.camera || { x: 0, y: 0, zoom: 1 };
      const zoom = camera.zoom || 1;
      const worldX = event.clientX / zoom + camera.x;
      const worldY = event.clientY / zoom + camera.y;
      this.placeAt(worldX, worldY);
    }

    onWindowMouseMove(event) {
      if (!this.ghost || this.ghost.classList.contains("hidden")) return;
      this.ghost.style.left = `${event.clientX + 16}px`;
      this.ghost.style.top = `${event.clientY + 18}px`;
    }

    onClick(event) {
      const tabButton = event.target.closest("[data-lab-tab]");
      if (tabButton) {
        this.tab = tabButton.getAttribute("data-lab-tab") || "infantry";
        this.render();
        return;
      }
      const teamButton = event.target.closest("[data-lab-team]");
      if (teamButton) {
        this.team = teamButton.getAttribute("data-lab-team") || "red";
        if (this.placement) this.updateGhost();
        this.render();
        return;
      }
      const cardButton = event.target.closest("[data-lab-card]");
      if (cardButton) {
        this.toggleCard(cardButton.getAttribute("data-lab-card"));
        return;
      }
      const actionButton = event.target.closest("[data-lab-action]");
      if (!actionButton) return;
      event.preventDefault();
      this.handleAction(actionButton.getAttribute("data-lab-action"));
    }

    handleAction(action) {
      const game = this.game;
      if (!game) return;
      if (action === "toggle-panel") {
        this.collapsed = !this.collapsed;
        this.updatePanelState();
        return;
      }
      if (action === "toggle-ai") game.testLabAiPaused = !game.testLabAiPaused;
      if (action === "refill") {
        game.refillTestLabPlayer?.();
      }
      if (action === "clear-all") this.clearSandbox();
      if (action === "open-admin") {
        window.location.href = "admin.html";
        return;
      }
      if (action === "exit-lab") {
        window.location.href = "index.html";
        return;
      }
      game.canvas?.focus?.();
      this.updateDynamic(true);
    }

    toggleCard(cardId) {
      const card = this.cardById(cardId);
      if (!card) return;
      if (this.placement?.id === card.id) {
        this.cancelPlacement();
        return;
      }
      this.placement = card;
      document.body.classList.add("test-lab-placing");
      this.updateGhost();
      this.updateCardSelection();
      this.game?.canvas?.focus?.();
    }

    cancelPlacement() {
      this.placement = null;
      document.body.classList.remove("test-lab-placing");
      this.ghost?.classList.add("hidden");
      this.updateCardSelection();
    }

    updateGhost() {
      if (!this.ghost || !this.placement) return;
      const isObject = this.placement.kind === "object";
      const teamLabel = this.team === "blue" ? "청팀" : "홍팀";
      this.ghost.innerHTML = `
        <strong>${escapeHtml(this.placement.label)}</strong>
        <span>${isObject ? "오브젝트" : escapeHtml(teamLabel)} · 클릭 배치</span>
      `;
      this.ghost.classList.toggle("is-blue", !isObject && this.team === "blue");
      this.ghost.classList.toggle("is-red", !isObject && this.team !== "blue");
      this.ghost.classList.remove("hidden");
    }

    updateCardSelection() {
      if (!this.root) return;
      for (const button of this.root.querySelectorAll("[data-lab-card]")) {
        button.classList.toggle("is-active", this.placement?.id === button.getAttribute("data-lab-card"));
      }
      const hint = this.root.querySelector("[data-lab-hint]");
      if (hint) {
        hint.textContent = this.placement
          ? `${this.placement.label} 배치 중 · 맵 클릭 배치 · 우클릭/ESC 취소`
          : "카드를 고르고 맵을 클릭해 배치하세요. F1 보병 · F2 전차 · F3 험비 · F4 AI";
      }
    }

    placeAt(x, y) {
      const game = this.game;
      const card = this.placement;
      if (!game || !card) return;
      const worldX = clamp(x, 90, (game.world?.width || 4200) - 90);
      const worldY = clamp(y, 90, (game.world?.height || 3400) - 90);
      if (card.kind === "infantry") this.spawnInfantryAt(card, worldX, worldY);
      if (card.kind === "tank") this.spawnTankAt(worldX, worldY);
      if (card.kind === "humvee") this.spawnHumveeAt(worldX, worldY);
      if (card.kind === "recon-drone") this.spawnReconDroneAt(worldX, worldY);
      if (card.kind === "object") this.placeObjectAt(card, worldX, worldY);
      this.updateDynamic(true);
    }

    spawnFactionId() {
      return IronLine.factionVisuals?.factionIdForTeam?.(this.game, this.team) || undefined;
    }

    spawnInfantryAt(card, x, y) {
      if (!IronLine.InfantryUnit) return;
      const serial = ++this.spawnSerial;
      const unit = new IronLine.InfantryUnit({
        x,
        y,
        team: this.team,
        weaponId: card.weaponId,
        classId: card.classId,
        callSign: `실험보병-${serial}`,
        factionId: this.spawnFactionId(),
        angle: 0,
        equipmentAmmo: card.classId === "engineer"
          ? { grenade: 2, rpg: 2 }
          : { grenade: 3 }
      });
      if (IronLine.InfantryAI) unit.ai = new IronLine.InfantryAI(unit, this.game);
      this.game.infantry.push(unit);
    }

    spawnTankAt(x, y) {
      if (!IronLine.Tank) return;
      const serial = ++this.spawnSerial;
      const tank = new IronLine.Tank({
        x,
        y,
        team: this.team,
        callSign: `실험전차-${serial}`,
        factionId: this.spawnFactionId(),
        angle: 0,
        maxHp: 110
      });
      if (IronLine.TankAI) tank.ai = new IronLine.TankAI(tank, this.game);
      this.game.tanks.push(tank);
      this.game.spawnCrewForTank?.(tank, {
        callSign: `${tank.callSign}-승무원`,
        boardImmediately: true
      });
    }

    spawnHumveeAt(x, y) {
      if (!IronLine.Humvee) return;
      const serial = ++this.spawnSerial;
      const humvee = new IronLine.Humvee({
        x,
        y,
        team: this.team,
        callSign: `실험험비-${serial}`,
        factionId: this.spawnFactionId(),
        angle: 0,
        maxHp: 68
      });
      if (IronLine.HumveeAI) humvee.ai = new IronLine.HumveeAI(humvee, this.game);
      this.game.humvees.push(humvee);
      this.game.spawnCrewForTank?.(humvee, {
        callSign: `${humvee.callSign}-승무원`,
        role: "driver",
        boardImmediately: true
      });
    }

    spawnReconDroneAt(x, y) {
      const game = this.game;
      const drone = game.spawnTestLabReconDrone?.();
      if (!drone) return;
      drone.setPosition?.(x, y, game);
      drone.x = x;
      drone.y = y;
      game.setReconDroneWaypoint?.(drone, x, y);
    }

    placeObjectAt(card, x, y) {
      const world = this.game?.world;
      if (!world) return;
      const size = card.size || { w: 160, h: 60 };
      const id = `lab-place-${Date.now().toString(36)}-${this.placedObjectSerial++}`;
      const hp = card.objectKind === "tree" ? 35 : card.objectKind === "rubble" ? 24 : 30;
      const fixedObstacle = ["building", "base-wall", "concrete"].includes(card.objectKind);
      if (fixedObstacle) {
        world.obstacles.push({
          id,
          x: x - size.w * 0.5,
          y: y - size.h * 0.5,
          w: size.w,
          h: size.h,
          kind: card.objectKind,
          variant: card.variant,
          angle: 0
        });
        return;
      }
      world.scenery = world.scenery || [];
      if (["tree", "brush", "rubble"].includes(card.objectKind)) {
        world.scenery.push({
          id,
          type: card.objectKind,
          variant: card.variant,
          x,
          y,
          r: Math.max(size.w, size.h) * 0.5,
          destructible: card.destructible,
          maxHp: card.destructible ? hp : 0,
          baseHp: card.destructible ? hp : 0,
          hp: card.destructible ? hp : 0,
          stopsProjectiles: card.objectKind !== "brush"
        });
        return;
      }
      world.scenery.push({
        id,
        type: card.objectKind,
        variant: card.variant,
        x: x - size.w * 0.5,
        y: y - size.h * 0.5,
        w: size.w,
        h: size.h,
        angle: 0,
        destructible: card.destructible,
        maxHp: card.destructible ? hp : 0,
        baseHp: card.destructible ? hp : 0,
        hp: card.destructible ? hp : 0,
        stopsProjectiles: true
      });
    }

    clearSandbox() {
      const game = this.game;
      if (!game) return;
      game.infantry = [];
      game.tanks = [];
      game.humvees = [];
      game.crews = [];
      game.squads = [];
      game.projectiles = [];
      game.drones = (game.drones || []).filter((drone) => drone.owner === game.player);
      if (game.world) {
        game.world.obstacles = (game.world.obstacles || []).filter((item) => !String(item.id || "").startsWith("lab-place-"));
        game.world.scenery = (game.world.scenery || []).filter((item) => !String(item.id || "").startsWith("lab-place-"));
      }
      game.playerTank = null;
    }

    placedObjectCount() {
      const world = this.game?.world || {};
      return [...(world.obstacles || []), ...(world.scenery || [])]
        .filter((item) => String(item.id || "").startsWith("lab-place-"))
        .length;
    }

    update(game) {
      this.game = game || this.game;
      if (!this.root) this.ensure();
      if (!this.root) return;
      const active = Boolean(this.game?.testLab);
      this.root.classList.toggle("hidden", !active);
      if (!active) {
        if (this.placement) this.cancelPlacement();
        return;
      }
      this.updateDynamic(false);
    }

    render() {
      if (!this.root) return;
      const tabs = Object.entries(TAB_META).map(([id, meta]) => `
        <button type="button" class="test-lab-tab${id === this.tab ? " is-active" : ""}" data-lab-tab="${escapeHtml(id)}">
          ${escapeHtml(meta.label)}
        </button>
      `).join("");
      const cards = this.cards.filter((card) => card.tab === this.tab).map((card) => `
        <button type="button" class="test-lab-card${this.placement?.id === card.id ? " is-active" : ""}" data-lab-card="${escapeHtml(card.id)}">
          <strong>${escapeHtml(card.label)}</strong>
          <small>${escapeHtml(card.sub || "")}</small>
        </button>
      `).join("");
      this.root.innerHTML = `
        <header class="test-lab-head">
          <div>
            <span class="test-lab-kicker">샌드박스</span>
            <h2>실험장</h2>
          </div>
          <div class="test-lab-head-actions">
            <span class="test-lab-status" data-lab-ai-state>인공지능 정지</span>
            <button type="button" class="test-lab-collapse" data-lab-action="toggle-panel">${this.collapsed ? "펼치기" : "접기"}</button>
          </div>
        </header>
        <div class="test-lab-body" data-lab-body>
          <div class="test-lab-grid" data-lab-counters></div>
          <div class="test-lab-actions">
            <button type="button" data-lab-action="toggle-ai"><b data-lab-ai-button>인공지능 켜기</b></button>
            <button type="button" data-lab-action="clear-all">전부 삭제</button>
            <button type="button" data-lab-action="refill">보급</button>
            <button type="button" data-lab-action="open-admin">관리자</button>
          </div>
          <div class="test-lab-team">
            <span>배치 팀</span>
            <button type="button" class="is-blue${this.team === "blue" ? " is-active" : ""}" data-lab-team="blue">청팀</button>
            <button type="button" class="is-red${this.team !== "blue" ? " is-active" : ""}" data-lab-team="red">홍팀</button>
          </div>
          <nav class="test-lab-tabs" aria-label="도감 분류">${tabs}</nav>
          <div class="test-lab-cards">${cards}</div>
          <p class="test-lab-hint" data-lab-hint></p>
        </div>
      `;
      this.counterSignature = "";
      this.updatePanelState();
      this.updateCardSelection();
      this.updateDynamic(true);
    }

    updatePanelState() {
      if (!this.root) return;
      this.root.classList.toggle("is-collapsed", Boolean(this.collapsed));
      const button = this.root.querySelector("[data-lab-action='toggle-panel']");
      if (button) button.textContent = this.collapsed ? "펼치기" : "접기";
    }

    updateDynamic(force) {
      if (!this.root || !this.game?.testLab) return;
      const game = this.game;
      const counts = [
        ["보병", countAlive(game.infantry)],
        ["전차", countAlive(game.tanks)],
        ["험비", countAlive(game.humvees)],
        ["드론", countAlive(game.drones)],
        ["배치물", this.placedObjectCount()]
      ];
      const signature = `${game.testLabAiPaused ? 1 : 0}|${counts.map(([, value]) => value).join(":")}`;
      if (!force && signature === this.counterSignature) return;
      this.counterSignature = signature;

      const paused = Boolean(game.testLabAiPaused);
      const state = this.root.querySelector("[data-lab-ai-state]");
      const aiButton = this.root.querySelector("[data-lab-ai-button]");
      if (state) {
        state.textContent = paused ? "인공지능 정지" : "인공지능 작동";
        state.classList.toggle("is-live", !paused);
      }
      if (aiButton) aiButton.textContent = paused ? "인공지능 켜기" : "인공지능 끄기";

      const target = this.root.querySelector("[data-lab-counters]");
      if (target) {
        target.innerHTML = counts.map(([label, value]) => `
          <article class="test-lab-counter">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
          </article>
        `).join("");
      }
    }
  }

  IronLine.TestLabUI = TestLabUI;
})(window);
