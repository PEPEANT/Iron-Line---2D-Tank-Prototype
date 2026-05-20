"use strict";

(function registerEntryFlow(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  class EntryFlow {
    constructor(hud) {
      this.hud = hud;
      this.selectedMode = "offline";
      this.selectedFactionId = "";
      this.factionSignature = "";
      this.bound = false;
    }

    get nodes() {
      return this.hud.nodes;
    }

    ensure() {
      const ui = this.nodes;
      if (!ui || ui.entryScreen) {
        this.bind();
        return;
      }

      const screen = document.createElement("div");
      screen.id = "entryScreen";
      screen.className = "entry-screen hidden";
      screen.setAttribute("aria-label", "전장 입장");

      const card = document.createElement("div");
      card.className = "entry-card";

      const brief = document.createElement("section");
      brief.className = "entry-brief";
      brief.innerHTML = `
        <span class="entry-mark">IRON LINE</span>
        <h1>전장 입장</h1>
        <p id="entryIntro">닉네임과 세력 스킨을 정하고 플레이 모드를 선택합니다.</p>
      `;

      const panel = document.createElement("section");
      panel.className = "entry-panel";

      const nameField = document.createElement("label");
      nameField.className = "entry-field";
      const nameLabel = document.createElement("span");
      nameLabel.textContent = "닉네임";
      const nickname = document.createElement("input");
      nickname.id = "entryNickname";
      nickname.type = "text";
      nickname.maxLength = 16;
      nickname.autocomplete = "nickname";
      nickname.placeholder = "닉네임";
      nameField.append(nameLabel, nickname);

      const skinWrap = document.createElement("div");
      skinWrap.className = "entry-skin-wrap";
      const skinLabel = document.createElement("span");
      skinLabel.className = "entry-label";
      skinLabel.textContent = "세력 스킨";
      const skinList = document.createElement("div");
      skinList.id = "entrySkinList";
      skinList.className = "entry-skin-list";
      const skinDetail = document.createElement("article");
      skinDetail.id = "entrySkinDetail";
      skinDetail.className = "entry-skin-detail";
      skinWrap.append(skinLabel, skinList, skinDetail);

      const modeWrap = document.createElement("div");
      modeWrap.className = "entry-mode-wrap";
      const modeLabel = document.createElement("span");
      modeLabel.className = "entry-label";
      modeLabel.textContent = "모드";
      const modeList = document.createElement("div");
      modeList.id = "entryModeList";
      modeList.className = "entry-mode-list";
      modeWrap.append(modeLabel, modeList);

      const status = document.createElement("p");
      status.id = "entryStatus";
      status.className = "entry-status";

      const enter = document.createElement("button");
      enter.id = "entryEnterButton";
      enter.type = "button";
      enter.className = "entry-enter";

      panel.append(nameField, skinWrap, modeWrap, status, enter);
      card.append(brief, panel);
      screen.append(card);
      document.body.prepend(screen);

      ui.entryScreen = screen;
      ui.entryIntro = brief.querySelector("#entryIntro");
      ui.entryNickname = nickname;
      ui.entrySkinList = skinList;
      ui.entrySkinDetail = skinDetail;
      ui.entryModeList = modeList;
      ui.entryEnterButton = enter;
      ui.entryStatus = status;
      this.bind();
    }

    bind() {
      const ui = this.nodes;
      if (this.bound || !ui?.entryEnterButton || !ui.entryNickname) return;
      this.bound = true;
      ui.entryEnterButton.addEventListener("click", () => this.submit());
      ui.entryNickname.addEventListener("keydown", (event) => {
        if (event.key === "Enter") this.submit();
      });
    }

    submit() {
      const game = IronLine.game;
      if (!game) return;
      const fallbackFaction = IronLine.playerFactions?.[0]?.id || IronLine.playerSkins?.[0]?.id || "korea";
      const factionId = this.selectedMode === "online"
        ? (game.localProfile?.factionId || game.localProfile?.skinId || fallbackFaction)
        : (this.selectedFactionId || game.localProfile?.factionId || game.localProfile?.skinId || fallbackFaction);
      const profile = {
        nickname: this.nodes.entryNickname?.value || game.localProfile?.nickname || "",
        factionId,
        skinId: factionId
      };
      if (this.hud.sessionFlow?.submitEntry?.(this.selectedMode, profile)) return;
      game.completeEntryProfile(profile);
    }

    update(game) {
      this.ensure();
      const ui = this.nodes;
      if (!ui?.entryScreen) return;

      const visible = Boolean(game.entryOpen);
      ui.entryScreen.classList.toggle("hidden", !visible);
      document.body.classList.toggle("entry-open", visible);
      if (!visible) return;

      const profile = game.localProfile || {};
      const fallbackFaction = IronLine.playerFactions?.[0]?.id || IronLine.playerSkins?.[0]?.id || "korea";
      if (!this.selectedFactionId) this.selectedFactionId = profile.factionId || profile.skinId || fallbackFaction;
      if (ui.entryNickname && !ui.entryNickname.dataset.entrySeeded) {
        ui.entryNickname.value = profile.nickname || "";
        ui.entryNickname.dataset.entrySeeded = "1";
      }
      ui.entrySkinList?.parentElement?.classList.toggle("hidden", this.selectedMode === "online");
      if (ui.entryIntro) {
        ui.entryIntro.textContent = this.selectedMode === "online"
          ? "닉네임을 정하고 온라인 대기방으로 이동합니다."
          : "닉네임과 세력 스킨을 정하고 플레이 모드를 선택합니다.";
      }
      if (ui.entryStatus) {
        ui.entryStatus.textContent = this.selectedMode === "online"
          ? "온라인은 관리자가 정한 방 세력으로 참가합니다. 여기서는 닉네임만 정합니다."
          : "선택한 세력은 병사 외형, 전장 대사, 아이콘에만 반영됩니다. 전투 성능에는 영향을 주지 않습니다.";
      }
      if (ui.entryEnterButton) {
        ui.entryEnterButton.textContent = this.selectedMode === "online" ? "온라인으로 이동" : "오프라인 전투";
      }
      this.renderModeCards();
      this.renderSkinCards(game);
      this.renderSkinDetail(game);
    }

    renderModeCards() {
      const list = this.nodes.entryModeList;
      if (!list) return;
      if (list.dataset.ready !== "1") {
        const modes = [
          { id: "offline", title: "오프라인 전투", desc: "설정 후 바로 시작" },
          { id: "online", title: "온라인", desc: "방 목록과 대기방" }
        ];
        list.textContent = "";
        for (const mode of modes) {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.entryMode = mode.id;
          button.innerHTML = `<strong>${mode.title}</strong><span>${mode.desc}</span>`;
          button.addEventListener("click", () => {
            this.selectedMode = mode.id;
            this.factionSignature = "";
            this.update(IronLine.game);
          });
          list.append(button);
        }
        list.dataset.ready = "1";
      }
      list.querySelectorAll("[data-entry-mode]").forEach((button) => {
        button.classList.toggle("active", button.dataset.entryMode === this.selectedMode);
      });
    }

    renderSkinCards(game) {
      const list = this.nodes.entrySkinList;
      const skins = IronLine.playerFactions || IronLine.playerSkins || [];
      if (!list || skins.length === 0) return;

      const selected = this.selectedFactionId || game.localProfile?.factionId || game.localProfile?.skinId || skins[0].id;
      const signature = `${selected}:${skins.map((skin) => skin.id).join("|")}`;
      if (this.factionSignature === signature) return;
      this.factionSignature = signature;
      list.textContent = "";

      for (const skin of skins) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `entry-skin-card${skin.id === selected ? " active" : ""}`;
        button.dataset.entrySkin = skin.id;
        button.setAttribute("aria-pressed", skin.id === selected ? "true" : "false");

        const preview = document.createElement("span");
        preview.className = "entry-skin-preview";
        preview.style.setProperty("--skin-cloth", skin.cloth);
        preview.style.setProperty("--skin-vest", skin.vest);
        preview.style.setProperty("--skin-accent", skin.accent);
        if (skin.logo) {
          const logo = document.createElement("img");
          logo.src = skin.logo;
          logo.alt = "";
          logo.loading = "lazy";
          preview.append(logo);
        }

        const text = document.createElement("span");
        text.className = "entry-skin-text";
        const name = document.createElement("strong");
        name.textContent = skin.name;
        const role = document.createElement("small");
        role.textContent = skin.role || skin.concept || "";
        text.append(name, role);
        button.append(preview, text);

        button.addEventListener("click", () => {
          this.selectedFactionId = skin.id;
          this.factionSignature = "";
          this.update(IronLine.game);
        });
        list.append(button);
      }
    }

    renderSkinDetail(game) {
      const detail = this.nodes.entrySkinDetail;
      const skins = IronLine.playerFactions || IronLine.playerSkins || [];
      if (!detail || skins.length === 0) return;

      const selectedId = this.selectedFactionId || game.localProfile?.factionId || game.localProfile?.skinId || skins[0].id;
      const skin = IronLine.playerFactionById?.(selectedId) || IronLine.playerSkinById?.(selectedId) || skins[0];
      if (!skin) return;

      detail.innerHTML = `
        <div class="entry-skin-detail-head">
          <span>${skin.category || "세력 스킨"}</span>
          <strong>${skin.name}</strong>
        </div>
        <p class="entry-skin-tagline">“${skin.tagline || skin.motto || "전장을 선택한 색으로 칠한다."}”</p>
        <p>${skin.description || skin.concept || ""}</p>
        <div class="entry-skin-meta">
          <span>${skin.rankNote || "참고 순위 없음"}</span>
          <span>2026년 5월 기준 참고 순위 · 게임 밸런스와 무관</span>
        </div>
      `;
    }
  }

  IronLine.EntryFlow = EntryFlow;
})(window);
