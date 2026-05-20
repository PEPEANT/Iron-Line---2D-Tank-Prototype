"use strict";

(function registerPlayerFactions(global) {
  const IronLine = global.IronLine || (global.IronLine = {});

  const playerFactions = [
    {
      id: "korea",
      name: "대한민국군",
      role: "균형형 정규군",
      category: "정규군",
      concept: "균형 / 방어 / 보병 운영",
      tagline: "기본이 가장 오래 버틴다.",
      description: "가장 기본적인 정규군 스킨입니다. 현실적인 군복과 장비를 착용한 표준 보병 세력입니다.",
      rankNote: "세계 군사력 참고 순위: 5위권",
      motto: "버티고, 재정비하고, 다시 밀어붙인다.",
      voiceKeywords: ["방어선", "재정비", "분대 이동", "거점 확보", "엄호"],
      logo: "assets/factions/korea.png",
      cloth: "rgba(72, 98, 79, 0.92)",
      clothDark: "rgba(39, 57, 45, 0.98)",
      vest: "rgba(41, 59, 48, 0.96)",
      gear: "rgba(23, 34, 29, 0.92)",
      helmet: "rgba(54, 76, 61, 0.98)",
      accent: "rgba(110, 190, 255, 0.78)"
    },
    {
      id: "usa",
      name: "미군",
      role: "첨단 화력군",
      category: "초강대국 정규군",
      concept: "드론 / 화력 / 장갑 전력",
      tagline: "화력으로 전장을 지배한다.",
      description: "현대식 장비와 전술 장비를 갖춘 정규군 스킨입니다. 헬멧, 방탄복, 전술 장구가 강조됩니다.",
      rankNote: "세계 군사력 참고 순위: 1위권",
      motto: "멀리서 보고, 먼저 때리고, 끝까지 압박한다.",
      voiceKeywords: ["화력 우세", "드론 정찰", "정밀 타격", "지원 요청", "압박"],
      logo: "assets/factions/usa.png",
      cloth: "rgba(65, 88, 99, 0.92)",
      clothDark: "rgba(35, 49, 60, 0.98)",
      vest: "rgba(48, 63, 73, 0.96)",
      gear: "rgba(20, 31, 39, 0.92)",
      helmet: "rgba(57, 75, 85, 0.98)",
      accent: "rgba(105, 205, 255, 0.78)"
    },
    {
      id: "russia",
      name: "러시아군",
      role: "중장갑 포병군",
      category: "중화력 정규군",
      concept: "포병 / 전차 / 전선 압박",
      tagline: "버티고, 밀어붙인다.",
      description: "무거운 장비와 거친 전장 분위기를 가진 스킨입니다. 강한 방어선과 중화력 이미지가 강조됩니다.",
      rankNote: "세계 군사력 참고 순위: 2위권",
      motto: "느리지만 단단하게, 전선을 밀어붙인다.",
      voiceKeywords: ["중화력", "전선 압박", "장갑 전진", "포격 대비", "버티기"],
      logo: "assets/factions/russia.png",
      cloth: "rgba(92, 95, 69, 0.92)",
      clothDark: "rgba(51, 55, 42, 0.98)",
      vest: "rgba(65, 66, 50, 0.96)",
      gear: "rgba(34, 36, 29, 0.92)",
      helmet: "rgba(74, 76, 56, 0.98)",
      accent: "rgba(255, 124, 116, 0.76)"
    },
    {
      id: "china",
      name: "중국군",
      role: "대규모 통제군",
      category: "대규모 통제군",
      concept: "물량 / 감시 / 드론 운용",
      tagline: "수로 압박하고 통제로 장악한다.",
      description: "통일된 장비와 집단적인 전장 분위기를 가진 스킨입니다. 드론, 감시, 대규모 작전 이미지와 잘 어울립니다.",
      rankNote: "세계 군사력 참고 순위: 3위권",
      motto: "전장을 넓게 보고, 정보로 압박한다.",
      voiceKeywords: ["집단 이동", "감시망", "드론 운용", "포위", "동시 진입"],
      logo: "assets/factions/china.png",
      cloth: "rgba(75, 101, 62, 0.92)",
      clothDark: "rgba(38, 59, 35, 0.98)",
      vest: "rgba(50, 70, 43, 0.96)",
      gear: "rgba(27, 40, 26, 0.92)",
      helmet: "rgba(62, 84, 51, 0.98)",
      accent: "rgba(255, 208, 84, 0.82)"
    },
    {
      id: "singularity",
      name: "특붕군",
      role: "미래기술 민병대",
      category: "비정규 기술민병대",
      concept: "AI / 드론 / 실험 병기",
      tagline: "AGI가 온다더니, 우리가 먼저 왔다.",
      description: "특이점 갤러리에서 구상된 미래형 세력 스킨입니다. AI, 드론, 자동화 장비, 실험 병기를 다루는 청년 전투원들로 구성되어 있습니다.",
      rankNote: "커뮤니티 참고 순위: 흥한갤 32위",
      motto: "AGI가 온다더니, 우리가 먼저 왔다.",
      voiceKeywords: ["AGI", "자동화", "실험 병기", "드론 링크", "예측 완료"],
      logo: "assets/factions/singularity.png",
      cloth: "rgba(50, 42, 74, 0.92)",
      clothDark: "rgba(26, 20, 40, 0.98)",
      vest: "rgba(42, 35, 62, 0.96)",
      gear: "rgba(22, 17, 32, 0.94)",
      helmet: "rgba(58, 45, 84, 0.98)",
      accent: "rgba(182, 104, 255, 0.84)"
    },
    {
      id: "military-gallery",
      name: "군붕군",
      role: "전술분석 민병대",
      category: "군사 마니아 전술집단",
      concept: "장비 분석 / 카운터 / 교리 집착",
      tagline: "전쟁은 제원표에서 시작된다.",
      description: "군사 갤러리 출신 군붕이들로 구성된 세력 스킨입니다. 실전보다는 군사지식과 장비 분석에 강한 전술덕후 부대입니다.",
      rankNote: "커뮤니티 참고 순위: 흥한갤 84위",
      motto: "전쟁은 실전이 아니라 제원표에서 시작된다.",
      voiceKeywords: ["제원표", "카운터 전술", "장비 분석", "교리 확인", "각도 계산"],
      logo: "assets/factions/military-gallery.png",
      cloth: "rgba(86, 78, 58, 0.92)",
      clothDark: "rgba(48, 42, 31, 0.98)",
      vest: "rgba(63, 55, 40, 0.96)",
      gear: "rgba(35, 29, 21, 0.94)",
      helmet: "rgba(76, 67, 49, 0.98)",
      accent: "rgba(237, 199, 128, 0.82)"
    }
  ];

  const factionById = new Map(playerFactions.map((faction) => [faction.id, faction]));

  function playerFactionById(id) {
    return factionById.get(String(id || "")) || null;
  }

  function playerFactionVoiceKeywords(id) {
    const faction = playerFactionById(id);
    return Array.isArray(faction?.voiceKeywords) ? faction.voiceKeywords.slice() : [];
  }

  IronLine.playerFactions = playerFactions;
  IronLine.playerFactionById = playerFactionById;
  IronLine.playerFactionVoiceKeywords = playerFactionVoiceKeywords;

  // Backward compatibility: older profile/rendering code still calls these skins.
  IronLine.playerSkins = playerFactions;
  IronLine.playerSkinById = playerFactionById;
})(window);
