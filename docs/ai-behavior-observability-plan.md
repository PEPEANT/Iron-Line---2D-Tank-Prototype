# AI 행동 관측 계획 — "눈" 설계

작성: 2026-07-04. 상태: 1차 구현 완료. 목적: "AI가 똑똑하게 싸우는가"를 감이 아니라 숫자와 그림으로 판정한다.
전례: 엎드림은 시스템이 있었지만 실측 발동률 0%였다 (tempo 진단 D2). **구현 존재 ≠ 작동. 모든 AI 행동은 발동률을 측정하기 전까지 "없는 것"으로 취급한다.**

## 2026-07-04 구현 결과

- `tools/check-behavior-census.cjs`: 런타임 후킹 기반 행동 인구조사 프로브 구현.
- `tools/pages/replay-viewer.html`: `result.json`을 file input으로 열어 유닛, 사격, 수류탄, 엎드림, 사망 이벤트를 재생하는 단일 HTML 뷰어 구현.
- `package.json`: `npm run census`, `npm run tempo` 별칭 추가.
- 최신 180초 풀런 결과: `reports/playtests/behavior-census-20260704055609/report.md`.

최신 관측값:
- 수류탄/유탄 실제 발사 3회. 목표 4~10 / 6~15에는 아직 못 미친다.
- 실제 `selectGrenadeTarget()` 평가 7,704회 중 null 7,613회. 주요 null 사유는 `no-visible-or-usable-report` 2,505회, `no-target` 2,196회, `no-ammo` 2,698회.
- 후보가 잡힌 뒤 `tryThrowGrenade()` 실패는 `aiming` 88회, `fire-cooldown` 20회. 즉 "후보를 찾았지만 조준 시간이 끝나기 전에 상황이 끊기는" 병목이 있다.
- `fireRifleAtPoint` 위치/제압 사격은 411발 중 12발. 현재 제압사격 비율은 0.029로 목표 0.20~0.40에 크게 못 미친다.
- 엎드림 진입은 40회, 평균 유지 8.73초로 실제 발동한다.
- 사격-기동 분업 비율은 0.011로 목표 0.30에 크게 못 미친다.

## 1단계: 행동 인구조사 프로브 (check-behavior-census.cjs)

`check-suppression-flow.cjs`의 후킹 패턴을 일반화. 15v15 한 판(180초)에서 카운트:

| 항목 | 후킹 지점 | 목표 대역 (1차 가설) |
| --- | --- | ---: |
| 수류탄 투척 시도/성공/명중 | tryThrowGrenade, resolveImpact | 판당 4~10회 투척 |
| 유탄 발사 횟수 | 〃 (grenadeLauncher) | 판당 6~15회 |
| 수류탄 후보 탈락 사유 분포 | selectGrenadeTargetBudgeted 내 분기별 카운터 | 탈락 90%+가 한 사유면 그 임계값이 병목 |
| 제압사격 비율 (표적 비가시 상태 사격) | tryFire 시점에 hasLineOfSight 기록 | 전체 사격의 20~40% |
| 사격-기동 분업 | 분대 단위: 누가 쏘는 동안 다른 대원이 이동한 시간 비율 | 30%+ |
| 엎드림 진입/유지/해제 사유 | enterProne/clearProne (기존) | prone ratio 15%+ |

출력: `reports/playtests/behavior-census-*/report.md` — 목표 대역 대비 PASS/FAIL 표.

## 2단계: 리플레이 뷰어 (사람과 AI가 같은 눈을 갖기)

- 프로브가 0.5초 간격으로 전 유닛 위치·상태·이벤트(사격/투척/사망/제압)를 JSON으로 덤프 (tempo 프로브 샘플링에 유닛 좌표만 추가).
- `tools/pages/replay-viewer.html` 1장: 그 JSON을 읽어 탑다운 캔버스에 재생 (타임라인 슬라이더, 배속, 이벤트 마커).
- 효과: 유저는 눈으로 "저 분대가 왜 저기서 멈췄지"를 확인하고, AI(나)는 같은 JSON을 수치로 읽는다. **같은 근거로 대화 가능해짐.**
- 보너스: 이 JSON 포맷은 향후 게임 내 리플레이/킬캠의 데이터 계약이 된다.

