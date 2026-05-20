"use strict";

(function registerSceneryCatalog(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  const obstacleKinds = [
    {
      kind: "building",
      label: "건물",
      group: "건물",
      defaultSize: { w: 240, h: 150 },
      variants: [
        ["warehouse", "창고"],
        ["garage", "차고"],
        ["barracks", "막사"],
        ["service-block", "정비동"],
        ["depot", "보급고"],
        ["bunker", "벙커"],
        ["checkpoint", "검문소"]
      ]
    },
    {
      kind: "base-wall",
      label: "기지 벽",
      group: "벽",
      defaultSize: { w: 280, h: 46 },
      variants: [["fortified-base-wall", "방호벽"]]
    },
    {
      kind: "concrete",
      label: "콘크리트 벽",
      group: "벽",
      defaultSize: { w: 220, h: 42 },
      variants: [
        ["blast-wall", "방폭벽"],
        ["checkpoint-wall", "검문 벽"],
        ["retaining-wall", "옹벽"],
        ["roadblock-wall", "차단벽"]
      ]
    },
    {
      kind: "sandbag",
      label: "모래주머니",
      group: "바리케이드",
      defaultSize: { w: 180, h: 34 },
      destructible: true,
      variants: [["sandbag-line", "일자"], ["sandbag-nest", "진지"]]
    },
    {
      kind: "barricade",
      label: "대전차 바리케이드",
      group: "바리케이드",
      defaultSize: { w: 170, h: 34 },
      destructible: true,
      variants: [["dragon-teeth", "용치"], ["steel-hedgehog", "철제 장애물"]]
    },
    {
      kind: "wood-fence",
      label: "나무 울타리",
      group: "바리케이드",
      defaultSize: { w: 190, h: 28 },
      destructible: true,
      variants: [["wood-fence", "기본"], ["broken-fence", "파손됨"]]
    },
    {
      kind: "tree",
      label: "나무",
      group: "자연물",
      defaultSize: { w: 70, h: 70 },
      destructible: true,
      variants: [["pine", "침엽수"], ["broadleaf", "활엽수"], ["burnt-tree", "그을린 나무"]]
    },
    {
      kind: "brush",
      label: "수풀",
      group: "자연물",
      defaultSize: { w: 120, h: 90 },
      variants: [["brush", "낮은 수풀"], ["tall-grass", "긴 풀"]]
    },
    {
      kind: "rubble",
      label: "잔해",
      group: "폐허",
      defaultSize: { w: 130, h: 90 },
      variants: [["concrete-rubble", "콘크리트"], ["burnt-rubble", "전소 잔해"]]
    }
  ];

  const byKind = new Map(obstacleKinds.map((item) => [item.kind, item]));

  IronLine.sceneryCatalog = {
    obstacleKinds,
    getObstacleKind(kind) {
      return byKind.get(kind) || byKind.get("concrete");
    },
    obstacleKindLabel(kind) {
      return this.getObstacleKind(kind)?.label || kind || "오브젝트";
    },
    variantLabel(kind, variant) {
      const item = this.getObstacleKind(kind);
      return item?.variants?.find(([id]) => id === variant)?.[1] || variant || "기본";
    },
    defaultVariant(kind) {
      return this.getObstacleKind(kind)?.variants?.[0]?.[0] || "";
    },
    defaultSize(kind) {
      return { ...(this.getObstacleKind(kind)?.defaultSize || { w: 160, h: 60 }) };
    }
  };
})(window);
