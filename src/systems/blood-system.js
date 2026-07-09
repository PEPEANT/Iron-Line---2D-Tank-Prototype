"use strict";

// Blood and gore effect coordinator.
// Keeps the simulation cheap: particles are short-lived, ground marks are capped,
// and liquid effects are represented as decals/pools instead of fluid simulation.
(function registerBloodSystem(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  const FRESH = Object.freeze({ r: 176, g: 32, b: 32 });
  const DRIED = Object.freeze({ r: 110, g: 26, b: 22 });
  const DRY_SECONDS = 20;

  const MAX_PARTICLES = 150;
  const MAX_DECALS = 300;
  const MAX_POOLS = 40;
  const MAX_EVENTS_PER_FRAME = 14;
  const MAX_CORPSE_BLEEDS = 86;
  const GRAVITY = 80;
  const BLEED_MIN_DAMAGE = 8;
  const BLEED_DRIP_DISTANCE = 18;
  const BLEED_IDLE_INTERVAL = 1.45;
  const ENABLED_STORAGE_KEY = "iron-line-blood-enabled-v1";

  let bloodEnabled = true;
  try {
    bloodEnabled = localStorage.getItem(ENABLED_STORAGE_KEY) !== "0";
  } catch (_error) {
    // Storage can be unavailable in some embedded/browser contexts.
  }

  function setBloodEnabled(value) {
    bloodEnabled = Boolean(value);
    try {
      localStorage.setItem(ENABLED_STORAGE_KEY, bloodEnabled ? "1" : "0");
    } catch (_error) {
      // Ignore storage failures; the in-memory setting still works.
    }
    if (!bloodEnabled) {
      const state = IronLine.game?.effects?.blood;
      if (state) {
        state.particles.length = 0;
        state.decals.length = 0;
        state.pools.length = 0;
        if (state.corpseBleeds) state.corpseBleeds.length = 0;
        else state.corpseBleeds = [];
        state.vehicleDragAt = Object.create(null);
        state.footDragAt = Object.create(null);
        state.footLast = Object.create(null);
      }
    }
  }

  function isBloodEnabled() {
    return bloodEnabled;
  }

  function bloodState(game) {
    if (!game?.effects) return null;
    if (!game.effects.blood) {
      game.effects.blood = {
        time: 0,
        frameEvents: 0,
        particles: [],
        decals: [],
        pools: [],
        corpseBleeds: [],
        vehicleDragAt: Object.create(null),
        footDragAt: Object.create(null),
        footLast: Object.create(null)
      };
    }
    const state = game.effects.blood;
    if (!state.particles) state.particles = [];
    if (!state.decals) state.decals = [];
    if (!state.pools) state.pools = [];
    if (!state.corpseBleeds) state.corpseBleeds = [];
    if (!state.vehicleDragAt) state.vehicleDragAt = Object.create(null);
    if (!state.footDragAt) state.footDragAt = Object.create(null);
    if (!state.footLast) state.footLast = Object.create(null);
    return state;
  }

  function poolRadius(pool, time) {
    const grow = Math.max(0.1, pool.grow || 1);
    const t = Math.min(1, Math.max(0, (time - pool.born) / grow));
    const eased = 1 - (1 - t) * (1 - t);
    return pool.start + (pool.max - pool.start) * eased;
  }

  function pushDecal(state, decal) {
    if (state.decals.length >= MAX_DECALS) state.decals.shift();
    state.decals.push(decal);
  }

  function pushPool(state, pool) {
    if (state.pools.length >= MAX_POOLS) state.pools.shift();
    state.pools.push(pool);
  }

  function pushCorpseBleed(state, bleed) {
    if (state.corpseBleeds.length >= MAX_CORPSE_BLEEDS) state.corpseBleeds.shift();
    state.corpseBleeds.push(bleed);
  }

  function spawnParticle(state, x, y, angle, speed) {
    if (state.particles.length >= MAX_PARTICLES) state.particles.shift();
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      z: 4 + Math.random() * 5,
      vz: 4 + Math.random() * 14
    });
  }

  function weaponBloodScale(weaponId) {
    if (weaponId === "sniper") return 1.35;
    if (weaponId === "machinegun" || weaponId === "lmg") return 0.94;
    if (weaponId === "pistol") return 0.72;
    if (weaponId === "vehicle_collision" || weaponId === "tank_crush") return 1.5;
    return 1;
  }

  function spawnCorpsePool(game, unit) {
    if (!bloodEnabled) return;
    const state = bloodState(game);
    if (!state || !unit) return;
    const baseAngle = unit.deathPoseAngle ?? unit.angle ?? 0;
    const drift = baseAngle + Math.PI + (Math.random() - 0.5) * 0.8;
    const strength = Math.min(1, Math.max(0.42, unit.bleed?.strength || 0.72));
    const x = unit.x + Math.cos(drift) * (1.5 + strength * 2.5) + (Math.random() - 0.5) * 3;
    const y = unit.y + Math.sin(drift) * (1.5 + strength * 2.5) + (Math.random() - 0.5) * 3;
    pushPool(state, {
      x,
      y,
      start: 3.3 + strength * 1.8,
      max: 12 + strength * 15 + Math.random() * 8,
      grow: 2.6 + Math.random() * 4.2 + strength * 2.6,
      born: state.time,
      seed: Math.random()
    });
    pushCorpseBleed(state, {
      x: unit.x,
      y: unit.y,
      angle: drift,
      strength,
      until: state.time + 3.2 + strength * 3.5,
      lastDrip: state.time + 0.2 + Math.random() * 0.5,
      lastFlow: state.time + 0.4 + Math.random() * 0.8,
      seed: Math.random()
    });
  }

  function sourceWeaponId(source) {
    return String(
      source?.weaponId ||
      source?.ammo?.sourceWeaponId ||
      source?.ammo?.id ||
      source?.id ||
      ""
    );
  }

  function startBleed(game, unit, amount, source = null) {
    if (!bloodEnabled || !(amount >= BLEED_MIN_DAMAGE)) return;
    const state = bloodState(game);
    if (!state || !unit) return;
    const weaponId = sourceWeaponId(source);
    const sniper = weaponId === "sniper";
    const vehicle = source?.vehicleType || weaponId === "vehicle_collision" || weaponId === "tank_crush";
    const strength = Math.min(
      1,
      Math.max(unit.bleed?.strength || 0, amount / (sniper ? 34 : vehicle ? 30 : 48))
    );
    const duration = (sniper ? 2.2 : vehicle ? 1.8 : 1.15) + strength * (sniper ? 2 : vehicle ? 1.8 : 1.25);
    unit.bleed = {
      until: Math.max(unit.bleed?.until || 0, state.time + duration),
      strength,
      travel: unit.bleed?.travel || 0,
      lastDrip: unit.bleed?.lastDrip || state.time,
      lastFlow: unit.bleed?.lastFlow || state.time,
      lastX: Number.isFinite(unit.bleed?.lastX) ? unit.bleed.lastX : unit.x,
      lastY: Number.isFinite(unit.bleed?.lastY) ? unit.bleed.lastY : unit.y,
      seed: unit.bleed?.seed ?? Math.random()
    };
  }

  function emit(game, event) {
    if (!bloodEnabled) return;
    const state = bloodState(game);
    if (!state || !event) return;
    if (state.frameEvents >= MAX_EVENTS_PER_FRAME) return;
    state.frameEvents += 1;

    const weaponId = String(event.weaponId || "");
    const weaponScale = weaponBloodScale(weaponId);
    const strength = Math.min(1, Math.max(0, (event.strength ?? 0.5) * weaponScale));
    if (event.type === "bullet") {
      const dir = Math.atan2(event.dirY ?? 0, event.dirX ?? 1);
      pushDecal(state, {
        kind: "splatter",
        x: event.x + Math.cos(dir) * (4 + strength * 5),
        y: event.y + Math.sin(dir) * (4 + strength * 5),
        angle: dir,
        size: 4.2 + strength * 6.4,
        born: state.time,
        seed: Math.random()
      });
      if (strength > 0.34) {
        pushDecal(state, {
          kind: "flow",
          x: event.x + Math.cos(dir) * (4 + strength * 4),
          y: event.y + Math.sin(dir) * (4 + strength * 4),
          angle: dir + (Math.random() - 0.5) * 0.45,
          len: 9 + strength * 21,
          size: 1.25 + strength * 1.8,
          born: state.time,
          seed: Math.random()
        });
      }
      if (strength > 0.52) {
        const burstCount = weaponId === "sniper" ? 3 : 2;
        for (let i = 0; i < burstCount; i += 1) {
          const burstAngle = dir + (Math.random() - 0.5) * 0.95;
          const distance = 7 + Math.random() * (8 + strength * 12);
          pushDecal(state, {
            kind: "splatter",
            x: event.x + Math.cos(burstAngle) * distance,
            y: event.y + Math.sin(burstAngle) * distance,
            angle: burstAngle,
            size: 2.5 + strength * 4.2 + Math.random() * 1.8,
            born: state.time,
            seed: Math.random()
          });
        }
      }
      const count = 5 + Math.round(strength * 8) + (weaponId === "sniper" ? 3 : 0);
      for (let i = 0; i < count; i += 1) {
        const spread = (Math.random() - 0.5) * (weaponId === "sniper" ? 1.05 : 0.86);
        const speed = (34 + Math.random() * 78) * (0.65 + strength * 0.82);
        spawnParticle(state, event.x, event.y, dir + spread, speed);
      }
      return;
    }

    if (event.type === "vehicle") {
      const dir = Math.atan2(event.dirY ?? 0, event.dirX ?? 1);
      const speedT = Math.min(1, Math.max(0, (event.speed ?? 80) / 200));
      pushDecal(state, {
        kind: "drag",
        x: event.x,
        y: event.y,
        angle: dir,
        len: 34 + speedT * 62 + strength * 18,
        size: 4.2 + strength * 3.1,
        born: state.time,
        seed: Math.random()
      });
      const count = 10 + Math.round(strength * 7);
      for (let i = 0; i < count; i += 1) {
        const spread = (Math.random() - 0.5) * 1.0;
        const speed = (38 + Math.random() * 66) * (0.7 + speedT * 0.6);
        spawnParticle(state, event.x, event.y, dir + spread, speed);
      }
      return;
    }

    if (event.type === "blast") {
      const count = 8 + Math.round(strength * 8);
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (30 + Math.random() * 80) * (0.7 + strength * 0.6);
        spawnParticle(state, event.x, event.y, angle, speed);
      }
      for (let i = 0; i < 2; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        pushDecal(state, {
          kind: "splatter",
          x: event.x + Math.cos(angle) * (4 + strength * 5),
          y: event.y + Math.sin(angle) * (4 + strength * 5),
          angle,
          size: 3 + strength * 5,
          born: state.time,
          seed: Math.random()
        });
      }
    }
  }

  function updateBleeding(game, state) {
    if (!bloodEnabled) return;
    const units = Array.isArray(game.infantry) ? [...game.infantry] : [];
    if (game.player?.bleed) units.push(game.player);
    for (const unit of units) {
      const bleed = unit.bleed;
      if (!bleed) continue;
      const alive = unit === game.player
        ? !game.playerDowned && !game.playerDeathActive && (unit.hp ?? 0) > 0
        : unit.alive !== false;
      if (!alive || state.time >= bleed.until) {
        unit.bleed = null;
        continue;
      }
      const dx = unit.x - bleed.lastX;
      const dy = unit.y - bleed.lastY;
      const moved = Math.hypot(dx, dy);
      const strength = Math.min(1, Math.max(0.25, bleed.strength || 0.45));
      const dripDistance = Math.max(16, BLEED_DRIP_DISTANCE + 10 + ((bleed.seed || 0.5) - 0.5) * 8 - strength * 4);
      const idleInterval = Math.max(1.05, BLEED_IDLE_INTERVAL + 0.35 - strength * 0.42);
      bleed.travel += moved;

      const idle = state.time - bleed.lastDrip >= idleInterval;
      if (bleed.travel >= dripDistance || idle) {
        const moving = bleed.travel >= dripDistance && moved > 0.05;
        const angle = moving ? Math.atan2(dy, dx) : unit.angle || 0;
        const x = moving ? (unit.x + bleed.lastX) * 0.5 : unit.x;
        const y = moving ? (unit.y + bleed.lastY) * 0.5 : unit.y;
        bleed.travel = 0;
        bleed.lastDrip = state.time;
        pushDecal(state, {
          kind: "droplet",
          x: x + (Math.random() - 0.5) * 4,
          y: y + (Math.random() - 0.5) * 4,
          angle,
          size: (moving ? 1.1 : 1.45) + strength * 0.95 + Math.random() * 0.6,
          born: state.time,
          seed: Math.random()
        });
        if (moving && strength > 0.55 && state.time - bleed.lastFlow >= 0.85 && Math.random() < 0.55) {
          bleed.lastFlow = state.time;
          pushDecal(state, {
            kind: "flow",
            x: x - Math.cos(angle) * 2,
            y: y - Math.sin(angle) * 2,
            angle,
            len: 5 + strength * 8 + Math.min(5, moved * 0.18),
            size: 0.85 + strength * 0.65,
            born: state.time,
            seed: Math.random()
          });
        }
      } else if (strength > 0.7 && state.time - bleed.lastFlow >= 1.8) {
        bleed.lastFlow = state.time;
        pushDecal(state, {
          kind: "flow",
          x: unit.x + (Math.random() - 0.5) * 3,
          y: unit.y + (Math.random() - 0.5) * 3,
          angle: (unit.angle || 0) + Math.PI * 0.5 + (Math.random() - 0.5) * 0.9,
          len: 4 + strength * 5,
          size: 0.75 + strength * 0.55,
          born: state.time,
          seed: Math.random()
        });
      }
      bleed.lastX = unit.x;
      bleed.lastY = unit.y;
    }
  }

  function updateCorpseBleeds(_game, state) {
    if (!bloodEnabled) return;
    const bleeds = state.corpseBleeds || [];
    for (let i = bleeds.length - 1; i >= 0; i -= 1) {
      const bleed = bleeds[i];
      if (state.time >= bleed.until) {
        bleeds.splice(i, 1);
        continue;
      }
      const strength = Math.min(1, Math.max(0.25, bleed.strength || 0.5));
      if (state.time - bleed.lastDrip >= 0.82 + (1 - strength) * 0.62) {
        bleed.lastDrip = state.time;
        const side = (Math.random() - 0.5) * 0.9;
        pushDecal(state, {
          kind: "droplet",
          x: bleed.x + Math.cos(bleed.angle + side) * (4 + Math.random() * 8),
          y: bleed.y + Math.sin(bleed.angle + side) * (4 + Math.random() * 8),
          angle: bleed.angle,
          size: 1.05 + strength * 1.05 + Math.random() * 0.55,
          born: state.time,
          seed: Math.random()
        });
      }
      if (strength > 0.55 && state.time - bleed.lastFlow >= 1.45 + (1 - strength) * 0.72) {
        bleed.lastFlow = state.time;
        pushDecal(state, {
          kind: "flow",
          x: bleed.x + Math.cos(bleed.angle) * (4 + Math.random() * 4),
          y: bleed.y + Math.sin(bleed.angle) * (4 + Math.random() * 4),
          angle: bleed.angle + (Math.random() - 0.5) * 0.5,
          len: 7 + strength * 11 + Math.random() * 4,
          size: 1 + strength * 0.9,
          born: state.time,
          seed: Math.random()
        });
      }
    }
  }

  function unitIsCorpse(unit) {
    return unit && unit.alive === false && Number.isFinite(unit.x) && Number.isFinite(unit.y);
  }

  function vehicleMotion(vehicle) {
    const rawSpeed = Number(vehicle?.speed || 0);
    if (Math.abs(rawSpeed) > 0.5) {
      const angle = (vehicle.angle || 0) + (rawSpeed < 0 ? Math.PI : 0);
      return {
        speed: Math.abs(rawSpeed),
        angle,
        vx: Math.cos(angle) * Math.abs(rawSpeed),
        vy: Math.sin(angle) * Math.abs(rawSpeed)
      };
    }
    const vx = Number(vehicle?.vx || vehicle?.velocityX || 0);
    const vy = Number(vehicle?.vy || vehicle?.velocityY || 0);
    return {
      speed: Math.hypot(vx, vy),
      angle: Math.atan2(vy, vx),
      vx,
      vy
    };
  }

  function vehicleBloodContactRadius(vehicle) {
    const base = Math.max(vehicle?.radius || 0, vehicle?.vehicleType === "humvee" ? 44 : 62);
    return vehicle?.vehicleType === "humvee" ? base * 1.38 : base * 1.58;
  }

  function updateVehicleBloodDrag(game, state) {
    if (!bloodEnabled) return;
    const vehicles = [];
    if (Array.isArray(game.tanks)) vehicles.push(...game.tanks);
    if (Array.isArray(game.humvees)) vehicles.push(...game.humvees);
    if (vehicles.length === 0) return;
    const corpses = (game.infantry || []).filter(unitIsCorpse);
    if (corpses.length === 0 && state.pools.length === 0) return;

    for (const vehicle of vehicles) {
      if (!vehicle || vehicle.alive === false) continue;
      const motion = vehicleMotion(vehicle);
      const speed = motion.speed;
      if (speed < 12) continue;
      const id = vehicle.id || `${vehicle.vehicleType || "vehicle"}:${Math.round(vehicle.x)}:${Math.round(vehicle.y)}`;
      if ((state.vehicleDragAt[id] || 0) > state.time) continue;

      const checkRadius = vehicleBloodContactRadius(vehicle);
      let sourceX = null;
      let sourceY = null;
      for (const corpse of corpses) {
        if (Math.hypot(vehicle.x - corpse.x, vehicle.y - corpse.y) <= checkRadius) {
          sourceX = corpse.x;
          sourceY = corpse.y;
          break;
        }
      }
      if (sourceX === null) {
        for (const pool of state.pools) {
          const radius = poolRadius(pool, state.time) + checkRadius * 0.45;
          if (Math.hypot(vehicle.x - pool.x, vehicle.y - pool.y) <= radius) {
            sourceX = pool.x;
            sourceY = pool.y;
            break;
          }
        }
      }
      if (sourceX === null) continue;

      const angle = motion.angle;
      const offset = Math.min(checkRadius * 0.72, speed * 0.12);
      pushDecal(state, {
        kind: "drag",
        x: sourceX + Math.cos(angle) * offset,
        y: sourceY + Math.sin(angle) * offset,
        angle,
        len: 28 + Math.min(74, speed * 0.28),
        size: vehicle.vehicleType === "tank" ? 6.4 : 4.6,
        born: state.time,
        seed: Math.random()
      });
      if (Math.random() < 0.5) {
        pushDecal(state, {
          kind: "droplet",
          x: sourceX + Math.cos(angle) * (offset + 8 + Math.random() * 12) + (Math.random() - 0.5) * 8,
          y: sourceY + Math.sin(angle) * (offset + 8 + Math.random() * 12) + (Math.random() - 0.5) * 8,
          angle,
          size: 1.4 + Math.random() * 1.4,
          born: state.time,
          seed: Math.random()
        });
      }
      state.vehicleDragAt[id] = state.time + 0.12;
    }
  }

  function actorFootId(actor, game) {
    if (actor === game.player) return "player";
    return actor.id || actor.callSign || `unit:${Math.round(actor.x)}:${Math.round(actor.y)}`;
  }

  function footBloodSource(_game, state, actor, radius, corpses) {
    for (const corpse of corpses) {
      const contact = radius + (corpse.radius || 12) + 24;
      if (Math.hypot(actor.x - corpse.x, actor.y - corpse.y) <= contact) {
        return { x: corpse.x, y: corpse.y };
      }
    }
    for (const pool of state.pools || []) {
      const contact = poolRadius(pool, state.time) + radius + 5;
      if (Math.hypot(actor.x - pool.x, actor.y - pool.y) <= contact) {
        return { x: pool.x, y: pool.y };
      }
    }
    return null;
  }

  function updateFootBloodDrag(game, state, dt) {
    if (!bloodEnabled || !(dt > 0)) return;
    const corpses = (game.infantry || []).filter(unitIsCorpse);
    if (corpses.length === 0 && (state.pools || []).length === 0) return;
    const actors = [];
    if (game.player && !game.player.inTank && !game.playerDeathActive && !game.playerDowned) actors.push(game.player);
    for (const unit of game.infantry || []) {
      if (actors.length >= 65) break;
      if (!unit || unit.alive === false || unit.inVehicle) continue;
      actors.push(unit);
    }

    for (const actor of actors) {
      const id = actorFootId(actor, game);
      const previous = state.footLast[id];
      state.footLast[id] = { x: actor.x, y: actor.y };
      if (!previous || (state.footDragAt[id] || 0) > state.time) continue;
      const dx = actor.x - previous.x;
      const dy = actor.y - previous.y;
      const moved = Math.hypot(dx, dy);
      const speed = moved / Math.max(dt, 0.001);
      if (speed < 22 || moved < 1.1) continue;
      const radius = Math.max(actor.radius || 10, actor === game.player ? 13 : 10);
      const source = footBloodSource(game, state, actor, radius, corpses);
      if (!source) continue;

      const angle = Math.atan2(dy, dx);
      const side = (Math.random() - 0.5) * radius * 0.8;
      const nx = Math.cos(angle + Math.PI * 0.5);
      const ny = Math.sin(angle + Math.PI * 0.5);
      pushDecal(state, {
        kind: "smear",
        x: actor.x - Math.cos(angle) * radius * 0.3 + nx * side,
        y: actor.y - Math.sin(angle) * radius * 0.3 + ny * side,
        angle,
        len: 7 + Math.min(18, speed * 0.055),
        size: actor === game.player ? 2.1 : 1.55,
        born: state.time,
        seed: Math.random()
      });
      if (Math.random() < (actor === game.player ? 0.55 : 0.28)) {
        pushDecal(state, {
          kind: "droplet",
          x: actor.x - Math.cos(angle) * (radius + 5) + nx * side * 0.7,
          y: actor.y - Math.sin(angle) * (radius + 5) + ny * side * 0.7,
          angle,
          size: 1 + Math.random() * 0.75,
          born: state.time,
          seed: Math.random()
        });
      }
      state.footDragAt[id] = state.time + (actor === game.player ? 0.16 : 0.24);
    }
  }

  function update(game, dt) {
    const state = bloodState(game);
    if (!state || !(dt > 0)) return;
    state.time += dt;
    state.frameEvents = 0;
    updateBleeding(game, state);
    updateCorpseBleeds(game, state);
    updateVehicleBloodDrag(game, state);
    updateFootBloodDrag(game, state, dt);

    const particles = state.particles;
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vz -= GRAVITY * dt;
      if (p.z <= 0) {
        particles.splice(i, 1);
        pushDecal(state, {
          kind: "droplet",
          x: p.x,
          y: p.y,
          angle: Math.atan2(p.vy, p.vx),
          size: 0.9 + Math.random() * 1.3,
          born: state.time,
          seed: Math.random()
        });
      }
    }
  }

  function emitPlayerBloodDamage(game, damage, source = null, kind = "damage", sourcePoint = null, lethal = false) {
    const player = game?.player;
    if (!player || !IronLine.blood?.emit) return;
    const hitSource = sourcePoint || game.damageSourcePoint?.(source) || { x: player.x - Math.cos(player.angle || 0), y: player.y - Math.sin(player.angle || 0) };
    const dx = player.x - hitSource.x;
    const dy = player.y - hitSource.y;
    const len = Math.hypot(dx, dy) || 1;
    const vehicleHit = source?.vehicleType || kind === "vehicle" || kind === "vehicle_collision" || kind === "tank_crush";
    const blastHit = source?.ammo || kind === "explosion" || kind === "rpg" || kind === "shell" || kind === "he" || kind === "grenade";
    const speed = Math.hypot(Number(source?.vx || 0), Number(source?.vy || 0)) || Number(source?.speed || 0);
    const strength = Math.min(1, Math.max(0.25, damage / (kind === "sniper" ? 34 : vehicleHit ? 30 : 48)));
      emit(game, {
        type: vehicleHit ? "vehicle" : blastHit ? "blast" : "bullet",
        x: player.x,
        y: player.y,
        dirX: dx / len,
        dirY: dy / len,
        strength,
        speed,
        unitId: "player",
        weaponId: kind
      });
    if (lethal) {
      spawnCorpsePool(game, player);
    } else {
      const bleedSource = Object.assign({ weaponId: kind }, source || {});
      if (!bleedSource.weaponId) bleedSource.weaponId = kind;
      startBleed(game, player, damage, bleedSource);
    }
  }

  function installGameBloodEffects(Game) {
    const proto = Game?.prototype;
    if (!proto?.applyPlayerDamage || proto.__bloodEffectsInstalled) return;
    const baseApplyPlayerDamage = proto.applyPlayerDamage;
    proto.applyPlayerDamage = function applyPlayerDamageWithBlood(amount, source = null, kind = "damage", options = {}) {
      const hpBefore = this.player?.hp || 0;
      const sourcePoint = this.damageSourcePoint?.(source, options) || null;
      const applied = baseApplyPlayerDamage.call(this, amount, source, kind, options);
      if (!applied) return applied;
      const hpAfter = this.player?.hp || 0;
      const damage = Math.max(0, hpBefore - hpAfter) || Math.max(0, Number(amount) || 0);
      if (damage > 0) emitPlayerBloodDamage(this, damage, source, kind, sourcePoint, hpBefore > 0 && hpAfter <= 0);
      return applied;
    };
    proto.__bloodEffectsInstalled = true;
  }

  IronLine.blood = {
    emit,
    update,
    startBleed,
    spawnCorpsePool,
    poolRadius,
    setBloodEnabled,
    isBloodEnabled,
    FRESH,
    DRIED,
    DRY_SECONDS
  };
  IronLine.installGameBloodEffects = installGameBloodEffects;

  const bloodToggle = global.document?.querySelector("[data-blood-enabled]");
  if (bloodToggle) {
    bloodToggle.checked = bloodEnabled;
    bloodToggle.addEventListener("change", () => {
      setBloodEnabled(bloodToggle.checked);
    });
  }

  const InfantryUnit = IronLine.InfantryUnit;
  if (InfantryUnit?.prototype?.takeDamage) {
    const baseTakeDamage = InfantryUnit.prototype.takeDamage;
    InfantryUnit.prototype.takeDamage = function takeDamageWithBlood(amount, source = null) {
      const wasAlive = this.alive;
      baseTakeDamage.call(this, amount, source);
      if (!wasAlive || !(amount > 0)) return;
      const game = IronLine.game;
      if (!game) return;
      if (!this.alive) {
        spawnCorpsePool(game, this);
      } else {
        startBleed(game, this, amount, source);
      }

      const impact = this.__bloodImpact || null;
      if (impact) this.__bloodImpact = null;
      let dirX = Math.cos(this.angle);
      let dirY = Math.sin(this.angle);
      if (impact) {
        dirX = impact.dirX;
        dirY = impact.dirY;
      } else if (source && Number.isFinite(source.x) && Number.isFinite(source.y)) {
        const dx = this.x - source.x;
        const dy = this.y - source.y;
        const len = Math.hypot(dx, dy);
        if (len > 0.001) {
          dirX = dx / len;
          dirY = dy / len;
        }
      }
      emit(game, {
        type: impact ? "vehicle" : source?.ammo ? "blast" : "bullet",
        x: this.x,
        y: this.y,
        dirX,
        dirY,
        strength: Math.min(1, amount / 45),
        speed: impact?.speed,
        unitId: this.id,
        weaponId: sourceWeaponId(source)
      });
    };
  }

  if (IronLine.combat?.updateEffects) {
    const baseUpdateEffects = IronLine.combat.updateEffects;
    IronLine.combat.updateEffects = function updateEffectsWithBlood(game, dt) {
      update(game, dt);
      return baseUpdateEffects.call(this, game, dt);
    };
  }
})(window);
