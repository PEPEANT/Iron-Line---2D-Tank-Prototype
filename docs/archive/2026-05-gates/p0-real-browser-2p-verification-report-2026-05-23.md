# P0 Real Browser 2P Verification Report - 2026-05-23

One-line conclusion: P0-4 headless Chrome browser-runtime verification did not show frame-time collapse or console errors in 10 second two-player scenarios, but it confirmed that selected-room detail and admin full-room POST remain the largest live browser payloads.

## Scope

- Measurement type: headless Chrome browser runtime, not manual human play.
- Tool: `tools/check-p0-real-browser-2p.cjs`.
- Browser setup: two separate Chrome profiles for blue/red players, plus one separate admin profile for the admin/observer scenario.
- The pages load real `index.html`, real `src/systems/room-registry.js`, and the local static server.
- The script drives RoomRegistry actions from inside each browser page rather than using keyboard/mouse manual gameplay.

## Plan

1. Start an isolated static server with a unique room store.
2. Open blue and red Chrome profiles on separate origins so localStorage is separated.
3. Measure movement-only, small-arms combat, projectile combat, and small-arms with admin/observer enabled.
4. Capture network request counts, encoded response bytes, requestAnimationFrame frame times, localStorage writes, WebSocket message types, and browser/page errors.

## Results

| Scenario | Pages | GET /api/rooms count / avg bytes | GET /api/rooms/:id count / avg bytes | POST /participants count / avg bytes | POST /combat count / avg bytes | POST /api/rooms count / avg bytes | Avg / max frame ms | Long frames >50ms | Errors | Final combat events |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| movement_only_10s | 2 | 67 / 1,385 | 68 / 3,422 | 220 / 442 | 0 / 0 | 0 / 0 | 17.0 / 33.4 | 0 | 0 | 0 |
| small_arms_10s | 2 | 67 / 1,387 | 67 / 43,130 | 220 / 442 | 80 / 1,372 | 0 / 0 | 16.8 / 33.4 | 0 | 0 | 80 |
| projectile_10s | 2 | 68 / 1,386 | 68 / 12,369 | 220 / 442 | 22 / 1,282 | 0 / 0 | 16.7 / 33.4 | 0 | 0 | 22 |
| small_arms_admin_observer_on_10s | 3 | 102 / 1,655 | 102 / 43,586 | 220 / 442 | 80 / 1,372 | 2 / 22,566 | 16.8 / 33.4 | 0 | 0 | 80 |

## Facts

- Frame-time proxy stayed near 60 FPS in headless Chrome for all four scenarios.
- No browser/page errors were captured in this automated run.
- `/api/rooms` summary responses stayed small after P0-3B.
- `/participants` and `/combat` responses stayed small enough compared with selected-room detail.
- `/api/rooms/:id` selected-room detail grows with combat history and remains large during small-arms combat.
- Admin/observer ON added `POST /api/rooms` full-room writes/responses and WebSocket `admin_snapshot` traffic.

## Interpretation

This pass is a stronger signal than the earlier API replay because it uses real Chrome pages, separate browser profiles, real page localStorage, real requestAnimationFrame timing, and the actual browser fetch/WebSocket stack. It is still not a manual human playtest, so "felt stutter" is represented by frame-time and error proxies rather than a human observation.

The measured bottleneck moved away from `/combat`, `/participants`, and global `/api/rooms`. The largest remaining browser payload is active selected-room detail. Admin/observer mode also still performs full-room POSTs and detail reads.

## Next Slice Recommendation

P0-4B should verify or reduce active-room detail churn before WebSocket migration:

- Add a selected-room detail cursor or compact active-room snapshot experiment.
- Keep global room summary, participant ack, combat ack, and combat persist behavior unchanged.
- Re-run this browser script and compare `/api/rooms/:id` count/bytes, localStorage writes, and frame-time proxy.

If the active-room detail experiment does not improve real browser behavior, then move to a minimal WebSocket player_state or combat_state experiment.
