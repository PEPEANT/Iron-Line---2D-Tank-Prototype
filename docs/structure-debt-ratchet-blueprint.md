# 구조 부채 래칫 설계도 (Structure Debt Ratchet Blueprint)

작성: 2026-07-04. 상태: **G0 구현 완료(2026-07-05). R2 기능 착수 전 안전장치로 적용됨.**
목적: 심장부 파일 비대가 재발하지 않게, 경고를 **한 방향 잠금(래칫)** 으로 바꾼다. 파일은 줄어들 수는 있어도 다시 자랄 수는 없게.

## 1. 현황 (2026-07-04 실측, `npm run check` 출력 기준)

이미 있는 것 — 이 설계도는 아래를 대체하지 않고 업그레이드한다:
- `docs/code-structure-rules.md`: 모듈 분리 규칙, 핫스팟 예산, 리뷰 체크리스트.
- `tools/check-code-health.cjs`: 예산 초과 시 실패, 1000줄+ 경고, 220줄+ 메서드 경고.
- 분리 선례: `infantry-fire-tempo.js`, `online-world-state-buffer.js`, `lobby-flow.css`, `static-room-slot-helpers.cjs`.
- 성과 증거: main.js 4,550줄(05-20) → 4,340줄(07-04). **줄이는 건 이미 해봤다.**

구멍 — 이 설계도가 메우는 것:
1. 예산이 후해서 예산 밑에서는 계속 자랄 수 있다 (경고는 무시 가능).
2. 5월 이후 새 핫스팟 8개가 경고만 받는 중: combat.js 1,599 / hud-admin-ui.js 1,600 / room-registry.js 1,596 / hud.js 1,586 / commander-ai.js 1,222 / session-flow.js 1,181 / tank.js 1,099 / game-session-state.js 1,002.
3. R2 기능(위생병/스토리/에디터)이 어느 파일로 가야 하는지 기능별 지도가 없다.

## 2. 래칫 원리 (핵심 한 줄)

> **오늘의 크기가 천장이다. 파일이 줄면 천장도 따라 내려온다. 다시는 못 올라간다.**

- `tools/hotspot-baseline.json` 생성: 감시 대상 파일의 현재 줄 수를 기록.
- `check-code-health.cjs`에 래칫 검사 추가: `현재 줄 수 > baseline + 허용치(기본 +40줄)` 이면 **실패** (경고 아님).
  - +40줄 허용치는 버그 수정 여지. 기능 본문은 40줄 안에 안 들어가므로 자연히 새 모듈로 밀려난다.
- 파일이 baseline보다 줄어든 채로 check가 돌면 baseline을 **자동 하향 갱신** (래칫). 상향 갱신 경로는 없다.
- 상향이 정말 필요하면: baseline JSON을 손으로 고치되, 같은 커밋에 `code-structure-rules.md`에 사유 1줄 필수. (스크립트는 사유 없는 상향을 막을 수 없지만, diff에 드러난다.)

감시 대상 (1차): 1,000줄 이상 전부 = main.js, infantry-ai.js, styles/styles.css, renderer.js, map-editor.js, hud-admin-ui.js, combat.js, room-registry.js, hud.js, commander-ai.js, session-flow.js, tank.js, game-session-state.js.
메서드 래칫 (2차, 선택): 220줄+ 메서드 목록도 baseline에 기록 — 현재 유일한 위반 `infantry-ai.js update()` 232줄. 새 220줄+ 메서드 등장 시 실패.

구현 결과(2026-07-05): `tools/hotspot-baseline.json` + `tools/check-code-health.cjs` 래칫 검사. 게임플레이 코드 0줄.

## 3. 기능 → 선행 이사 지도 (R2 기능은 이 표 없이 착수 금지)

| R2 기능 | 새 코드가 갈 곳 | 착수 전 선행 이사 (Boy Scout 규칙) |
| --- | --- | --- |
| 위생병/전투불능/소생 | `src/systems/player-downed.js` (신설) + `src/ai/infantry-medic.js` (신설) | main.js에 흩어진 playerDowned 30여 곳을 player-downed.js로 이사 |
| 침대전투 (폭발 후 행동) | `src/ai/infantry-blast-response.js` (신설) | infantry-ai.js `update()` 232줄을 상태별 핸들러로 분할 |
| 맵 사물 스키마 | `src/data/map-schema.js` (신설) | 이사 없음 — 신규 데이터 계층 |
| 팔레트 에디터 | `src/tools/editor-palette.js` (신설) | map-editor.js는 읽기만, 본문 추가 금지 |
| 스토리모드 씬 | `src/story/*` (신설 폴더) | main.js 수정 금지 — 씬 전환 훅 1개만 허용 |
| 새 UI 화면 전부 | 화면별 신규 CSS 파일 (`styles/` 아래, `styles/lobby-flow.css` 선례) | `styles/styles.css` 추가 금지 |

규칙: **빅뱅 리팩터 금지.** 전체 구조 수술 세션을 따로 잡지 않는다 — 배금도시가 죽은 방식이다. 이사는 항상 기능 착수 직전에, 그 기능이 만질 범위만.

## 4. 재발 방지 운영 규칙 (사람/AI 공용)

1. 핫스팟 파일에 기능 본문을 추가하려는 순간 = 새 모듈을 만들 순간. (기존 100줄 규칙 유지, 래칫이 강제)
2. 세션 종료 전 `npm run check` — 래칫 실패는 "허용치 늘리기"가 아니라 "모듈 분리"로 푼다.
3. R1 출시 후 리포를 여는 커밋은 버그 수정 또는 줄 수 감소만. 기능 확장은 R2 브랜치.
4. 이 문서와 code-structure-rules.md가 충돌하면 이 문서(더 좁은 쪽)가 이긴다. 게이트는 좁히는 것만 허용.

## 5. 구현 시점과 검증

- 구현: 2026-07-05 완료. R2 어떤 기능보다 먼저 적용한 G0 안전장치.
- 검증: (1) baseline 생성 후 `npm run check` 통과, (2) 핫스팟에 50줄 더미 추가 → check 실패 확인 → 되돌림. 파일 하향 시 baseline 자동 하향 갱신은 `check-code-health.cjs`에 구현됨.
