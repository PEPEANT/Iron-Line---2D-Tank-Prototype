# P0-11C Player Identity Session Isolation

Conclusion: P0-11C applies a narrow per-tab player identity guard to prevent same-origin/localStorage playerId collisions from breaking remote player_state apply/render.

## Problem

P0-11B showed that if two live browser clients share the same `playerId`, remote `player_state` packets are rejected as self packets by `applyRemotePlayerState()`.

Observed failure mode before this fix:

- duplicate-id remote apply accepted: 0
- duplicate-id self-ignored packets: 57 / 57
- duplicate-id remote render entry: missing
- visible player identity collapsed to one local player row

This matched the manual report where blue local control was fine but enemy/red player position did not line up.

## Fix Scope

This pass does not change WebSocket transport, combat confirm, worldState, AI behavior, admin/observer, or room protocol ownership.

It only changes player identity handling:

- Runtime online `playerId` is backed by per-tab `sessionStorage`.
- Persistent localStorage profile still keeps nickname/faction and the base persistent player id.
- If a room already contains the current runtime `playerId`, the joining tab repairs itself to a fresh session `playerId`.
- `player_state` and render/apply then see the remote player as a distinct player instead of self.

## Latest Result

`node tools/check-p0-11b-player-state-red-sync.cjs` now reports `decision: duplicate_player_id_repaired`.

Key latest values:

- player-only lobby capacity remains available: 4 players in capacity 8
- server WS relay remains bidirectional: blue saw red 8, red saw blue 8
- distinct player ids: remote render delta 0px on both clients
- duplicate requested id `p0-shared`: repaired to distinct tab ids
- duplicate repaired: true
- duplicate case blue selfIgnored: 0
- duplicate case red selfIgnored: 0
- duplicate case blue accepted remote applies: >0 in repeated runs
- duplicate case red accepted remote applies: >0 in repeated runs
- duplicate case remote render delta: 0px on both clients

## Remaining Risk

This is still not a manual live PASS. It closes the duplicate identity failure mode, but a short live player-only 2P check is still required to confirm that the previously observed red/remote position mismatch is gone.

If manual stutter remains after this identity guard, the next gate should return to live repro instrumentation with the now-distinct player ids and choose one remaining lane from player_state timing, combat event merge/render, or room refresh.

## Verification

- `node tools/check-p0-11b-player-state-red-sync.cjs`
- `npm run check`
- `npm run check:online`
- `git diff --check`
