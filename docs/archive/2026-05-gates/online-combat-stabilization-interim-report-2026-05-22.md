# Online Combat Stabilization Interim Report - 2026-05-22

Decision: ON TRACK. The first narrow implementation pass added combat-state sequencing, event identity, duplicate protection, stale-hit protection after respawn, and observer-visible combat trace. This is not a completed online combat gate yet.

## 1. Test Environment

- Repo: `pepeant-iron-line-2d-tank-prototype`
- Branch: `main`
- Local server smoke: `tools/static-server.cjs`
- Browser runtime smoke: `tools/check-fps-command-integration.cjs`
- Online smoke: `tools/check-online-smoke.cjs`

Checks run:

- `npm run check`: PASS
- `npm run check:online`: PASS
- `node tools/check-fps-command-integration.cjs`: PASS

## 2. Implemented in This Pass

### Player State Synchronization Fields

Local online presence now publishes:

- `stateSeq`
- `stateUpdatedAt`
- `hp`
- `maxHp`
- `weaponId`
- `movementState`
- `deathState`
- existing position, aim, vehicle, and drone fields

These fields are preserved by room normalization and static-server export.

### Combat Event Identity

Combat events now carry first-pass ordering / dedupe metadata:

- `eventId`
- `sequence`
- `hitId`
- `deathId`
- `respawnId`
- `killerId`
- `damageCause`
- `lethal`
- `targetHealthBefore`
- `targetHealthAfter`
- `targetStateSeq`
- `shooterStateSeq`

Small-arms shots now publish stable shot ids and hit ids. Projectile launch / impact events now also publish sequence and damage-cause metadata.

### Duplicate / Stale Protection

Added first-pass protections:

- Duplicate combat events are collapsed by `id`, `hitId`, `deathId`, or `respawnId`.
- Local clients ignore duplicate hit ids.
- Local clients ignore hit events older than the latest local respawn.
- Death and respawn events are deduped separately from normal shot events.
- Static-server participant imports reject older `updatedAt` or lower `stateSeq` updates.

### Death / Respawn Event Flow

When an online hit kills the local player, the target client now publishes a `player_death` combat event. When conquest respawn happens, the client publishes a `player_respawn` combat event and force-publishes local presence.

Remote clients can apply:

- `player_death`: marks the remote target dead and records kill context.
- `player_respawn`: marks the remote target alive and updates position / health state.

### Debug / Observer Trace

Added `src/systems/online-combat-stabilizer.js` and exposed `onlineCombat` in observer snapshots:

- local player state sequence
- shot sequence
- combat event sequence
- latest respawn timestamp
- recent online combat trace entries

Trace stages currently include receive, shot, hit, death, respawn, projectile launch, and projectile impact.

## 3. Verification Results

| Area | Scenario | Evidence | Result | Notes |
| --- | --- | --- | --- | --- |
| Player state fields | Online smoke preserves `stateSeq`, `hp`, `weaponId` | `npm run check:online` | PASS | Smoke now fails if these fields are lost. |
| Stale player state | Older `updatedAt` / lower `stateSeq` update tries to overwrite blue player | `npm run check:online` | PASS | Stale position did not overwrite newer combat state. |
| Combat event dedupe | Two events with same `hitId` are posted | `npm run check:online` | PASS | Server collapsed duplicate `hitId` to one event. |
| Command sync regression | Existing command packet / permission / WS smoke | `npm run check:online` | PASS | Existing online command smoke remains green. |
| FPS + command regression | Browser runtime fire / command / death smoke | `node tools/check-fps-command-integration.cjs` | PASS | Local combat loop and command coexistence still work. |
| Syntax / health | JS syntax, duplicate methods, code health | `npm run check` | PASS | Only existing hotspot warnings remain. |

## 4. Files Changed

- `index.html`
- `src/systems/online-combat-stabilizer.js`
- `src/systems/session-flow.js`
- `src/systems/room-registry.js`
- `src/systems/observer-bridge.js`
- `src/main.js`
- `tools/static-server.cjs`
- `tools/check-online-smoke.cjs`

## 5. Remaining Risks / Blockers

No blocker was found in the first implementation smoke.

Remaining risks before this can become a PASS gate:

- True two-browser human hit / death / respawn loop still needs direct live verification.
- Current hit confirmation is still host / client-flow based, not full server authority.
- Killer stat consistency is first-pass only and should be verified in live two-client combat.
- Host / world-host departure during active combat is not solved in this pass.
- Round / victory state consistency has not yet received a dedicated repeated two-client test.

## 6. Next Narrow Step

Next task should be:

**Online combat stabilization report-based live validation / narrow fix pass**

Focus:

- Run a true two-client browser scenario where one player shoots, damages, kills, and the other respawns.
- Confirm both clients agree on remote position, aim, shot effect, hit feedback, death state, kill log, damage cause, and respawn.
- If a mismatch appears, fix only the matching stale / duplicate / ordering path.

Do not start:

- Full server-authority combat rewrite.
- Ranked / matchmaking.
- Large anti-cheat.
- UGC / city work.
- 50vs50 default mode.
- AI V2 behavior expansion.
