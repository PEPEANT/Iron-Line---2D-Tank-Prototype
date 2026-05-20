"use strict";

(function registerChat(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  class ChatSystem {
    constructor(game) {
      this.game = game;
      this.messages = [];
      this.mode = "team";
      this.open = false;
      this.maxMessages = 36;
      this.visibleMs = 9000;
      this.seenRoomChat = new Set();
      this.roomChatPoll = 0;
      this.nodes = {};
      this.ensure();
      window.addEventListener("keydown", (event) => this.onKeyDown(event), true);
    }

    ensure() {
      if (this.nodes.root) return;

      const root = document.createElement("section");
      root.id = "chatPanel";
      root.className = "chat-panel";
      root.setAttribute("aria-label", "\ucc44\ud305");

      const log = document.createElement("div");
      log.id = "chatLog";
      log.className = "chat-log";

      const form = document.createElement("form");
      form.className = "chat-form hidden";

      const mode = document.createElement("button");
      mode.type = "button";
      mode.className = "chat-mode";
      mode.textContent = this.modeLabel(this.mode);
      mode.addEventListener("click", () => this.toggleMode());

      const input = document.createElement("input");
      input.id = "chatInput";
      input.type = "text";
      input.maxLength = 120;
      input.autocomplete = "off";
      input.placeholder = "\uba54\uc2dc\uc9c0 \uc785\ub825";

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        this.submit();
      });
      form.append(mode, input);
      root.append(log, form);
      document.body.append(root);

      this.nodes = { root, log, form, mode, input };
      this.addSystemMessage("T \ucc44\ud305 \u00b7 Enter \uc804\uc1a1 \u00b7 Tab \uc804\uccb4/\ud300 \uc804\ud658");
    }

    onKeyDown(event) {
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      const editable = target?.matches?.("input, textarea, select") || target?.isContentEditable;

      if (this.open) {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          this.close();
        } else if (event.key === "Tab") {
          event.preventDefault();
          event.stopPropagation();
          this.toggleMode();
        }
        return;
      }

      if (editable) return;
      if (event.code !== "KeyT") return;
      if (!this.canOpen()) return;
      event.preventDefault();
      event.stopPropagation();
      this.openInput();
    }

    canOpen() {
      const game = this.game;
      if (!game || game.entryOpen || game.deploymentOpen || game.lobbyOpen) return false;
      if (game.adminObserverMode && !game.spectatorMode) return false;
      if (game.roleChange?.open) return false;
      return Boolean(game.spectatorMode || game.matchStarted || game.playerDeathActive || game.playerDowned || game.result);
    }

    openInput() {
      if (!this.availableModes().includes(this.mode)) this.mode = this.availableModes()[0] || "all";
      if (this.nodes.mode) this.nodes.mode.textContent = this.modeLabel(this.mode);
      this.open = true;
      this.nodes.form?.classList.remove("hidden");
      this.nodes.input.value = "";
      this.nodes.input.focus();
      this.game.input?.clear?.();
    }

    close() {
      this.open = false;
      this.nodes.form?.classList.add("hidden");
      this.nodes.input?.blur();
      this.game.canvas?.focus?.();
    }

    toggleMode() {
      const modes = this.availableModes();
      const index = Math.max(0, modes.indexOf(this.mode));
      this.mode = modes[(index + 1) % modes.length] || "all";
      if (this.nodes.mode) this.nodes.mode.textContent = this.modeLabel(this.mode);
    }

    availableModes() {
      if (this.game.casterMode) return ["caster", "spectator", "all"];
      if (this.game.spectatorMode) return ["spectator", "all"];
      return ["team", "all"];
    }

    modeLabel(mode) {
      if (mode === "team") return "\ud300";
      if (mode === "spectator") return "\uad00\uc804";
      if (mode === "caster") return "\ud574\uc124";
      if (mode === "system") return "\uc54c\ub9bc";
      return "\uc804\uccb4";
    }

    submit() {
      const text = String(this.nodes.input?.value || "").replace(/\s+/g, " ").trim();
      if (text) {
        if (!this.availableModes().includes(this.mode)) this.mode = this.availableModes()[0] || "all";
        const payload = {
          channel: this.mode,
          sender: this.game.localProfile?.nickname || "Player",
          text,
          team: this.game.player?.team || IronLine.constants?.TEAM?.BLUE,
          participantType: this.game.localSessionParticipantType?.() || "player",
          playerId: this.game.onlineSession?.playerId || this.game.localProfile?.playerId || ""
        };
        const roomId = this.game.sessionMode === "online" ? this.game.onlineSession?.roomId : "";
        const saved = roomId ? IronLine.roomRegistry?.pushChat?.(roomId, payload) : null;
        if (saved?.id) {
          this.seenRoomChat.add(saved.id);
          this.addMessage(saved);
        } else {
          this.addMessage(payload);
        }
      }
      this.close();
    }

    addSystemMessage(text) {
      this.addMessage({ channel: "system", sender: "\uc2dc\uc2a4\ud15c", text });
    }

    addMessage(message) {
      const now = performance.now();
      this.messages.push({
        id: message.id || `${now}:${Math.random().toString(36).slice(2, 7)}`,
        channel: message.channel || "team",
        sender: message.sender || "Player",
        text: String(message.text || "").slice(0, 120),
        team: message.team || "",
        participantType: message.participantType || "player",
        createdAt: Number(message.createdAt) > 1000000000 ? now : Number(message.createdAt) || now
      });
      if (this.messages.length > this.maxMessages) this.messages.splice(0, this.messages.length - this.maxMessages);
      this.render();
    }

    update(dt = 0) {
      this.pullRoomChat(dt);
      this.render();
    }

    pullRoomChat(dt = 0) {
      if (this.game.sessionMode !== "online" || !this.game.onlineSession?.roomId) return;
      this.roomChatPoll -= Number(dt) || 0.016;
      if (this.roomChatPoll > 0) return;
      this.roomChatPoll = 0.5;
      const messages = IronLine.roomRegistry?.recentChat?.(this.game.onlineSession.roomId, 40) || [];
      for (const message of messages) {
        if (!message?.id || this.seenRoomChat.has(message.id)) continue;
        if (!this.canSeeRoomChat(message)) continue;
        this.seenRoomChat.add(message.id);
        this.addMessage(message);
      }
    }

    canSeeRoomChat(message) {
      const channel = message.channel || "all";
      if (channel === "system" || channel === "all" || channel === "caster") return true;
      const participantType = this.game.localSessionParticipantType?.() || "player";
      if (channel === "team") {
        return participantType !== "spectator" && message.team === (this.game.player?.team || IronLine.constants?.TEAM?.BLUE);
      }
      if (channel === "spectator") {
        if (["spectator", "caster", "admin"].includes(participantType)) return true;
        const room = IronLine.roomRegistry?.getRoom?.(this.game.onlineSession?.roomId);
        return Boolean(room?.spectatorChatVisibleToPlayers);
      }
      return true;
    }

    render() {
      const log = this.nodes.log;
      if (!log) return;
      const now = performance.now();
      const visible = this.open
        ? this.messages.slice(-12)
        : this.messages.filter((item) => now - item.createdAt <= this.visibleMs).slice(-6);
      log.textContent = "";
      log.classList.toggle("quiet", !this.open);
      for (const item of visible) {
        const row = document.createElement("div");
        row.className = `chat-message ${item.channel}`;
        row.textContent = `[${this.modeLabel(item.channel)}] ${item.sender}: ${item.text}`;
        log.append(row);
      }
    }
  }

  IronLine.ChatSystem = ChatSystem;
})(window);
