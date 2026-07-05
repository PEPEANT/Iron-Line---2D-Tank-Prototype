# 문서 색인

Iron Line 2D Tank Prototype의 현재 작업 문서만 모아둔다. 닫힌 2026-05 게이트 보고서는 `docs/archive/`로 이사했다.

## 먼저 볼 문서

- [루트 AGENTS.md](../AGENTS.md): 모든 AI 작업자의 계약. 읽기 순서, 검증, 설계도 불일치 시 중단 규칙.
- [R1 출시 게이트](r1-release-gate.md): ALPHA R1.0 범위, G1~G4 체크리스트, R2 백로그.
- [우선순위 고정](priority-lock-2026-07-03.md): 단기 작업 순서. 순서를 바꾸려면 이 문서를 먼저 수정.
- [수복 R1 북극성](subok-r1-north-star.md): 장기 방향과 "전쟁에서 혼자가 아니다" 기준.
- [Iron Line core doctrine](iron-line-core-doctrine.md): 2026-07-03 대화에서 확정된 핵심 판단과 보존할 본질.

## 운영/구조 규칙

- [코드 구조 규칙](code-structure-rules.md): 큰 파일에 기능이 계속 쌓이지 않도록 하는 모듈 분리 규칙과 `npm run check` 코드 건강도 예산.
- [구조 부채 래칫 설계도](structure-debt-ratchet-blueprint.md): 핫스팟 파일 비대 재발 방지. 구현은 R2 진입 조건 G0.
- [리포 대청소 계획](repo-housekeeping-plan.md): 문서 아카이브, 루트 파일 정리, gitignore, 새 파일 위치 규칙. H1은 완료 대상, H2는 R1 후.
- [배포 전 준비](production-prep.md): 로컬 실행, 문법 검사, 시작 화면/플레이 검증 기준.
- [온라인 운영센터](online-operations-center.md): 관리자 운영센터, AI 연구실, 백업 JSON, 온라인 대비 방/슬롯/명령 패킷 상태 구조.
- [테스트랩 설계](test-lab-design.md): `index.html?testLab=...` 기반 실험장 확장 설계.

## 전투/AI 현재 설계

- [인공지능/전투 구조](ai-and-combat-architecture.md): 전차 AI, 보병 AI, 병과/장비, 무기/전투 시스템의 현재 구조와 확장 순서.
- [인공지능 교리 2차안](ai-doctrine-v2.md): 지원요청, 지휘관 배정, 자산 실행 흐름 기준.
- [AI 행동 관측 계획](ai-behavior-observability-plan.md): 수류탄, 제압사격, 엎드림, 사격-기동 분업을 숫자와 리플레이로 검증하는 상위 계획.
- [전장 템포 진단](battlefield-tempo-diagnosis-2026-07-03.md): deaths/min, survival, prone ratio 등 AI 전투 템포 측정 대장.
- [침대전투 버그 / 전투불능 흐름 계획](bed-combat-and-downed-flow-plan.md): 폭발 뒤 엎드림 고착, 산개/엄폐/후송/소생 방향, 사망 UI 재설계 기준.
- [폭발·타격 체감 계획](explosion-impact-plan.md): 고폭탄, 자폭드론, 발사 효과, 사운드 체감 개선 계획.

## 구현 지시서

- [AI의 눈 구현 설계도](ai-eyes-blueprint.md): `check-behavior-census.cjs`, 리플레이 뷰어, npm 별칭 구현 지시서.
- [모바일 시야 확보 설계도](mobile-fov-blueprint.md): 모바일 기본 줌, 핀치 줌, 시야 토글 지시서.
- [지휘관 존재감 설계도](commander-presence-blueprint.md): 지휘관 AI 명령 무전 가시화와 재공세 최소 패치 지시서.
- [보급/장비 시스템 설계도](supply-loadout-blueprint.md): 병과 제거, 기본 소총, 보급 인출, AI 사용 판단 분업 태그.
- [에셋 도감/검수실 설계도](asset-catalog-blueprint.md): 맵에디터보다 먼저 필요한 에셋 검수/카탈로그 기준.

## 에셋/확장 설계

- [에셋팩 구조](asset-pack-structure.md): manifest, registry, renderer fallback, 전투 피드백 슬롯 기준.
- [소프트웨어 기반 / 대규모 전장 / 맵에디터 계획](software-foundation-scale-editor-plan.md): 최대 병력 렉, 성능 예산, AI LOD, 맵에디터/도감/스토리모드 확장 기준.
- [맵에디터 V2 설계도](map-editor-v2-blueprint.md): 맵 스키마, 사물 팔레트, AI 초안→사람 재배치→템포 검증 파이프라인.
- [스토리모드 × 온라인 융합 진단](story-mode-online-convergence-diagnosis-2026-07-04.md): 배금도시 v3 코드 실사와 R2 온라인 재설계/R3 스토리모드 순서.

## 참고/아카이브

- [참고 이미지](refs/): 스크린샷, 팔레트 선례 등 문서용 자료.
- [아카이브](archive/): 닫힌 게이트 보고서와 레거시 `AGENT_HANDOFF.md`. 현재 작업 지시가 아니라 증거 보관용.
