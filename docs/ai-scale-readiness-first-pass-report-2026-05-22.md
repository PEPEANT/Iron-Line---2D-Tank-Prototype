# AI Scale Readiness First Pass Report - 2026-05-22

Decision: PASS for the AI count expansion preparation / performance criteria first pass.

This pass did not enable 50vs50 as a default mode. It adds measurable scale profiles, performance budgets, AI LOD classification, online snapshot policy, and smoke coverage so AI counts can be raised in stages.

## Scope

Goal: prepare AI count scaling before increasing the live AI count.

Included:

- Stage profiles for 8vs8, 15vs15, 25vs25, and 50vs50 event-only AI.
- Runtime scale snapshot exposed through `game.aiScaleReadiness`.
- Observer / observatory visibility for scale counts, performance, LOD classification, and snapshot policy.
- Browser smoke test for the 8vs8 baseline.
- Separate performance budgets for active AI update time and tactical-map structural time.

Not included:

- Making 50vs50 the default.
- AI V2 behavior rewrites.
- UGC / city work.
- Server-authority combat redesign.
- Learning AI.

## Scale Profiles

| Profile | Infantry | Tanks | Purpose | Event Only |
| --- | ---: | ---: | --- | --- |
| `ai-8v8` | 8 blue / 8 red | 1 blue AI tank / 1 red tank | First scale gate | no |
| `ai-15v15` | 15 blue / 15 red | 2 blue AI tanks / 2 red tanks | Second scale gate | no |
| `ai-25v25` | 25 blue / 25 red | 3 blue AI tanks / 3 red tanks | Third scale gate | no |
| `ai-50v50-event` | 50 blue / 50 red | 5 blue AI tanks / 5 red tanks | Event / stress gate only | yes |

## Performance Criteria

The readiness snapshot records:

- FPS.
- Frame time.
- Update time.
- Active AI update time.
- Tactical-map structural time.
- Pathfinding / movement cost.
- Render cost.
- Network observer snapshot size.
- Memory usage when browser heap metrics are available.

Important correction: active AI update time now excludes tactical-map structural timing. Tactical-map rebuild/update cost remains visible and budgeted separately. This prevents one-off or structural battlefield-data work from being mistaken for per-frame AI decision cost.

## LOD Criteria

The first pass defines and exposes LOD classification. It does not yet throttle every AI update from this classification.

| LOD | Update Target | Reason |
| --- | ---: | --- |
| `detailed` | 100ms | On-screen, actively engaged, or near player |
| `normal` | 250ms | Near camera, ordered, or near objective |
| `reduced` | 500ms | Far off-screen and not engaged |
| `idle` | 1000ms | Dead, mounted, or waiting without contact |

This gives the next scaling stage a concrete basis for lowering update rate on far or idle units without changing the commander / squad / unit command hierarchy.

## Squad Update Criteria

The scale readiness pass preserves the existing command structure:

- Commander and squad-level decisions stay separate from unit execution.
- Units should not all perform large strategic decisions every frame.
- `commandState` and `commandLockUntil` remain part of the scale snapshot and are not replaced by the LOD pass.

No full AI behavior rewrite was performed.

## Vehicle / Drone Load Visibility

The readiness snapshot reports vehicle and drone update timing separately:

- `vehiclesMs`.
- `dronesMs`.
- `pathfindingAndMovementMs`.
- `tacticalMapMs`.

This is enough for the next stage to detect whether scale pressure is coming from vehicles, drones, movement/pathfinding, or tactical-map structural data.

## Online Snapshot Policy

The first-pass policy is:

- Do not send full AI internals every tick.
- Prefer squad, vehicle, and drone summaries.
- Include command state, position, hp, and major events.
- Avoid full tactical-map node lists and per-frame deep debug payloads in online snapshots.

The 8vs8 smoke test confirmed observer snapshot size stayed under the profile budget.

## 8vs8 Smoke Evidence

Command:

```powershell
node tools\check-ai-scale-readiness.cjs
```

Result: PASS.

Runtime target: `http://127.0.0.1:4202/index.html`

Profile applied:

- `aiDensityPreset`: `ai-8v8`
- `blueInfantry`: 8
- `redInfantry`: 8
- `blueAiTanks`: 1
- `redTanks`: 1

Observed counts:

- Infantry: 16
- Squads: 6
- Tanks: 3
- Humvees: 4
- Vehicles: 7
- Drones: 0
- Total AI actors: 23

Observed performance:

| Metric | Observed | Budget | Result |
| --- | ---: | ---: | --- |
| FPS | 58.63 | >=45 | pass |
| Frame time | 20.46ms | <=26ms | pass |
| Active AI update time | 6.59ms | <=12ms | pass |
| Tactical-map structural time | 10.57ms | <=16ms | pass |
| Render time | 2.18ms | <=18ms | pass |
| Observer snapshot size | 43,280 bytes | <=220,000 bytes | pass |

LOD sample:

- `detailed`: 9
- `normal`: 4
- `reduced`: 10
- `idle`: 0

## Additional Checks

Command:

```powershell
npm.cmd run check
```

Result: PASS.

Warnings were limited to existing hotspot-size warnings in large files such as `main.js`, `infantry-ai.js`, `renderer.js`, and other known modules.

## Changed Files

- `index.html`
- `src/main.js`
- `src/systems/ai-observatory.js`
- `src/systems/observer-bridge.js`
- `src/systems/ai-scale-readiness.js`
- `tools/check-ai-scale-readiness.cjs`

## Open Notes

- LOD is currently classified and observable; actual update-rate throttling is a future scale step.
- Only the 8vs8 baseline was smoke-tested in this first pass. 15vs15 and 25vs25 should be added as staged verification before any 50vs50 event test.
- 50vs50 remains event-only and should not become the default mode from this pass.

## Final Decision

PASS: AI count expansion preparation / performance criteria first pass is ready to move to an AI scale readiness interim verification report or staged 15vs15 / 25vs25 checks.
