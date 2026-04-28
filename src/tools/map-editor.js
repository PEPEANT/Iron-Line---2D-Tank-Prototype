"use strict";

(function registerMapEditor(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const math = IronLine.math || {};
  const clamp = math.clamp || ((value, min, max) => Math.max(min, Math.min(max, value)));
  const distXY = math.distXY || ((x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2));
  const lineIntersectsRect = math.lineIntersectsRect || fallbackLineIntersectsRect;
  const storageKey = "iron-line-map-editor-draft-v3";

  const state = {
    canvas: null,
    ctx: null,
    dpr: 1,
    controls: {},
    world: null,
    roads: [],
    roadWidth: 84,
    selectedRoad: 0,
    selectedPoint: null,
    hoveredPoint: null,
    selectedObstacle: null,
    hoveredObstacle: null,
    hoveredHandle: null,
    hoveredLayoutItem: null,
    selectedItems: new Set(),
    selectionBox: null,
    editMode: "road",
    tool: "move",
    snap: true,
    gridSize: 40,
    dragging: null,
    camera: { x: 0, y: 0, zoom: 1 },
    conflicts: [],
    conflictSegments: new Set(),
    conflictObstacles: new Set(),
    joinedPoints: new Set(),
    junctions: [],
    initializedCamera: false,
    dirty: false
  };

  function init() {
    if (!IronLine.map01) {
      document.body.textContent = "맵 데이터를 불러오지 못했습니다.";
      return;
    }

    state.canvas = document.getElementById("editorCanvas");
    state.ctx = state.canvas.getContext("2d");
    state.controls = {
      modeButtons: Array.from(document.querySelectorAll("[data-mode]")),
      modePanels: Array.from(document.querySelectorAll("[data-panel]")),
      roadSelect: document.getElementById("roadSelect"),
      obstacleSelect: document.getElementById("obstacleSelect"),
      obstacleKindSelect: document.getElementById("obstacleKindSelect"),
      roadWidthRange: document.getElementById("roadWidthRange"),
      roadWidthInput: document.getElementById("roadWidthInput"),
      worldWidthInput: document.getElementById("worldWidthInput"),
      worldHeightInput: document.getElementById("worldHeightInput"),
      expandWorld10Button: document.getElementById("expandWorld10Button"),
      expandWorld20Button: document.getElementById("expandWorld20Button"),
      gridSizeInput: document.getElementById("gridSizeInput"),
      snapToggle: document.getElementById("snapToggle"),
      deletePointButton: document.getElementById("deletePointButton"),
      newRoadButton: document.getElementById("newRoadButton"),
      deleteRoadButton: document.getElementById("deleteRoadButton"),
      newObstacleButton: document.getElementById("newObstacleButton"),
      deleteObstacleButton: document.getElementById("deleteObstacleButton"),
      fitButton: document.getElementById("fitButton"),
      focusConflictsButton: document.getElementById("focusConflictsButton"),
      saveDraftButton: document.getElementById("saveDraftButton"),
      resetDraftButton: document.getElementById("resetDraftButton"),
      copyButton: document.getElementById("copyButton"),
      downloadButton: document.getElementById("downloadButton"),
      exportOutput: document.getElementById("exportOutput"),
      statusText: document.getElementById("statusText"),
      toolButtons: Array.from(document.querySelectorAll("[data-tool]"))
    };

    loadBaseMap();
    loadDraft();
    bindControls();
    resize();
    syncControls();
    computeLayoutState();
    updateExport();
    requestAnimationFrame(draw);
  }

  function loadBaseMap() {
    const map = IronLine.map01;
    state.world = {
      width: map.width,
      height: map.height,
      obstacles: cloneRects(map.obstacles || []),
      terrainPatches: cloneObjects(map.terrainPatches || []),
      capturePoints: cloneObjects(map.capturePoints || []),
      safeZones: cloneObjects(map.safeZones || []),
      baseExitPoints: cloneNested(map.baseExitPoints || {}),
      spawns: cloneNested(map.spawns || {}),
      reconPoints: cloneNested(map.reconPoints || {}),
      navGraph: cloneNested(map.navGraph || { nodes: [] })
    };
    if (!Array.isArray(state.world.navGraph.nodes)) state.world.navGraph.nodes = [];
    state.roads = cloneRoads(map.roads || []);
    state.roadWidth = map.roadWidth || 84;
  }

  function loadDraft() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (!saved || !Array.isArray(saved.roads)) return;
      state.world.width = Number(saved.width) || state.world.width;
      state.world.height = Number(saved.height) || state.world.height;
      state.roads = cloneRoads(saved.roads);
      if (Array.isArray(saved.obstacles)) state.world.obstacles = cloneRects(saved.obstacles);
      if (Array.isArray(saved.capturePoints)) state.world.capturePoints = cloneObjects(saved.capturePoints);
      if (Array.isArray(saved.safeZones)) state.world.safeZones = cloneObjects(saved.safeZones);
      if (saved.baseExitPoints) state.world.baseExitPoints = cloneNested(saved.baseExitPoints);
      if (saved.spawns) state.world.spawns = cloneNested(saved.spawns);
      if (saved.reconPoints) state.world.reconPoints = cloneNested(saved.reconPoints);
      if (saved.navGraph) state.world.navGraph = cloneNested(saved.navGraph);
      if (!Array.isArray(state.world.navGraph.nodes)) state.world.navGraph.nodes = [];
      state.roadWidth = clamp(Number(saved.roadWidth) || state.roadWidth, 48, 132);
      state.selectedRoad = clamp(Number(saved.selectedRoad) || 0, 0, state.roads.length - 1);
      state.selectedObstacle = saved.selectedObstacle === null ? null : clamp(Number(saved.selectedObstacle) || 0, 0, state.world.obstacles.length - 1);
      state.editMode = ["road", "obstacle", "layout"].includes(saved.editMode) ? saved.editMode : "road";
      state.selectedPoint = null;
      state.selectedItems = new Set();
      setStatus("임시 저장본을 불러왔습니다.");
    } catch (error) {
      setStatus("임시 저장본을 읽을 수 없어 무시했습니다.");
    }
  }

  function bindControls() {
    window.addEventListener("resize", resize);
    state.canvas.addEventListener("pointerdown", onPointerDown);
    state.canvas.addEventListener("pointermove", onPointerMove);
    state.canvas.addEventListener("pointerup", onPointerUp);
    state.canvas.addEventListener("pointercancel", onPointerUp);
    state.canvas.addEventListener("wheel", onWheel, { passive: false });
    state.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    window.addEventListener("keydown", onKeyDown);

    state.controls.modeButtons.forEach((button) => {
      button.addEventListener("click", () => setEditMode(button.dataset.mode));
    });

    state.controls.roadSelect.addEventListener("change", () => {
      state.selectedRoad = Number(state.controls.roadSelect.value);
      state.selectedPoint = null;
      syncControls();
      updateStatusFromState();
    });

    state.controls.obstacleSelect.addEventListener("change", () => {
      state.selectedObstacle = Number(state.controls.obstacleSelect.value);
      syncControls();
      updateStatusFromState();
    });

    state.controls.obstacleKindSelect.addEventListener("change", () => {
      const obstacle = getSelectedObstacle();
      if (!obstacle) return;
      obstacle.kind = state.controls.obstacleKindSelect.value;
      markChanged();
    });

    state.controls.roadWidthRange.addEventListener("input", () => {
      setRoadWidth(Number(state.controls.roadWidthRange.value));
    });
    state.controls.roadWidthInput.addEventListener("change", () => {
      setRoadWidth(Number(state.controls.roadWidthInput.value));
    });
    state.controls.worldWidthInput?.addEventListener("change", () => {
      setWorldSize(Number(state.controls.worldWidthInput.value), state.world.height);
    });
    state.controls.worldHeightInput?.addEventListener("change", () => {
      setWorldSize(state.world.width, Number(state.controls.worldHeightInput.value));
    });
    state.controls.expandWorld10Button?.addEventListener("click", () => expandWorld(1.1));
    state.controls.expandWorld20Button?.addEventListener("click", () => expandWorld(1.2));
    state.controls.gridSizeInput.addEventListener("change", () => {
      state.gridSize = clamp(Number(state.controls.gridSizeInput.value) || 40, 10, 160);
      state.controls.gridSizeInput.value = state.gridSize;
    });
    state.controls.snapToggle.addEventListener("change", () => {
      state.snap = state.controls.snapToggle.checked;
    });

    state.controls.toolButtons.forEach((button) => {
      button.addEventListener("click", () => setTool(button.dataset.tool));
    });

    state.controls.deletePointButton.addEventListener("click", deleteSelectedPoint);
    state.controls.newRoadButton.addEventListener("click", createRoad);
    state.controls.deleteRoadButton.addEventListener("click", deleteSelectedRoad);
    state.controls.newObstacleButton.addEventListener("click", createObstacle);
    state.controls.deleteObstacleButton.addEventListener("click", deleteSelectedObstacle);
    state.controls.fitButton.addEventListener("click", fitMap);
    state.controls.focusConflictsButton.addEventListener("click", focusConflicts);
    state.controls.saveDraftButton.addEventListener("click", saveDraft);
    state.controls.resetDraftButton.addEventListener("click", resetDraft);
    state.controls.copyButton.addEventListener("click", copyExport);
    state.controls.downloadButton.addEventListener("click", downloadExport);
  }

  function resize() {
    state.dpr = window.devicePixelRatio || 1;
    state.canvas.width = Math.floor(window.innerWidth * state.dpr);
    state.canvas.height = Math.floor(window.innerHeight * state.dpr);
    state.canvas.style.width = `${window.innerWidth}px`;
    state.canvas.style.height = `${window.innerHeight}px`;
    state.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    if (!state.initializedCamera) fitMap();
  }

  function fitMap() {
    const panelReserve = window.innerWidth > 720 ? 430 : 24;
    const availableW = Math.max(320, window.innerWidth - panelReserve - 48);
    const availableH = Math.max(240, window.innerHeight - 64);
    const zoom = Math.min(availableW / state.world.width, availableH / state.world.height);
    state.camera.zoom = clamp(zoom, 0.12, 1.4);
    state.camera.x = -32 / state.camera.zoom;
    state.camera.y = -32 / state.camera.zoom;
    state.initializedCamera = true;
  }

  function syncControls() {
    syncRoadControls();
    syncObstacleControls();
    syncModeControls();
    state.controls.roadWidthRange.value = String(state.roadWidth);
    state.controls.roadWidthInput.value = String(state.roadWidth);
    if (state.controls.worldWidthInput) state.controls.worldWidthInput.value = String(state.world.width);
    if (state.controls.worldHeightInput) state.controls.worldHeightInput.value = String(state.world.height);
    state.controls.gridSizeInput.value = String(state.gridSize);
    state.controls.snapToggle.checked = state.snap;
    state.controls.toolButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.tool === state.tool);
    });
    state.controls.deleteRoadButton.disabled = state.roads.length <= 1;
    state.controls.deleteObstacleButton.disabled = state.selectedObstacle === null;
  }

  function syncRoadControls() {
    const select = state.controls.roadSelect;
    select.textContent = "";
    state.roads.forEach((road, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `도로 ${index + 1} (${road.length}점)`;
      select.appendChild(option);
    });
    state.selectedRoad = clamp(state.selectedRoad, 0, Math.max(0, state.roads.length - 1));
    select.value = String(state.selectedRoad);
  }

  function syncObstacleControls() {
    const select = state.controls.obstacleSelect;
    select.textContent = "";
    state.world.obstacles.forEach((obstacle, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${obstacleKindLabel(obstacle.kind)} ${index + 1}`;
      select.appendChild(option);
    });
    if (!state.world.obstacles.length) {
      state.selectedObstacle = null;
    } else if (state.selectedObstacle === null) {
      state.selectedObstacle = 0;
    } else {
      state.selectedObstacle = clamp(state.selectedObstacle, 0, state.world.obstacles.length - 1);
    }
    if (state.selectedObstacle !== null) select.value = String(state.selectedObstacle);
    const obstacle = getSelectedObstacle();
    state.controls.obstacleKindSelect.value = obstacle?.kind || "building";
  }

  function syncModeControls() {
    state.controls.modeButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === state.editMode);
    });
    state.controls.modePanels.forEach((panel) => {
      panel.classList.toggle("hidden", panel.dataset.panel !== state.editMode);
    });
  }

  function setEditMode(mode) {
    state.editMode = ["road", "obstacle", "layout"].includes(mode) ? mode : "road";
    state.dragging = null;
    state.hoveredPoint = null;
    state.hoveredObstacle = null;
    state.hoveredHandle = null;
    state.hoveredLayoutItem = null;
    state.selectionBox = null;
    state.selectedItems = new Set();
    syncControls();
    updateStatusFromState();
  }

  function setRoadWidth(value) {
    state.roadWidth = clamp(Math.round(value || 84), 48, 132);
    state.controls.roadWidthRange.value = String(state.roadWidth);
    state.controls.roadWidthInput.value = String(state.roadWidth);
    markChanged();
  }

  function setWorldSize(width, height) {
    state.world.width = clamp(Math.round(width || state.world.width), 1200, 9000);
    state.world.height = clamp(Math.round(height || state.world.height), 1200, 7000);
    clampAllLayoutToWorld();
    fitMap();
    markChanged();
  }

  function expandWorld(factor) {
    setWorldSize(state.world.width * factor, state.world.height * factor);
    setStatus(`맵 크기를 ${Math.round((factor - 1) * 100)}% 확장했습니다.`);
  }

  function setTool(tool) {
    state.tool = tool;
    syncControls();
    setStatus(tool === "move" ? "점을 드래그하세요. 빈 공간 드래그로 화면을 이동합니다." : tool === "add" ? "도로 구간을 클릭하면 점을 추가합니다." : "점을 클릭하면 삭제합니다.");
  }

  function onPointerDown(event) {
    state.canvas.focus();
    const world = screenToWorld(event.clientX, event.clientY);

    if (event.button === 1 || event.button === 2) {
      startPan(event);
      return;
    }

    if (state.editMode === "layout") {
      handleLayoutPointerDown(event, world);
    } else if (state.editMode === "obstacle") {
      handleObstaclePointerDown(event, world);
    } else {
      handleRoadPointerDown(event, world);
    }
  }

  function handleRoadPointerDown(event, world) {
    const pointHit = findPoint(world.x, world.y);

    if (state.tool === "delete") {
      if (pointHit) {
        state.selectedRoad = pointHit.roadIndex;
        state.selectedPoint = pointHit.pointIndex;
        deleteSelectedPoint();
      }
      return;
    }

    if (state.tool === "add") {
      const segment = findSegment(world.x, world.y);
      if (segment) {
        const point = snapPoint(world);
        state.selectedRoad = segment.roadIndex;
        state.roads[segment.roadIndex].splice(segment.insertIndex, 0, point);
        state.selectedPoint = segment.insertIndex;
        markChanged();
      }
      return;
    }

    if (pointHit) {
      state.selectedRoad = pointHit.roadIndex;
      state.selectedPoint = pointHit.pointIndex;
      selectSingleItem(roadPointKey(pointHit.roadIndex, pointHit.pointIndex), event.shiftKey);
      startSelectionMove(event, world);
      state.canvas.setPointerCapture(event.pointerId);
      syncControls();
      return;
    }

    const segment = findSegment(world.x, world.y);
    if (segment) {
      state.selectedRoad = segment.roadIndex;
      state.selectedPoint = null;
      syncControls();
      updateStatusFromState();
      return;
    }

    startSelectionBox(event, world);
  }

  function handleObstaclePointerDown(event, world) {
    const handle = selectedObstacleCount() <= 1 ? findObstacleHandle(world.x, world.y) : null;
    if (handle) {
      state.dragging = {
        type: "obstacle-resize",
        obstacleIndex: state.selectedObstacle,
        handle: handle.name,
        original: { ...getSelectedObstacle() }
      };
      state.canvas.setPointerCapture(event.pointerId);
      return;
    }

    const obstacleIndex = findObstacle(world.x, world.y);
    if (obstacleIndex !== null) {
      state.selectedObstacle = obstacleIndex;
      selectSingleItem(obstacleKey(obstacleIndex), event.shiftKey);
      startSelectionMove(event, world);
      state.canvas.setPointerCapture(event.pointerId);
      syncControls();
      updateStatusFromState();
      return;
    }

    startSelectionBox(event, world);
  }

  function handleLayoutPointerDown(event, world) {
    const item = findLayoutItem(world.x, world.y);
    if (item) {
      selectSingleItem(item.key, event.shiftKey);
      startSelectionMove(event, world);
      state.canvas.setPointerCapture(event.pointerId);
      updateStatusFromState();
      return;
    }

    startSelectionBox(event, world);
  }

  function startPan(event) {
    state.dragging = {
      type: "pan",
      startX: event.clientX,
      startY: event.clientY,
      cameraX: state.camera.x,
      cameraY: state.camera.y
    };
    state.canvas.setPointerCapture(event.pointerId);
  }

  function startSelectionBox(event, world) {
    state.dragging = {
      type: "box-select",
      startWorld: { ...world },
      currentWorld: { ...world }
    };
    state.selectionBox = {
      x1: world.x,
      y1: world.y,
      x2: world.x,
      y2: world.y
    };
    state.canvas.setPointerCapture(event.pointerId);
  }

  function updateSelectionBox(world) {
    if (!state.selectionBox) return;
    state.selectionBox.x2 = world.x;
    state.selectionBox.y2 = world.y;
  }

  function startSelectionMove(event, world) {
    state.dragging = {
      type: "selection-move",
      startWorld: { ...world },
      originals: captureSelectedOriginals()
    };
  }

  function onPointerMove(event) {
    const world = screenToWorld(event.clientX, event.clientY);

    if (state.dragging?.type === "pan") {
      state.camera.x = state.dragging.cameraX - (event.clientX - state.dragging.startX) / state.camera.zoom;
      state.camera.y = state.dragging.cameraY - (event.clientY - state.dragging.startY) / state.camera.zoom;
      return;
    }

    if (state.dragging?.type === "box-select") {
      updateSelectionBox(world);
      return;
    }

    if (state.dragging?.type === "selection-move") {
      moveSelectedItems(world);
      return;
    }

    if (state.dragging?.type === "point") {
      dragRoadPoint(world);
      return;
    }

    if (state.dragging?.type === "obstacle-move") {
      moveObstacle(world);
      return;
    }

    if (state.dragging?.type === "obstacle-resize") {
      resizeObstacle(world);
      return;
    }

    if (state.editMode === "obstacle") {
      state.hoveredHandle = findObstacleHandle(world.x, world.y);
      state.hoveredObstacle = findObstacle(world.x, world.y);
      state.hoveredPoint = null;
      state.hoveredLayoutItem = null;
    } else if (state.editMode === "layout") {
      state.hoveredLayoutItem = findLayoutItem(world.x, world.y);
      state.hoveredPoint = null;
      state.hoveredObstacle = null;
      state.hoveredHandle = null;
    } else {
      state.hoveredPoint = findPoint(world.x, world.y);
      state.hoveredObstacle = null;
      state.hoveredHandle = null;
      state.hoveredLayoutItem = null;
    }
  }

  function onPointerUp(event) {
    if (state.dragging?.type === "box-select") {
      finishSelectionBox(event.shiftKey);
    }
    if (state.dragging?.type === "selection-move") {
      commitSelectedRoadConnections();
      markChanged();
    }
    if (state.dragging?.type === "point") {
      commitRoadConnection(state.dragging.roadIndex, state.dragging.pointIndex);
      markChanged();
    }
    if (state.dragging?.type === "obstacle-move" || state.dragging?.type === "obstacle-resize") markChanged();
    state.dragging = null;
    if (state.canvas.hasPointerCapture?.(event.pointerId)) {
      state.canvas.releasePointerCapture(event.pointerId);
    }
  }

  function onWheel(event) {
    event.preventDefault();
    const before = screenToWorld(event.clientX, event.clientY);
    const scale = event.deltaY < 0 ? 1.12 : 0.88;
    state.camera.zoom = clamp(state.camera.zoom * scale, 0.12, 1.6);
    const after = screenToWorld(event.clientX, event.clientY);
    state.camera.x += before.x - after.x;
    state.camera.y += before.y - after.y;
  }

  function onKeyDown(event) {
    if (document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT") return;
    if (event.key === "Delete" || event.key === "Backspace") {
      if (state.editMode === "layout") {
        state.selectedItems.clear();
        updateStatusFromState();
        return;
      }
      if (state.editMode === "obstacle") deleteSelectedObstacle();
      else deleteSelectedPoint();
    }
    if (event.key === "Escape") {
      state.selectedPoint = null;
      state.selectedItems.clear();
      state.selectionBox = null;
      state.dragging = null;
      updateStatusFromState();
    }
  }

  function selectSingleItem(key, additive = false) {
    if (additive) {
      if (state.selectedItems.has(key)) state.selectedItems.delete(key);
      else state.selectedItems.add(key);
    } else if (!state.selectedItems.has(key)) {
      state.selectedItems = new Set([key]);
    } else {
      const promoted = new Set([key]);
      for (const existing of state.selectedItems) {
        if (existing !== key) promoted.add(existing);
      }
      state.selectedItems = promoted;
    }

    updatePrimarySelectionFromSet();
  }

  function finishSelectionBox(additive = false) {
    const rect = normalizedSelectionBox();
    state.selectionBox = null;
    if (!rect || rect.w < 8 / state.camera.zoom || rect.h < 8 / state.camera.zoom) return;

    const hits = selectableItemsForMode().filter((item) => itemIntersectsRect(item, rect));
    if (!additive) state.selectedItems = new Set();
    for (const item of hits) state.selectedItems.add(item.key);
    updatePrimarySelectionFromSet();
    updateStatusFromState();
  }

  function captureSelectedOriginals() {
    const originals = new Map();
    for (const key of state.selectedItems) {
      const item = getSelectableItemByKey(key);
      if (!item) continue;
      originals.set(key, { ...item });
    }
    return originals;
  }

  function boundedSelectionDelta(dx, dy, originals) {
    let minDx = -Infinity;
    let maxDx = Infinity;
    let minDy = -Infinity;
    let maxDy = Infinity;

    for (const [key, original] of originals) {
      const bounds = movementBoundsForItem(key, original);
      if (!bounds) continue;
      minDx = Math.max(minDx, bounds.minX - original.x);
      maxDx = Math.min(maxDx, bounds.maxX - original.x);
      minDy = Math.max(minDy, bounds.minY - original.y);
      maxDy = Math.min(maxDy, bounds.maxY - original.y);
    }

    return {
      x: clamp(dx, minDx, maxDx),
      y: clamp(dy, minDy, maxDy)
    };
  }

  function movementBoundsForItem(key, original) {
    if (key.startsWith("obstacle:")) {
      return {
        minX: 0,
        minY: 0,
        maxX: Math.max(0, state.world.width - original.w),
        maxY: Math.max(0, state.world.height - original.h)
      };
    }

    return {
      minX: 0,
      minY: 0,
      maxX: state.world.width,
      maxY: state.world.height
    };
  }

  function moveSelectedItems(world) {
    const delta = boundedSelectionDelta(
      snapDelta(world.x - state.dragging.startWorld.x),
      snapDelta(world.y - state.dragging.startWorld.y),
      state.dragging.originals
    );
    const dx = delta.x;
    const dy = delta.y;

    for (const [key, original] of state.dragging.originals) {
      if (key.startsWith("road:")) {
        const [, roadIndex, pointIndex] = key.split(":").map(Number);
        const point = state.roads[roadIndex]?.[pointIndex];
        if (!point) continue;
        point.x = clamp(Math.round(original.x + dx), 0, state.world.width);
        point.y = clamp(Math.round(original.y + dy), 0, state.world.height);
        continue;
      }

      if (key.startsWith("obstacle:")) {
        const index = Number(key.split(":")[1]);
        const obstacle = state.world.obstacles[index];
        if (!obstacle) continue;
        obstacle.x = clamp(Math.round(original.x + dx), 0, Math.max(0, state.world.width - obstacle.w));
        obstacle.y = clamp(Math.round(original.y + dy), 0, Math.max(0, state.world.height - obstacle.h));
        continue;
      }

      setLayoutItemPosition(key, original.x + dx, original.y + dy);
    }

    computeLayoutState();
    updateExport();
  }

  function commitSelectedRoadConnections() {
    for (const key of state.selectedItems) {
      if (!key.startsWith("road:")) continue;
      const [, roadIndex, pointIndex] = key.split(":").map(Number);
      commitRoadConnection(roadIndex, pointIndex);
    }
  }

  function selectableItemsForMode() {
    if (state.editMode === "obstacle") {
      return state.world.obstacles.map((obstacle, index) => ({
        key: obstacleKey(index),
        type: "obstacle",
        x: obstacle.x,
        y: obstacle.y,
        w: obstacle.w,
        h: obstacle.h
      }));
    }

    if (state.editMode === "layout") return getLayoutItems();

    const items = [];
    state.roads.forEach((road, roadIndex) => {
      road.forEach((point, pointIndex) => {
        items.push({
          key: roadPointKey(roadIndex, pointIndex),
          type: "road",
          x: point.x,
          y: point.y,
          r: 20 / state.camera.zoom
        });
      });
    });
    return items;
  }

  function getSelectableItemByKey(key) {
    if (key.startsWith("road:")) {
      const [, roadIndex, pointIndex] = key.split(":").map(Number);
      const point = state.roads[roadIndex]?.[pointIndex];
      return point ? { key, x: point.x, y: point.y } : null;
    }
    if (key.startsWith("obstacle:")) {
      const index = Number(key.split(":")[1]);
      const obstacle = state.world.obstacles[index];
      return obstacle ? { key, x: obstacle.x, y: obstacle.y, w: obstacle.w, h: obstacle.h } : null;
    }
    return getLayoutItems().find((item) => item.key === key) || null;
  }

  function itemIntersectsRect(item, rect) {
    if (item.type === "obstacle") {
      return rectIntersectsRect(rect, item);
    }
    return item.x >= rect.x && item.x <= rect.x + rect.w && item.y >= rect.y && item.y <= rect.y + rect.h;
  }

  function updatePrimarySelectionFromSet() {
    const first = state.selectedItems.values().next().value;
    if (!first) {
      state.selectedPoint = null;
      return;
    }
    const roadMatch = first.match(/^road:(\d+):(\d+)$/);
    if (roadMatch) {
      state.selectedRoad = Number(roadMatch[1]);
      state.selectedPoint = Number(roadMatch[2]);
    }
    const obstacleMatch = first.match(/^obstacle:(\d+)$/);
    if (obstacleMatch) state.selectedObstacle = Number(obstacleMatch[1]);
  }

  function normalizedSelectionBox() {
    if (!state.selectionBox) return null;
    const x = Math.min(state.selectionBox.x1, state.selectionBox.x2);
    const y = Math.min(state.selectionBox.y1, state.selectionBox.y2);
    return {
      x,
      y,
      w: Math.abs(state.selectionBox.x2 - state.selectionBox.x1),
      h: Math.abs(state.selectionBox.y2 - state.selectionBox.y1)
    };
  }

  function roadPointKey(roadIndex, pointIndex) {
    return `road:${roadIndex}:${pointIndex}`;
  }

  function obstacleKey(index) {
    return `obstacle:${index}`;
  }

  function snapDelta(value) {
    if (!state.snap) return value;
    return Math.round(value / state.gridSize) * state.gridSize;
  }

  function dragRoadPoint(world) {
    const point = state.roads[state.dragging.roadIndex][state.dragging.pointIndex];
    const snapped = snapEditableRoadPoint(state.dragging.roadIndex, state.dragging.pointIndex, world);
    point.x = clamp(snapped.x, 0, state.world.width);
    point.y = clamp(snapped.y, 0, state.world.height);
    state.selectedRoad = state.dragging.roadIndex;
    state.selectedPoint = state.dragging.pointIndex;
    markChanged(false);
  }

  function moveObstacle(world) {
    const obstacle = state.world.obstacles[state.dragging.obstacleIndex];
    let x = world.x - state.dragging.offsetX;
    let y = world.y - state.dragging.offsetY;
    if (state.snap) {
      x = Math.round(x / state.gridSize) * state.gridSize;
      y = Math.round(y / state.gridSize) * state.gridSize;
    }
    obstacle.x = clamp(Math.round(x), 0, state.world.width - obstacle.w);
    obstacle.y = clamp(Math.round(y), 0, state.world.height - obstacle.h);
    state.selectedObstacle = state.dragging.obstacleIndex;
    markChanged(false);
  }

  function resizeObstacle(world) {
    const obstacle = state.world.obstacles[state.dragging.obstacleIndex];
    const original = state.dragging.original;
    const point = snapPoint(world);
    const minSize = 44;
    let left = original.x;
    let top = original.y;
    let right = original.x + original.w;
    let bottom = original.y + original.h;

    if (state.dragging.handle.includes("w")) left = clamp(point.x, 0, right - minSize);
    if (state.dragging.handle.includes("e")) right = clamp(point.x, left + minSize, state.world.width);
    if (state.dragging.handle.includes("n")) top = clamp(point.y, 0, bottom - minSize);
    if (state.dragging.handle.includes("s")) bottom = clamp(point.y, top + minSize, state.world.height);

    obstacle.x = Math.round(left);
    obstacle.y = Math.round(top);
    obstacle.w = Math.round(right - left);
    obstacle.h = Math.round(bottom - top);
    state.selectedObstacle = state.dragging.obstacleIndex;
    markChanged(false);
  }

  function createRoad() {
    const center = screenToWorld(window.innerWidth * 0.42, window.innerHeight * 0.52);
    const start = snapPoint({ x: center.x - 120, y: center.y });
    const end = snapRoadConnection(snapPoint({ x: center.x + 120, y: center.y }), state.roads.length, 1);
    state.roads.push([start, end]);
    state.selectedRoad = state.roads.length - 1;
    state.selectedPoint = 0;
    state.editMode = "road";
    commitRoadConnection(state.selectedRoad, 1);
    markChanged();
    syncControls();
  }

  function deleteSelectedRoad() {
    if (state.roads.length <= 1) return;
    state.roads.splice(state.selectedRoad, 1);
    state.selectedRoad = clamp(state.selectedRoad, 0, state.roads.length - 1);
    state.selectedPoint = null;
    markChanged();
    syncControls();
  }

  function deleteSelectedPoint() {
    if (state.selectedPoint === null) return;
    const road = state.roads[state.selectedRoad];
    if (!road || road.length <= 2) {
      setStatus("도로는 최소 2개의 점이 필요합니다.");
      return;
    }
    road.splice(state.selectedPoint, 1);
    state.selectedPoint = null;
    markChanged();
    syncControls();
  }

  function createObstacle() {
    const center = screenToWorld(window.innerWidth * 0.42, window.innerHeight * 0.52);
    const topLeft = snapPoint({ x: center.x - 120, y: center.y - 70 });
    state.world.obstacles.push({
      x: clamp(topLeft.x, 0, state.world.width - 240),
      y: clamp(topLeft.y, 0, state.world.height - 140),
      w: 240,
      h: 140,
      kind: "building"
    });
    state.selectedObstacle = state.world.obstacles.length - 1;
    state.editMode = "obstacle";
    markChanged();
    syncControls();
  }

  function deleteSelectedObstacle() {
    const indexes = selectedObstacleIndexes();
    if (!indexes.length) return;
    indexes.sort((a, b) => b - a);
    for (const index of indexes) state.world.obstacles.splice(index, 1);
    state.selectedItems.clear();
    state.selectedObstacle = state.world.obstacles.length ? clamp(Math.min(...indexes), 0, state.world.obstacles.length - 1) : null;
    markChanged();
    syncControls();
  }

  function saveDraft() {
    localStorage.setItem(storageKey, JSON.stringify(exportPayload()));
    setStatus("이 브라우저에 임시 저장했습니다.");
  }

  function resetDraft() {
    localStorage.removeItem(storageKey);
    loadBaseMap();
    state.selectedRoad = 0;
    state.selectedObstacle = 0;
    state.selectedPoint = null;
    state.dirty = false;
    syncControls();
    computeLayoutState();
    updateExport();
    setStatus("map01.js 기준으로 초기화했습니다.");
  }

  async function copyExport() {
    const text = generateExport();
    state.controls.exportOutput.value = text;
    try {
      await navigator.clipboard.writeText(text);
      setStatus("내보내기 JS를 복사했습니다.");
    } catch (error) {
      state.controls.exportOutput.focus();
      state.controls.exportOutput.select();
      setStatus("텍스트를 선택해서 직접 복사하세요.");
    }
  }

  function downloadExport() {
    const blob = new Blob([generateExport()], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "map-layout-override.js";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    setStatus("내보내기 JS를 다운로드했습니다.");
  }

  function focusConflicts() {
    if (!state.conflicts.length) {
      fitMap();
      setStatus("도로 충돌이 없습니다.");
      return;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const conflict of state.conflicts) {
      const road = state.roads[conflict.roadIndex];
      const a = road[conflict.segmentIndex - 1];
      const b = road[conflict.segmentIndex];
      const obstacle = state.world.obstacles[conflict.obstacleIndex];
      minX = Math.min(minX, a.x, b.x, obstacle.x);
      minY = Math.min(minY, a.y, b.y, obstacle.y);
      maxX = Math.max(maxX, a.x, b.x, obstacle.x + obstacle.w);
      maxY = Math.max(maxY, a.y, b.y, obstacle.y + obstacle.h);
    }

    const padding = 360;
    const width = Math.max(300, maxX - minX + padding);
    const height = Math.max(220, maxY - minY + padding);
    state.camera.zoom = clamp(Math.min(window.innerWidth / width, window.innerHeight / height), 0.16, 1.1);
    state.camera.x = minX - padding * 0.5;
    state.camera.y = minY - padding * 0.5;
    setStatus(`충돌 구간 ${state.conflicts.length}개로 이동했습니다.`);
  }

  function markChanged(refreshExport = true) {
    state.dirty = true;
    computeLayoutState();
    if (refreshExport) updateExport();
    syncControls();
  }

  function computeLayoutState() {
    computeConflicts();
    computeRoadJunctions();
    updateStatusFromState();
  }

  function computeConflicts() {
    state.conflicts = [];
    state.conflictSegments = new Set();
    state.conflictObstacles = new Set();
    const halfWidth = state.roadWidth / 2;

    state.roads.forEach((road, roadIndex) => {
      for (let i = 1; i < road.length; i += 1) {
        const a = road[i - 1];
        const b = road[i];
        state.world.obstacles.forEach((obstacle, obstacleIndex) => {
          const expanded = expandRect(obstacle, halfWidth);
          if (!lineIntersectsRect(a.x, a.y, b.x, b.y, expanded)) return;
          state.conflicts.push({ roadIndex, segmentIndex: i, obstacleIndex });
          state.conflictSegments.add(`${roadIndex}:${i}`);
          state.conflictObstacles.add(obstacleIndex);
        });
      }
    });
  }

  function computeRoadJunctions() {
    state.joinedPoints = new Set();
    const seen = new Set();
    const junctions = collectRoadJunctions(state.roads);
    for (const junction of junctions) {
      const key = `${Math.round(junction.x / 4) * 4}:${Math.round(junction.y / 4) * 4}`;
      seen.add(key);
    }

    state.roads.forEach((road, roadIndex) => {
      [0, road.length - 1].forEach((pointIndex) => {
        const point = road[pointIndex];
        const connection = findRoadConnection(point, roadIndex, pointIndex, 6);
        if (!connection) return;
        state.joinedPoints.add(`${roadIndex}:${pointIndex}`);
        const key = `${Math.round(point.x / 4) * 4}:${Math.round(point.y / 4) * 4}`;
        if (seen.has(key)) return;
        seen.add(key);
        junctions.push({ x: point.x, y: point.y });
      });
    });

    state.junctions = junctions;
  }

  function draw() {
    const ctx = state.ctx;
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    ctx.save();
    ctx.scale(state.camera.zoom, state.camera.zoom);
    ctx.translate(-state.camera.x, -state.camera.y);
    drawTerrain(ctx);
    drawGrid(ctx);
    drawSafeZones(ctx);
    drawRoads(ctx);
    drawRoadJunctions(ctx);
    drawObstacles(ctx);
    drawCapturePoints(ctx);
    drawNavNodes(ctx);
    if (state.editMode === "road") drawRoadHandles(ctx);
    if (state.editMode === "obstacle") drawObstacleHandles(ctx);
    drawLayoutItems(ctx);
    drawSelectionBox(ctx);
    ctx.restore();

    drawOverlay(ctx);
    requestAnimationFrame(draw);
  }

  function drawTerrain(ctx) {
    const gradient = ctx.createLinearGradient(0, 0, state.world.width, state.world.height);
    gradient.addColorStop(0, "#213922");
    gradient.addColorStop(0.5, "#263d26");
    gradient.addColorStop(1, "#1f3429");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, state.world.width, state.world.height);

    for (const patch of state.world.terrainPatches) {
      const g = ctx.createRadialGradient(patch.x, patch.y, 0, patch.x, patch.y, patch.r);
      g.addColorStop(0, patch.color || "rgba(80, 116, 95, 0.22)");
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(patch.x, patch.y, patch.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGrid(ctx) {
    const step = state.gridSize;
    const left = Math.max(0, Math.floor(state.camera.x / step) * step);
    const top = Math.max(0, Math.floor(state.camera.y / step) * step);
    const right = Math.min(state.world.width, state.camera.x + window.innerWidth / state.camera.zoom);
    const bottom = Math.min(state.world.height, state.camera.y + window.innerHeight / state.camera.zoom);

    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.strokeStyle = "#d9e5cf";
    ctx.lineWidth = 1 / state.camera.zoom;
    for (let x = left; x <= right; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
    }
    for (let y = top; y <= bottom; y += step) {
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSafeZones(ctx) {
    ctx.save();
    for (const zone of state.world.safeZones) {
      const color = zone.team === "red" ? "255, 109, 102" : "107, 188, 255";
      const g = ctx.createRadialGradient(zone.x, zone.y, 0, zone.x, zone.y, zone.radius);
      g.addColorStop(0, `rgba(${color}, 0.13)`);
      g.addColorStop(1, `rgba(${color}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRoads(ctx) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const roadBody = "#64614a";

    state.roads.forEach((road, roadIndex) => {
      if (road.length < 2) return;
      strokeRoadPath(ctx, road, "#50523d", state.roadWidth + 10);
    });
    state.roads.forEach((road, roadIndex) => {
      if (road.length < 2) return;
      strokeRoadPath(ctx, road, roadBody, state.roadWidth);
      if (state.editMode === "road" && roadIndex === state.selectedRoad) {
        strokeRoadPath(ctx, road, "rgba(107, 188, 255, 0.28)", state.roadWidth + 14);
      }
      drawRoadDashes(ctx, road);
    });
    drawRoadDashMasks(ctx, roadBody);
    state.roads.forEach((road, roadIndex) => {
      if (road.length < 2) return;
      drawConflictSegments(ctx, road, roadIndex);
      drawRoadLabel(ctx, road, roadIndex);
    });
    ctx.restore();
  }

  function strokeRoadPath(ctx, road, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(road[0].x, road[0].y);
    for (let i = 1; i < road.length; i += 1) ctx.lineTo(road[i].x, road[i].y);
    ctx.stroke();
  }

  function drawRoadDashes(ctx, road) {
    ctx.save();
    ctx.strokeStyle = "rgba(211, 197, 139, 0.32)";
    ctx.lineWidth = Math.max(5, state.roadWidth * 0.08);
    ctx.setLineDash([28, 36]);
    ctx.beginPath();
    ctx.moveTo(road[0].x, road[0].y);
    for (let i = 1; i < road.length; i += 1) ctx.lineTo(road[i].x, road[i].y);
    ctx.stroke();
    ctx.restore();
  }

  function drawRoadDashMasks(ctx, roadBody) {
    ctx.save();
    ctx.fillStyle = roadBody;
    for (const junction of state.junctions) {
      const radius = Math.max(24, state.roadWidth * 0.4);
      ctx.beginPath();
      ctx.arc(junction.x, junction.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawConflictSegments(ctx, road, roadIndex) {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 109, 102, 0.62)";
    ctx.lineWidth = state.roadWidth + 10;
    ctx.lineCap = "round";
    for (let i = 1; i < road.length; i += 1) {
      if (!state.conflictSegments.has(`${roadIndex}:${i}`)) continue;
      const a = road[i - 1];
      const b = road[i];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawRoadLabel(ctx, road, roadIndex) {
    const first = road[0];
    ctx.save();
    ctx.font = `${Math.max(42, 13 / state.camera.zoom)}px Inter, sans-serif`;
    ctx.fillStyle = roadIndex === state.selectedRoad ? "rgba(107, 188, 255, 0.9)" : "rgba(238, 243, 236, 0.58)";
    ctx.fillText(String(roadIndex + 1), first.x + 18, first.y - 18);
    ctx.restore();
  }

  function drawRoadJunctions(ctx) {
    ctx.save();
    for (const junction of state.junctions) {
      ctx.fillStyle = "rgba(126, 231, 135, 0.9)";
      ctx.strokeStyle = "rgba(6, 16, 10, 0.76)";
      ctx.lineWidth = 3 / state.camera.zoom;
      ctx.beginPath();
      ctx.arc(junction.x, junction.y, 12 / state.camera.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawObstacles(ctx) {
    state.world.obstacles.forEach((obstacle, index) => {
      const danger = state.conflictObstacles.has(index);
      const key = obstacleKey(index);
      const selected = state.editMode === "obstacle" && (index === state.selectedObstacle || state.selectedItems.has(key));
      const primarySelected = state.editMode === "obstacle" && index === state.selectedObstacle;
      const hovered = state.editMode === "obstacle" && index === state.hoveredObstacle;
      ctx.save();
      ctx.fillStyle = danger ? "rgba(255, 109, 102, 0.52)" : obstacleColor(obstacle.kind);
      ctx.strokeStyle = selected ? "rgba(107, 188, 255, 0.95)" : hovered ? "rgba(238, 243, 236, 0.5)" : danger ? "rgba(255, 210, 175, 0.85)" : "rgba(238, 243, 236, 0.12)";
      ctx.lineWidth = selected ? 5 / state.camera.zoom : danger ? 3 / state.camera.zoom : hovered ? 3 / state.camera.zoom : 1.5 / state.camera.zoom;
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
      ctx.strokeRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
      if (selected) {
        ctx.fillStyle = primarySelected ? "rgba(107, 188, 255, 0.16)" : "rgba(107, 188, 255, 0.09)";
        ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
      }
      if (danger) {
        ctx.strokeStyle = "rgba(255, 109, 102, 0.32)";
        ctx.lineWidth = 1 / state.camera.zoom;
        ctx.strokeRect(obstacle.x - state.roadWidth / 2, obstacle.y - state.roadWidth / 2, obstacle.w + state.roadWidth, obstacle.h + state.roadWidth);
      }
      ctx.restore();
    });
  }

  function drawObstacleHandles(ctx) {
    if (selectedObstacleCount() > 1) {
      drawSelectedObstacleGroupBounds(ctx);
      return;
    }

    const obstacle = getSelectedObstacle();
    if (!obstacle) return;

    ctx.save();
    for (const handle of obstacleHandles(obstacle)) {
      const hovered = state.hoveredHandle?.name === handle.name;
      ctx.fillStyle = hovered ? "#ffffff" : "#6bbcff";
      ctx.strokeStyle = "rgba(7, 11, 9, 0.78)";
      ctx.lineWidth = 3 / state.camera.zoom;
      ctx.beginPath();
      ctx.rect(handle.x - 8 / state.camera.zoom, handle.y - 8 / state.camera.zoom, 16 / state.camera.zoom, 16 / state.camera.zoom);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSelectedObstacleGroupBounds(ctx) {
    const rect = selectedObstacleBounds();
    if (!rect) return;

    ctx.save();
    ctx.strokeStyle = "rgba(107, 188, 255, 0.9)";
    ctx.lineWidth = 3 / state.camera.zoom;
    ctx.setLineDash([18 / state.camera.zoom, 12 / state.camera.zoom]);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = "rgba(107, 188, 255, 0.12)";
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }

  function obstacleColor(kind) {
    if (kind === "building") return "rgba(84, 96, 87, 0.9)";
    if (kind === "base-wall") return "rgba(92, 101, 94, 0.95)";
    return "rgba(103, 113, 104, 0.86)";
  }

  function drawCapturePoints(ctx) {
    ctx.save();
    for (const point of state.world.capturePoints) {
      ctx.fillStyle = "rgba(255, 209, 102, 0.85)";
      ctx.strokeStyle = "rgba(36, 24, 8, 0.45)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#111";
      ctx.font = "28px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(point.name, point.x, point.y + 1);
    }
    ctx.restore();
  }

  function drawNavNodes(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#dce9d7";
    for (const node of state.world.navGraph.nodes) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRoadHandles(ctx) {
    ctx.save();
    state.roads.forEach((road, roadIndex) => {
      road.forEach((point, pointIndex) => {
        const selected = roadIndex === state.selectedRoad && pointIndex === state.selectedPoint;
        const hovered = state.hoveredPoint?.roadIndex === roadIndex && state.hoveredPoint?.pointIndex === pointIndex;
        const joined = state.joinedPoints.has(`${roadIndex}:${pointIndex}`);
        const radius = selected ? 15 : hovered ? 13 : 10;
        ctx.fillStyle = selected ? "#ffffff" : joined ? "#7ee787" : roadIndex === state.selectedRoad ? "#6bbcff" : "#d6e0d0";
        ctx.strokeStyle = "rgba(7, 11, 9, 0.72)";
        ctx.lineWidth = 4 / state.camera.zoom;
        ctx.beginPath();
        ctx.arc(point.x, point.y, radius / state.camera.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
    });
    ctx.restore();
  }

  function drawLayoutItems(ctx) {
    if (state.editMode !== "layout") return;
    ctx.save();
    for (const item of getLayoutItems()) {
      const selected = state.selectedItems.has(item.key);
      const hovered = state.hoveredLayoutItem?.key === item.key;

      if (item.kind === "safe") {
        ctx.strokeStyle = hexToRgba(item.color, selected ? 0.72 : 0.38);
        ctx.lineWidth = selected ? 4 / state.camera.zoom : 2 / state.camera.zoom;
        ctx.beginPath();
        ctx.arc(item.x, item.y, item.zoneRadius || 120, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = selected ? "#ffffff" : item.color;
      ctx.strokeStyle = hovered || selected ? "rgba(7, 11, 9, 0.9)" : "rgba(7, 11, 9, 0.62)";
      ctx.lineWidth = selected ? 5 / state.camera.zoom : 3 / state.camera.zoom;
      ctx.beginPath();
      ctx.arc(item.x, item.y, item.r || 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = selected ? "#0b1110" : "rgba(238, 243, 236, 0.9)";
      ctx.font = `${Math.max(28, 12 / state.camera.zoom)}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const text = item.kind === "capture" ? item.label : item.kind === "safe" ? "기지" : item.kind === "exit" ? "출" : "";
      if (text) ctx.fillText(text, item.x, item.y);
    }
    ctx.restore();
  }

  function drawSelectionBox(ctx) {
    const rect = normalizedSelectionBox();
    if (!rect) return;
    ctx.save();
    ctx.fillStyle = "rgba(107, 188, 255, 0.12)";
    ctx.strokeStyle = "rgba(107, 188, 255, 0.86)";
    ctx.lineWidth = 2 / state.camera.zoom;
    ctx.setLineDash([10 / state.camera.zoom, 8 / state.camera.zoom]);
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }

  function drawOverlay(ctx) {
    ctx.save();
    ctx.fillStyle = "rgba(7, 11, 9, 0.68)";
    ctx.strokeStyle = "rgba(238, 243, 236, 0.12)";
    ctx.lineWidth = 1;
    roundedRect(ctx, 14, 14, 380, 76, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#eef3ec";
    ctx.font = "13px Inter, sans-serif";
    ctx.fillText(`대상: ${modeLabel(state.editMode)} / 도구: ${toolLabel(state.tool)}`, 28, 40);
    ctx.fillStyle = state.conflicts.length ? "#ffb4ad" : "#a9d9ad";
    ctx.fillText(`충돌: ${state.conflicts.length}  접합: ${state.junctions.length}`, 28, 64);
    ctx.fillStyle = "#aeb9ad";
    const hint = state.editMode === "layout"
      ? "거점/기지/스폰 드래그, 빈 공간 박스 선택"
      : state.editMode === "obstacle"
        ? "빈 공간 박스 선택, 선택된 건물/벽 드래그"
        : "도로 끝점을 가까이 놓으면 자동 접합";
    ctx.fillText(hint, 190, 40);
    ctx.fillText("Shift 추가 선택, 우클릭 드래그 화면 이동", 190, 64);
    ctx.restore();
  }

  function findPoint(x, y) {
    const threshold = 17 / state.camera.zoom;
    let best = null;
    let bestDist = Infinity;
    state.roads.forEach((road, roadIndex) => {
      road.forEach((point, pointIndex) => {
        const distance = distXY(x, y, point.x, point.y);
        if (distance < threshold && distance < bestDist) {
          best = { roadIndex, pointIndex };
          bestDist = distance;
        }
      });
    });
    return best;
  }

  function findSegment(x, y) {
    const threshold = Math.max(18 / state.camera.zoom, state.roadWidth * 0.5);
    let best = null;
    let bestDist = Infinity;
    state.roads.forEach((road, roadIndex) => {
      for (let i = 1; i < road.length; i += 1) {
        const a = road[i - 1];
        const b = road[i];
        const distance = segmentDistanceToPoint(a.x, a.y, b.x, b.y, x, y);
        if (distance < threshold && distance < bestDist) {
          best = { roadIndex, insertIndex: i };
          bestDist = distance;
        }
      }
    });
    return best;
  }

  function findObstacle(x, y) {
    for (let i = state.world.obstacles.length - 1; i >= 0; i -= 1) {
      if (pointInRect(x, y, state.world.obstacles[i])) return i;
    }
    return null;
  }

  function findObstacleHandle(x, y) {
    const obstacle = getSelectedObstacle();
    if (!obstacle) return null;
    const threshold = 15 / state.camera.zoom;
    let best = null;
    let bestDist = Infinity;
    for (const handle of obstacleHandles(obstacle)) {
      const distance = distXY(x, y, handle.x, handle.y);
      if (distance < threshold && distance < bestDist) {
        best = handle;
        bestDist = distance;
      }
    }
    return best;
  }

  function findLayoutItem(x, y) {
    let best = null;
    let bestDistance = Infinity;
    for (const item of getLayoutItems()) {
      const threshold = item.r || 24;
      const distance = distXY(x, y, item.x, item.y);
      if (distance <= threshold && distance < bestDistance) {
        best = item;
        bestDistance = distance;
      }
    }
    return best;
  }

  function getLayoutItems() {
    const items = [];

    state.world.capturePoints.forEach((point, index) => {
      items.push({
        key: `capture:${index}`,
        type: "layout",
        kind: "capture",
        label: point.name || `거점 ${index + 1}`,
        x: point.x,
        y: point.y,
        r: 34 / state.camera.zoom,
        color: "#ffd166"
      });
    });

    state.world.safeZones.forEach((zone, index) => {
      items.push({
        key: `safe:${index}`,
        type: "layout",
        kind: "safe",
        label: zone.name || `기지 ${index + 1}`,
        x: zone.x,
        y: zone.y,
        r: 42 / state.camera.zoom,
        zoneRadius: zone.radius,
        color: zone.team === "red" ? "#ff6d66" : "#6bbcff"
      });
    });

    for (const [team, point] of Object.entries(state.world.baseExitPoints || {})) {
      items.push({
        key: `exit:${team}`,
        type: "layout",
        kind: "exit",
        label: `${team} 출구`,
        x: point.x,
        y: point.y,
        r: 26 / state.camera.zoom,
        color: team === "red" ? "#ff9a92" : "#9fd3ff"
      });
    }

    addSpawnItems(items);
    return items;
  }

  function addSpawnItems(items) {
    const spawns = state.world.spawns || {};
    if (spawns.player) {
      items.push({
        key: "spawn:player",
        type: "layout",
        kind: "spawn",
        label: "플레이어",
        x: spawns.player.x,
        y: spawns.player.y,
        r: 22 / state.camera.zoom,
        color: "#89d27e"
      });
    }
    if (spawns.playerTank) {
      items.push({
        key: "spawn:playerTank",
        type: "layout",
        kind: "spawn",
        label: "플레이어 전차",
        x: spawns.playerTank.x,
        y: spawns.playerTank.y,
        r: 24 / state.camera.zoom,
        color: "#6bbcff"
      });
    }

    for (const [group, value] of Object.entries(spawns)) {
      if (!Array.isArray(value)) continue;
      value.forEach((spawn, index) => {
        items.push({
          key: `spawn:${group}:${index}`,
          type: "layout",
          kind: "spawn",
          label: spawn.callSign || `${group} ${index + 1}`,
          x: spawn.x,
          y: spawn.y,
          r: group.toLowerCase().includes("infantry") ? 14 / state.camera.zoom : 22 / state.camera.zoom,
          color: group.toLowerCase().includes("red") ? "#ff6d66" : "#6bbcff"
        });
      });
    }
  }

  function setLayoutItemPosition(key, x, y) {
    const nextX = clamp(Math.round(x), 0, state.world.width);
    const nextY = clamp(Math.round(y), 0, state.world.height);
    const parts = key.split(":");

    if (parts[0] === "capture") {
      const point = state.world.capturePoints[Number(parts[1])];
      if (point) {
        point.x = nextX;
        point.y = nextY;
        syncLinkedNavNode("capture", point, nextX, nextY);
      }
      return;
    }

    if (parts[0] === "safe") {
      const zone = state.world.safeZones[Number(parts[1])];
      if (zone) {
        zone.x = nextX;
        zone.y = nextY;
        syncLinkedNavNode("safe", zone, nextX, nextY);
      }
      return;
    }

    if (parts[0] === "exit") {
      const point = state.world.baseExitPoints?.[parts[1]];
      if (point) {
        point.x = nextX;
        point.y = nextY;
        syncLinkedNavNode("exit", { team: parts[1] }, nextX, nextY);
      }
      return;
    }

    if (parts[0] === "spawn") {
      const spawns = state.world.spawns || {};
      if (parts.length === 2) {
        const point = spawns[parts[1]];
        if (point) {
          point.x = nextX;
          point.y = nextY;
        }
        return;
      }
      const list = spawns[parts[1]];
      const point = Array.isArray(list) ? list[Number(parts[2])] : null;
      if (point) {
        point.x = nextX;
        point.y = nextY;
      }
    }
  }

  function syncLinkedNavNode(kind, source, x, y) {
    if (!state.world.navGraph?.nodes) return;
    let nodeId = null;

    if (kind === "capture") {
      nodeId = state.world.navGraph.objectiveNodes?.[source.name];
    } else if (kind === "safe") {
      nodeId = source.team === "blue" ? "blue_base" : source.team === "red" ? "red_base_core" : null;
    } else if (kind === "exit") {
      nodeId = source.team === "blue" ? "blue_gate_out" : source.team === "red" ? "red_gate_out" : null;
    }

    if (nodeId) setNavNodePosition(nodeId, x, y);
  }

  function setNavNodePosition(id, x, y) {
    const node = state.world.navGraph?.nodes?.find((item) => item.id === id);
    if (!node) return;
    node.x = clamp(Math.round(x), 0, state.world.width);
    node.y = clamp(Math.round(y), 0, state.world.height);
  }

  function obstacleHandles(obstacle) {
    const left = obstacle.x;
    const top = obstacle.y;
    const right = obstacle.x + obstacle.w;
    const bottom = obstacle.y + obstacle.h;
    const cx = obstacle.x + obstacle.w / 2;
    const cy = obstacle.y + obstacle.h / 2;
    return [
      { name: "nw", x: left, y: top },
      { name: "n", x: cx, y: top },
      { name: "ne", x: right, y: top },
      { name: "e", x: right, y: cy },
      { name: "se", x: right, y: bottom },
      { name: "s", x: cx, y: bottom },
      { name: "sw", x: left, y: bottom },
      { name: "w", x: left, y: cy }
    ];
  }

  function screenToWorld(x, y) {
    return {
      x: x / state.camera.zoom + state.camera.x,
      y: y / state.camera.zoom + state.camera.y
    };
  }

  function snapPoint(point) {
    if (!state.snap) return { x: Math.round(point.x), y: Math.round(point.y) };
    return {
      x: Math.round(point.x / state.gridSize) * state.gridSize,
      y: Math.round(point.y / state.gridSize) * state.gridSize
    };
  }

  function snapEditableRoadPoint(roadIndex, pointIndex, point) {
    const snapped = snapPoint(point);
    if (!isEndpoint(roadIndex, pointIndex)) return snapped;
    return snapRoadConnection(snapped, roadIndex, pointIndex);
  }

  function snapRoadConnection(point, sourceRoadIndex, sourcePointIndex) {
    const connection = findRoadConnection(point, sourceRoadIndex, sourcePointIndex, Math.max(34, state.roadWidth * 0.42));
    return connection ? connection.point : point;
  }

  function commitRoadConnection(sourceRoadIndex, sourcePointIndex) {
    if (!isEndpoint(sourceRoadIndex, sourcePointIndex)) return;
    const sourceRoad = state.roads[sourceRoadIndex];
    const sourcePoint = sourceRoad?.[sourcePointIndex];
    if (!sourcePoint) return;

    const connection = findRoadConnection(sourcePoint, sourceRoadIndex, sourcePointIndex, Math.max(10, state.roadWidth * 0.46));
    if (!connection) return;

    sourcePoint.x = connection.point.x;
    sourcePoint.y = connection.point.y;

    if (connection.type !== "segment") return;
    const targetRoad = state.roads[connection.roadIndex];
    const before = targetRoad[connection.segmentIndex - 1];
    const after = targetRoad[connection.segmentIndex];
    if (distXY(before.x, before.y, connection.point.x, connection.point.y) <= 2) return;
    if (distXY(after.x, after.y, connection.point.x, connection.point.y) <= 2) return;

    targetRoad.splice(connection.segmentIndex, 0, {
      x: connection.point.x,
      y: connection.point.y
    });
  }

  function findRoadConnection(point, sourceRoadIndex, sourcePointIndex, threshold) {
    let best = null;
    let bestDistance = threshold;

    state.roads.forEach((road, roadIndex) => {
      if (roadIndex === sourceRoadIndex) return;
      road.forEach((other, pointIndex) => {
        const distance = distXY(point.x, point.y, other.x, other.y);
        if (distance < bestDistance) {
          best = { point: { x: other.x, y: other.y }, roadIndex, pointIndex, type: "point" };
          bestDistance = distance;
        }
      });

      for (let i = 1; i < road.length; i += 1) {
        const a = road[i - 1];
        const b = road[i];
        const projected = closestPointOnSegment(a.x, a.y, b.x, b.y, point.x, point.y);
        if (projected.t <= 0.02 || projected.t >= 0.98) continue;
        if (projected.distance < bestDistance) {
          best = { point: { x: Math.round(projected.x), y: Math.round(projected.y) }, roadIndex, segmentIndex: i, type: "segment" };
          bestDistance = projected.distance;
        }
      }
    });

    return best;
  }

  function collectRoadJunctions(roads) {
    const junctions = [];
    const seen = new Set();
    const add = (point) => {
      const key = `${Math.round(point.x / 8) * 8}:${Math.round(point.y / 8) * 8}`;
      if (seen.has(key)) return;
      seen.add(key);
      junctions.push({ x: point.x, y: point.y });
    };

    for (let roadA = 0; roadA < roads.length; roadA += 1) {
      for (let segmentA = 1; segmentA < roads[roadA].length; segmentA += 1) {
        const a = roads[roadA][segmentA - 1];
        const b = roads[roadA][segmentA];
        for (let roadB = roadA + 1; roadB < roads.length; roadB += 1) {
          for (let segmentB = 1; segmentB < roads[roadB].length; segmentB += 1) {
            const c = roads[roadB][segmentB - 1];
            const d = roads[roadB][segmentB];
            const point = segmentIntersectionPoint(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y);
            if (point) add(point);
          }
        }
      }
    }

    return junctions;
  }

  function isEndpoint(roadIndex, pointIndex) {
    const road = state.roads[roadIndex];
    return pointIndex === 0 || pointIndex === road.length - 1;
  }

  function getSelectedObstacle() {
    if (state.selectedObstacle === null) return null;
    return state.world.obstacles[state.selectedObstacle] || null;
  }

  function selectedObstacleIndexes() {
    const indexes = new Set();
    for (const key of state.selectedItems) {
      const match = key.match(/^obstacle:(\d+)$/);
      if (!match) continue;
      const index = Number(match[1]);
      if (state.world.obstacles[index]) indexes.add(index);
    }
    if (!indexes.size && state.selectedObstacle !== null && state.world.obstacles[state.selectedObstacle]) {
      indexes.add(state.selectedObstacle);
    }
    return Array.from(indexes).sort((a, b) => a - b);
  }

  function selectedObstacleCount() {
    return selectedObstacleIndexes().length;
  }

  function selectedObstacleBounds() {
    const indexes = selectedObstacleIndexes();
    if (!indexes.length) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const index of indexes) {
      const obstacle = state.world.obstacles[index];
      minX = Math.min(minX, obstacle.x);
      minY = Math.min(minY, obstacle.y);
      maxX = Math.max(maxX, obstacle.x + obstacle.w);
      maxY = Math.max(maxY, obstacle.y + obstacle.h);
    }
    return {
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY
    };
  }

  function updateExport() {
    state.controls.exportOutput.value = generateExport();
  }

  function exportPayload() {
    return {
      width: Math.round(state.world.width),
      height: Math.round(state.world.height),
      roadWidth: state.roadWidth,
      selectedRoad: state.selectedRoad,
      selectedObstacle: state.selectedObstacle,
      editMode: state.editMode,
      roads: serializeMapValue(state.roads),
      obstacles: serializeMapValue(state.world.obstacles),
      capturePoints: serializeMapValue(state.world.capturePoints),
      safeZones: serializeMapValue(state.world.safeZones),
      baseExitPoints: serializeMapValue(state.world.baseExitPoints || {}),
      spawns: serializeMapValue(state.world.spawns || {}),
      reconPoints: serializeMapValue(state.world.reconPoints || {}),
      navGraph: serializeMapValue(state.world.navGraph || { nodes: [] })
    };
  }

  function generateExport() {
    const payload = exportPayload();
    const data = (value) => JSON.stringify(value, null, 2);
    return `"use strict";

(function applyIronLineMapLayout(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  if (!IronLine.map01) return;

  IronLine.map01.width = ${payload.width};
  IronLine.map01.height = ${payload.height};
  IronLine.map01.roadWidth = ${payload.roadWidth};
  IronLine.map01.roads = ${data(payload.roads)};
  IronLine.map01.obstacles = ${data(payload.obstacles)};
  IronLine.map01.capturePoints = ${data(payload.capturePoints)};
  IronLine.map01.safeZones = ${data(payload.safeZones)};
  IronLine.map01.baseExitPoints = ${data(payload.baseExitPoints)};
  IronLine.map01.spawns = ${data(payload.spawns)};
  IronLine.map01.reconPoints = ${data(payload.reconPoints)};
  IronLine.map01.navGraph = ${data(payload.navGraph)};
})(window);
`;
  }

  function updateStatusFromState() {
    if (state.editMode === "obstacle") {
      const selectedCount = selectedObstacleCount();
      const selected = selectedCount > 1
        ? `${selectedCount}개 선택`
        : state.selectedObstacle === null ? "선택 없음" : `${obstacleKindLabel(getSelectedObstacle()?.kind)} ${state.selectedObstacle + 1}`;
      const conflictText = state.conflicts.length
        ? `${state.conflicts.length}개 충돌. 건물/벽이나 도로를 움직여 해결하세요.`
        : "도로/장애물 충돌 없음.";
      setStatus(`건물/벽 편집, ${selected}. 빈 공간 드래그로 여러 개 선택 후 선택된 건물을 끌면 같이 이동합니다. ${conflictText}`);
      return;
    }

    if (state.editMode === "layout") {
      const selected = state.selectedItems.size ? `${state.selectedItems.size}개 선택` : "선택 없음";
      setStatus(`배치 편집, ${selected}. 거점/기지/출구/스폰을 드래그할 수 있습니다. 맵 ${state.world.width} x ${state.world.height}.`);
      return;
    }

    const selected = state.selectedPoint === null ? "선택 없음" : `${state.selectedPoint + 1}번 점`;
    const conflictText = state.conflicts.length
      ? `${state.conflicts.length}개 충돌 구간. 빨간 도로를 벽/건물에서 떨어뜨리세요.`
      : "도로/장애물 충돌 없음.";
    setStatus(`도로 ${state.selectedRoad + 1}, ${selected}. 폭 ${state.roadWidth}. 접합 ${state.junctions.length}. ${conflictText}`);
  }

  function modeLabel(mode) {
    if (mode === "obstacle") return "건물/벽";
    if (mode === "layout") return "배치";
    return "도로";
  }

  function toolLabel(tool) {
    if (tool === "add") return "점 추가";
    if (tool === "delete") return "삭제";
    return "이동";
  }

  function obstacleKindLabel(kind) {
    if (kind === "building") return "건물";
    if (kind === "base-wall") return "기지 벽";
    return "콘크리트";
  }

  function setStatus(message) {
    if (state.controls.statusText) state.controls.statusText.textContent = message;
  }

  function cloneRoads(roads) {
    return roads
      .map((road) => road.map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) })))
      .filter((road) => road.length >= 2);
  }

  function cloneRects(rects) {
    return rects.map((rect) => ({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.round(rect.w),
      h: Math.round(rect.h),
      kind: rect.kind || "concrete"
    }));
  }

  function cloneObjects(items) {
    return items.map((item) => ({ ...item }));
  }

  function cloneNested(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function serializeMapValue(value) {
    if (Array.isArray(value)) return value.map(serializeMapValue);
    if (!value || typeof value !== "object") return value;

    const roundedKeys = new Set(["x", "y", "w", "h", "r", "radius"]);
    const next = {};
    for (const [key, item] of Object.entries(value)) {
      if (roundedKeys.has(key) && Number.isFinite(Number(item))) {
        next[key] = Math.round(item);
      } else {
        next[key] = serializeMapValue(item);
      }
    }
    return next;
  }

  function clampAllLayoutToWorld() {
    for (const road of state.roads) {
      for (const point of road) clampPointLike(point);
    }

    for (const obstacle of state.world.obstacles) {
      obstacle.w = clamp(Math.round(obstacle.w), 44, state.world.width);
      obstacle.h = clamp(Math.round(obstacle.h), 44, state.world.height);
      obstacle.x = clamp(Math.round(obstacle.x), 0, Math.max(0, state.world.width - obstacle.w));
      obstacle.y = clamp(Math.round(obstacle.y), 0, Math.max(0, state.world.height - obstacle.h));
    }

    clampPointCollection(state.world.terrainPatches);
    clampPointCollection(state.world.capturePoints);
    clampPointCollection(state.world.safeZones);
    clampPointCollection(state.world.baseExitPoints);
    clampPointCollection(state.world.spawns);
    clampPointCollection(state.world.reconPoints);
    clampPointCollection(state.world.navGraph?.nodes || []);
  }

  function clampPointCollection(value) {
    if (Array.isArray(value)) {
      value.forEach(clampPointCollection);
      return;
    }
    if (!value || typeof value !== "object") return;

    clampPointLike(value);
    for (const child of Object.values(value)) clampPointCollection(child);
  }

  function clampPointLike(point) {
    if (!point || typeof point !== "object") return;
    if (Number.isFinite(Number(point.x))) point.x = clamp(Math.round(point.x), 0, state.world.width);
    if (Number.isFinite(Number(point.y))) point.y = clamp(Math.round(point.y), 0, state.world.height);
    if (Number.isFinite(Number(point.radius))) point.radius = Math.max(0, Math.round(point.radius));
    if (Number.isFinite(Number(point.r))) point.r = Math.max(0, Math.round(point.r));
  }

  function expandRect(rect, amount) {
    return {
      x: rect.x - amount,
      y: rect.y - amount,
      w: rect.w + amount * 2,
      h: rect.h + amount * 2
    };
  }

  function segmentDistanceToPoint(ax, ay, bx, by, px, py) {
    return closestPointOnSegment(ax, ay, bx, by, px, py).distance;
  }

  function closestPointOnSegment(ax, ay, bx, by, px, py) {
    const abx = bx - ax;
    const aby = by - ay;
    const lengthSq = abx * abx + aby * aby;
    if (lengthSq === 0) {
      return { x: ax, y: ay, t: 0, distance: distXY(ax, ay, px, py) };
    }
    const t = clamp(((px - ax) * abx + (py - ay) * aby) / lengthSq, 0, 1);
    const x = ax + abx * t;
    const y = ay + aby * t;
    return { x, y, t, distance: distXY(x, y, px, py) };
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function segmentIntersectionPoint(ax, ay, bx, by, cx, cy, dx, dy) {
    const rx = bx - ax;
    const ry = by - ay;
    const sx = dx - cx;
    const sy = dy - cy;
    const denominator = rx * sy - ry * sx;
    if (Math.abs(denominator) < 0.0001) return null;
    const qpx = cx - ax;
    const qpy = cy - ay;
    const t = (qpx * sy - qpy * sx) / denominator;
    const u = (qpx * ry - qpy * rx) / denominator;
    if (t < -0.001 || t > 1.001 || u < -0.001 || u > 1.001) return null;
    return {
      x: ax + rx * clamp(t, 0, 1),
      y: ay + ry * clamp(t, 0, 1)
    };
  }

  function fallbackLineIntersectsRect(x1, y1, x2, y2, rect) {
    if (pointInRect(x1, y1, rect) || pointInRect(x2, y2, rect)) return true;
    const left = rect.x;
    const right = rect.x + rect.w;
    const top = rect.y;
    const bottom = rect.y + rect.h;
    return (
      segmentIntersection(x1, y1, x2, y2, left, top, right, top) ||
      segmentIntersection(x1, y1, x2, y2, right, top, right, bottom) ||
      segmentIntersection(x1, y1, x2, y2, right, bottom, left, bottom) ||
      segmentIntersection(x1, y1, x2, y2, left, bottom, left, top)
    );
  }

  function pointInRect(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  function rectIntersectsRect(a, b) {
    return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
  }

  function hexToRgba(hex, alpha) {
    const value = String(hex || "").trim().replace("#", "");
    if (!/^[0-9a-fA-F]{6}$/.test(value)) return `rgba(255, 255, 255, ${alpha})`;
    const number = Number.parseInt(value, 16);
    const r = (number >> 16) & 255;
    const g = (number >> 8) & 255;
    const b = number & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function segmentIntersection(ax, ay, bx, by, cx, cy, dx, dy) {
    const rx = bx - ax;
    const ry = by - ay;
    const sx = dx - cx;
    const sy = dy - cy;
    const denominator = rx * sy - ry * sx;
    if (Math.abs(denominator) < 0.0001) return false;
    const qpx = cx - ax;
    const qpy = cy - ay;
    const t = (qpx * sy - qpy * sx) / denominator;
    const u = (qpx * ry - qpy * rx) / denominator;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  window.addEventListener("load", init);
})(window);
