# 전장 템포 진단 리포트 (Battlefield Tempo Diagnosis)

작성: 2026-07-03, Claude Fable 5
목적: "전장이 난잡하다 / AI가 너무 빨리 쏜다 / 교전이 이해되기 전에 끝난다"는 체감의 원인을 코드 근거 + 실측 데이터로 확정한다. 새 기능 제안이 아니라 현재 상태의 정량 진단이다.

## 측정 방법 (재현 가능)

```powershell
node tools/check-battlefield-tempo.cjs
```

- 헤드리스 크롬, 오프라인 15v15, 180초, 0.5초 간격 샘플링.
- 측정 항목: 유닛 생존시간, 사망 타임라인, 사격량(tracers push 후킹), 교전 거리, 이동/정지 비율, 분대 응집도, 제압 수치, 엎드림 비율, 분대 전술모드 분포.
- 결과는 `reports/playtests/battlefield-tempo-*/`에 저장된다.

## 실측 결과 (2026-07-03, 180초 런)

전투는 3개의 뚜렷한 국면으로 나뉜다:

| 국면 | 시간 | 관찰 |
| --- | --- | --- |
| 1. 빈 행군 | 0초 ~ 78초 | 사격 0발, 사망 0명, 제압 0.4/100. 78초간 아무 일도 없음 |
| 2. 학살 | 78초 ~ 101초 | **첫 사격 0.5초 뒤 첫 사망.** 20초 동안 30명 중 12명 사망 (분당 36명 페이스) |
| 3. 정체 | 101초 ~ 180초+ | 생존자 7/5 고착. hold 모드 지배(52%), 이후 80초간 사망 1~2명 수준 |

핵심 수치:

| 지표 | 측정값 | 해석 |
| --- | ---: | --- |
| 첫 사격 시점 | 78.0초 | 접근 행군이 너무 김 |
| 첫 사망 시점 | 78.5초 | **발견 = 사격 = 사망이 동시 발생** |
| 접촉 후 생존시간 p25/p50/p75 | 7초 / 12초 / 15초 | 교전 국면이 존재하지 않음. 접촉하면 곧 죽음 |
| 접촉 후 분당 사망 | 10.6명 (버스트 구간 36명) | 목표 범위(6~12) 초과, 특히 버스트가 문제 |
| 사격량 | 분당 201발 (교전 개인당 ~6초에 1발) | 개인 페이싱은 정상. 문제는 동시 개방 |
| 교전 거리 p50/p95 | 609px / 755px | 대부분 무기 최대사거리 부근에서 교전 |
| 제압 평균 (접촉 후) | 2.2 / 100 | **제압 시스템이 사실상 휴면 상태** |
| 엎드림 비율 (접촉 후) | 0.00 | **엎드림 시스템이 실전에서 전혀 발동 안 함** |
| 분대 응집도 | 68~110px | 양호. 분대는 뭉쳐서 다님 |
| 이동 비율 (전/후) | 0.55 / 0.66 | 이동-정지 리듬 존재. 양호 |

## 2차 런 (검증, 같은 날)

`reports/playtests/battlefield-tempo-20260703114631/`. 두 번째 180초 런에서 확인된 것:

- **제압 2.17 / 엎드림 0.01은 재현됨** → D2는 런 편차가 아니라 구조적 문제로 확정.
- **첫 사망(58초)이 첫 보병 사격(76.5초)보다 18초 빠름** → 전차/차량 무기가 보병 교전 전에 먼저 킬을 낸다. 개전을 여는 것은 보병이 아니라 차량이며, "first death after contact" 지표가 음수가 될 수 있음(측정 도구는 소화기 tracer만 집계).
- **런 간 편차 큼**: 1차 런은 7 vs 5 고착, 2차 런은 11 vs 2 일방 학살. 첫 접촉 구도가 승부를 거의 결정한다는 D3 진단을 강화하는 증거. 수정 전후 비교 시 최소 2~3회 실행해 평균으로 볼 것.

## 코드 사실 (있는 것 / 없는 것)

있는 것 (작동 확인):
- **빗나감 모델**: `src/systems/combat.js:505-529` — hitChance = 0.78 기본 − 거리감쇠 0.38, 최소 0.22/최대 0.86. 빗나간 탄은 spread 각도로 시각화됨. "헛발질"은 존재한다.
- **사격 페이싱**: `src/ai/infantry-weapon-decision.js:310` — 쿨다운 = 무기 쿨다운 + 0.38 + 랜덤 0.28초. 소총 기준 실사격 간격 ~1.1초 + AI 판단 지연.
- **엎드려쏴**: `src/entities/infantry-unit.js:36` (isProne), `src/ai/infantry-ai.js:228` 전환 로직, 명중 +0.05 / 피탄 −0.06~0.19 / 탄퍼짐 ×0.74. **시스템은 있으나 실측 발동률 0%.**
- **제압 시스템**: 무기별 suppressionHit 11~20 (`src/data/infantry-weapons.js`). **시스템은 있으나 실측 평균 2.2/100.**
- 분대 응집, 이동-관측 리듬, 전술모드 전환: 양호하게 작동.

