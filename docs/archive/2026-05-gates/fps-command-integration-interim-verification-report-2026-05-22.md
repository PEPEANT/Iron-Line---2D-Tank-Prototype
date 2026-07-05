# FPS + Command Integration Interim Verification Report - 2026-05-22

## Decision

ON TRACK: continue to the report-based narrow fix pass.

No blocker was found in this interim check. The next pass should only fix direct issues found here; because this report found no blocking issue, the completion report may close the stage after final checks.

This interim report does not start empty-slot BotCommander skeleton, full BotCommander behavior, AI V2, 50vs50, UGC, city/open-world work, broad loadout redesign, or a server-authority combat rewrite.

## Test Environment

| Item | Evidence |
| --- | --- |
| Runtime URL | `http://127.0.0.1:4197/index.html` from `node tools/check-fps-command-integration.cjs`. |
| Test mode | Local/offline live runtime with headless Chrome CDP state inspection. |
| Role | `blue-infantry`, with a role/loadout switch check through `blue-armor`. |
| Command | Infantry `assault`. |
| Weapon / vehicle | Player infantry `machinegun / pistol / grenade`; no player vehicle was required for this interim scenario. |
| Logs / debug location | Runtime game state, `CommandBus` command log, squad command fields, DOM HUD/radio state. |

## Combat While Commanding

| Check | Evidence | Result |
| --- | --- | --- |
| Movement while command tools available | With the radio open, `KeyD` moved the player `50.9` world units. | PASS |
| Aim while command tools available | Runtime kept player aim state usable through `input.mouse.worldX / worldY` while command UI was available. | PASS |
| Command after firing | Player fired first; machinegun ammo changed `120 -> 119`, then the infantry `assault` command was accepted. | PASS |
| Reload / weapon HUD during command | Standard infantry HUD stayed compact: `weaponState: ""`, `reloadWidth: "0%"`. | PASS |
| Return to combat after command | Player fired again after command; machinegun ammo changed `119 -> 118`. | PASS |

## Combat While Command UI Is Open

| Check | Evidence | Result |
| --- | --- | --- |
| Hit / damage while radio open | Forced rifle damage was applied while radio was open. | PASS |
| Death while radio open | Death state reached `playerDeathActive: true`. | PASS |
| Command UI cleanup on death | Command panel changed to `command-panel command-radio-device hidden`, and `radioOpenAfter: false`. | PASS |
| Input cleanup on death | Runtime confirmed movement keys were cleared and left mouse was released. | PASS |
| HUD / radio overlap | In-app visual scene showed command radio, weapon HUD, objective bar, minimap, and radio log readable together. | PASS |

## Role / Loadout Separation

| Check | Evidence | Result |
| --- | --- | --- |
| Role switch does not change combat class | Switching `blue-infantry -> blue-armor` kept player class `infantry`. | PASS |
| Role switch does not change inventory | Inventory stayed `machinegun / pistol / grenade`. | PASS |
| Role switch does not change current weapon | Active weapon stayed `machinegun`. | PASS |
| FPS weapons and command slot coexist | Slot restored to `blue-infantry`; live combat and `assault` command both worked. | PASS |

## Human Battle Impact

| Check | Evidence | Result |
| --- | --- | --- |
| Human firing affects combat state | Player ammo changed on both fire checks, proving direct fire path remained active. | PASS |
| Human command affects AI front | `B-SQD-3` received `commandState: assault`. | PASS |
| Command lock visible | `commandLockRemaining: 2.799s` after command. | PASS |
| AI-only victory concern | Not fully judged in this interim scenario; this remains a design/balance follow-up rather than a blocker for input integration. | NOTE |

## Regression Check

| Check | Evidence | Result |
| --- | --- | --- |
| `commandState` / `commandLockUntil` | `B-SQD-3` reached `assault`; command lock remained active. | PASS |
| Online command sync | Existing online smoke remained part of the final gate checks. | ON TRACK |
| Infantry reload UI duplicate | Standard infantry readout stayed empty with `reloadBar: 0%`; no duplicate orange bar / weapon text path was observed. | PASS |
| AI rear awareness | No awareness code changed during this interim QA; previous FPS completion report remains the source of truth. | PASS |
| Suicide drone / anti-drone / vehicle collision balance | No drone or vehicle collision code changed during this interim QA; previous FPS completion report remains the source of truth. | PASS |

## Current Verdict

ON TRACK.

No direct integration bug was found that requires a code fix before the completion report. If a separate manual play session finds HUD overlap, command trapping, or role/loadout drift, handle it in the report-based narrow fix pass before closing the stage.

## Next Step

Proceed to **FPS + command integration interim report-based narrow fix pass**.

Because this interim report found no blocker, that pass may record "no direct fix required" and then proceed to the **FPS + command integration QA completion report**.
