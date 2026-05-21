"use strict";

(function registerTestLabUI(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  const MODE_META = {
    hub: {
      label: "통합 테스트랩",
      short: "허브",
      deck: "모든 실험 모드를 한 곳에서 고르고 독립 시험장 상태를 확인합니다."
    },
    unit: {
      label: "유닛 테스트랩",
      short: "유닛",
      deck: "보병, 전차, 험비를 빠르게 투입해 교전 감각을 확인합니다."
    },
    drone: {
      label: "드론 테스트랩",
      short: "드론",
      deck: "정찰 드론 배치, 지붕 고정, 인공지능 탐지 흐름을 확인합니다."
    },
    balance: {
      label: "밸런스 테스트랩",
      short: "밸런스",
      deck: "철갑탄과 고폭탄 피해, 장갑 방향, 최근 피격 로그를 한 화면에서 봅니다."
    },
    audio: {
      label: "음원 테스트랩",
      short: "음원",
      deck: "로컬 음원을 불러와 반복, 볼륨, 재생감을 테스트합니다."
    },
    skin: {
      label: "유닛/스킨 연구실",
      short: "스킨",
      deck: "세력별 보병, 전차, 험비 색감과 인게임 적용 상태를 확인합니다."
    },
    objects: {
      label: "오브젝트 테스트랩",
      short: "오브젝트",
      deck: "건물, 벽, 장식류를 밝은 시험장에 모아 보고 바로 배치합니다."
    }
  };

  const FACTION_LABELS = {
    korea: "한국군",
    usa: "미군",
    russia: "러시아군",
    china: "중국군",
    singularity: "특붕군",
    "military-gallery": "군붕군"
  };

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

  function factionLabel(faction) {
    if (!faction) return "세력 없음";
    return FACTION_LABELS[faction.id] || faction.name || faction.id;
  }

  function modeMeta(mode) {
    return MODE_META[mode] || MODE_META.drone;
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return "00:00";
    const total = Math.floor(seconds);
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }

  function countAlive(list) {
    return (list || []).filter((item) => item?.alive !== false).length;
  }

  class TestLabUI {
    constructor(game) {
      this.game = game;
      this.mode = "";
      this.root = null;
      this.dialog = null;
      this.bound = false;
      this.collapsed = window.innerWidth <= 1100;
      this.selectedFactionId = IronLine.factionVisuals?.factionIdForTeam?.(game, IronLine.constants?.TEAM?.BLUE) ||
        IronLine.playerFactions?.[0]?.id ||
        "korea";
      this.audio = new Audio();
      this.audio.preload = "metadata";
      this.audioFileName = "";
      this.audioUrl = "";
      this.audioMessage = "음원 파일을 선택하세요.";
      this.selectedObjectKind = "building";
      this.objectPlacementDraft = null;
      this.placedObjectSerial = 0;
      this.bindAudio();
      this.ensure();
      this.setMode(game?.testLab || "drone");
      this.root?.classList.toggle("hidden", !game?.testLab);
    }

    ensure() {
      if (this.root || typeof document === "undefined") return;
      this.root = document.createElement("section");
      this.root.className = "test-lab-panel";
      this.root.setAttribute("aria-label", "테스트랩 패널");
      document.body.append(this.root);
      this.dialog = document.createElement("div");
      this.dialog.className = "test-lab-dialog hidden";
      this.dialog.setAttribute("aria-label", "배치 설정");
      document.body.append(this.dialog);
      this.bind();
    }

    bind() {
      if (this.bound || !this.root) return;
      this.bound = true;
      this.root.addEventListener("click", (event) => this.onClick(event));
      this.root.addEventListener("change", (event) => this.onChange(event));
      this.root.addEventListener("input", (event) => this.onInput(event));
      this.dialog?.addEventListener("click", (event) => this.onClick(event));
      this.dialog?.addEventListener("change", (event) => this.onChange(event));
      this.dialog?.addEventListener("input", (event) => this.onInput(event));
    }

    bindAudio() {
      this.audio.addEventListener("loadedmetadata", () => this.updateAudioStatus());
      this.audio.addEventListener("timeupdate", () => this.updateAudioStatus());
      this.audio.addEventListener("ended", () => this.updateAudioStatus());
      this.audio.addEventListener("play", () => this.updateAudioStatus());
      this.audio.addEventListener("pause", () => this.updateAudioStatus());
      this.audio.addEventListener("error", () => {
        this.audioMessage = "이 파일은 브라우저에서 재생할 수 없습니다.";
        this.updateAudioStatus();
      });
    }

    setMode(mode) {
      const nextMode = MODE_META[mode] ? mode : "drone";
      if (this.mode === nextMode && this.root?.innerHTML) return;
      this.mode = nextMode;
      this.render();
    }

    update(game) {
      this.game = game || this.game;
      if (!this.root) this.ensure();
      if (!this.root) return;

      const mode = this.game?.testLab || "";
      this.root.classList.toggle("hidden", !mode);
      if (!mode) {
        this.closeObjectDialog();
        return;
      }
      this.setMode(mode);
      this.updatePanelState();
      this.updateDynamic();
    }

    togglePanel() {
      this.collapsed = !this.collapsed;
      this.updatePanelState();
    }

    updatePanelState() {
      if (!this.root) return;
      this.root.classList.toggle("is-collapsed", Boolean(this.collapsed));
      const button = this.root.querySelector("[data-lab-action='toggle-panel']");
      if (button) button.textContent = this.collapsed ? "펼치기" : "접기";
    }

    render() {
      if (!this.root) return;
      const meta = modeMeta(this.mode);
      this.root.innerHTML = `
        <header class="test-lab-head">
          <div>
            <span class="test-lab-kicker">실험장 콘솔</span>
            <h2>${escapeHtml(meta.label)}</h2>
            <p>${escapeHtml(meta.deck)}</p>
          </div>
          <div class="test-lab-head-actions">
            <span class="test-lab-status" data-lab-ai-state>인공지능 정지</span>
            <button type="button" class="test-lab-admin-link" data-lab-action="open-admin">관리자 패널</button>
            <button type="button" class="test-lab-collapse" data-lab-action="toggle-panel">접기</button>
          </div>
        </header>
        <div class="test-lab-body" data-lab-body>
          ${this.renderModeNav()}
          <div class="test-lab-grid" data-lab-counters></div>
          <div class="test-lab-section">
            <div class="test-lab-section-title">
              <strong>빠른 조작</strong>
              <span>기능키도 그대로 작동</span>
            </div>
            ${this.renderQuickActions()}
          </div>
          ${this.renderModeBody()}
        </div>
      `;
      this.objectGridSignature = "";
      this.updatePanelState();
      this.updateDynamic();
    }

    renderModeNav() {
      const links = Object.entries(MODE_META).map(([id, meta]) => {
        const active = id === this.mode ? " active" : "";
        return `<a class="test-lab-mode${active}" href="index.html?testLab=${escapeHtml(id)}">${escapeHtml(meta.short)}</a>`;
      }).join("");
      return `<nav class="test-lab-modes" aria-label="테스트랩 모드">${links}</nav>`;
    }

    renderQuickActions() {
      return `
        <div class="test-lab-actions">
          <button type="button" data-lab-action="spawn-infantry"><span>단축 1</span>보병</button>
          <button type="button" data-lab-action="spawn-tank"><span>단축 2</span>전차</button>
          <button type="button" data-lab-action="spawn-humvee"><span>단축 3</span>험비</button>
          <button type="button" data-lab-action="toggle-ai"><span>단축 4</span><b data-lab-ai-button>인공지능 켜기</b></button>
          <button type="button" data-lab-action="refill"><span>단축 5</span>보급</button>
          <button type="button" data-lab-action="roof-drone"><span>단축 6</span>드론 지붕</button>
        </div>
      `;
    }

    renderModeBody() {
      if (this.mode === "hub") return this.renderHubBody();
      if (this.mode === "objects") return this.renderObjectsBody?.() || "";
      if (this.mode === "audio") return this.renderAudioBody();
      if (this.mode === "skin") return this.renderSkinBody();
      if (this.mode === "balance") return this.renderBalanceBody();
      if (this.mode === "unit") return this.renderUnitBody();
      return this.renderDroneBody();
    }

    renderLauncherLinks() {
      return Object.entries(MODE_META)
        .filter(([id]) => id !== "hub")
        .map(([id, meta]) => `
          <a href="index.html?testLab=${escapeHtml(id)}">
            <strong>${escapeHtml(meta.label)}</strong>
            <span>${escapeHtml(meta.deck)}</span>
          </a>
        `).join("");
    }

    renderHubBody() {
      const launcherLinks = this.renderLauncherLinks();
      return `
        <div class="test-lab-section">
          <div class="test-lab-section-title">
            <strong>테스트랩 런처</strong>
            <span>직접 주소 대신 여기서 이동</span>
          </div>
          <div class="test-lab-launcher">
            ${launcherLinks}
          </div>
        </div>
        <div class="test-lab-section">
          <div class="test-lab-section-title">
            <strong>독립 시험장</strong>
            <span data-lab-map-name>독립 실험장</span>
          </div>
          <div class="test-lab-map-card" data-lab-map-card></div>
        </div>
      `;
    }

    renderUnitBody() {
      return `
        <div class="test-lab-section">
          <div class="test-lab-section-title">
            <strong>유닛 상태</strong>
            <span>스폰 후 바로 수치 확인</span>
          </div>
          <div class="test-lab-list" data-lab-unit-list></div>
        </div>
      `;
    }

    renderDroneBody() {
      return `
        <div class="test-lab-section">
          <div class="test-lab-section-title">
            <strong>드론 상태</strong>
            <span>정찰 범위와 배터리 확인</span>
          </div>
          <div class="test-lab-drone-card" data-lab-drone-card></div>
        </div>
      `;
    }

    renderBalanceBody() {
      const ammo = IronLine.constants?.AMMO || {};
      const ap = ammo.ap || {};
      const he = ammo.he || {};
      return `
        <div class="test-lab-section">
          <div class="test-lab-section-title">
            <strong>탄종 기준값</strong>
            <span>밸런스 확인용 읽기 전용</span>
          </div>
          <div class="test-lab-balance-grid">
            <article class="test-lab-stat-card is-ap">
              <span>철갑탄</span>
              <strong>${escapeHtml(ap.damage ?? "-")}</strong>
              <small>직격 피해 · 장갑 후면 보정 큼</small>
            </article>
            <article class="test-lab-stat-card is-he">
              <span>고폭탄</span>
              <strong>${escapeHtml(he.directTankDamage ?? he.damage ?? "-")}</strong>
              <small>직격 대전차 피해 · 폭발 반경 ${escapeHtml(he.splash ?? "-")}</small>
            </article>
            <article class="test-lab-stat-card">
              <span>고폭탄 폭압</span>
              <strong>${escapeHtml(he.damage ?? "-")}</strong>
              <small>보병 압박과 근처 폭발 중심</small>
            </article>
            <article class="test-lab-stat-card">
              <span>대전차 배율</span>
              <strong>${escapeHtml(he.tankDamageScale ?? "-")}</strong>
              <small>고폭탄 폭발이 장갑에 들어가는 비율</small>
            </article>
          </div>
        </div>
        <div class="test-lab-section">
          <div class="test-lab-section-title">
            <strong>최근 장갑 피격</strong>
            <span>후면/측면/전면 판정 확인</span>
          </div>
          <div class="test-lab-list" data-lab-armor-list></div>
        </div>
      `;
    }

    renderAudioBody() {
      return `
        <div class="test-lab-section">
          <div class="test-lab-section-title">
            <strong>음원 컨트롤</strong>
            <span>로컬 파일 테스트</span>
          </div>
          <label class="test-lab-file">
            <input type="file" accept=".mp3,audio/mpeg,audio/mp3,audio/*" data-lab-audio-file>
            <span data-lab-audio-file-name>음원 파일 선택</span>
          </label>
          <div class="test-lab-audio-controls">
            <button type="button" data-lab-action="audio-play">재생</button>
            <button type="button" data-lab-action="audio-stop">정지</button>
            <label>
              <input type="checkbox" data-lab-audio-loop>
              반복
            </label>
          </div>
          <label class="test-lab-range">
            <span>볼륨</span>
            <input type="range" min="0" max="100" value="72" data-lab-audio-volume>
            <strong data-lab-audio-volume-label>72%</strong>
          </label>
          <div class="test-lab-audio-meter">
            <span data-lab-audio-progress style="width: 0%"></span>
          </div>
          <p class="test-lab-audio-status" data-lab-audio-status>${escapeHtml(this.audioMessage)}</p>
        </div>
      `;
    }

    renderSkinBody() {
      const factions = IronLine.playerFactions || IronLine.playerSkins || [];
      if (!factions.some((faction) => faction.id === this.selectedFactionId)) {
        this.selectedFactionId = factions[0]?.id || this.selectedFactionId;
      }
      const options = factions.map((faction) => `
        <option value="${escapeHtml(faction.id)}"${faction.id === this.selectedFactionId ? " selected" : ""}>
          ${escapeHtml(factionLabel(faction))}
        </option>
      `).join("");
      return `
        <div class="test-lab-section">
          <div class="test-lab-section-title">
            <strong>세력 프리셋</strong>
            <span>밸런스는 건드리지 않음</span>
          </div>
          <label class="test-lab-select">
            <span>세력</span>
            <select data-lab-faction-select>${options}</select>
          </label>
          <div data-lab-skin-preview></div>
          <div class="test-lab-actions is-two">
            <button type="button" data-lab-action="apply-blue"><span>청팀</span>적용 테스트</button>
            <button type="button" data-lab-action="apply-red"><span>홍팀</span>적용 테스트</button>
          </div>
        </div>
      `;
    }

    onClick(event) {
      const objectButton = event.target.closest("[data-lab-object-kind]");
      if (objectButton) {
        event.preventDefault();
        this.openObjectDialog(objectButton.getAttribute("data-lab-object-kind") || this.selectedObjectKind);
        return;
      }

      const button = event.target.closest("[data-lab-action]");
      if (!button) return;
      const action = button.getAttribute("data-lab-action");
      if (!action) return;
      event.preventDefault();
      this.handleAction(action);
    }

    onChange(event) {
      const target = event.target;
      if (target.matches("[data-lab-audio-file]")) {
        this.setAudioFile(target.files?.[0] || null);
        return;
      }
      if (target.matches("[data-lab-audio-loop]")) {
        this.audio.loop = Boolean(target.checked);
        return;
      }
      if (target.matches("[data-lab-faction-select]")) {
        this.selectedFactionId = target.value;
        this.updateRendererSkinPreview();
        return;
      }
      if (target.matches("[data-lab-object-select]")) {
        this.selectedObjectKind = target.value;
        this.updateObjectGrid();
      }
    }

    onInput(event) {
      const target = event.target;
      if (!target.matches("[data-lab-audio-volume]")) return;
      const value = clamp(target.value, 0, 100);
      this.audio.volume = value / 100;
      const label = this.root.querySelector("[data-lab-audio-volume-label]");
      if (label) label.textContent = `${Math.round(value)}%`;
    }

    handleAction(action) {
      const game = this.game;
      if (!game) return;

      if (action === "spawn-infantry") game.spawnTestLabInfantry?.();
      if (action === "spawn-tank") game.spawnTestLabTank?.();
      if (action === "spawn-humvee") game.spawnTestLabHumvee?.();
      if (action === "toggle-ai") game.testLabAiPaused = !game.testLabAiPaused;
      if (action === "refill") {
        game.refillTestLabPlayer?.();
        if (!game.activePlayerDrone?.()) game.spawnTestLabReconDrone?.();
      }
      if (action === "roof-drone") game.placeTestLabDroneOnRoof?.();
      if (action === "audio-play") this.toggleAudio();
      if (action === "audio-stop") this.stopAudio();
      if (action === "apply-blue") this.applyFaction("blue");
      if (action === "apply-red") this.applyFaction("red");
      if (action === "toggle-panel") this.togglePanel();
      if (action === "open-admin") this.openAdminPanel();
      if (action === "focus-gallery") this.focusObjectGallery();
      if (action === "place-object") this.openObjectDialog(this.selectedObjectKind);
      if (action === "confirm-object-place") this.confirmObjectPlacement();
      if (action === "close-object-dialog") this.closeObjectDialog();
      if (action === "clear-objects") this.clearPlacedObjects();

      game.canvas?.focus?.();
      this.updateDynamic();
    }

    openAdminPanel() {
      window.location.href = "admin.html";
    }

    setAudioFile(file) {
      if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
      this.audioUrl = "";
      this.audioFileName = "";
      if (!file) {
        this.audio.removeAttribute("src");
        this.audioMessage = "음원 파일을 선택하세요.";
        this.updateAudioStatus();
        return;
      }
      this.audioUrl = URL.createObjectURL(file);
      this.audio.src = this.audioUrl;
      this.audioFileName = file.name || "선택한 오디오";
      this.audioMessage = `${this.audioFileName} 준비됨`;
      const label = this.root?.querySelector("[data-lab-audio-file-name]");
      if (label) label.textContent = this.audioFileName;
      this.updateAudioStatus();
    }

    toggleAudio() {
      if (!this.audio.src) {
        this.audioMessage = "먼저 음원 파일을 선택하세요.";
        this.updateAudioStatus();
        return;
      }
      if (!this.audio.paused) {
        this.audio.pause();
        this.updateAudioStatus();
        return;
      }
      this.audio.play().catch(() => {
        this.audioMessage = "브라우저가 재생을 막았습니다. 버튼을 다시 눌러주세요.";
        this.updateAudioStatus();
      });
    }

    stopAudio() {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.updateAudioStatus();
    }

    applyFaction(team) {
      const game = this.game;
      const factionId = this.selectedFactionId;
      if (!game || !factionId) return;
      if (team === "blue") {
        game.localProfile = { ...(game.localProfile || {}), factionId, skinId: factionId };
        game.onlineSession.blueFactionId = factionId;
      } else {
        game.onlineSession.redFactionId = factionId;
      }
      IronLine.factionVisuals?.syncGame?.(game);
      this.updateRendererSkinPreview();
    }

    updateDynamic() {
      if (!this.root || !this.game?.testLab) return;
      this.updateHeaderState();
      this.updateCounters();
      if (this.mode === "hub") this.updateMapCard();
      if (this.mode === "unit") this.updateUnitList();
      if (this.mode === "drone") this.updateDroneCard();
      if (this.mode === "balance") this.updateArmorList();
      if (this.mode === "audio") this.updateAudioStatus();
      if (this.mode === "skin") this.updateRendererSkinPreview();
      if (this.mode === "objects") this.updateObjectGrid();
    }

    updateHeaderState() {
      const paused = Boolean(this.game?.testLabAiPaused);
      const state = this.root.querySelector("[data-lab-ai-state]");
      const button = this.root.querySelector("[data-lab-ai-button]");
      if (state) {
        state.textContent = paused ? "인공지능 정지" : "인공지능 작동";
        state.classList.toggle("is-live", !paused);
      }
      if (button) button.textContent = paused ? "인공지능 켜기" : "인공지능 끄기";
    }

    updateCounters() {
      const target = this.root.querySelector("[data-lab-counters]");
      if (!target) return;
      const game = this.game;
      const counts = [
        ["보병", countAlive(game.infantry)],
        ["전차", countAlive(game.tanks)],
        ["험비", countAlive(game.humvees)],
        ["드론", countAlive(game.drones)]
      ];
      target.innerHTML = counts.map(([label, value]) => `
        <article class="test-lab-counter">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `).join("");
    }

    updateMapCard() {
      const target = this.root.querySelector("[data-lab-map-card]");
      const name = this.root.querySelector("[data-lab-map-name]");
      if (!target || !this.game?.world) return;
      const world = this.game.world;
      const placed = this.placedObjectCount();
      if (name) name.textContent = world.name || "독립 실험장";
      target.innerHTML = `
        <article>
          <span>맵</span>
          <strong>${escapeHtml(world.name || "독립 실험장")}</strong>
        </article>
        <article>
          <span>크기</span>
          <strong>${Math.round(world.width)} x ${Math.round(world.height)}</strong>
        </article>
        <article>
          <span>전시장</span>
          <strong>${escapeHtml(world.testLab?.objectGalleryName || "오브젝트 전시장")}</strong>
        </article>
        <article>
          <span>직접 배치</span>
          <strong>${escapeHtml(placed)}</strong>
        </article>
      `;
    }

    updateUnitList() {
      const target = this.root.querySelector("[data-lab-unit-list]");
      if (!target) return;
      const units = [
        ...(this.game.infantry || []).slice(-4),
        ...(this.game.tanks || []).slice(-2),
        ...(this.game.humvees || []).slice(-2)
      ].slice(-6).reverse();
      if (!units.length) {
        target.innerHTML = `<p class="test-lab-empty">아직 추가 유닛이 없습니다.</p>`;
        return;
      }
      target.innerHTML = units.map((unit) => {
        const hp = Math.max(0, Math.round(unit.hp ?? 0));
        const max = Math.max(1, Math.round((unit.maxHp ?? hp) || 1));
        const pct = clamp((hp / max) * 100, 0, 100);
        return `
          <article class="test-lab-row">
            <div>
              <strong>${escapeHtml(this.unitDisplayName(unit))}</strong>
              <span>${escapeHtml(this.unitKindLabel(unit))}</span>
            </div>
            <div class="test-lab-hp"><span style="width: ${pct}%"></span></div>
            <b>${hp}/${max}</b>
          </article>
        `;
      }).join("");
    }

    unitDisplayName(unit) {
      if (!unit) return "유닛";
      if (unit.vehicleType === "humvee") return unit.callSign?.startsWith?.("실험") ? unit.callSign : "험비";
      if (unit.radius >= 30 || unit.ammo?.ap !== undefined) return unit.callSign?.startsWith?.("실험") ? unit.callSign : "전차";
      if (unit.callSign?.startsWith?.("실험")) return unit.callSign;
      if (unit.classId === "engineer") return "공병";
      if (unit.classId === "scout") return "정찰병";
      return "보병";
    }

    unitKindLabel(unit) {
      if (!unit) return "유닛";
      if (unit.vehicleType === "humvee") return "차량";
      if (unit.radius >= 30 || unit.ammo?.ap !== undefined) return "장갑 차량";
      if (unit.classId === "engineer") return "수리/대전차";
      if (unit.classId === "scout") return "정찰";
      if (unit.weaponId === "machinegun") return "기관총";
      if (unit.weaponId === "sniper") return "저격";
      return "소총";
    }

    updateDroneCard() {
      const target = this.root.querySelector("[data-lab-drone-card]");
      if (!target) return;
      const drone = this.game.activePlayerDrone?.() || (this.game.drones || [])[0];
      if (!drone) {
        target.innerHTML = `<p class="test-lab-empty">활성 드론이 없습니다. 보급 버튼으로 다시 채우세요.</p>`;
        return;
      }
      const battery = Math.round(drone.battery ?? 0);
      const maxBattery = Math.max(1, Math.round((drone.maxBattery ?? battery) || 1));
      const hp = Math.round(drone.hp ?? 0);
      const maxHp = Math.max(1, Math.round((drone.maxHp ?? hp) || 1));
      target.innerHTML = `
        <div class="test-lab-drone-orbit"></div>
        <div>
          <strong>${escapeHtml(drone.callSign?.startsWith?.("실험") ? drone.callSign : "정찰 드론")}</strong>
          <span>배터리 ${battery}/${maxBattery} · 체력 ${hp}/${maxHp}</span>
          <small>목표 ${Math.round(drone.targetX ?? drone.x)}, ${Math.round(drone.targetY ?? drone.y)}</small>
        </div>
      `;
    }

    updateArmorList() {
      const target = this.root.querySelector("[data-lab-armor-list]");
      if (!target) return;
      const vehicles = [...(this.game.tanks || []), ...(this.game.humvees || [])]
        .filter((vehicle) => vehicle?.lastArmorHit)
        .slice(-6)
        .reverse();
      if (!vehicles.length) {
        target.innerHTML = `<p class="test-lab-empty">아직 장갑 직격 로그가 없습니다. 전차를 배치하고 탄을 쏴보세요.</p>`;
        return;
      }
      target.innerHTML = vehicles.map((vehicle) => {
        const hit = vehicle.lastArmorHit || {};
        const zone = this.armorZoneLabel(hit.zone);
        const age = Math.max(0, (this.game.matchTime || 0) - (hit.time || 0));
        return `
          <article class="test-lab-row">
            <div>
              <strong>${escapeHtml(vehicle.callSign || "차량")}</strong>
              <span>${escapeHtml(zone)} · ${escapeHtml(this.ammoLabel(hit.ammoId))}</span>
            </div>
            <b>x${escapeHtml(Number(hit.multiplier || 1).toFixed(2))}</b>
            <small>${escapeHtml(age.toFixed(1))}초 전</small>
          </article>
        `;
      }).join("");
    }

    armorZoneLabel(zone) {
      if (zone === "rear") return "후면";
      if (zone === "side") return "측면";
      if (zone === "front") return "전면";
      return "경장갑";
    }

    ammoLabel(ammoId) {
      if (ammoId === "ap") return "철갑탄";
      if (ammoId === "he") return "고폭탄";
      if (ammoId === "rpg") return "대전차 로켓";
      if (ammoId === "smoke") return "연막탄";
      return "포탄";
    }

    updateAudioStatus() {
      if (!this.root || this.mode !== "audio") return;
      const status = this.root.querySelector("[data-lab-audio-status]");
      const progress = this.root.querySelector("[data-lab-audio-progress]");
      const play = this.root.querySelector("[data-lab-action='audio-play']");
      const fileName = this.root.querySelector("[data-lab-audio-file-name]");
      const duration = Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
      const current = Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0;
      const percent = duration > 0 ? clamp((current / duration) * 100, 0, 100) : 0;
      if (progress) progress.style.width = `${percent}%`;
      if (play) play.textContent = this.audio.paused ? "재생" : "일시정지";
      if (fileName) fileName.textContent = this.audioFileName || "음원 파일 선택";
      if (status) {
        const time = this.audioFileName ? `${formatTime(current)} / ${formatTime(duration)}` : this.audioMessage;
        status.textContent = this.audioFileName ? `${this.audioFileName} · ${time}` : this.audioMessage;
      }
    }

    updateRendererSkinPreview() {
      const target = this.root?.querySelector("[data-lab-skin-preview]");
      if (!target) return;
      const faction = (IronLine.playerFactions || IronLine.playerSkins || [])
        .find((item) => item.id === this.selectedFactionId) || null;
      if (!faction) {
        target.innerHTML = `<p class="test-lab-empty">세력 프리셋을 찾을 수 없습니다.</p>`;
        return;
      }
      const teamBlue = IronLine.factionVisuals?.factionIdForTeam?.(this.game, IronLine.constants.TEAM.BLUE);
      const teamRed = IronLine.factionVisuals?.factionIdForTeam?.(this.game, IronLine.constants.TEAM.RED);
      target.innerHTML = `
        <div class="test-lab-skin-preview">
          <div class="test-lab-skin-title">
            <div>
              <strong>${escapeHtml(factionLabel(faction))}</strong>
              <span>실제 게임 렌더러 미리보기</span>
            </div>
            ${faction.logo ? `<img src="${escapeHtml(faction.logo)}" alt="">` : ""}
          </div>
          <div class="test-lab-render-stage">
            <article>
              <canvas width="160" height="108" data-lab-render-preview="infantry" aria-label="보병 미리보기"></canvas>
              <strong>보병</strong>
            </article>
            <article>
              <canvas width="160" height="108" data-lab-render-preview="tank" aria-label="전차 미리보기"></canvas>
              <strong>전차</strong>
            </article>
            <article>
              <canvas width="160" height="108" data-lab-render-preview="humvee" aria-label="험비 미리보기"></canvas>
              <strong>험비</strong>
            </article>
          </div>
          <div class="test-lab-palette">
            <span style="background:${escapeHtml(faction.cloth || "")}"></span>
            <span style="background:${escapeHtml(faction.vest || "")}"></span>
            <span style="background:${escapeHtml(faction.helmet || "")}"></span>
            <span style="background:${escapeHtml(faction.accent || "")}"></span>
          </div>
          <p class="test-lab-team-state">현재 적용 · 청팀 ${escapeHtml(FACTION_LABELS[teamBlue] || teamBlue || "-")} / 홍팀 ${escapeHtml(FACTION_LABELS[teamRed] || teamRed || "-")}</p>
        </div>
      `;
      this.drawSkinPreviewCanvases(faction);
    }

    drawSkinPreviewCanvases(faction) {
      if (!faction || !IronLine.Renderer) return;
      const renderer = Object.create(IronLine.Renderer.prototype);
      const TEAM = IronLine.constants?.TEAM || { BLUE: "blue" };
      const previewGame = {
        matchTime: 1.2,
        sessionMode: "offline",
        localProfile: { factionId: faction.id, skinId: faction.id },
        onlineSession: { blueFactionId: faction.id, redFactionId: faction.id },
        player: null,
        input: null,
        findMountablePlayerVehicle: () => null,
        findMountablePlayerTank: () => null
      };

      for (const canvas of this.root?.querySelectorAll("[data-lab-render-preview]") || []) {
        const type = canvas.getAttribute("data-lab-render-preview");
        const width = 160;
        const height = 108;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = "#d4dad8";
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = "rgba(86, 98, 94, 0.18)";
        ctx.lineWidth = 1;
        for (let x = 0; x <= width; x += 24) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
        for (let y = 0; y <= height; y += 24) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }
        renderer.ctx = ctx;
        renderer.canvas = canvas;
        if (type === "infantry" && IronLine.InfantryUnit) {
          const unit = new IronLine.InfantryUnit({
            x: width * 0.5,
            y: height * 0.56,
            team: TEAM.BLUE,
            factionId: faction.id,
            weaponId: "rifle",
            angle: -0.12,
            callSign: ""
          });
          renderer.drawInfantry(previewGame, unit, { color: faction.accent || "#8fdcff", showPrompt: false });
        } else if (type === "tank" && IronLine.Tank) {
          const tank = new IronLine.Tank({
            x: width * 0.5,
            y: height * 0.54,
            team: TEAM.BLUE,
            factionId: faction.id,
            angle: 0,
            callSign: ""
          });
          tank.turretAngle = 0;
          const colors = renderer.tankRenderColors(previewGame, tank);
          renderer.drawTankHullLayer(previewGame, tank, colors);
          renderer.drawTankTurretLayer(previewGame, tank, colors);
          renderer.drawTankMachineGun(previewGame, tank, colors);
        } else if (type === "humvee" && IronLine.Humvee) {
          const humvee = new IronLine.Humvee({
            x: width * 0.5,
            y: height * 0.55,
            team: TEAM.BLUE,
            factionId: faction.id,
            angle: 0,
            callSign: " "
          });
          renderer.drawHumvee(previewGame, humvee);
        }
      }
    }

  }

  IronLine.TestLabUI = TestLabUI;
})(window);
