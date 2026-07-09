"use strict";

/*
 * 보병 파츠 리그 랩 v2
 * - 몸통, 머리, 팔 상/하단 파츠를 핀으로 연결해 서기 포즈를 실험한다.
 * - 리깅 모드에서는 파츠 기준점을 맞추고, 포즈 모드에서는 손/조준점을 움직인다.
 */
(function initInfantryRigLabV2() {
  const canvas = document.getElementById("rigCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const status = document.getElementById("rigStatus");
  const hint = document.getElementById("rigHint");
  const output = document.getElementById("rigOutput");
  const weaponSelect = document.getElementById("weaponSelect");
  const holdWeaponInput = document.getElementById("holdWeapon");
  const followAimInput = document.getElementById("followAim");
  const showBonesInput = document.getElementById("showBones");
  const showSheetInput = document.getElementById("showSheet");
  const showPinDotsInput = document.getElementById("showPinDots");
  const showPinLabelsInput = document.getElementById("showPinLabels");
  const bakeResult = document.getElementById("bakeResult");
  const zoomRange = document.getElementById("zoomRange");
  const layerList = document.getElementById("layerList");
  const scaleList = document.getElementById("scaleList");
  const modeButtons = Array.from(document.querySelectorAll("[data-mode]"));
  const animButtons = Array.from(document.querySelectorAll("[data-anim]"));

  const STAGE = { width: 960, height: 640 };
  const VIEW_CENTER = { x: STAGE.width / 2, y: STAGE.height / 2 };
  const SOURCE = "../../assets/ui/infantry/rig/soubok-infantry-top-v2.png";
  const ARM_SOURCE = "../../assets/ui/infantry/rig/soubok-infantry-arms-patch-v4.png";
  const STORAGE_KEY = "soubok.infantryRigLab.v13";
  const HALF_PI = Math.PI / 2;
  const SEGMENT_OVERLAP = 3;
  const LIMB_TURN_FOLLOW = 0.52;
  const WALK_PRESET = Object.freeze({
    speed: 6.2,
    rootSide: 1.8,
    rootForward: 1.4,
    bodyRoll: 0.052,
    headCounterRoll: 0.026,
    shoulderSwing: 3.6,
    shoulderLift: 1.1,
    weaponSide: 4.2,
    weaponForward: 2.2,
    weaponAim: 0.046,
    freeArmSwing: 18,
    freeArmSide: 4,
    freeArmForward: 5
  });

  const SHEET = {
    body: { sx: 188, sy: 94, sw: 86, sh: 109, pivot: { x: 43, y: 55 } },
    head: { sx: 198, sy: 207, sw: 78, sh: 86, pivot: { x: 39, y: 43 } },
    leftArm: { sx: 145, sy: 111, sw: 49, sh: 115 },
    rightArm: { sx: 284, sy: 111, sw: 49, sh: 115 }
  };
  const ARM_SHEET = {
    leftUpperArm: { sx: 34, sy: 10, sw: 38, sh: 83, pivot: { x: 19, y: 8 }, distal: { x: 18, y: 76 } },
    leftLowerArm: { sx: 35, sy: 96, sw: 33, sh: 75, pivot: { x: 16, y: 10 }, distal: { x: 16, y: 69 } },
    rightUpperArm: { sx: 170, sy: 10, sw: 38, sh: 83, pivot: { x: 19, y: 8 }, distal: { x: 19, y: 76 } },
    rightLowerArm: { sx: 173, sy: 97, sw: 33, sh: 73, pivot: { x: 17, y: 10 }, distal: { x: 16, y: 68 } }
  };
  const DEFAULT_PART_PINS = Object.freeze({
    leftArm: Object.freeze({
      shoulder: Object.freeze({ x: 0, y: 0 }),
      elbow: Object.freeze({ x: 0, y: 60 }),
      hand: Object.freeze({ x: -3, y: 122 })
    }),
    rightArm: Object.freeze({
      shoulder: Object.freeze({ x: 0, y: 0 }),
      elbow: Object.freeze({ x: 0, y: 59 }),
      hand: Object.freeze({ x: -1, y: 120 })
    })
  });
  const DEFAULT_HEAD_PIN = Object.freeze({ x: 5, y: 101 });
  const DEFAULT_WEAPON_REST = Object.freeze({
    grip: Object.freeze({ x: 32, y: 100 }),
    foregrip: Object.freeze({ x: 18, y: 124 }),
    rearGrip: Object.freeze({ x: 32, y: 116 }),
    muzzle: Object.freeze({ x: 0, y: 154 })
  });

  const LAYER_LABELS = {
    body: "몸통",
    leftArm: "왼팔",
    rightArm: "오른팔",
    weapon: "무기",
    head: "머리"
  };

  const PIN_COLORS = {
    move: "#8ebc72",
    bone: "#f1bd5a",
    hand: "#73c7d4",
    weapon: "#df6b62"
  };
  const BAKE = Object.freeze({
    frameWidth: 256,
    frameHeight: 320,
    columns: 4,
    sheetName: "soubok-infantry-baked-stand-v16.png",
    dataName: "soubok-infantry-baked-stand-v16.json"
  });

  const WEAPON_PACK = window.IronLine?.infantryRigLabWeapons || {};
  const WEAPON_DEFS = WEAPON_PACK.WEAPON_DEFS || {};
  const ONE_HAND_WEAPONS = WEAPON_PACK.ONE_HAND_WEAPONS || new Set(["grenade"]);
  const WEAPON_ART = WEAPON_PACK.WEAPON_ART || {};
  function defaultState() {
    return {
      mode: "rig",
      anim: "none",
      weaponType: "rifle",
      holdWeapon: true,
      followAim: true,
      showBones: true,
      showSheet: false,
      showPinDots: true,
      showPinLabels: false,
      zoom: 1.35,
      scales: { body: 1, head: 1, leftArm: 1, rightArm: 1, weapon: 1.6 },
      layers: [
        { id: "body", visible: true },
        { id: "leftArm", visible: true },
        { id: "rightArm", visible: true },
        { id: "weapon", visible: true },
        { id: "head", visible: true }
      ],
      rig: {
        root: { x: 480, y: 300 },
        headPin: { ...DEFAULT_HEAD_PIN },
        shoulderL: { x: -42, y: -6 },
        shoulderR: { x: 42, y: -6 },
        partPins: {
          leftArm: clone(DEFAULT_PART_PINS.leftArm),
          rightArm: clone(DEFAULT_PART_PINS.rightArm)
        },
        weaponRest: {
          grip: { ...DEFAULT_WEAPON_REST.grip },
          foregrip: { ...DEFAULT_WEAPON_REST.foregrip },
          rearGrip: { ...DEFAULT_WEAPON_REST.rearGrip },
          muzzle: { ...DEFAULT_WEAPON_REST.muzzle }
        }
      },
      pose: {
        bodyAngle: 0,
        torsoAngle: 0,
        headAngle: 0,
        armL: { target: { x: -49, y: 86 }, bend: -1 },
        armR: { target: { x: 50, y: 86 }, bend: 1 },
        weapon: { pos: { x: 32, y: 100 }, aim: null }
      },
      motion: {
        walk: { ...WALK_PRESET }
      }
    };
  }

  let state = defaultState();
  let ready = false;
  let drag = null;
  let hoverId = null;
  let lastPointer = null;
  let flashUntil = 0;
  const partCanvases = {};
  const armPartCanvases = {};
  const image = new Image();
  const armImage = new Image();

  // ---------- ?섑븰 ?꾩슦誘?----------

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function angleOf(v) {
    return Math.atan2(v.y, v.x);
  }

  function rot(p, a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
  }

  function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
  }

  function sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
  }

  function scale(v, s) {
    return { x: v.x * s, y: v.y * s };
  }

  function unit(v) {
    const len = Math.hypot(v.x, v.y) || 1;
    return { x: v.x / len, y: v.y / len };
  }

  function cross(a, b) {
    return a.x * b.y - a.y * b.x;
  }

  function partScale(name) {
    return clamp(Number(state.scales?.[name]) || 1, 0.4, 2);
  }

  function isOneHandWeapon(type = state.weaponType) {
    return ONE_HAND_WEAPONS.has(type);
  }

  function copyDefaultWeaponRest() {
    return {
      grip: { ...DEFAULT_WEAPON_REST.grip },
      foregrip: { ...DEFAULT_WEAPON_REST.foregrip },
      rearGrip: { ...DEFAULT_WEAPON_REST.rearGrip },
      muzzle: { ...DEFAULT_WEAPON_REST.muzzle }
    };
  }

  // 앞손은 실제 손 위치가 아니라 총열을 받치는 지점이다.
  // 그래서 총구/그립 축 위에만 존재하도록 보정한다.
  function repairWeaponPoint(point, fallback) {
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { ...fallback };
    return {
      x: clamp(x, -220, 220),
      y: clamp(y, -220, 260)
    };
  }

  function repairWeaponRest(rest) {
    const base = copyDefaultWeaponRest();
    const fixed = {
      grip: repairWeaponPoint(rest?.grip, base.grip),
      foregrip: repairWeaponPoint(rest?.foregrip, base.foregrip),
      rearGrip: repairWeaponPoint(rest?.rearGrip, base.rearGrip),
      muzzle: repairWeaponPoint(rest?.muzzle, base.muzzle)
    };
    if (dist(fixed.muzzle, fixed.grip) < 24) {
      fixed.muzzle = { ...base.muzzle };
    }
    return fixed;
  }

  function repairArmPins(name, pins) {
    const base = clone(DEFAULT_PART_PINS[name]);
    const fixed = {
      shoulder: { ...base.shoulder, ...(pins?.shoulder || {}) },
      elbow: { ...base.elbow, ...(pins?.elbow || {}) },
      hand: { ...base.hand, ...(pins?.hand || {}) }
    };
    const upper = dist(fixed.shoulder, fixed.elbow);
    const lower = dist(fixed.elbow, fixed.hand);
    if (upper < 52 || lower < 52) return base;
    return fixed;
  }

  function repairHeadPin(pin) {
    const fixed = { ...DEFAULT_HEAD_PIN, ...(pin || {}) };
    // Older rig-lab saves used the upper edge of the head as the rotation point.
    // Move those saves to the visual center so head aiming rotates naturally.
    if (fixed.y < 86) return { ...DEFAULT_HEAD_PIN };
    return fixed;
  }

  // ---------- 상태 저장/복원 ----------

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_error) { /* ????ㅽ뙣??臾댁떆 */ }
    updateOutput();
  }

  function mergeState(saved) {
    if (!saved || typeof saved !== "object") return;
    const base = defaultState();
    state = {
      ...base,
      ...saved,
      rig: {
        ...base.rig,
        ...(saved.rig || {}),
        headPin: repairHeadPin(saved.rig?.headPin || base.rig.headPin),
        partPins: {
          leftArm: repairArmPins("leftArm", saved.rig?.partPins?.leftArm || base.rig.partPins.leftArm),
          rightArm: repairArmPins("rightArm", saved.rig?.partPins?.rightArm || base.rig.partPins.rightArm)
        },
        weaponRest: repairWeaponRest(saved.rig?.weaponRest || base.rig.weaponRest)
      },
      pose: {
        ...base.pose,
        ...(saved.pose || {}),
        armL: { ...base.pose.armL, ...(saved.pose?.armL || {}) },
        armR: { ...base.pose.armR, ...(saved.pose?.armR || {}) },
        weapon: { ...base.pose.weapon, ...(saved.pose?.weapon || {}) },
        torsoAngle: Number(saved.pose?.torsoAngle) || 0
      },
      motion: {
        ...base.motion,
        ...(saved.motion || {}),
        walk: { ...base.motion.walk, ...(saved.motion?.walk || {}) }
      },
      scales: { ...base.scales, ...(saved.scales || {}) },
      weaponType: WEAPON_ART[saved.weaponType] ? saved.weaponType : base.weaponType,
      followAim: typeof saved.followAim === "boolean" ? saved.followAim : base.followAim,
      showPinDots: typeof saved.showPinDots === "boolean" ? saved.showPinDots : base.showPinDots,
      showPinLabels: typeof saved.showPinLabels === "boolean" ? saved.showPinLabels : base.showPinLabels,
      layers: Array.isArray(saved.layers) && saved.layers.length === 5 ? saved.layers : base.layers
    };
  }

  function loadSavedState() {
    try {
      mergeState(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));
    } catch (_error) {
      state = defaultState();
    }
  }

  // ---------- ?뚯툩 異붿텧 (??諛곌꼍 ?쒓굅) ----------

  function extractPart(part, sourceImage = image) {
    const offscreen = document.createElement("canvas");
    const offCtx = offscreen.getContext("2d", { willReadFrequently: true });
    offscreen.width = part.sw;
    offscreen.height = part.sh;
    offCtx.drawImage(sourceImage, part.sx, part.sy, part.sw, part.sh, 0, 0, part.sw, part.sh);
    const pixels = offCtx.getImageData(0, 0, part.sw, part.sh);
    const data = pixels.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r > 246 && g > 246 && b > 246) data[i + 3] = 0;
      else if (r > 235 && g > 235 && b > 235) data[i + 3] = Math.min(data[i + 3], 70);
    }
    offCtx.putImageData(pixels, 0, 0);
    return offscreen;
  }

  function buildParts() {
    Object.keys(SHEET).forEach((name) => {
      partCanvases[name] = extractPart(SHEET[name]);
    });
    Object.keys(ARM_SHEET).forEach((name) => {
      armPartCanvases[name] = extractPart(ARM_SHEET[name], armImage);
    });
  }

  // ---------- 堉?湲고븯 ----------

  function armGeometry(side) {
    const name = side === "L" ? "leftArm" : "rightArm";
    const pins = state.rig.partPins[name];
    const s = partScale(name);
    const upperLen = Math.max(6, dist(pins.shoulder, pins.elbow) * s);
    const lowerLen = Math.max(6, dist(pins.elbow, pins.hand) * s);
    return {
      pins,
      scale: s,
      upperLen,
      lowerLen,
      restUpper: angleOf(sub(pins.elbow, pins.shoulder)),
      restLower: angleOf(sub(pins.hand, pins.elbow)),
      splitNormal: unit(sub(pins.elbow, pins.shoulder))
    };
  }

  function shoulderLocal(side) {
    return side === "L" ? state.rig.shoulderL : state.rig.shoulderR;
  }

  function restAim() {
    const w = state.rig.weaponRest;
    return angleOf(sub(w.muzzle, w.grip));
  }

  function weaponAimLocal() {
    return state.pose.weapon.aim === null ? restAim() : state.pose.weapon.aim;
  }

  // 2관절 IK: 어깨(S)에서 목표(T)까지, bend가 팔꿈치 방향을 정한다.
  function solveArm(side, target, bend, shoulder) {
    const geo = armGeometry(side);
    const S = shoulder || shoulderLocal(side);
    const a = geo.upperLen;
    const b = geo.lowerLen;
    const rawDist = dist(S, target);
    const d = clamp(rawDist, Math.abs(a - b) + 0.5, a + b - 0.5);
    const base = angleOf(sub(target, S));
    const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
    const bendAngle = Math.acos(cosA);
    const upper = base - bend * bendAngle;
    const elbow = add(S, rot({ x: a, y: 0 }, upper));
    const reach = add(S, rot({ x: d, y: 0 }, base));
    const lower = angleOf(sub(reach, elbow));
    return { geo, S, upper, lower, elbow, hand: reach };
  }

  // ---------- ?꾨젅??怨꾩궛 ----------

  function toWorld(p, root, bodyAngle) {
    return add(root, rot(p, bodyAngle));
  }

  function weaponPoints(pose) {
    const rest = state.rig.weaponRest;
    const aim = pose.weapon.aim === null ? restAim() : pose.weapon.aim;
    const delta = aim - restAim();
    const grip = pose.weapon.pos;
    const foregripVector = sub(rest.foregrip, rest.grip);
    const rearGripVector = sub(rest.rearGrip, rest.grip);
    return {
      aim,
      grip,
      rearGrip: add(grip, rot(rearGripVector, delta)),
      foregrip: add(grip, rot(foregripVector, delta)),
      muzzle: add(grip, rot(sub(rest.muzzle, rest.grip), delta)),
      length: Math.max(18, dist(rest.grip, rest.muzzle))
    };
  }

  // 애니메이션은 포즈 원본을 건드리지 않고 복사본 위에 얹는다.
  function computeFrame(timeMs) {
    const t = timeMs * 0.001;
    if (state.mode === "rig") {
      const root = state.rig.root;
      const rest = state.rig.weaponRest;
      return {
        mode: "rig",
        root,
        bodyAngle: 0,
        torsoAngle: 0,
        torsoWorldAngle: 0,
        limbWorldAngle: 0,
        headAngle: 0,
        weapon: { aim: restAim(), grip: rest.grip, foregrip: rest.foregrip, rearGrip: rest.rearGrip, muzzle: rest.muzzle, length: Math.max(18, dist(rest.grip, rest.muzzle)) },
        arms: null,
        flash: false
      };
    }

    const pose = clone(state.pose);
    if (pose.weapon.aim === null) pose.weapon.aim = restAim();
    const root = { ...state.rig.root };
    const shoulders = {
      L: shoulderLocal("L"),
      R: shoulderLocal("R")
    };
    let flash = false;

    if (state.anim === "idle") {
      root.y += Math.sin(t * 2) * 1.4;
    } else if (state.anim === "walk") {
      const walk = state.motion?.walk || WALK_PRESET;
      const phase = t * walk.speed;
      const stride = Math.sin(phase);
      const counterStride = Math.cos(phase);
      const step = Math.sin(phase * 2);
      const lift = Math.max(0, Math.sin(phase + Math.PI / 2));
      const rootOffset = rot({
        x: stride * walk.rootSide,
        y: Math.abs(counterStride) * walk.rootForward
      }, pose.bodyAngle);
      root.x += rootOffset.x;
      root.y += rootOffset.y;
      pose.bodyAngle += stride * walk.bodyRoll + step * 0.01;
      pose.headAngle -= stride * walk.headCounterRoll;
      shoulders.L = add(shoulders.L, {
        x: -Math.abs(stride) * 0.8,
        y: stride * walk.shoulderSwing - lift * walk.shoulderLift
      });
      shoulders.R = add(shoulders.R, {
        x: Math.abs(stride) * 0.8,
        y: -stride * walk.shoulderSwing - (1 - lift) * walk.shoulderLift
      });
      if (state.holdWeapon) {
        pose.weapon.pos = add(pose.weapon.pos, {
          x: stride * walk.weaponSide,
          y: step * walk.weaponForward - Math.abs(counterStride) * 1.2
        });
        pose.weapon.aim += -stride * walk.weaponAim + step * 0.012;
      } else {
        pose.armL.target = add(pose.armL.target, {
          x: -Math.abs(stride) * walk.freeArmSide,
          y: stride * walk.freeArmSwing + step * walk.freeArmForward
        });
        pose.armR.target = add(pose.armR.target, {
          x: Math.abs(stride) * walk.freeArmSide,
          y: -stride * walk.freeArmSwing - step * walk.freeArmForward
        });
      }
    } else if (state.anim === "fire") {
      const phase = (t % 0.5) / 0.5;
      if (isOneHandWeapon()) {
        const throwPhase = (t % 0.9) / 0.9;
        const windup = throwPhase < 0.48 ? throwPhase / 0.48 : Math.max(0, 1 - (throwPhase - 0.48) / 0.52);
        const release = throwPhase > 0.48 ? Math.min(1, (throwPhase - 0.48) / 0.24) : 0;
        pose.weapon.pos = add(pose.weapon.pos, {
          x: 20 * windup - 10 * release,
          y: -48 * windup + 16 * release
        });
        pose.weapon.aim = -0.6 - windup * 0.55;
      } else {
        const recoil = Math.max(0, 1 - phase * 5);
        if (recoil > 0) {
          const back = rot({ x: -7 * recoil, y: 0 }, pose.weapon.aim);
          pose.weapon.pos = add(pose.weapon.pos, back);
        }
        flash = recoil > 0.35;
      }
    }

    const weapon = weaponPoints(pose);
    const oneHand = state.holdWeapon && isOneHandWeapon();
    const targetL = state.holdWeapon && !oneHand ? weapon.foregrip : pose.armL.target;
    const targetR = state.holdWeapon ? (oneHand ? weapon.grip : weapon.rearGrip) : pose.armR.target;
    const torsoAngle = pose.torsoAngle || 0;
    const torsoWorldAngle = pose.bodyAngle + torsoAngle;
    const limbWorldAngle = pose.bodyAngle + torsoAngle * LIMB_TURN_FOLLOW;
    return {
      mode: "pose",
      root,
      bodyAngle: pose.bodyAngle,
      torsoAngle,
      torsoWorldAngle,
      limbWorldAngle,
      headAngle: pose.headAngle,
      weapon,
      arms: {
        L: solveArm("L", targetL, pose.armL.bend, shoulders.L),
        R: solveArm("R", targetR, pose.armR.bend, shoulders.R)
      },
      shoulders,
      flash
    };
  }

  // ---------- ?뚮뜑留?----------

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(STAGE.width * dpr);
    if (canvas.width !== width) {
      canvas.width = width;
      canvas.height = Math.round(STAGE.height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function worldToScreen(p) {
    return {
      x: VIEW_CENTER.x + (p.x - VIEW_CENTER.x) * state.zoom,
      y: VIEW_CENTER.y + (p.y - VIEW_CENTER.y) * state.zoom
    };
  }

  function screenToWorld(p) {
    return {
      x: VIEW_CENTER.x + (p.x - VIEW_CENTER.x) / state.zoom,
      y: VIEW_CENTER.y + (p.y - VIEW_CENTER.y) / state.zoom
    };
  }

  function drawGrid() {
    ctx.fillStyle = "#d8dfd8";
    ctx.fillRect(0, 0, STAGE.width, STAGE.height);
    ctx.strokeStyle = "rgba(30, 42, 34, 0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= STAGE.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, STAGE.height);
      ctx.stroke();
    }
    for (let y = 0; y <= STAGE.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(STAGE.width, y);
      ctx.stroke();
    }
  }

  function withZoom(fn) {
    ctx.save();
    ctx.translate(VIEW_CENTER.x, VIEW_CENTER.y);
    ctx.scale(state.zoom, state.zoom);
    ctx.translate(-VIEW_CENTER.x, -VIEW_CENTER.y);
    fn();
    ctx.restore();
  }

  function drawSimplePart(name, world, rotation, pivot, s = 1) {
    const part = partCanvases[name];
    if (!part) return;
    ctx.save();
    ctx.translate(world.x, world.y);
    ctx.rotate(rotation);
    ctx.scale(s, s);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(part, -pivot.x, -pivot.y);
    ctx.restore();
  }

  // ?붽퓞移?遺꾪븷??湲곗? 諛섑룊硫??대┰.
  // keepShoulderSide=true硫??닿묠 履??덈컲留? false硫???履??덈컲留??④릿??
  function clipHalfPlane(center, normal, keepShoulderSide) {
    const phi = Math.atan2(-normal.x, normal.y);
    ctx.translate(center.x, center.y);
    ctx.rotate(phi);
    ctx.beginPath();
    if (keepShoulderSide) {
      ctx.rect(-2000, -2000, 4000, 2000 + SEGMENT_OVERLAP);
    } else {
      ctx.rect(-2000, -SEGMENT_OVERLAP, 4000, 4000);
    }
    ctx.clip();
    ctx.rotate(-phi);
    ctx.translate(-center.x, -center.y);
  }

  function drawArmPosed(side, frame) {
    const name = side === "L" ? "leftArm" : "rightArm";
    const part = partCanvases[name];
    const solved = frame.arms[side];
    if (!part || !solved) return;
    const geo = solved.geo;
    const shoulderWorld = toWorld(solved.S, frame.root, frame.bodyAngle);
    const elbowWorld = toWorld(solved.elbow, frame.root, frame.bodyAngle);

    // ?꾪뙏: ?닿묠 ? 湲곗? ?뚯쟾, ?붽퓞移????꾩そ留?洹몃┝
    ctx.save();
    ctx.translate(shoulderWorld.x, shoulderWorld.y);
    ctx.rotate(frame.bodyAngle + solved.upper - geo.restUpper);
    ctx.scale(geo.scale, geo.scale);
    clipHalfPlane(sub(geo.pins.elbow, geo.pins.shoulder), geo.splitNormal, true);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(part, -geo.pins.shoulder.x, -geo.pins.shoulder.y);
    ctx.restore();

    // ?꾨옯?? ?붽퓞移?? 湲곗? ?뚯쟾, ?붽퓞移????꾨옒履쎈쭔 洹몃┝
    ctx.save();
    ctx.translate(elbowWorld.x, elbowWorld.y);
    ctx.rotate(frame.bodyAngle + solved.lower - geo.restLower);
    ctx.scale(geo.scale, geo.scale);
    clipHalfPlane({ x: 0, y: 0 }, geo.splitNormal, false);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(part, -geo.pins.elbow.x, -geo.pins.elbow.y);
    ctx.restore();
  }

  function drawArmRest(side, frame) {
    const name = side === "L" ? "leftArm" : "rightArm";
    const part = partCanvases[name];
    if (!part) return;
    const pins = state.rig.partPins[name];
    const s = partScale(name);
    const shoulderWorld = toWorld(shoulderLocal(side), frame.root, 0);
    ctx.save();
    ctx.translate(shoulderWorld.x, shoulderWorld.y);
    ctx.scale(s, s);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(part, -pins.shoulder.x, -pins.shoulder.y);
    ctx.restore();
  }

  // 臾닿린 ?꾪듃瑜?洹몃┰?믪킑援?? 嫄곕━??留욎떠 諛곗쑉??怨깊빐 洹몃┛??
  function armPartName(side, segment) {
    const prefix = side === "L" ? "left" : "right";
    return `${prefix}${segment}Arm`;
  }

  function drawArmSegment(partName, world, angle, s) {
    const part = armPartCanvases[partName];
    const spec = ARM_SHEET[partName];
    if (!part || !spec) return;
    const restAngle = angleOf(sub(spec.distal, spec.pivot));
    ctx.save();
    ctx.translate(world.x, world.y);
    ctx.rotate(angle - restAngle);
    ctx.scale(s, s);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(part, -spec.pivot.x, -spec.pivot.y);
    ctx.restore();
  }

  function drawArmPosed(side, frame) {
    const solved = frame.arms[side];
    if (!solved) return;
    const geo = solved.geo;
    const limbAngle = frame.limbWorldAngle ?? frame.bodyAngle;
    const shoulderWorld = toWorld(solved.S, frame.root, limbAngle);
    const elbowWorld = toWorld(solved.elbow, frame.root, limbAngle);
    drawArmSegment(armPartName(side, "Upper"), shoulderWorld, limbAngle + solved.upper, geo.scale);
    drawArmSegment(armPartName(side, "Lower"), elbowWorld, limbAngle + solved.lower, geo.scale);
  }

  function drawArmRest(side, frame) {
    const name = side === "L" ? "leftArm" : "rightArm";
    const pins = state.rig.partPins[name];
    const s = partScale(name);
    const shoulderWorld = toWorld(shoulderLocal(side), frame.root, 0);
    const elbowWorld = add(shoulderWorld, scale(sub(pins.elbow, pins.shoulder), s));
    drawArmSegment(armPartName(side, "Upper"), shoulderWorld, angleOf(sub(pins.elbow, pins.shoulder)), s);
    drawArmSegment(armPartName(side, "Lower"), elbowWorld, angleOf(sub(pins.hand, pins.elbow)), s);
  }

  function drawWeaponShape(type, length, flash) {
    const def = WEAPON_DEFS[type] || WEAPON_DEFS.rifle;
    const art = WEAPON_ART[type] || WEAPON_ART.rifle;
    const baseScale = (def.fixedScale || Math.max(0.5, (length / def.len))) * (def.scale || 1);
    const s = Math.min(def.maxScale || 2.4, baseScale) * partScale("weapon");
    ctx.save();
    ctx.scale(s, s);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    art(ctx);
    if (flash) {
      ctx.fillStyle = "rgba(255, 214, 92, 0.9)";
      ctx.beginPath();
      ctx.moveTo(def.len, 0);
      ctx.lineTo(def.len + 4.5, -1.8);
      ctx.lineTo(def.len + 7, 0);
      ctx.lineTo(def.len + 4.5, 1.8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWeapon(frame) {
    const limbAngle = frame.limbWorldAngle ?? frame.bodyAngle;
    const gripWorld = toWorld(frame.weapon.grip, frame.root, limbAngle);
    ctx.save();
    ctx.translate(gripWorld.x, gripWorld.y);
    ctx.rotate(limbAngle + frame.weapon.aim);
    drawWeaponShape(state.weaponType, frame.weapon.length, frame.flash);
    ctx.restore();
  }

  function drawLayers(frame) {
    state.layers.forEach((layer) => {
      if (!layer.visible) return;
      if (layer.id === "body") {
        drawSimplePart("body", frame.root, frame.torsoWorldAngle ?? frame.bodyAngle, SHEET.body.pivot, partScale("body"));
      } else if (layer.id === "head") {
        const torsoAngle = frame.torsoWorldAngle ?? frame.bodyAngle;
        const headWorld = toWorld(state.rig.headPin, frame.root, torsoAngle);
        drawSimplePart("head", headWorld, torsoAngle + frame.headAngle, SHEET.head.pivot, partScale("head"));
      } else if (layer.id === "weapon") {
        if (frame.mode === "rig" || state.holdWeapon) drawWeapon(frame);
      } else if (layer.id === "leftArm") {
        if (frame.mode === "rig") drawArmRest("L", frame);
        else drawArmPosed("L", frame);
      } else if (layer.id === "rightArm") {
        if (frame.mode === "rig") drawArmRest("R", frame);
        else drawArmPosed("R", frame);
      }
    });
  }

  // ---------- Sprite baking ----------

  function roundBake(value) {
    return Math.round(value * 1000) / 1000;
  }

  function bakePoint(frame, local, angle) {
    const origin = { x: BAKE.frameWidth / 2, y: BAKE.frameHeight / 2 };
    const world = toWorld(local, frame.root, angle);
    return {
      x: roundBake(world.x - frame.root.x + origin.x),
      y: roundBake(world.y - frame.root.y + origin.y)
    };
  }

  function bakeFrameSpecs() {
    const speed = Math.max(0.1, state.motion?.walk?.speed || WALK_PRESET.speed);
    const quarter = ((Math.PI * 2) / speed) * 250;
    return [
      { name: "stand-idle", anim: "idle", timeMs: 0, durationMs: 180 },
      { name: "walk-01", anim: "walk", timeMs: 0, durationMs: 80 },
      { name: "walk-02", anim: "walk", timeMs: quarter, durationMs: 80 },
      { name: "walk-03", anim: "walk", timeMs: quarter * 2, durationMs: 80 },
      { name: "walk-04", anim: "walk", timeMs: quarter * 3, durationMs: 80 },
      { name: "stand-fire-01", anim: "fire", timeMs: 0, durationMs: 70 },
      { name: "stand-fire-02", anim: "fire", timeMs: 130, durationMs: 90 }
    ];
  }

  function computeBakeFrame(spec) {
    const saved = {
      mode: state.mode,
      anim: state.anim,
      holdWeapon: state.holdWeapon
    };
    state.mode = "pose";
    state.anim = spec.anim;
    state.holdWeapon = true;
    try {
      return computeFrame(spec.timeMs);
    } finally {
      state.mode = saved.mode;
      state.anim = saved.anim;
      state.holdWeapon = saved.holdWeapon;
    }
  }

  function drawSimplePartOn(targetCtx, name, world, rotation, pivot, s = 1) {
    const part = partCanvases[name];
    if (!part) return;
    targetCtx.save();
    targetCtx.translate(world.x, world.y);
    targetCtx.rotate(rotation);
    targetCtx.scale(s, s);
    targetCtx.imageSmoothingEnabled = false;
    targetCtx.drawImage(part, -pivot.x, -pivot.y);
    targetCtx.restore();
  }

  function drawArmSegmentOn(targetCtx, partName, world, angle, s) {
    const part = armPartCanvases[partName];
    const spec = ARM_SHEET[partName];
    if (!part || !spec) return;
    const restAngle = angleOf(sub(spec.distal, spec.pivot));
    targetCtx.save();
    targetCtx.translate(world.x, world.y);
    targetCtx.rotate(angle - restAngle);
    targetCtx.scale(s, s);
    targetCtx.imageSmoothingEnabled = false;
    targetCtx.drawImage(part, -spec.pivot.x, -spec.pivot.y);
    targetCtx.restore();
  }

  function drawArmPosedOn(targetCtx, side, frame) {
    const solved = frame.arms?.[side];
    if (!solved) return;
    const geo = solved.geo;
    const limbAngle = frame.limbWorldAngle ?? frame.bodyAngle;
    const shoulderWorld = toWorld(solved.S, frame.root, limbAngle);
    const elbowWorld = toWorld(solved.elbow, frame.root, limbAngle);
    drawArmSegmentOn(targetCtx, armPartName(side, "Upper"), shoulderWorld, limbAngle + solved.upper, geo.scale);
    drawArmSegmentOn(targetCtx, armPartName(side, "Lower"), elbowWorld, limbAngle + solved.lower, geo.scale);
  }

  function drawBakedBodyFrame(targetCtx, frame) {
    state.layers.forEach((layer) => {
      if (!layer.visible || layer.id === "weapon") return;
      if (layer.id === "body") {
        drawSimplePartOn(targetCtx, "body", frame.root, frame.torsoWorldAngle ?? frame.bodyAngle, SHEET.body.pivot, partScale("body"));
      } else if (layer.id === "head") {
        const torsoAngle = frame.torsoWorldAngle ?? frame.bodyAngle;
        const headWorld = toWorld(state.rig.headPin, frame.root, torsoAngle);
        drawSimplePartOn(targetCtx, "head", headWorld, torsoAngle + frame.headAngle, SHEET.head.pivot, partScale("head"));
      } else if (layer.id === "leftArm") {
        drawArmPosedOn(targetCtx, "L", frame);
      } else if (layer.id === "rightArm") {
        drawArmPosedOn(targetCtx, "R", frame);
      }
    });
  }

  function bakeWeaponMeta(frame) {
    const limbAngle = frame.limbWorldAngle ?? frame.bodyAngle;
    return {
      grip: bakePoint(frame, frame.weapon.grip, limbAngle),
      foregrip: bakePoint(frame, frame.weapon.foregrip, limbAngle),
      rearGrip: bakePoint(frame, frame.weapon.rearGrip, limbAngle),
      muzzle: bakePoint(frame, frame.weapon.muzzle, limbAngle),
      angle: roundBake(limbAngle + frame.weapon.aim),
      flash: Boolean(frame.flash)
    };
  }

  function renderBakeSheet() {
    const specs = bakeFrameSpecs();
    const rows = Math.ceil(specs.length / BAKE.columns);
    const sheet = document.createElement("canvas");
    sheet.width = BAKE.frameWidth * BAKE.columns;
    sheet.height = BAKE.frameHeight * rows;
    const sheetCtx = sheet.getContext("2d");
    sheetCtx.clearRect(0, 0, sheet.width, sheet.height);
    sheetCtx.imageSmoothingEnabled = false;

    const frames = specs.map((spec, index) => {
      const frame = computeBakeFrame(spec);
      const column = index % BAKE.columns;
      const row = Math.floor(index / BAKE.columns);
      const x = column * BAKE.frameWidth;
      const y = row * BAKE.frameHeight;
      const frameCanvas = document.createElement("canvas");
      frameCanvas.width = BAKE.frameWidth;
      frameCanvas.height = BAKE.frameHeight;
      const frameCtx = frameCanvas.getContext("2d");
      frameCtx.clearRect(0, 0, BAKE.frameWidth, BAKE.frameHeight);
      frameCtx.imageSmoothingEnabled = false;
      frameCtx.save();
      frameCtx.translate(BAKE.frameWidth / 2 - frame.root.x, BAKE.frameHeight / 2 - frame.root.y);
      drawBakedBodyFrame(frameCtx, frame);
      frameCtx.restore();
      sheetCtx.drawImage(frameCanvas, x, y);
      return {
        name: spec.name,
        x,
        y,
        w: BAKE.frameWidth,
        h: BAKE.frameHeight,
        origin: { x: BAKE.frameWidth / 2, y: BAKE.frameHeight / 2 },
        durationMs: spec.durationMs,
        sourceAnim: spec.anim,
        sourceTimeMs: roundBake(spec.timeMs),
        weapon: bakeWeaponMeta(frame)
      };
    });

    return {
      sheet,
      manifest: {
        version: 1,
        rigVersion: exportState().version,
        generatedAt: new Date().toISOString(),
        sheet: BAKE.sheetName,
        frameWidth: BAKE.frameWidth,
        frameHeight: BAKE.frameHeight,
        weaponIncluded: false,
        source: {
          rig: clone(state.rig),
          scales: clone(state.scales),
          motion: clone(state.motion),
          layers: clone(state.layers)
        },
        animations: {
          idle: ["stand-idle"],
          walk: ["walk-01", "walk-02", "walk-03", "walk-04"],
          fire: ["stand-fire-01", "stand-fire-02"]
        },
        frames
      }
    };
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function clearBakeLinks() {
    if (!bakeResult) return;
    Array.from(bakeResult.querySelectorAll("a")).forEach((link) => {
      if (link.href?.startsWith("blob:")) URL.revokeObjectURL(link.href);
    });
    bakeResult.textContent = "";
  }

  function addBakeLink(url, filename, label) {
    if (!bakeResult) return null;
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.textContent = label;
    bakeResult.appendChild(link);
    return link;
  }

  function canvasToPngBlob(sourceCanvas) {
    return new Promise((resolve, reject) => {
      sourceCanvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("PNG blob 생성 실패"));
      }, "image/png");
    });
  }

  function manifestToJsonBlob(manifest) {
    return new Blob([JSON.stringify(manifest, null, 2)], {
      type: "application/json;charset=utf-8"
    });
  }

  function addBakeMessage(message) {
    if (!bakeResult) return;
    const line = document.createElement("p");
    line.textContent = message;
    bakeResult.appendChild(line);
  }

  async function writeBakeFile(directoryHandle, filename, blob) {
    const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(blob);
    } finally {
      await writable.close();
    }
  }

  async function bakeSprites() {
    if (!ready) {
      flashStatus("이미지 로딩 중");
      return;
    }
    try {
      flashStatus("스프라이트 굽는 중");
      clearBakeLinks();
      const { sheet, manifest } = renderBakeSheet();
      const imageUrl = sheet.toDataURL("image/png");
      const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(manifest, null, 2))}`;
      addBakeLink(imageUrl, BAKE.sheetName, "PNG 다운로드");
      addBakeLink(dataUrl, BAKE.dataName, "JSON 다운로드");
      flashStatus("스프라이트 굽기 완료");
    } catch (error) {
      console.error(error);
      flashStatus("굽기 실패");
    }
  }

  async function saveBakeToFolder() {
    if (!ready) {
      flashStatus("이미지 로딩 중");
      return;
    }
    if (!("showDirectoryPicker" in window)) {
      await bakeSprites();
      addBakeMessage("이 브라우저는 폴더 선택 저장을 지원하지 않아서 다운로드 링크로 대체했음.");
      flashStatus("폴더 선택 미지원");
      return;
    }

    try {
      flashStatus("저장 폴더 선택");
      const directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      flashStatus("스프라이트 저장 중");
      clearBakeLinks();
      const { sheet, manifest } = renderBakeSheet();
      const pngBlob = await canvasToPngBlob(sheet);
      const jsonBlob = manifestToJsonBlob(manifest);
      await writeBakeFile(directoryHandle, BAKE.sheetName, pngBlob);
      await writeBakeFile(directoryHandle, BAKE.dataName, jsonBlob);
      addBakeMessage(`선택한 폴더에 저장됨: ${BAKE.sheetName}, ${BAKE.dataName}`);
      flashStatus("폴더 저장 완료");
    } catch (error) {
      if (error?.name === "AbortError") {
        flashStatus("폴더 선택 취소");
        return;
      }
      console.error(error);
      flashStatus("폴더 저장 실패");
    }
  }

  // ---------- 堉덈?/? ?ㅻ쾭?덉씠 (?ㅽ겕由?醫뚰몴) ----------

  function boneLine(a, b, color) {
    const sa = worldToScreen(a);
    const sb = worldToScreen(b);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);
    ctx.lineTo(sb.x, sb.y);
    ctx.stroke();
    ctx.fillStyle = color;
    [sa, sb].forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function armJointsWorld(side, frame) {
    if (frame.mode === "rig") {
      const name = side === "L" ? "leftArm" : "rightArm";
      const pins = state.rig.partPins[name];
      const s = partScale(name);
      const S = toWorld(shoulderLocal(side), frame.root, 0);
      return {
        shoulder: S,
        elbow: add(S, scale(sub(pins.elbow, pins.shoulder), s)),
        hand: add(S, scale(sub(pins.hand, pins.shoulder), s))
      };
    }
    const solved = frame.arms[side];
    const limbAngle = frame.limbWorldAngle ?? frame.bodyAngle;
    return {
      shoulder: toWorld(solved.S, frame.root, limbAngle),
      elbow: toWorld(solved.elbow, frame.root, limbAngle),
      hand: toWorld(solved.hand, frame.root, limbAngle)
    };
  }

  function drawBones(frame) {
    const color = "rgba(241, 189, 90, 0.75)";
    ["L", "R"].forEach((side) => {
      const joints = armJointsWorld(side, frame);
      boneLine(joints.shoulder, joints.elbow, color);
      boneLine(joints.elbow, joints.hand, color);
    });
    const torsoAngle = frame.torsoWorldAngle ?? frame.bodyAngle;
    const limbAngle = frame.limbWorldAngle ?? frame.bodyAngle;
    const headWorld = toWorld(state.rig.headPin, frame.root, torsoAngle);
    boneLine(frame.root, headWorld, "rgba(142, 188, 114, 0.6)");
    if (frame.mode === "rig" || state.holdWeapon) {
      const gripWorld = toWorld(frame.weapon.grip, frame.root, limbAngle);
      const muzzleWorld = toWorld(frame.weapon.muzzle, frame.root, limbAngle);
      boneLine(gripWorld, muzzleWorld, "rgba(223, 107, 98, 0.5)");
    }
  }

  function pinDefs(frame) {
    const pins = [];
    if (frame.mode === "rig") {
      const root = frame.root;
      pins.push({ id: "root", world: root, label: "몸 이동", color: PIN_COLORS.move, r: 8 });
      pins.push({ id: "headPin", world: toWorld(state.rig.headPin, root, 0), label: "머리 핀", color: PIN_COLORS.move, r: 6 });
      ["L", "R"].forEach((side) => {
        const joints = armJointsWorld(side, frame);
        pins.push({ id: `shoulder${side}`, world: joints.shoulder, label: `${side} 어깨`, color: PIN_COLORS.bone, r: 6 });
        pins.push({ id: `elbow${side}`, world: joints.elbow, label: `${side} 팔꿈치`, color: PIN_COLORS.bone, r: 6 });
        pins.push({ id: `hand${side}`, world: joints.hand, label: `${side} 손`, color: PIN_COLORS.hand, r: 6 });
      });
      const rest = state.rig.weaponRest;
      pins.push({ id: "grip", world: add(root, rest.grip), label: "총 기준", color: PIN_COLORS.weapon, r: 5 });
      pins.push({ id: "foregrip", world: add(root, rest.foregrip), label: "앞손", color: PIN_COLORS.weapon, r: 5 });
      pins.push({ id: "rearGrip", world: add(root, rest.rearGrip), label: "뒤손", color: PIN_COLORS.hand, r: 5 });
      pins.push({ id: "muzzle", world: add(root, rest.muzzle), label: "총구", color: PIN_COLORS.weapon, r: 5 });
      return pins;
    }

    const root = frame.root;
    const torsoAngle = frame.torsoWorldAngle ?? frame.bodyAngle;
    const limbAngle = frame.limbWorldAngle ?? frame.bodyAngle;
    pins.push({ id: "root", world: root, label: "이동", color: PIN_COLORS.move, r: 8 });
    pins.push({
      id: "rotate",
      world: toWorld({ x: 0, y: -90 }, root, torsoAngle),
      label: "몸 회전", color: PIN_COLORS.move, r: 7
    });
    const headWorld = toWorld(state.rig.headPin, root, torsoAngle);
    pins.push({
      id: "headAim",
      world: add(headWorld, rot({ x: 0, y: 46 }, torsoAngle + frame.headAngle)),
      label: "머리 방향", color: PIN_COLORS.move, r: 6
    });
    ["L", "R"].forEach((side) => {
      const joints = armJointsWorld(side, frame);
      pins.push({ id: `bend${side}`, world: joints.elbow, label: `${side} 굽힘`, color: PIN_COLORS.bone, r: 6 });
      if (!state.holdWeapon || (isOneHandWeapon() && side === "L")) {
        pins.push({ id: `target${side}`, world: joints.hand, label: `${side} 손`, color: PIN_COLORS.hand, r: 7 });
      }
    });
    if (state.holdWeapon) {
      pins.push({ id: "weaponMove", world: toWorld(frame.weapon.grip, root, limbAngle), label: "총 이동", color: PIN_COLORS.weapon, r: 7 });
      if (!isOneHandWeapon()) {
        pins.push({ id: "weaponRearGrip", world: toWorld(frame.weapon.rearGrip, root, limbAngle), label: "뒤손", color: PIN_COLORS.hand, r: 7 });
        pins.push({ id: "weaponForegrip", world: toWorld(frame.weapon.foregrip, root, limbAngle), label: "앞손", color: PIN_COLORS.hand, r: 7 });
      }
      pins.push({ id: "weaponAim", world: toWorld(frame.weapon.muzzle, root, limbAngle), label: "총 회전", color: PIN_COLORS.weapon, r: 7 });
    }
    return pins;
  }

  function roundedRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function drawPins(pins) {
    if (!state.showPinDots) return;
    ctx.font = "11px Malgun Gothic, sans-serif";
    pins.forEach((pin) => {
      const label = {
        root: "이동",
        rotate: "몸 회전",
        weaponMove: "총 이동",
        weaponAim: "총 회전",
        weaponForegrip: "앞손",
        weaponRearGrip: "뒤손",
        foregrip: "앞손",
        rearGrip: "뒤손",
        grip: "총 기준",
        muzzle: "총구"
      }[pin.id] || pin.label;
      const p = worldToScreen(pin.world);
      const active = hoverId === pin.id || (drag && drag.id === pin.id);
      ctx.save();
      ctx.globalAlpha = active ? 0.9 : 0.48;
      ctx.fillStyle = pin.color;
      ctx.strokeStyle = active ? "rgba(255, 255, 255, 0.95)" : "rgba(0, 0, 0, 0.3)";
      ctx.lineWidth = active ? 2 : 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, active ? pin.r + 1 : Math.max(3, pin.r - 2), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (state.showPinLabels) {
        ctx.globalAlpha = active ? 0.95 : 0.72;
        ctx.fillStyle = "rgba(12, 16, 12, 0.72)";
        roundedRect(p.x + 9, p.y - 17, ctx.measureText(label).width + 14, 20, 5);
        ctx.fill();
        ctx.fillStyle = "#f4f7ef";
        ctx.fillText(label, p.x + 16, p.y - 3);
      }
      ctx.restore();
    });
  }

  function drawSourceSheet() {
    if (!state.showSheet || !image.naturalWidth) return;
    const sheetScale = 0.4;
    const x = 20;
    const y = STAGE.height - image.naturalHeight * sheetScale - 20;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(13, 18, 14, 0.72)";
    roundedRect(x - 10, y - 26, image.naturalWidth * sheetScale + 20, image.naturalHeight * sheetScale + 34, 8);
    ctx.fill();
    ctx.drawImage(image, x, y, image.naturalWidth * sheetScale, image.naturalHeight * sheetScale);
    ctx.fillStyle = "rgba(241, 245, 237, 0.8)";
    ctx.font = "12px Malgun Gothic, sans-serif";
    ctx.fillText("?먮낯 ?뚯툩 ?쒗듃", x, y - 9);
    ctx.restore();
  }

  function draw(timeMs) {
    resizeCanvas();
    drawGrid();
    if (!ready) return;
    const frame = computeFrame(timeMs);
    withZoom(() => drawLayers(frame));
    if (state.showBones) drawBones(frame);
    const pins = state.showPinDots ? pinDefs(frame) : [];
    drawPins(pins);
    drawSourceSheet();
    updateHover(pins);
  }

  // ---------- ?낅젰 ----------

  function pointerToWorld(event) {
    const rect = canvas.getBoundingClientRect();
    const screen = {
      x: ((event.clientX - rect.left) / rect.width) * STAGE.width,
      y: ((event.clientY - rect.top) / rect.height) * STAGE.height
    };
    return screenToWorld(screen);
  }

  function nearestPin(pins, world) {
    let best = null;
    let bestDistance = Infinity;
    pins.forEach((pin) => {
      const d = dist(world, pin.world);
      if (d < bestDistance) {
        best = pin;
        bestDistance = d;
      }
    });
    return best && bestDistance <= 20 / state.zoom ? best : null;
  }

  function updateHover(pins) {
    if (!lastPointer) return;
    const found = nearestPin(pins, lastPointer);
    hoverId = found ? found.id : null;
    canvas.style.cursor = drag ? "grabbing" : hoverId ? "grab" : "crosshair";
  }

  function bodyLocal(world, frame, angle = frame.limbWorldAngle ?? frame.bodyAngle) {
    return rot(sub(world, frame.root), -angle);
  }

  function applyDrag(world) {
    const frame = computeFrame(performance.now());
    const rig = state.rig;
    const id = drag.id;

    if (id === "root") {
      rig.root = { x: clamp(world.x, 40, STAGE.width - 40), y: clamp(world.y, 40, STAGE.height - 40) };
    } else if (frame.mode === "rig") {
      const local = sub(world, rig.root);
      if (id === "headPin") rig.headPin = local;
      else if (id === "shoulderL") rig.shoulderL = local;
      else if (id === "shoulderR") rig.shoulderR = local;
      else if (id === "grip" || id === "muzzle") {
        rig.weaponRest[id] = local;
        // 그립/총구를 움직이면 총열 축이 바뀌므로 앞손을 다시 축 위로 붙인다.
        rig.weaponRest[id] = local;
      } else if (id === "foregrip" || id === "rearGrip") {
        rig.weaponRest[id] = local;
      } else if (id.startsWith("elbow") || id.startsWith("hand")) {
        const side = id.endsWith("L") ? "L" : "R";
        const partName = side === "L" ? "leftArm" : "rightArm";
        const pins = rig.partPins[partName];
        const s = partScale(partName);
        const shoulderWorld = add(rig.root, shoulderLocal(side));
        const partPoint = add(scale(sub(world, shoulderWorld), 1 / s), pins.shoulder);
        if (id.startsWith("elbow")) pins.elbow = partPoint;
        else pins.hand = partPoint;
      }
    } else {
      const pose = state.pose;
      if (id === "rotate") {
        pose.torsoAngle = clamp(angleOf(sub(world, frame.root)) + HALF_PI - pose.bodyAngle, -1.45, 1.45);
      } else if (id === "headAim") {
        const torsoAngle = frame.torsoWorldAngle ?? frame.bodyAngle;
        const headWorld = toWorld(rig.headPin, frame.root, torsoAngle);
        pose.headAngle = clamp(angleOf(sub(world, headWorld)) - torsoAngle - HALF_PI, -1.3, 1.3);
      } else if (id === "targetL" || id === "targetR") {
        const side = id.endsWith("L") ? "armL" : "armR";
        pose[side].target = bodyLocal(world, frame);
      } else if (id === "bendL" || id === "bendR") {
        const side = id.endsWith("L") ? "L" : "R";
        const armKey = side === "L" ? "armL" : "armR";
        const weapon = weaponPoints({ ...pose, weapon: pose.weapon });
        const oneHand = state.holdWeapon && isOneHandWeapon();
        const target = state.holdWeapon
          ? (oneHand ? (side === "R" ? weapon.grip : pose[armKey].target) : (side === "L" ? weapon.foregrip : weapon.rearGrip))
          : pose[armKey].target;
        const S = shoulderLocal(side);
        const local = bodyLocal(world, frame);
        pose[armKey].bend = cross(sub(target, S), sub(local, S)) < 0 ? 1 : -1;
      } else if (id === "weaponMove") {
        pose.weapon.pos = bodyLocal(world, frame);
      } else if (id === "weaponForegrip" || id === "weaponRearGrip") {
        if (pose.weapon.aim === null) pose.weapon.aim = restAim();
        const local = bodyLocal(world, frame);
        const delta = pose.weapon.aim - restAim();
        const pointRest = add(rig.weaponRest.grip, rot(sub(local, pose.weapon.pos), -delta));
        rig.weaponRest[id === "weaponForegrip" ? "foregrip" : "rearGrip"] = pointRest;
      } else if (id === "weaponAim") {
        if (pose.weapon.aim === null) pose.weapon.aim = restAim();
        if (state.weaponAimRotatesBody && state.followAim && !drag.forceWeaponAim) {
          // 臾닿린??紐몄뿉 怨좎젙??梨?紐??꾩껜媛 議곗? 諛⑺뼢?쇰줈 ?덈떎 (??瑗ъ엫 諛⑹?)
          const gripWorld = toWorld(pose.weapon.pos, frame.root, frame.bodyAngle);
          const desired = angleOf(sub(world, gripWorld));
          pose.bodyAngle += desired - (frame.bodyAngle + pose.weapon.aim);
        } else {
          pose.weapon.aim = angleOf(sub(bodyLocal(world, frame), pose.weapon.pos));
        }
      }
    }
    saveState();
  }

  canvas.addEventListener("pointerdown", (event) => {
    const world = pointerToWorld(event);
    lastPointer = world;
    if (!state.showPinDots) return;
    const frame = computeFrame(performance.now());
    const pin = nearestPin(pinDefs(frame), world);
    if (!pin) return;
    if (pin.id === "bendL" || pin.id === "bendR") {
      const armKey = pin.id.endsWith("L") ? "armL" : "armR";
      state.pose[armKey].bend *= -1;
      flashStatus(`${pin.id.endsWith("L") ? "L" : "R"} 援쏀옒 諛섏쟾`);
      saveState();
      return;
    }
    drag = { id: pin.id };
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (_error) { /* ?⑹꽦 ?대깽????罹≪쿂 遺덇? ?곹솴? 臾댁떆 */ }
    applyDrag(world);
  });

  canvas.addEventListener("pointermove", (event) => {
    const world = pointerToWorld(event);
    lastPointer = world;
    if (drag) applyDrag(world);
  });

  canvas.addEventListener("pointerup", (event) => {
    drag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointerleave", () => {
    if (!drag) lastPointer = null;
  });

  // ---------- ?덉씠??UI ----------

  function renderLayerList() {
    layerList.innerHTML = "";
    // 배열 뒤쪽이 앞에 그려진다. 패널에서는 위쪽 레이어를 먼저 보여준다.
    for (let i = state.layers.length - 1; i >= 0; i -= 1) {
      const layer = state.layers[i];
      const row = document.createElement("div");
      row.className = "layer-row";

      const name = document.createElement("span");
      name.className = "layer-name";
      name.textContent = LAYER_LABELS[layer.id] || layer.id;

      const up = document.createElement("button");
      up.type = "button";
      up.className = "layer-btn";
      up.textContent = "▲";
      up.title = "앞으로";
      up.disabled = i === state.layers.length - 1;
      up.addEventListener("click", () => {
        const tmp = state.layers[i + 1];
        state.layers[i + 1] = state.layers[i];
        state.layers[i] = tmp;
        renderLayerList();
        saveState();
      });

      const down = document.createElement("button");
      down.type = "button";
      down.className = "layer-btn";
      down.textContent = "▼";
      down.title = "뒤로";
      down.disabled = i === 0;
      down.addEventListener("click", () => {
        const tmp = state.layers[i - 1];
        state.layers[i - 1] = state.layers[i];
        state.layers[i] = tmp;
        renderLayerList();
        saveState();
      });

      const visible = document.createElement("input");
      visible.type = "checkbox";
      visible.checked = layer.visible;
      visible.title = "?쒖떆";
      visible.addEventListener("change", () => {
        layer.visible = visible.checked;
        saveState();
      });

      row.append(name, up, down, visible);
      layerList.appendChild(row);
    }
  }

  // ---------- ?뚯툩 ?ш린 UI ----------

  const SCALE_PARTS = ["body", "head", "leftArm", "rightArm", "weapon"];

  function renderScaleList() {
    if (!scaleList) return;
    scaleList.innerHTML = "";
    SCALE_PARTS.forEach((name) => {
      const row = document.createElement("label");
      row.className = "range-row scale-row";
      const label = document.createElement("span");
      label.textContent = LAYER_LABELS[name] || name;
      const input = document.createElement("input");
      input.type = "range";
      input.min = "0.5";
      input.max = "1.6";
      input.step = "0.02";
      input.value = String(state.scales[name] ?? 1);
      const value = document.createElement("b");
      value.className = "scale-value";
      value.textContent = `${Math.round((state.scales[name] ?? 1) * 100)}%`;
      input.addEventListener("input", () => {
        state.scales[name] = Number(input.value) || 1;
        value.textContent = `${Math.round(state.scales[name] * 100)}%`;
        saveState();
      });
      row.append(label, input, value);
      scaleList.appendChild(row);
    });
  }

  // ---------- JSON ?낆텧??----------

  function exportState() {
    return {
      version: 14,
      source: SOURCE,
      armSource: ARM_SOURCE,
      sheet: clone(SHEET),
      armSheet: clone(ARM_SHEET),
      rig: clone(state.rig),
      pose: clone(state.pose),
      motion: clone(state.motion),
      scales: clone(state.scales),
      layers: clone(state.layers),
      weaponType: state.weaponType,
      holdWeapon: state.holdWeapon,
      followAim: state.followAim,
      showPinDots: state.showPinDots,
      showPinLabels: state.showPinLabels
    };
  }

  function updateOutput() {
    if (!output || document.activeElement === output) return;
    output.value = JSON.stringify(exportState(), null, 2);
  }

  function flashStatus(text) {
    if (!status) return;
    status.textContent = text;
    window.clearTimeout(flashUntil);
    flashUntil = window.setTimeout(() => {
      status.textContent = ready ? "以鍮꾨맖" : "濡쒕뵫";
    }, 1000);
  }

  // ---------- 而⑦듃濡??곌껐 ----------

  function syncControls() {
    modeButtons.forEach((b) => b.classList.toggle("active", b.dataset.mode === state.mode));
    animButtons.forEach((b) => b.classList.toggle("active", b.dataset.anim === state.anim));
    weaponSelect.value = state.weaponType;
    holdWeaponInput.checked = state.holdWeapon;
    if (followAimInput) followAimInput.checked = Boolean(state.followAim);
    showBonesInput.checked = state.showBones;
    showSheetInput.checked = state.showSheet;
    if (showPinDotsInput) showPinDotsInput.checked = Boolean(state.showPinDots);
    if (showPinLabelsInput) showPinLabelsInput.checked = Boolean(state.showPinLabels);
    zoomRange.value = String(state.zoom);
    if (hint) {
      hint.textContent = state.mode === "rig"
        ? "리깅 모드: 총 기준, 앞손, 뒤손, 총구 핀을 그림에 맞춘다."
        : "포즈 모드: 총 이동/회전과 앞손/뒤손 핀을 움직이면 팔 IK가 따라온다.";
    }
    renderLayerList();
    renderScaleList();
  }

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      syncControls();
      saveState();
    });
  });

  animButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.anim = button.dataset.anim;
      if (state.anim !== "none" && state.mode === "rig") {
        state.mode = "pose";
      }
      syncControls();
      saveState();
    });
  });

  weaponSelect.addEventListener("change", () => {
    state.weaponType = weaponSelect.value;
    saveState();
  });

  holdWeaponInput.addEventListener("change", () => {
    state.holdWeapon = holdWeaponInput.checked;
    syncControls();
    saveState();
  });

  if (followAimInput) {
    followAimInput.addEventListener("change", () => {
      state.followAim = followAimInput.checked;
      saveState();
    });
  }

  showBonesInput.addEventListener("change", () => {
    state.showBones = showBonesInput.checked;
    saveState();
  });

  showSheetInput.addEventListener("change", () => {
    state.showSheet = showSheetInput.checked;
    saveState();
  });

  if (showPinDotsInput) {
    showPinDotsInput.addEventListener("change", () => {
      state.showPinDots = showPinDotsInput.checked;
      if (!state.showPinDots) hoverId = null;
      saveState();
    });
  }

  if (showPinLabelsInput) {
    showPinLabelsInput.addEventListener("change", () => {
      state.showPinLabels = showPinLabelsInput.checked;
      saveState();
    });
  }

  zoomRange.addEventListener("input", () => {
    state.zoom = Number(zoomRange.value) || 1.35;
    saveState();
  });

  document.getElementById("flipLeft").addEventListener("click", () => {
    state.pose.armL.bend *= -1;
    if (state.mode === "rig") state.mode = "pose";
    syncControls();
    saveState();
  });

  document.getElementById("flipRight").addEventListener("click", () => {
    state.pose.armR.bend *= -1;
    if (state.mode === "rig") state.mode = "pose";
    syncControls();
    saveState();
  });

  document.getElementById("resetRig").addEventListener("click", () => {
    const base = defaultState();
    state.rig = base.rig;
    flashStatus("리깅 초기화");
    saveState();
  });

  document.getElementById("resetScales").addEventListener("click", () => {
    state.scales = { body: 1, head: 1, leftArm: 1, rightArm: 1, weapon: 1.6 };
    renderScaleList();
    flashStatus("크기 초기화");
    saveState();
  });

  document.getElementById("resetPose").addEventListener("click", () => {
    const base = defaultState();
    state.pose = base.pose;
    state.anim = "none";
    syncControls();
    flashStatus("포즈 초기화");
    saveState();
  });

  document.addEventListener("click", (event) => {
    if (event.target?.closest?.("#bakeSprites")) {
      void bakeSprites();
    }
    if (event.target?.closest?.("#saveBakeToFolder")) {
      void saveBakeToFolder();
    }
  });

  document.getElementById("copyRig").addEventListener("click", async () => {
    const text = JSON.stringify(exportState(), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      flashStatus("복사됨");
    } catch (_error) {
      output.focus();
      output.select();
    }
  });

  document.getElementById("applyRig").addEventListener("click", () => {
    try {
      const parsed = JSON.parse(output.value);
      mergeState({
        rig: parsed.rig,
        pose: parsed.pose,
        motion: parsed.motion,
        layers: parsed.layers,
        weaponType: parsed.weaponType,
        holdWeapon: parsed.holdWeapon,
        followAim: parsed.followAim,
        mode: state.mode,
        anim: state.anim,
        zoom: state.zoom,
        showBones: state.showBones,
        showSheet: state.showSheet,
        showPinDots: parsed.showPinDots ?? state.showPinDots,
        showPinLabels: parsed.showPinLabels ?? state.showPinLabels
      });
      syncControls();
      flashStatus("적용됨");
      saveState();
    } catch (_error) {
      flashStatus("JSON 오류");
    }
  });

  // ---------- ?쒖옉 ----------

  function tick(time) {
    draw(time);
    window.requestAnimationFrame(tick);
  }

  let baseImageReady = false;
  let armImageReady = false;
  function markImagesReady() {
    if (!baseImageReady || !armImageReady) return;
    buildParts();
    ready = true;
    if (status) status.textContent = "ready";
    updateOutput();
  }

  image.onload = () => {
    baseImageReady = true;
    markImagesReady();
  };
  armImage.onload = () => {
    armImageReady = true;
    markImagesReady();
  };
  armImage.onerror = () => {
    if (status) status.textContent = "arm image missing";
  };

  loadSavedState();
  syncControls();
  updateOutput();
  image.src = SOURCE;
  armImage.src = ARM_SOURCE;
  window.requestAnimationFrame(tick);
})();

