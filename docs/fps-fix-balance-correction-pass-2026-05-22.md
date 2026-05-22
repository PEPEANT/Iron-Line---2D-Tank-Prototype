# FPS Fix + Balance Correction Pass - 2026-05-22

## Purpose

This is the narrow correction pass based on `docs/fps-fix-balance-interim-verification-report-2026-05-22.md`.

The goal was to fix only problems found in the interim report. No new feature work was started.

## Scope Decision

The interim report found no confirmed code blocker. The remaining items were PARTIAL because they need live visual / play-feel confirmation:

- suicide-drone terminal approach timing against tanks,
- infantry anti-drone shooting in a live scene,
- live difficulty A/B feel,
- standard infantry reload / weapon HUD visual confirmation.

Therefore this pass made no additional gameplay or balance code changes. It preserves the current fix and records the next verification requirements.

## Pass / Fail Table

| Area | Interim Result | Correction Action | Current Result | Notes |
| --- | --- | --- | --- | --- |
| Fatal FPS loop bugs | No blocker found | No code change needed | PASS | No evidence that shooting, damage, death, respawn, kill log, or death causes broke in this pass. |
| Infantry reload UI | PARTIAL for live visual capture | Rechecked code path; no extra code change needed | ON TRACK | Standard infantry now clears the left readout; tank / humvee paths still use expanded readout. Needs one live visual scene before completion PASS. |
| Suicide-drone terminal speed | PARTIAL for live tank timing | Rechecked speed math and drone-specific terminal fields | ON TRACK | Far dive `1057.39`, terminal `429.54`, `59.4%` terminal reduction; global Shift path unchanged. |
| Infantry anti-drone fire | PARTIAL for live scene | Rechecked targeting and hit-chance modifiers | ON TRACK | Existing target selection includes drones; balance helper varies chance by distance / speed / suppression / stance / class / weapon. |
| Difficulty-based accuracy | PARTIAL for live A/B feel | Rechecked difficulty profile boundaries | ON TRACK | Difficulty only changes reaction / accuracy / fire cadence and does not touch command / cover / squad state. |
| Damage cause feedback | PASS / CODE PATH | No code change needed | PASS | `vehicle_collision`, `tank_crush`, gunfire, shell, and splash paths remain present. |

## Modified Files In This Pass

Documentation / handoff only:

- `docs/fps-fix-balance-correction-pass-2026-05-22.md`
- `docs/INDEX.md`
- `AGENT_HANDOFF.md`

No gameplay code was changed in this correction pass.

## Reverification

- `npm run check` PASS.
- `npm run check:online` PASS:
  - `Online smoke passed: SMOKE-1779434516315, players=2, combat=1, commands=3, ws=hello/join_result/observer_snapshot, wsCommand=ack/broadcast`
- `git diff --check` PASS with CRLF warnings only.
- Node VM balance smoke PASS:
  - far dive speed `1057.39`
  - terminal speed `429.54`
  - terminal reduction `59.4%`
  - easy profile `reactionScale 1.22`, `accuracyBonus -0.08`, `cooldownScale 1.16`, `cooldownAdd 0.12`
  - hard profile `reactionScale 0.9`, `accuracyBonus 0.04`, `cooldownScale 0.94`, `cooldownAdd -0.04`
  - close scout-prone LMG drone case bonus `0.09`
  - far suppressed rifle drone case bonus `-0.09`

## Remaining Blockers

No code blocker is recorded.

Remaining verification before the FPS completion report can be marked PASS:

- Capture or manually verify one standard infantry reload / firing HUD scene with no duplicate left orange bar and no duplicate weapon nickname.
- Confirm tank / humvee reload UI still appears as before.
- Capture or manually verify one suicide-drone terminal approach scene against a tank.
- Capture or manually verify one infantry anti-drone shooting scene.
- If live capture is not practical, record the limitation as an explicit open question in the FPS completion report.

## Current Judgment

ON TRACK.

Proceed to **FPS combat loop completion report** only after the visual / live-play checks above are either passed or explicitly recorded as blockers / open questions.
