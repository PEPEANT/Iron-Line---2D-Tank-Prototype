"use strict";

(function registerAudioSettings(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const MUSIC_ENABLED_KEY = "iron-line-music-enabled-v1";
  const MUSIC_VOLUME_KEY = "iron-line-music-volume-v1";

  function clampVolume(value, fallback = 0.28) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(0, Math.min(1, number));
  }

  function loadMusicEnabled() {
    try {
      return localStorage.getItem(MUSIC_ENABLED_KEY) !== "0";
    } catch (_error) {
      return true;
    }
  }

  function loadMusicVolume() {
    try {
      const stored = localStorage.getItem(MUSIC_VOLUME_KEY);
      return stored === null ? 0.28 : clampVolume(stored);
    } catch (_error) {
      return 0.28;
    }
  }

  function saveMusicEnabled(value) {
    try {
      localStorage.setItem(MUSIC_ENABLED_KEY, value ? "1" : "0");
    } catch (_error) {}
  }

  function saveMusicVolume(value) {
    try {
      localStorage.setItem(MUSIC_VOLUME_KEY, value.toFixed(2));
    } catch (_error) {}
  }

  function installAudioSettings(Game) {
    if (!Game?.prototype || Game.prototype.setMusicVolume) return;
    const originalDefaultSettings = Game.prototype.defaultSettings;
    Game.prototype.defaultSettings = function defaultSettingsWithAudio() {
      return {
        ...originalDefaultSettings.call(this),
        musicEnabled: loadMusicEnabled(),
        musicVolume: loadMusicVolume()
      };
    };

    Game.prototype.setMusicEnabled = function setMusicEnabled(enabled) {
      const value = Boolean(enabled);
      if (this.settings) this.settings.musicEnabled = value;
      saveMusicEnabled(value);
      this.syncMenuMusic?.();
      return value;
    };

    Game.prototype.setMusicVolume = function setMusicVolume(volume) {
      const value = clampVolume(volume, this.settings?.musicVolume ?? 0.28);
      if (this.settings) this.settings.musicVolume = value;
      saveMusicVolume(value);
      if (this.menuMusicActive && this.settings?.musicEnabled !== false) {
        IronLine.audio?.startMenuMusic?.({ volume: value });
      }
      return value;
    };
  }

  function installHudAudioSettings(Hud) {
    if (!Hud?.prototype || Hud.prototype.updateBgmSettingControls) return;
    const originalCollectNodes = Hud.prototype.collectNodes;
    Hud.prototype.collectNodes = function collectNodesWithAudio() {
      const nodes = originalCollectNodes.call(this);
      nodes.bgmEnabledToggle = document.querySelector("[data-bgm-enabled]");
      nodes.bgmVolumeRange = document.querySelector("[data-bgm-volume]");
      nodes.bgmVolumeValue = document.querySelector("[data-bgm-volume-value]");
      return nodes;
    };

    const originalBindSettingsControls = Hud.prototype.bindSettingsControls;
    Hud.prototype.bindSettingsControls = function bindSettingsControlsWithAudio() {
      originalBindSettingsControls.call(this);
      this.nodes.bgmEnabledToggle?.addEventListener("change", () => {
        const game = IronLine.game;
        if (game) game.setMusicEnabled?.(this.nodes.bgmEnabledToggle.checked);
      });
      this.nodes.bgmVolumeRange?.addEventListener("input", () => {
        const value = Number(this.nodes.bgmVolumeRange.value) / 100;
        const game = IronLine.game;
        if (game) game.setMusicVolume?.(value);
        this.updateBgmVolumeLabel(value);
      });
    };

    Hud.prototype.updateBgmVolumeLabel = function updateBgmVolumeLabel(value = 0.28) {
      if (!this.nodes.bgmVolumeValue) return;
      const percent = Math.round(clampVolume(value, 0) * 100);
      this.nodes.bgmVolumeValue.textContent = `${percent}%`;
    };

    Hud.prototype.updateBgmSettingControls = function updateBgmSettingControls(game) {
      const volume = clampVolume(game?.settings?.musicVolume ?? 0.28);
      if (this.nodes.bgmEnabledToggle) {
        this.nodes.bgmEnabledToggle.checked = game?.settings?.musicEnabled !== false;
      }
      if (this.nodes.bgmVolumeRange && document.activeElement !== this.nodes.bgmVolumeRange) {
        this.nodes.bgmVolumeRange.value = String(Math.round(volume * 100));
      }
      this.updateBgmVolumeLabel(volume);
    };

    const originalUpdateSettings = Hud.prototype.updateSettings;
    Hud.prototype.updateSettings = function updateSettingsWithAudio(game) {
      originalUpdateSettings?.call(this, game);
      this.updateBgmSettingControls(game);
    };
  }

  IronLine.installAudioSettings = installAudioSettings;
  IronLine.installHudAudioSettings = installHudAudioSettings;
})(window);
