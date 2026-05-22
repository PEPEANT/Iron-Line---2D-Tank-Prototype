# Online Combat Stabilization First Pass Plan - 2026-05-22

Decision: start the next season with online combat stabilization, but keep the first pass narrow. This is not a full server-authority combat rewrite.

## Purpose

Make human-vs-human online combat trustworthy enough for repeated playtests:

- Players see each other move.
- Players see each other aim.
- Players see each other shoot.
- Hits, deaths, kill logs, respawns, and round state do not split across clients.

This pass starts from the current online room / world-host / command-sync structure and stabilizes the human combat flow inside it.

## Preconditions

- Roadmap / next-season priority report is complete.
- Online command synchronization is PASS.
- FPS combat loop is PASS locally / first-pass.
- FPS + command integration is PASS.
- 25vs25 remains the normal staged AI scale ceiling.
- 50vs50 remains event-only and is not part of this pass.

## Core Scope

### 1. Player State Synchronization

Track and verify these fields for human players:

- Position.
- Movement state.
- Aim direction.
- Current weapon.
- Health.
- Alive / down / dead / respawning state.
- Last accepted state sequence or timestamp.

Required behavior:

- Remote clients should not apply older player-state packets over newer ones.
- Remote player markers / sprites should remain readable and not jitter into impossible states.
- Health / alive state should match combat events.

### 2. Shooting Event Synchronization

Track and verify:

- Fire start / fire event.
- Fire stop if the weapon uses continuous fire.
- Ammo decrease.
- Reload start / finish.
- Fire direction.
- Weapon id / class.
- Muzzle / tracer / shot effect on remote clients.
- Shot sequence or event id.

Required behavior:

- Other clients can see that a player fired.
- Duplicate shot events do not create duplicate damage.
- Late shot events do not revive old combat state.

### 3. Hit / Kill Confirmation

Track and verify:

- Hit claim or hit event id.
- Attacker id.
- Target id.
- Weapon id.
- Damage amount.
- Damage cause.
- Hit direction.
- Target health before / after if available.
- Death state.
- Killer id.
- Kill log entry id.

Required behavior:

- Duplicate hit events are ignored.
- Death is confirmed once.
- Kill log and death cause match across clients.
- Hit feedback and damage direction are visible.

### 4. Respawn / Round Flow

Track and verify:

- Death timestamp.
- Respawn eligibility.
- Respawn position.
- Invulnerability window if used.
- Round state.
- Victory / defeat state.

Required behavior:

- A dead player should not keep sending valid combat commands.
- A respawned player should not be overwritten by late death packets.
- Round end and victory state should not split across clients.

### 5. Delay / Duplicate / Ordering Rules

Add or verify minimum ordering fields:

- `sequence`, `eventId`, or timestamp for player state.
- Combat event id for shots / hits / deaths.
- Latest accepted state per player.
- Duplicate event cache for combat events.

Required behavior:

- Old position packets are ignored.
- Duplicate fire / hit / death events are ignored.
- Late respawn / death events are compared before application.

### 6. Host / World-Host Role

First-pass rule:

- Do not redesign full server authority.
- Keep the current host / room model unless a blocker proves it is insufficient.
- Use one clear source of truth for important results where the current architecture allows it.
- Record what happens if the world host leaves during combat.

If the first pass proves host-flow combat cannot stabilize hit / death consistency, record that as the reason to design a later limited server-authority hit-confirmation layer.

## Recommended Implementation Order

1. Audit current online combat paths.
   - Player state publish / receive.
   - Fire event publish / receive.
   - Hit / death / kill-log flow.
   - Respawn / round state flow.
   - WebSocket and REST room paths.

2. Add combat trace visibility.
   - Do this before changing core combat behavior.
   - Each event should be inspectable in logs / debug / observer state.

3. Stabilize player state ordering.
   - Drop stale state.
   - Track latest accepted sequence / timestamp per player.

4. Stabilize shot / hit / death event dedupe.
   - Keep event ids.
   - Prevent repeated damage / repeated death / repeated kill-log entries.

5. Stabilize respawn / round-state ordering.
   - Protect respawn from stale death events.
   - Protect round end from divergent local decisions.

6. Extend online smoke / manual tests.
   - Repeated two-client movement.
   - Repeated two-client fire.
   - Hit / death / respawn.
   - Duplicate / stale event checks.
   - Host / world-host departure observation if feasible.

## Allowed Changes

- Online combat logging / trace fields.
- Player-state sequence / timestamp checks.
- Combat event ids and duplicate caches.
- Hit / death / kill-log consistency fixes.
- Respawn / round-state ordering fixes.
- Online smoke test extensions.
- Minimal UI/debug visibility needed to prove behavior.

## Not Allowed

- Full server-authority combat rewrite.
- Ranked matchmaking.
- Large anti-cheat system.
- Large weapon / loadout rebalance.
- BotCommander doctrine expansion.
- AI V2 behavior overhaul.
- UGC / city / open-world expansion.
- 50vs50 default mode.

## First-Pass Evidence Table

Use this shape for the first stabilization report:

| Area | Scenario | Evidence | Result | Notes |
| --- | --- | --- | --- | --- |
| Position | Two clients move at once | latest state / remote marker | pass / fail | stale packet behavior |
| Aim | Client A rotates aim | remote aim direction | pass / fail | sequence or timestamp |
| Fire | Client A fires | remote muzzle / tracer / ammo event | pass / fail | duplicate fire check |
| Hit | Client A hits Client B | damage / hit id / feedback | pass / fail | duplicate hit check |
| Death | Client B dies | death state / kill log / cause | pass / fail | one death only |
| Respawn | Client B respawns | state / position / invulnerability | pass / fail | stale death ignored |
| Round | Win condition fires | room round state | pass / fail | clients agree |
| Host | Host leaves if tested | handoff / blocker | pass / fail | record only if not fixed |

## Completion Criteria

PASS:

- Two or more clients can repeatedly move, aim, fire, hit, die, respawn, and keep kill / round state consistent under current smoke/manual conditions.
- Duplicate and stale events are visibly handled.
- No full server-authority rewrite was introduced.

PARTIAL:

- Movement / aim / fire sync works, but hit / death / respawn consistency needs another narrow pass.

BLOCKED:

- Combat state regularly splits across clients.
- Duplicate or stale events still create repeated damage, wrong death state, or wrong kill logs.
- Host/world-host flow makes basic combat consistency impossible without a new authority design.

## Next Output

After implementation begins, produce:

- `online-combat-stabilization-interim-report-2026-05-22.md`

That interim report should decide whether to continue narrow fixes, record blockers, or design a limited authority layer later.
