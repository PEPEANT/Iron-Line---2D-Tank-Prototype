# P0 Manual 2P Verification Result - 2026-05-23

Conclusion: The first manual two-human signal is a P0 fail for perceived online smoothness. Team/damage hardening appears to have fixed the red-tank same-team kill symptom, but the basic two-player stutter problem remains unresolved.

## Gate

Limited alpha remains HOLD.

This is a manual feedback record, not a full instrumented result table. Treat it as enough to block retest/restart language and enough to choose the next investigation branch, but not enough to claim a precise root cause.

## Reported Result

| Area | Manual signal | Current interpretation |
| --- | --- | --- |
| Two-player feel | Still severe stutter. | FAIL. P0 online smoothness remains open. |
| Visible improvement from HTTP/cursor work | No obvious player-facing improvement reported. | Automated byte/persist reductions did not translate into enough manual feel improvement. |
| New bugs | More issues were found during manual play. | Record individually before broad fixes. |
| Red tank killing red player | Appears blocked. | Team/damage hardening likely helped this path. |

## What This Means

The P0-1 through P0-6A work still has value because it removed measurable HTTP response/persist waste and reduced structural payload risk. However, this manual result says the main player-facing symptom is not closed.

Do not continue treating the P0 HTTP reductions as proof that the online combat loop is ready. They are prerequisites, not completion evidence.

## Working Classification

The next branch should be:

`P0-9 basic 2P stutter triage`

Purpose:

- Reproduce the manual stutter in the smallest possible setup.
- Split movement-only stutter from combat-only stutter.
- Confirm whether admin/observer and AI are actually off during the basic failure.
- Capture frame/network/localStorage/socket counts during the same manual-like path.
- Decide whether the first fix is a minimal WebSocket player_state experiment, an interpolation/prediction repair, or another measured bottleneck.

## Do Not Do Yet

- Do not restart limited alpha.
- Do not run four-player alpha.
- Do not start a broad WebSocket rewrite.
- Do not implement admin/observer separation in the same branch.
- Do not change AI/worldState ownership in the same branch.
- Do not add gameplay features while this symptom is open.

## Next Evidence Needed

| Question | Needed evidence |
| --- | --- |
| Does movement-only stutter with admin OFF and minimal/default AI? | 60s movement-only capture, frame time, `/participants`, `/api/rooms`, `/api/rooms/:id`, localStorage writes. |
| Does stutter get worse only during small-arms/projectile combat? | Combat event count, `/combat` bytes, final combat event count, visible hitch moments. |
| Does admin/observer make it worse? | OFF vs ON comparison with same scenario and same room. |
| Is the issue visual interpolation rather than network volume? | Remote player position timestamps, gaps, snap distance, and render frame timing. |
| Is localStorage/cache involved? | localStorage write count/bytes during movement and combat. |

## Next Recommendation

Run `P0-9A basic 2P stutter instrumentation` before changing transport:

1. Extend the existing playtest harness or add a narrow manual-like probe that records remote player update gaps and snap distance.
2. Keep the scenario to two players, admin OFF, minimal/default AI first.
3. If movement-only stutter reproduces with small HTTP payloads, move to a minimal `player_state` WebSocket experiment.
4. If movement-only is stable but combat stutters, inspect combat event merge/render/localStorage first.
5. If only admin ON stutters, switch to admin/observer split instead.

Team/damage path does not need the next fix unless same-team damage reappears in a captured scenario.
