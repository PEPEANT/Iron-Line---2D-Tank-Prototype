"use strict";

(function registerDeferredJsonFetch(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const pendingLatest = new Map();

  function schedule(task, timeoutMs = 500) {
    if (typeof requestIdleCallback === "function") requestIdleCallback(task, { timeout: timeoutMs });
    else setTimeout(task, Math.min(120, Math.max(20, timeoutMs / 5)));
  }

  function postJson(url, payload = {}, options = {}) {
    return fetch(url, {
      method: options.method || "POST",
      headers: { "content-type": "application/json", ...(options.headers || {}) },
      body: JSON.stringify(payload)
    }).then((response) => response.ok ? response.json() : null);
  }

  function postLatestJson(key = "", url = "", payload = {}, options = {}) {
    if (!key || !url) return postJson(url, payload, options);
    const current = pendingLatest.get(key);
    if (current) {
      current.payload = payload;
      return current.promise;
    }
    const entry = { payload, promise: null };
    entry.promise = new Promise((resolve) => {
      setTimeout(() => schedule(() => {
        const latest = pendingLatest.get(key) || entry;
        pendingLatest.delete(key);
        postJson(url, latest.payload, options).then(resolve).catch(() => resolve(null));
      }, options.timeoutMs || 650), Math.max(0, Number(options.delayMs) || 0));
    });
    pendingLatest.set(key, entry);
    return entry.promise;
  }

  IronLine.DeferredJsonFetch = { postJson, postLatestJson };
})(window);
