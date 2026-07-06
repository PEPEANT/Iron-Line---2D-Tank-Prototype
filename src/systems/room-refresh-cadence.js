"use strict";

(function registerRoomRefreshCadence(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const ACTIVE_MATCH_SUMMARY_REFRESH_MS = 6000;
  const ACTIVE_MATCH_DETAIL_REFRESH_MS = 6000;
  const ACTIVE_MATCH_SOCKET_REFRESH_MS = 30000;

  function realtimeSocketActive() {
    if (typeof WebSocket !== "function") return false;
    const flow = IronLine.game?.hud?.sessionFlow;
    const socket = flow?.playerStateSocket;
    return Boolean(flow?.playerStateSocketOpen && socket?.readyState === WebSocket.OPEN);
  }

  function activeOnlineMatchRoomId(registry) {
    const game = IronLine.game;
    const onlineRoomId = game?.onlineSession?.roomId || "";
    const roomId = onlineRoomId || registry.selectedRoomId();
    if (!roomId || (onlineRoomId === roomId && game?.result)) return "";
    const remoteRoom = (registry.remoteRooms || []).find((item) => item.id === roomId);
    if (remoteRoom?.phase === "playing") return roomId;
    if (onlineRoomId === roomId && game?.sessionMode === "online" && game?.matchStarted && !game?.result) return roomId;
    const room = registry.readLocalRooms().find((item) => item.id === roomId);
    return room?.phase === "playing" ? roomId : "";
  }

  function remoteRefreshPlan(registry, now = Date.now(), options = {}) {
    const activeRoomId = activeOnlineMatchRoomId(registry);
    if (!activeRoomId) return { activeRoomId: "", summaryDue: true, detailDue: true };
    if (!options.periodic) return { activeRoomId, summaryDue: true, detailDue: true };
    const hasActiveRoom = (registry.remoteRooms || []).some((room) => room.id === activeRoomId);
    const refreshMs = realtimeSocketActive() ? ACTIVE_MATCH_SOCKET_REFRESH_MS : ACTIVE_MATCH_DETAIL_REFRESH_MS;
    return {
      activeRoomId,
      summaryDue: !hasActiveRoom || now - registry.lastRemoteSummaryRefreshAt >= ACTIVE_MATCH_SUMMARY_REFRESH_MS,
      detailDue: !hasActiveRoom || now - registry.lastRemoteDetailRefreshAt >= refreshMs
    };
  }

  function shouldPersistRemoteRefresh(registry, rooms = [], changed = false) {
    if (!changed) return false;
    const activeRoomId = activeOnlineMatchRoomId(registry);
    if (!activeRoomId) return true;
    const activeRoom = (rooms || []).find((room) => room.id === activeRoomId);
    return activeRoom?.phase !== "playing";
  }

  async function refreshActiveRoomDetail(registry, activeRoomId = "", now = Date.now()) {
    if (!activeRoomId || !registry.canUseRemoteApi() || registry.remoteRefreshInFlight || registry.deletedRemoteRoomIds.has(activeRoomId)) return;
    registry.remoteRefreshInFlight = true;
    try {
      const previousSignature = registry.remoteSignature;
      const wasOnline = registry.remoteOnline;
      const previousDetail = registry.listRooms().find((room) => room.id === activeRoomId) || null;
      const detailRoom = await registry.fetchRemoteRoomDetail(activeRoomId, previousDetail);
      if (!detailRoom) return;
      registry.upsertRemoteRoom(registry.preserveFreshWorldState?.(detailRoom) || detailRoom, { persist: false });
      registry.lastRemoteDetailRefreshAt = now;
      registry.remoteOnline = true;
      if (!wasOnline || registry.remoteSignature !== previousSignature) registry.emit();
    } catch (_error) {
      const changed = registry.remoteOnline;
      registry.remoteOnline = false;
      if (changed) registry.emit();
    } finally {
      registry.remoteRefreshInFlight = false;
    }
  }

  async function refreshRemoteRooms(registry, options = {}) {
    if (!registry.canUseRemoteApi() || registry.remoteRefreshInFlight) return;
    const now = Date.now();
    const refreshPlan = remoteRefreshPlan(registry, now, options);
    if (refreshPlan.activeRoomId && !refreshPlan.summaryDue) {
      if (refreshPlan.detailDue) await refreshActiveRoomDetail(registry, refreshPlan.activeRoomId, now);
      return;
    }
    registry.remoteRefreshInFlight = true;
    try {
      const response = await fetch(registry.roomsApiUrl(), { cache: "no-store" });
      if (!response.ok) throw new Error(`rooms_api_${response.status}`);
      registry.lastRemoteSummaryRefreshAt = now;
      const payload = await response.json();
      const summaries = Array.isArray(payload.rooms) ? payload.rooms : [];
      const summaryRooms = summaries.map((room) => registry.normalizeRoom(room)).filter(Boolean);
      const localRooms = registry.readLocalRooms();
      const localById = new Map(localRooms.map((room) => [room.id, room]));
      for (const room of registry.remoteRooms || []) {
        const previous = localById.get(room.id);
        if (!previous || registry.roomUpdatedAt(room) >= registry.roomUpdatedAt(previous)) localById.set(room.id, room);
      }
      const selectedId = registry.selectedRoomId();
      const detailId = selectedId && summaryRooms.some((room) => room.id === selectedId) ? selectedId : summaryRooms[0]?.id || "";
      const previousDetail = detailId ? localById.get(detailId) || null : null;
      const detailRoom = detailId && !registry.deletedRemoteRoomIds.has(detailId) ? await registry.fetchRemoteRoomDetail(detailId, previousDetail) : null;
      if (detailRoom) registry.lastRemoteDetailRefreshAt = now;
      const detailById = new Map(detailRoom ? [[detailRoom.id, detailRoom]] : []);
      const serverRooms = summaryRooms
        .map((room) => detailById.get(room.id) || registry.mergeRoomSummary(localById.get(room.id), room, room.id === detailId))
        .filter(Boolean);
      if (detailRoom && !serverRooms.some((room) => room.id === detailRoom.id)) serverRooms.push(detailRoom);
      const serverIds = new Set(serverRooms.map((room) => room.id));
      for (const id of Array.from(registry.deletedRemoteRoomIds)) {
        if (!serverIds.has(id)) registry.deletedRemoteRoomIds.delete(id);
      }
      const roomsById = new Map();
      for (const room of serverRooms) {
        if (registry.deletedRemoteRoomIds.has(room.id)) continue;
        const localRoom = localById.get(room.id);
        const pendingNewer = registry.pendingRemoteRoomIds.has(room.id) &&
          registry.roomUpdatedAt(localRoom) > registry.roomUpdatedAt(room);
        roomsById.set(room.id, pendingNewer ? localRoom : room);
      }
      for (const localRoom of localRooms) {
        if (!registry.pendingRemoteRoomIds.has(localRoom.id) || registry.deletedRemoteRoomIds.has(localRoom.id)) continue;
        const previous = roomsById.get(localRoom.id);
        if (!previous || registry.roomUpdatedAt(localRoom) > registry.roomUpdatedAt(previous)) roomsById.set(localRoom.id, localRoom);
      }
      const rooms = Array.from(roomsById.values()).sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
      const signature = registry.remoteRoomSignature(rooms);
      const changed = signature !== registry.remoteSignature || !registry.remoteOnline;
      registry.remoteRooms = rooms;
      registry.remoteSignature = signature;
      registry.remoteOnline = true;
      if (shouldPersistRemoteRefresh(registry, rooms, changed)) registry.writeLocalRooms(rooms);
      if (changed) registry.emit();
    } catch (_error) {
      const changed = registry.remoteOnline;
      registry.remoteOnline = false;
      if (changed) registry.emit();
    } finally {
      registry.remoteRefreshInFlight = false;
    }
  }

  IronLine.RoomRefreshCadence = {
    activeOnlineMatchRoomId,
    refreshActiveRoomDetail,
    refreshRemoteRooms,
    remoteRefreshPlan,
    shouldPersistRemoteRefresh
  };
})(window);
