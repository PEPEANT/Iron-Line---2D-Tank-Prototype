# P0-10C WorldState Cadence Trim

Date: 2026-05-23

## Conclusion

P0-10C reduces the coarse AI/worldState correction problem, but it does not fully close visible snap risk.

The host worldState cadence was trimmed from `1.8s` to `0.45s`, and a small-change publish guard now prevents unchanged/tiny snapshots from writing. In the active low-AI probe, movement was significant enough that the guard did not skip publishes, but write/payload growth stayed bounded.

## Change

- `updateOnlineWorldSync` host publish interval: `1.8s` -> `0.45s`.
- Added `WorldStatePublishGuard` for roomRegistry worldState writes.
- The guard publishes immediately for host/room changes, entity count changes, alive/hp/controller changes, meaningful position/angle movement, capture-point changes, or a force interval.
- The P0-10B probe now distinguishes worldState publish attempts from actual published writes.

## Before / After

Before report: `reports/playtests/p0-10b-worldstate-20260523-114431/report.md`

After report: `reports/playtests/p0-10b-worldstate-20260523-115214/report.md`

| Metric | Before | After |
| --- | ---: | ---: |
| Host publish gap max | 1849.3ms | 500.6ms |
| Remote apply gap max | 1951ms | 753.1ms |
| Remote unit target max | 571.7px | 308.9px |
| Remote unit apply max | 284.7px | 72.4px |
| Remote vehicle target max | 571.7px | 143.3px |
| Remote vehicle apply max | 411.7px | 103.2px |
| Host storage writes | 222 | 271 |
| Host `/api/rooms` POST count | 14 | 31 |
| Active-room detail avg bytes | ~5.1KB | ~6.1KB |
| Active-room detail max bytes | ~8.2KB | ~8.2KB |

## Guard Result

The active probe produced `24` worldState publish attempts and `0` skips because AI/vehicle movement exceeded the small-change threshold almost every cadence window.

That means the guard is mainly a protection for quiet or tiny-change phases, not for the current active movement case.

## Remaining Risk

The remaining symptom is now less about coarse cadence and more about one-shot apply correction.

Even after cadence trim, remote apply still moved:

- units up to `72.4px`
- vehicles up to `103.2px`

The current `applyOnlineWorldState` path does a single `lerp` when a new snapshot arrives. That reduces the correction but can still look like a chunk for fast vehicles or divergent local simulation.

## Next Recommendation

Proceed to P0-10D narrow remote worldState interpolation buffer.

Scope:

- Keep AI behavior unchanged.
- Keep server authority and WebSocket transport unchanged.
- Buffer remote worldState targets briefly and interpolate over render/update frames instead of applying the correction in one step.
- Preserve the P0-10C cadence/write guard.
- Continue tracking publish/apply gap, snap distance, detail bytes, storage writes, and long frames.
