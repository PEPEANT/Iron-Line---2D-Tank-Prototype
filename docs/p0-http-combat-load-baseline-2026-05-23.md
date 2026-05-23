# P0 HTTP Combat Load Baseline - 2026-05-23

One-line conclusion: P0-1 found that combat events inflate the shared room payload, so P0-2A should first remove the full room from `/combat` responses before changing persistence or transport.

## Scope

- Measurement type: API replay, not live gameplay.
- Tool: `tools/check-p0-http-combat-load.cjs`.
- Baseline commit before P0-2A: `d217126 fix: harden team identity combat checks`.
- Test room store: dedicated `IRONLINE_ROOMS_FILE`, not `.data/online-rooms.json`.
- Measured counters: HTTP count, response bytes, `fs.writeFileSync`, `fs.renameSync`, localStorage writes in the VM client replay, WebSocket message types where used.

## Baseline Results

| Scenario | GET /api/rooms | POST /participants | POST /combat | Participant avg/max bytes | Combat avg/max bytes | Persist write/rename | localStorage setItem | Final combat events |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| participant_only_10s | 66 | 110 | 0 | 3,211 / 3,213 | 0 / 0 | 110 / 110 | 286 | 0 |
| small_arms_10s | 66 | 110 | 77 | 39,996 / 76,573 | 41,281 / 77,504 | 187 / 187 | 440 | 77 |
| projectile_launch_impact_10s | 64 | 110 | 24 | 12,888 / 21,558 | 14,446 / 24,052 | 134 / 134 | 332 | 24 |
| admin_snapshot_observer_10s | 99 | 110 | 40 | 23,571 / 42,683 | 24,993 / 43,624 | 152 / 152 | 405 | 40 |

## Facts

- `src/systems/session-flow.js` publishes local player presence every 180 ms.
- `src/systems/room-registry.js` refreshes remote rooms every 320 ms.
- `tools/static-server.cjs` persisted and returned a full `room: exportClientRoom(room)` after each `/combat` request in the baseline.
- The baseline `/combat` response included players, combatEvents, and worldState.
- As combatEvents accumulated, `/participants` and `/api/rooms` responses also grew because they returned the same room payload.

## Interpretation

The largest first repair target is the `/combat` full room response. In the small-arms replay, 77 combat requests made combat responses reach 41 KB average / 77 KB max and also raised participant responses from roughly 3 KB to 40 KB average. Persistence is also high, but changing it in the same pass would blur the cause/effect of the first repair.

## Next Slice

P0-2A should change only `/combat` response shape:

- Remove the full room from `/combat` responses.
- Keep `persistRooms()` behavior unchanged.
- Do not add WebSocket combat transport.
- Do not change participant publish cadence or response shape.
- Re-run `tools/check-p0-http-combat-load.cjs` and compare response bytes.
