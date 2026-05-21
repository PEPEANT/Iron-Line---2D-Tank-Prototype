"use strict";

(function registerPerformanceMonitor(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  class PerformanceMonitor {
    constructor() {
      this.frameStart = 0;
      this.dt = 0;
      this.starts = new Map();
      this.frame = {};
      this.samples = {};
      this.counters = {};
      this.lastOverlayAt = 0;
      this.overlay = null;
      this.smoothing = 0.16;
    }

    now() {
      return typeof performance !== "undefined" ? performance.now() : Date.now();
    }

    beginFrame(dt = 0) {
      this.frameStart = this.now();
      this.dt = dt;
      this.starts.clear();
      this.frame = {};
    }

    begin(name) {
      if (!name) return;
      this.starts.set(name, this.now());
    }

    end(name) {
      if (!name || !this.starts.has(name)) return;
      const elapsed = Math.max(0, this.now() - this.starts.get(name));
      this.starts.delete(name);
      this.frame[name] = (this.frame[name] || 0) + elapsed;
    }

    setCounters(counters = {}) {
      this.counters = {
        ...this.counters,
        ...counters
      };
    }

    finishFrame(game) {
      const frameMs = Math.max(0, this.now() - this.frameStart);
      this.frame.frame = frameMs;
      this.frame.fps = this.dt > 0 ? 1 / this.dt : 0;
      for (const [name, value] of Object.entries(this.frame)) {
        const previous = this.samples[name];
        this.samples[name] = previous === undefined
          ? value
          : previous + (value - previous) * this.smoothing;
      }
      this.setCounters({
        infantry: game?.infantry?.length || 0,
        tanks: game?.tanks?.length || 0,
        humvees: game?.humvees?.length || 0,
        projectiles: game?.projectiles?.length || 0,
        effects: this.effectCount(game)
      });
      this.updateOverlay(game);
    }

    effectCount(game) {
      return Object.values(game?.effects || {}).reduce((sum, value) => (
        sum + (Array.isArray(value) ? value.length : 0)
      ), 0);
    }

    ensureOverlay() {
      if (this.overlay) return this.overlay;
      const node = document.createElement("div");
      node.id = "performanceOverlay";
      node.className = "performance-overlay hidden";
      document.body.append(node);
      this.overlay = node;
      return node;
    }

    updateOverlay(game) {
      const node = this.ensureOverlay();
      const visible = Boolean(game?.debug?.performance);
      node.classList.toggle("hidden", !visible);
      if (!visible) return;
      const now = this.now();
      if (now - this.lastOverlayAt < 180) return;
      this.lastOverlayAt = now;

      const sample = (name) => this.samples[name] || 0;
      const fps = Math.round(sample("fps") || 0);
      const frame = sample("frame");
      const heavy = frame >= 24 ? " danger" : frame >= 17 ? " warn" : "";
      const rows = [
        ["FPS", fps],
        ["Frame", `${frame.toFixed(1)}ms`, heavy],
        ["Update", `${sample("update").toFixed(1)}ms`],
        ["Battle", `${sample("battlefield").toFixed(1)}ms`],
        ["Cmd/Squad", `${sample("ai.commanders").toFixed(1)} / ${sample("ai.squads").toFixed(1)}ms`],
        ["Infantry", `${sample("ai.infantry").toFixed(1)}ms · ${this.counters.infantry || 0}`],
        ["Vehicles", `${sample("vehicles").toFixed(1)}ms · ${(this.counters.tanks || 0) + (this.counters.humvees || 0)}`],
        ["Combat", `${(sample("combat.projectiles") + sample("combat.effects")).toFixed(1)}ms · P${this.counters.projectiles || 0} E${this.counters.effects || 0}`],
        ["Spacing", `${sample("spacing").toFixed(1)}ms`],
        ["Render", `${sample("render").toFixed(1)}ms`],
        ["Mini/Tac", `${sample("render.minimap").toFixed(1)} / ${sample("render.tactical").toFixed(1)}ms`],
        ["Observe", `${sample("ai.observer").toFixed(1)}ms`]
      ];
      node.innerHTML = `
        <div class="performance-overlay-head">
          <strong>PERF</strong>
          <span>P 닫기</span>
        </div>
        ${rows.map(([label, value, cls = ""]) => `
          <div class="performance-overlay-row${cls}">
            <span>${label}</span>
            <b>${value}</b>
          </div>
        `).join("")}
      `;
    }
  }

  IronLine.PerformanceMonitor = PerformanceMonitor;
})(window);
