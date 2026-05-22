# Agent Handoff

Use this file for the next agent when the current thread is not available.

## Common Stage Gate

Before moving to the next stage, verify:

- The core feature works in live/manual play.
- State/logs explain why the behavior happens.
- Directly related bugs were fixed or recorded as blockers.
- The work did not drift into unrelated new features.
- Manual test notes or smoke test results were recorded.

If any item is broken, do not move to the next stage.

Important: a stage is not complete just because code was written. A stage is complete only after implementation, directly related bug verification, and minimum test notes are done.

## In-Progress Self Check

During a task, if behavior is unclear or implementation is ambiguous, stop and verify before continuing.

Check:

- Is this change directly related to the current stage goal?
- Is it preserving existing behavior?
- Can the behavior be confirmed through logs, state, debug output, or observatory data?
- Can it be checked through live play or a minimal smoke test?
- If uncertainty remains, record it as a blocker or open question instead of silently moving on.

## Current Focus

Current handoff date: 2026-05-22 KST.

The offline command stability gate is PASS.

The online command synchronization first pass is now PASS.

The online commander-order stability gate is now PASS.

The human FPS combat loop first pass is now PASS.

The FPS combat loop report-based fix + small balance pass is now PASS.

The FPS fix + small balance interim verification report is ON TRACK.

The FPS fix + balance report-based correction pass is ON TRACK.

The FPS AI rear awareness correction pass is PASS.

The FPS combat loop completion report is PASS.

The FPS + command integration QA is PASS.

The empty-slot BotCommander skeleton first pass is PASS.

The anti-vehicle balance small pass interim verification is ON TRACK.

The anti-vehicle balance report-based correction pass is ON TRACK.

The anti-vehicle balance completion report is PASS.

The BotCommander skeleton interim verification report is ON TRACK.

The BotCommander skeleton report-based narrow correction pass is ON TRACK.

The BotCommander skeleton completion report is PASS.

The AI V2 entry checkpoint commit / push is complete.

The AI V2 tactical map / cover-node first pass is PASS.

The AI V2 tactical map / cover-node interim verification report is ON TRACK.

The AI V2 tactical map / cover-node interim report-based narrow correction pass is PASS.

The AI V2 tactical map / cover-node completion report is PASS.

The AI count expansion preparation / performance criteria first pass is PASS.

The AI scale performance interim report is ON TRACK.

The AI scale performance interim report-based narrow validation / fix pass is PASS.

The AI scale performance completion report is PASS.

The 50vs50 event candidate integrated verification plan is READY.

The 50vs50 event candidate integrated verification report is PASS EVENT-ONLY.

The roadmap cleanup / next-season priority report is COMPLETE.

Important roadmap conclusion: online command sync and local FPS combat are PASS, but the project is not online-combat complete yet. Human position, aim, shot, hit, death, respawn, round state, win state, packet delay/duplicates, host departure, and repeated 2+ client playtests still need a dedicated online combat stabilization first pass.

The online combat stabilization first implementation pass is ON TRACK.

The online combat stabilization mid verification report is ON TRACK.

The online combat stabilization mid-report-based narrow fix / live validation pass is PASS.

The online combat stabilization completion report is PASS.

The UI / readability / battlefield information cleanup first pass is ON TRACK.

The UI / readability integrated QA and completion report is PASS.

The AI V2 design review / scope lock report is APPROVED.

The AI V2 behavior connection first pass is ON TRACK.

The AI V2 behavior connection interim verification report is ON TRACK.

The AI V2 first implementation slice is ON TRACK.

The AI V2 first-pass interim verification report is ON TRACK.

The AI V2 first-pass integrated correction and completion report is PASS.

The AI V2 first-pass checkpoint commit / push is complete.

Checkpoint commit: `25e931d chore: checkpoint ai v2 first pass` pushed to `origin/main`.

The online combat server-authority transition review is APPROVED.

The online combat server-authority first-pass scope lock report is APPROVED.

The online combat server-authority first-pass implementation is ON TRACK.

The online combat server-authority first-pass interim verification report is ON TRACK.

The online combat server-authority first-pass integrated fix and completion report is PASS.

The first alpha P0 stabilization loop is now superseded by a deeper P0 root-cause review.

The next target is: **P0 team identity and server same-team damage scope lock**.

The immediate goal is not another 4-player test yet. Code review found older offline assumptions that can invalidate online team play: AI still has `game.player` blue/local assumptions, server shot confirm needs explicit same-team damage rejection, real-time combat is still too tied to room/event updates, and admin state mixes server truth with local observer snapshots. The controlled 4-player alpha retest is HOLD until the narrow P0 scope is locked and the first two items are fixed or explicitly accepted as known-risk.

Do not start UGC, city/open-world expansion, full server-authority rewrites, broad online redesign work, full BotCommander behavior, or full AI behavior rewrites from this handoff.

The command-role design being verified is:

- `infantry`: owns infantry squads.
- `engineer`: owns engineer / RPG / repair / defensive units.
- `recon`: owns scouts / drones / marking tools.
- `armor`: owns tanks / humvees / vehicles.

Keep the first pass simple. Each role should get only three clear orders:

- Infantry: advance / take cover / assault.
- Engineer: repair / anti-armor standby / build defense.
- Recon: drone recon / mark enemy / check flank route.
- Armor: breakthrough / cover infantry / rear hold.

Important design rule: roles are command authority first, not weapon classes. Do not couple lobby role selection to weapon or loadout changes yet.

Guardrail for the current worker:

- Use the existing `roleSlots`, `CommandBus`, `CommandRadio`, and squad asset structure.
- The work is to verify and stabilize the `CommanderSlot -> SquadLeader -> Unit` flow, not to build a new AI stack.
- A commander must not directly control individual units.
- Commander orders go to squad leaders / asset leaders.
- The squad leader owns `commandState` and handles local tactics.
- Units only execute: follow, shoot, reload, nearby cover, survival, and return-to-squad.
- Full `BotCommander` behavior is not a feature target right now. Keep the current work to the verified `human / bot / empty` skeleton and its stability checks.
- Do not implement 50vs50, UGC, city/open-world work, medics, advanced AI commanders, or server-authority redesign in this pass.

AI should not become "smarter" in this pass. It should become easier to command:

- When AI receives a command, hold that intent for at least 1-3 seconds before changing behavior.
- When AI is stopped, expose the state so it does not look bugged: waiting, regrouping, covering, vehicle waiting, scouting, repairing.
- This pass is about humans owning and commanding AI assets, not advanced AI learning.

## Near-Term Development Order