없는 것:
- **앉아쏴(crouch)**: 존재하지 않음. 자세는 서기/엎드리기 2단계.
- **피격 반응(flinch/hit-react)**: 존재하지 않음. 총에 맞아도 이동·사격이 전혀 끊기지 않는다. (grep: flinch/hitReact/hitStun 0건)
- **발견-조준 지연**: 존재하지 않음. 시야에 들어오면 쿨다운이 도는 전원이 같은 프레임에 사격 개시 가능.
- 보병 hp 55 (`src/entities/infantry-unit.js:16`), 소총 피해 9~13 → 5발 사망. 1:1 TTK는 ~12초로 적정하나, 다수가 동시 집중사격하면 1초 미만.

## 진단 (원인 3개)

### D1. 접촉 순간 전원 동시 개방 → 학살 버스트 (최우선)
78초간 침묵하다가 첫 발견과 동시에 양측 전원이 사거리 끝에서 일제 사격을 시작한다. 발견→조준→사격 사이에 시간이 없고, 첫 사망이 0.5초 만에 나온다. 플레이어 입장에서 "뭐가 어디서 쐈는지 이해하기 전에 아군이 녹는" 체감의 직접 원인.

### D2. 제압·엎드림 레이어가 휴면 → 전투에 리듬이 없음
설계상 "제압당하면 멈추고, 엎드리고, 엄폐한다"가 전장 리듬을 만들어야 하는데, 제압 수치가 평균 2.2/100에 머물러 어떤 행동 변화도 트리거하지 못한다. 원인 후보: (a) 제압 감쇠(decay)가 축적보다 빠름, (b) 유닛이 제압이 쌓이기 전에 죽음(D1과 연결), (c) 엎드림 전환 임계값이 실전 수치 대역과 안 맞음. `src/ai/infantry-ai.js`의 제압 감쇠율과 엎드림 조건 임계값을 실측 대역(피격 시 20~40)에 맞춰 조정 필요.

### D3. 학살 후 정체 → 승부가 첫 접촉에서 끝남
버스트가 끝나면 hold(52%)/fallback(16%)로 굳어 80초간 아무 일도 없다. 수적 우위(7 vs 5)를 잡은 쪽도 재공세하지 않는다. 지휘관 AI에 "우세 판단 → 재공세" 전환이 없거나 약함.

### 참고: 문제가 아닌 것
분대 이동/응집(뭉쳐서 이동), 개인 사격 페이싱(~6초 1발), 빗나감 시각화는 이미 정상 작동한다. "난잡함"의 원인은 이것들이 아니라 D1(동시 개방)과 D2(멈춤 없음)다.

## 권장 수정 (작은 것부터, 한 번에 하나씩 + 재측정)

1. **교전 개시 완충** (D1): 유닛이 새 표적을 처음 획득하면 0.6~1.5초 조준 지연 + 첫 2발 명중 페널티(−0.25 등). 위치: `src/ai/infantry-weapon-decision.js` 표적 획득부. 기대 효과: 첫 사망이 접촉 후 8초+ 뒤로 밀리고, "교전이 시작됐다"는 인지 시간이 생김.
2. **제압 체감 복구** (D2): 제압 감쇠율 하향 또는 축적 상향 → 접촉 후 평균 제압 15+ 목표. 엎드림 전환 임계를 실측 대역에 맞춤 → 접촉 후 엎드림 비율 15%+ 목표. 위치: `src/ai/infantry-ai.js` (제압/엎드림 로직, 552행 부근).
3. **피격 움찔 추가** (D1+D2, 코드 소품): 피격 시 0.1~0.15초 사격 불가 + 이동속도 감소. 파일: `src/entities/infantry-unit.js` takeDamage 경로 + `src/ai/infantry-weapon-decision.js` 사격 가드. 피격모션 "에셋" 없이 코드만으로 타격감·템포 완화 동시 달성.
4. **정체 해소** (D3): 지휘관 AI에 우세 판단(아군 생존 비율 vs 적) 후 hold → advance 재전환. 위치: `src/ai/commander-ai.js`.
5. (선택) 접근 행군 78초가 긴지는 맵 설계 취향 문제. 스폰 간 거리 축소보다는 행군 중 이벤트(정찰 접촉, 포격 경고)가 나중 과제.

