# P0 Limited Manual Playtest Prep - 2026-05-23

Conclusion: P0-8 prepares the next human-run verification package only. It does not reopen limited alpha, does not approve a four-player retest, and does not change game/server behavior.

## Current Gate

Limited alpha remains HOLD.

P0-8 is a preparation step for controlled manual evidence after the automated P0 stabilization work:

- P0 HTTP combat/participant/room bottleneck first-pass reductions are complete.
- P0 active-room detail cursor is implemented and pushed.
- P0 two-player headless browser probes pass.
- P0 team/damage full-path validation passes.
- P0 AI playtest harness exists for repeatable automated movement and small-arms checks.

The next useful evidence is human feel and operator procedure, not another speculative architecture change.

## Scope

Allowed in this prep:

- Define manual two-player test procedure.
- Define admin/observer OFF versus ON procedure.
- Define blue/red team cross-check procedure.
- Define recording templates and bug capture checklist.
- Define result-based next-branch decision table.
- Include existing automated preflight commands.

Out of scope:

- Four-player alpha retest.
- Alpha restart announcement.
- WebSocket combat channel implementation.
- Admin/observer separation implementation.
- AI/worldState ownership changes.
- Gameplay, protocol, server, or fetch-interval changes.

## Preflight Commands

Run these before asking humans to test:

```powershell
node tools/check-p0-ai-playtest-harness.cjs
node tools/check-p0-real-browser-2p.cjs
node tools/check-p0-team-damage-full-path.cjs
npm run check
git status --short --branch
```

Expected preflight:

- All scripts exit `0`.
- `eventSyncOk` remains `true` in the AI playtest harness.
- No same-team damage suspicion is reported.
- Worktree is clean or only contains intentional test notes outside git.

If preflight fails, stop. Do not start manual playtest.

## Test Setup

Recommended first manual setup:

| Item | Recommendation |
| --- | --- |
| Testers | 2 humans only. |
| Roles | One blue player and one red player. Swap teams after the first pass. |
| Browser mix | Chrome stable on both machines first. Optional Edge/Chrome mix after Chrome/Chrome passes. |
| Network | Same LAN or the intended online test route, but record which one was used. |
| Admin/observer | OFF for the first pass. ON only after admin-OFF scenarios pass. |
| Recording | One shared result sheet or copied markdown template per run. |

Do not run a four-player test in P0-8. A two-player pass can only feed a later limited 4P readiness decision.

## Browser Capture Setup

For each tester:

1. Open DevTools.
2. Use the Network tab with Preserve log enabled.
3. Keep filters ready for:
   - `/api/rooms`
   - `/api/rooms/:id`
   - `/participants`
   - `/combat`
   - WebSocket frames, if present
4. Keep Console visible or export console logs after the run.
5. Record browser name/version, OS, and whether hardware acceleration is enabled.

Capture on problem:

- Screenshot or short screen recording.
- Console errors/warnings.
- Network HAR or copied request summary.
- Approximate timestamp and scenario step.
- Room id.
- Both tester teams and player names.
- Whether admin/observer was OFF or ON.
- Whether AI was enabled and at what count/profile.

## Manual Test Matrix

Run in order. Stop at the first severe failure and record it.

| Order | Scenario | Admin/observer | AI load | Expected result |
| ---: | --- | --- | --- | --- |
| 1 | Two players join same room and idle for 30 seconds | OFF | Minimal/default | Both see the same room and stable presence. |
| 2 | Two-player movement only for 60 seconds | OFF | Minimal/default | Remote position updates are usable; no severe teleport/stall loop. |
| 3 | Blue shoots red with small arms for 60 seconds | OFF | Minimal/default | Hits/combat logs are consistent; no same-team damage. |
| 4 | Red shoots blue with small arms for 60 seconds | OFF | Minimal/default | Same as above after team swap direction. |
| 5 | Projectile/RPG/grenade/impact path, one direction | OFF | Minimal/default | Impact/damage does not cross into same-team damage. |
| 6 | Swap teams and repeat movement + small arms | OFF | Minimal/default | Red-player and blue-player identity paths both behave. |
| 7 | Repeat movement + small arms | ON | Minimal/default | Admin/observer does not introduce visible collapse. |
| 8 | Optional AI-on smoke | OFF first, then ON only if stable | Small configured profile only | AI does not cause immediate frame/network collapse. |

