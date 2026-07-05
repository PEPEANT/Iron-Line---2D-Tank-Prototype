# 침대전투 버그 / 전투불능 흐름 계획

2026-07-04 기준 결론: 고폭탄, 포격, 폭발, 강한 제압 뒤 AI가 오래 누워 있기만 하는 체감은 `침대전투 버그 현상`으로 지정한다. 해결 방향은 "엎드림 삭제"가 아니라 폭발 이후 행동 선택지를 늘리는 것이다. 플레이어 사망도 즉시 종료감이 강하므로 의무병/소생/후송이 들어갈 수 있는 전투불능 흐름으로 재설계한다.

## 현재 검증

- `src/ai/infantry-tactical-decision.js`에는 이미 `tank_he_spread`와 `cluster_spread` 판단이 있다. 즉 산개 개념은 존재한다.
- 하지만 `src/ai/infantry-suppression-posture.js`가 제압 상태에서 `prone-fire`를 강하게 유지하고, `src/ai/infantry-ai.js`도 `suppressed`, `support-fire`, `hold-wall`에서 엎드림과 정지 사격을 자주 선택한다.
- 그래서 코드상 산개가 있어도, 실제 화면에서는 폭발 후 "빠져서 산개한다"보다 "누워서 버틴다"가 더 크게 보일 수 있다.
- 플레이어는 `src/main.js`에서 HP가 0이 되면 `beginPlayerDowned()`로 약 2.15초 전투불능 상태가 된 뒤 `handlePlayerDeath()`로 넘어간다.
- 현재 사망 UI는 `index.html`의 `deathScreen`, `src/systems/hud.js`의 `updateDeathScreen()`, `src/systems/renderer.js`의 전투불능 오버레이로 나뉘어 있다.
- 섬멸전 사망 버튼은 현재 `restartMatchAfterDeath()`를 통해 전투를 다시 시작하는 흐름이다. R1 방향에서는 섬멸전 사망 후 `메인화면으로 가기`가 기본이어야 한다.

## 버그 정의

`침대전투 버그 현상`:

- 고폭탄, 수류탄, 전차포, 자폭드론, 향후 박격포/대전차포 같은 폭발성 위협 뒤에 AI가 누워 있기만 하고 다음 전술 행동으로 이어지지 않는 현상.
- "엎드림" 자체는 정상 행동이다. 문제는 엎드림이 최종 상태처럼 보이고, 산개/후퇴/반격/구조/후송으로 이어지는 루프가 약한 것이다.
- 이 버그는 밸런스 수치 문제가 아니라 전술 행동 후보 부족과 우선순위 문제로 본다.

## 최선의 해결 방향

### 아이템 / 행동 후보 부족 판단

플레이 판단상 침대전투는 엎드림 수치만의 문제가 아니다. 누운 뒤 선택할 수 있는 아이템과 행동 후보가 부족해서 "아무것도 안 한다"로 보인다.

- 소총수는 전차를 크게 파괴하지 못해도 견제 사격, 표적 지정, 연막 요청 같은 행동을 가져야 한다.
- 지원화기 병사는 누워서 제압사격을 유지할 명확한 역할이 있어야 한다.
- RPG/공병은 누워 버티는 대신 장갑 위협을 찾고 사격 각도를 잡아야 한다.
- 향후 박격포, 대전차포, 설치화기는 "누운 뒤 할 일"을 제공하는 전술 아이템이 된다.
- 의무병/후송은 폭발 뒤 전투불능 아군을 살리는 별도 행동 후보가 된다.

전차에 소화기 피해를 크게 넣자는 뜻은 아니다. 핵심은 AI가 전차 앞에서 무력하게 멈춘 것처럼 보이지 않게 만드는 것이다.

