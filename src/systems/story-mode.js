"use strict";

(function registerStoryMode(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  const STORAGE_KEY = "iron-line-story-progress-v1";

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  class StoryMode {
    constructor() {
      this.root = null;
      this.detail = null;
      this.selectedChapterId = "";
      this.finishHooked = false;
      this.keyBound = false;
    }

    chapters() {
      return IronLine.storyChapters || [];
    }

    readProgress() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { cleared: {} };
        const parsed = JSON.parse(raw);
        return { cleared: parsed?.cleared && typeof parsed.cleared === "object" ? parsed.cleared : {} };
      } catch (_error) {
        return { cleared: {} };
      }
    }

    writeProgress(progress) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
      } catch (_error) {}
    }

    isCleared(chapterId) {
      return Boolean(this.readProgress().cleared[chapterId]);
    }

    markCleared(chapterId) {
      if (!IronLine.storyChapterById?.(chapterId)) return false;
      const progress = this.readProgress();
      if (!progress.cleared[chapterId]) {
        progress.cleared[chapterId] = { clearedAt: Date.now() };
        this.writeProgress(progress);
      }
      return true;
    }

    clearedCount() {
      const cleared = this.readProgress().cleared;
      return this.chapters().filter((chapter) => cleared[chapter.id]).length;
    }

    isUnlocked(index) {
      if (index <= 0) return true;
      const previous = this.chapters()[index - 1];
      return previous ? this.isCleared(previous.id) : false;
    }

    resetProgress() {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (_error) {}
      this.render();
    }

    ensure() {
      if (this.root || typeof document === "undefined") return;
      this.root = document.createElement("div");
      this.root.className = "story-screen hidden";
      this.root.setAttribute("aria-label", "스토리 모드");
      document.body.append(this.root);
      this.detail = document.createElement("div");
      this.detail.className = "story-detail hidden";
      document.body.append(this.detail);

      this.root.addEventListener("click", (event) => this.onClick(event));
      this.detail.addEventListener("click", (event) => this.onClick(event));
      if (!this.keyBound) {
        this.keyBound = true;
        window.addEventListener("keydown", (event) => {
          if (event.code !== "Escape" || !this.isOpen()) return;
          event.stopPropagation();
          if (!this.detail.classList.contains("hidden")) this.closeDetail();
          else this.close();
        }, true);
      }
    }

    isOpen() {
      return Boolean(this.root && !this.root.classList.contains("hidden"));
    }

    open() {
      this.ensure();
      this.render();
      this.root.classList.remove("hidden");
      document.body.classList.add("story-open");
      return true;
    }

    close() {
      this.closeDetail();
      this.root?.classList.add("hidden");
      document.body.classList.remove("story-open");
      IronLine.game?.canvas?.focus?.();
    }

    onClick(event) {
      const action = event.target.closest("[data-story-action]")?.getAttribute("data-story-action");
      if (action === "close") {
        this.close();
        return;
      }
      if (action === "close-detail") {
        this.closeDetail();
        return;
      }
      if (action === "reset-progress") {
        if (window.confirm("스토리 진행도를 초기화할까요?")) this.resetProgress();
        return;
      }
      if (action === "start-chapter") {
        const chapter = IronLine.storyChapterById?.(this.selectedChapterId);
        if (chapter) this.startChapter(chapter);
        return;
      }
      const card = event.target.closest("[data-story-chapter]");
      if (card && !card.disabled) {
        this.openDetail(card.getAttribute("data-story-chapter"));
      }
    }

    render() {
      if (!this.root) return;
      const chapters = this.chapters();
      const clearedCount = this.clearedCount();
      const cards = chapters.map((chapter, index) => {
        const unlocked = this.isUnlocked(index);
        const cleared = this.isCleared(chapter.id);
        const state = cleared ? "cleared" : unlocked ? "open" : "locked";
        const stateLabel = cleared ? "클리어" : unlocked ? "작전 가능" : "잠김";
        return `
          <button type="button" class="story-card is-${state}" data-story-chapter="${escapeHtml(chapter.id)}"${unlocked ? "" : " disabled"}>
            <span class="story-card-art">
              <img src="${escapeHtml(chapter.art)}" alt="" loading="lazy" onerror="this.classList.add('missing')">
              <i class="story-card-act">ACT ${escapeHtml(chapter.act)}</i>
            </span>
            <span class="story-card-body">
              <em>${String(index + 1).padStart(2, "0")}</em>
              <strong>${escapeHtml(chapter.title)}</strong>
              <small>${escapeHtml(chapter.deck)}</small>
            </span>
            <b class="story-card-state">${stateLabel}</b>
          </button>
        `;
      }).join("");
      this.root.innerHTML = `
        <header class="story-head">
          <button type="button" class="story-back" data-story-action="close">← 메인</button>
          <div class="story-title">
            <span>CAMPAIGN</span>
            <h1>수복 작전</h1>
          </div>
          <div class="story-head-side">
            <b class="story-progress-count">클리어 ${clearedCount}/${chapters.length}</b>
            <button type="button" class="story-reset" data-story-action="reset-progress">진행 초기화</button>
          </div>
        </header>
        <div class="story-grid">${cards}</div>
      `;
    }

    openDetail(chapterId) {
      const chapter = IronLine.storyChapterById?.(chapterId);
      if (!chapter || !this.detail) return;
      this.selectedChapterId = chapter.id;
      const cleared = this.isCleared(chapter.id);
      this.detail.innerHTML = `
        <div class="story-detail-card" role="dialog" aria-modal="true">
          <header>
            <div>
              <span>ACT ${escapeHtml(chapter.act)} · ${cleared ? "클리어됨" : "작전 브리핑"}</span>
              <strong>${escapeHtml(chapter.title)}</strong>
            </div>
            <button type="button" data-story-action="close-detail" aria-label="닫기">닫기</button>
          </header>
          <p class="story-briefing">${escapeHtml(chapter.briefing)}</p>
          <div class="story-detail-meta">
            <span>${chapter.config?.mode === "conquest" ? "점령전" : "섬멸전"}</span>
            <span>난이도 ${escapeHtml(this.difficultyLabel(chapter.config?.difficulty))}</span>
          </div>
          <div class="story-detail-actions">
            <button type="button" class="story-start" data-story-action="start-chapter">${cleared ? "다시 출격" : "작전 시작"}</button>
            <button type="button" data-story-action="close-detail">뒤로</button>
          </div>
        </div>
      `;
      this.detail.classList.remove("hidden");
    }

    closeDetail() {
      this.detail?.classList.add("hidden");
      if (this.detail) this.detail.innerHTML = "";
      this.selectedChapterId = "";
    }

    difficultyLabel(difficulty) {
      if (difficulty === "easy") return "쉬움";
      if (difficulty === "hard") return "어려움";
      return "보통";
    }

    startChapter(chapter) {
      const game = IronLine.game;
      const hud = game?.hud;
      if (!game || !chapter) return false;

      const blueFactionId = chapter.config?.blueFactionId || "korea";
      const profile = {
        ...(game.localProfile || {}),
        nickname: game.localProfile?.nickname || "Player",
        factionId: blueFactionId,
        skinId: blueFactionId
      };
      game.setLocalProfile?.(profile);
      game.matchConfig = {
        ...(game.defaultMatchConfig?.() || {}),
        ...(chapter.config || {})
      };
      game.scenarioDirty = true;
      game.storyChapterId = chapter.id;
      this.installFinishHook(game);

      this.close();
      const entered = hud?.sessionFlow?.submitEntry?.("offline", profile) ||
        game.completeEntryProfile?.(profile);
      return Boolean(entered);
    }

    installFinishHook(game) {
      if (this.finishHooked || typeof game?.finishGame !== "function") return;
      this.finishHooked = true;
      const baseFinishGame = game.finishGame.bind(game);
      const storyMode = this;
      game.finishGame = function finishGameWithStoryProgress(result, reason) {
        baseFinishGame(result, reason);
        storyMode.onMatchFinished(game, result);
      };
    }

    onMatchFinished(game, result) {
      const chapterId = game.storyChapterId;
      if (!chapterId) return;
      if (result === "BLUE VICTORY") {
        this.markCleared(chapterId);
      }
      game.storyChapterId = "";
    }
  }

  IronLine.StoryMode = StoryMode;
  IronLine.storyMode = new StoryMode();
})(window);