각 수정 후 `node tools/check-battlefield-tempo.cjs` 재실행. 목표 대역:

| 지표 | 현재 | 목표 |
| --- | ---: | ---: |
| 접촉 후 첫 사망 | 0.5초 | > 8초 |
| 접촉 후 생존 p50 | 12초 | 20~30초 |
| 접촉 후 분당 사망 | 10.6 (버스트 36) | 6~12 (버스트 < 20) |
| 접촉 후 제압 평균 | 2.2 | > 15 |
| 접촉 후 엎드림 비율 | 0% | > 15% |
| 분대 응집도 | 68~110px | 유지 (< 150px) |

## 다음 작업자(사람/AI)를 위한 인수인계

- 이 리포트의 측정치 재현: `node tools/check-battlefield-tempo.cjs` (크롬 필요, ~3.5분 소요).
- 이 진단은 2026-07-03 세션의 다른 수정들과 같은 워크트리에 있다. **모두 미커밋 상태**이니 먼저 커밋할 것: (1) AI V2 승인 루프 봇 자동승인 + 무전 채팅 노출 (`src/ai/squad-v2-first-pass.js`, `src/systems/battlefield-events.js`), (2) 비호스트 월드스테이트 스냅+보간 버퍼 (`src/main.js`), (3) 이 리포트 + `tools/check-battlefield-tempo.cjs`.
- 수정 착수 순서는 위 권장 수정 1→2→3→4. 하나 고칠 때마다 템포 프로브 재실행해서 목표 대역과 비교하고, 이 문서 하단에 전/후 수치를 추가할 것.
- 관련 문서: `docs/ai-doctrine-v2.md` (설계 의도), `docs/ai-and-combat-architecture.md` (구조).

## Codex 1차 수정 결과 (2026-07-03)

적용한 수정:
- `src/ai/infantry-ai.js`: 새 표적 획득 시 반응/조준 지연을 늘리고, 첫 2발에 명중 페널티를 준다.
- `src/ai/infantry-fire-tempo.js`: 초탄 페널티와 엎드림 진입 임계값 계산을 큰 `infantry-ai.js` 밖으로 분리했다.
- `src/entities/infantry-unit.js`: 피격 시 짧은 `hitReactTimer` / `hitSlowTimer`를 추가하고 제압 회복/상태 임계값을 낮췄다.
- `src/systems/combat.js`: 빗나간 탄과 근접탄의 제압 압력을 소폭 올렸다.
- `src/systems/online-world-state-buffer.js`: Fable 5의 온라인 worldState 보간 버퍼를 `main.js` 밖으로 분리했다.

검증:
- `npm run check` PASS.
- `npm run check:online` PASS.
- `reports/playtests/battlefield-tempo-20260703120353/` 기준, 접촉 후 사망 속도는 10.6명/분에서 8.6명/분으로 목표권에 들어왔다.
- 같은 런에서 접촉 후 생존 p50은 12초에서 64초로 늘었고, 제압 평균은 2.2에서 6.56, 엎드림 비율은 0%에서 4%로 올라갔다.

판단:
- D1(첫 접촉 학살 버스트)은 크게 완화됐다.
- D2(제압/엎드림이 전장 리듬을 만드는 문제)는 일부만 개선됐다. 엎드림이 화면에 확실히 보이는 수준은 아직 아니다.
- 이후 작업은 더 강한 수치 튜닝보다, 제압 수치가 높은 유닛의 행동 선택을 직접 관찰하는 디버그/리플레이 확인이 먼저다.

## Codex 제압 추적 패스 (2026-07-03)

추가 도구:
- `tools/check-suppression-flow.cjs`: 런타임에서 `InfantryUnit.suppress()`, `takeDamage()`, `updateSuppression()`, `InfantryAI.enterProne()/clearProne()`, `combat.fireRifle()`을 후킹해 제압 입력/감쇠/임계값/엎드림 전환을 추적한다.

진단 결과:
- 제압이 아예 안 들어가는 것은 아니다. `reports/playtests/suppression-flow-20260703124438/` 기준 30명 중 17명이 한 번 이상 suppression 30 이상까지 올라갔고, 유닛 최대 제압 p50도 76.96이었다.
- 낮은 평균 제압의 핵심 원인은 "입력 부족"보다 "짧은 고제압 스파이크 + 즉시 이동/엄폐 루프로 전환"이다.
- 특히 `moveTo()`는 이동 시작 시 prone을 해제한다. 그래서 고제압 유닛도 엄폐 이동이나 재탑승/이동 상태로 넘어가면 엎드림이 화면에 오래 남지 않는다.

