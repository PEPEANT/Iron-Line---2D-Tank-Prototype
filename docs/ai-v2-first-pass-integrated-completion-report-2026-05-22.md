# AI V2 First-Pass Integrated Correction and Completion Report - 2026-05-22

Final decision: PASS.

AI V2 1차 is complete for the approved scope: Tactical Map based SquadLeader decisions, radio / state reports, assault approval state, failure reasons, and minimal morale / fatigue. This does not mean full AI V2 doctrine, learning AI, or BotCommander doctrine is complete.

## 1. Interim-Report-Based Correction Result

| Item | Result |
| --- | --- |
| Main correction | Expanded `tools/check-ai-v2-behavior-connection.cjs` so the previously under-covered reasons `noCover`, `noArmorSupport`, `pathBlocked`, and `noReconMark` are directly sampled. |
| Code behavior correction | Earlier in the interim pass, `noLineOfSight` was narrowed so it reports against actual combat threats, not merely because an objective is behind scenery. |
| Modified files | `src/ai/squad-v2-first-pass.js`, `src/systems/ai-observatory.js`, `src/systems/observer-bridge.js`, `src/ai/infantry-debug-state.js`, `tools/check-ai-v2-behavior-connection.cjs`, docs / handoff / index. |
| Remaining blockers | None. |

## 2. SquadLeader Radio / State Report Result

| Report candidate | Status | Evidence |
| --- | --- | --- |
| Cover shortage | PASS | Direct sampled scenario returned `noCover: true`. |
| Armor support request | PASS | Direct sampled scenario returned `noArmorSupport: true`. |
| Recon information missing | PASS | Direct sampled scenario returned `noReconMark: true`; forced pressure sample also produced `noReconMark`. |
| Path blocked | PASS | Direct sampled scenario returned `pathBlocked: true`. |
| Squad losses high | PASS | Forced pressure sample produced `heavyLosses`. |
| Assault ready | PASS | Staging sample produced pending / blocking assault approval. |
| Retreat needed | PASS | Forced pressure sample produced radio kind `retreatNeeded`, reason `heavyLosses`. |

## 3. Tactical Map Behavior Connection Result

| Behavior | Evidence | Result |
| --- | --- | --- |
| Cover node selection | `B-ENG-1` selected `cover:blue-gate-sandbags-1:36:2`; accessible, exposure risk `0.56`, cover quality `64`. | PASS |
| Staging / rally | Objective A pre-assault point used `stage:blue:A:0`. | PASS |
| Vehicle hint / staging | Rally-with-tank used `stage:vehicle:RAVEN:behind`; traffic wait-for-clear used `traffic:blue_gate_out:blue_west`. | PASS |
| Danger-zone decision | Tactical risk `0.72` changed unlocked advance into `support-fire`. | PASS |
| Command priority | Player `assault` command lock prevented tactical risk from overriding to `support-fire`. | PASS |

## 4. Assault Approval Result

| Check | Evidence | Result |
| --- | --- | --- |
| Staging arrival context | Objective staging sample used `stage:blue:A:0`. | PASS |
| Approval requested | `v2AssaultApproval.status` became `pending`; `blocking` was `true`. | PASS |
| Player approval path | `approveV2Assault("qa")` moved approval to `approved`; player `assault` command auto-approves through the command path. | PASS |
| No approval behavior | Pending approval keeps the squad in pre-assault style behavior instead of freely pushing. | PASS |
| UI / radio noise | State is observable via debug / observatory; final player-facing approval UI is intentionally not part of this pass. | PASS |

## 5. Failure Reason Log Result

| Reason | Result |
| --- | --- |
| `noCover` | PASS |
| `noLineOfSight` | PASS; observed in live observatory samples and narrowed to combat threats. |
| `noArmorSupport` | PASS |
| `highSuppression` | PASS |
| `pathBlocked` | PASS |
| `heavyLosses` | PASS |
| `noReconMark` | PASS |
| `vehicleTrafficBlocked` | PASS; observed through traffic hint / wait-for-clear and live observatory samples. |

## 6. Morale / Fatigue Minimum Values

| Factor | Reflected | Evidence |
| --- | --- | --- |
| Loss ratio | Yes | Forced pressure sample produced morale `0.44`, fatigue `0.46`, assault confidence `0.38`. |
| Suppression | Yes | `highSuppression` lowers assault confidence and appears as a failure reason. |
| Squad leader alive | Yes | `v2Morale.leaderAlive` exposed in smoke. |
| Player nearby | Yes | `v2Morale.playerNear` exposed and contributes to morale. |
| Tank support | Yes | `v2Morale.tankSupport` exposed and improves assault confidence in live samples. |

## 7. Regression Verification

| Check | Command / evidence | Result |
| --- | --- | --- |
| AI V2 behavior smoke | `node tools/check-ai-v2-behavior-connection.cjs` | PASS |
| Code health | `npm run check` | PASS |
| Online command smoke | `npm run check:online` | PASS |
| BotCommander skeleton | `node tools/check-bot-commander-skeleton.cjs` | PASS |
| FPS + command integration | `node tools/check-fps-command-integration.cjs` | PASS |
| Online combat client flow | `node tools/check-online-combat-client-flow.cjs` | PASS |
| Tactical map data layer | `node tools/check-tactical-map.cjs` | PASS |
| 25vs25 scale smoke | `IRONLINE_SCALE_PROFILES=ai-25v25 IRONLINE_SCALE_PERF_COMPACT=1 node tools/check-ai-scale-performance.cjs` | PASS |
| Whitespace | `git diff --check` | PASS with CRLF warnings only |

## 8. Final Boundaries

This PASS means the first approved AI V2 slice is complete.

It does not include:

- Full AI rewrite.
- Individual-unit tactical planning expansion.
- Complex learning AI.
- UGC / city expansion.
- 50vs50 default mode.
- Server-authority combat rewrite.
- BotCommander doctrine / personality expansion.
- Final player-facing assault approval UI.

## 9. Next Step

Recommended next step: checkpoint commit / push before choosing the next roadmap branch.

After this checkpoint, pick between:

- BotCommander doctrine / personality first pass.
- Online combat server-authority transition review.
- AI V2 player-facing approval UI / radio interaction polish.

Do not start any of those until this PASS state is backed up.
