# 1st Alpha P0 Stabilization Correction Pass

Date: 2026-05-22

Status: PASS for a narrow alpha retest. This pass only addressed issues directly identified in the interim diagnosis report. It did not add new features or start larger server authority, AI V2, BotCommander, UGC, city, or 50vs50 work.

## 1. Scope

This pass targeted:

- P0 stutter / frame drop risk from excessive online room / observer updates.
- P0 deleted room reappearing through stale client publishes.
- P0 admin observer game-start / progress visibility.
- P1 capture-point / grenade / AI abnormal behavior risk from low-confidence reported contacts.
- UI readability regression from the QA-only `ROLE / CMD / HP / FEED` strip appearing in normal play.

## 2. Fix Results

### P0 stutter / frame drop risk

Result: mitigated, still requires live 4-player retest.

Changes:

- Frequent presence / movement style updates use the lightweight participant endpoint instead of full room snapshots.
- Remote room refresh cadence was tightened for smoother remote presence.
- Observer snapshots were throttled and slimmed:
  - no full AI unit detail in ordinary observer payload
  - capped squads, vehicles, commands, and AI events
  - slower publish / read interval for admin observer data

Evidence:

- `node tools/check-alpha-p0-stabilization.cjs` PASS
- `node tools/check-online-combat-client-flow.cjs` PASS
- `node tools/check-online-combat-server-authority.cjs` PASS
- `npm run check:online` PASS

Remaining:

- Actual 4-player retest must compare admin/observer ON versus OFF.

### P0 deleted room remains

Result: smoke PASS.

Changes:

- Server-side deleted-room tombstones block stale room recreation.
- Deleted rooms reject:
  - room recreation
  - participant updates
  - command writes
  - combat writes
- Client clears pending publish timers when deleting a room and skips publishing deleted room ids.

Evidence:

- `node tools/check-alpha-p0-stabilization.cjs` PASS:
  - participant endpoint
  - delete tombstone
  - stale recreate blocked
  - deleted combat write blocked

Remaining:

- Live admin UI retest must confirm the room disappears visually from the room list and does not return.

### P0 admin observer game-start / progress visibility

Result: code fixed, live UI retest still required.

Changes:

- Admin ops reconciles selected room phase with the match snapshot.
- Selected room `phase === "playing"` forces observer/admin status to active.
- Admin HUD status now treats selected room phase and match phase consistently.

Evidence:

- `npm run check` PASS
- Browser page load showed no console errors.

Remaining:

- Live admin observer retest must confirm match start / progress appears in the observer panel after room start.

### P1 capture-point / grenade / AI abnormal behavior

Result: narrow guard added, still requires scenario retest.

Changes:

- AI grenade decisions no longer use objective-sensor reports as valid non-visible grenade targets.
- Non-visible grenade throws now require fresh, high-confidence scout / recon / drone contact reports.
- Cached grenade targets are revalidated before throw, so expired or low-confidence reports do not trigger a throw.

Expected effect:

- Capture-point sensor contacts can still inform the map/minimap, but should not cause AI to throw grenades at enemies it has not actually seen or received high-confidence scout/drone reports about.

Remaining:

- If strange grenade behavior reproduces, capture:
  - thrower team / unit
  - objective name
  - grenade target point
  - report `sourceType`
  - `commandState`
  - whether there was line of sight

### QA readability strip in normal play

Result: fixed.

Changes:

- `ROLE / CMD / HP / FEED` strip is hidden by default.
- It only appears with:
  - `?readabilityHud=1`
  - `?debugReadabilityHud=1`
  - `localStorage.ironLine.showReadabilityHud = "1"`
- UI readability smoke now explicitly opens `?readabilityHud=1`.

Evidence:

- `node tools/check-ui-readability.cjs` PASS
- Browser normal URL check confirmed the strip is hidden.

## 3. Validation

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

## 4. Pass / Fail Table

| Issue | Result | Notes |
| --- | --- | --- |
| P0 stutter / frame drops | PARTIAL | Network / observer payload reduced; requires 4-player retest. |
| P0 room deletion persistence | PASS | Tombstone smoke blocks stale recreation. |
| P0 admin observer progress display | PARTIAL | Code fixed; requires live admin panel retest. |
| P1 objective grenade / AI abnormal behavior | PARTIAL | Low-confidence grenade report guard added; scenario retest required. |
| Debug readability strip visible | PASS | Hidden by default; debug flag only. |

## 5. Next Retest Matrix

Use a narrow retest before reopening alpha:

1. Online 1 player + no AI, admin OFF
2. Online 2 players + no AI, admin OFF
3. Online 2 players + `8vs8` AI, admin OFF
4. Online 2 players + `8vs8` AI, admin ON
5. Online 4 players + `8vs8` AI, admin OFF
6. Online 4 players + `8vs8` AI, admin ON
7. Optional: Online 4 players + `15vs15` AI, admin ON

Do not enable 50vs50 in this retest.

## 6. Final Decision

PASS for a narrow 4-player alpha retest.

Not a full alpha PASS. If the three P0 symptoms reproduce during the retest, return to P0 stabilization. If P0 holds and only the grenade / capture-point behavior remains, move that into a focused P1 AI targeting / grenade correction pass.
