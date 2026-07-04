"use strict";

(function registerMobileCameraGestures(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const clamp = IronLine.math?.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));

  function installMobileCameraGestures(Game) {
    const originalSetMobileControls = Game.prototype.setMobileControls;
    const originalWheel = Game.prototype.onPlayerCameraWheel;
    const originalUpdateCamera = Game.prototype.updateCamera;

    Game.prototype.setMobileControls = function setMobileControls(enabled) {
      const result = originalSetMobileControls.call(this, enabled);
      if (this.settings?.mobileControls) {
        this.cameraZoomPreference = Math.min(this.cameraZoomPreference || 1, 0.7);
        this.mobileCameraDefaultApplied = true;
      } else {
        this.cameraZoomPreference = Math.max(this.cameraZoomPreference || 1, 1);
        this.mobileCameraDefaultApplied = false;
      }
      return result;
    };

    Game.prototype.onPlayerCameraWheel = function onPlayerCameraWheel(event) {
      if (!this.settings?.mobileControls) return originalWheel.call(this, event);
      if (this.adminObserverMode || this.entryOpen || this.deploymentOpen || this.lobbyOpen || this.roomListOpen || this.result) return;
      if (!this.matchStarted || this.playerDeathActive || this.playerDowned) return;
      if (event.target?.closest?.("#adminPanel, #chatPanel, #settingsPanel, .command-panel, .deployment-map")) return;
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.1 : 0.9;
      this.cameraZoomPreference = clamp((this.cameraZoomPreference || 0.7) * factor, 0.55, 1.3);
    };

    Game.prototype.updateCamera = function updateCamera(dt) {
      const mobileCameraMode = Boolean(this.settings?.mobileControls);
      if (!mobileCameraMode) return originalUpdateCamera.call(this, dt);
      if (!this.mobileCameraDefaultApplied) {
        this.cameraZoomPreference = Math.min(this.cameraZoomPreference || 1, 0.7);
        this.mobileCameraDefaultApplied = true;
      }

      const savedZoomPreference = this.cameraZoomPreference || 0.7;
      const tankAimMode = Boolean(this.player?.inTank && this.input?.mouse?.rightDown);
      const droneControlMode = Boolean(this.player?.controlledDrone?.alive);
      const scoutAimMode = Boolean(this.isPlayerScoutAimMode?.());
      const aimingCameraMode = tankAimMode || droneControlMode || scoutAimMode ||
        Boolean(this.isPlayerRpgAimMode?.() || this.isPlayerMachineGunAimMode?.() || this.isPlayerPistolAimMode?.());
      if (aimingCameraMode) {
        this.cameraZoomPreference = clamp(savedZoomPreference * (scoutAimMode ? 0.7 : 0.85), 0.55, 1.3);
      }
      try {
        return originalUpdateCamera.call(this, dt);
      } finally {
        this.cameraZoomPreference = savedZoomPreference;
      }
    };

    Game.prototype.setupMobileCameraGestures = function setupMobileCameraGestures() {
      const canvas = this.canvas;
      if (!canvas) return;

      const pointers = new Map();
      let lastPinchDistance = 0;
      const pinchDistance = () => {
        const items = Array.from(pointers.values());
        if (items.length < 2) return 0;
        return Math.hypot(items[0].x - items[1].x, items[0].y - items[1].y);
      };
      const shouldUseTouchZoom = (event) => (
        event.pointerType === "touch" &&
        (this.settings?.mobileLike || this.settings?.mobileControls) &&
        this.matchStarted && !this.entryOpen && !this.deploymentOpen &&
        !this.lobbyOpen && !this.roomListOpen && !this.result
      );

      canvas.addEventListener("pointerdown", (event) => {
        if (!shouldUseTouchZoom(event)) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size >= 2) {
          event.preventDefault();
          canvas.setPointerCapture?.(event.pointerId);
          lastPinchDistance = pinchDistance();
        }
      }, { passive: false });

      canvas.addEventListener("pointermove", (event) => {
        if (!pointers.has(event.pointerId)) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size < 2) return;
        event.preventDefault();
        const distance = pinchDistance();
        if (lastPinchDistance > 24 && distance > 24) {
          const factor = clamp(distance / lastPinchDistance, 0.92, 1.08);
          this.cameraZoomPreference = clamp((this.cameraZoomPreference || 1) * factor, 0.55, 1.3);
        }
        lastPinchDistance = distance;
      }, { passive: false });

      const clearPointer = (event) => {
        pointers.delete(event.pointerId);
        if (pointers.size < 2) lastPinchDistance = 0;
      };
      canvas.addEventListener("pointerup", clearPointer);
      canvas.addEventListener("pointercancel", clearPointer);
      canvas.addEventListener("pointerleave", clearPointer);
    };
  }

  IronLine.installMobileCameraGestures = installMobileCameraGestures;
})(window);
