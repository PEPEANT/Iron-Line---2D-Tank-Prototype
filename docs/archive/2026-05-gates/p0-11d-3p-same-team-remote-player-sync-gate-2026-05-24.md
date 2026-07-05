# P0-11D 3P Same-Team Remote Player Sync Gate

Conclusion: P0-11C is a partial live PASS with a large improvement, but the P0 lane is not closed. The next manual failure signal is 3P+ same-team remote position sync, so P0-11D adds a no-gameplay-fix gate for that path.

## Manual P0-11C 3P Signal

- Red-side player position finally had visible consistency.
- Overall live feel was greatly improved.
- Red-side AI/state wobble also improved.
- This confirms duplicate `playerId` / session identity collision was one real root cause.
- The issue was not purely AI behavior; player/session/world state identity contamination made AI and remote state look worse.

## Remaining Symptoms

- 3P testing still reported same-team player position not syncing correctly.
- Player-to-player stutter remains in some cases.
- Some AI stutter remains.
- A 2P blue/red automated PASS is not sufficient for 3P+ player-only confidence.

## P0-11D Probe

`node tools/check-p0-11d-3p-same-team-sync.cjs`

The probe checks two layers:

1. Raw WebSocket `player_state` relay with two blue players and one red player.
2. Browser client apply/render path for the same composition:
   - `applyRemotePlayerState`
   - `remotePlayerStateBuffer`
   - `onlineSession.players`
   - `renderer.remoteHumanPlayers`

## Latest Automated Result

Decision: `no_high_risk_reproduced`

Raw 3P WS relay:

- blue-1 received blue-2 same-team packets: 8
- blue-2 received blue-1 same-team packets: 8
- red-1 received both blue players: 8 / 8
- team and slot metadata were preserved for all remote players.

Browser 3P apply/render:

- all three runtime `playerId` values were unique.
- all three `slotId` values were unique.
- each client had two remote players in `session.players`.
- same-team blue remote was accepted by `applyRemotePlayerState`.
- same-team blue remote existed in `remotePlayerStateBuffer`.
- same-team blue remote appeared in `remoteHumanPlayers`.
- render delta for every remote was `0px`.
- self-ignored packets: `0`.
- stale rejects: `0`.
- page errors: `0`.

## Current Classification

The basic same-team remote player apply/render path does not reproduce the manual failure in this automated gate.

Lower-priority candidates after this run:

- same-team filtering inside `renderer.remoteHumanPlayers`
- `remotePlayerStateBuffer` only keeping one remote player
- same-team packets being rejected as self
- slot/team metadata disappearing during direct apply/render

Still plausible candidates:

- live user-flow room refresh or participant merge differs from the synthetic apply/render gate.
- 3P same-origin/localStorage/session setup during manual play may still create an identity or slot collision not covered by this probe.
- the failure may be timing/cadence related rather than a static same-team render filter.
- minimap and field rendering may diverge during real movement.

## Next Minimum Recommendation

Do not start a gameplay fix from this result alone.

Recommended next gate: P0-11E live 3P user-flow instrumentation.

Scope:

- launch or guide a real 3P player-only flow instead of injecting remote state directly.
- record each tab's `playerId`, `slotId`, team, `session.players`, received `player_state`, applied state, render entry, minimap entry, and room refresh merge result.
- focus on the exact reported case: same-team player location visible to another same-team player.
- keep AI, worldState, combat, admin/observer, WS redesign, and server-authoritative work out of scope.

Stop before any P0-11E implementation unless the next step is explicitly approved.
