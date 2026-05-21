"use strict";

(function registerTestLabMap(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  const testLabWorld = {
    id: "test-lab-proving-ground",
    name: "독립 실험장",
    width: 4200,
    height: 3400,
    captureRate: 0.12,
    roadWidth: 96,
    terrainStyle: {
      gradient: ["#d9dddb", "#ccd2d1", "#bfc6c4"],
      gridColor: "#6f7b78",
      gridAlpha: 0.16,
      gridSize: 120
    },
    roadStyle: {
      edge: "#a8b0ae",
      body: "#b8bfbd",
      lane: "rgba(255, 255, 255, 0.64)"
    },
    testLab: {
      roofPoint: { x: 2680, y: 2680 },
      galleryFocus: { x: 760, y: 760 },
      rangeFocus: { x: 2320, y: 3000 },
      objectGalleryName: "오브젝트 전시장"
    },
    obstacles: [
      { x: 80, y: 80, w: 4040, h: 54, kind: "base-wall" },
      { x: 80, y: 3266, w: 4040, h: 54, kind: "base-wall" },
      { x: 80, y: 80, w: 54, h: 3240, kind: "base-wall" },
      { x: 4066, y: 80, w: 54, h: 3240, kind: "base-wall" },

      { x: 300, y: 310, w: 250, h: 150, kind: "building", variant: "warehouse" },
      { x: 620, y: 310, w: 220, h: 140, kind: "building", variant: "garage" },
      { x: 910, y: 310, w: 250, h: 150, kind: "building", variant: "barracks" },
      { x: 1230, y: 310, w: 230, h: 150, kind: "building", variant: "service-block" },
      { x: 1530, y: 310, w: 240, h: 150, kind: "building", variant: "depot" },
      { x: 1840, y: 310, w: 220, h: 140, kind: "building", variant: "bunker" },
      { x: 2130, y: 310, w: 220, h: 140, kind: "building", variant: "checkpoint" },

      { x: 300, y: 620, w: 300, h: 46, kind: "concrete", variant: "blast-wall" },
      { x: 680, y: 620, w: 300, h: 46, kind: "base-wall", variant: "fortified-base-wall" },
      { x: 1060, y: 620, w: 210, h: 36, kind: "sandbag", variant: "sandbag-line", destructible: true },
      { x: 1370, y: 620, w: 190, h: 38, kind: "barricade", variant: "dragon-teeth", destructible: true },
      { x: 1660, y: 620, w: 200, h: 30, kind: "wood-fence", variant: "wood-fence", destructible: true },

      { x: 2630, y: 2400, w: 210, h: 220, kind: "building", variant: "service-block" },
      { x: 2440, y: 2860, w: 820, h: 48, kind: "concrete", variant: "roadblock-wall" },
      { x: 3210, y: 2520, w: 48, h: 440, kind: "concrete", variant: "retaining-wall" },
      { x: 3320, y: 2680, w: 360, h: 46, kind: "sandbag", variant: "sandbag-nest", destructible: true },
      { x: 3500, y: 2960, w: 260, h: 36, kind: "barricade", variant: "steel-hedgehog", destructible: true }
    ],
    scenery: [
      { id: "gallery-tree-pine", type: "tree", variant: "pine", x: 340, y: 900, r: 42, destructible: true, maxHp: 35, baseHp: 35, hp: 35 },
      { id: "gallery-tree-broadleaf", type: "tree", variant: "broadleaf", x: 470, y: 900, r: 44, destructible: true, maxHp: 35, baseHp: 35, hp: 35 },
      { id: "gallery-brush", type: "brush", variant: "brush", x: 640, y: 900, r: 72 },
      { id: "gallery-tall-grass", type: "brush", variant: "tall-grass", x: 830, y: 900, r: 78 },
      { id: "gallery-rubble", type: "rubble", variant: "concrete-rubble", x: 1040, y: 900, r: 70, destructible: true, maxHp: 24, baseHp: 24, hp: 24 },
      { id: "gallery-burnt-rubble", type: "rubble", variant: "burnt-rubble", x: 1230, y: 900, r: 70, destructible: true, maxHp: 24, baseHp: 24, hp: 24 },
      { id: "range-tree-a", type: "tree", variant: "burnt-tree", x: 3440, y: 2360, r: 42, destructible: true, maxHp: 28, baseHp: 28, hp: 28 },
      { id: "range-brush-a", type: "brush", variant: "brush", x: 3040, y: 2400, r: 74 }
    ],
    roads: [
      [
        { x: 300, y: 1120 },
        { x: 1040, y: 1120 },
        { x: 1760, y: 1440 },
        { x: 2320, y: 3000 },
        { x: 3650, y: 3000 }
      ],
      [
        { x: 600, y: 260 },
        { x: 600, y: 1120 },
        { x: 880, y: 1440 }
      ],
      [
        { x: 2680, y: 2680 },
        { x: 2980, y: 2620 },
        { x: 3380, y: 2720 },
        { x: 3660, y: 2920 }
      ]
    ],
    terrainPatches: [
      { x: 800, y: 680, r: 690, color: "rgba(255, 255, 255, 0.18)" },
      { x: 2600, y: 2920, r: 620, color: "rgba(255, 255, 255, 0.13)" },
      { x: 3320, y: 2540, r: 460, color: "rgba(180, 188, 187, 0.16)" }
    ],
    safeZones: [
      { name: "시험 청팀", label: "시험장 시작점", team: "blue", x: 2320, y: 3000, radius: 360 },
      { name: "시험 홍팀", label: "표적 구역", team: "red", x: 3380, y: 2720, radius: 420 }
    ],
    baseExitPoints: {
      blue: { x: 2460, y: 2960, radius: 110 },
      red: { x: 3260, y: 2760, radius: 110 }
    },
    spawns: {
      player: { x: 2320, y: 3000 },
      playerTank: { x: 2220, y: 3000, angle: -0.18 },
      blue: [
        { x: 2180, y: 2920, callSign: "청팀전차-1", angle: -0.12 }
      ],
      infantryBlue: [
        { x: 2290, y: 3060, callSign: "청팀보병-1", angle: -0.16, weaponId: "rifle" }
      ],
      red: [
        { x: 3380, y: 2720, callSign: "표적전차-1", angle: Math.PI }
      ],
      infantryRed: [
        { x: 2980, y: 2620, callSign: "표적보병-1", angle: Math.PI, weaponId: "rifle" },
        { x: 3060, y: 2705, callSign: "표적보병-2", angle: Math.PI, weaponId: "machinegun" }
      ]
    },
    capturePoints: [
      { name: "1", x: 760, y: 760 },
      { name: "2", x: 2320, y: 3000 },
      { name: "3", x: 3380, y: 2720 }
    ],
    reconPoints: {
      blue: [
        { name: "전시장 정찰", x: 760, y: 760, radius: 160 },
        { name: "표적 구역 정찰", x: 3380, y: 2720, radius: 180 }
      ],
      red: [
        { name: "시작점 감시", x: 2320, y: 3000, radius: 160 }
      ]
    },
    navGraph: {
      nodes: [
        { id: "gallery", x: 760, y: 760 },
        { id: "gallery_road", x: 1040, y: 1120 },
        { id: "mid", x: 1760, y: 1440 },
        { id: "blue_base", x: 2320, y: 3000 },
        { id: "blue_gate", x: 2460, y: 2960 },
        { id: "roof", x: 2680, y: 2680 },
        { id: "target_line", x: 3060, y: 2705 },
        { id: "red_base", x: 3380, y: 2720 },
        { id: "east_range", x: 3650, y: 3000 },
        { id: "a_point", x: 760, y: 760 },
        { id: "b_point", x: 2320, y: 3000 },
        { id: "c_point", x: 3380, y: 2720 }
      ],
      edges: [
        ["gallery", "gallery_road"],
        ["gallery", "a_point"],
        ["gallery_road", "mid"],
        ["mid", "blue_gate"],
        ["blue_gate", "blue_base"],
        ["blue_base", "b_point"],
        ["blue_gate", "roof"],
        ["roof", "target_line"],
        ["target_line", "red_base"],
        ["red_base", "c_point"],
        ["red_base", "east_range"],
        ["target_line", "east_range"]
      ],
      objectiveNodes: {
        A: "a_point",
        B: "b_point",
        C: "c_point"
      }
    }
  };

  function clonePlain(value) {
    return JSON.parse(JSON.stringify(value));
  }

  IronLine.testLabMap = testLabWorld;
  IronLine.createTestLabMap = function createTestLabMap() {
    return clonePlain(testLabWorld);
  };
})(window);
