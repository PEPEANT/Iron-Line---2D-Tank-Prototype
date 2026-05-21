"use strict";

(function registerTestLabObjects(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const TestLabUI = IronLine.TestLabUI;
  if (!TestLabUI) return;

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

  Object.assign(TestLabUI.prototype, {
    renderObjectsBody() {
      const catalog = IronLine.sceneryCatalog?.obstacleKinds || [];
      const options = catalog.map((item) => `
        <option value="${escapeHtml(item.kind)}"${item.kind === this.selectedObjectKind ? " selected" : ""}>
          ${escapeHtml(item.label || item.kind)}
        </option>
      `).join("");
      return `
        <div class="test-lab-section">
          <div class="test-lab-section-title">
            <strong>전시장 조작</strong>
            <span>밝은 바닥에서 형태 확인</span>
          </div>
          <div class="test-lab-actions is-two">
            <button type="button" data-lab-action="focus-gallery"><span>이동</span>전시장 보기</button>
            <button type="button" data-lab-action="clear-objects"><span>정리</span>배치 삭제</button>
          </div>
          <label class="test-lab-select">
            <span>배치할 오브젝트</span>
            <select data-lab-object-select>${options}</select>
          </label>
          <div class="test-lab-actions is-one">
            <button type="button" data-lab-action="place-object"><span>배치</span>설정창 열기</button>
          </div>
        </div>
        <div class="test-lab-section">
          <div class="test-lab-section-title">
            <strong>카탈로그</strong>
            <span>건물/장식류 샘플</span>
          </div>
          <div class="test-lab-object-grid" data-lab-object-grid></div>
          <p class="test-lab-audio-status" data-lab-object-status></p>
        </div>
      `;
    },

    focusObjectGallery() {
      const game = this.game;
      const focus = game?.world?.testLab?.galleryFocus || { x: 760, y: 760 };
      if (!game?.player) return;
      game.player.inTank = null;
      game.player.x = focus.x;
      game.player.y = focus.y;
      game.player.angle = 0;
      if (game.camera) {
        game.camera.x = clamp(focus.x - game.camera.viewWidth / 2, 0, Math.max(0, game.world.width - game.camera.viewWidth));
        game.camera.y = clamp(focus.y - game.camera.viewHeight / 2, 0, Math.max(0, game.world.height - game.camera.viewHeight));
      }
    },

    selectedObjectCatalogItem() {
      const catalog = IronLine.sceneryCatalog?.obstacleKinds || [];
      return catalog.find((item) => item.kind === this.selectedObjectKind) || catalog[0] || null;
    },

    openObjectDialog(kind = this.selectedObjectKind) {
      const catalog = IronLine.sceneryCatalog?.obstacleKinds || [];
      const item = catalog.find((entry) => entry.kind === kind) || this.selectedObjectCatalogItem();
      if (!item || !this.dialog) return;
      this.selectedObjectKind = item.kind;
      const size = IronLine.sceneryCatalog?.defaultSize?.(item.kind) || item.defaultSize || { w: 160, h: 60 };
      const variants = item.variants || [];
      const variantOptions = variants.map(([id, label]) => (
        `<option value="${escapeHtml(id)}">${escapeHtml(label || id)}</option>`
      )).join("");
      this.dialog.classList.remove("hidden");
      this.dialog.innerHTML = `
        <div class="test-lab-dialog-card" role="dialog" aria-modal="true">
          <header>
            <div>
              <span>배치 설정</span>
              <strong>${escapeHtml(item.label || item.kind)}</strong>
            </div>
            <button type="button" data-lab-action="close-object-dialog" aria-label="닫기">닫기</button>
          </header>
          <div class="test-lab-dialog-grid">
            <label>
              <span>형태</span>
              <select data-lab-object-variant>${variantOptions}</select>
            </label>
            <label>
              <span>가로</span>
              <input type="number" min="20" max="900" step="10" value="${Math.round(size.w)}" data-lab-object-width>
            </label>
            <label>
              <span>세로</span>
              <input type="number" min="20" max="900" step="10" value="${Math.round(size.h)}" data-lab-object-height>
            </label>
            <label>
              <span>각도</span>
              <input type="number" min="-180" max="180" step="5" value="0" data-lab-object-angle>
            </label>
          </div>
          <p>플레이어가 바라보는 방향 앞쪽에 배치됩니다. 실험장 전용 배치라 실전 맵은 건드리지 않습니다.</p>
          <div class="test-lab-dialog-actions">
            <button type="button" data-lab-action="confirm-object-place">맵에 배치</button>
            <button type="button" data-lab-action="close-object-dialog">취소</button>
          </div>
        </div>
      `;
      this.objectGridSignature = "";
      this.updateObjectGrid();
    },

    closeObjectDialog() {
      if (!this.dialog) return;
      this.dialog.classList.add("hidden");
      this.dialog.innerHTML = "";
    },

    confirmObjectPlacement() {
      if (!this.dialog || this.dialog.classList.contains("hidden")) return;
      const item = this.selectedObjectCatalogItem();
      const fallback = IronLine.sceneryCatalog?.defaultSize?.(item?.kind) || item?.defaultSize || { w: 160, h: 60 };
      this.objectPlacementDraft = {
        variant: this.dialog.querySelector("[data-lab-object-variant]")?.value || IronLine.sceneryCatalog?.defaultVariant?.(item?.kind) || "",
        w: clamp(this.dialog.querySelector("[data-lab-object-width]")?.value, 20, 900) || fallback.w,
        h: clamp(this.dialog.querySelector("[data-lab-object-height]")?.value, 20, 900) || fallback.h,
        angle: (Number(this.dialog.querySelector("[data-lab-object-angle]")?.value) || 0) * Math.PI / 180
      };
      this.placeSelectedObject();
      this.closeObjectDialog();
    },

    placeSelectedObject() {
      const game = this.game;
      const item = this.selectedObjectCatalogItem();
      if (!game?.world || !game.player || !item) return;
      const defaultSize = IronLine.sceneryCatalog?.defaultSize?.(item.kind) || item.defaultSize || { w: 160, h: 60 };
      const draft = this.objectPlacementDraft || {};
      const size = {
        w: draft.w || defaultSize.w,
        h: draft.h || defaultSize.h
      };
      const variant = draft.variant || IronLine.sceneryCatalog?.defaultVariant?.(item.kind) || item.variants?.[0]?.[0] || "";
      const distance = 190;
      const playerAngle = game.player.angle || 0;
      const objectAngle = draft.angle ?? playerAngle;
      const centerX = clamp(game.player.x + Math.cos(playerAngle) * distance, 120, game.world.width - 120);
      const centerY = clamp(game.player.y + Math.sin(playerAngle) * distance, 120, game.world.height - 120);
      const id = `lab-place-${Date.now().toString(36)}-${this.placedObjectSerial++}`;
      const destructible = Boolean(item.destructible);
      const hp = item.kind === "tree" ? 35 : item.kind === "rubble" ? 24 : 30;
      const fixedObstacle = ["building", "base-wall", "concrete"].includes(item.kind);

      if (fixedObstacle) {
        game.world.obstacles.push({
          id,
          x: centerX - size.w * 0.5,
          y: centerY - size.h * 0.5,
          w: size.w,
          h: size.h,
          kind: item.kind,
          variant,
          angle: objectAngle
        });
      } else if (["tree", "brush", "rubble"].includes(item.kind)) {
        game.world.scenery = game.world.scenery || [];
        game.world.scenery.push({
          id,
          type: item.kind,
          variant,
          x: centerX,
          y: centerY,
          r: Math.max(size.w, size.h) * 0.5,
          destructible,
          maxHp: destructible ? hp : 0,
          baseHp: destructible ? hp : 0,
          hp: destructible ? hp : 0,
          stopsProjectiles: item.kind !== "brush"
        });
      } else {
        game.world.scenery = game.world.scenery || [];
        game.world.scenery.push({
          id,
          type: item.kind,
          variant,
          x: centerX - size.w * 0.5,
          y: centerY - size.h * 0.5,
          w: size.w,
          h: size.h,
          angle: objectAngle,
          destructible,
          maxHp: destructible ? hp : 0,
          baseHp: destructible ? hp : 0,
          hp: destructible ? hp : 0,
          stopsProjectiles: true
        });
      }
      this.objectPlacementDraft = null;
      this.updateObjectGrid();
    },

    clearPlacedObjects() {
      const world = this.game?.world;
      if (!world) return;
      world.obstacles = (world.obstacles || []).filter((item) => !String(item.id || "").startsWith("lab-place-"));
      world.scenery = (world.scenery || []).filter((item) => !String(item.id || "").startsWith("lab-place-"));
      this.updateObjectGrid();
    },

    placedObjectCount() {
      const world = this.game?.world || {};
      return [...(world.obstacles || []), ...(world.scenery || [])]
        .filter((item) => String(item.id || "").startsWith("lab-place-"))
        .length;
    },

    updateObjectGrid() {
      const target = this.root?.querySelector("[data-lab-object-grid]");
      if (!target) return;
      const catalog = IronLine.sceneryCatalog?.obstacleKinds || [];
      const placed = this.placedObjectCount();
      const signature = `${this.selectedObjectKind}:${placed}:${catalog.length}`;
      if (this.objectGridSignature === signature) return;
      this.objectGridSignature = signature;
      target.innerHTML = catalog.map((item) => {
        const size = IronLine.sceneryCatalog?.defaultSize?.(item.kind) || item.defaultSize || { w: 0, h: 0 };
        const active = item.kind === this.selectedObjectKind ? " is-active" : "";
        return `
          <button type="button" class="test-lab-object${active}" data-lab-object-kind="${escapeHtml(item.kind)}">
            <span>${escapeHtml(item.group || "오브젝트")}</span>
            <strong>${escapeHtml(item.label || item.kind)}</strong>
            <small>${Math.round(size.w)} x ${Math.round(size.h)} · ${escapeHtml(item.variants?.length || 0)}종</small>
          </button>
        `;
      }).join("");

      const status = this.root.querySelector("[data-lab-object-status]");
      if (status) {
        const item = this.selectedObjectCatalogItem();
        status.textContent = `${item?.label || item?.kind || "오브젝트"} 선택됨 · 직접 배치 ${placed}개`;
      }
    }
  });
})(window);
