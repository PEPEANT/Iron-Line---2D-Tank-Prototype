"use strict";

(function registerTestLabP0Online(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const TestLabUI = IronLine.TestLabUI;
  if (!TestLabUI) return;

  const baseRenderHubBody = TestLabUI.prototype.renderHubBody;

  function commandList() {
    return [
      "node tools/check-p0-ai-playtest-harness.cjs",
      "node tools/check-p0-http-combat-load.cjs",
      "node tools/check-p0-real-browser-2p.cjs",
      "node tools/check-p0-team-damage-full-path.cjs"
    ].map((command) => `<code>${command}</code>`).join("");
  }

  function checklist() {
    return [
      "2인 이동만",
      "small_arms 교전",
      "projectile 교전",
      "admin/observer OFF vs ON",
      "청팀/홍팀 교차",
      "same-team damage 확인"
    ].map((item) => `<li>${item}</li>`).join("");
  }

  function branchTable() {
    return [
      ["기본 2인도 끊김", "WebSocket 전투 채널 최소 실험"],
      ["admin ON에서만 끊김", "admin/observer 분리"],
      ["AI ON에서만 끊김", "AI/worldState 부하 분리"],
      ["팀 피해 재발", "team/damage 실패 경로 수정"],
      ["2인 안정", "제한 4인 준비 체크"]
    ].map(([signal, branch]) => `
      <article>
        <strong>${signal}</strong>
        <span>${branch}</span>
      </article>
    `).join("");
  }

  function renderP0OnlinePanel() {
    return `
      <div class="test-lab-section test-lab-p0-online">
        <div class="test-lab-section-title">
          <strong>P0 온라인 검증</strong>
          <span>읽기 전용 체크리스트</span>
        </div>
        <div class="test-lab-p0-note">
          <strong>제한 알파 HOLD</strong>
          <span>브라우저에서 Node 검증을 직접 실행하지 않습니다. 아래 명령은 터미널에서만 실행합니다.</span>
        </div>
        <div class="test-lab-p0-command-list" aria-label="P0 검증 명령">
          ${commandList()}
        </div>
        <div class="test-lab-p0-grid">
          <article>
            <strong>수동 2인 체크</strong>
            <ul>${checklist()}</ul>
          </article>
          <article>
            <strong>관련 문서</strong>
            <a href="docs/p0-limited-manual-playtest-prep-2026-05-23.md">P0 수동 테스트 준비</a>
            <a href="docs/p0-ai-playtest-harness-design-2026-05-23.md">P0 AI Playtest Harness</a>
            <a href="docs/p0-active-room-detail-cursor-design-2026-05-23.md">P0 active-room detail cursor</a>
          </article>
        </div>
        <div class="test-lab-p0-branches" aria-label="P0 결과별 다음 분기">
          ${branchTable()}
        </div>
      </div>
    `;
  }

  TestLabUI.prototype.renderHubBody = function renderHubBodyWithP0Online() {
    const body = typeof baseRenderHubBody === "function" ? baseRenderHubBody.call(this) : "";
    return `${body}${renderP0OnlinePanel()}`;
  };
})(window);
