# Commander Order QA Interim Report - 2026-05-22

This is an interim checkpoint, not a completion report. It records what has been proven so far in local live play and what still needs evidence before advancing to online command synchronization.

## Current Verification Environment

- Execution URL: `http://127.0.0.1:4173/index.html`
- Test mode: local/offline live play through Playwright + Chrome.
- Browser executable: `C:/Program Files/Google/Chrome/Application/chrome.exe`
- Tested roles: `infantry`, `engineer`, `recon`, `armor`.
- Tested role-special commands:
  - `infantry`: `assault`
  - `engineer`: `repair`
  - `recon`: `scan`
  - `armor`: `fire_support`
- Evidence sources:
  - `game.commandBus.log`
  - live `SquadAI` state on squad objects
  - live vehicle commander assignment / `manualOrder`
  - `game.aiObservatory.latest()`
  - command radio UI click smoke for all four role-special commands
  - screenshots saved under `C:\Users\rneet\Documents\Codex\2026-05-22\codex-threads-019e4849-e426-7b73-826f`

## Command Flow Check

The full role-special UI path is now proven for all four tested commands:

- `CommandRadio` special button click -> `submitLocalCommand` -> `CommandBus` -> `SquadAI` or vehicle asset leader.
- Verified samples: `assault`, `repair`, `scan`, `fire_support`.

| Flow Item | Evidence | Status |
| --- | --- | --- |
| Live battle entry | Playwright reached `matchStarted === true` for each role scene | pass |
| Role selected before deployment | `assignPlayerToSlot()` returned true for each tested role | pass |
| Role-special command available in radio UI | `#commandSpecials [data-command-type]` showed each special command enabled | pass |
| `submitLocalCommand` called | Verified through live radio click for all four role-special commands | pass |
| `CommandBus` received command | `game.commandBus.log` showed accepted command entries | pass |
| Squad / asset leader received command | squad command fields or vehicle assignment fields updated | pass |
| `commandState` generated | observed on squad or vehicle assignment | pass |
| `commandSource` / `commandReason` visible | observed as `player` and command type | pass |
| `commandLockUntil` / lock duration visible | observed through `commandLockRemaining` | pass |

## Role Progress Table

| Role | Command | Target squad/asset | State visible | Lock works | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Infantry | `assault` | `B-SQD-3` from `blue-infantry` | yes: squad + observatory showed `assault`, `player`, `assault`, `blue-infantry` | yes: about 1.36s remaining at 1.4s sample; UI click sample had about 2.22s remaining after click | pass | Verified via actual command radio special button click. |
| Engineer | `repair` | `B-SQD-1` from `blue-engineer` | yes: squad + observatory showed `repair`, `player`, `repair`, `blue-engineer` | yes: UI click retest had about 0.93s remaining after 1.4s | pass | Verified via actual command radio special button click. |
| Recon | `scan` | `B-SQD-6` from `blue-recon` | yes: squad + observatory showed `scout`, `player`, `scan`, `blue-recon` | yes: UI click retest had about 0.91s remaining after 1.4s | pass | Verified via actual command radio special button click. |
| Armor | `fire_support` | `B-12` from `blue-armor` | yes: vehicle assignment + observatory showed `cover`, `player`, `fire_support`, `blue-armor` | yes: UI click retest had about 0.50s remaining after 1.4s | pass | Direct bugs fixed: automatic combined-arms assignment no longer overwrites manual tanks; vehicle-only armor slot now auto-selects the armor radio channel. |

## Issues Found

- Role special commands existed as command types but were not wired into role permissions or the command radio special UI.
  - Fixed in this pass.
- Manual armor commands could be overwritten by automatic `CommanderAI.applyCombinedArmsOrders()` support assignment.
  - Fixed in this pass by excluding manual tanks from combined-arms tank candidates.
- Vehicle command state was not visible in observatory / observer snapshots.
  - Fixed in this pass by exposing vehicle `commandState`, `commandSource`, `commandReason`, `commandLockRemaining`, and `commanderSlotId`.
- The first broad QA script attempted squad commands using invalid squad coordinates and produced false `missing-point` results.
  - Retested with squad center coordinates; role-special commands then passed.
- Armor command radio UI initially showed `fire_support` but kept the default infantry channel, leaving no selected armor asset and no command log entry.
  - Fixed in this pass by auto-selecting the armor radio channel when the current slot has vehicles but no squads.

## Fix Now vs Later

Fix now / already fixed:

- Role-special command permission mapping.
- Command radio special button wiring.
- Manual armor command being overwritten by automatic combined-arms orders.
- Vehicle command metadata visibility in observatory / observer bridge.
- Vehicle-only armor slot radio channel selection.

Keep for this offline gate, but not yet done:

- The rest of each role's three intended commands.
- Stopped-state clarity: waiting, regrouping, covering, repairing, scouting, blocked, stuck.
- Vehicle spawn overlap, front-vehicle pushing, narrow-passage waiting, and stuck logging evidence.
- Squad scattering and permanent stopped-state checks.

Defer out of scope:

- Online command synchronization.
- Human FPS combat loop.
- Full `BotCommander` behavior.
- AI V2 / tactical map / cover nodes.
- 50vs50 expansion.
- UGC.
- City/open-world work.
- Server-authority combat redesign.

## Next Action Recommendation

Continue verification. Do not advance to online command synchronization yet.

Recommended next checks:

1. Verify the remaining first-pass role commands beyond the one role-special sample.
2. Capture stopped-state and vehicle/stuck evidence.
3. Fix only direct breakage found during those checks.
4. Close the offline command stability gate only after the evidence table covers the required local checks.

## 2026-05-22 Correction Pass Evidence

| Role | UI click command | Target | Evidence | Result |
| --- | --- | --- | --- | --- |
| Engineer | `repair` | `B-SQD-1` | command log accepted `repair`; squad and observatory showed `repair`, `player`, `repair`, `blue-engineer`; no console errors | pass |
| Recon | `scan` | `B-SQD-6` | command log accepted `scan`; squad and observatory showed `scout`, `player`, `scan`, `blue-recon`; no console errors | pass |
| Armor | `fire_support` | `B-12` | after channel fix, radio panel used `armor`, selected `B-12`, command log accepted `fire_support`; assignment and observatory showed `cover`, `player`, `fire_support`, `blue-armor`; no console errors | pass |

Correction pass screenshots:

- `C:\Users\rneet\Documents\Codex\2026-05-22\codex-threads-019e4849-e426-7b73-826f\offline-command-engineer-repair-ui-click-qa.png`
- `C:\Users\rneet\Documents\Codex\2026-05-22\codex-threads-019e4849-e426-7b73-826f\offline-command-recon-scan-ui-click-qa.png`
- `C:\Users\rneet\Documents\Codex\2026-05-22\codex-threads-019e4849-e426-7b73-826f\offline-command-armor-fire-support-ui-click-qa-2.png`
