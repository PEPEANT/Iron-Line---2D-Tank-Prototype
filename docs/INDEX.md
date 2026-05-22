# 문서 색인

Iron Line 2D Tank Prototype의 현재 구조, 운영 설계, AI 설계, 코드 관리 규칙을 모아둔다.

## 시스템 문서

- [코드 구조 규칙](code-structure-rules.md): 큰 파일에 코드가 계속 쌓이지 않도록 하는 모듈 분리 규칙과 `npm run check` 코드 건강도 예산.
- [온라인 운영센터](online-operations-center.md): 관리자 운영센터, 인공지능 연구실, 백업 JSON, 온라인 대비 방/슬롯/명령 패킷 상태 구조.
- [테스트랩 설계](test-lab-design.md): 관리자 테스트 허브와 `index.html?testLab=...` 기반 실험장 확장 설계.
- [인공지능/전투 구조](ai-and-combat-architecture.md): 전차 인공지능, 보병 인공지능, 병과/장비, 무기/전투 시스템의 현재 구조와 다음 확장 순서.
- [인공지능 교리 2차안](ai-doctrine-v2.md): 분대 지휘요청, 지원가 자산 배정, 공병/대전차/드론 교리 확장을 위한 2차 인공지능 설계 기준.
- [배포 전 준비](production-prep.md): 로컬 실행, 문법 검사, 시작 화면/플레이 검증 기준.
- [Commander order QA interim report](commander-order-qa-interim-report-2026-05-22.md): 2026-05-22 local live-play evidence for role-special command flow, command state visibility, command locks, and remaining offline gate checks.
- [Commander order QA completion report](commander-order-qa-completion-report-2026-05-22.md): 2026-05-22 role-level PASS decision for moving into the offline command stability gate.
- [Offline command stability gate report](offline-command-stability-gate-report-2026-05-22.md): 2026-05-22 local/offline PASS decision for role command stability, stopped-state visibility, duplicate/cancel behavior, and basic vehicle wait/stuck diagnostics before online command synchronization.
- [Online command sync interim verification report](online-command-sync-interim-verification-report-2026-05-22.md): 2026-05-22 ON TRACK checkpoint for online command packet fields, permission checks, REST command state, WebSocket ack/broadcast, duplicate/stale handling, and remaining UI/manual verification before the online stability gate.
- [Online command sync fix pass report](online-command-sync-fix-pass-report-2026-05-22.md): 2026-05-22 narrow fix pass for wrong-team target rejection, online cancel command state, updated smoke coverage, and remaining stability-gate checks.
- [Online command sync first pass report](online-command-sync-first-pass-report-2026-05-22.md): 2026-05-22 first-pass online role-command packet, permission, duplicate/stale, REST, WebSocket broadcast, and smoke-test evidence before the online commander-order stability gate.
- [Online commander-order stability gate report](online-commander-order-stability-gate-report-2026-05-22.md): 2026-05-22 PASS decision for two-client online commander-order delivery, permission checks, remote command state, command pings, and the trusted remote target-id fix before the human FPS combat loop.
- [Human FPS combat loop interim verification report](human-fps-combat-loop-interim-verification-report-2026-05-22.md): 2026-05-22 ON TRACK checkpoint for movement, aiming, shooting/ammo flow, hit/damage/death feedback, respawn, kill log, and command-while-fighting risk before finalizing the FPS loop pass.
- [FPS combat loop fix + small balance pass](fps-combat-loop-fix-balance-pass-2026-05-22.md): 2026-05-22 narrow pass for suicide-drone terminal approach speed, infantry anti-drone fire, difficulty-based fire tuning, and infantry reload HUD duplicate readout cleanup.
- [FPS fix + small balance interim verification report](fps-fix-balance-interim-verification-report-2026-05-22.md): 2026-05-22 ON TRACK interim checkpoint for suicide-drone pacing, infantry anti-drone fire, difficulty tuning, reload HUD duplicate cleanup, and remaining live visual verification before the FPS completion report.
- [FPS fix + balance correction pass](fps-fix-balance-correction-pass-2026-05-22.md): 2026-05-22 report-based correction pass confirming no extra gameplay code fix was required and listing the live visual checks that must close in the FPS completion report.
- [FPS AI rear awareness correction pass](fps-ai-rear-awareness-correction-pass-2026-05-22.md): 2026-05-22 narrow correction for tank turret/hull facing awareness, humvee gun/hull facing awareness, and slower infantry rear reaction before the FPS completion report.
- [FPS combat loop completion report](fps-combat-loop-completion-report-2026-05-22.md): 2026-05-22 PASS decision for closing the FPS loop stage after damage-cause, vehicle-contact, suicide-drone, anti-drone, reload HUD, and rear-awareness checks.
- [FPS + command integration interim verification report](fps-command-integration-interim-verification-report-2026-05-22.md): 2026-05-22 ON TRACK checkpoint for live FPS movement/fire/death plus role-command coexistence before the completion report.
- [FPS + command integration fix pass report](fps-command-integration-fix-pass-report-2026-05-22.md): 2026-05-22 report-based correction gate confirming no direct integration code fix was required before completion.
- [FPS + command integration QA report](fps-command-integration-qa-report-2026-05-22.md): 2026-05-22 PASS decision for live FPS fire/movement/death plus role-command coexistence before empty-slot BotCommander skeleton.
- [Empty-slot BotCommander skeleton first pass report](bot-commander-skeleton-first-pass-report-2026-05-22.md): 2026-05-22 PASS evidence for `human / bot / empty` slot guards, bot-sourced command packets, squad-leader delivery, and observer/admin visibility without full bot commander behavior.
- [Human FPS combat loop first pass report](human-fps-combat-loop-first-pass-report-2026-05-22.md): 2026-05-22 PASS decision for movement, aiming, firing/ammo flow, hit confirmation, damage/death/respawn feedback, kill log, and command-while-fighting before FPS + command integration QA.
