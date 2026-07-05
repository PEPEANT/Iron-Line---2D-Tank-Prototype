# P0-10A Startup Session Convergence Fix

Date: 2026-05-23

## Conclusion

Online match start now uses a shared room start timeline instead of starting a full local loading/countdown sequence from each client's receipt time.

Late clients skip forward against `room.startedAt` / `startDeadline`; AI/worldState cadence is intentionally unchanged and remains the next branch.

## Change

- `SessionFlow.syncCurrentRoom` passes the active room and `room.startedAt` into `game.beginDeploymentCountdown`.
- `Game.beginDeploymentCountdown(options)` computes the combined start sequence as loading duration plus 4s countdown.
- If a client receives `playing` late, loading/countdown remaining time is reduced to match the shared deadline.
- If the shared deadline has already passed, the client enters live immediately.
- The P0-10 probe now records wall-clock timestamps and supports an optional delayed room-refresh hold.

## Evidence

Clean 2P run:

- Command: `node tools/check-p0-10-startup-session-world-sync.cjs`
- Report: `reports/playtests/p0-10-start-sync-20260523-112551/report.md`
- `matchStarted` wall-clock drift: 15ms.
- Decision moved past startup mismatch and identified the still-open AI/worldState cadence issue.

Delayed refresh run:

- Command: `IRONLINE_P0_10_LATE_REFRESH_MS=1400 node tools/check-p0-10-startup-session-world-sync.cjs`
- Report: `reports/playtests/p0-10-start-sync-20260523-112215/report.md`
- Blue observed `playing` at `1779535340755`; red observed `playing` at `1779535339563` (blue was 1192ms late).
- Blue reached `matchStarted` at `1779535346174`; red reached `matchStarted` at `1779535346175` (1ms drift).
- Blue's delayed `beginDeploymentCountdown` started with `startLoadingRemaining = 1.414s`; red started with `2.631s`, proving the late client skipped forward instead of replaying the full local start sequence.

## Remaining Issue

The delayed-refresh run still shows AI/worldState as the dominant remaining symptom:

- World publish/apply gaps: `1815.9ms / 1916.8ms`
- Max AI/unit snap on apply: `115.9px`

This is outside P0-10A scope and should not be mixed with start/session convergence.

## Next Recommendation

Proceed to P0-10B narrow AI/worldState cadence/interpolation triage.

Keep the existing prohibitions in place: no WebSocket combat/projectile conversion, no admin/observer split, no AI behavior redesign, no 4-player expansion, and no alpha resume declaration.
