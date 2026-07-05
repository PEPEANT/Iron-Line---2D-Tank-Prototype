# AI V2 First-Pass Interim Verification Report - 2026-05-22

Decision: ON TRACK.

This is not the AI V2 completion report. It verifies that the approved AI V2 scope has a first implementation slice in place and that the slice still respects the Commander -> SquadLeader -> Unit command structure.

## 1. Test Environment

| Item | Result |
| --- | --- |
| Runtime URL | `http://127.0.0.1:4205/index.html` |
| Test mode | Local live match smoke |
| AI scale | `ai-15v15`; scale regression also checked `ai-25v25` |
| Role / side | Blue squads and vehicles, with player command-priority checks on infantry command lock |
| Logs / debug / observer | `AIObservatory`, `ObserverBridge`, infantry debug state, `BattlefieldEvents`, and `tools/check-ai-v2-behavior-connection.cjs` result JSON |
| Main check | `node tools/check-ai-v2-behavior-connection.cjs` |
| Syntax check | `node tools/check-syntax.cjs` |
| Whitespace check | `git diff --check` passed with CRLF warnings only |
| Scale regression | `IRONLINE_SCALE_PROFILES=ai-25v25 IRONLINE_SCALE_PERF_COMPACT=1 node tools/check-ai-scale-performance.cjs` |

## 2. SquadLeader Radio / State Reports

| Report candidate | Observed in this pass | Evidence / note |
| --- | --- | --- |
| Cover shortage | Supported, not directly triggered | `noCover` is generated when high-risk movement has no usable cover node. The smoke found a valid cover node, so this did not trigger. |
| Armor support request | Supported, not directly triggered | `noArmorSupport` is generated when armor threat is close and the squad lacks RPG / nearby friendly armor. |
| Recon information missing | Supported, not directly triggered in final smoke | `noReconMark` is generated when high-risk objective pressure lacks an active scan ping. It appeared in the first forced sample before `noLineOfSight` narrowing, then final smoke focused on `heavyLosses` / `highSuppression`. |
| Path blocked | Supported, not directly triggered | `pathBlocked` is generated from high squad cohesion / stuck pressure. |
| Squad losses high | Triggered | Forced pressure sample produced `heavyLosses`. |
| Assault ready | Triggered | Staging sample produced pending / blocking `v2AssaultApproval`. |
| Retreat needed | Triggered | Forced pressure sample produced radio kind `retreatNeeded`, reason `heavyLosses`. |

## 3. Tactical Map Behavior Connection

| Area | Result |
| --- | --- |
| Tactical Map behavior | Cover-node selection, objective staging, vehicle-behind staging, danger-zone risk influence, and traffic-hint wait-for-clear remain connected. |
| SquadLeader radio / state report | Squads now expose `v2RadioReport` and record throttled `squad_radio` observatory events / battlefield events. |
| Failure reasons | Squads expose `v2FailureReasons` such as `heavyLosses`, `highSuppression`, `noArmorSupport`, `pathBlocked`, `noReconMark`, and `vehicleTrafficBlocked`. |
| Assault approval | Squads can enter a pending `v2AssaultApproval` state near objective staging; player assault commands auto-approve and keep player priority. |
| Morale / fatigue | Squads expose minimal `v2Morale` with morale, fatigue, assault confidence, leader alive, player near, and tank support fields. |
| Observability | `AIObservatory`, `ObserverBridge`, and infantry debug state expose V2 radio, failure, morale, and approval state. |

| Check | Evidence | Result |
| --- | --- | --- |
| Cover node selection | `B-ENG-1` selected `cover:blue-gate-sandbags-1:36:2`; node was accessible, exposure risk `0.56`, cover quality `64`. | PASS |
| Objective staging | Squad pre-assault point used `stage:blue:A:0`. | PASS |
| Vehicle staging | Rally-with-tank used `stage:vehicle:RAVEN:behind`. | PASS |
| Danger-zone influence | Risk at `danger:objective:A` was `0.72`; unlocked mode changed to `support-fire`. | PASS |
| Player command priority | Player command lock preserved `commandState: assault`, `commandSource: player`, and prevented tactical risk from overriding to `support-fire`. | PASS |
| Vehicle traffic hint | Vehicle wait-for-clear used `traffic:blue_gate_out:blue_west`. | PASS |
| Danger-zone push decision | Risk `0.72` changed an unlocked advance decision to `support-fire`. | PASS |

## 4. Assault Approval Request

| Check | Evidence | Result |
| --- | --- | --- |
| Reached objective staging context | Staging sample used objective A outer staging point `stage:blue:A:0`. | PASS |
| Assault approval requested | `v2AssaultApproval.status` became `pending`; `blocking` was `true`. | PASS |
| Player approval / assault transition | Programmatic approval via `approveV2Assault("qa")` moved status to `approved`; player `assault` command also auto-approves through the command path. | PASS |
| No approval behavior | Pending approval blocks immediate free advance by holding in `pre-assault` style behavior until timeout / approval. | PASS |

