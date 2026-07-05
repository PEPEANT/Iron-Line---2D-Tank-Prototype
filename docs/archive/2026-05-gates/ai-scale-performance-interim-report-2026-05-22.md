# AI Scale Performance Interim Report - 2026-05-22

Decision: ON TRACK for staged AI count expansion testing, with caution around 25vs25 variance.

This is an interim performance report, not an AI count expansion completion report. It verifies 8vs8, 15vs15, and 25vs25 using the scale-readiness metrics added in the first pass. It does not enable 50vs50 as a default mode.

## Test Environment

- URL: `http://127.0.0.1:4203/index.html`
- Test mode: local browser smoke via `tools/check-ai-scale-performance.cjs`
- Browser/server: headless Chrome through CDP, local `tools/static-server.cjs`
- Build: `863e91280d85`, branch `main`
- Platform: Windows x64
- CPU threads: 12
- System memory: about 17.1 GB
- Node: `v24.13.1`
- Measurement method: each profile starts from a fresh browser profile, applies `game.aiScaleReadiness.applyProfile(profileId)`, enters live battle, waits 150 animation frames, then records `game.aiScaleReadiness.snapshot({ includeNetwork: true })` and `evaluate(profileId)`.

Command:

```powershell
$env:IRONLINE_SCALE_PERF_COMPACT='1'; node tools\check-ai-scale-performance.cjs
```

Latest compact run: `allPass: true`.

## AI Count Results

| Profile | AI Actors | Infantry | Vehicles | Drones | FPS | Frame | Active AI | Path/Move | Render | Snapshot | Memory | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 8vs8 | 23 | 16 | 7 | 0 | 60.02 | 10.21ms | 6.59ms | 6.54ms | 2.54ms | 46,431 B | 34.7 MB | pass |
| 15vs15 | 40 | 30 | 9 | 1 | 50.30 | 16.73ms | 13.22ms | 13.14ms | 2.21ms | 69,165 B | 18.8 MB | pass |
| 25vs25 | 61 | 50 | 11 | 0 | 43.91 | 19.72ms | 15.34ms | 15.28ms | 3.05ms | 94,991 B | 45.5 MB | pass |

Budget checks passed in the latest compact run:

- 8vs8: FPS, frame, active AI, tactical-map structural time, render, and snapshot size passed.
- 15vs15: FPS, frame, active AI, tactical-map structural time, render, and snapshot size passed.
- 25vs25: FPS, frame, active AI, tactical-map structural time, render, and snapshot size passed.

## Variance Note

One earlier compact run in the same pass reported `allPass: false`:

- 15vs15 dipped to 39.26 FPS against a 42 FPS budget, while active AI stayed within budget at 15.89ms.
- 25vs25 dipped to 30.30 FPS against a 36 FPS budget, and active AI slightly exceeded budget at 22.37ms against 22ms.
- That 25vs25 sample had 4 active drones and 65 AI actors, while the latest passing run had 0 active drones and 61 AI actors.

Interpretation: 8vs8 is stable. 15vs15 and 25vs25 are capable of passing, but 25vs25 is not yet stable enough to call the whole AI expansion completed. The next pass should repeat 15vs15 / 25vs25 measurements and investigate drone / engagement variance before 50vs50 event work.

## AI LOD Results

Latest LOD classification:

| Profile | Detailed | Normal | Reduced | Idle |
| --- | ---: | ---: | ---: | ---: |
| 8vs8 | 9 | 4 | 10 | 0 |
| 15vs15 | 23 | 2 | 15 | 0 |
| 25vs25 | 31 | 4 | 26 | 0 |

Current state:

- On-screen / near-player / engaged AI are classified as `detailed`.
- Near-front AI are classified as `normal`.
- Far off-screen AI are classified as `reduced`.
- Dead / inactive units can classify as `idle`.

Important limitation: this pass verifies LOD classification and observability. It does not prove that every AI system is already throttled by those update-rate targets. If 25vs25 variance remains, actual LOD update-rate enforcement should be the next narrow performance fix.

## Command Structure / State Summary

| Profile | Commanded Squads | Locked Squads | Commanded Vehicles | Locked Vehicles |
| --- | ---: | ---: | ---: | ---: |
| 8vs8 | 6 | 4 | 7 | 2 |
| 15vs15 | 8 | 6 | 9 | 1 |
| 25vs25 | 14 | 10 | 11 | 1 |

Observed:

- `CommanderSlot -> SquadLeader -> Unit` structure remains intact at scale-readiness level.
- `commandState` / `commandLockUntil` remain visible in scale snapshots.
- BotCommander skeleton state remains observable as bot-sourced commands and slot state.
- Human command priority was not modified in this pass.

## Vehicle / Drone / Traffic Load

| Profile | Vehicle Time | Drone Time | Stuck Infantry | Stuck Vehicles | Traffic Holds | Wait/Blocked Vehicles |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 8vs8 | 2.96ms | ~0.00ms | 0 | 0 | 1 | 1 |
| 15vs15 | 3.23ms | 0.03ms | 0 | 0 | 2 | 2 |
| 25vs25 | 4.00ms | ~0.00ms | 0 | 0 | 3 | 3 |

Observed:

- Vehicle cost rises with scale but stayed inside the measured budget in the latest compact run.
- Drone cost is low in the latest run, but the variance sample suggests drone/engagement state can push 25vs25 closer to budget.
- No stuck infantry or stuck vehicles were reported in the latest compact run.
- Traffic holding / wait-or-blocked vehicle counts increased gradually with AI count, which is expected and still observable.
- Tactical-map structural time stayed very low during steady play because the expensive rebuild path was not repeatedly triggered.

## Online Snapshot Impact

Latest observer snapshot sizes:

- 8vs8: about 46 KB.
- 15vs15: about 69 KB.
- 25vs25: about 95 KB.

All are under the current staged budgets.

Snapshot policy remains:

- Do not send full AI internals every tick.
- Prefer squad / vehicle / drone summaries.
- Keep `commandState`, position, hp, and major events.
- Avoid full tactical-map node lists in online snapshots.

## Regression / Related Checks

This interim pass added:

- `tools/check-ai-scale-performance.cjs`
- `stateSummary` in `AIScaleReadiness.snapshot()`

The first-pass smoke and broader regressions should be re-run before the completion report. The current interim evidence is enough for ON TRACK, not enough for final expansion completion.

## Current Decision

ON TRACK.

Reason:

- 8vs8 passed cleanly.
- 15vs15 and 25vs25 passed in the latest compact run.
- Metrics, LOD classification, state summaries, traffic holds, and snapshot sizes are visible.

Caution:

- One 15vs15 / 25vs25 run dipped below FPS budget.
- 25vs25 should not be marked complete until repeated measurements confirm stability or a narrow LOD / drone / engagement variance fix is applied.
- 50vs50 remains event-only and must not be opened as a default mode from this report.
