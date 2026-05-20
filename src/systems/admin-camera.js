"use strict";

(function registerAdminObserverCamera(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { clamp } = IronLine.math;

  class AdminObserverCamera {
    constructor(game) {
      this.game = game;
      this.center = { x: 0, y: 0 };
      this.followTarget = null;
      this.initialized = false;
      this.wheelHandler = (event) => this.onWheel(event);
      window.addEventListener("wheel", this.wheelHandler, { passive: false });
    }

    activate() {
      this.initialized = false;
      this.ensureHelp();
    }

    update(dt) {
      const game = this.game;
      if (!game.adminObserverMode) return false;
      this.ensureHelp();
      if (!this.initialized) this.fitWorld();
      if (game.input.consumePress("Home")) {
        this.followTarget = null;
        this.fitWorld();
      }
      this.updateFollowTarget();
      this.applyKeyboard(dt);
      this.applyCamera();
      game.input.updateWorld(game.camera);
      return true;
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

    availableViewSize() {
      const panel = document.getElementById("adminPanel");
      const panelWidth = panel?.getBoundingClientRect?.().width || 0;
      return {
        width: Math.max(320, this.game.camera.width - panelWidth - 42),
        height: Math.max(240, this.game.camera.height - 28)
      };
    }

    applyKeyboard(dt) {
      if (document.activeElement?.closest?.("#adminPanel")) return;
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
      this.center.x = target.x;
      this.center.y = target.y;
      this.applyCamera();
      return true;
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
      if (!game.adminObserverMode || event.target?.closest?.("#adminPanel")) return;
      event.preventDefault();
      if (!this.initialized) this.fitWorld();
      this.followTarget = null;
      const zoomFactor = event.deltaY < 0 ? 1.12 : 0.89;
      game.camera.zoom = clamp((game.camera.zoom || 1) * zoomFactor, 0.16, 1.25);
      this.applyCamera();
      game.input.updateWorld(game.camera);
    }

    ensureHelp() {
      const existing = document.getElementById("adminObserverHelp");
      const title = this.game.spectatorMode ? "관전자" : "관리자 관전";
      const html = `<strong>${title}</strong>WASD/방향키 이동 · Shift 빠른 이동 · 휠 줌 · Home 전체 지도 · 목록 클릭 추적`;
      if (existing) {
        if (existing.dataset.title === title) return;
        existing.dataset.title = title;
        existing.innerHTML = html;
        return;
      }
      const help = document.createElement("div");
      help.id = "adminObserverHelp";
      help.className = "admin-observer-help";
      help.dataset.title = title;
      help.innerHTML = html;
      document.body.append(help);
    }
  }

  IronLine.AdminObserverCamera = AdminObserverCamera;
})(window);
