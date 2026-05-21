"use strict";

(function registerAdminObserverCamera(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { clamp } = IronLine.math;
  const { TEAM } = IronLine.constants || {};

  class AdminObserverCamera {
    constructor(game) {
      this.game = game;
      this.center = { x: 0, y: 0 };
      this.followTarget = null;
      this.initialized = false;
      this.drag = null;
      this.touchPointers = new Map();
      this.pinch = null;
      this.dragClickThreshold = 6;
      this.wheelHandler = (event) => this.onWheel(event);
      this.pointerDownHandler = (event) => this.onPointerDown(event);
      this.pointerMoveHandler = (event) => this.onPointerMove(event);
      this.pointerUpHandler = (event) => this.onPointerUp(event);
      window.addEventListener("wheel", this.wheelHandler, { passive: false });
      game.canvas?.addEventListener("pointerdown", this.pointerDownHandler);
      game.canvas?.addEventListener("pointermove", this.pointerMoveHandler);
      game.canvas?.addEventListener("pointerup", this.pointerUpHandler);
      game.canvas?.addEventListener("pointercancel", this.pointerUpHandler);
    }

    activate() {
      this.initialized = false;
      this.ensureHelp();
    }

    update(dt) {
      const game = this.game;
      if (!this.isCameraActive()) return false;
      this.ensureHelp();
      if (!this.initialized) this.initializeView();
      if (game.input.consumePress("Escape")) this.followTarget = null;
      if (game.input.consumePress("Home")) {
        this.followTarget = null;
        this.fitWorld();
      }
      if (game.input.consumePress("KeyN")) this.cycleFollowTarget(1);
      if (game.input.consumePress("KeyB")) this.cycleFollowTarget(-1);
      this.updateFollowTarget();
      this.applyKeyboard(dt);
      this.applyCamera();
      game.input.updateWorld(game.camera);
      return true;
    }

    isCameraActive() {
      const game = this.game;
      return Boolean(game.adminObserverMode || game.spectatorMode || game.isRoundSpectatorMode?.());
    }

    isSpectatorCamera() {
      const game = this.game;
      return Boolean(game.spectatorMode || game.isRoundSpectatorMode?.());
    }

    initializeView() {
      if (this.isSpectatorCamera() && this.focusDefaultSpectatorTarget()) return;
      this.fitWorld();
    }

    fitWorld() {
      const { game } = this;
      const view = this.availableViewSize();
      const zoomX = view.width / Math.max(1, game.world.width);
      const zoomY = view.height / Math.max(1, game.world.height);
      game.camera.zoom = clamp(Math.min(zoomX, zoomY) * 0.9, 0.16, 1);
      this.center.x = game.world.width / 2;
      this.center.y = game.world.height / 2;
      this.initialized = true;
      this.applyCamera();
    }

    focusDefaultSpectatorTarget() {
      const game = this.game;
      const nearPoint = game.isRoundSpectatorMode?.() && game.player
        ? { x: game.player.x, y: game.player.y }
        : null;
      const target = this.spectatorTargets({ nearPoint })[0] || null;
      if (!target) return false;
      game.camera.zoom = clamp(Math.max(game.camera.zoom || 0, 0.92), 0.72, 1.45);
      this.followTarget = { kind: target.kind, id: target.id };
      this.center.x = target.x;
      this.center.y = target.y;
      this.initialized = true;
      this.applyCamera();
      game.input.updateWorld(game.camera);
      return true;
    }

    availableViewSize() {
      if (document.body?.classList.contains("admin-standalone-page") && window.innerWidth > 760) {
        return {
          width: Math.max(320, this.game.camera.width - 28),
          height: Math.max(240, this.game.camera.height - 28)
        };
      }

      const panel = document.getElementById("adminPanel");
      const panelWidth = panel?.getBoundingClientRect?.().width || 0;
      return {
        width: Math.max(320, this.game.camera.width - panelWidth - 42),
        height: Math.max(240, this.game.camera.height - 28)
      };
    }

    applyKeyboard(dt) {
      if (document.activeElement?.closest?.("#adminPanel") || this.game.chat?.open) return;
      const input = this.game.input;
      const x = input.axis("KeyA", "ArrowLeft", "KeyD", "ArrowRight");
      const y = input.axis("KeyW", "ArrowUp", "KeyS", "ArrowDown");
      if (!x && !y) return;
      this.followTarget = null;
      const length = Math.hypot(x, y) || 1;
      const shift = input.keyDown("ShiftLeft") || input.keyDown("ShiftRight");
      const speed = (680 + this.game.camera.viewWidth * 0.22) * (shift ? 2.1 : 1);
      this.center.x += (x / length) * speed * dt;
      this.center.y += (y / length) * speed * dt;
    }

    followInspectTarget(kind, id) {
      const target = this.resolveInspectTarget(kind, id);
      if (!target) return false;
      this.followTarget = { kind, id: String(id) };
      if (this.isSpectatorCamera()) {
        this.game.camera.zoom = clamp(Math.max(this.game.camera.zoom || 0, 0.9), 0.72, 1.8);
      }
      this.center.x = target.x;
      this.center.y = target.y;
      this.initialized = true;
      this.applyCamera();
      return true;
    }

    cycleFollowTarget(direction = 1) {
      const targets = this.spectatorTargets();
      if (!targets.length) {
        this.followTarget = null;
        this.fitWorld();
        return false;
      }
      const step = direction < 0 ? -1 : 1;
      const currentIndex = this.followTarget
        ? targets.findIndex((item) => item.kind === this.followTarget.kind && item.id === this.followTarget.id)
        : -1;
      const baseIndex = currentIndex >= 0 ? currentIndex : (step > 0 ? -1 : 0);
      const next = targets[(baseIndex + step + targets.length) % targets.length];
      return this.followInspectTarget(next.kind, next.id);
    }

    currentTargetInfo() {
      if (!this.followTarget) return null;
      return this.spectatorTargets().find((item) => (
        item.kind === this.followTarget.kind && item.id === this.followTarget.id
      )) || null;
    }

    targetLabel() {
      const target = this.currentTargetInfo();
      if (!target) return "";
      return target.label || target.id || "";
    }

    spectatorTargets(options = {}) {
      const game = this.game;
      const targets = [];
      const teamLabel = (team) => team === TEAM?.RED ? "\uD64D\uD300" : "\uCCAD\uD300";
      const add = (kind, entity, label, priority = 50) => {
        if (!entity?.callSign || entity.alive === false || entity.active === false || entity.destroyed === true) return;
        if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y)) return;
        if (entity.inVehicle) return;
        const distance = options.nearPoint
          ? Math.hypot(entity.x - options.nearPoint.x, entity.y - options.nearPoint.y)
          : 0;
        targets.push({
          kind,
          id: String(entity.callSign),
          label: `${entity.callSign} · ${teamLabel(entity.team)} ${label}`,
          x: entity.x,
          y: entity.y,
          team: entity.team || "",
          priority,
          distance
        });
      };

      for (const vehicle of game.tanks || []) add("vehicle", vehicle, "\uC804\uCC28", 10);
      for (const vehicle of game.humvees || []) add("vehicle", vehicle, "\uAE30\uAC11", 18);
      for (const unit of game.infantry || []) add("infantry", unit, "\uBCF4\uBCD1", 30);
      for (const crew of game.crews || []) add("crew", crew, "\uC2B9\uBB34\uC6D0", 35);
      for (const drone of game.drones || []) add("drone", drone, "\uB4DC\uB860", 40);

      targets.sort((a, b) => {
        if (options.nearPoint && Math.abs(a.distance - b.distance) > 1) return a.distance - b.distance;
        return a.priority - b.priority || String(a.team).localeCompare(String(b.team)) || a.id.localeCompare(b.id);
      });
      return targets;
    }

    updateFollowTarget() {
      if (!this.followTarget) return;
      const target = this.resolveInspectTarget(this.followTarget.kind, this.followTarget.id);
      if (!target) {
        this.followTarget = null;
        return;
      }
      this.center.x = target.x;
      this.center.y = target.y;
    }

    resolveInspectTarget(kind, id) {
      const game = this.game;
      const key = String(id || "");
      if (!key) return null;
      if (kind === "slot") {
        const slot = game.onlineSession?.roleSlots?.find((item) => item.id === key);
        return this.resolveInspectTarget("squad", slot?.squadIds?.[0]) ||
          this.resolveInspectTarget("vehicle", slot?.vehicleIds?.[0]);
      }
      if (kind === "vehicle") {
        return [...(game.tanks || []), ...(game.humvees || [])]
          .find((vehicle) => vehicle.callSign === key && vehicle.alive !== false) || null;
      }
      if (kind === "infantry" || kind === "unit") {
        return (game.infantry || []).find((unit) => unit.callSign === key && unit.alive !== false && !unit.inVehicle) || null;
      }
      if (kind === "crew") {
        return (game.crews || []).find((crew) => crew.callSign === key && crew.alive !== false) || null;
      }
      if (kind === "drone") {
        return (game.drones || []).find((drone) => drone.callSign === key && drone.active !== false && drone.destroyed !== true) || null;
      }
      if (kind === "objective") {
        return (game.capturePoints || []).find((point) => point.name === key) || null;
      }
      const squad = (game.squads || []).find((item) => item.callSign === key);
      if (!squad) return null;
      const units = squad.activeUnits?.() || (squad.units || []).filter((unit) => unit.alive !== false);
      if (!units.length) return null;
      return {
        x: units.reduce((sum, unit) => sum + unit.x, 0) / units.length,
        y: units.reduce((sum, unit) => sum + unit.y, 0) / units.length
      };
    }

    applyCamera() {
      const { game } = this;
      const camera = game.camera;
      camera.viewWidth = camera.width / Math.max(0.1, camera.zoom || 1);
      camera.viewHeight = camera.height / Math.max(0.1, camera.zoom || 1);
      this.center.x = clamp(this.center.x, camera.viewWidth / 2, Math.max(camera.viewWidth / 2, game.world.width - camera.viewWidth / 2));
      this.center.y = clamp(this.center.y, camera.viewHeight / 2, Math.max(camera.viewHeight / 2, game.world.height - camera.viewHeight / 2));
      camera.x = clamp(this.center.x - camera.viewWidth / 2, 0, Math.max(0, game.world.width - camera.viewWidth));
      camera.y = clamp(this.center.y - camera.viewHeight / 2, 0, Math.max(0, game.world.height - camera.viewHeight));
    }

    onWheel(event) {
      const game = this.game;
      if (!this.isCameraActive() || event.target?.closest?.("#adminPanel, #chatPanel, #spectatorPanel")) return;
      event.preventDefault();
      if (!this.initialized) this.initializeView();
      const zoomFactor = event.deltaY < 0 ? 1.12 : 0.89;
      this.zoomAt(event.clientX, event.clientY, zoomFactor);
      game.input.updateWorld(game.camera);
    }

    onPointerDown(event) {
      const game = this.game;
      if (!this.isCameraActive() || event.button > 0 || event.target?.closest?.("#adminPanel, #chatPanel, #spectatorPanel")) return;
      if (!this.initialized) this.initializeView();
      event.preventDefault();
      if (event.pointerType === "touch") {
        this.touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        game.canvas?.setPointerCapture?.(event.pointerId);
        if (this.touchPointers.size >= 2) {
          this.drag = null;
          this.followTarget = null;
          this.pinch = this.pinchState();
          return;
        }
      }
      this.drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        moved: false
      };
      game.canvas?.setPointerCapture?.(event.pointerId);
    }

    onPointerMove(event) {
      if (this.touchPointers.has(event.pointerId)) {
        this.touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.touchPointers.size >= 2) {
          event.preventDefault();
          if (!this.initialized) this.fitWorld();
          const next = this.pinchState();
          if (this.pinch && this.pinch.distance > 24 && next.distance > 24) {
            const factor = clamp(next.distance / this.pinch.distance, 0.88, 1.14);
            this.zoomAt(next.x, next.y, factor);
            const zoom = Math.max(0.1, this.game.camera.zoom || 1);
            this.center.x -= (next.x - this.pinch.x) / zoom;
            this.center.y -= (next.y - this.pinch.y) / zoom;
            this.applyCamera();
            this.game.input.updateWorld(this.game.camera);
          }
          this.pinch = next;
          return;
        }
      }
      if (!this.drag || event.pointerId !== this.drag.id) return;
      event.preventDefault();
      const game = this.game;
      const totalMove = Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY);
      if (!this.drag.moved && totalMove < this.dragClickThreshold) return;
      if (!this.drag.moved) {
        this.drag.moved = true;
        this.followTarget = null;
      }
      const zoom = Math.max(0.1, game.camera.zoom || 1);
      this.center.x -= (event.clientX - this.drag.x) / zoom;
      this.center.y -= (event.clientY - this.drag.y) / zoom;
      this.drag.x = event.clientX;
      this.drag.y = event.clientY;
      this.applyCamera();
      game.input.updateWorld(game.camera);
    }

    onPointerUp(event) {
      if (this.touchPointers.has(event.pointerId)) {
        this.touchPointers.delete(event.pointerId);
        if (this.touchPointers.size < 2) this.pinch = null;
      }
      if (!this.drag || event.pointerId !== this.drag.id) return;
      event?.preventDefault?.();
      const wasClick = !this.drag.moved &&
        Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY) < this.dragClickThreshold;
      if (wasClick) this.followTargetAt(event.clientX, event.clientY);
      this.drag = null;
    }

    pinchState() {
      const items = Array.from(this.touchPointers.values()).slice(0, 2);
      if (items.length < 2) return null;
      return {
        x: (items[0].x + items[1].x) / 2,
        y: (items[0].y + items[1].y) / 2,
        distance: Math.hypot(items[0].x - items[1].x, items[0].y - items[1].y)
      };
    }

    zoomAt(clientX, clientY, factor) {
      const camera = this.game.camera;
      const oldZoom = Math.max(0.1, camera.zoom || 1);
      const worldX = camera.x + clientX / oldZoom;
      const worldY = camera.y + clientY / oldZoom;
      camera.zoom = clamp(oldZoom * factor, 0.12, 2.4);
      camera.viewWidth = camera.width / Math.max(0.1, camera.zoom || 1);
      camera.viewHeight = camera.height / Math.max(0.1, camera.zoom || 1);
      this.center.x = worldX - clientX / camera.zoom + camera.viewWidth / 2;
      this.center.y = worldY - clientY / camera.zoom + camera.viewHeight / 2;
      this.applyCamera();
    }

    followTargetAt(clientX, clientY) {
      const target = this.pickInspectTargetAt(clientX, clientY);
      if (!target) return false;
      return this.followInspectTarget(target.kind, target.id);
    }

    pickInspectTargetAt(clientX, clientY) {
      const game = this.game;
      const zoom = Math.max(0.1, game.camera.zoom || 1);
      const worldX = clientX / zoom + game.camera.x;
      const worldY = clientY / zoom + game.camera.y;
      const candidates = [];
      const addCandidate = (kind, entity, radius) => {
        if (!entity?.callSign || entity.alive === false || entity.active === false || entity.destroyed === true) return;
        if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y)) return;
        const distance = Math.hypot(entity.x - worldX, entity.y - worldY);
        const hitRadius = Math.max(8, radius || entity.radius || 18);
        if (distance > hitRadius) return;
        candidates.push({
          kind,
          id: entity.callSign,
          distance,
          priority: kind === "vehicle" ? 1 : kind === "infantry" ? 2 : 3
        });
      };

      for (const vehicle of [...(game.tanks || []), ...(game.humvees || [])]) {
        addCandidate("vehicle", vehicle, (vehicle.radius || 34) + 12);
      }
      for (const unit of game.infantry || []) {
        if (unit.inVehicle) continue;
        addCandidate("infantry", unit, 18);
      }
      for (const crew of game.crews || []) addCandidate("crew", crew, 16);
      for (const drone of game.drones || []) addCandidate("drone", drone, 16);
      candidates.sort((a, b) => a.distance - b.distance || a.priority - b.priority);
      return candidates[0] || null;
    }

    ensureHelp() {
      document.getElementById("adminObserverHelp")?.remove?.();
    }
  }

  IronLine.AdminObserverCamera = AdminObserverCamera;
})(window);