0. Common Stage Gate and In-Progress Self Check are fixed in this file.
1. Finish the current command-structure work.
2. Offline command stability gate. PASS on 2026-05-22.
3. Online command synchronization first pass. PASS on 2026-05-22.
4. Online commander-order stability gate. PASS on 2026-05-22.
5. Human FPS combat loop first pass. PASS on 2026-05-22.
6. FPS combat loop fix + small balance pass. PASS on 2026-05-22.
7. FPS fix + small balance interim verification report. ON TRACK on 2026-05-22.
8. FPS fix + balance report-based correction pass. ON TRACK on 2026-05-22.
9. FPS AI rear awareness correction pass. PASS on 2026-05-22.
10. FPS combat loop completion report. PASS on 2026-05-22.
11. FPS + command integration QA. PASS on 2026-05-22.
12. Empty-slot `BotCommander` skeleton first pass. PASS on 2026-05-22.
13. Anti-vehicle balance small pass interim verification. ON TRACK on 2026-05-22.
14. Anti-vehicle balance report-based correction pass. ON TRACK on 2026-05-22.
15. Anti-vehicle balance completion report. PASS on 2026-05-22.
16. Empty-slot `BotCommander` skeleton interim verification report. ON TRACK on 2026-05-22.
17. Empty-slot `BotCommander` skeleton report-based narrow correction pass. ON TRACK on 2026-05-22.
18. Empty-slot `BotCommander` skeleton completion report. PASS on 2026-05-22.
19. Backup commit / push checkpoint before AI V2. PASS on 2026-05-22.
20. AI V2 tactical map / cover nodes / vehicle traffic first pass. PASS on 2026-05-22.
21. AI V2 tactical map / cover-node interim verification. ON TRACK on 2026-05-22.
22. AI V2 tactical map / cover-node interim report-based narrow correction pass. PASS on 2026-05-22.
23. AI V2 tactical map / cover-node completion report. PASS on 2026-05-22.
24. AI count expansion preparation / performance criteria first pass. PASS on 2026-05-22.
25. AI scale performance interim report. ON TRACK on 2026-05-22.
26. AI scale performance interim report-based narrow validation / fix pass. PASS on 2026-05-22.
27. AI scale performance completion report. PASS on 2026-05-22.
28. 50vs50 event candidate integrated verification plan. READY on 2026-05-22.
29. 50vs50 event candidate integrated verification report. PASS EVENT-ONLY on 2026-05-22.
30. Roadmap cleanup / next-season priority report. COMPLETE on 2026-05-22.
31. Online combat stabilization first implementation pass. ON TRACK on 2026-05-22.
32. Online combat stabilization mid verification report. ON TRACK on 2026-05-22.
33. Online combat stabilization mid-report-based narrow fix / live validation pass. PASS on 2026-05-22.
34. Online combat stabilization completion report. PASS on 2026-05-22.
35. UI / readability / battlefield information cleanup first pass. ON TRACK on 2026-05-22.
36. UI / readability integrated QA and completion report. PASS on 2026-05-22.
37. AI V2 design review / scope lock report. APPROVED on 2026-05-22.
38. AI V2 behavior connection first pass. ON TRACK on 2026-05-22.
39. AI V2 behavior connection interim verification report. ON TRACK on 2026-05-22.
40. AI V2 first implementation slice. ON TRACK on 2026-05-22.
41. AI V2 first-pass interim verification report. ON TRACK on 2026-05-22.
42. AI V2 first-pass integrated correction and completion report. PASS on 2026-05-22.
43. AI V2 first-pass checkpoint commit / push. PASS on 2026-05-22. Commit: `25e931d`.
44. Online combat server-authority transition review. APPROVED on 2026-05-22.
45. Online combat server-authority first-pass scope lock report. APPROVED on 2026-05-22.
46. Online combat server-authority first-pass implementation. ON TRACK on 2026-05-22.
47. Online combat server-authority first-pass interim verification report. ON TRACK on 2026-05-22.
48. Online combat server-authority first-pass integrated fix and completion report. PASS on 2026-05-22.
49. 1st alpha P0 stabilization interim diagnosis report. ON TRACK on 2026-05-22.
50. 1st alpha P0 stabilization interim-report-based narrow correction pass. PASS for narrow retest on 2026-05-22.
51. 1st alpha P0 stabilization completion / retest decision report. Superseded on 2026-05-22.
52. 1st alpha P0 root-cause / narrow redesign scope. RETEST HOLD on 2026-05-22.
53. P0 team identity and server same-team damage scope lock. Current next target.

## Current Work Target

Next work item: **P0 team identity and server same-team damage scope lock**.

Alpha P0 stabilization diagnosis: `docs/alpha-p0-stabilization-interim-diagnosis-2026-05-22.md` records the ON TRACK diagnosis for player stutter / frame drops, deleted-room persistence, admin observer progress state, capture-point grenade / AI abnormal behavior, and the QA readability strip that appeared in normal play.

Alpha P0 stabilization correction pass: `docs/alpha-p0-stabilization-correction-pass-2026-05-22.md` records the PASS-for-narrow-retest correction pass. The code now uses lightweight participant updates, deleted-room tombstones, admin observer phase fallback, hidden-by-default readability debug strip, and a conservative reported-contact grenade guard.

Alpha P0 stabilization completion / retest decision: `docs/alpha-p0-stabilization-completion-retest-decision-2026-05-22.md` records the PASS decision allowing a controlled 4-player alpha retest. This is not a full alpha stability PASS; it only means no automated P0 blocker remains and the next step is a controlled live retest.

P0 root-cause / narrow redesign scope: `docs/alpha-p0-root-cause-redesign-scope-2026-05-22.md` supersedes the controlled retest decision. It records RETEST HOLD because `game.player` is still treated as the blue/local player in several AI target/safety paths, server shot confirm needs explicit same-team damage rejection, room/event updates are still carrying real-time combat pressure, and admin state still mixes server truth with local observer snapshots.

Controlled retest rules after HOLD is cleared:

- Start with `8vs8` AI.
- Optional escalation to `15vs15` only if `8vs8` is stable.
- Compare admin / observer OFF versus ON.
- Do not enable 50vs50.
- Record room id, browser / device, AI count, admin ON/OFF, visible stutter, console errors, server logs, and whether capture-point grenade / AI abnormal behavior reproduces.

Server-authority transition review: `docs/online-combat-server-authority-transition-review-2026-05-22.md` records the APPROVED decision to move only human combat outcomes toward partial server authority first. The first server-authority pass should cover shot request / hit claim / hit confirm / death confirm / respawn confirm / score state / round state. Do not move AI simulation, BotCommander, Tactical Map, or full world simulation to server authority in this pass.

Server-authority scope lock: `docs/online-combat-server-authority-first-pass-scope-lock-2026-05-22.md` records the APPROVED implementation boundary. The next pass may implement `player_state`, `player_shot`, `server_hit_confirm`, `server_death_confirm`, `server_respawn_confirm`, and `server_round_confirm` for human combat only. Keep client input / prediction / effects responsive. Keep AI, BotCommander, Tactical Map, 50vs50 world simulation, full vehicle/drone AI judgment, rank, matchmaking, UGC, and city systems out of scope.

Server-authority interim report: `docs/online-combat-server-authority-first-pass-interim-report-2026-05-22.md` records the ON TRACK implementation checkpoint. Server confirm events now cover hit, death, respawn, and round state in the static room API path. The smoke helper is `tools/check-online-combat-server-authority.cjs`. Next validation should stay narrow: live two-client behavior, prediction reconciliation, late confirm ordering, and remaining duplicate / stale packet edges.

Server-authority completion report: `docs/online-combat-server-authority-first-pass-completion-report-2026-05-22.md` records the PASS decision for the locked first-pass human-combat server confirmation scope. The code now supports server hit / death / respawn / round confirm events in the room API path. It still does not implement full server-authoritative movement, raycast / obstacle validation, projectile / vehicle / drone authority, competitive lag compensation, ranking, anti-cheat, or full AI/world server authority.

AI V2 first-pass checkpoint: `docs/ai-v2-tactical-map-first-pass-report-2026-05-22.md` records the PASS decision for the first tactical battlefield data layer. The browser smoke helper is `tools/check-tactical-map.cjs`.

AI V2 interim checkpoint: `docs/ai-v2-tactical-map-interim-verification-report-2026-05-22.md` records the ON TRACK decision for live tactical map generation, cover-node fields, staging / rally points, vehicle hints, debug / observer visibility, and narrow follow-up candidates.

