# 1st Alpha P0 Stabilization Completion / Retest Decision Report

Date: 2026-05-22

Final decision: PASS for a controlled 4-player alpha retest.

Important distinction: this is not a full alpha stability PASS. It means the known P0 blockers now have narrow fixes and smoke evidence, so the next correct step is a controlled 4-player retest with AI capped at `8vs8` or `15vs15`. If the same P0 symptoms reproduce there, return to P0 stabilization.

## 1. Fix Summary

### Fixed / mitigated P0 issues

- Large online stutter / frame drop risk
  - Reduced full-room publish pressure.
  - Added lightweight participant updates.
  - Reduced observer/admin snapshot frequency and payload size.
- Deleted room remains after admin delete
  - Added server-side deleted-room tombstones.
  - Blocked stale room recreation and writes into recently deleted rooms.
  - Cleared client pending publish timers during room deletion.
- Admin observer game start / progress not visible
  - Reconciled selected room phase with admin match status.
  - Treats selected room `phase === "playing"` as active progress even if observer snapshot lags.

### Fixed / mitigated P1 issues

- Capture-point / grenade abnormal behavior
  - AI grenade decisions no longer use objective-sensor reports as valid non-visible grenade targets.
  - Non-visible grenade throws require fresh, high-confidence scout / recon / drone contact.
  - Cached grenade targets are revalidated immediately before throw.

### UI readability regression

- `ROLE / CMD / HP / FEED` readability strip is hidden in normal play.
- It only appears through explicit debug flags:
  - `?readabilityHud=1`
  - `?debugReadabilityHud=1`
  - `localStorage.ironLine.showReadabilityHud = "1"`

### Main modified files

- `server/static-room-admin.js`
- `tools/static-server.cjs`
- `tools/check-alpha-p0-stabilization.cjs`
- `src/systems/room-registry.js`
- `src/systems/session-flow.js`
- `src/systems/observer-bridge.js`
- `src/systems/admin-ops.js`
- `src/systems/hud-admin-ui.js`
- `src/systems/hud-readability.js`
- `src/ai/infantry-weapon-decision.js`
- `tools/check-ui-readability.cjs`
- `docs/alpha-p0-stabilization-interim-diagnosis-2026-05-22.md`
- `docs/alpha-p0-stabilization-correction-pass-2026-05-22.md`

### Remaining blockers

- No known automated P0 blocker remains.
- Live 4-player verification has not been run in this pass.
- P1 capture-point / grenade / AI abnormal behavior needs scenario retest.

## 2. P0 Stutter / Frame Drop Result

### Automated / local evidence

| Scenario | Result | Notes |
| --- | --- | --- |
| Offline perf / AI scale smoke | PASS | Prior `check-ai-scale-performance` passed staged AI profiles. |
| Online 2-client smoke | PASS | `npm run check:online` passed room, command, combat, websocket basics. |
| Online combat client flow | PASS | Shot / hit / death / respawn ordering passed. |
| Admin / observer payload review | MITIGATED | Snapshot frequency and payload were reduced. |

### Required live retest

The following were not honestly completed in this pass and must be checked in the controlled alpha retest:

- Online 1 player versus 2 players versus 4 players.
- AI none versus `8vs8` versus `15vs15`.
- Admin / observer OFF versus ON.
- Real visible FPS drops / stutter while players move and shoot.
- Network payload and admin observer behavior under live room usage.

Current stutter decision:

- PASS for controlled retest.
- Not proven fully closed until 4-player admin ON/OFF comparison is clean.

## 3. P0 Deleted Room Persistence Result

| Check | Result | Evidence |
| --- | --- | --- |
| RoomRegistry local deletion | PASS | Client clears selected room / pending publish state. |
| REST room list deletion | PASS | `check-alpha-p0-stabilization` confirms deleted room is absent. |
| Stale recreate blocked | PASS | Server returns `room_deleted_recently`. |
| Deleted combat write blocked | PASS | Server rejects combat writes to deleted room. |
| Admin UI stale visual removal | NEEDS LIVE RETEST | Smoke verifies server state, not visual admin list behavior. |
| Observer / subscription cleanup | NEEDS LIVE RETEST | Requires admin panel / observer session retest. |

