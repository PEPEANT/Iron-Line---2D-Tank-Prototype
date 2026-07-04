# Asset Pack Structure

작성일: 2026-07-03 KST · 갱신: 2026-07-04 KST (전차 스프라이트 슬롯 + 무기 UI 아트 추가)

현재 결론: Iron Line의 에셋 개선은 이미지 교체부터 시작하지 않고, 먼저 `asset pack -> registry -> renderer fallback` 구조를 고정한다.

## 목적

외주 에셋이나 AI 생성 에셋을 바로 렌더러에 박지 않는다. 전투 피드백, 로비 배경, 차량 잔해, 이후 유닛 스프라이트가 같은 방식으로 갈아끼워질 수 있게 슬롯 이름과 교체 규칙을 먼저 둔다.

이 구조의 첫 목표는 Steam Workshop 수준 UGC가 아니다. 지금 목표는 에셋 교체가 코드, HP, 피해량, AI 판단, 온라인 권한을 건드리지 못하게 막는 것이다.

## 현재 파일

- `assets/packs/default/manifest.json`: 외주 / 교체 기준이 되는 기본 manifest.
- `assets/packs/lab-ai-tank/manifest.json`: 전차 스프라이트 슬롯 예제 pack (`?assetPack=`으로 즉시 테스트).
- `assets/weapons/<weaponId>.png`: 로비/로드아웃 UI 무기 일러스트. 파일명은 `INFANTRY_WEAPONS` id와 동일. 없으면 이미지만 숨고 텍스트 유지.
- `tools/generate-weapon-placeholders.cjs`: 무기 일러스트 플레이스홀더 12종 생성기 (기존 파일은 보존, `--force`로 재생성).
- `src/data/default-asset-pack.js`: manifest fetch가 없어도 게임이 도는 내장 fallback pack.
- `src/systems/asset-registry.js`: 런타임 registry. 슬롯 조회, style fallback, image preload, query manifest loading을 담당한다.
- `src/systems/renderer-vehicle.js`: `vehicleSpriteSlot` / `drawVehicleSprite` — 전차 스프라이트 슬롯을 실전 렌더러에서 소비. 슬롯이 없으면 기존 벡터 드로잉으로 자동 폴백.
- `tools/check-asset-pack.cjs`: 모든 pack manifest + 무기 아트 12종 + gameplay key 금지를 검사한다.

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

## 전차 스프라이트 슬롯 (2026-07-04 추가)

실전 렌더러가 소비하는 이미지 슬롯. **manifest에 슬롯이 있고 이미지가 로드되면 스프라이트, 아니면 기존 벡터 드로잉** — 게임은 어느 쪽이든 항상 돈다.

| 슬롯 id | 기준 크기(월드 단위) | 앵커 |
| --- | --- | --- |
| `vehicle.tank.hull` | 길이 80 × 폭 54 | 이미지 중심 = 차체 중심 |
| `vehicle.tank.turret` | 길이 92 × 폭 40 (포신 포함) | 이미지 중심 = 포탑 회전축 (offset으로 보정) |
| `vehicle.tank.wreck` | 길이 80 × 폭 54 | 이미지 중심 = 차체 중심 |

- 팀별 변형: `vehicle.tank.hull.blue` / `.red`가 있으면 우선 사용, 없으면 공용 슬롯.
- 권장 제작 방향: **포신이 오른쪽(+X)** 을 향하게. 위를 향한 그림은 `"rotate": 90`.
- style 조정 노브: `width`, `height` (이미지 자체 축 기준 스케일), `rotate` (도 단위), `offsetX`/`offsetY` (이미지 축 기준 앵커 보정), `crop` (`[x, y, w, h]` 픽셀 bbox — 투명 여백 잘라내기).
- 예제: `assets/packs/lab-ai-tank/manifest.json`. 테스트 URL: `index.html?assetPack=assets/packs/lab-ai-tank/manifest.json`
- 험비/보병 스프라이트 슬롯은 전차 규약이 실전에서 검증된 뒤 같은 패턴(`vehicle.humvee.*`, `unit.infantry.*`)으로 확장한다.

## 무기 UI 일러스트 (2026-07-04 추가)

pack manifest와 별개로, 로비 UI(로드아웃/무기 선택/병과 카드)는 `assets/weapons/<weaponId>.png`를 직접 읽는다.

- 파일명 = `INFANTRY_WEAPONS` id (예: `machinegun.png`, `rpg.png`, `kamikazeDrone.png` — 12종)
- 권장 96×48 투명 PNG, 총구 오른쪽
- 실제 일러스트가 생기면 같은 파일명으로 덮어쓰기. 파일이 없으면 UI는 텍스트만 표시.

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

1. ~~전차 스프라이트 슬롯을 실전 렌더러에 연결~~ (2026-07-04 완료 — hull/turret/wreck)
2. `?assetPack=assets/packs/lab-ai-tank/manifest.json`으로 실전 스프라이트 크기/앵커를 눈으로 튜닝한다 (특히 turret `offsetY`).
3. 험비 → 보병 순으로 같은 스프라이트 패턴 확장.
4. 외주용 P0 슬롯별 사이즈 / 프레임 수 / 투명 PNG 기준을 정한다.
5. 폭발 / 연기 / 스파크 PNG를 일부 슬롯에만 붙여 canvas fallback과 비교한다.
6. 창작마당(UGC)은 R2+: 현재의 `?assetPack=URL` 로딩이 그 기반이며, R2에서 pack 선택 UI만 얹으면 된다. R1에서는 만들지 않는다.
