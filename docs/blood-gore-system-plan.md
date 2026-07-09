# 유혈 시스템 계획 — BloodEvent → BloodParticles → BloodDecals → CorpseBlood → GoreParts

작성일: 2026-07-09
상태: 단계별 구현 중 (아래 진행 상태 참고)
전제: 절단 파츠 PNG는 아직 없다. 구조만 먼저 세우고, 그림이 도착하면 GoreParts만 연결한다.

## 진행 상태 (다른 AI가 이어받을 때 여기부터)

- [x] **1단계: BloodEvent + bullet 스퍼트 + droplet 착지** — 2026-07-09 완료
  - 신규: `src/systems/blood-system.js` (이벤트/파티클/데칼 상태), `src/systems/renderer-blood.js` (그리기)
  - `index.html`에 두 스크립트 등록 (explosion-scorch 다음)
  - combat.js는 수정하지 않음. `InfantryUnit.prototype.takeDamage`와 `IronLine.combat.updateEffects`를 감싸는 감시 패턴 사용
  - 상태 저장 위치: `game.effects.blood = { time, frameEvents, particles, decals }`
  - 주의: 폭발 피해도 지금은 takeDamage를 거치므로 bullet 스퍼트로 나온다. 4단계에서 분리 예정
- [x] **2단계: pool 성장 + CorpseBlood** — 2026-07-09 완료
  - 사망 시 `spawnCorpsePool` (takeDamage 사망 전환 감지) → `state.pools` 별도 배열(상한 40, 데칼 churn과 분리)
  - 반경 `poolRadius()` ease-out 성장: 2.5px → 8~13px, 3~8초. 다 자란 뒤 20초에 걸쳐 마름
  - 렌더: 웅덩이가 핏자국 레이어 최하단 (시체 스프라이트보다 아래라 한 덩어리로 보임)
  - 미룬 것: 중상 정지 유닛의 소형 웅덩이 → 3단계(bleed와 묶음), 시체 밀림 smear → 4단계
- [x] **3단계: bleeding trail** — 2026-07-09 완료
  - 피해 8 이상 생존 시 `unit.bleed = { until, travel, lastDrip, lastX, lastY }` (5~14초, 재피격 시 연장)
  - 이동 중: 7px 걸을 때마다 방울 1개 (속도 무관 균일 간격). 정지 중: 1초마다 같은 자리에 더 굵은 방울 → 군집이 소형 웅덩이 근사
  - 사망/만료 시 자동 해제. 치료 연동은 아군 치료 시스템이 생기면 추가 (현재 메드킷은 플레이어 전용이라 대상 아님)
- [x] **4단계: vehicle smear + blast 확산 (이벤트 타입 분리)** — 2026-07-09 완료
  - 판별: 차량 = `physics.js` applyVehicleContactDamage가 takeDamage 직전에 `entity.__bloodImpact` 힌트를 심고 래퍼가 소비. 폭발 = `source.ammo` 존재 여부 (combat.js의 blastSource가 ammo를 들고 다님). 나머지 = bullet
  - vehicle: 진행 방향 끌림 번짐(smear 데칼, 길이 20~62px 속도 비례) + 같은 방향 부채꼴 방울 8~12개
  - blast: 360도 방사 방울 8~16개(사거리 김) + 방사 튄 자국 2개
  - 주의: 전차 직격탄(shell 직접 명중)도 shell이 ammo를 들고 있으면 blast로 분류된다 — 의도된 동작
  - 미룬 것: 시체 밀림 smear (시체를 미는 물리 자체가 아직 없음 — 그 기능이 생기면 연결)
- [x] **5단계 일부: 유혈 표현 켜기/끄기 토글** — 2026-07-09 완료 (사용자 결정으로 4수위 대신 2단계)
  - 설정 > 그래픽 > "유혈 표현" 체크박스 (`data-blood-enabled`), 저장 키 `iron-line-blood-enabled-v1`
  - 끄면: 새 피 발생 전부 차단(emit/웅덩이/출혈), 기존 흔적 즉시 삭제, 렌더도 차단
  - `check-settings-controls.cjs` 계약에 등록됨
  - 남은 5단계: 굽기 캔버스(아래 5-B 설계도) — 성능이 아플 때 구현
- [ ] ~~5단계: 설정 4수위~~ → 2단계 토글로 대체 완료. 굽기 캔버스만 잔여
- [ ] 6단계: GoreParts (절단 파츠 PNG 도착 후)

## 5단계 구현 설계도 (미구현 — 이어받는 AI는 이대로 만들면 된다)

### 5-A. 유혈 수위 설정

1. `blood-system.js`에 수위 상태 추가:
   - `IronLine.blood.level = "off" | "low" | "normal" | "high"` (기본 "normal")
   - `IronLine.blood.setLevel(value)` — 값 검증 후 저장, `localStorage("ironline.bloodLevel")`에 유지
   - 부팅 시 localStorage에서 복원
