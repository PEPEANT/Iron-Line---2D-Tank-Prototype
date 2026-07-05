# Empty-Slot BotCommander Skeleton First Pass Report - 2026-05-22

## Decision

PASS: empty-slot `BotCommander` skeleton first pass is in place.

This pass creates only the safe structure for empty commander slots to issue basic bot-sourced orders through the existing command pipeline. It does not implement full bot commander decision-making, AI V2, tactical maps, learning, 50vs50 expansion, UGC, city/open-world work, broad online redesign, or server-authority combat.

## Scope

- Added `BotCommanderSkeleton`.
- Empty `controllerType: bot` slots can issue slow basic role commands.
- Bot commands use the existing `CommandBus` packet shape.
- Bot commands target squad/asset leaders through the existing slot asset ownership.
- Human-owned slots remain protected and are not treated as bot slots.
- `controllerType: empty` slots do not issue bot commands.

## Implementation

| Area | Result |
| --- | --- |
| Runtime system | Added `src/systems/bot-commander.js`. |
| Script loading | Added `src/systems/bot-commander.js` after `command-bus.js` in `index.html`. |
| Game wiring | `Game` now creates `game.botCommander` and updates it during the AI commander phase. |
| Reset behavior | Bot skeleton state resets with match command state. |
| CommandBus metadata | Bot packets preserve `controllerType: bot`, `commandSource: bot`, and `commandReason`. |
| Permission guard | Bot orders are accepted only for empty slots whose `controllerType` is `bot` and whose issuer is `bot:<slotId>`. |
| Observability | Observer/admin role-slot snapshots expose `controllerType` and `botCommanderState`. |

## Role Commands

The skeleton only exposes basic role command rotations:

| Role | Basic bot commands |
| --- | --- |
| Infantry | `move`, `defend`, `rally` |
| Engineer | `repair`, `defend`, `rally` |
| Recon | `scan`, `defend`, `rally` |
| Armor | `fire_support`, `defend`, `rally` |

The update cadence is intentionally slow, with per-slot timing in the 5-15 second range after an initial short stagger. This is not a tactical AI doctrine system.

## Verification

Command run:

```powershell
node tools\check-bot-commander-skeleton.cjs
```

Result: PASS.

| Check | Evidence | Result |
| --- | --- | --- |
| Human slot priority | `blue-infantry` had `controllerType: human`; `bot.isBotSlot()` returned `false`. | PASS |
| Human slot bot command rejection | `issueForSlot(blue-infantry)` returned `reason: not-bot-slot`. | PASS |
| Empty bot slot detection | `blue-engineer` had no `playerId`, `controllerType: bot`, and owned `B-SQD-1`. | PASS |
| Bot command accepted | `blue-engineer` bot issued `repair`; result accepted. | PASS |
| Same command packet family | Accepted packet carried `packetControllerType: bot` and `packetSource: bot`. | PASS |
| Squad leader receives order | `B-SQD-1` reached `commandState: repair`. | PASS |
| Command metadata visible | `commandSource: bot`, `commandReason: repair`, `commanderSlotId: blue-engineer`. | PASS |
| Command lock visible | `commandLockRemaining: 2.3998s`. | PASS |
| Squad leader id visible | `squadLeaderId: B-ENG-1`. | PASS |
| Empty slot guard | For a forced `controllerType: empty` slot, command returned `reason: not-bot-slot`. | PASS |
| Observer visibility | `blue-engineer` observer slot exposed `controllerType: bot` and `botCommanderState.lastCommandType: repair`. | PASS |

## Smoke Output Summary

- URL: `http://127.0.0.1:4198/index.html`
- Build: commit `0d84ac5c0a44`, branch `main`
- Tested bot slot: `blue-engineer`
- Target squad: `B-SQD-1`
- Command: `repair`
- Source: `bot`
- Lock remaining: about `2.4s`

## Files Changed In This Pass

- `index.html`
- `src/main.js`
- `src/systems/bot-commander.js`
- `src/systems/command-bus.js`
- `src/systems/game-session-state.js`
- `src/systems/observer-bridge.js`
- `src/systems/admin-ops.js`
- `tools/check-bot-commander-skeleton.cjs`

## Remaining Guardrails

- Do not expand this into full bot commander decision-making yet.
- Do not start AI V2, tactical maps, cover nodes, learning, UGC, city/open-world, 50vs50, or server-authority combat from this pass.
- A human entering a role slot must continue to disable bot control for that slot.
- Bot orders must continue to go through `CommanderSlot -> SquadLeader / AssetLeader -> Unit`, never direct individual unit control.

## Next Recommended Gate

Run a narrow **empty-slot BotCommander skeleton stability gate** before moving to any real bot commander behavior:

- Confirm bot commands do not steal human slots.
- Confirm `human / bot / empty` slot transitions remain stable.
- Confirm online command sync and FPS + command integration still pass.
- Confirm bot command logs and observer/admin snapshots remain readable.
