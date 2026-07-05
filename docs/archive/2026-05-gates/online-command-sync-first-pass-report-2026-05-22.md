# Online Command Sync First Pass Report - 2026-05-22

Decision: PASS to enter the online commander-order stability gate.

This pass only makes offline-verified commander orders travel through online room state and WebSocket broadcast with the same basic meaning. It does not approve FPS combat-loop work, `BotCommander`, AI V2, 50vs50 expansion, UGC, city/open-world work, or server-authority combat redesign.

## Prerequisite

- Required prerequisite: offline command stability gate PASS.
- Evidence: `docs/offline-command-stability-gate-report-2026-05-22.md`
- Result: satisfied.

## Implemented Scope

### Command Packet Standardization

Online command packets now preserve the first-pass fields:

- `roomId`
- `playerId` / `issuerPlayerId`
- `commanderSlotId` / `slotId`
- `role`
- `controllerType`
- `commandId`
- `commandType`
- `targetSquadId` or `targetAssetId`
- `targetPosition`
- `issuedAt`
- `lockUntil`
- `reason`
- `commandState`

Backward-compatible aliases are kept for existing local code: `id`, `type`, `targetSquadIds`, `targetVehicleIds`, and `targetPoint`.

### Authority And Rejection

Server-side command handling now rejects:

- spectator command attempts.
- missing players or missing slots.
- commands from a player who does not own the commander slot.
- role-command mismatches.
- non-armor commands against vehicle targets.
- armor commands against squad targets.
- invalid target id shapes.
- duplicate `commandId`.
- stale commands older than the latest command for the same commander slot.

### Room State And Broadcast

- Server room state exports `commands`.
- Client room registry normalizes and stores `commands`.
- REST endpoint added: `POST /api/rooms/:roomId/commands`.
- WebSocket `command` messages now produce `command_ack`.
- Accepted WebSocket commands broadcast `command_broadcast` to the room.
- Local online players publish accepted `CommandBus` orders to the room.
- Remote online commands are applied back into local `CommandBus` with cooldown bypass so room-accepted commands do not desync on receiving clients.

## Verification

Command-line checks:

- `npm run check`: PASS.
- `node --check` for `server/schemas.js`, `server/room-registry.js`, `server/websocket.js`, `tools/static-server.cjs`, and `tools/check-online-smoke.cjs`: PASS.
- `npm run check:online`: PASS.
- `git diff --check`: only CRLF conversion warnings.

Latest online smoke output:

```text
Online smoke passed: SMOKE-1779429663199, players=2, combat=1, commands=2, ws=hello/join_result/observer_snapshot, wsCommand=ack/broadcast
```

## Smoke Coverage

| Check | Evidence | Result |
| --- | --- | --- |
| 2+ players in a room | Smoke room kept two merged players. | PASS |
| Role selection | `p-blue` owned `blue-infantry`; `p-red` owned `red-armor`. | PASS |
| Authorized infantry command | `blue-infantry` `assault` accepted and stored with `commandState: assault`. | PASS |
| Authorized armor command | `red-armor` `fire_support` accepted and stored with `commandState: cover`. | PASS |
| Unauthorized command rejected | Infantry `fire_support` against a vehicle target rejected. | PASS |
| Duplicate command rejected | Re-posted infantry command id rejected with `duplicate-command`. | PASS |
| Stale command rejected | Older command for the same slot rejected with `stale-command`. | PASS |
| Command state visible | Room `commands` exposed accepted infantry and armor command states. | PASS |
| WebSocket command ack | WS command returned `command_ack` with ok result. | PASS |
| WebSocket broadcast | Second WS client received `command_broadcast`. | PASS |

## Files Changed For This Pass

- `server/schemas.js`
- `server/room-registry.js`
- `server/websocket.js`
- `tools/static-server.cjs`
- `tools/check-online-smoke.cjs`
- `src/main.js`
- `src/systems/command-bus.js`
- `src/systems/room-registry.js`

This pass also builds on the earlier local command fixes in `src/ai/commander-ai.js`, `src/systems/command-radio.js`, `src/systems/ai-observatory.js`, and `src/systems/observer-bridge.js`.

## Limitations

- This is a smoke-tested sync pass, not the final multiplayer stability gate.
- WebSocket command broadcast is verified in a scripted two-client smoke, not a full manual two-browser match.
- Server validation can verify slot/role authority and target type, but it does not yet know the full local AI asset map for every match layout.
- The current model keeps world-host AI simulation. Full server-authority combat remains explicitly out of scope.

## Next Required Gate

Next target: online commander-order stability gate.

Do not start the human FPS combat loop until the online gate verifies real multiplayer command behavior:

- two or more players in the same room.
- each player commands only their own role assets.
- radio log / command marker / `commandState` / `lockUntil` are visible to other clients.
- duplicate and stale command behavior stays stable.
- world-host command application does not diverge between clients.
