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
        { x: 740, y: 1710, callSign: "B-INF-4", angle: -0.42, weaponId: "rifle" },
        { x: 350, y: 1770, callSign: "B-INF-5", angle: -0.32, weaponId: "smg" }
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
        { x: 2850, y: 1765, callSign: "R-INF-4", angle: -2.75, weaponId: "rifle" },
        { x: 3145, y: 1645, callSign: "R-INF-5", angle: -2.82, weaponId: "smg" }
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

  IronLine.map01 = world;
})(window);