적용한 작은 수정:
- `src/ai/infantry-ai.js`의 suppressed 분기에서, 비차량 위협이고 suppression 52 이상이면 엄폐 이동 전에 1.65초 동안 짧게 `prone-fire` 상태로 버티게 했다.

검증:
- `reports/playtests/suppression-flow-20260703125206/`: prone 경험 유닛 6명 → 17명, prone 전환 10회 → 39회.
- 같은 런의 90~100초 교전 구간에서는 prone ratio가 0.18~0.20까지 올라가는 장면이 생겼다.
- `reports/playtests/battlefield-tempo-20260703125554/`: 사망 속도 6명/분, 접촉 후 생존 p50 34초로 전체 전투 페이스는 목표권에 가까웠다.

남은 판단:
- D1은 실사용 기준 개선됐다.
- D2는 "보이는 엎드림 장면"은 생겼지만, 전체 평균 prone ratio는 아직 낮다. 다음 단계는 더 강한 전역 수치 튜닝보다, 고제압 상태에서 어떤 상태가 prone을 해제하는지 상태별로 좁혀 보는 것이다.
- 차량/전차가 보병 교전보다 먼저 킬을 내는 문제는 아직 별도 과제다.

## Codex 교전 유지 거리 검증 (2026-07-04)

적용 확인:
- `src/ai/infantry-ai.js`에 `engagementHoldRange()`가 들어가 있으며, 접촉/보고 접촉 접근 시 `desiredRange` 대신 사거리 기반 정지 거리로 접근한다.
- 라인 예산 초과 때문에 helper와 호출부를 압축했다. `npm run check`는 PASS.

측정 결과:

| 런 | 계수 | Report | Shot range p50/p95 | Deaths/min | First death after contact | Survival p50 | Suppression avg | Prone ratio | 판정 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 0.72 / 0.90 | `reports/playtests/battlefield-tempo-20260704035707/` | 562 / 709 | 8.0 | 4.0s | 36s | 9.48 | 0.05 | 사망 페이스 합격, 거리 목표 실패 |
| 2 | 0.72 / 0.90 | `reports/playtests/battlefield-tempo-20260704040023/` | 566 / 700 | 8.8 | 6.5s | 19s | 9.57 | 0.08 | 사망 페이스 합격, 거리 목표 실패 |
| 3 | 0.80 / 0.96 | `reports/playtests/battlefield-tempo-20260704040418/` | 477 / 758 | 7.7 | 4.0s | 12s | 2.06 | 0.01 | 악화. 폐기 |

판단:
- `engagementHoldRange()`는 사망 페이스를 6~12/min 안에 유지하는 데는 무리가 없지만, shot range p50을 기존 기준 609px 이상으로 끌어올리지는 못했다.
- 계수를 단순히 더 크게 올리는 방식은 역효과가 났다. 너무 일찍 멈춘 유닛이 실제 사격 접촉을 만들지 못하고, 가까운 교전 샘플만 남는 것으로 보인다.
- 현재 코드는 더 나빴던 0.80/0.96을 폐기하고 0.72/0.90으로 되돌렸다.

다음 판단:
- 교전거리만 계수로 미는 작업은 여기서 중단한다.
- AI 전투 리듬은 D2(제압/엎드림 상태 지속)와 차량 선제킬 문제를 추적해야 한다.
- 체감 개선 우선순위는 모바일 시야/조준 줌 개선으로 넘기는 것이 낫다.

## Fable 5 재검증 (2026-07-04, 0.72/0.90 유지 상태)

`npm run check` PASS (126 파일). 템포 프로브 2회 재실행 결과:

| 런 | Report | Shot range p50/p95 | Deaths/min | Survival p50 | Suppression avg | Prone ratio | Final alive |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | `battlefield-tempo-20260704141023/` | 540 / 760 | 8.2 | 42s | 11.81 | 0.14 | 7 vs 6 |
| 2 | `battlefield-tempo-20260704141413/` | 601 / 790 | 6.2 | 36s | 7.28 | 0.07 | 7 vs 10 |

판정:
- **사망 페이스는 2회 모두 목표(6~12/min) 안. 생존 p50도 목표권(20~30s) 이상. engagementHoldRange 0.72/0.90 유지 확정.**
- shot range p50은 540/601로 기존 기준 609px에 미달 — Codex의 "계수로는 못 올린다, 여기서 중단" 판정을 재확인. 이 지표는 목표에서 내리든 D2/차량 선제킬 추적으로 대체하든 다음 세션 판단.
- 런1에서 prone ratio 0.14(목표 0.15 근접) + suppression 11.8 관측 — 제압 추적 패스의 prone-fire 수정이 실제 런에서도 보이기 시작함. 다만 런2는 0.07로 편차 큼.
- 런1에서 첫 사망(53.5s)이 첫 보병 사격(63.0s)보다 빠른 차량 선제킬 패턴 재관측 — 기존 진단 유지.
- 참고: 프로브 첫 시도가 `Execution context was destroyed`로 1회 실패 후 2회 연속 성공. 재발 시 재실행 먼저, 그래도 실패하면 새 2단계 입장 흐름과 프로브의 버튼 클릭 시나리오(`#entryEnterButton`) 호환을 의심할 것.