Current deleted-room decision:

- Server and client lifecycle smoke PASS.
- Admin visual stale-cache behavior must be watched in the 4-player retest.

## 4. P0 Admin Observer Game Progress Result

| Check | Result | Evidence |
| --- | --- | --- |
| `room.phase` fallback | PASS | Admin ops now reconciles selected room phase into match status. |
| `match.started` fallback | PASS | Selected `playing` room forces active match state. |
| Admin HUD render condition | PASS | Admin observer status reads selected room / match phase. |
| WebSocket `gameStarted` event | NOT COVERED | No new websocket game-start event was added in this narrow pass. |
| World-host snapshot path | PARTIAL | Observer snapshot was slimmed; live admin panel retest still required. |

Current admin observer decision:

- PASS for controlled retest.
- If admin panel still shows no progress during retest, next fix should focus on websocket/admin snapshot delivery rather than AI or combat.

## 5. P1 Capture Point / Grenade / AI Abnormal Result

| Check | Result | Evidence |
| --- | --- | --- |
| Ghost enemy | NOT PROVEN | Needs live scenario capture. |
| Team classification | NOT PROVEN | Needs live scenario capture. |
| Grenade target from objective sensor | MITIGATED | Objective-sensor reports are no longer valid hidden grenade targets. |
| No-LOS grenade throw | MITIGATED | Hidden grenade targets require fresh high-confidence scout / recon / drone reports. |
| Cached stale grenade target | MITIGATED | Grenade target is revalidated before throw. |
| CommandState / Tactical Map / BotCommander overlap | NOT PROVEN | Needs live scenario capture if abnormal behavior returns. |

Current P1 decision:

- PARTIAL.
- It does not block the controlled P0 retest, but if it reproduces, collect target/report/debug state and run a focused P1 AI targeting pass.

## 6. Test Results

Passed:

- `node --check src/ai/infantry-weapon-decision.js`
- `node --check src/systems/hud-readability.js`
- `node --check tools/check-ui-readability.cjs`
- `node --check tools/check-alpha-p0-stabilization.cjs`
- `node --check tools/static-server.cjs`
- `node --check server/static-room-admin.js`
- `npm run check`
- `npm run check:online`
- `node tools/check-alpha-p0-stabilization.cjs`
- `node tools/check-online-combat-server-authority.cjs`
- `node tools/check-online-combat-client-flow.cjs`
- `node tools/check-ui-readability.cjs`
- `git diff --check`

Browser check:

- Normal play URL loaded with no console errors.
- Debug readability strip is hidden on normal URL.

## 7. Retest Rules

Use this matrix before reopening broader alpha:

1. Online 1 player + no AI, admin OFF
2. Online 2 players + no AI, admin OFF
3. Online 2 players + `8vs8` AI, admin OFF
4. Online 2 players + `8vs8` AI, admin ON
5. Online 4 players + `8vs8` AI, admin OFF
6. Online 4 players + `8vs8` AI, admin ON
7. Optional: Online 4 players + `15vs15` AI, admin ON

Restrictions:

- Do not enable 50vs50.
- Do not run this as public alpha.
- Keep it as a controlled 4-player alpha retest.
- Record room id, browser / device, admin ON/OFF, AI count, visible stutter, console errors, and server logs.

## 8. Final Judgment

PASS: 4-player controlled alpha retest is allowed.

Reason:

- No automated P0 blocker remains.
- Room deletion lifecycle has smoke evidence.
- Admin observer progress fallback has code-level fix.
- Online combat and command smoke still pass.
- The major remaining unknown is live 4-player behavior, which is exactly what the next controlled retest must verify.

If P0 symptoms reproduce:

- Return to P0 stabilization.

If only P1 grenade / AI behavior reproduces:

- Continue with a focused P1 AI targeting / grenade correction pass.
