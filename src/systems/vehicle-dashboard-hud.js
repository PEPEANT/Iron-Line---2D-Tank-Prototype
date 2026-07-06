"use strict";

// 차량 계기판 HUD — visual-overhaul-plan.md P5.7 디테일 패스 적용 (2026-07-06)
// 목업: docs/design-drafts/vehicle-dashboard-mockup.html
// 원칙: 실존 상태만 계기화 (speed/ammo/reload/hp/smokeCooldown). 가짜 계기 금지.
(function registerVehicleDashboardHud(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const AMMO = IronLine.constants?.AMMO || {};
  const clamp = IronLine.math?.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));

  const DIAL_START = (-210 * Math.PI) / 180;
  const DIAL_SWEEP = (240 * Math.PI) / 180;
  const SPEED_LABELS = ["0", "20", "40", "60", "80", "100"];
  const HULL_LABELS = ["0", "25", "50", "75", "100"];
  const dialBgCache = new Map();

  function setText(node, value) {
    if (node) node.textContent = String(value);
  }

  function makeGauge(kind, label) {
    const meter = document.createElement("div");
    meter.className = `vehicle-dashboard-meter vehicle-dashboard-${kind}`;
    meter.dataset.vehicleGauge = kind;

    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 96;
    canvas.setAttribute("aria-hidden", "true");

    const caption = document.createElement("span");
    caption.textContent = label;

    const value = document.createElement("strong");
    value.dataset.vehicleValue = kind;
    value.textContent = "-";

    meter.append(caption, canvas, value);
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
      <div class="vd-chip-row">
        <span class="vd-chip" data-vehicle-chip="ap"><i></i><b>철갑</b><strong data-vehicle-value="ap">0</strong></span>
        <span class="vd-chip" data-vehicle-chip="he"><i></i><b>고폭</b><strong data-vehicle-value="he">0</strong></span>
      </div>
      <div class="vehicle-dashboard-reload">
        <i><em data-vehicle-value="reloadBar"></em></i>
        <span class="vd-ready" data-vehicle-value="reloadLabel"><u></u>장전 대기</span>
      </div>
      <strong class="vd-main-state" data-vehicle-value="main">비어 있음</strong>
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
      apChip: dashboard.querySelector("[data-vehicle-chip='ap']"),
      heChip: dashboard.querySelector("[data-vehicle-chip='he']"),
      reloadLabel: dashboard.querySelector("[data-vehicle-value='reloadLabel']"),
      reloadBar: dashboard.querySelector("[data-vehicle-value='reloadBar']"),
      mg: dashboard.querySelector("[data-vehicle-value='mg']"),
      mgState: dashboard.querySelector("[data-vehicle-value='mgState']"),
      smoke: dashboard.querySelector("[data-vehicle-value='smoke']"),
      smokeState: dashboard.querySelector("[data-vehicle-value='smokeState']")
    };
    return dashboard;
  }

  function setReadyLabel(node, text) {
    if (!node) return;
    // <u>는 준비 램프 도트 — 텍스트만 교체하고 램프는 유지
    const lamp = node.querySelector("u");
    node.textContent = "";
    if (lamp) node.append(lamp);
    node.append(document.createTextNode(text));
  }

  // 다이얼 배경(베젤·눈금·숫자·레드존·유리광택)은 1회만 굽는다.
  function dialBackground(width, height, options) {
    const key = `${width}x${height}:${options.kind}`;
    let bg = dialBgCache.get(key);
    if (bg) return bg;

    bg = document.createElement("canvas");
    bg.width = width;
    bg.height = height;
    const ctx = bg.getContext("2d");
    const cx = width / 2;
    const cy = height / 2 + 2;
    const r = Math.min(width, height) / 2 - 3;

    // 베젤
    const bezel = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.5, r * 0.2, cx, cy, r * 1.2);
    bezel.addColorStop(0, "#525e4c");
    bezel.addColorStop(0.55, "#242c1d");
    bezel.addColorStop(1, "#12160d");
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = bezel;
    ctx.fill();
    ctx.strokeStyle = "#080b06";
    ctx.lineWidth = 2;
    ctx.stroke();

    // 문자반
    ctx.beginPath();
    ctx.arc(cx, cy, r - 4, 0, Math.PI * 2);
    ctx.fillStyle = "#0d120c";
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // 레드존
    const [redFrom, redTo] = options.redzone;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 9, DIAL_START + DIAL_SWEEP * redFrom, DIAL_START + DIAL_SWEEP * redTo);
    ctx.strokeStyle = "rgba(255, 107, 94, 0.5)";
    ctx.lineWidth = 4;
    ctx.stroke();

    // 눈금 20칸 (major 4칸마다)
    for (let i = 0; i <= 20; i += 1) {
      const v = i / 20;
      const a = DIAL_START + DIAL_SWEEP * v;
      const major = i % 4 === 0;
      const inner = r - (major ? 12 : 9);
      const inRed = v >= redFrom && v <= redTo;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * (r - 5), cy + Math.sin(a) * (r - 5));
      ctx.strokeStyle = inRed ? "rgba(255, 107, 94, 0.85)" : major ? "rgba(230, 238, 224, 0.72)" : "rgba(230, 238, 224, 0.34)";
      ctx.lineWidth = major ? 1.8 : 1;
      ctx.stroke();
    }

    // 숫자 각인
    ctx.fillStyle = "rgba(230, 238, 224, 0.55)";
    ctx.font = "800 8px Consolas, monospace";
    ctx.textAlign = "center";
    options.labels.forEach((label, index) => {
      const v = index / (options.labels.length - 1);
      const a = DIAL_START + DIAL_SWEEP * v;
      ctx.fillText(label, cx + Math.cos(a) * (r - 20), cy + Math.sin(a) * (r - 20) + 3);
    });

    // 유리 광택
    ctx.beginPath();
    ctx.arc(cx, cy, r - 7, (-200 * Math.PI) / 180, (-60 * Math.PI) / 180);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.stroke();

    dialBgCache.set(key, bg);
    return bg;
  }

  function drawGauge(canvas, ratio, options) {
    const ctx = canvas?.getContext?.("2d");
    if (!ctx) return;
    const width = canvas.width || 96;
    const height = canvas.height || 96;
    const value = clamp(ratio || 0, 0, 1);
    const cx = width / 2;
    const cy = height / 2 + 2;
    const r = Math.min(width, height) / 2 - 3;

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(dialBackground(width, height, options), 0, 0);

    // 바늘
    const angle = DIAL_START + DIAL_SWEEP * value;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(-7, -2);
    ctx.lineTo(-7, 2);
    ctx.lineTo(r - 16, 0.9);
    ctx.lineTo(r - 11, 0);
    ctx.lineTo(r - 16, -0.9);
    ctx.closePath();
    ctx.fillStyle = "#ffb84d";
    ctx.fill();
    ctx.strokeStyle = "rgba(120, 60, 10, 0.6)";
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.restore();

    // 축 캡
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#2c3524";
    ctx.fill();
    ctx.strokeStyle = "#080b06";
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - 1.3, cy - 1.5, 1.3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
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
    drawGauge(canvases.speed, speedRatio, { kind: "speed", redzone: [0.86, 1], labels: SPEED_LABELS });
    drawGauge(canvases.hull, hullRatio, { kind: "hull", redzone: [0, 0.25], labels: HULL_LABELS });
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
    values.apChip?.classList.toggle("active", reloadAmmo === "ap");
    values.heChip?.classList.toggle("active", reloadAmmo === "he");
    setReadyLabel(values.reloadLabel, reloading ? `${Math.round(reloadPct * 100)}%` : tank.loadedAmmo ? "준비" : "장전 대기");
    if (values.reloadBar) values.reloadBar.style.width = `${reloadPct * 100}%`;
    setText(values.mg, hasGunner ? tank.ammo?.mg ?? 0 : "사수 없음");
    setText(values.mgState, tank.weaponMode === "mg" ? "선택" : "3");
    setText(values.smoke, smokeCount);
    setText(values.smokeState, smokeCount <= 0 ? "없음" : smokeCooldown > 0 ? `${Math.ceil(smokeCooldown)}s` : "Q 준비");

    dashboard.classList.toggle("gun-ready", !reloading && Boolean(tank.loadedAmmo));
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
    setText(values.mg, ammo);
    setText(values.mgState, "HMG");
    dashboard.classList.toggle("mg-active", ammo > 0);
    dashboard.classList.remove("smoke-ready", "smoke-cooling", "gun-ready");
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
