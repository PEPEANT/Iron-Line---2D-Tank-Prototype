"use strict";

(function registerSoubokInfantryArt(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const proto = IronLine.Renderer?.prototype;
  if (!proto) return;

  const images = new Map();
  const paths = {
    stand01: "assets/ui/infantry/soubok-infantry-stand-01.png",
    stand02: "assets/ui/infantry/soubok-infantry-stand-02.png",
    standFire: "assets/ui/infantry/soubok-infantry-stand-fire.png",
    standFireWalk: "assets/ui/infantry/soubok-infantry-stand-fire-walk.png",
    proneCrawl01: "assets/ui/infantry/soubok-infantry-prone-crawl-01.png",
    proneCrawl02: "assets/ui/infantry/soubok-infantry-prone-crawl-02.png",
    proneFire: "assets/ui/infantry/soubok-infantry-prone-fire.png",
    proneNoGun: "assets/ui/infantry/soubok-infantry-prone-no-gun.png",
    prone: "assets/ui/soubok-infantry-prone.png",
    dead: "assets/ui/soubok-infantry-dead.png",
    top: "assets/ui/soubok-infantry-top.png",
    standGrenadeReady: "assets/ui/infantry/cut-review/v2-20260709/accepted/stand-grenade-ready-01.png",
    standGrenadeReadyAlt: "assets/ui/infantry/cut-review/v2-20260709/accepted/stand-grenade-throw-01.png",
    standMachinegunCarry: "assets/ui/infantry/cut-review/v2-20260709/accepted/stand-machinegun-carry-01.png",
    standMachinegunFire: "assets/ui/infantry/cut-review/v2-20260709/accepted/stand-machinegun-carry-02.png",
    standMachinegunWalk: "assets/ui/infantry/cut-review/v2-20260709/accepted/stand-machinegun-walk-01.png",
    standPistolAim: "assets/ui/infantry/cut-review/v2-20260709/accepted/stand-pistol-aim-01.png",
    standPistolWalk: "assets/ui/infantry/cut-review/v2-20260709/accepted/stand-pistol-ready-walk-01.png",
    standRifleAim: "assets/ui/infantry/cut-review/v2-20260709/accepted/stand-rifle-aim-01.png",
    standRifleFire01: "assets/ui/infantry/cut-review/v2-20260709/accepted/stand-rifle-fire-01.png",
    standRifleFire02: "assets/ui/infantry/cut-review/v2-20260709/accepted/stand-rifle-fire-02.png",
    standRpgAim: "assets/ui/infantry/cut-review/v2-20260709/accepted/stand-rpg-aim-01.png",
    standRpgWalk01: "assets/ui/infantry/cut-review/v2-20260709/accepted/stand-rpg-walk-01.png",
    standRpgWalk02: "assets/ui/infantry/cut-review/v2-20260709/accepted/stand-rpg-walk-02.png",
    standSniperAim: "assets/ui/infantry/cut-review/v2-20260709/accepted/stand-sniper-aim-forward-01.png",
    standSniperWalk01: "assets/ui/infantry/cut-review/v2-20260709/accepted/stand-sniper-walk-01.png",
    standSniperWalk02: "assets/ui/infantry/cut-review/v2-20260709/accepted/stand-sniper-walk-02.png"
  };

  const slotWidths = {
    stand01: 60,
    stand02: 60,
    standFire: 76,
    standFireWalk: 76,
    proneCrawl01: 156,
    proneCrawl02: 156,
    proneFire: 156,
    proneNoGun: 140,
    prone: 145,
    dead: 92,
    top: 76,
    standGrenadeReady: 66,
    standGrenadeReadyAlt: 66,
    standMachinegunCarry: 68,
    standMachinegunFire: 68,
    standMachinegunWalk: 68,
    standPistolAim: 80,
    standPistolWalk: 76,
    standRifleAim: 64,
    standRifleFire01: 86,
    standRifleFire02: 86,
    standRpgAim: 68,
    standRpgWalk01: 68,
    standRpgWalk02: 68,
    standSniperAim: 62,
    standSniperWalk01: 75,
    standSniperWalk02: 75
  };

  const slotAngleOffsets = {
    standMachinegunCarry: -Math.PI / 2,
    standMachinegunFire: -Math.PI / 2,
    standMachinegunWalk: -Math.PI / 2,
    standRifleAim: -Math.PI / 2,
    standRifleFire01: -Math.PI / 2,
    standRifleFire02: -Math.PI / 2,
    standRpgAim: -Math.PI / 2,
    standRpgWalk01: -Math.PI / 2,
    standRpgWalk02: -Math.PI / 2,
    standSniperAim: -Math.PI / 2,
    standSniperWalk01: -Math.PI / 2,
    standSniperWalk02: -Math.PI / 2
  };

  const slotPivots = {
    standMachinegunCarry: { x: 0.5, y: 0.42 },
    standMachinegunFire: { x: 0.5, y: 0.42 },
    standMachinegunWalk: { x: 0.5, y: 0.42 },
    standRifleAim: { x: 0.5, y: 0.4 },
    standRpgAim: { x: 0.5, y: 0.41 },
    standRpgWalk01: { x: 0.5, y: 0.41 },
    standRpgWalk02: { x: 0.5, y: 0.41 },
    standSniperAim: { x: 0.5, y: 0.33 },
    standSniperWalk01: { x: 0.5, y: 0.42 },
    standSniperWalk02: { x: 0.5, y: 0.42 },
    standRifleFire01: { x: 0.5, y: 0.48 },
    standRifleFire02: { x: 0.5, y: 0.48 },
    standPistolAim: { x: 0.42, y: 0.5 },
    standPistolWalk: { x: 0.42, y: 0.5 }
  };

  function imageFor(slot) {
    if (typeof Image === "undefined") return null;
    if (!images.has(slot)) {
      const src = paths[slot];
      if (!src) return null;
      const image = new Image();
      image.decoding = "async";
      image.src = src;
      images.set(slot, image);
    }
    return images.get(slot);
  }

  // 적군(사막) 스킨: 원본 PNG의 올리브 군복 픽셀만 사막 탄색으로 리컬러한 캔버스를
  // 슬롯당 한 번만 만들어 캐시한다. 초록이 우세한 픽셀만 바꾸므로
  // 무기(회색)·피부(따뜻)·군화(검정)·외곽선은 그대로 남는다.
  const desertCache = new Map();

  function isDesertTeam(unit) {
    return unit?.team === IronLine.constants?.TEAM?.RED || unit?.team === "red";
  }

  function buildDesertCanvas(image) {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const c = canvas.getContext("2d", { willReadFrequently: true });
    c.drawImage(image, 0, 0);
    let pixels;
    try {
      pixels = c.getImageData(0, 0, canvas.width, canvas.height);
    } catch (_error) {
      return null; // 교차출처 오염 등: 리컬러 포기하고 원본 사용
    }
    const d = pixels.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
      if (a < 8) continue;
      // 초록 우세 = 군복. 회색(r=g=b)·피부(r>g)·검정은 제외
      if (g > r + 6 && g > b + 6) {
        const v = g; // 초록 채널을 명암값으로 삼아 사막 램프로 재구성
        d[i] = Math.min(255, v * 1.55);
        d[i + 1] = Math.min(255, v * 1.28);
        d[i + 2] = Math.min(255, v * 0.86);
      }
    }
    c.putImageData(pixels, 0, 0);
    return canvas;
  }

  // 시체 렌더러 등 다른 모듈이 같은 사막 리컬러를 쓰도록 공유 (색 계수 단일 관리)
  IronLine.desertSkin = { buildCanvas: buildDesertCanvas, isDesertTeam };

  // red팀이면 리컬러 캔버스를, 아니면 원본 이미지를 반환.
  function drawableFor(slot, unit) {
    const base = imageFor(slot);
    if (!base || !base.complete || !base.naturalWidth) return null;
    if (!isDesertTeam(unit)) return base;
    let tinted = desertCache.get(slot);
    if (tinted === undefined) {
      tinted = buildDesertCanvas(base) || base;
      desertCache.set(slot, tinted);
    }
    return tinted;
  }

  function shouldUseArt(unit, game) {
    if (!unit) return false;
    if (unit === game?.player) return true;
    return Boolean(unit.team);
  }

  function drawImage(renderer, unit, slot, options = {}) {
    const image = drawableFor(slot, unit);
    if (!image || !image.width) return false;
    const ctx = renderer.ctx;
    const width = options.width || 52;
    const height = width * (image.naturalHeight || image.height) / (image.naturalWidth || image.width);
    const pivot = options.pivot || { x: 0.5, y: 0.5 };
    const pivotX = width * (Number.isFinite(pivot.x) ? pivot.x : 0.5);
    const pivotY = height * (Number.isFinite(pivot.y) ? pivot.y : 0.5);
    const alpha = options.alpha ?? 1;
    ctx.save();
    ctx.translate(options.x ?? unit.x, options.y ?? unit.y);
    ctx.rotate(options.angle ?? unit.angle ?? 0);
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, -pivotX, -pivotY, width, height);
    ctx.restore();
    return true;
  }

  function drawMountPrompt(renderer, game, unit) {
    return;
  }

  function drawFrontWeapon(renderer, unit, options, x, y) {
    if (!renderer.drawInfantryWeapon || !options.weapon) return;
    const ctx = renderer.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(options.bodyAngle);
    ctx.scale(1.18, 1.18);
    renderer.drawInfantryWeapon(ctx, unit, options.weapon, "stand-fire", options.scoped, options.phase);
    ctx.restore();
  }

  function pickSlot(unit, options = {}) {
    const pose = options.pose || "";
    const moving = options.moving ?? Math.abs(unit?.speed || 0) > (options.prone ? 5 : 12);
    const phase = Number(options.phase) || 0;
    const weaponId = options.weapon?.id || unit?.weaponId || "rifle";
    const aiState = unit?.ai?.state || "";
    const firing = pose === "stand-fire" || ["fire", "support-fire", "recon-snipe", "harass-tank", "rpg-attack", "grenade", "grenade-aim"].includes(aiState) || (unit?.gunKick || 0) > 0.02 || (unit?.throwPoseTimer || 0) > 0;
    if (options.prone) {
      if (options.controlledDrone) return "proneNoGun";
      if (pose === "prone-crawl" || moving) {
        return Math.sin(phase) >= 0 ? "proneCrawl01" : "proneCrawl02";
      }
      return "proneFire";
    }
    if (weaponId === "grenade") {
      const altReady = aiState === "grenade" || aiState === "grenade-aim" || pose === "stand-fire" || (unit?.throwPoseTimer || 0) > 0;
      return altReady ? "standGrenadeReadyAlt" : "standGrenadeReady";
    }
    if (weaponId === "machinegun" || weaponId === "lmg") {
      if (firing && !moving) return "standMachinegunFire";
      return moving && Math.sin(phase) < 0 ? "standMachinegunWalk" : "standMachinegunCarry";
    }
    if (weaponId === "pistol") {
      return moving && Math.sin(phase) < 0 ? "standPistolWalk" : "standPistolAim";
    }
    if (weaponId === "rifle" || weaponId === "smg") {
      if (firing) return "standRifleAim";
      if (moving) return Math.sin(phase) < 0 ? "standRifleFire02" : "standRifleFire01";
      return "standRifleFire01";
    }
    if (weaponId === "rpg") {
      if (firing || unit?.rpgAim) return "standRpgAim";
      return moving && Math.sin(phase) < 0 ? "standRpgWalk02" : "standRpgWalk01";
    }
    if (weaponId === "sniper") {
      if (firing || options.scoped) return "standSniperAim";
      return moving && Math.sin(phase) < 0 ? "standSniperWalk02" : "standSniperWalk01";
    }
    if (pose === "stand-fire") return moving ? "standFireWalk" : "standFire";
    return moving && Math.sin(phase) < 0 ? "stand02" : "stand01";
  }

  proto.drawSoubokInfantryArt = function drawSoubokInfantryArt(game, unit, options = {}) {
    if (!shouldUseArt(unit, game)) return false;
    let x = unit.x + Math.cos(options.hitAngle) * (options.hitOffset || 0);
    let y = unit.y + Math.sin(options.hitAngle) * (options.hitOffset || 0);
    const prone = Boolean(options.prone);
    const slot = pickSlot(unit, options);
    const recoil = !prone ? Math.min(4.2, Math.max(0, unit.gunKick || 0) * 2.4) : 0;
    if (recoil > 0) {
      x -= Math.cos(options.bodyAngle) * recoil;
      y -= Math.sin(options.bodyAngle) * recoil;
    }
    const drew = drawImage(this, unit, slot, {
      x,
      y,
      angle: options.bodyAngle + (slotAngleOffsets[slot] || 0),
      alpha: options.hitReact > 0 ? 0.96 : 1,
      pivot: slotPivots[slot],
      width: slotWidths[slot] || (prone ? 96 : 76)
    });
    if (!drew) return false;

    const ctx = this.ctx;
    if (!prone) {
      if (options.controlledDrone && this.drawInfantryDroneController) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(options.bodyAngle);
        this.drawInfantryDroneController(ctx, options.controlledDrone);
        ctx.restore();
      }
    }
    if (unit.isSquadLeader && this.drawSquadLeaderMarker) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(options.bodyAngle);
      this.drawSquadLeaderMarker(ctx, unit, options.style || {}, prone);
      ctx.restore();
    }
    if (options.hitReact > 0 && this.drawInfantryHitFlash) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(options.bodyAngle);
      this.drawInfantryHitFlash(ctx, unit, prone, options.hitReact);
      ctx.restore();
    }
    if (options.showPrompt) drawMountPrompt(this, game, unit);
    return true;
  };
})(typeof window !== "undefined" ? window : globalThis);
