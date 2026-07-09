# P0 online root-cause final verification + authority fix

Conclusion: as of 2026-05-24, the human `4v4` online path is in PASS state for a controlled run, and the remaining P0 online issues have been narrowed again. The duplicated non-host AI battlefield ownership problem has now been removed from the live loop, and the earlier `POST /participants 220` browser number was closed as a probe artifact rather than a confirmed runtime transport failure.

## Purpose

- Record the backup created before edits.
- Lock the final root-cause conclusions with current-head evidence.
- Record the additional non-host battlefield ownership pass and transport-probe correction.
- Record the final low-risk host `worldState` cadence polish that held up under re-runs.

## Backup

- Project backup created before edits:
  - `<local-codex-workspace>`

## Final locked causes and closure status

### 1. Red-team AI choppiness was caused by non-host battlefield ownership drift

Historical cause:

- Every client ran battlefield simulation locally.
- Only the selected host published authoritative `worldState`.
- Non-host clients kept running tactical map, commander AI, squad AI, respawn, spacing, and AI actor updates before being corrected back toward host snapshots.

Current fix status:

- Non-host online clients no longer run the host-only battlefield ownership path.
- Remote online non-hosts now keep local player control, projectiles/effects, and light local state, but stop driving:
  - tactical map rebuild
  - commander / bot commander updates
  - squad AI updates
  - AI respawn ownership
  - spacing ownership
  - capture-point ownership updates
  - non-player AI actor movement decisions

Current evidence:

- `node tools/check-p0-10b-worldstate-cadence.cjs`
  - decision: `No major worldState cadence/snap issue reproduced in this run`
  - blue publish gap max: `334.5ms`
  - red apply gap max: `23.6ms`
  - red unit apply drift max: `5.5px`
  - red vehicle apply drift max: `13.4px`

Interpretation:

- The old duplicated non-host AI/world ownership bug is no longer the active problem.
- The remaining limitation is the host snapshot / interpolation model itself, not a second local AI simulation fighting the host.

### 2. The earlier `POST /participants 220` browser result was a probe artifact

Historical cause:

- The browser probe `tools/check-p0-real-browser-2p.cjs` simulated movement by calling `roomRegistry.addOrUpdatePlayer()` every `180ms` inside the page.
- That helper publishes participants by default.
- The probe therefore forced synthetic local movement to spam real participant POSTs, even though it was not exercising the normal live `session-flow` transport path.

Current fix status:

- `roomRegistry.addOrUpdatePlayer()` now accepts an option to skip remote participant publish.
- The browser probe now uses local-only movement injection for its synthetic page-side movement loops.

Current evidence:

- `node tools/check-p0-real-browser-2p.cjs`
  - movement-only 10s: `POST /participants 0`, `longFrames50 0`, `maxFrame 50ms`
  - small-arms 10s: `POST /participants 0`, `longFrames50 0`, `maxFrame 33.4ms`
  - projectile 10s: `POST /participants 0`, `longFrames50 0`, `maxFrame 33.4ms`
  - admin/observer ON 10s: `POST /participants 0`, `longFrames50 0`, `maxFrame 33.4ms`

Interpretation:

- The alarming `220` participant POST result is closed as a measurement bug in that synthetic browser probe.
- The WebSocket relay path is still the live fast-position lane.
- This does not mean runtime participant POSTs never happen; it means that the previous `220` number was not trustworthy evidence for a runtime participant transport regression.

### 3. Lobby team/slot snap-back was a direct authority bug

- Before the fix, the client changed local slot/ready first.
- Server already had authoritative `assign_slot` and `ready` messages, but the lobby UI bypassed them.
- Later room refresh or participant refresh could overwrite the user move and pull the player back.

Current fix status:

- Client lobby slot/ready now goes through WebSocket authority first.
- Pending lobby requests defer stale participant publishes.
- Successful server results and snapshots apply back immediately.

### 4. Re-review found and closed two hidden `4v4` bugs

#### 4a. Full-room capacity classification bug

- Server WebSocket join logic used occupied slot count rather than active human count.
- That allowed temporary over-capacity player admission before slots were fully assigned.

#### 4b. Socket lobby guard gap

- A socket that had not completed `join` could still attempt `assign_slot`.
- A joined player could still attempt `ready` after the room had already left lobby unless the client blocked it first.