1. 폭발 직후 1차 반응을 나눈다.
   - 가까운 폭발: 즉시 산개 또는 엄폐 이동.
   - 먼 폭발/기관총 제압: 엎드려 사격 유지.
   - 반복 폭발: 현재 위치 포기 후 후퇴 또는 측면 이동.
   - 장갑 위협 확인: RPG병, 대전차포, 박격포 요청 같은 대항 행동 후보로 전환.

2. 누워 있는 시간을 끝내는 조건을 만든다.
   - 근처에 다음 엄폐 지점이 있으면 `prone-fire`에서 `cover-move`로 전환.
   - 분대장이 생존했고 이동 명령이 있으면 일정 시간 뒤 산개 이동.
   - 지원화기가 있으면 일부만 엎드리고, 소총수는 기동.
   - 폭발 위험이 계속되면 같은 자리 엎드림을 실패 행동으로 기록.

3. 부상병/의무병/후송 루프를 추가할 수 있게 설계한다.
   - 즉시 사망과 부상 상태를 분리한다.
   - 다운된 보병은 일정 시간 동안 `wounded` 상태로 남는다.
   - 의무병 또는 근처 분대원이 접근하면 응급처치.
   - 차량/험비가 있으면 부상병 후송 행동을 만들 수 있다.
   - 이 시스템은 나중에 "전장 대화"보다 먼저 체감되는 AI 리얼리티가 될 가능성이 높다.

## 전투불능 / 사망 UI 방향

현재 목표는 새 기능 대량 구현이 아니라, 사망 체감을 AI 티 덜 나게 바꾸는 것이다.

- HP 0 → 바로 사망 화면이 아니라 전투불능 상태.
- 화면은 점점 어두워지고 시야가 좁아진다.
- n초 안에 의무병/아군 소생이 없으면 사망.
- 사망 화면은 장식 카드보다 짧은 텍스트 중심:
  - `사망`
  - `원인: 고폭탄 / 소총탄 / 전차 기관총 / 자폭드론`
  - `메인화면으로 가기`
- 섬멸전에서는 `다시 시작`을 기본으로 두지 않는다. 사망 후 메인화면으로 보내는 쪽이 R1 첫 체감에 더 안전하다.
- 점령전이나 향후 라운드 모드는 별도 규칙으로 리스폰을 허용한다.

## 구현 순서 제안

### 1단계: 계측만 추가

- 폭발 반경 안 AI가 10초 안에 어떤 상태로 갔는지 카운트한다.
- 카운터 예시:
  - `blast:prone-only`
  - `blast:spread`
  - `blast:cover`
  - `blast:fallback`
  - `blast:rpg-response`
  - `blast:wounded`
- 목표는 "누워 있기만 하는 비율"을 숫자로 잡는 것이다.

### 2단계: 침대전투 최소 완화

- 폭발 위협에는 엎드림보다 산개/엄폐 이동 가중치를 우선한다.
- 같은 자리 `prone-fire`가 일정 시간 이상 유지되면 강제로 다음 후보를 찾는다.
- 지원화기만 오래 엎드리고, 돌격/소총수는 이동 후보를 더 빨리 본다.

### 3단계: 전투불능 UI 정리

- 기존 `deathScreen`을 단순 텍스트형으로 다시 만든다.
- 섬멸전 사망 버튼은 `메인화면으로 가기` 하나로 정리한다.
- 전투불능 오버레이는 "상황 확인" 문구보다 시야 암전과 원인 표시 중심으로 바꾼다.

### 4단계: 부상병 소생 / 끌기 후송

- 플레이어와 AI 모두 `downed/wounded/dead` 상태를 분리한다.
- 소생은 병과가 아니라 아이템이다 (2026-07-04 보급/장비 개편 결정): 치료킷 상시 보유 → 누구나 소생 가능. "의무병 병과 신설" 항목은 폐기.
- 후송 차량은 나중에 붙이되, 먼저 응급처치 루프부터 만든다.

**끌기(드래그) 후송 상세 (2026-07-05 사용자 결정):**

