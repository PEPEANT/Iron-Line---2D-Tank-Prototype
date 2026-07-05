# Online Combat Server-Authority Transition Review - 2026-05-22

Decision: APPROVED for a partial server-authority first pass. Do not start a full server-authority rewrite yet.

## Purpose

Review the current online human combat flow and decide which parts should move from client / host event authority to server confirmation first.

The goal is not to move AI, BotCommander, Tactical Map, or the whole world simulation to the server. The first authority step should make human-vs-human combat outcomes harder to diverge: hit, death, respawn, kill, score, and round state.

## Current Structure

Current online combat is stabilized but not server-authoritative.

- `src/systems/session-flow.js` publishes local player state with position, aim, weapon, health, death state, vehicle state, drone state, and `stateSeq`.
- `src/systems/room-registry.js` normalizes player position data and rejects stale player updates by `stateSeq` / timestamps.
- `src/main.js` publishes local combat events for small arms, projectile launch, projectile impact, player death, and player respawn.
- `src/systems/room-registry.js` stores combat events and dedupes by `hitId`, `deathId`, and `respawnId`.
- `src/systems/online-combat-stabilizer.js` provides local sequence ids, duplicate guards, stale-after-respawn rejection, health snapshots, and trace records.
- `tools/static-server.cjs` mirrors room data, participant state, world state, command records, and combat events through the local REST flow.
- `tools/check-online-combat-stabilization.cjs` verifies player state preservation, stale position rejection, and hit / death / respawn dedupe at the room API level.
- `tools/check-online-combat-client-flow.cjs` verifies local browser application of remote hit / death / respawn events, duplicate protection, and stale-hit protection after respawn.

This means the project currently has a useful event-stabilized combat layer. It is a good base, but the server still mostly accepts and merges combat events that clients produce.

## Server Authority Needed First

These areas should become server-confirmed before competitive online combat is treated as reliable:

- `hit_confirm`: server confirms whether a hit claim is accepted.
- `death_confirm`: server confirms lethal state, killer, victim, cause, and death sequence.
- `respawn_confirm`: server confirms respawn id, location, health, invulnerability window if used, and new state sequence.
- `score_state`: server confirms kill/death score deltas.
- `round_state`: server confirms round phase, round winner, match winner, and end timestamp.
- Duplicate / late event rejection: server owns final replay-safe ids and sequence order for hit, death, respawn, score, and round events.

## Keep Existing for Now

These should not move to full server authority in the first pass:

- Large AI simulation.
- BotCommander decisions.
- Tactical Map / Cover Node generation.
- Vehicle traffic hints and AI wait logic.
- Client-side prediction, muzzle flash, tracers, camera shake, sound, and HUD feedback.
- Command UI and local command preview.
- Observer / admin summaries, except for reading server-confirmed combat summaries.

AI should stay under the existing world-host / snapshot model until human combat authority is stable.

## Transition Options

### A. Partial Server Authority - Recommended

Server confirms human combat outcomes while clients keep prediction and immediate effects.

Recommended first pass:

- Standardize `player_state`.
- Standardize `shot_request`.
- Add `hit_claim`.
- Add `hit_confirm`.
- Add `death_confirm`.
- Add `respawn_request` / `respawn_confirm`.
- Add `round_state`.
- Keep AI world state on current world-host / snapshot flow.

Why: it attacks the biggest online FPS risk without moving the whole simulation.

### B. Host Authority Hardening - Not Enough Alone

The world host could make more combat decisions and the server could rebroadcast them.

Why not enough: host lag, host departure, and host trust still make human combat outcomes unstable for a real online FPS.

This can remain a fallback for AI/world simulation, not the target for player combat.

### C. Full Server Authority - Too Large Now

Server owns player movement, shooting, hit detection, death, respawn, AI simulation, vehicles, drones, and round state.

Why not now: it would collide with the current AI/world-host stack, add significant server CPU cost, and risk delaying playability.

## Recommended First-Pass Packet Contract

The next design task should lock these packet shapes before implementation.

`player_state`

