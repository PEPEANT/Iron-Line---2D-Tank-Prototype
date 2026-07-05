# Human FPS Combat Loop First Pass Report - 2026-05-22

## Decision

PASS: move to FPS + command integration QA.

This pass stayed inside scope. It did not start BotCommander, AI V2, 50vs50, UGC, city/open-world work, a loadout overhaul, or a full server-authority combat rewrite.

## Changes

- Added player hit confirmation state in `src/main.js`.
- Added world-space HIT / DOWN confirmation rendering in `src/systems/renderer.js`.
- Wired local infantry gun hits to hit confirmation in `src/systems/combat.js`.
- Wired online small-arms hit events from the local shooter to hit confirmation in `src/main.js`.
- Allowed local `score_kill` battlefield events to echo through the existing chat feed in `src/systems/battlefield-events.js`.
- Improved local kill-event detail text to include killer, victim, and weapon/kind.
- Added first-pass vehicle contact damage in `src/systems/physics.js`: low-speed contact stays mostly push/soft damage, high-speed vehicle impact and sustained tank track contact can damage or kill, and anti-tank assault contact is protected from instant touch death.
- Added player damage labels for `vehicle_collision` and `tank_crush` in `src/main.js`.

## Verification Environment

- URL: `http://127.0.0.1:4194/index.html`
- Mode: local browser live runtime, forced conquest live state for respawn verification
- Browser: Codex in-app Playwright page
- Server: `node tools/static-server.cjs 4194`

## Manual Runtime Evidence

| Check | Evidence | Result |
| --- | --- | --- |
| Movement | Player moved from `(1400, 1400)` to `(1438.75, 1400)` with `KeyD` over `0.25s`. | PASS |
| Aiming | Player angle remained finite and aimed toward the target. | PASS |
| Firing / ammo flow | `usePlayerEquipment()` returned `true`; machinegun ammo changed `120 -> 119`. | PASS |
| Hit confirmation | Non-lethal shot created `HIT`; lethal shot created `DOWN`, amount `5.003`, `ttl 0.78`. | PASS |
| Kill log | `score_kill` event and chat message recorded: `Player eliminated FPS-KILL-1 (machinegun)`. | PASS |
| Damage feedback | `applyPlayerDamage(18)` changed HP `100 -> 82` and created a damage indicator with label `test hit`. | PASS |
| Death feedback | Lethal damage entered downed state, then death screen state after reveal delay with death reason. | PASS |
| Shell / explosive death cause | Existing projectile direct-hit and splash paths route player damage through `applyPlayerDamage()` with shell / RPG / HE / explosion labels. | PASS / CODE PATH |
| Vehicle collision / tank crush cause | Node VM smoke verified red tank contact damage against infantry and player with `tank_crush` label/death reason. | PASS / ENGINE SMOKE |
| Anti-tank assault exception | Node VM smoke verified `tank-assault-climb` infantry did not die or take contact damage from low-speed tank contact. | PASS |
| Respawn | `respawnPlayerForConquest(true)` restored alive state, HP `100`, and cleared death/downed state. | PASS |
| Command while fighting | `submitLocalCommand("assault")` accepted during live combat state against `B-SQD-3`. | PASS |
| Role/loadout separation | Command slot role stayed `infantry`; player class/loadout stayed `infantry / machinegun`. | PASS |

## Automated Checks

- `node --check src/main.js` PASS
- `node --check src/systems/combat.js` PASS
- `node --check src/systems/physics.js` PASS
- `node --check src/systems/renderer.js` PASS
- `node --check src/systems/battlefield-events.js` PASS
- Node VM vehicle-contact smoke PASS:
  - Red tank speed `8` vs blue infantry produced no damage or impact record.
  - Red tank speed `100` vs blue infantry produced `tank_crush` damage `23.93`; unit survived with HP `31.07`.
  - Red humvee speed `145` vs blue infantry produced `vehicle_collision` damage `29.15`; unit survived with HP `25.85`.
  - `tank-assault-climb` infantry with reserved `infantryAssault` contact at tank speed `40` took no contact damage.
  - Red tank speed `120` vs player produced `tank_crush` player damage `27.96` and death reason label `전차 압사`.
  - Same-team tank contact against player produced no damage in this first pass.
- `npm run check` PASS
- `npm run check:online` PASS
  - Latest output: `Online smoke passed: SMOKE-1779433054708, players=2, combat=1, commands=3, ws=hello/join_result/observer_snapshot, wsCommand=ack/broadcast`
- `git diff --check` PASS with existing CRLF warnings only.

## Notes

- Reload is currently represented as weapon cooldown / ammo flow for infantry, not a full magazine reload system. This pass did not redesign loadouts or introduce a magazine model.
- Online combat remains event-flow based. Full server-authority hit validation is still intentionally out of scope.
- The next stage should verify the combined experience: FPS inputs and quick command inputs together under normal play pacing.

## Next Step

Proceed to **FPS + command integration QA**.
