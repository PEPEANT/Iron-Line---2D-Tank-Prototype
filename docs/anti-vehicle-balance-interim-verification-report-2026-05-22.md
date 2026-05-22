# Anti-Vehicle Balance Interim Verification Report - 2026-05-22

## Status

Verdict: ON TRACK

This is an interim verification report for the small anti-vehicle balance pass. It is not a full live-feel completion report. The automated browser smoke passed and found no blocker for the RPG range/opportunity tuning, suicide-drone damage tuning, or tank crew bailout first pass.

## Test Environment

- URL: `http://127.0.0.1:4199/index.html`
- Test helper: `node tools/check-anti-vehicle-balance.cjs`
- Build at test time: `cb12fad256d7`, branch `main`
- Scope: local browser runtime smoke plus static combat-value checks

## RPG Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Engineer RPG has more firing opportunity | PASS | RPG range is `1080`, desired range is `690`, projectile life is `1.86`. |
| RPG AI starts from farther out | PASS | AI preferred range is `500-900`, pressure radius is `930`. |
| Exposure before firing is reduced | PASS | RPG aim window is now `0.86-1.48` seconds. |
| RPG is not turned into a safe sniper weapon | PASS | Direct damage remains `82`; front armor hold range is `600`, so frontal long shots are still discouraged. |

## Suicide Drone Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Meaningful armored-vehicle damage | PASS | Base blast damage is `94`, tank splash scale is `0.62`, light vehicle scale is `1`. |
| Direct hit and near blast are separated | PASS | Direct impact values are separate from radius damage. |
| Terminal speed stays reactable | PASS | Terminal dive multiplier remains `1.36`; terminal boost multiplier remains `1.12`. |
| Not an instant-delete weapon | PASS | Direct tank hit values are front `62`, side `78`, rear `92`, boosted rear `140`; this is stronger but still directional. |

## Tank Crew Bailout Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Bailout window exists on non-catastrophic critical tank loss | PASS | Test run produced a `2.407s` bailout/destruction window. |
| Player can bail out | PASS | Player left the tank, survived with `42` HP, and `playerInTank` became `false`. |
| Crew can bail out | PASS | Crew left the tank, survived with `25` HP, and state became `bailout`. |
| Escaped crew becomes weak infantry-like survivor | PASS | Crew is alive, outside the tank, at reduced HP/speed, with no remount target. |
| Catastrophic loss can fail bailout | COVERED BY CODE | Catastrophic destruction uses lower player/crew bailout chances and a shorter destruction delay. |
| Bailout event is observable | PASS | `tank_crew_bailout` battlefield event was recorded. |

## Regression Checks

| Check | Result | Evidence |
| --- | --- | --- |
| `antiTankAssault / closeAssault` path intact | PASS | Tank assault methods remain present. |
| FPS damage path intact | PASS | `game.applyPlayerDamage` remains available. |
| Command state path intact | PASS | `game.commandBus.submit` remains available. |
| Terminal drone pacing not globally changed | PASS | Terminal speed values were not increased. |

## Automated Result

```text
node tools/check-anti-vehicle-balance.cjs
ok: true
RPG: pass
Suicide drone: pass
Tank bailout: pass
Regression: pass
```

## Remaining Manual Feel Checks

- Confirm in live play that engineers actually get a practical RPG firing chance before being erased by tank fire.
- Confirm RPG still feels risky against frontal armor and does not become a long-range safe poke.
- Confirm suicide drones feel threatening when they hit, but still give tanks/infantry a readable response window.
- Confirm bailout feels like a last chance, not like tank loss is free.

## Next Step

No blocker was found in this interim check. If live feel does not reveal an issue, proceed to the anti-vehicle balance completion report. If a feel issue appears, perform a narrow report-based correction pass before returning to BotCommander work.
