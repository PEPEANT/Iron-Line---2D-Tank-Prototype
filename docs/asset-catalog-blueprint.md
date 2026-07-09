# 에셋 카탈로그/검수 설계 메모

작성: 2026-07-04  
갱신: 2026-07-09

## 현재 상태

- 예전 `src/systems/test-lab-asset-preview.js` 기반 카탈로그는 폐기됐다.
- 현재 테스트랩은 `src/systems/test-lab-ui.js`의 단일 샌드박스 도감 구조를 쓴다.
- 오브젝트/유닛 배치는 `index.html?testLab=sandbox`에서 카드 선택 후 맵 클릭으로 확인한다.
- 에셋 드롭 현황은 `npm run asset:drop`으로 본다.
- 에셋 팩 계약 검사는 현재 `npm run check` 안의 `check-asset-pack.cjs`가 담당한다.

## 원칙

1. 에셋 카탈로그는 게임플레이 수치를 복제하지 않는다.
2. 충돌, 엄폐, 체력, 피해량 같은 값은 기존 게임 데이터에서만 읽는다.
3. 새 JSON 카탈로그를 별도로 만들기보다 기존 `INFANTRY_WEAPONS`, `sceneryCatalog`, asset pack manifest를 보여주는 뷰로 유지한다.
4. 맵 에디터와 연결할 때도 같은 목록 빌더를 공유한다.

## 다음 작업 후보

- `IronLine.assetCatalogList()` 같은 공용 목록 빌더를 추가한다.
- 샌드박스 도감과 맵 에디터가 같은 목록을 읽도록 정리한다.
- 컷팅 랩이 내보낸 JSON의 `pivot`/`actionPoint`를 에셋 검수 화면에서 함께 보여준다.
- 실제 PNG가 없는 스토리/오디오 슬롯은 `asset:drop`에서 계속 경고만 내고, 본편 실행은 막지 않는다.

## 금지

- `future3d`, `modelPath`, `collisionFootprint`, `coverValue` 같은 미래용/게임플레이 복제 필드를 에셋 카탈로그에 넣지 않는다.
- 테스트랩에서 에셋 수치를 직접 수정하지 않는다.
- 검수 화면을 새 게임 로직의 우회 경로로 쓰지 않는다.
