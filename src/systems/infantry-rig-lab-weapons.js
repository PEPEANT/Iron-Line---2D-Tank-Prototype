"use strict";

(function registerInfantryRigLabWeapons(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  // 무기 12종 캔버스 아트. 게임 px 기준이며 총구 방향은 +x다.
  // 리그 랩에서는 그립-총구 거리에 맞춰 배율을 계산해 그린다.

  const WEAPON_DEFS = {
    rifle: { len: 38, scale: 0.98, maxScale: 1.78 },
    smg: { len: 19, scale: 1.08 },
    lmg: { len: 41, scale: 1.08, maxScale: 1.78 },
    machinegun: { len: 48, scale: 1.18, maxScale: 1.72 },
    pistol: { len: 9 },
    sniper: { len: 57, scale: 1.25, maxScale: 1.75 },
    grenade: { len: 10, fixedScale: 2.15 },
    grenadeLauncher: { len: 29, scale: 1.18 },
    rpg: { len: 32, scale: 1.42 },
    repairKit: { len: 12 },
    fieldRadio: { len: 12, fixedScale: 1.6 },
    reconDrone: { len: 14 },
    kamikazeDrone: { len: 16 }
  };
  const ONE_HAND_WEAPONS = new Set(["grenade"]);

  const MET = "#262c1f";
  const METD = "#1a1f15";
  const FURN = "#3f4a33";
  const WOOD = "#5d4326";
  const EDGE = "rgba(6, 9, 5, 0.55)";
  const HILT = "rgba(237, 244, 239, 0.13)";

  function roundRectPath(c, x, y, w, h, r) {
    const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    c.beginPath();
    c.moveTo(x + radius, y);
    c.arcTo(x + w, y, x + w, y + h, radius);
    c.arcTo(x + w, y + h, x, y + h, radius);
    c.arcTo(x, y + h, x, y, radius);
    c.arcTo(x, y, x + w, y, radius);
    c.closePath();
  }

  function weaponEdge(c) {
    c.strokeStyle = EDGE;
    c.lineWidth = 0.45;
    c.stroke();
  }

  const WEAPON_ART = {
    rifle(c) {
      c.fillStyle = "#26301f";
      c.beginPath();
      c.moveTo(-15.8, -3.1);
      c.lineTo(-5.2, -2.2);
      c.lineTo(-5.2, 2.2);
      c.lineTo(-15.8, 3.1);
      c.closePath(); c.fill(); weaponEdge(c);
      c.fillStyle = METD;
      roundRectPath(c, -5.6, -1, 5.4, 2, 0.5); c.fill(); weaponEdge(c);
      c.fillStyle = FURN;
      roundRectPath(c, -0.5, -2.55, 10.6, 5.1, 0.9); c.fill(); weaponEdge(c);
      c.fillStyle = MET;
      roundRectPath(c, 9.5, -2.05, 13.7, 4.1, 0.8); c.fill(); weaponEdge(c);
      c.strokeStyle = "rgba(237,244,239,0.16)"; c.lineWidth = 0.55;
      c.beginPath();
      c.moveTo(1.1, -1.5); c.lineTo(9.2, -1.5);
      c.moveTo(11.3, -1.1); c.lineTo(22, -1.1);
      c.stroke();
      c.fillStyle = METD;
      roundRectPath(c, 4.9, 2.3, 3.6, 5.8, 0.8); c.fill(); weaponEdge(c);
      c.fillStyle = METD;
      roundRectPath(c, 6.6, 2.25, 1.9, 3.4, 0.4); c.fill();
      c.strokeStyle = METD; c.lineWidth = 1.45;
      c.beginPath(); c.moveTo(22.8, 0); c.lineTo(35.6, 0); c.stroke();
      c.fillStyle = "#0f140d";
      roundRectPath(c, 34.5, -1.15, 3.2, 2.3, 0.5); c.fill(); weaponEdge(c);
    },
    smg(c) {
      c.strokeStyle = METD; c.lineWidth = 1;
      c.beginPath();
      c.moveTo(-1.5, -1.4); c.lineTo(-6.2, -1.4);
      c.moveTo(-1.5, 1.4); c.lineTo(-6.2, 1.4);
      c.moveTo(-6.2, -1.4); c.arc(-6.2, 0, 1.4, -Math.PI / 2, Math.PI / 2, true);
      c.stroke();
      c.fillStyle = MET;
      roundRectPath(c, -1.2, -2.7, 9.8, 5.4, 1.1); c.fill(); weaponEdge(c);
      c.fillStyle = METD;
      roundRectPath(c, 2.6, 2.4, 3.2, 5.1, 0.8); c.fill(); weaponEdge(c);
      c.fillStyle = METD;
      roundRectPath(c, 8.4, -1.25, 6.3, 2.5, 0.7); c.fill(); weaponEdge(c);
      c.fillStyle = "#161b11";
      roundRectPath(c, 14.2, -1.45, 4.3, 2.9, 0.8); c.fill(); weaponEdge(c);
    },
    lmg(c) {
      c.fillStyle = FURN;
      roundRectPath(c, -15.2, -2.5, 14.1, 5, 1); c.fill(); weaponEdge(c);
      c.fillStyle = MET;
      roundRectPath(c, -1.1, -3.3, 15.4, 6.6, 1); c.fill(); weaponEdge(c);
      c.fillStyle = "#141910";
      roundRectPath(c, 5.4, -4.4, 6.3, 1.3, 0.4); c.fill();
      c.fillStyle = METD;
      c.beginPath(); c.arc(5.7, 4.4, 3.7, 0, Math.PI * 2); c.fill(); weaponEdge(c);
      c.fillStyle = "rgba(237,244,239,0.07)";
      c.beginPath(); c.arc(5.7, 4.4, 1.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = METD;
      roundRectPath(c, 14.1, -1.6, 22.2, 3.2, 0.8); c.fill(); weaponEdge(c);
      c.strokeStyle = "#12160d"; c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(16.8, -2.3); c.lineTo(34.2, -2.7);
      c.moveTo(16.8, 2.3); c.lineTo(34.2, 2.7);
      c.stroke();
      c.fillStyle = "#12160d";
      roundRectPath(c, 35.7, -1.9, 4.8, 3.8, 0.7); c.fill(); weaponEdge(c);
    },
    machinegun(c) {
      c.fillStyle = METD;
      roundRectPath(c, -17.8, -2, 2.1, 4, 0.5); c.fill(); weaponEdge(c);
      roundRectPath(c, -15.8, -1.15, 14.8, 2.3, 0.5); c.fill(); weaponEdge(c);
      c.fillStyle = MET;
      roundRectPath(c, -1, -3.5, 16.6, 7, 0.9); c.fill(); weaponEdge(c);
      c.fillStyle = METD;
      roundRectPath(c, 2.7, -7.2, 8.4, 4.2, 0.7); c.fill(); weaponEdge(c);
      c.fillStyle = "#c9a34e";
      c.beginPath(); c.arc(3.7, -5, 0.5, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(5.4, -5, 0.5, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(7.1, -5, 0.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = METD;
      roundRectPath(c, 15.4, -1.75, 26.5, 3.5, 0.9); c.fill(); weaponEdge(c);
      c.strokeStyle = "rgba(0,0,0,0.4)"; c.lineWidth = 0.6;
      c.beginPath();
      c.moveTo(18.1, -1.7); c.lineTo(18.1, 1.7);
      c.moveTo(21.1, -1.7); c.lineTo(21.1, 1.7);
      c.moveTo(24.1, -1.7); c.lineTo(24.1, 1.7);
      c.moveTo(27.1, -1.7); c.lineTo(27.1, 1.7);
      c.stroke();
      c.strokeStyle = "#12160d"; c.lineWidth = 1;
      c.beginPath();
      c.moveTo(38.8, -1.4); c.lineTo(45.2, -5.2);
      c.moveTo(38.8, 1.4); c.lineTo(45.2, 5.2);
      c.stroke();
      c.fillStyle = "#12160d";
      roundRectPath(c, 41.6, -2.1, 5.6, 4.2, 0.8); c.fill(); weaponEdge(c);
    },
    pistol(c) {
      c.fillStyle = MET;
      roundRectPath(c, 0, -1.5, 7, 3, 0.9); c.fill(); weaponEdge(c);
      c.strokeStyle = "rgba(0,0,0,0.45)"; c.lineWidth = 0.5;
      c.beginPath();
      c.moveTo(0.9, -1); c.lineTo(0.9, 1);
      c.moveTo(1.7, -1); c.lineTo(1.7, 1);
      c.moveTo(2.5, -1); c.lineTo(2.5, 1);
      c.stroke();
      c.fillStyle = "#12160d";
      roundRectPath(c, -0.9, -0.8, 1, 1.6, 0.3); c.fill();
      roundRectPath(c, 7, -1, 1.3, 2, 0.4); c.fill(); weaponEdge(c);
      c.fillStyle = HILT;
      roundRectPath(c, 5.6, -0.4, 0.7, 0.8, 0.2); c.fill();
    },
    sniper(c) {
      c.fillStyle = FURN;
      roundRectPath(c, -21.5, -2.6, 20.8, 5.2, 1.1); c.fill(); weaponEdge(c);
      c.fillStyle = "#333d29";
      roundRectPath(c, -15.5, -3.5, 5.4, 1.3, 0.4); c.fill();
      c.fillStyle = MET;
      roundRectPath(c, -0.7, -2.35, 14.4, 4.7, 0.9); c.fill(); weaponEdge(c);
      c.strokeStyle = "#12160d"; c.lineWidth = 1.1;
      c.beginPath(); c.moveTo(7.6, 1.85); c.lineTo(9.5, 3.8); c.stroke();
      c.beginPath(); c.arc(9.6, 4, 0.65, 0, Math.PI * 2);
      c.fillStyle = "#12160d"; c.fill();
      c.fillStyle = "#12170e";
      c.beginPath(); c.ellipse(6.6, 0, 4.8, 2.4, 0, 0, Math.PI * 2); c.fill(); weaponEdge(c);
      c.fillStyle = "rgba(140, 220, 150, 0.5)";
      c.beginPath(); c.ellipse(6.6, 0, 2, 0.85, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = METD;
      roundRectPath(c, 13.4, -1.05, 38.8, 2.1, 0.7); c.fill(); weaponEdge(c);
      c.fillStyle = "#12160d";
      roundRectPath(c, 51.8, -1.45, 5.1, 2.9, 0.7); c.fill(); weaponEdge(c);
      c.strokeStyle = "rgba(0,0,0,0.5)"; c.lineWidth = 0.5;
      c.beginPath();
      c.moveTo(53.2, -1.45); c.lineTo(53.2, 1.45);
      c.moveTo(55, -1.45); c.lineTo(55, 1.45);
      c.stroke();
    },
    grenade(c) {
      c.translate(2.5, 0.5);
      c.fillStyle = "#29301f";
      c.beginPath(); c.ellipse(2, 0, 3.2, 2.6, 0, 0, Math.PI * 2); c.fill(); weaponEdge(c);
      c.strokeStyle = "rgba(0,0,0,0.42)"; c.lineWidth = 0.45;
      c.beginPath();
      c.moveTo(0.2, -1.7); c.lineTo(0.2, 1.7);
      c.moveTo(2, -2.3); c.lineTo(2, 2.3);
      c.moveTo(3.8, -1.7); c.lineTo(3.8, 1.7);
      c.moveTo(-0.8, -0.8); c.lineTo(4.9, -0.8);
      c.moveTo(-1.1, 0.6); c.lineTo(5.1, 0.6);
      c.stroke();
      c.fillStyle = METD;
      roundRectPath(c, 4.9, -1, 1.7, 2, 0.5); c.fill(); weaponEdge(c);
      c.strokeStyle = METD; c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(5.5, -0.9); c.quadraticCurveTo(4, -3.2, 1, -2.9); c.stroke();
      c.strokeStyle = "#b7975a"; c.lineWidth = 0.7;
      c.beginPath(); c.arc(5.6, -2.1, 0.9, 0, Math.PI * 2); c.stroke();
    },
    grenadeLauncher(c) {
      c.fillStyle = FURN;
      roundRectPath(c, -4.6, -1.7, 4.8, 3.4, 1); c.fill(); weaponEdge(c);
      c.fillStyle = MET;
      roundRectPath(c, 0, -2, 4.5, 4, 0.9); c.fill(); weaponEdge(c);
      c.fillStyle = "#20261a";
      roundRectPath(c, 4.5, -2.8, 12.5, 5.6, 2.6); c.fill(); weaponEdge(c);
      c.strokeStyle = "rgba(0,0,0,0.45)"; c.lineWidth = 0.6;
      c.beginPath(); c.moveTo(5.6, -2.4); c.lineTo(5.6, 2.4); c.stroke();
      c.fillStyle = "#0a0e07";
      c.beginPath(); c.ellipse(17, 0, 0.9, 2.1, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#12160d";
      roundRectPath(c, 6.4, -3.8, 1, 1.3, 0.3); c.fill();
    },
    rpg(c) {
      c.fillStyle = METD;
      c.beginPath();
      c.moveTo(-4, -2.2); c.lineTo(0, -1.4); c.lineTo(0, 1.4); c.lineTo(-4, 2.2);
      c.closePath(); c.fill(); weaponEdge(c);
      c.fillStyle = MET;
      roundRectPath(c, 0, -1.4, 20, 2.8, 1); c.fill(); weaponEdge(c);
      c.fillStyle = WOOD;
      roundRectPath(c, 7, -1.4, 6, 2.8, 0); c.fill(); weaponEdge(c);
      c.fillStyle = "#141a10";
      roundRectPath(c, 8.2, 1.6, 2, 2.8, 0.6); c.fill(); weaponEdge(c);
      roundRectPath(c, 12, 1.6, 2, 2.6, 0.6); c.fill(); weaponEdge(c);
      c.fillStyle = "#12160d";
      roundRectPath(c, 4.5, -2.7, 1, 1.5, 0.3); c.fill();
      c.fillStyle = MET;
      c.beginPath();
      c.moveTo(20, -2.7);
      c.quadraticCurveTo(27, -2.4, 31, 0);
      c.quadraticCurveTo(27, 2.4, 20, 2.7);
      c.closePath(); c.fill(); weaponEdge(c);
      c.strokeStyle = "rgba(0,0,0,0.4)"; c.lineWidth = 0.6;
      c.beginPath(); c.moveTo(21, -2.6); c.lineTo(21, 2.6); c.stroke();
      c.strokeStyle = "#12160d"; c.lineWidth = 1.1;
      c.beginPath(); c.moveTo(31, 0); c.lineTo(32.4, 0); c.stroke();
    },
    repairKit(c) {
      c.translate(1, 0.5);
      c.fillStyle = FURN;
      roundRectPath(c, 0, -3.4, 10, 6.8, 1.2); c.fill(); weaponEdge(c);
      c.strokeStyle = "rgba(0,0,0,0.45)"; c.lineWidth = 0.55;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(10, 0); c.stroke();
      c.fillStyle = "#141a10";
      roundRectPath(c, 2, -0.7, 1.2, 1.4, 0.3); c.fill();
      roundRectPath(c, 6.8, -0.7, 1.2, 1.4, 0.3); c.fill();
      c.fillStyle = "rgba(237, 244, 239, 0.82)";
      roundRectPath(c, 4.4, -2.6, 1.2, 2.1, 0.2); c.fill();
      roundRectPath(c, 3.4, -2.05, 3.2, 1, 0.2); c.fill();
    },
    fieldRadio(c) {
      c.translate(1, 0);
      c.fillStyle = FURN;
      roundRectPath(c, 0, -4.7, 8.8, 9.4, 1.6); c.fill(); weaponEdge(c);
      c.strokeStyle = METD; c.lineWidth = 0.7;
      c.beginPath(); c.moveTo(4.4, -4.7); c.lineTo(6.5, -8.2); c.stroke();
      c.fillStyle = "rgba(216,244,199,0.86)";
      roundRectPath(c, 1.9, -3.2, 5, 2.6, 0.5); c.fill(); weaponEdge(c);
      c.fillStyle = METD;
      roundRectPath(c, 2, 0.6, 4.8, 0.7, 0.25); c.fill();
      roundRectPath(c, 2, 2.1, 4.8, 0.7, 0.25); c.fill();
      c.fillStyle = "#ffd166";
      c.beginPath(); c.arc(2.5, 4, 0.55, 0, Math.PI * 2); c.fill();
      c.fillStyle = METD;
      c.beginPath(); c.arc(4.5, 4, 0.55, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(6.5, 4, 0.55, 0, Math.PI * 2); c.fill();
    },
    reconDrone(c) {
      c.translate(2, 0);
      c.strokeStyle = "#141910"; c.lineWidth = 1;
      c.beginPath();
      c.moveTo(3, -1.6); c.lineTo(0.5, -3.6);
      c.moveTo(7, -1.6); c.lineTo(9.5, -3.6);
      c.moveTo(3, 1.6); c.lineTo(0.5, 3.6);
      c.moveTo(7, 1.6); c.lineTo(9.5, 3.6);
      c.stroke();
      c.fillStyle = "rgba(180, 194, 181, 0.2)";
      c.beginPath(); c.ellipse(0.5, -3.6, 2, 0.8, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(9.5, -3.6, 2, 0.8, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(0.5, 3.6, 2, 0.8, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(9.5, 3.6, 2, 0.8, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = METD;
      c.beginPath(); c.arc(0.5, -3.6, 1.1, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(9.5, -3.6, 1.1, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(0.5, 3.6, 1.1, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(9.5, 3.6, 1.1, 0, Math.PI * 2); c.fill();
      c.fillStyle = MET;
      roundRectPath(c, 2, -2, 6, 4, 1.3); c.fill(); weaponEdge(c);
      c.fillStyle = "rgba(140, 216, 255, 0.85)";
      c.beginPath(); c.arc(5, 0, 0.95, 0, Math.PI * 2); c.fill();
    },
    kamikazeDrone(c) {
      c.translate(1.5, 0);
      c.strokeStyle = "#141910"; c.lineWidth = 1;
      c.beginPath();
      c.moveTo(3.5, -1.8); c.lineTo(1, -4);
      c.moveTo(8.5, -1.8); c.lineTo(11, -4);
      c.moveTo(3.5, 1.8); c.lineTo(1, 4);
      c.moveTo(8.5, 1.8); c.lineTo(11, 4);
      c.stroke();
      c.fillStyle = "rgba(203, 112, 62, 0.22)";
      c.beginPath(); c.ellipse(1, -4, 2, 0.8, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(11, -4, 2, 0.8, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(1, 4, 2, 0.8, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(11, 4, 2, 0.8, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = METD;
      c.beginPath(); c.arc(1, -4, 1.1, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(11, -4, 1.1, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(1, 4, 1.1, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(11, 4, 1.1, 0, Math.PI * 2); c.fill();
      c.fillStyle = MET;
      roundRectPath(c, 2.5, -2.2, 7, 4.4, 1.3); c.fill(); weaponEdge(c);
      c.fillStyle = "rgba(255, 107, 94, 0.85)";
      c.fillRect(4, -2.2, 1, 4.4);
      c.fillRect(6.5, -2.2, 1, 4.4);
      c.fillStyle = METD;
      c.beginPath();
      c.moveTo(9.5, -1.1); c.lineTo(13, 0); c.lineTo(9.5, 1.1);
      c.closePath(); c.fill(); weaponEdge(c);
      c.fillStyle = "rgba(255, 107, 94, 0.95)";
      c.beginPath(); c.arc(13.3, 0, 0.6, 0, Math.PI * 2); c.fill();
    }
  };

  IronLine.infantryRigLabWeapons = {
    WEAPON_DEFS,
    ONE_HAND_WEAPONS,
    WEAPON_ART
  };
})(window);
