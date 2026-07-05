# P0-10B WorldState Cadence / Interpolation Triage

Date: 2026-05-23

## Conclusion

AI choppiness is primarily a coarse worldState cadence plus divergent local simulation problem.

The non-host client still runs the battlefield/AI update locally, then receives host `worldState` snapshots about every 1.8-1.9s and applies them with a one-shot `lerp`. That creates visible corrections when the local simulation has drifted far from the host.

## Evidence

Probe: `node tools/check-p0-10b-worldstate-cadence.cjs`

Report: `reports/playtests/p0-10b-worldstate-20260523-113615/report.md`

| Page | Publish gap max | Apply gap max | Unit target max | Unit apply max | Vehicle target max | Vehicle apply max | Snapshot bytes max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| blue host | 1867ms | 0ms | 0px | 0px | 0px | 0px | 3928 |
| red remote | 0ms | 1906.8ms | 625.3px | 178.1px | 625.3px | 450.2px | 3387 |

Threshold counts on remote apply:

- Units over 32/64/96px target correction: `56 / 43 / 36`
- Vehicles over 32px target correction: `22`
- Capture point changes on apply: `0`

## Current Code Path

- `updateOnlineWorldSync` publishes host `worldState` every `1.8s`.
- `captureOnlineWorldState` snapshots vehicles, units, and capture points.
- `applyOnlineWorldState` applies remote snapshots with one-shot interpolation:
  - vehicles: `lerp(..., 0.72)` for position
  - units: `lerp(..., 0.7)` for position
- `updateBattlefield` still runs on non-host clients, so remote AI/vehicles continue local simulation between snapshots.

## Interpretation

The apply path has some smoothing, but it is only a single correction when a new snapshot arrives. With a 1.8-1.9s publish/apply gap, local non-host simulation can drift hundreds of pixels away from the host before the next correction.

This matches the manual symptom: AI appears to move in chunks even after player start timing converges.

Snapshot size is not the first suspect in this small scenario. The max worldState JSON size was about `3.9KB`, while the visible issue tracks with correction distance and cadence.

## Next Recommendation

Proceed to P0-10C narrow worldState cadence trim with payload/write guard.

Scope for the next pass:

- Reduce host worldState publish interval conservatively.
- Keep unchanged/small-delta snapshot writes suppressed if possible.
- Track room write count, snapshot bytes, long frames, and AI snap distance before/after.
- Keep AI behavior, server authority, WebSocket transport, admin/observer structure, 4-player expansion, and alpha status unchanged.

If cadence trim reduces snap distance but causes storage/fetch/frame regressions, the following branch should be a remote worldState interpolation buffer instead of further cadence increases.
