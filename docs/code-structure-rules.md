# Code Structure Rules

Conclusion: new features should stop growing `main.js`, `hud.js`, `renderer.js`, and `styles/styles.css` by default; those files now have code-health budgets enforced by `npm run check`.

## Purpose

Iron Line is moving from a small prototype into a lobby, admin, AI lab, command, audio, and online-ready game. The main bug risk is no longer only syntax. It is state and UI code piling into a few files until responsibilities blur.

This document is the current rule set for keeping the project readable while it grows.

## Current Hotspots

Measured on 2026-05-20:

- `src/main.js`: about 4550 lines
- `src/systems/hud.js`: about 3200 lines
- `src/systems/renderer.js`: about 2980 lines
- `styles/styles.css`: about 2990 lines
- `src/ai/infantry-ai.js`: about 2780 lines
- `src/tools/map-editor.js`: about 2310 lines

These files are allowed temporarily because they already exist, but they should be treated as coordinator or legacy hotspot files.

## Hard Rules

- `main.js` should coordinate game state, loop order, scene transitions, and system wiring. New feature logic should move into a focused module.
- `hud.js` should not keep absorbing every new screen. New large UI surfaces should get a dedicated UI module or system module.
- `renderer.js` should not regain debug, scenery, or specialized overlays that already have a split module path.
- `styles/styles.css` can hold global shared rules, but new labs or large screens should use separate files in `styles/` and be candidates for split CSS.
- Admin-only tools should stay out of player-facing flow unless explicitly gated by `admin.html`, `?admin=1`, or observer mode.
- AI behavior changes should be separated from AI observability. Logging and snapshots belong in observer modules; tactical decisions belong in AI modules.
- A new feature body over roughly 100 lines needs a module boundary before it gets merged into a hotspot file.

## Check Script

`tools/check-code-health.cjs` runs as part of `npm run check`.

It currently:

- fails when hotspot files exceed their line budget
- fails when a ratcheted hotspot grows more than `tools/hotspot-baseline.json` + 40 lines
- lowers that baseline automatically when a watched hotspot shrinks
- fails when non-hotspot files exceed the default budget
- warns on files above 1000 lines
- warns on class methods over 220 lines

The budgets are not a quality badge. They are a tripwire. If a feature legitimately needs more room, split it first or update this document with the reason.

## Preferred Module Paths

- Entry, lobby, radio, admin, AI lab, and audio lab UI: `src/systems/*` or future `src/ui/*`
- Game state schemas and presets: `src/data/*`
- Online-ready room, slot, command, and observer state: `src/systems/*`
- Drawing and debug overlays: renderer extension modules such as `src/systems/renderer-debug.js`
- Map editor behavior: `src/tools/*`, with editor-only styles outside the main game CSS where practical

## Next Refactor Candidates

- Move entry screen UI out of `Hud` once the lobby flow settles.
- Move lobby slot rendering and command radio rendering out of `Hud`.
- Keep AI lab/admin observer rendering separate from player HUD controls.
- Split common tactical-map drawing from deployment/lobby/admin screens if it keeps growing.
- Split map editor road and boundary editing tools if `map-editor.js` grows again.

## Review Checklist

Before adding a new feature:

- Is this player-facing, admin-facing, AI-facing, or editor-only?
- Does the code belong in an existing module, or is it a new system?
- Will this add more than 100 lines to a hotspot file?
- Can the state be represented as a small snapshot or packet?
- Can `npm run check` stay green without raising hotspot budgets?
