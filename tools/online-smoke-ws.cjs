"use strict";

const { WebSocket } = require("ws");

function createOnlineSmokeWsHelpers(options = {}) {
  const port = Number(options.port || 4191);
  const roomId = String(options.roomId || "SMOKE");
  const combatOnlyRecovery = options.combatOnlyRecovery !== undefined
    ? Boolean(options.combatOnlyRecovery)
    : process.env.IRONLINE_P0_COMBAT_ONLY !== "0";
  const requestJson = options.requestJson;
  const fetchRoomById = options.fetchRoomById || (async (roomIdValue) => {
    const payload = await requestJson(`/api/rooms/${encodeURIComponent(roomIdValue)}`);
    return payload.room || null;
  });

  function closeSockets(list = []) {
    for (const socket of list) {
      try { socket.close(); } catch (_error) {}
    }
  }

  function wsSmoke() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const events = [];
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("WebSocket smoke timed out."));
      }, 5000);
      const closeDone = (payload = {}) => {
        clearTimeout(timer);
        ws.close();
        resolve(payload);
      };

      ws.on("message", (raw) => {
        const message = JSON.parse(raw.toString());
        events.push(message.type);
        if (message.type === "hello") {
          ws.send(JSON.stringify({
            type: "join",
            roomId: `${roomId}-WS`,
            playerId: "ws-blue",
            nickname: "Blue"
          }));
        }
        if (message.type === "join_result" && message.payload?.ok && combatOnlyRecovery) {
          setTimeout(() => closeDone({ events, snapshot: null }), 180);
          return;
        }
        if (message.type === "observer_snapshot") {
          if (combatOnlyRecovery) {
            clearTimeout(timer);
            ws.close();
            reject(new Error("WebSocket observer_snapshot was sent during combat-only recovery mode."));
            return;
          }
          closeDone({ events, snapshot: message.payload });
        }
      });
      ws.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  function wsCommandSmoke() {
    return new Promise((resolve, reject) => {
      const wsRoomId = `${roomId}-WS-CMD`;
      const a = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const b = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const events = { a: [], b: [] };
      const joined = new Set();
      let slotRequested = false;
      let commandSent = false;
      let commandAck = false;
      let broadcastSeen = false;
      const commandId = `${wsRoomId}:cmd:1`;
      const issuedAt = Date.now();
      const timer = setTimeout(() => {
        a.close();
        b.close();
        reject(new Error("WebSocket command smoke timed out."));
      }, 6000);

      const closeDone = () => {
        clearTimeout(timer);
        a.close();
        b.close();
        resolve({ events, commandAck, broadcastSeen });
      };

      const maybeAssign = () => {
        if (slotRequested || joined.size < 2) return;
        slotRequested = true;
        a.send(JSON.stringify({ type: "assign_slot", slotId: "blue-infantry" }));
      };

      const handle = (name, ws) => (raw) => {
        const message = JSON.parse(raw.toString());
        events[name].push(message.type);
        if (message.type === "hello") {
          ws.send(JSON.stringify({
            type: "join",
            roomId: wsRoomId,
            playerId: name === "a" ? "ws-blue" : "ws-observer",
            nickname: name === "a" ? "Blue" : "Observer"
          }));
        }
        if (message.type === "join_result") {
          joined.add(name);
          maybeAssign();
        }
        if (name === "a" && message.type === "slot_result" && message.payload?.ok && !commandSent) {
          commandSent = true;
          ws.send(JSON.stringify({
            type: "command",
            packet: {
              commandId,
              commandType: "assault",
              commanderSlotId: "blue-infantry",
              role: "infantry",
              controllerType: "human",
              targetSquadId: "B-SQD-3",
              targetPosition: { x: 1280, y: 1420 },
              issuedAt,
              lockUntil: issuedAt + 2800,
              reason: "assault"
            }
          }));
        }
        if (name === "a" && message.type === "command_ack" && message.payload?.ok) commandAck = true;
        if (name === "b" && message.type === "command_broadcast" && message.payload?.packet?.commandId === commandId) {
          broadcastSeen = true;
          if (commandAck) closeDone();
        }
        if (message.type === "command_ack" && message.payload?.ok && broadcastSeen) closeDone();
      };

      a.on("message", handle("a", a));
      b.on("message", handle("b", b));
      a.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      b.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  function wsLobbyGuardSmoke() {
    return new Promise((resolve, reject) => {
      const wsRoomId = `${roomId}-WS-GUARD`;
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const seen = {
        slotNotJoined: false,
        readyNotJoined: false,
        readyLocked: false
      };
      let joined = false;
      let slotAssigned = false;
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("WebSocket lobby guard smoke timed out."));
      }, 7000);

      const fail = (error) => {
        clearTimeout(timer);
        ws.close();
        reject(error);
      };

      const done = () => {
        clearTimeout(timer);
        ws.close();
        resolve({ ...seen });
      };

      ws.on("message", async (raw) => {
        try {
          const message = JSON.parse(raw.toString());
          if (message.type === "hello") {
            ws.send(JSON.stringify({ type: "assign_slot", slotId: "blue-infantry" }));
            ws.send(JSON.stringify({ type: "ready", ready: true }));
            return;
          }
          if (message.type === "slot_result" && !joined) {
            if (message.payload?.ok || message.payload?.reason !== "not_joined") {
              fail(new Error(`Pre-join slot guard failed: ${message.payload?.reason || "unexpected_ok"}`));
              return;
            }
            seen.slotNotJoined = true;
            if (seen.readyNotJoined) {
              ws.send(JSON.stringify({
                type: "join",
                roomId: wsRoomId,
                playerId: "ws-guard-player",
                nickname: "Guard",
                participantType: "player"
              }));
            }
            return;
          }
          if (message.type === "ready_result" && !joined) {
            if (message.payload?.ok || message.payload?.reason !== "not_joined") {
              fail(new Error(`Pre-join ready guard failed: ${message.payload?.reason || "unexpected_ok"}`));
              return;
            }
            seen.readyNotJoined = true;
            if (seen.slotNotJoined) {
              ws.send(JSON.stringify({
                type: "join",
                roomId: wsRoomId,
                playerId: "ws-guard-player",
                nickname: "Guard",
                participantType: "player"
              }));
            }
            return;
          }
          if (message.type === "join_result") {
            joined = true;
            ws.send(JSON.stringify({ type: "assign_slot", slotId: "blue-infantry" }));
            return;
          }
          if (message.type === "slot_result" && joined && !slotAssigned) {
            if (!message.payload?.ok) {
              fail(new Error(`Joined slot assignment failed: ${message.payload?.reason || "unknown"}`));
              return;
            }
            slotAssigned = true;
            await requestJson("/api/rooms", {
              method: "POST",
              body: {
                id: wsRoomId,
                phase: "playing"
              }
            });
            ws.send(JSON.stringify({ type: "ready", ready: true }));
            return;
          }
          if (message.type === "ready_result" && joined && slotAssigned) {
            if (message.payload?.ok || message.payload?.reason !== "locked") {
              fail(new Error(`Ready lock guard failed: ${message.payload?.reason || "unexpected_ok"}`));
              return;
            }
            seen.readyLocked = true;
            done();
          }
        } catch (error) {
          fail(error);
        }
      });
      ws.on("error", fail);
    });
  }

  function wsPlayerStateSmoke(wsRoomId = roomId) {
    return new Promise((resolve, reject) => {
      const a = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const b = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const events = { a: [], b: [] };
      const joined = new Set();
      const payloads = {};
      let stateSent = false;
      const timer = setTimeout(() => {
        a.close();
        b.close();
        reject(new Error("WebSocket player_state smoke timed out."));
      }, 6000);

      const closeDone = (payload) => {
        clearTimeout(timer);
        a.close();
        b.close();
        resolve({ events, payload });
      };

      const fail = (error) => {
        clearTimeout(timer);
        a.close();
        b.close();
        reject(error);
      };

      const maybeSendState = () => {
        if (stateSent || joined.size < 2) return;
        stateSent = true;
        a.send(JSON.stringify({
          type: "player_state",
          roomId: wsRoomId,
          playerId: "p-blue",
          team: "blue",
          slotId: "blue-infantry",
          state: { x: 1200, y: 1400, stateSeq: 7, hp: 91, maxHp: 100, alive: true, updatedAt: Date.now() },
          sentAt: Date.now()
        }));
        b.send(JSON.stringify({
          type: "player_state",
          roomId: wsRoomId,
          playerId: "p-red",
          team: "blue",
          slotId: "blue-infantry",
          state: { x: 1600, y: 1400, stateSeq: 8, hp: 88, maxHp: 100, alive: true, updatedAt: Date.now() },
          sentAt: Date.now()
        }));
      };

      const handle = (name, ws) => (raw) => {
        const message = JSON.parse(raw.toString());
        events[name].push(message.type);
        if (message.type === "hello") {
          ws.send(JSON.stringify({
            type: "join",
            roomId: wsRoomId,
            playerId: name === "a" ? "p-blue" : "p-red",
            nickname: name === "a" ? "Blue" : "Red",
            participantType: "player"
          }));
        }
        if (message.type === "join_result") {
          joined.add(name);
          maybeSendState();
        }
        if (message.type === "player_state") {
          const payload = message.payload || {};
          if (name === "b" && payload.playerId === "p-blue") payloads.blue = payload;
          if (name === "a" && payload.playerId === "p-red") payloads.red = payload;
          if (payloads.blue && payloads.red) {
            if (payloads.blue.state?.stateSeq !== 7 || payloads.blue.state?.x !== 1200) {
              fail(new Error("WebSocket blue player_state relay had wrong state."));
              return;
            }
            if (payloads.red.team !== "red" || payloads.red.slotId !== "red-armor") {
              fail(new Error(`WebSocket player_state did not preserve authoritative red slot/team: ${payloads.red.team}/${payloads.red.slotId}`));
              return;
            }
            closeDone(payloads);
          }
        }
      };

      a.on("message", handle("a", a));
      b.on("message", handle("b", b));
      a.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      b.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  function wsPlayerStateThreePlayerSameTeamSmoke() {
    return new Promise((resolve, reject) => {
      const wsRoomId = `${roomId}-WS-3P-SAME`;
      const specs = [
        { key: "a", playerId: "p-blue-lead", nickname: "Lead", slotId: "blue-infantry", claimTeam: "blue", claimSlotId: "blue-infantry", seq: 11, x: 1180, y: 1400 },
        { key: "b", playerId: "p-blue-eng", nickname: "Engineer", slotId: "blue-engineer", claimTeam: "red", claimSlotId: "red-engineer", seq: 12, x: 1240, y: 1420 },
        { key: "c", playerId: "p-blue-rec", nickname: "Recon", slotId: "blue-recon", claimTeam: "blue", claimSlotId: "blue-recon", seq: 13, x: 1290, y: 1370 }
      ];
      const sockets = new Map();
      const joined = new Set();
      const assigned = new Set();
      const received = new Map(specs.map((spec) => [spec.key, new Map()]));
      let statesSent = false;
      let settled = false;
      const timer = setTimeout(() => {
        closeSockets([...sockets.values()]);
        reject(new Error("WebSocket 3-player same-team player_state smoke timed out."));
      }, 8000);

      const finish = (payload) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        closeSockets([...sockets.values()]);
        resolve(payload);
      };

      const fail = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        closeSockets([...sockets.values()]);
        reject(error);
      };

      const maybeFinish = () => {
        for (const spec of specs) {
          const seen = received.get(spec.key);
          if (!seen || seen.size < 2) return;
          for (const other of specs) {
            if (other.key === spec.key) continue;
            if (!seen.has(other.playerId)) return;
          }
        }
        const engineerRelay = received.get("a")?.get("p-blue-eng") || received.get("c")?.get("p-blue-eng");
        if (!engineerRelay) return;
        if (engineerRelay.team !== "blue" || engineerRelay.slotId !== "blue-engineer") {
          fail(new Error(`3-player same-team relay lost authoritative slot/team: ${engineerRelay.team}/${engineerRelay.slotId}`));
          return;
        }
        finish({
          roomId: wsRoomId,
          relayedPlayers: specs.length,
          correctedTeam: engineerRelay.team,
          correctedSlotId: engineerRelay.slotId
        });
      };

      const maybeSendStates = () => {
        if (statesSent || assigned.size < specs.length) return;
        statesSent = true;
        for (const spec of specs) {
          const ws = sockets.get(spec.key);
          ws?.send(JSON.stringify({
            type: "player_state",
            roomId: wsRoomId,
            playerId: spec.playerId,
            team: spec.claimTeam,
            slotId: spec.claimSlotId,
            state: {
              x: spec.x,
              y: spec.y,
              stateSeq: spec.seq,
              hp: 100 - (spec.seq - 10),
              maxHp: 100,
              alive: true,
              updatedAt: Date.now()
            },
            sentAt: Date.now()
          }));
        }
      };

      for (const spec of specs) {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        sockets.set(spec.key, ws);
        ws.on("message", (raw) => {
          try {
            const message = JSON.parse(raw.toString());
            if (message.type === "hello") {
              ws.send(JSON.stringify({
                type: "join",
                roomId: wsRoomId,
                playerId: spec.playerId,
                nickname: spec.nickname,
                participantType: "player"
              }));
              return;
            }
            if (message.type === "join_result") {
              joined.add(spec.key);
              if (joined.size === specs.length) {
                for (const pending of specs) {
                  const socket = sockets.get(pending.key);
                  socket?.send(JSON.stringify({ type: "assign_slot", slotId: pending.slotId }));
                }
              }
              return;
            }
            if (message.type === "slot_result") {
              if (!message.payload?.ok) {
                fail(new Error(`${spec.playerId} slot assignment failed: ${message.payload?.reason || "unknown"}`));
                return;
              }
              assigned.add(spec.key);
              maybeSendStates();
              return;
            }
            if (message.type === "player_state") {
              const payload = message.payload || {};
              if (!payload.playerId || payload.playerId === spec.playerId) return;
              received.get(spec.key)?.set(payload.playerId, payload);
              maybeFinish();
            }
          } catch (error) {
            fail(error);
          }
        });
        ws.on("error", fail);
      }
    });
  }

  function wsFourVsFourSmoke() {
    return new Promise((resolve, reject) => {
      const wsRoomId = `${roomId}-WS-4V4`;
      const slotIds = [
        "blue-infantry",
        "blue-engineer",
        "blue-recon",
        "blue-armor",
        "red-infantry",
        "red-engineer",
        "red-recon",
        "red-armor"
      ];
      const clients = [];
      const joined = new Map();
      const assigned = new Set();
      const ready = new Set();
      let verifying = false;
      let settled = false;
      const timer = setTimeout(() => {
        closeSockets(clients.map((client) => client.ws));
        reject(new Error("WebSocket 4v4 smoke timed out."));
      }, 10000);

      const fail = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        closeSockets(clients.map((client) => client.ws));
        reject(error);
      };

      const done = (payload) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        closeSockets(clients.map((client) => client.ws));
        resolve(payload);
      };

      const maybeVerify = async () => {
        if (verifying || ready.size < slotIds.length) return;
        verifying = true;
        try {
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
          const room = await fetchRoomById(wsRoomId);
          if (!room) throw new Error("4v4 smoke room was not returned.");
          if ((room.players || []).length !== 8) throw new Error(`Expected 8 players in 4v4 room, got ${(room.players || []).length}.`);
          const overflowVisibleAsSpectator = (room.spectators || []).some((participant) => participant.id === "ws-4v4-overflow");
          if (!combatOnlyRecovery && !overflowVisibleAsSpectator) {
            throw new Error("Overflow WebSocket participant did not downgrade to spectator.");
          }
          if ((room.players || []).some((player) => player.id === "ws-4v4-overflow")) {
            throw new Error("Overflow WebSocket participant incorrectly remained a player in a full 4v4 room.");
          }
          const occupiedSlots = (room.players || []).map((player) => player.slotId).filter(Boolean);
          if (new Set(occupiedSlots).size !== 8) throw new Error(`Expected 8 unique occupied slots, got ${occupiedSlots.join(",")}`);
          const readyPlayers = (room.players || []).filter((player) => player.ready);
          if (readyPlayers.length !== 8) throw new Error(`Expected 8 ready players in 4v4 room, got ${readyPlayers.length}.`);

          await requestJson(`/api/rooms/${encodeURIComponent(wsRoomId)}/participants`, {
            method: "POST",
            body: {
              playerId: "ws-4v4-http-overflow",
              name: "HTTP Overflow",
              participantType: "player",
              slotId: "blue-infantry",
              ready: true,
              updatedAt: Date.now(),
              position: {
                x: 1200,
                y: 1400,
                stateSeq: 1,
                alive: true,
                hp: 100,
                maxHp: 100,
                updatedAt: Date.now()
              }
            }
          });
          const roomAfterHttpOverflow = await fetchRoomById(wsRoomId);
          if ((roomAfterHttpOverflow.players || []).some((player) => player.id === "ws-4v4-http-overflow")) {
            throw new Error("HTTP overflow participant incorrectly remained a player in a full 4v4 room.");
          }
          const httpOverflowVisibleAsSpectator = (roomAfterHttpOverflow.spectators || []).some((participant) => participant.id === "ws-4v4-http-overflow");
          if (!combatOnlyRecovery && !httpOverflowVisibleAsSpectator) {
            throw new Error("HTTP overflow participant was not downgraded to spectator.");
          }
          done({
            roomId: wsRoomId,
            playerCount: (room.players || []).length,
            spectatorCount: combatOnlyRecovery ? 0 : (roomAfterHttpOverflow.spectators || []).length,
            readyCount: readyPlayers.length
          });
        } catch (error) {
          fail(error);
        }
      };

      const sendAssignments = () => {
        if (joined.size < slotIds.length + 1) return;
        const overflowType = joined.get("ws-4v4-overflow");
        if (overflowType !== "spectator") {
          fail(new Error(`Overflow WebSocket participant should be spectator, got ${overflowType || "missing"}.`));
          return;
        }
        for (let index = 0; index < slotIds.length; index += 1) {
          const client = clients[index];
          if (!client || assigned.has(client.playerId)) continue;
          client.ws.send(JSON.stringify({ type: "assign_slot", slotId: slotIds[index] }));
        }
      };

      const maybeSendReady = () => {
        if (assigned.size < slotIds.length) return;
        for (let index = 0; index < slotIds.length; index += 1) {
          const client = clients[index];
          if (!client || ready.has(client.playerId)) continue;
          client.ws.send(JSON.stringify({ type: "ready", ready: true }));
        }
      };

      for (let index = 0; index < slotIds.length + 1; index += 1) {
        const overflow = index === slotIds.length;
        const playerId = overflow ? "ws-4v4-overflow" : `ws-4v4-${index + 1}`;
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
        const client = { ws, playerId, overflow };
        clients.push(client);
        ws.on("message", (raw) => {
          try {
            const message = JSON.parse(raw.toString());
            if (message.type === "hello") {
              ws.send(JSON.stringify({
                type: "join",
                roomId: wsRoomId,
                playerId,
                nickname: overflow ? "Overflow" : `P${index + 1}`,
                participantType: "player"
              }));
              return;
            }
            if (message.type === "join_result") {
              joined.set(playerId, message.payload?.participantType || "");
              if (!overflow && message.payload?.participantType !== "player") {
                fail(new Error(`${playerId} should join as player, got ${message.payload?.participantType || "missing"}.`));
                return;
              }
              sendAssignments();
              return;
            }
            if (message.type === "slot_result" && !overflow) {
              if (!message.payload?.ok) {
                fail(new Error(`${playerId} slot assignment failed: ${message.payload?.reason || "unknown"}`));
                return;
              }
              assigned.add(playerId);
              maybeSendReady();
              return;
            }
            if (message.type === "ready_result" && !overflow) {
              if (!message.payload?.ok) {
                fail(new Error(`${playerId} ready update failed: ${message.payload?.reason || "unknown"}`));
                return;
              }
              ready.add(playerId);
              maybeVerify();
            }
          } catch (error) {
            fail(error);
          }
        });
        ws.on("error", fail);
      }
    });
  }

  return {
    wsSmoke,
    wsCommandSmoke,
    wsLobbyGuardSmoke,
    wsPlayerStateSmoke,
    wsPlayerStateThreePlayerSameTeamSmoke,
    wsFourVsFourSmoke
  };
}

module.exports = {
  createOnlineSmokeWsHelpers
};
