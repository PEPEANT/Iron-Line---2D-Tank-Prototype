# Online Commander-Order Stability Gate Report - 2026-05-22

Decision: PASS. The next stage may move to the human FPS combat loop first pass.

This gate verified the first-pass online commander-order sync in multiplayer-like browser conditions. It also fixed one directly related bug found during the gate. This pass did not start FPS combat, `BotCommander`, AI V2, 50vs50, UGC, city/open-world work, or server-authority combat redesign.

## Environment

| Item | Value |
| --- | --- |
| Local server | `http://127.0.0.1:4192/index.html` |
| Browser test room | `GATE-1779430845418` |
| Smoke rooms | `SMOKE-1779430793988`, `SMOKE-1779431010018` |
| Clients | two Playwright browser tabs |
| Client A | `gate-blue`, `blue-infantry`, role `infantry` |
| Client B | `gate-red`, `red-armor`, role `armor` |
| Commands tested in browser | infantry `assault`, armor `fire_support` |
| Automated smoke | `npm run check:online` |

## Gate Result Table

| Check | Evidence | Result |
| --- | --- | --- |
| 2+ clients in same room | Two browser tabs joined the same room id `GATE-1779430845418`. | PASS |
| Different roles | Client A was `blue-infantry`; Client B was `red-armor`. | PASS |
| Role asset ownership | Client A owned infantry squad `B-SQD-3`; Client B owned armor vehicle `R-05`. | PASS |
| Authorized infantry command | `gate-blue` submitted `assault` against `B-SQD-3`; local result accepted with `commandState: assault`. | PASS |
| Authorized armor command | `gate-red` submitted `fire_support` against `R-05`; local result accepted with `commandState: cover`. | PASS |
| Unauthorized infantry vehicle command | `gate-blue` tried `fire_support` from `blue-infantry`; rejected with `role-command-restricted`. | PASS |
| Unauthorized cross-slot command | `gate-red` tried to command `blue-infantry`; rejected with `command-authority-required`. | PASS |
| Wrong target / duplicate / stale / cancel | `npm run check:online` covers wrong-team target rejection, duplicate `commandId`, stale command rejection, and online `cancel` state. | PASS |
| Command broadcast to other client | Remote client saw accepted room commands after refresh. | PASS |
| Remote command log | Remote `CommandBus` log recorded the received command as accepted after the fix. | PASS |
| Remote command marker | Remote `commandPings` included the received infantry/armor command marker. | PASS |
| Remote AI command state | Remote squad `B-SQD-3` reached `commandState: assault`; remote vehicle `R-05` held `manualOrder.commandState: cover`. | PASS |
| Remote command lock data | Remote AI state exposed `commandLockUntil`; issuing clients also showed active lock remaining during inspection. | PASS |
| World-host command consistency | Accepted room commands applied on the non-issuing browser without diverging into `no-assets` after the fix. | PASS |

## Bug Found And Fixed

During the first two-browser pass, the remote client could see the room command but rejected it locally with `no-assets` if its local slot asset list differed from the issuing client. This made online command broadcast visible but not reliably applied to remote AI state.

Fix:

- `src/main.js`: `applyOnlineCommand()` now marks accepted remote commands as `trustedRemote`.
- `src/systems/command-bus.js`: remote trusted commands may resolve explicit `targetSquadId` / `targetAssetId` by id even if the receiving client's local slot asset list differs, while still enforcing role permission and team checks.

This keeps local player commands restricted by the local slot asset list, but lets server/room-accepted remote commands apply consistently by their explicit target ids.

## Browser Evidence

| Direction | Evidence | Result |
| --- | --- | --- |
| Blue infantry -> Red client | `B-SQD-3` remote state: `commandState: assault`, `commandSource: player`, `commandReason: assault`, `commanderSlotId: blue-infantry`, matching command ping present. | PASS |
| Red armor -> Blue client | `R-05` remote state: `manualOrder.commandState: cover`, commander assignment `commandSource: player`, `commandReason: fire_support`, `commanderSlotId: red-armor`, matching command ping present. | PASS |

## Verification Runs

```text
node --check src/systems/command-bus.js
node --check src/main.js
npm run check
npm run check:online
```

Latest online smoke:

```text
Online smoke passed: SMOKE-1779431010018, players=2, combat=1, commands=3, ws=hello/join_result/observer_snapshot, wsCommand=ack/broadcast
```

`npm run check` passed. It still reports existing hotspot warnings for large files; no new blocker was introduced by this gate.

## Remaining Notes

- This gate verifies online commander-order delivery/application/state visibility, not full server-authoritative combat.
- The next stage should be `human FPS combat loop first pass`.
- Do not move to `BotCommander`, AI V2, 50vs50, UGC, city/open-world, or server-authority combat work before the FPS loop and FPS + command integration QA.