AI V2 correction checkpoint: `docs/ai-v2-tactical-map-correction-pass-2026-05-22.md` records the PASS correction for dedicated vehicle-behind staging points, scenario-ready tactical-map rebuilds, vehicle-stage debug visibility, and updated smoke coverage.

AI V2 tactical-map completion checkpoint: `docs/ai-v2-tactical-map-completion-report-2026-05-22.md` records the PASS decision for map metadata, optional tactical tags, cover nodes, staging / rally points, vehicle hints, debug / observer visibility, minimal AI references, and regression checks.

AI scale readiness first-pass checkpoint: `docs/ai-scale-readiness-first-pass-report-2026-05-22.md` records the PASS decision for staged AI count profiles, active-AI versus tactical-map structural performance budgets, LOD classification, online snapshot policy, and 8vs8 smoke coverage.

AI scale performance interim checkpoint: `docs/ai-scale-performance-interim-report-2026-05-22.md` records the ON TRACK decision for 8vs8, 15vs15, and 25vs25 performance, LOD classification, command state preservation, traffic waits, snapshot size, and a caution that 25vs25 showed variance in one run.

AI scale performance validation checkpoint: `docs/ai-scale-performance-validation-pass-2026-05-22.md` records the PASS decision for the interim report-based narrow validation / fix pass. The first repeated run reproduced one 25vs25 FPS failure, so off-screen ordered actors were moved from `detailed` to `normal` runtime LOD. The follow-up 8vs8 / 15vs15 / 25vs25 repeated run passed with visible LOD throttling and no stuck regression.

AI scale performance completion checkpoint: `docs/ai-scale-performance-completion-report-2026-05-22.md` records the PASS decision for staged 8vs8 / 15vs15 / 25vs25 AI count expansion. It explicitly keeps 50vs50 as event-only pending a separate stress gate.

50vs50 event integrated verification checkpoint: `docs/50v50-event-stress-test-design-2026-05-22.md` defines the manual activation rules, event-only budgets, required metrics, human-impact checks, and `PASS EVENT-ONLY` / `HOLD` / `REDUCE` / `BLOCKED` criteria for the combined 50vs50 event candidate report.

50vs50 event integrated verification report: `docs/50v50-event-candidate-integrated-verification-report-2026-05-22.md` records the PASS EVENT-ONLY decision. The 50vs50 profile passed local repeated event budgets, but remains manually activated event / stress / spectator candidate only. It is not approved as default, ranked, normal online, or competitive mode.

Goal: clean up the roadmap / next-season priority order after this milestone. Preserve the distinction between 25vs25 as the normal staged scale ceiling and 50vs50 as event-only.

Roadmap / next-season priority checkpoint: `docs/roadmap-next-season-priority-report-2026-05-22.md` records the priority reset and explicitly distinguishes online command/FPS foundations from full online combat completion. Recommended next season order is: 1) online combat stabilization first pass, 2) UI / readability / battlefield information, 3) AI V2 behavior connection.

Online combat stabilization plan: `docs/online-combat-stabilization-first-pass-plan-2026-05-22.md` defines the first-pass scope. Start with online combat path audit and trace visibility, then fix stale player state, duplicate shot / hit / death events, respawn ordering, and round-state consistency. This is not a full server-authority rewrite.

Online combat stabilization interim report: `docs/online-combat-stabilization-interim-report-2026-05-22.md` records the ON TRACK first implementation pass. Player presence now carries state / health / weapon metadata, combat events carry identity and dedupe metadata, stale hits after respawn are ignored, death / respawn events are published, and observer snapshots expose recent online combat trace. The next narrow step is live two-client hit / death / respawn validation and report-based fixes.

Online combat stabilization mid verification report: `docs/online-combat-stabilization-mid-verification-report-2026-05-22.md` records the ON TRACK checkpoint for two-player room state, aim / weapon / health metadata, stale state rejection, and hit / death / respawn duplicate protection. It also records that true two-browser shot / kill / respawn visual agreement remains the next live validation item.

Online combat stabilization correction pass: `docs/online-combat-stabilization-correction-pass-2026-05-22.md` records the PASS report-based fix / validation pass for delayed valid hits, respawn-sequence stale-hit guards, duplicate metadata merge, clean `killerId` semantics, death health metadata, and browser client-flow hit / death / respawn verification.

Online combat stabilization completion report: `docs/online-combat-stabilization-completion-report-2026-05-22.md` records the PASS decision for the first-pass online human combat stabilization track. It closes position / aim / shot / hit / death / respawn ordering and duplicate / stale protection, while explicitly leaving full server authority and competitive round / victory sync as later work.

UI readability first-pass checkpoint: `docs/ui-readability-first-pass-report-2026-05-22.md` records the ON TRACK decision for the compact live combat + command strip, command log height limiting, remote dead-state scoreboard / minimap filtering, small-screen marker density, and `tools/check-ui-readability.cjs` smoke coverage.

UI readability integrated QA checkpoint: `docs/ui-readability-integrated-qa-completion-report-2026-05-22.md` records the PASS decision for combat HUD, command HUD, log priority, minimap marker density, 25vs25 readability smoke, small-screen rules, and 50vs50 event-only constraints.

AI V2 design review / scope lock checkpoint: `docs/ai-v2-design-lock-first-scope-2026-05-22.md` defines AI V2 as Tactical Map + SquadLeader decision + radio feedback + player approval. The current tactical behavior connection work is only the first slice; do not mistake it for the full V2 identity.

AI V2 behavior connection interim checkpoint: `docs/ai-v2-behavior-connection-interim-report-2026-05-22.md` records the ON TRACK decision for Tactical Map cover-node selection, objective staging, vehicle-behind staging, traffic-hint wait-for-clear, danger-zone risk influence, command-lock preservation, and smoke performance.

AI V2 first-pass interim checkpoint: `docs/ai-v2-first-pass-interim-verification-report-2026-05-22.md` records the ON TRACK decision for the first approved V2 implementation slice: SquadLeader radio / state reports, failure reasons, assault approval request, minimal morale / fatigue, observability, and command-priority regression checks.

AI V2 first-pass completion checkpoint: `docs/ai-v2-first-pass-integrated-completion-report-2026-05-22.md` records the PASS decision for direct reason coverage, Tactical Map behavior evidence, assault approval state, morale / fatigue, and regression checks.

Goal: create a checkpoint commit / push before choosing the next roadmap branch. Do not start full server-authority combat, UGC, city work, 50vs50 default mode, BotCommander doctrine expansion, or broad AI behavior expansion before this backup.

Apply the Common Stage Gate and In-Progress Self Check before advancing.

Required AI count expansion preparation checks:

- Start with small increments, not 50vs50.
- Preserve human role / command priority.
- Keep `TacticalMap.summary()`, debug overlay, `AIObservatory`, and `ObserverBridge` visible while scaling.
- Track FPS, frame time, active AI update time, tactical-map structural time, render cost, snapshot size, stuck/wait states, command locks, and traffic/vehicle staging behavior.
- Existing command, FPS, BotCommander skeleton, and anti-vehicle balance smoke tests must keep passing.

## Current Sequence After Online Sync

The offline gate, online command synchronization first pass, online commander-order stability gate, human FPS combat loop first pass, FPS combat loop fix + small balance pass, FPS AI rear awareness correction pass, FPS combat loop completion report, and FPS + command integration QA have all passed. The FPS fix + small balance interim verification report and report-based correction pass are ON TRACK.

