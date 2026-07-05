# AI Scale Performance Completion Report - 2026-05-22

Decision: PASS for staged AI count expansion through 25vs25.

This report closes the 8vs8 / 15vs15 / 25vs25 AI scale stage after the interim report and the report-based narrow validation / fix pass. It does not make 50vs50 a default mode. 50vs50 remains an event / stress-test candidate only.

## Scope

Goal: decide whether staged AI counts can move past the scale-readiness phase based on performance, command structure, FPS combat, online snapshot policy, and tactical-map visibility.

Included:

- 8vs8 / 15vs15 / 25vs25 repeated performance checks.
- Runtime LOD enforcement and observability.
- Command structure and command lock regression checks.
- Online command smoke coverage.
- FPS + command integration smoke coverage.
- BotCommander skeleton and tactical-map smoke coverage.

Not included:

- 50vs50 default mode.
- 50vs50 event-mode implementation.
- Broad AI V2 behavior rewrite.
- UGC / city work.
- Server-authority combat rewrite.
- Learning AI.

## 1. Test Environment

- Execution URL: `http://127.0.0.1:4203/index.html` for AI scale performance checks.
- Test mode: local browser smoke using staged AI density profiles.
- Browser / server: headless Chrome through CDP, local `tools/static-server.cjs`.
- Measurement script: `tools/check-ai-scale-performance.cjs`.
- Measurement method: each profile starts from a fresh browser profile, applies `game.aiScaleReadiness.applyProfile(profileId)`, enters live battle, waits 150 animation frames, records `game.aiScaleReadiness.snapshot({ includeNetwork: true })`, and evaluates profile budgets.
- Build reported by smoke tools: `863e91280d85`, branch `main`.
- Platform: Windows x64.
- CPU threads: 12.
- System memory: about 17.1 GB.
- Node: `v24.13.1`.

Final repeated performance command:

```powershell
$env:IRONLINE_SCALE_PERF_COMPACT='1'
$env:IRONLINE_SCALE_PROFILES='ai-8v8,ai-15v15,ai-25v25'
$env:IRONLINE_SCALE_REPEATS='3'
$env:IRONLINE_SCALE_PERF_CDP_PORT='9280'
node tools\check-ai-scale-performance.cjs
```

Result: `allPass: true`.

Regression checks:

```powershell
npm run check
npm run check:online
node tools\check-ai-scale-readiness.cjs
node tools\check-fps-command-integration.cjs
node tools\check-bot-commander-skeleton.cjs
node tools\check-tactical-map.cjs
git diff --check
```

Results:

- `npm run check`: pass.
- `npm run check:online`: pass.
- `check-ai-scale-readiness`: pass.
- `check-fps-command-integration`: pass.
- `check-bot-commander-skeleton`: pass.
- `check-tactical-map`: pass.
- `git diff --check`: pass.

## 2. AI Count Final Results

Final repeated aggregate after the narrow runtime LOD fix:

| Profile | Runs | Pass | Fail | Avg FPS | Min FPS | Max Frame | Max Active AI | Max Path/Move | Max Render | Max Snapshot | Max Memory | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 8vs8 | 3 | 3 | 0 | 60.00 | 59.99 | 6.36ms | 3.10ms | 3.08ms | 2.08ms | 46,618 B | 25.05 MB | pass |
| 15vs15 | 3 | 3 | 0 | 55.48 | 46.40 | 15.87ms | 8.96ms | 8.65ms | 3.88ms | 67,474 B | 25.09 MB | pass |
| 25vs25 | 3 | 3 | 0 | 58.71 | 56.64 | 13.22ms | 9.23ms | 9.21ms | 2.90ms | 92,056 B | 36.57 MB | pass |

Budget interpretation:

- 8vs8 remains well above the 45 FPS budget.
- 15vs15 remains above the 42 FPS budget, with one lower but still-passing 46.40 FPS sample.
- 25vs25 remains above the 36 FPS budget across all follow-up runs.
- Active AI time, path / movement cost, render cost, and snapshot size remain inside staged budgets.

## 3. 25vs25 Variance Final Decision

Initial repeated validation reproduced the 25vs25 concern:

- 25vs25 initial repeated run: 2 pass, 1 fail.
- Failing sample: 30.85 FPS against the 36 FPS budget.
- Active AI cost in that sample: 21.42ms against the 22ms budget.
- Path / movement cost in that sample: 21.31ms.
- Stuck infantry / vehicles: 0.
- Traffic holding / wait-or-blocked vehicles: 4.

Root cause:

- The problem was not primarily render cost, tactical-map structural time, or snapshot size.
- The likely cause was too many off-screen ordered actors staying in `detailed` LOD because squad-commanded actors were classified as fully engaged.
- This caused distant ordered units to keep detailed AI update cadence even when they were not on-screen, near-player, suppressed, or in target contact.

Narrow fix:

- Off-screen ordered actors now use `normal` LOD.
- On-screen, near-player, suppressed, recently threatened, or target-engaged actors remain `detailed`.
- Entity timers still tick every frame; only AI decision updates are throttled.

Final decision:

- 25vs25 is stable enough for the staged AI count expansion gate.
- No 25vs25-specific gameplay restriction is required beyond keeping runtime LOD enabled.
- 50vs50 still needs a separate event-mode stress gate.

## 4. LOD / Performance Criteria

Runtime LOD behavior after the fix:

| Profile | Detailed Actors | Throttled Actors | Skipped Actors | Reduced Actors | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| 8vs8 | up to 9 | up to 16 | up to 16 | up to 2 | pass |
| 15vs15 | up to 15 | up to 24 | up to 24 | up to 3 | pass |
| 25vs25 | up to 25 | up to 37 | up to 37 | up to 4 | pass |

Verified behavior:

- On-screen AI keeps detailed updates.
- Near-player or actively engaged AI keeps detailed updates.
- Off-screen ordered AI falls to `normal` update cadence.
- Far off-screen non-engaged AI can fall to `reduced`.
- `commandState` / `commandLockUntil` remain visible because command state belongs to squads / vehicle orders, not only to per-unit AI update ticks.
- LOD state is visible in `AIScaleReadiness.stateSummary`, observer snapshots, and observatory snapshots.

## 5. Command Structure

Confirmed:

- `CommanderSlot -> SquadLeader -> Unit` remains intact.
- `BotCommander` skeleton remains intact.
- Human command priority remains intact.
- `commandState` / `commandLockUntil` remain visible.
- Unit AI throttling does not directly own or erase command locks.

Regression evidence:

- `node tools\check-fps-command-integration.cjs` passed.
- `node tools\check-bot-commander-skeleton.cjs` passed.
- Infantry assault still exposes `commandState: assault`, `commandSource: player`, and active command lock state.
- Bot-sourced commands still include `commandSource: bot`, `commanderSlotId`, target squad / asset ids, and lock state.

## 6. Vehicle / Drone / Tactical Map Load

Final follow-up aggregate:

| Profile | Max Vehicle / Path-Move Contribution | Max Drone Cost | Max Tactical Map Structural | Worst Traffic Holds | Worst Wait/Blocked | Stuck Infantry | Stuck Vehicles |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 8vs8 | 3.08ms path/move | ~0.004ms | 0.003ms steady sample | 0 | 0 | 0 | 0 |
| 15vs15 | 8.65ms path/move | ~0.007ms | 0.005ms steady sample | 2 | 2 | 0 | 0 |
| 25vs25 | 9.21ms path/move | 0.081ms | 0.006ms steady sample | 1 | 1 | 0 | 0 |

Interpretation:

- Vehicle steering / traffic remains measurable and within budget at 25vs25.
- Drone tracking cost did not block the staged 25vs25 gate.
- Tactical map / cover-node reference cost stayed low during steady play.
- No stuck infantry or stuck vehicle regression appeared in repeated runs.
- `waitForClear` / traffic holding remains observable and does not block 25vs25 completion.

## 7. Online Snapshot Impact

Final max observer snapshot sizes:

| Profile | Max Snapshot | Budget | Result |
| --- | ---: | ---: | --- |
| 8vs8 | 46,618 B | 220,000 B | pass |
| 15vs15 | 67,474 B | 280,000 B | pass |
| 25vs25 | 92,056 B | 360,000 B | pass |

Snapshot policy remains:

- Do not send full AI internals every tick.
- Prefer squad / vehicle / drone summaries.
- Preserve `commandState`, position, hp, and major events.
- Avoid sending full tactical-map node lists in normal online snapshots.

Online regression:

- `npm run check:online` passed with 2 players, combat event flow, command packets, WebSocket ack / broadcast, and observer snapshot coverage.

## 8. Regression Confirmation

Maintained:

- FPS combat loop.
- FPS + command integration.
- Online command flow.
- BotCommander skeleton.
- AI V2 tactical map / cover-node layer.
- `TacticalMap.summary()`, debug / observer visibility, cover nodes, staging points, rally points, traffic hints.
- Anti-vehicle / vehicle balance was not changed in this pass.

Relevant smoke results:

- `check-fps-command-integration`: pass.
- `check-bot-commander-skeleton`: pass.
- `check-tactical-map`: pass.
- `check-ai-scale-readiness`: pass.

## 9. Final Decision

PASS.

8vs8 / 15vs15 / 25vs25 staged AI count expansion is complete for the current local / smoke-test criteria.

Allowed next stage:

- 50vs50 event-mode preparation / stress gate.

Important restriction:

- This report does not approve 50vs50 as a default mode.
- 50vs50 remains event-only until a separate event-mode stress report passes.

Recommended next gate:

- `50vs50 event-mode readiness / stress test 1차`.

That next gate should measure FPS, AI time, path / movement cost, drone / vehicle burst cost, snapshot size, traffic waits, stuck states, and command readability under event-only 50vs50 conditions.
