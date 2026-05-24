# P0-10E Current HEAD Online Bottleneck Reclassification Gate

Conclusion: choose `room refresh/localStorage` as the next single bottleneck lane. Current HEAD no longer points first at worldState apply snap, tactical-map/updateBattlefield long frames, player combat confirm, or other-player position relay.

## Current Baseline

- Code baseline: `fc0c354 docs: record p0 worldstate interpolation pass`
- `HEAD == origin/main` before this docs-only gate.
- This gate makes no gameplay, networking, AI, admin/observer, worldState cadence, or 4-player alpha change.

## Verification

- `npm run check`: pass.
- `npm run check:online`: pass.
- `git diff --check`: pass.
- `node tools/check-p0-10b-worldstate-cadence.cjs`
  - Report: `reports/playtests/p0-10b-worldstate-20260524-054028/report.md`
  - Decision: no major worldState cadence/snap issue reproduced.
- `node tools/check-p0-9d-frame-stall-triage.cjs`
  - Report: `reports/playtests/p0-9d-frame-stall-20260524-054056/report.md`
  - Decision: no steady movement-only frame stall reproduced.
- `node tools/check-p0-9e-update-battlefield-hot-path.cjs`
  - Report: `reports/playtests/p0-9e-hotpath-20260524-054117/report.md`
  - Decision: no updateBattlefield long frame reproduced.
- `node tools/check-p0-real-browser-2p.cjs`
  - Measurement: headless Chrome browser runtime, not manual human play.
  - Scenarios: movement-only, small arms, projectile, small arms with admin/observer ON.

## Closed Or Lower-Priority Lanes

| Lane | Current gate judgment | Evidence |
| --- | --- | --- |
| Other-player position | Lower priority | `npm run check:online` still reports WS `player_state=relay`; previous P0-9C confirmed render path, and current re-run did not show frame collapse. |
| Player combat | Lower priority | Real-browser small arms produced 79 combat events with 0 errors and 0 long frames. |
| Combat confirm | Lower priority | `check:online` passed combat flow; real-browser small arms/projectile scenarios had 0 errors. |
| AI/worldState | Lower priority for next code slice | P0-10B re-run: publish gap max `475ms`, apply gap max `34.8ms`, unit applied snap `4.8px`, vehicle applied snap `15.9px`. |
| TacticalMap/updateBattlefield | Closed for current gate | P0-9D long frames `0/0`; P0-9E found no updateBattlefield long frame. |
| Observer/admin | Comparison risk, not base lane | Admin ON adds payload pressure, but admin OFF already shows room refresh/localStorage cost. Do not split admin yet. |
| Room list/session stale | No fresh automated reproduction | No current probe errors point first at stale room/session state. Keep as manual observation item. |

## Remaining Strong Signal

The strongest remaining automated signal is `room refresh/localStorage`.

Current probes:

- P0-9D movement-only:
  - Detail fetches: `79`
  - localStorage writes/bytes: `271 / 2,416,792`
  - Long frames: `0`
- P0-9E normal low-AI:
  - Top section: `registry.refreshRemoteRooms`
  - Max: `118ms` blue, `110.6ms` red
  - Long frames: `0`
- Real-browser movement-only:
  - `/api/rooms/:id`: `41` requests, avg `3,487` bytes
  - localStorage writes: `32`
  - Long frames: `0`
- Real-browser small arms:
  - `/api/rooms/:id`: `39` requests, avg `7,228` bytes, max `9,031` bytes
  - localStorage writes: `109`
  - localStorage bytes: about `3.2MB`
  - Long frames: `0`
- Real-browser projectile:
  - `/api/rooms/:id` max: `22,174` bytes
  - localStorage writes: `52`
  - Long frames: `0`
- Real-browser admin/observer ON comparison:
  - `/api/rooms/:id`: `58` requests, avg `8,698` bytes
  - admin `POST /api/rooms`: `3`, avg `40,960` bytes, max `78,676` bytes
  - localStorage writes: `136`
  - Long frames: `0`

## Automated Versus Manual Risk

Automated frame proxies are clean: no >50ms long-frame collapse reproduced in the current gate. The remaining risk is that human-visible stutter can still correlate with room refresh/detail merge/localStorage bursts even when the headless frame proxy stays under the long-frame threshold.

## Next Single Lane

Proceed to `P0-10F room refresh/localStorage cadence and write guard triage`.

Narrow goal: identify and reduce active-room detail refresh, detail merge, emit, and localStorage write pressure during admin-OFF 2P movement/small-arms first. Use admin/observer ON only as comparison. Do not start admin split, WebSocket combat/worldState conversion, server authority, AI behavior changes, worldState cadence cuts, or 4-player alpha.