The next stage is **AI V2 behavior connection interim report-based narrow correction / validation pass**. Do not make 50vs50 a default mode; keep it behind event-only stress criteria.

Current sequence:

1. Current command-structure work completion. PASS.
2. Offline command stability gate. PASS.
3. Online command synchronization. PASS.
4. Online commander-order stability gate. PASS.
5. Human FPS combat loop first pass. PASS.
6. FPS combat loop fix + small balance pass. PASS.
7. FPS fix + small balance interim verification report. ON TRACK.
8. FPS fix + balance report-based correction pass. ON TRACK.
9. FPS AI rear awareness correction pass. PASS.
10. FPS combat loop completion report. PASS.
11. FPS + command integration QA. PASS.
12. Empty-slot `BotCommander` skeleton first pass. PASS.
13. Anti-vehicle balance small pass interim verification. ON TRACK.
14. Anti-vehicle balance report-based correction pass. ON TRACK.
15. Anti-vehicle balance completion report. PASS.
16. Empty-slot `BotCommander` skeleton interim verification report. ON TRACK.
17. Empty-slot `BotCommander` skeleton report-based narrow correction pass. ON TRACK.
18. Empty-slot `BotCommander` skeleton completion report. PASS.
19. Backup commit / push checkpoint before AI V2. PASS.
20. AI V2 tactical map / cover nodes / vehicle traffic first pass. PASS.
21. AI V2 tactical map / cover-node interim verification. ON TRACK.
22. AI V2 tactical map / cover-node interim report-based narrow correction pass. PASS.
23. AI V2 tactical map / cover-node completion report. PASS.
24. AI count expansion preparation / performance criteria first pass. PASS.
25. AI scale performance interim report. ON TRACK.
26. AI scale performance interim report-based narrow validation / fix pass. PASS.
27. AI scale performance completion report. PASS.
28. 50vs50 event candidate integrated verification plan. READY.
29. 50vs50 event candidate integrated verification report. PASS EVENT-ONLY.
30. Roadmap cleanup / next-season priority report. COMPLETE.
31. Online combat stabilization first implementation pass. ON TRACK.
32. Online combat stabilization mid verification report. ON TRACK.
33. Online combat stabilization mid-report-based narrow fix / live validation pass. PASS.
34. Online combat stabilization completion report. PASS.
35. UI / readability / battlefield information cleanup first pass. ON TRACK.
36. UI / readability integrated QA and completion report. PASS.
37. AI V2 design review / scope lock report. APPROVED.
38. AI V2 behavior connection first pass. ON TRACK.
39. AI V2 behavior connection interim verification report. ON TRACK.
40. AI V2 first implementation slice. ON TRACK.
41. AI V2 first-pass interim verification report. ON TRACK.
42. AI V2 first-pass integrated correction and completion report. PASS.
43. AI V2 first-pass checkpoint commit / push. PASS. Commit: `25e931d`.
44. Online combat server-authority transition review. APPROVED.
45. Online combat server-authority first-pass scope lock report. APPROVED.
46. Online combat server-authority first-pass implementation. ON TRACK.
47. Online combat server-authority first-pass interim verification report. ON TRACK.
48. Online combat server-authority first-pass integrated fix and completion report. PASS.
49. Online live-play QA first pass. Current next target.

## Offline Command Stability Gate

Purpose: before network sync adds latency, permissions, host state, and packet ordering noise, prove that role commands are stable in local/offline play.

This gate is not a feature pass. It is a final local bug/verification checkpoint before online command sync.

Required checks:

- Role assets are owned correctly:
  - Infantry commands infantry squads only.
  - Engineer commands engineer / RPG / repair assets only.
  - Recon commands scout / drone / marking assets only.
  - Armor commands tanks / humvees / vehicles only.
- Each role's three intended commands have at least one local verification scene:
  - Infantry: advance / take cover / assault.
  - Engineer: repair / anti-armor standby / build defense.
  - Recon: drone recon / mark enemy / check flank route.
  - Armor: breakthrough / cover infantry / rear hold.
- `CommanderSlot -> SquadLeader -> Unit` is preserved:
  - Commands reach squad leaders / asset leaders, not arbitrary individual units.
  - Squad leaders hold `commandState`.
  - Units do not overwrite the command immediately with default AI judgment.
- Command stability is visible:
  - `commandLockUntil` holds for roughly 1-3 seconds.
  - `commandSource`, `commandReason`, and `lastCommandChangedAt` are recorded.
  - Duplicate command application is not observed.
  - Cancel/expiry behavior is recorded as working or blocked.
- Stopped states are explainable:
  - waiting / regrouping / covering / assault waiting / repairing / scouting / vehicle waiting / blocked / stuck.
- Vehicle and spawn basics are checked:
  - no obvious vehicle spawn overlap.
  - vehicles do not continuously push a friendly front vehicle.
  - narrow passages can produce wait-for-clear / blocked state instead of endless pushing.
  - stuck state is logged.
  - vehicle/infantry collision radius is not visibly far from rendered size.

Allowed in this gate:

- Directly related bug fixes.
- Debug/log/status visibility improvements.
- Command-state stability fixes.
- Basic vehicle/spawn/stuck fixes that affect command verification.

Not allowed in this gate:

- Full `BotCommander` behavior.
- AI V2.
- 50vs50 expansion.
- UGC.
- City/open-world work.
- Server-authority combat redesign.

Apply the Common Stage Gate and In-Progress Self Check. Leave manual notes, smoke output, screenshots, or debug snapshots that show what passed and what remains blocked.

## Online Command Sync 1st Pass

Status: PASS on 2026-05-22. See `docs/online-command-sync-first-pass-report-2026-05-22.md`.

Next big stage after the offline command stability gate: **online command synchronization, first pass**.

Prerequisite: do not start this until local/offline play has minimally verified role commands, `commandState`, `commandLockUntil`, stopped-state visibility, and basic vehicle waiting/spawn behavior. Online sync will mix command-structure bugs with network bugs if this gate is skipped.

Goal: make role-specific commander orders that already work offline/host-side carry the same meaning inside an online room.

Implementation / verification targets:

- Standardize online command packets with at least:
  - `roomId`
  - `playerId`
  - `commanderSlotId`
  - `role`
  - `controllerType`
  - `commandId`
  - `commandType`
  - `targetSquadId` or `targetAssetId`
  - `targetPosition`
  - `issuedAt`
  - `lockUntil`
  - `reason`
- Verify role permissions:
  - Each player can command only assets owned by their commander slot / role authority.
  - Infantry players cannot command armor vehicles.
  - Armor players cannot command infantry squads unless the existing role/authority model explicitly allows it.
  - Invalid `targetSquadId` / `targetAssetId` is rejected.
- Broadcast accepted commands to the room:
  - Other clients see the same radio log.
  - AI/asset command status is represented consistently.
  - Command markers stay meaningful across clients.
- Handle duplicate and delayed commands:
  - Do not apply the same `commandId` twice.
  - Ignore or supersede stale commands based on command age / latest command state.
  - Cancel / expiry behavior works without stale commands reappearing.
- Keep the world-host model:
  - AI simulation remains host/world-host based for now.
  - Do not redesign full server authority in this pass.
- Extend online smoke tests:
  - Two or more players join.
  - Each selects a different role.
  - Infantry command is sent and accepted.
  - Armor command is sent and accepted.
  - Unauthorized command is rejected.
  - Command broadcast is observed by another client.
  - `commandState` / `lockUntil` sync is visible in room state or observer snapshot.

