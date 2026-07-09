const SOURCES = [
  {
    id: "infantry-v2",
    label: "보병 탑뷰 통합본 V2",
    url: "../../assets/ui/source-sheets/soubok-infantry-top-combined-v2.png",
  },
  {
    id: "tank-v1",
    label: "탱크 탑뷰",
    url: "../../assets/ui/source-sheets/soubok-tank-top-source-v1.png",
  },
];

const STORAGE_KEY = "subok.assetCropLab.v1";
const HANDLE_SCREEN_SIZE = 10;
const ACTION_POINT_META = {
  none: { label: "없음", role: "none", color: "#4fc3ff", usage: "no projectile or release point" },
  muzzle: { label: "총구", role: "bullet_spawn", color: "#4fc3ff", usage: "bullet/tracer spawn point" },
  projectile: { label: "미사일/RPG", role: "projectile_spawn", color: "#ff7868", usage: "rocket, shell, or missile spawn point" },
  release: { label: "투척/손놓기", role: "throw_release", color: "#ffd25f", usage: "grenade or thrown object release point" },
  explosion: { label: "폭발 중심", role: "explosion_center", color: "#c084fc", usage: "explosion or impact center point" },
};
const $ = (id) => document.getElementById(id);

const state = {
  source: SOURCES[0],
  image: null,
  scale: 1,
  originX: 0,
  originY: 0,
  drawing: false,
  pivotMode: false,
  actionPointMode: false,
  draft: null,
  activeId: null,
  resizing: null,
  crops: [],
  directory: null,
  history: [],
  clipboard: null,
  pendingFieldHistory: false,
};

const els = {};

function boot() {
  [
    "sourceSelect", "sourceFile", "zoomRange", "zoomValue", "gridToggle", "snapToggle",
    "sheetCanvas", "statusText", "coordText", "cropX", "cropY", "cropW", "cropH",
    "pivotX", "pivotY", "centerPivot", "pickPivot", "cropName", "cropType",
    "actionType", "actionKindText", "actionX", "actionY", "pickActionPoint", "clearActionPoint",
    "cropState", "cropVariant", "cropTags", "cropNotes", "transparentToggle",
    "thresholdRange", "thresholdValue", "paddingInput", "previewCanvas", "autoMinArea",
    "autoMergeGap", "autoBoxPadding", "autoDetect", "clearAutoCrops", "autoSummary", "addCrop",
    "updateCrop", "deleteCrop", "exportSelected", "downloadManifest", "chooseFolder",
    "saveAll", "manifestFile", "clearCrops", "cropList",
  ].forEach((id) => {
    els[id] = $(id);
  });

  SOURCES.forEach((source) => {
    const option = document.createElement("option");
    option.value = source.id;
    option.textContent = source.label;
    els.sourceSelect.append(option);
  });

  wireEvents();
  restoreLocal();
  loadSource(state.source);
  resizeCanvas();
}

function wireEvents() {
  window.addEventListener("resize", resizeCanvas);
  document.addEventListener("keydown", onDocumentKeyDown);
  document.addEventListener("copy", onDocumentCopy);
  document.addEventListener("paste", onDocumentPaste);
  els.sourceSelect.addEventListener("change", () => {
    const next = SOURCES.find((source) => source.id === els.sourceSelect.value);
    if (next) loadSource(next);
  });
  els.sourceFile.addEventListener("change", loadFileSource);
  els.zoomRange.addEventListener("input", () => {
    els.zoomValue.textContent = `${els.zoomRange.value}%`;
    draw();
  });
  [els.gridToggle, els.snapToggle, els.transparentToggle].forEach((input) => input.addEventListener("change", draw));
  els.thresholdRange.addEventListener("input", () => {
    els.thresholdValue.textContent = els.thresholdRange.value;
    drawPreview();
  });
  [els.paddingInput, els.cropX, els.cropY, els.cropW, els.cropH, els.pivotX, els.pivotY, els.actionX, els.actionY].forEach((input) => {
    input.addEventListener("focus", beginFieldHistory);
    input.addEventListener("input", applyFieldsToDraft);
    input.addEventListener("blur", () => {
      state.pendingFieldHistory = false;
    });
  });
  [els.cropName, els.cropType, els.cropState, els.cropVariant, els.cropTags, els.cropNotes].forEach((input) => {
    input.addEventListener("input", persistLocal);
  });

  els.sheetCanvas.addEventListener("pointerdown", onPointerDown);
  els.sheetCanvas.addEventListener("pointermove", onPointerMove);
  els.sheetCanvas.addEventListener("pointerup", onPointerUp);
  els.sheetCanvas.addEventListener("pointerleave", onPointerUp);
  els.sheetCanvas.tabIndex = 0;
  els.sheetCanvas.addEventListener("keydown", onCanvasKeyDown);

  els.centerPivot.addEventListener("click", centerPivot);
  els.pickPivot.addEventListener("click", () => {
    state.pivotMode = !state.pivotMode;
    if (state.pivotMode) state.actionPointMode = false;
    els.pickPivot.classList.toggle("primary", state.pivotMode);
    els.pickActionPoint.classList.remove("primary");
    setStatus(state.pivotMode ? "중심점을 찍을 위치를 클릭하세요." : "중심점 찍기 해제");
  });
  els.pickActionPoint.addEventListener("click", () => {
    state.actionPointMode = !state.actionPointMode;
    if (state.actionPointMode) state.pivotMode = false;
    els.pickActionPoint.classList.toggle("primary", state.actionPointMode);
    els.pickPivot.classList.remove("primary");
    setStatus(state.actionPointMode ? "총구/투척/폭발 기준점을 찍을 위치를 클릭하세요." : "액션점 찍기 해제");
  });
  els.clearActionPoint.addEventListener("click", clearActionPoint);
  els.addCrop.addEventListener("click", addCrop);
  els.autoDetect.addEventListener("click", autoDetectCrops);
  els.clearAutoCrops.addEventListener("click", clearAutoCrops);
  els.updateCrop.addEventListener("click", updateCrop);
  els.deleteCrop.addEventListener("click", deleteCrop);
  els.exportSelected.addEventListener("click", exportSelected);
  els.downloadManifest.addEventListener("click", () => downloadManifest());
  els.chooseFolder.addEventListener("click", chooseFolder);
  els.saveAll.addEventListener("click", saveAll);
  els.manifestFile.addEventListener("change", importManifest);
  els.clearCrops.addEventListener("click", clearCrops);
}

