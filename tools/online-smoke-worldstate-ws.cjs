"use strict";

const { WebSocket } = require("ws");

function createWorldStateWsSmoke(options = {}) {
  const port = Number(options.port || 4191);
  const roomId = String(options.roomId || "SMOKE");
  const fetchRoomById = options.fetchRoomById;

  return function wsWorldStateSmoke() {
    return new Promise((resolve, reject) => {
      const wsRoomId = `${roomId}-WS-WORLD`;
      const a = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const b = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const joined = new Set();
      const assigned = new Set();
      let worldSent = false;
      const closeBoth = () => {
        try { a.close(); } catch (_error) {}
        try { b.close(); } catch (_error) {}
      };
      const timer = setTimeout(() => {
        closeBoth();
        reject(new Error("WebSocket world_state smoke timed out."));
      }, 7000);

      const closeDone = (payload) => {
        clearTimeout(timer);
        closeBoth();
        resolve(payload);
      };

      const fail = (error) => {
        clearTimeout(timer);
        closeBoth();
        reject(error);
      };

      const maybeAssign = () => {
        if (joined.size < 2) return;
        a.send(JSON.stringify({ type: "assign_slot", slotId: "blue-infantry" }));
        b.send(JSON.stringify({ type: "assign_slot", slotId: "red-infantry" }));
      };

      const maybeSendWorld = () => {
        if (worldSent || assigned.size < 2) return;
        worldSent = true;
        a.send(JSON.stringify({
          type: "world_state",
          roomId: wsRoomId,
          worldState: {
            tick: 42,
            vehicles: [{ id: "B-21", type: "tank", team: "blue", x: 1234, y: 1456, hp: 110, maxHp: 110, alive: true }],
            units: [{ id: "B-SQD-1-1", team: "blue", x: 1210, y: 1440, hp: 55, maxHp: 55, alive: true }],
            capturePoints: [{ id: "A", owner: "blue", progress: 0.4, contested: false }]
          }
        }));
      };

      const handle = (name, ws) => async (raw) => {
        try {
          const message = JSON.parse(raw.toString());
          if (message.type === "hello") {
            ws.send(JSON.stringify({
              type: "join",
              roomId: wsRoomId,
              playerId: name === "a" ? "world-host" : "world-follower",
              nickname: name === "a" ? "Host" : "Follower",
              participantType: "player"
            }));
            return;
          }
          if (message.type === "join_result") {
            joined.add(name);
            maybeAssign();
            return;
          }
          if (message.type === "slot_result") {
            if (!message.payload?.ok) {
              fail(new Error(`world_state slot assignment failed: ${message.payload?.reason || "unknown"}`));
              return;
            }
            assigned.add(name);
            maybeSendWorld();
            return;
          }
          if (name !== "b" || message.type !== "world_state") return;
          const payload = message.payload || {};
          const room = await fetchRoomById(wsRoomId);
          if (payload.worldState?.hostId !== "world-host") {
            fail(new Error("WebSocket world_state relay had wrong host."));
            return;
          }
          if (payload.worldState?.vehicles?.[0]?.x !== 1234) {
            fail(new Error("WebSocket world_state relay had wrong vehicle position."));
            return;
          }
          if (room?.worldState?.hostId !== "world-host" || room?.worldState?.tick !== 42) {
            fail(new Error("WebSocket world_state was not stored in room detail."));
            return;
          }
          closeDone({ relayed: true, hostId: payload.worldState.hostId, tick: payload.worldState.tick });
        } catch (error) {
          fail(error);
        }
      };

      a.on("message", handle("a", a));
      b.on("message", handle("b", b));
      a.on("error", fail);
      b.on("error", fail);
    });
  };
}

module.exports = { createWorldStateWsSmoke };
