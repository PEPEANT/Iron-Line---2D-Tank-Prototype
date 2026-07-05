# AI Scale Performance Fix / Validation Pass - 2026-05-22

Decision: PASS for the interim report-based narrow fix / validation pass.

This pass rechecked the AI scale performance interim report instead of immediately closing AI count expansion. The initial repeated run reproduced 25vs25 variance, so a narrow LOD fix was applied. The follow-up repeated run passed 8vs8, 15vs15, and 25vs25.

This does not enable 50vs50 as a default mode.

## Scope

Goal: verify whether 25vs25 variance is persistent, and if needed fix only performance behavior directly tied to the variance.

Included:

- Repeated 8vs8 / 15vs15 / 25vs25 measurement.
- At least 3 runs for 25vs25.
- Runtime LOD visibility in the scale performance helper.
- Narrow LOD scheduling and classification correction.
- Regression checks for command state, FPS-command integration, and scale readiness.

Not included:

- 50vs50 default mode.
- Broad AI V2 behavior rewrite.
- UGC / city work.
- Server-authority combat rewrite.
- Learning AI.
- Large refactor.

## Changes

Updated:

- `tools/check-ai-scale-performance.cjs`
- `src/main.js`
- `src/entities/infantry-unit.js`
- `src/entities/tank.js`
- `src/entities/humvee.js`
- `src/systems/ai-scale-readiness.js`

Behavior added / tightened:

- The scale performance helper repeats selected profiles and reports aggregate min/max values.
- The helper now verifies runtime LOD state, not just LOD classification counts.
- `Game.aiLodStep()` throttles AI decision updates while keeping non-AI timers on normal frame `dt`.
- Infantry, tank, and humvee AI updates accept `skipAi` / `aiDt`.
- Ordered off-screen actors now classify as `normal` LOD instead of always `detailed`.
- On-screen, near-player, target-engaged, suppressed, or recently threatened actors remain `detailed`.
- Command state and command locks remain visible and are not owned by the throttled unit update.

## Validation Commands

Initial repeated measurement:

```powershell
$env:IRONLINE_SCALE_PERF_COMPACT='1'
$env:IRONLINE_SCALE_PROFILES='ai-8v8,ai-15v15,ai-25v25'
$env:IRONLINE_SCALE_REPEATS='3'
$env:IRONLINE_SCALE_PERF_CDP_PORT='9270'
node tools\check-ai-scale-performance.cjs
```

Follow-up repeated measurement after the narrow LOD correction:

```powershell
$env:IRONLINE_SCALE_PERF_COMPACT='1'
$env:IRONLINE_SCALE_PROFILES='ai-8v8,ai-15v15,ai-25v25'
$env:IRONLINE_SCALE_REPEATS='3'
$env:IRONLINE_SCALE_PERF_CDP_PORT='9280'
node tools\check-ai-scale-performance.cjs
```

Result after fix: `allPass: true`.

## Initial Repeated Result

The first repeated run reproduced the 25vs25 variance.

| Profile | Runs | Pass | Fail | Min FPS | Max Frame | Max Active AI | Max Path/Move | Max Snapshot | Worst Traffic Holds | Worst Wait/Blocked | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 8vs8 | 3 | 3 | 0 | 58.60 | 9.77ms | 6.25ms | 6.16ms | 45,351 B | 0 | 0 | pass |
| 15vs15 | 3 | 3 | 0 | 49.71 | 15.10ms | 11.11ms | 11.09ms | 65,975 B | 2 | 2 | pass |
| 25vs25 | 3 | 2 | 1 | 30.85 | 27.64ms | 21.42ms | 21.31ms | 96,733 B | 4 | 4 | fail |

Interpretation:

- The 25vs25 dip was real enough to block immediate completion.
- Render, tactical-map structural time, and snapshot size were not the main issue.
- Active AI and path/movement cost were close enough to budget to justify a narrow LOD fix.

## Narrow Fix

The LOD rules already described `normal` as the bucket for ordered or near-front AI, but the implementation promoted all squad-commanded actors to `detailed`.

Fix:

- `engaged` now means target contact, suppression, or recent threat.
- `ordered` now means actor / vehicle / squad command state.
- Ordered off-screen actors use `normal` LOD.
- Truly engaged or on-screen actors remain `detailed`.

This keeps command structure intact while stopping distant ordered units from performing detailed AI decisions every frame.

## Follow-Up Aggregate Result

| Profile | Runs | Pass | Fail | Min FPS | Max Frame | Max Active AI | Max Path/Move | Max Snapshot | Worst Traffic Holds | Worst Wait/Blocked | LOD Throttled | LOD Skipped | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 8vs8 | 3 | 3 | 0 | 59.99 | 6.36ms | 3.10ms | 3.08ms | 46,618 B | 0 | 0 | 16 | 16 | pass |
| 15vs15 | 3 | 3 | 0 | 46.40 | 15.87ms | 8.96ms | 8.65ms | 67,474 B | 2 | 2 | 24 | 24 | pass |
| 25vs25 | 3 | 3 | 0 | 56.64 | 13.22ms | 9.23ms | 9.21ms | 92,056 B | 1 | 1 | 37 | 37 | pass |

Budgets remained intact:

- 8vs8 FPS budget: `>=45`.
- 15vs15 FPS budget: `>=42`.
- 25vs25 FPS budget: `>=36`.
- 25vs25 active AI budget: `<=22ms`.
- Snapshot sizes stayed well below staged budgets.

## LOD / State Observations

After the fix:

- 25vs25 runtime LOD showed up to 37 throttled actors.
- 25vs25 runtime skipped actor count also reached 37.
- 25vs25 detailed actors stayed at about 24-25 in the tested frames.
- `commandedSquads` and `commandLockedSquads` remained visible in state summaries.
- `commandState` / `commandLockUntil` remain part of squad and vehicle state.

This confirms actual runtime LOD application, not just classification.

## Traffic / Drone / Snapshot Observations

- Stuck infantry: 0 in all repeated runs.
- Stuck vehicles: 0 in all repeated runs.
- 25vs25 traffic-holding vehicles: worst 1 after the fix.
- 25vs25 wait-or-blocked vehicles: worst 1 after the fix.
- Drone cost stayed low in the follow-up run. A drone-heavy stress case is still a later event-mode concern, not a blocker for this staged 25vs25 gate.
- 25vs25 observer snapshot stayed under 93 KB in the follow-up aggregate, below the 360 KB budget.

## Regression Checks

Additional checks run during this pass:

- `npm run check`
- `npm run check:online`
- `node tools\check-ai-scale-readiness.cjs`
- `node tools\check-fps-command-integration.cjs`
- `node tools\check-bot-commander-skeleton.cjs`
- `node tools\check-tactical-map.cjs`

Observed from these checks:

- Scale readiness still passes.
- Online command smoke still passes.
- FPS + command integration still passes.
- BotCommander skeleton still passes.
- Tactical map smoke still passes.
- Infantry assault command still exposes `commandState: assault`, `commandSource: player`, and active command lock state.
- The LOD scheduler did not break command lock visibility.

## Follow-Up

Proceed to the AI scale performance completion report if final regression checks remain green.

Carry forward as non-blocking follow-ups:

- Do not enable 50vs50 as a default mode.
- Keep 50vs50 behind a separate event-mode stress gate.
- If drone-heavy 25vs25 variance returns, isolate drone tracking and anti-drone targeting cost.
- Keep measuring observer snapshot size before any online AI count increase.

## Final Decision

PASS: 8vs8, 15vs15, and 25vs25 repeated measurements pass after the narrow runtime LOD fix.

Next allowed stage: AI scale performance completion report.
