"use strict";

(function registerMapSchema(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  const SCHEMA_VERSION = 1;

  function clonePlain(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function slug(value, fallback = "item") {
    return String(value || fallback)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9가-힣_-]+/gi, "-")
      .replace(/^-+|-+$/g, "") || fallback;
  }

  function objectId(mapId, source, index) {
    if (source?.id) return String(source.id);
    const type = slug(source?.kind || source?.type || "object");
    const n = String(index + 1).padStart(4, "0");
    return `${slug(mapId || "map")}-${type}-${n}`;
  }

  function objectFromObstacle(obstacle = {}, index = 0, mapId = "map") {
    const type = String(obstacle.kind || obstacle.type || "concrete");
    const item = {
      id: objectId(mapId, obstacle, index),
      type,
      x: Math.round(finiteNumber(obstacle.x)),
      y: Math.round(finiteNumber(obstacle.y)),
      rot: finiteNumber(obstacle.rot ?? obstacle.angle, 0),
      scale: finiteNumber(obstacle.scale, 1),
      tags: Array.isArray(obstacle.tags) ? obstacle.tags.slice() : []
    };

    if (Number.isFinite(Number(obstacle.w))) item.w = Math.round(Number(obstacle.w));
    if (Number.isFinite(Number(obstacle.h))) item.h = Math.round(Number(obstacle.h));
    if (obstacle.variant) item.variant = String(obstacle.variant);
    return item;
  }

  function zoneFromCapturePoint(point = {}, index = 0) {
    const name = String(point.name || `cap-${index + 1}`);
    return {
      id: slug(name, `cap-${index + 1}`),
      kind: "capture",
      name,
      x: Math.round(finiteNumber(point.x)),
      y: Math.round(finiteNumber(point.y)),
      r: Math.round(finiteNumber(point.r ?? point.radius, 120))
    };
  }

  function migrateV0(world = {}, options = {}) {
    const mapId = String(options.id || world.id || "map-v1");
    const obstacles = Array.isArray(world.obstacles) ? world.obstacles : [];
    return {
      schemaVersion: SCHEMA_VERSION,
      id: mapId,
      name: String(options.name || world.name || mapId),
      world: {
        width: Math.round(finiteNumber(world.width, 0)),
        height: Math.round(finiteNumber(world.height, 0))
      },
      roads: clonePlain(world.roads || []),
      objects: obstacles.map((obstacle, index) => objectFromObstacle(obstacle, index, mapId)),
      zones: (world.capturePoints || []).map(zoneFromCapturePoint),
      story: null
    };
  }

  function runtimeObstacleFromObject(object = {}, catalog = IronLine.objectCatalog) {
    const entry = catalog?.get?.(object.type) || null;
    const size = objectRuntimeSize(object, entry);
    const kind = entry?.runtimeKind || object.type || "concrete";
    const obstacle = {
      id: object.id,
      mapObjectId: object.id,
      kind,
      type: entry?.runtimeType || kind,
      x: Math.round(finiteNumber(object.x)),
      y: Math.round(finiteNumber(object.y)),
      w: size.w,
      h: size.h,
      angle: finiteNumber(object.rot, 0),
      rot: finiteNumber(object.rot, 0),
      variant: object.variant || undefined,
      cover: entry?.cover || "none",
      collision: entry?.collision !== false,
      spriteSlot: entry?.spriteSlot || `object.${kind}`
    };

    if (entry?.hp !== null && entry?.hp !== undefined) {
      obstacle.hp = Math.max(1, Math.round(Number(entry.hp) || 1));
      obstacle.maxHp = obstacle.hp;
      obstacle.baseHp = obstacle.hp;
      obstacle.destructible = true;
    }

    return obstacle;
  }

  function objectRuntimeSize(object = {}, entry = null) {
    const footprint = entry?.footprint || { w: 160, h: 60 };
    const scale = finiteNumber(object.scale, 1);
    return {
      w: Math.max(1, Math.round(finiteNumber(object.w, footprint.w * scale))),
      h: Math.max(1, Math.round(finiteNumber(object.h, footprint.h * scale)))
    };
  }

  function scaledTemplateRect(rect = {}, object = {}, entry = null, size = null) {
    const footprint = entry?.footprint || size || { w: 160, h: 60 };
    const target = size || objectRuntimeSize(object, entry);
    const sx = target.w / Math.max(1, finiteNumber(footprint.w, target.w));
    const sy = target.h / Math.max(1, finiteNumber(footprint.h, target.h));
    return {
      x: Math.round(finiteNumber(object.x) + finiteNumber(rect.x) * sx),
      y: Math.round(finiteNumber(object.y) + finiteNumber(rect.y) * sy),
      w: Math.max(1, Math.round(finiteNumber(rect.w, 1) * sx)),
      h: Math.max(1, Math.round(finiteNumber(rect.h, 1) * sy))
    };
  }

  function interiorMode(object = {}, entry = null) {
    if (!entry?.interiorTemplate) return "";
    return object.interior?.mode || entry.interiorTemplate.mode || "open";
  }

  function interiorWallObstaclesFromObject(object = {}, entry = null) {
    if (interiorMode(object, entry) !== "open") return [];
    const template = entry?.interiorTemplate;
    if (!template?.walls?.length) return [];
    const size = objectRuntimeSize(object, entry);
    return template.walls.map((wall, index) => {
      const rect = scaledTemplateRect(wall, object, entry, size);
      return {
        id: `${object.id || "object"}:wall:${wall.id || index}`,
        mapObjectId: object.id,
        parentObjectId: object.id,
        kind: wall.kind || "concrete",
        type: "interior-wall",
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
        angle: 0,
        rot: 0,
        cover: "heavy",
        collision: true,
        spriteSlot: "object.concrete",
        interior: true,
        stopsProjectiles: true
      };
    });
  }

  function runtimeObstaclesFromObject(object = {}, catalog = IronLine.objectCatalog) {
    const entry = catalog?.get?.(object.type) || null;
    const base = runtimeObstacleFromObject(object, catalog);
    const obstacles = base.collision === false ? [] : [base];
    obstacles.push(...interiorWallObstaclesFromObject(object, entry));
    return obstacles;
  }

  function objectsToObstacles(objects = [], catalog = IronLine.objectCatalog) {
    return objects
      .flatMap((object) => runtimeObstaclesFromObject(object, catalog))
      .filter((obstacle) => obstacle.collision !== false);
  }

  function roofFromObject(object = {}, catalog = IronLine.objectCatalog) {
    const entry = catalog?.get?.(object.type) || null;
    if (interiorMode(object, entry) !== "open") return null;
    const template = entry?.interiorTemplate;
    if (!template?.roof) return null;
    const size = objectRuntimeSize(object, entry);
    return {
      id: `${object.id || "object"}:roof`,
      mapObjectId: object.id,
      type: object.type,
      x: Math.round(finiteNumber(object.x)),
      y: Math.round(finiteNumber(object.y)),
      w: size.w,
      h: size.h,
      floor: clonePlain(template.floor || null),
      roof: clonePlain(template.roof || null)
    };
  }

  function roofsFromObjects(objects = [], catalog = IronLine.objectCatalog) {
    return objects.map((object) => roofFromObject(object, catalog)).filter(Boolean);
  }

  function normalizeWorld(world = {}, options = {}) {
    if (!world) return world;
    const remigrate = options.remigrate === true;
    const hasObjects = Array.isArray(world.objects) && world.objects.length > 0;
    if (remigrate || !hasObjects) {
      const schema = migrateV0(world, options);
      world.schemaVersion = schema.schemaVersion;
      world.objects = schema.objects;
      world.zones = schema.zones;
      world.story = world.story ?? null;
    } else {
      world.schemaVersion = world.schemaVersion || SCHEMA_VERSION;
      world.story = world.story ?? null;
      if (!Array.isArray(world.zones)) world.zones = (world.capturePoints || []).map(zoneFromCapturePoint);
    }
    const catalog = options.catalog || IronLine.objectCatalog;
    world.obstacles = objectsToObstacles(world.objects, catalog);
    world.mapObjectRoofs = roofsFromObjects(world.objects, catalog);
    return world;
  }

  function exportWorld(world = {}) {
    const normalized = normalizeWorld(clonePlain(world));
    return {
      schemaVersion: SCHEMA_VERSION,
      id: String(normalized.id || "map-v1"),
      name: String(normalized.name || normalized.id || "map-v1"),
      world: {
        width: Math.round(finiteNumber(normalized.width)),
        height: Math.round(finiteNumber(normalized.height))
      },
      roads: clonePlain(normalized.roads || []),
      objects: clonePlain(normalized.objects || []),
      zones: clonePlain(normalized.zones || []),
      story: normalized.story ?? null
    };
  }

  function validateSchema(schema = {}, catalog = IronLine.objectCatalog) {
    const errors = [];
    const warnings = [];
    const ids = new Set();
    const width = finiteNumber(schema.world?.width, 0);
    const height = finiteNumber(schema.world?.height, 0);

    if (schema.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
    if (!schema.id) errors.push("id is required");
    if (width <= 0 || height <= 0) errors.push("world.width/world.height must be positive");
    if (!Array.isArray(schema.objects)) errors.push("objects must be an array");
    if (!Array.isArray(schema.roads)) errors.push("roads must be an array");
    if (!Array.isArray(schema.zones)) errors.push("zones must be an array");
    if (schema.story !== null) warnings.push("story is reserved for R3 and should stay null in schema v1");

    for (const [index, object] of (schema.objects || []).entries()) {
      const label = object?.id || `objects[${index}]`;
      if (!object?.id) errors.push(`objects[${index}].id is required`);
      if (object?.id && ids.has(object.id)) errors.push(`duplicate object id: ${object.id}`);
      if (object?.id) ids.add(object.id);
      if (!object?.type) errors.push(`${label}.type is required`);
      if (object?.type && !catalog?.has?.(object.type)) errors.push(`${label}.type is not in object catalog: ${object.type}`);
      const x = finiteNumber(object?.x, NaN);
      const y = finiteNumber(object?.y, NaN);
      if (!Number.isFinite(x) || !Number.isFinite(y)) errors.push(`${label}.x/y must be finite`);
      const w = finiteNumber(object?.w, catalog?.defaultSize?.(object?.type)?.w || 0);
      const h = finiteNumber(object?.h, catalog?.defaultSize?.(object?.type)?.h || 0);
      if (x < -w || y < -h || x > width + w || y > height + h) warnings.push(`${label} is outside world bounds`);
    }

    for (const [index, zone] of (schema.zones || []).entries()) {
      if (!zone?.id) errors.push(`zones[${index}].id is required`);
      if (!zone?.kind) errors.push(`zones[${index}].kind is required`);
    }

    return {
      ok: errors.length === 0,
      errors,
      warnings
    };
  }

  function validateWorld(world = {}, catalog = IronLine.objectCatalog) {
    return validateSchema(exportWorld(world), catalog);
  }

  IronLine.MapSchema = {
    SCHEMA_VERSION,
    migrateV0,
    normalizeWorld,
    exportWorld,
    validateSchema,
    validateWorld,
    runtimeObstacleFromObject,
    runtimeObstaclesFromObject,
    roofsFromObjects,
    objectsToObstacles
  };
})(typeof window !== "undefined" ? window : globalThis);
