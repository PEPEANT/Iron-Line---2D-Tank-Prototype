"use strict";

function endpointSummary(metrics, key) {
  const item = metrics.http.get(key);
  if (!item) return { count: 0, avgBytes: 0, maxBytes: 0, avgMs: 0, maxMs: 0, statuses: {} };
  return {
    count: item.count,
    avgBytes: Math.round(item.bytesTotal / Math.max(1, item.count)),
    maxBytes: item.bytesMax,
    avgMs: Math.round((item.msTotal / Math.max(1, item.count)) * 10) / 10,
    maxMs: Math.round(item.msMax * 10) / 10,
    statuses: item.statuses
  };
}

function detailFetchSummary(item) {
  return {
    count: item.count,
    avgBytes: Math.round(item.bytesTotal / Math.max(1, item.count)),
    maxBytes: item.bytesMax
  };
}

function summarizeScenario(metrics, finalRoom, samples = {}) {
  const endpoints = {};
  for (const key of ["GET /api/rooms", "GET /api/rooms/:id", "POST /participants", "POST /combat", "POST /api/rooms"]) {
    endpoints[key] = endpointSummary(metrics, key);
  }
  const finalCombatEvents = Array.isArray(finalRoom?.combatEvents) ? finalRoom.combatEvents.length : 0;
  const clientEventCounts = (samples.clientCombatEvents || []).map((item) => item.combatEvents);
  return {
    scenario: metrics.name,
    durationSec: 10,
    measurement: "API replay, not live gameplay",
    endpoints,
    detailFetch: {
      full: detailFetchSummary(metrics.detailFetch.full),
      delta: detailFetchSummary(metrics.detailFetch.delta)
    },
    fs: metrics.fs,
    localStorage: metrics.localStorage,
    ws: metrics.ws,
    roomShapes: metrics.roomShapes,
    finalRoom: finalRoom ? {
      players: Array.isArray(finalRoom.players) ? finalRoom.players.length : 0,
      combatEvents: Array.isArray(finalRoom.combatEvents) ? finalRoom.combatEvents.length : 0,
      hasWorldState: Object.prototype.hasOwnProperty.call(finalRoom, "worldState"),
      worldStateIncluded: finalRoom.worldState !== undefined
    } : null,
    detailSamples: samples,
    eventSync: {
      finalCombatEvents,
      clientEventCounts,
      ok: clientEventCounts.every((count) => count === finalCombatEvents)
    },
    errors: metrics.errors.slice(0, 8)
  };
}

function printSummary(results) {
  console.log("");
  console.log("P0 HTTP participants/combat load probe");
  console.log("Measurement type: API replay, not live gameplay");
  console.log("");
  console.table(results.map((result) => ({
    scenario: result.scenario,
    getRooms: result.endpoints["GET /api/rooms"].count,
    getRoomDetail: result.endpoints["GET /api/rooms/:id"].count,
    participantPost: result.endpoints["POST /participants"].count,
    combatPost: result.endpoints["POST /combat"].count,
    postRooms: result.endpoints["POST /api/rooms"].count,
    participantAvgBytes: result.endpoints["POST /participants"].avgBytes,
    participantMaxBytes: result.endpoints["POST /participants"].maxBytes,
    roomDetailAvgBytes: result.endpoints["GET /api/rooms/:id"].avgBytes,
    roomDetailMaxBytes: result.endpoints["GET /api/rooms/:id"].maxBytes,
    detailFullAvgBytes: result.detailFetch.full.avgBytes,
    detailDeltaAvgBytes: result.detailFetch.delta.avgBytes,
    finalFullDetailBytes: result.detailSamples.finalFullDetailBytes,
    finalDeltaDetailBytes: result.detailSamples.finalDeltaDetailBytes,
    combatAvgBytes: result.endpoints["POST /combat"].avgBytes,
    combatMaxBytes: result.endpoints["POST /combat"].maxBytes,
    persistWriteFileSync: result.fs.writeFileSync,
    persistRenameSync: result.fs.renameSync,
    localStorageSetItem: result.localStorage.setItem,
    finalCombatEvents: result.finalRoom?.combatEvents ?? null,
    eventSyncOk: result.eventSync.ok
  })));
  console.log(JSON.stringify(results, null, 2));
}

function assertEventSync(results) {
  const failedSync = results.filter((result) => !result.eventSync.ok);
  if (failedSync.length) throw new Error(`Detail delta event sync mismatch: ${failedSync.map((result) => result.scenario).join(", ")}`);
}

module.exports = {
  assertEventSync,
  printSummary,
  summarizeScenario
};
