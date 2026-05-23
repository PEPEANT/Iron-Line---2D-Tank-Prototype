# P0-10 Startup / Session / World Sync Triage

Date: 2026-05-23

## Conclusion

P0-10 is confirmed as a separate P0 axis from P0-9F: startup/session convergence must be measured against a shared wall-clock or server timeline, and remote AI/worldState still updates in coarse snapshots.

P0-9F remains valid for the tactical-map frame stall, but it does not close the reported live issue where players start at different times and AI appears to move in chunks.

Follow-up note: the first automated clean-start skew number was later traced to the probe comparing two tabs' page-local `performance.now()` clocks. The product risk was still real for late refresh/stale-session starts, but the automated start skew must use `Date.now()`/server-timeline values.

## Evidence

Probe: `node tools/check-p0-10-startup-session-world-sync.cjs`

Report: `reports/playtests/p0-10-start-sync-20260523-111007/report.md`

| Page | Frame max | Long frames | first playing | first countdown | first matchStarted | world publish gap max | world apply gap max | world apply max unit delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| blue | 33.4ms | 0 | 3469.1ms | 3469.1ms | 10274.7ms | 1821.4ms | 0ms | 0px |
| red | 33.4ms | 1 | 2352.6ms | 2352.6ms | 9158.1ms | 0ms | 1933.3ms | 122.5px |

The initial report showed red observing `room.phase = playing` about 1.1s earlier than blue and treated `matchStarted` as equally skewed. P0-10A later corrected the probe to record wall-clock timestamps; cross-tab `performance.now()` values are not comparable because each page has its own time origin.

## Current Flow

- Admin/server room start changes the room to `phase: "playing"` and sets `startedAt`.
- Each player client notices `room.phase === "playing"` during its own `refreshRemoteRooms` cadence.
- Before P0-10A, `SessionFlow.syncCurrentRoom` called `game.beginDeploymentCountdown()` on receipt.
- Before P0-10A, `beginDeploymentCountdown()` reset the scenario and started local loading plus countdown from that client receipt time.
- P0-10A changed this to compensate from `room.startedAt` / a shared start deadline.

Without the P0-10A compensation, refresh timing, tab sleep, page open timing, or stale local session state can produce visibly different start moments.

## AI / WorldState Finding

The host publishes `worldState` around every 1.8s in `updateOnlineWorldSync`. The non-host applies those snapshots when active-room detail refresh sees them. In the clean run, remote apply gaps reached 1933.3ms and one AI/unit apply moved up to 122.5px.

This matches the reported "AI looks choppy" symptom. It is not explained by P0-9F tactical-map rebuild time, and it is not fixed by player-state WebSocket relay because AI/worldState is still on the room detail path.

## Candidate Causes

- Start mismatch: local countdown is anchored to client receipt time instead of room/server `startedAt`.
- Close/reopen stale session risk: selected room id, API base, and local player profile persist in `localStorage`, while `pagehide` removes participants when tabs close. A reopened tab can legitimately observe a different participant/start state.
- AI choppiness: host world snapshot cadence is coarse at about 1.8s, and remote AI units are corrected in discrete room-detail updates.
- Residual browser work: refresh/detail/localStorage writes remain frequent during the same online path.

## Next Recommendation

P0-10A should be a narrow startup/session convergence fix first.

Scope:
- Anchor online start countdown to room `startedAt` or a server-derived start deadline.
- Late clients should skip forward in countdown/loading rather than starting a fresh 4s local timer.
- Keep player role/session state intact.
- Do not change AI behavior, WebSocket combat/projectile transport, admin/observer architecture, or worldState ownership.

After start convergence is stable, the next separate branch should address AI/worldState cadence/interpolation. Do not mix that with the start fix.
