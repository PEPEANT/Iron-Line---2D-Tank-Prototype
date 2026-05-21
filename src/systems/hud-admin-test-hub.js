"use strict";

(function registerHudAdminTestHub(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  const primaryTool = {
    label: "통합 테스트랩",
    url: "index.html?testLab=hub",
    note: "유닛, 드론, 밸런스, 음원, 스킨, 오브젝트 전시장을 한 화면에서 선택"
  };

  const labTools = [
    { label: "유닛", url: "index.html?testLab=unit" },
    { label: "드론", url: "index.html?testLab=drone" },
    { label: "밸런스", url: "index.html?testLab=balance" },
    { label: "음원", url: "index.html?testLab=audio" },
    { label: "스킨", url: "index.html?testLab=skin" },
    { label: "오브젝트", url: "index.html?testLab=objects" }
  ];

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

    const quick = document.createElement("div");
    quick.className = "admin-test-hub-quick";
    for (const tool of labTools) quick.append(toolButton(tool));

    const utility = document.createElement("div");
    utility.className = "admin-grid-actions admin-test-hub-actions";
    for (const tool of utilityTools) utility.append(toolButton(tool));

    const hint = document.createElement("p");
    hint.className = "admin-hint";
    hint.textContent = "권장 흐름은 통합 테스트랩에서 모드를 고르는 방식입니다. 실험장 콘솔의 관리자 패널 버튼으로 다시 돌아올 수 있습니다.";

    root.append(primary, quick, utility, hint);
    return root;
  };
})(window);
