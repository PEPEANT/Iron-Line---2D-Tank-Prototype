# 50v50 Event Candidate Integrated Verification Plan - 2026-05-22

Decision: 50vs50 may move into an event-only integrated verification stage, but it is not approved as a default, ranked, normal online, or competitive mode.

Next deliverable: `50vs50 event candidate integrated verification report`.

## Purpose

Prepare 50vs50 as a manually activated large-battle event / stress / spectator candidate after the staged 8vs8 / 15vs15 / 25vs25 AI scale completion report passed.

The next pass should not split 50vs50 into separate design, interim, fix, and completion documents unless a blocker forces it. The next report should combine mode position, test results, LOD / snapshot policy, readability, human impact, restrictions, and final event-only decision in one document.

This plan creates the gate for testing 50vs50. It does not implement broad AI behavior, does not open 50vs50 by default, and does not treat 50vs50 as the normal 4vs4 player experience.

## Preconditions

Required before any 50vs50 event candidate verification:

- `docs/ai-scale-performance-completion-report-2026-05-22.md` is PASS.
- Runtime LOD remains enabled.
- `ai-50v50-event` stays marked as event-only.
- Activation is manual and explicit.
- General / ranked / default online matchmaking must not auto-select 50vs50.
- Admin / observer / debug visibility must be available before running the event profile.
- If the event candidate fails, the game must fall back to 25vs25 or a smaller event profile.

## Mode Position

Allowed:

- Local stress test.
- Private event room.
- Admin-triggered event profile.
- Spectator / observer-heavy test.
- Manual QA run through a clearly named event profile.

Not allowed:

- Default mode.
- Ranked / competitive mode.
- Normal quickplay mode.
- Silent automatic profile selection.
- 50vs50 as the baseline online experience.

Implementation guardrails for the next pass:

- Keep `ai-50v50-event` event-only.
- Require a manual event activation path.
- Show the active scale profile in debug / admin / observer state.
- Block promotion to default mode unless a future separate design explicitly changes that rule.

## Event Budgets

Use the existing 50vs50 event budget as the first gate:

| Metric | Event Budget |
| --- | ---: |
| FPS | `>= 30` |
| Frame time | `<= 40ms` |
| Active AI update time | `<= 32ms` |
| Tactical map structural time | `<= 34ms` |
| Render time | `<= 30ms` |
| Observer snapshot size | `<= 520,000 B` |

These are stress / event budgets, not normal competitive budgets. Passing them means the event candidate may remain under event-only consideration; it does not mean the mode is production-ready.

## Integrated Report Required Sections

The next report should include:

1. Mode position:
   - 50vs50 is not a default online / normal / ranked mode.
   - 50vs50 is event / stress / spectator candidate only.
   - 50vs50 is enabled only through manual activation or an event flag.

2. Performance results:
   - FPS.
   - Frame time.
   - AI update time.
   - Pathfinding / update cost.
   - Render cost.
   - Memory usage if available.
   - Network / admin / observer snapshot size.
   - Vehicle / drone / stuck / blocked / waitForClear counts.

3. LOD / snapshot policy:
   - On-screen AI keeps detailed updates.
   - Off-screen / rear / non-combat AI uses lower update rate.
   - Squad / vehicle / drone summary snapshots remain the default.
   - Full per-unit internals are not sent every tick.

4. Gameplay / readability:
   - Human players still affect the battle.
   - AI-only fighting does not decide normal competitive victory.
   - Screen readability is acceptable for an event.
   - Vehicle / drone / explosion density is not excessive.

5. Restrictions / fallback:
   - Performance failure requires automatic reduction or blocking.
   - General rooms, ranked, and default modes remain disabled.
   - Admin / spectator-only recommendation is recorded if needed.

6. Final decision:
   - `PASS EVENT-ONLY`.
   - `HOLD`.
   - `REDUCE`.
   - `BLOCKED`.

## Test Coverage

The integrated report may include all of these in one pass:

- Local 50vs50 smoke.
- Single 50vs50 stress measurement.
- Repeated 50vs50 stress measurement if the first run is not immediately blocked.
- Vehicle / drone-heavy observation if the scenario produces those bursts.
- Admin / observer snapshot measurement.

Minimum if 50vs50 starts successfully:

- Run `ai-50v50-event` at least 3 times.
- Record aggregate min FPS, max frame time, max active AI time, max path / movement cost, max render cost, max snapshot size, worst stuck state, and worst traffic / wait state.

If the first run is clearly blocked, record the blocker and stop instead of forcing repeated runs.

## Human Impact Rules

50vs50 must not turn the game into an AI-only sim where humans are spectators by accident.

Event tests must check:

- Human players can still issue role commands.
- Human command state remains visible.
- Human kills / objective actions remain meaningful.
- AI-only fighting does not silently decide the match in normal competitive terms.
- If event scoring is enabled, it should be labeled as event scoring.
- Spectator mode may emphasize large-battle viewing, but player-controlled roles must not be erased.

Recommended event rule for future implementation:

- AI can create battle flow and pressure.
- Human players or explicit event objectives should remain the decisive layer.
- If the event is observer-only, label it clearly as a simulation / showcase event.

## Decision Criteria

### PASS EVENT-ONLY

- 50vs50 event profile starts manually.
- Repeated 50vs50 stress runs meet event budgets.
- Runtime LOD is visible and active.
- Snapshot size stays within budget.
- No severe stuck / blocked / spawn-overlap blocker.
- Command state remains readable.
- FPS / command / tactical-map regressions remain green.

Outcome:

- Keep event-only restriction.
- Move to roadmap cleanup / next-season priority report.

### HOLD

- 50vs50 starts but has variance, readability, snapshot, or traffic concerns.
- 50vs50 may remain local/admin-only.

Outcome:

- Do not open 50vs50 to online event rooms yet.
- Run a narrow fix pass only if the issue is directly tied to event-readiness.

### REDUCE

- 50vs50 starts but is too heavy or too unreadable for an event candidate.
- 25vs25 remains the approved staged count.
- A smaller event profile such as 30vs30, 35vs35, or 40vs40 is recommended before retrying 50vs50.

Outcome:

- Keep 50vs50 blocked for now.
- Create a reduced event candidate instead of forcing 50vs50.

### BLOCKED

- Repeated runs fail event budgets, or the first run exposes a hard blocker.
- Severe stuck / blocked state appears.
- Snapshot payload becomes too large.
- Command state or FPS loop breaks.
- LOD does not throttle enough to keep the event stable.

Outcome:

- Return to AI scale performance / LOD / traffic fix pass.
- Keep 25vs25 as the highest approved staged AI count.

## Non-Goals

Do not start:

- 50vs50 default mode.
- Ranked / competitive 50vs50.
- UGC.
- City / open-world expansion.
- Server-authority combat rewrite.
- Broad AI V2 behavior rewrite.
- Learning AI.
- Full BotCommander behavior expansion.

## Next Deliverables

1. `50vs50 event candidate integrated verification report`.
2. Roadmap cleanup / next-season priority report after `PASS EVENT-ONLY`, `HOLD`, `REDUCE`, or `BLOCKED`.
