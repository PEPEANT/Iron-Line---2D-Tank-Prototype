# P0-10G Live 2P Feel Proxy / Observer Storage Guard

Conclusion: P0-10G is a manual live 2P FAIL. The automated 2P feel-proxy PASS candidate below remains useful as background evidence for storage/frame improvements, but it is superseded by the manual video result and must not be used to advance to limited 2P sanity or 4-player alpha.

## Manual Result

Video evidence:

`<local-captures-folder>`

Video metadata: `31.56s`, `1312x700`, `17.36MB`.

Observed result:

- Position synchronization is still visibly wrong.
- AI/worldState shows a new oscillation-like bug: AI appears near a capture/frontline state, moves, then appears to revert toward the capture/frontline state again.
- This is not just the small `10-20px` apply snap that P0-10D reduced.
- Current suspicion is source/state flip: host worldState and non-host local AI simulation or stale room refresh state may be alternating on the rendered client.

Decision:

- P0-10G manual result: FAIL.
- Do not proceed to `P0-10H limited 2P sanity record`.
- Next gate is `P0-10H live repro instrumentation`.
- No code fix should start until instrumentation separates other-player `player_state` from AI/worldState source flip.

## Why

Current HEAD after P0-10F still showed occasional 50-66.7ms frames in the headless real-browser 2P proxy. The remaining localStorage writes were mostly normal-player `iron-line-observer-snapshot` fallback writes, not active-room room-registry writes.

The observer bridge was writing a full observer snapshot to localStorage every `0.75s` even when `BroadcastChannel` was available. That path is only a fallback for observer/admin visibility, so the fix keeps live `BroadcastChannel` delivery and reduces only fallback storage cadence.

## Changes

- `src/systems/observer-bridge.js`
  - Keep observer `BroadcastChannel` publish cadence at `0.75s`.
  - When `BroadcastChannel` exists, write the localStorage fallback at `5s` cadence.
  - When `BroadcastChannel` is unavailable, keep the previous `0.75s` localStorage fallback cadence.

Probe alignment:

- `tools/check-p0-9d-frame-stall-triage.cjs`
- `tools/check-p0-9e-update-battlefield-hot-path.cjs`

Both probes now seed rooms as `playing` with `startedAt`, matching the live online battle condition instead of forcing only the client into `matchStarted`.

## Before / After

| Probe | Metric | Before | After |
| --- | --- | ---: | ---: |
| Real-browser movement | localStorage writes | 32 | 6 |
| Real-browser movement | frame max / long frames | 66.7ms / 2 | 50ms / 0 |
| Real-browser small arms | localStorage writes | 30 | 6 |
| Real-browser small arms | frame max / long frames | 66.7ms / 1 | 50ms / 0 |
| Real-browser projectile | localStorage writes | 31 | 6 |
| Real-browser projectile | frame max / long frames | 33.4ms / 0 | 33.4ms / 0 |
| Real-browser admin ON | localStorage writes | 52 | 15 |
| Real-browser admin ON | frame max / long frames | 33.4ms / 0 | 33.4ms / 0 |
| P0 basic movement WS | localStorage writes | 31 | 5 |
| P0 basic movement WS | remote gap p95 / snap p95 | 120ms / 4.2px | 131ms / 4.2px |
| P0 basic small-arms WS | localStorage writes | 30 | 4 |
| P0 basic small-arms WS | remote gap p95 / snap p95 | 129ms / 4.2px | 120ms / 4.2px |
| P0-10B worldState red | storage writes | 39 | 10 |
| P0-10B worldState red | unit / vehicle apply snap | 10px / 21.6px | 5.5px / 12.9px |

## Verification

- `node tools/check-p0-real-browser-2p.cjs`: PASS candidate, long frames `0` in movement, small-arms, projectile, and admin comparison.
- `node tools/check-p0-basic-2p-stutter-instrumentation.cjs`: WS player-state path still stable, long frames `0`, no stale WS samples in WS scenarios.
- `node tools/check-p0-10b-worldstate-cadence.cjs`: no major worldState cadence/snap issue reproduced.
- `node tools/check-p0-9d-frame-stall-triage.cjs`: no steady movement-only frame stall reproduced after live-room probe alignment.
- `node tools/check-p0-9e-update-battlefield-hot-path.cjs`: no updateBattlefield long frame reproduced; detail fetches reduced after live-room probe alignment.
- `npm run check`: pass.
- `npm run check:online`: pass.
- `git diff --check`: pass, with CRLF warning only.

## Scope Guard

This pass did not change WebSocket combat, WebSocket worldState, server authority, admin/observer split, AI behavior, worldState cadence, room/session architecture, active-room refresh cadence, or 4-player alpha scope.

## Remaining Risk

- This is still automated browser proxy evidence, not a two-human manual PASS.
- P0-9E can still show occasional `registry.refreshRemoteRooms` async maxima, but they did not coincide with render long frames in this run.
- Admin comparison still has full-room admin `POST /api/rooms` payloads; this pass intentionally did not split admin/observer.

## Next

Run one short live 2P human check on the new build. If Admin OFF feels acceptable, record P0 online stutter as downgraded from P0 to follow-up P1/P2. If Admin OFF still feels severe, the next single lane should be the reported symptom path, not a broad transport rewrite.
