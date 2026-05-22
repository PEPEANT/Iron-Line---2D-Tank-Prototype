# Anti-Vehicle Balance Completion Report - 2026-05-22

## Status

Verdict: PASS

The small anti-vehicle balance pass is closed. RPG firing opportunity, suicide-drone armored-vehicle damage, and tank crew/player bailout now have automated browser-smoke evidence and related regression coverage. No blocker remains from the interim report or correction pass.

Important sequence note: empty-slot BotCommander skeleton first pass was already completed before this anti-vehicle pass. After this PASS, the next stage is the empty-slot BotCommander skeleton stability gate, not redoing the skeleton first pass.

## Test Environment

- URL: `http://127.0.0.1:4199/index.html`
- Primary helper: `node tools/check-anti-vehicle-balance.cjs`
- Related helpers:
  - `npm.cmd run check`
  - `node tools/check-bot-commander-skeleton.cjs`
  - `node tools/check-fps-command-integration.cjs`
  - `npm.cmd run check:online`
- Build at test time: `cb12fad256d7`, branch `main`

## RPG Final Result

| Check | Result | Evidence |
| --- | --- | --- |
| Engineer gets RPG firing opportunity | PASS | RPG range is `1080`, desired range is `690`, projectile life is `1.86`. |
| Effective range is not too short | PASS | AI preferred range is `500-900`, pressure radius is `930`. |
| RPG is not a safe sniper weapon | PASS | Direct damage remains `82`; front armor hold range is `600`, so frontal armor shots are still discouraged. |
| Exposure / aiming time is reasonable | PASS | RPG aim window is `0.86-1.48`, reducing excessive pre-shot exposure without making it instant. |
| Tank / humvee damage is appropriate for this pass | PASS | RPG damage was not inflated; existing direct armor profile still rewards side/rear angles over frontal shots. |

## Suicide Drone Final Result

| Check | Result | Evidence |
| --- | --- | --- |
| Meaningful damage to armored vehicles | PASS | Base blast damage is `94`, tank splash scale is `0.62`, light vehicle scale is `1`. |
| Direct and near-blast damage are separated | PASS | Direct impact profile remains separate from radius damage. |
| Terminal speed is reactable | PASS | Terminal dive multiplier remains `1.36`; terminal boost multiplier remains `1.12`. |
| Not too weak, not instant-delete | PASS | Direct tank hits are front `62`, side `78`, rear `92`, boosted rear `140`; stronger but still directional and conditional. |

## Tank Crew Bailout Final Result

| Check | Result | Evidence |
| --- | --- | --- |
| Bailout window works | PASS | Retest produced a bailout/destruction window above `1.5s`. |
| Player tank bailout works | PASS | Player leaves the tank alive at reduced HP and `playerInTank` becomes `false`. |
| AI / crew bailout works | PASS | Crew leaves the tank alive, outside the vehicle, at reduced HP, with state `bailout`. |
| Escaped crew becomes weak infantry-like survivor | PASS | Escaped crew has reduced HP/speed and no immediate remount target. |
| Catastrophic explosion can fail bailout | PASS | Catastrophic path uses lower bailout chance and a shorter destruction delay. |
| Kill/death feedback path remains available | PASS | FPS damage path and battlefield bailout event remain available; no death/kill feedback regression was found in smoke. |

## Regression Confirmation

| Check | Result | Evidence |
| --- | --- | --- |
| `antiTankAssault / closeAssault` maintained | PASS | Tank assault methods remain present and the anti-vehicle smoke checks them. |
| Vehicle collision / crush balance maintained | PASS | This pass did not change vehicle crush/contact rules. |
| FPS combat loop maintained | PASS | `node tools/check-fps-command-integration.cjs` passed. |
| Command `commandState` / lock maintained | PASS | Anti-vehicle smoke confirms `game.commandBus.submit`; BotCommander skeleton smoke confirms command lock remains valid. |
| Online command path maintained | PASS | `npm.cmd run check:online` passed. |

## Final Test Results

```text
npm.cmd run check
PASS

node tools/check-anti-vehicle-balance.cjs
PASS

node tools/check-bot-commander-skeleton.cjs
PASS

node tools/check-fps-command-integration.cjs
PASS

npm.cmd run check:online
PASS
```

## Remaining Notes

No blocker remains.

The only remaining risk is live feel, not implementation correctness:

- If engineers still feel erased before firing in real play, tune RPG aim/exposure narrowly.
- If suicide drones feel unfair, adjust direct damage or terminal detection, not global movement speed.
- If bailout feels too forgiving, lower survivor HP or catastrophic survival chance, not the entire destruction flow.

## Final Decision

PASS: move to the empty-slot BotCommander skeleton stability gate.

Do not start AI V2, 50vs50, UGC, city/open-world work, or server-authority combat redesign from this point.