function onDocumentKeyDown(event) {
  if (isTextEditingTarget(event.target)) return;
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === "z" && !event.shiftKey) {
    event.preventDefault();
    undo();
  }
  if ((event.ctrlKey || event.metaKey) && key === "c") {
    event.preventDefault();
    copySelectedCrop();
  }
  if ((event.ctrlKey || event.metaKey) && key === "v") {
    event.preventDefault();
    pasteCopiedCrop();
  }
}

function onDocumentCopy(event) {
  if (isTextEditingTarget(event.target)) return;
  const copied = copySelectedCrop();
  if (!copied) return;
  event.preventDefault();
  if (event.clipboardData) {
    event.clipboardData.setData("application/json", JSON.stringify(copied));
    event.clipboardData.setData("text/plain", `subok-crop:${copied.name || "asset_crop"}`);
  }
}

function onDocumentPaste(event) {
  if (isTextEditingTarget(event.target)) return;
  if (!state.clipboard && event.clipboardData) {
    const raw = event.clipboardData.getData("application/json");
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.w && parsed?.h) state.clipboard = parsed;
    } catch (_error) {
      // Ignore non-crop clipboard contents.
    }
  }
  if (!state.clipboard) return;
  event.preventDefault();
  pasteCopiedCrop();
}

function isTextEditingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return target.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function resizeCanvas() {
  const rect = els.sheetCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  els.sheetCanvas.width = Math.max(300, Math.floor(rect.width * dpr));
  els.sheetCanvas.height = Math.max(300, Math.floor(rect.height * dpr));
  draw();
}

function loadSource(source) {
  state.source = source;
  els.sourceSelect.value = source.id;
  const image = new Image();
  image.onload = () => {
    state.image = image;
    state.draft = null;
    state.activeId = null;
    applySourceDefaults(source);
    setStatus(`${source.label} 로드 완료 · ${image.naturalWidth}x${image.naturalHeight}`);
    draw();
    renderList();
  };
  image.onerror = () => setStatus("원본 이미지를 불러오지 못했습니다.");
  image.src = source.url;
}

function applySourceDefaults(source) {
  const isTank = source.id.includes("tank") || source.label.includes("탱크");
  els.cropType.value = isTank ? "tank" : "infantry";
  els.cropState.value = isTank ? "misc" : "idle";
  els.cropName.value = isTank ? "tank_auto_01" : "infantry_auto_01";
}

function loadFileSource(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const source = { id: `file-${Date.now()}`, label: file.name, url, fileName: file.name };
  SOURCES.push(source);
  const option = document.createElement("option");
  option.value = source.id;
  option.textContent = source.label;
  els.sourceSelect.append(option);
  loadSource(source);
}

function draw() {
  const canvas = els.sheetCanvas;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawChecker(ctx, canvas.width, canvas.height, 32);
  if (!state.image) return;

  const fit = Math.min(canvas.width / state.image.naturalWidth, canvas.height / state.image.naturalHeight) * 0.94;
  state.scale = fit * (Number(els.zoomRange.value) / 100);
  state.originX = (canvas.width - state.image.naturalWidth * state.scale) / 2;
  state.originY = (canvas.height - state.image.naturalHeight * state.scale) / 2;

  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(state.scale, 0, 0, state.scale, state.originX, state.originY);
  ctx.drawImage(state.image, 0, 0);
  if (els.gridToggle.checked) drawGrid(ctx);
  currentCrops().forEach((crop) => drawCropBox(ctx, crop, crop.id === state.activeId));
  if (state.draft) drawCropBox(ctx, state.draft, true, true);
  drawPreview();
}

function drawChecker(ctx, width, height, size) {
  ctx.fillStyle = "#dce5db";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgba(28, 38, 32, 0.06)";
  for (let y = 0; y < height; y += size) {
    for (let x = (y / size) % 2 ? 0 : size; x < width; x += size * 2) {
      ctx.fillRect(x, y, size, size);
    }
  }
}

function drawGrid(ctx) {
  const step = 50;
  ctx.save();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
  ctx.lineWidth = 1 / state.scale;
  for (let x = 0; x <= state.image.naturalWidth; x += step) {
    line(ctx, x, 0, x, state.image.naturalHeight);
  }
  for (let y = 0; y <= state.image.naturalHeight; y += step) {
    line(ctx, 0, y, state.image.naturalWidth, y);
  }
  ctx.restore();
}

function drawCropBox(ctx, crop, active, draft = false) {
  sanitizeCrop(crop);
  ctx.save();
  ctx.strokeStyle = active ? "#ffc861" : "rgba(28, 45, 34, 0.82)";
  ctx.fillStyle = active ? "rgba(255, 200, 97, 0.12)" : "rgba(20, 42, 31, 0.08)";
  ctx.lineWidth = (active ? 3 : 2) / state.scale;
  if (draft) ctx.setLineDash([8 / state.scale, 5 / state.scale]);
  ctx.fillRect(crop.x, crop.y, crop.w, crop.h);
  ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);
  const px = crop.x + crop.pivotX;
  const py = crop.y + crop.pivotY;
  ctx.setLineDash([]);
  ctx.fillStyle = "#e85d5d";
  ctx.beginPath();
  ctx.arc(px, py, 5 / state.scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
  ctx.lineWidth = 1.5 / state.scale;
  line(ctx, px - 10 / state.scale, py, px + 10 / state.scale, py);
  line(ctx, px, py - 10 / state.scale, px, py + 10 / state.scale);
  if ((crop.actionType || "none") !== "none") drawActionPoint(ctx, crop);
  if (active) drawResizeHandles(ctx, crop);
  ctx.restore();
}

function drawActionPoint(ctx, crop) {
  const ax = crop.x + crop.actionX;
  const ay = crop.y + crop.actionY;
  const meta = actionPointMeta(crop.actionType);
  const size = 6 / state.scale;
  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = meta.color;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.75)";
  ctx.lineWidth = 1.5 / state.scale;
  ctx.beginPath();
  ctx.arc(ax, ay, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  line(ctx, ax - 12 / state.scale, ay, ax + 12 / state.scale, ay);
  line(ctx, ax, ay - 12 / state.scale, ax, ay + 12 / state.scale);
  ctx.restore();
}

