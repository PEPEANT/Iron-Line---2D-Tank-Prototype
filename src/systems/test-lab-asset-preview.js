"use strict";

(function registerTestLabAssetPreview(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const TestLabUI = IronLine.TestLabUI;
  if (!TestLabUI) return;

  const TEAM = IronLine.constants?.TEAM || { BLUE: "blue" };
  const ASSET_BASE = "assets/packs/lab-ai-tank/";
  const VIEW_SIZES = [64, 48, 32];
  const ASSETS = {
    assembled: {
      label: "AI assembled",
      src: `${ASSET_BASE}assembled.png`,
      bbox: [403, 40, 447, 1152],
      metric: "447 x 1152"
    },
    hull: {
      label: "AI hull",
      src: `${ASSET_BASE}hull.png`,
      bbox: [334, 85, 583, 1054],
      metric: "583 x 1054"
    },
    turret: {
      label: "AI turret",
      src: `${ASSET_BASE}turret.png`,
      bbox: [391, 49, 469, 1117],
      metric: "469 x 1117"
    },
    barrel: {
      label: "AI barrel",
      src: `${ASSET_BASE}barrel.png`,
      bbox: [565, 133, 122, 964],
      metric: "122 x 964"
    },
    tracks: {
      label: "AI tracks",
      src: `${ASSET_BASE}tracks.png`,
      bbox: [154, 103, 946, 1018],
      metric: "946 x 1018"
    },
    wreck: {
      label: "AI wreck",
      src: `${ASSET_BASE}wreck.png`,
      bbox: [363, 73, 534, 1107],
      metric: "534 x 1107"
    }
  };

  const COLUMNS = [
    { id: "original", label: "Original renderer", metric: "canvas" },
    ASSETS.assembled,
    ASSETS.hull,
    ASSETS.turret,
    ASSETS.barrel,
    ASSETS.tracks,
    ASSETS.wreck
  ];

  const imageCache = new Map();
  let originalSprite = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function loadAsset(asset) {
    if (!asset?.src) return null;
    if (imageCache.has(asset.src)) return imageCache.get(asset.src);
    const image = new Image();
    image.decoding = "async";
    image.src = asset.src;
    image.onload = () => {
      const ui = IronLine.game?.testLabUI;
      if (ui?.updateAssetTankComparison) ui.updateAssetTankComparison();
    };
    imageCache.set(asset.src, image);
    return image;
  }

  function alphaBounds(canvas) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * 4 + 3] <= 4) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < minX || maxY < minY) return null;
    return [minX, minY, maxX - minX + 1, maxY - minY + 1];
  }

  function buildOriginalSprite(game) {
    if (originalSprite) return originalSprite;
    if (!IronLine.Renderer || !IronLine.Tank) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 220;
    canvas.height = 220;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const renderer = Object.create(IronLine.Renderer.prototype);
    renderer.ctx = ctx;
    renderer.canvas = canvas;
    const previewGame = {
      matchTime: game?.matchTime || 1.2,
      sessionMode: "offline",
      localProfile: game?.localProfile || { factionId: "korea", skinId: "korea" },
      onlineSession: game?.onlineSession || { blueFactionId: "korea", redFactionId: "russia" },
      player: null,
      input: null,
      findMountablePlayerVehicle: () => null,
      findMountablePlayerTank: () => null
    };
    const tank = new IronLine.Tank({
      x: canvas.width * 0.5,
      y: canvas.height * 0.5,
      team: TEAM.BLUE,
      factionId: previewGame.localProfile.factionId || "korea",
      angle: -Math.PI / 2,
      callSign: ""
    });
    tank.turretAngle = -Math.PI / 2;
    tank.machineGunAngle = -Math.PI / 2;
    tank.trackPhase = 4;
    tank.crew = {};
    const colors = renderer.tankRenderColors(previewGame, tank);
    renderer.drawTankHullLayer(previewGame, tank, colors);
    renderer.drawTankTurretLayer(previewGame, tank, colors);
    renderer.drawTankMachineGun(previewGame, tank, colors);
    const bbox = alphaBounds(canvas) || [0, 0, canvas.width, canvas.height];
    originalSprite = {
      canvas,
      bbox,
      metric: `${bbox[2]} x ${bbox[3]}`
    };
    return originalSprite;
  }

  function setupCanvas(canvas, cssWidth, cssHeight) {
    const dpr = global.devicePixelRatio || 1;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function drawGrid(ctx, x, y, w, h) {
    ctx.fillStyle = "#263222";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(204, 220, 188, 0.08)";
    ctx.lineWidth = 1;
    for (let gx = x; gx <= x + w; gx += 18) {
      ctx.beginPath();
      ctx.moveTo(gx, y);
      ctx.lineTo(gx, y + h);
      ctx.stroke();
    }
    for (let gy = y; gy <= y + h; gy += 18) {
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.lineTo(x + w, gy);
      ctx.stroke();
    }
  }

  function drawCropped(ctx, source, bbox, centerX, centerY, maxSize) {
    const [sx, sy, sw, sh] = bbox;
    const scale = maxSize / Math.max(sw, sh);
    const dw = Math.max(1, Math.round(sw * scale));
    const dh = Math.max(1, Math.round(sh * scale));
    const dx = Math.round(centerX - dw / 2);
    const dy = Math.round(centerY - dh / 2);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
    return `${dw}x${dh}`;
  }

  function drawGeneratedTankSprite(renderer, game, tank, baseDrawTank) {
    const asset = tank.alive === false ? ASSETS.wreck : ASSETS.assembled;
    const image = loadAsset(asset);
    if (!image?.complete || !image.naturalWidth) {
      if (baseDrawTank) baseDrawTank.call(renderer, game, tank);
      return;
    }
    const ctx = renderer.ctx;
    const [sx, sy, sw, sh] = asset.bbox;
    const drawH = tank.alive === false ? 106 : 112;
    const drawW = drawH * (sw / sh);
    ctx.save();
    ctx.translate(tank.x, tank.y);
    if (tank.impactShake > 0.001) {
      const wobble = (tank.trackPhase || 0) * 13 + (game.matchTime || 0) * 21;
      ctx.translate(
        Math.sin(wobble) * tank.impactShake * 4,
        Math.cos(wobble * 0.83) * tank.impactShake * 3
      );
    }
    if (tank.fireKick > 0.001) {
      const kick = tank.fireKick * 6;
      ctx.translate(-Math.cos(tank.turretAngle) * kick, -Math.sin(tank.turretAngle) * kick);
    }
    ctx.rotate((tank.angle || 0) + Math.PI / 2);
    ctx.drawImage(image, sx, sy, sw, sh, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    if (tank.alive === false) {
      if (!tank.coverDestroyed) renderer.drawTankLabel?.(tank);
      return;
    }
    renderer.drawTankHealth?.(tank);
    renderer.drawTankAssaultIndicator?.(tank);
    renderer.drawTankLabel?.(tank);
  }

  function drawComparison(game, canvas) {
    const cssWidth = 980;
    const cssHeight = 360;
    const ctx = setupCanvas(canvas, cssWidth, cssHeight);
    if (!ctx) return;
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = "#151a14";
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.font = "13px Arial, sans-serif";
    ctx.textBaseline = "middle";

    const left = 82;
    const top = 34;
    const cellW = 128;
    const rowH = 96;
    const original = buildOriginalSprite(game);

    ctx.fillStyle = "#dfe8d5";
    for (let c = 0; c < COLUMNS.length; c += 1) {
      const column = COLUMNS[c];
      const x = left + c * cellW;
      ctx.textAlign = "center";
      ctx.fillText(column.label, x + cellW / 2, 16);
    }

    for (let r = 0; r < VIEW_SIZES.length; r += 1) {
      const size = VIEW_SIZES[r];
      const y = top + r * rowH;
      ctx.textAlign = "left";
      ctx.fillStyle = "#dfe8d5";
      ctx.fillText(`${size}px`, 18, y + rowH / 2);
      for (let c = 0; c < COLUMNS.length; c += 1) {
        const column = COLUMNS[c];
        const x = left + c * cellW;
        drawGrid(ctx, x, y, cellW - 6, rowH - 6);
        ctx.strokeStyle = "rgba(206, 220, 189, 0.16)";
        ctx.strokeRect(x, y, cellW - 6, rowH - 6);
        const centerX = x + (cellW - 6) / 2;
        const centerY = y + (rowH - 6) / 2 - 3;
        let label = "";
        if (column.id === "original") {
          if (original) label = drawCropped(ctx, original.canvas, original.bbox, centerX, centerY, size);
        } else {
          const image = loadAsset(column);
          if (image?.complete && image.naturalWidth) {
            label = drawCropped(ctx, image, column.bbox, centerX, centerY, size);
          } else {
            ctx.textAlign = "center";
            ctx.fillStyle = "#b7c4aa";
            ctx.fillText("loading", centerX, centerY);
          }
        }
        ctx.textAlign = "left";
        ctx.fillStyle = "#bdc9b3";
        ctx.fillText(label, x + 7, y + rowH - 18);
      }
    }

    ctx.textAlign = "left";
    ctx.fillStyle = "#aebaa4";
    ctx.fillText("Max-dimension fit, not final pivot alignment. This panel is testLab-only.", 18, cssHeight - 16);
  }

  function drawQuickComparison(game, canvas) {
    const cssWidth = 320;
    const cssHeight = 270;
    const ctx = setupCanvas(canvas, cssWidth, cssHeight);
    if (!ctx) return;
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = "#151a14";
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.font = "12px Arial, sans-serif";
    ctx.textBaseline = "middle";
    const original = buildOriginalSprite(game);
    const testTank = loadAsset(ASSETS.assembled);
    const columns = [
      { label: "Original", source: original?.canvas, bbox: original?.bbox },
      { label: "AI test tank", source: testTank, bbox: ASSETS.assembled.bbox }
    ];
    const left = 42;
    const top = 28;
    const cellW = 132;
    const rowH = 70;
    for (let c = 0; c < columns.length; c += 1) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#dfe8d5";
      ctx.fillText(columns[c].label, left + c * cellW + cellW / 2, 13);
    }
    for (let r = 0; r < VIEW_SIZES.length; r += 1) {
      const size = VIEW_SIZES[r];
      const y = top + r * rowH;
      ctx.textAlign = "left";
      ctx.fillStyle = "#dfe8d5";
      ctx.fillText(`${size}px`, 7, y + rowH / 2);
      for (let c = 0; c < columns.length; c += 1) {
        const column = columns[c];
        const x = left + c * cellW;
        drawGrid(ctx, x, y, cellW - 8, rowH - 8);
        ctx.strokeStyle = "rgba(206, 220, 189, 0.16)";
        ctx.strokeRect(x, y, cellW - 8, rowH - 8);
        const centerX = x + (cellW - 8) / 2;
        const centerY = y + (rowH - 8) / 2 - 2;
        if (column.source && (column.source === original?.canvas || column.source.complete && column.source.naturalWidth)) {
          const label = drawCropped(ctx, column.source, column.bbox, centerX, centerY, size);
          ctx.textAlign = "left";
          ctx.fillStyle = "#bdc9b3";
          ctx.fillText(label, x + 7, y + rowH - 15);
        } else {
          ctx.textAlign = "center";
          ctx.fillStyle = "#b7c4aa";
          ctx.fillText("loading", centerX, centerY);
        }
      }
    }
    ctx.textAlign = "left";
    ctx.fillStyle = "#aebaa4";
    ctx.fillText("Quick check: original vs generated assembled tank.", 8, cssHeight - 13);
  }

  function renderMetrics() {
    const rows = [
      ["assembled", ASSETS.assembled.metric],
      ["hull", ASSETS.hull.metric],
      ["turret", ASSETS.turret.metric],
      ["barrel", ASSETS.barrel.metric],
      ["tracks", ASSETS.tracks.metric],
      ["wreck", ASSETS.wreck.metric]
    ];
    return rows.map(([label, metric]) => `
      <span><b>${escapeHtml(label)}</b>${escapeHtml(metric)}</span>
    `).join("");
  }

  function colorSwatch(value) {
    return `<span style="background:${escapeHtml(value || "rgba(255,255,255,0.12)")};"></span>`;
  }

  function renderFactionCatalog() {
    const factions = IronLine.playerFactions || IronLine.playerSkins || [];
    if (!factions.length) return "";
    return `
      <div class="test-lab-catalog-group">
        <h4>Factions <span>${factions.length}</span></h4>
        <div class="test-lab-catalog-grid is-factions">
          ${factions.map((faction) => `
            <article class="test-lab-catalog-card">
              <div class="test-lab-catalog-head">
                ${faction.logo ? `<img src="${escapeHtml(faction.logo)}" alt="">` : "<i></i>"}
                <div>
                  <strong>${escapeHtml(faction.id)}</strong>
                  <small>${escapeHtml(faction.category || faction.role || "runtime faction")}</small>
                </div>
              </div>
              <div class="test-lab-catalog-swatches">
                ${colorSwatch(faction.cloth)}
                ${colorSwatch(faction.vest)}
                ${colorSwatch(faction.helmet)}
                ${colorSwatch(faction.accent)}
              </div>
            </article>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderWeaponCatalog() {
    const weapons = Object.values(IronLine.constants?.INFANTRY_WEAPONS || {})
      .filter((weapon) => weapon?.id)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    if (!weapons.length) return "";
    return `
      <div class="test-lab-catalog-group">
        <h4>Weapons <span>${weapons.length}</span></h4>
        <div class="test-lab-catalog-grid is-weapons">
          ${weapons.map((weapon) => `
            <article class="test-lab-catalog-card">
              <div class="test-lab-catalog-thumb is-weapon">
                <img src="assets/weapons/${escapeHtml(weapon.id)}.png" alt="">
              </div>
              <strong>${escapeHtml(weapon.id)}</strong>
              <small>${escapeHtml(weapon.type || "tool")} / range ${escapeHtml(Math.round(weapon.range || 0))}</small>
            </article>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderTankSlotCatalog() {
    const slots = Object.entries(ASSETS);
    return `
      <div class="test-lab-catalog-group">
        <h4>Tank Pack Slots <span>${slots.length}</span></h4>
        <div class="test-lab-catalog-grid is-tank-slots">
          ${slots.map(([id, asset]) => `
            <article class="test-lab-catalog-card">
              <div class="test-lab-catalog-thumb">
                <img src="${escapeHtml(asset.src)}" alt="">
              </div>
              <strong>${escapeHtml(id)}</strong>
              <small>${escapeHtml(asset.metric || "bbox pending")}</small>
            </article>
          `).join("")}
        </div>
      </div>
    `;
  }

  function renderSceneryCatalog() {
    const items = IronLine.sceneryCatalog?.obstacleKinds || [];
    if (!items.length) return "";
    return `
      <div class="test-lab-catalog-group">
        <h4>Objects <span>${items.length}</span></h4>
        <div class="test-lab-catalog-grid is-objects">
          ${items.map((item) => {
            const size = item.defaultSize || { w: 160, h: 60 };
            const aspect = Math.max(0.28, Math.min(3.8, (size.w || 160) / Math.max(1, size.h || 60)));
            return `
              <article class="test-lab-catalog-card">
                <div class="test-lab-catalog-object">
                  <span style="aspect-ratio:${escapeHtml(aspect)} / 1;"></span>
                </div>
                <strong>${escapeHtml(item.kind)}</strong>
                <small>${escapeHtml(item.group || "object")} / ${escapeHtml(size.w)}x${escapeHtml(size.h)}</small>
              </article>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  function renderCatalogSection() {
    return `
      <div class="test-lab-section test-lab-asset-catalog-section">
        <div class="test-lab-section-title">
          <strong>Asset Catalog v1</strong>
          <span>Runtime view only. No gameplay values are duplicated here.</span>
        </div>
        ${renderFactionCatalog()}
        ${renderWeaponCatalog()}
        ${renderTankSlotCatalog()}
        ${renderSceneryCatalog()}
      </div>
    `;
  }

  function renderAssetSection() {
    return `
      <div class="test-lab-section test-lab-ai-tank-section">
        <div class="test-lab-section-title">
          <strong>전차 스킨 적용 테스트</strong>
          <span>테스트랩 전차에만 적용됩니다</span>
        </div>
        <label class="test-lab-select test-lab-ai-tank-select">
          <span>전차 스킨</span>
          <select data-lab-tank-skin-select>
            <option value="original">원본 캔버스 렌더러</option>
            <option value="ai-assembled">AI 테스트 탱크 PNG</option>
          </select>
        </label>
        <div class="test-lab-actions is-two">
          <button type="button" data-lab-action="apply-tank-skin"><span>선택</span>테스트 전차 적용</button>
          <button type="button" data-lab-action="reset-tank-skin"><span>원본</span>복구</button>
        </div>
        <p class="test-lab-ai-tank-state" data-lab-tank-skin-state>현재 적용: 원본 캔버스 렌더러</p>
        <canvas class="test-lab-ai-tank-quick-canvas" width="320" height="270" data-lab-ai-tank-quick></canvas>
        <div class="test-lab-section-title test-lab-ai-tank-subtitle">
          <strong>원본 / AI 비교</strong>
          <span>64px, 48px, 32px 판독 테스트</span>
        </div>
        <canvas class="test-lab-ai-tank-canvas" width="980" height="360" data-lab-ai-tank-comparison></canvas>
        <div class="test-lab-ai-tank-metrics">
          ${renderMetrics()}
        </div>
      </div>
      ${renderCatalogSection()}
    `;
  }

  function ensureVisibleTestTank(game) {
    const tanks = (game?.tanks || []).filter((tank) => tank?.vehicleType === "tank");
    if (tanks.length > 0) return tanks.length;
    const tank = game?.spawnTestLabTank?.();
    if (tank && game.player) {
      tank.x = game.player.x - 220;
      tank.y = game.player.y + 20;
      tank.angle = 0;
      tank.turretAngle = 0;
      tank.machineGunAngle = 0;
    }
    return tank ? 1 : 0;
  }

  const baseDrawTank = IronLine.Renderer?.prototype?.drawTank;
  if (baseDrawTank) {
    IronLine.Renderer.prototype.drawTank = function drawTankWithTestLabAsset(game, tank) {
      if (game?.testLab && game.testLabTankSkin === "ai-assembled" && tank?.vehicleType === "tank") {
        drawGeneratedTankSprite(this, game, tank, baseDrawTank);
        return;
      }
      baseDrawTank.call(this, game, tank);
    };
  }

  const baseSetMode = TestLabUI.prototype.setMode;
  TestLabUI.prototype.setMode = function setModeWithAssetPreview(mode) {
    if (mode === "skin") this.collapsed = false;
    if (baseSetMode) return baseSetMode.call(this, mode);
    return undefined;
  };

  const baseRenderSkinBody = TestLabUI.prototype.renderSkinBody;
  TestLabUI.prototype.renderSkinBody = function renderSkinBodyWithAssetPreview() {
    const base = baseRenderSkinBody ? baseRenderSkinBody.call(this) : "";
    return `${renderAssetSection()}${base}`;
  };

  const baseUpdateDynamic = TestLabUI.prototype.updateDynamic;
  TestLabUI.prototype.updateDynamic = function updateDynamicWithAssetPreview() {
    if (baseUpdateDynamic) baseUpdateDynamic.call(this);
    if (this.mode === "skin") this.updateAssetTankComparison();
  };

  const baseOnChange = TestLabUI.prototype.onChange;
  TestLabUI.prototype.onChange = function onChangeWithAssetPreview(event) {
    const target = event.target;
    if (target?.matches?.("[data-lab-tank-skin-select]")) {
      this.selectedTankSkin = target.value || "original";
      this.updateAssetTankComparison();
      return;
    }
    if (baseOnChange) baseOnChange.call(this, event);
  };

  const baseHandleAction = TestLabUI.prototype.handleAction;
  TestLabUI.prototype.handleAction = function handleActionWithAssetPreview(action) {
    if (action === "apply-tank-skin") {
      ensureVisibleTestTank(this.game);
      this.game.testLabTankSkin = this.selectedTankSkin || this.root?.querySelector("[data-lab-tank-skin-select]")?.value || "original";
      this.updateAssetTankComparison();
      this.game.canvas?.focus?.();
      return;
    }
    if (action === "reset-tank-skin") {
      this.selectedTankSkin = "original";
      this.game.testLabTankSkin = "original";
      const select = this.root?.querySelector("[data-lab-tank-skin-select]");
      if (select) select.value = "original";
      this.updateAssetTankComparison();
      this.game.canvas?.focus?.();
      return;
    }
    if (baseHandleAction) baseHandleAction.call(this, action);
  };

  TestLabUI.prototype.updateAssetTankComparison = function updateAssetTankComparison() {
    if (!this.selectedTankSkin) this.selectedTankSkin = this.game?.testLabTankSkin || "original";
    const select = this.root?.querySelector("[data-lab-tank-skin-select]");
    if (select && select.value !== this.selectedTankSkin) select.value = this.selectedTankSkin;
    const state = this.root?.querySelector("[data-lab-tank-skin-state]");
    if (state) {
      const current = this.game?.testLabTankSkin === "ai-assembled" ? "AI 테스트 탱크 PNG" : "원본 캔버스 렌더러";
      const selected = this.selectedTankSkin === "ai-assembled" ? "AI 테스트 탱크 PNG" : "원본 캔버스 렌더러";
      const count = (this.game?.tanks || []).filter((tank) => tank?.vehicleType === "tank").length;
      state.textContent = `현재 적용: ${current} / 선택: ${selected} / 테스트 전차: ${count}대`;
    }
    const quickCanvas = this.root?.querySelector("[data-lab-ai-tank-quick]");
    if (quickCanvas) drawQuickComparison(this.game, quickCanvas);
    const canvas = this.root?.querySelector("[data-lab-ai-tank-comparison]");
    if (!canvas) return;
    drawComparison(this.game, canvas);
  };
})(window);
