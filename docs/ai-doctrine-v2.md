# AI Doctrine V2

현재 결론: 2차 AI는 새 행동을 마구 붙이기보다 `지원요청 -> 지휘관 배정 -> 자산 실행` 흐름을 먼저 고정한다.

## Purpose

이 문서는 분대, 전차, 험비, 공병, 정찰병, 드론이 더 체계적으로 협동하기 위한 다음 AI 구조를 정리한다. 목표는 AI를 사람처럼 복잡하게 만드는 것이 아니라, 플레이어가 보기에도 "작전을 짜고 움직인다"고 읽히는 작은 교리 체계를 만드는 것이다.

## Design Goals

- AI는 무작정 거점으로 뛰지 않고, 준비, 엄호, 재집결, 후퇴, 전차 합류를 거친다.
- 분대는 자기 상태를 판단하지만, 전차/험비/공병/드론 같은 자산 배정은 지휘관이 결정한다.
- 행동은 디버그 또는 머리 위 전술 대사에서 이유가 보여야 한다. "왜 멈췄는지", "왜 후퇴하는지", "누가 지원요청을 받았는지"가 확인 가능해야 한다.
- 1차 구현은 규칙 기반 상태 머신으로 유지한다. GOAP, 행동트리, 유틸리티 AI 전체 도입은 아직 보류한다.
- 교리는 현재 코드의 `CommanderAI`, `SquadAI`, `InfantryAI`, `TankAI`, `HumveeAI`를 살리고 그 사이의 데이터 계약만 강화한다.

## Command Stack

1. `CommanderAI`: 큰 목표와 지원 자산 배정을 맡는다.
2. `SquadAI`: 분대 상태를 판단하고 전술 모드와 지원요청을 만든다.
3. `Asset Broker`: 지휘관 내부의 얇은 배정 계층이다. 요청을 보고 전차, 험비, 공병, 정찰병, 미래 드론 자산 중 누가 응답할지 정한다.
4. `Unit AI`: 받은 명령을 실제 이동, 사격, 수리, 엄호 행동으로 바꾼다.
5. `Combat/Physics`: 피해, 제압, 사선, 엄폐 가능 여부를 계산한다.

## Current Foundation

- `SquadAI`는 이미 `advance`, `pre-assault`, `support-fire`, `fallback`, `regroup`, `rally-with-tank`, `hold`, `hold-wall` 전술 모드를 가진다.
- `SquadAI`는 이미 `need-armor-support`, `need-fire-support`, `need-regroup` 지원요청을 남길 수 있다.
- `CommanderAI`는 이미 전차-보병 협동 작전을 만들고 전차에 `supportPoint`를 줄 수 있다.
- `CommanderAI`는 현재 `need-armor-support` 지원요청을 수집하고, 사용 가능한 전차를 임시 `support` 명령으로 재배정할 수 있다.
- `CommanderAI`는 현재 험비를 분대 수송/동행 자산으로 배정하고, `need-fire-support` 요청이 뜨면 빈 험비를 임시 기관총 지원 명령으로 재배정할 수 있다.
- `CommanderAI`는 현재 손상된 아군 전차/험비를 `need-repair` 요청으로 만들고, 가까운 공병에게 짧은 `repair` 명령을 줄 수 있다.
- `TankAI`는 이미 `support` 역할이면 엄호 위치로 이동해 거점을 바라본다.
- `HumveeAI`는 지휘관 명령을 받으면 분대 픽업, 하차 지점 이동, 하차 후 엄호를 수행하고, 근처 적 전차는 회피한다.
- `InfantryAI`는 이미 공병 RPG, 수리, 정찰병 외곽 감시, 엄폐, 제압, 사선 회피를 처리한다.
- `InfantryAI`는 현재 실제 탑승/재탑승, 지원요청, 공격준비, 엄호사격, 벽방어, 후퇴/재집결, 정찰 상태에서 짧은 머리 위 전술 대사를 띄워 행동 의도를 보여준다. 험비가 멀거나 접근할 수 없는 상황은 수송 대기가 아니라 기존 이동으로 처리한다.

## Support Request Contract

지원요청은 분대나 유닛이 직접 전차를 조종하는 명령이 아니다. 지휘관에게 올리는 "문제 보고"다.

```js
{
  id: "BLUE:B-SQ-1:need-armor-support:123.4",
  team: TEAM.BLUE,
  type: "need-armor-support",
  sourceType: "squad",
  sourceId: "B-SQ-1",
  objectiveName: "A",
  origin: { x: 1200, y: 900 },
  target: enemyOrPoint,
  urgency: 0.0,
  ttl: 3.5,
  createdAt: game.matchTime,
  assignedAssetId: "",
  status: "open"
}
```

