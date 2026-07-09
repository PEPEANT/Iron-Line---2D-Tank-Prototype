"use strict";

// 보병 탑뷰 무기 아트 v2 (visual-overhaul-plan.md P5.5(b))
// 목업: docs/design-drafts/weapon-visuals-mockup.html (2026-07-06 오너 승인)
// 무기별 스프라이트를 오프스크린 캔버스에 1회 렌더 후 프레임당 drawImage 1회.
(function registerInfantryWeaponArt(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const Renderer = IronLine.Renderer;
  if (!Renderer?.prototype) return;

  const SPRITE_RES = 6;
  const BOUNDS = { minX: -8, minY: -8, width: 44, height: 16 };
  const CARRY_SCALE = 0.8;
  const spriteCache = new Map();

  const MET = "#262c1f";
  const METD = "#1a1f15";
  const FURN = "#3f4a33";
  const WOOD = "#5d4326";
  const EDGE = "rgba(6, 9, 5, 0.55)";
  const HILT = "rgba(237, 244, 239, 0.13)";

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function edge(ctx) {
    ctx.strokeStyle = EDGE;
    ctx.lineWidth = 0.45;
    ctx.stroke();
  }

  const weaponArt = {
    rifle(ctx) {
      ctx.fillStyle = FURN;
      roundRect(ctx, -4.6, -1.7, 4.8, 3.4, 1); ctx.fill(); edge(ctx);
      ctx.fillStyle = MET;
      roundRect(ctx, 0, -2.5, 8.5, 5, 1); ctx.fill(); edge(ctx);
      ctx.strokeStyle = HILT; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(1, -1.7); ctx.lineTo(8, -1.7); ctx.stroke();
      ctx.fillStyle = METD;
      roundRect(ctx, 3.6, 2.2, 2.8, 3, 0.8); ctx.fill(); edge(ctx);
      ctx.fillStyle = METD;
      roundRect(ctx, 8.5, -1.15, 5.8, 2.3, 0.8); ctx.fill(); edge(ctx);
      ctx.fillStyle = "#12160d";
      roundRect(ctx, 12.6, -1.9, 0.8, 1, 0.3); ctx.fill();
      roundRect(ctx, 14.3, -1.5, 1.7, 3, 0.6); ctx.fill(); edge(ctx);
    },

    smg(ctx) {
      ctx.strokeStyle = METD; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-1, -1.3); ctx.lineTo(-3.4, -1.3);
      ctx.moveTo(-1, 1.3); ctx.lineTo(-3.4, 1.3);
      ctx.moveTo(-3.4, -1.3); ctx.arc(-3.4, 0, 1.3, -Math.PI / 2, Math.PI / 2, true);
      ctx.stroke();
      ctx.fillStyle = MET;
      roundRect(ctx, -1, -2.6, 7, 5.2, 1.2); ctx.fill(); edge(ctx);
      ctx.fillStyle = METD;
      roundRect(ctx, 2.4, 2.4, 3, 3.4, 0.8); ctx.fill(); edge(ctx);
      ctx.fillStyle = METD;
      roundRect(ctx, 6, -1, 3.2, 2, 0.7); ctx.fill(); edge(ctx);
      ctx.fillStyle = "#161b11";
      roundRect(ctx, 9.2, -1.35, 2.8, 2.7, 1); ctx.fill(); edge(ctx);
    },

    lmg(ctx) {
      ctx.fillStyle = FURN;
      roundRect(ctx, -4.6, -1.7, 4.8, 3.4, 1); ctx.fill(); edge(ctx);
      ctx.fillStyle = MET;
      roundRect(ctx, 0, -2.7, 9.5, 5.4, 1); ctx.fill(); edge(ctx);
      ctx.fillStyle = "#141910";
      roundRect(ctx, 4.6, -3.5, 3.2, 1, 0.4); ctx.fill();
      ctx.fillStyle = METD;
      ctx.beginPath(); ctx.arc(4.6, 3.2, 2.5, 0, Math.PI * 2); ctx.fill(); edge(ctx);
      ctx.fillStyle = "rgba(237, 244, 239, 0.07)";
      ctx.beginPath(); ctx.arc(4.6, 3.2, 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = METD;
      roundRect(ctx, 9.5, -1.2, 8.2, 2.4, 0.8); ctx.fill(); edge(ctx);
      ctx.strokeStyle = "#12160d"; ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(10.5, -1.7); ctx.lineTo(15.5, -1.9);
      ctx.moveTo(10.5, 1.7); ctx.lineTo(15.5, 1.9);
      ctx.stroke();
      ctx.fillStyle = "#12160d";
      roundRect(ctx, 17.7, -1.55, 2.3, 3.1, 0.7); ctx.fill(); edge(ctx);
    },

    machinegun(ctx) {
      ctx.fillStyle = METD;
      roundRect(ctx, -4.6, -1.6, 1.3, 3.2, 0.5); ctx.fill(); edge(ctx);
      roundRect(ctx, -3.3, -0.8, 3.3, 1.6, 0.5); ctx.fill(); edge(ctx);
      ctx.fillStyle = MET;
      roundRect(ctx, 0, -2.9, 10, 5.8, 0.9); ctx.fill(); edge(ctx);
      ctx.fillStyle = METD;
      roundRect(ctx, 2.6, -6.2, 5, 3.4, 0.7); ctx.fill(); edge(ctx);
      ctx.fillStyle = "#c9a34e";
      ctx.beginPath(); ctx.arc(3.7, -4.5, 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(5.1, -4.5, 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(6.5, -4.5, 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = METD;
      roundRect(ctx, 10, -1.4, 7.2, 2.8, 0.9); ctx.fill(); edge(ctx);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.4)"; ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(11.5, -1.4); ctx.lineTo(11.5, 1.4);
      ctx.moveTo(13, -1.4); ctx.lineTo(13, 1.4);
      ctx.stroke();
      ctx.strokeStyle = "#12160d"; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(16.2, -1.2); ctx.lineTo(19.4, -4.4);
      ctx.moveTo(16.2, 1.2); ctx.lineTo(19.4, 4.4);
      ctx.stroke();
      ctx.fillStyle = "#12160d";
      roundRect(ctx, 17.2, -1.75, 2.6, 3.5, 0.8); ctx.fill(); edge(ctx);
    },

    pistol(ctx) {
      ctx.fillStyle = MET;
      roundRect(ctx, 0, -1.5, 7, 3, 0.9); ctx.fill(); edge(ctx);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.45)"; ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0.9, -1); ctx.lineTo(0.9, 1);
      ctx.moveTo(1.7, -1); ctx.lineTo(1.7, 1);
      ctx.moveTo(2.5, -1); ctx.lineTo(2.5, 1);
      ctx.stroke();
      ctx.fillStyle = "#12160d";
      roundRect(ctx, -0.9, -0.8, 1, 1.6, 0.3); ctx.fill();
      roundRect(ctx, 7, -1, 1.3, 2, 0.4); ctx.fill(); edge(ctx);
      ctx.fillStyle = HILT;
      roundRect(ctx, 5.6, -0.4, 0.7, 0.8, 0.2); ctx.fill();
    },

    sniper(ctx) {
      ctx.fillStyle = FURN;
      roundRect(ctx, -5, -1.6, 5.2, 3.2, 1); ctx.fill(); edge(ctx);
      ctx.fillStyle = "#333d29";
      roundRect(ctx, -3.6, -2.3, 2.7, 1, 0.4); ctx.fill();
      ctx.fillStyle = MET;
      roundRect(ctx, 0, -1.9, 7, 3.8, 0.9); ctx.fill(); edge(ctx);
      ctx.strokeStyle = "#12160d"; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(5.4, 1.6); ctx.lineTo(6.8, 3.1); ctx.stroke();
      ctx.fillStyle = "#12160d";
      ctx.beginPath(); ctx.arc(6.9, 3.2, 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#12170e";
      ctx.beginPath(); ctx.arc(3.5, 0, 2.1, 0, Math.PI * 2); ctx.fill(); edge(ctx);
      ctx.fillStyle = "rgba(140, 220, 150, 0.5)";
      ctx.beginPath(); ctx.arc(3.5, 0, 0.9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = METD;
      roundRect(ctx, 7, -0.95, 14.2, 1.9, 0.7); ctx.fill(); edge(ctx);
      ctx.fillStyle = "#12160d";
      roundRect(ctx, 21.2, -1.3, 2.6, 2.6, 0.7); ctx.fill(); edge(ctx);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.5)"; ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(22, -1.3); ctx.lineTo(22, 1.3);
      ctx.moveTo(22.9, -1.3); ctx.lineTo(22.9, 1.3);
      ctx.stroke();
    },

    grenade(ctx) {
      ctx.translate(2.5, 0.5);
      ctx.fillStyle = "#29301f";
      ctx.beginPath(); ctx.ellipse(2, 0, 3.2, 2.6, 0, 0, Math.PI * 2); ctx.fill(); edge(ctx);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.42)"; ctx.lineWidth = 0.45;
      ctx.beginPath();
      ctx.moveTo(0.2, -1.7); ctx.lineTo(0.2, 1.7);
      ctx.moveTo(2, -2.3); ctx.lineTo(2, 2.3);
      ctx.moveTo(3.8, -1.7); ctx.lineTo(3.8, 1.7);
      ctx.moveTo(-0.8, -0.8); ctx.lineTo(4.9, -0.8);
      ctx.moveTo(-1.1, 0.6); ctx.lineTo(5.1, 0.6);
      ctx.stroke();
      ctx.fillStyle = METD;
      roundRect(ctx, 4.9, -1, 1.7, 2, 0.5); ctx.fill(); edge(ctx);
      ctx.strokeStyle = METD; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(5.5, -0.9); ctx.quadraticCurveTo(4, -3.2, 1, -2.9); ctx.stroke();
      ctx.strokeStyle = "#b7975a"; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.arc(5.6, -2.1, 0.9, 0, Math.PI * 2); ctx.stroke();
    },

    grenadeLauncher(ctx) {
      ctx.fillStyle = FURN;
      roundRect(ctx, -4.6, -1.7, 4.8, 3.4, 1); ctx.fill(); edge(ctx);
      ctx.fillStyle = MET;
      roundRect(ctx, 0, -2, 4.5, 4, 0.9); ctx.fill(); edge(ctx);
      ctx.fillStyle = "#20261a";
      roundRect(ctx, 4.5, -2.8, 12.5, 5.6, 2.6); ctx.fill(); edge(ctx);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.45)"; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(5.6, -2.4); ctx.lineTo(5.6, 2.4); ctx.stroke();
      ctx.fillStyle = "#0a0e07";
      ctx.beginPath(); ctx.ellipse(17, 0, 0.9, 2.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#12160d";
      roundRect(ctx, 6.4, -3.8, 1, 1.3, 0.3); ctx.fill();
    },

    rpg(ctx) {
      ctx.fillStyle = METD;
      ctx.beginPath();
      ctx.moveTo(-4, -2.2); ctx.lineTo(0, -1.4); ctx.lineTo(0, 1.4); ctx.lineTo(-4, 2.2);
      ctx.closePath(); ctx.fill(); edge(ctx);
      ctx.fillStyle = MET;
      roundRect(ctx, 0, -1.4, 20, 2.8, 1); ctx.fill(); edge(ctx);
      ctx.fillStyle = WOOD;
      roundRect(ctx, 7, -1.4, 6, 2.8, 0.1); ctx.fill(); edge(ctx);
      ctx.fillStyle = "#141a10";
      roundRect(ctx, 8.2, 1.6, 2, 2.8, 0.6); ctx.fill(); edge(ctx);
      roundRect(ctx, 12, 1.6, 2, 2.6, 0.6); ctx.fill(); edge(ctx);
      ctx.fillStyle = "#12160d";
      roundRect(ctx, 4.5, -2.7, 1, 1.5, 0.3); ctx.fill();
      ctx.fillStyle = MET;
      ctx.beginPath();
      ctx.moveTo(20, -2.7);
      ctx.quadraticCurveTo(27, -2.4, 31, 0);
      ctx.quadraticCurveTo(27, 2.4, 20, 2.7);
      ctx.closePath(); ctx.fill(); edge(ctx);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.4)"; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(21, -2.6); ctx.lineTo(21, 2.6); ctx.stroke();
      ctx.strokeStyle = "#12160d"; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(31, 0); ctx.lineTo(32.4, 0); ctx.stroke();
    },

    repairKit(ctx) {
      ctx.translate(1, 0.5);
      ctx.fillStyle = FURN;
      roundRect(ctx, 0, -3.4, 10, 6.8, 1.2); ctx.fill(); edge(ctx);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.45)"; ctx.lineWidth = 0.55;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, 0); ctx.stroke();
      ctx.fillStyle = "#141a10";
      roundRect(ctx, 2, -0.7, 1.2, 1.4, 0.3); ctx.fill();
      roundRect(ctx, 6.8, -0.7, 1.2, 1.4, 0.3); ctx.fill();
      ctx.fillStyle = "rgba(237, 244, 239, 0.82)";
      roundRect(ctx, 4.4, -2.6, 1.2, 2.1, 0.2); ctx.fill();
      roundRect(ctx, 3.4, -2.05, 3.2, 1, 0.2); ctx.fill();
    },

    fieldRadio(ctx) {
      ctx.translate(1, 0);
      ctx.fillStyle = FURN;
      roundRect(ctx, 0, -4.7, 8.8, 9.4, 1.6); ctx.fill(); edge(ctx);
      ctx.strokeStyle = METD; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(4.4, -4.7); ctx.lineTo(6.5, -8.2); ctx.stroke();
      ctx.fillStyle = "rgba(216, 244, 199, 0.86)";
      roundRect(ctx, 1.9, -3.2, 5, 2.6, 0.5); ctx.fill(); edge(ctx);
      ctx.fillStyle = METD;
      roundRect(ctx, 2, 0.6, 4.8, 0.7, 0.25); ctx.fill();
      roundRect(ctx, 2, 2.1, 4.8, 0.7, 0.25); ctx.fill();
      ctx.fillStyle = "#ffd166";
      ctx.beginPath(); ctx.arc(2.5, 4, 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = METD;
      ctx.beginPath(); ctx.arc(4.5, 4, 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(6.5, 4, 0.55, 0, Math.PI * 2); ctx.fill();
    },

    reconDrone(ctx) {
      ctx.translate(2, 0);
      ctx.strokeStyle = "#141910"; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(3, -1.6); ctx.lineTo(0.5, -3.6);
      ctx.moveTo(7, -1.6); ctx.lineTo(9.5, -3.6);
      ctx.moveTo(3, 1.6); ctx.lineTo(0.5, 3.6);
      ctx.moveTo(7, 1.6); ctx.lineTo(9.5, 3.6);
      ctx.stroke();
      ctx.fillStyle = "rgba(180, 194, 181, 0.2)";
      ctx.beginPath(); ctx.ellipse(0.5, -3.6, 2, 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(9.5, -3.6, 2, 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0.5, 3.6, 2, 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(9.5, 3.6, 2, 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = METD;
      ctx.beginPath(); ctx.arc(0.5, -3.6, 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(9.5, -3.6, 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(0.5, 3.6, 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(9.5, 3.6, 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = MET;
      roundRect(ctx, 2, -2, 6, 4, 1.3); ctx.fill(); edge(ctx);
      ctx.fillStyle = "rgba(140, 216, 255, 0.85)";
      ctx.beginPath(); ctx.arc(5, 0, 0.95, 0, Math.PI * 2); ctx.fill();
    },

    kamikazeDrone(ctx) {
      ctx.translate(1.5, 0);
      ctx.strokeStyle = "#141910"; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(3.5, -1.8); ctx.lineTo(1, -4);
      ctx.moveTo(8.5, -1.8); ctx.lineTo(11, -4);
      ctx.moveTo(3.5, 1.8); ctx.lineTo(1, 4);
      ctx.moveTo(8.5, 1.8); ctx.lineTo(11, 4);
      ctx.stroke();
      ctx.fillStyle = "rgba(203, 112, 62, 0.22)";
      ctx.beginPath(); ctx.ellipse(1, -4, 2, 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(11, -4, 2, 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(1, 4, 2, 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(11, 4, 2, 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = METD;
      ctx.beginPath(); ctx.arc(1, -4, 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(11, -4, 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(1, 4, 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(11, 4, 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = MET;
      roundRect(ctx, 2.5, -2.2, 7, 4.4, 1.3); ctx.fill(); edge(ctx);
      ctx.fillStyle = "rgba(255, 107, 94, 0.85)";
      ctx.fillRect(4, -2.2, 1, 4.4);
      ctx.fillRect(6.5, -2.2, 1, 4.4);
      ctx.fillStyle = METD;
      ctx.beginPath();
      ctx.moveTo(9.5, -1.1); ctx.lineTo(13, 0); ctx.lineTo(9.5, 1.1);
      ctx.closePath(); ctx.fill(); edge(ctx);
      ctx.fillStyle = "rgba(255, 107, 94, 0.95)";
      ctx.beginPath(); ctx.arc(13.3, 0, 0.6, 0, Math.PI * 2); ctx.fill();
    }
  };

  function spriteFor(weaponId, carry) {
    const id = weaponArt[weaponId] ? weaponId : "rifle";
    const key = carry ? `${id}:carry` : id;
    let sprite = spriteCache.get(key);
    if (sprite) return sprite;
    const canvas = document.createElement("canvas");
    canvas.width = BOUNDS.width * SPRITE_RES;
    canvas.height = BOUNDS.height * SPRITE_RES;
    const ctx = canvas.getContext("2d");
    ctx.translate(-BOUNDS.minX * SPRITE_RES, -BOUNDS.minY * SPRITE_RES);
    ctx.scale(SPRITE_RES, SPRITE_RES);
    if (carry) ctx.scale(CARRY_SCALE, CARRY_SCALE);
    weaponArt[id](ctx);
    spriteCache.set(key, canvas);
    return canvas;
  }

  // 장착 변환(자세·반동)은 기존 규칙 그대로 유지, 무기 묘사만 스프라이트로 교체.
  Renderer.prototype.drawInfantryWeapon = function drawInfantryWeaponArt(ctx, unit, weapon, pose = "stand-move", scoped = false, phase = 0) {
    const rpg = weapon.id === "rpg";
    const radio = weapon.id === "fieldRadio";
    const machineGun = weapon.id === "machinegun" || weapon.id === "lmg";
    const crawling = pose === "prone-crawl";
    const proneFire = pose === "prone-fire";
    const standingFire = pose === "stand-fire";
    const aimed = scoped || proneFire || standingFire || (rpg && unit.rpgAim);
    let sideOffset = rpg ? 7 : 8.4;
    let forwardOffset = -5.3;
    let weaponAngle = -0.52;
    if (radio) {
      sideOffset = 5.4;
      forwardOffset = -3.2;
      weaponAngle = -1.05;
    }

    if (crawling) {
      sideOffset = rpg ? 8.5 : 7.2 + Math.sin(phase) * 0.65;
      forwardOffset = rpg ? -1.5 : -2;
      weaponAngle = -0.36 + Math.cos(phase * 0.7) * 0.04;
    } else if (proneFire || scoped || (rpg && unit.rpgAim)) {
      sideOffset = 0.35;
      forwardOffset = scoped ? 4 : 3.2;
      weaponAngle = 0;
    } else if (standingFire) {
      sideOffset = rpg ? 3.8 : 3.1;
      forwardOffset = 2.3;
      weaponAngle = -0.04;
    }

    const recoil = (unit.gunKick || 0) * (machineGun ? 3.4 : 1.8) * (aimed ? 1 : 0.7);
    const carry = !(aimed || rpg);
    const sprite = spriteFor(weapon.id, carry);

    ctx.save();
    ctx.translate(0, sideOffset);
    ctx.rotate(weaponAngle);
    ctx.drawImage(sprite, forwardOffset - recoil + BOUNDS.minX, BOUNDS.minY, BOUNDS.width, BOUNDS.height);
    ctx.restore();
  };
})(window);
