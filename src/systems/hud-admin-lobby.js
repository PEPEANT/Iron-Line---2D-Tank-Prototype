"use strict";

(function registerHudAdminLobby(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const { TEAM } = IronLine.constants;

  const hudAdminLobbyMethods = {
    selectedAdminRoom(snapshot) {
      const rooms = Array.isArray(snapshot?.rooms) ? snapshot.rooms : [];
      const selectedId = snapshot?.selectedRoomId || snapshot?.room?.id || rooms[0]?.id || "";
      return rooms.find((room) => room.id === selectedId) || snapshot?.room || rooms[0] || null;
    },

    setAdminRoomControlValue(control, value, force = false) {
      if (!control) return;
      if (!force && document.activeElement === control) return;
      if (force || !control.value) control.value = String(value);
    },

    adminDifficultyLabel(id = "normal") {
      if (id === "easy") return "쉬움";
      if (id === "hard") return "어려움";
      return "보통";
    },

    updateAdminOpsLobby(snapshot) {
      const status = this.nodes.adminOpsLobbyStatus;
      const chat = this.nodes.adminOpsLobbyChat;
      const input = this.nodes.adminOpsLobbyChatInput;
      const send = this.nodes.adminOpsLobbyChatForm?.querySelector("button[type='submit']");
      if (!status || !chat || !snapshot) return;

      const room = this.selectedAdminRoom(snapshot);
      const hasRoom = Boolean(room?.id && room.id !== "local");
      if (input) input.disabled = !hasRoom;
      if (send) send.disabled = !hasRoom;

      const messages = hasRoom ? IronLine.roomRegistry?.recentChat?.(room.id, 32) || [] : [];
      const players = hasRoom ? (room.players || []).filter((player) => (player.participantType || "player") === "player") : [];
      const spectators = hasRoom ? (room.spectators || []) : [];
      const admins = hasRoom ? (room.admins || []) : [];
      if (hasRoom) this.touchAdminOpsPresence(room.id);
      const ready = players.filter((player) => player.ready).length;
      const spectatorCapacity = Math.max(0, Math.round(Number(room?.spectatorCapacity) || 12));
      const statusRows = hasRoom
        ? [
            { title: `${room.id} · ${room.name || "대기방"}`, meta: `${this.adminRoomPhaseLabel(room.phase)} · ${room.mode === "conquest" ? "점령전" : "섬멸전"} · ${this.factionName(room.blueFactionId)} vs ${this.factionName(room.redFactionId)}` },
            { title: `플레이어 ${players.length}/${room.capacity || 8} · 준비 ${ready}/${Math.max(players.length, 1)}`, meta: `관전자 ${spectators.length}/${spectatorCapacity}` },
            { title: `관리자 ${Math.max(admins.length, 1)}명`, meta: "운영센터 접속" },
            { title: "입장 상태", meta: room.phase === "waiting" ? "대기방 입장 가능 · 관전자 입장 가능" : room.phase === "playing" ? "진행 중 · 관전자 입장 가능" : this.adminRoomPhaseLabel(room.phase) }
          ]
        : [
            { title: "생성된 방 없음", meta: "방 제어에서 방을 생성하면 대기방 상태와 채팅이 여기에 표시됩니다." }
          ];
      const participantRows = hasRoom
        ? [
            ...players.map((player) => ({
              id: player.id,
              title: `${player.name || player.nickname || "Player"} · ${this.roomTeamLabel(player.team)}`,
              meta: `${this.slotLabel(player.slotId)} · ${player.ready ? "준비 완료" : "대기 중"}`,
              participantType: "player"
            })),
            ...spectators.map((player) => ({
              id: player.id,
              title: `${player.name || player.nickname || "Spectator"} · ${this.participantTypeLabel(player.participantType)}`,
              meta: "대기방/관전 채팅 접속",
              participantType: player.participantType || "spectator"
            }))
          ]
        : [];

      this.renderAdminLobbyStatus(status, room, statusRows, participantRows, hasRoom);
      this.renderAdminLobbyChat(chat, messages, hasRoom);
    },

    touchAdminOpsPresence(roomId) {
      if (!roomId) return null;
      const now = Date.now();
      if (now - (this.adminOpsPresenceLastAt || 0) < 5000) return null;
      this.adminOpsPresenceLastAt = now;
      return IronLine.roomRegistry?.touchAdmin?.(roomId, {
        id: this.adminOpsPresenceId(),
        name: "\uad00\ub9ac\uc790"
      });
    },

    adminOpsPresenceId() {
      if (this.adminOpsPresenceIdValue) return this.adminOpsPresenceIdValue;
      const key = "iron-line-admin-presence-id";
      let id = "";
      try {
        id = sessionStorage.getItem(key) || "";
      } catch (_error) {
        id = "";
      }
      if (!id) {
        id = `admin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        try {
          sessionStorage.setItem(key, id);
        } catch (_error) {
          // Presence is still valid for this page even when sessionStorage is blocked.
        }
      }
      this.adminOpsPresenceIdValue = id;
      return id;
    },

    renderAdminLobbyStatus(status, room, statusRows, participantRows, hasRoom) {
      const statusSignature = JSON.stringify({ room: room?.id || "", phase: room?.phase || "", statusRows, participantRows });
      if (status.dataset.signature === statusSignature) return;
      status.dataset.signature = statusSignature;
      status.textContent = "";
      for (const item of statusRows) {
        const row = document.createElement("div");
        row.className = "admin-observer-row";
        const title = document.createElement("strong");
        title.textContent = item.title;
        const meta = document.createElement("span");
        meta.textContent = item.meta;
        row.append(title, meta);
        status.append(row);
      }
      const list = document.createElement("div");
      list.className = "admin-ops-participants";
      if (participantRows.length === 0 && hasRoom) {
        const empty = document.createElement("span");
        empty.className = "admin-observer-empty";
        empty.textContent = "아직 대기방에 접속한 참가자가 없습니다.";
        list.append(empty);
      } else {
        for (const item of participantRows) {
          const row = document.createElement("div");
          row.className = "admin-ops-participant";
          const title = document.createElement("strong");
          title.textContent = item.title;
          const meta = document.createElement("span");
          meta.textContent = item.meta;
          const actions = document.createElement("div");
          actions.className = "admin-ops-participant-actions";
          const warn = document.createElement("button");
          warn.type = "button";
          warn.textContent = "경고";
          warn.addEventListener("click", () => this.warnAdminParticipant(room?.id, item.id));
          const kick = document.createElement("button");
          kick.type = "button";
          kick.textContent = "강퇴";
          kick.className = "danger";
          kick.addEventListener("click", () => this.kickAdminParticipant(room?.id, item.id));
          actions.append(warn, kick);
          row.append(title, meta, actions);
          list.append(row);
        }
      }
      status.append(list);
    },

    renderAdminLobbyChat(chat, messages, hasRoom) {
      const chatSignature = JSON.stringify(messages.map((message) => [message.id, message.sender, message.channel, message.text, message.createdAt]));
      if (chat.dataset.signature === chatSignature) return;
      chat.dataset.signature = chatSignature;
      chat.textContent = "";
      if (!hasRoom) {
        const empty = document.createElement("span");
        empty.className = "admin-observer-empty";
        empty.textContent = "선택된 방이 없어 채팅을 보낼 수 없습니다.";
        chat.append(empty);
        return;
      }
      if (messages.length === 0) {
        const empty = document.createElement("span");
        empty.className = "admin-observer-empty";
        empty.textContent = "아직 대기방 채팅이 없습니다.";
        chat.append(empty);
        return;
      }
      for (const message of messages) {
        const row = document.createElement("div");
        row.className = `admin-ops-chat-message ${message.participantType || "player"}`;
        const meta = document.createElement("b");
        meta.textContent = `${this.eventTimeLabel(message.createdAt)} · ${message.sender || "Player"}`;
        const body = document.createElement("span");
        body.textContent = message.text || "";
        row.append(meta, body);
        chat.append(row);
      }
      chat.scrollTop = chat.scrollHeight;
    },

    submitAdminLobbyChat() {
      const input = this.nodes.adminOpsLobbyChatInput;
      if (!input) return false;
      const text = String(input.value || "").replace(/\s+/g, " ").trim();
      if (!text) return false;
      const registry = IronLine.roomRegistry;
      const room = registry?.selectedRoom?.();
      if (!room?.id) {
        IronLine.game?.adminNotify?.("선택된 방이 없습니다.");
        return false;
      }
      const saved = registry.pushChat(room.id, {
        channel: "all",
        sender: "관리자",
        participantType: "admin",
        playerId: "admin",
        text
      });
      if (!saved) return false;
      input.value = "";
      if (this.nodes.adminOpsLobbyChat) this.nodes.adminOpsLobbyChat.dataset.signature = "";
      if (this.nodes.adminOpsLobbyStatus) this.nodes.adminOpsLobbyStatus.dataset.signature = "";
      IronLine.game?.adminNotify?.("운영 채팅 전송");
      this.updateAdminOps(IronLine.game);
      return true;
    },

    warnAdminParticipant(roomId, playerId) {
      if (!roomId || !playerId) return false;
      const room = IronLine.roomRegistry?.warnParticipant?.(roomId, playerId, "관리자 경고");
      if (!room) return false;
      if (this.nodes.adminOpsLobbyChat) this.nodes.adminOpsLobbyChat.dataset.signature = "";
      if (this.nodes.adminOpsLobbyStatus) this.nodes.adminOpsLobbyStatus.dataset.signature = "";
      IronLine.game?.adminNotify?.("참가자 경고 전송");
      this.updateAdminOps(IronLine.game);
      return true;
    },

    kickAdminParticipant(roomId, playerId) {
      if (!roomId || !playerId) return false;
      const room = IronLine.roomRegistry?.kickParticipant?.(roomId, playerId, "관리자에 의해 방에서 강퇴되었습니다.");
      if (!room) return false;
      if (this.nodes.adminOpsLobbyChat) this.nodes.adminOpsLobbyChat.dataset.signature = "";
      if (this.nodes.adminOpsLobbyStatus) this.nodes.adminOpsLobbyStatus.dataset.signature = "";
      IronLine.game?.adminNotify?.("참가자 강퇴");
      this.updateAdminOps(IronLine.game);
      return true;
    },

    roomTeamLabel(team) {
      return team === TEAM.RED || team === "red" ? "홍팀" : "청팀";
    },

    participantTypeLabel(value) {
      if (value === "caster") return "해설자";
      if (value === "admin") return "관리자";
      if (value === "spectator") return "관전자";
      return "플레이어";
    },

    slotLabel(slotId = "") {
      if (!slotId) return "슬롯 미지정";
      const side = slotId.startsWith("red") ? "홍팀" : "청팀";
      if (slotId.includes("engineer")) return `${side} 공병`;
      if (slotId.includes("recon")) return `${side} 정찰`;
      if (slotId.includes("armor")) return `${side} 기갑`;
      return `${side} 보병`;
    }
  };

  function installHudAdminLobby(Hud) {
    Object.assign(Hud.prototype, hudAdminLobbyMethods);
  }

  IronLine.installHudAdminLobby = installHudAdminLobby;
})(window);
