# 지휘관 존재감 설계도 (명령 가시화 + 재공세) — 구현 지시서

작성: 2026-07-04, Fable 5. 목적: 북극성 "전쟁에서 혼자가 아니다"를 최소 비용으로 체감시킨다.
지휘관 AI는 이미 존재한다(`src/ai/commander-ai.js`). 이 작업은 **새 시스템이 아니라 (1) 그 명령을 들리게, (2) 정체 상황에서 단호하게** 만드는 두 개의 작은 패치다.

## 패치 1: 명령 무전 가시화

### 사용할 기존 인터페이스 (확인됨)
`src/systems/battlefield-events.js` — `game.battlefieldEvents.push({ title, detail, ... })`가 조건 충족 시 `game.chat.addSystemMessage(detail || title)`로 무전 채팅에 에코된다 (47-48행, shouldEchoToChat 53행).

### 구현 지시
- `src/ai/commander-ai.js`의 `createOrder(point, options)` (130행 부근) 또는 `rebuildSquadAssignments()` (273행)에서, **아군 팀 & 새 명령일 때만** battlefieldEvents.push 1줄:
  - 메시지 형식 (짧게, "minimal text" 원칙): `"[지휘] 1분대 → B거점 압박"`, `"[지휘] 2분대 → 우측 우회"`, `"[지휘] 전차 3호 → 화력지원"`.
  - 분대명은 squad.id 또는 순번, 거점명은 objective 이름(A/B/C).
- **스팸 가드 필수**: (a) 같은 분대+같은 목표 재발령은 침묵, (b) 팀당 분당 최대 6건, (c) 적팀(red) 명령은 절대 노출 금지 (정보 유출).
- 로컬 플레이어가 속한 분대의 명령은 접두사 강조: `"[지휘] ★내 분대 → A거점 사수"`.
- shouldEchoToChat가 이벤트 종류로 거르면 commander 이벤트 타입을 허용 목록에 추가.

## 패치 2: 재공세 규칙 (템포 진단 D3)

### 문제 (실측)
접촉 후 학살 버스트가 끝나면 hold 52%로 굳어 80초+ 정체. 7 vs 5 우세여도 재공세 없음.

### 구현 지시
- `commander-ai.js`의 `update(dt)` (23행)에 15초 주기 판단 1개 추가:
  - 조건: `아군 보병 생존수 >= 적 생존수 * 1.4` && 최근 10초 팀 사망 0 && 미점령 거점 존재.
  - 행동: hold 중인 분대 중 가장 가까운 1개 분대만 다음 미점령 거점으로 advance 재발령 (전군 돌격 금지 — 한 분대씩 축차 투입이 보기에도 전술적임).
  - 재발령 시 패치 1의 무전이 자동으로 울린다: `"[지휘] 2분대 → C거점 공세 재개"`. **정체가 깨지는 순간이 플레이어에게 들리는 것까지가 이 작업의 완성이다.**
- 적 생존수 집계는 관측 기반이 이상적이나 v1은 전역 카운트 허용 (오프라인 AI 전용이므로).

## 검증
1. `npm run check` 통과.
2. 템포 프로브: 후반 80초 정체 구간(101초~)에서 사망이 다시 발생하는지, hold 모드 점유율 52% → 35% 이하.
3. census 프로브(docs/ai-eyes-blueprint.md)가 있으면: 무전 메시지 수 판당 8~20건 (스팸 가드 동작 확인).
4. 눈 확인 1회: 전투 시작 후 무전창에 지휘 명령이 흐르고, 자기 분대 명령에 ★가 붙는가.

## 금지
- 새 UI 패널 만들지 말 것 (기존 무전 채팅만 사용).
- 휴먼 지휘관 롤 아님 (그건 R2, r1-release-gate.md 백로그).
- 적팀 명령 노출 금지, 명령 로직 자체(할당 알고리즘) 변경 금지.

## Codex implementation note (2026-07-05)

- Implemented in `src/ai/commander-presence.js` as a prototype wrapper around the existing commander AI. `src/ai/commander-ai.js` command selection was not rewritten.
- Radio visibility uses existing `battlefieldEvents.push()` and `commander_order` chat echo. Local allied orders are echoed, duplicate squad+target orders stay silent, and output is capped at 6 messages per minute per commander.
- Red/enemy orders remain hidden from the default blue local player view.
- Reassault check runs every 15 seconds after commander update. It requires friendly infantry alive >= enemy infantry alive * 1.4, no friendly infantry death in the last 10 seconds, at least one unowned objective, and one holding/hold-wall squad to reissue.
- Verification added: `npm run commander:presence` covers allied echo, enemy suppression, duplicate suppression, 6/min cap, reassault issue, and recent-death block.
