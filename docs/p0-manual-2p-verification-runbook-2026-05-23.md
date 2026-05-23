# P0 Manual 2P Verification Runbook - 2026-05-23

Conclusion: Use this as the day-of run sheet for one controlled two-human verification pass. This is not a limited alpha restart and does not approve a four-player test.

## Gate

Limited alpha remains HOLD.

This runbook converts the P0-8 prep package into an operator checklist. It should be used with the Test Lab hub P0 online checklist at:

`index.html?testLab=hub`

## Access Map

Use the same server for players, admin/observer, and the Test Lab hub.

| Surface | URL |
| --- | --- |
| Player entry | `http://127.0.0.1:4173/index.html` |
| Test Lab hub checklist | `http://127.0.0.1:4173/index.html?testLab=hub` |
| Admin/observer center | `http://127.0.0.1:4173/admin.html` |

For a same-LAN manual test, replace `127.0.0.1` with the host machine LAN IP on the second tester machine. Record the exact URL used by both testers.

## Roles

| Role | Person | Duty |
| --- | --- | --- |
| Operator |  | Starts server, records commit, watches logs, calls stop rules. |
| Tester A |  | Blue first, then red after swap. |
| Tester B |  | Red first, then blue after swap. |

Use exactly two testers for this pass. Do not add a third/fourth player during this run.

## Before Humans Join

Record the build:

```powershell
git status --short --branch
git log -1 --oneline
```

Run automated preflight:

```powershell
node tools/check-p0-ai-playtest-harness.cjs
node tools/check-p0-real-browser-2p.cjs
node tools/check-p0-team-damage-full-path.cjs
npm run check
```

Start the local server:

```powershell
npm start
```

Default server:

`http://127.0.0.1:4173/index.html`

If port `4173` is already used, set a different `PORT` value and record it in the result sheet:

```powershell
$env:PORT="4174"; npm start
```

Start manual testing only if:

- Worktree is clean or only contains intentional local notes outside git.
- Automated checks exit `0`.
- AI playtest harness reports `eventSyncOk: true`.
- Same-team damage suspicion count is `0`.

## Browser Setup

Each tester records:

| Field | Tester A | Tester B |
| --- | --- | --- |
| Browser/version |  |  |
| OS |  |  |
| Hardware acceleration | on / off | on / off |
| Network route | LAN / internet / other | LAN / internet / other |

DevTools setup:

1. Open Network tab.
2. Enable Preserve log.
3. Keep filters ready for `/participants`, `/combat`, `/api/rooms`, and `/api/rooms/:id`.
4. Keep Console available.
5. If a failure appears, export HAR or capture a screenshot/video before refreshing.

## Room And Team Procedure

Room setup:

1. Operator opens `admin.html`.
2. In `방 제어`, set room name, mode, factions, capacity, and small/default AI settings.
3. Click `방 생성`.
4. Keep the room in `waiting` while both testers join.

Player join:

1. Tester A opens `index.html`.
2. Enter nickname.
3. Select `온라인`.
4. Click the target room in `방 목록`.
5. Tester B repeats the same steps and joins the same room.
6. Both testers confirm the same room id in the lobby.

Team selection:

1. Tester A starts on blue.
2. Tester B starts on red.
3. Use the lobby `팀 변경` button or role-slot cards until the lobby shows the intended blue/red split.
4. Both testers click `준비 완료`.
5. Operator starts the selected room only after both testers confirm role/team.

Admin/observer OFF measurement:

1. Use admin only to create/start the room.
2. After the room is live, close `admin.html` or navigate it away from the active room before timing the admin-OFF scenarios.
3. Do not keep a separate spectator/observer browser connected during the admin-OFF pass.

Admin/observer ON measurement:

1. Complete admin-OFF movement and combat first.
2. Reopen `admin.html` or join the room through the `관전` / `관전자 입장` path.
3. Select the active room and keep the admin/observer view open while repeating movement and small-arms.
4. Record whether stutter, stale room state, or room mismatch appears only after this point.

## Scenario Order

Stop at the first severe failure and fill the bug template below.

