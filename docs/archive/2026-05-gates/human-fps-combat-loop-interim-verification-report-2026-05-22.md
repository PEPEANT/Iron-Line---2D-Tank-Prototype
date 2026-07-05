# FPS Combat Loop Interim Verification Report - 2026-05-22

## Purpose

This is an interim checkpoint, not a completion report.

The goal is to verify that the first-pass human FPS combat loop works in play and that death / damage causes remain readable before moving to FPS + command integration QA.

## Test Environment

- URL used for live runtime evidence: `http://127.0.0.1:4194/index.html`
- Test mode: local browser live runtime, plus Node VM engine smoke for vehicle contact damage
- Scenario: forced local conquest live state for respawn verification
- Clients: one local browser client for FPS runtime checks
- Evidence sources:
  - Browser runtime state evaluation
  - `playerHitConfirmations`
  - `playerDamageIndicators`
  - `battlefieldEvents`
  - `chat.messages`
  - `CommandBus` result from `submitLocalCommand()`
  - player HP / ammo / death / respawn state
  - Node VM smoke for `resolveInfantryTankSpacing()` vehicle contact damage

## 1. Basic Combat Loop

| Check | Evidence | Result |
| --- | --- | --- |
| Movement | Player moved from `(1400, 1400)` to `(1438.75, 1400)` with `KeyD` over `0.25s`. | PASS |
| Aiming | Player angle stayed finite and pointed toward the test target. | PASS |
| Shooting | `usePlayerEquipment()` returned `true` with machinegun selected. | PASS |
| Reload / ammo flow | Machinegun ammo changed `120 -> 119`; weapon cooldown and ammo readout exist. Infantry does not currently use a magazine-reload model. | PARTIAL / BY DESIGN |
| Taking damage | `applyPlayerDamage(18)` changed HP `100 -> 82`. | PASS |
| Death | Lethal damage entered downed state, then death-active state after reveal delay. | PASS |
| Respawn / round flow | `respawnPlayerForConquest(true)` restored alive state, HP `100`, and cleared death/downed flags. | PASS |

## 2. Death / Damage Cause Verification

| Cause | Evidence | Result |
| --- | --- | --- |
| Gunfire | Local small-arms hit produced HIT / DOWN confirmation and kill log entry `Player eliminated FPS-KILL-1 (machinegun)`. | PASS |
| Direct shell hit | Projectile direct-hit code path routes infantry/player hit damage through `applyPlayerDamage()` with shell / RPG labels. | PASS / CODE PATH |
| Explosion radius damage | `damageRadius()` routes HE / RPG / grenade / explosion splash damage to infantry and player through `applyPlayerDamage()`. | PASS / CODE PATH |
| Vehicle collision | Node VM smoke: high-speed humvee contact produced `vehicle_collision` damage `29.15`; infantry HP became `25.85`. | PASS / ENGINE SMOKE |
| Tank track / crush | Node VM smoke: red tank speed `100` vs blue infantry produced `tank_crush` damage `23.93`; red tank speed `120` vs player produced `tank_crush` damage `27.96` with player label `전차 압사`. | PASS / ENGINE SMOKE |

## 3. Vehicle / Tank Damage Balance

| Check | Evidence | Result |
| --- | --- | --- |
| Low-speed contact is not instant death | Node VM smoke: red tank speed `8` contact produced no infantry damage and no `lastVehicleImpact`. | PASS |
| High-speed collision causes damage | Node VM smoke: humvee speed `145` produced `vehicle_collision`; tank speed `100` produced `tank_crush`. | PASS |
| Tank crush requires meaningful contact | Vehicle contact damage uses speed, contact depth, contact duration, and in-path checks before applying `tank_crush`. | PASS / CODE PATH |
| Anti-tank assault is not invalidated by touch death | Node VM smoke: `tank-assault-climb` infantry with reserved `infantryAssault` at tank speed `40` took no contact damage. | PASS |
| Friendly contact does not farm friendly AI/player | Node VM smoke: same-team tank contact against player produced no damage in this first pass. | PASS |

