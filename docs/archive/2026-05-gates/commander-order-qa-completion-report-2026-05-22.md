# Commander Order QA Completion Report - 2026-05-22

This is the role-level QA decision report. It decides whether the project can move from role-command QA into the offline command stability gate.

Decision: PASS to move into the offline command stability gate.

Important: this PASS does not close the offline command stability gate. It only means each of the four commander roles now has at least one local live-play command scene with evidence that the command reaches the correct squad or asset leader and remains observable during its short lock window.

## Verification Environment

- Execution URL: `http://127.0.0.1:4173/index.html`
- Test mode: local/offline live play.
- Browser: Playwright driving Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`.
- Server: local app served on port `4173`.
- Evidence sources:
  - command radio UI special button clicks.
  - `game.commandBus.log`.
  - live `SquadAI` state on squad objects.
  - live vehicle commander assignment and `manualOrder`.
  - `game.aiObservatory.latest()`.
  - screenshots saved under `<local-codex-workspace>`.
- Related checks:
  - `npm run check` passed.
  - `npm run check:online` passed with `Online smoke passed: SMOKE-1779428082121, players=2, combat=1, ws=hello/join_result/observer_snapshot`.
  - `git diff --check` reported only CRLF conversion warnings.

## Role Result Table

| Role | Command | Target squad/asset | commandState | commandSource | commandReason | lockUntil / hold | Result | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Infantry | `assault` | `B-SQD-3` from `blue-infantry` | `assault` | `player` | `assault` | about 2.22s remaining after UI click; about 1.36s remaining at the 1.4s sample in the broader pass | PASS | command radio special button click accepted; squad and observatory showed matching command metadata |
| Engineer | `repair` | `B-SQD-1` from `blue-engineer` | `repair` | `player` | `repair` | about 0.93s remaining after the 1.4s UI-click sample | PASS | command radio special button click accepted; squad and observatory showed matching command metadata |
| Recon | `scan` | `B-SQD-6` from `blue-recon` | `scout` | `player` | `scan` | about 0.91s remaining after the 1.4s UI-click sample | PASS | command radio special button click accepted; squad and observatory showed matching command metadata |
| Armor | `fire_support` | `B-12` from `blue-armor` | `cover` | `player` | `fire_support` | about 0.50s remaining after the 1.4s UI-click sample | PASS | command radio special button click accepted after armor-channel fix; vehicle assignment and observatory showed matching command metadata |

## Minimum Role Verification

- Infantry minimum scene: `assault` verified as the first-pass assault command.
- Engineer minimum scene: `repair` verified as the first-pass repair command.
- Recon minimum scene: `scan` verified as the first-pass recon / scout command.
- Armor minimum scene: `fire_support` verified as the first-pass infantry-cover / fire-support command.

The first-pass requirement was at least one actual local live-play scene per role. That requirement is satisfied.

## Command Flow Judgment

| Flow Check | Judgment | Evidence |
| --- | --- | --- |
| `CommanderSlot -> SquadLeader -> Unit` stays coherent for tested squad commands | PASS | Infantry, engineer, and recon commands reached owned squad leaders and exposed `commanderSlotId` matching the role slot. |
| `CommanderSlot -> asset leader` stays coherent for tested armor command | PASS | Armor `fire_support` reached vehicle `B-12` through the armor slot and commander assignment. |
| Individual units do not immediately overwrite the command | PASS for tested scenes | Command state remained visible through the sampled lock windows instead of being immediately replaced by default bot intent. |
| State/logs explain why the behavior happens | PASS for tested scenes | `commandState`, `commandSource`, `commandReason`, `commandLockRemaining`, and `commanderSlotId` were visible through squad / vehicle assignment and observatory data. |
| Role assets are correctly targeted in tested scenes | PASS | Each role command targeted the role-owned squad or vehicle listed in the role slot. |

This does not prove every future tactical edge case. It proves the role-command path is stable enough to enter the next gate, where stopped states, vehicle traffic, stuck handling, and wider command coverage must be verified.

## Bugs And Blockers

Fixed direct bugs:

- Role special commands existed in `CommandBus` but were not allowed by role permissions.
- Command radio had a `commandSpecials` container but did not render role-special command buttons.
- Manual armor commands could be overwritten by automatic `CommanderAI.applyCombinedArmsOrders()` support assignment.
- Vehicle command metadata was not visible through AI observatory / observer bridge snapshots.
- Vehicle-only armor slots could open the radio on the infantry channel, leaving no selected vehicle asset and producing no command log entry.

Remaining blockers for entering the offline command stability gate:

- None.

Remaining checks inside the offline command stability gate:

- Verify the rest of each role's intended first-pass commands.
- Verify stopped-state clarity: waiting, regrouping, covering, repairing, scouting, blocked, stuck.
- Verify vehicle spawn overlap, front-vehicle pushing, narrow-passage waiting, and stuck logging.
- Verify vehicles do not keep pushing infantry.
- Verify squad scattering and permanent stopped-state cases.

## Next Stage Decision

PASS: move to the offline command stability gate.

Do not move to online command synchronization yet. The next stage is still local/offline verification and direct bug fixing.

Next target:

1. Start the offline command stability gate.
2. Expand from one command per role to the remaining intended role commands.
3. Capture stopped-state and vehicle/stuck evidence.
4. Fix only directly related local command / observability / vehicle-state bugs.
5. Only after that gate passes, begin online command synchronization.

