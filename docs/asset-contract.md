# 에셋 계약 (Asset Contract)

결론: 아래 표의 파일명과 폴더만 지키면, 파일을 던져넣는 것만으로 게임에 반영된다. 코드 수정 불필요.

현황 확인: `npm run asset:drop` · 커밋 전 필수 검증: `npm run check`

## 1. 그래픽

### 무기 아이콘 (필수)

| 위치 | 파일명 | 크기/포맷 | 반영 위치 |
| --- | --- | --- | --- |
| `assets/weapons/` | `<무기id>.png` | 96x96 투명 PNG | 무기 슬롯바, 도감 |

현재 플레이어 선택 가능 무기 id(6종): `rifle` `pistol` `grenade` `machinegun` `rpg` `sniper`
(원본: `src/data/infantry-weapons.js`의 `PLAYABLE_INFANTRY_WEAPON_IDS` — 내부 구형 무기 정의는 호환용으로 남길 수 있지만 UI 선택지는 이 목록을 기준으로 제한)

### 메뉴/보병 UI 아트 (필수)

| 위치 | 파일명 | 반영 위치 |
| --- | --- | --- |
| `assets/ui/` | `soubok-title.png` | 메인 메뉴 타이틀 |
| `assets/ui/` | `soubok-button-custom.png` `soubok-button-online.png` `soubok-button-story.png` | 메인 메뉴 버튼 3종 |
| `assets/ui/` | `soubok-soldier.png` `soubok-refugee.png` `soubok-north-soldier.png` | 메인 메뉴 장식 인물 |
| `assets/ui/` | `soubok-infantry-top.png` `soubok-infantry-prone.png` `soubok-infantry-dead.png` | 인게임 보병 기본 호환 슬롯 |
| `assets/ui/infantry/` | `soubok-infantry-stand-01.png` `soubok-infantry-stand-02.png` `soubok-infantry-stand-fire.png` `soubok-infantry-stand-fire-walk.png` | 보병 서기/걷기/서서 사격 프레임 |
| `assets/ui/infantry/` | `soubok-infantry-prone-crawl-01.png` `soubok-infantry-prone-crawl-02.png` `soubok-infantry-prone-fire.png` `soubok-infantry-prone-no-gun.png` | 엎드림/기어가기/엎드려 사격 프레임 |
| `assets/ui/infantry/` | `soubok-infantry-dead-01.png` `soubok-infantry-dead-02.png` `soubok-infantry-dead-prone.png` | 사망 자세 프레임 |
| `assets/ui/` | `main-background.png` `loading-background.png` | 배경 |

투명 PNG. 기본 호환 슬롯 3개는 유지하고, 새 보병 상태 프레임은 `assets/ui/infantry/` 아래 파일명으로 교체한다. 새 원본을 넣을 때는 흰 배경을 제거한 투명 PNG로 저장한다.

#### 2026-07-09 보병 v2 리그/baked 실험 폐기 기록

결론: `v2` 파츠 리그와 `baked` 자동 굽기 결과물은 **본편 적용에서 제외**한다. 본편 보병은 `assets/ui/infantry/` 아래의 **직접 그린 통짜 PNG 프레임**을 기준으로 한다.

폐기 이유:
- 팔, 손, 총기 기준점이 계속 꼬여서 걷기/사격 자세 일관성이 무너졌다.
- JSON 앵커와 총기 파츠를 런타임 또는 굽기 단계에서 합성하면, 실제 손맛보다 디버깅 비용이 커진다.
- 보병은 화면에 많이 나오므로 렌더러에서 IK/파츠 조립을 늘리면 성능 예산에도 불리하다.
- 사용자가 직접 그린 총 포함 프레임이 현재 게임 톤과 가장 잘 맞는다.

현재 본편 기준:
- 보병 렌더러: `src/systems/renderer-soubok-infantry-art.js`
- 무기 렌더러: `src/systems/renderer-infantry-weapons.js`
- 서기/걷기/사격 프레임: `assets/ui/infantry/soubok-infantry-stand-01.png`, `soubok-infantry-stand-02.png`, `soubok-infantry-stand-fire.png`, `soubok-infantry-stand-fire-walk.png`
- 엎드림/기어가기/사망 프레임: `assets/ui/infantry/soubok-infantry-prone-crawl-01.png`, `soubok-infantry-prone-crawl-02.png`, `soubok-infantry-prone-fire.png`, `soubok-infantry-prone-no-gun.png`, `soubok-infantry-dead-01.png`, `soubok-infantry-dead-02.png`, `soubok-infantry-dead-prone.png`