Strictly not in this pass:

- Server-authority combat.
- 50vs50.
- Full `BotCommander` behavior.
- AI V2.
- UGC.
- City/open-world work.

One-line target: an online room should make a human commander order visible, permission-checked, broadcast, deduplicated, and semantically identical for everyone in that room.

## Online Commander-Order Stability Gate

Status: PASS on 2026-05-22. See `docs/online-commander-order-stability-gate-report-2026-05-22.md`.

This section is kept as the completed gate definition.

Goal: after online command sync exists, verify that role-specific commander orders are stable in multiplayer before starting the human FPS combat loop pass.

Required checks:

- Two-or-more-player room test:
  - Both players join the same room.
  - Players select different roles.
  - Each player can command only assets owned by their role / commander slot.
- Permission checks:
  - Infantry cannot command armor vehicles.
  - Armor cannot command infantry squads unless explicitly allowed by the current role authority model.
  - Invalid `targetSquadId` / `targetAssetId` is rejected.
- Broadcast checks:
  - The issuing client sees the radio log, command marker, AI `commandState`, and `lockUntil`.
  - Other clients in the same room see matching radio log, command marker, AI `commandState`, and `lockUntil`.
- Duplicate / delayed command checks:
  - Same `commandId` is not applied twice.
  - Stale commands do not overwrite newer commands.
  - Cancel / expiry behavior is verified.
- World-host consistency checks:
  - AI command application stays aligned with the world host.
  - Clients do not diverge into different AI command states.
- Online smoke/manual test record:
  - Role selection.
  - Authorized command success.
  - Unauthorized command rejection.
  - Command broadcast.
  - `commandState` sync.
  - `commandLockUntil` / `lockUntil` sync.

Allowed in this gate:

- Online command bug fixes.
- Permission validation fixes.
- Duplicate-command prevention.
- State/log/debug visibility improvements.
- Online smoke test expansion.

Not allowed in this gate:

- Full `BotCommander` behavior.
- AI V2.
- 50vs50.
- UGC.
- City/open-world work.
- Full server-authority combat redesign.

Apply the Common Stage Gate and In-Progress Self Check. This gate is now complete; empty-slot `BotCommander` skeleton remains blocked until after the human FPS combat loop and FPS + command integration QA.

## Human FPS Combat Loop 1st Pass

Status: PASS on 2026-05-22. See `docs/human-fps-combat-loop-first-pass-report-2026-05-22.md`.

After online commander-order stability, the next big axis is **human FPS combat loop first pass**. Do this before empty-slot `BotCommander` work.

Reason: command systems are the foundation, but the game must not drift into an AI command simulator. The player still needs to feel like a direct 2D FPS combatant who can change the battle personally.

Goal: make the player-facing 2D FPS combat loop readable, responsive, and important before adding AI commander behavior.

Implementation / verification targets:

- Core player combat:
  - movement.
  - aiming.
  - shooting.
  - reload / ammo flow.
  - taking damage.
  - death.
  - respawn or round elimination, depending on the current mode rules.
- Hit and damage feedback:
  - It is clear when the player hits an enemy.
  - It is clear when the player is hit.
  - Directional damage, health, and kill-log feedback are readable.
- Role/loadout separation:
  - `infantry`, `engineer`, `recon`, and `armor` remain command roles.
  - Role selection must not silently rewrite the weapon/loadout model.
  - Treat deeper loadout design as a later separate pass.
- Combat-time command usability:
  - The player can issue a quick command while fighting.
  - Command UI must not block core FPS movement/aim/shoot flow.
  - Prefer quick radio / hotkey / ping-like command interaction over heavy menu use during combat.
- Human impact on victory:
  - Human kills, human objective entry, and human breakthrough should matter more than passive AI-only fighting.
  - AI-only combat should not be able to make the whole game feel decided without human involvement.
- Online combat scope:
  - Stabilize position / shooting / hit event flow first.
  - Do not start a full server-authority combat rewrite in this pass.

Apply the Common Stage Gate and In-Progress Self Check. This pass is now complete; empty-slot `BotCommander` skeleton remains blocked until after FPS + command integration QA.

## FPS + Command Integration QA

Status: PASS on 2026-05-22. See `docs/fps-command-integration-qa-report-2026-05-22.md`.

Goal: verify that direct FPS combat and role-command input work together in the same live-play scenarios.

Stage evidence order:

1. Interim verification report: `docs/fps-command-integration-interim-verification-report-2026-05-22.md` -> ON TRACK.
2. Report-based narrow fix pass: `docs/fps-command-integration-fix-pass-report-2026-05-22.md` -> PASS, no gameplay code fix required.
3. Completion report: `docs/fps-command-integration-qa-report-2026-05-22.md` -> PASS.

Required checks:

- Player movement, aim, fire, ammo/cooldown flow, hit confirmation, damage feedback, death, and respawn/round-exit still work while role command tools are available.
- At least one quick role command can be issued during active combat without trapping mouse aim, fire, movement, weapon switching, or chat input.
- The player can read both combat feedback and command feedback at the same time: HIT/DOWN marker, damage direction, health/ammo, kill log, radio log, command marker, and `commandState`.
- Role/loadout separation remains intact: commander role selection does not silently rewrite weapon/loadout state.
- Online checks can stay narrow: verify position/aim/shoot/hit event flow plus command broadcast, but do not start full server-authority combat.

This QA is now complete. The next stage may start only the empty-slot `BotCommander` skeleton.

Not allowed:

- Full `BotCommander` behavior.
- AI V2.
- 50vs50 expansion.
- UGC.
- City/open-world work.
- Full server-authority combat redesign.

The next stabilization direction after QA remains useful, but only after the current command structure is proven:

Target: **AI command execution stabilization first pass + vehicle traffic stabilization**.

Do this before AI V2 tactical maps, AI scaling, UGC, city/open-world work, medic systems, or 50vs50 event mode.

Goal: when a human gives an order, AI follows it for a few seconds, vehicles stop clogging each other, and the game shows why an AI is stopped.

Important distinction: steering solves how an actor moves. This next pass solves when it moves, when it waits, and whose command it obeys.

Implementation direction:

- Add a `commandState` concept for ordered AI intent: `advance`, `hold`, `cover`, `assault`, `repair`, `scout`, `escort`.
- When a command is received, keep the same action for at least 1-3 seconds. Do not let individual AI overwrite player orders every frame.
- Use this command priority: emergency survival > player command > squad leader command > default AI judgment.
- Reduce individual AI authority. Soldiers should not make broad tactical decisions; squad/role orders win. Individual soldiers handle only movement, shooting, cover use, reload, and survival.
- Add a movement/observation rhythm: roughly 2 seconds moving, then 0.5-1 second observing/waiting, then reassess.
- Treat stopped states as normal states, not bugs: `observe`, `regroup`, `hold`, `wait-for-clear`, `blocked`.
- Add vehicle traffic rules. Steering alone is not enough:
  - Keep distance from friendly vehicles ahead.
  - Wait before entering narrow passages.
  - Maintain convoy spacing for vehicles with the same target.
  - Prevent overlapping spawn slots.
  - Align rendered vehicle size and collision radius.
  - When blocked, use stop -> reverse -> retry instead of pushing forward forever.