이 검증으로 07-04 교전거리 수정 건은 종결. 다음 체감 작업은 모바일 시야(FOV) 설계도(`mobile-fov-blueprint.md`) 순서.

## Codex 보급/로드아웃 S1 후 템포 확인 (2026-07-05)

변경 범위:
- 전투 준비 화면 병과 선택 UI 제거, 플레이어 시작 로드아웃을 1번 소총 + 2~6 빈 슬롯으로 고정.
- AI 편성/병과 데이터/온라인 슬롯 ID는 S1 범위 밖이라 유지. 템포 수치는 전투 AI를 고친 결과가 아니라, 보급 S1 후 기존 전투 페이스가 유지되는지 확인한 값이다.

`npm run tempo` 2회 결과:

| 런 | Report | Deaths/min | Survival p50 | Suppression avg | Prone ratio | First death after contact | 판정 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | `reports/playtests/battlefield-tempo-20260705072332/` | 6.0 | 46s | 1.82 | 0.02 | 1.0s | 사망 페이스 하한 통과, prone 미달 |
| 2 | `reports/playtests/battlefield-tempo-20260705072652/` | 7.7 | 44s | 10.19 | 0.13 | 0.5s | 사망 페이스 통과, prone 목표(>0.10) 통과 |

판정:
- 보급/로드아웃 S1 뒤에도 deaths/min은 2회 모두 목표 6~12 안에 있다.
- prone ratio는 0.02/0.13으로 편차가 크다. 07-04에 기록된 D2(제압/엎드림 상태 지속 편차) 진단 유지.
- 첫 사망 after contact는 여전히 0.5~1.0초로 낮다. 이번 세션은 AI 전투 수정 범위가 아니므로 S1 구현에서 고치지 않는다.

## Codex 보급/로드아웃 S2 1차 후 템포 확인 (2026-07-05)

변경 범위:
- 플레이어용 보급상자, `E` 홀드 팝업, 권총/RPG/정찰드론/수류탄 인출을 추가했다.
- 플레이어가 상자에서 얻은 RPG/드론을 쓸 수 있도록 플레이어 사용 게이트를 병과가 아니라 현재 장비 기준으로 바꿨다.
- AI 보급 판단, AI 전투 수치, 온라인 재고 동기화는 건드리지 않았다.

`npm run tempo` 2회 결과:

| 런 | Report | Deaths/min | Survival p50 | Suppression avg | Prone ratio | First death after contact | 판정 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | `reports/playtests/battlefield-tempo-20260705074255/` | 5.8 | 39s | 7.56 | 0.09 | 1.5s | 사망 페이스/엎드림 목표선 미달 |
| 2 | `reports/playtests/battlefield-tempo-20260705074609/` | 5.3 | 22s | 5.21 | 0.06 | 1.0s | 사망 페이스/엎드림 목표선 미달 |

판정:
- S2 1차는 AI 루프를 바꾸지 않았지만, 검증상 이번 2회는 deaths/min 목표(6~12)와 prone ratio 목표(>0.10)를 모두 밑돌았다.
- 생존 p50은 39s/22s로 한 번은 느슨하고 한 번은 목표권이다. 첫 사망 after contact는 여전히 1~1.5초라 차량/초기 접촉 문제가 유지된다.
- 이번 세션에서는 보급 상자 기능을 고치기 위해 AI 사망 페이스를 즉석 튜닝하지 않는다. 다음 전투 작업은 D2(제압/엎드림 지속 편차)와 차량 선제킬을 별도 계측/수정으로 다룬다.

## Codex InfantryAI update 분할 후 템포 확인 (2026-07-05)

변경 범위:
- `src/ai/infantry-ai.js`의 `update()` 내부 행동 블록을 `src/ai/infantry-ai-update-handlers.js`로 분리했다.
- 전술 가중치, 무기 수치, 피해량, 엎드림/제압 임계값은 바꾸지 않았다.
- `npm run bed:combat`도 함께 실행했다: `reports/playtests/bed-combat-census-20260705075449/` 기준 `proneOnlyRatio` 0.396, `noResponseRatio` 0.

