"use strict";

(function registerVehicleDashboardHud(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const AMMO = IronLine.constants?.AMMO || {};
  const clamp = IronLine.math?.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));

  function setText(node, value) {
    if (node) node.textContent = String(value);
  }

  function makeGauge(kind, label) {
    const meter = document.createElement("div");
    meter.className = `vehicle-dashboard-meter vehicle-dashboard-${kind}`;
    meter.dataset.vehicleGauge = kind;

    const canvas = document.createElement("canvas");
    canvas.width = 72;
    canvas.height = 72;
    canvas.setAttribute("aria-hidden", "true");

    const caption = document.createElement("span");
    caption.textContent = label;

    const value = document.createElement("strong");
    value.dataset.vehicleValue = kind;
    value.textContent = "-";

    meter.append(canvas, caption, value);
    return { meter, canvas, value };
  }

  function ensureDashboard(hud) {
    const root = hud?.nodes?.bottomHud;
    if (!root) return null;
    if (hud.nodes.vehicleDashboard) return hud.nodes.vehicleDashboard;

    const dashboard = document.createElement("div");
    dashboard.id = "vehicleDashboard";
    dashboard.className = "vehicle-dashboard hidden";
    dashboard.setAttribute("aria-label", "차량 계기판");

    const speed = makeGauge("speed", "속도");
    const hull = makeGauge("hull", "차체");

    const main = document.createElement("div");
    main.className = "vehicle-dashboard-cluster vehicle-dashboard-main";
    main.innerHTML = `
      <span class="vehicle-dashboard-label">주포</span>
      <strong data-vehicle-value="main">비어 있음</strong>
      <div class="vehicle-dashboard-ammo-grid">
        <span><b>철갑</b><strong data-vehicle-value="ap">0</strong></span>
        <span><b>고폭</b><strong data-vehicle-value="he">0</strong></span>
      </div>
      <div class="vehicle-dashboard-reload">
        <span data-vehicle-value="reloadLabel">장전 대기</span>
        <i><em data-vehicle-value="reloadBar"></em></i>
      </div>
    `;

    const mg = document.createElement("div");
    mg.className = "vehicle-dashboard-cluster vehicle-dashboard-mg";
    mg.innerHTML = `
      <span class="vehicle-dashboard-label">MG</span>
      <strong data-vehicle-value="mg">0</strong>
      <small data-vehicle-value="mgState">3</small>
    `;

    const smoke = document.createElement("div");
    smoke.className = "vehicle-dashboard-cluster vehicle-dashboard-smoke";
    smoke.innerHTML = `
      <span class="vehicle-dashboard-label">연막</span>
      <strong data-vehicle-value="smoke">Q</strong>
      <small data-vehicle-value="smokeState">대기</small>
    `;

    dashboard.append(speed.meter, main, mg, smoke, hull.meter);
    root.append(dashboard);

    hud.nodes.vehicleDashboard = dashboard;
    hud.nodes.vehicleDashboardCanvas = {
      speed: speed.canvas,
      hull: hull.canvas
    };
    hud.nodes.vehicleDashboardValues = {
      speed: speed.value,
      hull: hull.value,
      main: dashboard.querySelector("[data-vehicle-value='main']"),
      ap: dashboard.querySelector("[data-vehicle-value='ap']"),
      he: dashboard.querySelector("[data-vehicle-value='he']"),
      reloadLabel: dashboard.querySelector("[data-vehicle-value='reloadLabel']"),
      reloadBar: dashboard.querySelector("[data-vehicle-value='reloadBar']"),
      mg: dashboard.querySelector("[data-vehicle-value='mg']"),
      mgState: dashboard.querySelector("[data-vehicle-value='mgState']"),
      smoke: dashboard.querySelector("[data-vehicle-value='smoke']"),
      smokeState: dashboard.querySelector("[data-vehicle-value='smokeState']")
    };
    return dashboard;
  }

  function drawGauge(canvas, ratio, options = {}) {
    const ctx = canvas?.getContext?.("2d");
    if (!ctx) return;
    const width = canvas.width || 72;
    const height = canvas.height || 72;
    const value = clamp(ratio || 0, 0, 1);
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.min(width, height) / 2 - 2;
    const start = Math.PI * 0.75;
    const sweep = Math.PI * 1.5;

    ctx.clearRect(0, 0, width, height);

    const bezel = ctx.createLinearGradient(0, cy - r, 0, cy + r);
    bezel.addColorStop(0, "#585e52");
    bezel.addColorStop(1, "#1b1e17");
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = bezel;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
    ctx.fillStyle = "#0e110d";
    ctx.fill();

    if (options.warn) {
      ctx.beginPath();
      ctx.arc(cx, cy, r - 6, start, start + sweep * 0.28);
      ctx.strokeStyle = "rgba(224, 85, 69, 0.55)";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    const ticks = 10;
    for (let i = 0; i <= ticks; i += 1) {
      const a = start + sweep * (i / ticks);
      const major = i % 2 === 0;
      const inner = r - (major ? 9 : 6);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3));
      ctx.strokeStyle = major ? "#d7ddc8" : "#79816b";
      ctx.lineWidth = major ? 1.6 : 1;
      ctx.stroke();
    }

    if (options.warn) {
      ctx.fillStyle = "#9aa488";
      ctx.font = "700 8px Consolas, monospace";
      ctx.textAlign = "center";
      const la = start + sweep * 0.05;
      const lb = start + sweep * 0.95;
      ctx.fillText("E", cx + Math.cos(la) * (r - 14), cy + Math.sin(la) * (r - 14) + 3);
      ctx.fillText("F", cx + Math.cos(lb) * (r - 14), cy + Math.sin(lb) * (r - 14) + 3);
    }

    const na = start + sweep * value;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(na) * 5, cy - Math.sin(na) * 5);
    ctx.lineTo(cx + Math.cos(na) * (r - 9), cy + Math.sin(na) * (r - 9));
    ctx.strokeStyle = "#e8543a";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = "#c8cdb9";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 1.4, 0, Math.PI * 2);
    ctx.fillStyle = "#33382c";
    ctx.fill();
  }

  function showDashboard(hud, vehicle, kind) {
    const dashboard = ensureDashboard(hud);
    if (!dashboard || !vehicle) return null;
    dashboard.classList.remove("hidden");
    dashboard.classList.toggle("humvee", kind === "humvee");
    dashboard.classList.toggle("tank", kind !== "humvee");
    hud.nodes.bottomHud?.classList.add("vehicle-dashboard-active");
    hud.nodes.infantrySlotbar?.classList.add("hidden");
    return dashboard;
  }

  function hideDashboard(hud) {
    hud?.nodes?.vehicleDashboard?.classList.add("hidden");
    hud?.nodes?.bottomHud?.classList.remove("vehicle-dashboard-active");
  }

  function updateCommon(hud, vehicle) {
    const values = hud.nodes.vehicleDashboardValues || {};
    const canvases = hud.nodes.vehicleDashboardCanvas || {};
    const speedRatio = Math.abs(vehicle.speed || 0) / Math.max(vehicle.maxSpeed || 1, 1);
    const hullRatio = (vehicle.hp ?? vehicle.maxHp ?? 1) / Math.max(vehicle.maxHp || 1, 1);
    setText(values.speed, Math.round(Math.abs(vehicle.speed || 0)));
    setText(values.hull, `${Math.round(clamp(hullRatio, 0, 1) * 100)}%`);
    drawGauge(canvases.speed, speedRatio);
    drawGauge(canvases.hull, hullRatio, { warn: true });
  }

  function updateTankDashboard(hud, tank) {
    const dashboard = showDashboard(hud, tank, "tank");
    if (!dashboard) return;
    updateCommon(hud, tank);

    const values = hud.nodes.vehicleDashboardValues || {};
    const reload = tank.reload || {};
    const reloading = Boolean(reload.active);
    const reloadAmmo = reloading ? reload.ammoId : tank.loadedAmmo;
    const ammoName = AMMO[reloadAmmo]?.name || (reloadAmmo ? String(reloadAmmo).toUpperCase() : "비어 있음");
    const reloadPct = reloading ? clamp((reload.progress || 0) / Math.max(reload.duration || 0.001, 0.001), 0, 1) : tank.loadedAmmo ? 1 : 0;
    const hasGunner = tank.hasMachineGunner?.() ?? true;
    const smokeCount = tank.ammo?.smoke || 0;
    const smokeCooldown = tank.smokeCooldown || 0;

    setText(values.main, tank.weaponMode === "mg" ? "기관총 선택" : reloading ? `${ammoName} 장전` : tank.loadedAmmo ? `${ammoName} 준비` : "비어 있음");
    setText(values.ap, tank.ammo?.ap ?? 0);
    setText(values.he, tank.ammo?.he ?? 0);
    setText(values.reloadLabel, reloading ? `${Math.round(reloadPct * 100)}%` : tank.loadedAmmo ? "준비" : "장전 대기");
    if (values.reloadBar) values.reloadBar.style.width = `${reloadPct * 100}%`;
    setText(values.mg, hasGunner ? tank.ammo?.mg ?? 0 : "사수 없음");
    setText(values.mgState, tank.weaponMode === "mg" ? "선택" : "3");
    setText(values.smoke, smokeCount);
    setText(values.smokeState, smokeCount <= 0 ? "없음" : smokeCooldown > 0 ? `${Math.ceil(smokeCooldown)}s` : "Q 준비");

    dashboard.classList.toggle("mg-active", tank.weaponMode === "mg");
    dashboard.classList.toggle("smoke-ready", smokeCount > 0 && smokeCooldown <= 0);
    dashboard.classList.toggle("smoke-cooling", smokeCooldown > 0);
  }

  function updateHumveeDashboard(hud, humvee) {
    const dashboard = showDashboard(hud, humvee, "humvee");
    if (!dashboard) return;
    updateCommon(hud, humvee);

    const values = hud.nodes.vehicleDashboardValues || {};
    const ammo = humvee.ammo?.mg || 0;
    const weapon = humvee.machineGunWeapon?.() || { cooldown: 0.092 };
    const readyPct = clamp(1 - (humvee.machineGunCooldown || 0) / Math.max(weapon.cooldown || 0.092, 0.001), 0, 1);
    setText(values.main, "HMG");
    setText(values.ap, "-");
    setText(values.he, "-");
    setText(values.reloadLabel, ammo <= 0 ? "탄약 없음" : "HMG");
    if (values.reloadBar) values.reloadBar.style.width = `${readyPct * 100}%`;
    setText(values.mg, ammo);
    setText(values.mgState, "HMG");
    setText(values.smoke, "-");
    setText(values.smokeState, "");
    dashboard.classList.toggle("mg-active", ammo > 0);
    dashboard.classList.remove("smoke-ready", "smoke-cooling");
  }

  const Hud = IronLine.Hud;
  if (!Hud?.prototype) return;

  const baseUpdateInfantryWeapons = Hud.prototype.updateInfantryWeapons;
  Hud.prototype.updateInfantryWeapons = function updateInfantryWeaponsWithoutVehicleDashboard(player, game = null) {
    const result = baseUpdateInfantryWeapons?.call(this, player, game);
    hideDashboard(this);
    return result;
  };

  const baseUpdateTankWeapons = Hud.prototype.updateTankWeapons;
  Hud.prototype.updateTankWeapons = function updateTankWeaponsWithDashboard(tank) {
    const result = baseUpdateTankWeapons?.call(this, tank);
    if (tank?.vehicleType !== "humvee") updateTankDashboard(this, tank);
    return result;
  };

  const baseUpdateHumveeWeapons = Hud.prototype.updateHumveeWeapons;
  Hud.prototype.updateHumveeWeapons = function updateHumveeWeaponsWithDashboard(humvee) {
    const result = baseUpdateHumveeWeapons?.call(this, humvee);
    updateHumveeDashboard(this, humvee);
    return result;
  };
})(window);