- Show AI stopped states in UI, debug labels, or radio logs: regrouping, covering, waiting behind vehicle, blocked/waiting, executing order, enemy spotted, retreating, repairing, scouting.
- Bug fixes belong in this pass when directly related: vehicle overlap, base exit clogging, AI ignoring orders, squads scattering, vehicles pushing infantry, or stopped states becoming permanent.

## Current Advancement Status

**Current next stage: backup commit / push checkpoint before AI V2 tactical map and cover-node work.** The empty-slot `BotCommander` skeleton completion report is PASS, so the skeleton stage is closed.

Do not advance into AI V2 or real bot commander behavior until the current worktree is backed up, committed, and pushed.

## Repository

- Actual repo: `C:\Users\rneet\Documents\Codex\2026-05-20\pepeant-iron-line-2d-tank-prototype`
- Live URL: `https://iron-line-2d-tank-prototype.onrender.com/`
- Check current commit with `git log -1 --oneline`.
- Check remote with `git ls-remote origin refs/heads/main`.
- Local HEAD at this handoff: `406da00 docs: record shutdown gate failure`

## Latest Local Work

Run date: 2026-05-22 KST.

Completed before this handoff:

- Backed up the project before edits to `C:\Users\rneet\Documents\Codex\2026-05-22\iron-line-backups`.
- Separated lobby role selection from weapon/loadout changes.
- `assignPlayerToSlot()` now changes command slot / role authority without calling `applyFullPlayerClassLoadout()`.
- Lobby loadout UI now displays the player's current combat class/loadout instead of deriving it from the command role.
- Command radio channel label now follows the selected role label for non-armor channels.

Expected modified files if not committed yet:

- `src/systems/game-session-state.js`
- `src/systems/lobby-ui.js`
- `src/systems/command-radio.js`

Verification already run:

- `npm run check`
- `npm run check:online`
- Browser lobby check: switching `infantry -> engineer -> armor` kept the loadout as `infantry: machinegun / pistol / grenade` while changing the command role.

Additional 2026-05-22 command-flow work in progress:

- Keep this scoped as command-flow stabilization. `BotCommander` is not a feature target yet; it is only a future extension point behind `controllerType`.
- Added explicit squad command metadata: `commandState`, `commandSource`, `commandReason`, `commandLockUntil`, `lastCommandChangedAt`, `squadLeaderId`, `commanderSlotId`.
- `CommandBus` now tags player-issued squad/vehicle orders with command state and commander slot id.
- `SquadAI` now treats player/bot orders as squad-leader command intent and prevents non-urgent tactical mode churn during the short command lock.
- Infantry units now keep squad orders longer unless there is an emergency override: tank threat, high suppression, or very close contact.
- Infantry debug state, AI observatory, observer bridge, renderer debug labels, and admin squad rows now expose command state/lock metadata.
- Added `src/ai/infantry-command-priority.js` so the command-priority helper does not grow the already-hot `infantry-ai.js` file.

Additional verification already run:

- `npm run check`
- `npm run check:online`
- Browser smoke on local `http://127.0.0.1:4173/index.html` with no console errors through entry/deployment start.
- 2026-05-22 re-run: `npm run check` passed; `npm run check:online` passed with `Online smoke passed: SMOKE-1779424259639, players=2, combat=1, ws=hello/join_result/observer_snapshot`.
- 2026-05-22 browser lobby smoke: entered online room `ROOM-001`, switched the local slot from blue infantry to blue armor, and verified the displayed command role changed to armor while the combat loadout stayed `infantry: machinegun / pistol / grenade`.
- 2026-05-22 command metadata smoke: `CommandBus` player-issued `attack` order produced `commandState: assault`, `commandSource: player`, `commandReason: attack`, `commandLockSeconds: 2.2`, `commanderSlotId: blue-infantry`, and one command log entry.
- 2026-05-22 browser battle smoke: offline battle reached the field, command radio button/panel rendered, command buttons were present, and browser console errors were empty. Screenshot: `C:\Users\rneet\Documents\Codex\2026-05-22\codex-threads-019e4849-e426-7b73-826f\iron-line-command-radio-smoke-20260522.png`.
- 2026-05-22 pre-checkpoint verification: `npm run check` passed; `npm run check:online` passed with `Online smoke passed: SMOKE-1779424968014, players=2, combat=1, ws=hello/join_result/observer_snapshot`.
- 2026-05-22 offline commander-order QA pass 1: local Playwright/Chrome entered live play for each blue role, selected the role before deployment, opened the command radio, and verified the role special button was present and enabled.
- 2026-05-22 offline commander-order QA pass 1 results:
  - Infantry `blue-infantry -> B-SQD-3`: `assault` accepted; squad and observatory showed `commandState: assault`, `commandSource: player`, `commandReason: assault`, `commanderSlotId: blue-infantry`; lock remained about 1.36s at the 1.4s sample.
  - Engineer `blue-engineer -> B-SQD-1`: `repair` accepted; squad and observatory showed `commandState: repair`, `commandSource: player`, `commandReason: repair`, `commanderSlotId: blue-engineer`; lock remained about 0.98s at the 1.4s sample.
  - Recon `blue-recon -> B-SQD-6`: `scan` accepted; squad and observatory showed `commandState: scout`, `commandSource: player`, `commandReason: scan`, `commanderSlotId: blue-recon`; lock remained about 1.0s at the 1.4s sample.
  - Armor `blue-armor -> B-12`: `fire_support` accepted; vehicle manual order, commander assignment, and observatory showed `commandState: cover`, `commandSource: player`, `commandReason: fire_support`, `commanderSlotId: blue-armor`; lock remained about 0.58s at the 1.4s sample.
- 2026-05-22 command radio UI click smoke: clicked live role-special buttons for all four roles.
  - `blue-infantry` `assault`: command log accepted; `B-SQD-3` showed `commandState: assault`, `commandSource: player`, `commandReason: assault`, `commanderSlotId: blue-infantry`, with about 2.22s lock remaining after the click.
  - `blue-engineer` `repair`: command log accepted; `B-SQD-1` showed `commandState: repair`, `commandSource: player`, `commandReason: repair`, `commanderSlotId: blue-engineer`, with about 0.93s lock remaining after the 1.4s sample.
  - `blue-recon` `scan`: command log accepted; `B-SQD-6` showed `commandState: scout`, `commandSource: player`, `commandReason: scan`, `commanderSlotId: blue-recon`, with about 0.91s lock remaining after the 1.4s sample.
  - `blue-armor` `fire_support`: after a direct channel-selection fix, the radio panel selected armor channel / `B-12`; command log accepted, and assignment + observatory showed `commandState: cover`, `commandSource: player`, `commandReason: fire_support`, `commanderSlotId: blue-armor`, with about 0.50s lock remaining after the 1.4s sample.
- 2026-05-22 offline commander-order QA pass/fail evidence:
  - Full interim report: `docs/commander-order-qa-interim-report-2026-05-22.md`
  - Role-level completion report: `docs/commander-order-qa-completion-report-2026-05-22.md`
  - Completion decision: PASS to move into the offline command stability gate. This does not permit online command synchronization yet.