2. 적용 지점은 **emit() 초입 한 곳**:
   - `off`: 즉시 return (파티클/데칼/웅덩이 전부 없음). `spawnCorpsePool`도 off면 return
   - `low`: `spawnParticle` 호출 생략, 즉시 데칼(splatter/smear)만 생성. bleed trail은 유지(데칼이라)
   - `normal`: 현재 수치 그대로
   - `high`: 방울 개수 ×1.5 (Math.round), pool `max` ×1.3
3. 설정 UI: 기존 설정 패널(사운드/조작 항목이 있는 곳)에 셀렉트 1개 추가. `tools/check-settings-controls.cjs`가 설정 컨트롤 계약을 검사하므로, 항목 추가 후 그 체크 통과를 확인할 것 (`npm run settings:controls`)
4. GoreParts(6단계)는 `high`에서만 활성이 기본값 (구현 시 재논의)

### 5-B. 굽기(bake) 캔버스 — 마른 피의 프레임 비용을 0으로

1. 전체 월드 크기 캔버스 1장은 금지 (4000×3000급 메모리). **512px 타일 방식**:
   - `state.bakeTiles = Map<"tx,ty", HTMLCanvasElement>` — 처음 피가 구워질 때만 타일 생성
   - 타일 좌표 = `Math.floor(x / 512)`
2. 굽기 조건 (update에서 검사):
   - 데칼: `state.time - decal.born > DRY_SECONDS + 5` → 타일에 마른 색으로 그리고 배열에서 제거
   - 데칼 배열이 MAX_DECALS 도달 시 shift 대신 **가장 오래된 것을 즉시 굽기**
   - 웅덩이: 성장 완료 + 마름 완료(`born + grow + DRY_SECONDS`) 후 굽기
   - 굽는 그리기 코드는 renderer-blood의 데칼 그리기와 동일 (마른 색 고정) — 함수를 공유하도록 데칼 그리기를 `drawDecalShape(ctx, decal, color)` 로 분리할 것
3. 렌더: `drawBlood`에서 웅덩이보다 먼저, 카메라에 걸치는 타일만 `drawImage` (타일당 1회)
4. 타일 상한 64개 (≈ 월드 전체 커버). 초과 시 가장 오래 안 쓰인 타일 폐기 — 사실상 도달 불가하지만 가드로
5. 검증법: 데칼 200개 생성 → 25초 시뮬 → `state.decals.length`가 굽기로 줄었는지, 타일 수 ≥ 1인지, 화면상 핏자국은 그대로인지

### 5-C. 순서

1. 수위 설정(5-A) 먼저 — 작고 독립적
2. 굽기(5-B)는 성능 측정(perf 예산)과 같은 시기에 — 데칼 120개 상한이 아직 안 아프면 서두를 필요 없음

## 1. 목표와 톤

핵심은 "튀는 피"가 아니라 **흐르고, 떨어지고, 고이는 피**다.

- 총에 맞으면 순간 스퍼트는 짧게, 그 뒤 **부상 상태로 움직일 때 바닥에 방울이 뚝뚝 떨어지는 흔적**이 남는 것이 중심 연출이다.
- 죽으면 시체 밑에서 웅덩이가 **몇 초에 걸쳐 서서히 자란다**. 즉시 최대 크기로 찍히지 않는다.
- 유체 시뮬레이션은 하지 않는다. 전부 데칼 + 시간 보간으로 "흐르는 것처럼" 보이게 한다.
- 수제 일러스트 톤 유지: 단색 계열 만화적 표현. 실사 텍스처, 광택, 그라데이션 남용 금지.

## 2. 색상 계약 (실측 기준)

기준은 사용자가 직접 그린 전사자 스프라이트(`assets/ui/soubok-infantry-dead.png`)의 피 색이다. 픽셀 실측 결과:

| 용도 | 색 | 근거 |
| --- | --- | --- |
| 신선한 피 (파티클, 새 데칼) | `#B02020` (rgb 176,32,32) | 전사자 스프라이트 주 혈색, 608px로 최다 |
| 피 가장자리/밝은 부분 | `#A03020` (rgb 160,48,32) | 스프라이트 부 혈색 |
| 마른 피 (20초 이상 경과) | `#6E1A16` | 주 혈색을 어둡게 보간한 값 |
| 웅덩이 알파 | 0.85 → 마르면 0.7 | 지면 질감이 살짝 비치게 |

새 데칼은 신선한 피 색에서 시작해 20초에 걸쳐 마른 피 색으로 보간된 뒤 고정된다. 시체 스프라이트에 이미 그려진 피와 웅덩이 데칼이 같은 색이라 이어져 보인다.

