# P0-10D Remote WorldState Interpolation Buffer

Conclusion: P0-10D is a PASS candidate on automated probes. The remaining remote AI/unit/vehicle target drift is no longer applied as a single visible correction; the non-host applies the latest host `worldState` through a short interpolation target.

## Scope

P0-10D keeps the P0-10C publish cadence. It does not move worldState to WebSocket, does not make AI server-authoritative, does not redesign AI behavior, and does not change admin/observer or 4-player scope.

## Current Behavior

- `applyOnlineWorldState` ignores stale or self-host snapshots.
- A newer snapshot updates `onlineWorldInterpolationTarget` instead of forcing one large correction.
- `stepOnlineWorldInterpolation` runs on the non-host update path and blends units/vehicles toward the target with short half-life values.
- Capture-point ownership/progress still applies directly because it is not a visible moving actor snap.
- The host still publishes at the P0-10C cadence with the existing payload/write guard.

## Automated Evidence

Probe: `node tools/check-p0-10b-worldstate-cadence.cjs`

Latest report: `reports/playtests/p0-10b-worldstate-20260524-053310/report.md`

| Metric | Result |
| --- | ---: |
| Max publish gap | 477.5ms |
| Max apply gap | 37.1ms |
| Max unit target delta | 441.1px |
| Max unit applied delta | 11.1px |
| Max vehicle target delta | 276.5px |
| Max vehicle applied delta | 25.5px |
| Max worldState JSON bytes | 4128 |

The important P0-10D signal is the target/apply split: local non-host simulation can still drift far from a host target, but the visible per-apply movement is now below the previous 70-100px snap range.

Supplemental probes:

- `node tools/check-p0-9d-frame-stall-triage.cjs`
  - Report: `reports/playtests/p0-9d-frame-stall-20260524-053419/report.md`
  - Result: no steady movement-only frame stall reproduced.
- `node tools/check-p0-9e-update-battlefield-hot-path.cjs`
  - Report: `reports/playtests/p0-9e-hotpath-20260524-053445/report.md`
  - Result: no `updateBattlefield` long frame reproduced.

## Residual Risk

- Target residual can remain high because non-host AI/world simulation still runs between host snapshots.
- One report page logged six HTTP 403 console messages during the probe. The summarized room/worldState endpoints stayed healthy, so this is not classified as a P0-10D blocker, but recurring live 403s should be inspected separately.
- Manual 2P visual confirmation is still needed before declaring the online AI choppiness fixed for players.

## Next

Run a short live 2P visual check focused on AI/unit/vehicle movement. If AI still visibly jumps despite low per-apply deltas, the next narrow candidate should be visual-only remote actor presentation smoothing, not another cadence cut.
