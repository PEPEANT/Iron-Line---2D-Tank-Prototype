# AI V2 Design Review / Scope Lock Report - 2026-05-22

Decision: APPROVED. AI V2 is not just "better cover AI." AI V2 is the system that lets squad leaders read the tactical map, explain their intent, request player approval for major actions, and leave failure reasons that can later become battle reports and doctrine tuning.

The current Tactical Map behavior connection pass remains useful as a first implementation slice, but it must not be mistaken for the whole AI V2 vision.

## 1. One-Line Goal

AI V2 should make the battlefield feel commanded:

**Tactical Map + SquadLeader Decision + Radio Feedback + Player Approval**

The goal is not perfect intelligence. The goal is that players can understand why AI stopped, why it advanced, why it failed, and when they can intervene.

## 2. Required Command Hierarchy

The hierarchy is locked:

```text
Human or Bot Commander
  -> SquadLeader / AssetLeader
    -> Unit execution
```

Rules:

- Commanders give large intent only.
- Squad leaders choose tactical positions and local action states.
- Units execute: follow, shoot, reload, nearby cover, survival, return-to-squad.
- Units may use nearby cover for survival, but they must not become independent tactical commanders.
- Player commands always outrank Tactical Map suggestions.
- `commandState`, `commandSource`, `commandReason`, and `commandLockUntil` are protected stage contracts.

## 3. AI V2 Pillars

### Tactical Map Based Behavior

First-class data:

- Cover Nodes
- Staging Points
- Rally Points
- Vehicle Hints
- Danger Zones
- Fire Lanes

Expected behavior:

- Squads use staging points before assaults.
- Squads use cover nodes when suppressed, holding, or falling back.
- Vehicles use traffic hints and wait-for-clear instead of pushing through every bottleneck.
- Danger zones influence support-fire, regroup, and fallback decisions.

### Squad Leader Radio / State Reports

AI must explain important stops and failures.

Examples:

- "No cover, holding."
- "Need armor support."
- "Recon missing."
- "Route blocked."
- "Squad losses heavy."
- "Assault ready."
- "Regrouping before push."

These are not decorative lines. They should map to real AI states and failure reasons.

### Assault Approval

When a squad reaches a staging point and is ready to enter a contested objective, it can request approval:

```text
Squad reached B outskirts.
Assault approval requested.
```

If the player approves:

- squad transitions to assault
- command log records the approval
- command lock prevents immediate indecision

If the player does not approve:

- squad holds, covers, scouts, or regroups
- the state remains explainable

### Failure Reasons

Failures should be recorded as short codes:

- `noCover`
- `noLineOfSight`
- `noArmorSupport`
- `highSuppression`
- `pathBlocked`
- `heavyLosses`
- `noReconMark`
- `vehicleTrafficBlocked`
- `assaultNotApproved`

This is the seed for future battle reports, map heatmaps, and doctrine tuning.

### Morale / Fatigue

V2 needs a small morale layer before adding complex personality.

Inputs:

- nearby allies killed
- squad leader alive / dead
- player nearby
- armor support nearby
- suppression
- casualty ratio
- recent failed assault

Effects:

- assault willingness
- regroup preference
- fallback threshold
- radio urgency

This should start as small numeric state, not a full simulation.

### AI Suggestions

AI suggestions are a future-facing part of V2, but not a full first-pass implementation target.

Examples:

- "Send recon drone before B assault."
- "Armor support needed for center."
- "Left flank staging is open."
- "RPG ambush effective here."

The player can accept or ignore suggestions later.

## 4. Adopted Core Direction

Adopted:

- Tactical Map based behavior.
- SquadLeader-centered tactical judgment.
- Unit as executor, not independent tactical commander.
- Human command priority.
- Radio / state reporting as part of AI behavior, not decoration.
- Assault approval request for major contested pushes.
- Failure reason logging as the seed for later battle reports.

This direction is approved because it solves the original AI problem more directly than adding more unit-level conditions. The old failure mode was "many units making local decisions too often." AI V2 should make the squad leader the readable decision point.

## 5. First Implementation Scope

The first implementation scope should stay small:

1. Tactical Map behavior connection
   - cover node selection
   - objective staging / rally
   - vehicle wait-for-clear / vehicle hints
   - danger-zone influence

2. Squad leader radio state report skeleton
   - expose state reasons
   - map reasons to command / observatory / debug
   - avoid text spam

3. Assault approval request skeleton
   - staging reached
   - request logged
   - approval / timeout state
   - no full UI redesign

4. Failure reason logging
   - attach reason codes to squad / vehicle / infantry debug
   - make them visible in observatory

