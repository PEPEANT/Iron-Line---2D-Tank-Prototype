# P1 vehicle bailout + vehicle MG damage + AI pacing final verification

Conclusion: as of 2026-05-24, the three deferred follow-up items are now in PASS state for current HEAD: humvee explosion bailout no longer traps occupants, vehicle and player machine guns can now acquire and damage vehicles directly, and infantry pacing no longer inserts arbitrary stop-start pauses during long uncontested approach movement.

## Purpose

- Close the remaining post-P0 gameplay bugs that were explicitly left open after online sync stabilization.
- Record the root cause and exact fix path for:
  - humvee explosion occupant bailout
  - vehicle machine gun and small-arms damage against vehicles
  - AI pacing / awkward stop-start movement
- Lock the verification evidence that current HEAD passes these checks.

## Closed issues

### 1. Vehicle escape on explosion

Root cause:

- `tank.js` already had a delayed destruction and bailout path.
- `humvee.js` did not.
- A destroyed humvee immediately flipped to dead state, but driver/player bailout was not guaranteed at the destruction point.
- That left a path where a local player could remain logically mounted until the next control tick and appear trapped or get resolved inconsistently.

Current fix:

- `src/entities/humvee.js`
  - added bailout point selection
  - added crew bailout
  - added player bailout
  - added emergency bailout handling for passengers
  - recorded bailout result on destruction
- `src/systems/game-player-control.js`
  - mounted humvee death path now attempts immediate bailout first instead of always falling straight to damage-only cleanup

Current behavior:

- Humvee driver/player is ejected immediately to a valid nearby point.
- Humvee crew is dismounted and moved to bailout state instead of remaining attached.
- Passengers are force-dismounted on destruction and no longer remain inside the dead vehicle.
- `inTank` / `inVehicle` state is cleared in the same destruction path.

### 2. Vehicle machine gun damage too weak / no damage

Root cause:

- Vehicle machine gun target selection mostly searched infantry, crew, drones, and local player.
- Tanks and humvees were not consistently included as direct machine gun targets.
- Even when a bullet path could hit a vehicle, that often depended on line-trace fallback rather than explicit vehicle targeting.
- Small-arms anti-vehicle chip damage was also too low for light vehicles.

Current fix:

- `src/entities/tank.js`
  - tank now exposes `vehicleType = "tank"`
  - tank MG uses direct `fireRifleAtTank()` when the selected target is a vehicle
- `src/entities/humvee.js`
  - humvee MG uses direct `fireRifleAtTank()` when the selected target is a vehicle
- `src/systems/game-player-control.js`
  - player-controlled tank/humvee MG target search now includes enemy vehicles
- `src/main.js`
  - player gun direct target search now includes enemy tanks and humvees
  - player gun fire uses direct anti-vehicle path when the chosen target is a vehicle
- `src/ai/tank-ai.js`
  - tank AI machine gun target search now includes enemy vehicles
- `src/ai/humvee-ai.js`
  - humvee AI target search now includes enemy tanks and enemy humvees
- `src/systems/combat.js`
  - anti-vehicle small-arms damage now distinguishes tank versus humvee targets
  - vehicle-mounted MG damage is stronger against light vehicles while still only chip-damaging tanks

Current behavior:

- Tank MG can directly acquire and damage tanks and humvees.
- Humvee MG can directly acquire and damage tanks and humvees.
- Player machine gun can directly acquire and damage tanks and humvees.
- Humvee takes meaningful sustained MG chip damage.
- Tank still only takes limited MG chip damage, but it is no longer treated as effectively invulnerable.

### 3. AI pacing / stop-start regression

Root cause:

- Infantry movement tempo pauses were allowed during ordinary long-distance movement states such as `advance` and `secure`.
- That produced unnecessary observation pauses even when there was no active threat and the objective was still far away.

Current fix:

- `src/ai/infantry-ai.js`
  - increased move burst duration
  - reduced observation pause duration
  - restricted movement tempo use to cases where at least one of these is true:
    - there is an active threat
    - the unit is already near the objective
    - the unit is in recon movement

Current behavior:

- Units no longer pause during long uncontested approach movement.
- Near-objective caution and recon pacing remain intact.
- Contact-driven observation pauses remain intact.

## Verification evidence

### Core checks

- `npm run check`
  - PASS
- `npm run check:online`
  - PASS
  - final release-gate smoke was re-verified after rebase with the combat-only WebSocket/helper contract restored
  - retained `wsLobbyGuards=not_joined/locked`
  - retained `wsPlayerState3pSameTeam=3p`
  - retained `ws4v4=8p/8ready`
- `node tools/check-p0-11d-3p-same-team-sync.cjs`
  - PASS
  - current browser gate still renders 3 human players with same-team remote preservation intact
- `node tools/check-p0-team-damage-full-path.cjs`
  - PASS
  - same-team small-arms, projectile, explosion, and stat-pollution guards remained intact after the P1 vehicle/MG changes

### Vehicle / anti-vehicle proof

- `node tools/check-anti-vehicle-balance.cjs`
  - PASS
  - tank bailout check: PASS
  - humvee bailout check: PASS
  - machine gun check: PASS

Recorded evidence from the final PASS run:

- humvee bailout:
  - `lastBailout.player = true`
  - `lastBailout.crew = true`
  - `lastBailout.passengers >= 1`
  - player no longer mounted after destruction
  - crew no longer mounted after destruction
- direct anti-vehicle machine gun targeting:
  - humvee MG target acquired enemy humvee
  - tank MG target acquired enemy tank
  - player MG target acquired enemy humvee
- measured direct chip damage in the PASS run:
  - humvee MG -> humvee: `21.3`
  - tank MG -> tank: `2.88`
  - player MG -> humvee: `3.9`
- damage model values used by the final PASS run:
  - infantry MG -> tank: `0.14`
  - infantry MG -> humvee: `0.65`
  - vehicle MG -> tank: `0.24`
  - vehicle MG -> humvee: `1.45`

### AI pacing proof

- `node tools/check-ai-pacing-regression.cjs`
  - PASS

Recorded evidence from the final PASS run:

- config:
  - `moveBurstMin = 1.9`
  - `moveBurstMax = 3.2`
  - `observePauseMin = 0.18`
  - `observePauseMax = 0.4`
- behavioral proof:
  - far uncontested advance tempo: `false`
  - far uncontested pause application: `false`
  - near-objective tempo: `true`
  - contact tempo: `true`
  - contact pause application: `true`
  - recon tempo: `true`

## Final decision

- `vehicle escape on explosion`: CLOSED for current humvee/player/crew/passenger destruction path.
- `vehicle machine gun damage too weak / no damage`: CLOSED as a bug path; remaining future work is balance tuning only if live play suggests a different damage curve.
- `AI pacing / awkward stop-start`: CLOSED for the identified long-approach regression.

## Deployment endpoints verified at report time

- GitHub Pages player entry:
  - `https://pepeant.github.io/Iron-Line---2D-Tank-Prototype/index.html`
- GitHub Pages admin entry:
  - `https://pepeant.github.io/Iron-Line---2D-Tank-Prototype/admin.html`

Verification note:

- Both URLs returned HTTP `200` during the final release pass on 2026-05-24.