`need-repair`는 같은 계약을 쓰되 `sourceType: "vehicle"`과 손상 차량 `sourceId`를 사용하고, 배정된 공병 명령에는 실제 `repairTarget` 객체가 붙는다.

## Request Types

- `need-armor-support`: 적 전차/험비 또는 강한 화력 때문에 보병이 전진하지 못한다.
- `need-fire-support`: 기관총, 저격, 엄폐 보병 때문에 분대가 제압당했다.
- `need-regroup`: 분대가 흩어져 전술 행동이 깨졌다.
- `need-repair`: 아군 전차/험비가 손상됐고 근처 공병 지원이 필요하다.
- `need-smoke`: 사선이 열려 있어 돌격이나 후퇴에 연막이 필요하다.
- `enemy-armor-spotted`: 정찰병/분대가 적 장갑을 발견했다.
- `enemy-sniper-spotted`: 정찰병/분대가 저격 위협을 발견했다.
- `drone-strike-opportunity`: 미래 기능. 정찰 보고나 고가치 표적에 드론 투입 가치가 있다.

## Request Priority

지원요청 우선순위는 단순 점수로 시작한다.

```text
priority =
  urgency * 100
  + objectiveImportance
  + assetAvailability
  - distancePenalty
  - currentAssignmentPenalty
```

- `urgency`: 분대 제압, 사상자, 적 장갑 거리, 거점 점령 압박에서 온다.
- `objectiveImportance`: 거점이 contested 상태거나 최전선이면 증가한다.
- `assetAvailability`: 근처에 대응 가능한 전차/험비/공병이 있으면 증가한다.
- `distancePenalty`: 너무 먼 자산은 늦게 배정한다.
- `currentAssignmentPenalty`: 이미 중요한 작전을 수행 중인 자산은 빼오지 않는다.

## Asset Capabilities

각 자산은 자신이 받을 수 있는 요청 타입을 가진다.

- 전차: `need-armor-support`, `need-fire-support`, `enemy-armor-spotted`
- 험비: `need-fire-support`, `need-regroup`, `enemy-sniper-spotted`
- 공병: `need-repair`, `enemy-armor-spotted`
- 정찰병/저격수: `enemy-sniper-spotted`, `need-fire-support`, flank observation
- 미래 드론: `drone-strike-opportunity`, `enemy-armor-spotted`, `need-fire-support`

## Commander Doctrine

`CommanderAI`는 세 가지 일을 분리한다.

1. `rebuildAssignments()`: 기존처럼 거점 공격/방어 큰 명령을 만든다.
2. `collectSupportRequests()`: 분대와 유닛이 올린 요청을 수집하고 TTL을 갱신한다.
3. `assignSupportAssets()`: 요청을 자산에 배정해 기존 명령을 임시로 덮는다.

지원명령은 영구 명령이 아니라 짧은 작전이다. 일정 시간 뒤에는 원래 거점 명령으로 돌아와야 한다.

험비는 현재 분대 수송과 동행 지원을 맡는다. 장거리 전진에서는 지정된 분대원 최대 4명을 태워 거점 바깥 하차 지점까지 이동시키고, 하차 후에는 뒤/측면에서 기관총 엄호를 한다. `need-fire-support`가 올라오면 승객이 없는 험비만 해당 요청에 응답한다. 전차 위협이 가까우면 임무보다 생존/회피가 우선이다.

공병 수리 요청은 분대가 아니라 손상 차량에서 나온다. 전차/험비 HP가 충분히 낮아지면 지휘관이 `need-repair`를 만들고, 수리킷이 남은 공병에게 `repairTarget`이 포함된 명령을 준다. 공병은 적 보병 접촉이나 가까운 적 장갑 위협이 있으면 수리를 보류하고 기존 생존/대전차 판단을 우선한다.

## Squad Doctrine

분대는 먼저 살아남고, 그다음 거점을 민다.

