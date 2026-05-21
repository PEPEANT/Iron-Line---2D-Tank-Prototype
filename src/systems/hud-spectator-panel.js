"use strict";

(function registerHudSpectatorPanel(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  const LABEL = {
    title: "\uad00\uc804\uc790",
    chat: "\ucc44\ud305",
    aria: "\uad00\uc804\uc790 \ud604\ud669",
    player: "\ud50c\ub808\uc774\uc5b4",
    spectator: "\uad00\uc804",
    admin: "\uad00\ub9ac\uc790",
    emptyChat: "\uad00\uc804 \ucc44\ud305 \ub300\uae30",
    defaultName: "\uad00\uc804\uc790",
    close: "\ub2eb\uae30",
    open: "\uc5f4\uae30"
  };

  const hudSpectatorPanelMethods = {
    ensureSpectatorPanel() {
      if (this.nodes.spectatorPanel) return this.nodes.spectatorPanel;
      const panel = document.createElement("aside");
      panel.id = "spectatorPanel";
      panel.className = "spectator-panel hidden";
      panel.setAttribute("aria-label", LABEL.aria);
      panel.innerHTML = `
        <header>
          <strong>${LABEL.title}</strong>
          <button type="button" id="spectatorChatOpen">${LABEL.chat}</button>
          <button type="button" id="spectatorPanelToggle">${LABEL.close}</button>
        </header>
        <div class="spectator-panel-counts" id="spectatorPanelCounts"></div>
        <div class="spectator-panel-chat" id="spectatorPanelChat"></div>
      `;
      document.body.append(panel);
      this.nodes.spectatorPanel = panel;
      this.nodes.spectatorPanelCounts = panel.querySelector("#spectatorPanelCounts");
      this.nodes.spectatorPanelChat = panel.querySelector("#spectatorPanelChat");
      this.nodes.spectatorChatOpen = panel.querySelector("#spectatorChatOpen");
      this.nodes.spectatorPanelToggle = panel.querySelector("#spectatorPanelToggle");
      this.nodes.spectatorChatOpen?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        IronLine.game?.chat?.openInput?.();
      });
      this.nodes.spectatorPanelToggle?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.spectatorPanelCollapsed = !this.spectatorPanelCollapsed;
        this.applySpectatorPanelCollapsed();
      });
      return panel;
    },

    updateSpectatorPanel(game) {
      const panel = this.ensureSpectatorPanel();
      const visible = Boolean(
        game?.spectatorMode &&
        !game.entryOpen &&
        !game.deploymentOpen &&
        !game.lobbyOpen &&
        !game.roomListOpen &&
        !game.result
      );
      panel.classList.toggle("hidden", !visible);
      if (!visible) return;
      this.applySpectatorPanelCollapsed();

      const data = this.spectatorPanelData(game);
      const signature = JSON.stringify(data);
      if (panel.dataset.signature === signature) return;
      panel.dataset.signature = signature;
      this.renderSpectatorPanelCounts(data.counts);
      this.renderSpectatorPanelChat(data.messages);
    },

    spectatorPanelData(game) {
      const session = game.onlineSession || {};
      const roomId = session.roomId || "";
      const room = roomId ? IronLine.roomRegistry?.getRoom?.(roomId) : null;
      const players = Array.isArray(room?.players) ? room.players : (session.players || []);
      const spectators = Array.isArray(room?.spectators) ? room.spectators : (session.spectators || []);
      const admins = Array.isArray(room?.admins) ? room.admins : [];
      const localId = session.playerId || game.localProfile?.playerId || "";
      const participantRows = [...players, ...spectators, ...admins].filter(Boolean);
      const localKnown = localId && participantRows.some((item) => item.id === localId);
      const localType = game.localSessionParticipantType?.() || session.participantType || "spectator";
      const allParticipants = localKnown || !game.spectatorMode
        ? participantRows
        : [
            ...participantRows,
            {
              id: localId || "local-spectator",
              participantType: localType,
              name: game.localProfile?.nickname || "Spectator"
            }
          ];
      const playersCount = allParticipants.filter((item) => (item.participantType || "player") === "player").length;
      const adminCount = allParticipants.filter((item) => item.participantType === "admin").length +
        (game.adminObserverMode && !game.spectatorMode ? 1 : 0);
      const spectatorCount = allParticipants.filter((item) => {
        const type = item.participantType || "player";
        return type === "spectator" || type === "caster";
      }).length;
      const aiCount = (session.roleSlots || []).filter((slot) => slot.aiControlled !== false && !slot.playerId).length;
      const messages = (roomId ? IronLine.roomRegistry?.recentChat?.(roomId, 32) || [] : [])
        .filter((message) => ["spectator", "caster"].includes(message.channel || ""))
        .slice(-3)
        .map((message) => ({
          id: message.id || "",
          sender: message.sender || LABEL.defaultName,
          text: message.text || "",
          channel: message.channel || "spectator"
        }));
      return {
        counts: {
          players: playersCount,
          spectators: spectatorCount,
          admins: adminCount,
          ai: aiCount
        },
        messages
      };
    },

    renderSpectatorPanelCounts(counts) {
      const root = this.nodes.spectatorPanelCounts;
      if (!root) return;
      root.textContent = "";
      for (const [label, value] of [[LABEL.player, counts.players], [LABEL.spectator, counts.spectators], [LABEL.admin, counts.admins], ["AI", counts.ai]]) {
        const item = document.createElement("div");
        const title = document.createElement("span");
        title.textContent = label;
        const count = document.createElement("strong");
        count.textContent = String(value || 0);
        item.append(title, count);
        root.append(item);
      }
    },

    renderSpectatorPanelChat(messages) {
      const root = this.nodes.spectatorPanelChat;
      if (!root) return;
      root.textContent = "";
      if (!messages.length) {
        const empty = document.createElement("span");
        empty.className = "spectator-panel-empty";
        empty.textContent = LABEL.emptyChat;
        root.append(empty);
        return;
      }
      for (const message of messages) {
        const row = document.createElement("div");
        row.className = `spectator-panel-message ${message.channel}`;
        const sender = document.createElement("b");
        sender.textContent = message.sender;
        const text = document.createElement("span");
        text.textContent = message.text;
        row.append(sender, text);
        root.append(row);
      }
    },

    applySpectatorPanelCollapsed() {
      const collapsed = Boolean(this.spectatorPanelCollapsed);
      this.nodes.spectatorPanel?.classList.toggle("collapsed", collapsed);
      if (this.nodes.spectatorPanelToggle) {
        this.nodes.spectatorPanelToggle.textContent = collapsed ? LABEL.open : LABEL.close;
        this.nodes.spectatorPanelToggle.setAttribute("aria-expanded", String(!collapsed));
      }
    }
  };

  function installHudSpectatorPanel(Hud) {
    Object.assign(Hud.prototype, hudSpectatorPanelMethods);
  }

  IronLine.installHudSpectatorPanel = installHudSpectatorPanel;
})(window);
