# FPS AI Rear Awareness Correction Pass - 2026-05-22

## Purpose

This is a narrow FPS feel correction for the reported issue:

AI infantry / tanks / humvees could appear to recognize the player too accurately while facing away.

This is not AI V2. The change only separates immediate visual acquisition from rear / side awareness enough to make flanking and rear attacks feel less like the AI has 360-degree vision.

## Changes

| Area | Change | Result |
| --- | --- | --- |
| Tank target acquisition | `CombatController.canSeeOrUseReport()` no longer treats line of sight alone as full visual contact. Unreported targets now also need turret / hull facing awareness. | PASS |
| Tank reported contacts | Reported enemy contacts can still be used, so allied spotting / command information can justify awareness outside the current turret view. | PASS |
| Humvee target acquisition | `HumveeAI.findTarget()` now requires either a reported enemy or gun / hull facing awareness before treating line of sight as a valid unreported target. | PASS |
| Humvee reported contacts | Reported enemy contacts can still be used, so shared spotting does not make rear awareness impossible. | PASS |
| Infantry rear reaction | Infantry rear / side-rear reaction delay is longer, and the max reaction delay was raised from `0.82s` to `1.24s`. | PASS |
| Gunfire suspicion | `awareness-signals.js` turns rear / non-visual gunfire into an uncertain threat point instead of an exact shooter reference. | PASS |
| Vehicle search reaction | Tank and humvee AI can register gunfire / hit suspicion and rotate turret or gun toward a search point without acquiring a perfect target. | PASS |
| Scope | No AI V2, tactical map, full crew-seat perception model, or broad server-authority combat work was added. | PASS |

## Verification

| Check | Evidence | Result |
| --- | --- | --- |
| Tank front contact | VM smoke: tank facing/turret forward sees front target. | PASS |
| Tank rear contact without report | VM smoke: rear target with line of sight but no report is not visible to the tank controller. | PASS |
| Tank rear contact with report | VM smoke: rear target becomes usable when reported. | PASS |
| Humvee front contact | VM smoke: humvee gun / hull facing target returns visible. | PASS |
| Humvee rear contact without report | VM smoke: rear target with line of sight but no report is not selected by humvee AI. | PASS |
| Humvee rear contact with report | VM smoke: rear target becomes usable when reported. | PASS |
| Infantry rear delay | VM smoke: front delay `0.28s`; rear delay `1.0s`; easy rear delay `1.22s`. | PASS |
| Rear gunfire uncertainty | VM smoke: front-facing observer sees shooter, rear-facing observer does not; rear gunfire returns `gunfire_suspicion`; rear hit returns `hit_reaction`; reported contacts keep exact shooter. | PASS |
| Vehicle search reaction | VM smoke: tank and humvee both register suspicion, enter `search`, keep a suspicion timer, and rotate turret / gun toward the search point. | PASS |
| Project checks | `npm run check` PASS; `npm run check:online` PASS `SMOKE-1779436133526`; `git diff --check` PASS with CRLF warnings only. | PASS |

## Remaining Limits

- This pass implements only a narrow gunfire-suspicion / hit-reaction uncertainty path.
- Gunshots and hits still need a future dedicated system if the design wants richer sound direction, confidence decay, squad search patterns, or building-aware hearing.
- Live play should still verify that rear flanking feels fair and that tanks do not become blind in frustrating cases.
- Humvee awareness is a first-pass gun / hull facing check, not a full crew-seat perception model.

## Strict FPS Completion Gate Note

This document is a narrow correction PASS, not a full AI V2 perception-system PASS.

For the **FPS combat loop completion report**, rear-awareness should only be marked PASS if these stricter checks also pass:

- rear gunfire creates suspicion / turn-search behavior instead of immediate perfect target acquisition,
- hit reaction is fast but source-position estimation has uncertainty unless the attacker is visually confirmed or ally-reported,
- infantry, tanks, and humvees still respect front-facing vision / weapon direction,
- the anti-tank assault flow is not broken by the awareness changes.

The current narrow implementation meets this gate through VM smoke and project smoke checks. Live play should still judge whether the feel is fair.

## Current Judgment

PASS for a narrow correction.

Carry this into the **FPS combat loop completion report** and verify at least:

- a rear-facing tank does not instantly acquire an unreported player behind it,
- a rear-facing humvee does not instantly acquire an unreported player behind it,
- reported contacts still let tanks respond,
- reported contacts still let humvees respond,
- rear-facing infantry reacts slower than front-facing infantry,
- flanking feels useful but not abusable.
