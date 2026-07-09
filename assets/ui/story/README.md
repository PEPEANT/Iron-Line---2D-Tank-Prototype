# 스토리 카드 아트 드롭 폴더

여기에 PNG를 넣으면 스토리 화면 카드에 자동 적용된다. 파일이 없으면 카드가 플레이스홀더 배경을 쓴다.

| 파일명 | 챕터 | 권장 크기 |
| --- | --- | --- |
| `chapter-01.png` | 1장 개전 | 800x600 (4:3) |
| `chapter-02.png` | 2장 교두보 | 800x600 |
| `chapter-03.png` | 3장 야간 정찰 | 800x600 |
| `chapter-04.png` | 4장 기갑 돌파 | 800x600 |
| `chapter-05.png` | 5장 시가전 | 800x600 |
| `chapter-06.png` | 6장 보급선 차단 | 800x600 |
| `chapter-07.png` | 7장 역습 | 800x600 |
| `chapter-08.png` | 8장 수복 | 800x600 |

- 포맷: PNG (JPG도 동작하지만 파일명은 `.png`로 통일)
- 카드에서 `object-fit: cover`로 잘리므로 중요한 요소는 중앙에 배치
- 챕터 목록 원본: `src/data/story-chapters.js`
- 상태 확인: `npm run asset:drop`
