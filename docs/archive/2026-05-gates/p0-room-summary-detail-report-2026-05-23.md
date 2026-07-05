# P0 Room Summary / Detail Report - 2026-05-23

One-line conclusion: P0-3B split `/api/rooms` into summary-only room list refresh plus selected-room detail fetch, cutting list refresh responses to about 1 KB while showing that selected-room detail remains the next large payload.

## Scope

- Measurement type: API replay, not live gameplay.
- Changed `/api/rooms` GET to return room summaries.
- Added `/api/rooms/:id` GET for full selected-room detail.
- Changed the browser room registry to merge summaries and fetch only one selected-room detail.
- Did not change participant publish cadence, participant persistence, combat persistence, WebSocket transport, admin snapshots, AI simulation, or client interpolation.

## Code Change

- `tools/static-server.cjs`: added `exportRoomSummary()` and made `GET /api/rooms` omit `combatEvents`, `worldState`, `chat`, `commands`, and other full-room history fields.
- `tools/static-server.cjs`: added `GET /api/rooms/:id` for full room detail.
- `src/systems/room-registry.js`: `refreshRemoteRooms()` now reads summary list data, then fetches one selected room detail and merges it into local room state.
- `tools/check-p0-http-combat-load.cjs`: now counts `GET /api/rooms` and `GET /api/rooms/:id` separately.
- Online smoke scripts now fetch room detail through `/api/rooms/:id` where they need full state assertions.

## Before / After API Replay

| Scenario | Metric | P0-3A | P0-3B | Result |
| --- | --- | ---: | ---: | --- |
| participant_only_10s | GET /api/rooms avg/max bytes | 3,177 / 3,190 | 1,022 / 1,022 | summary lighter |
| participant_only_10s | GET /api/rooms/:id avg/max bytes | n/a | 3,187 / 3,187 | selected detail only |
| small_arms_10s | GET /api/rooms avg/max bytes | 41,263 / 75,600 | 1,024 / 1,024 | -97.5% avg |
| small_arms_10s | GET /api/rooms/:id avg/max bytes | n/a | 41,375 / 75,597 | still large |
| projectile_launch_impact_10s | GET /api/rooms avg/max bytes | 13,528 / 23,209 | 1,023 / 1,024 | -92.4% avg |
| projectile_launch_impact_10s | GET /api/rooms/:id avg/max bytes | n/a | 13,809 / 23,206 | still large |
| admin_snapshot_observer_10s | GET /api/rooms avg/max bytes | 24,752 / 42,660 | 1,296 / 1,296 | -94.8% avg |
| admin_snapshot_observer_10s | GET /api/rooms/:id avg/max bytes | n/a | 25,669 / 42,655 | still large |

## P0-3B Replay Snapshot

| Scenario | GET /api/rooms | GET /api/rooms/:id | POST /participants | POST /combat | Summary avg/max bytes | Detail avg/max bytes | Participant avg/max bytes | Combat avg/max bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| participant_only_10s | 64 | 64 | 110 | 0 | 1,022 / 1,022 | 3,187 / 3,187 | 97 / 97 | 0 / 0 |
| small_arms_10s | 64 | 66 | 110 | 76 | 1,024 / 1,024 | 41,375 / 75,597 | 97 / 97 | 1,056 / 1,061 |
| projectile_launch_impact_10s | 64 | 64 | 110 | 24 | 1,023 / 1,024 | 13,809 / 23,206 | 97 / 97 | 937 / 944 |
| admin_snapshot_observer_10s | 99 | 99 | 108 | 40 | 1,296 / 1,296 | 25,669 / 42,655 | 97 / 97 | 1,055 / 1,061 |

## Facts

- After P0-3B, `/api/rooms` returns summary rooms and does not include `combatEvents`, `worldState`, `chat`, or `commands`.
- The selected-room detail endpoint still returns full `players`, `combatEvents`, and `worldState`.
- The client still fetches selected-room detail during refresh so current-room state synchronization is preserved.
- `/participants` and `/combat` response sizes remain low from P0-3A and P0-2A.
- Persistence counts are unchanged by design.

## Interpretation

P0-3B removed full-room data from the global room list path. This matters when multiple rooms or admin lists exist, because one list refresh no longer pulls every room's combat history. However, one active selected-room detail payload is still large during combat, so P0-3B is not proof that live two-player stutter is solved.

## Next Slice Recommendation

P0-4 should be real two-browser verification before another architecture change:

- Measure normal two-player movement.
- Measure small-arms combat.
- Measure projectile launch/impact combat.
- Compare admin/observer OFF versus ON.
- Record `/api/rooms`, `/api/rooms/:id`, `/participants`, `/combat`, localStorage writes, FPS/frame time, and visible stutter.

If P0-4 still shows selected-room detail as the dominant stutter source, the next repair should be a separate active-room detail/cursor or WebSocket combat-state experiment.