보관만 하는 실험 자료:
- 리그 랩: `docs/design-drafts/infantry-rig-lab.html`
- 리그 도구 코드: `src/systems/infantry-rig-lab.js`
- 리그 원본/핀 JSON: `assets/ui/infantry/rig/`
- 자동 굽기 결과: `assets/ui/infantry/baked/`

앞으로의 스킨 작업 기준:
- `assets/ui/infantry/`에는 본편에서 바로 쓰는 최종 PNG만 둔다.
- 걷기/사격/무기별 특수 자세는 직접 그린 통짜 프레임으로 교체한다.
- 필요하면 `stand-fire-rifle`, `stand-fire-rpg`, `stand-fire-pistol`처럼 무기별 프레임 슬롯을 추가한다.
- `assets/ui/infantry/rig/`와 `assets/ui/infantry/baked/`는 참고 자료로만 남기고 본편 계약에는 넣지 않는다.

### 스토리 카드 (선택 — 없으면 자동 플레이스홀더)

| 위치 | 파일명 | 크기/포맷 | 반영 위치 |
| --- | --- | --- | --- |
| `assets/ui/story/` | `chapter-01.png` ~ `chapter-08.png` | 800x600 (4:3) PNG | 스토리 화면 챕터 카드 |

카드에서 `cover`로 잘리므로 핵심 요소는 중앙 배치. 챕터 원본: `src/data/story-chapters.js`

### 세력 로고

| 위치 | 파일명 | 반영 위치 |
| --- | --- | --- |
| `assets/factions/` | `korea.png` `usa.png` `russia.png` `china.png` `singularity.png` `military-gallery.png` | 세력 선택, 로비 |

### 이펙트/차량 팩 (고급)

`assets/packs/<팩이름>/manifest.json` 방식. 슬롯 id로 트레이서, 폭발, 잔해 스타일을 교체한다.
게임플레이 수치(damage, hp, range 등)는 팩에 넣을 수 없다 — `npm run check`가 차단한다.
구조 문서: `docs/asset-pack-structure.md`

## 2. 컷랩 JSON 기준

컷랩 위치: `docs/design-drafts/asset-crop-lab.html`

- `sourceRect`: 원본 시트에서 잘라낼 박스.
- `pivot`: 잘라낸 PNG 안에서 배치/회전에 쓰는 기준점. 빨간 점.
- `actionPoint`: 총구, RPG/미사일 발사점, 수류탄 손놓기, 폭발 중심. 컬러 점.
- `actionPoint.type`: `muzzle`, `projectile`, `release`, `explosion` 중 하나. 필요 없으면 `null`.
- 박스 크기를 조절해도 `pivot`과 `actionPoint`는 원본 시트의 같은 위치를 최대한 유지한다.
- 자유 회전축을 따로 늘리지 않는다. 복잡도가 커지므로 현재 기준은 `pivot` 하나로 고정.

## 3. 사운드 (선택 — 없으면 무음 폴백)

| 위치 | 슬롯 파일명 | 용도 |
| --- | --- | --- |
| `assets/audio/` | `rifle-fire` `mg-fire` `pistol-fire` `sniper-fire` `rpg-fire` | 보병 화기 발사음 |
| `assets/audio/` | `tank-fire` `tank-fire-he` `tank-fire-ap` | 전차 주포 (공용/고폭/철갑) |
| `assets/audio/` | `explosion-he` `explosion-drone` | 폭발음 |
| `assets/audio/` | `hit-metal` | 장갑 피격음 |
| `assets/audio/music/` | `soubok-bgm` | 메뉴 배경음악 |

- 확장자는 `.ogg` 또는 `.mp3` (둘 다 있으면 ogg 우선)
- mp3를 구하면 슬롯 이름으로 바꿔서 해당 폴더에 넣기만 하면 됨
- `assets/audio/sfx/` 하위 폴더는 원본 보관용이며 게임이 직접 읽지 않는다
- 슬롯별 출처 기록: `assets/audio/manifest.json`
- 현재 `explosion-he`, `explosion-drone`, `hit-metal`은 자리 채움용 placeholder다. 실제 음원을 구하면 같은 파일명으로 교체한다.

## 4. 규칙

- 파일명은 전부 소문자-하이픈(`kebab-case`), 확장자 소문자
- 필수 슬롯이 빠지면 `npm run check`(check-asset-pack)가 실패한다 — 삭제 금지, 교체만
- 선택 슬롯(스토리 카드, 오디오)은 없어도 게임이 정상 동작한다
- 새 슬롯을 늘릴 때는 이 문서와 `tools/check-asset-drop.cjs`의 목록을 같이 갱신한다
