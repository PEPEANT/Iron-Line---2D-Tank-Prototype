(function registerOnlineCombatStabilizer(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  function finiteNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function eventTime(event = {}) {
    const numeric = Number(event.createdAt || event.updatedAt || 0);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(event.createdAt || event.updatedAt || "");
    return Number.isFinite(parsed) ? parsed : 0;
  }

  class OnlineCombatStabilizer {
    static nextSequence(game, key = "onlineCombatSequence") {
      if (!game) return 0;
      game[key] = Math.max(0, Math.floor(Number(game[key]) || 0)) + 1;
      return game[key];
    }

    static makeEventId(game, type = "event", suffix = "") {
      const roomId = game?.onlineSession?.roomId || "local";
      const playerId = game?.onlineSession?.playerId || "player";
      const seq = OnlineCombatStabilizer.nextSequence(game, "onlineCombatEventSequence");
      const tail = suffix ? `:${String(suffix).slice(0, 24)}` : "";
      return `${roomId}:${type}:${playerId}:${seq}${tail}`;
    }

    static hitKey(event = {}) {
      return String(event.hitId || event.id || "").slice(0, 96);
    }

    static deathKey(event = {}) {
      return String(event.deathId || event.id || "").slice(0, 96);
    }

    static respawnKey(event = {}) {
      return String(event.respawnId || event.id || "").slice(0, 96);
    }

    static isStaleForLocalPlayer(game, event = {}) {
      const createdAt = eventTime(event);
      const lastRespawnAt = Number(game?.onlineLastRespawnAt) || 0;
      if (lastRespawnAt > 0 && createdAt > 0 && createdAt < lastRespawnAt) return true;
      const eventSeq = Number(event.targetStateSeq || event.stateSeq || 0);
      const lastRespawnSeq = Number(game?.onlineLastRespawnStateSeq || 0);
      if (eventSeq > 0 && lastRespawnSeq > 0 && eventSeq < lastRespawnSeq) return true;
      return false;
    }

    static rememberSet(game, setName, key, limit = 360) {
      if (!game || !key) return false;
      const set = game[setName] || (game[setName] = new Set());
      if (set.has(key)) return false;
      set.add(key);
      if (set.size > limit) {
        const removeCount = set.size - Math.floor(limit * 0.75);
        let index = 0;
        for (const item of set) {
          set.delete(item);
          index += 1;
          if (index >= removeCount) break;
        }
      }
      return true;
    }

    static trace(game, entry = {}) {
      if (!game) return null;
      const trace = game.onlineCombatTrace || (game.onlineCombatTrace = []);
      const item = {
        at: Date.now(),
        stage: String(entry.stage || "").slice(0, 32),
        result: String(entry.result || "").slice(0, 24),
        reason: String(entry.reason || "").slice(0, 48),
        eventId: String(entry.eventId || entry.id || "").slice(0, 96),
        type: String(entry.type || "").slice(0, 32),
        shooterId: String(entry.shooterId || "").slice(0, 48),
        targetPlayerId: String(entry.targetPlayerId || "").slice(0, 48),
        sequence: finiteNumber(entry.sequence, 0),
        stateSeq: finiteNumber(entry.stateSeq || entry.targetStateSeq, 0),
        hp: Number.isFinite(Number(entry.hp)) ? Math.round(Number(entry.hp) * 10) / 10 : null,
        damage: Number.isFinite(Number(entry.damage)) ? Math.round(Number(entry.damage) * 10) / 10 : null
      };
      trace.push(item);
      if (trace.length > 80) trace.splice(0, trace.length - 80);
      return item;
    }

    static playerHealthSnapshot(game) {
      const player = game?.player || null;
      if (!player) return { hp: 0, maxHp: 0 };
      return {
        hp: Math.max(0, Math.round((Number(player.hp) || 0) * 10) / 10),
        maxHp: Math.max(1, Math.round((Number(player.maxHp) || 100) * 10) / 10)
      };
    }

    static remoteHealth(player = {}) {
      const position = player.position || {};
      const hp = Number(position.hp ?? player.hp);
      const maxHp = Number(position.maxHp ?? player.maxHp);
      return {
        hp: Number.isFinite(hp) ? hp : null,
        maxHp: Number.isFinite(maxHp) ? maxHp : null,
        stateSeq: Number(position.stateSeq ?? player.stateSeq ?? 0) || 0
      };
    }
  }

  IronLine.OnlineCombatStabilizer = OnlineCombatStabilizer;
})(window);
