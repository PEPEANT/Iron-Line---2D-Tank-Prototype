# P0-10H Live Repro Instrumentation Gate

Conclusion: P0-10H is a no-fix instrumentation gate. Its job is to split the remaining live 2P sync failure into either other-player `player_state` render/apply or AI/worldState source flip/local simulation drift before any next code change.

## Trigger

P0-10G manual live 2P result failed after `c436a6e`.

Evidence:

`C:\Users\rneet\Videos\Captures\Iron Line - 2D Tank Prototype - Chrome 2026-05-24 15-57-43.mp4`

Reported symptoms:

- Position synchronization bug is still visible.
- AI/unit/vehicle behavior looks like state oscillation, not just residual interpolation snap.
- AI appears to alternate between capture/frontline state and movement state.
- The likely class is state source conflict: host worldState, non-host local AI simulation, or stale room refresh/worldState detail being applied in alternating order.

## Candidate Split

P0-10H must separate these two lanes:

1. Other-player position / `player_state` render-apply issue.
2. AI/worldState source flip or non-host local AI simulation drift.

Do not combine the fixes. Do not pick a fix before the repro data identifies the lane.

## Instrumentation Scope

Use the video timestamp and a fresh live 2P repro to capture:

- Remote player `player_state.updatedAt`, `stateSeq`, x/y, render x/y, and apply delta.
- Non-host `worldState.updatedAt`, `hostId`, `tick`, source, unit/vehicle id, target x/y, applied x/y, and local pre/post-sim x/y.
- Whether `worldState.hostId` or source changes when AI flips between capture/frontline and movement positions.
- Whether room detail refresh applies an older or stale `worldState` after a newer one.
- Whether non-host local AI simulation is still moving units that should be host/worldState-controlled.
- Frame time, fetch/detail timestamps, localStorage write timestamps, and socket timestamps around the visible flip.

## Forbidden

- No immediate code fix.
- No WebSocket combat or worldState conversion.
- No server-authoritative conversion.
- No admin/observer split.
- No AI behavior or tactical redesign.
- No worldState cadence cut.
- No 4-player alpha resume declaration.

## Output

P0-10H should stop after reporting:

- P0-10G FAIL record reference.
- Whether the visible sync bug is primarily `player_state` or AI/worldState.
- One cause candidate for the AI oscillation.
- One minimal next fix recommendation.
- Confirmation that no forbidden scope was started.
