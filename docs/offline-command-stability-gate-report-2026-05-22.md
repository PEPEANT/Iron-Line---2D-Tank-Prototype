# Offline Command Stability Gate Report - 2026-05-22

Decision: PASS to begin online command synchronization, first pass.

This PASS is narrow. It means the local/offline commander-order path is stable enough to carry into online command synchronization. It does not approve FPS combat-loop work, `BotCommander`, AI V2, 50vs50 expansion, UGC, city/open-world work, or server-authority combat redesign.

## Prerequisite

- Prior report: `docs/commander-order-qa-completion-report-2026-05-22.md`
- Required prerequisite decision: role-level commander-order QA PASS.
- Result: satisfied.

## Verification Environment

- Execution URL: `http://127.0.0.1:4173/index.html`
- Test mode: local/offline live play through Playwright + Chrome.
- Browser executable: `C:/Program Files/Google/Chrome/Application/chrome.exe`
- Evidence sources:
  - `game.commandBus.log`
  - live squad order state
  - live vehicle assignment / `manualOrder`
  - `game.aiObservatory.latest()`
  - screenshots under `C:\Users\rneet\Documents\Codex\2026-05-22\codex-threads-019e4849-e426-7b73-826f`

Latest command-line checks:

- `npm run check`: PASS.
- `npm run check:online`: PASS with `Online smoke passed: SMOKE-1779428902861, players=2, combat=1, ws=hello/join_result/observer_snapshot`.
- `git diff --check`: only CRLF conversion warnings for modified text files.

## Role Asset Ownership

| Role slot | Owned target used in gate | Result |
| --- | --- | --- |
| `blue-infantry` | `B-SQD-3` infantry squad | PASS |
| `blue-engineer` | `B-SQD-1` engineer / repair squad | PASS |
| `blue-recon` | `B-SQD-6` recon squad | PASS |
| `blue-armor` | `B-12` vehicle asset | PASS |

Unauthorized spot checks:

- Infantry command to armor vehicle rejected.
- Invalid / non-owned target paths did not produce accepted role commands in the gate scripts.

## Role Command Coverage

Each role was tested in a separate local live scene with the role assigned before deployment. The script cleared command cooldowns between command submissions to keep the gate focused on command flow, not cooldown balance.

| Role | Command | Target | commandState | commandSource | commandReason | Lock evidence | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Infantry | `move` | `B-SQD-3` | `advance` | `player` | `move` | about 1.50s immediate / 1.13s mid-sample | PASS |
| Infantry | `defend` | `B-SQD-3` | `hold` | `player` | `defend` | about 2.20s immediate / 1.83s mid-sample | PASS |
| Infantry | `assault` | `B-SQD-3` | `assault` | `player` | `assault` | about 2.80s immediate / 2.43s mid-sample | PASS |
| Engineer | `repair` | `B-SQD-1` | `repair` | `player` | `repair` | about 2.40s immediate / 2.03s mid-sample | PASS |
| Engineer | `defend` | `B-SQD-1` | `hold` | `player` | `defend` | about 2.20s immediate / 1.84s mid-sample | PASS |
| Engineer | `rally` | `B-SQD-1` | `hold` | `player` | `rally` | about 1.80s immediate / 1.40s mid-sample | PASS |
| Recon | `scan` | `B-SQD-6` | `scout` | `player` | `scan` | about 2.40s immediate / 2.04s mid-sample | PASS |
| Recon | `attack` | `B-SQD-6` | `assault` | `player` | `attack` | about 2.20s immediate / 1.84s mid-sample | PASS |
| Recon | `move` | `B-SQD-6` | `advance` | `player` | `move` | about 1.50s immediate / 1.14s mid-sample | PASS |
| Armor | `move` | `B-12` | `advance` | `player` | `move` | about 1.50s immediate / 1.13s mid-sample | PASS |
| Armor | `fire_support` | `B-12` | `cover` | `player` | `fire_support` | about 2.00s immediate / 1.65s mid-sample | PASS |
| Armor | `defend` | `B-12` | `hold` | `player` | `defend` | about 2.20s immediate / 1.83s mid-sample | PASS |

Screenshots:

- `C:\Users\rneet\Documents\Codex\2026-05-22\codex-threads-019e4849-e426-7b73-826f\offline-command-stability-gate-infantry-commands.png`
- `C:\Users\rneet\Documents\Codex\2026-05-22\codex-threads-019e4849-e426-7b73-826f\offline-command-stability-gate-engineer-commands.png`
- `C:\Users\rneet\Documents\Codex\2026-05-22\codex-threads-019e4849-e426-7b73-826f\offline-command-stability-gate-recon-commands.png`
- `C:\Users\rneet\Documents\Codex\2026-05-22\codex-threads-019e4849-e426-7b73-826f\offline-command-stability-gate-armor-commands.png`

## Command Stability

| Check | Evidence | Result |
| --- | --- | --- |
| `CommanderSlot -> SquadLeader` path | Infantry, engineer, and recon role commands landed on owned squad leaders with matching `commanderSlotId`. | PASS |
| `CommanderSlot -> asset leader` path | Armor role commands landed on vehicle `B-12` through vehicle assignment / `manualOrder`. | PASS |
| Command metadata visible | `commandState`, `commandSource`, `commandReason`, `commandLockUntil`, and `commanderSlotId` were visible through squad / vehicle state and observatory data. | PASS |
| Lock window maintained | Commands stayed visible through the sampled 1-3 second lock windows. | PASS |
| Duplicate application prevented | A repeated command with the same id was rejected with `duplicate-command`. | PASS |
| Cancel clears state | `cancel` immediately cleared the player command to `idle` / `bot` / lock `0`, with no `manualOrder` or squad order left. | PASS |
| Expiry observable | A `move` lock reached `0` after roughly 1.75s while command state remained inspectable. | PASS |

Note: after cancel, normal bot logic can later assign a new default order. That is expected local AI behavior and was not treated as a cancel failure.

## Stopped State And Vehicle Evidence

| Check | Evidence | Result |
| --- | --- | --- |
| Stopped / held command states visible | `hold`, `cover`, `repair`, `scout`, and `advance` were visible through squad / vehicle state and observatory snapshots. | PASS |
| Vehicle spawn overlap | Sampled blue vehicle count was 6 with `overlapPairs: []`. | PASS |
| Front-vehicle waiting | Forced traffic-hold scene put `RAVEN` behind `B-12`; observatory showed `trafficHoldTimer` and `trafficHoldTarget: B-12`. | PASS |
| Narrow / blocked waiting visibility | Forced wait scene reported `traffic waiting` through observatory issue labels. | PASS |
| Stuck logging | Forced stuck diagnostic on `RAVEN` produced stuck time and observatory issue output. | PASS |
| Collision-radius sanity | No sampled vehicle overlap was found; deeper vehicle-vs-infantry pushing QA remains a later traffic/physics pass, not a blocker for online command sync. | PASS with follow-up |

Primary screenshot:

- `C:\Users\rneet\Documents\Codex\2026-05-22\codex-threads-019e4849-e426-7b73-826f\offline-command-stability-gate-20260522.png`

## Direct Fixes Made During This Gate

- `CommandBus` now tracks accepted command ids and rejects duplicate application.
- `CommandBus` clears squad order state through `assignOrder(null)` on cancel so `commandState` and lock state reset immediately.
- Vehicle orders carry `commandLockUntil`, `lastCommandChangedAt`, and `manualOrder.commandLockUntil`.
- `AIObservatory` exposes vehicle traffic wait diagnostics: `trafficHoldTimer`, `trafficHoldTarget`, `trafficHoldAge`, and `traffic waiting`.

## Remaining Follow-Ups

These do not block online command synchronization, but they should remain visible:

- Natural-map vehicle/infantry pushing was not exhaustively reproduced; only sampled overlap and forced traffic/stuck diagnostics were checked.
- The next online pass must verify that online command packets keep the same semantic fields and do not reintroduce duplicate or stale command application.
- The next online pass must not expand into FPS combat, `BotCommander`, AI V2, 50vs50, UGC, city work, or server-authority combat.

## Gate Decision

PASS: online command synchronization, first pass may begin.

Do not skip the next gate after online synchronization. After online command sync is implemented, run the online commander-order stability gate before starting the human FPS combat loop.
