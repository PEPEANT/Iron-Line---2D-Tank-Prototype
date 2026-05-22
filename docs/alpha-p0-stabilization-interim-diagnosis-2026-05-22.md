# 1st Alpha P0 Stabilization Interim Diagnosis Report

Date: 2026-05-22

Status: ON TRACK for a narrow retest. This is not a full alpha PASS. The P0 fixes have smoke evidence, but the reported 4-player stutter and admin observer symptoms still need one live retest with the same alpha setup.

## 1. Reproduction Environment

- Test URL: `http://localhost:4173/index.html`
- Admin URL: `http://localhost:4173/admin.html`
- Current verified build: `1df712d574a0` plus uncommitted P0 stabilization changes.
- Local browser check: in-app browser loaded `http://localhost:4173/index.html` with no console errors.
- Automated checks used:
  - `npm run check`
  - `npm run check:online`
  - `node tools/check-online-smoke.cjs`
  - `node tools/check-online-combat-server-authority.cjs`
  - `node tools/check-online-combat-client-flow.cjs`
  - `node tools/check-ui-readability.cjs`
  - `node tools/check-ai-scale-performance.cjs`
  - `node tools/check-alpha-p0-stabilization.cjs`

## 2. P0 Stutter / Frame Drop Diagnosis

Observed alpha symptom:

- Player-to-player movement looked heavily choppy.
- Large frame drops were visible during online play.

Likely contributing causes found:

- Frequent full-room publishes were used for player presence / movement style updates.
- Remote room polling interval was coarse enough to make player movement look choppy.
- Observer snapshots were large and frequent, including detailed AI payloads that are not needed for every admin refresh.

Applied narrow fixes:

- Added lightweight participant update endpoint: `POST /api/rooms/:roomId/participants`.
- Changed frequent player presence updates to use participant updates instead of full room publishes.
- Reduced stale full-room publish risk by skipping deleted rooms during scheduled publish.
- Increased live presence cadence from `330ms` to `180ms`.
- Increased remote refresh cadence from `650ms` to `320ms`.
- Reduced observer snapshot pressure:
  - publish interval `0.25s` to `0.75s`
  - read interval `0.25s` to `0.5s`
  - capped commands/events/squads/vehicles in observer payload
  - omitted full `ai.units` detail in observer snapshot

Evidence:

- `node tools/check-ai-scale-performance.cjs` passed for staged AI profiles.
- `node tools/check-alpha-p0-stabilization.cjs` passed participant endpoint and deletion tombstone coverage.
- Browser load check showed no page-level console errors.

Classification:

- Primary: `network load`, `observer/admin snapshot`
- Secondary: `server confirm side effect` not reproduced in smoke

Remaining retest:

- Repeat 4-player alpha with AI `8vs8` or `15vs15`.
- Compare admin/observer ON versus OFF.
- Record FPS / visible stutter / room list refresh during the test.

## 3. P0 Room Deletion / Stale Room Diagnosis

Observed alpha symptom:

- Admin deleted a room, but the room still appeared afterward.

Likely root cause found:

- A deleted room could be recreated by a stale client publish because `POST /api/rooms` accepted client room snapshots even after deletion.
- Client-side pending room publish timers could still fire after deletion.

Applied narrow fixes:

- Added server-side deleted-room tombstones.
- `POST /api/rooms` now rejects recently deleted room ids with `409 room_deleted_recently`.
- Command and combat writes into deleted rooms now return deleted-room errors.
- Client `deleteRemoteRoom` clears pending publish timers and pending publish state.
- `publishRoom`, `schedulePublishRoom`, `pushCommand`, and `publishCombatEvent` skip deleted room ids.

Evidence:

- `node tools/check-alpha-p0-stabilization.cjs` passed:
  - participant update endpoint
  - room deletion tombstone
  - stale recreate blocked
  - combat write into deleted room blocked

Classification:

- Primary: `room lifecycle bug`
- Secondary: `stale room cache`

Current decision:

- Smoke PASS.
- Needs live admin UI retest to confirm visual room list removal and observer subscription cleanup.

## 4. P0 Admin Observer Game Start / Progress Diagnosis

Observed alpha symptom:

- Admin observer panel did not show the game start / game progress state.

Likely contributing causes found:

- Admin UI status could depend on observer snapshot state while selected room phase already had the correct state.
- If observer snapshot lagged behind, the selected room could look like it was still in setup / waiting.

Applied narrow fixes:

- Admin ops now reconciles selected registry room phase with observer match snapshot.
- Selected room phase `playing` forces admin match snapshot to started.
- Admin HUD and observer status now treat selected room `phase === "playing"` as an active match even when observer snapshot is not yet live.

Evidence:

- Static syntax checks passed.
- UI page loads without console errors.

Classification:

- Primary: `observer/admin snapshot`
- Secondary: `stale room cache`

Current decision:

- Code-level fix applied.
- Live admin observer retest required because this symptom is UI-state and subscription dependent.

## 5. P1 Capture Point / Grenade / AI Abnormal Behavior Diagnosis

Observed alpha symptom:

- Strange enemies appeared around capture points.
- Grenades were thrown from capture point areas.
- AI behavior looked abnormal or tangled.

Current diagnosis:

- Not closed in this P0 pass.
- Possible causes remain:
  - `AI targeting bug`
  - `grenade targeting bug`
  - `server confirm side effect`
  - `BotCommander / Tactical Map order overlap`
  - ghost entity or wrong team classification around objective logic

Current decision:

- Record as P1 follow-up, not fixed.
- If it reproduces during the next narrow retest, capture:
  - objective id / point name
  - team of thrower and victim
  - grenade target position
  - unit `commandState`
  - `commandReason`
  - whether the unit had line of sight

## 6. Extra UI Finding

Observed after P0 fixes:

- The `ROLE / CMD / HP / FEED` readability strip appeared in normal play and hurt readability.

Applied narrow fix:

- Readability strip is now hidden in normal play.
- It only appears with explicit debug flags:
  - `?readabilityHud=1`
  - `?debugReadabilityHud=1`
  - `localStorage.ironLine.showReadabilityHud = "1"`
- `node tools/check-ui-readability.cjs` now uses `?readabilityHud=1` so the QA tool still verifies the strip.

Classification:

- `UI readability regression`

Current decision:

- Fixed for normal alpha play.

## 7. Issue Classification Summary

| Issue | Classification | Current Result |
| --- | --- | --- |
| Large online stutter / frame drops | network load, observer/admin snapshot | Mitigated, needs 4-player retest |
| Deleted room remains | room lifecycle bug, stale room cache | Smoke PASS |
| Admin observer does not show start/progress | observer/admin snapshot, stale room cache | Code fixed, needs live retest |
| Capture point grenade / strange AI | AI targeting bug, grenade targeting bug, unknown | P1 follow-up |
| Debug readability strip visible in normal play | UI readability regression | Fixed |

## 8. Retest Matrix

Run the next retest in this order:

1. Online 1 player + no AI, admin OFF
2. Online 2 players + no AI, admin OFF
3. Online 2 players + `8vs8` AI, admin OFF
4. Online 2 players + `8vs8` AI, admin ON
5. Online 4 players + `8vs8` AI, admin OFF
6. Online 4 players + `8vs8` AI, admin ON
7. Optional: Online 4 players + `15vs15` AI, admin ON

Do not enable 50vs50 during this retest.

## 9. Final Interim Decision

ON TRACK for a narrow alpha retest.

Do not resume broad alpha testing yet. First run one focused 4-player retest with AI capped at `8vs8` or `15vs15`, compare admin ON/OFF, and record whether the three P0 symptoms reproduce.
