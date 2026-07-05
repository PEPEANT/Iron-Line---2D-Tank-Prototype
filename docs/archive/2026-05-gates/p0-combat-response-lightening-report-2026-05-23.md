# P0 Combat Response Lightening Report - 2026-05-23

One-line conclusion: P0-2A removed full room payloads from `/combat` responses, cutting combat response bytes by roughly 97% in API replay while intentionally leaving persistence and participant payloads unchanged.

## Scope

- Measurement type: API replay, not live gameplay.
- Changed only the `/combat` response shape and client ack handling.
- Did not change `persistRooms()`.
- Did not add WebSocket combat transport.
- Did not change participant publish cadence or participant response shape.

## Code Change

- `tools/static-server.cjs`: `/combat` now returns `{ ok, events, roomId, combatServerSeq, updatedAt }` instead of `{ ok, events, room }`.
- `src/systems/room-registry.js`: `publishCombatEvent()` treats an `{ ok: true }` ack without `payload.room` as success and does not schedule a fallback full-room publish.
- `tools/check-p0-http-combat-load.cjs`: records response shapes when an endpoint returns no full room.

## Before / After API Replay

| Scenario | Metric | Before | After | Result |
| --- | --- | ---: | ---: | --- |
| small_arms_10s | POST /combat avg bytes | 41,281 | 1,056 | -97.4% |
| small_arms_10s | POST /combat max bytes | 77,504 | 1,061 | -98.6% |
| small_arms_10s | Persist write/rename | 187 / 187 | 187 / 187 | unchanged by design |
| small_arms_10s | POST /participants avg bytes | 39,996 | 40,031 | unchanged |
| projectile_launch_impact_10s | POST /combat avg bytes | 14,446 | 937 | -93.5% |
| projectile_launch_impact_10s | POST /combat max bytes | 24,052 | 944 | -96.1% |
| admin_snapshot_observer_10s | POST /combat avg bytes | 24,993 | 1,055 | -95.8% |
| admin_snapshot_observer_10s | POST /combat max bytes | 43,624 | 1,061 | -97.6% |

## Facts

- After P0-2A, `/combat` responses no longer return `players`, `combatEvents`, or `worldState`.
- After P0-2A, `/participants` responses still return the full room and therefore still grow when `combatEvents` accumulate.
- `persistRooms()` still runs for every accepted `/combat` request.
- The replay still shows the same final combat event counts as before for the measured scenarios.

## Interpretation

The first repair isolated network response size from persistence. Combat POST payloads are now small enough that the next large numbers are the unchanged full-room participant responses, `/api/rooms` refresh responses, and per-combat persistence writes.

## Next Slice Recommendation

Run one more narrow repair before considering WebSocket transport:

1. If prioritizing network size: shrink `/participants` responses so they do not return full room combat history.
2. If prioritizing disk/server churn: split or defer `persistRooms()` for high-frequency `/combat`.

Do not combine those two in the same pass; keep cause/effect measurable.
