"use strict";

(function registerHudAdminTestHub(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  const primaryTool = {
    label: "샌드박스 실험장",
    url: "index.html?testLab=sandbox",
    note: "도감에서 유닛/오브젝트를 골라 맵 클릭으로 바로 배치하고 실험"
  };

  const utilityTools = [
    {
      label: "맵 에디터",
      url: "editor.html",
      note: "맵 구조, 거점, 오브젝트를 편집"
    },
    {
      label: "게임 시작",
      url: "index.html",
      note: "일반 플레이로 진입"
    },
    {
      label: "세력 소개",
      url: "home.html",
      note: "세력 스킨과 세계관 확인"
    }
  ];

  function openTool(url) {
    window.location.href = url;
  }

  function toolButton(tool, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    if (className) button.className = className;
    button.innerHTML = `<strong>${tool.label}</strong>${tool.note ? `<span>${tool.note}</span>` : ""}`;
    button.addEventListener("click", () => openTool(tool.url));
    return button;
  }

  IronLine.createAdminTestHubBlock = function createAdminTestHubBlock() {
    const root = document.createElement("div");
    root.className = "admin-test-hub";

    const primary = document.createElement("div");
    primary.className = "admin-grid-actions admin-test-hub-actions";
    primary.append(toolButton(primaryTool, "admin-test-hub-primary"));

    const utility = document.createElement("div");
    utility.className = "admin-grid-actions admin-test-hub-actions";
    for (const tool of utilityTools) utility.append(toolButton(tool));

    const hint = document.createElement("p");
    hint.className = "admin-hint";
    hint.textContent = "샌드박스 실험장에서 카드를 고르고 맵을 클릭하면 배치됩니다. 우클릭 또는 ESC로 배치를 취소합니다.";

    root.append(primary, utility, hint);
    return root;
  };
})(window);
