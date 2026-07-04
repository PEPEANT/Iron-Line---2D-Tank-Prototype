"use strict";

(function registerBuildInfo(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const STATIC_BUILD_ID = "deploy-check-2026-05-21";
  const GAME_VERSION = "ALPHA R1.0";
  IronLine.gameVersion = GAME_VERSION;

  const info = {
    source: "client",
    buildId: STATIC_BUILD_ID,
    loadedAt: new Date().toISOString(),
    commit: "",
    branch: "",
    startedAt: "",
    apiAvailable: false
  };
  IronLine.buildInfo = info;

  function short(value = "") {
    return String(value || "").slice(0, 7) || "local";
  }

  function label() {
    const commit = short(info.commit || info.buildId);
    const branch = info.branch ? ` ${info.branch}` : "";
    return `Build ${commit}${branch}`;
  }

  function detail() {
    return [
      `buildId=${info.buildId || ""}`,
      `commit=${info.commit || ""}`,
      `branch=${info.branch || ""}`,
      `loadedAt=${info.loadedAt || ""}`,
      `startedAt=${info.startedAt || ""}`,
      `api=${info.apiAvailable ? "ok" : "pending"}`
    ].join(" ");
  }

  function ensureBadge() {
    let badge = document.getElementById("buildInfoBadge");
    if (badge) return badge;
    badge = document.createElement("div");
    badge.id = "buildInfoBadge";
    badge.className = "build-info-badge";
    badge.setAttribute("aria-label", "build information");
    const settings = document.querySelector(".settings-list");
    const adminHead = document.querySelector(".admin-head > div");
    if (settings) settings.appendChild(badge);
    else if (adminHead) adminHead.appendChild(badge);
    else document.body.appendChild(badge);
    return badge;
  }

  function render() {
    if (!document.body) return;
    const versionBadge = document.querySelector(".game-version-badge");
    if (versionBadge) versionBadge.textContent = GAME_VERSION;
    document.body.dataset.ironLineBuild = info.buildId || "";
    document.body.dataset.ironLineCommit = info.commit || "";
    const badge = ensureBadge();
    badge.textContent = label();
    badge.title = detail();
  }

  function merge(next = {}) {
    Object.assign(info, next, {
      apiAvailable: Boolean(next.ok !== false && (next.commit || next.branch || next.startedAt))
    });
    render();
    global.dispatchEvent(new CustomEvent("iron-line-build-info", { detail: { ...info } }));
    console.info("[Iron Line build]", { ...info });
  }

  async function refresh() {
    if (!/^https?:$/i.test(global.location?.protocol || "")) {
      render();
      console.info("[Iron Line build]", { ...info });
      return;
    }
    try {
      const response = await fetch(`/api/build?ts=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`build_api_${response.status}`);
      merge(await response.json());
    } catch (error) {
      info.apiAvailable = false;
      info.error = error?.message || "build_api_failed";
      render();
      console.info("[Iron Line build]", { ...info });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh, { once: true });
  } else {
    refresh();
  }
})(window);