Note: this pass implements the approval state and approval function, not a final player-facing approval UI.

## 5. Failure Reason Logs

| Reason | Observed | Evidence / note |
| --- | --- | --- |
| `noCover` | Not in final smoke | Valid cover existed in the tested cover-node scenario. |
| `noLineOfSight` | Observed in live observatory samples | Now narrowed so it only reports against actual combat threats, not merely because an objective is behind scenery. |
| `noArmorSupport` | Not in final smoke | Supported by the generator; requires close armor threat plus no RPG / friendly armor answer. |
| `highSuppression` | Observed | Forced pressure sample produced `highSuppression`. |
| `pathBlocked` | Not in final smoke | Supported by stuck / cohesion checks; no stuck spike appeared in the smoke. |
| `heavyLosses` | Observed | Forced pressure sample produced `heavyLosses`. |
| `noReconMark` | Supported, not final-triggered | Supported for risky objective pressure without scan ping. |
| `vehicleTrafficBlocked` | Observed in live observatory samples | Vehicle traffic hint held at `traffic:blue_gate_out:blue_west`; observatory exposed vehicle-traffic report cases. |

## 6. Morale / Fatigue Minimum Values

| Factor | Reflected | Evidence |
| --- | --- | --- |
| Loss ratio | Yes | Forced pressure sample with casualty ratio produced morale `0.44`, fatigue `0.46`, assault confidence `0.38`. |
| Suppression | Yes | `highSuppression` appeared and lowered assault confidence. |
| Squad leader alive | Yes | `v2Morale.leaderAlive` exposed as `true` in smoke. |
| Player nearby | Yes | `v2Morale.playerNear` exposed and contributed to morale in the smoke. |
| Tank support | Yes | `v2Morale.tankSupport` exposed; live observatory samples showed high confidence when tank support was present. |

## 7. Regression Checks

| Check | Evidence | Result |
| --- | --- | --- |
| V2 failure reasons | Forced pressure sample produced `heavyLosses` and `highSuppression`. | PASS |
| V2 radio report | Forced pressure sample produced radio kind `retreatNeeded`, reason `heavyLosses`. | PASS |
| Assault approval request | Staging sample produced pending / blocking approval, then `approveV2Assault("qa")` moved it to `approved`. | PASS |
| Performance | Smoke held about `59.7 FPS`, `9.99 ms` frame, `6.56 ms` AI, `0.014 ms` tactical-map time. | PASS |
| 25vs25 scale regression | `58.5 FPS`, `11.63 ms` frame, `7.72 ms` AI, `0.0069 ms` tactical-map time, observer snapshot about `133.7 KB`. | PASS |
| Human command priority | Player `commandState: assault` and `commandSource: player` lock prevented Tactical Map / V2 risk from overriding the command. | PASS |
| BotCommander skeleton | `node tools/check-bot-commander-skeleton.cjs` passed after the V2 first slice. | PASS |
| Online command flow | `npm run check:online` and `node tools/check-online-combat-client-flow.cjs` passed. | PASS |
| FPS combat loop / command integration | `node tools/check-fps-command-integration.cjs` passed. | PASS |

## Regression Notes

- The first-pass V2 implementation does not rewrite Unit AI.
- Player-issued command locks still win over Tactical Map / V2 decisions.
- BotCommander skeleton is unchanged and still uses the existing command bus format.
- Online command flow is not changed by this pass.
- 50vs50 is still event-only / stress-only and is not a default mode.

## Current Risks

| Risk | Status |
| --- | --- |
| Radio noise | Reduced by throttling reports and narrowing `noLineOfSight` to actual combat threats, but live play should still watch for excessive repeated squad reports. |
| Assault approval blocking | Pending approvals time out and player assault commands auto-approve, but live QA should verify squads do not stall at staging points. |
| Failure reason quality | Reasons are observable and useful for QA, but they are still first-pass heuristics, not a full doctrine model. |
| Morale / fatigue effect | Exposed and lightly used; deeper behavior impact should wait for the next V2 pass. |

## 8. Current Decision

Current decision: ON TRACK.

AI V2 1차 구현 is suitable to continue into the report-based narrow correction / validation pass. There are no blockers from this interim report.

Items to watch in the next pass:

- Radio noise in live chaotic fights.
- Staging-point pending approval turning into excessive hold behavior.
- More direct scenario coverage for `noCover`, `noArmorSupport`, `pathBlocked`, and `noReconMark`.
- Whether morale / fatigue should remain mostly observational or start affecting more tactical choices.

## Next Step

Next target: AI V2 first-pass interim report-based narrow correction / validation pass.

Only fix direct issues found in this report. Do not start full AI rewrite, learning AI, UGC, city/open-world expansion, 50vs50 default mode, server-authority combat rewrite, or BotCommander doctrine expansion from this checkpoint.