- `roomId`
- `playerId`
- `stateSeq`
- `sentAt`
- `x`, `y`
- `angle`
- `aimX`, `aimY`
- `movementState`
- `weaponId`
- `hp`, `maxHp`
- `alive`, `deathState`
- vehicle/drone summary fields when mounted or controlling

`shot_request`

- `roomId`
- `playerId`
- `shotId`
- `stateSeq`
- `weaponId`
- `origin`
- `aim`
- `firedAt`
- `clientAmmoState`
- optional `projectileId`

`hit_claim`

- `roomId`
- `shotId`
- `hitId`
- `shooterId`
- `targetPlayerId`
- `targetStateSeq`
- `weaponId`
- `hitX`, `hitY`
- `damageClaim`
- `claimedAt`

`hit_confirm`

- `roomId`
- `hitId`
- `shotId`
- `accepted`
- `reason`
- `damage`
- `targetHealthBefore`
- `targetHealthAfter`
- `targetStateSeq`
- `serverSeq`
- `confirmedAt`

`death_confirm`

- `roomId`
- `deathId`
- `hitId`
- `killerId`
- `targetPlayerId`
- `damageCause`
- `targetStateSeq`
- `serverSeq`
- `confirmedAt`

`respawn_confirm`

- `roomId`
- `respawnId`
- `playerId`
- `stateSeq`
- `x`, `y`
- `hp`
- `invulnerableUntil`
- `serverSeq`
- `confirmedAt`

`round_state`

- `roomId`
- `roundSeq`
- `phase`
- `blueScore`
- `redScore`
- `winner`
- `reason`
- `serverSeq`
- `updatedAt`

## Minimum Server Validation

First pass validation can stay conservative:

- Room exists and player belongs to the room.
- Shooter and target are in valid teams and are alive at the relevant sequence.
- `shotId`, `hitId`, `deathId`, and `respawnId` are not duplicates.
- Incoming `stateSeq` is not older than the last accepted state beyond an allowed grace window.
- Weapon id is known and belongs to the current player loadout state.
- Shot age is within a short server window.
- Damage is clamped by weapon server-side values.
- Respawn cannot happen twice for the same death state.
- Death cannot apply twice to the same player state sequence.

Line-of-sight / raycast validation can be phased:

- First pass: basic range, target state, duplicate, and damage validation.
- Second pass: server-side ray / obstacle validation for small arms.
- Later: projectile reconciliation and stricter vehicle hit validation.

## Risks

- Added latency can make shooting feel worse if clients wait for all feedback.
- Existing client-side hit feedback can conflict with server rejection.
- Duplicated score changes can return if client death events and server death confirms both count kills.
- Respawn can become fragile if old hit events are not tied to server-confirmed state sequences.
- Server payloads can grow if every detailed combat event is broadcast instead of compact confirms.
- Host departure remains a world-state issue even if human combat outcomes move to the server.

## Guardrails

- Keep client prediction and visual-only effects.
- Make server confirms authoritative for health, death, respawn, score, and round state.
- Do not move AI simulation to the server in this pass.
- Do not redesign matchmaking, rank, anti-cheat, UGC, or city/open-world systems in this pass.
- Preserve existing command synchronization and `CommanderSlot -> SquadLeader -> Unit` flow.
- Preserve BotCommander skeleton and AI V2 behavior connection.

## Recommended Next Work

Next target: `Online combat server-authority first-pass packet contract and smoke plan`.

That task should:

1. Define final packet schemas for state, shot request, hit claim, hit confirm, death confirm, respawn confirm, and round state.
2. Decide which existing client events remain visual-only versus server-confirmed.
3. Add smoke scenarios for duplicate hit confirm, rejected stale hit claim, server death confirm, respawn confirm, and score / round consistency.
4. Avoid full implementation until the packet contract is approved.

## Final Decision

APPROVED: move toward partial server authority for human combat.

Do not implement full server-authoritative AI/world simulation yet. The first real server authority should cover human shot / hit / death / respawn / score / round confirmation while the AI war layer remains under the existing world-host / snapshot architecture.