`npm run tempo` 2회 결과:

| 런 | Report | Deaths/min | Survival p50 | Suppression avg | Prone ratio | First death after contact | 판정 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | `reports/playtests/battlefield-tempo-20260705080132/` | 4.6 | 38s | 9.92 | 0.12 | -3.5s | 사망 페이스 미달, 차량/측정 선제 사망 패턴 재관측 |
| 2 | `reports/playtests/battlefield-tempo-20260705080451/` | 8.1 | 57s | 8.74 | 0.12 | 1.5s | 사망 페이스 통과, 생존 p50 과장 |

판정:
- 구조 분리 자체는 `npm run check`와 계측 도구를 통과했다.
- deaths/min은 4.6/8.1로 편차가 크다. 평균은 목표 하한 근처지만 1회는 미달이므로 이 커밋을 전투 밸런스 개선으로 판정하지 않는다.
- prone ratio는 0.12/0.12로 R1 재측정 목표선(>0.10)은 넘지만, 이전 진단 목표(>0.15)에는 못 미친다. D2(제압/엎드림 지속 편차)는 유지.
- 이번 변경은 행동 보존형 구조 작업이다. 다음 실제 전투 작업은 `bed-combat-and-downed-flow-plan.md`의 2단계처럼 폭발 후 산개/엄폐 전환만 좁게 다룬다.

## Codex 침대전투 2단계 최소 완화 후 템포 확인 (2026-07-05)

변경 범위:
- `src/ai/infantry-blast-response.js`가 폭발 반경 안 보병에게 짧은 폭발 위협을 기록하고, 아주 가까운 폭발 또는 반복 폭발에서는 선제 `prone-fire` 홀드보다 산개/엄폐 후보를 먼저 보게 한다.
- 피해량, 무기 수치, 소생/설치류/보급 판단은 바꾸지 않았다.
- `npm run bed:combat`: `reports/playtests/bed-combat-census-20260705084828/` 기준 `proneOnlyRatio` 0.291, `noResponseRatio` 0. 최종값은 전장 페이스를 지키기 위해 보수적으로 잡았다.

`npm run tempo` 2회 결과:

| 런 | Report | Deaths/min | Survival p50 | Suppression avg | Prone ratio | First death after contact | 판정 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | `reports/playtests/battlefield-tempo-20260705085142/` | 10.5 | 42s | 15.69 | 0.20 | 6.0s | 사망/엎드림 목표 통과, 첫 사망은 목표 8s 미달 |
| 2 | `reports/playtests/battlefield-tempo-20260705085457/` | 7.1 | 22s | 8.19 | 0.11 | 4.5s | 사망/엎드림 목표 통과, 생존 p50 목표권 |

판정:
- deaths/min은 10.5/7.1로 목표 6~12 안에 복귀했다.
- prone ratio는 0.20/0.11로 R1 재측정 목표선(>0.10)을 통과했다.
- 첫 사망 after contact는 6.0s/4.5s로 여전히 8초 목표에는 못 미친다. 차량/초기 접촉 문제는 별도 과제로 유지한다.
- 침대전투 prone-only는 줄었지만 0.291로 아직 남아 있다. 다음 단계에서 이 수치를 더 줄일 경우 전장 deaths/min이 다시 4 이하로 떨어질 수 있으므로, 더 강한 엄폐 이동보다 "반응 후 다시 사격/진격으로 돌아오는 조건"을 먼저 봐야 한다.

## Codex 탱크 강습 버그 수정 후 템포 확인 (2026-07-05)

변경 범위:
- `npm run tank:assault` 전용 프로브를 추가해 전차 강습의 예약→접근→climb→plant 진행률을 계측했다.
- 실패 원인은 정지 상태기가 아니라 전차 AI `repel-assault`, 제압 엎드림 래퍼, 부착 초기 기관총 사격이 강습 진행을 선점하는 조합이었다.
- 수정 후 전용 프로브 `reports/playtests/tank-assault-20260705090812/`에서 `repel-ai` 시나리오도 maxProgress 7.8, progress3=39.39s, progress7=43.39s로 통과했다.

`npm run tempo` 2회 결과:

| 런 | Report | Deaths/min | Survival p50 | Suppression avg | Prone ratio | First death after contact | 판정 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | `reports/playtests/battlefield-tempo-20260705091203/` | 4.3 | 36s | 2.80 | 0.03 | -4.5s | 사망/엎드림 목표 미달, 선제 사망 측정 편차 재발 |
| 2 | `reports/playtests/battlefield-tempo-20260705091521/` | 7.9 | 69s | 11.50 | 0.11 | 6.0s | 사망/엎드림 목표 통과, 생존 p50은 긴 편 |

