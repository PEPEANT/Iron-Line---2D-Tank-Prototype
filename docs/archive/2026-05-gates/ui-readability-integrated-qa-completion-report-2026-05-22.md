# UI / Readability Integrated QA and Completion Report - 2026-05-22

Decision: PASS. The active combat HUD, command HUD, log priority, minimap marker density, 25vs25 readability smoke, mobile readability rules, and 50vs50 event-only constraints are good enough to move to **AI V2 behavior connection first pass**.

This report replaces the previously planned interim / fix / completion split for UI readability. It includes the small verification updates needed for this stage and does not start a broad UI redesign.

## 1. Scope

Included:

- Combat + command readability during live play.
- Command state and command hold visibility.
- Radio / kill feed / death feedback collision checks.
- Remote dead-state scoreboard and minimap filtering.
- Desktop and small-screen readability checks.
- Scale-readiness evidence for 8vs8, 15vs15, 25vs25, and 50vs50 event-only profiles.

Not included:

- Operations center overhaul.
- Large UI redesign.
- UGC / city / open-world work.
- AI V2 behavior rewrite.
- 50vs50 default mode.
- Loadout redesign.

## 2. Combat HUD Result

| Requirement | Result | Evidence |
| --- | --- | --- |
| Health readable | PASS | Top readability strip shows `HP current/max`. |
| Ammo / weapon shorthand readable | PASS | Strip reuses existing infantry / vehicle mobile weapon label path. |
| Reload state remains available | PASS | Existing detailed weapon panel remains unchanged. |
| Recent hit source readable | PASS | Smoke confirmed `HP 95/100 hit:총격`. |
| Death cause path preserved | PASS | Strip switches to `DOWN <reason>` when player death state is active; full death screen remains primary. |
| Kill feed readable | PASS | Smoke confirmed compact feed line: `QA kill feed event`. |

## 3. Command HUD Result

| Requirement | Result | Evidence |
| --- | --- | --- |
| Current role visible | PASS | Smoke confirmed `Blue Infantry`. |
| Selected local command state visible | PASS | Smoke confirmed `assault 2.8s`. |
| Command hold state visible | PASS | Hold time is rounded and shown without raw debug numbers. |
| Command success / reject feedback preserved | PASS | Existing command radio result path remains unchanged. |
| Debug-only fields hidden | PASS | `commandReason`, raw `lockUntil`, stuck timers, and tactical node ids stay out of the main strip. |

## 4. Logs / Text Collision

| Area | Result | Evidence |
| --- | --- | --- |
| Radio log vs combat HUD | PASS | `.command-log` is capped at `42px` and hidden overflow. |
| Kill feed vs radio log | PASS | Major battle event feed is one compact line in the strip; radio remains in its own log. |
| Death / hit / command state | PASS | Hit summary, command state, and feed are separate strip cells. |
| Text volume | PASS | Strip truncates long values with ellipsis and limits the feed to a short line. |

## 5. Minimap / Markers

| Requirement | Result | Evidence |
| --- | --- | --- |
| Friendly / enemy human state | PASS | Online remote dead player is now rendered dead in scoreboard state. |
| Dead remote minimap clutter | PASS | Smoke confirmed remote dead human map point is not alive. |
| Squad / vehicle / drone marker density | PASS | Existing minimap remains the primary marker surface; this pass only reduces human label clutter. |
| Stuck / blocked debug info | PASS | Debug-only details are not promoted into the main live HUD. |
| Small-screen marker names | PASS | Mobile smoke confirmed remote human names hidden and local human name visible. |

## 6. Scale Readability

Scale evidence combines the UI readability smoke with the existing scale-performance gate. 50vs50 remains event-only.

| Profile | Result | FPS | Frame ms | Snapshot bytes | Notes |
| --- | --- | ---: | ---: | ---: | --- |
| 8vs8 | PASS | 60.0 | 5.6 | 47,309 | Baseline lower-density case. |
| 15vs15 | PASS | 60.0 | 7.8 | 64,434 | Normal mid-density case. |
| 25vs25 | PASS | 58.9 | 11.3 | 95,628 | UI smoke also ran at this profile. |
| 50vs50 event | PASS EVENT-ONLY | 30.4 | 31.9 | 153,274 | Manual event / stress / spectator candidate only. |

Readability decision:

- 25vs25 is acceptable for the normal staged AI ceiling under the current smoke criteria.
- 50vs50 passed the event budget in this run, but it is still not approved as default, ranked, normal online, or competitive mode.
- The main live HUD does not expose per-unit debug fields that would explode text density in crowded modes.

## 7. Screen Size Result

| Check | Result | Evidence |
| --- | --- | --- |
| Desktop top-strip overlap | PASS | Top objective strip and readability strip do not overlap. |
| Small-screen strip width | PASS | Mobile smoke confirmed strip remains within a 390px viewport. |
| Small-screen layout | PASS | Mobile smoke confirmed compact grid is active. |
| Small-screen marker names | PASS | Remote human marker names hidden; local marker name visible. |

## 8. Verification

Automated:

| Test | Result | Notes |
| --- | --- | --- |
| `node tools/check-ui-readability.cjs` | PASS | Live 25vs25 UI smoke, command log cap, hit / feed / command strip, remote dead filtering, mobile marker density. |
| `IRONLINE_SCALE_PROFILES=ai-8v8,ai-15v15,ai-25v25,ai-50v50-event node tools/check-ai-scale-performance.cjs` | PASS | All four profiles passed their current budgets. |
| `npm run check` | PASS | Code-health and syntax checks. |
| `npm run check:online` | PASS | Online smoke preserved command / combat behavior. |
| `node tools/check-fps-command-integration.cjs` | PASS | FPS + command coexistence preserved. |
| `node tools/check-online-combat-client-flow.cjs` | PASS | Online hit / death / respawn client flow preserved. |

Manual / browser:

- In-app browser target: `http://localhost:4173/`.
- Live match strip was visible.
- Objective strip and readability strip did not overlap.
- Screenshot evidence from the first pass remains: `ui-readability-first-pass-local.png`.

## 9. Remaining Risks

- This pass confirms readability smoke criteria, not final art direction.
- True player-facing polish still needs repeated real play sessions with two or more humans.
- 50vs50 is still a special event / stress mode; if it becomes a production event later, it needs its own spectator and information-density pass.
- Full server authority and ranked-grade combat adjudication remain out of scope.

## 10. Final Verdict

PASS.

The UI / readability stage can close for the current roadmap. The next stage is:

**AI V2 behavior connection first pass**

That next stage should connect existing tactical-map / cover-node data into selected AI behaviors without starting a full AI rewrite.
