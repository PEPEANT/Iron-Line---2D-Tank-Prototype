# Asset Pack Structure

작성일: 2026-07-03 KST

현재 결론: Iron Line의 에셋 개선은 이미지 교체부터 시작하지 않고, 먼저 `asset pack -> registry -> renderer fallback` 구조를 고정한다.

## 목적

외주 에셋이나 AI 생성 에셋을 바로 렌더러에 박지 않는다. 전투 피드백, 로비 배경, 차량 잔해, 이후 유닛 스프라이트가 같은 방식으로 갈아끼워질 수 있게 슬롯 이름과 교체 규칙을 먼저 둔다.

이 구조의 첫 목표는 Steam Workshop 수준 UGC가 아니다. 지금 목표는 에셋 교체가 코드, HP, 피해량, AI 판단, 온라인 권한을 건드리지 못하게 막는 것이다.

## 현재 파일

- `assets/packs/default/manifest.json`: 외주 / 교체 기준이 되는 기본 manifest.
- `src/data/default-asset-pack.js`: manifest fetch가 없어도 게임이 도는 내장 fallback pack.
- `src/systems/asset-registry.js`: 런타임 registry. 슬롯 조회, style fallback, image preload, query manifest loading을 담당한다.
- `tools/check-asset-pack.cjs`: required slot, 이미지 경로, gameplay key 금지를 검사한다.

`index.html`은 `default-asset-pack.js`와 `asset-registry.js`를 renderer보다 먼저 로드한다.

## 슬롯 우선순위

P0 전투 피드백:

- `combat.tracer.line`
- `combat.muzzle.flash`
- `combat.explosion.core`
- `combat.explosion.smoke`
- `combat.blast.ring`
- `combat.impact.spark`
- `combat.smoke.cloud`

P1 기반 / 첫인상:

- `combat.gun-smoke.puff`
- `vehicle.wreck.tank`
- `vehicle.wreck.humvee`
- `lobby.background.operation`
- `lobby.hero.screenshot`

유닛 스프라이트는 아직 P0가 아니다. 먼저 폭발, 연기, 피격, 총구 화염, 트레이서, 차량 파괴, 로비 배경이 외적 퀄리티를 가장 빨리 올린다.

## 교체 규칙

에셋팩은 외형만 바꾼다.

허용:

- 이미지 경로
- 색상
- 알파
- 선 두께
- 모바일 최소 두께
- canvas fallback 스타일
- 로비 배경 fallback

금지:

- HP
- 피해량
- 사거리
- 재장전
- 이동속도
- 팀 판정
- AI 판단
- 온라인 권한
- 히트박스

`tools/check-asset-pack.cjs`는 manifest에 gameplay key가 들어오면 실패해야 한다.

## 외주 전달 기준

첫 외주 또는 AI 에셋 생성 요청은 유닛 풀세트보다 전투 피드백 패키지로 자른다.

요청 단위:

```text
Iron Line용 2D 현대전 전장 에셋 패키지.
우선순위는 폭발, 연기, 피격 스파크, 총구 화염, 트레이서, 차량 파괴, 로비 배경.
모바일 작은 화면에서도 식별 가능해야 하며, 기존 canvas fallback을 대체할 수 있어야 한다.
성능/데미지/AI/온라인 판정은 절대 바꾸지 않는다.
```

결과물은 slot id를 기준으로 받는다.

예:

```text
combat.explosion.core
combat.smoke.cloud
combat.muzzle.flash
lobby.background.operation
```

## 사용 방법

기본 빌드는 내장 pack을 쓴다.

외부 manifest를 테스트할 때는 로컬 서버에서 다음 query를 쓴다.

```text
index.html?assetPack=assets/packs/default/manifest.json
```

별도 pack은 같은 schema를 유지하고 `basePath`와 `slots`만 바꾸면 된다.

## 다음 작업

1. 외주용 P0 슬롯별 사이즈 / 프레임 수 / 투명 PNG 기준을 정한다.
2. 로비 배경 전용 `lobby.background.operation` 샘플을 만든다.
3. 폭발 / 연기 / 스파크 PNG를 일부 슬롯에만 붙여 canvas fallback과 비교한다.
4. 모바일 화면에서 `combat.tracer.line.mobileMinWidth`와 `combat.impact.spark.mobileMinWidth`를 조정한다.
