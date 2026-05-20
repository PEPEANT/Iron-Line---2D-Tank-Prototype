"use strict";

(function registerHudAdminLabels(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  IronLine.adminAiDecisionLabel = function adminAiDecisionLabel(decision) {
    const labels = {
      fire: "사격",
      hold_fire: "사격 보류",
      aim: "조준",
      move: "이동",
      recover_move: "끼임 복구",
      cover: "엄폐",
      spread: "산개",
      advance: "진격",
      prone: "엎드림",
      hold_position: "위치 유지",
      unload: "하차",
      hold_passengers: "하차 보류",
      transport: "수송",
      take_cover: "이탈/엄폐",
      mount: "재탑승",
      mounted: "탑승 중",
      remount: "재탑승",
      repair: "수리",
      hold_repair: "수리 대기",
      idle: "대기"
    };
    return labels[decision] || decision || "-";
  };
})(window);
