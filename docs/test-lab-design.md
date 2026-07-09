# 테스트랩 설계 (샌드박스 v2)

결론: 테스트랩은 모드 분기 없는 단일 샌드박스다. 도감에서 카드를 고르고 맵을 클릭하면 그 자리에 배치된다.

## 목적

- 새 그래픽 에셋(유닛, 오브젝트)을 추가한 즉시 실제 게임 루프/렌더러/물리/AI 위에서 확인한다.
- 유닛 도감을 끌어다 맵에 놓고 교전을 붙이는 검증 흐름을 몇 초 안에 만든다.
- 복잡한 실험 모드(구 hub/unit/drone/balance/audio/skin/objects)는 폐기했다.

## 진입점

- `index.html?testLab=sandbox`: 샌드박스 실험장. (`testLab=` 값은 무엇이든 샌드박스로 동작)
- `editor.html`: 전체 맵 에디터.
- `admin.html`: 분리형 관리자 화면. 실험장 바로가기 버튼 제공.
- `ops.html`: 운영센터. 모든 진입점을 한눈에 본다.

## 조작 흐름

1. 오른쪽 패널의 도감 탭(보병/차량/오브젝트)에서 카드를 클릭한다.
2. 배치 팀(청팀/홍팀)을 고른다. 오브젝트는 팀 무관.
3. 맵을 클릭하면 그 좌표에 배치된다. 카드가 선택된 동안 연속 배치된다.
4. 우클릭 또는 ESC로 배치 모드를 해제한다.
5. `인공지능 켜기`를 누르면 배치한 유닛들이 실제 AI로 교전한다.
6. `전부 삭제`로 배치한 유닛/오브젝트를 한 번에 정리한다.

기능키는 유지된다: F1 보병, F2 전차, F3 험비, F4 AI 토글, F5 보급, F6 드론 지붕, F7 AI 디버그.

## 도감 데이터 규칙

도감 카드는 하드코딩하지 않고 카탈로그에서 파생한다. 카탈로그에 항목을 추가하면 도감에 자동으로 나타난다.

- 보병 카드: `IronLine.constants.INFANTRY_WEAPONS`에서 `type: "gun"`인 무기마다 1장 + 공병/정찰 클래스 카드.
- 차량 카드: 전차, 험비, 정찰드론.
- 오브젝트 카드: `IronLine.sceneryCatalog.obstacleKinds`의 kind × variant마다 1장.

## 구현 위치

- UI/배치 로직: `src/systems/test-lab-ui.js` 단일 모듈.
- 스타일: `styles/test-lab.css`.
- 독립 실험장 맵: `src/data/test-lab-map.js` (`test-lab-proving-ground`).
- 스폰 헬퍼(F키/드론): `src/main.js`의 `spawnTestLab*`.
- 정적 검증: `tools/check-test-lab-sandbox.cjs` (`npm run lab:sandbox`).

## 제약

- 테스트랩 UI를 만들기 위해 실전 밸런스를 바꾸지 않는다.
- 배치물 id는 `lab-place-` 접두사를 유지한다. 정리 로직이 이 접두사로 걸러낸다.
- 새 실험 기능은 모드를 되살리지 말고 도감 카드 또는 패널 버튼으로 추가한다.
