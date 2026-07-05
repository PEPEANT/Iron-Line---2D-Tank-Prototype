# "AI의 눈" 구현 설계도 (다른 AI에게 그대로 맡길 수 있는 사양)

작성: 2026-07-04, Fable 5. 배경: docs/ai-behavior-observability-plan.md. 이 문서는 그 계획의 **구현 지시서**다.
산출물 3개: (A) 행동 인구조사 프로브 (B) 리플레이 뷰어 (C) npm 별칭. 순서대로 만들 것. A만 있어도 가치 있음.

## 구현/검증 상태 (2026-07-05 Codex)

- 산출물 A/B/C는 이미 존재 확인: `tools/check-behavior-census.cjs`, `tools/behavior-census-report.cjs`, `tools/replay-viewer.html`, `package.json`의 `npm run census`.
- 설계도 보완점도 반영되어 있다: `fireRifleAtPoint`, `throwGrenade`, `tryThrowGrenade`, `enterProne`/`clearProne`, fire-move 진단, 2단계 로비(`#entryMainGuest`→`#entryEnterButton`→`#deploymentStart`) 진입을 모두 다룬다.
- 검증 실행 1: `npm run census` → `reports/playtests/behavior-census-20260705092057/` 생성. 360 frames, 212 events, report/result 출력 확인. point shot 0, fireMoveOk 0, teamworkRatio 0, grenade ok 1, proneEnter 12.
- 검증 실행 2: `npm run census` → `reports/playtests/behavior-census-20260705092542/` 생성. fireMoveOk 1075, `assault-fire-move`/rifle 성공 재확인, point shot 8, teamworkRatio 0.007, grenade ok 1, proneEnter 29.
- 판정: 1회차 fireMoveOk 0은 런 편차로 보고, 도구/상태 split 회귀는 아님. 다음 작업은 census 구현이 아니라 결과 해석/행동 수정이다. 우선순위 후보: 지원사격 `fireRifleAtPoint` 실제 발동률, 낮은 teamworkRatio, 수류탄 `no-ammo`/`no-visible-or-usable-report` 병목.
- 2026-07-05 Codex 지원사격 1차: `src/ai/infantry-support-fire.js`에서 지원/경계 임무 중인 지원화기가 직접 표적을 볼 때도 일부 사격을 `fireRifleAtPoint`로 전환한다. `reports/playtests/behavior-census-20260705105455/` 기준 point shot 13, suppressionShotRatio 0.049, teamworkRatio 0.015였고, 최종 `reports/playtests/behavior-census-20260705111016/` 기준 point shot 76, suppressionShotRatio 0.129, teamworkRatio 0.058까지 올랐다. 목표 0.20~0.40에는 아직 미달. cadence 없는 전환은 tempo가 흔들려 폐기했고, 현재 값은 `supportTask ? 2 : 3` cadence로 제한한다.
- 2026-07-05 Codex 계측 보강: `tools/check-behavior-census.cjs`가 `no-support-source`를 `no-support-weapon` / `support-suppressed` / `support-state-not-ready` 등으로 다시 쪼개 `Fire-Move No Support Reasons`에 기록한다. 120초 검증 `reports/playtests/behavior-census-20260705112120/` 기준 `no-support-weapon 109`, `support-suppressed 77`, `support-state-not-ready 6`. 다음 D2 행동 수정은 지원사격 cadence 추가 상향이 아니라 분대 내 지원화기 부재/제압으로 fire-move가 끊기는 구조를 봐야 한다.
- 2026-07-05 Codex 폐기 실험: `hold-wall` 돌격조 fire-move 개방은 `reports/playtests/behavior-census-20260705113008/`에서 fireMoveOk 0으로 흔들렸고 tempo 1회차 prone 0.08/첫 사망 0.5초가 나와 커밋 전 되돌렸다. 다음은 `hold-wall` 광역 개방이 아니라 역할/모드별 차단 진단을 더 좁혀야 한다.
- 2026-07-05 Codex 계측 보강 2: `blocked-mode`를 모드뿐 아니라 `mode:role`, `mode:weapon`으로도 출력해 `hold-wall`/`fallback` 차단이 돌격조 문제인지 지원/정찰/무기 구성 문제인지 분리한다. 60초 검증 `reports/playtests/behavior-census-20260705114311/` 기준 `hold-wall:support 276`, `hold-wall:security 184`, `hold-wall:rifle 460`으로, 방금 폐기한 "돌격조 hold-wall 개방"이 핵심이 아님을 확인했다.

## 공통 원칙
- 게임 코드는 **수정하지 않는다**. 모든 계측은 런타임 후킹(프로토타입 메서드 래핑)으로 한다. 전례: `tools/check-suppression-flow.cjs`가 이미 이 패턴 사용.
- 하네스 골격은 `tools/check-battlefield-tempo.cjs`를 복사해서 시작 (정적 서버 스폰 → 헤드리스 크롬 스폰 → CDP Runtime.evaluate로 페이지 시나리오 주입 → JSON 회수 → reports/ 저장). 포트만 4210/9250으로 변경.

