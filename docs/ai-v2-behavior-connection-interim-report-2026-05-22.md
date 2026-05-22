# AI V2 Behavior Connection Interim Verification Report - 2026-05-22

Decision: ON TRACK. Tactical Map / Cover Nodes / Staging Points / Vehicle Hints are now connected to selected AI behavior paths without starting a full AI rewrite.

This is an interim verification report, not the completion report. The next step is a narrow report-based correction / validation pass if any issue appears in live play.

## 1. Scope

Implemented:

- Infantry cover selection now tags Tactical Map cover-node selections with `tacticalMapId`, `tacticalMapKind`, and risk metadata.
- Squad AI now records tactical risk from Tactical Map danger zones.
- Squad fallback / hold-wall cover can prefer Tactical Map cover nodes before falling back to older obstacle sampling.
- Squad pre-assault continues to use objective staging points; smoke now verifies that behavior connection.
- Squad `rally-with-tank` can use dynamic vehicle-behind staging points.
- Vehicle AI can use Tactical Map traffic hints for `waitForClear` when another friendly vehicle occupies a bottleneck / spacing zone.
- Observatory snapshots expose squad, infantry, and vehicle Tactical Map reference fields.

Not implemented:

- Full AI rewrite.
- Learning AI.
- 50vs50 default mode.
- UGC / city / open-world work.
- Server-authority combat rewrite.
- BotCommander doctrine / personality expansion.

## 2. Tactical Map Behavior References

| AI state / behavior | Tactical Map reference | Result |
| --- | --- | --- |
| Infantry cover | `bestCoverNodeFor` | PASS |
| Squad fallback / hold-wall | `bestCoverNodeFor` through squad-level cover helper | PASS |
| Squad pre-assault | `stagingPointForObjective` | PASS |
| Squad regroup / rally | Existing `rallyPointFor` remains available | PASS |
| Squad rally-with-tank | `vehicleStagingPoints` | PASS |
| Vehicle wait-for-clear | `vehicleHintNear` traffic hints | PASS |
| Risk-aware mode selection | `pointRisk` + `dangerZones` | PASS |
| Command lock priority | Player command lock remains stronger than tactical-risk adjustment | PASS |

## 3. Cover Node Selection

Smoke evidence:

| Field | Value |
| --- | --- |
| Unit | `B-ENG-1` |
| Selected cover node | `cover:blue-gate-sandbags-1:36:2` |
| Exposure risk | `0.56` |
| Cover quality | `64` |
| Accessible | `true` |
| Debug tactical cover id | `cover:blue-gate-sandbags-1:36:2` |

Result: PASS. A real infantry AI path selected a Tactical Map cover node and exposed it through debug state.

## 4. Staging / Rally Connection

Pre-assault staging:

| Field | Value |
| --- | --- |
| Objective | `A` |
| Expected stage | `stage:blue:A:0` |
| Squad order objective | `A` |
| Returned tactical map id | `stage:blue:A:0` |
| Behavior name | `A-pre-assault` |

Vehicle-behind rally:

| Field | Value |
| --- | --- |
| Vehicle | `RAVEN` |
| Stage id | `stage:vehicle:RAVEN:behind` |
| Stage kind | `vehicle-stage` |

Result: PASS. Squads can pause at objective staging points and can use vehicle-behind staging during tank-rally behavior.

## 5. Vehicle Hints / Traffic

Smoke evidence:

| Field | Value |
| --- | --- |
| Hint id | `traffic:blue_gate_out:blue_west` |
| Hint kind | `bottleneck` |
| Held | `true` |
| Hold target | `traffic:blue_gate_out:blue_west` |
| Debug wait-for-clear | `traffic:blue_gate_out:blue_west` |

Result: PASS. Vehicle AI can stop on Tactical Map traffic hints when a friendly vehicle already occupies the bottleneck / spacing zone.

## 6. Danger Zone / Risk Behavior

Smoke evidence:

| Field | Value |
| --- | --- |
| Danger zone | `danger:objective:A` |
| Tactical risk | `0.72` |
| Bot / unlocked tactical mode | `support-fire` |
| Player-locked tactical mode | `advance` |

Result: PASS. Tactical risk can slow an unlocked advance into support-fire, while an active player command lock prevents the Tactical Map layer from overriding player intent.

## 7. Command Lock / Structure Regression

| Check | Result |
| --- | --- |
| `CommanderSlot -> SquadLeader -> Unit` preserved | PASS |
| Player command lock preserved | PASS |
| `commandState` remains `assault` under lock | PASS |
| `commandSource` remains `player` under lock | PASS |
| BotCommander command format not expanded | PASS |

## 8. Performance

Smoke profile: `ai-15v15`.

| Metric | Value |
| --- | ---: |
| FPS | `60.0` |
| Frame time | `9.4ms` |
| AI update time | `5.8ms` |
| Tactical Map time | `0.022ms` |
| Pathfinding / movement time | `5.8ms` |

Result: PASS for the interim smoke budget. No Tactical Map performance spike was observed in this focused behavior connection check.

## 9. Verification

Automated:

| Test | Result | Notes |
| --- | --- | --- |
| `node tools/check-ai-v2-behavior-connection.cjs` | PASS | Cover node, staging point, vehicle staging, traffic hint, danger-risk behavior, and command lock preservation. |

Follow-up regression tests still required before completion:

- `npm run check`
- `npm run check:online`
- `node tools/check-tactical-map.cjs`
- `node tools/check-ai-scale-performance.cjs` at least through 25vs25
- FPS / online combat smoke if the correction pass changes shared behavior

## 10. Current Risks

- This verifies targeted behavior connection, not full battlefield intelligence.
- Staging and vehicle-hint behavior should be watched in manual play for awkward pauses.
- Risk-aware support-fire should not become a permanent hesitation loop; live play should confirm it yields back to advance after pressure drops.
- 50vs50 remains event-only and is not part of this behavior-completion decision.

## 11. Verdict

ON TRACK.

Move next to:

**AI V2 behavior connection interim report-based narrow correction / validation pass**

If no blocker is found, that pass can be validation-only before the completion report.