5. Morale / fatigue minimal state
   - casualty / suppression / armor support / player proximity
   - use only to bias existing decisions

Out of first implementation scope:

- full doctrine system
- personality-rich BotCommander
- learning AI
- UGC tools
- medics / casualty rescue loop
- 50vs50 default mode
- server-authority combat rewrite

## 6. Minimal / Deferred Items

Minimal only:

- Morale / fatigue starts as a small numeric bias, not a full simulation.
- AI suggestions are design-only for this pass unless a tiny read-only log stub is needed.

Deferred:

- Rich BotCommander doctrine / personality.
- Full tactical card system.
- Persistent battlefield memory / heatmap.
- Medic / casualty rescue loop.
- UGC-facing tactical tag editor.

## 7. Do Not Do

Hard exclusions:

- AI 전체 재작성.
- 개별 유닛 전술 판단 강화.
- 복잡한 학습 AI.
- UGC / 도시화.
- 50vs50 기본 모드화.
- 서버 권위 전투 개편.
- BotCommander 교리 고도화.

## 8. Risk Review

| Risk | Status | Guardrail |
| --- | --- | --- |
| AI becomes too cautious and stops fighting | Known risk | Assault approval timeout, pressure rules, and fallback-to-advance behavior |
| Staging point becomes permanent waiting | Known risk | State reason, timer, and next-action transition |
| Cover node churn | Known risk | Existing command locks and cover reservation / reuse timers |
| Tactical Map outranks humans | Not allowed | Player `commandSource` and `commandLockUntil` win |
| Vehicle wait-for-clear freezes traffic | Known risk | Bypass timer, stuck logging, traffic-hold age |
| Performance regression | Monitored | 25vs25 scale and behavior smoke budgets |
| Radio spam | Known risk | Reason cooldown and priority filtering required before player-facing expansion |

## 9. Recommended Implementation Order

1. State / reason visibility.
2. Tactical Map behavior connection:
   - cover node
   - staging / rally
   - vehicle hint
   - danger zone
3. Assault approval request skeleton.
4. Failure reason logging.
5. Minimal morale / fatigue numbers.
6. AI suggestions remain design-only unless explicitly unlocked.

This order keeps V2 explainable before making it more ambitious.

## 10. Current First Slice Status

Already started in the current working tree:

- Infantry cover selection can tag Tactical Map cover nodes.
- Squad fallback / hold-wall can prefer Tactical Map cover nodes.
- Pre-assault staging is verified through objective staging points.
- Rally-with-tank can use vehicle-behind staging points.
- Vehicles can wait on Tactical Map traffic hints.
- Danger-zone risk can bias unlocked advance toward support-fire.
- Player command lock prevents Tactical Map judgment from overriding human intent.

This slice is an implementation proof, not the final V2 identity.

## 11. Key Risks

| Risk | Why it matters | Guardrail |
| --- | --- | --- |
| AI becomes too cautious | Battles stall at staging or cover | Assault approval timeout and pressure rules |
| Units become mini-commanders | Old AI chaos returns | Squad leader owns tactical node choice |
| Tactical Map overrides players | Human role loses meaning | Player command lock always wins |
| Staging becomes permanent waiting | Looks bugged | State reason + timeout + next action |
| Vehicle wait-for-clear freezes traffic | Convoys jam | Bypass timer and stuck logging |
| Radio spam | UI becomes unreadable | Priority and cooldown per reason |
| Morale overcomplicates combat | Hard to debug | Start with few numeric inputs |

## 12. Verification Scenarios

Required before AI V2 completion:

- Infantry under fire selects a nearby cover node and exposes its tactical node id.
- Squad reaches objective staging, regroups, then requests or enters assault.
- Vehicle reaches a bottleneck and waits instead of pushing through allies.
- Tactical risk changes an unlocked advance decision but does not override player command lock.
- Squad reports a clear state / reason when it pauses.
- Failure reason is visible in debug / observatory.
- Performance remains inside 25vs25 budget.

## 13. Final Verdict

APPROVED.

AI V2 1차 구현을 시작할 수 있다, but only inside the locked scope above.

If implementation uncovers a blocker, return to this report and mark the specific pillar as `NEEDS REVISION` instead of broadening the work.

## 14. Recommended Next Step

Proceed with:

**AI V2 behavior connection interim report-based narrow correction / validation pass**

That pass should align the current first slice with this design lock. If no blocker appears, the completion report can close the tactical behavior-connection stage and leave radio / approval / morale as the next explicit V2 sub-stages.