## Codex 검토 보완 (구현 전 반드시 반영)

결론: 설계 방향은 맞다. 다만 현재 전투 코드는 `fireRifle`만 보면 AI 지원사격의 핵심 경로를 놓친다. "AI의 눈" v1은 아래 보완을 포함해야 실제 제압사격/수류탄/엎드림을 믿을 수 있게 측정한다.

1. `IronLine.combat.fireRifleAtPoint`도 함께 래핑한다.
   - 이유: `src/ai/infantry-support-fire.js`는 지원사격/제압사격을 `fireRifleAtPoint`로 실행한다.
   - `fireRifle`만 세면 "보이는 표적에게 직접 쏜 사격" 위주가 되고, 정작 보고 위치/엄폐물에 뿌리는 제압사격이 누락된다.
   - 이벤트 타입은 `shot` 하나로 유지하되 `mode: "target"` / `mode: "point"`를 넣는다. `mode:"point"`는 v1에서 제압사격 후보로 본다.

2. 수류탄은 `tryThrowGrenade`만 보지 말고 `IronLine.combat.throwGrenade` 호출도 기록한다.
   - `tryThrowGrenade`는 AI 의사결정 성공/실패를 보는 데 좋고, `throwGrenade`는 실제 투사체 생성 여부를 보는 데 좋다.
   - v1에서는 명중/피해까지 완벽히 추적하지 않아도 된다. 단, "AI가 던지려고 했는가"와 "실제로 던져졌는가"는 분리한다.

3. 사망 이벤트는 v1에서 원인 불명이어도 허용하되, 리포트에 한계로 표시한다.
   - 0.5초 생존 집합 비교는 안정적이지만 누가 죽였는지는 모른다.
   - 이후 v2에서 `takeDamage`/폭발/차량 사격까지 연결해 사망 원인을 붙인다.

4. 게임 진입은 현재 로비와 과거 프로브를 모두 견디게 만든다.
   - `#entryMainGuest`가 있으면 먼저 클릭하고, 없어도 실패하지 않는다.
   - 그 다음 `#entryEnterButton`, `#deploymentStart` 순서로 클릭한다.
   - 기존 프로브들처럼 `#entryEnterButton`만 누르는 경로는 현재 2단계 로비에서 깨질 수 있다.

5. v1의 목표는 "완벽한 전장 분석기"가 아니라 "없는 줄 알았던 행동을 찾는 인구조사"다.
   - 먼저 수류탄/유탄 발동률, 지원사격 발동률, prone 진입/유지, 분업 비율을 얻는다.
   - 이 수치가 나온 뒤에만 수류탄 임계값, 지원사격 거리, 엎드림 유지시간을 건드린다.

## (A) tools/check-behavior-census.cjs

### 게임 진입 (2026-07-04 로비 개편 반영 — 중요)
엔트리가 2단계다. 시나리오에서 순서대로:
```js
document.querySelector("#entryMainGuest")?.click();   // 메인화면 게스트 입장
setTimeout(() => document.querySelector("#entryEnterButton")?.click(), 150); // 로비 시작
setTimeout(() => document.querySelector("#deploymentStart")?.click(), 400);  // 전투 시작
```
`game.aiScaleReadiness?.applyProfile?.("ai-15v15")`는 tempo 프로브와 동일하게 클릭 전에 호출.

### 후킹 지점 (전부 window.IronLine 밑, 페이지 컨텍스트에서 래핑)
| 계측 대상 | 후킹 | 기록 |
| --- | --- | --- |
| 소화기 직접 사격 | `IronLine.combat.fireRifle` 래핑 | shooter id/team/무기 id, 사격 순간 `IronLine.physics.hasLineOfSight(game, shooter, target, {padding:3})` 결과, `mode:"target"` |
| 위치/제압 사격 | `IronLine.combat.fireRifleAtPoint` 래핑 | shooter id/team/무기 id, aimX/aimY, `mode:"point"`; 지원사격/보고 위치 사격을 놓치지 않기 위한 필수 보완 |
| 수류탄/유탄 투척 | `IronLine.InfantryAI.prototype.tryThrowGrenade` 래핑 | 호출/성공(반환값) 구분, 무기 id(grenade/grenadeLauncher), 표적 좌표 |
| 실제 투척 생성 | `IronLine.combat.throwGrenade` 래핑 | AI 판단 성공과 실제 투사체 생성을 분리해서 기록 |
| 투척 후보 탈락 사유 | `IronLine.InfantryAI.prototype.selectGrenadeTargetBudgeted` 래핑 | 반환 null 횟수. **사유 분포는 v2**: 사유별 카운트가 필요하면 이 함수 내부 분기에 카운터를 넣어야 하므로, v1은 "호출 대비 null 비율"만 기록 |
| 엎드림 | `enterProne`/`clearProne` 래핑 (suppression-flow와 동일) | 진입/해제 횟수, 해제 시점의 this.state (어떤 상태가 prone을 깨는지) |
| 사망 | tempo 프로브 방식 재사용 (0.5초 샘플에서 생존 집합 비교) | |
| 분업(사격-기동) | 0.5초 샘플에서 분대별로 "이번 틱에 사격한 대원 수 & 9px 이상 이동한 대원 수" 동시 기록 | 둘 다 ≥1인 틱 비율 = 분업 지표 |