P0-8 does not include 4 players. If all two-player items pass, the next branch is a separate limited 4P readiness check.

## Step Procedure

### Room Join

1. Tester A creates or selects the test room.
2. Tester A enters as blue.
3. Tester B enters the same room as red.
4. Both confirm the same room id, team, health, and approximate map position.
5. Wait 30 seconds and record whether either client disconnects, switches room, or sees stale room state.

### Movement Only

1. Both players move in wide loops for 60 seconds.
2. Avoid firing.
3. Each tester calls out visible remote-player state:
   - smooth enough
   - delayed but playable
   - repeated snapping
   - frozen/stale
   - divergent position
4. Capture Network counts for `/participants`, `/api/rooms`, and `/api/rooms/:id`.

### Small Arms

1. Blue fires controlled bursts at red for 30 seconds.
2. Red fires controlled bursts at blue for 30 seconds.
3. Record health, death, respawn, kill log, and any stale death/respawn behavior.
4. Confirm no friendly-fire damage or same-team kill appears.
5. Capture `/combat` counts and response sizes if a problem occurs.

### Projectile / Explosive

1. Run one projectile or explosive path at a time.
2. Keep both testers verbally confirming team and target.
3. Record direct hit, impact, splash, death, and respawn behavior.
4. Stop if same-team damage appears.

### Admin / Observer ON

1. Complete admin-OFF movement and small-arms scenarios first.
2. Open admin/observer after the room is already stable.
3. Repeat movement and small-arms for 60 seconds.
4. Record whether stutter appears only after admin/observer is active.
5. Capture admin room POST, room detail, and WebSocket snapshot counts if visible.

## Result Record Template

Copy one row per scenario:

| Field | Value |
| --- | --- |
| Date/time |  |
| Build commit |  |
| Scenario |  |
| Room id |  |
| Tester A browser/OS/team |  |
| Tester B browser/OS/team |  |
| Admin/observer OFF or ON |  |
| AI setting |  |
| Duration |  |
| Perceived stutter | none / mild / severe |
| Remote position quality | stable / delayed / snapping / frozen / divergent |
| Console errors |  |
| `/participants` count / avg / max |  |
| `/combat` count / avg / max |  |
| `/api/rooms` count / avg / max |  |
| `/api/rooms/:id` count / avg / max |  |
| Death/respawn issue |  |
| Same-team damage suspicion |  |
| Evidence files |  |
| Pass/fail |  |
| Notes |  |

## Bug Capture Template

Use this for each issue:

```markdown
### Bug title

- Scenario:
- Commit:
- Room id:
- Time:
- Tester A team/browser/OS:
- Tester B team/browser/OS:
- Admin/observer:
- AI setting:
- Expected:
- Actual:
- Repro steps:
- Network evidence:
- Console evidence:
- Screenshots/video:
- Suspected branch:
```

## Decision Table

Use the manual result to choose exactly one next branch:

| Manual result | Next branch |
| --- | --- |
| Basic two-player movement or combat stutters with admin OFF and low AI | WebSocket combat/player-state minimal experiment. |
| Admin OFF is acceptable, but admin/observer ON causes stutter or stale state | Admin/observer separate lobby and selected-room observation split. |
| AI OFF is acceptable, but AI ON causes collapse | AI/worldState load ownership and update-rate separation. |
| Same-team damage, wrong-team AI targeting, or polluted kill/death/respawn appears | Team/damage failed path minimum fix. |
| Two-player movement, small arms, projectile, admin OFF/ON, and team swap are stable | Prepare a separate limited 4P readiness check. |
| Evidence is incomplete or contradictory | Repeat P0-8 manual capture; no implementation change. |

## Stop Rules

Stop the test session immediately if:

- A tester cannot join or remain in the intended room.
- Same-team damage is confirmed.
- Clients diverge so badly that combat is not comparable.
- Console/runtime errors repeat during basic movement.
- Admin/observer causes immediate room deletion, stale snapshot, or room mismatch.
- The run starts drifting toward four-player testing without a separate readiness decision.

## Next Recommendation

After this prep is committed, run one P0-8 two-human manual pass before choosing another implementation branch.

If manual testing is not available yet, the next automated-only candidate is P0-7B harness expansion for projectile and admin/observer scenarios. That should remain a test-harness extension only, not a gameplay or architecture change.