판정:
- 탱크 강습 버그는 전용 프로브 기준으로 재현 후 수정 완료. 정지 전차, 먼 슬롯 접근, 부착 시작, 전차 AI 반격 시나리오가 모두 진행률을 낸다.
- 전장 tempo는 4.3/7.9로 1회는 목표 6~12 미달, 1회는 통과했다. prone ratio도 0.03/0.11로 같은 편차가 남아 있다.
- 이번 세션은 탱크 강습 버그 수정 범위이므로 tempo 편차를 즉석 튜닝하지 않는다. deaths/min/prone 안정화는 기존 D2/차량 초기 접촉 과제로 유지한다.

## Codex AI 드론 경로 겹침 수정 후 템포 확인 (2026-07-05)

변경 범위:
- `aiReconWaypoint()`의 정찰드론 대기점을 좌/우 2칸에서 7칸 부채꼴+거리 지터로 분산했다.
- `ReconDrone.moveToward()`에 40px 이하 근접 시에만 같은 팀 드론 간 가벼운 분리 조향을 추가했다. 자폭드론은 자체 `moveToward()`를 쓰므로 이번 분리 조향 대상이 아니다.
- 전용 프로브 `npm run drone:spacing` 추가. `reports/playtests/ai-drone-spacing-20260705093313/` 기준 7대 발진, waypoint 최소 72.06px, 2초 이후 드론 최소 42.74px, 최종 최소 69.43px.

`npm run tempo` 2회 결과:

| 런 | Report | Deaths/min | Survival p50 | Suppression avg | Prone ratio | First death after contact | 판정 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | `reports/playtests/battlefield-tempo-20260705093642/` | 14.2 | 69s | 13.87 | 0.14 | 4.0s | 사망 페이스 과열, prone은 R1 목표선 통과 |
| 2 | `reports/playtests/battlefield-tempo-20260705094015/` | 4.9 | 14s | 9.40 | 0.08 | 5.5s | 사망 페이스/엎드림 목표 미달 |

판정:
- 드론 겹침 버그는 전용 프로브 기준으로 수정 완료.
- 전장 tempo는 14.2/4.9로 방향이 서로 갈렸다. 이번 수정은 정찰드론 경로 분산이며 피해량, 무기 수치, 보병 전술 가중치를 건드리지 않았으므로 이 결과만으로 전투 밸런스를 즉석 튜닝하지 않는다.
- deaths/min/prone 안정화와 첫 사망 8초 목표는 기존 D2/차량 초기 접촉 과제로 유지한다.

## Codex commander presence tempo check (2026-07-05)

Change scope:
- Added commander radio visibility and a narrow reassault rule in `src/ai/commander-presence.js`.
- Did not rewrite commander target selection, infantry weapon tuning, suppression tuning, vehicle tuning, or prone thresholds.

Checks:
- `npm run commander:presence` PASS.
- `npm run check` PASS.

`npm run tempo` 2-run result:

| Run | Report | Deaths/min | Survival p50 | Suppression avg | Prone ratio | First death after contact | Judgment |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | `reports/playtests/battlefield-tempo-20260705101240/` | 7.5 | 40s | 19.92 | 0.24 | 9.5s | deaths/min and prone pass |
| 2 | `reports/playtests/battlefield-tempo-20260705101555/` | 5.9 | 79s | 4.79 | 0.06 | 14.5s | deaths/min slightly under 6, prone below target |

Judgment:
- Commander presence behavior itself is verified by the targeted check.
- Battlefield tempo remains variable: one run passed deaths/min + prone, one run missed both. This matches the existing D2/prone and early-contact variability noted above, so no broad combat retune was made in this patch.

## Codex suicide drone dumb-fire tempo check (2026-07-05)

Change scope:
- Player-controlled suicide drone launch now uses dumb-fire direction instead of target/ground lock acquisition.
- AI suicide drone lock-on/autopilot path and shared AI detonation radii were left unchanged.
- Added obstacle/world-edge/lifetime detonation for player dumb-fire so missed shots can still explode on terrain.

Checks:
- `npm run drone:dumbfire` PASS.
- `npm run check` PASS.

`npm run tempo` result:

| Run | Report | Deaths/min | Survival p50 | Suppression avg | Prone ratio | First death after contact | Judgment |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | `reports/playtests/battlefield-tempo-20260705104739/` | 5.6 | 92s | 4.52 | 0.05 | 14.0s | deaths/min slightly under 6, prone below target |

Judgment:
- The targeted dumb-fire contract passed and the changed path is player-controlled, not AI drone selection or infantry behavior.
- The tempo miss matches the already documented D2/prone and early-contact variability, so no broad combat retune was made in this patch.

