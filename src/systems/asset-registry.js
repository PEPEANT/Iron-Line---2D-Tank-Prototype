"use strict";

(function registerAssetRegistry(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  const BLOCKED_GAMEPLAY_KEYS = new Set([
    "damage",
    "hp",
    "range",
    "reload",
    "speed",
    "team",
    "ai",
    "online",
    "authority",
    "hitbox"
  ]);

  function clone(value) {
    return value ? JSON.parse(JSON.stringify(value)) : value;
  }

  function isAbsoluteAssetPath(path) {
    return /^(?:[a-z]+:)?\/\//iu.test(path) || path.startsWith("/") || path.startsWith("data:");
  }

  function alphaColor(color, alpha) {
    const value = String(color || "");
    const nextAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));
    if (/^rgba\(/iu.test(value)) return value.replace(/,\s*[\d.]+\)$/u, `, ${nextAlpha})`);
    if (/^rgb\(/iu.test(value)) return value.replace(/\)$/u, `, ${nextAlpha})`).replace(/^rgb\(/iu, "rgba(");
    return value || `rgba(255, 255, 255, ${nextAlpha})`;
  }

  function containsBlockedGameplayKey(value) {
    if (!value || typeof value !== "object") return false;
    for (const key of Object.keys(value)) {
      if (BLOCKED_GAMEPLAY_KEYS.has(key)) return true;
      if (containsBlockedGameplayKey(value[key])) return true;
    }
    return false;
  }

  class AssetRegistry {
    constructor(defaultPack = null) {
      this.pack = null;
      this.slots = new Map();
      this.images = new Map();
      this.errors = [];
      this.usePack(defaultPack || { id: "empty", slots: {} }, { sourceUrl: "" });
    }

    usePack(pack, options = {}) {
      const nextPack = clone(pack) || { id: "empty", slots: {} };
      nextPack.slots = nextPack.slots || {};
      this.validatePack(nextPack);
      this.pack = nextPack;
      this.sourceUrl = options.sourceUrl || "";
      this.slots = new Map(Object.entries(nextPack.slots));
      this.preloadImages();
      return this;
    }

    validatePack(pack) {
      if (containsBlockedGameplayKey(pack)) {
        this.errors.push(`Asset pack ${pack.id || "(unknown)"} contains gameplay keys.`);
      }
    }

    slot(id) {
      return this.slots.get(String(id || "")) || null;
    }

    style(id, fallback = {}) {
      return {
        ...(fallback || {}),
        ...(this.slot(id)?.style || {})
      };
    }

    fallback(id, fallback = {}) {
      return {
        ...(fallback || {}),
        ...(this.slot(id)?.fallback || {})
      };
    }

    image(id) {
      return this.images.get(String(id || "")) || null;
    }

    imageReady(id) {
      const image = this.image(id);
      return Boolean(image && image.complete && image.naturalWidth > 0);
    }

    resolveAssetPath(assetPath) {
      const raw = String(assetPath || "");
      if (!raw) return "";
      if (isAbsoluteAssetPath(raw)) return raw;
      const basePath = String(this.pack?.basePath || "");
      const joined = `${basePath}${raw}`;
      if (!this.sourceUrl || isAbsoluteAssetPath(joined)) return joined;
      try {
        return new URL(joined, this.sourceUrl).href;
      } catch (_error) {
        return joined;
      }
    }

    preloadImages() {
      this.images.clear();
      for (const [id, slot] of this.slots.entries()) {
        if (!slot || slot.type !== "image" || !slot.src || typeof Image === "undefined") continue;
        const image = new Image();
        image.decoding = "async";
        image.src = this.resolveAssetPath(slot.src);
        this.images.set(id, image);
      }
    }

    async loadFromUrl(url) {
      if (!url || typeof fetch !== "function") return this;
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const pack = await response.json();
        this.usePack(pack, { sourceUrl: response.url || url });
      } catch (error) {
        this.errors.push(`Asset pack load failed: ${error.message || error}`);
        console.warn?.("[IronLine] Asset pack load failed", error);
      }
      return this;
    }

    loadFromQuery() {
      try {
        const params = new URLSearchParams(global.location?.search || "");
        const url = params.get("assetPack") || params.get("skinManifest") || params.get("assets");
        if (url) this.loadFromUrl(url);
      } catch (_error) {
        // Query loading is optional; the built-in pack remains active.
      }
      return this;
    }
  }

  IronLine.AssetRegistry = AssetRegistry;
  IronLine.assetAlphaColor = alphaColor;
  IronLine.assetRegistry = new AssetRegistry(IronLine.defaultAssetPack);
  IronLine.assetRegistry.loadFromQuery();
})(window);
