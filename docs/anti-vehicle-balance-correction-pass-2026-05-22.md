# Anti-Vehicle Balance Correction Pass - 2026-05-22

## Status

Verdict: ON TRACK

The interim report did not identify a concrete RPG, suicide-drone, tank bailout, or regression blocker. This correction pass therefore made no additional gameplay balance changes. The correct action is to preserve the current small-pass values, rerun the same verification scenario, and move to the completion report if live feel does not reveal a new issue.

## Scope Decision

Allowed scope was limited to issues found in the interim report:

- RPG range / firing opportunity / exposure time.
- Suicide-drone armored-vehicle damage, terminal speed, and direct-vs-near-blast behavior.
- Tank crew and player bailout behavior.
- Anti-tank assault, crush/collision, FPS loop, and command-state regressions.

No failed item was found in the interim report, so this pass did not touch weapon values, AI values, drone damage values, or bailout code again.

## Pass / Fail Table

| Area | Interim Result | Correction Action | Retest Result | Notes |
| --- | --- | --- | --- | --- |
| RPG opportunity | PASS | No extra tuning | PASS | Range `1080`, desired range `690`, AI preferred range `500-900`, aim window `0.86-1.48`. |
| RPG over-safety risk | PASS | No extra tuning | PASS | Direct damage remains `82`; front armor hold remains `600`. |
| Suicide-drone damage | PASS | No extra tuning | PASS | Base damage `94`, tank scale `0.62`, light vehicle scale `1`. |
| Suicide-drone pacing | PASS | No extra tuning | PASS | Terminal dive `1.36`, terminal boost `1.12` were preserved. |
| Direct / near blast split | PASS | No extra tuning | PASS | Direct impact profile remains separate from radius damage. |
| Tank bailout window | PASS | No extra tuning | PASS | Retest produced a bailout/destruction window above `1.5s`. |
| Crew/player state after bailout | PASS | No extra tuning | PASS | Crew/player leave tank alive at reduced HP. |
| Catastrophic bailout risk | COVERED BY CODE | No extra tuning | COVERED BY CODE | Catastrophic path uses lower bailout chance and shorter destruction delay. |
| `antiTankAssault / closeAssault` | PASS | No extra tuning | PASS | Tank assault methods remain present. |
| FPS / command regression | PASS | No extra tuning | PASS | FPS command integration and online command smoke still pass. |

## Modified Files In This Correction Pass

No gameplay code files were changed for this correction pass.

Documentation / test notes updated:

- `docs/anti-vehicle-balance-correction-pass-2026-05-22.md`
- `docs/INDEX.md`
- `AGENT_HANDOFF.md`

The gameplay files still modified in the overall anti-vehicle small pass are from the preceding implementation pass:

- `src/data/infantry-weapons.js`
- `src/ai/infantry-ai.js`
- `src/entities/suicide-drone.js`
- `src/entities/tank.js`
- `src/systems/combat.js`

## Retest Notes

Same scenario rerun:

```text
node tools/check-anti-vehicle-balance.cjs
ok: true
RPG: pass
Suicide drone: pass
Tank bailout: pass
Regression: pass
```

Related regressions rerun:

```text
npm.cmd run check
node tools/check-bot-commander-skeleton.cjs
node tools/check-fps-command-integration.cjs
npm.cmd run check:online
```

All passed during this pass.

## Blockers

None recorded.

Remaining manual feel checks are not blockers:

- Engineer RPG timing should still be felt in live play.
- Suicide-drone hit should feel threatening but reactable.
- Tank bailout should feel like a last chance, not a free tank-loss cancel.

## Next Step

Proceed to the anti-vehicle balance completion report if no live-feel issue appears. Do not start BotCommander stability, AI V2, 50vs50, UGC, city/open-world, or server-authority combat work until the anti-vehicle balance pass is closed.