## Codex support-fire direct point-fire check (2026-07-05)

Change scope:
- Support weapons in support/security tasks can now convert some direct visible-target fire into `fireRifleAtPoint` suppression fire.
- This is a narrow D2/teamwork adjustment: no weapon damage, range, squad role assignment, grenade thresholds, or vehicle behavior changed.
- Added `npm run support:fire` contract check.

Behavior census:

| Run | Report | Point shots | Suppression shot ratio | Fire-move ok | Teamwork ratio | Judgment |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Baseline | `reports/playtests/behavior-census-20260705105455/` | 13 | 0.049 | 419 | 0.015 | support fire underused |
| Final | `reports/playtests/behavior-census-20260705111016/` | 76 | 0.129 | 1961 | 0.058 | partial improvement, still below 0.20 suppression-ratio target |

`npm run tempo` 2-run result:

| Run | Report | Deaths/min | Survival p50 | Suppression avg | Prone ratio | First death after contact | Judgment |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | `reports/playtests/battlefield-tempo-20260705111341/` | 10.2 | 35s | 14.12 | 0.18 | 19.5s | deaths/prone pass |
| 2 | `reports/playtests/battlefield-tempo-20260705111655/` | 5.7 | 45s | 9.97 | 0.12 | 9.5s | deaths slightly under 6, prone/first death pass |

Judgment:
- The support-fire change improves the observable support-fire/teamwork signal without a broad combat rewrite.
- It is not a full D2 finish: suppressionShotRatio remains below target and survival p50 is still long. A stronger no-cadence version was tested and discarded because it pushed tempo out of bounds.
- Next D2 work should inspect why many fire-move attempts are blocked by `hold-wall`/`fallback`/`no-support-source` instead of increasing support fire cadence again.

## Codex hold-wall fire-move experiment discarded (2026-07-05)

Experiment:
- Temporarily allowed assault-role riflemen in `hold-wall` to enter fire-move when they had direct or squad-shared infantry contact, while keeping `fallback`/`regroup`/`rally-with-tank` blocked.

Result:
- `npm run census` 180s: `reports/playtests/behavior-census-20260705113008/` had fireMoveOk 0, suppressionShotRatio 0.004, teamworkRatio 0.004.
- Follow-up 120s: `reports/playtests/behavior-census-20260705113239/` recovered to fireMoveOk 967 and suppressionShotRatio 0.116, but teamworkRatio stayed 0.015.
- `npm run tempo` 2 runs: `reports/playtests/battlefield-tempo-20260705113555/` was deaths/min 6.7, prone 0.08, first death after contact 0.5s; `reports/playtests/battlefield-tempo-20260705113909/` was deaths/min 6.0, prone 0.13, first death after contact 15.5s.

Judgment:
- Not stable enough to keep. Code was reverted before commit.
- Next D2 work should not broadly unlock `hold-wall`. Use the new no-support breakdown and add narrower role/mode diagnostics before changing squad tactical modes.

## Codex post-blast prone-fire escape (2026-07-05)

Change scope:
- Non-support `rifle` units that are already stuck in `prone-fire` after a recent blast get one late spread/cover retry within 3.2s of that blast.
- This does not change support weapons, damage, suppression gain/recovery, vehicle behavior, or normal prone behavior outside recent blast windows.

Bed-combat check:

| Run | Report | Windows | Prone-only ratio | No-response ratio | First response p50/p90 | Judgment |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Diagnostic before behavior change | `reports/playtests/bed-combat-census-20260705115206/` | 37 | 0.189 | 0 | 0.23s / 6.77s | prone-only was rifle prone-fire, long p90 |
| After narrow escape rule | `reports/playtests/bed-combat-census-20260705115723/` | 37 | 0.162 | 0 | 0.25s / 0.27s | long stuck window reduced |

`npm run tempo` 2-run result:

| Run | Report | Deaths/min | Survival p50 | Suppression avg | Prone ratio | First death after contact | Judgment |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | `reports/playtests/battlefield-tempo-20260705120040/` | 6.7 | 48s | 14.69 | 0.18 | 10.5s | deaths/prone pass |
| 2 | `reports/playtests/battlefield-tempo-20260705120352/` | 5.9 | 38s | 10.46 | 0.12 | 2.0s | deaths borderline under 6 by 0.1, prone pass |

Judgment:
- Keep the narrow escape rule for now: it reduces the observed stuck-prone window without deleting prone or broadly buffing cover movement.
- Residual risk remains in tempo variance. The second run is just under the 6 deaths/min target, so the next D2 change should avoid adding more defensive movement until another sample or manual play confirms the feel.
