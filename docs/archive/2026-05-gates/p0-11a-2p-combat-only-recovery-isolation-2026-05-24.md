# P0-11A 2P Combat-Only Recovery Isolation

Conclusion: P0-11A is a temporary recovery isolation mode, not a removal of spectator/admin features.

## Purpose

Manual P0-10K confirmation cancelled the automated/browser-proxy PASS candidate. The live issue is now treated as admin/observer paths being able to shake active match state while the player 2P combat lane is still under recovery. P0-11A narrows the live lane to two player clients first.

## Current Rules

- Combat-only recovery is default ON for this P0 recovery checkpoint. This is not a final product decision.
- Set `IRONLINE_P0_COMBAT_ONLY=0` to disable recovery mode on the static server.
- Add `?p0CombatOnly=0` to disable the client-side recovery guard for a browser session.
- In recovery mode, WebSocket `observer_snapshot` and `admin_snapshot` are disabled.
- In recovery mode, spectator/caster/admin WebSocket joins are rejected with `reason: "combat_only"`.
- In recovery mode, `/api/rooms/:id/participants` rejects spectator/caster/admin participant writes.
- In recovery mode, active-match observer/admin-only `/api/rooms` patches are locked with `reason: "combat_only_active_room_controls_locked"`.
- Player `player_state`, combat confirm/event posting, active room detail refresh, and worldState publish/apply remain available.

## Not A Product Cut

This mode does not declare spectator/admin features deleted. It is a P0 recovery guard so player 2P movement/combat can be checked without observer/admin snapshot or live control writes changing the active match state. Spectator/admin should be reattached later through a separate channel/path after player 2P combat is stable.

## Verification

- `npm run check`
- `npm run check:online`
- `node tools/check-p0-11a-combat-only-recovery.cjs`
- `node tools/check-p0-real-browser-2p.cjs`

The online smoke expectation is now explicit: in combat-only recovery mode, a player WebSocket join should receive `hello` and `join_result`, but no `observer_snapshot`.

## 2026-05-24 Automated Result

- P0-11A recovery probe: PASS. Observer/admin snapshots disabled, spectator WebSocket blocked, room detail exports `spectators: 0`, `admins: 0`, `spectatorCapacity: 0`.
- Minimum player paths remain alive: participant ack, combat ack, and worldState ack all returned `ok`.
- Real-browser 2P Admin OFF latest run: movement-only still showed 6 long frames over 50ms with max 100ms, while small-arms and projectile showed 0.
- Real-browser Admin ON comparison latest run: no active-room `/api/rooms` writes and 0 long frames; admin snapshot requests return recovery-mode errors instead of state snapshots.
- P0-9D/P0-9E regression probes: no steady movement-only/updateBattlefield long-frame regression reproduced after sequential rerun.
- P0-10H still reports stale incoming room/worldState candidates with the legacy `upsertStale` metric. The client now preserves fresher worldState during remote room upserts, so this should be read as remaining incoming stale-room risk, not proof that stale worldState is applied to the screen.

## Risks

- This is still not a manual live 2P PASS.
- If Admin OFF player 2P still stutters after this isolation, the next lane should be chosen from player_state, combat confirm/event merge, or worldState.
- If Admin ON remains the only bad path, the next step should be an admin/observer comparison gate, not immediate admin split implementation.