- `pre-assault`: 거점 밖에서 잠깐 대기하며 지원/경계 역할이 위치를 잡는다. 현재는 목표당 짧은 타이머로만 유지되어 영구 대기하지 않고, 타이머는 실제 준비 상태에 들어간 뒤에만 줄어든다. 분대가 충분히 모였을 때는 `분대 집결, 진입 준비` 같은 공격 전 대사를 띄운다.
- `support-fire`: 지원/경계 역할은 뒤에서 엄호하고 돌격 역할만 천천히 전진한다.
- `bounding-advance`: 돌격조와 엄호조가 번갈아 움직이는 미래 모드다.
- `fallback`: 제압/손실이 크면 위협 반대 방향으로 빠진다.
- `regroup`: 흩어지면 가상 분대장 근처로 모인다.
- `rally-with-tank`: 가까운 아군 전차를 계속 따라가는 모드가 아니라, 전차가 목표 방향 앞쪽 축에 있을 때 잠깐 엄호선만 맞추는 보정 모드다. 접촉/제압/장갑 위협이 생기면 `support-fire`, 일반 교전, 거점 진입 판단이 우선한다.
- `hold-wall`: 방어 시 벽/건물/엄폐물을 등지고 시야가 열리는 방향을 본다. 현재는 가까운 장애물 뒤쪽 샘플 지점을 우선하고, 없으면 거점 안쪽 방어 지점으로 대체한다.

`rally-with-tank`는 실제 전차 기준이다. 험비가 늘어나도 보병이 험비를 전차처럼 중심축으로 삼지 않게 하고, 험비는 별도의 분대 동행/기관총 지원 자산으로만 다룬다. 이 모드는 짧은 보조 행동이어야 하며, 보병의 자유 전진과 공격준비를 덮어버리면 실패한 교리로 본다.

## Infantry Role Doctrine

- `assault`: 거점에 가장 가까이 접근한다. 수류탄이 있으면 엄폐 보병에 사용한다.
- `support`: LMG/기관총 역할이다. `support-fire`에서는 멈춰 사격하고, 너무 가까운 전진은 피한다.
- `security`: 측면/후방을 본다. 분대가 전진할 때 드론, 저격수, 우회 보병을 먼저 감지하는 역할이다.
- `engineer`: 적 장갑 위협이 있으면 RPG 우선, 아군 장갑 손상이 크면 수리 우선이다.
- `scout/sniper`: 거점 정면 돌격이 아니라 외곽 감시, 측면 사격, 적 장갑/저격 보고를 우선한다.
- `prone-fire`: 엄폐가 없는데 제압을 받거나 방어/엄호 위치에 도착했을 때 엎드려 사격한다. LMG/지원 역할은 낮은 제압에서도 눕지만, 돌격 역할은 더 강한 제압과 충분한 교전 거리가 있어야 눕는다. 현재는 소화기 교전용 v1.1이며, 자세를 잡으면 유효사거리가 조금 늘어난다. 전차 위협 앞에서 엎드리는 행동은 우선하지 않는다.

## Engineer Doctrine

공병 판단은 `수리`, `대전차`, `생존`의 우선순위를 가져야 한다.

1. 너무 가까운 적 전차나 직접 교전 위협이 있으면 생존/대전차가 우선이다.
2. 아군 전차/험비가 손상됐고 공병이 안전하게 접근 가능하면 `need-repair`에 응답한다.
3. 수리 대상이 사선 한가운데 있으면 바로 달려가지 않고, 엄폐 접근 또는 요청 보류 상태가 된다.
4. 수리 중 적 장갑이 접근하면 수리를 끊고 엄폐/RPG 판단으로 돌아간다.

## Scout And Sniper Doctrine

정찰병은 거점 정면 보병처럼 쓰면 안 된다.

- 정찰병은 `world.reconPoints`를 기반으로 외곽/측면 감시 위치를 잡는다.
- 적 보병을 바로 쫓기보다 보고를 남기고, 안전한 사선이면 저격한다.
- 거점 공격 전에는 적 장갑, 저격수, 기관총 위치를 먼저 보고하는 역할을 맡긴다.
- 미래에는 `flank-snipe` 명령을 추가해 거점 측면으로 돌아가 일정 시간만 사격하고 빠지게 한다.

## Drone Doctrine

드론 AI는 2차 교리의 마지막에 붙인다. 이유는 드론이 시야, 감지, 폭발, 플레이어 피드백에 모두 연결되어 영향이 크기 때문이다.

미래 규칙:
- 정찰드론은 `enemy-armor-spotted`나 `objective-too-hot` 상황에서 투입한다.
- 자폭드론은 `drone-strike-opportunity`가 있고 아군이 폭발 반경에서 멀 때만 투입한다.
- 드론은 분대장 개인 장비보다 지휘관 자산처럼 다루는 쪽이 안정적이다.

## Implementation Phases

### Phase 1: Broker Skeleton

