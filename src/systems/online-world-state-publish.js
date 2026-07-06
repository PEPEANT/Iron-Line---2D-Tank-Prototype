"use strict";

(function registerOnlineWorldStatePublish(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  IronLine.installOnlineWorldStatePublish = function installOnlineWorldStatePublish(Game) {
    Object.assign(Game.prototype, {
      publishOnlineWorldState(room = this.onlineCombatRoom()) {
        if (!room?.id) return false;
        const registry = IronLine.roomRegistry;
        const captured = this.captureOnlineWorldState(room);
        const worldState = registry?.normalizeWorldState?.({
          ...captured,
          roomId: room.id,
          updatedAt: Date.now()
        }) || captured;
        if (IronLine.WorldStatePublishGuard?.shouldPublish?.(this.onlineWorldLastPublishedState || null, worldState) === false) {
          return false;
        }
        const socketSent = this.hud?.sessionFlow?.publishWorldStateRelay?.(this, room.id, worldState) === true;
        this.onlineWorldLastPublishedState = worldState;
        if (socketSent) return true;
        registry?.updateWorldState?.(room.id, worldState);
        return false;
      }
    });
  };
})(window);
