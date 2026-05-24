"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { httpSummary, launchPage, makeRequestJson, sleep, stat, waitForServer } = require("./p0-browser-cdp-helper.cjs");

const root = path.resolve(__dirname, "..");
const appPort = Number(process.env.IRONLINE_P0_11E_PORT || 4334);
const baseUrl = `http://127.0.0.1:${appPort}`;
const requestJson = makeRequestJson(baseUrl);
const roomsFile = path.join(root, ".data", `p0-11e-${process.pid}.json`);

function now() { return Date.now(); }
function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}
function distance(a = {}, b = {}) {
  return round(Math.hypot((Number(a.x) || 0) - (Number(b.x) || 0), (Number(a.y) || 0) - (Number(b.y) || 0)));
}
function byId(list = [], id = "") {
  return list.find((item) => item.id === id) || null;
}
function latestSnapshot(state) {
  return state.snapshots?.[state.snapshots.length - 1] || {};
}
function roomSeed(roomId) {
  const timestamp = now();
  return {
    id: roomId,
    name: roomId,
    mode: "annihilation",
    phase: "waiting",
    capacity: 8,
    locked: false,
    aiFillEmptySlots: false,
    blueFactionId: "korea",
    redFactionId: "russia",
    players: [],
    spectators: [],
    admins: [],
    chat: [],
    events: [],
    commands: [],
    combatEvents: [],
    worldState: { roomId, hostId: "", tick: 0, updatedAt: timestamp, vehicles: [], units: [], capturePoints: [] },
    startedAt: 0,
    updatedAt: timestamp
  };
}
function maxDistance(list = []) {
  return round(Math.max(0, ...list.filter(Number.isFinite)));
}
function presenceMismatchSamples(presence = []) {
  return presence
    .filter((sample) => sample?.before?.player && sample?.result && !sample.before.player.inTank && !sample.before.player.inVehicle)
    .map((sample) => ({
      player: { x: sample.before.player.x, y: sample.before.player.y },
      result: { x: sample.result.x, y: sample.result.y },
      distance: distance(sample.before.player, sample.result),
      stateSeq: sample.result.stateSeq,
      movementState: sample.result.movementState || ""
    }));
}
function remoteAssessment(client, localSpec, remoteSpec, joins) {
  const remoteId = joins[remoteSpec.id]?.playerId || "";
  const sessionPlayer = byId(client.players, remoteId);
  const field = byId(client.field, remoteId);
  const minimap = byId(client.minimap, remoteId);
  const buffer = byId(client.buffers, remoteId);
  const applies = (client.applies || []).filter((item) => item.playerId === remoteId);
  return {
    expectedId: remoteSpec.id,
    playerId: remoteId,
    expectedTeam: remoteSpec.team,
    expectedSlotId: remoteSpec.slotId,
    session: sessionPlayer,
    buffer,
    field,
    minimap,
    applyCount: applies.length,
    applyAccepted: applies.filter((item) => item.result).length,
    selfIgnored: applies.filter((item) => item.selfIgnored).length,
    staleRejected: applies.filter((item) => !item.result && !item.selfIgnored).length,
    lastApply: applies[applies.length - 1] || null,
    sessionVsBufferDelta: sessionPlayer && buffer ? distance(sessionPlayer, buffer) : null,
    fieldVsSessionDelta: sessionPlayer && field ? distance(field, sessionPlayer) : null,
    fieldVsBufferDelta: buffer && field ? distance(field, buffer) : null,
    localTeam: localSpec.team
  };
}
function summarizeResults(results) {
  const clients = Object.values(results.clients || {});
  const presenceMax = maxDistance(clients.map((client) => client.presenceMismatchMax));
  const renderDeltaMax = maxDistance(clients.map((client) => client.remoteAssessment?.fieldVsSessionDelta || 0));
  const sessionBufferDeltaMax = maxDistance(clients.map((client) => client.remoteAssessment?.sessionVsBufferDelta || 0));
  const roomRefreshRemoteDeltaMax = maxDistance(clients.map((client) => client.roomRefreshRemoteDeltaMax || 0));
  const longFrameMax = maxDistance(clients.map((client) => client.frameStats?.max || 0));
  const applyAcceptedTotal = clients.reduce((sum, client) => sum + (client.remoteAssessment?.applyAccepted || 0), 0);
  const playerStateSentTotal = clients.reduce((sum, client) => sum + (client.ws?.sent?.player_state || 0), 0);
  const playerStateReceivedTotal = clients.reduce((sum, client) => sum + (client.ws?.received?.player_state || 0), 0);
  const selfIgnoredTotal = clients.reduce((sum, client) => sum + (client.selfIgnored || 0), 0);
  const staleRejectedTotal = clients.reduce((sum, client) => sum + (client.staleRejected || 0), 0);
  return {
    presenceMax,
    renderDeltaMax,
    sessionBufferDeltaMax,
    roomRefreshRemoteDeltaMax,
    longFrameMax,
    applyAcceptedTotal,
    playerStateSentTotal,
    playerStateReceivedTotal,
    selfIgnoredTotal,
    staleRejectedTotal
  };
}
function decide(results) {
  const clients = Object.values(results.clients || {});
  const summary = summarizeResults(results);
  if (summary.presenceMax > 160) return "local_presence_publish_point_fallback";
  if (clients.some((client) => !client.ws?.openCount || !client.ws?.connectedEver)) return "player_state_ws_not_connected";
  if (summary.playerStateSentTotal < 12 || summary.playerStateReceivedTotal < 12) return "player_state_ws_low_rate";
  if (summary.applyAcceptedTotal < 10) return "player_state_apply_low_rate";
  if (summary.selfIgnoredTotal > 0) return "player_state_self_ignored";
  if (summary.staleRejectedTotal > 0) return "player_state_stale_rejected";
  if (summary.sessionBufferDeltaMax > 120) return "session_buffer_position_diverged";
  if (summary.roomRefreshRemoteDeltaMax > 160) return "room_refresh_stale_remote_position_revert";
  if (summary.renderDeltaMax > 160) return "remote_render_smoothing_or_position_lag";
  if (summary.longFrameMax > 110) return "frame_stutter_candidate";
  return "no_high_risk_reproduced";
}

