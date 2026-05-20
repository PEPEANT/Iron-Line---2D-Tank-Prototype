"use strict";

(function registerHudAdminMapTools(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  function actionButton(action, label, hud = null) {
    if (hud?.adminActionButton) return hud.adminActionButton(action, label);
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.adminAction = action;
    button.textContent = label;
    return button;
  }

  IronLine.createAdminMapToolsBlock = function createAdminMapToolsBlock(hud = null) {
    const root = document.createElement("div");
    root.className = "admin-map-tools";

    const summary = document.createElement("div");
    summary.id = "adminMapToolsSummary";
    summary.className = "admin-observer-list admin-map-tools-summary";

    const actions = document.createElement("div");
    actions.className = "admin-grid-actions admin-map-actions";
    actions.append(
      actionButton("map-open-editor", "맵 에디터 열기", hud),
      actionButton("map-open-current", "현재 맵 편집", hud),
      actionButton("map-validate", "맵 검증", hud),
      actionButton("map-run-test", "테스트 전장 실행", hud),
      actionButton("map-download-snapshot", "맵 JSON 내보내기", hud)
    );

    const hint = document.createElement("p");
    hint.className = "admin-hint";
    hint.textContent = "맵 에디터는 별도 전체화면 도구로 열고, 검증 결과는 플레이테스트 노트에 남깁니다.";

    root.append(summary, actions, hint);
    return root;
  };
})(window);
