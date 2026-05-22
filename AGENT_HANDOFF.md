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

The next target is: **offline command stability gate**.

This is not a new-feature pass. The immediate goal is to prove locally/offline that the current `CommanderSlot -> SquadLeader -> Unit` structure works in live play, and to fix only directly related breakage before online command synchronization.

Do not start AI V2, UGC, city/open-world expansion, 50vs50 expansion, server-authority rewrites, or broad online redesign work from this handoff.

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
- `BotCommander` is not a feature target right now. Keep only the structure ready for future `human / bot / empty` `controllerType`.
- Do not implement 50vs50, UGC, city/open-world work, medics, advanced AI commanders, or server-authority redesign in this pass.

AI should not become "smarter" in this pass. It should become easier to command:

- When AI receives a command, hold that intent for at least 1-3 seconds before changing behavior.
- When AI is stopped, expose the state so it does not look bugged: waiting, regrouping, covering, vehicle waiting, scouting, repairing.
- This pass is about humans owning and commanding AI assets, not advanced AI learning.

## Near-Term Development Order

0. Common Stage Gate and In-Progress Self Check are fixed in this file.
1. Finish the current command-structure work.
2. Offline command stability gate.
3. Online command synchronization first pass.
4. Online commander-order stability gate.
5. Human FPS combat loop first pass.
6. FPS + command integration QA.

## Current Work Target

Next work item: **offline command stability gate**.

Goal: before online command synchronization, verify in local/offline play that role-specific commander orders are stable and that the current `CommanderSlot -> SquadLeader -> Unit` structure is respected. If a directly required role-command path is missing or broken, treat that as a bug in the current pass and fix it narrowly. Do not use this gate as a reason to add unrelated systems.

Apply the Common Stage Gate and In-Progress Self Check before advancing.

Verify role asset ownership:

- Infantry commands infantry squads only.
- Engineer commands engineer / RPG / repair / defensive assets.
- Recon commands scout / drone / marking assets.
- Armor commands tanks / humvees / vehicles.

Verify role command behavior:

- Infantry scenes: advance / take cover / assault.
- Engineer scenes: repair / anti-armor standby / build defense.
- Recon scenes: drone recon / mark enemy / check flank route.
- Armor scenes: breakthrough / cover infantry / rear hold.

For each command that exists or is required by the first pass, verify:

- The order reaches the correct squad leader or asset leader.
- Individual units do not immediately overwrite it with default AI judgment.
- `commandState`, `commandSource`, `commandReason`, `commandLockUntil`, `squadLeaderId`, and `commanderSlotId` are visible in debug, observatory, admin, or equivalent logs.
- The command intent holds for roughly 1-3 seconds unless emergency survival overrides it.
- Targets do not churn every frame during the command lock.

Verify stopped-state clarity:

- Waiting / hold.
- Regrouping.
- Covering.
- Repairing.
- Scouting.
- Blocked / waiting for clear.

Verify directly related vehicle issues:

- Vehicle overlap.
- Spawn overlap.
- Friendly front-vehicle collision.
- Narrow-passage clogging.
- Stuck state.
- Vehicles pushing infantry.
- Squad scattering after command.
- Permanent stopped state after command.

Record test scenes:

- At least one infantry command scene.
- At least one engineer command scene.
- At least one recon command scene.
- At least one armor command scene.

If a required local/offline command check is broken, do not start online command synchronization.

## Next Sequence After Offline Gate

After this offline gate passes, the next stage is **online command synchronization, first pass**.

Do not move to online command sync if role ownership, command state, command lock, debug/observatory visibility, or basic local vehicle/spawn behavior is still broken.

Current sequence:

1. Current command-structure work completion.
2. Offline command stability gate.
3. Online command synchronization.
4. Online commander-order stability gate.
5. Human FPS combat loop first pass.
6. FPS + command integration QA.
7. Empty-slot `BotCommander` skeleton only, not full bot commander behavior.
8. AI V2 tactical map / cover nodes / vehicle traffic.
9. AI count scaling.
10. 50vs50 event mode.

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

Next gate after online command synchronization first pass: **online commander-order stability gate**.

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

Apply the Common Stage Gate and In-Progress Self Check. Do not start the human FPS combat loop pass until online human commander orders are verified as permission-checked, broadcast, deduplicated, and visible in all clients. Empty-slot `BotCommander` skeleton remains blocked until after the human FPS combat loop and FPS + command integration QA.

## Human FPS Combat Loop 1st Pass

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

Apply the Common Stage Gate and In-Progress Self Check. Leave manual notes or smoke output proving the player can fight, receive feedback, die/respawn or exit the round correctly, and issue at least one quick command without the command UI breaking FPS controls.

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

**Do not advance yet.** The role-command work has implementation and smoke coverage, but the stage remains open until live/manual play proves that role commands reach the correct squad/asset leaders, command state is observable in logs/debug output, directly related bugs are fixed or recorded as blockers, and minimum test notes are left.

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

Open before advancing to the next stage:

- Direct live-play verification that a selected squad receives a radio command in battle and exposes the same command state through debug/observatory output.
- Do not treat command-flow stabilization as complete if command state is only visible in isolated metadata smoke but not observable during actual play.

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
