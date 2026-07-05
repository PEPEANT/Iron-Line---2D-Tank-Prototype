# P0-9F Tactical Map Rebuild Cadence / Cache Pass

Date: 2026-05-23

## Decision

P0-9F is a narrow PASS for the movement-only tactical-map stall target.

The confirmed P0-9E culprit was synchronous `tacticalMap.rebuild` work inside the live frame. This pass keeps AI behavior, worldState ownership, WebSocket combat, projectile transport, and admin/observer structure unchanged, and reduces the rebuild cost by reusing tactical-map blocker and cover-node work instead of recalculating the same static map cover data in live frames.

## Change

- `TacticalMap.rebuild` now builds the blocker list once and passes it through the rebuild substeps that need it.
- `buildTrafficHints` and `estimatedClearance` reuse that blocker list instead of calling `this.blockers()` for every graph edge.
- `buildCoverNodes` caches non-wreck cover-node results by map/objective/road context plus blocker source/geometry.
- Vehicle wreck blockers remain uncached so dynamic wreck cover can still be generated live.
- Cached cover nodes are cloned when reused so callers do not share mutable node objects.
- `coverTags` reuses the already-computed nearest objective for each sample.

## Before / After

Baseline source: `reports/playtests/p0-9e-hotpath-20260523-102938/report.md`

After source: `reports/playtests/p0-9e-hotpath-20260523-104415/report.md`

| Metric | Before | After |
| --- | ---: | ---: |
| normal low-AI long frames, blue/red | 2 / 3 | 0 / 0 |
| frame max, blue/red | 200.0ms / 250.0ms | 33.4ms / 33.3ms |
| `game.updateBattlefield` max, blue/red | 202.8ms / 248.1ms | 35.2ms / 36.5ms |
| `tacticalMap.rebuild` max, blue/red | 201.0ms / 247.2ms | 32.9ms / 35.5ms |
| `buildTrafficHints` max, blue/red | 111.5ms / 151.5ms | 30.3ms / 31.1ms |
| `buildCoverNodes` max, blue/red | 87.7ms / 94.2ms | 0.5ms / 0.6ms |

AI-paused comparison stayed clean after the change: long frames remained 0 / 0, with `game.updateBattlefield` max at 1.1ms / 1.0ms.

## Verification

- `node tools/check-p0-9e-update-battlefield-hot-path.cjs`
  - `reports/playtests/p0-9e-hotpath-20260523-104415/report.md`
  - Result: no updateBattlefield long frame reproduced in normal low-AI or AI-paused comparison.
- `node tools/check-p0-9d-frame-stall-triage.cjs`
  - `reports/playtests/p0-9d-frame-stall-20260523-104449/report.md`
  - Result: no steady movement-only frame stall reproduced.
- `node tools/check-p0-9c-stutter-mismatch.cjs`
  - `reports/playtests/p0-9c-mismatch-20260523-104514/report.md`
  - Result: WS-backed session/render coordinate path still matches at 0px, but this broader online probe still observed one 116.7ms frame on each page. Treat that as a remaining room-refresh/browser-work risk, not a remote-position render-source failure.
- `npm run check`
- `npm run check:online`
- `git diff --check`

## Constraints Preserved

- No WebSocket combat/projectile expansion.
- No admin/observer split.
- No AI tactical behavior redesign.
- No worldState ownership change.
- No broad renderer refactor.
- No alpha resume declaration.

## Next Recommendation

Run one controlled manual 2P retest against this P0-9F build. If the perceived lag is still unchanged, the next single branch should be a room-refresh/localStorage cadence pass using the residual P0-9C 116.7ms broader-online-frame evidence.
