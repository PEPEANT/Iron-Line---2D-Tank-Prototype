# P0 Team / Damage Full-Path Validation - 2026-05-23

Conclusion: P0-5D is now covered by an API replay + static guard verifier. The verifier is not a manual real-play run, and it does not reopen alpha retest.

## Scope

- Validate actual-team targeting gates before returning to alpha planning.
- Cover blue-player and red-player assumptions around AI target selection, safe zones, small arms, projectiles, explosions, vehicle contact, and kill/death/respawn stats.
- Keep networking, admin separation, AI V3, 50vs50, and WebSocket combat-channel work out of scope.

## Changes

- `server/room-registry.js`: projectile launch/impact packets now pass through `normalizeProjectileCombatEvent()` before append. If a projectile damage claim names a same-team or self target, the server records `accepted: false`, `reason: "same-team"` / `"self-hit"`, `damage: 0`, and uses the server-side shooter team rather than the client claim.
- `src/main.js`: online projectile impact damage now ignores `accepted: false` events and blocks same-team projectile splash against the local player using `localPlayerTeam()`.
- `src/systems/combat.js`: local rifle fire, projectile direct-hit checks, projectile danger warnings, and blast-radius player damage now use actual local-player team checks instead of the old red-vs-blue local-player assumption.
- `tools/check-p0-team-damage-full-path.cjs`: added a dedicated P0-5D verifier using a temp room store so `.data/online-rooms.json` is not polluted.

## Evidence

| Path | Result | Evidence |
| --- | --- | --- |
| Blue player: red AI/player path can be enemy | PASS | Enemy red -> blue small-arms accepted; blue HP 100 -> 78. |
| Red player: blue AI/player path can be enemy | PASS | Static guards require `isLocalPlayerEnemyFor(team)`, not `TEAM.BLUE` local assumption. |
| Red tank/infantry/humvee/drone should not attack red player | PASS | Tank, infantry, humvee, recon/suicide drone target gates reject same team. |
| Blue tank/infantry/humvee/drone should not attack blue player | PASS | Same target gates are team-symmetric. |
| `small_arms` same-team server damage | PASS | Same-team red -> red event returns `accepted:false`, `reason:"same-team"`, `damage:0`; target HP and stats unchanged. |
| `projectile_launch` same-team damage claim | PASS | Server event returns `accepted:false`, `reason:"same-team"`, `damage:0`. |
| `projectile_impact` same-team/self damage | PASS | Same-team and self projectile impacts return rejection metadata and do not mutate target HP. |
| Explosion / RPG / grenade / shell player damage | PASS | Local combat player damage now uses `game.isLocalPlayerEnemyFor?.(team)` for direct and radius paths. |
| Vehicle collision/contact damage | PASS | `applyVehicleContactDamage()` keeps the existing same-team guard. |
| Safe zone team basis | PASS | Session spawn/safe-zone placement and `isPlayerInSafeZone(team)` use the actual player team. |
| Kill/death/respawn pollution | PASS | Same-team hit/death attempts did not add red kills or red-support deaths; valid lethal hit adds exactly one kill/death and respawn restores HP. |

## Verification Commands

- `node --check server/room-registry.js`
- `node --check src/systems/combat.js`
- `node --check src/main.js`
- `node --check tools/check-p0-team-damage-full-path.cjs`
- `node tools/check-p0-team-damage-full-path.cjs`
- `node tools/check-online-combat-server-authority.cjs`
- `node tools/check-online-combat-client-flow.cjs`
- `node tools/check-alpha-p0-stabilization.cjs`
- `npm run check`
- `git diff --check`

## Latest P0-5D Verifier Result

```json
{
  "ok": true,
  "mode": "API replay + static full-path guards",
  "realPlay": false,
  "checks": {
    "aiTargetingUsesActualTeam": "pass",
    "safeZoneUsesActualPlayerTeam": "pass",
    "smallArmsSameTeamServerReject": "pass",
    "projectileLaunchSameTeamReject": "pass",
    "projectileImpactSameTeamReject": "pass",
    "localExplosionUsesActualPlayerTeam": "pass",
    "onlineProjectileClientRejectsSameTeam": "pass",
    "vehicleContactSameTeamGuard": "pass",
    "killDeathRespawnStatsUnpolluted": "pass"
  }
}
```

## Decision

Limited alpha retest remains on hold. This pass closes the automated team/damage full-path safety check, but it is not a manual real-play alpha gate by itself.

Next recommended branch: P0-6 limited pre-alpha gate checklist. Keep it validation-only first: rerun P0-4 real-browser scenarios after P0-5D, confirm active-room detail payload is the remaining measured bottleneck, then decide whether to run a tiny 2-player manual sanity pass before any 4-player retest language returns.