- 다운된 유닛을 `E키`(상호작용)로 잡아서 끌고 이동할 수 있다. 플레이어와 AI 공통.
- **끌리는 동안 생존 타이머가 연장된다** — "누군가 나를 끌고 가는 중"이 곧 희망이므로. 수치는 계측 후 튜닝 (예: 감소 속도 절반).
- AI는 다운된 아군을 안전지대(엄폐 뒤, 폭발 반경 밖)로 끌고 간다. 안전지대 판정은 기존 전술맵 cover node를 재사용.
- **폭격/고폭탄 피격 = 즉사 아님**: 치명 피해도 우선 `wounded`로 떨어지고, 끌기/소생 창이 열린다. (예외: 전차 직격 등 명백한 즉사만 `dead` 직행 — 목록은 계측 후 확정.)
- 끄는 유닛은 이동속도 감소 + 무기 사용 불가 (한 손 견인). 끌기를 끊으면 그 자리에서 타이머 재개.
- 북극성 직결: "쓰러진 나를 분대원이 끌고 간다"는 '전쟁에서 혼자가 아니다'의 가장 강한 장면이다.

**시체 표현 개선 (같은 단계에서):**

- 현재 시체/사망 포즈 디자인 품질이 낮음 (2026-07-05 사용자 판정). `deathPoseAngle` 기반 현 표현을 재작업.
- 방향: wounded(움직임 있는 쓰러짐, 소생 대상 표시) / dead(정적, 시간 경과 후 페이드 또는 잔류 선택) 시각 구분이 우선, 화려함은 불필요.
- 에셋팩 슬롯(`unit.death-pose` 등)으로 만들어 그림 교체 가능하게 — 스킨 엔진 규약 재사용.

### 5단계: 대전차/박격포/설치화기 대응

- RPG병은 폭발 후 누워 있기보다 장갑 위협을 찾는다.
- 향후 박격포나 대전차포는 "엎드림 이후 할 일"을 제공하는 자산으로 둔다.
- 이 단계는 에셋/무기 UI/AI 명령이 함께 필요하므로 R1 직전 필수는 아니다.

## 하지 말아야 할 것

- 엎드림을 단순히 약화하거나 삭제하지 않는다.
- 고폭탄 피해량만 올리거나 내리는 식으로 해결하지 않는다.
- 의무병, 후송차, 박격포, 대전차포를 한 번에 구현하지 않는다.
- 사망 화면을 화려한 카드 UI로 키우지 않는다.

## 다음 세션에 맡길 첫 작업

첫 구현 작업은 `침대전투 계측`이다. 폭발 발생 뒤 주변 AI가 `prone-only`로 끝나는지, 산개/엄폐/후퇴/반격으로 이어지는지를 숫자로 잡는다. 이 수치 없이 엎드림 계수부터 만지면 다시 감으로 튜닝하게 된다.

## 2026-07-05 1단계 계측 구현 기록

- `tools/check-bed-combat-census.cjs`와 `npm run bed:combat`을 추가했다.
- 계측은 런타임 훅 전용이다. `damageRadius()`가 만든 폭발 뒤 10초 동안 보병 상태를 관찰하며 AI 행동, 피해량, 이동, 무기, 사거리, 의사결정 가중치는 바꾸지 않는다.
- 집계 항목은 `blast:prone-only`, `blast:spread`, `blast:cover`, `blast:fallback`, `blast:rpg-response`, `blast:wounded`, `blast:no-response`다.
- `blast:wounded`는 현재 AI wounded/downed 상태가 없으므로 HP 감소 또는 사망 관측값이다. 실제 후송/소생 행동 설계는 4단계 또는 보급/장비 C단계 이후로 남긴다.
- 출력 위치는 `reports/playtests/bed-combat-census-*/report.md`와 `result.json`이다.

### 2026-07-05 계측 실행 결과

