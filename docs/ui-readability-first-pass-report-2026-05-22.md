# UI / Readability / Battlefield Information First Pass Report - 2026-05-22

Decision: ON TRACK. The first UI readability cleanup pass is implemented. Its follow-up verification is now consolidated in `ui-readability-integrated-qa-completion-report-2026-05-22.md`.

This pass does not redesign the operations center, loadouts, UGC, AI V2 behavior, or 50vs50 default mode. It only makes the active combat + command state easier to read during live play.

## 1. Scope

Implemented:

- A compact top HUD readability strip for live play.
- Command state / command hold visibility without exposing debug-only `commandReason` or raw `lockUntil` numbers.
- Combat summary with health, weapon / ammo shorthand, and recent hit source.
- One-line battlefield feed for major events.
- Command log height limit so radio logs do not grow into the combat HUD.
- Remote dead-state handling for online scoreboard and human map / minimap markers.
- Small-screen marker-name density reduction: only the local human marker keeps a name label.

Not implemented:

- Operations center overhaul.
- UGC / city / open-world work.
- AI V2 behavior rewrite.
- 50vs50 default mode.
- Loadout redesign.
- Full server-authority combat.

## 2. Combat HUD Result

The existing weapon panel remains the main detailed ammo / reload HUD.

Added always-readable top-strip combat summary:

| Item | Result |
| --- | --- |
| Health | Shows `HP current/max`. |
| Ammo / weapon shorthand | Uses the existing mobile weapon label path for infantry and vehicle weapons. |
| Recent hit | Shows `hit:<source>` while `lastPlayerDamage.ttl` is active. |
| Death cause | Death screen remains the full death-cause surface; the strip switches to `DOWN <reason>` if the player is downed while visible. |

## 3. Command HUD Result

The radio panel remains the detailed command UI.

Added top-strip command summary:

| Item | Result |
| --- | --- |
| Current role | Shows local team + command role, for example `Blue Infantry`. |
| Current command state | Shows the primary active squad / vehicle command state. |
| Command hold | Shows remaining hold time as a rounded short value, for example `assault 2.8s`. |
| Multiple commanded assets | Shows `xN` when multiple local-slot assets have active command state. |
| Debug-only details | `commandReason`, raw `lockUntil`, stuck timers, and tactical node ids stay out of this strip. |

## 4. Logs / Markers Result

| Area | Result |
| --- | --- |
| Radio command log | `max-height: 42px` and `overflow: hidden` prevent log growth from covering gameplay. |
| Battlefield feed | One compact line from recent major `BattlefieldEvents` only. |
| Online scoreboard | Remote players now use online `alive` / `deathState` metadata instead of always rendering as alive. |
| Map markers | Remote dead players are filtered from HUD map markers and canvas minimap entries. |
| Small-screen marker names | Non-local human marker names are hidden under `760px`; local name remains visible. |

## 5. Files Changed

Core:

- `index.html`
- `src/systems/hud.js`
- `src/systems/hud-readability.js`
- `src/systems/hud-readability-hook.js`
- `src/systems/renderer-minimap.js`
- `src/styles/readability-hud.css`

Verification:

- `tools/check-ui-readability.cjs`

Documentation:

- `docs/ui-readability-first-pass-report-2026-05-22.md`
- `docs/INDEX.md`
- `AGENT_HANDOFF.md`

## 6. Verification

Automated:

| Test | Result | Evidence |
| --- | --- | --- |
| `node tools/check-ui-readability.cjs` | PASS | Strip visible in live play; role / command / combat / feed text visible; command log capped; remote dead state hidden from map. |
| `npm run check` | PASS | Syntax, duplicate method, and code-health checks pass. |
| `npm run check:online` | PASS | Online smoke preserved command / combat room behavior. |
| `node tools/check-fps-command-integration.cjs` | PASS | FPS + command coexistence still works. |
| `node tools/check-online-combat-client-flow.cjs` | PASS | Online combat hit / death / respawn flow still works. |

In-app browser:

| Check | Result |
| --- | --- |
| `http://localhost:4173/` loaded | PASS |
| `readability-hud.css` loaded | PASS |
| Live match strip visible | PASS |
| Top objective strip and readability strip do not overlap | PASS |
| Screenshot | `ui-readability-first-pass-local.png` |

## 7. Open Notes

- This is a first pass. It proves the new information priority surface exists and does not break core smoke flows.
- It does not prove final 25vs25 / 50vs50 live readability by itself. That follow-up is covered by `ui-readability-integrated-qa-completion-report-2026-05-22.md`.
- Korean source text in older HUD files remains mixed with existing encoding artifacts. This pass used compact English labels in the new strip to avoid adding long text that would overlap or corrupt.

## 8. Next Step

Move to:

**UI / readability integrated QA and completion report**

The consolidated report inspects denser AI-count evidence, command / combat HUD priority, mobile viewport behavior, and 50vs50 event-only minimum-information constraints without splitting into additional interim reports.
