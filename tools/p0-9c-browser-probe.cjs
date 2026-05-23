"use strict";

async function installProbe(page) {
  await page.eval(`(() => {
    window.__p09cIntervals = window.__p09cIntervals || [];
    window.__p09cLastWsState = window.__p09cLastWsState || {};
    window.__p09cWsTrack = window.__p09cWsTrack || {};
    const dist = (a, b, c, d) => Math.hypot((Number(a) || 0) - (Number(c) || 0), (Number(b) || 0) - (Number(d) || 0));
    const probe = () => window.__p09cProbe;

    if (!Storage.prototype.__p09cWrapped) {
      const originalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        const p = probe();
        if (p) { p.storageSetItem += 1; p.storageBytes += String(value || "").length; }
        return originalSet.call(this, key, value);
      };
      Storage.prototype.__p09cWrapped = true;
    }

    window.__p09cReset = function() {
      window.__p09cLastWsState = {};
      window.__p09cWsTrack = {};
      window.__p09cProbe = {
        frames: [],
        storageSetItem: 0,
        storageBytes: 0,
        refreshRemoteRooms: 0,
        refreshRemoteRoomsMs: [],
        errors: [],
        relay: { attempts: 0, sent: 0, noEnsure: 0, notOpen: 0, readyStates: {}, urls: [], socketOpen: 0, socketClose: 0, socketError: 0 },
        wsAccepted: { count: 0, gapMs: [], snapPx: [], ageMs: [], staleRejects: 0 },
        session: { samples: 0, missing: 0, updates: 0, gapMs: [], snapPx: [], ageMs: [], wsToSessionPx: [], seqBehindWs: [], staleVsWs: 0 },
        render: { samples: 0, entries: 0, renderToSessionPx: [], renderToWsPx: [], alpha: [], zeroEntryFrames: 0 }
      };
      window.onerror = (m) => window.__p09cProbe.errors.push(String(m));
      window.onunhandledrejection = (e) => window.__p09cProbe.errors.push(String(e.reason || e));
      window.__p09cPatchRuntime();
    };

    window.__p09cPatchRuntime = function() {
      const game = window.IronLine?.game;
      const flow = game?.hud?.sessionFlow;
      const renderer = game?.renderer;
      const registry = window.IronLine?.roomRegistry;

      if (flow && !flow.__p09cApplyPatched) {
        const originalApply = flow.applyRemotePlayerState.bind(flow);
        flow.applyRemotePlayerState = function(payload = {}, ...args) {
          const accepted = originalApply(payload, ...args);
          const p = probe();
          if (!p) return accepted;
          if (!accepted) {
            p.wsAccepted.staleRejects += 1;
            return accepted;
          }
          const id = String(payload.playerId || "");
          const state = payload.state || {};
          const now = Date.now();
          const pos = {
            x: Number(state.x),
            y: Number(state.y),
            stateSeq: Math.max(0, Math.floor(Number(state.stateSeq) || 0)),
            updatedAt: Number(state.updatedAt || state.stateUpdatedAt || now) || now
          };
          if (!id || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return accepted;
          const previous = window.__p09cWsTrack[id];
          if (previous?.seenAt) p.wsAccepted.gapMs.push(now - previous.seenAt);
          if (previous) p.wsAccepted.snapPx.push(dist(pos.x, pos.y, previous.x, previous.y));
          p.wsAccepted.ageMs.push(Math.max(0, now - pos.updatedAt));
          p.wsAccepted.count += 1;
          window.__p09cWsTrack[id] = { ...pos, seenAt: now };
          window.__p09cLastWsState[id] = { ...pos, seenAt: now };
          return accepted;
        };
        flow.__p09cApplyPatched = true;
      }

      if (flow && !flow.__p09cPublishPatched) {
        const originalEnsure = flow.ensurePlayerStateSocket.bind(flow);
        flow.ensurePlayerStateSocket = function(...args) {
          const beforeSocket = this.playerStateSocket;
          const result = originalEnsure(...args);
          const p = probe();
          if (p) {
            const url = this.playerStateSocketUrl?.() || "";
            if (url && !p.relay.urls.includes(url)) p.relay.urls.push(url);
            const socket = this.playerStateSocket;
            if (socket && socket !== beforeSocket && !socket.__p09cSocketTracked) {
              socket.addEventListener("open", () => { const current = probe(); if (current) current.relay.socketOpen += 1; });
              socket.addEventListener("close", () => { const current = probe(); if (current) current.relay.socketClose += 1; });
              socket.addEventListener("error", () => { const current = probe(); if (current) current.relay.socketError += 1; });
              socket.__p09cSocketTracked = true;
            }
          }
          return result;
        };
        const originalPublishRelay = flow.publishPlayerStateRelay.bind(flow);
        flow.publishPlayerStateRelay = function(gameArg, player, position, now) {
          const p = probe();
          if (p) {
            p.relay.attempts += 1;
            const socket = this.playerStateSocket;
            const state = socket ? String(socket.readyState) : "none";
            p.relay.readyStates[state] = (p.relay.readyStates[state] || 0) + 1;
          }
          const result = originalPublishRelay(gameArg, player, position, now);
          const after = probe();
          if (after) {
            if (result) after.relay.sent += 1;
            else if (!this.playerStateSocket) after.relay.noEnsure += 1;
            else if (this.playerStateSocket.readyState !== WebSocket.OPEN) after.relay.notOpen += 1;
          }
          return result;
        };
        flow.__p09cPublishPatched = true;
      }

      if (renderer && !renderer.__p09cRemotePatched) {
        const originalRemoteHumanPlayers = renderer.remoteHumanPlayers.bind(renderer);
        renderer.remoteHumanPlayers = function(gameArg) {
          const entries = originalRemoteHumanPlayers(gameArg);
          const p = probe();
          if (p) {
            p.render.samples += 1;
            if (!entries.length) p.render.zeroEntryFrames += 1;
            for (const entry of entries) {
              const id = String(entry.id || "");
              const sessionPlayer = (gameArg?.onlineSession?.players || []).find((player) => player.id === id);
              const raw = sessionPlayer?.position || sessionPlayer || {};
              const lastWs = window.__p09cLastWsState[id];
              const unit = entry.unit || {};
              p.render.entries += 1;
              if (Number.isFinite(Number(raw.x)) && Number.isFinite(Number(raw.y))) {
                p.render.renderToSessionPx.push(dist(unit.x, unit.y, raw.x, raw.y));
              }
              if (lastWs) p.render.renderToWsPx.push(dist(unit.x, unit.y, lastWs.x, lastWs.y));
              if (Number.isFinite(Number(entry.alpha))) p.render.alpha.push(Number(entry.alpha));
            }
          }
          return entries;
        };
        renderer.__p09cRemotePatched = true;
      }

      if (registry && !registry.__p09cRefreshPatched) {
        const originalRefresh = registry.refreshRemoteRooms?.bind(registry);
        if (originalRefresh) {
          registry.refreshRemoteRooms = async function(...args) {
            const started = performance.now();
            try { return await originalRefresh(...args); }
            finally {
              const p = probe();
              if (p) {
                p.refreshRemoteRooms += 1;
                p.refreshRemoteRoomsMs.push(performance.now() - started);
              }
            }
          };
        }
        registry.__p09cRefreshPatched = true;
      }
    };

    if (!window.__p09cFramesStarted) {
      window.__p09cFramesStarted = true;
      let last = performance.now();
      requestAnimationFrame(function loop(now) {
        const p = probe();
        if (p) p.frames.push(Math.max(0, now - last));
        last = now;
        requestAnimationFrame(loop);
      });
    }

    window.__p09cStartSessionSampler = function(remoteId) {
      let lastKey = "";
      let lastPos = null;
      let lastSeenAt = 0;
      const interval = setInterval(() => {
        window.__p09cPatchRuntime();
        const p = probe();
        const game = window.IronLine?.game;
        if (!p || !game) return;
        p.session.samples += 1;
        const remote = (game.onlineSession?.players || []).find((item) => item.id === remoteId);
        if (!remote?.position) {
          p.session.missing += 1;
          return;
        }
        const pos = remote.position || {};
        const now = Date.now();
        const x = Number(pos.x);
        const y = Number(pos.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          p.session.missing += 1;
          return;
        }
        const age = Math.max(0, now - (Number(pos.updatedAt || pos.stateUpdatedAt || remote.updatedAt) || now));
        p.session.ageMs.push(age);
        const key = [pos.stateSeq || 0, pos.updatedAt || 0, x, y].join("/");
        if (key !== lastKey) {
          if (lastSeenAt) p.session.gapMs.push(now - lastSeenAt);
          if (lastPos) p.session.snapPx.push(dist(x, y, lastPos.x, lastPos.y));
          lastKey = key;
          lastSeenAt = now;
          lastPos = { x, y };
          p.session.updates += 1;
        }
        const ws = window.__p09cLastWsState[remoteId];
        if (ws) {
          p.session.wsToSessionPx.push(dist(x, y, ws.x, ws.y));
          const behind = Math.max(0, Math.floor(Number(ws.stateSeq) || 0) - Math.floor(Number(pos.stateSeq) || 0));
          p.session.seqBehindWs.push(behind);
          if (behind > 0 || dist(x, y, ws.x, ws.y) > 2) p.session.staleVsWs += 1;
        }
      }, 60);
      window.__p09cIntervals.push(interval);
    };

    window.__p09cStartLocalMovement = function(baseX, baseY, direction) {
      let step = 0;
      const interval = setInterval(() => {
        const game = window.IronLine?.game;
        if (!game?.player) return;
        step += 1;
        game.player.x = baseX + direction * step * 4;
        game.player.y = baseY + Math.round(Math.sin(step / 4) * 16);
        game.player.angle = direction > 0 ? 0 : Math.PI;
        game.player.vx = direction * 42;
        game.player.vy = Math.cos(step / 4) * 6;
        if (game.input?.mouse) {
          game.input.mouse.worldX = game.player.x + direction * 220;
          game.input.mouse.worldY = game.player.y;
        }
      }, 75);
      window.__p09cIntervals.push(interval);
    };

    window.__p09cStop = function() {
      for (const id of window.__p09cIntervals || []) clearInterval(id);
      window.__p09cIntervals = [];
    };

    window.__p09cCollect = function() {
      const p = probe() || {};
      const game = window.IronLine?.game;
      const flow = game?.hud?.sessionFlow;
      const frames = (p.frames || []).slice(1).filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
      return {
        env: {
          href: window.location.href,
          apiBase: window.IronLine?.roomRegistry?.apiBase || "",
          socketUrl: flow?.playerStateSocketUrl?.() || "",
          typeofWebSocket: typeof WebSocket,
          sessionMode: game?.sessionMode || "",
          roomId: game?.onlineSession?.roomId || "",
          participantType: game?.onlineSession?.participantType || "",
          socketRoomId: flow?.playerStateSocketRoomId || "",
          socketPlayerId: flow?.playerStateSocketPlayerId || ""
        },
        frames,
        storageSetItem: p.storageSetItem || 0,
        storageBytes: p.storageBytes || 0,
        refreshRemoteRooms: p.refreshRemoteRooms || 0,
        refreshRemoteRoomsMs: p.refreshRemoteRoomsMs || [],
        errors: (p.errors || []).slice(0, 10),
        relay: p.relay || {},
        wsAccepted: p.wsAccepted || {},
        session: p.session || {},
        render: p.render || {}
      };
    };

    window.__p09cReset();
  })()`);
}

module.exports = { installProbe };
