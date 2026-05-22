# Online Command Sync Fix Pass Report - 2026-05-22

Decision: ON TRACK. Proceed to the online commander-order stability gate.

This report covers the narrow fix pass after `docs/online-command-sync-interim-verification-report-2026-05-22.md`. It fixes only issues directly related to packet correctness, target validation, and cancel visibility. It does not start FPS combat, `BotCommander`, AI V2, 50vs50, UGC, city/open-world work, or server-authority combat.

## Fix Scope

The interim report did not show a hard smoke blocker, but it exposed two narrow gaps worth fixing before the next gate:

- wrong-team target ids could pass server shape validation if the id format looked valid.
- online `cancel` packets did not have explicit command-state coverage in smoke.

## Changes Made

| Area | Change | Result |
| --- | --- | --- |
| Packet state | `cancel` now maps to `commandState: cancel` in server packet schema, local `CommandBus`, and client room command normalization. | fixed |
| Online command payload | local online command publishing now includes `commandState`. | fixed |
| Server target validation | server command validation now rejects team-bound target ids whose `B-` / `R-` prefix does not match the commander's slot team. | fixed |
| Online smoke | smoke now checks wrong-team squad target rejection and accepted online `cancel` state. | fixed |

## Updated Pass/Fail Table

| Check | Evidence | Result |
| --- | --- | --- |
| Required packet fields preserved | accepted REST commands still include room/player/slot/role/type/target/issuedAt/lockUntil/reason/state. | PASS |
| Authorized infantry command | `p-blue` / `blue-infantry` / `assault` accepted with `commandState: assault`. | PASS |
| Authorized armor command | `p-red` / `red-armor` / `fire_support` accepted with `commandState: cover`. | PASS |
| Unauthorized role command | infantry `fire_support` against vehicle target rejected. | PASS |
| Wrong-team target id | blue infantry command against `R-SQD-3` rejected with `target-team-mismatch`. | PASS |
| Duplicate id | repeated infantry command id rejected with `duplicate-command`. | PASS |
| Stale command | older command for same slot rejected with `stale-command`. | PASS |
| Online cancel state | `blue-infantry` `cancel` accepted and exported with `commandState: cancel`. | PASS |
| WebSocket ack/broadcast | two-client WebSocket smoke still reports `command_ack` and `command_broadcast`. | PASS |

Latest smoke output:

```text
Online smoke passed: SMOKE-1779430192063, players=2, combat=1, commands=3, ws=hello/join_result/observer_snapshot, wsCommand=ack/broadcast
```

## Modified Files In This Fix Pass

- `server/room-registry.js`
- `server/schemas.js`
- `src/main.js`
- `src/systems/command-bus.js`
- `src/systems/room-registry.js`
- `tools/check-online-smoke.cjs`

## Verification Run

- `node --check server/schemas.js`
- `node --check server/room-registry.js`
- `node --check tools/check-online-smoke.cjs`
- `npm run check`
- `npm run check:online`

All passed. `npm run check` still reports existing hotspot warnings only.

## Remaining Blockers

No blocker was found in this narrow fix pass.

Still open for the online commander-order stability gate:

- two-browser/manual radio log visibility.
- command marker visibility on non-issuing clients.
- remote-client `commandState` / `lockUntil` UI or debug confirmation.
- online cancel/expiry behavior in a live browser match, not just REST smoke.
- world-host non-divergence under live match timing.

## Next Action

Proceed to the online commander-order stability gate.

Do not start FPS combat loop, `BotCommander`, AI V2, 50vs50, UGC, city/open-world, or server-authority combat work from this fix pass.