## 3단계: "똑똑한 제압사격"의 조작적 정의 (측정 가능한 형태로)

똑똑함 = 아래 4개가 동시에 참:
1. 표적이 숨어도 마지막 확인 위치/엄폐물에 사격을 유지한다 (제압사격 비율 20~40%)
2. 지원화기(MG/LMG)가 제압을 담당하고, 소총수는 그 동안 기동한다 (분업 지표 30%+)
3. 제압 중 탄약을 다 쏟지 않는다 (제압사격의 발사간격이 조준사격보다 김)
4. 표적 재출현 시 1초 내 조준사격으로 전환

각 항목이 census 지표와 1:1 대응 → 개선 작업은 "지표 하나 골라 올리기"가 된다.

## 자율 검증 루프 (내가 스스로 도는 방식)

수정 1개 → `npm run check` → census 프로브 → 목표 대역 비교 → 문서에 전/후 기록. 사람 눈 확인이 필요한 것만 리플레이 뷰어 타임스탬프로 지목해서 유저에게 "몇 초 장면 봐달라"고 요청.
(주의: 프로브는 크롬 스폰이라 권한 프롬프트가 뜰 수 있음 → package.json scripts에 "census"/"tempo" 별칭 추가해 npm run으로 실행하는 것 먼저 시도.)

## 착수 순서

1. census 프로브 (반나절) — 수류탄 탈락 사유 분포가 첫 수확일 것
2. 수류탄/유탄 발동률 튜닝 (census 근거로 임계값 조정)
3. 리플레이 뷰어 (반나절)
4. 제압사격 4개 지표 개선 (하나씩)

## 2026-07-04 grenade aim follow-up

Implemented a narrow grenade behavior pass after the first behavior-census result:

- Kept grenade damage unchanged.
- Added grenade aim target cache/grace so a candidate is not dropped immediately during aim.
- Allowed very fresh combat contact reports to seed grenade targeting, while still rejecting objective-only reports.
- Added an entrenched-target bonus for prone/suppressed infantry instead of lowering the global score threshold.
- Extended grenade-launcher range from 540 to 720 so it can participate in the current long MG engagement band.
- Added `continueGrenadeAim()` so a unit that has already started aiming can finish unless suppression becomes extreme.

Latest verification:

- `npm run check`: PASS.
- `npm run census`: `reports/playtests/behavior-census-20260704062510/report.md`.
- Result: 3 grenade-launch events, all successful; `aiming` try-fails dropped from 260 in the prior run to 134.
- Still below the 4-10 grenade target, so the remaining blocker is no longer damage or aim only. It is mostly engagement geometry: many candidates are still `reported-missing`, `no-target`, or outside throw range. Next useful lane is infantry approach/fire-move doctrine, not more grenade damage.

## 2026-07-04 infantry fire-move first pass

Implemented a narrow fire-move doctrine slice:

- Added `src/ai/infantry-fire-move.js` as a separate module instead of growing `infantry-ai.js`.
- Connected one hook inside `InfantryAI.update()` after grenade-aim continuation and before tactical spread.
- Non-support infantry can advance toward a soft contact/report only when same-squad MG/LMG support is available.
- Grenade carriers do not spend rifle fire cooldown while making a grenade approach.
- Same-squad support weapons can share their current soft target with assault units.
- Support MG/LMG can mix direct-contact area fire only on a conservative 20% pulse, and launcher carriers keep grenade priority.

Verification notes:

- `npm run check`: PASS.
- Chosen balance run: `reports/playtests/behavior-census-20260704070724/report.md`.
- Compared with the previous grenade follow-up run (`behavior-census-20260704062510`): grenade launches stayed playable at 3, teamwork rose from 0.031 to 0.037, prone average hold stayed healthy at 6.93s, deaths stayed in the same broad band.
- Stronger direct-support fire mixes were tested and rejected: they could raise point shots and even produce 6 grenade launches in one run, but made prone hold unstable or suppressed grenade timing in later runs.

Current conclusion:

The first pass adds the missing "MG holds while assault moves" behavior without a commander rewrite, but it is not the final D2 solution. The next blocker is still stable fire-move measurement: point-shot ratio and teamwork ratio are highly run-sensitive. The next useful work is to add explicit fire-move reason counters to `check-behavior-census.cjs` before doing more tuning.

