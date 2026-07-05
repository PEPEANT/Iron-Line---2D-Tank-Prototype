# Online Command Sync Interim Verification Report - 2026-05-22

Current judgment: ON TRACK.

This is an interim checkpoint, not a completion gate. It records what is already visible in automated online smoke and what still needs multiplayer/manual confirmation before the online commander-order stability gate can pass.

## Test Environment

- Server URL: local static server started by `tools/check-online-smoke.cjs`.
- Smoke base URL: `http://127.0.0.1:4191`.
- WebSocket URL: `ws://127.0.0.1:4191/ws`.
- Latest smoke room id: `SMOKE-1779429912924`.
- Connected clients:
  - REST room state: 2 players.
  - WebSocket command smoke: 2 clients in `SMOKE-1779429912924-WS-CMD`.
- Roles used:
  - `p-blue`: `blue-infantry`.
  - `p-red`: `red-armor`.
  - WebSocket sender: `ws-blue` assigned to `blue-infantry`.
- Test / log locations:
  - `tools/check-online-smoke.cjs`
  - REST `/api/rooms`
  - REST `POST /api/rooms/:roomId/commands`
  - WebSocket `command_ack`
  - WebSocket `command_broadcast`
  - exported room `commands`

Latest evidence:

```text
Online smoke passed: SMOKE-1779429912924, players=2, combat=1, commands=2, ws=hello/join_result/observer_snapshot, wsCommand=ack/broadcast
```

## Command Packet Check

The smoke verifies accepted command packets keep the required first-pass fields.

| Field | Evidence | Result |
| --- | --- | --- |
| `roomId` | REST command endpoint stores packet under smoke room id. | pass |
| `playerId` | `p-blue`, `p-red`, and `ws-blue` are used as command issuers. | pass |
| `commanderSlotId` | `blue-infantry` and `red-armor` are included in accepted packets. | pass |
| `role` | `infantry` and `armor` are included and validated against slot role. | pass |
| `controllerType` | `human` is included in smoke command packets. | pass |
| `commandId` | Accepted command ids are stored and duplicate id is rejected. | pass |
| `commandType` | `assault` and `fire_support` are accepted; invalid role/type combinations are rejected. | pass |
| `targetSquadId` / `targetAssetId` | Infantry targets `B-SQD-3`; armor targets `R-12`; infantry vehicle target is rejected. | pass |
| `targetPosition` | Command smoke posts coordinate targets and stores normalized target position. | pass |
| `issuedAt` | Commands use numeric issue times; stale issue time is rejected. | pass |
| `lockUntil` | Accepted commands preserve lock window values. | pass |
| `reason` | Commands preserve reason equal to command intent, such as `assault` or `fire_support`. | pass |
| `commandState` | `assault` maps to `assault`; `fire_support` maps to `cover`. | pass |

## Permission Check

| Case | Evidence | Result |
| --- | --- | --- |
| Authorized infantry command | `p-blue` / `blue-infantry` / `assault` accepted and exported in room `commands`. | pass |
| Authorized armor command | `p-red` / `red-armor` / `fire_support` accepted and exported in room `commands`. | pass |
| Unauthorized role command | `blue-infantry` attempting `fire_support` against vehicle target rejected. | pass |
| Bad target type for role | Infantry command against vehicle target rejected before storage. | pass |
| Duplicate id | Re-posting the accepted infantry `commandId` rejected with `duplicate-command`. | pass |
| Stale command | Older command for same slot rejected with `stale-command`. | pass |

Current limitation:

- Server validation checks slot ownership, role/type compatibility, and target id shape. It does not yet validate every match-specific AI asset id against the live local AI asset map. That belongs in the online stability gate or a later server-authority design, not this first pass.

## Broadcast Check

| Item | Issuing client | Other client | Result |
| --- | --- | --- | --- |
| Command ack | WebSocket sender receives `command_ack` with ok result. | N/A | pass |
| Broadcast packet | Sender posts WebSocket `command`. | Second WebSocket client receives `command_broadcast`. | pass |
| `commandState` | Accepted REST command exposes `commandState` in room `commands`. | Broadcast packet carries the same command packet. | pass |
| `lockUntil` | Accepted command stores `lockUntil`. | Broadcast packet carries `lockUntil`. | pass |
| Radio log / command marker UI | Not verified by this automated smoke. | Not verified by this automated smoke. | open for online commander-order stability gate |

Interpretation:

- Packet-level broadcast works.
- Room-state visibility works.
- UI-level visibility across two real browser clients is not proven by this interim report and must be closed in the next gate.

## Duplicate And Delay Handling

| Check | Evidence | Result |
| --- | --- | --- |
| Same `commandId` duplicate apply prevention | Duplicate REST command rejected with `duplicate-command`. | pass |
| Old command overwriting newer command | Older command for same slot rejected with `stale-command`. | pass |
| Command cancel / expiry | Local/offline cancel and expiry were verified in the offline gate. Online cancel/expiry is not separately manual-verified yet. | open for online commander-order stability gate |

## Current Issues

No direct smoke blocker was found.

Open verification items before leaving the online gate:

- Confirm radio log and command marker in two real browser clients.
- Confirm remote client applies room command to local `CommandBus` and exposes AI `commandState` / `lockUntil` in UI/debug, not only room state.
- Confirm online `cancel` and natural expiry behavior across clients.
- Confirm world-host command application does not diverge during a live match.

## Current Judgment

ON TRACK: continue toward the online commander-order stability gate.

Required next action:

1. Do a report-based narrow fix pass only if the open UI/manual items reveal a direct bug.
2. Then run the online commander-order stability gate.
3. Do not start FPS combat loop, `BotCommander`, AI V2, 50vs50, UGC, city/open-world work, or server-authority combat redesign from this interim checkpoint.
