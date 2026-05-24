# P0-10F Active-Room Refresh / LocalStorage Guard

Conclusion: P0-10F is an automated PASS candidate. The narrow guard reduced active-room detail refresh count and live online localStorage writes without changing WebSocket combat, WebSocket worldState, server authority, admin/observer split, AI behavior, worldState publish cadence, room/session architecture, or 4-player alpha scope.

## Changes

- Active online match detail refresh interval: `500ms` -> `750ms`.
- Live online `pushCombatEvent` updates the in-memory remote room and remote API without persisting the full room to localStorage on every combat event.
- `writeLocalRooms` now skips identical serialized room snapshots.

These are room refresh/localStorage guards only. Combat event shape, hit/death/respawn confirmation, WS player state, worldState smoothing, AI behavior, and admin/observer ownership are unchanged.

## Verification

- `npm run check`: pass.
- `npm run check:online`: pass.
- `git diff --check`: pass.
- `node tools/check-p0-9d-frame-stall-triage.cjs`
  - After report: `reports/playtests/p0-9d-frame-stall-20260524-054952/report.md`
- `node tools/check-p0-9e-update-battlefield-hot-path.cjs`
  - After report: `reports/playtests/p0-9e-hotpath-20260524-055016/report.md`
- `node tools/check-p0-real-browser-2p.cjs`
  - Measurement: headless Chrome browser runtime, not manual human play.
- `node tools/check-p0-10b-worldstate-cadence.cjs`
  - After report: `reports/playtests/p0-10b-worldstate-20260524-055153/report.md`

## Before / After

| Probe | Metric | Before | After |
| --- | --- | ---: | ---: |
| P0-9D movement-only | Long frames >50ms | 0 | 0 |
| P0-9D movement-only | localStorage writes / bytes | 271 / 2.42MB | 260 / 2.32MB |
| P0-9D movement-only | Detail fetches | 79 | 78 |
| P0-9E normal low-AI | `registry.refreshRemoteRooms` max, blue/red | 118ms / 110.6ms | 35ms / 36.1ms |
| P0-9E normal low-AI | Long frames >50ms | 0 / 0 | 0 / 0 |
| Real-browser movement | Detail fetches | 41 | 26 |
| Real-browser movement | localStorage writes | 32 | 32 |
| Real-browser small arms | Detail fetches | 39 | 26 |
| Real-browser small arms | Detail total bytes estimate | 282KB | 238KB |
| Real-browser small arms | localStorage writes | 109 | 30 |
| Real-browser projectile | Detail fetches | 38 | 26 |
| Real-browser projectile | Detail max bytes | 22.2KB | 7.7KB |
| Real-browser projectile | localStorage writes | 52 | 31 |
| Real-browser admin ON comparison | Detail fetches | 58 | 39 |
| Real-browser admin ON comparison | Detail total bytes estimate | 505KB | 412KB |
| Real-browser admin ON comparison | localStorage writes | 136 | 53 |

## Payload / Cadence Risk

- Detail request count went down in real-browser scenarios.
- Detail bytes per request rose in small-arms/admin comparison because fewer pulls collect larger deltas, but estimated total detail bytes still fell.
- Admin full-room `POST /api/rooms` remains unchanged: `3` posts, avg `40,960` bytes, max `78,676` bytes in the admin comparison. This pass intentionally did not split admin/observer.
- P0-10B worldState remained clean after the refresh guard:
  - publish gap max `475ms`
  - apply gap max `32.3ms`
  - unit applied snap `6.6px`
  - vehicle applied snap `17.4px`
  - snapshot bytes max `4,128`

## Remaining Risk

Automated frame proxies still show no >50ms long-frame collapse. The remaining risk is manual: a human may still perceive stutter from room detail bursts, browser work, or admin comparison payloads that do not cross the headless long-frame threshold.

## Next

Stop after this result and run a short live 2P manual check on current HEAD. Use admin/observer OFF first, then admin/observer ON only as comparison. Do not start admin split, WebSocket conversion, server authority, AI redesign, worldState cadence cuts, or 4-player alpha unless that manual check points to a new single lane.
