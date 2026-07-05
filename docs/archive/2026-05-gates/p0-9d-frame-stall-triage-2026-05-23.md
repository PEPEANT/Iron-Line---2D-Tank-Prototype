# P0-9D Frame Stall Triage

Conclusion: choose C, `P0-9E render hot path profiling`. P0-9D reproduced steady movement-only frame stalls, but the strongest direct evidence points inside `game.updateBattlefield`, not at localStorage write time, fetch/detail latency, `renderer.draw`, or input latency.

## Purpose

P0-9C showed that P0-9B WS player_state reaches the actual remote-player render path, while manual perceived lag stayed unchanged. P0-9D therefore checks whether the remaining lag looks like frame stall, localStorage/fetch burst, render/update hot path, or input latency.

This report does not approve WebSocket combat expansion, projectile WS conversion, admin/observer separation, AI/worldState changes, broad renderer refactors, or alpha restart language.

## Current Decision

| Item | Decision |
| --- | --- |
| P0-9B | HOLD / provisional keep |
| P0-9D branch | C. render/update hot path profiling |
| Next recommendation | `P0-9E render hot path profiling` |
| Do not choose yet | localStorage/cache throttle, room fetch cadence trim, input latency triage |

## Probe

Tool:

`tools/check-p0-9d-frame-stall-triage.cjs`

Latest valid output:

`reports/playtests/p0-9d-frame-stall-20260523-101748/report.md`

Measurement:

- Headless Chrome two-player online production session.
- Room/session setup is excluded from measurement.
- Metrics reset after setup and warmup.
- The measured window is 12 seconds of steady movement-only play.
- Movement uses virtual input so it still passes through the actual player input/update path.

## Result Summary

| Page | Long frames >50ms | Frame max ms | localStorage writes/bytes | Detail fetches | Refresh p95/max ms | writeLocalRooms p95/max ms | renderer.draw p95/max ms | input latency p95/max ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| blue | 2 | 200 | 164 / 1,416,016 | 39 | 13.6 / 14.9 | 0.2 / 0.4 | 2.2 / 3.3 | 9.6 / 9.6 |
| red | 2 | 233.4 | 122 / 1,071,903 | 39 | 12.5 / 19.3 | 0.2 / 0.4 | 2.3 / 3.4 | 9.5 / 9.5 |

Long-frame correlation:

- All four long frames include `game.updateBattlefield` and `game.update`.
- Long `game.updateBattlefield` samples were about `186.8ms`, `206ms`, `207.4ms`, and `235.8ms`.
- Browser long-task entries also aligned with the same stalls.
- `renderer.draw` stayed low, with max `3.4ms`.
- `registry.writeLocalRooms` stayed low, with max `0.4ms`.
- `registry.refreshRemoteRooms` stayed below `19.3ms`.
- `registry.fetchRemoteRoomDetail` stayed below `10.1ms`.
- Virtual input latency stayed below `10.2ms`.

## Classification

Current classification:

`frame/update stall inside game.updateBattlefield`

Not selected:

- A. localStorage write burst: write count and bytes are high, but measured write time is too low and not the direct long-frame owner in this run.
- B. fetch/detail burst: fetch cadence is high, but refresh/detail latency is too low to explain 200ms+ frame stalls in this run.
- D. input latency: virtual input reflection stayed under about 10ms and did not match the reported stall scale.

## Next Recommendation

Proceed with `P0-9E render hot path profiling`.

Scope for P0-9E:

- Profile inside `game.updateBattlefield`, not broad renderer rewrite.
- Measure its internal sections during the same steady movement-only path.
- Compare current low-AI movement-only with AI paused/minimal where possible.
- Pick exactly one hottest function or loop as the next candidate.

Still forbidden:

- WebSocket combat/projectile expansion.
- Admin/observer split.
- AI/worldState architecture changes.
- Large renderer refactor.
- Alpha resume declaration.
