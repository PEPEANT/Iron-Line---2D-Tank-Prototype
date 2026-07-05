"use strict";

(function registerEditorObjectTools(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const DRAFT_STORAGE_KEY = "iron-line-map-editor-draft-v3";

  function clonePlain(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function zoneToCapturePoint(zone = {}, index = 0) {
    return {
      name: zone.name || zone.id || `cap-${index + 1}`,
      x: Math.round(finiteNumber(zone.x)),
      y: Math.round(finiteNumber(zone.y)),
      r: Math.round(finiteNumber(zone.r ?? zone.radius, 120))
    };
  }

  function worldFromEditorScript(scriptText) {
    const sandbox = {
      IronLine: {
        map01: {
          width: 0,
          height: 0,
          roadWidth: 84,
          roads: [],
          obstacles: [],
          capturePoints: [],
          safeZones: [],
          baseExitPoints: {},
          spawns: {},
          reconPoints: {},
          navGraph: { nodes: [] }
        }
      }
    };
    sandbox.window = sandbox;
    Function("window", String(scriptText || ""))(sandbox);
    return sandbox.IronLine.map01;
  }

  function schemaFromEditorWorld(world = {}) {
    const source = {
      id: world.id || "map-editor-v2",
      name: world.name || "Map Editor V2",
      width: finiteNumber(world.width, world.world?.width || 0),
      height: finiteNumber(world.height, world.world?.height || 0),
      roads: clonePlain(world.roads || []),
      obstacles: clonePlain(world.obstacles || []),
      capturePoints: clonePlain(world.capturePoints || [])
    };
    const schema = IronLine.MapSchema?.migrateV0?.(source, {
      id: source.id,
      name: source.name
    });
    if (!schema) throw new Error("MapSchema is not available");
    return schema;
  }

  function schemaFromEditorScript(scriptText) {
    return schemaFromEditorWorld(worldFromEditorScript(scriptText));
  }

  function editorDraftFromSchema(schema = {}) {
    const width = finiteNumber(schema.world?.width ?? schema.width, 3400);
    const height = finiteNumber(schema.world?.height ?? schema.height, 2200);
    const objects = Array.isArray(schema.objects) ? schema.objects : [];
    const obstacles = objects.map(editorObstacleFromObject);
    return {
      width: Math.round(width),
      height: Math.round(height),
      roadWidth: Math.round(finiteNumber(schema.roadWidth, 84)),
      selectedRoad: 0,
      selectedObstacle: obstacles.length ? 0 : null,
      editMode: "obstacle",
      roads: clonePlain(schema.roads || []),
      obstacles: clonePlain(obstacles),
      capturePoints: (schema.zones || []).filter((zone) => zone.kind === "capture").map(zoneToCapturePoint)
    };
  }

  function editorObstacleFromObject(object = {}) {
    const catalog = IronLine.objectCatalog;
    const entry = catalog?.get?.(object.type) || null;
    const footprint = entry?.footprint || { w: 160, h: 60 };
    const scale = finiteNumber(object.scale, 1);
    return {
      x: Math.round(finiteNumber(object.x)),
      y: Math.round(finiteNumber(object.y)),
      w: Math.max(1, Math.round(finiteNumber(object.w, footprint.w * scale))),
      h: Math.max(1, Math.round(finiteNumber(object.h, footprint.h * scale))),
      kind: object.type || "concrete",
      variant: object.variant || undefined
    };
  }

  function objectEntryToObstacleKind(entry = {}) {
    const footprint = entry.footprint || { w: 160, h: 60 };
    return {
      kind: entry.id,
      label: entry.name || entry.id,
      group: entry.category || "사물",
      defaultSize: {
        w: Math.round(finiteNumber(footprint.w, 160)),
        h: Math.round(finiteNumber(footprint.h, 60))
      },
      destructible: entry.hp !== null && entry.hp !== undefined,
      variants: [["", "기본"]]
    };
  }

  function ensureEditorCatalogBridge() {
    const scenery = IronLine.sceneryCatalog;
    const objectCatalog = IronLine.objectCatalog;
    if (!scenery || !objectCatalog || scenery.__objectCatalogBridge) return scenery;

    const original = {
      getObstacleKind: scenery.getObstacleKind?.bind(scenery),
      obstacleKindLabel: scenery.obstacleKindLabel?.bind(scenery),
      variantLabel: scenery.variantLabel?.bind(scenery),
      defaultVariant: scenery.defaultVariant?.bind(scenery),
      defaultSize: scenery.defaultSize?.bind(scenery)
    };
    const extraKinds = new Map();

    for (const entry of objectCatalog.all()) {
      if (!entry?.id || original.getObstacleKind?.(entry.id)?.kind === entry.id) continue;
      const item = objectEntryToObstacleKind(entry);
      extraKinds.set(item.kind, item);
      scenery.obstacleKinds.push(item);
    }

    scenery.getObstacleKind = function getObstacleKind(kind) {
      return extraKinds.get(kind) || original.getObstacleKind?.(kind) || extraKinds.get("concrete");
    };
    scenery.obstacleKindLabel = function obstacleKindLabel(kind) {
      return this.getObstacleKind(kind)?.label || original.obstacleKindLabel?.(kind) || kind || "오브젝트";
    };
    scenery.variantLabel = function variantLabel(kind, variant) {
      if (extraKinds.has(kind)) return variant || "기본";
      return original.variantLabel?.(kind, variant) || variant || "기본";
    };
    scenery.defaultVariant = function defaultVariant(kind) {
      if (extraKinds.has(kind)) return "";
      return original.defaultVariant?.(kind) || "";
    };
    scenery.defaultSize = function defaultSize(kind) {
      const item = this.getObstacleKind(kind);
      return { ...(item?.defaultSize || original.defaultSize?.(kind) || { w: 160, h: 60 }) };
    };
    scenery.__objectCatalogBridge = true;
    return scenery;
  }

  IronLine.editorObjectTools = {
    DRAFT_STORAGE_KEY,
    ensureEditorCatalogBridge,
    worldFromEditorScript,
    schemaFromEditorWorld,
    schemaFromEditorScript,
    editorObstacleFromObject,
    editorDraftFromSchema
  };

  ensureEditorCatalogBridge();
})(typeof window !== "undefined" ? window : globalThis);
