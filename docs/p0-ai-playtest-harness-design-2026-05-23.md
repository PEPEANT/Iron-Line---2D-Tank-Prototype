# P0 AI Playtest Harness Design - 2026-05-23

Conclusion: P0-7 should start as a report-capable extension of the existing headless two-browser play probe, not as a new game AI, WebSocket transport, or admin/AI architecture rewrite.

## P0-6A Closure

- P0-6A was committed and pushed as `35ff8ab fix: add active room detail cursor`.
- `main` is synchronized with `origin/main`.
- The worktree was clean before this P0-7 design pass.
- Limited alpha remains HOLD.

## Goal

Reduce manual two-player test burden by turning the current scripted browser probe into a reusable automated playtest harness.

The "AI" in this branch means automated test clients that enter the game and perform scripted player actions. It does not mean AI V3, smarter battlefield AI, larger AI counts, or AI/worldState ownership changes.

## Existing Reuse Base

`tools/check-p0-real-browser-2p.cjs` already provides most of the first harness slice:

| Existing part | Reuse value |
| --- | --- |
| Local static server with isolated room store | Keeps test rooms out of the real `.data/online-rooms.json`. |
| Separate Chrome profiles and origins | Gives blue/red/admin isolated browser storage. |
| CDP `Network`, `Runtime`, `Page`, and `Log` hooks | Already captures request counts, encoded bytes, runtime exceptions, and page log warnings/errors. |
| WebSocket frame counting | Already captures admin/observer message type counts. |
| `requestAnimationFrame` probe | Already captures average, p95, max frame time, and long frames. |
| localStorage wrapper | Already captures write count and approximate bytes. |
| Scenario actions | Movement, small-arms, projectile, and admin/observer ON are already scripted. |
| Final room fetch | Already records final combat event count. |

The current script is a verification probe. P0-7 should keep that script passing and add harness behavior around it rather than replacing the current P0 check.

## Proposed Harness Shape

First implementation target:

`tools/check-p0-ai-playtest-harness.cjs`

Suggested behavior:

1. Start the same isolated static server.
2. Launch two browser clients, plus an optional admin/observer browser.
3. Seed one unique room per scenario.
4. Run a fixed scenario matrix:
   - `movement_only_10s`
   - `small_arms_10s`
   - `projectile_10s`
   - `small_arms_admin_off_10s`
   - `small_arms_admin_on_10s`
5. Collect metrics:
   - frame avg / p95 / max
   - long frame count over 50 ms
   - console/runtime/page errors
   - network request counts
   - average/max response bytes per endpoint
   - WebSocket message type counts
   - localStorage write count and approximate bytes
   - final combat event count
   - client/server combat event count agreement
   - death/respawn event counts when present
   - same-team damage suspicion count from combat events
6. Write a JSON result and compact Markdown report.
7. On failure, save screenshots and page error logs.

## Report Format

Generated artifacts should be disposable and timestamped, for example:

`reports/playtests/p0-7-ai-playtest-YYYYMMDD-HHMMSS/`

Suggested files:

| File | Purpose |
| --- | --- |
| `result.json` | Machine-readable full metrics, page summaries, endpoint bytes, WS counts, combat sync fields, and error lists. |
| `report.md` | Human-readable table for quick handoff. |
| `screenshots/<scenario>-<page>.png` | Saved only on failure or when explicitly requested. |
| `logs/<scenario>-<page>.json` | Runtime/page/network error fragments on failure. |

The harness should not write into docs for every run. Docs should only describe the harness design or summarize a chosen gate result.

## Pass / Fail Rules

The first pass should keep thresholds conservative and observable:

| Rule | Initial threshold |
| --- | --- |
| Browser/page errors | `0` |
| Long frames over 50 ms | `0` for P0 gate mode; warning-only in exploratory mode |
| `/participants` response shape | no `room` payload |
| `/combat` response shape | no full `room` payload |
| `/api/rooms` list shape | summary only, no `combatEvents` / `worldState` |
| Combat event sync | each active client combat event count equals final server room count |
| Same-team damage suspicion | `0` accepted same-team damage/death events |
| Deleted test room cleanup | room deletion succeeds at scenario end |

Death/respawn should start as collected metrics, not a required failure gate, unless the scenario explicitly forces death/respawn.

## Minimal Implementation Scope

P0-7A should be one small code slice:

- Do not change gameplay code.
- Do not change fetch intervals.
- Do not change WebSocket combat transport.
- Do not change admin/observer architecture.
- Add report writing and failure screenshot/log capture around the existing browser probe behavior.
- If helper extraction is needed, extract only generic CDP/browser metrics functions into a small `tools/p0-browser-harness.cjs` helper and keep `tools/check-p0-real-browser-2p.cjs` behavior equivalent.
- Keep the current P0 browser script as a compatibility check.

Recommended first command after implementation:

`node tools/check-p0-ai-playtest-harness.cjs --report`

## Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Scripted RoomRegistry calls do not prove keyboard/mouse feel. | Medium | Label results as automated browser play, not manual play; keep manual 2P as a later gate. |
| Harness becomes a large framework. | High | First slice only adds report artifacts and screenshots/logs. |
| Duplicating CDP code pushes tool files over budget. | Medium | Extract a small helper only if needed; do not copy the whole script. |
| Failure screenshots produce noisy repo artifacts. | Medium | Save under `reports/playtests/` and keep them uncommitted unless explicitly requested. |
| Admin/observer large POST remains hidden by pass criteria. | Medium | Keep admin POST bytes in the report even if not a hard fail yet. |
| Same-team damage suspicion parser produces false positives. | Medium | Start as a warning metric unless it sees accepted same-team death/damage with serverAuthority. |

## Next Recommendation

P0-7A minimal implementation result:

- Added `tools/check-p0-ai-playtest-harness.cjs`.
- Runs two headless Chrome clients as blue/red players.
- Covers `movement_only_6s` and `small_arms_6s`.
- Collects frame timing, long frames, browser/page errors, endpoint request counts, endpoint bytes, combat event counts, death/respawn counts, localStorage writes, and same-team damage suspicion count.
- Writes ignored local artifacts under `reports/playtests/p0-7a-ai-playtest-YYYYMMDD-HHMMSS/`.
- Writes `result.json` and `report.md` every run.
- Saves `screenshots/` and `logs/` only when a scenario fails.

Sample first run:

| Scenario | Frame avg/max | Long >50ms | Errors | Detail avg/max | Combat POST | Combat events | Event sync |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| movement_only_6s | 16.7 / 16.8 ms | 0 | 0 | 3,501 / 3,501 B | 0 | 0 | PASS |
| small_arms_6s | 16.7 / 16.8 ms | 0 | 0 | 5,614 / 6,340 B | 47 | 47 | PASS |

Run command:

`node tools/check-p0-ai-playtest-harness.cjs`

Next implementation candidate:

P0-7B can add projectile and admin/observer ON scenarios to the harness, but only after P0-7A is committed and pushed. Keep limited alpha HOLD.