function drawResizeHandles(ctx, crop) {
  const size = HANDLE_SCREEN_SIZE / state.scale;
  const half = size / 2;
  ctx.save();
  ctx.setLineDash([]);
  getResizeHandles(crop).forEach((handle) => {
    ctx.fillStyle = handle.corner ? "#ffc861" : "#78c4a7";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.72)";
    ctx.lineWidth = 1.4 / state.scale;
    ctx.beginPath();
    ctx.rect(handle.x - half, handle.y - half, size, size);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function onPointerDown(event) {
  if (!state.image) return;
  els.sheetCanvas.setPointerCapture(event.pointerId);
  const point = imagePoint(event);
  if (state.pivotMode) {
    setPivotFromPoint(point);
    return;
  }
  if (state.actionPointMode) {
    setActionPointFromPoint(point);
    return;
  }
  const resizeHandle = findResizeHandle(point);
  if (resizeHandle) {
    pushHistory("박스 크기 조절");
    state.resizing = {
      handle: resizeHandle.id,
      draft: resizeHandle.draft,
      cropId: resizeHandle.crop.id,
      startPoint: point,
      original: cloneCrop(resizeHandle.crop),
    };
    setStatus("핸들을 드래그해서 박스 크기를 조절합니다.");
    return;
  }
  const hit = findCropAt(point);
  if (hit && !event.shiftKey) {
    selectCrop(hit.id);
    return;
  }
  pushHistory("영역 선택");
  state.drawing = true;
  state.draft = makeCrop(point.x, point.y, 1, 1);
  state.startPoint = point;
  fillFields(state.draft);
  draw();
}

function onPointerMove(event) {
  if (!state.image) return;
  const point = imagePoint(event);
  els.coordText.textContent = `x ${Math.round(point.x)} · y ${Math.round(point.y)}`;
  if (state.resizing) {
    els.sheetCanvas.style.cursor = findResizeCursor(state.resizing.handle);
    updateResizeDrag(point);
    return;
  }
  const handle = findResizeHandle(point);
  els.sheetCanvas.style.cursor = handle ? handle.cursor : "crosshair";
  if (!state.drawing || !state.startPoint) return;
  const x = Math.min(state.startPoint.x, point.x);
  const y = Math.min(state.startPoint.y, point.y);
  const w = Math.abs(point.x - state.startPoint.x);
  const h = Math.abs(point.y - state.startPoint.y);
  state.draft = makeCrop(x, y, w, h);
  fillFields(state.draft);
  draw();
}

function onPointerUp(event) {
  if (event.pointerId != null && els.sheetCanvas.hasPointerCapture(event.pointerId)) {
    els.sheetCanvas.releasePointerCapture(event.pointerId);
  }
  if (state.resizing) {
    finishResizeDrag();
    return;
  }
  if (!state.drawing) return;
  state.drawing = false;
  normalizeDraft();
  setStatus("영역 선택 완료. 이름을 정하고 목록 추가를 누르세요.");
}

function getResizeHandles(crop) {
  const left = crop.x;
  const centerX = crop.x + crop.w / 2;
  const right = crop.x + crop.w;
  const top = crop.y;
  const centerY = crop.y + crop.h / 2;
  const bottom = crop.y + crop.h;
  return [
    { id: "nw", x: left, y: top, cursor: "nwse-resize", corner: true },
    { id: "n", x: centerX, y: top, cursor: "ns-resize" },
    { id: "ne", x: right, y: top, cursor: "nesw-resize", corner: true },
    { id: "e", x: right, y: centerY, cursor: "ew-resize" },
    { id: "se", x: right, y: bottom, cursor: "nwse-resize", corner: true },
    { id: "s", x: centerX, y: bottom, cursor: "ns-resize" },
    { id: "sw", x: left, y: bottom, cursor: "nesw-resize", corner: true },
    { id: "w", x: left, y: centerY, cursor: "ew-resize" },
  ];
}

function findResizeHandle(point) {
  const crop = activeCrop() || state.draft;
  if (!crop) return null;
  const hitRadius = (HANDLE_SCREEN_SIZE + 6) / state.scale;
  const handle = getResizeHandles(crop).find((item) => {
    return Math.abs(point.x - item.x) <= hitRadius && Math.abs(point.y - item.y) <= hitRadius;
  });
  return handle ? {
    ...handle,
    crop,
    draft: crop === state.draft,
  } : null;
}

function findResizeCursor(handleId) {
  const fallback = getResizeHandles({ x: 0, y: 0, w: 1, h: 1 }).find((handle) => handle.id === handleId);
  return fallback?.cursor || "crosshair";
}

function isPointNearHandle(point, handle, hitRadius) {
    return Math.abs(point.x - handle.x) <= hitRadius && Math.abs(point.y - handle.y) <= hitRadius;
}

function updateResizeDrag(point) {
  const drag = state.resizing;
  const crop = drag.draft ? state.draft : state.crops.find((item) => item.id === drag.cropId);
  if (!crop) return;
  const dx = point.x - drag.startPoint.x;
  const dy = point.y - drag.startPoint.y;
  applyResizeFromHandle(crop, drag.original, drag.handle, dx, dy);
  crop.auto = false;
  fillFields(crop);
  draw();
}

function finishResizeDrag() {
  const crop = state.resizing.draft ? state.draft : state.crops.find((item) => item.id === state.resizing.cropId);
  if (crop) {
    fillFields(crop);
    persistLocal();
    renderList();
    draw();
  }
  state.resizing = null;
  setStatus("박스 크기 조절 완료");
}

function applyResizeFromHandle(crop, original, handle, dx, dy) {
  let left = original.x;
  let top = original.y;
  let right = original.x + original.w;
  let bottom = original.y + original.h;
  if (handle.includes("w")) left += dx;
  if (handle.includes("e")) right += dx;
  if (handle.includes("n")) top += dy;
  if (handle.includes("s")) bottom += dy;

  left = clamp(left, 0, state.image.naturalWidth - 1);
  top = clamp(top, 0, state.image.naturalHeight - 1);
  right = clamp(right, 1, state.image.naturalWidth);
  bottom = clamp(bottom, 1, state.image.naturalHeight);

  const minSize = 1;
  if (right - left < minSize) {
    if (handle.includes("w")) left = right - minSize;
    else right = left + minSize;
  }
  if (bottom - top < minSize) {
    if (handle.includes("n")) top = bottom - minSize;
    else bottom = top + minSize;
  }

  const sourcePivotX = original.x + original.pivotX;
  const sourcePivotY = original.y + original.pivotY;
  const sourceActionX = original.x + numberOr(original.actionX, original.w / 2);
  const sourceActionY = original.y + numberOr(original.actionY, original.h / 2);
  crop.x = Math.round(left);
  crop.y = Math.round(top);
  crop.w = Math.max(1, Math.round(right - left));
  crop.h = Math.max(1, Math.round(bottom - top));
  crop.pivotX = clamp(Math.round(sourcePivotX - crop.x), 0, crop.w);
  crop.pivotY = clamp(Math.round(sourcePivotY - crop.y), 0, crop.h);
  crop.actionX = clamp(Math.round(sourceActionX - crop.x), 0, crop.w);
  crop.actionY = clamp(Math.round(sourceActionY - crop.y), 0, crop.h);
}

function onCanvasKeyDown(event) {
  const crop = activeCrop();
  if (!crop || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
  const amount = event.shiftKey ? 10 : 1;
  pushHistory("박스 이동");
  if (event.key === "ArrowLeft") crop.x -= amount;
  if (event.key === "ArrowRight") crop.x += amount;
  if (event.key === "ArrowUp") crop.y -= amount;
  if (event.key === "ArrowDown") crop.y += amount;
  crop.x = clamp(crop.x, 0, state.image.naturalWidth - crop.w);
  crop.y = clamp(crop.y, 0, state.image.naturalHeight - crop.h);
  crop.auto = false;
  fillFields(crop);
  persistLocal();
  renderList();
  draw();
  event.preventDefault();
}

function imagePoint(event) {
  const rect = els.sheetCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  let x = ((event.clientX - rect.left) * dpr - state.originX) / state.scale;
  let y = ((event.clientY - rect.top) * dpr - state.originY) / state.scale;
  if (els.snapToggle.checked) {
    x = Math.round(x / 4) * 4;
    y = Math.round(y / 4) * 4;
  }
  return {
    x: clamp(x, 0, state.image.naturalWidth),
    y: clamp(y, 0, state.image.naturalHeight),
  };
}

function makeCrop(x, y, w, h) {
  const crop = {
    id: `crop-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name: els.cropName.value.trim() || "asset_crop",
    type: els.cropType.value,
    state: els.cropState.value,
    variant: els.cropVariant.value.trim(),
    tags: tagsFromInput(),
    notes: els.cropNotes.value.trim(),
    sourceId: state.source.id,
    sourceLabel: state.source.label,
    x: Math.round(x),
    y: Math.round(y),
    w: Math.max(1, Math.round(w)),
    h: Math.max(1, Math.round(h)),
    pivotX: Math.max(0, Math.round(w / 2)),
    pivotY: Math.max(0, Math.round(h / 2)),
    actionType: "none",
    actionX: Math.max(0, Math.round(w / 2)),
    actionY: Math.max(0, Math.round(h / 2)),
  };
  return sanitizeCrop(crop);
}

function normalizeDraft() {
  if (!state.draft) return;
  state.draft.w = Math.max(1, Math.round(state.draft.w));
  state.draft.h = Math.max(1, Math.round(state.draft.h));
  state.draft.x = clamp(Math.round(state.draft.x), 0, state.image.naturalWidth - state.draft.w);
  state.draft.y = clamp(Math.round(state.draft.y), 0, state.image.naturalHeight - state.draft.h);
  state.draft.pivotX = Math.round(state.draft.w / 2);
  state.draft.pivotY = Math.round(state.draft.h / 2);
  state.draft.actionX = Math.round(state.draft.w / 2);
  state.draft.actionY = Math.round(state.draft.h / 2);
  sanitizeCrop(state.draft);
  fillFields(state.draft);
  draw();
}

function fillFields(crop) {
  sanitizeCrop(crop);
  els.cropX.value = Math.round(crop.x);
  els.cropY.value = Math.round(crop.y);
  els.cropW.value = Math.round(crop.w);
  els.cropH.value = Math.round(crop.h);
  els.pivotX.value = Math.round(crop.pivotX);
  els.pivotY.value = Math.round(crop.pivotY);
  els.actionType.value = crop.actionType || "none";
  els.actionX.value = Math.round(crop.actionX);
  els.actionY.value = Math.round(crop.actionY);
  updateActionKindText(crop);
}

function applyFieldsToDraft() {
  const crop = activeCrop() || state.draft || makeCrop(0, 0, 1, 1);
  crop.x = Number(els.cropX.value) || 0;
  crop.y = Number(els.cropY.value) || 0;
  crop.w = Math.max(1, Number(els.cropW.value) || 1);
  crop.h = Math.max(1, Number(els.cropH.value) || 1);
  crop.pivotX = clamp(Number(els.pivotX.value) || 0, 0, crop.w);
  crop.pivotY = clamp(Number(els.pivotY.value) || 0, 0, crop.h);
  crop.actionType = crop.actionType && crop.actionType !== "none" ? inferActionType(crop) : "none";
  crop.actionX = clamp(Number(els.actionX.value) || 0, 0, crop.w);
  crop.actionY = clamp(Number(els.actionY.value) || 0, 0, crop.h);
  crop.auto = false;
  sanitizeCrop(crop);
  fillFields(crop);
  if (!activeCrop()) state.draft = crop;
  persistLocal();
  renderList();
  draw();
}

function beginFieldHistory() {
  if (state.pendingFieldHistory) return;
  pushHistory("숫자 입력");
  state.pendingFieldHistory = true;
}

function applyMeta(crop) {
  crop.name = els.cropName.value.trim() || "asset_crop";
  crop.type = els.cropType.value;
  crop.state = els.cropState.value;
  crop.variant = els.cropVariant.value.trim();
  crop.tags = tagsFromInput();
  crop.notes = els.cropNotes.value.trim();
  crop.actionType = crop.actionType && crop.actionType !== "none" ? inferActionType(crop) : "none";
  crop.actionX = clamp(Number(els.actionX.value) || 0, 0, crop.w);
  crop.actionY = clamp(Number(els.actionY.value) || 0, 0, crop.h);
  sanitizeCrop(crop);
}

function fillMeta(crop) {
  els.cropName.value = crop.name || "";
  els.cropType.value = crop.type || "infantry";
  els.cropState.value = crop.state || "idle";
  els.cropVariant.value = crop.variant || "";
  els.cropTags.value = (crop.tags || []).join(", ");
  els.cropNotes.value = crop.notes || "";
}

function tagsFromInput() {
  return els.cropTags.value.split(",").map((tag) => tag.trim()).filter(Boolean);
}

function centerPivot() {
  const crop = activeCrop() || state.draft;
  if (!crop) return;
  pushHistory("중심 자동");
  crop.pivotX = Math.round(crop.w / 2);
  crop.pivotY = Math.round(crop.h / 2);
  crop.auto = false;
  fillFields(crop);
  persistLocal();
  renderList();
  draw();
}

function setPivotFromPoint(point) {
  const crop = activeCrop() || state.draft;
  if (!crop) return;
  pushHistory("중심 찍기");
  crop.pivotX = clamp(Math.round(point.x - crop.x), 0, crop.w);
  crop.pivotY = clamp(Math.round(point.y - crop.y), 0, crop.h);
  crop.auto = false;
  fillFields(crop);
  state.pivotMode = false;
  els.pickPivot.classList.remove("primary");
  persistLocal();
  renderList();
  setStatus("중심점 지정 완료");
  draw();
}

function setActionPointFromPoint(point) {
  const crop = activeCrop() || state.draft;
  if (!crop) return;
  pushHistory("액션점 찍기");
  applyMeta(crop);
  crop.actionType = inferActionType(crop);
  crop.actionX = clamp(Math.round(point.x - crop.x), 0, crop.w);
  crop.actionY = clamp(Math.round(point.y - crop.y), 0, crop.h);
  crop.auto = false;
  sanitizeCrop(crop);
  fillFields(crop);
  state.actionPointMode = false;
  els.pickActionPoint.classList.remove("primary");
  persistLocal();
  renderList();
  setStatus("액션점 지정 완료");
  draw();
}

function clearActionPoint() {
  const crop = activeCrop() || state.draft;
  if (!crop) return;
  pushHistory("액션점 제거");
  crop.actionType = "none";
  crop.actionX = Math.round(crop.w / 2);
  crop.actionY = Math.round(crop.h / 2);
  crop.auto = false;
  sanitizeCrop(crop);
  fillFields(crop);
  state.actionPointMode = false;
  els.pickActionPoint.classList.remove("primary");
  persistLocal();
  renderList();
  setStatus("액션점 제거 완료");
  draw();
}

function applyActionType() {
  const crop = activeCrop() || state.draft;
  if (!crop) return;
  crop.actionType = crop.actionType && crop.actionType !== "none" ? inferActionType(crop) : "none";
  if (crop.actionType !== "none" && crop.actionX == null) crop.actionX = Math.round(crop.w / 2);
  if (crop.actionType !== "none" && crop.actionY == null) crop.actionY = Math.round(crop.h / 2);
  sanitizeCrop(crop);
  fillFields(crop);
  persistLocal();
  draw();
}

function addCrop() {
  const crop = cloneCrop(state.draft || activeCrop());
  if (!crop) {
    setStatus("먼저 캔버스에서 영역을 드래그하세요.");
    return;
  }
  pushHistory("목록 추가");
  applyMeta(crop);
  crop.auto = false;
  crop.id = `crop-${Date.now()}`;
  state.crops.push(crop);
  state.activeId = crop.id;
  state.draft = null;
  persistLocal();
  renderList();
  draw();
  setStatus(`${crop.name} 추가 완료`);
}

function updateCrop() {
  const crop = activeCrop();
  if (!crop) {
    setStatus("수정할 컷을 먼저 선택하세요.");
    return;
  }
  pushHistory("수정 반영");
  applyFieldsToDraft();
  applyMeta(crop);
  crop.auto = false;
  persistLocal();
  renderList();
  draw();
  setStatus(`${crop.name} 수정 완료`);
}

function deleteCrop() {
  if (!state.activeId) return;
  pushHistory("삭제");
  state.crops = state.crops.filter((crop) => crop.id !== state.activeId);
  state.activeId = null;
  persistLocal();
  renderList();
  draw();
  setStatus("선택 컷 삭제 완료");
}

function clearCrops() {
  pushHistory("비우기");
  const sourceId = state.source.id;
  state.crops = state.crops.filter((crop) => crop.sourceId !== sourceId);
  state.activeId = null;
  state.draft = null;
  persistLocal();
  renderList();
  draw();
}

function clearAutoCrops() {
  const sourceId = state.source.id;
  const before = state.crops.length;
  if (!state.crops.some((crop) => crop.sourceId === sourceId && crop.auto)) {
    setStatus("삭제할 자동컷이 없습니다.");
    return;
  }
  pushHistory("자동컷 삭제");
  state.crops = state.crops.filter((crop) => crop.sourceId !== sourceId || !crop.auto);
  if (activeCrop()?.auto) state.activeId = null;
  persistLocal();
  renderList();
  draw();
  const removed = before - state.crops.length;
  els.autoSummary.textContent = `자동컷 ${removed}개 삭제`;
  setStatus(`자동컷 ${removed}개 삭제 완료`);
}

function selectCrop(id) {
  const crop = currentCrops().find((item) => item.id === id);
  if (!crop) return;
  state.activeId = id;
  state.draft = null;
  fillFields(crop);
  fillMeta(crop);
  renderList();
  draw();
}

function findCropAt(point) {
  return [...currentCrops()].reverse().find((crop) => {
    return point.x >= crop.x && point.x <= crop.x + crop.w && point.y >= crop.y && point.y <= crop.y + crop.h;
  });
}

function activeCrop() {
  return currentCrops().find((crop) => crop.id === state.activeId) || null;
}

function currentCrops() {
  return state.crops
    .filter((crop) => (crop.sourceId || state.source.id) === state.source.id)
    .map((crop) => sanitizeCrop(crop));
}

function copySelectedCrop() {
  const crop = activeCrop() || state.draft;
  if (!crop) {
    setStatus("복사할 박스를 먼저 선택하세요.");
    return null;
  }
  state.clipboard = cloneCrop(crop);
  setStatus(`${crop.name || "선택 박스"} 복사 완료`);
  return state.clipboard;
}

function pasteCopiedCrop() {
  if (!state.clipboard) {
    setStatus("붙여넣을 박스가 없습니다.");
    return;
  }
  if (!state.image) return;
  pushHistory("박스 붙여넣기");
  const crop = cloneCrop(state.clipboard);
  crop.id = `crop-${Date.now()}-paste`;
  crop.name = uniqueCopyName(crop.name || "asset_crop");
  crop.variant = nextVariant(crop.variant);
  crop.sourceId = state.source.id;
  crop.sourceLabel = state.source.label;
  crop.x = clamp((Number(crop.x) || 0) + 14, 0, Math.max(0, state.image.naturalWidth - crop.w));
  crop.y = clamp((Number(crop.y) || 0) + 14, 0, Math.max(0, state.image.naturalHeight - crop.h));
  sanitizeCrop(crop);
  crop.auto = false;
  state.crops.push(crop);
  state.activeId = crop.id;
  state.draft = null;
  fillFields(crop);
  fillMeta(crop);
  persistLocal();
  renderList();
  draw();
  setStatus(`${crop.name} 붙여넣기 완료`);
}

function uniqueCopyName(baseName) {
  const sourceNames = new Set(currentCrops().map((crop) => crop.name));
  let index = 2;
  let next = `${baseName}_copy`;
  while (sourceNames.has(next)) {
    next = `${baseName}_copy_${index}`;
    index += 1;
  }
  return next;
}

function nextVariant(variant) {
  const numeric = Number.parseInt(variant, 10);
  if (!Number.isFinite(numeric)) return variant || "copy";
  return String(numeric + 1).padStart(String(variant).length || 2, "0");
}

function pushHistory(label) {
  state.history.push({
    label,
    sourceId: state.source.id,
    crops: cloneCrop(state.crops),
    draft: cloneCrop(state.draft),
    activeId: state.activeId,
    form: collectFormState(),
  });
  if (state.history.length > 80) state.history.shift();
}

function undo() {
  const snapshot = state.history.pop();
  if (!snapshot) {
    setStatus("되돌릴 작업이 없습니다.");
    return;
  }
  state.crops = cloneCrop(snapshot.crops) || [];
  state.draft = cloneCrop(snapshot.draft);
  state.activeId = snapshot.activeId;
  restoreFormState(snapshot.form);
  state.pendingFieldHistory = false;
  persistLocal();
  renderList();
  draw();
  setStatus(`${snapshot.label || "작업"} 되돌림`);
}

function collectFormState() {
  return {
    cropName: els.cropName.value,
    cropType: els.cropType.value,
    cropState: els.cropState.value,
    cropVariant: els.cropVariant.value,
    cropTags: els.cropTags.value,
    cropNotes: els.cropNotes.value,
    cropX: els.cropX.value,
    cropY: els.cropY.value,
    cropW: els.cropW.value,
    cropH: els.cropH.value,
    pivotX: els.pivotX.value,
    pivotY: els.pivotY.value,
    actionType: els.actionType.value,
    actionX: els.actionX.value,
    actionY: els.actionY.value,
  };
}

function restoreFormState(form = {}) {
  Object.entries(form).forEach(([key, value]) => {
    if (els[key]) els[key].value = value;
  });
}

function renderList() {
  els.cropList.textContent = "";
  const crops = currentCrops();
  if (!crops.length) {
    const empty = document.createElement("div");
    empty.className = "crop-item";
    empty.textContent = "저장된 컷이 없습니다.";
    els.cropList.append(empty);
    return;
  }
  crops.forEach((crop) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `crop-item${crop.id === state.activeId ? " is-active" : ""}`;
    button.addEventListener("click", () => selectCrop(crop.id));

    const img = document.createElement("img");
    img.alt = crop.name;
    img.src = renderCrop(crop).toDataURL("image/png");
    const text = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = crop.name;
    const meta = document.createElement("span");
    meta.textContent = `${crop.auto ? "자동 · " : ""}${crop.type}/${crop.state} · ${Math.round(crop.w)}x${Math.round(crop.h)}`;
    text.append(name, meta);
    button.append(img, text);
    els.cropList.append(button);
  });
}

function autoDetectCrops() {
  if (!state.image) {
    setStatus("원본 이미지가 없습니다.");
    return;
  }
  const minArea = Math.max(10, Number(els.autoMinArea.value) || 90);
  const mergeGap = Math.max(0, Number(els.autoMergeGap.value) || 0);
  const boxPadding = Math.max(0, Number(els.autoBoxPadding.value) || 0);
  const threshold = Number(els.thresholdRange.value) || 242;
  const detected = detectInkComponents(threshold, minArea);
  const components = detected.boxes;
  const boxes = mergeBoxes(components, mergeGap)
    .map((box) => padBox(box, boxPadding))
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));

  const sourceId = state.source.id;
  pushHistory("자동 컷팅");
  state.crops = state.crops.filter((crop) => crop.sourceId !== sourceId || !crop.auto);
  const type = inferSourceType();
  const defaultState = type === "tank" ? "misc" : "idle";
  const prefix = type === "tank" ? "tank_auto" : "infantry_auto";
  const autoCrops = boxes.map((box, index) => {
    const crop = makeCrop(box.x, box.y, box.w, box.h);
    crop.id = `auto-${sourceId}-${Date.now()}-${index}`;
    crop.name = `${prefix}_${String(index + 1).padStart(2, "0")}`;
    crop.type = type;
    crop.state = defaultState;
    crop.variant = String(index + 1).padStart(2, "0");
    crop.tags = ["auto"];
    crop.notes = "자동 컷팅 초안";
    crop.auto = true;
    crop.sourceId = sourceId;
    crop.sourceLabel = state.source.label;
    return crop;
  });
  state.crops.push(...autoCrops);
  state.activeId = autoCrops[0]?.id || null;
  if (state.activeId) {
    const first = activeCrop();
    fillFields(first);
    fillMeta(first);
  }
  persistLocal();
  renderList();
  draw();
  els.autoSummary.textContent = `감지 ${components.length}개 → 병합 후 ${autoCrops.length}개 컷 생성 · 잉크 ${detected.inkCount}픽셀`;
  setStatus(`자동 컷팅 완료 · ${autoCrops.length}개`);
}

function detectInkComponents(threshold, minArea) {
  const width = state.image.naturalWidth;
  const height = state.image.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(state.image, 0, 0);
  const data = ctx.getImageData(0, 0, width, height).data;
  const total = width * height;
  const mask = new Uint8Array(total);
  const visited = new Uint8Array(total);
  const stack = new Int32Array(total);

  for (let pixel = 0, i = 0; pixel < total; pixel += 1, i += 4) {
    const alpha = data[i + 3];
    const white = data[i] >= threshold && data[i + 1] >= threshold && data[i + 2] >= threshold;
    mask[pixel] = alpha > 12 && !white ? 1 : 0;
  }

  let inkCount = 0;
  for (let pixel = 0; pixel < total; pixel += 1) {
    if (mask[pixel]) inkCount += 1;
  }

  const boxes = [];
  for (let index = 0; index < total; index += 1) {
    if (!mask[index] || visited[index]) continue;
    let top = 0;
    let count = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    stack[top++] = index;
    visited[index] = 1;
    const pushNeighbor = (next, inside) => {
      if (!inside || visited[next] || !mask[next]) return;
      visited[next] = 1;
      stack[top++] = next;
    };
    while (top > 0) {
      const current = stack[--top];
      const x = current % width;
      const y = Math.floor(current / width);
      count += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      pushNeighbor(current - 1, x > 0);
      pushNeighbor(current + 1, x < width - 1);
      pushNeighbor(current - width, y > 0);
      pushNeighbor(current + width, y < height - 1);
      pushNeighbor(current - width - 1, x > 0 && y > 0);
      pushNeighbor(current - width + 1, x < width - 1 && y > 0);
      pushNeighbor(current + width - 1, x > 0 && y < height - 1);
      pushNeighbor(current + width + 1, x < width - 1 && y < height - 1);
    }
    const box = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area: count };
    if (count >= minArea && box.w >= 4 && box.h >= 4) boxes.push(box);
  }
  return { boxes, inkCount };
}

function mergeBoxes(boxes, gap) {
  const merged = boxes.map((box) => ({ ...box }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < merged.length; i += 1) {
      for (let j = i + 1; j < merged.length; j += 1) {
        if (!boxesTouch(merged[i], merged[j], gap)) continue;
        merged[i] = unionBox(merged[i], merged[j]);
        merged.splice(j, 1);
        changed = true;
        j -= 1;
      }
    }
  }
  return merged;
}

function boxesTouch(a, b, gap) {
  return a.x <= b.x + b.w + gap &&
    a.x + a.w + gap >= b.x &&
    a.y <= b.y + b.h + gap &&
    a.y + a.h + gap >= b.y;
}

function unionBox(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.w, b.x + b.w);
  const bottom = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: right - x, h: bottom - y, area: (a.area || 0) + (b.area || 0) };
}

function padBox(box, padding) {
  const x = clamp(box.x - padding, 0, state.image.naturalWidth - 1);
  const y = clamp(box.y - padding, 0, state.image.naturalHeight - 1);
  const right = clamp(box.x + box.w + padding, 1, state.image.naturalWidth);
  const bottom = clamp(box.y + box.h + padding, 1, state.image.naturalHeight);
  return { x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y), area: box.area };
}

function inferSourceType() {
  return state.source.id.includes("tank") || state.source.label.includes("탱크") ? "tank" : "infantry";
}

function inferActionType(crop) {
  const text = [
    crop.name,
    crop.type,
    crop.state,
    crop.variant,
    ...(crop.tags || []),
    crop.notes,
  ].filter(Boolean).join(" ").toLowerCase();
  if (text.includes("explosion") || text.includes("blast") || text.includes("impact") || text.includes("폭발")) {
    return "explosion";
  }
  if (text.includes("grenade") || text.includes("throw") || text.includes("release") || text.includes("수류탄") || text.includes("투척")) {
    return "release";
  }
  if (crop.type === "tank" || text.includes("rpg") || text.includes("rocket") || text.includes("missile") || text.includes("shell") || text.includes("launcher") || text.includes("미사일") || text.includes("로켓") || text.includes("전차포") || text.includes("주포")) {
    return "projectile";
  }
  if (crop.type === "weapon" || crop.type === "vehicle-weapon" || text.includes("rifle") || text.includes("sniper") || text.includes("pistol") || text.includes("machinegun") || text.includes("lmg") || text.includes("mg") || text.includes("gun") || text.includes("fire") || text.includes("aim") || text.includes("소총") || text.includes("저격") || text.includes("권총") || text.includes("기관총") || text.includes("총구") || text.includes("사격") || text.includes("조준")) {
    return "muzzle";
  }
  return "muzzle";
}

function updateActionKindText(crop) {
  const type = crop && crop.actionType && crop.actionType !== "none" ? crop.actionType : "none";
  const meta = actionPointMeta(type);
  if (els.actionType) els.actionType.value = type;
  if (els.actionKindText) {
    els.actionKindText.textContent = type === "none" ? "자동 판정: 없음" : `자동 판정: ${meta.label}`;
  }
}

function drawPreview() {
  const crop = activeCrop() || state.draft;
  const ctx = els.previewCanvas.getContext("2d");
  ctx.clearRect(0, 0, els.previewCanvas.width, els.previewCanvas.height);
  drawChecker(ctx, els.previewCanvas.width, els.previewCanvas.height, 16);
  if (!crop || !state.image) return;
  const cropCanvas = renderCrop(crop);
  const scale = Math.min(els.previewCanvas.width / cropCanvas.width, els.previewCanvas.height / cropCanvas.height) * 0.88;
  const x = (els.previewCanvas.width - cropCanvas.width * scale) / 2;
  const y = (els.previewCanvas.height - cropCanvas.height * scale) / 2;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cropCanvas, x, y, cropCanvas.width * scale, cropCanvas.height * scale);
}

function renderCrop(crop) {
  sanitizeCrop(crop);
  const padding = Math.max(0, Number(els.paddingInput.value) || 0);
  const sx = clamp(Math.floor(crop.x - padding), 0, state.image.naturalWidth);
  const sy = clamp(Math.floor(crop.y - padding), 0, state.image.naturalHeight);
  const ex = clamp(Math.ceil(crop.x + crop.w + padding), 0, state.image.naturalWidth);
  const ey = clamp(Math.ceil(crop.y + crop.h + padding), 0, state.image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, ex - sx);
  canvas.height = Math.max(1, ey - sy);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(state.image, sx, sy, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  if (els.transparentToggle.checked) removeWhite(ctx, canvas.width, canvas.height, Number(els.thresholdRange.value));
  return canvas;
}

function removeWhite(ctx, width, height, threshold) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] >= threshold && data[i + 1] >= threshold && data[i + 2] >= threshold) {
      data[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

async function exportSelected() {
  const crop = activeCrop() || state.draft;
  if (!crop) return setStatus("내보낼 컷이 없습니다.");
  downloadCanvas(renderCrop(crop), `${fileBase(crop)}.png`);
  setStatus(`${crop.name} PNG 다운로드`);
}

async function chooseFolder() {
  if (!window.showDirectoryPicker) {
    setStatus("이 브라우저는 폴더 선택 저장을 지원하지 않습니다. 다운로드 저장을 사용하세요.");
    return;
  }
  state.directory = await window.showDirectoryPicker({ mode: "readwrite" });
  setStatus(`저장 폴더 선택 완료: ${state.directory.name}`);
}

async function saveAll() {
  const crops = currentCrops();
  if (!crops.length) return setStatus("저장할 컷이 없습니다.");
  if (state.directory) {
    await writeTextFile(state.directory, "asset-crop-manifest.json", JSON.stringify(makeManifest(), null, 2));
    for (const crop of crops) {
      await writeBlobFile(state.directory, `${fileBase(crop)}.png`, await canvasBlob(renderCrop(crop)));
    }
    setStatus(`전체 저장 완료: ${crops.length}개 PNG + JSON`);
    return;
  }
  downloadManifest();
  crops.forEach((crop, index) => {
    window.setTimeout(() => downloadCanvas(renderCrop(crop), `${fileBase(crop)}.png`), index * 120);
  });
  setStatus("폴더 미선택 상태라 다운로드로 저장했습니다.");
}

function downloadManifest() {
  const blob = new Blob([JSON.stringify(makeManifest(), null, 2)], { type: "application/json" });
  downloadBlob(blob, "asset-crop-manifest.json");
}

function makeManifest() {
  const padding = Math.max(0, Number(els.paddingInput.value) || 0);
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: {
      id: state.source.id,
      label: state.source.label,
      url: state.source.url,
      width: state.image ? state.image.naturalWidth : 0,
      height: state.image ? state.image.naturalHeight : 0,
    },
    export: {
      transparentWhite: els.transparentToggle.checked,
      whiteThreshold: Number(els.thresholdRange.value),
      padding,
    },
    crops: currentCrops().map((crop) => {
      const safeCrop = sanitizeCrop(crop);
      const actionType = safeCrop.actionType || "none";
      return {
        id: safeCrop.id,
        name: safeCrop.name,
        file: `${fileBase(safeCrop)}.png`,
        type: safeCrop.type,
        state: safeCrop.state,
        variant: safeCrop.variant,
        tags: safeCrop.tags || [],
        notes: safeCrop.notes || "",
        sourceId: safeCrop.sourceId || state.source.id,
        sourceLabel: safeCrop.sourceLabel || state.source.label,
        sourceRect: { x: safeCrop.x, y: safeCrop.y, w: safeCrop.w, h: safeCrop.h },
        pivot: {
          role: "placement_rotation",
          x: safeCrop.pivotX + padding,
          y: safeCrop.pivotY + padding,
          sourceX: safeCrop.x + safeCrop.pivotX,
          sourceY: safeCrop.y + safeCrop.pivotY,
          normalizedX: round(safeCrop.pivotX / safeCrop.w),
          normalizedY: round(safeCrop.pivotY / safeCrop.h),
        },
        actionPoint: actionType === "none" ? null : {
          type: actionType,
          label: actionPointMeta(actionType).label,
          role: actionPointMeta(actionType).role,
          usage: actionPointMeta(actionType).usage,
          x: safeCrop.actionX + padding,
          y: safeCrop.actionY + padding,
          sourceX: safeCrop.x + safeCrop.actionX,
          sourceY: safeCrop.y + safeCrop.actionY,
          normalizedX: round(safeCrop.actionX / safeCrop.w),
          normalizedY: round(safeCrop.actionY / safeCrop.h),
        },
      };
    }),
  };
}

async function importManifest(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const data = JSON.parse(await file.text());
  state.crops = (data.crops || []).map((crop) => {
    const x = crop.sourceRect?.x || crop.x || 0;
    const y = crop.sourceRect?.y || crop.y || 0;
    const nextCrop = {
      id: crop.id || `crop-${Date.now()}-${Math.random()}`,
      name: crop.name || "asset_crop",
      type: crop.type || "infantry",
      state: crop.state || "idle",
      variant: crop.variant || "",
      tags: crop.tags || [],
      notes: crop.notes || "",
      sourceId: crop.sourceId || data.source?.id || state.source.id,
      sourceLabel: crop.sourceLabel || data.source?.label || state.source.label,
      x,
      y,
      w: crop.sourceRect?.w || crop.w || 1,
      h: crop.sourceRect?.h || crop.h || 1,
      pivotX: crop.pivot?.sourceX != null ? crop.pivot.sourceX - x : crop.pivot?.x || 0,
      pivotY: crop.pivot?.sourceY != null ? crop.pivot.sourceY - y : crop.pivot?.y || 0,
      actionType: crop.actionPoint?.type || crop.actionType || "none",
      actionX: crop.actionPoint?.sourceX != null ? crop.actionPoint.sourceX - x : crop.actionPoint?.x || crop.actionX || 0,
      actionY: crop.actionPoint?.sourceY != null ? crop.actionPoint.sourceY - y : crop.actionPoint?.y || crop.actionY || 0,
      auto: crop.auto || false,
    };
    return sanitizeCrop(nextCrop);
  });
  state.activeId = currentCrops()[0]?.id || null;
  if (state.activeId) selectCrop(state.activeId);
  persistLocal();
  renderList();
  draw();
  setStatus("JSON 불러오기 완료");
}

function downloadCanvas(canvas, filename) {
  canvas.toBlob((blob) => downloadBlob(blob, filename), "image/png");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canvasBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

async function writeBlobFile(directory, filename, blob) {
  const handle = await directory.getFileHandle(filename, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

async function writeTextFile(directory, filename, text) {
  await writeBlobFile(directory, filename, new Blob([text], { type: "application/json" }));
}

function fileBase(crop) {
  const pieces = [crop.type, crop.state, crop.name, crop.variant].filter(Boolean).join("_");
  return pieces.toLowerCase().replace(/[^a-z0-9가-힣_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || crop.id;
}

function persistLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    sourceId: state.source.id,
    crops: state.crops,
    transparent: els.transparentToggle.checked,
    threshold: els.thresholdRange.value,
    padding: els.paddingInput.value,
  }));
}

function restoreLocal() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    state.crops = Array.isArray(data.crops) ? data.crops.map((crop) => sanitizeCrop(crop)) : [];
    els.transparentToggle.checked = data.transparent !== false;
    els.thresholdRange.value = data.threshold || 242;
    els.thresholdValue.textContent = els.thresholdRange.value;
    els.paddingInput.value = data.padding || 6;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function cloneCrop(crop) {
  return crop ? JSON.parse(JSON.stringify(crop)) : null;
}

function sanitizeCrop(crop) {
  if (!crop) return crop;
  crop.x = Math.round(numberOr(crop.x, 0));
  crop.y = Math.round(numberOr(crop.y, 0));
  crop.w = Math.max(1, Math.round(numberOr(crop.w, 1)));
  crop.h = Math.max(1, Math.round(numberOr(crop.h, 1)));
  if (state.image) {
    crop.w = Math.min(crop.w, state.image.naturalWidth);
    crop.h = Math.min(crop.h, state.image.naturalHeight);
    crop.x = clamp(crop.x, 0, Math.max(0, state.image.naturalWidth - crop.w));
    crop.y = clamp(crop.y, 0, Math.max(0, state.image.naturalHeight - crop.h));
  }
  crop.pivotX = clamp(Math.round(numberOr(crop.pivotX, Math.round(crop.w / 2))), 0, crop.w);
  crop.pivotY = clamp(Math.round(numberOr(crop.pivotY, Math.round(crop.h / 2))), 0, crop.h);
  const validActionTypes = new Set(["none", "muzzle", "projectile", "release", "explosion"]);
  crop.actionType = validActionTypes.has(crop.actionType) ? crop.actionType : "none";
  crop.actionX = clamp(Math.round(numberOr(crop.actionX, Math.round(crop.w / 2))), 0, crop.w);
  crop.actionY = clamp(Math.round(numberOr(crop.actionY, Math.round(crop.h / 2))), 0, crop.h);
  return crop;
}

function actionPointMeta(type) {
  return ACTION_POINT_META[type] || ACTION_POINT_META.none;
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function setStatus(text) {
  els.statusText.textContent = text;
}

document.addEventListener("DOMContentLoaded", boot);