- 현재 구현됨: `CommanderAI.supportRequests` 추가.
- 현재 구현됨: `collectSupportRequests()`로 각 `SquadAI.supportRequest`를 수집.
- 현재 구현됨: `assignSupportAssets()`로 `need-armor-support` 요청에 전차 1대를 임시 배정.
- 현재 구현됨: 전차 디버그 라벨에 지원요청 타입과 배정 분대를 표시.

### Phase 2: Armor And Humvee Response

- 현재 구현됨: 전차는 요청 위치 근처의 `supportPoint`로 이동해 엄호한다.
- 현재 구현됨: 팀당 험비가 2대로 늘었고, 기본적으로 보병 분대 뒤/측면을 동행한다.
- 현재 구현됨: 험비는 분대원 일부를 태우고 거점 바깥 하차 지점까지 이동한 뒤 자동 하차시킨다.
- 현재 구현됨: 분대가 `fallback`/`regroup` 상태이고 험비가 가까우면 지정 분대원이 재탑승을 시도할 수 있다.
- 현재 구현됨: 험비는 `need-fire-support`에 반응해 보병 뒤쪽에서 기관총 지원 위치를 잡는다.
- 이미 임무 중인 자산을 무리하게 빼오지 않도록 `assignmentLockTimer`를 둔다.

### Phase 3: Engineer Repair Requests

- 현재 구현됨: 손상된 전차/험비가 `need-repair` 후보가 된다.
- 현재 구현됨: 수리킷이 남은 가까운 공병 유닛이 `repair` 임무를 받는다.
- 현재 구현됨: `repairTarget` 명령은 분대 명령보다 우선하지만, 공병 개인 AI의 접촉/장갑 위협 안전 판단은 유지한다.
- 미래 작업: 위험한 수리 요청은 보류하거나 `need-smoke`로 전환한다.

### Phase 4: Squad Doctrine Expansion

- 현재 구현됨: `pre-assault`는 거점 진입 전 엄호조가 먼저 자리 잡는 짧은 준비 상태다. F7 디버그 라벨에는 남은 준비 시간이 초 단위로 표시된다.
- 현재 구현됨: `hold-wall`은 방어 중 압박이 있을 때 장애물 뒤쪽 또는 거점 안쪽 방어 위치를 잡는다.
- 현재 구현됨: 보병은 전술 모드/지원요청/실제 수송 탑승/정찰 상태가 분명할 때 짧은 머리 위 대사로 자신의 판단을 보여준다.
- `bounding-advance`: 돌격/엄호 역할이 번갈아 이동하는 미래 상태.

### Phase 5: Scout, Sniper, Drone Assets

- 정찰병은 외곽 보고와 `enemy-sniper-spotted` 요청을 더 적극적으로 만든다.
- 저격수는 `flank-snipe`로 측면 사격 후 이탈한다.
- 드론은 정찰/타격 기회 요청에만 제한적으로 투입한다.

## Constraints

- 요청 타입은 한 번에 과하게 늘리지 않는다. 현재 끝까지 연결된 요청은 `need-armor-support`, `need-fire-support`, `need-repair`다.
- 지원명령은 기존 거점 명령을 완전히 대체하지 않는다. TTL이 끝나면 원래 임무로 복귀한다.
- 각 유닛 AI가 지휘관 전체 판단을 직접 하지 않는다. 유닛은 받은 명령을 실행하고, 요청은 보고만 한다.
- 디버그 없이 복잡한 전술을 추가하지 않는다. 보이지 않는 AI는 튜닝이 어렵다.

## Recommended Next Order

1. 실제 플레이로 험비 탑승 대기 시간, 하차 거리, 후퇴 재탑승 빈도를 튜닝한다.
2. `need-repair` 빈도와 공병이 위험 구역으로 뛰어드는지 디버그로 확인한다.
3. `pre-assault` 유지 시간과 `hold-wall` 엄폐 샘플 위치를 맵별로 조정한다.
4. `bounding-advance`는 새 전술 모드로 바로 크게 만들기보다, 먼저 `support-fire` 안에서 지원조 고정/돌격조 짧은 이동 타이밍을 나누는 얇은 버전부터 붙인다.
5. 정찰병 `enemy-sniper-spotted`와 측면 저격 명령을 추가한다. 현재 대사는 적 저격수 발견과 측면 사선/이탈 의도를 보여줄 수 있지만, 지휘관 요청 타입으로는 아직 분리하지 않는다.
6. 드론은 정찰/타격 기회 요청이 안정된 뒤 지휘관 자산으로 연결한다.
