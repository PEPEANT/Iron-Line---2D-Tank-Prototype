# Online Combat Server-Authority First-Pass Scope Lock - 2026-05-22

Decision: APPROVED. Start only the first human-combat server-authority implementation pass.

## Purpose

Lock exactly what the first server-authority pass will and will not do.

The previous transition review approved partial server authority. This report narrows that into an implementation boundary: human player combat outcomes move toward server confirmation first, while AI/world simulation stays on the existing world-host / snapshot model.

This is a scope-lock report, not implementation.

## First-Pass Server-Authority Targets

The first implementation pass may cover:

- `player_state` timestamp / sequence handling.
- `player_shot` request submission.
- `server_hit_confirm`.
- `server_death_confirm`.
- `server_respawn_confirm`.
- `server_round_confirm`.
- Score / kill-log result confirmation tied to server-confirmed death events.

The first pass should preserve current local responsiveness by keeping client prediction and visual feedback.

## Server Confirms

The server should become the final source of truth for:

- Whether a submitted shot / hit claim is accepted.
- Confirmed damage amount.
- Confirmed target health before / after.
- Confirmed death state.
- Confirmed killer / victim / damage cause.
- Kill-log entry source.
- Respawn state, position, health, and new sequence.
- Round phase, round winner, match winner, and result reason.

Client-side hit feedback can remain temporary, but health / death / score / round outcome must converge to server-confirmed events.

## Client Keeps

The client keeps:

- Input.
- Local movement prediction.
- Camera movement and camera shake.
- Muzzle flash, tracers, impact visuals, sound, and temporary hit feedback.
- HUD and UI rendering.
- Local command UI.
- Local command preview / marker display.
- Immediate readability feedback while waiting for server confirm.

Client feedback should be marked as provisional when needed. Server confirm or reject should reconcile the final state.

## Not Server-Authoritative Yet

The first pass must not move these systems to server authority:

- Large AI simulation.
- BotCommander decisions.
- Tactical Map / Cover Node / Staging Point / Vehicle Hint calculation.
- 50vs50 event battlefield simulation.
- Full vehicle AI judgment.
- Full drone AI judgment.
- Full projectile / vehicle / tank simulation for all actors.
- UGC, city/open-world, rank, matchmaking, or broad anti-cheat systems.

AI remains world-host / snapshot based until human combat authority is stable.

## Packet Design

### `player_state`

Purpose: update server with current player state and sequence.

Required fields:

- `roomId`
- `playerId`
- `stateSeq`
- `timestamp`
- `x`
- `y`
- `angle`
- `aimX`
- `aimY`
- `movementState`
- `weaponId`
- `hp`
- `maxHp`
- `alive`
- `deathState`

Optional mounted / drone fields:

- `inVehicle`
- `vehicleId`
- `vehicleType`
- `vehicleHp`
- `vehicleMaxHp`
- `turretAngle`
- `machineGunAngle`
- `droneId`
- `droneType`
- `droneX`
- `droneY`
- `droneAngle`
- `droneControlled`

### `player_shot`

Purpose: client asks the server to evaluate or register a shot.

Required fields:

- `roomId`
- `playerId`
- `shotId`
- `stateSeq`
- `timestamp`
- `weaponId`
- `originX`
- `originY`
- `aimX`
- `aimY`
- `angle`
- `ammoBefore`
- `ammoAfter`

Optional fields:

- `projectileId`
- `targetPlayerId`
- `targetStateSeq`
- `hitX`
- `hitY`
- `clientHitClaim`
- `clientDamageClaim`

### `server_hit_confirm`

Purpose: server confirms or rejects a hit.

Required fields:

- `roomId`
- `serverSeq`
- `shotId`
- `hitId`
- `accepted`
- `reason`
- `shooterId`
- `targetPlayerId`
- `weaponId`
- `damage`
- `targetHealthBefore`
- `targetHealthAfter`
- `targetStateSeq`
- `confirmedAt`

Common reject reasons:

- `duplicate-shot`
- `duplicate-hit`
- `stale-state`
- `shooter-dead`
- `target-dead`
- `invalid-room`
- `invalid-target`
- `invalid-weapon`
- `shot-too-old`
- `out-of-range`

### `server_death_confirm`

Purpose: server confirms the final death event and kill-log source.

Required fields:

- `roomId`
- `serverSeq`
- `deathId`
- `hitId`
- `shotId`
- `killerId`
- `targetPlayerId`
- `damageCause`
- `targetStateSeq`
- `confirmedAt`
- `killLogText`

### `server_respawn_confirm`

Purpose: server confirms a respawn and invalidates pre-respawn stale hits.

Required fields:

- `roomId`
- `serverSeq`
- `respawnId`
- `playerId`
- `stateSeq`
- `x`
- `y`
- `hp`
- `maxHp`
- `alive`
- `deathState`
- `invulnerableUntil`
- `confirmedAt`

### `server_round_confirm`

Purpose: server confirms round / match state.

Required fields:

- `roomId`
- `serverSeq`
- `roundSeq`
- `phase`
- `blueScore`
- `redScore`
- `winner`
- `reason`
- `startedAt`
- `endedAt`
- `confirmedAt`

## Delay / Duplicate / Order Rules

Use both client sequence and server sequence.

- Ignore stale `player_state` if its `stateSeq` is lower than the last accepted state for that player.
- Ignore or reject duplicate `shotId`.
- Ignore or reject duplicate `hitId`.
- Ignore or reject duplicate `deathId`.
- Ignore or reject duplicate `respawnId`.
- Do not let old hit confirms apply to a player after a newer `server_respawn_confirm`.
- Do not let late death confirms overwrite a newer respawn state.
- Do not let late respawn confirms revive a player after a newer confirmed death unless the `stateSeq` is newer.
- Server-confirmed events should carry `serverSeq` so clients can apply them in deterministic order.

Current `stateSeq`, `hitId`, `deathId`, and `respawnId` guards remain useful and should be reused rather than replaced wholesale.

## Risk / Mitigation

Risk: input delay.

- Mitigation: keep client prediction, local fire effects, sound, tracers, and temporary hit feedback.

Risk: players dislike rejected hits.

- Mitigation: first pass can validate conservative basics before strict raycast. Add debug traces for reject reason.

Risk: server load grows.

- Mitigation: confirm compact events, not every visual detail. Keep AI/world snapshots separate.

Risk: client prediction conflicts with server result.

- Mitigation: make health/death/score final only on server confirm. Temporary feedback should be reconciled.

Risk: host / spectator state differs.

- Mitigation: observer/admin views should read server-confirmed combat summaries for player combat outcomes.

Risk: round state diverges.

- Mitigation: `server_round_confirm` must own phase, winner, score, and reason.

## Implementation Guardrails

- Do not rewrite the whole online layer.
- Do not move AI simulation to the server.
- Do not move BotCommander or Tactical Map to the server.
- Do not start rank, matchmaking, broad anti-cheat, UGC, or city systems.
- Keep existing online command synchronization intact.
- Keep FPS + command integration intact.
- Keep client visuals responsive.

## Minimum Smoke Coverage For Implementation

The implementation pass should add or update smoke tests for:

- Two players submit state and stale `player_state` is ignored.
- A valid `player_shot` produces one `server_hit_confirm`.
- Duplicate `shotId` / `hitId` does not double-apply damage.
- A lethal hit produces one `server_death_confirm`.
- Kill-log / score increments once from server-confirmed death.
- `server_respawn_confirm` revives the target with a newer `stateSeq`.
- A stale hit arriving after respawn is rejected / ignored.
- A late death confirm cannot override a newer respawn.
- `server_round_confirm` is visible and consistent across room clients.
- Existing online command synchronization still passes.

## Final Decision

APPROVED: online combat server-authority first-pass implementation may start.

The first implementation pass is limited to human combat confirmation: player state sequencing, shot requests, hit confirmation, death confirmation, respawn confirmation, score confirmation, and round confirmation.

It is not approval for full server-authoritative AI, vehicles, drones, 50vs50, world simulation, or a broad networking rewrite.
