# 50v50 Event Candidate Integrated Verification Report - 2026-05-22

Decision: PASS EVENT-ONLY.

50vs50 can remain as a manually activated event / stress / spectator candidate based on the current local smoke evidence. This report does not approve 50vs50 as a default, ranked, normal online, or competitive mode.

## 1. Mode Position

50vs50 is:

- Event-only.
- Stress-test-only unless a future event gate says otherwise.
- Suitable for local / admin / spectator candidate testing.
- Activated manually through the `ai-50v50-event` scale profile.

50vs50 is not:

- A default mode.
- A ranked mode.
- A normal online mode.
- A quickplay baseline.
- The standard 4vs4 player experience.

Required restriction:

- If 50vs50 performance, readability, snapshot size, or command clarity fails in later testing, fall back to 25vs25 or test a reduced event profile such as 30vs30, 35vs35, or 40vs40.

## 2. Test Environment

- URL: `http://127.0.0.1:4203/index.html`
- Test mode: local browser smoke / stress through `tools/check-ai-scale-performance.cjs`
- Profile: `ai-50v50-event`
- Browser / server: headless Chrome through CDP, local `tools/static-server.cjs`
- Build reported by smoke tools: `863e91280d85`, branch `main`
- Platform: Windows x64
- CPU threads: 12
- System memory: about 17.1 GB
- Node: `v24.13.1`

Single-run smoke command:

```powershell
$env:IRONLINE_SCALE_PERF_COMPACT='1'
$env:IRONLINE_SCALE_PROFILES='ai-50v50-event'
$env:IRONLINE_SCALE_REPEATS='1'
$env:IRONLINE_SCALE_PERF_CDP_PORT='9290'
node tools\check-ai-scale-performance.cjs
```

Repeated stress command:

```powershell
$env:IRONLINE_SCALE_PERF_COMPACT='1'
$env:IRONLINE_SCALE_PROFILES='ai-50v50-event'
$env:IRONLINE_SCALE_REPEATS='3'
$env:IRONLINE_SCALE_PERF_CDP_PORT='9300'
node tools\check-ai-scale-performance.cjs
```

Repeated result: `allPass: true`.

## 3. Performance Results

Single-run smoke:

| Profile | AI Actors | Infantry | Vehicles | Drones | FPS | Frame | Active AI | Path/Move | Render | Snapshot | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 50vs50 event | 119 | 100 | 15 | 4 | 43.53 | 30.33ms | 22.80ms | 22.53ms | 3.98ms | 154,475 B | pass |

Repeated stress aggregate:

| Runs | Pass | Fail | Avg FPS | Min FPS | Max Frame | Avg Active AI | Max Active AI | Avg Path/Move | Max Path/Move | Max Render | Max Snapshot | Max Memory |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 3 | 3 | 0 | 43.29 | 34.11 | 32.57ms | 17.45ms | 23.27ms | 17.30ms | 23.00ms | 4.61ms | 154,240 B | 39.25 MB |

Event budget comparison:

| Metric | Worst Repeated Result | Event Budget | Result |
| --- | ---: | ---: | --- |
| FPS | 34.11 | `>=30` | pass |
| Frame time | 32.57ms | `<=40ms` | pass |
| Active AI update | 23.27ms | `<=32ms` | pass |
| Tactical map structural | 2.83ms | `<=34ms` | pass |
| Render | 4.61ms | `<=30ms` | pass |
| Observer snapshot | 154,240 B | `<=520,000 B` | pass |

Interpretation:

- 50vs50 starts and runs inside event budgets in local repeated smoke.
- The lowest observed FPS was 34.11, which is above the event floor but not enough to justify normal / ranked use.
- 50vs50 should stay event-only.

## 4. LOD / Snapshot Policy

Repeated 50vs50 observations:

| Metric | Worst / Max Observed |
| --- | ---: |
| Detailed actors | 50 |
| Normal actors | 63 |
| Reduced actors | 10 |
| LOD throttled actors | 69 |
| LOD skipped actors | 69 |
| Commanded squads | 26 |
| Command locked squads | 19 |
| Commanded vehicles | 15 |
| Command locked vehicles | 1 |

Verified:

- Runtime LOD is active.
- On-screen / engaged actors remain detailed.
- Off-screen ordered actors can be throttled.
- Snapshot policy remains summary-centered.
- Observer snapshot size stayed around 154 KB, below the 520 KB event budget.
- Full tactical-map node lists and full per-unit AI internals are not required for the measured observer payload.

## 5. Vehicle / Drone / Traffic / Stuck State

Repeated stress observations:

| Metric | Worst / Max Observed |
| --- | ---: |
| Vehicles | 15 |
| Drones | 5 |
| Vehicle cost | 3.72ms |
| Drone cost | 0.038ms |
| Stuck infantry | 0 |
| Stuck vehicles | 0 |
| Traffic-holding vehicles | 5 |
| Wait / blocked vehicles | 5 |

Interpretation:

- Vehicle and drone cost did not block the event candidate.
- Traffic and wait states increased, but remained observable and did not become a hard stuck blocker.
- No stuck infantry or stuck vehicle regression appeared in the repeated stress run.

## 6. Gameplay / Readability

Automated evidence:

- Command state remains visible at 50vs50 scale.
- 26 commanded squads and 15 commanded vehicles are visible in state summaries.
- Observer snapshots remain below budget.
- Runtime LOD prevents all AI from updating at detailed cadence.

Event-only caution:

- This report does not prove that 50vs50 is visually comfortable for normal play.
- Manual human readability should still be checked before any public showcase.
- 50vs50 is likely best as a spectator / admin / stress event unless a future live-play pass proves player readability.

Human impact rule remains:

- Human players must still affect the battle through command, combat, and objectives.
- AI-only fighting should not decide normal competitive victory.
- If 50vs50 is used as a showcase, it should be labeled clearly as an event / simulation mode.

## 7. Restrictions / Fallback

Keep:

- Manual activation only.
- Event flag only.
- Admin / observer summary snapshots.
- Runtime LOD enabled.
- 25vs25 as the approved staged normal AI expansion ceiling.

Block:

- Default 50vs50.
- Ranked 50vs50.
- Normal online 50vs50.
- Automatic matchmaking into 50vs50.

Fallback:

- If later event-room testing fails, reduce to 30vs30, 35vs35, or 40vs40 before retrying 50vs50.

## 8. Regression Checks

Commands run:

```powershell
npm run check
npm run check:online
node tools\check-fps-command-integration.cjs
node tools\check-bot-commander-skeleton.cjs
node tools\check-tactical-map.cjs
```

Results:

- `npm run check`: pass.
- `npm run check:online`: pass.
- `check-fps-command-integration`: pass.
- `check-bot-commander-skeleton`: pass.
- `check-tactical-map`: pass.

Maintained:

- FPS combat loop.
- FPS + command integration.
- Online command flow.
- BotCommander skeleton.
- Tactical map / cover-node layer.
- Runtime LOD.
- Summary-centered observer snapshots.

## 9. Final Decision

PASS EVENT-ONLY.

50vs50 can remain as a manually activated event / stress / spectator candidate.

This decision does not approve 50vs50 as a default, ranked, normal online, or competitive mode.

Next stage:

- Roadmap cleanup / next-season priority report.

Recommended roadmap note:

- 25vs25 is the current approved staged AI scale for normal progression.
- 50vs50 is a separate event candidate that passed local smoke budgets but still needs manual readability and event-room validation before any showcase.