| Role | Command | Target | State Visible | Lock Works | Result |
| --- | --- | --- | --- | --- | --- |
| Infantry | `assault` | `B-SQD-3` from `blue-infantry` | yes: squad + observatory showed `assault`, `player`, `assault`, `blue-infantry` | yes: UI click sample had about 2.22s remaining after click | pass |
| Engineer | `repair` | `B-SQD-1` from `blue-engineer` | yes: squad + observatory showed `repair`, `player`, `repair`, `blue-engineer` | yes: UI click retest had about 0.93s remaining after 1.4s | pass |
| Recon | `scan` | `B-SQD-6` from `blue-recon` | yes: squad + observatory showed `scout`, `player`, `scan`, `blue-recon` | yes: UI click retest had about 0.91s remaining after 1.4s | pass |
| Armor | `fire_support` | `B-12` from `blue-armor` | yes: vehicle assignment + observatory showed `cover`, `player`, `fire_support`, `blue-armor` | yes: UI click retest had about 0.50s remaining after 1.4s | pass |

- 2026-05-22 offline command stability gate:
  - Full report: `docs/offline-command-stability-gate-report-2026-05-22.md`
  - Gate decision: PASS to begin online command synchronization, first pass.
  - Role command coverage passed for infantry `move` / `defend` / `assault`, engineer `repair` / `defend` / `rally`, recon `scan` / `attack` / `move`, and armor `move` / `fire_support` / `defend`.
  - Duplicate accepted command ids are now rejected with `duplicate-command`.
  - `cancel` now immediately clears player command state to idle / bot / lock `0`.
  - Basic vehicle diagnostics passed: no sampled blue vehicle overlap, forced traffic hold exposed `traffic waiting`, and forced stuck diagnostics surfaced stuck state.
- 2026-05-22 offline commander-order QA pass 1 screenshots:
  - `C:\Users\rneet\Documents\Codex\2026-05-22\codex-threads-019e4849-e426-7b73-826f\offline-command-infantry-assault-qa-2.png`
  - `C:\Users\rneet\Documents\Codex\2026-05-22\codex-threads-019e4849-e426-7b73-826f\offline-command-engineer-repair-qa-2.png`
  - `C:\Users\rneet\Documents\Codex\2026-05-22\codex-threads-019e4849-e426-7b73-826f\offline-command-recon-scan-qa-2.png`
  - `C:\Users\rneet\Documents\Codex\2026-05-22\codex-threads-019e4849-e426-7b73-826f\offline-command-armor-fire-support-qa-2.png`
- 2026-05-22 command radio UI click screenshots:
  - `C:\Users\rneet\Documents\Codex\2026-05-22\codex-threads-019e4849-e426-7b73-826f\offline-command-engineer-repair-ui-click-qa.png`
  - `C:\Users\rneet\Documents\Codex\2026-05-22\codex-threads-019e4849-e426-7b73-826f\offline-command-recon-scan-ui-click-qa.png`
  - `C:\Users\rneet\Documents\Codex\2026-05-22\codex-threads-019e4849-e426-7b73-826f\offline-command-armor-fire-support-ui-click-qa-2.png`
- 2026-05-22 direct fixes from offline QA:
  - `CommanderAI.applyCombinedArmsOrders()` now excludes manually commanded tanks so player armor orders are not overwritten by automatic combined-arms support.
  - Role specials are enabled through the existing `CommandBus` / `CommandRadio` path: infantry `assault`, engineer `repair`, recon `scan`, armor `fire_support`.
  - Vehicle command orders now carry `commandLockUntil` / `lastCommandChangedAt`, and vehicle command state is exposed through AI observatory and observer bridge snapshots.
  - Vehicle-only armor slots now auto-select the armor radio channel so `fire_support` uses selected vehicle assets instead of an empty infantry channel.
- 2026-05-22 post-QA checks: `npm run check` passed; `npm run check:online` passed with `Online smoke passed: SMOKE-1779427420462, players=2, combat=1, ws=hello/join_result/observer_snapshot`. `git diff --check` reported only existing CRLF conversion warnings.
- 2026-05-22 online command synchronization first pass:
  - Interim verification report: `docs/online-command-sync-interim-verification-report-2026-05-22.md`
  - Fix pass report: `docs/online-command-sync-fix-pass-report-2026-05-22.md`
  - Full report: `docs/online-command-sync-first-pass-report-2026-05-22.md`
  - Stage decision: PASS to enter the online commander-order stability gate.
  - Online packets now preserve `roomId`, `playerId`, `commanderSlotId`, `role`, `controllerType`, `commandId`, `commandType`, target id/position, `issuedAt`, `lockUntil`, `reason`, and `commandState`.
  - Server command handling now validates role/slot authority, rejects duplicate and stale command ids, stores accepted commands in room state, and broadcasts accepted WebSocket commands.
  - Client room registry now stores room `commands`; local accepted online commands publish to the room; remote room commands are applied back through `CommandBus` without local cooldown drift.
  - Report-based fix pass tightened server target validation so a blue commander cannot target an `R-` squad/vehicle id, and made online `cancel` publish/export `commandState: cancel`.
  - Latest online smoke after the fix pass passed with `Online smoke passed: SMOKE-1779430192063, players=2, combat=1, commands=3, ws=hello/join_result/observer_snapshot, wsCommand=ack/broadcast`.
- 2026-05-22 online commander-order stability gate:
  - Full report: `docs/online-commander-order-stability-gate-report-2026-05-22.md`
  - Gate decision: PASS to start the human FPS combat loop first pass.
  - Two browser clients used the same room `GATE-1779430845418`: `gate-blue` as `blue-infantry`, `gate-red` as `red-armor`.
  - Browser runtime verified authorized infantry `assault` and armor `fire_support`, unauthorized infantry vehicle command rejection, and unauthorized cross-slot command rejection.
  - Remote clients saw room commands, command pings, `CommandBus` log entries, and AI command state: `B-SQD-3` reached `assault`; `R-05` held `cover`.
  - Direct bug fixed: remote accepted commands now use `trustedRemote` target-id resolution so a server/room-accepted command does not fail on the receiving client with `no-assets` when local slot asset lists differ.
  - Post-gate checks passed: `npm run check`; `npm run check:online` with `Online smoke passed: SMOKE-1779431010018, players=2, combat=1, commands=3, ws=hello/join_result/observer_snapshot, wsCommand=ack/broadcast`.
- 2026-05-22 human FPS combat loop first pass:
  - Interim verification report: `docs/human-fps-combat-loop-interim-verification-report-2026-05-22.md`
  - Full report: `docs/human-fps-combat-loop-first-pass-report-2026-05-22.md`
  - Stage decision: PASS to start FPS + command integration QA.
  - Runtime evidence covered movement, aiming, firing/ammo flow, HIT/DOWN confirmation, kill log, damage indicator, death, conquest respawn, command-while-fighting, and role/loadout separation.
  - Follow-up in the same FPS first-pass scope added conservative vehicle-contact death causes: `vehicle_collision` / `tank_crush` labels, enemy vehicle impact and sustained tank contact damage, same-team push-only contact, and anti-tank assault protection from low-speed touch death.
  - Post-pass checks passed: `npm run check`; `npm run check:online` with `Online smoke passed: SMOKE-1779432251707, players=2, combat=1, commands=3, ws=hello/join_result/observer_snapshot, wsCommand=ack/broadcast`.
- 2026-05-22 FPS + command integration QA:
  - Interim report: `docs/fps-command-integration-interim-verification-report-2026-05-22.md`
  - Fix pass report: `docs/fps-command-integration-fix-pass-report-2026-05-22.md`
  - Full report: `docs/fps-command-integration-qa-report-2026-05-22.md`
  - Stage decision: PASS to start empty-slot `BotCommander` skeleton only.
  - Added narrow QA helper: `tools/check-fps-command-integration.cjs`.
  - Runtime smoke verified role/loadout separation, fire before command, movement while radio is open, infantry `assault` reaching `B-SQD-3` with `commandState: assault`, fire after command, infantry reload HUD staying compact, and death while radio is open hiding the command panel.
  - Post-pass checks passed: `npm run check`; `npm run check:online` with `Online smoke passed: SMOKE-1779437299400, players=2, combat=1, commands=3, ws=hello/join_result/observer_snapshot, wsCommand=ack/broadcast`.