## 3. 데이터 흐름

```
피해 발생(combat / 차량충돌 / 폭발 / 절단)
        │
        ▼
  BloodEvent (단일 진입점, 이벤트 발행)
        │
        ├─► BloodParticles  날아가는 방울 (0.25~0.6초)
        │         │ 착지
        │         ▼
        ├─► BloodDecals     바닥 얼룩 (방울/튄자국/끌림/웅덩이)
        │
        ├─► CorpseBlood     사망 시 성장형 웅덩이 (시체에 바인딩)
        │
        └─► GoreParts       절단 파츠 스폰 (PNG 도착 후 연결)
```

아래 4개 단계는 전부 BloodEvent만 소비한다. 발생원(총/차량/폭발)이 늘어나도 이벤트만 쏘면 되고, 절단이 나중에 와도 이벤트 타입 하나 추가로 끝난다.

## 4. 단계별 설계

### 4-1. BloodEvent — 단일 진입점

```js
emitBloodEvent(game, {
  type: "bullet" | "vehicle" | "blast" | "bleed" | "sever",
  x, y,                  // 발생 위치 (월드)
  dirX, dirY,            // 방향 (총알 진행/차량 진행/폭심→유닛). blast는 무시 가능
  strength: 0..1,        // 피해 크기 비례
  unitId,                // 대상 유닛 (bleed 상태 연결용)
  part: "armL" | ...     // sever 전용, 지금은 예약만
})
```

발생 지점 연결:

| 발생원 | 연결 위치 | 타입 |
| --- | --- | --- |
| 총격 명중 | `src/systems/combat.js` 보병 피해 적용부 | bullet |
| 차량 역과/충돌 | `src/entities/tank.js`, `humvee.js` 충돌 처리부 | vehicle |
| 폭발 피해 | combat 폭발 피해 적용부 | blast |
| 부상 이동 | blood-system 내부 (unit.bleed 상태) | bleed |
| 절단 | 추후 폭발/대구경 판정에서 | sever |

### 4-2. BloodParticles — 날아가는 방울

- 수명 0.25~0.6초. 가짜 높이(z)를 두고 포물선으로 떨어진다. **착지하는 순간 그 자리에 방울 데칼을 생성**한다 — 이것이 "뚝뚝"의 최소 단위다.
- 타입별 패턴:
  - `bullet`: 관통 방향(맞은 방향의 반대쪽, 사출구 쪽) ±20° 원뿔로 3~6방울. 짧고 절제되게.
  - `vehicle`: 차량 진행 방향 부채꼴로 8~12방울 + 즉시 끌림 자국(smear) 데칼 1개. **방향성이 핵심.**
  - `blast`: 폭심 기준 360° 방사로 10~16방울, 사거리 김. 큰 확산.
  - `bleed`: 파티클 없음. 데칼만 직접 생성.
- 객체 풀 사용, 동시 상한 60개. 초과 시 가장 오래된 것 재사용.
- 화면 밖 이벤트는 파티클을 생략하고 착지 데칼만 즉시 생성 (LOD).

### 4-3. BloodDecals — 바닥 얼룩 (연출의 본체)

4종류:

| 종류 | 생성 | 크기 | 특징 |
| --- | --- | --- | --- |
| droplet 방울 | 파티클 착지 | 2~5px | 가장 흔함. 불규칙 원형 |
| splatter 튄 자국 | bullet/blast 즉시 | 6~14px | 방향으로 길쭉한 얼룩 |
| smear 끌림 | vehicle, 시체 밀림 | 길이 20~60px | 진행 방향 띠 모양 |
| pool 웅덩이 | 사망, 중상 정지 시 | 반경 8→22px 성장 | 3~8초에 걸쳐 자람 |

- 색은 2장의 계약대로 신선→마름 보간(20초).
- **성능 핵심 설계 — 굽기(bake):** 활성 데칼 상한 120개. 색 보간이 끝난(마른) 데칼은 오프스크린 "핏자국 캔버스"에 한 번 구워 넣고 배열에서 제거한다. 구운 피는 프레임당 비용이 0이고, 전장에 피가 아무리 쌓여도 성능이 늘지 않는다. 상한 초과 시 가장 오래된 활성 데칼을 즉시 굽는다. (`explosion-scorch.js`의 `game.effects.scorchMarks` 패턴을 따르되, 굽기 캔버스가 추가되는 형태)
- 렌더 레이어: 지면 위, 시체·유닛 아래.

### 4-4. CorpseBlood — 시체와 웅덩이

