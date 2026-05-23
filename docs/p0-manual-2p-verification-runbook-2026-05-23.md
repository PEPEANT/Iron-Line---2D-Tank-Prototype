# P0 Manual 2P Verification Runbook - 2026-05-23

Conclusion: Use this as the day-of run sheet for one controlled two-human verification pass. This is not a limited alpha restart and does not approve a four-player test.

## Gate

Limited alpha remains HOLD.

Use this runbook with the Test Lab hub P0 online checklist:

`index.html?testLab=hub`

## Access Map

| Surface | URL |
| --- | --- |
| Player entry | `http://127.0.0.1:4173/index.html` |
| Test Lab hub checklist | `http://127.0.0.1:4173/index.html?testLab=hub` |
| Admin/observer center | `http://127.0.0.1:4173/admin.html` |

For same-LAN testing, replace `127.0.0.1` with the host machine LAN IP and record the exact URL.

## Preflight

```powershell
git status --short --branch
git log -1 --oneline
node tools/check-p0-ai-playtest-harness.cjs
node tools/check-p0-real-browser-2p.cjs
node tools/check-p0-team-damage-full-path.cjs
npm run check
npm start
```

Default server:

`http://127.0.0.1:4173/index.html`

If `4173` is occupied:

```powershell
$env:PORT="4174"; npm start
```

Start manual testing only if automated checks exit `0`, `eventSyncOk` is true, same-team damage suspicion is `0`, and the worktree is clean or only contains intentional notes.

## Room And Team Procedure

1. Operator opens `admin.html`.
2. In `방 제어`, set room name, mode, factions, capacity, and small/default AI settings.
3. Click `방 생성`.
4. Keep the room in `waiting` while both testers join.
5. Tester A opens `index.html`, enters nickname, selects `온라인`, then joins the target room.
6. Tester B repeats the same steps and joins the same room.
7. Tester A starts blue; Tester B starts red.
8. Use lobby `팀 변경` or role-slot cards until the intended blue/red split is visible.
9. Both testers click `준비 완료`.
10. Operator starts the selected room only after both testers confirm room id and team.

## Admin / Observer Split

Admin OFF measurement:

1. Use admin only to create/start the room.
2. After the room is live, close `admin.html` or navigate it away from the active room.
3. Do not keep a spectator/observer browser connected during the admin-OFF pass.

Admin ON measurement:

1. Complete admin-OFF movement and combat first.
2. Reopen `admin.html` or join through `관전` / `관전자 입장`.
3. Select the active room and keep admin/observer open while repeating movement and small-arms.
4. Record whether stutter, stale room state, or room mismatch appears only after admin/observer is active.

## Browser Capture

Each tester should keep DevTools ready:

- Network tab with Preserve log enabled.
- Filters for `/participants`, `/combat`, `/api/rooms`, and `/api/rooms/:id`.
- Console visible.
- Screenshot/video ready if failure appears.

## Scenario Order

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

Do not run 4P in this pass. Passing this table only enables a separate limited 4P readiness check, not an automatic alpha restart.

## Result Sheet

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

## Stop Rules

Stop immediately if:

- A tester cannot join or stay in the selected room.
- Basic movement diverges so badly that combat evidence is meaningless.
- Same-team damage or same-team kill/death pollution is confirmed.
- Console errors repeat during idle or movement-only.
- Admin/observer ON causes stale room snapshot, room deletion confusion, or immediate collapse.
- The session drifts toward a four-player test.

## Decision After The Run

| Result | Next branch |
| --- | --- |
| Basic 2P movement or combat fails with admin OFF and low AI | WebSocket combat/player-state minimal experiment. |
| Admin OFF passes but admin/observer ON fails | Admin/observer separate lobby and selected-room observation split. |
| AI OFF passes but AI ON fails | AI/worldState load ownership and update-rate separation. |
| Team damage or wrong-team targeting returns | Team/damage failed path minimum fix. |
| 2P movement, small arms, projectile, team swap, and admin ON are stable | Prepare separate limited 4P readiness check. |
| Evidence is incomplete | Repeat this manual 2P run; no implementation change. |
