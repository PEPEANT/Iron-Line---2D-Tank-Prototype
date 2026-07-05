# AI V2 Tactical Map / Cover Nodes Completion Report - 2026-05-22

## Status

Verdict: PASS

The AI V2 tactical map / cover-node data-layer stage is complete for the current scope. The game now generates tactical battlefield data from map data, blockers, scenery, capture points, spawn data, nav graph / roads, active vehicles, wreck-capable cover sources, and optional manual tactical tags.

This is not a full AI behavior rewrite. It is the foundation that lets later AI behavior query battlefield meaning instead of relying only on raw coordinates and enemy positions.

## Test Environment

- Test helper: `node tools/check-tactical-map.cjs`
- Test mode: local browser smoke against `index.html`
- URL: `http://127.0.0.1:4201/index.html`
- Match phase: `live`
- Map metadata: `mapId: map01`, `mapVersion: 2026-05-22`
- Logs / state used:
  - `game.tacticalMap.summary()`
  - `game.tacticalMap.debugSnapshot()`
  - `game.aiObservatory.collect().tacticalMap`
  - `game.observerBridge.createSnapshot().world.tacticalMap`
  - renderer tactical debug overlay

## Tactical Map Results

| Tactical data | Result | Evidence |
| --- | --- | --- |
| Danger areas | PASS | 24 danger zones generated from objectives and open fire lanes. |
| Cover-capable areas | PASS | 748 cover nodes generated from blockers / scenery / wreck-capable cover sources. |
| Open fire lanes | PASS | 20 fire lanes generated from long open road segments with line checks. |
| Bottlenecks | PASS | 5406 bottleneck hints generated from constrained nav graph edges. |
| Vehicle-passable / wait zones | PASS | 5414 vehicle zones generated from traffic hints. |
| Objective outskirts approach points | PASS | 26 staging points generated from capture points and team base direction. |
| Vehicle-behind waiting points | PASS | 13 dynamic vehicle staging points generated behind active tanks / humvees. |

## Cover Nodes Results

| Required value | Result | Evidence |
| --- | --- | --- |
| Position | PASS | Every node exposes `x / y`; smoke sample: `cover:concrete:0:0`. |
| Defense direction | PASS | Nodes expose `defenseAngle`; smoke sample confirms finite value. |
| Capacity | PASS | Capacity is computed from blocker size / wreck type; smoke sample exposes `capacity: 4`. |
| Exposure risk | PASS | Nodes expose `exposureRisk`; smoke sample exposes `0.56`. |
| Accessibility | PASS | Generated nodes are filtered through `pointPassable`; manual tags can mark `accessible: false`. |
| Fire directions | PASS | Nodes expose `fireDirections` from line-open checks. |
| Source reference | PASS | Nodes carry source kind / source id / source rect for blocker context. |

## Staging / Rally Points Results

| Required staging data | Result | Evidence |
| --- | --- | --- |
| Base exit rally / staging | PASS | Base exit staging points are generated from `world.baseExitPoints`. |
| Objective outskirts staging | PASS | Smoke sample returned `stage:blue:A:1`. |
| Cover-line rally | PASS | Objective nav nodes and staging points are mirrored into rally points. |
| Vehicle-behind waiting point | PASS | Smoke sample returned `stage:vehicle:RAVEN:behind`. |
| Flank route entrance | PASS | Smoke sample staging point uses `kind: flank-entry`. |

## Vehicle Hints Results

| Vehicle hint | Result | Evidence |
| --- | --- | --- |
| Narrow roads | PASS | Bottleneck hints are created from constrained nav graph edges. |
| Vehicle waiting position | PASS | Bottleneck hints generate `vehicle-wait` zones with `waitRadius`. |
| Convoy spacing candidate | PASS | Spawn / spacing hints generate `vehicle-spacing` zones. |
| Spawn overlap risk | PASS | Spawn hints use `reason: spawn-overlap-risk`. |
| waitForClear candidate | PASS | Bottleneck hints expose `priority`, `widthHint`, and `waitRadius` metadata. |

## Map Change / UGC-Ready Structure

| Guardrail | Result | Evidence |
| --- | --- | --- |
| No tactical coordinate hardcoding | PASS | Tactical data is generated from map obstacles, scenery, capture points, roads/nav graph, spawns, vehicles, wrecks, and optional tags. |
| `mapId / mapVersion` connection | PASS | Smoke summary exposes `mapId: map01`, `mapVersion: 2026-05-22`. |
| Regeneration when map data changes | PASS | Tactical map signature includes map metadata, dimensions, capture/nav counts, tactical tags, obstacles, scenery, and wreck state. |
| `setWorld` regeneration | PASS | `setWorld()` rebuilds nav graph and tactical map for changed maps. |
| Scenario-ready regeneration | PASS | Tactical map rebuilds after `setupScenario()` so active vehicles create vehicle staging points. |
| Optional manual tags | PASS | `world.tacticalTags.coverNodes / stagingPoints / trafficHints / dangerZones` are supported without building a UGC platform. |
| Debug / admin / observer visibility | PASS | Tactical summaries are visible through debug overlay, observatory, and observer snapshots. |

## Minimal AI Connection Results

| AI use | Result | Evidence |
| --- | --- | --- |
| Cover selection | PASS | Infantry cover selection can consult `TacticalMap.bestCoverNodeFor` through `src/ai/infantry-tactical-map.js`. |
| Regroup position | PASS | `SquadAI.regroupPoint` can consult `rallyPointFor`. |
| Objective approach | PASS | `SquadAI.preAssaultPoint` can consult `stagingPointForObjective`. |
| waitForClear / vehicle waiting | PASS | Tank / humvee debug can expose `tacticalTrafficHint`, `tacticalTrafficReason`, and `tacticalVehicleStage`. |
| Vehicle waiting | PASS | Dynamic `vehicleStagingPoints` expose vehicle-behind wait data as tactical map data. |

## Regression Results

| Area | Result | Evidence |
| --- | --- | --- |
| Syntax / duplicate / code health | PASS | `npm.cmd run check` passes. |
| Tactical map smoke | PASS | `node tools/check-tactical-map.cjs` passes. |
| BotCommander skeleton | PASS | `node tools/check-bot-commander-skeleton.cjs` passes after tactical-map changes. |
| `commandState / commandLockUntil` | PASS | BotCommander skeleton and FPS-command integration smoke still verify command metadata. |
| FPS + command integration | PASS | `node tools/check-fps-command-integration.cjs` passes. |
| Anti-vehicle / vehicle balance | PASS | `node tools/check-anti-vehicle-balance.cjs` passes. |
| Online command flow | PASS | `npm.cmd run check:online` passes. |
| Whitespace / patch hygiene | PASS | `git diff --check` passes. |

## Current Smoke Counts

| Field | Count |
| --- | ---: |
| Cover nodes | 748 |
| Staging points | 26 |
| Vehicle staging points | 13 |
| Rally points | 31 |
| Traffic hints | 5414 |
| Bottlenecks | 5406 |
| Danger zones | 24 |
| Fire lanes | 20 |
| Vehicle zones | 5414 |
| Manual tactical tags | 0 |

## Scope Guard

Not done in this stage:

- AI full behavior rewrite.
- Complex learning AI.
- 50vs50 expansion.
- UGC / city platform work.
- Server-authority combat redesign.
- BotCommander behavior expansion.
- Complex doctrine system.

## Blockers

None.

## Final Decision

PASS: the project may move to the AI count expansion preparation stage.

Do not jump straight to 50vs50. The next stage should use the new tactical map data to prepare scaling safely, with debug visibility and performance checks before increasing AI count.
