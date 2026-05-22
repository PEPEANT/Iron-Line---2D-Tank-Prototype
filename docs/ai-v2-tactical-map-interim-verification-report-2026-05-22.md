# AI V2 Tactical Map / Cover Nodes Interim Verification Report - 2026-05-22

## Status

Verdict: ON TRACK

Tactical Map / Cover Nodes / Staging Points / Vehicle Hints are generated in the live game and are visible through debug / observer / observatory state. This is still a data-layer checkpoint, not an AI behavior completion report.

The only partial item is literal "wait behind vehicle" staging. The current implementation exposes vehicle wait / spacing zones through traffic hints, but does not yet create a dedicated infantry staging point behind each moving vehicle. Treat that as a narrow follow-up candidate, not a blocker for the current data-layer verification.

## Test Environment

- Test helper: `node tools/check-tactical-map.cjs`
- Test mode: local browser smoke against `index.html`
- URL: `http://127.0.0.1:4201/index.html`
- Match phase: `live`
- Logs / state used:
  - `game.tacticalMap.summary()`
  - `game.tacticalMap.debugSnapshot()`
  - `game.aiObservatory.collect().tacticalMap`
  - `game.observerBridge.createSnapshot().world.tacticalMap`
  - `game.debug.tacticalMap`

## Tactical Map Generation Results

| Item | Result | Evidence |
| --- | --- | --- |
| Danger areas | PASS | 24 danger zones generated, including objective crossfire and open fire-lane danger. |
| Cover-capable areas | PASS | 748 cover nodes generated from blockers / scenery / wreck-capable cover sources. |
| Open fire lanes | PASS | 20 fire lanes generated from long open road segments. |
| Bottlenecks | PASS | 5406 bottleneck hints generated from constrained navigation edges. |
| Vehicle-passable / wait zones | PASS | 5414 vehicle zones generated from traffic hints. |
| Objective outskirts approach points | PASS | 26 staging points generated, including objective flank-entry / approach points. |

## Cover Nodes Results

| Required value | Result | Evidence |
| --- | --- | --- |
| Position | PASS | Sample node exposes `x / y`. |
| Defense direction | PASS | Sample node exposes finite `defenseAngle`. |
| Capacity | PASS | Sample node exposes `capacity: 4`. |
| Exposure risk | PASS | Sample node exposes `exposureRisk: 0.56`. |
| Accessibility | PASS | Nodes are filtered through passability checks before registration. |
| Fire directions | PASS | Nodes expose `fireDirections` from open line checks. |
| Source reference | PASS | Sample node exposes `sourceKind: concrete`. |

## Staging / Rally Points Results

| Item | Result | Evidence |
| --- | --- | --- |
| Base exit rally / staging | PASS | `base-exit` staging points are generated from world base exit points. |
| Objective outskirts staging | PASS | `stage:blue:A:1` returned for objective A. |
| Cover-line / staging rally | PASS | Staging points are mirrored into `staging-rally` entries. |
| Flank route entrance | PASS | Returned sample staging point uses `kind: flank-entry`. |
| Vehicle-behind waiting point | PARTIAL | Vehicle wait / spacing exists as traffic hints; no dedicated infantry "behind vehicle" staging node is generated yet. |

## Vehicle Hints Results

| Item | Result | Evidence |
| --- | --- | --- |
| Narrow roads | PASS | Sample hint `traffic:blue_gate_out:blue_west` uses `kind: bottleneck`. |
| Vehicle waiting position | PASS | Bottleneck hints generate `vehicle-wait` zones with `waitRadius`. |
| Convoy spacing candidate | PASS | Spawn / spacing hints generate `vehicle-spacing` zones. |
| Spawn overlap risk | PASS | Spawn hints use `reason: spawn-overlap-risk`. |
| waitForClear candidate | PASS | Bottleneck hints expose wait candidates with priority / clearance metadata. |

## Debug / Observability

| Check | Result | Evidence |
| --- | --- | --- |
| In-game debug toggle | PASS | `game.setDebugOption("tacticalMap", true)` returns true. |
| Debug overlay path | PASS | `renderer-debug` draws danger zones, fire lanes, cover nodes, staging points, and traffic hints when enabled. |
| Node counts visible | PASS | `summary()` exposes counts for cover, staging, rally, traffic, danger, fire lanes, and vehicle zones. |
| Observatory visibility | PASS | `aiObservatory.collect().tacticalMap.coverNodes === 748`. |
| Observer visibility | PASS | `observerBridge.createSnapshot().world.tacticalMap.coverNodes === 748`. |

## Minimal AI Connection Check

| AI state / use | Result | Evidence |
| --- | --- | --- |
| Cover selection | PASS | `src/ai/infantry-tactical-map.js` lets infantry cover selection consult `bestCoverNodeFor`. |
| Regroup position | PASS | `SquadAI.regroupPoint` can consult `rallyPointFor`. |
| Objective approach / pre-assault | PASS | `SquadAI.preAssaultPoint` can consult `stagingPointForObjective`. |
| waitForClear / vehicle waiting | PARTIAL | Tank / humvee debug can expose nearby traffic hints; movement behavior is not rewritten in this pass. |
| Vehicle waiting | PARTIAL | Vehicle hints are visible as debug / observability data only. |
| Objective approach | PASS | Objective staging lookup returns usable points. |

## Current Counts From Smoke

| Field | Count |
| --- | ---: |
| Cover nodes | 748 |
| Staging points | 26 |
| Rally points | 31 |
| Traffic hints | 5414 |
| Bottleneck hints | 5406 |
| Danger zones | 24 |
| Fire lanes | 20 |
| Vehicle zones | 5414 |

## Scope Guard

Not done in this checkpoint:

- AI full behavior rewrite.
- BotCommander enhancement.
- Learning AI.
- 50vs50 scaling.
- UGC / city work.
- Server-authority combat redesign.
- Complex doctrine system.

## Blockers

None.

## Follow-Up Candidates

- Decide whether "vehicle-behind waiting point" should become a dedicated infantry staging node in the next narrow correction pass.
- Consider reducing traffic hint density later if debug readability becomes noisy. Current high count is useful for proving coverage but may be too dense for manual overlay reading.

## Current Decision

ON TRACK: continue to the AI V2 tactical map / cover-node report-based narrow correction pass.

Do not widen into AI V2 behavior yet. The next pass should only correct missing or noisy tactical-map data discovered by this report.
