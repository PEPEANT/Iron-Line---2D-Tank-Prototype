# AI V2 Tactical Map / Cover Nodes First Pass Report - 2026-05-22

## Status

Verdict: PASS

The AI V2 first pass now creates an AI-readable battlefield data layer. This pass does not rewrite AI behavior. It adds tactical map data, cover nodes, staging / rally points, traffic hints, debug visibility, observatory visibility, and only minimal AI references where they directly support existing behavior.

The next stage should verify the tactical map in live play before widening AI behavior.

## Test Environment

- Test helper: `node tools/check-tactical-map.cjs`
- Test mode: local browser smoke against `index.html`
- URL: `http://127.0.0.1:4201/index.html`
- Build: `main` at `d2a8066bb17c` plus local first-pass changes
- Logs / state used:
  - `game.tacticalMap.summary()`
  - `game.tacticalMap.debugSnapshot()`
  - `game.aiObservatory.collect().tacticalMap`
  - `game.observerBridge.createSnapshot().world.tacticalMap`
  - `game.debug.tacticalMap`

## Tactical Map Data Results

| Data | Result | Evidence |
| --- | --- | --- |
| Tactical map exists at runtime | PASS | `game.tacticalMap` is created and rebuilds in live play. |
| Cover nodes generated | PASS | 748 cover nodes in smoke run. |
| Staging points generated | PASS | 26 staging points in smoke run. |
| Rally points generated | PASS | 31 rally points in smoke run. |
| Traffic hints generated | PASS | 5414 traffic hints, including 5406 bottleneck hints. |
| Danger zones generated | PASS | 24 danger zones in smoke run. |
| Fire lanes generated | PASS | 20 fire lanes in smoke run. |

## Cover Node Results

| Field | Result | Evidence |
| --- | --- | --- |
| Position | PASS | Cover node coordinates are exposed in `debugSnapshot`. |
| Defense direction | PASS | Cover node exposes finite `defenseAngle`. |
| Capacity | PASS | Sample node exposed `capacity: 4`. |
| Exposure risk | PASS | Sample node exposed numeric `exposureRisk`. |
| Source reference | PASS | Sample node exposed `sourceKind: concrete`. |
| Tactical cover query | PASS | `bestCoverNodeFor` returns a valid cover node for a synthetic unit / threat probe. |

## Staging / Rally Results

| Check | Result | Evidence |
| --- | --- | --- |
| Objective staging lookup | PASS | `stagingPointForObjective("blue", A)` returned `stage:blue:A:1`. |
| Staging purpose | PASS | Returned staging point uses `flank-entry`. |
| Objective rally lookup | PASS | `rallyPointFor("blue", A)` returned `rally:A:a_point`. |
| Base exit staging exists | PASS | Tactical map includes base-exit staging entries in the staging list. |

## Vehicle / Traffic Results

| Check | Result | Evidence |
| --- | --- | --- |
| Traffic hint lookup | PASS | `vehicleHintNear` returned `traffic:blue_gate_out:blue_west`. |
| Bottleneck reason | PASS | Sample traffic hint exposes `reason: narrow-clearance`. |
| Priority | PASS | Sample traffic hint exposes `priority: 3`. |
| Vehicle AI debug metadata | PASS | Tank / humvee debug state can expose tactical traffic hint and reason without changing vehicle orders. |

## Minimal AI Integration

Completed:

- Infantry cover selection can consult `TacticalMap.bestCoverNodeFor` through `src/ai/infantry-tactical-map.js`.
- Squad regroup can consult tactical rally points.
- Squad pre-assault staging can consult tactical staging points.
- Tank and humvee debug state can expose nearby tactical traffic hints.
- Observer / observatory snapshots expose tactical map summaries.
- Renderer debug overlay can show tactical nodes when `tacticalMap` debug is enabled.

Not included:

- Full AI behavior rewrite.
- New doctrine logic.
- Learning AI.
- 50vs50 scaling.
- UGC / city work.
- Server-authority combat redesign.
- BotCommander behavior expansion.

## Debug / Observability Results

| Check | Result | Evidence |
| --- | --- | --- |
| Debug toggle | PASS | `game.setDebugOption("tacticalMap", true)` returns true. |
| In-game debug flag | PASS | `game.debug.tacticalMap === true`. |
| Observatory summary | PASS | `aiObservatory.collect().tacticalMap.coverNodes === 748`. |
| Observer snapshot summary | PASS | `observerBridge.createSnapshot().world.tacticalMap.coverNodes === 748`. |
| Renderer debug path | PASS | `drawDebugOverlay` calls `drawTacticalMapDebug` when enabled. |

## Regression Results

| Area | Result | Evidence |
| --- | --- | --- |
| Syntax / duplicate / code health | PASS | `npm.cmd run check` passes for 97 JavaScript files. |
| Infantry hotspot budget | PASS | Direct infantry changes were moved into `src/ai/infantry-tactical-map.js`; `infantry-ai.js` remains at the existing 2850-line budget. |
| Existing command flow | PASS | This pass does not alter `CommandBus` or role command packet semantics. |
| Vehicle behavior scope | PASS | Vehicle traffic integration is debug/hint-only in this pass. |

## Blockers

None recorded.

## Final Decision

PASS: the project may proceed to the AI V2 tactical map / cover-node interim verification stage.

Do not treat this as AI V2 behavior completion. This pass only gives AI a battlefield data layer to consult. The next stage should verify live readability, node usefulness, and whether the minimal AI references improve behavior without causing command-flow regressions.
