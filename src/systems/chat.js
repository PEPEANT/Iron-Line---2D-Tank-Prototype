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
      this.nodes = {};
      this.ensure();
      window.addEventListener("keydown", (event) => this.onKeyDown(event), true);
    }

    ensure() {
      if (this.nodes.root) return;

      const root = document.createElement("section");
      root.id = "chatPanel";
      root.className = "chat-panel";
      root.setAttribute("aria-label", "채팅");

      const log = document.createElement("div");
      log.id = "chatLog";
      log.className = "chat-log";

      const form = document.createElement("form");
      form.className = "chat-form hidden";

      const mode = document.createElement("button");
      mode.type = "button";
      mode.className = "chat-mode";
      mode.textContent = "팀";
      mode.addEventListener("click", () => this.toggleMode());

      const input = document.createElement("input");
      input.id = "chatInput";
      input.type = "text";
      input.maxLength = 120;
      input.autocomplete = "off";
      input.placeholder = "메시지 입력";

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        this.submit();
      });
      form.append(mode, input);
      root.append(log, form);
      document.body.append(root);

      this.nodes = { root, log, form, mode, input };
      this.addSystemMessage("T 채팅 · Enter 전송 · Tab 전체/팀 전환");
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
      if (mode === "team") return "팀";
      if (mode === "spectator") return "관전";
      if (mode === "caster") return "해설";
      return "전체";
    }

    submit() {
      const text = String(this.nodes.input?.value || "").replace(/\s+/g, " ").trim();
      if (text) {
        if (!this.availableModes().includes(this.mode)) this.mode = this.availableModes()[0] || "all";
        this.addMessage({
          channel: this.mode,
          sender: this.game.localProfile?.nickname || "Player",
          text,
          team: this.game.player?.team || IronLine.constants?.TEAM?.BLUE,
          participantType: this.game.localSessionParticipantType?.() || "player"
        });
      }
      this.close();
    }

    addSystemMessage(text) {
      this.addMessage({ channel: "system", sender: "시스템", text });
    }

    addMessage(message) {
      const now = performance.now();
      this.messages.push({
        id: `${now}:${Math.random().toString(36).slice(2, 7)}`,
        channel: message.channel || "team",
        sender: message.sender || "Player",
        text: String(message.text || "").slice(0, 120),
        team: message.team || "",
        participantType: message.participantType || "player",
        createdAt: now
      });
      if (this.messages.length > this.maxMessages) this.messages.splice(0, this.messages.length - this.maxMessages);
      this.render();
    }

    update() {
      this.render();
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
