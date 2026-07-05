# 폭발·타격 체감 계획 (고폭탄 / 자폭드론 / 발사 효과)

작성: 2026-07-04. 상태: 계획만, 코드 미수정. R1 게이트 G3(표면 품질)에 속함.

## 진단 (코드 근거)

1. **폭발이 단조롭다**: 현재 폭발은 그라디언트 원 1개가 커지며 사라짐 + 링 1개 (`renderer.js` drawExplosions, 슬롯 `combat.explosion.core/smoke`, `combat.blast.ring`). 섬광→화구→연기기둥→파편의 **단계(프레임) 변화가 없음**. "한 단계 아래" 체감의 시각적 원인.
2. **사운드 전무**: 게임 본편에 오디오 재생 코드가 없음 (test-lab-ui.js 미리보기뿐). **폭발 체감의 절반은 소리다. 이게 최우선.**
3. **자폭드론이 락온 유도**: `infantry-weapons.js` kamikazeDrone에 lockAcquireRange 760 / lockAcquireTime 0.68 / autoDetonateRadius 34 등 락온·자동기폭 체계. 유저 결정: **락온이 아니라 조준 발사(dumb-fire)** — 빗나갈 수 있고, 대신 어디에 맞든/수명이 끝나든 반드시 폭발.

## 방침 (결정)

- 순서: **① 사운드 → ② 폭발 시각 업그레이드 → ③ 자폭드론 dumb-fire**. 소리가 가장 싸고 체감이 가장 큼.
- 시각은 스킨엔진 패턴 재사용: **절차적 폴백은 유지 + 플립북(스프라이트 시트) 슬롯을 규격만 추가** → 아트가 생기면 드롭인, 없어도 R1 출시 가능.

## 작업 상세

### ① 사운드 v1 (신규 시스템, 작게)
- 새 파일 `src/systems/audio.js`: WebAudio 1개 컨텍스트, `IronLine.audio.play(id, {x, y, volume})` — 카메라 거리 감쇠, 동시 재생 8개 제한, 첫 입력 시 unlock.
- 슬롯: `assets/audio/<id>.ogg|mp3` — 파일명 규약: `explosion-he`, `explosion-drone`, `tank-fire`, `rifle-fire`, `mg-fire`, `hit-metal`. 파일 없으면 무음 (기존 무기 PNG와 같은 드롭인 규약).
- 소스: Kenney.nl / freesound CC0에서 유저가 직접 받아서 폴더에 넣기. **AI가 파일을 만들 수 없으니 이 6개 파일은 유저 숙제.**
- 호출 지점: `combat.js` resolveImpact/fireRifle/fireTankShell 부근 각 1줄.
- 2026-07-05 Codex 구현: `src/systems/audio.js`를 추가하고 `index.html`에 연결했다. WebAudio unlock, 카메라 거리 감쇠, 동시 재생 8개 제한, `.ogg`→`.mp3` 순서 드롭인 로딩, 파일 없음 무음 폴백을 구현했다. 호출은 보병 화기, 전차 주포, 고폭/RPG/수류탄 폭발, 드론 폭발, 장갑 금속 피격 지점에만 얇게 추가했다. 실제 음원 파일은 아직 없다.

### ② 폭발 시각 업그레이드 (절차적, 에셋 불필요)
`combat.js` 폭발 생성 + `renderer.js` drawExplosions 수정:
- 3단계: 섬광(0~0.06s, 흰 원+가산합성) → 화구(0.06~0.3s, 주황→검정 그라디언트 + 불규칙 원 3~4개 겹침) → 연기(0.3~1.5s, 위로 떠오르는 회색 원들, 기존 smoke 재활용).
- 파편: 6~10개 선분이 방사형으로 튐 (기존 tracer 렌더 재사용, 0.2s).
- 흙먼지 링: 지면 색 링이 빠르게 확장 (기존 blast.ring 속도 2배, 두께 감쇠).
- 화면 셰이크: 거리 감쇠 강화 (가까우면 지금의 1.5배, 멀면 0).
- 고폭탄/RPG/드론/수류탄 모두 같은 함수, `splash` 크기로 스케일.
- (선택) 플립북 슬롯 규격: `combat.explosion.flipbook` = { src, frames, fps, size } — 규격만 문서화, 렌더러 지원은 아트 생긴 뒤.
- 2026-07-05 Codex 렌더 1차: `src/systems/renderer-explosions.js`가 기존 `game.effects.explosions` 데이터를 3층 렌더(초기 섬광/화구/후반 연기)로 그린다. 전투 피해, 폭발 생성, 드론 조작, 잔해 데칼은 아직 바꾸지 않았다.

### ③ 자폭드론 dumb-fire 전환
`src/entities/suicide-drone.js` + `infantry-weapons.js` config:
- 락온 제거: lockAcquireTime 계열 무시(플레이어 조종 시), 조준 방향 직진 + 완만한 조향만.
- 기폭 조건 단순화: **아무 충돌이든 즉시 폭발** (impactDetonate), 근접 자동기폭(autoDetonateRadius)은 유지하되 34→20으로 축소(스침 보너스 느낌만), 배터리 소진 시 그 자리에서 폭발.
- 빗나감 = 지나가서 벽/지면에 터짐. 폭발 이펙트는 ②를 그대로 사용.
- AI 사용 드론은 기존 로직 유지 (밸런스 재작업 방지).

### ④ 폭발 잔해 (지면에 남는 흔적)
설계 원칙: **시각 전용 데칼, 충돌·AI·온라인 동기화에 절대 안 얹음** (이미 scorch mark가 이 패턴 — 그대로 확장).
- `combat.js` 폭발 처리에서 scorch 생성 옆에 잔해 데칼 3~6개 추가: splash 반경 안 랜덤 위치, 종류 = 흙덩이(어두운 타원)·그을린 파편(검은 다각형 2~3각)·드론 폭발이면 기체 조각(회색 사각 + 프로펠러 선).
- 저장: `game.effects.debris` 배열 1개, 상한 120개 FIFO(오래된 것부터 제거), 생성 후 60초 뒤 서서히 페이드. 프레임당 신규 할당 없음.
- 렌더: `renderer.js` drawScorchMarks 직후 같은 패스(유닛 아래)에서 그림. 카메라 밖 컬링.
- 스타일 슬롯: `combat.debris.decal` (색·알파) — 나중에 이미지 잔해로 교체 가능하게 기존 슬롯 패턴 유지.
- 전차 잔해(wreck-cover, 엄폐 제공)와 역할 구분: 그건 게임플레이 오브젝트, 이건 순수 그림. 섞지 말 것.
- 2026-07-05 Codex debris v1: `src/systems/explosion-debris.js`가 기존 폭발 객체를 감지해 `game.effects.debris`를 생성/갱신하고, `drawScorchMarks` 뒤에서 지면 데칼로 렌더한다. 상한 120개, 수명 60초, 충돌·AI·온라인 동기화 없음.

## 검증
- 관리자 패널 → 스폰 탭에서 드론/전차 스폰 → 눈+귀로 확인. 템포 프로브로 deaths/min 6~12 유지 확인 (드론 명중률 하락로 자연 너프됨 — 의도).

## 유저 진행 중 (건드리지 말 것)
- 무기 데이터 사거리/희망 교전거리 직접 조정 중: 기관총/LMG를 지원화기로 상향, 권총은 이번 범위 제외. → AI 쪽 engagementHoldRange는 이 데이터를 그대로 따라가므로 추가 코드 불필요.
