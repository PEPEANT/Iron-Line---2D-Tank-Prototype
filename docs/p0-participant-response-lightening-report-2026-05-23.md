# P0 Participant Response Lightening Report - 2026-05-23

One-line conclusion: P0-3A removed full room payloads from `/participants` responses, cutting participant POST responses to 97 bytes in the API replay while intentionally leaving participant persistence and room refresh unchanged.

## Scope

- Measurement type: API replay, not live gameplay.
- Changed only the `/participants` response shape and client ack handling.
- Kept participant publish cadence unchanged.
- Kept `persistRooms()` behavior unchanged for participants.
- Did not change `/api/rooms`, WebSocket transport, admin snapshots, AI simulation, or client interpolation.

## Code Change

- `tools/static-server.cjs`: `/participants` now returns `{ ok, roomId, participantId, updatedAt }` instead of `{ ok, participantId, room }`.
- `src/systems/room-registry.js`: `publishParticipant()` treats an `{ ok: true }` ack without `payload.room` as success.
- `tools/check-alpha-p0-stabilization.cjs`: participant state assertion now verifies through `/api/rooms` after the ack, because `/participants` no longer returns a full room.

## Before / After API Replay

| Scenario | Metric | P0-2B | P0-3A | Result |
| --- | --- | ---: | ---: | --- |
| participant_only_10s | POST /participants avg/max bytes | 3,211 / 3,213 | 97 / 97 | -97.0% avg |
| participant_only_10s | Persist write/rename | 110 / 110 | 110 / 110 | unchanged by design |
| small_arms_10s | POST /participants avg/max bytes | 39,112 / 74,666 | 97 / 97 | -99.8% avg |
| small_arms_10s | POST /combat avg/max bytes | 1,056 / 1,061 | 1,056 / 1,061 | unchanged |
| small_arms_10s | Persist write/rename | 110 / 110 | 110 / 110 | unchanged |
| projectile_launch_impact_10s | POST /participants avg/max bytes | 12,918 / 21,558 | 97 / 97 | -99.2% avg |
| admin_snapshot_observer_10s | POST /participants avg/max bytes | 23,693 / 42,683 | 97 / 97 | -99.6% avg |
| admin_snapshot_observer_10s | Persist write/rename | 112 / 112 | 112 / 112 | unchanged |

## P0-3A Replay Snapshot

| Scenario | GET /api/rooms | POST /participants | POST /combat | Participant avg/max bytes | Combat avg/max bytes | Persist write/rename | localStorage setItem | Final combat events |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| participant_only_10s | 66 | 110 | 0 | 97 / 97 | 0 / 0 | 110 / 110 | 176 | 0 |
| small_arms_10s | 66 | 110 | 76 | 97 / 97 | 1,056 / 1,061 | 110 / 110 | 252 | 76 |
| projectile_launch_impact_10s | 66 | 110 | 24 | 97 / 97 | 937 / 944 | 110 / 110 | 200 | 24 |
| admin_snapshot_observer_10s | 99 | 110 | 40 | 97 / 97 | 1,055 / 1,061 | 112 / 112 | 255 | 40 |

## Facts

- After P0-3A, `/participants` responses no longer return `players`, `combatEvents`, or `worldState`.
- Participant POST count remains 110 in each 10 second replay scenario.
- Participant persistence remains one write/rename pair per participant POST.
- `/combat` responses remain light from P0-2A.
- Combat-triggered persistence remains debounced from P0-2B.
- `/api/rooms` still returns room payloads that grow with accumulated combat history.

## Interpretation

P0-3A removes the second high-frequency full-room response path. The remaining large network payload is now the room refresh path, especially during small-arms combat where `GET /api/rooms` still averaged 41,263 bytes and reached 75,600 bytes in the replay. Persistence is also still high because participant state is still written every publish.

## Next Slice Recommendation

P0-3B should target `/api/rooms` summary/detail separation:

- Keep player publish cadence unchanged for the next slice.
- Keep participant persistence unchanged unless a later slice explicitly targets it.
- Make room list refresh return summary data that excludes full combat history and world state.
- Keep selected-room detail as a separate path or explicit detail request.
- Re-run `tools/check-p0-http-combat-load.cjs` and compare `GET /api/rooms` bytes and localStorage writes.