### 0.5초 샘플 스키마 (리플레이 공용 — 이게 핵심 데이터 계약)
```json
{
  "meta": { "startedAt": "...", "profile": "ai-15v15", "durationMs": 180000, "intervalMs": 500 },
  "frames": [{ "t": 12.5,
    "units": [{ "id": "B-1-2", "team": "blue", "x": 1204, "y": 833, "hp": 55,
                 "state": "fire", "sup": 34, "prone": true, "squad": "B-1" }] }],
  "events": [
    { "t": 13.1, "type": "shot", "mode": "target", "from": "B-1-2", "weapon": "machinegun", "los": false,
      "x": 1204, "y": 833, "tx": 1620, "ty": 790 },
    { "t": 13.6, "type": "shot", "mode": "point", "from": "B-1-1", "weapon": "machinegun",
      "x": 1194, "y": 820, "tx": 1580, "ty": 810 },
    { "t": 14.0, "type": "grenade", "ok": true, "from": "R-2-1", "weapon": "grenade", "tx": 0, "ty": 0 },
    { "t": 15.5, "type": "prone-enter", "from": "B-1-3" },
    { "t": 18.2, "type": "death", "id": "R-2-4" }
  ]
}
```
frames는 유닛 30명 × 360틱 ≈ 11k 레코드 — JSON 수 MB, 문제없음. events는 상한 20,000개(FIFO)로 캡.

### 리포트 (report.md) — 목표 대역과 PASS/FAIL
| 지표 | 계산 | 목표 |
| --- | --- | ---: |
| 수류탄 투척(성공) | grenade ok==true, weapon==grenade | 4~10회 |
| 유탄 발사 | 〃 weapon==grenadeLauncher | 6~15회 |
| 투척 시도 대비 성공률 | ok / 호출 | > 0.3 (미달이면 임계값 병목) |
| 제압사격 비율 | shot 중 `mode=="point"` 또는 `los==false` | 0.20~0.40 |
| 분업 비율 | 분대 틱 중 사격≥1 && 이동≥1 | > 0.30 |
| prone 진입 / 평균 유지 | prone-enter 수, enter→exit 간격 평균 | 30회+ / 2초+ |
결과 폴더: `reports/playtests/behavior-census-<stamp>/` (result.json + report.md).

## (B) tools/replay-viewer.html — 단일 HTML, 외부 의존성 0
- `<input type="file">`로 result.json 로드 (file:// 로 열어도 동작해야 함 — fetch 금지, FileReader 사용).
- 캔버스 1개: 프레임 units를 점으로 (blue/red 원, prone이면 납작, hp 비례 투명도, 클릭하면 해당 유닛 팔로우 + 우측 패널에 state/sup 표시).
- 이벤트 마커: shot은 from→(tx,ty) 선 0.3초 잔상 (los==false는 점선 = 제압사격이 눈에 보임), grenade는 노란 원, death는 ×를 5초 유지.
- 컨트롤: 슬라이더(t), 재생/정지, 배속 1/4/16, 이벤트 종류별 체크박스 필터, "다음 grenade 이벤트로 점프" 버튼 (검증할 장면 빨리 찾기용).
- 좌표계: frames의 min/max로 자동 fit. 배경은 회색 그리드면 충분 (맵 지오메트리 렌더는 v2).

## (C) package.json scripts에 추가
```json
"census": "node tools/check-behavior-census.cjs",
"tempo": "node tools/check-battlefield-tempo.cjs"
```
(npm run 경유가 권한 프롬프트를 피할 가능성이 높음 — 이 환경 특성.)

## 함정 주의 (이걸 어겨서 시간 날리지 말 것)
1. `fireRifle` 래핑 시 반환값을 그대로 돌려줄 것 (fired 여부를 AI가 씀). hasLineOfSight 호출은 fired==true일 때만 (성능).
2. tracers.push 후킹(tempo 프로브)과 fireRifle 래핑을 동시에 쓰면 이중 집계 — census에서는 fireRifle만 쓸 것.
3. 유닛 id는 `unit.callSign || unit.id`, 분대는 `unit.squad?.id || unit.squadId` — 없으면 "?" 허용하고 죽지 말 것.
4. 게임 로드 실패/매치 미시작 시 12초 타임아웃 후 명확한 에러로 종료 (tempo 프로브의 waitForLive 패턴 복사).
5. 크롬 경로: `process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe"`.
6. 검증 완료 기준: census 1회 실행 → report.md에 표가 나오고, 같은 result.json을 viewer로 열어 임의 grenade 이벤트 장면이 재생되면 완료.
7. `fireRifleAtPoint`를 빼면 현재 지원사격 시스템을 못 본다. 이 상태의 제압사격 비율은 신뢰하지 말 것.