Current fix status:

- Both bugs were fixed.
- Both are now covered by smoke tests.

## Fixes applied on 2026-05-24

### Lobby authority path

- Client lobby slot and ready actions now request WebSocket server authority first.
- Pending lobby requests defer stale participant POSTs so older local state cannot overwrite requested server truth.
- Successful `slot_result` and `ready_result` update local session state immediately.

Files:

- `src/systems/session-flow.js`
- `src/main.js`
- `src/systems/lobby-ui.js`
- `src/systems/game-session-state.js`

### Immediate room truth push

- Successful `assign_slot` and `ready` messages now broadcast a fresh `observer_snapshot`.
- Clients consume that snapshot immediately instead of waiting for the next HTTP room refresh.

Files:

- `server/websocket.js`
- `server/room-registry.js`
- `src/systems/session-flow.js`

### `4v4` capacity and overflow authority fix

- WebSocket room join classification now uses active human count.
- Full-room HTTP participant updates that request `"player"` are downgraded to `"spectator"`.
- Static room slot helpers now preserve requested valid slots while still enforcing total human capacity.

Files:

- `server/room-registry.js`
- `server/static-room-admin.js`
- `tools/static-room-slot-helpers.cjs`
- `tools/static-server.cjs`

### Final socket guard hardening

- `assignSlot()` now rejects slot claims from clients that have not joined.
- `setReady()` now rejects ready changes from clients that have not joined.
- `setReady()` now also rejects ready changes once the room is locked or no longer in lobby.

Files:

- `server/room-registry.js`
- `tools/online-smoke-ws.cjs`
- `tools/check-online-smoke.cjs`

### Non-host battlefield ownership pass

- Non-host online clients now stop simulating host-owned AI battlefield systems locally.
- Non-hosts still keep:
  - local player control
  - player-controlled vehicle cooldown/reload ticking
  - projectile/effect playback
  - drone/player-side local interaction
  - score/report display paths that do not re-own AI movement

Files:

- `src/main.js`

### Final host `worldState` cadence polish

- Host `worldState` publish cadence was tightened from `0.45s` to `0.30s`.
- This reduced the measured host publish gap without reopening the earlier lobby, transport, or frame-stall regressions.

Files:

- `src/main.js`

### Browser transport probe correction

- Local-only browser movement injection no longer forces synthetic participant POST spam.
- `roomRegistry.addOrUpdatePlayer()` now supports local-only updates when a caller does not intend to publish remote participant state.

Files:

- `src/systems/room-registry.js`
- `tools/check-p0-real-browser-2p.cjs`

## Final verification rerun

- `npm run check`
  - PASS
- `npm run check:online`
  - PASS
  - `ws=hello/join_result/observer_snapshot`
  - `wsCommand=ack/broadcast`
  - `wsLobbyGuards=not_joined/locked`
  - `wsPlayerState=relay`
  - `ws4v4=8p/8ready`
- `node tools/check-p0-team-damage-full-path.cjs`
  - PASS
  - actual-team AI targeting, same-team reject guards, and kill/death/respawn stat integrity all passed
- `node tools/check-p0-10b-worldstate-cadence.cjs`
  - PASS decision: no major worldState cadence/apply snap reproduced
  - blue publish gap max: `334.5ms`
  - red apply gap max: `23.6ms`
  - red unit apply drift max: `5.5px`
  - red vehicle apply drift max: `13.4px`
- `node tools/check-p0-real-browser-2p.cjs`
  - PASS as a headless browser runtime probe
  - `POST /participants 0` in all scenarios after probe correction
  - `longFrames50 0` in all scenarios

## Final decision

- `4v4` human join, slot assignment, ready sync, overflow-to-spectator, and lobby snap-back paths are in PASS state.
- The duplicated non-host AI battlefield ownership bug is closed.
- The earlier `POST /participants 220` browser result is closed as a probe artifact and no longer reproduces after correcting the synthetic transport path.
- A final host `worldState` cadence polish also held under the same automated online re-runs.

## What is still not closed

- This project still uses host snapshot authority for world state rather than full server-authoritative world simulation.
- If a live human `4v4` run still feels visually rough on the red side, the next branch should target the remaining snapshot/interpolation lane directly:
  - optional world delta transport
  - interpolation tuning for long-path remote units
