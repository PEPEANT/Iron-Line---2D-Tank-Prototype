"use strict";

(function registerOnlineLobby(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  class OnlineLobby {
    constructor(flow) {
      this.flow = flow;
      this.nodes = {};
    }

    ensure() {
      if (this.nodes.notice) return;
      const actions = document.querySelector(".lobby-actions");
      if (!actions) return;
      const notice = document.createElement("div");
      notice.id = "onlineAdminStartNotice";
      notice.className = "online-admin-start-notice hidden";
      notice.textContent = "관리자 시작 대기 중";
      actions.insertBefore(notice, actions.firstChild);
      this.nodes.notice = notice;
    }

    update(game) {
      this.ensure();
      if (!this.nodes.notice || !game) return;
      const visible = game.sessionMode === "online" && game.lobbyOpen && !game.roomListOpen;
      this.nodes.notice.classList.toggle("hidden", !visible);
      if (!visible) return;
      const room = IronLine.roomRegistry?.getRoom?.(game.onlineSession?.roomId || "");
      this.nodes.notice.textContent = room?.phase === "playing"
        ? "관리자가 전투를 시작했습니다"
        : "관리자 시작 대기 중";
    }
  }

  IronLine.OnlineLobby = OnlineLobby;
})(window);