- 자연 15v15 120초 1차 실행에서는 `damageRadius()` 폭발 표본이 0개였다. 따라서 침대전투 계측은 자연전만으로는 샘플이 비는 문제가 확인됐다.
- 프로브 전용 통제 폭발(`bed_probe_blast`)을 추가한 뒤 120초 실행: 폭발 8회, 폭발-유닛 반응창 63개.
- 10초 반응창 집계: `blast:fallback` 40, `blast:prone-only` 23, `blast:wounded` 49. `blast:wounded`는 보조 플래그라 주 반응 카운트에서는 fallback/prone-only와 겹칠 수 있다.
- `proneOnlyRatio`는 0.365, `noResponseRatio`는 0, 최초 반응 p50/p90은 0.27초/10.25초.
- 해석: 현재 폭발 뒤 완전 무반응은 아니지만, 약 3분의 1은 산개/엄폐/RPG 반응 없이 엎드림만으로 끝난다. 다음 판단은 Fable 설계 또는 2단계에서 산개/엄폐 우선순위만 다루고, 설치류/보급/소생 구현으로 문제를 덮어 고치지 않는다.

## 2026-07-05 사망 UI 간소화 구현 기록

- 사망 화면은 `사망` / `원인: ...` / 기본 버튼 하나로 정리했다.
- 섬멸전/일반 사망의 기본 버튼과 Enter 입력은 `메인화면으로 가기`로 바꿨다. 정복전 진행 중에는 기존 즉시 리스폰 흐름을 유지한다.
- 사망 화면에 붙던 병과 변경 보조 버튼은 숨겼다. 병과/장비 개편은 `supply-loadout-blueprint.md`의 보급/장비 단계에서 따로 다룬다.
- 전투불능 오버레이는 `상황 확인` 문구를 제거하고 원인 표시 중심으로 줄였다.

## 2026-07-05 침대전투 선행 구조 분리 기록

- `src/ai/infantry-ai.js`의 큰 `update()` 안에 있던 제압 반응, 수리, 수류탄, 접촉 교전, 보고 접촉, 기본 전진 처리를 `src/ai/infantry-ai-update-handlers.js`로 분리했다.
- 목적은 행동 튜닝이 아니라 다음 침대전투 2단계(폭발 후 산개/엄폐 우선순위)를 넣을 수 있는 자리 만들기다. AI 가중치, 피해량, 무기 사거리, 엎드림 임계값은 바꾸지 않았다.
- `npm run check` 통과. 래칫 기준은 `src/ai/infantry-ai.js` 2849줄에서 2724줄로 내려갔다.
- `npm run bed:combat`: `reports/playtests/bed-combat-census-20260705075449/` 기준 폭발 8회, 반응창 48개, `blast:fallback` 29, `blast:prone-only` 19, `proneOnlyRatio` 0.396, `noResponseRatio` 0.
- 해석: 구조 분리 뒤에도 계측은 정상 작동한다. prone-only 비율은 기존 0.365와 같은 문제권이라, 다음 실제 행동 작업은 설치류/보급/소생으로 덮지 말고 폭발 후 산개/엄폐 전환만 좁게 다룬다.

## 2026-07-05 침대전투 2단계 최소 완화 기록

- `src/ai/infantry-blast-response.js`를 추가했다. 본편 `damageRadius()`를 감싸 폭발 반경 안의 적 보병에게 짧은 `lastBlastThreat`를 기록하고, `InfantryAI.update()`가 제압/엎드림 분기 전에 `handleBlastResponse()`를 먼저 확인한다.
- 새 행동 후보는 기존 `tacticalSpreadTarget()`과 `resolveCoverTarget()`만 재사용한다. 새 피해량, 새 무기, 새 설치류, 새 소생 행동은 추가하지 않았다.
- 너무 강한 엄폐 이동은 전장 deaths/min을 4 이하로 눌러 폐기했다. 최종값은 아주 가까운 폭발(`pressure >= 0.62`) 또는 반복 폭발에서만 선제 엎드림 홀드를 양보하고, 반응 시간은 0.42초로 제한한다.
- `npm run bed:combat`: `reports/playtests/bed-combat-census-20260705084828/` 기준 폭발 8회, 반응창 55개, `blast:cover` 5, `blast:spread` 14, `blast:fallback` 19, `blast:prone-only` 16, `proneOnlyRatio` 0.291, `noResponseRatio` 0.
- 해석: 완전 해결은 아니지만 구조 분리 직후 0.396보다 낮다. 전장 템포를 깨지 않는 선에서 "누워 있기만 함"을 일부 산개/엄폐/후퇴로 돌린 첫 완화로 본다.

