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
        down: false
      };

      window.addEventListener("keydown", (event) => this.onKeyDown(event));
      window.addEventListener("keyup", (event) => this.onKeyUp(event));
      document.addEventListener("keydown", (event) => this.onKeyDown(event));
      document.addEventListener("keyup", (event) => this.onKeyUp(event));
      window.addEventListener("mousemove", (event) => {
        this.mouse.x = event.clientX;
        this.mouse.y = event.clientY;
      });
      window.addEventListener("mousedown", () => {
        this.mouse.down = true;
      });
      window.addEventListener("mouseup", () => {
        this.mouse.down = false;
      });
      window.addEventListener("blur", () => this.clear());
    }

    onKeyDown(event) {
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
        event.preventDefault();
      }

      if (!event.repeat) {
        this.pressed.add(event.code);
        if (event.key === "1") this.pressed.add("Digit1");
        if (event.key === "2") this.pressed.add("Digit2");
        if (event.key === "3") this.pressed.add("Digit3");
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
      this.mouse.down = false;
    }

    updateWorld(camera) {
      this.mouse.worldX = this.mouse.x + camera.x;
      this.mouse.worldY = this.mouse.y + camera.y;
    }

    keyDown(code) {
      return this.keys.has(code);
    }

    consumePress(code) {
      if (!this.pressed.has(code)) return false;
      this.pressed.delete(code);
      return true;
    }

    axis(negativeA, negativeB, positiveA, positiveB) {
      return (this.keyDown(positiveA) || this.keyDown(positiveB) ? 1 : 0) -
        (this.keyDown(negativeA) || this.keyDown(negativeB) ? 1 : 0);
    }

    endFrame() {
      this.pressed.clear();
    }
  }

  IronLine.Input = Input;
})(window);
