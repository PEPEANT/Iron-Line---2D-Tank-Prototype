# Online Combat Stabilization Correction Pass - 2026-05-22

Decision: PASS for the mid-report-based narrow fix / validation pass. The next artifact can be the online combat stabilization completion report. This pass does not approve a full server-authority combat rewrite.

## 1. Scope

This pass only addressed issues directly connected to the online combat stabilization mid verification report:

- stale / delayed hit ordering,
- duplicate hit / death / respawn handling,
- death / respawn metadata consistency,
- local client application of online hit / death / respawn events.

No broad online redesign, ranked / matchmaking work, anti-cheat, UGC, city work, AI V2 expansion, or 50vs50 default-mode work was started.

## 2. Fixes Made

### Valid delayed hits are no longer rejected as stale

Problem:

- `OnlineCombatStabilizer.isStaleForLocalPlayer()` compared incoming `targetStateSeq` against the current local movement / presence sequence.
- Because local presence increments often, a real but delayed hit could be rejected even when it happened after the player's latest respawn.

Fix:

- Stale-hit detection now compares event time against `onlineLastRespawnAt`.
- Sequence fallback now compares against `onlineLastRespawnStateSeq`, not the continuously increasing movement sequence.
- `publishOnlinePlayerRespawn()` records `onlineLastRespawnStateSeq`.

### Duplicate local combat events preserve richer metadata

Problem:

- Local `RoomRegistry.pushCombatEvent()` returned the first duplicate and did not merge later richer duplicate metadata.
- A duplicate order such as sparse-first / rich-second could keep incomplete health, killer, or state sequence metadata.

Fix:

- Duplicate local combat events now merge through `mergeCombatDuplicate()`.
- Sparse duplicates no longer erase richer previous metadata.
- Rich later duplicates can fill missing metadata.

### `killerId` is only set for lethal / death events

Problem:

- Normal shots and respawn events inherited `killerId` from `shooterId`.
- That made respawn and non-lethal shot metadata look like kill events.

Fix:

- `killerId` is now populated only for `player_death` or explicitly lethal events.
- Respawn events and non-lethal shot events keep `killerId` empty.

### Death events carry the target health before death

Problem:

- Client-published `player_death` events could report `targetHealthBefore: 0`, losing useful death-cause context.

Fix:

- Online small-arms and projectile death publication now passes the local `hpBefore` value into the death event.

### Observer trace exposes respawn state sequence

Problem:

- Debug / observer state showed the last respawn time but not the respawn sequence used for stale-hit protection.

Fix:

- `ObserverBridge` now exposes `onlineCombat.lastRespawnStateSeq`.

## 3. Verification

Checks run:

- `node tools/check-online-combat-client-flow.cjs`: PASS
- `node tools/check-online-combat-stabilization.cjs`: PASS
- `npm run check:online`: PASS
- `node tools/check-fps-command-integration.cjs`: PASS
- `npm run check`: PASS

Latest client-flow smoke:

```json
{
  "ok": true,
  "url": "http://127.0.0.1:4196/index.html?roomsApi=local",
  "roomId": "CLIENT-FLOW-1779453557957",
  "localPresence": {
    "stateSeq": 65,
    "hp": 100,
    "weaponId": "machinegun"
  },
  "shot": {
    "hit": true,
    "sequence": 1,
    "targetPlayerId": "red-human"
  },
  "hit": {
    "delayedApplied": true,
    "duplicateApplied": false,
    "hpBefore": 100,
    "hpAfter": 75
  },
  "death": {
    "lethalApplied": true,
    "deathEvents": 1,
    "killerId": "red-human",
    "remoteDeathApplied": true,
    "remoteDeathDuplicate": false,
    "killsBefore": 0,
    "killsAfter": 1,
    "redAliveAfterDeath": false
  },
  "respawn": {
    "remoteRespawnApplied": true,
    "remoteRespawnDuplicate": false,
    "redHpAfterRespawn": 100,
    "redStateSeqAfterRespawn": 30,
    "lastRespawnStateSeq": 66,
    "staleApplied": false,
    "hpAfterStale": 100
  },
  "pass": true
}
```

## 4. Pass / Fail Table

| Area | Scenario | Result | Evidence |
| --- | --- | --- | --- |
| Position / state | Local online presence publishes state sequence, health, weapon, and aim metadata. | PASS | `check-online-combat-client-flow.cjs` |
| Delayed hit | A valid delayed hit with an older target sequence still applies before a respawn. | PASS | `delayedApplied: true`, `hpAfter: 75` |
| Duplicate hit | Same hit id does not damage twice. | PASS | `duplicateApplied: false` |
| Lethal hit | Lethal remote hit puts local player into death flow and publishes one death event. | PASS | `deathEvents: 1`, `killerId: red-human` |
| Remote death | Remote player death applies and increments local kill stats once. | PASS | `killsBefore: 0`, `killsAfter: 1` |
| Duplicate death | Same death id does not increment kill twice. | PASS | `remoteDeathDuplicate: false` |
| Remote respawn | Remote respawn marks the player alive, restores health, and updates state sequence. | PASS | `redHpAfterRespawn: 100`, `redStateSeqAfterRespawn: 30` |
| Duplicate respawn | Same respawn id does not apply twice. | PASS | `remoteRespawnDuplicate: false` |
| Stale pre-respawn hit | Hit from before the latest respawn is ignored and does not change health. | PASS | `staleApplied: false`, `hpAfterStale: 100` |
| Metadata | Non-lethal shots and respawn events no longer carry `killerId`. | PASS | Client-flow smoke asserts this. |
| Regression | Online command / existing online smoke still passes. | PASS | `npm run check:online` |
| Regression | FPS + command integration still passes. | PASS | `check-fps-command-integration.cjs` |

## 5. Files Changed

- `src/systems/online-combat-stabilizer.js`
- `src/main.js`
- `src/systems/room-registry.js`
- `src/systems/observer-bridge.js`
- `tools/check-online-combat-client-flow.cjs`

Pre-existing files from the first implementation pass remain part of this online combat stabilization change set:

- `src/systems/session-flow.js`
- `tools/static-server.cjs`
- `tools/check-online-smoke.cjs`
- `tools/check-online-combat-stabilization.cjs`

## 6. Remaining Notes

No blocker remains for moving to the online combat stabilization completion report.

Remaining caution for the completion report:

- The new client-flow smoke validates the real browser client event application path, but the final report should still state clearly whether true two-human / two-window manual play was performed.
- Host / world-host departure during active combat is still observational, not solved here.
- This pass remains first-pass synchronization stabilization, not full server-authority combat.

## 7. Next Step

Next artifact:

**Online combat stabilization completion report**

The completion report should decide whether the current first-pass online combat stabilization is:

- `PASS`: move to the next roadmap item,
- `PARTIAL`: keep live two-client/manual validation as a condition,
- `BLOCKED`: return to a narrow online combat correction pass.
