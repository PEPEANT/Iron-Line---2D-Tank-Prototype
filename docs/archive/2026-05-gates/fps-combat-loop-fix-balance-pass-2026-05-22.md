# FPS Combat Loop Fix + Small Balance Pass - 2026-05-22

## Purpose

This is a narrow fix pass after the FPS combat loop interim report.

Scope stayed limited to direct FPS feel issues:

- Suicide-drone terminal approach pacing.
- Infantry anti-drone fire chance.
- Difficulty effects on reaction / accuracy / fire cadence.
- Infantry reload / weapon HUD duplicate readout cleanup.

This pass did not start BotCommander, AI V2, 50vs50, UGC, city/open-world work, server-authority combat rewrites, or broad loadout changes.

## Changes

| Area | Change | Result |
| --- | --- | --- |
| Suicide drone terminal approach | Added drone-specific terminal approach speed values instead of changing global Shift / boost speed. Far dive remains fast; close terminal run slows and adds detection range. | PASS |
| Drone speed state | Added `currentSpeed` and `terminalApproachActive` so anti-drone fire can evaluate the real current approach speed. | PASS |
| Infantry anti-drone fire | Added an infantry combat balance helper with anti-drone accuracy bonuses / penalties based on drone role, distance, speed, stance, suppression, scout class, and LMG / MG weapons. | PASS |
| Difficulty tuning | Difficulty now adjusts reaction scale, accuracy bonus, and fire cooldown only. It does not change command ownership, cover flow, squad logic, or tactical state machines. | PASS |
| Infantry reload HUD | Standard infantry weapon readout now clears the left reload state/bar in compact infantry HUD mode. Drone / recon special states and tank / humvee reload UI still use the expanded readout. | PASS / CODE PATH |

## Verification

| Check | Evidence | Result |
| --- | --- | --- |
| Syntax / duplicate / code health | `npm run check` passed for 93 JS files and 109 tracked files. | PASS |
| Online smoke | `npm run check:online` passed: `SMOKE-1779434019180`, players `2`, combat `1`, commands `3`, ws command `ack/broadcast`. | PASS |
| Whitespace | `git diff --check` passed with CRLF warnings only. | PASS |
| Browser load | Local app opened at `http://127.0.0.1:4173/`; console warning/error log was empty during the page-load check. | PASS |
| Drone terminal speed | VM balance smoke: far dive speed `1057.39`, terminal speed `429.54`, terminal reduction `59.4%`, terminal range `240`, detection bonus `90`. | PASS |
| Difficulty profile | VM balance smoke: easy slows reaction / reduces accuracy / increases cooldown; hard improves those values. | PASS |
| Anti-drone balance | VM balance smoke: slow close scout-prone LMG case bonus `0.09`; fast far suppressed rifle case bonus `-0.09`. | PASS |

## Notes

- The reload HUD cleanup was verified by code path and browser load, not by a full manual reload animation capture. It should be visually rechecked during the FPS combat loop completion report.
- The new balance helper lives in `src/ai/infantry-combat-balance.js` to avoid growing the already-hot `src/ai/infantry-ai.js`.
- `src/ai/infantry-ai.js` is exactly at the current line budget and remains a hotspot. Future AI combat tuning should continue moving helper logic out of this file.

## Current Judgment

PASS for this narrow fix + small balance pass.

The next step is **FPS combat loop completion report**, with special attention to visual confirmation of infantry reload HUD cleanup and final command/FPS coexistence readiness before moving into **FPS + command integration QA**.