- 2026-05-22 empty-slot BotCommander skeleton first pass:
  - Full report: `docs/bot-commander-skeleton-first-pass-report-2026-05-22.md`
  - Stage decision: PASS to start an empty-slot BotCommander skeleton stability gate.
  - Added narrow QA helper: `tools/check-bot-commander-skeleton.cjs`.
  - Runtime smoke verified `blue-infantry` human slot priority, `blue-engineer` empty bot slot detection, `repair` command accepted through `CommandBus`, `B-SQD-1` reaching `commandState: repair`, `commandSource: bot`, `commandReason: repair`, `commanderSlotId: blue-engineer`, active lock around 2.4s, and `controllerType: empty` rejection.
- 2026-05-22 empty-slot BotCommander skeleton stability / completion:
  - Interim report: `docs/bot-commander-skeleton-interim-verification-report-2026-05-22.md`
  - Correction pass: `docs/bot-commander-skeleton-correction-pass-2026-05-22.md`
  - Completion report: `docs/bot-commander-skeleton-completion-report-2026-05-22.md`
  - Stage decision: PASS. Back up, commit, and push before starting AI V2 tactical map / cover-node work.
  - Runtime smoke verifies all-role bot commands, human / bot / empty guards, human priority, squad / asset-leader delivery, command metadata, observer visibility, FPS + command integration regression, anti-vehicle regression, and online command smoke.

Open before advancing beyond the next stage:

- Backup commit / push checkpoint is now the next target before AI V2. The BotCommander skeleton stability gate is closed.
- Carry forward a non-blocking follow-up for deeper natural vehicle/infantry pushing QA. The offline gate checked sampled overlap plus forced traffic/stuck diagnostics; it did not exhaustively validate all future traffic physics edge cases.
- Do not start AI V2, 50vs50, UGC, city/open-world, server-authority combat work, or real bot commander behavior until the backup commit / push checkpoint is complete.

## First Checks

Run these before editing:

```powershell
git status --short --branch
git remote -v
git log -1 --oneline
npm run check
```

Then verify the live build:

```powershell
Invoke-WebRequest -Uri "https://iron-line-2d-tank-prototype.onrender.com/api/build" -UseBasicParsing
```

If `/api/build` is missing or old, Render is not serving the latest GitHub main yet.

Also check the live `index.html`:

```powershell
$r = Invoke-WebRequest -Uri "https://iron-line-2d-tank-prototype.onrender.com/index.html?ts=$(Get-Date -UFormat %s)" -UseBasicParsing
$r.Content -match "build-info.css"
$r.Content -match "src/core/build-info.js"
```

## Known State

- `src/ai/infantry-base-egress.js` is loaded by live `index.html`.
- Infantry base egress was observed working on the Render URL.
- Scout recon drone ammo was observed as `1` in the live UI and runtime state.
- GitHub main contains online combat sync and remote player marker smoothing.
- GitHub main now also contains `/api/build`, a visible build badge, and `npm run check:online`.
- Render live was still returning `404` for `/api/build` after commit `160886c`, so deployment mismatch is the highest risk.

## Latest Stabilization Run

Run date: 2026-05-21 KST.

Completed:

- Actual repo path confirmed: `C:\Users\rneet\Documents\Codex\2026-05-20\pepeant-iron-line-2d-tank-prototype`
- GitHub `main` confirmed at `11412ca docs: narrow online stabilization handoff` before this note.
- Local checks passed:
  - `npm run check`
  - `npm run check:online`
- Local `/api/build` works and reports the current commit when the local server is running.
- Render live `/api/rooms` works and returned `{ "ok": true, "rooms": [] }`.
- Render live online/offline entry screen loaded with no browser console errors.
- Render live offline entry reached the deployment screen with no browser console errors.
- Render live battle start reached the in-game screen with no browser console errors.
- Render live scout loadout showed `3 드론 1`.
- Render live `src/data/infantry-classes.js` contains `reconDrone: 1`.
- Render live `src/ai/infantry-base-egress.js` is available with HTTP 200.

Incomplete / blocked:

- Render live still returned `404` for `/api/build`.
- Render live `index.html` still did not include `build-info.css` or `src/core/build-info.js`.
- Render live `src/main.js` still did not include `updateOnlineCombatEvents` or `updateOnlineWorldSync`.
- Render live `src/systems/renderer.js` still did not include `remoteHumanStates` or remote drone cue rendering.

Current bug report:

- GitHub `main` is ahead of the deployed Render code. The live service is running an older app build even though the server itself is online.
- Because live is stale, do not judge the latest online sync work from `https://iron-line-2d-tank-prototype.onrender.com/` until Render serves `/api/build` and the build badge.
- Likely next action is a Render manual deploy or checking whether the Render service is connected to a different repo/branch/root directory.

## Shutdown Gate Run

Run date: 2026-05-21 KST.

Requested shutdown condition:

- Commit/push must succeed.
- Render live must reflect the latest GitHub `main`.
- Render live basic page and browser console must have no fatal issue.
- Only then run `shutdown /s /t 0`.

Result:

- Shutdown was not executed.
- Local repo was clean at start.
- Local `main` and `origin/main` matched `1c4a91a docs: record live stabilization results`.
- Render live `/api/build` returned `404`.
- Render live `index.html` did not include `build-info.css` or `src/core/build-info.js`.
- Render live `src/main.js` did not include `updateOnlineCombatEvents`, `updateOnlineWorldSync`, or the latest tank machine-gun online shot path.
- Render live `src/systems/renderer.js` did not include `remoteHumanStates` or `drawRemoteDroneCue`.
- Render live basic entry page loaded with no browser console errors, but no build badge was present.

Blocking reason:

- Deployment is still stale. The Render service is not serving the latest GitHub `main`, so the shutdown gate failed.

## Rules

- Do not do a large refactor for the first role-command pass.
- Do not start AI V2 work.
- Do not start UGC, city/open-world, or 50vs50 expansion work.
- Do not rewrite server authority or online architecture.
- Do not redesign the full online flow.
- Do not replace existing AI systems; wire roles to the current command/assets path first.
- Do not make lobby role selection change weapons/loadouts.
- Do not revert unrelated changes.
- Make small commits.
- For local role-command fixes, apply the Common Stage Gate. Minimum checks include `npm run check`, `npm run check:online`, a lobby/browser role switch check, and role-command play verification notes.

## Previous Deployment Stabilization Checklist

1. Find and use the actual git repo path listed above.
2. Compare GitHub `main` with the Render live deployment.
3. Confirm the app or admin panel shows build id / commit hash.
4. Confirm the live URL shows the same build id.
5. Check browser console errors for online and offline entry.
6. Click through entry to battle start on the live URL.
7. Confirm infantry base egress and scout recon drone ammo `1` on the live URL.
8. Commit and push only small fixes directly related to these checks.
9. Update this file with completed, incomplete, and next actions.

## Optional Local Verification

Use this only after the deployment check is clear:

```powershell
npm run check
npm run check:online
```

`check:online` starts the local server and verifies two players, position/aim, drone position, combat event preservation, world state, and WebSocket join/snapshot.
