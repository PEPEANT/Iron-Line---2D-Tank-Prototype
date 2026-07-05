# P0-9C Manual Stutter Mismatch Triage

Conclusion: P0-9B should stay on HOLD as a provisional keep, not as a pass. The production WS player_state path reaches the renderer in the P0-9C probe, but the unchanged manual lag means P0-9B did not close the player-facing P0 symptom.

## Purpose

Manual two-player retest after P0-9B still felt the same. This triage checks the mismatch between:

- improved automated WS player_state gap/snap numbers, and
- unchanged human-perceived lag.

No WebSocket combat expansion, projectile transport change, admin/observer split, AI/worldState change, broad renderer rewrite, or alpha resume is approved by this report.

## Current Decision

| Item | Decision |
| --- | --- |
| P0-9B status | HOLD / provisional keep |
| Commit state | Latest inspected HEAD is `8d77836 fix: relay live player state over websocket`; do not add a follow-up commit claiming pass from this triage alone. |
| Revert? | Do not blindly revert yet. The probe shows the production WS state is reaching the renderer path. |
| Continue building on P0-9B? | No. Stop feature expansion until manual lag is classified. |
| Limited alpha | Still HOLD. |

## Evidence

### Static render path

- `src/systems/session-flow.js` publishes local player state every `75ms` through `publishPlayerStateRelay`.
- Incoming `player_state` messages go through `applyRemotePlayerState`, which writes accepted state into `game.onlineSession.players` and `remotePlayerStateBuffer`.
- `syncRoomParticipants` applies the recent `remotePlayerStateBuffer` overlay before assigning `session.players`.
- `src/systems/renderer.js` draws remote humans through `drawRemoteHumanPlayers -> remoteHumanPlayers -> remoteHumanPoint -> smoothedRemoteHumanPoint`.
- That renderer path reads remote human data from `game.onlineSession.players`, not from a separate visible WS cache.

### P0-9A / P0-9B automation caveat

The older automated WS scenario in `tools/check-p0-basic-2p-stutter-instrumentation.cjs` measured `window.__p0WsRemoteStates` when the source was `ws`. That cache was useful for transport timing, but it was not the renderer input. Therefore, better P0-9A/P0-9B numbers alone could not prove the on-screen draw path improved.

### P0-9C production-path probe

New diagnostic tool:

`tools/check-p0-9c-stutter-mismatch.cjs`

Latest valid output:

`reports/playtests/p0-9c-mismatch-20260523-095851/report.md`

The probe used two production online player sessions and sampled:

- production `SessionFlow.publishPlayerStateRelay`
- production `SessionFlow.applyRemotePlayerState`
- `game.onlineSession.players`
- `Renderer.remoteHumanPlayers`
- frame timing, localStorage writes, room refresh, HTTP, and WS frames

Key result:

| Page | WS accepted | Session gap avg/p95/max ms | WS->session px avg/p95/max | Render entries | Render->session px avg/p95/max | Long frames | localStorage writes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| blue | 122 | 93/217/407 | 0/0/0 | 642 | 0/0/0 | 4 | 153 |
| red | 124 | 89.5/222/254 | 0/0/0 | 610 | 0/0/0 | 4 | 117 |

Interpretation:

- Actual rendered remote-human entries matched `game.onlineSession.players`.
- `game.onlineSession.players` matched the last accepted production WS state in this probe.
- This makes "WS live state never reaches the draw path" unlikely for the automated production-session path.
- The probe did show frame stalls: max frame times reached `466.7ms` on blue and `450ms` on red, with four `>50ms` frames per page.
- The probe also saw nontrivial localStorage write volume during the short run.

Important limit:

The probe is still headless automation, not manual human play. It clears the source-mismatch question for the sampled production path, but it does not classify human-perceived input delay, whole-screen stalls, camera/aim feel, or combat-time hitching.

## Lag Classification

Current classification: not proven to be remote-position transport.

Most likely current branch:

`frame/render/GC/storage/fetch/input classification needed`

Manual lag is still unclassified between:

- remote position snapping or rubber-banding,
- whole-screen frame stalls,
- local input delay,
- camera/aim hitching,
- combat/render merge stalls.

The existing in-game performance overlay can be toggled with `P` and already shows FPS, frame/update/render/minimap/tactical/AI timing. It does not directly break down localStorage, fetch, WS, or render-source mismatch, so use DevTools Performance/Network recording beside it.

## Next Recommendation

Do exactly one manual classification pass with the existing performance overlay enabled and DevTools Performance/Network recording. During that pass, label each visible lag event as one of:

1. remote player snapping,
2. whole-screen frame stall,
3. local input delay.

Do not start combat/projectile WS expansion, admin/observer split, AI/worldState work, or a renderer rewrite until that label is known.
