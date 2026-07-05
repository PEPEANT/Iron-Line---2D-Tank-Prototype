"use strict";

(function registerObjectCatalog(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  const CATEGORY = Object.freeze({
    BUILDING: "건물",
    INTERIOR: "실내",
    STRUCTURE: "구조물",
    DECOR: "장식",
    GROUND: "바닥"
  });

  const BASE_ENTRIES = {
    building: {
      id: "building",
      name: "건물",
      category: CATEGORY.BUILDING,
      footprint: { w: 240, h: 150 },
      collision: true,
      spriteSlot: "object.building",
      hp: null,
      cover: "heavy",
      cost: 0,
      interactions: [],
      runtimeKind: "building"
    },
    "house-small": {
      id: "house-small",
      name: "소형 주택",
      category: CATEGORY.BUILDING,
      footprint: { w: 260, h: 170 },
      collision: false,
      spriteSlot: "object.house-small",
      hp: null,
      cover: "heavy",
      cost: 0,
      interactions: [],
      runtimeKind: "house-small",
      interiorTemplate: {
        id: "two-room-house",
        mode: "open",
        floor: { color: "rgba(79, 87, 76, 0.54)" },
        roof: { colorA: "#5b645c", colorB: "#303833", trim: "#8e9a8f" },
        walls: [
          { id: "north", x: 0, y: 0, w: 260, h: 18 },
          { id: "west", x: 0, y: 0, w: 18, h: 170 },
          { id: "east", x: 242, y: 0, w: 18, h: 170 },
          { id: "south-left", x: 0, y: 152, w: 101, h: 18 },
          { id: "south-right", x: 159, y: 152, w: 101, h: 18 },
          { id: "partition-north", x: 128, y: 18, w: 14, h: 55 },
          { id: "partition-south", x: 128, y: 105, w: 14, h: 47 }
        ]
      }
    },
    concrete: {
      id: "concrete",
      name: "콘크리트 벽",
      category: CATEGORY.STRUCTURE,
      footprint: { w: 220, h: 42 },
      collision: true,
      spriteSlot: "object.concrete",
      hp: null,
      cover: "heavy",
      cost: 0,
      interactions: [],
      runtimeKind: "concrete"
    },
    "base-wall": {
      id: "base-wall",
      name: "기지 벽",
      category: CATEGORY.STRUCTURE,
      footprint: { w: 280, h: 46 },
      collision: true,
      spriteSlot: "object.base-wall",
      hp: null,
      cover: "heavy",
      cost: 0,
      interactions: [],
      runtimeKind: "base-wall"
    },
    "supply-locker": {
      id: "supply-locker",
      name: "보급 사물함",
      category: CATEGORY.STRUCTURE,
      footprint: { w: 48, h: 34 },
      collision: true,
      spriteSlot: "object.supply-locker",
      hp: null,
      cover: "light",
      cost: 0,
      interactions: ["supply"],
      runtimeKind: "supply-crate",
      runtimeType: "supply-crate"
    },
    "supply-crate": {
      id: "supply-crate",
      name: "보급상자",
      category: CATEGORY.STRUCTURE,
      footprint: { w: 42, h: 28 },
      collision: true,
      spriteSlot: "object.supply-crate",
      hp: null,
      cover: "light",
      cost: 0,
      interactions: ["supply"],
      runtimeKind: "supply-crate",
      runtimeType: "supply-crate"
    }
  };

  function categoryForScenery(item = {}) {
    const kind = item.kind || "";
    if (kind === "building") return CATEGORY.BUILDING;
    if (["concrete", "base-wall", "sandbag", "barricade", "wood-fence"].includes(kind)) return CATEGORY.STRUCTURE;
    if (["tree", "brush", "streetlight", "billboard", "bench", "rubble"].includes(kind)) return CATEGORY.DECOR;
    return CATEGORY.DECOR;
  }

  function coverForScenery(item = {}) {
    const kind = item.kind || "";
    if (["building", "concrete", "base-wall"].includes(kind)) return "heavy";
    if (["sandbag", "barricade", "wood-fence", "rubble", "tree"].includes(kind)) return "light";
    return "none";
  }

  function entryFromScenery(item = {}) {
    const size = item.defaultSize || { w: 160, h: 60 };
    return {
      id: item.kind,
      name: item.label || item.kind,
      category: categoryForScenery(item),
      footprint: { w: size.w || 160, h: size.h || 60 },
      collision: item.kind !== "brush",
      spriteSlot: `object.${item.kind}`,
      hp: item.destructible ? 1 : null,
      cover: coverForScenery(item),
      cost: 0,
      interactions: [],
      runtimeKind: item.kind,
      runtimeType: item.kind
    };
  }

  function buildEntries() {
    const entries = { ...BASE_ENTRIES };
    for (const item of IronLine.sceneryCatalog?.obstacleKinds || []) {
      if (!item?.kind || entries[item.kind]) continue;
      entries[item.kind] = entryFromScenery(item);
    }
    return entries;
  }

  const objectCatalog = {
    categories: Object.values(CATEGORY),
    entries: buildEntries(),

    refresh() {
      this.entries = buildEntries();
      return this.entries;
    },

    all() {
      return Object.values(this.entries);
    },

    get(type) {
      return this.entries[type] || this.entries.concrete;
    },

    has(type) {
      return Boolean(this.entries[type]);
    },

    defaultSize(type) {
      const footprint = this.get(type)?.footprint || { w: 160, h: 60 };
      return { w: footprint.w || 160, h: footprint.h || 60 };
    }
  };

  IronLine.objectCatalog = objectCatalog;
})(typeof window !== "undefined" ? window : globalThis);
