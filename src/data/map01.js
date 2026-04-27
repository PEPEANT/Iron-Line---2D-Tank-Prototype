"use strict";

(function registerMap(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  const world = {
    width: 3400,
    height: 2200,
    captureRate: 0.16,
    obstacles: [
      { x: 240, y: 360, w: 360, h: 92, kind: "concrete" },
      { x: 545, y: 605, w: 92, h: 300, kind: "building" },
      { x: 930, y: 420, w: 330, h: 88, kind: "concrete" },
      { x: 1180, y: 840, w: 280, h: 94, kind: "building" },
      { x: 1470, y: 520, w: 112, h: 330, kind: "building" },
      { x: 1700, y: 1010, w: 360, h: 96, kind: "concrete" },
      { x: 1940, y: 420, w: 310, h: 88, kind: "concrete" },
      { x: 2210, y: 620, w: 110, h: 330, kind: "building" },
      { x: 2660, y: 410, w: 360, h: 90, kind: "concrete" },
      { x: 2860, y: 910, w: 120, h: 300, kind: "building" },
      { x: 360, y: 1390, w: 120, h: 340, kind: "building" },
      { x: 770, y: 1560, w: 410, h: 92, kind: "concrete" },
      { x: 1220, y: 1320, w: 115, h: 300, kind: "building" },
      { x: 1510, y: 1610, w: 380, h: 94, kind: "concrete" },
      { x: 2050, y: 1420, w: 130, h: 330, kind: "building" },
      { x: 2350, y: 1690, w: 430, h: 96, kind: "concrete" },
      { x: 2920, y: 1510, w: 120, h: 330, kind: "building" },
      { x: 3050, y: 1850, w: 250, h: 86, kind: "concrete" }
    ],
    roads: [
      [
        { x: 160, y: 1840 },
        { x: 560, y: 1580 },
        { x: 940, y: 1280 },
        { x: 1420, y: 1110 },
        { x: 1900, y: 1080 },
        { x: 2400, y: 1220 },
        { x: 3040, y: 1540 },
        { x: 3310, y: 1880 }
      ],
      [
        { x: 260, y: 610 },
        { x: 760, y: 770 },
        { x: 1210, y: 940 },
        { x: 1690, y: 900 },
        { x: 2200, y: 690 },
        { x: 2730, y: 620 },
        { x: 3260, y: 420 }
      ],
      [
        { x: 930, y: 120 },
        { x: 980, y: 530 },
        { x: 1040, y: 1040 },
        { x: 960, y: 1540 },
        { x: 900, y: 2080 }
      ],
      [
        { x: 1760, y: 180 },
        { x: 1660, y: 620 },
        { x: 1710, y: 1060 },
        { x: 1840, y: 1500 },
        { x: 1990, y: 2040 }
      ],
      [
        { x: 2570, y: 250 },
        { x: 2510, y: 760 },
        { x: 2510, y: 1180 },
        { x: 2640, y: 1640 },
        { x: 2850, y: 2040 }
      ]
    ],
    terrainPatches: [
      { x: 170, y: 130, r: 170, color: "rgba(77, 128, 79, 0.22)" },
      { x: 650, y: 390, r: 250, color: "rgba(67, 105, 80, 0.28)" },
      { x: 1380, y: 330, r: 260, color: "rgba(80, 116, 95, 0.25)" },
      { x: 2260, y: 360, r: 250, color: "rgba(100, 115, 76, 0.24)" },
      { x: 3090, y: 690, r: 240, color: "rgba(74, 113, 88, 0.24)" },
      { x: 520, y: 1960, r: 300, color: "rgba(74, 113, 88, 0.26)" },
      { x: 1550, y: 1900, r: 290, color: "rgba(79, 126, 91, 0.22)" },
      { x: 2570, y: 1940, r: 320, color: "rgba(67, 105, 80, 0.24)" }
    ],
    safeZones: [
      { name: "BLUE BASE", team: "blue", x: 610, y: 1740, radius: 285 }
    ],
    spawns: {
      player: { x: 560, y: 1785 },
      playerTank: { x: 610, y: 1740, angle: -0.42 },
      blue: [
      { x: 540, y: 1500, callSign: "B-12", angle: -0.26 },
        { x: 760, y: 1880, callSign: "B-21", angle: -0.58 },
        { x: 380, y: 1900, callSign: "B-34", angle: -0.45 }
      ],
      infantryBlue: [
        { x: 535, y: 1860, callSign: "B-INF-1", angle: -0.55, weaponId: "rifle" },
        { x: 620, y: 1930, callSign: "B-INF-2", angle: -0.55, weaponId: "lmg" },
        { x: 535, y: 1690, callSign: "B-INF-3", angle: -0.35, weaponId: "smg" },
        { x: 740, y: 1710, callSign: "B-ENG-1", angle: -0.42, weaponId: "rifle", classId: "engineer", rpgAmmo: 2 },
        { x: 350, y: 1770, callSign: "B-SCT-1", angle: -0.32, weaponId: "sniper", classId: "scout" }
      ],
      red: [
        { x: 3090, y: 545, callSign: "R-05", angle: 2.72 },
        { x: 3170, y: 940, callSign: "R-18", angle: 2.9 },
        { x: 2850, y: 1570, callSign: "R-33", angle: -2.82 },
        { x: 3180, y: 1780, callSign: "R-44", angle: -2.74 }
      ],
      infantryRed: [
        { x: 3160, y: 540, callSign: "R-INF-1", angle: 2.8, weaponId: "rifle" },
        { x: 3220, y: 1040, callSign: "R-INF-2", angle: 2.9, weaponId: "smg" },
        { x: 3000, y: 1455, callSign: "R-INF-3", angle: -2.8, weaponId: "lmg" },
        { x: 2850, y: 1765, callSign: "R-ENG-1", angle: -2.75, weaponId: "rifle", classId: "engineer", rpgAmmo: 2 },
        { x: 3145, y: 1645, callSign: "R-SCT-1", angle: -2.82, weaponId: "sniper", classId: "scout" }
      ]
    },
    capturePoints: [
      { name: "A", x: 780, y: 760 },
      { name: "B", x: 1560, y: 1060 },
      { name: "C", x: 2440, y: 700 },
      { name: "D", x: 2440, y: 1640 }
    ],
    navGraph: {
      nodes: [
        { id: "blue_base", x: 610, y: 1740 },
        { id: "blue_west", x: 540, y: 1500 },
        { id: "blue_south", x: 760, y: 1880 },
        { id: "blue_low", x: 390, y: 1910 },
        { id: "west_low_road", x: 560, y: 1580 },
        { id: "west_north_road", x: 760, y: 770 },
        { id: "a_west", x: 705, y: 890 },
        { id: "a_point", x: 780, y: 760 },
        { id: "a_east", x: 990, y: 860 },
        { id: "mid_low", x: 1420, y: 1110 },
        { id: "b_point", x: 1560, y: 1060 },
        { id: "mid_north", x: 1690, y: 900 },
        { id: "mid_south", x: 1840, y: 1500 },
        { id: "east_north", x: 2150, y: 690 },
        { id: "c_point", x: 2440, y: 700 },
        { id: "c_east", x: 2730, y: 620 },
        { id: "east_center", x: 2510, y: 1180 },
        { id: "d_west", x: 2240, y: 1490 },
        { id: "d_point", x: 2440, y: 1640 },
        { id: "d_east", x: 2640, y: 1640 },
        { id: "red_north_base", x: 3090, y: 545 },
        { id: "red_mid", x: 3170, y: 940 },
        { id: "red_south", x: 2850, y: 1570 },
        { id: "red_far_south", x: 3180, y: 1780 },
        { id: "north_vertical", x: 1760, y: 180 },
        { id: "center_vertical", x: 1640, y: 1160 },
        { id: "south_vertical", x: 1990, y: 2040 },
        { id: "east_vertical_north", x: 2570, y: 250 },
        { id: "east_vertical_south", x: 2850, y: 2040 }
      ],
      edges: [
        ["blue_base", "blue_west"],
        ["blue_base", "blue_south"],
        ["blue_base", "blue_low"],
        ["blue_west", "west_low_road"],
        ["blue_south", "west_low_road"],
        ["blue_low", "west_low_road"],
        ["west_low_road", "a_west"],
        ["west_low_road", "mid_low"],
        ["west_north_road", "a_point"],
        ["west_north_road", "a_west"],
        ["a_west", "a_point"],
        ["a_point", "a_east"],
        ["a_east", "mid_low"],
        ["a_east", "mid_north"],
        ["mid_low", "b_point"],
        ["mid_north", "b_point"],
        ["b_point", "center_vertical"],
        ["center_vertical", "mid_south"],
        ["mid_south", "d_west"],
        ["b_point", "east_center"],
        ["mid_north", "east_north"],
        ["east_north", "c_point"],
        ["c_point", "c_east"],
        ["c_point", "east_center"],
        ["east_center", "d_west"],
        ["d_west", "d_point"],
        ["d_point", "d_east"],
        ["d_east", "red_south"],
        ["d_east", "red_far_south"],
        ["c_east", "red_north_base"],
        ["c_east", "red_mid"],
        ["east_center", "red_mid"],
        ["red_mid", "red_north_base"],
        ["red_mid", "red_south"],
        ["red_south", "red_far_south"],
        ["north_vertical", "mid_north"],
        ["north_vertical", "east_vertical_north"],
        ["center_vertical", "south_vertical"],
        ["south_vertical", "east_vertical_south"],
        ["east_vertical_north", "c_point"],
        ["east_vertical_south", "d_point"]
      ],
      objectiveNodes: {
        A: "a_point",
        B: "b_point",
        C: "c_point",
        D: "d_point"
      }
    }
  };

  function expandBattlefield(world) {
    const scale = 1.32;
    const offsetX = 560;
    const offsetY = 390;
    const tx = (x) => Math.round(x * scale + offsetX);
    const ty = (y) => Math.round(y * scale + offsetY);
    const tr = (value) => Math.round(value * scale);

    world.width = Math.round(world.width * scale + 980);
    world.height = Math.round(world.height * scale + 760);
    world.captureRate = 0.105;

    for (const obstacle of world.obstacles) {
      obstacle.x = tx(obstacle.x);
      obstacle.y = ty(obstacle.y);
      obstacle.w = tr(obstacle.w);
      obstacle.h = tr(obstacle.h);
    }

    for (const road of world.roads) {
      for (const point of road) {
        point.x = tx(point.x);
        point.y = ty(point.y);
      }
    }

    for (const patch of world.terrainPatches) {
      patch.x = tx(patch.x);
      patch.y = ty(patch.y);
      patch.r = tr(patch.r);
    }

    for (const point of world.capturePoints) {
      point.x = tx(point.x);
      point.y = ty(point.y);
    }

    for (const node of world.navGraph.nodes) {
      node.x = tx(node.x);
      node.y = ty(node.y);
    }

    configureBases(world);
  }

  function configureBases(world) {
    world.safeZones = [
      { name: "BLUE BASE", team: "blue", x: 760, y: 2930, radius: 500 },
      { name: "RED BASE", team: "red", x: 4930, y: 1950, radius: 520 }
    ];

    world.baseExitPoints = {
      blue: { x: 1280, y: 2920, radius: 135 },
      red: { x: 4380, y: 2030, radius: 135 }
    };

    clearBaseBuildingIntrusions(world);

    world.obstacles.push(
      { x: 360, y: 2550, w: 780, h: 54, kind: "base-wall" },
      { x: 360, y: 3240, w: 780, h: 54, kind: "base-wall" },
      { x: 360, y: 2550, w: 54, h: 744, kind: "base-wall" },
      { x: 1086, y: 2550, w: 54, h: 230, kind: "base-wall" },
      { x: 1086, y: 3020, w: 54, h: 274, kind: "base-wall" },
      { x: 560, y: 2645, w: 250, h: 58, kind: "concrete" },
      { x: 520, y: 3130, w: 360, h: 52, kind: "concrete" },

      { x: 4560, y: 1490, w: 720, h: 54, kind: "base-wall" },
      { x: 4560, y: 2370, w: 720, h: 54, kind: "base-wall" },
      { x: 4560, y: 1490, w: 54, h: 320, kind: "base-wall" },
      { x: 4560, y: 2140, w: 54, h: 284, kind: "base-wall" },
      { x: 5226, y: 1490, w: 54, h: 934, kind: "base-wall" },
      { x: 4820, y: 1585, w: 300, h: 58, kind: "concrete" },
      { x: 4780, y: 2260, w: 360, h: 52, kind: "concrete" }
    );

    world.roads.push(
      [
        { x: 650, y: 2935 },
        { x: 1125, y: 2920 },
        { x: 1299, y: 2476 }
      ],
      [
        { x: 4910, y: 2030 },
        { x: 4520, y: 2030 },
        { x: 4174, y: 1208 }
      ],
      [
        { x: 4910, y: 2030 },
        { x: 4520, y: 2105 },
        { x: 4045, y: 2555 }
      ]
    );

    world.terrainPatches.push(
      { x: 720, y: 2940, r: 520, color: "rgba(72, 118, 84, 0.22)" },
      { x: 4930, y: 1950, r: 560, color: "rgba(108, 76, 72, 0.16)" },
      { x: 2760, y: 2920, r: 420, color: "rgba(74, 113, 88, 0.2)" },
      { x: 3580, y: 620, r: 420, color: "rgba(80, 116, 95, 0.2)" }
    );

    world.reconPoints = {
      blue: [
        { name: "A 외곽 정찰", x: 1287, y: 1168, radius: 135 },
        { name: "B 남서 정찰", x: 2227, y: 2108, radius: 145 },
        { name: "D 남측 정찰", x: 3400, y: 2900, radius: 150 },
        { name: "중앙 숲 정찰", x: 2920, y: 1220, radius: 135 }
      ],
      red: [
        { name: "C 동측 정찰", x: 4232, y: 1073, radius: 140 },
        { name: "B 북동 정찰", x: 3050, y: 1460, radius: 135 },
        { name: "D 동남 정찰", x: 4200, y: 2840, radius: 150 },
        { name: "중앙 도로 정찰", x: 3370, y: 2100, radius: 140 }
      ]
    };

    world.spawns = {
      player: { x: 650, y: 2960 },
      playerTank: { x: 730, y: 2865, angle: -0.18 },
      blue: [
        { x: 880, y: 2745, callSign: "B-12", angle: -0.22 },
        { x: 900, y: 2945, callSign: "B-21", angle: -0.16 },
        { x: 730, y: 3050, callSign: "B-34", angle: -0.24 }
      ],
      infantryBlue: [
        { x: 540, y: 2820, callSign: "B-INF-1", angle: -0.2, weaponId: "rifle" },
        { x: 610, y: 2750, callSign: "B-INF-2", angle: -0.2, weaponId: "machinegun" },
        { x: 520, y: 2965, callSign: "B-INF-3", angle: -0.18, weaponId: "rifle" },
        { x: 620, y: 3070, callSign: "B-INF-4", angle: -0.2, weaponId: "machinegun" },
        { x: 930, y: 3190, callSign: "B-INF-5", angle: -0.28, weaponId: "rifle" },
        { x: 950, y: 3060, callSign: "B-INF-6", angle: -0.18, weaponId: "rifle" },
        { x: 450, y: 2720, callSign: "B-INF-7", angle: -0.2, weaponId: "rifle" },
        { x: 1040, y: 2860, callSign: "B-INF-8", angle: -0.16, weaponId: "rifle" },
        { x: 990, y: 2835, callSign: "B-MG-1", angle: -0.16, weaponId: "machinegun" },
        { x: 1015, y: 3150, callSign: "B-MG-2", angle: -0.18, weaponId: "machinegun" },
        { x: 795, y: 2730, callSign: "B-ENG-1", angle: -0.2, weaponId: "rifle", classId: "engineer", rpgAmmo: 2, repairKitAmmo: 2 },
        { x: 980, y: 2950, callSign: "B-ENG-2", angle: -0.18, weaponId: "rifle", classId: "engineer", rpgAmmo: 2, repairKitAmmo: 2 },
        { x: 940, y: 2685, callSign: "B-SCT-1", angle: -0.25, weaponId: "sniper", classId: "scout" },
        { x: 1035, y: 3010, callSign: "B-SCT-2", angle: -0.22, weaponId: "sniper", classId: "scout" }
      ],
      red: [
        { x: 4860, y: 1715, callSign: "R-05", angle: 3.02 },
        { x: 5025, y: 1865, callSign: "R-18", angle: 3.08 },
        { x: 4860, y: 2075, callSign: "R-33", angle: -3.06 },
        { x: 5025, y: 2175, callSign: "R-44", angle: -3.02 }
      ],
      infantryRed: [
        { x: 5140, y: 1710, callSign: "R-INF-1", angle: 3.04, weaponId: "rifle" },
        { x: 5150, y: 1665, callSign: "R-INF-2", angle: 3.04, weaponId: "machinegun" },
        { x: 5160, y: 1900, callSign: "R-INF-3", angle: 3.1, weaponId: "rifle" },
        { x: 5050, y: 2040, callSign: "R-INF-4", angle: -3.05, weaponId: "machinegun" },
        { x: 5160, y: 2180, callSign: "R-INF-5", angle: -3.05, weaponId: "rifle" },
        { x: 4700, y: 2320, callSign: "R-INF-6", angle: -3.02, weaponId: "rifle" },
        { x: 4690, y: 1660, callSign: "R-INF-7", angle: 3.04, weaponId: "rifle" },
        { x: 5140, y: 2050, callSign: "R-INF-8", angle: -3.05, weaponId: "rifle" },
        { x: 4700, y: 2150, callSign: "R-MG-1", angle: -3.05, weaponId: "machinegun" },
        { x: 4690, y: 2225, callSign: "R-MG-2", angle: -3.04, weaponId: "machinegun" },
        { x: 4720, y: 1785, callSign: "R-ENG-1", angle: 3.06, weaponId: "rifle", classId: "engineer", rpgAmmo: 2, repairKitAmmo: 2 },
        { x: 4720, y: 1985, callSign: "R-ENG-2", angle: 3.08, weaponId: "rifle", classId: "engineer", rpgAmmo: 2, repairKitAmmo: 2 },
        { x: 4670, y: 2090, callSign: "R-SCT-1", angle: -3.0, weaponId: "sniper", classId: "scout" },
        { x: 4680, y: 1880, callSign: "R-SCT-2", angle: 3.08, weaponId: "sniper", classId: "scout" }
      ]
    };

    setNode(world, "blue_base", 760, 2930);
    setNode(world, "blue_west", 1180, 2860);
    setNode(world, "blue_south", 1180, 2940);
    setNode(world, "blue_low", 1180, 3010);
    setNode(world, "red_north_base", 4780, 1720);
    setNode(world, "red_mid", 4500, 2030);
    setNode(world, "red_south", 4780, 2170);
    setNode(world, "red_far_south", 5020, 2250);

    world.navGraph.nodes.push(
      { id: "blue_gate_in", x: 1050, y: 2920 },
      { id: "blue_gate_out", x: 1205, y: 2920 },
      { id: "red_gate_out", x: 4470, y: 2030 },
      { id: "red_gate_in", x: 4660, y: 2030 },
      { id: "red_base_core", x: 4930, y: 2030 }
    );

    world.navGraph.edges.push(
      ["blue_base", "blue_gate_in"],
      ["blue_gate_in", "blue_gate_out"],
      ["blue_gate_out", "blue_west"],
      ["blue_gate_out", "blue_south"],
      ["blue_gate_out", "west_low_road"],
      ["red_gate_out", "red_gate_in"],
      ["red_gate_in", "red_base_core"],
      ["red_base_core", "red_north_base"],
      ["red_base_core", "red_south"],
      ["red_base_core", "red_far_south"],
      ["red_gate_out", "east_center"],
      ["red_gate_out", "c_east"],
      ["red_gate_out", "d_east"],
      ["red_mid", "red_gate_out"],
      ["red_mid", "red_gate_in"]
    );
  }

  function setNode(world, id, x, y) {
    const node = world.navGraph.nodes.find((item) => item.id === id);
    if (!node) return;
    node.x = x;
    node.y = y;
  }

  function clearBaseBuildingIntrusions(world) {
    world.obstacles = world.obstacles.filter((obstacle) => {
      if (obstacle.kind !== "building") return true;
      return !(world.safeZones || []).some((zone) => (
        circleTouchesRect(zone.x, zone.y, zone.radius + 120, obstacle)
      ));
    });
  }

  function circleTouchesRect(cx, cy, radius, rect) {
    const nearestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
    const nearestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
    const dx = cx - nearestX;
    const dy = cy - nearestY;
    return dx * dx + dy * dy <= radius * radius;
  }

  expandBattlefield(world);
  IronLine.map01 = world;
})(window);
