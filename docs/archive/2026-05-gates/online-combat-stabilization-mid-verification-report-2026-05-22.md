# Online Combat Stabilization Mid Verification Report - 2026-05-22

Decision: ON TRACK. The online combat stabilization first pass is preserving two-player combat state, rejecting stale player updates, and deduping hit / death / respawn events. This is a middle verification checkpoint, not the final online combat completion gate.

## 1. Test Environment

- Server URL: `http://127.0.0.1:4198` for the dedicated online combat smoke.
- Online command smoke URL: local `tools/static-server.cjs` instance from `npm run check:online`.
- Browser runtime URL: local browser smoke from `tools/check-fps-command-integration.cjs`.
- Room ID: `COMBAT-1779453077565`.
- Client count: automated two-player room participants.
- Tested players / roles:
  - `blue-human`, `blue-infantry`, `rifle`.
  - `red-human`, `red-armor`, `machinegun`.
- Logs / smoke tests used:
  - `node tools/check-online-combat-stabilization.cjs`
  - `npm run check:online`
  - `node tools/check-fps-command-integration.cjs`
  - `npm run check`

Latest dedicated smoke output:

```json
{
  "ok": true,
  "build": {
    "commit": "a677b57cffaa",
    "branch": "main"
  },
  "roomId": "COMBAT-1779453077565",
  "players": 2,
  "combatEvents": 3,
  "playerState": {
    "blueSeq": 10,
    "blueHp": 100,
    "redSeq": 8,
    "redWeapon": "machinegun"
  },
  "dedupe": {
    "hitEvents": 1,
    "deathEvents": 1,
    "respawnEvents": 1
  }
}
```

## 2. Position / Aim Synchronization

| Check | Evidence | Result | Notes |
| --- | --- | --- | --- |
| Remote position preserved | `blue-human` and `red-human` retained `x`, `y`, `angle`, `aimX`, and `aimY` in the room registry. | PASS | Dedicated smoke fails if aim / position metadata is lost. |
| Movement / weapon state preserved | `movementState`, `weaponId`, `hp`, `maxHp`, `deathState`, and `stateSeq` survived room import / export. | PASS | Smoke confirmed `blueSeq: 10`, `blueHp: 100`, `redWeapon: machinegun`. |
| Stale state rejected | A lower `stateSeq` / older `updatedAt` update tried to overwrite `blue-human`. | PASS | The stale update did not replace newer position / health. |

Remaining manual check:

- True two-browser movement interpolation and visual remote aim still need live play validation.

## 3. Shooting Synchronization

| Check | Evidence | Result | Notes |
| --- | --- | --- | --- |
| Shot event identity | Small-arms events carry `eventId`, `sequence`, `hitId`, shooter state, target state, weapon, and damage cause. | PASS | Verified through dedicated hit event smoke. |
| Duplicate hit event collapse | Two events with the same `hitId` were posted. | PASS | Registry / static-server kept one hit event. |
| Rich metadata preserved after duplicate | Sparse duplicate hit event arrived after richer event. | PASS | `targetHealthAfter: 78` and `targetStateSeq: 10` remained intact. |

Remaining manual check:

- Remote client tracer / muzzle flash / shot direction visibility should be checked in a true two-browser session.

## 4. Hit / Kill / Death Synchronization

| Check | Evidence | Result | Notes |
| --- | --- | --- | --- |
| Hit metadata | Hit events preserve damage, `damageCause`, target health before / after, and state sequence. | PASS | Dedicated smoke validates the stored hit event. |
| Death event dedupe | Two death events with the same `deathId` were posted. | PASS | Registry / static-server kept one death event. |
| Hit and death separated | A death event sharing the previous `hitId` no longer collapses into the hit event. | PASS | Type-aware dedupe key fixed this path. |
| Killer / lethal metadata | Death event preserved `killerId`, `lethal`, `damageCause`, and target health metadata. | PASS | Dedicated smoke would fail if sparse duplicate erased this context. |

Remaining manual check:

- Kill log text, death cause UI, and both-client death-state agreement still need true two-browser live verification.

## 5. Respawn / Round State

| Check | Evidence | Result | Notes |
| --- | --- | --- | --- |
| Respawn event dedupe | Two respawn events with the same `respawnId` were posted. | PASS | Registry / static-server kept one respawn event. |
| Respawn metadata | Respawn event preserved target health and state sequence. | PASS | Dedicated smoke validates the respawn event payload. |
| Local respawn publish path | Conquest respawn now publishes `player_respawn` and force-publishes local presence. | ON TRACK | Covered by code path and smokeable metadata, but not yet true live dual-client play. |

Remaining manual check:

- Round end, win state, and respawn timing across two live clients have not received repeated manual validation yet.

## 6. Delay / Duplicate / Ordering Handling

| Check | Evidence | Result | Notes |
| --- | --- | --- | --- |
| Old position packet ignored | Lower `stateSeq` and older `updatedAt` did not overwrite newer player state. | PASS | Implemented in static-server participant import. |
| Duplicate hit ignored | Same `hitId` collapsed to one combat event. | PASS | Verified by dedicated smoke. |
| Duplicate death ignored | Same `deathId` collapsed to one death event. | PASS | Verified by dedicated smoke. |
| Duplicate respawn ignored | Same `respawnId` collapsed to one respawn event. | PASS | Verified by dedicated smoke. |
| Sparse duplicate merge safe | Newer sparse duplicate no longer erases richer metadata. | PASS | Fixed after the smoke exposed the issue. |

## 7. Regression Checks

| Check | Result | Evidence |
| --- | --- | --- |
| Online command smoke | PASS | `npm run check:online` |
| FPS + command integration smoke | PASS | `node tools/check-fps-command-integration.cjs` |
| General code health | PASS | `npm run check` |
| Dedicated online combat stabilization smoke | PASS | `node tools/check-online-combat-stabilization.cjs` |

## 8. Issues Found and Fixed During This Verification

1. Sparse duplicate hit events could overwrite richer hit metadata.
   - Fixed by merging duplicate room records instead of replacing the richer previous event with a sparse newer one.

2. Death events that reused the hit event's `hitId` could be deduped against the earlier hit event.
   - Fixed by using type-aware dedupe keys for hit, death, and respawn events.

## 9. Current Verdict

Current verdict: ON TRACK.

The project can continue into the online combat stabilization mid-report-based narrow fix / live validation pass.

This report does not approve online combat as complete yet. The next pass should focus on:

- True two-browser shoot / hit / death / respawn validation.
- Remote tracer and firing-effect visibility.
- Kill log and death-cause agreement.
- Respawn state agreement.
- Round / win-state consistency.
- Host / world-host departure observation during active combat.

Do not start:

- Full server-authority combat rewrite.
- Ranked / matchmaking.
- Large anti-cheat.
- UGC / city expansion.
- 50vs50 default mode.
- Broad AI behavior expansion.