## 2026-07-04 fire-move reason counter

Implemented the fire-move counter before more tuning:

- Added `diagnoseFireMoveAdvance()` to `src/ai/infantry-fire-move.js`.
- `tools/check-behavior-census.cjs` now records fire-move calls, ok count, ok rate, reason counts, success states, and target source counts.
- Moved markdown report formatting into `tools/behavior-census-report.cjs` so the census script stays under its code-health budget.
- The counters are diagnostic-only; they do not change runtime AI behavior.

Verification:

- `npm run check`: PASS.
- `npm run census`: `reports/playtests/behavior-census-20260704072303/report.md`.
- 180s result: fireMoveCalls 44124, fireMoveOk 171, fireMoveOkRate 0.004.
- Top reasons: `blocked-mode` 22772, `support-role` 7031, `no-target` 6699, `support-weapon` 2726, `scout-role` 2880.
- Successful fire-move state was `grenade-approach` only, and target sources were mostly direct/squad-shared.

Next useful conclusion:

Do not tune fire-move coefficients blindly yet. The counter shows most non-advance cases are mode/role gating or no target, not pathing. The next narrow improvement should split `blocked-mode` by tactical mode and decide whether pre-assault/hold-wall/support-fire should allow limited assault movement, while keeping support/scout roles excluded.

## 2026-07-04 fire-move blocked-mode split

Implemented a diagnostic-only split for fire-move `blocked-mode`:

- `tools/check-behavior-census.cjs` now records `fireMoveBlockedModeCounts`.
- `tools/behavior-census-report.cjs` prints a dedicated "Fire-Move Blocked Modes" block.
- No gameplay, range, damage, or movement tuning changed in this pass.

Verification:

- `npm run check`: PASS.
- `npm run census`: `reports/playtests/behavior-census-20260704072957/report.md`.
- 180s result: fireMoveCalls 45815, fireMoveOk 337, fireMoveOkRate 0.007.
- Top fire-move reasons: `blocked-mode` 25241, `support-role` 8836, `no-target` 5927, `scout-role` 2839.
- Blocked mode split: `hold` 21998, `hold-wall` 2476, `fallback` 401, `regroup` 342, `rally-with-tank` 24.

Current conclusion:

The main fire-move bottleneck is not fallback/regroup recovery. It is the broad `hold` gate, with `hold-wall` as a secondary blocker. The next useful pass should split what "hold" means in combat: objective/static hold should stay blocked, but contact-hold with a valid direct or squad-shared target and available support may allow limited fire-move. Keep `fallback`, `regroup`, support roles, scout roles, and support weapons excluded until the hold split is proven.

## 2026-07-04 contact-hold fire-move gate

Implemented the narrow hold split:

- `fallback`, `regroup`, `hold-wall`, and `rally-with-tank` remain hard-blocked for fire-move.
- `hold` is no longer hard-blocked by itself.
- A `hold` unit can only enter fire-move if the target is direct contact or same-squad shared contact.
- Support role, scout role, support weapons, suppression, tank threat, valid profile, support-source, and move-target checks still apply.
- Static/objective hold with only stale/reported/order threat data remains blocked.

Verification:

- `npm run check`: PASS.
- First census after change: `reports/playtests/behavior-census-20260704073842/report.md`.
  - fireMoveOk 933, fireMoveOkRate 0.022, blocked `hold` dropped to 152.
  - Prone average hold was only 1.7s, so a second run was needed before accepting the change.
- Second census after change: `reports/playtests/behavior-census-20260704074223/report.md`.
  - fireMoveOk 1872, fireMoveOkRate 0.042.
  - suppressionShotRatio 0.214, grenade launches 5, prone average hold 4.05s.
  - blocked modes: `hold-wall` 1638, `fallback` 542, `rally-with-tank` 16, `regroup` 2. `hold` no longer appears as a top blocker in that run.

Current conclusion:

The hold split works as a first tactical unlock: contact-hold can now move under support, while hard defensive/recovery modes stay locked. The next unresolved issue is that successful fire-move is still entirely `grenade-approach`; rifle/assault fire-move is not yet showing up as a stable success state. Next useful pass should split non-grenade assault blockers: role composition, rifle hold range, and whether assault units are already inside hold range before they ever need to advance.

