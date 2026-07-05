# Online Combat Server-Authority First-Pass Interim Verification Report - 2026-05-22

Decision: ON TRACK.

## Purpose

Verify the first implementation slice for server-confirmed human combat outcomes.

This is not a full server-authoritative rewrite. AI simulation, BotCommander, Tactical Map, 50vs50 world simulation, vehicle AI, and drone AI remain out of scope.

## Implementation Summary

Implemented first-pass server-confirmed combat events:

- `player_state` sequencing remains in the room participant state path.
- `player_shot` / current `small_arms` shot requests can be submitted to `/api/rooms/:roomId/combat`.
- Server creates `server_hit_confirm`.
- Server creates `server_death_confirm` for lethal confirmed hits.
- Server creates `server_respawn_confirm` for respawn requests.
- Server creates `server_round_confirm` for round-state confirmation packets.
- Duplicate `shotId` / `hitId` / `deathId` / `respawnId` are guarded.
- Stale hit claims against an older `targetStateSeq` are rejected with `reason: stale-state`.

Client-side behavior remains responsive:

- Local input, aiming, prediction, effects, tracers, sound, camera feedback, and UI remain client-side.
- Existing combat events remain usable for local/offline flows.
- Remote server-confirmed hit / death / respawn / round events are now recognized by the client combat application path.

## Changed Files

- `server/room-registry.js`
- `tools/static-server.cjs`
- `src/systems/room-registry.js`
- `src/main.js`
- `tools/check-online-combat-server-authority.cjs`
- `docs/online-combat-server-authority-transition-review-2026-05-22.md`
- `docs/online-combat-server-authority-first-pass-scope-lock-2026-05-22.md`
- `docs/INDEX.md`
- `AGENT_HANDOFF.md`

## Packet / Event Results

Verified server-confirmed event types:

- `server_hit_confirm`
- `server_death_confirm`
- `server_respawn_confirm`
- `server_round_confirm`

Verified important fields:

- `serverAuthority`
- `serverSeq`
- `shotId`
- `hitId`
- `deathId`
- `respawnId`
- `accepted`
- `reason`
- `damage`
- `targetHealthBefore`
- `targetHealthAfter`
- `targetStateSeq`
- `confirmedAt`

## Validation Results

### Server Authority Smoke

Command:

```text
node tools/check-online-combat-server-authority.cjs
```

Result: PASS.

Evidence:

- One accepted `server_hit_confirm` reduced Blue from 100 HP to 78 HP.
- Duplicate `shotId` / `hitId` did not apply damage twice.
- A lethal server-confirmed hit created exactly one `server_death_confirm`.
- Red kill stat incremented once.
- `server_respawn_confirm` revived Blue at state sequence 11.
- A stale hit claim against Blue's pre-respawn state sequence was rejected with `reason: stale-state`.
- `server_round_confirm` recorded the Red round win.

### Existing Online Stabilization Smoke

Command:

```text
node tools/check-online-combat-stabilization.cjs
```

Result: PASS.

Evidence:

- Two-player room state preserved.
- Stale player state did not overwrite newer state.
- Duplicate hit / death / respawn records collapsed.

### Existing Client Combat Flow Smoke

Command:

```text
node tools/check-online-combat-client-flow.cjs
```

Result: PASS.

Evidence:

- Remote hit applies once.
- Duplicate hit is ignored.
- Remote death applies once.
- Duplicate death is ignored.
- Remote respawn applies once.
- Stale hit after local respawn is ignored.

### Online Smoke

Command:

```text
npm run check:online
```

Result: PASS.

Evidence:

- Room creation / participants / combat event preservation / command WebSocket ack and broadcast still pass.

### General Check

Command:

```text
npm run check
```

Result: PASS.

Evidence:

- Syntax, duplicate method, and code-health checks pass.

## Current Limitations

- Server-side small-arms validation is conservative and first-pass only.
- Full server raycast / obstacle validation is not implemented yet.
- Projectile and vehicle combat are not fully server-authoritative.
- AI/world simulation remains world-host / snapshot based.
- Real two-client live play should still be used to validate feel, latency, and UI reconciliation.

## Regression Check

Maintained:

- Online command synchronization.
- Client hit / death / respawn duplicate guards.
- Stale-after-respawn protection.
- Client-side prediction and combat feedback.
- BotCommander skeleton.
- AI V2 Tactical Map / behavior connection.
- AI count expansion assumptions.

## Final Interim Verdict

ON TRACK.

The first server-authority implementation slice is present and smoke-tested for core hit / death / respawn / round confirmation behavior. The next step should be a narrow report-based validation / fix pass focused on live two-client behavior, confirm-vs-prediction reconciliation, and any remaining packet-order edge cases.
