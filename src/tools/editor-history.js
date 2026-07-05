"use strict";

(function registerEditorHistory(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const HISTORY_STORAGE_KEY = "iron-line-map-editor-history-v1";
  const HISTORY_LIMIT = 64;

  function createHistory(initial = "", limit = HISTORY_LIMIT) {
    return {
      undo: [],
      redo: [],
      current: String(initial || ""),
      limit
    };
  }

  function recordSnapshot(history, snapshot) {
    const next = String(snapshot || "");
    if (!next || next === history.current) return false;
    if (history.current) history.undo.push(history.current);
    while (history.undo.length > history.limit) history.undo.shift();
    history.current = next;
    history.redo = [];
    return true;
  }

  function undoSnapshot(history, current = history.current) {
    if (!history.undo.length) return null;
    const active = String(current || history.current || "");
    if (active && active !== history.current) history.redo.push(active);
    else if (history.current) history.redo.push(history.current);
    history.current = history.undo.pop();
    return history.current;
  }

  function redoSnapshot(history, current = history.current) {
    if (!history.redo.length) return null;
    const active = String(current || history.current || "");
    if (active && active !== history.current) history.undo.push(active);
    else if (history.current) history.undo.push(history.current);
    while (history.undo.length > history.limit) history.undo.shift();
    history.current = history.redo.pop();
    return history.current;
  }

  function loadHistory(fallback = "") {
    try {
      const saved = JSON.parse(global.localStorage?.getItem(HISTORY_STORAGE_KEY) || "null");
      if (!saved || !Array.isArray(saved.undo) || !Array.isArray(saved.redo)) return createHistory(fallback);
      return {
        undo: saved.undo.slice(-HISTORY_LIMIT).map(String),
        redo: saved.redo.slice(-HISTORY_LIMIT).map(String),
        current: String(saved.current || fallback || ""),
        limit: HISTORY_LIMIT
      };
    } catch (error) {
      return createHistory(fallback);
    }
  }

  function saveHistory(history) {
    try {
      global.localStorage?.setItem(HISTORY_STORAGE_KEY, JSON.stringify({
        undo: history.undo,
        redo: history.redo,
        current: history.current
      }));
    } catch (error) {
      // History is a convenience layer; failed persistence should not break editing.
    }
  }

  function currentEditorSnapshot() {
    return String(global.document?.getElementById("exportOutput")?.value || "");
  }

  function applySnapshot(snapshot) {
    const tools = IronLine.editorObjectTools;
    if (!tools?.editorDraftFromEditorScript) throw new Error("editor draft tools are not available");
    const draft = tools.editorDraftFromEditorScript(snapshot);
    global.localStorage?.setItem(tools.DRAFT_STORAGE_KEY, JSON.stringify(draft));
    global.location?.reload?.();
  }

  function setStatus(message) {
    const status = global.document?.getElementById("statusText");
    if (status) status.textContent = message;
  }

  function installButtons(history) {
    const actions = global.document?.querySelector(".object-palette__actions");
    if (!actions || actions.querySelector("[data-history-action]")) return;
    const undoButton = global.document.createElement("button");
    undoButton.type = "button";
    undoButton.dataset.historyAction = "undo";
    undoButton.textContent = "실행취소";
    undoButton.title = "실행취소";
    const redoButton = global.document.createElement("button");
    redoButton.type = "button";
    redoButton.dataset.historyAction = "redo";
    redoButton.textContent = "다시실행";
    redoButton.title = "다시 실행";
    actions.prepend(redoButton);
    actions.prepend(undoButton);

    undoButton.addEventListener("click", () => applyHistoryMove(history, "undo"));
    redoButton.addEventListener("click", () => applyHistoryMove(history, "redo"));
    updateButtons(history);
  }

  function updateButtons(history) {
    const undoButton = global.document?.querySelector('[data-history-action="undo"]');
    const redoButton = global.document?.querySelector('[data-history-action="redo"]');
    if (undoButton) undoButton.disabled = history.undo.length === 0;
    if (redoButton) redoButton.disabled = history.redo.length === 0;
  }

  function applyHistoryMove(history, direction) {
    try {
      const current = currentEditorSnapshot();
      const target = direction === "redo"
        ? redoSnapshot(history, current)
        : undoSnapshot(history, current);
      if (!target) {
        setStatus(direction === "redo" ? "다시 실행할 편집이 없습니다." : "실행취소할 편집이 없습니다.");
        updateButtons(history);
        return;
      }
      saveHistory(history);
      applySnapshot(target);
    } catch (error) {
      setStatus(`편집 기록 복원 실패: ${error.message || error}`);
    }
  }

  function init() {
    if (!global.document?.getElementById("exportOutput")) return;
    const history = loadHistory(currentEditorSnapshot());
    history.current = history.current || currentEditorSnapshot();
    saveHistory(history);
    installButtons(history);

    global.addEventListener?.("keydown", (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const key = String(event.key || "").toLowerCase();
      if (key !== "z" && key !== "y") return;
      event.preventDefault();
      applyHistoryMove(history, key === "y" || event.shiftKey ? "redo" : "undo");
    });

    global.setInterval?.(() => {
      const snapshot = currentEditorSnapshot();
      if (!snapshot) return;
      if (recordSnapshot(history, snapshot)) {
        saveHistory(history);
        updateButtons(history);
      }
    }, 450);
  }

  IronLine.editorHistoryTools = {
    HISTORY_STORAGE_KEY,
    HISTORY_LIMIT,
    createHistory,
    recordSnapshot,
    undoSnapshot,
    redoSnapshot
  };

  global.addEventListener?.("load", init);
})(typeof window !== "undefined" ? window : globalThis);
