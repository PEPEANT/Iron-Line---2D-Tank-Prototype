# AI V2 Tactical Map / Cover Nodes Correction Pass - 2026-05-22

## Status

Verdict: PASS

This pass fixes only the narrow issues identified by the interim tactical-map report. It does not rewrite AI behavior, does not expand BotCommander behavior, and does not start 50vs50 / UGC / city / server-authority work.

## Correction Scope

The interim report was ON TRACK, with one PARTIAL item:

- Vehicle-behind waiting points existed only as vehicle traffic hints, not as a dedicated staging data set.

This pass adds a separate dynamic `vehicleStagingPoints` data set for vehicle-behind waiting positions and exposes it through tactical map summary / debug / observer paths.

## Code Changes

| File | Change |
| --- | --- |
| `src/systems/tactical-map.js` | Adds dynamic `vehicleStagingPoints`, generated behind active tanks / humvees, refreshed on a short timer, and exposed through `summary()` / `debugSnapshot()`. |
| `src/main.js` | Rebuilds the tactical map after `setupScenario()` so vehicle-derived data exists in normal live play, not only in QA rebuilds. |
| `src/systems/renderer-debug.js` | Draws vehicle-behind staging points and includes the vehicle-stage count in the tactical overlay label. |
| `src/ai/tank-ai.js` | Adds debug-only `tacticalVehicleStage` for the vehicle's generated behind-wait staging point. |
| `src/ai/humvee-ai.js` | Adds debug-only `tacticalVehicleStage` for humvees. |
| `tools/check-tactical-map.cjs` | Verifies `vehicleStagingPoints` and records a sample vehicle-behind staging node. |

## Pass / Fail Table

| Area | Result | Evidence |
| --- | --- | --- |
| Danger areas | PASS | 24 danger zones remain generated. |
| Cover nodes | PASS | 748 cover nodes remain generated. |
| Fire lanes | PASS | 20 fire lanes remain generated. |
| Bottlenecks / vehicle zones | PASS | 5414 traffic hints and 5414 vehicle zones remain generated. |
| Objective staging | PASS | `stage:blue:A:1` still resolves as objective flank-entry staging. |
| Rally points | PASS | 31 rally points remain generated. |
| Vehicle-behind waiting points | PASS | 13 `vehicleStagingPoints` generated; sample `stage:vehicle:RAVEN:behind`. |
| Debug / observer visibility | PASS | Observatory and observer snapshots both expose `vehicleStagingPoints: 13`. |
| AI behavior scope | PASS | Vehicle staging is data/debug-only; no movement rewrite was introduced. |

## Smoke Evidence

Command:

```powershell
node tools/check-tactical-map.cjs
```

Result:

- `ok: true`
- `coverNodes: 748`
- `stagingPoints: 26`
- `vehicleStagingPoints: 13`
- `rallyPoints: 31`
- `trafficHints: 5414`
- `dangerZones: 24`
- `fireLanes: 20`
- Sample vehicle staging node: `stage:vehicle:RAVEN:behind`

Additional check:

```powershell
npm.cmd run check
```

Result: PASS for syntax, duplicate-method, and code-health checks.

## Remaining Notes

- Traffic hint density is still high. It is not a blocker, because coverage is working, but manual overlay readability may need a later display filter or density cap.
- `vehicleStagingPoints` are exposed as a separate dynamic tactical-map data set instead of being mixed into static objective staging. This keeps objective staging stable while allowing vehicle-follow wait data to move with active vehicles.

## Blockers

None.

## Final Decision

PASS: proceed to the AI V2 tactical map / cover-node completion report.

Do not use this as permission to start full AI V2 behavior. The next document should close the data-layer stage and decide whether deeper behavior integration can begin.
