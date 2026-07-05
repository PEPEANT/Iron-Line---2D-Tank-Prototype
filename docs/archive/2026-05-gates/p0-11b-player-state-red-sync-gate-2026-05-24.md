# P0-11B Player State Red-Side Sync Gate

Conclusion: P0-11A manual live verification is FAIL, but the latest automated split points away from admin/observer and toward duplicate player identity risk inside the player-only lane.

## Manual Signal

- Blue local player control felt mostly smooth.
- Enemy/remote player position did not line up.
- Red-side view repeatedly appeared to stutter.
- Player-vs-player meeting positions did not match.
- Admin/observer isolation did not remove the core issue.

P0-11A remains a temporary recovery isolation. It is not a 2-player product mode.

## Capacity Check

`node tools/check-p0-11b-player-state-red-sync.cjs` verified that combat-only recovery still allows player-only 4+ lobby/player capacity:

- lobby players: 4
- room capacity: 8
- player slots: `blue-infantry`, `red-infantry`, `blue-engineer`, `red-engineer`
- spectator capacity in recovery mode: 0

No 2-player hard cap was reproduced in this pass.

## Player State Checks

Server WebSocket relay preserved both directions:

- blue saw red `player_state`: 8 packets
- red saw blue `player_state`: 8 packets
- red identity preserved as `team=red`, `slotId=red-infantry`
- blue identity preserved as `team=blue`, `slotId=blue-infantry`

Browser render/apply with distinct player ids also passed:

- blue accepted red applies: 58
- red accepted blue applies: 59
- stale rejects: 0
- self-ignored remote packets: 0
- remote render delta: 0px on both sides

## High-Risk Finding

When both browser clients share the same `playerId`, remote packets are treated as local self packets and ignored:

- duplicate-id blue self-ignored packets: 57
- duplicate-id red self-ignored packets: 57
- duplicate-id remote apply accepted: 0 on both sides
- duplicate-id remote render entry: missing on both sides
- duplicate-id visible identity collapsed to one local player row

This matches a plausible live failure mode if two game windows share the same localStorage profile/player id, or if a join/session path reuses the same profile id across clients. In that case, `applyRemotePlayerState()` rejects the other client's state because `payload.playerId === session.playerId`.

## Current Classification

- Admin/observer path: not the primary cause of this manual FAIL.
- WorldState/AI source flip: not the primary finding in this gate.
- Red-side player_state transport with distinct IDs: PASS.
- Red-side render/apply with distinct IDs: PASS.
- Duplicate player identity/session collision: most suspicious remaining candidate.

## Next Minimum Recommendation

P0-11C should be a narrow local player identity/session isolation guard.

Scope:

- Detect same `playerId` already present in the target room when a non-host/local browser joins.
- Avoid letting two live player clients in the same room share one `playerId`.
- Prefer a per-tab/session player id refresh or explicit duplicate-id join repair before starting the active match.
- Keep player_state transport, combat confirm, worldState, admin/observer, and AI behavior unchanged.

Do not start WebSocket redesign, server-authoritative conversion, worldState/AI changes, admin split, or 4-player alpha reopening from this result.

## Verification

- `node tools/check-p0-11b-player-state-red-sync.cjs`
- `npm run check`
- `npm run check:online`
- `git diff --check`
