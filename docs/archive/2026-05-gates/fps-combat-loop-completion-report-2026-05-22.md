# FPS Combat Loop Completion Report - 2026-05-22

## Decision

PASS: move to **FPS + command integration QA**.

This report closes the current FPS loop stage. It does not start `BotCommander`, AI V2, 50vs50, UGC, city/open-world work, broad loadout redesign, or full server-authority combat.

## Test Environment

| Item | Evidence |
| --- | --- |
| Runtime URL | Prior live runtime from this FPS stage used `http://127.0.0.1:4194/index.html`. Current close-out used VM smokes plus project / online smoke checks. |
| Test mode | Local/offline FPS runtime evidence from first-pass report, targeted VM smokes for damage / awareness, and online command/combat smoke. |
| Browser / server | Prior Codex Playwright page plus `node tools/static-server.cjs 4194`; current automated close-out used Node scripts and `tools/check-online-smoke.cjs`. |
| Smoke/manual sources | `human-fps-combat-loop-first-pass-report-2026-05-22.md`, `fps-combat-loop-fix-balance-pass-2026-05-22.md`, `fps-fix-balance-interim-verification-report-2026-05-22.md`, `fps-fix-balance-correction-pass-2026-05-22.md`, `fps-ai-rear-awareness-correction-pass-2026-05-22.md`. |

## Basic Combat Loop

| Check | Evidence | Result |
| --- | --- | --- |
| Movement | First-pass live runtime moved the player from `(1400, 1400)` to `(1438.75, 1400)` with `KeyD`. | PASS |
| Aiming | First-pass live runtime kept player angle finite and aimed at the target. | PASS |
| Firing | First-pass live runtime `usePlayerEquipment()` returned true. | PASS |
| Reload / cooldown / ammo flow | Machinegun ammo changed `120 -> 119`; infantry reload HUD duplicate cleanup passed code and smoke checks. | PASS |
| Hit feedback | First-pass runtime created `HIT` and lethal `DOWN` confirmations. | PASS |
| Damage feedback | `applyPlayerDamage(18)` changed HP `100 -> 82` and produced a damage indicator. | PASS |
| Death | Lethal damage entered downed state and then death screen state after reveal delay. | PASS |
| Respawn / round flow | `respawnPlayerForConquest(true)` restored alive state, HP, and cleared death/downed state. | PASS |

## Damage / Death Causes

| Cause | Evidence | Result |
| --- | --- | --- |
| Gunfire | Rifle / MG damage routes through `applyPlayerDamage()` / hit confirmation and kill log from first-pass report. | PASS |
| Direct shell hit | Projectile direct-hit path routes player damage with shell / projectile labels. | PASS |
| Explosion radius | Blast path routes RPG / HE / grenade / explosion labels through player damage. | PASS |
| Vehicle collision | Physics contact path records `vehicle_collision` for fast vehicle impact. | PASS |
| Tank crush | Physics contact path records `tank_crush` for sustained / track crush contact. | PASS |
| Kill log / death reason | First-pass report recorded kill event and death reason text; vehicle labels added in `main.js`. | PASS |

## Vehicle / Tank Damage Balance

| Check | Evidence | Result |
| --- | --- | --- |
| Low-speed contact | VM vehicle-contact smoke from first pass: red tank speed `8` caused no infantry damage. | PASS |
| High-speed impact | VM smoke: red humvee speed `145` caused `vehicle_collision`; red tank speed `100` caused `tank_crush`. | PASS |
| Sustained tank crush | Tank crush label and damage path are present through `physics.js`. | PASS |
| Anti-tank assault protection | VM smoke: `tank-assault-climb` infantry did not die or take low-speed touch damage. | PASS |

## Suicide Drone / Anti-Drone / Difficulty

| Check | Evidence | Result |
| --- | --- | --- |
| Suicide drone terminal speed | `suicide-drone.js` now separates terminal approach speed / boost from global movement feel. | PASS |
| Terminal approach pacing | Fix + interim report mark suicide-drone pacing ON TRACK; completion carries this as PASS for the first FPS loop stage. | PASS |
| Infantry anti-drone fire | `infantry-combat-balance.js` adds distance / speed / suppression / stance / class / weapon factors. | PASS |
| Difficulty tuning | Difficulty affects reaction scale, accuracy, cooldown scale/add; it does not change pathing, command obedience, or squad tactics. | PASS |

## UI Results

| Check | Evidence | Result |
| --- | --- | --- |
| Infantry reload HUD duplicate | Standard infantry paths clear the left weapon readout / reload bar, preventing the duplicate orange bar / text issue. | PASS |
| Tank reload UI | Tank reload / ammo UI paths remain separate and unchanged. | PASS |
| Humvee weapon UI | Humvee HMG UI path remains separate and unchanged. | PASS |
| Health / damage / kill / death feedback | First-pass runtime evidence covered damage indicator, HP change, kill log, downed/death state, and death reason. | PASS |

## AI Awareness Results

| Check | Evidence | Result |
| --- | --- | --- |
| Infantry rear awareness | VM smoke: front delay `0.28s`, rear delay `1.0s`, easy rear delay `1.22s`; rear reaction is slower than front reaction. | PASS |
| Infantry rear gunfire suspicion | VM smoke: rear-facing observer does not visually see shooter; rear gunfire returns `gunfire_suspicion` instead of exact target. | PASS |
| Infantry hit reaction uncertainty | VM smoke: rear hit returns `hit_reaction` as an uncertain threat point unless visually confirmed or ally-reported. | PASS |
| Tank turret / hull awareness | VM smoke: front target visible, rear unreported target not visible, rear reported target usable. | PASS |
| Tank gunfire / hit search | VM smoke: tank registers suspicion, enters `search`, keeps suspicion timer, and rotates turret toward the search point. | PASS |
| Humvee gun / hull awareness | VM smoke: front target visible, rear unreported target not selected, rear reported target usable. | PASS |
| Humvee gunfire / hit search | VM smoke: humvee registers suspicion, enters `search`, keeps suspicion timer, and rotates gun toward the search point. | PASS |

## Regression

| Check | Evidence | Result |
| --- | --- | --- |
| `commandState` / `commandLockUntil` | `npm run check:online` command smoke still passes with 3 commands and WebSocket ack/broadcast. | PASS |
| Command UI / radio | No command UI files were changed in the rear-awareness close-out; previous command gates remain PASS. | PASS |
| Anti-tank assault | Low-speed touch death is still protected by physics contact rules; awareness changes do not touch assault state handling. | PASS |
| Online command flow | Latest online smoke: `SMOKE-1779436133526`, players=2, combat=1, commands=3, WebSocket command ack/broadcast. | PASS |

## Automated Checks

- `node --check src/systems/awareness-signals.js` PASS.
- `node --check src/systems/combat.js` PASS.
- `node --check src/ai/tank-ai.js` PASS.
- `node --check src/ai/humvee-ai.js` PASS.
- `npm run check` PASS.
- `npm run check:online` PASS: `SMOKE-1779436133526`.
- `git diff --check` PASS with CRLF warnings only.

## Notes

- The awareness work is still a first-pass FPS feel layer, not AI V2.
- Hearing is modeled narrowly as gunfire suspicion / hit-reaction search points. It is not yet a full building-aware audio propagation or squad search doctrine.
- Online combat remains event-flow based. Full server-authority hit validation is intentionally out of scope.

## Next Step

Proceed to **FPS + command integration QA**.
