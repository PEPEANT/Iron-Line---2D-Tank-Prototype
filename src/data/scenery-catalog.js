"use strict";

(function registerSceneryCatalog(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  const obstacleKinds = [
    {
      kind: "building",
      label: "\uac74\ubb3c",
      group: "\uac74\ubb3c",
      defaultSize: { w: 240, h: 150 },
      variants: [
        ["warehouse", "\ucc3d\uace0"],
        ["garage", "\ucc28\uace0"],
        ["barracks", "\ub9c9\uc0ac"],
        ["service-block", "\uc815\ube44\uc18c"],
        ["depot", "\ubcf4\uae09\ucc3d"],
        ["bunker", "\ubc99\ucee4"],
        ["checkpoint", "\uac80\ubb38\uc18c"]
      ]
    },
    {
      kind: "base-wall",
      label: "\uae30\uc9c0 \ubcbd",
      group: "\ubcbd",
      defaultSize: { w: 280, h: 46 },
      variants: [["fortified-base-wall", "\ubc29\ud638\ubcbd"]]
    },
    {
      kind: "concrete",
      label: "\ucf58\ud06c\ub9ac\ud2b8 \ubcbd",
      group: "\ubcbd",
      defaultSize: { w: 220, h: 42 },
      variants: [
        ["blast-wall", "\ubc29\ud3ed\ubcbd"],
        ["checkpoint-wall", "\uac80\ubb38 \ubcbd"],
        ["retaining-wall", "\uc678\uacfd \ubcbd"],
        ["roadblock-wall", "\ucc28\ub2e8\ubcbd"]
      ]
    },
    {
      kind: "sandbag",
      label: "\ubaa8\ub798\uc8fc\uba38\ub2c8",
      group: "\ubc14\ub9ac\ucf00\uc774\ub4dc",
      defaultSize: { w: 180, h: 34 },
      destructible: true,
      variants: [["sandbag-line", "\uc77c\uc790"], ["sandbag-nest", "\uc9c4\uc9c0"]]
    },
    {
      kind: "barricade",
      label: "\ub300\uc804\ucc28 \ubc14\ub9ac\ucf00\uc774\ub4dc",
      group: "\ubc14\ub9ac\ucf00\uc774\ub4dc",
      defaultSize: { w: 170, h: 34 },
      destructible: true,
      variants: [["dragon-teeth", "\uc6a9\uce58"], ["steel-hedgehog", "\ucca0\uc81c \ubc29\ud574\ubb3c"]]
    },
    {
      kind: "wood-fence",
      label: "\ub098\ubb34 \uc6b8\ud0c0\ub9ac",
      group: "\ubc14\ub9ac\ucf00\uc774\ub4dc",
      defaultSize: { w: 190, h: 28 },
      destructible: true,
      variants: [["wood-fence", "\uae30\ubcf8"], ["broken-fence", "\ud30c\uc190\ud615"]]
    },
    {
      kind: "tree",
      label: "\ub098\ubb34",
      group: "\uc790\uc5f0\ubb3c",
      defaultSize: { w: 70, h: 70 },
      destructible: true,
      variants: [["pine", "\uce68\uc5fd\uc218"], ["broadleaf", "\ud65c\uc5fd\uc218"], ["burnt-tree", "\uadf8\uc744\ub9b0 \ub098\ubb34"]]
    },
    {
      kind: "brush",
      label: "\uc218\ud480",
      group: "\uc790\uc5f0\ubb3c",
      defaultSize: { w: 120, h: 90 },
      variants: [["brush", "\ub0ae\uc740 \uc218\ud480"], ["tall-grass", "\uae34 \ud480"]]
    },
    {
      kind: "rubble",
      label: "\uc794\ud574",
      group: "\uc794\ud574",
      defaultSize: { w: 130, h: 90 },
      variants: [["concrete-rubble", "\ucf58\ud06c\ub9ac\ud2b8"], ["burnt-rubble", "\uc804\uc18c \uc794\ud574"]]
    }
  ];

  const byKind = new Map(obstacleKinds.map((item) => [item.kind, item]));

  IronLine.sceneryCatalog = {
    obstacleKinds,
    getObstacleKind(kind) {
      return byKind.get(kind) || byKind.get("concrete");
    },
    obstacleKindLabel(kind) {
      return this.getObstacleKind(kind)?.label || kind || "\uc624\ube0c\uc81d\ud2b8";
    },
    variantLabel(kind, variant) {
      const item = this.getObstacleKind(kind);
      return item?.variants?.find(([id]) => id === variant)?.[1] || variant || "\uae30\ubcf8";
    },
    defaultVariant(kind) {
      return this.getObstacleKind(kind)?.variants?.[0]?.[0] || "";
    },
    defaultSize(kind) {
      return { ...(this.getObstacleKind(kind)?.defaultSize || { w: 160, h: 60 }) };
    }
  };
})(window);
