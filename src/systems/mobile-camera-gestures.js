"use strict";

(function registerMobileCameraGestures(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const clamp = IronLine.math?.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));

  function installMobileCameraGestures(Game) {
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
          this.cameraZoomPreference = clamp((this.cameraZoomPreference || 1) * factor, 0.72, 1.55);
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