- 사망 시 pool 데칼 1개를 시체에 바인딩해 생성. 즉시 최대가 아니라 **성장 곡선(처음 빠르게, 뒤로 갈수록 느리게)** 으로 자란다.
- `renderer-corpse.js`의 soubok 시체 슬롯 아래 레이어에 그려서, 스프라이트에 그려진 피와 웅덩이가 한 덩어리로 보이게 한다.
- 시체가 밀리면(차량 등) smear 데칼을 남긴다.
- 중상(사망 아님) 상태로 오래 정지한 유닛도 작은 pool을 만든다 — "누워서 피 흘리는 부상병" 연출.

### 4-5. unit.bleed — 부상 출혈 상태

```js
unit.bleed = { rate: 방울 간격(초), until: 종료 시각 }
```

- bullet/blast 피해를 받으면 strength에 비례해 설정 (예: 0.4초 간격, 6~15초).
- **이동 중이면 이동 경로에 droplet이 뚝뚝 떨어진다** — 사용자가 말한 핵심 연출. 후퇴하는 부상병 뒤로 핏자국 줄이 남는다.
- 의무병 치료/회복 시 해제. 게임플레이 수치(속도 저하 등)에는 이번 범위에서 영향 없음 — 순수 연출.

### 4-6. GoreParts — 절단 파츠 (인터페이스만 예약)

- `sever` 이벤트 수신 시: 파츠 엔티티 스폰 `{ image, x, y, vx, vy, 회전속도, 마찰 }` → 짧게 튕겨나가 착지 → 정지 후 데칼처럼 굽기 캔버스에 합류.
- 에셋 계약 슬롯 예약 (그림이 이 이름으로 도착하면 자동 연결):
  - `assets/ui/infantry/gore/soubok-gore-arm-l.png`
  - `assets/ui/infantry/gore/soubok-gore-arm-r.png`
  - `assets/ui/infantry/gore/soubok-gore-leg.png`
  - `assets/ui/infantry/gore/soubok-gore-weapon-drop.png` (떨어뜨린 무기)
- **PNG가 없으면 sever 이벤트는 조용히 무시된다(safe no-op).** 코드가 먼저 들어가도 아무것도 깨지지 않는다.
- 절단 판정 규칙(폭발 근접 + 피해 임계값)은 파츠 그림 도착 후 별도 결정.

## 5. 설정 (유혈 수위)

기존 설정 패널에 "유혈 표현" 항목 추가. `check-settings-controls.cjs` 계약에 등록.

| 단계 | 동작 |
| --- | --- |
| 끄기 | BloodEvent 소비 안 함. 데칼/파티클/웅덩이 전부 없음 |
| 낮음 | 파티클 없음, 데칼만 (웅덩이 포함) |
| 보통 (기본) | 이 문서의 기본 수치 |
| 강함 | 파티클/데칼 수량 1.5배, 웅덩이 최대 반경 1.3배 |

GoreParts는 "강함"에서만 활성 (기본값 논의 여지 있음).

## 6. 성능 가드 요약

- 파티클 동시 상한 60 (풀링)
- 활성 데칼 상한 120, 마른 데칼은 굽기 캔버스로 이동 → 프레임 비용 0
- 화면 밖 이벤트는 파티클 생략
- 프레임당 신규 이벤트 상한 (대규모 폭발 시 한 프레임에 몰리지 않게 8개/프레임로 절단)
- 이 수치들은 성능 측정(perf 예산) 후 조정 가능하도록 상수로 모아둔다

## 7. 파일 구조

| 파일 | 역할 |
| --- | --- |
| `src/systems/blood-system.js` (신규) | 이벤트 큐, 파티클 시뮬, bleed 상태, 데칼 생성·수명·굽기 판단 |
| `src/systems/renderer-blood.js` (신규) | 굽기 캔버스, 데칼/파티클 그리기, 레이어 삽입 |
| `src/systems/combat.js` (수정) | 피해 적용부에서 `emitBloodEvent` 호출 |
| `src/entities/tank.js`, `humvee.js` (수정) | 충돌/역과 시 vehicle 이벤트 |
| `src/systems/renderer-corpse.js` (수정) | CorpseBlood 웅덩이 바인딩 |

## 8. 구현 순서 (각 단계가 단독 배포 가능)

1. **BloodEvent + bullet 스퍼트 + droplet 착지** — "뚝뚝"의 최소 단위. 여기까지만 해도 총격전 흔적이 남는다
2. **pool 성장 + CorpseBlood** — 시체 밑 웅덩이
3. **bleeding trail** — 부상 이동 핏자국 (사용자 핵심 연출)
4. **vehicle smear + blast 확산** — 방향성 패턴
5. **설정 4단계 + 굽기 캔버스 성능 마감**
6. **GoreParts 연결** — 절단 파츠 PNG 도착 후

## 9. 하지 않는 것

- 유체 시뮬레이션, 피 물리 상호작용
- 벽면/수직면 피
- 실사 텍스처
- bloodLevel의 게임플레이 영향 (연출 전용. 게임 수치 연동은 별도 논의)
