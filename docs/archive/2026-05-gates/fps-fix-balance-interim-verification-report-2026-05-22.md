# FPS Fix + Small Balance Interim Verification Report - 2026-05-22

## Purpose

This is an interim verification report, not a completion report.

The goal is to check whether the FPS combat loop fix + small balance pass is on track before moving to any completion report or FPS + command integration QA.

Scope stayed limited to:

- suicide-drone terminal approach pacing,
- infantry anti-drone fire,
- difficulty-based firing feel,
- infantry reload / weapon HUD duplicate cleanup,
- existing death / damage cause feedback.

No BotCommander, AI V2, 50vs50, UGC, city/open-world work, server-authority combat rewrite, or broad loadout overhaul was started.

## Test Environment

- Local app URL used for browser load check: `http://127.0.0.1:4173/`
- Browser load result: page title `Iron Line - 2D Tank Prototype`; console warning/error log empty during the load check.
- Engine / balance checks: Node VM smoke against `src/data/infantry-weapons.js` and `src/ai/infantry-combat-balance.js`.
- Static and online checks:
  - `npm run check` PASS.
  - `npm run check:online` PASS: `SMOKE-1779434138704`, players `2`, combat `1`, commands `3`, WebSocket command `ack/broadcast`.
  - `git diff --check` PASS with CRLF warnings only.

## 1. Suicide Drone Speed / Collision

| Check | Evidence | Result |
| --- | --- | --- |
| Drone-specific terminal speed exists | `kamikazeDrone` now has `terminalApproachRange`, `terminalDiveSpeedMultiplier`, `terminalBoostSpeedMultiplier`, and `terminalDetectionBonus`. | PASS |
| Terminal approach is slower than far dive | VM smoke: far dive speed `1057.39`, terminal speed `429.54`, reduction `59.4%`. | PASS |
| Terminal approach gives reaction room | Terminal range is `240` and terminal detection bonus is `90`; suicide drone also exposes `terminalApproachActive` / `currentSpeed`. | PASS / ENGINE |
| Global Shift speed was not reduced | The change is drone-specific and does not modify global movement or generic Shift handling. | PASS / CODE PATH |
| Actual tank collision timing in live play | Not captured as a manual live-play scene in this interim report. | PARTIAL |

## 2. Infantry Anti-Drone Fire

| Check | Evidence | Result |
| --- | --- | --- |
| Infantry can target drones | Existing `InfantryAI.selectTarget()` already includes enemy drones and prioritizes attack / diving / close drones. | PASS / CODE PATH |
| Anti-drone hit chance reacts to distance / speed / suppression | `InfantryCombatBalance.antiDroneAccuracyBonus()` applies distance, `currentSpeed`, suppression, stance, scout class, and LMG / MG modifiers. | PASS |
| Drones are not trivially easy for all infantry | VM smoke: close scout-prone LMG terminal case bonus `0.09`; far fast suppressed rifle case bonus `-0.09`. | PASS |
| Live-play infantry shooting down drones | Not captured as a manual scene in this interim report. | PARTIAL |

## 3. Difficulty-Based AI Accuracy

| Check | Evidence | Result |
| --- | --- | --- |
| Easy difficulty does not break tactical flow | The difficulty helper only feeds reaction delay, accuracy bonus, and fire cooldown. It does not touch command state, cover flow, squad state, or role ownership. | PASS / CODE PATH |
| Difficulty affects reaction / accuracy / cadence | VM smoke profiles: easy `reactionScale 1.22`, `accuracyBonus -0.08`, `cooldownScale 1.16`, `cooldownAdd 0.12`; hard `reactionScale 0.9`, `accuracyBonus 0.04`, `cooldownScale 0.94`, `cooldownAdd -0.04`. | PASS |
| Command / cover / squad flow preserved | No command or cover state machine logic was changed in this pass. | PASS / CODE PATH |
| Live difficulty A/B feel | Not captured as a manual gameplay comparison yet. | PARTIAL |

## 4. Infantry Reload UI Bug

| Check | Evidence | Result |
| --- | --- | --- |
| Left orange reload bar duplicate removed for standard infantry readout | Standard infantry branches now call `clearStandardInfantryReadout()`; compact infantry HUD still hides `.reload-readout`. | PASS / CODE PATH |
| Weapon name / nickname duplicate removed | Standard infantry readout no longer writes `${weapon.name} ${ammo}` into the left readout; weapon slots remain the single standard source. | PASS / CODE PATH |
| Tank / humvee reload UI preserved | Tank / humvee weapon update paths still call `setInfantryWeaponReadoutCompact(false)` and continue writing `weaponState` / `reloadBar`. | PASS / CODE PATH |
| Visual reload/firing capture for infantry basic / MG / pistol / secondary | Not captured as a manual screenshot / live scene in this interim report. This should be closed before the FPS completion report is marked PASS. | PARTIAL |

## 5. Death / Damage Cause Feedback

| Check | Evidence | Result |
| --- | --- | --- |
| Gunfire feedback preserved | `fireRifle()` still records player hit confirmation and kill state. | PASS / CODE PATH |
| Direct shell feedback preserved | Direct shell paths still route player hit damage through `applyPlayerDamage()` with shell / ammo identifiers. | PASS / CODE PATH |
| Explosion radius feedback preserved | `damageRadius()` still routes splash damage into player / infantry damage paths. | PASS / CODE PATH |
| Vehicle collision feedback preserved | Vehicle contact damage still emits `vehicle_collision` and label `차량 충돌`. | PASS / CODE PATH |
| Tank crush feedback preserved | Tank track / crush damage still emits `tank_crush` and label `전차 압사`. | PASS / CODE PATH |

## Current Issues / Follow-Up

- The core balance math is ON TRACK.
- The standard infantry reload readout bug is fixed by code path, but still needs a live visual pass for basic rifle / machinegun / pistol / secondary weapon cases.
- Suicide-drone terminal approach and infantry anti-drone shooting need a gameplay scene during the completion report to confirm feel, not just math.
- No direct code blocker was found in this interim verification.

## Current Judgment

ON TRACK.

This interim report does not complete the FPS pass. It allows a narrow report-based verification pass next. If that pass finds no visual HUD or gameplay feel blocker, proceed to **FPS combat loop completion report**, then **FPS + command integration QA**.
