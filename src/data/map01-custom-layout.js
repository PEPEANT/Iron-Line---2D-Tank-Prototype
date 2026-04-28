"use strict";

(function applyIronLineMapLayout(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  if (!IronLine.map01) return;

  Object.assign(IronLine.map01, {
    width: 6562,
    height: 4397,
    roadWidth: 84,
    roads: [
      [
        { x: 0, y: 1899 },
        { x: 1299, y: 2476 },
        { x: 1561, y: 2400 },
        { x: 2514, y: 2335 },
        { x: 4228, y: 2576 },
        { x: 4768, y: 3040 },
        { x: 5693, y: 3543 },
        { x: 6562, y: 4397 }
      ],
      [
        { x: 0, y: 835 },
        { x: 683, y: 1286 },
        { x: 2397, y: 1551 },
        { x: 4271, y: 1618 },
        { x: 5024, y: 1701 },
        { x: 5040, y: 0 }
      ],
      [
        { x: 1588, y: 0 },
        { x: 1854, y: 1090 },
        { x: 1893, y: 1963 },
        { x: 1747, y: 3743 },
        { x: 1348, y: 4397 }
      ],
      [
        { x: 2963, y: 0 },
        { x: 2951, y: 1248 },
        { x: 3177, y: 3349 },
        { x: 3109, y: 3970 },
        { x: 2827, y: 4397 }
      ],
      [
        { x: 0, y: 2895 },
        { x: 805, y: 2920 },
        { x: 1299, y: 2476 }
      ],
      [
        { x: 6562, y: 2080 },
        { x: 5960, y: 2200 },
        { x: 5320, y: 2465 },
        { x: 4828, y: 4387 }
      ]
    ],
    terrainPatches: [
      { x: 720, y: 980, r: 330, color: "rgba(77, 128, 79, 0.2)" },
      { x: 1740, y: 620, r: 420, color: "rgba(67, 105, 80, 0.24)" },
      { x: 2900, y: 760, r: 380, color: "rgba(86, 122, 92, 0.22)" },
      { x: 4380, y: 980, r: 430, color: "rgba(100, 115, 76, 0.21)" },
      { x: 5760, y: 1560, r: 360, color: "rgba(74, 113, 88, 0.22)" },
      { x: 1000, y: 3380, r: 460, color: "rgba(74, 113, 88, 0.24)" },
      { x: 2480, y: 3300, r: 430, color: "rgba(79, 126, 91, 0.2)" },
      { x: 3900, y: 3380, r: 460, color: "rgba(95, 113, 75, 0.22)" },
      { x: 5480, y: 3160, r: 440, color: "rgba(70, 103, 86, 0.2)" }
    ],
    obstacles: [
      { x: 1077, y: 945, w: 475, h: 121, kind: "concrete" },
      { x: 3159, y: 989, w: 121, h: 396, kind: "building" },
      { x: 3388, y: 1344, w: 436, h: 116, kind: "concrete" },
      { x: 2158, y: 1040, w: 482, h: 223, kind: "building" },
      { x: 100, y: 1400, w: 460, h: 352, kind: "building" },
      { x: 3724, y: 2763, w: 475, h: 127, kind: "concrete" },
      { x: 3601, y: 120, w: 719, h: 260, kind: "concrete" },
      { x: 3277, y: 2648, w: 145, h: 436, kind: "building" },
      { x: 4640, y: 1080, w: 226, h: 290, kind: "concrete" },
      { x: 1056, y: 2049, w: 541, h: 121, kind: "concrete" },
      { x: 2010, y: 3092, w: 152, h: 396, kind: "building" },
      { x: 3393, y: 3880, w: 207, h: 319, kind: "concrete" },
      { x: 4466, y: 3320, w: 334, h: 260, kind: "building" },
      { x: 3862, y: 4101, w: 568, h: 127, kind: "concrete" },
      { x: 4506, y: 2232, w: 330, h: 114, kind: "concrete" },
      { x: 0, y: 3400, w: 920, h: 44, kind: "base-wall" },
      { x: 40, y: 4353, w: 880, h: 44, kind: "base-wall" },
      { x: 0, y: 3430, w: 44, h: 967, kind: "base-wall" },
      { x: 886, y: 3430, w: 54, h: 230, kind: "base-wall" },
      { x: 886, y: 4100, w: 54, h: 274, kind: "base-wall" },
      { x: 280, y: 3600, w: 360, h: 63, kind: "concrete" },
      { x: 280, y: 4130, w: 360, h: 52, kind: "concrete" },
      { x: 5720, y: 90, w: 720, h: 54, kind: "base-wall" },
      { x: 5720, y: 970, w: 720, h: 54, kind: "base-wall" },
      { x: 5720, y: 90, w: 54, h: 320, kind: "base-wall" },
      { x: 5720, y: 740, w: 54, h: 284, kind: "base-wall" },
      { x: 6386, y: 90, w: 54, h: 934, kind: "base-wall" },
      { x: 5980, y: 185, w: 300, h: 58, kind: "concrete" },
      { x: 5940, y: 860, w: 360, h: 52, kind: "concrete" },
      { x: 5560, y: 2600, w: 240, h: 140, kind: "building" },
      { x: 5440, y: 2000, w: 240, h: 140, kind: "building" },
      { x: 5840, y: 1880, w: 160, h: 160, kind: "building" },
      { x: 5800, y: 3080, w: 240, h: 140, kind: "building" },
      { x: 2240, y: 3760, w: 240, h: 280, kind: "building" },
      { x: 2560, y: 2560, w: 240, h: 240, kind: "building" },
      { x: 3600, y: 1920, w: 240, h: 260, kind: "building" }
    ],
    capturePoints: [
      { name: "A", x: 990, y: 1753 },
      { name: "B", x: 2419, y: 1949 },
      { name: "C", x: 3941, y: 914 },
      { name: "D", x: 3941, y: 3355 }
    ],
    safeZones: [
      { name: "BLUE BASE", team: "blue", x: 560, y: 3890, radius: 500 },
      { name: "RED BASE", team: "red", x: 6090, y: 550, radius: 520 }
    ],
    baseExitPoints: {
      blue: { x: 1080, y: 3880, radius: 135 },
      red: { x: 5540, y: 630, radius: 135 }
    },
    spawns: {
      player: { x: 450, y: 3920 },
      playerTank: { x: 530, y: 3825, angle: -0.18 },
      blue: [
        { x: 680, y: 3705, callSign: "B-12", angle: -0.22 },
        { x: 700, y: 3905, callSign: "B-21", angle: -0.16 },
        { x: 530, y: 4010, callSign: "B-34", angle: -0.24 }
      ],
      infantryBlue: [
        { x: 340, y: 3780, callSign: "B-INF-1", angle: -0.2, weaponId: "rifle" },
        { x: 410, y: 3710, callSign: "B-INF-2", angle: -0.2, weaponId: "machinegun" },
        { x: 320, y: 3925, callSign: "B-INF-3", angle: -0.18, weaponId: "rifle" },
        { x: 420, y: 4030, callSign: "B-INF-4", angle: -0.2, weaponId: "machinegun" },
        { x: 730, y: 4150, callSign: "B-INF-5", angle: -0.28, weaponId: "rifle" },
        { x: 750, y: 4020, callSign: "B-INF-6", angle: -0.18, weaponId: "rifle" },
        { x: 250, y: 3680, callSign: "B-INF-7", angle: -0.2, weaponId: "rifle" },
        { x: 840, y: 3820, callSign: "B-INF-8", angle: -0.16, weaponId: "rifle" },
        { x: 790, y: 3795, callSign: "B-MG-1", angle: -0.16, weaponId: "machinegun" },
        { x: 815, y: 4110, callSign: "B-MG-2", angle: -0.18, weaponId: "machinegun" },
        { x: 595, y: 3690, callSign: "B-ENG-1", angle: -0.2, weaponId: "rifle", classId: "engineer", rpgAmmo: 2, repairKitAmmo: 2 },
        { x: 780, y: 3910, callSign: "B-ENG-2", angle: -0.18, weaponId: "rifle", classId: "engineer", rpgAmmo: 2, repairKitAmmo: 2 },
        { x: 740, y: 3645, callSign: "B-SCT-1", angle: -0.25, weaponId: "sniper", classId: "scout" },
        { x: 835, y: 3970, callSign: "B-SCT-2", angle: -0.22, weaponId: "sniper", classId: "scout" }
      ],
      red: [
        { x: 6020, y: 315, callSign: "R-05", angle: 3.02 },
        { x: 6185, y: 465, callSign: "R-18", angle: 3.08 },
        { x: 6020, y: 675, callSign: "R-33", angle: -3.06 },
        { x: 6185, y: 775, callSign: "R-44", angle: -3.02 }
      ],
      infantryRed: [
        { x: 6300, y: 310, callSign: "R-INF-1", angle: 3.04, weaponId: "rifle" },
        { x: 6310, y: 265, callSign: "R-INF-2", angle: 3.04, weaponId: "machinegun" },
        { x: 6320, y: 500, callSign: "R-INF-3", angle: 3.1, weaponId: "rifle" },
        { x: 6210, y: 640, callSign: "R-INF-4", angle: -3.05, weaponId: "machinegun" },
        { x: 6320, y: 780, callSign: "R-INF-5", angle: -3.05, weaponId: "rifle" },
        { x: 5860, y: 920, callSign: "R-INF-6", angle: -3.02, weaponId: "rifle" },
        { x: 5850, y: 260, callSign: "R-INF-7", angle: 3.04, weaponId: "rifle" },
        { x: 6300, y: 650, callSign: "R-INF-8", angle: -3.05, weaponId: "rifle" },
        { x: 5860, y: 750, callSign: "R-MG-1", angle: -3.05, weaponId: "machinegun" },
        { x: 5850, y: 825, callSign: "R-MG-2", angle: -3.04, weaponId: "machinegun" },
        { x: 5880, y: 385, callSign: "R-ENG-1", angle: 3.06, weaponId: "rifle", classId: "engineer", rpgAmmo: 2, repairKitAmmo: 2 },
        { x: 5880, y: 585, callSign: "R-ENG-2", angle: 3.08, weaponId: "rifle", classId: "engineer", rpgAmmo: 2, repairKitAmmo: 2 },
        { x: 5830, y: 690, callSign: "R-SCT-1", angle: -3, weaponId: "sniper", classId: "scout" },
        { x: 5840, y: 480, callSign: "R-SCT-2", angle: 3.08, weaponId: "sniper", classId: "scout" }
      ]
    },
    reconPoints: {
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
    },
    navGraph: {
      nodes: [
        { id: "blue_base", x: 560, y: 3890 },
        { id: "blue_gate_in", x: 820, y: 3880 },
        { id: "blue_gate_out", x: 1080, y: 3880 },
        { id: "blue_west", x: 1180, y: 2860 },
        { id: "blue_south", x: 1180, y: 2940 },
        { id: "blue_low", x: 1180, y: 3010 },
        { id: "west_low_road", x: 1299, y: 2476 },
        { id: "west_north_road", x: 1563, y: 1406 },
        { id: "a_west", x: 1491, y: 1565 },
        { id: "a_point", x: 990, y: 1753 },
        { id: "a_east", x: 1867, y: 1525 },
        { id: "mid_low", x: 2434, y: 1855 },
        { id: "b_point", x: 2419, y: 1949 },
        { id: "mid_north", x: 2791, y: 1578 },
        { id: "mid_south", x: 2989, y: 2370 },
        { id: "east_north", x: 3370, y: 1586 },
        { id: "east_north_bypass", x: 3920, y: 1540 },
        { id: "c_point", x: 3941, y: 914 },
        { id: "c_east", x: 4164, y: 1208 },
        { id: "east_center", x: 3950, y: 1860 },
        { id: "east_center_south", x: 3920, y: 2280 },
        { id: "d_west", x: 3517, y: 2357 },
        { id: "d_point", x: 3941, y: 3355 },
        { id: "d_east", x: 4280, y: 2600 },
        { id: "d_south_entry", x: 4280, y: 3150 },
        { id: "red_gate_out", x: 5540, y: 630 },
        { id: "red_gate_in", x: 5200, y: 1020 },
        { id: "red_base_core", x: 6090, y: 550 },
        { id: "red_north_base", x: 4780, y: 1720 },
        { id: "red_mid", x: 4500, y: 2030 },
        { id: "red_south", x: 4780, y: 2170 },
        { id: "red_far_south", x: 5020, y: 2250 },
        { id: "north_vertical", x: 2883, y: 628 },
        { id: "center_vertical", x: 2725, y: 1921 },
        { id: "south_vertical", x: 3187, y: 3180 },
        { id: "east_vertical_north", x: 3952, y: 720 },
        { id: "east_vertical_south", x: 4322, y: 3083 }
      ],
      edges: [
        ["blue_base", "blue_gate_in"],
        ["blue_gate_in", "blue_gate_out"],
        ["blue_gate_out", "blue_west"],
        ["blue_gate_out", "blue_south"],
        ["blue_gate_out", "blue_low"],
        ["blue_gate_out", "west_low_road"],
        ["blue_west", "west_low_road"],
        ["blue_south", "west_low_road"],
        ["blue_low", "west_low_road"],
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
        ["east_north", "east_north_bypass"],
        ["east_north_bypass", "c_east"],
        ["c_point", "c_east"],
        ["c_point", "east_center"],
        ["east_center", "east_center_south"],
        ["east_center_south", "d_west"],
        ["d_west", "d_east"],
        ["d_east", "d_south_entry"],
        ["d_south_entry", "d_point"],
        ["d_point", "east_vertical_south"],
        ["c_east", "red_north_base"],
        ["c_east", "red_mid"],
        ["east_center", "red_mid"],
        ["red_mid", "red_north_base"],
        ["red_mid", "red_south"],
        ["red_south", "red_far_south"],
        ["north_vertical", "mid_north"],
        ["north_vertical", "east_vertical_north"],
        ["center_vertical", "south_vertical"],
        ["south_vertical", "d_point"],
        ["east_vertical_north", "c_point"],
        ["east_vertical_south", "d_point"],
        ["red_base_core", "red_gate_out"],
        ["red_gate_out", "red_gate_in"],
        ["red_gate_in", "red_north_base"],
        ["red_gate_in", "red_mid"]
      ],
      objectiveNodes: {
        A: "a_point",
        B: "b_point",
        C: "c_point",
        D: "d_point"
      }
    }
  });
})(window);
