"use strict";

(function registerStoryChapters(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  // 카드 아트 계약: assets/ui/story/<id>.png (세로형 512x640 권장).
  // 파일이 없으면 카드가 자동으로 플레이스홀더 배경을 사용한다.
  const STORY_CHAPTERS = [
    {
      id: "chapter-01",
      act: 1,
      title: "개전",
      deck: "국경 초소가 무너졌다. 첫 반격선을 지켜라.",
      briefing: "새벽, 적 선봉이 국경 방어선을 돌파했다. 잔존 수비 병력과 합류해 거점을 탈환하고 전선을 안정시켜라. 적 기갑은 아직 도하 중이라 보병 위주다.",
      art: "assets/ui/story/chapter-01.png",
      mapId: "map01",
      config: {
        mode: "annihilation",
        difficulty: "easy",
        blueFactionId: "korea",
        redFactionId: "russia",
        blueInfantry: 10,
        blueAiTanks: 2,
        redInfantry: 8,
        redTanks: 1
      }
    },
    {
      id: "chapter-02",
      act: 1,
      title: "교두보",
      deck: "강습 도하 부대가 교두보를 굳히기 전에 걷어내라.",
      briefing: "적이 하천 교두보에 병력을 쌓고 있다. 굳어지기 전에 타격해야 한다. 공병 분대의 대전차 화기를 아껴 써라.",
      art: "assets/ui/story/chapter-02.png",
      mapId: "map01",
      config: {
        mode: "annihilation",
        difficulty: "easy",
        blueFactionId: "korea",
        redFactionId: "russia",
        blueInfantry: 10,
        blueAiTanks: 2,
        redInfantry: 10,
        redTanks: 2
      }
    },
    {
      id: "chapter-03",
      act: 1,
      title: "야간 정찰",
      deck: "드론의 눈으로 적 집결지를 찾아내고 화력을 유도하라.",
      briefing: "적 주력의 위치가 불명확하다. 정찰 드론으로 집결지를 특정하고, 아군 기갑이 도착하기 전까지 접촉을 유지하라.",
      art: "assets/ui/story/chapter-03.png",
      mapId: "map01",
      config: {
        mode: "annihilation",
        difficulty: "normal",
        blueFactionId: "korea",
        redFactionId: "russia",
        blueInfantry: 9,
        blueAiTanks: 2,
        redInfantry: 12,
        redTanks: 2
      }
    },
    {
      id: "chapter-04",
      act: 2,
      title: "기갑 돌파",
      deck: "적 전차 중대가 몰려온다. 대전차 방어선을 세워라.",
      briefing: "적 기갑이 본격적으로 전선에 투입됐다. 고폭탄보다 철갑탄, 정면보다 측후면. 배운 대로 하면 산다.",
      art: "assets/ui/story/chapter-04.png",
      mapId: "map01",
      config: {
        mode: "annihilation",
        difficulty: "normal",
        blueFactionId: "korea",
        redFactionId: "russia",
        blueInfantry: 10,
        blueAiTanks: 3,
        redInfantry: 10,
        redTanks: 4
      }
    },
    {
      id: "chapter-05",
      act: 2,
      title: "시가전",
      deck: "무너진 시가지, 건물 하나하나가 진지다.",
      briefing: "적이 시가지에 방어선을 구축했다. 건물 사이 사각을 조심하고, 제압 사격으로 머리를 눌러라. 피난민 잔류 구역은 포격 금지다.",
      art: "assets/ui/story/chapter-05.png",
      mapId: "map01",
      config: {
        mode: "conquest",
        difficulty: "normal",
        blueFactionId: "korea",
        redFactionId: "russia",
        blueInfantry: 12,
        blueAiTanks: 2,
        redInfantry: 14,
        redTanks: 2
      }
    },
    {
      id: "chapter-06",
      act: 2,
      title: "보급선 차단",
      deck: "적 후방 보급 종대를 끊으면 전선이 마른다.",
      briefing: "적 보급로가 이 축선을 지난다. 험비 기동조로 우회해 종대를 타격하라. 속도가 곧 생존이다.",
      art: "assets/ui/story/chapter-06.png",
      mapId: "map01",
      config: {
        mode: "annihilation",
        difficulty: "hard",
        blueFactionId: "korea",
        redFactionId: "russia",
        blueInfantry: 9,
        blueAiTanks: 2,
        redInfantry: 13,
        redTanks: 3
      }
    },
    {
      id: "chapter-07",
      act: 3,
      title: "역습",
      deck: "모든 예비대를 던진 적의 마지막 대공세를 받아쳐라.",
      briefing: "적이 남은 전력을 모두 긁어모아 역습에 나섰다. 방어선이 뚫리면 여기까지의 전진이 전부 물거품이다. 버텨라.",
      art: "assets/ui/story/chapter-07.png",
      mapId: "map01",
      config: {
        mode: "annihilation",
        difficulty: "hard",
        blueFactionId: "korea",
        redFactionId: "russia",
        blueInfantry: 11,
        blueAiTanks: 3,
        redInfantry: 16,
        redTanks: 4
      }
    },
    {
      id: "chapter-08",
      act: 3,
      title: "수복",
      deck: "마지막 고지. 이 능선을 넘으면 끝난다.",
      briefing: "적 사령부가 있는 최후 거점이다. 전 부대 총공격. 여기서 전쟁을 끝내고 집으로 돌아간다.",
      art: "assets/ui/story/chapter-08.png",
      mapId: "map01",
      config: {
        mode: "conquest",
        difficulty: "hard",
        blueFactionId: "korea",
        redFactionId: "russia",
        blueInfantry: 12,
        blueAiTanks: 3,
        redInfantry: 16,
        redTanks: 5
      }
    }
  ];

  IronLine.storyChapters = STORY_CHAPTERS;
  IronLine.storyChapterById = function storyChapterById(id) {
    return STORY_CHAPTERS.find((chapter) => chapter.id === id) || null;
  };
})(window);
