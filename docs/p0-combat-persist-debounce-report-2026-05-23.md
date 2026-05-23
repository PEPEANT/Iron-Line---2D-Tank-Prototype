# P0 Combat Persist Debounce Report - 2026-05-23

One-line conclusion: P0-2B kept the light `/combat` response from P0-2A and stopped accepted combat POSTs from adding one file write/rename each in the API replay.

## Scope

- Measurement type: API replay, not live gameplay.
- Changed only combat-triggered persistence timing.
- Kept the P0-2A `/combat` response shape.
- Did not change `/participants`, `/api/rooms`, WebSocket transport, admin snapshots, AI simulation, or client interpolation.

## Code Change

- `tools/static-server.cjs`: `/combat` now calls `scheduleCombatPersist()` instead of immediate `persistRooms()`.
- `tools/static-server.cjs`: combat persistence is debounced for 1200 ms.
- `tools/static-server.cjs`: an immediate structural persist clears pending combat persistence, so participant/room writes still flush current exported room state.

## Before / After API Replay

| Scenario | Metric | P0-2A | P0-2B | Result |
| --- | --- | ---: | ---: | --- |
| participant_only_10s | Persist write/rename | 110 / 110 | 110 / 110 | unchanged |
| small_arms_10s | POST /combat count | 76-77 | 76 | comparable |
| small_arms_10s | POST /combat avg/max bytes | 1,056 / 1,061 | 1,056 / 1,061 | still low |
| small_arms_10s | Persist write/rename | 187 / 187 | 110 / 110 | combat writes removed from replay |
| small_arms_10s | POST /participants avg/max bytes | 40,031 / 74,666 | 39,112 / 74,666 | still large |
| projectile_launch_impact_10s | POST /combat avg/max bytes | 937 / 944 | 937 / 944 | still low |
| projectile_launch_impact_10s | Persist write/rename | 134 / 134 | 110 / 110 | combat writes removed from replay |
| admin_snapshot_observer_10s | POST /combat avg/max bytes | 1,055 / 1,061 | 1,055 / 1,061 | still low |
| admin_snapshot_observer_10s | Persist write/rename | 152 / 152 | 112 / 112 | combat writes removed; room posts remain |

## P0-2B Replay Snapshot

| Scenario | GET /api/rooms | POST /participants | POST /combat | Participant avg/max bytes | Combat avg/max bytes | Persist write/rename | localStorage setItem | Final combat events |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| participant_only_10s | 64 | 110 | 0 | 3,211 / 3,213 | 0 / 0 | 110 / 110 | 284 | 0 |
| small_arms_10s | 64 | 110 | 76 | 39,112 / 74,666 | 1,056 / 1,061 | 110 / 110 | 360 | 76 |
| projectile_launch_impact_10s | 64 | 110 | 24 | 12,918 / 21,558 | 937 / 944 | 110 / 110 | 308 | 24 |
| admin_snapshot_observer_10s | 96 | 110 | 40 | 23,693 / 42,683 | 1,055 / 1,061 | 112 / 112 | 362 | 40 |

## Facts

- After P0-2B, `/combat` still does not return `players`, `combatEvents`, or `worldState`.
- In the small-arms replay, persistence dropped from 187 write/rename pairs to 110 write/rename pairs.
- The remaining write/rename count matches participant writes in the non-admin scenarios.
- `/participants` still returns a full room including `players`, `combatEvents`, and `worldState`.
- `/api/rooms` responses still grow as room combat history grows.
- Admin/observer replay still adds `POST /api/rooms` writes and WebSocket admin snapshot traffic when admin mode is active.

## Interpretation

P0-2B isolated disk/server churn from the high-frequency combat endpoint. The largest remaining measured costs are full-room participant responses and room-refresh responses carrying accumulated combat history. This is still not a live two-browser gameplay result, so the API replay is a reduction proof, not a playability proof.

## Next Slice Recommendation

P0-3A should target `/participants` response lightening first:

- Keep participant POST frequency unchanged for the next slice.
- Return a compact ack or minimal state instead of full `room` from `/participants`.
- Re-run `tools/check-p0-http-combat-load.cjs` and compare participant response bytes, `/api/rooms` bytes, persistence counts, and localStorage writes.

