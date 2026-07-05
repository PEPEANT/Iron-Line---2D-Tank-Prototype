"use strict";

(function registerMapObjects(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  function normalizeMapObjects(world, options = {}) {
    if (!world || !IronLine.MapSchema?.normalizeWorld) return world;
    IronLine.objectCatalog?.refresh?.();
    return IronLine.MapSchema.normalizeWorld(world, {
      catalog: IronLine.objectCatalog,
      ...options
    });
  }

  function installMapObjects(Game) {
    const proto = Game?.prototype;
    if (!proto || proto.mapObjectsInstalled) return;

    const baseSetWorld = proto.setWorld;
    proto.setWorld = function setWorldWithMapObjects(world) {
      return baseSetWorld.call(this, normalizeMapObjects(world));
    };

    proto.mapObjectsInstalled = true;
  }

  IronLine.normalizeMapObjects = normalizeMapObjects;
  IronLine.installMapObjects = installMapObjects;
})(typeof window !== "undefined" ? window : globalThis);
