"use strict";

(function registerEditorPalette(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const paletteState = {
    category: null,
    selectedType: null,
    root: null,
    tabs: null,
    list: null,
    importInput: null
  };

  function init() {
    const catalog = IronLine.objectCatalog;
    if (!catalog || !document.body) return;
    IronLine.editorObjectTools?.ensureEditorCatalogBridge?.();
    createPaletteShell();
    renderTabs();
    renderItems();
  }

  function createPaletteShell() {
    paletteState.root = document.createElement("aside");
    paletteState.root.className = "object-palette";
    paletteState.root.setAttribute("aria-label", "사물 팔레트");
    paletteState.root.innerHTML = `
      <div class="object-palette__top">
        <div class="object-palette__tabs" role="tablist" aria-label="사물 카테고리"></div>
        <div class="object-palette__actions">
          <button type="button" data-palette-action="export-json">JSON 저장</button>
          <button type="button" data-palette-action="import-json">JSON 불러오기</button>
        </div>
      </div>
      <div class="object-palette__items" aria-label="사물 목록"></div>
    `;
    paletteState.tabs = paletteState.root.querySelector(".object-palette__tabs");
    paletteState.list = paletteState.root.querySelector(".object-palette__items");
    paletteState.importInput = document.createElement("input");
    paletteState.importInput.type = "file";
    paletteState.importInput.accept = "application/json,.json";
    paletteState.importInput.className = "object-palette__file";

    paletteState.root.querySelector('[data-palette-action="export-json"]').addEventListener("click", exportJson);
    paletteState.root.querySelector('[data-palette-action="import-json"]').addEventListener("click", () => paletteState.importInput.click());
    paletteState.importInput.addEventListener("change", importJson);

    document.body.append(paletteState.root, paletteState.importInput);
  }

  function entriesByCategory() {
    const entries = IronLine.objectCatalog.all();
    return IronLine.objectCatalog.categories
      .map((category) => ({
        category,
        entries: entries.filter((entry) => entry.category === category)
      }))
      .filter((group) => group.entries.length);
  }

  function renderTabs() {
    const groups = entriesByCategory();
    paletteState.category = paletteState.category || groups[0]?.category || null;
    paletteState.tabs.textContent = "";
    for (const group of groups) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = group.category;
      button.setAttribute("role", "tab");
      button.classList.toggle("active", group.category === paletteState.category);
      button.addEventListener("click", () => {
        paletteState.category = group.category;
        renderTabs();
        renderItems();
      });
      paletteState.tabs.append(button);
    }
  }

  function renderItems() {
    const entries = IronLine.objectCatalog.all().filter((entry) => entry.category === paletteState.category);
    paletteState.list.textContent = "";
    for (const entry of entries) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "object-card";
      card.dataset.type = entry.id;
      card.classList.toggle("active", entry.id === paletteState.selectedType);
      card.innerHTML = `
        <span class="object-card__swatch" data-kind="${entry.id}"></span>
        <span class="object-card__name"></span>
        <span class="object-card__meta"></span>
      `;
      card.querySelector(".object-card__name").textContent = entry.name || entry.id;
      card.querySelector(".object-card__meta").textContent = `${entry.footprint?.w || 0}x${entry.footprint?.h || 0}`;
      card.addEventListener("click", () => placeObject(entry.id));
      paletteState.list.append(card);
    }
  }

  function placeObject(type) {
    const kindSelect = document.getElementById("obstacleKindSelect");
    const modeButton = document.querySelector('[data-mode="obstacle"]');
    const newButton = document.getElementById("newObstacleButton");
    if (!kindSelect || !newButton) return;

    if (![...kindSelect.options].some((option) => option.value === type)) {
      const entry = IronLine.objectCatalog.get(type);
      const option = document.createElement("option");
      option.value = type;
      option.textContent = `${entry.category || "사물"} · ${entry.name || type}`;
      kindSelect.append(option);
    }

    paletteState.selectedType = type;
    modeButton?.click();
    kindSelect.value = type;
    kindSelect.dispatchEvent(new Event("change", { bubbles: true }));
    newButton.click();
    renderItems();
  }

  function exportJson() {
    try {
      const text = document.getElementById("exportOutput")?.value || "";
      const schema = IronLine.editorObjectTools.schemaFromEditorScript(text);
      const validation = IronLine.MapSchema.validateSchema(schema, IronLine.objectCatalog);
      if (!validation.ok) throw new Error(validation.errors.join("\n"));
      downloadJson(schema);
      setStatus("맵 JSON을 저장했습니다.");
    } catch (error) {
      setStatus(`JSON 저장 실패: ${error.message || error}`);
    }
  }

  async function importJson(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const schema = JSON.parse(await file.text());
      const validation = IronLine.MapSchema.validateSchema(schema, IronLine.objectCatalog);
      if (!validation.ok) throw new Error(validation.errors.join("\n"));
      const draft = IronLine.editorObjectTools.editorDraftFromSchema(schema);
      localStorage.setItem(IronLine.editorObjectTools.DRAFT_STORAGE_KEY, JSON.stringify(draft));
      setStatus("맵 JSON을 불러왔습니다.");
      window.location.reload();
    } catch (error) {
      setStatus(`JSON 불러오기 실패: ${error.message || error}`);
    }
  }

  function downloadJson(schema) {
    const blob = new Blob([`${JSON.stringify(schema, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${schema.id || "iron-line-map"}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function setStatus(message) {
    const status = document.getElementById("statusText");
    if (status) status.textContent = message;
  }

  window.addEventListener("load", init);
})(typeof window !== "undefined" ? window : globalThis);
