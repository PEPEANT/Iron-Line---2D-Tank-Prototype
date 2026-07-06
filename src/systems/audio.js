"use strict";

(function registerIronLineAudio(global) {
  const IronLine = global.IronLine || (global.IronLine = {});
  const AudioContextCtor = global.AudioContext || global.webkitAudioContext;
  const EXTENSIONS = ["ogg", "mp3"];
  const MAX_VOICES = 8;
  const buffers = new Map();
  const activeVoices = new Set();
  let context = null;
  let unlocked = false;
  let musicSource = null;
  let musicGain = null;
  let musicId = "";
  let pendingMusic = null;

  function ensureContext() {
    if (!AudioContextCtor) return null;
    if (!context) context = new AudioContextCtor();
    return context;
  }

  function unlock() {
    const ctx = ensureContext();
    if (!ctx) return false;
    unlocked = true;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    if (pendingMusic) {
      const queued = pendingMusic;
      startMusic(queued.id, queued.options).catch(() => {});
    }
    return true;
  }

  for (const type of ["pointerdown", "touchstart", "mousedown", "keydown"]) {
    global.addEventListener?.(type, unlock, { capture: true, once: true, passive: true });
  }

  async function loadBuffer(id) {
    if (!AudioContextCtor || !global.fetch) return null;
    if (buffers.has(id)) return buffers.get(id);

    const promise = (async () => {
      const ctx = ensureContext();
      if (!ctx) return null;
      for (const ext of EXTENSIONS) {
        try {
          const response = await fetch(`assets/audio/${id}.${ext}`, { cache: "force-cache" });
          if (!response.ok) continue;
          const bytes = await response.arrayBuffer();
          return await ctx.decodeAudioData(bytes);
        } catch (_error) {
          continue;
        }
      }
      return null;
    })();
    buffers.set(id, promise);
    return promise;
  }

  function cameraVolume(game, x, y, volume) {
    if (!game?.camera || !Number.isFinite(x) || !Number.isFinite(y)) return volume;
    const camera = game.camera;
    const viewWidth = camera.viewWidth || camera.width || global.innerWidth || 1280;
    const viewHeight = camera.viewHeight || camera.height || global.innerHeight || 720;
    const centerX = (camera.x || 0) + viewWidth / 2;
    const centerY = (camera.y || 0) + viewHeight / 2;
    const distance = Math.hypot(x - centerX, y - centerY);
    const audible = Math.max(viewWidth, viewHeight) * 0.88 + 280;
    const falloff = 1 - Math.max(0, Math.min(1, (distance - 120) / Math.max(1, audible)));
    return volume * Math.pow(falloff, 1.35);
  }

  function cameraPan(game, x) {
    const camera = game?.camera;
    if (!camera || !Number.isFinite(x)) return 0;
    const viewWidth = camera.viewWidth || camera.width || global.innerWidth || 1280;
    const centerX = (camera.x || 0) + viewWidth / 2;
    return Math.max(-0.72, Math.min(0.72, (x - centerX) / Math.max(1, viewWidth / 2) * 0.72));
  }

  async function play(id, options = {}) {
    if (!id || activeVoices.size >= MAX_VOICES) return false;
    const ctx = ensureContext();
    if (!ctx || (!unlocked && ctx.state === "suspended")) return false;
    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => {});
      if (ctx.state === "suspended") return false;
    }
    const buffer = await loadBuffer(id);
    if (!buffer) return false;

    const volume = Math.max(0, Math.min(1.5, cameraVolume(options.game, options.x, options.y, options.volume ?? 1)));
    if (volume <= 0.02) return false;

    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.buffer = buffer;

    let output = gain;
    if (ctx.createStereoPanner && Number.isFinite(options.x)) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = cameraPan(options.game, options.x);
      gain.connect(pan);
      pan.connect(ctx.destination);
      output = pan;
    } else {
      gain.connect(ctx.destination);
    }

    try {
      source.connect(gain);
      activeVoices.add(source);
      source.onended = () => activeVoices.delete(source);
      source.start(0);
      const maxDuration = Math.max(0, Number(options.maxDuration) || 0);
      if (maxDuration > 0 && maxDuration < buffer.duration) {
        source.stop(ctx.currentTime + maxDuration);
      }
      return Boolean(output);
    } catch (_error) {
      activeVoices.delete(source);
      return false;
    }
  }

  async function startMusic(id, options = {}) {
    if (!id) return false;
    pendingMusic = { id, options };
    const ctx = ensureContext();
    if (!ctx || (!unlocked && ctx.state === "suspended")) return false;
    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => {});
      if (ctx.state === "suspended") return false;
    }
    if (musicSource && musicId === id) {
      pendingMusic = null;
      if (musicGain) musicGain.gain.value = Math.max(0, Math.min(1, options.volume ?? 0.32));
      return true;
    }
    const buffer = await loadBuffer(id);
    if (!buffer) return false;
    stopMusic();
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const volume = Math.max(0, Math.min(1, options.volume ?? 0.32));
    source.buffer = buffer;
    source.loop = options.loop !== false;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(ctx.destination);
    musicSource = source;
    musicGain = gain;
    musicId = id;
    pendingMusic = null;
    source.onended = () => {
      if (musicSource === source) {
        musicSource = null;
        musicGain = null;
        musicId = "";
      }
    };
    try {
      source.start(0);
      return true;
    } catch (_error) {
      musicSource = null;
      musicGain = null;
      musicId = "";
      return false;
    }
  }

  function stopMusic(options = {}) {
    const source = musicSource;
    const gain = musicGain;
    pendingMusic = null;
    musicSource = null;
    musicGain = null;
    musicId = "";
    if (!source) return false;
    try {
      const ctx = context;
      const fadeSeconds = Math.max(0, Number(options.fadeSeconds) || 0);
      if (ctx && gain && fadeSeconds > 0) {
        const endAt = ctx.currentTime + fadeSeconds;
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, endAt);
        source.stop(endAt);
      } else {
        source.stop();
      }
      return true;
    } catch (_error) {
      return false;
    }
  }

  function startMenuMusic(options = {}) {
    return startMusic("music/soubok-bgm", {
      loop: true,
      volume: options.volume ?? 0.28
    });
  }

  function stopMenuMusic(options = {}) {
    if (musicId !== "music/soubok-bgm" && pendingMusic?.id !== "music/soubok-bgm") return false;
    return stopMusic(options);
  }

  function sourcePoint(source = {}) {
    return {
      x: Number.isFinite(source.x) ? source.x : null,
      y: Number.isFinite(source.y) ? source.y : null
    };
  }

  function weaponSoundId(weapon = {}) {
    const id = String(weapon.soundId || weapon.id || weapon.sourceWeaponId || "");
    if (id === "pistol") return "pistol-fire";
    if (id === "sniper") return "sniper-fire";
    if (id === "rpg") return "rpg-fire";
    if (id.includes("machinegun") || id.includes("mg") || id.includes("lmg")) return "mg-fire";
    return "rifle-fire";
  }

  function playWeaponFire(game, shooter, weapon = {}, options = {}) {
    const point = sourcePoint(shooter || options);
    const weaponId = String(weapon.id || weapon.sourceWeaponId || "");
    const burstDuration = weaponId === "machinegun" || weaponId === "lmg" ? 0.32 : 0;
    return play(weaponSoundId(weapon), {
      game,
      x: point.x,
      y: point.y,
      volume: options.volume ?? (weapon.id === "pistol" ? 0.34 : 0.48),
      maxDuration: options.maxDuration ?? burstDuration
    });
  }

  function playExplosion(game, source = {}, kind = "he", options = {}) {
    const point = sourcePoint(source);
    const id = kind === "drone" || kind === "kamikazeDrone" || kind === "suicide-drone"
      ? "explosion-drone"
      : "explosion-he";
    return play(id, {
      game,
      x: point.x,
      y: point.y,
      volume: options.volume ?? (id === "explosion-drone" ? 0.72 : 0.92)
    });
  }

  function playMetalHit(game, source = {}, options = {}) {
    const point = sourcePoint(source);
    return play("hit-metal", {
      game,
      x: point.x,
      y: point.y,
      volume: options.volume ?? 0.5
    });
  }

  IronLine.audio = {
    unlock,
    play,
    startMusic,
    stopMusic,
    startMenuMusic,
    stopMenuMusic,
    playWeaponFire,
    playExplosion,
    playMetalHit
  };
})(window);