### 2026-07-05 재검증

- `npm run bed:combat`: `reports/playtests/bed-combat-census-20260705092940/` 기준 폭발 8회, 반응창 38개.
- 주 반응 집계: `blast:cover` 24, `blast:fallback` 5, `blast:spread` 3, `blast:prone-only` 6.
- `proneOnlyRatio`는 0.158, `noResponseRatio`는 0, 최초 반응 p50/p90은 0.25초/0.5초.
- 판정: 계측 스크립트와 2단계 완화는 최신 코드에서도 정상 작동한다. 단일 실행 기준으로는 이전 0.291보다 더 낮지만, 폭발 반응창 수가 38개라 이후 침대전투/보급/소생 판단에는 반복 샘플을 계속 같이 본다.

## 2026-07-05 시체/다운 표현 1차 구현 기록

- `src/systems/renderer-corpse.js`를 추가해 `drawInfantryCorpse()`를 렌더 확장 모듈로 분리했다. `renderer.js` 본체 변경은 플레이어 다운 상태를 `{ wounded: true }`로 넘기는 호출 1줄뿐이다.
- wounded/downed 표현은 노란 점선 링과 더 살아 있는 팀 색상 몸체로, dead 표현은 낮은 채도와 정적인 그림자로 구분한다.
- 에셋팩 교체를 위해 `unit.death-pose` 스타일 슬롯을 먼저 읽고, 없으면 벡터 fallback을 쓴다.
- `npm run corpse:render`: `Corpse renderer check passed`.

## 2026-07-05 Codex death UI contract re-lock

- 실제 코드에서 정복전 사망 버튼/Enter가 즉시 재출격으로 갈 수 있던 경로를 제거했다.
- 사망 화면은 `사망` / `원인: ...` / `메인화면으로 가기`만 표시한다. 리스폰 카운트다운 문구와 `R` 재출격 단축키는 사망 화면 계약에서 제외했다.
- `npm run death:ui`가 이 계약을 검사하며, `npm run check`에 포함된다.
- 범위 제한: 소생, E키 끌기, AI 안전지대 판단, wounded/dead 상태머신은 아직 구현하지 않았다.

## 2026-07-05 Bed combat prone-only diagnostics

- `tools/check-bed-combat-census.cjs` now breaks blast-window primary responses down by weapon, class, prone-only state counts, movement bands, and initial/final suppression bands. Behavior logic was not changed.
- Verification run: `reports/playtests/bed-combat-census-20260705115206/`.
- Result: 8 controlled blasts, 37 blast-unit windows, `blast:cover` 22, `blast:fallback` 5, `blast:spread` 3, `blast:prone-only` 7. `proneOnlyRatio` = 0.189, `noResponseRatio` = 0.
- Prone-only split: all 7 were `rifle`; classes were infantry 4 and engineer 3. State counts inside those windows were only `prone-fire` (176 samples), movement band was `0-12` for all 7, initial suppression was `50-75` for all 7, and final suppression was `50-75` for 4 / `75+` for 3.
- Interpretation: the remaining issue is not missing blast recognition. The AI responds, but some rifle infantry/engineer units stay in `prone-fire` under medium-to-high suppression without transitioning to spread/cover/fallback inside the 10s window. Next behavior work should be a narrow prone-fire exit/transition rule for non-support rifle units, not a broad prone deletion or cover buff.
