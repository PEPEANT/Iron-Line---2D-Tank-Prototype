# 리포 대청소 계획 (Repo Housekeeping Plan)

작성: 2026-07-04. 원칙: **삭제가 아니라 이사(git mv)** — 역사는 보존하고 눈앞만 치운다. 빅뱅 정리 금지, 두 묶음(H1 문서 / H2 코드)으로 나눠 각각 1세션.

## 0. 진단 (2026-07-04 실측)

| 문제 | 실측 | 위험 |
| --- | --- | --- |
| docs 비대 | md 111개 중 ~70개가 2026-05-22~24 완료/중간 보고서 | 색인이 어지러워 살아있는 문서를 못 찾음 |
| 루트 CSS 산개 | chat/home/lobby-flow/session-flow/settings-panel/admin-observer 등 15개+ | 새 CSS가 계속 루트에 쌓이는 관성 |
| 루트 혼합 | index/admin/editor/home.html + home.js + AGENT_HANDOFF.md(64KB) | 뭐가 게임이고 뭐가 부산물인지 불명 |
| 사용자가 못 짚은 것 ① | 정체불명 31바이트 파일 `Iron Line - 2D Tank Prototype` (확장자 없음) | 내용 확인 후 삭제 후보 |
| 사용자가 못 짚은 것 ② | `.tmp-chrome-tempo-probe/`가 gitignore 누락 (미추적으로 노출) | 실수 커밋 위험 |
| 사용자가 못 짚은 것 ③ | 스크린샷 PNG가 리포 루트에 미추적 방치 | 참고 자료는 `docs/refs/`로 |
| 사용자가 못 짚은 것 ④ | 미커밋 변경 9파일 + 신규 문서 6개 (며칠치 작업) | **유실 위험. 정리보다 커밋이 먼저 (G4 항목)** |
| reports 누적 | `reports/playtests/`가 프로브 실행마다 증가 | 근거 수치는 md에 옮겨 적는 관행이 이미 있음 — 원본은 커밋 불필요 |

## H1. 문서 정리 (난이도 하, 1세션 — R1 게이트와 병행 가능, 코드 0줄)

상태(2026-07-05): 완료. 2026-05-22~24 닫힌 게이트 문서 88개를 `docs/archive/2026-05-gates/`로 이사했고, `AGENT_HANDOFF.md`와 RECLAIM v6 스크린샷도 각각 `docs/archive/`, `docs/refs/`로 옮겼다. 루트 정체불명 31바이트 파일은 프로젝트명 한 줄뿐이라 삭제했다.

1. **선행: 현재 미커밋분 전부 커밋** (G4 항목과 동일. 정리 커밋과 작업 커밋을 절대 섞지 않는다.)
2. `docs/archive/2026-05-gates/` 생성 → 05-22~24 날짜의 완료/중간/교정 보고서 전부 git mv (~70개).
   - 기준: "닫힌 게이트의 증거 문서"는 아카이브, "지금도 참조하는 설계도/계획/규칙"은 잔류.
   - 잔류 예: r1-release-gate, 각종 blueprint/plan, code-structure-rules, battlefield-tempo-diagnosis(살아있는 측정 대장), iron-line-core-doctrine, INDEX.
3. `AGENT_HANDOFF.md` → `docs/archive/` (INDEX + 메모리가 역할을 대체했음. 루트에서 제거).
4. 스크린샷 PNG → `docs/refs/reclaim-v6-palette.png` 로 이사 (map-editor-v2-blueprint.md의 증거 참조 경로도 갱신).
5. INDEX.md 재작성: 살아있는 문서만 남기고, 하단에 "아카이브: docs/archive/ (닫힌 게이트 보고서)" 한 줄.
6. 정체불명 31바이트 파일: 내용 확인 → 쓰레기면 삭제 (유일한 삭제 허용 항목).
7. `.gitignore`에 `.tmp-chrome-tempo-probe/`, `reports/` 추가 (근거 수치는 md 기록으로 보존하는 기존 관행 유지).

검증: INDEX의 모든 링크가 열리는지 + `npm run check` 통과.

## H2. 루트 코드 파일 이사 (난이도 하~중, 1세션 — **R1 출시 후**, 래칫 G0와 같은 시기)

상태(2026-07-05): 완료. 루트 CSS 20개를 `styles/`로 git mv했고 `index.html`/`admin.html`/`editor.html`/`home.html`의 `<link>` 경로를 갱신했다. `home.html`/`home.js`는 현재 `index.html` 진입 흐름에는 없지만 `src/systems/hud-admin-test-hub.js`의 세력 소개 링크로 사용 중이므로 유지하고, `home.css`만 `styles/home.css`로 이동했다.

R1 전에 하지 않는 이유: index.html/admin.html의 링크 수정이 필요해서 출시 직전 화면 깨짐 위험을 만들 이유가 없다.

1. 루트 CSS 15개+ → `styles/` 폴더로 git mv, html의 `<link>` 경로 일괄 갱신. (`styles/styles.css` 본체는 래칫 감시 대상이므로 이사만, 내용 불변.)
2. `home.html`/`home.js`/`home.css`: 현재 진입 흐름(index.html의 bootScreen→메인)에서 아직 쓰이는지 확인 → 미사용이면 아카이브, 사용 중이면 잔류 명시.
3. 검증: PC/모바일 각 1회 화면 로드 + `npm run check`.

## 재발 방지 규칙 (새 파일이 갈 곳)

| 새로 만드는 것 | 위치 |
| --- | --- |
| 설계도/계획/규칙 md | `docs/` + INDEX 등록 |
| 게이트 완료 보고서 md | `docs/` 에 쓰되, 게이트가 닫히면 다음 세션에 `docs/archive/YYYY-MM-*/`로 |
| 새 CSS | `styles/` (H2 후) — 루트 금지, `styles/styles.css` 추가 금지(래칫) |
| 참고 이미지/스크린샷 | `docs/refs/` |
| 실험/프로브 결과 | `reports/` (gitignore — 수치는 md에 옮겨 적는다) |
| 임시 파일 | `.tmp-*` (gitignore) |

## 우선순위 삽입

- **H1(문서)**: R1 게이트 중에도 가능 — 커밋(G4) 직후 아무 세션에나 30분.
- **H2(코드 파일)**: R2 진입 시 래칫 G0와 같은 세션 또는 직후.
- r1-release-gate.md의 R2 우선순위 목록에 반영됨.