## 2026-07-04 fire-move non-grenade diagnosis

Added diagnostic-only fire-move splits:

- `fireMoveReasonByStateCounts`
- `fireMoveReasonByWeaponCounts`
- `fireMoveOkByWeapon`
- Report blocks for state/weapon reason splits and success weapons.

Verification:

- `npm run check`: PASS.
- `npm run census`: `reports/playtests/behavior-census-20260704074749/report.md`.
- Result showed `ok:rifle` 1352, but all successful states were still `ok:grenade-approach`.

Important rejected experiment:

- Tested a distance gate where grenade profiles only applied near grenade/launcher range.
- Report: `reports/playtests/behavior-census-20260704075215/report.md`.
- This produced some `ok:fire-move` events, but grenade launches fell to 0 and suppressionShotRatio dropped to 0.023.
- The distance gate was reverted. Keeping it would make the battle thinner even though the state label looks better.

Final verification after reverting the distance gate:

- `npm run check`: PASS.
- `npm run census`: `reports/playtests/behavior-census-20260704075602/report.md`.
- Result: grenade launches 4, fireMoveOk 864, fireMoveOkByState still `grenade-approach`, prone average hold 5.04s.

Current conclusion:

The absence of `fire-move` success state is partly a labeling/priority issue: rifle-primary infantry with grenade ammo are classified as `grenade-approach` before they can use the rifle fire-move profile. Do not fix this by simply suppressing grenade profiles by distance; that hurts grenade and support-fire behavior. The next useful pass should split "grenade approach movement" from "grenade throw commitment": allow rifle-primary units to keep a rifle fire-move state while separately carrying a pending grenade opportunity, or add a more explicit `assault-fire-move` state that can coexist with grenade readiness.

## 2026-07-04 assault-fire-move state split

Implemented the safe version of the state split:

- Rifle-primary units with grenade or grenade-launcher ammo now enter `assault-fire-move` during supported fire-move advance.
- Dedicated non-gun grenade movement can still use `grenade-approach`.
- Actual grenade throw commitment is unchanged and still appears through `grenade-aim` / `grenade`.
- `squadHasFireMoveAssault()` now treats `assault-fire-move` as an assault movement state so support weapons still recognize the advance.
- The rejected grenade distance gate remains reverted.
- Movement tempo state lists were left unchanged because the old `grenade-approach` path was not tempo-managed either; adding it would be a separate behavior change.

Verification:

- `npm run check`: PASS.
- `npm run census`: `reports/playtests/behavior-census-20260704080149/report.md`.
- Result: fireMoveOk 800, fireMoveOkByState `assault-fire-move` 800, fireMoveOkByWeapon `rifle` 800.
- Grenade launches stayed alive at 3 instead of dropping to 0.
- Prone average hold stayed healthy at 6.2s.

Current conclusion:

The state-labeling problem is resolved without weakening grenade behavior. The remaining tactical blocker is now less about state naming and more about doctrine balance: `hold-wall`, `fallback`, support/scout role allocation, and low rifle point-shot participation still decide whether the player feels a real assault line forming.

## 2026-07-05 post tank-assault census recheck

After the tank assault bug fix, Codex re-ran `npm run census` twice to check whether fire-move/support-fire had regressed.

- Run 1: `reports/playtests/behavior-census-20260705092057/report.md`
  - fireMoveOk 0, pointShots 0, teamworkRatio 0, grenade ok 1, proneEnter 12.
  - This looked like a possible regression, but the event count was low and the battle flow was sparse.
- Run 2: `reports/playtests/behavior-census-20260705092542/report.md`
  - fireMoveOk 1075, fireMoveOkByState `assault-fire-move` 1075, fireMoveOkByWeapon `rifle` 1075.
  - pointShots 8, suppressionShotRatio 0.028, teamworkRatio 0.007, grenade ok 1, proneEnter 29.

Current conclusion:

No clear fire-move state regression. The 0-success run is treated as run variance. The old unresolved problem remains: support/point-fire and teamwork are too rare to make the assault line feel reliably covered. Do not retune fire-move from a single zero run; use repeated census samples and focus next on support-fire trigger frequency or squad role composition.