async function installProbe(page) {
  await page.eval(`(() => {
    const round = (value) => Math.round(Number(value) || 0);
    const dist = (a = {}, b = {}) => Math.hypot((Number(a.x) || 0) - (Number(b.x) || 0), (Number(a.y) || 0) - (Number(b.y) || 0));
    const countSocket = (bucket, raw) => {
      try {
        const message = JSON.parse(String(raw || "{}"));
        const type = message.type || "unknown";
        bucket[type] = (bucket[type] || 0) + 1;
      } catch (_error) {
        bucket.unknown = (bucket.unknown || 0) + 1;
      }
    };
    const summarizePlayer = (player) => player ? ({
      id: player.id || player.playerId || "",
      playerId: player.playerId || player.id || "",
      name: player.name || player.nickname || "",
      team: player.team || "",
      slotId: player.slotId || "",
      participantType: player.participantType || "player",
      ready: Boolean(player.ready),
      x: round(player.position?.x ?? player.x),
      y: round(player.position?.y ?? player.y),
      stateSeq: Number(player.position?.stateSeq ?? player.stateSeq) || 0,
      updatedAt: Number(player.position?.updatedAt ?? player.updatedAt) || 0
    }) : null;
    const summarizeSlot = (slot) => slot ? ({
      id: slot.id || "",
      team: slot.team || "",
      roleId: slot.roleId || "",
      playerId: slot.playerId || "",
      ready: Boolean(slot.ready),
      aiControlled: Boolean(slot.aiControlled),
      controllerType: slot.controllerType || ""
    }) : null;
    window.__p011e = {
      snapshots: [],
      applies: [],
      publishes: [],
      relays: [],
      presence: [],
      syncs: [],
      renders: [],
      inputTicks: [],
      timings: [],
      frames: [],
      longTasks: [],
      assigns: [],
      ready: [],
      starts: [],
      ws: { sent: {}, received: {}, openCount: 0, closeCount: 0, connectedEver: false },
      errors: [],
      selfIgnored: 0,
      staleRejected: 0
    };
    window.onerror = (message) => window.__p011e.errors.push(String(message));

    if (!window.__p011eOriginalWebSocket && typeof window.WebSocket === "function") {
      const NativeWebSocket = window.WebSocket;
      window.__p011eOriginalWebSocket = NativeWebSocket;
      const WrappedWebSocket = function(...args) {
        const socket = new NativeWebSocket(...args);
        socket.addEventListener("open", () => {
          window.__p011e.ws.openCount += 1;
          window.__p011e.ws.connectedEver = true;
        });
        socket.addEventListener("close", () => { window.__p011e.ws.closeCount += 1; });
        socket.addEventListener("message", (event) => countSocket(window.__p011e.ws.received, event.data));
        const originalSend = socket.send.bind(socket);
        socket.send = (data) => {
          countSocket(window.__p011e.ws.sent, data);
          return originalSend(data);
        };
        return socket;
      };
      WrappedWebSocket.prototype = NativeWebSocket.prototype;
      WrappedWebSocket.CONNECTING = NativeWebSocket.CONNECTING;
      WrappedWebSocket.OPEN = NativeWebSocket.OPEN;
      WrappedWebSocket.CLOSING = NativeWebSocket.CLOSING;
      WrappedWebSocket.CLOSED = NativeWebSocket.CLOSED;
      window.WebSocket = WrappedWebSocket;
    }

    const recordTiming = (name, duration) => {
      if (duration >= 8 || window.__p011e.timings.length < 80) {
        window.__p011e.timings.push({ name, duration: Math.round(duration * 10) / 10, at: Date.now() });
        if (window.__p011e.timings.length > 240) window.__p011e.timings.shift();
      }
    };
    let lastFrame = performance.now();
    const frameLoop = (timestamp) => {
      const gap = timestamp - lastFrame;
      if (gap > 50) window.__p011e.frames.push({ gap: Math.round(gap * 10) / 10, at: Date.now() });
      lastFrame = timestamp;
      window.requestAnimationFrame(frameLoop);
    };
    window.requestAnimationFrame(frameLoop);
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) window.__p011e.longTasks.push({ duration: Math.round(entry.duration * 10) / 10, at: Date.now(), name: entry.name || "longtask" });
        }
      });
      observer.observe({ entryTypes: ["longtask"] });
      window.__p011eLongTaskObserver = observer;
    } catch (_error) {}

    const snapshot = (label) => {
      const game = window.IronLine?.game;
      const session = game?.onlineSession || {};
      const local = game?.localSessionPlayer?.() || null;
      const room = session.roomId ? window.IronLine?.roomRegistry?.getRoom?.(session.roomId) : null;
      let field = [];
      let minimap = [];
      try {
        field = game?.renderer?.remoteHumanPlayers?.(game)?.map((entry) => ({
          id: entry.id,
          team: entry.unit?.team || "",
          x: round(entry.unit?.x),
          y: round(entry.unit?.y)
        })) || [];
      } catch (error) {
        window.__p011e.errors.push(\`field:\${error.message || error}\`);
      }
      try {
        minimap = game?.renderer?.humanMinimapEntries?.(game, game.player)?.map((entry) => ({
          id: entry.id,
          team: entry.team || "",
          local: Boolean(entry.local),
          x: round(entry.x),
          y: round(entry.y)
        })) || [];
      } catch (error) {
        window.__p011e.errors.push(\`minimap:\${error.message || error}\`);
      }
      const buffers = Array.from(game?.hud?.sessionFlow?.remotePlayerStateBuffer?.entries?.() || []).map(([id, value]) => ({
        id,
        team: value?.team || "",
        slotId: value?.slotId || "",
        x: round(value?.position?.x ?? value?.x),
        y: round(value?.position?.y ?? value?.y),
        stateSeq: Number(value?.position?.stateSeq ?? value?.stateSeq) || 0,
        updatedAt: Number(value?.position?.updatedAt ?? value?.updatedAt) || 0
      }));
      const item = {
        label,
        at: Date.now(),
        roomId: session.roomId || "",
        participantType: session.participantType || "player",
        localId: session.playerId || "",
        profilePlayerId: game?.localProfile?.playerId || "",
        persistentPlayerId: game?.localProfile?.persistentPlayerId || "",
        local: summarizePlayer(local),
        playerEntity: game?.player ? {
          team: game.player.team || "",
          x: round(game.player.x),
          y: round(game.player.y),
          hp: round(game.player.hp),
          inTank: Boolean(game.player.inTank),
          inVehicle: Boolean(game.player.inVehicle),
          mountedX: round((game.player.inTank || game.player.inVehicle || {}).x),
          mountedY: round((game.player.inTank || game.player.inVehicle || {}).y),
          mountedType: (game.player.inTank || game.player.inVehicle || {}).vehicleType || ""
        } : null,
        players: (session.players || []).map(summarizePlayer),
        roleSlots: (session.roleSlots || []).map(summarizeSlot),
        roomPlayers: (room?.players || []).map(summarizePlayer),
        roomPhase: room?.phase || "",
        roomLocked: Boolean(room?.locked),
        buffers,
        field,
        minimap
      };
      window.__p011e.snapshots.push(item);
      if (window.__p011e.snapshots.length > 180) window.__p011e.snapshots.shift();
      return item;
    };
    window.__p011e.snapshot = snapshot;

    const game = window.IronLine?.game;
    const flow = game?.hud?.sessionFlow;
    if (flow && !flow.__p011ePatched) {
      const originalApply = flow.applyRemotePlayerState.bind(flow);
      flow.applyRemotePlayerState = function(payload = {}) {
        const before = snapshot("before-apply");
        const started = performance.now();
        const result = originalApply(payload);
        recordTiming("applyRemotePlayerState", performance.now() - started);
        const after = snapshot("after-apply");
        const playerId = String(payload.playerId || "");
        const localId = game?.onlineSession?.playerId || "";
        const selfIgnored = Boolean(playerId && playerId === localId);
        if (selfIgnored) window.__p011e.selfIgnored += 1;
        if (!result && !selfIgnored) window.__p011e.staleRejected += 1;
        const afterPlayer = (after.players || []).find((item) => item.id === playerId) || null;
        const beforePlayer = (before.players || []).find((item) => item.id === playerId) || null;
        window.__p011e.applies.push({
          playerId,
          localId,
          selfIgnored,
          result: Boolean(result),
          team: payload.team || "",
          slotId: payload.slotId || "",
          stateSeq: Number(payload.state?.stateSeq) || 0,
          age: Math.max(0, Date.now() - (Number(payload.state?.updatedAt || payload.sentAt) || Date.now())),
          x: round(payload.state?.x),
          y: round(payload.state?.y),
          before: beforePlayer,
          after: afterPlayer,
          delta: beforePlayer && afterPlayer ? dist(beforePlayer, afterPlayer) : 0,
          at: Date.now()
        });
        return result;
      };
      const originalRelay = flow.publishPlayerStateRelay.bind(flow);
      flow.publishPlayerStateRelay = function(gameArg, player, position, relayAt) {
        window.__p011e.relays.push({
          playerId: gameArg?.onlineSession?.playerId || "",
          team: player?.team || "",
          slotId: player?.slotId || "",
          x: round(position?.x),
          y: round(position?.y),
          stateSeq: Number(position?.stateSeq) || 0,
          at: Date.now()
        });
        return originalRelay(gameArg, player, position, relayAt);
      };
      const originalPublish = flow.publishLocalPlayer.bind(flow);
      flow.publishLocalPlayer = function(gameArg, options = {}) {
        const before = snapshot("before-publish");
        const started = performance.now();
        const result = originalPublish(gameArg, options);
        recordTiming("publishLocalPlayer", performance.now() - started);
        const after = snapshot("after-publish");
        window.__p011e.publishes.push({ result: result !== false, options, beforeLocal: before.local, afterLocal: after.local, at: Date.now() });
        return result;
      };
      const originalPresence = flow.syncLocalPlayerPresence?.bind(flow);
      if (originalPresence) {
        flow.syncLocalPlayerPresence = function(gameArg, sessionPlayer, presenceAt) {
          const player = gameArg?.player || {};
          const mounted = player.inTank || player.inVehicle || null;
          const before = {
            session: summarizePlayer(sessionPlayer),
            player: {
              team: player.team || "",
              x: round(player.x),
              y: round(player.y),
              inTank: Boolean(player.inTank),
              inVehicle: Boolean(player.inVehicle),
              mountedX: round(mounted?.x),
              mountedY: round(mounted?.y),
              mountedType: mounted?.vehicleType || ""
            }
          };
          const result = originalPresence(gameArg, sessionPlayer, presenceAt);
          window.__p011e.presence.push({
            before,
            result: result ? {
              x: result.x,
              y: result.y,
              stateSeq: result.stateSeq,
              movementState: result.movementState || "",
              updatedAt: result.updatedAt,
              inVehicle: Boolean(result.inVehicle),
              vehicleId: result.vehicleId || "",
              vehicleType: result.vehicleType || ""
            } : null,
            after: summarizePlayer(sessionPlayer),
            at: Date.now()
          });
          return result;
        };
      }
      const originalSync = flow.syncRoomParticipants.bind(flow);
      flow.syncRoomParticipants = function(gameArg, room) {
        const before = snapshot("before-syncRoomParticipants");
        const roomPlayers = (room?.players || []).map(summarizePlayer);
        const started = performance.now();
        const result = originalSync(gameArg, room);
        recordTiming("syncRoomParticipants", performance.now() - started);
        const after = snapshot("after-syncRoomParticipants");
        const bufferById = new Map((after.buffers || []).map((item) => [item.id, item]));
        const remoteDeltas = (after.players || [])
          .filter((item) => item.id && item.id !== after.localId && bufferById.has(item.id))
          .map((item) => ({ id: item.id, delta: dist(item, bufferById.get(item.id)), session: item, buffer: bufferById.get(item.id) }));
        window.__p011e.syncs.push({ roomPhase: room?.phase || "", roomPlayers, beforeLocal: before.local, afterLocal: after.local, remoteDeltas, at: Date.now() });
        return result;
      };
      flow.__p011ePatched = true;
    }
    if (game && !game.__p011ePatched) {
      const originalUpdate = game.updateBattlefield?.bind(game);
      if (originalUpdate) {
        game.updateBattlefield = function(delta, ...args) {
          const started = performance.now();
          const result = originalUpdate(delta, ...args);
          recordTiming("updateBattlefield", performance.now() - started);
          return result;
        };
      }
      const originalAssign = game.assignPlayerToSlot?.bind(game);
      if (originalAssign) {
        game.assignPlayerToSlot = function(playerId, slotId, options = {}) {
          const before = snapshot("before-assignPlayerToSlot");
          const result = originalAssign(playerId, slotId, options);
          const after = snapshot("after-assignPlayerToSlot");
          window.__p011e.assigns.push({ playerId, slotId, options, result: Boolean(result), beforeLocal: before.local, afterLocal: after.local, at: Date.now() });
          return result;
        };
      }
      const originalReady = game.toggleLocalReady?.bind(game);
      if (originalReady) {
        game.toggleLocalReady = function() {
          const before = snapshot("before-toggleLocalReady");
          const result = originalReady();
          const after = snapshot("after-toggleLocalReady");
          window.__p011e.ready.push({ result: Boolean(result), beforeLocal: before.local, afterLocal: after.local, at: Date.now() });
          return result;
        };
      }
      const originalStart = game.beginDeploymentCountdown?.bind(game);
      if (originalStart) {
        game.beginDeploymentCountdown = function(options = {}) {
          const before = snapshot("before-beginDeploymentCountdown");
          const result = originalStart(options);
          const after = snapshot("after-beginDeploymentCountdown");
          window.__p011e.starts.push({ result: Boolean(result), beforeLocal: before.local, afterLocal: after.local, at: Date.now() });
          return result;
        };
      }
      game.__p011ePatched = true;
    }
    if (game?.renderer && !game.renderer.__p011ePatched) {
      const originalRemoteHumans = game.renderer.remoteHumanPlayers?.bind(game.renderer);
      if (originalRemoteHumans) {
        game.renderer.remoteHumanPlayers = function(gameArg) {
          const started = performance.now();
          const entries = originalRemoteHumans(gameArg) || [];
          recordTiming("renderer.remoteHumanPlayers", performance.now() - started);
          const sessionById = new Map((gameArg?.onlineSession?.players || []).map((player) => [player.id, summarizePlayer(player)]));
          window.__p011e.renders.push({
            at: Date.now(),
            entries: entries.map((entry) => {
              const sessionPlayer = sessionById.get(entry.id) || null;
              const field = { id: entry.id, team: entry.unit?.team || "", x: round(entry.unit?.x), y: round(entry.unit?.y) };
              return {
                ...field,
                session: sessionPlayer,
                delta: sessionPlayer ? dist(field, sessionPlayer) : null
              };
            })
          });
          if (window.__p011e.renders.length > 160) window.__p011e.renders.shift();
          return entries;
        };
      }
      const originalDraw = game.renderer.draw?.bind(game.renderer);
      if (originalDraw) {
        game.renderer.draw = function(gameArg) {
          const started = performance.now();
          const result = originalDraw(gameArg);
          recordTiming("renderer.draw", performance.now() - started);
          return result;
        };
      }
      game.renderer.__p011ePatched = true;
    }
    snapshot("probe-installed");
  })()`);
}

