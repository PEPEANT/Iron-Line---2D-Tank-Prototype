# P0-11E 2P Baseline Player Core Sync / Stutter Instrumentation

Conclusion: P0-11E is re-scoped from 3P/4P user-flow to the smallest 2P player-only baseline. This gate does not change gameplay; it records where remaining player position mismatch or stutter appears between `player_state` send, receive, apply, session merge, and render.

## Current Inputs

- P0-11C fixed a real duplicate `playerId` / session identity failure and produced a large manual improvement.
- Manual follow-up still reports position sync mismatch and lag even in 2P.
- Therefore the remaining issue is not treated as a 3P/4P capacity problem first.
- AI/worldState, admin/observer, WebSocket redesign, and server-authoritative conversion stay out of this gate.

## Probe

`node tools/check-p0-11e-2p-baseline-player-core-sync.js`

Flow:

1. Create a player-only waiting room.
2. Join two browser clients: blue infantry and red infantry.
3. Select slots, ready both players, and start the room server-side.
4. Move both local player entities while forcing the existing local publish path.
5. Record `player_state`, room participant merge, remote render, minimap, long frame, and browser HTTP metrics.

Recorded per client:

- runtime `playerId`, persistent `playerId`, team, slot, room id
- WebSocket open count and `player_state` sent/received counts
- `applyRemotePlayerState` accepted, self-ignored, stale-rejected counts
- local presence source coordinate versus published coordinate
- `session.players`, `remotePlayerStateBuffer`, `remoteHumanPlayers`, and minimap positions
- room refresh / `syncRoomParticipants` remote buffer deltas
- render smoothing deltas
- `requestAnimationFrame` gaps, long tasks, update/render timing samples
- room summary/detail and participant HTTP counts/bytes

## Latest Decision

Decision: `local_presence_publish_point_fallback`

The 2P baseline reproduces the player-core sync failure without needing 3P/4P, admin, observer, AI/worldState, or combat expansion.

Key latest values:

- Blue runtime playerId: unique.
- Red runtime playerId: unique.
- WebSocket connected: yes on both clients.
- `player_state` sent: 284 total.
- `player_state` received: 176 total.
- `applyRemotePlayerState` accepted: 176 total.
- `selfIgnored`: 0.
- `staleRejected`: 0.
- session versus remote buffer delta: 0px.
- field render versus session delta: 0px.
- room refresh remote-buffer delta: 0px.
- max frame gap: 116.7ms in the latest run, but this is not the primary position mismatch owner in this run because the coordinate is already wrong before receive/apply/render.

The bad point is earlier than receive/apply/render:

- Blue local entity: about `1706,1468`.
- Blue published/presence result: `1350,4942`.
- Blue presence mismatch max: 3519px.
- Red local entity: about `1204,1438`.
- Red published/presence result: `6923,802`.
- Red presence mismatch max: 7617px.

Because the wrong spawn/safe-zone coordinate is what gets relayed, the remote clients render exactly what they receive. That makes the render/session/buffer deltas look clean while the human-visible position is still wrong.

## Concrete Code Finding

`src/systems/session-flow.js` currently chooses the local presence source point with:

```js
let point = mounted?.alive !== false ? mounted : entity;
```

When `mounted` is `null`, `mounted?.alive` is `undefined`, and `undefined !== false` evaluates to `true`. That makes `point` become `null`; the next guard falls back to `fallbackPresencePoint()`, which is the team spawn/safe-zone coordinate.

That matches the 2P baseline evidence exactly:

- Blue publishes `1350,4942` while the local entity is moving near `1706,1468`.
- Red publishes `6923,802` while the local entity is moving near `1204,1438`.

## Scope Guard

This gate is instrumentation-only.

Allowed:

- Add or run a 2P baseline browser probe.
- Record player core sync/stutter evidence.
- Recommend one next minimum fix.

Forbidden:

- Gameplay fix in this gate.
- 3P/4P expansion work.
- AI/worldState changes.
- Admin/observer reactivation.
- WebSocket combat/worldState redesign.
- Server-authoritative conversion.
- 4-player alpha restart language.

## Next Minimum Recommendation

P0-11F narrow local presence publish point fix.

Scope:

- Fix only the mounted/null presence source selection in `syncLocalPlayerPresence`.
- Preserve mounted vehicle behavior.
- Preserve `player_state` protocol shape.
- Preserve combat, worldState, AI, admin/observer, room architecture, and 4-player scope.
- Re-run P0-11E to confirm published local coordinates follow the active dismounted player entity.
- Re-run P0-11D to confirm same-team remote apply/render still passes.

Do not start WebSocket redesign, server-authoritative conversion, AI/worldState changes, admin/observer reactivation, or alpha/4-player reopening from this gate.