| Step | Scenario | Duration | Admin | AI | Pass criteria |
| ---: | --- | ---: | --- | --- | --- |
| 1 | Join same room and idle | 30s | OFF | Minimal/default | Same room, correct teams, no stale room switch. |
| 2 | Movement only | 60s | OFF | Minimal/default | Remote movement is playable; no frozen/divergent position. |
| 3 | Blue small-arms into red | 60s | OFF | Minimal/default | Hits/logs consistent; no same-team damage. |
| 4 | Red small-arms into blue | 60s | OFF | Minimal/default | Same as step 3 in reverse direction. |
| 5 | Projectile/explosive path | 60s | OFF | Minimal/default | Impact/death/respawn path has no same-team damage. |
| 6 | Swap teams and repeat movement + small arms | 90s | OFF | Minimal/default | Both team identity paths still behave. |
| 7 | Movement + small arms with admin/observer | 60s | ON | Minimal/default | Admin/observer does not introduce visible collapse or stale snapshot. |
| 8 | Optional AI-on smoke | 60s | OFF first | Small configured profile | AI does not cause immediate frame/network collapse. |

Do not run 4P in this pass. If this table passes, the next output is a separate limited 4P readiness check, not an automatic alpha restart.

## Result Sheet

Copy one row per scenario:

| Scenario | Pass/fail | Stutter | Remote position | Console errors | `/participants` | `/combat` | `/api/rooms` | `/api/rooms/:id` | Team damage suspicion | Notes/evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Join idle |  | none / mild / severe | stable / delayed / snapping / frozen / divergent |  |  |  |  |  |  |  |
| Movement only |  | none / mild / severe | stable / delayed / snapping / frozen / divergent |  |  |  |  |  |  |  |
| Blue small arms |  | none / mild / severe | stable / delayed / snapping / frozen / divergent |  |  |  |  |  |  |  |
| Red small arms |  | none / mild / severe | stable / delayed / snapping / frozen / divergent |  |  |  |  |  |  |  |
| Projectile/explosive |  | none / mild / severe | stable / delayed / snapping / frozen / divergent |  |  |  |  |  |  |  |
| Team swap |  | none / mild / severe | stable / delayed / snapping / frozen / divergent |  |  |  |  |  |  |  |
| Admin/observer ON |  | none / mild / severe | stable / delayed / snapping / frozen / divergent |  |  |  |  |  |  |  |
| AI-on smoke |  | none / mild / severe | stable / delayed / snapping / frozen / divergent |  |  |  |  |  |  |  |

## Evidence To Capture

Always record:

- Commit hash.
- Room id.
- URL / host / port used by both testers.
- Tester browser, OS, and team.
- Admin/observer OFF or ON.
- AI setting.
- Scenario step and start/end time.

Capture on failure:

- Screenshot or short video from both testers if possible.
- Console errors/warnings.
- Network HAR or visible request counts for `/participants`, `/combat`, `/api/rooms`, and `/api/rooms/:id`.
- Any WebSocket frame counts visible in DevTools.
- Health, death, respawn, and kill-log state.
- Whether the issue disappears when admin/observer is closed.

## Stop Rules

Stop immediately if any of these occur:

- A tester cannot join or stay in the selected room.
- Basic movement diverges so much that combat evidence is meaningless.
- Same-team damage or same-team kill/death pollution is confirmed.
- Console errors repeat during idle or movement-only.
- Admin/observer ON causes stale room snapshot, room deletion confusion, or immediate collapse.
- The session drifts toward a four-player test.

## Bug Template

```markdown
### P0 manual 2P bug

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
- Screenshot/video:
- Suspected next branch:
```

## Decision After The Run

Choose exactly one:

| Result | Next branch |
| --- | --- |
| Basic 2P movement or combat fails with admin OFF and low AI | WebSocket combat/player-state minimal experiment. |
| Admin OFF passes but admin/observer ON fails | Admin/observer separate lobby and selected-room observation split. |
| AI OFF passes but AI ON fails | AI/worldState load ownership and update-rate separation. |
| Team damage or wrong-team targeting returns | Team/damage failed path minimum fix. |
| 2P movement, small arms, projectile, team swap, and admin ON are stable | Prepare separate limited 4P readiness check. |
| Evidence is incomplete | Repeat this manual 2P run; no implementation change. |

## Related Docs

- `docs/p0-limited-manual-playtest-prep-2026-05-23.md`
- `docs/p0-ai-playtest-harness-design-2026-05-23.md`
- `docs/p0-real-browser-2p-verification-report-2026-05-23.md`
- `docs/p0-team-damage-full-path-validation-2026-05-23.md`