async function setupProfile(page, spec) {
  return page.eval(`(() => {
    const game = window.IronLine.game;
    const requestedId = ${JSON.stringify(spec.id)};
    sessionStorage.removeItem(game.sessionPlayerIdStorageKey?.() || "iron-line-session-player-id-v1");
    game.localProfile = game.applySessionPlayerIdToProfile?.({
      ...(game.localProfile || game.defaultLocalProfile?.() || {}),
      persistentPlayerId: requestedId,
      playerId: requestedId,
      nickname: ${JSON.stringify(spec.nickname)},
      factionId: ${JSON.stringify(spec.team === "red" ? "russia" : "korea")},
      skinId: ${JSON.stringify(spec.team === "red" ? "russia" : "korea")},
      updatedAt: Date.now()
    }) || game.localProfile;
    game.saveLocalProfile?.(game.localProfile);
    game.applyLocalProfile?.();
    window.__p011e.snapshot("profile-ready");
    return {
      requestedId,
      playerId: game.localProfile?.playerId || "",
      persistentPlayerId: game.localProfile?.persistentPlayerId || "",
      nickname: game.localProfile?.nickname || ""
    };
  })()`);
}
async function joinRoom(page, roomId) {
  return page.eval(`(async () => {
    const game = window.IronLine.game;
    const flow = game.hud.sessionFlow;
    flow.closePlayerStateSocket?.();
    flow.remotePlayerStateBuffer?.clear?.();
    game.onlineSession = game.createLocalSession?.() || game.onlineSession;
    game.applyLocalProfile?.();
    await window.IronLine.roomRegistry.refreshRemoteRooms();
    const room = window.IronLine.roomRegistry.getRoom(${JSON.stringify(roomId)}) ||
      window.IronLine.roomRegistry.listRooms().find((item) => item.id === ${JSON.stringify(roomId)});
    flow.enterOnline(game.localProfile);
    const joined = flow.joinOnlineRoom(room, { participantType: "player" });
    window.__p011e.snapshot("after-joinOnlineRoom");
    return { joined: Boolean(joined), local: window.__p011e.snapshots.slice(-1)[0]?.local || null };
  })()`);
}
async function chooseSlot(page, slotId) {
  return page.eval(`(() => {
    const game = window.IronLine.game;
    const result = game.assignPlayerToSlot?.(game.onlineSession?.playerId, ${JSON.stringify(slotId)}, { preserveReady: true });
    window.__p011e.snapshot("after-user-slot-select:${slotId}");
    return { result: Boolean(result), local: window.__p011e.snapshots.slice(-1)[0]?.local || null };
  })()`);
}
async function toggleReady(page) {
  return page.eval(`(() => {
    const game = window.IronLine.game;
    game.lobbyOpen = true;
    const result = game.toggleLocalReady?.();
    window.__p011e.snapshot("after-user-ready");
    return { result: Boolean(result), local: window.__p011e.snapshots.slice(-1)[0]?.local || null };
  })()`);
}
async function syncPage(page, label) {
  return page.eval(`(async () => {
    const game = window.IronLine.game;
    await window.IronLine.roomRegistry.refreshRemoteRooms();
    game.hud?.sessionFlow?.syncCurrentRoom?.(game);
    game.renderer?.remoteHumanPlayers?.(game);
    game.renderer?.humanMinimapEntries?.(game, game.player);
    return window.__p011e.snapshot(${JSON.stringify(label)});
  })()`);
}
async function startMotion(page, spec) {
  return page.eval(`(() => {
    const game = window.IronLine.game;
    const flow = game.hud.sessionFlow;
    let seq = 0;
    window.__p011eMotion = setInterval(() => {
      seq += 1;
      const before = game.player ? { x: Math.round(game.player.x || 0), y: Math.round(game.player.y || 0) } : null;
      if (game.player) {
        const mounted = game.player.inTank || game.player.inVehicle || null;
        const point = mounted && mounted.alive !== false ? mounted : game.player;
        point.x = ${Math.round(spec.x)} + seq * ${Math.round(spec.dx)};
        point.y = ${Math.round(spec.y)} + Math.round(Math.sin(seq / 4) * 18);
        game.player.x = point.x;
        game.player.y = point.y;
        game.player.vx = ${Math.round(spec.dx * 10)};
        game.player.vy = 0;
      }
      const inputAt = Date.now();
      flow.publishLocalPlayer(game, { force: true });
      game.renderer?.remoteHumanPlayers?.(game);
      game.renderer?.humanMinimapEntries?.(game, game.player);
      const after = game.player ? { x: Math.round(game.player.x || 0), y: Math.round(game.player.y || 0) } : null;
      window.__p011e.inputTicks.push({ seq, before, after, inputAt, afterPublishAt: Date.now() });
      if (seq % 8 === 0) window.__p011e.snapshot("motion-tick");
    }, 100);
    return true;
  })()`);
}
async function stopMotion(page) {
  return page.eval(`(() => {
    if (window.__p011eMotion) clearInterval(window.__p011eMotion);
    window.__p011eMotion = null;
    window.__p011e.snapshot("motion-stopped");
    return true;
  })()`);
}
async function collect(page) {
  return page.eval(`(() => {
    const state = window.__p011e || {};
    const snap = state.snapshot?.("collect-final") || {};
    return {
      name: ${JSON.stringify(page.name)},
      latest: snap,
      snapshots: (state.snapshots || []).slice(-32),
      applies: state.applies || [],
      publishes: state.publishes || [],
      relays: state.relays || [],
      presence: state.presence || [],
      syncs: state.syncs || [],
      renders: state.renders || [],
      inputTicks: state.inputTicks || [],
      timings: state.timings || [],
      frames: state.frames || [],
      longTasks: state.longTasks || [],
      assigns: state.assigns || [],
      ready: state.ready || [],
      starts: state.starts || [],
      ws: state.ws || {},
      selfIgnored: state.selfIgnored || 0,
      staleRejected: state.staleRejected || 0,
      errors: state.errors || []
    };
  })()`);
}
async function syncAll(pages, label) {
  await Promise.all(pages.map((page) => syncPage(page, label).catch((error) => ({ error: error.message }))));
  await sleep(320);
}

