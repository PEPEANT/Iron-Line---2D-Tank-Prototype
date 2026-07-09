"use strict";

(function registerDroneGcsHud(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  function droneGcsSvg() {
    return `
      <svg viewBox="0 0 280 232" aria-hidden="true">
        <defs>
          <linearGradient id="droneGcsBody" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#46523a"/>
            <stop offset="0.52" stop-color="#2b3524"/>
            <stop offset="1" stop-color="#171d12"/>
          </linearGradient>
          <linearGradient id="droneGcsDeck" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#36422c"/>
            <stop offset="0.66" stop-color="#222b1a"/>
            <stop offset="1" stop-color="#12170e"/>
          </linearGradient>
          <linearGradient id="droneGcsLcd" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#1b332a"/>
            <stop offset="1" stop-color="#07120f"/>
          </linearGradient>
          <radialGradient id="droneGcsStick" cx="0.36" cy="0.28" r="0.95">
            <stop offset="0" stop-color="#66725a"/>
            <stop offset="0.58" stop-color="#323d29"/>
            <stop offset="1" stop-color="#12170d"/>
          </radialGradient>
        </defs>

        <rect x="22" y="10" width="30" height="30" rx="10" class="gcs-corner"/>
        <rect x="228" y="10" width="30" height="30" rx="10" class="gcs-corner"/>
        <rect x="28" y="14" width="224" height="112" rx="12" fill="url(#droneGcsBody)" class="gcs-shell"/>
        <rect x="130" y="12" width="20" height="6" rx="2.5" class="gcs-latch"/>
        <rect x="40" y="26" width="200" height="90" rx="7" class="gcs-bezel"/>
        <rect x="50" y="38" width="180" height="70" rx="4" fill="url(#droneGcsLcd)" class="gcs-screen"/>
        <rect x="50" y="38" width="180" height="15" rx="4" class="gcs-screen-gloss"/>
        <g class="gcs-drone-icon" transform="translate(80, 64)">
          <rect x="-4" y="-4" width="8" height="8" rx="1.8"/>
          <path d="M-4 -4 L-10 -10 M4 -4 L10 -10 M-4 4 L-10 10 M4 4 L10 10"/>
          <circle cx="-11.5" cy="-11.5" r="2.6"/>
          <circle cx="11.5" cy="-11.5" r="2.6"/>
          <circle cx="-11.5" cy="11.5" r="2.6"/>
          <circle cx="11.5" cy="11.5" r="2.6"/>
        </g>
        <g class="gcs-screen-lines">
          <rect x="106" y="58" width="76" height="5" rx="2.5"/>
          <rect x="106" y="72" width="56" height="4" rx="2"/>
          <rect x="166" y="72" width="18" height="4" rx="2"/>
        </g>
        <rect x="88" y="94" width="108" height="4.5" rx="2.25" class="gcs-meter-track"/>
        <rect x="88" y="94" width="108" height="4.5" rx="2.25" class="gcs-meter-fill" data-drone-gcs-svg-meter/>
        <circle cx="217" cy="50" r="3.4" class="gcs-led"/>

        <rect x="48" y="128" width="184" height="8" rx="4" class="gcs-hinge"/>
        <path d="M38 140 H242 Q246 140 247 144 L260 204 Q262 218 246 220 H34 Q18 218 20 204 L33 144 Q34 140 38 140 Z"
              fill="url(#droneGcsDeck)" class="gcs-deck"/>
        <path d="M48 146 H232 L239 178 H41 Z" class="gcs-keybed"/>
        <g class="gcs-keys">
          <rect x="54" y="151" width="14" height="6" rx="1.5"/><rect x="72" y="151" width="14" height="6" rx="1.5"/>
          <rect x="90" y="151" width="14" height="6" rx="1.5"/><rect x="108" y="151" width="14" height="6" rx="1.5"/>
          <rect x="126" y="151" width="14" height="6" rx="1.5"/><rect x="144" y="151" width="14" height="6" rx="1.5"/>
          <rect x="162" y="151" width="14" height="6" rx="1.5"/><rect x="180" y="151" width="14" height="6" rx="1.5"/>
          <rect x="198" y="151" width="14" height="6" rx="1.5"/>
          <rect x="58" y="162" width="18" height="6" rx="1.5"/><rect x="82" y="162" width="18" height="6" rx="1.5"/>
          <rect x="106" y="162" width="52" height="6" rx="1.5"/><rect x="164" y="162" width="18" height="6" rx="1.5"/>
          <rect x="188" y="162" width="18" height="6" rx="1.5"/>
        </g>
        <rect x="112" y="184" width="58" height="24" rx="4" class="gcs-pad"/>
        <circle cx="212" cy="196" r="14" class="gcs-stick-base"/>
        <circle cx="211" cy="194" r="7.5" fill="url(#droneGcsStick)" class="gcs-stick"/>
        <rect x="12" y="192" width="30" height="32" rx="10" class="gcs-corner"/>
        <rect x="238" y="192" width="30" height="32" rx="10" class="gcs-corner"/>
      </svg>
    `;
  }

  const droneGcsHudMethods = {
    ensureDroneGcsHud() {
      if (this.nodes.droneGcsHud) return this.nodes.droneGcsHud;

      const panel = document.createElement("div");
      panel.id = "droneGcsHud";
      panel.className = "drone-gcs-hud hidden";
      panel.setAttribute("aria-label", "Drone controller");
      panel.innerHTML = `
        <div class="drone-gcs-device">${droneGcsSvg()}</div>
        <div class="drone-gcs-readout">
          <i><em data-drone-gcs-meter></em></i>
        </div>
      `;
      document.body.append(panel);

      this.nodes.droneGcsHud = panel;
      this.nodes.droneGcsMeter = panel.querySelector("[data-drone-gcs-meter]");
      this.nodes.droneGcsSvgMeter = panel.querySelector("[data-drone-gcs-svg-meter]");
      return panel;
    },

    updateDroneGcs(game) {
      const panel = this.ensureDroneGcsHud?.();
      const drone = game?.player?.controlledDrone?.alive ? game.player.controlledDrone : null;
      const active = Boolean(drone);
      document.body.classList.toggle("drone-control-active", active);
      if (!panel) return;
      panel.classList.toggle("hidden", !active);
      if (!active) return;

      const clamp = IronLine.math?.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));
      const signal = clamp(drone.signalStrength?.() ?? 1, 0, 1);
      const battery = drone.batteryLimit
        ? clamp((drone.battery || 0) / Math.max(1, drone.maxBattery || 1), 0, 1)
        : signal;
      const meter = drone.droneRole === "attack"
        ? clamp(drone.boostCharge ?? 1, 0, 1)
        : battery;
      if (this.nodes.droneGcsMeter) this.nodes.droneGcsMeter.style.width = `${meter * 100}%`;
      if (this.nodes.droneGcsSvgMeter) this.nodes.droneGcsSvgMeter.setAttribute("width", String(108 * meter));
      panel.classList.toggle("signal-weak", signal < 0.28);
    }
  };

  function installDroneGcsHud(Hud) {
    Object.assign(Hud.prototype, droneGcsHudMethods);
    const baseUpdate = Hud.prototype.update;
    Hud.prototype.update = function updateWithDroneGcsHud(game) {
      const result = baseUpdate?.call(this, game);
      this.updateDroneGcs?.(game);
      if (game?.player?.controlledDrone) {
        this.nodes.bottomHud?.classList.add("hidden");
        this.nodes.infantrySlotbar?.classList.add("hidden");
      }
      return result;
    };
  }

  IronLine.installDroneGcsHud = installDroneGcsHud;
})(window);
