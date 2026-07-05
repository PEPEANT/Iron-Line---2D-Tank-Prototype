# P0-9E updateBattlefield Hot Path Profiling

Conclusion: the current P0-9F candidate is a narrow tactical-map rebuild cadence/slicing pass for `buildTrafficHints` and `buildCoverNodes`. P0-9E shows the steady movement-only long frames are not caused directly by localStorage, room fetch latency, render draw, or input latency; they are caused by synchronous `tacticalMap.rebuild` work inside `updateBattlefield`.

## Purpose

P0-9D found 200ms+ stalls inside `game.updateBattlefield`, after P0-9C already confirmed WS player_state reaches the actual remote-player render path. P0-9E breaks `updateBattlefield` down into internal performance sections and compares normal low-AI movement against an AI-paused movement run.

This is profiling only. It does not approve WebSocket combat/projectile expansion, admin/observer separation, AI/worldState redesign, broad renderer refactor, or alpha resume language.

## Probe

Tool:

`tools/check-p0-9e-update-battlefield-hot-path.cjs`

Shared CDP helper:

`tools/p0-browser-cdp-helper.cjs`

Latest valid output:

`reports/playtests/p0-9e-hotpath-20260523-102938/report.md`

Measurement:

- Headless Chrome two-player online production session.
- Same room, same movement-only input path.
- Scenario 1: normal low-AI.
- Scenario 2: AI-paused comparison.
- Captures frame timing, `perfMonitor` sections, tactical-map submethods, roomRegistry calls, fetch, localStorage, render, and input latency.

## Result Summary

| Scenario | Page | Long frames >50ms | Frame max ms | updateBattlefield max ms | Top section | Top max ms | Detail fetches | Input max ms |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| normal low-AI | blue | 2 | 200 | 202.8 | `tacticalMap.update` | 201.1 | 39 | 10.1 |
| normal low-AI | red | 3 | 250 | 248.1 | `tacticalMap.update` | 247.2 | 40 | 9.6 |
| AI paused | blue | 0 | 16.8 | 1.2 | `registry.refreshRemoteRooms` | 12 | 40 | 10.4 |
| AI paused | red | 0 | 16.8 | 1 | `registry.refreshRemoteRooms` | 12.5 | 39 | 10.8 |

Normal low-AI long-frame breakdown:

| Page | tacticalMap.rebuild max ms | buildTrafficHints max ms | buildCoverNodes max ms |
| --- | ---: | ---: | ---: |
| blue | 201 | 111.5 | 87.7 |
| red | 247.2 | 151.5 | 94.2 |

The long-frame timeline repeatedly showed:

`tacticalMap.buildCoverNodes -> tacticalMap.buildTrafficHints -> tacticalMap.rebuild -> tacticalMap.update -> perf.ai.tacticalMap -> game.updateBattlefield`

## Classification

Current classification:

`tacticalMap.rebuild synchronous spike inside updateBattlefield`

Not selected:

- localStorage/cache throttle: write counts and bytes are still high, but measured write time stayed around `0.2-0.4ms` and did not own the long frames.
- room fetch cadence trim: `/api/rooms` and `/api/rooms/:id` still run often, but measured fetch/detail timings did not match the 200ms+ stalls.
- render draw optimization: `renderer.draw` stayed low.
- input latency triage: virtual input stayed around `10ms` max.
- broad AI/worldState redesign: AI-paused removes the spike, but the direct measured owner is tactical-map rebuild work, not general AI behavior.

## Next Recommendation

Proceed to one narrow P0-9F candidate:

`P0-9F tactical-map rebuild cadence/slicing`

Scope:

- Keep tactical-map behavior and AI behavior intact.
- Do not redesign AI/worldState.
- Prevent `buildTrafficHints` and `buildCoverNodes` from running synchronously in the live frame when the map signature changes during online movement/combat.
- Candidate directions for P0-9F should be limited to rebuild cadence, incremental/sliced rebuild, or cached blocker/traffic-hint reuse.

Still forbidden:

- WebSocket combat/projectile expansion.
- Admin/observer split.
- Broad AI/worldState architecture change.
- Large renderer refactor.
- Alpha resume declaration.