async function main() {
  const specs = [
    { id: "p0-blue-1", nickname: "Blue 1", team: "blue", slotId: "blue-infantry", x: 1250, y: 1450, dx: 8 },
    { id: "p0-red-1", nickname: "Red 1", team: "red", slotId: "red-infantry", x: 1660, y: 1420, dx: -8 }
  ];
  const server = spawn(process.execPath, ["tools/static-server.cjs", String(appPort)], {
    cwd: root,
    env: { ...process.env, HOST: "0.0.0.0", PORT: String(appPort), IRONLINE_ROOMS_FILE: roomsFile },
    stdio: "ignore",
    windowsHide: true
  });
  const pages = [];
  try {
    await waitForServer(requestJson);
    const roomId = `P011E-${Date.now()}`;
    await requestJson("/api/rooms", { method: "POST", body: roomSeed(roomId) });
    pages.push(await launchPage({ name: "blue1", debugPort: appPort + 131, originHost: "127.0.0.1", appPort, baseUrl, profilePrefix: "iron-line-p0-11e", installProbe }));
    pages.push(await launchPage({ name: "red1", debugPort: appPort + 132, originHost: "localhost", appPort, baseUrl, profilePrefix: "iron-line-p0-11e", installProbe }));

    const profiles = {};
    const joins = {};
    const slotSelects = {};
    const readies = {};
    for (let i = 0; i < specs.length; i += 1) {
      profiles[specs[i].id] = await setupProfile(pages[i], specs[i]);
      joins[specs[i].id] = await joinRoom(pages[i], roomId);
      await syncAll(pages.slice(0, i + 1), `after-join-${specs[i].id}`);
      slotSelects[specs[i].id] = await chooseSlot(pages[i], specs[i].slotId);
      await syncAll(pages.slice(0, i + 1), `after-slot-${specs[i].id}`);
    }
    for (let i = 0; i < specs.length; i += 1) {
      readies[specs[i].id] = await toggleReady(pages[i]);
      await syncAll(pages, `after-ready-${specs[i].id}`);
    }

    const latestRoom = (await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`)).room;
    await requestJson("/api/rooms", {
      method: "POST",
      body: {
        ...latestRoom,
        phase: "playing",
        locked: true,
        startedBy: "p0-11e",
        startedAt: Date.now() - 7000,
        events: [...(latestRoom.events || []), { id: `${roomId}:start`, type: "room_started", createdAt: Date.now() }]
      }
    });
    await syncAll(pages, "after-server-start");
    await Promise.all(pages.map((page, index) => startMotion(page, specs[index])));
    await sleep(5400);
    await syncAll(pages, "after-motion-sync");
    await Promise.all(pages.map(stopMotion));
    await syncAll(pages, "after-stop-sync");

    const rawClients = {};
    for (let i = 0; i < pages.length; i += 1) {
      const raw = await collect(pages[i]);
      raw.http = {
        roomsSummary: httpSummary(pages[i].metrics, "GET /api/rooms"),
        roomsDetail: httpSummary(pages[i].metrics, "GET /api/rooms/:id"),
        participants: httpSummary(pages[i].metrics, "POST /participants")
      };
      rawClients[specs[i].id] = raw;
    }
    const runtimeJoins = {};
    for (const spec of specs) {
      const finalLocal = latestSnapshot(rawClients[spec.id]).local || joins[spec.id]?.local || {};
      runtimeJoins[spec.id] = {
        requestedId: spec.id,
        playerId: finalLocal.id || profiles[spec.id]?.playerId || "",
        persistentPlayerId: profiles[spec.id]?.persistentPlayerId || "",
        intendedTeam: spec.team,
        intendedSlotId: spec.slotId
      };
    }
    const clients = {};
    for (let i = 0; i < specs.length; i += 1) {
      const spec = specs[i];
      const remoteSpec = specs.find((item) => item.id !== spec.id);
      const raw = rawClients[spec.id];
      const latest = latestSnapshot(raw);
      const local = latest.local || null;
      const presenceSamples = presenceMismatchSamples(raw.presence || []);
      const remoteDeltas = (raw.syncs || []).flatMap((item) => (item.remoteDeltas || []).map((entry) => entry.delta));
      const timingByName = {};
      for (const timing of raw.timings || []) {
        timingByName[timing.name] = timingByName[timing.name] || [];
        timingByName[timing.name].push(timing.duration);
      }
      clients[spec.id] = {
        page: raw.name,
        profile: profiles[spec.id],
        join: joins[spec.id],
        slotSelect: slotSelects[spec.id],
        ready: readies[spec.id],
        intended: { team: spec.team, slotId: spec.slotId },
        local,
        playerEntity: latest.playerEntity || null,
        localMatchesIntended: Boolean(local?.id === runtimeJoins[spec.id].playerId && local?.team === spec.team && local?.slotId === spec.slotId),
        players: latest.players || [],
        roleSlots: latest.roleSlots || [],
        roomPlayers: latest.roomPlayers || [],
        buffers: latest.buffers || [],
        field: latest.field || [],
        minimap: latest.minimap || [],
        remoteAssessment: remoteAssessment({ ...latest, applies: raw.applies || [] }, spec, remoteSpec, runtimeJoins),
        presenceMismatchMax: maxDistance(presenceSamples.map((sample) => sample.distance)),
        presenceSamples: presenceSamples.slice(-10),
        relaySamples: (raw.relays || []).slice(-10),
        publishCount: raw.publishes?.length || 0,
        applyCount: raw.applies?.length || 0,
        selfIgnored: raw.selfIgnored || 0,
        staleRejected: raw.staleRejected || 0,
        ws: raw.ws || {},
        frameStats: stat((raw.frames || []).map((item) => item.gap)),
        longTaskStats: stat((raw.longTasks || []).map((item) => item.duration)),
        timingStats: Object.fromEntries(Object.entries(timingByName).map(([name, values]) => [name, stat(values)])),
        roomRefreshRemoteDeltaMax: maxDistance(remoteDeltas),
        http: raw.http,
        inputTicks: (raw.inputTicks || []).slice(-10),
        errors: raw.errors || []
      };
    }
    const finalRoom = (await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`)).room;
    await requestJson(`/api/rooms/${encodeURIComponent(roomId)}`, { method: "DELETE" }).catch(() => null);
    const results = {
      ok: true,
      measurement: "P0-11E 2P baseline player core sync/stutter instrumentation",
      roomId,
      profiles,
      runtimeJoins,
      clients,
      finalRoom: {
        phase: finalRoom.phase,
        locked: Boolean(finalRoom.locked),
        players: (finalRoom.players || []).map((player) => ({
          id: player.id,
          team: player.team,
          slotId: player.slotId,
          ready: Boolean(player.ready),
          x: Math.round(Number(player.position?.x ?? player.x) || 0),
          y: Math.round(Number(player.position?.y ?? player.y) || 0),
          stateSeq: Number(player.position?.stateSeq ?? player.stateSeq) || 0
        }))
      }
    };
    results.summary = summarizeResults(results);
    results.decision = decide(results);
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await Promise.all(pages.map((page) => stopMotion(page).catch(() => null)));
    await Promise.all(pages.map((page) => page.close()));
    try { server.kill(); } catch (_error) {}
    try {
      if (fs.existsSync(roomsFile)) fs.unlinkSync(roomsFile);
      if (fs.existsSync(`${roomsFile}.tmp`)) fs.unlinkSync(`${roomsFile}.tmp`);
    } catch (_error) {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
