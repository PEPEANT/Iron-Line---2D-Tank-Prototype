"use strict";

(function registerHudAdminNotes(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  const hudAdminNotesMethods = {
    createAdminPlaytestNotesBlock() {
      const notes = document.createElement("div");
      notes.id = "adminPlaytestNotes";
      notes.className = "admin-playtest-notes";
      notes.innerHTML = `
        <textarea id="adminPlaytestNotesInput" spellcheck="false" placeholder="관전 중 발견한 문제를 적어두세요. 예: 22:14 A 거점 근처 공병 수리 루프 멈춤"></textarea>
        <div class="admin-grid-actions admin-note-actions">
          <button type="button" data-admin-action="note-time">시간 삽입</button>
          <button type="button" data-admin-action="note-state">현재 상태 붙이기</button>
          <button type="button" data-admin-action="note-template">이슈 템플릿</button>
          <button type="button" data-admin-action="note-export">MD 내보내기</button>
          <button type="button" data-admin-action="note-clear">초기화</button>
        </div>
      `;
      return notes;
    },

    bindPlaytestNotes() {
      const input = this.nodes.adminPlaytestNotesInput;
      const game = IronLine.game;
      if (!input || input.dataset.bound === "1") return;
      input.dataset.bound = "1";
      input.value = game?.adminOps?.playtestNotes?.() || "";
      input.addEventListener("input", () => {
        game?.adminOps?.savePlaytestNotes?.(input.value);
      });
    },

    runPlaytestNoteAction(action) {
      const game = IronLine.game;
      const input = this.nodes.adminPlaytestNotesInput;
      if (!game?.adminOps || !input) return false;

      const append = (text) => {
        const prefix = input.value.trimEnd() ? "\n\n" : "";
        input.value = `${input.value.trimEnd()}${prefix}${text}`;
        game.adminOps.savePlaytestNotes(input.value);
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      };

      if (action === "note-time") {
        append(`- ${game.adminOps.playtestTimestamp()} `);
        game.adminNotify?.("노트에 시간을 삽입했습니다.");
        return true;
      }
      if (action === "note-state") {
        append(game.adminOps.playtestStateBlock());
        game.adminNotify?.("현재 상태를 노트에 붙였습니다.");
        return true;
      }
      if (action === "note-template") {
        append(game.adminOps.playtestIssueTemplate());
        game.adminNotify?.("이슈 템플릿을 추가했습니다.");
        return true;
      }
      if (action === "note-export") {
        game.adminOps.downloadPlaytestNotes();
        game.adminNotify?.("플레이테스트 노트를 내보냈습니다.");
        return true;
      }
      if (action === "note-clear") {
        input.value = "";
        game.adminOps.clearPlaytestNotes();
        game.adminNotify?.("플레이테스트 노트를 초기화했습니다.");
        return true;
      }
      return false;
    }
  };

  function installHudAdminNotes(HUD) {
    Object.assign(HUD.prototype, hudAdminNotesMethods);
  }

  IronLine.installHudAdminNotes = installHudAdminNotes;
})(window);
