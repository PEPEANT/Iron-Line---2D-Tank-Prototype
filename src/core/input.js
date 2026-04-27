"use strict";

(function registerInput(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  class Input {
    constructor() {
      this.keys = new Set();
      this.pressed = new Set();
      this.mouse = {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        worldX: 0,
        worldY: 0,
        down: false,
        leftDown: false,
        rightDown: false,
        middleDown: false,
        pressedButtons: new Set()
      };
      this.virtual = {
        enabled: false,
        axisX: 0,
        axisY: 0,
        aimX: 1,
        aimY: 0,
        keys: new Set(),
        pressed: new Set()
      };

      window.addEventListener("keydown", (event) => this.onKeyDown(event));
      window.addEventListener("keyup", (event) => this.onKeyUp(event));
      document.addEventListener("keydown", (event) => this.onKeyDown(event));
      document.addEventListener("keyup", (event) => this.onKeyUp(event));
      window.addEventListener("mousemove", (event) => {
        this.mouse.x = event.clientX;
        this.mouse.y = event.clientY;
      });
      window.addEventListener("mousedown", (event) => {
        this.setMouseButton(event.button, true);
        this.mouse.pressedButtons.add(event.button);
        if (event.button === 2) event.preventDefault();
      });
      window.addEventListener("mouseup", (event) => {
        this.setMouseButton(event.button, false);
        if (event.button === 2) event.preventDefault();
      });
      window.addEventListener("contextmenu", (event) => event.preventDefault());
      window.addEventListener("blur", () => this.clear());
    }

    setMouseButton(button, down) {
      if (button === 0) this.mouse.leftDown = down;
      if (button === 1) this.mouse.middleDown = down;
      if (button === 2) this.mouse.rightDown = down;
      this.mouse.down = this.mouse.leftDown;
    }

    setVirtualEnabled(enabled) {
      this.virtual.enabled = Boolean(enabled);
      if (!this.virtual.enabled) {
        this.clearVirtual();
        this.setMouseButton(0, false);
        this.setMouseButton(2, false);
      }
    }

    setVirtualAxis(x, y) {
      if (!this.virtual.enabled) return;
      this.virtual.axisX = Math.max(-1, Math.min(1, x || 0));
      this.virtual.axisY = Math.max(-1, Math.min(1, y || 0));
    }

    setVirtualAim(x, y) {
      if (!this.virtual.enabled) return;
      const length = Math.hypot(x, y);
      if (length < 0.12) return;
      this.virtual.aimX = x / length;
      this.virtual.aimY = y / length;
    }

    virtualAimPoint(origin, distance = 820) {
      if (!this.virtual.enabled || !origin) return null;
      return {
        x: origin.x + this.virtual.aimX * distance,
        y: origin.y + this.virtual.aimY * distance
      };
    }

    setVirtualKey(code, down) {
      if (!this.virtual.enabled || !code) return;
      if (down) {
        if (!this.virtual.keys.has(code)) this.virtual.pressed.add(code);
        this.virtual.keys.add(code);
      } else {
        this.virtual.keys.delete(code);
      }
    }

    setVirtualMouseButton(button, down) {
      if (!this.virtual.enabled) return;
      this.setMouseButton(button, down);
      if (down) this.mouse.pressedButtons.add(button);
    }

    onKeyDown(event) {
      if (["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
        event.preventDefault();
      }

      if (!event.repeat) {
        this.pressed.add(event.code);
        if (event.key === "1") this.pressed.add("Digit1");
        if (event.key === "2") this.pressed.add("Digit2");
        if (event.key === "3") this.pressed.add("Digit3");
        if (event.key?.toLowerCase() === "e") this.pressed.add("KeyE");
        if (event.key?.toLowerCase() === "f") this.pressed.add("KeyF");
      }

      this.keys.add(event.code);
      if (event.key === " ") this.keys.add("Space");
    }

    onKeyUp(event) {
      this.keys.delete(event.code);
      if (event.key === " ") this.keys.delete("Space");
    }

    clear() {
      this.keys.clear();
      this.pressed.clear();
      this.clearVirtual();
      this.mouse.down = false;
      this.mouse.leftDown = false;
      this.mouse.rightDown = false;
      this.mouse.middleDown = false;
      this.mouse.pressedButtons.clear();
    }

    clearVirtual() {
      this.virtual.axisX = 0;
      this.virtual.axisY = 0;
      this.virtual.keys.clear();
      this.virtual.pressed.clear();
    }

    updateWorld(camera) {
      const zoom = camera.zoom || 1;
      this.mouse.worldX = this.mouse.x / zoom + camera.x;
      this.mouse.worldY = this.mouse.y / zoom + camera.y;
    }

    keyDown(code) {
      return this.keys.has(code) || this.virtual.keys.has(code);
    }

    consumePress(code) {
      const keyboardPressed = this.pressed.has(code);
      const virtualPressed = this.virtual.pressed.has(code);
      if (!keyboardPressed && !virtualPressed) return false;
      this.pressed.delete(code);
      this.virtual.pressed.delete(code);
      return true;
    }

    consumeMousePress(button) {
      if (!this.mouse.pressedButtons.has(button)) return false;
      this.mouse.pressedButtons.delete(button);
      return true;
    }

    axis(negativeA, negativeB, positiveA, positiveB) {
      const keyAxis = (this.keyDown(positiveA) || this.keyDown(positiveB) ? 1 : 0) -
        (this.keyDown(negativeA) || this.keyDown(negativeB) ? 1 : 0);
      const virtualAxis = negativeA === "KeyW" || negativeA === "ArrowUp"
        ? this.virtual.axisY
        : this.virtual.axisX;
      return Math.max(-1, Math.min(1, keyAxis + virtualAxis));
    }

    endFrame() {
      this.pressed.clear();
      this.virtual.pressed.clear();
      this.mouse.pressedButtons.clear();
    }
  }

  IronLine.Input = Input;
})(window);