## 4. Hit / Damage Feedback

| Check | Evidence | Result |
| --- | --- | --- |
| Player can see hits landed | Non-lethal shot produced `HIT`; lethal shot produced `DOWN`. | PASS |
| Hit marker detail | Lethal marker recorded amount `5.003`, `ttl 0.78`, `lethal: true`. | PASS |
| Player can see incoming damage | Damage indicator recorded label `test hit`, amount `18`. | PASS |
| Damage direction | `playerDamageIndicators` includes source angle from damage source to player. | PASS |
| Health feedback | Runtime HP changed `100 -> 82`. | PASS |
| Kill log | `battlefieldEvents` and chat recorded `Player eliminated FPS-KILL-1 (machinegun)`. | PASS |
| Death reason | Lethal damage recorded a death reason and entered the death screen state. Vehicle contact uses `vehicle_collision` / `tank_crush` labels. | PASS |

## 5. Command / Combat Collision

| Check | Evidence | Result |
| --- | --- | --- |
| Command while fighting | `submitLocalCommand("assault")` returned accepted during live combat state. | PASS |
| Command target | Command targeted `B-SQD-3`. | PASS |
| Movement while command tools exist | Movement worked with command systems active. | PASS |
| Return to combat after command | Runtime remained live and player state stayed controllable after command submission. | PASS |
| Command UI does not block aim/fire | Not fully proven by this interim runtime check. This remains the main FPS + command integration QA item. | NEEDS QA |
| Role/loadout separation | Command slot stayed `infantry`; player class/loadout stayed `infantry / machinegun`. | PASS |

## Verification Commands

- `node --check src/main.js` PASS
- `node --check src/systems/physics.js` PASS
- `npm run check` PASS
- `npm run check:online` PASS
  - Latest output: `Online smoke passed: SMOKE-1779433054708, players=2, combat=1, commands=3, ws=hello/join_result/observer_snapshot, wsCommand=ack/broadcast`
- `git diff --check` PASS with CRLF warnings only
- Node VM vehicle-contact smoke PASS:
  - Low-speed tank contact: HP `55`, no impact record
  - High-speed tank contact: HP `31.07`, `tank_crush`, damage `23.93`
  - Anti-tank assault contact: HP `55`, no impact record
  - High-speed humvee contact: HP `25.85`, `vehicle_collision`, damage `29.15`
  - Player tank crush: HP `72.04`, `tank_crush`, label `전차 압사`
  - Friendly contact: HP `100`, no damage

## Current Issues / Notes

- Infantry reload is currently cooldown/ammo-flow based, not magazine-reload based. This is acceptable for the current pass, but future FPS polish should decide whether infantry gets true magazine reload.
- Command UI blocking was not exhaustively tested through physical mouse/keyboard pacing in this interim report. That belongs in FPS + command integration QA.
- Online combat remains event-flow based. Full server-authority hit validation is still out of scope.
- Vehicle contact damage is conservative: enemy contact can damage by speed / mass-like vehicle kind / contact depth / contact time, same-team contact is push-only, and anti-tank assault contact is protected from touch death.

## 6. Current Judgment

ON TRACK.

The direct FPS loop works and visibly feeds back movement, aiming, firing, ammo flow, hit confirmation, damage, death, respawn, kill events, and first-pass vehicle / tank death causes. No blocker was found for the FPS combat loop itself.

The remaining risk is not the FPS loop alone; it is whether command UI pacing can coexist with aiming and firing in live play. That should be handled in **FPS + command integration QA**, not by starting BotCommander, AI V2, 50vs50, UGC, city/open-world work, or server-authority rewrites.

## Next Step

Proceed to **FPS combat loop report-based narrow fix pass** only if the team wants to change reload behavior or add more live UI pacing evidence now.

Otherwise, proceed to **FPS + command integration QA** with command UI collision as the main risk.
