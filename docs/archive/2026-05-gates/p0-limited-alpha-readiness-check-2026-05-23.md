# P0 Limited Alpha Readiness Check - 2026-05-23

Conclusion: P0-5E is a readiness check only. It does not reopen limited alpha retesting.

## Scope

- Re-run the current P0 evidence after P0-5D team/damage validation.
- Confirm whether the project can move toward a limited-alpha readiness checklist.
- Keep implementation, WebSocket combat-channel work, admin separation, AI V3, 50vs50, and alpha-retest language out of scope.

## Evidence Summary

| Gate | Result | Evidence |
| --- | --- | --- |
| Repo identity | PASS | `git log -1` is `d217126 fix: harden team identity combat checks`. |
| P0-5D team/damage validation | PASS | `node tools/check-p0-team-damage-full-path.cjs` passed with same-team small-arms/projectile rejection, local explosion team guard, contact damage guard, and clean kill/death/respawn stats. |
| P0-4 browser 2-player movement | PASS | 2 headless Chrome clients, 0 errors, 0 long frames >50 ms, ~16.9 ms average frame time. |
| P0-4 browser 2-player small arms | PASS with risk | 0 errors, 0 long frames, ~16.8 ms average frame time; selected-room detail averaged ~42.7 KB and maxed ~77.3 KB. |
| P0-4 browser projectile combat | PASS with risk | 0 errors, 0 long frames, ~16.7 ms average frame time; selected-room detail averaged ~12.7 KB. |
| P0-4 admin/observer ON | PASS with risk | 0 errors, 0 long frames; selected-room detail averaged ~44.3 KB and admin `POST /api/rooms` averaged ~41.3 KB. |
| P0 HTTP load replay | PASS with risk | `/participants` acks stayed 97 B and `/combat` stayed about 0.9-1.1 KB, but `/api/rooms/:id` detail still grows with combat events/worldState. |
| Server authority / client combat flow | PASS | `check-online-combat-server-authority`, `check-online-combat-client-flow`, and `check-alpha-p0-stabilization` passed. |
| Code health | PASS | `npm run check` passed; existing hotspot warnings remain. |

## Key Numbers

| Scenario | Frame | Errors | Main remaining payload |
| --- | --- | --- | --- |
| movement only | avg 16.9 ms / max 33.4 ms | 0 | detail avg ~3.4 KB |
| small arms | avg 16.8 ms / max 33.4 ms | 0 | detail avg ~42.7 KB / max ~77.3 KB |
| projectile | avg 16.7 ms / max 16.8 ms | 0 | detail avg ~12.7 KB / max ~22.1 KB |
| small arms + admin/observer | avg 16.7 ms / max 16.8 ms | 0 | detail avg ~44.3 KB / max ~78.9 KB |

## Decision

Limited alpha retest remains HOLD.

Readiness status: partial readiness for the next validation branch, not readiness to retest with players.

Reasons:

- The strongest runtime evidence is headless browser automation, not manual two-player or four-player human play.
- The selected-room detail payload remains the largest measured structural risk.
- Admin/observer did not collapse frames in the probe, but it still adds large detail/admin room payloads.

## Verification Commands

- `node tools/check-p0-real-browser-2p.cjs`
- `node tools/check-p0-http-combat-load.cjs`
- `node tools/check-p0-team-damage-full-path.cjs`
- `node tools/check-online-combat-server-authority.cjs`
- `node tools/check-online-combat-client-flow.cjs`
- `node tools/check-alpha-p0-stabilization.cjs`
- `npm run check`
- `git diff --check`

## Next Recommendation

P0-6 active-room detail lightening.

Keep the next branch narrow: reduce `/api/rooms/:id` detail growth from `combatEvents` and `worldState` without changing WebSocket combat transport, AI ownership, admin separation, or player interpolation.
