"use strict";

(function skinBoard() {
  const assets = [
    {
      kind: "play",
      title: "보병 탑뷰 1",
      meta: "서있기 / 걷기 A. 현재 아군 보병 기본 프레임.",
      file: "assets/ui/infantry/soubok-infantry-stand-01.png",
      status: "플레이 적용"
    },
    {
      kind: "play",
      title: "보병 탑뷰 2",
      meta: "걷기 B. 이동 중 stand-01과 번갈아 표시.",
      file: "assets/ui/infantry/soubok-infantry-stand-02.png",
      status: "플레이 적용"
    },
    {
      kind: "play",
      title: "보병 탑뷰 총 발사",
      meta: "서서 사격. 사격 중 정지 상태에서 사용.",
      file: "assets/ui/infantry/soubok-infantry-stand-fire.png",
      status: "플레이 적용"
    },
    {
      kind: "play",
      title: "보병 탑뷰 발사하면서 걸어가기",
      meta: "이동 사격. 총기 오버레이 없이 그림 안의 총을 사용.",
      file: "assets/ui/infantry/soubok-infantry-stand-fire-walk.png",
      status: "플레이 적용"
    },
    {
      kind: "play",
      title: "엎드려 기어가기",
      meta: "엎드린 이동 A. WASD 이동 시 B 프레임과 교차.",
      file: "assets/ui/infantry/soubok-infantry-prone-crawl-01.png",
      status: "플레이 적용"
    },
    {
      kind: "play",
      title: "엎드려 기어가기 2",
      meta: "엎드린 이동 B. 현재 크기 보정 적용됨.",
      file: "assets/ui/infantry/soubok-infantry-prone-crawl-02.png",
      status: "플레이 적용"
    },
    {
      kind: "play",
      title: "엎드려 총 쏘기",
      meta: "엎드린 사격 / 엎드린 대기 기본 프레임.",
      file: "assets/ui/infantry/soubok-infantry-prone-fire.png",
      status: "플레이 적용"
    },
    {
      kind: "play",
      title: "엎드려 총 없음",
      meta: "드론 조종 / 부상 시체 쪽에서 쓰는 무장 없는 엎드림.",
      file: "assets/ui/infantry/soubok-infantry-prone-no-gun.png",
      status: "플레이 적용"
    },
    {
      kind: "play",
      title: "보병 사망 1",
      meta: "일반 사망 자세 A. 현재 시체 렌더러에서 사용.",
      file: "assets/ui/infantry/soubok-infantry-dead-01.png",
      status: "플레이 적용"
    },
    {
      kind: "play",
      title: "보병 사망 2",
      meta: "일반 사망 자세 B. 랜덤/해시 기반으로 A와 교차.",
      file: "assets/ui/infantry/soubok-infantry-dead-02.png",
      status: "플레이 적용"
    },
    {
      kind: "play",
      title: "보병 엎드려 쏘다가 사망",
      meta: "엎드린 사망 자세. 다음에 전환 연출 보강 필요.",
      file: "assets/ui/infantry/soubok-infantry-dead-prone.png",
      status: "플레이 적용"
    },
    {
      kind: "ui",
      title: "수복 타이틀",
      meta: "메인 메뉴 타이틀 이미지.",
      file: "assets/ui/soubok-title.png",
      status: "UI 적용"
    },
    {
      kind: "ui",
      title: "한국군 인물",
      meta: "메뉴/세계관용 인물 이미지.",
      file: "assets/ui/soubok-soldier.png",
      status: "UI 적용"
    },
    {
      kind: "ui",
      title: "피난민 인물",
      meta: "메뉴/세계관용 민간인 이미지.",
      file: "assets/ui/soubok-refugee.png",
      status: "UI 적용"
    },
    {
      kind: "ui",
      title: "북한군 인물",
      meta: "메뉴/세계관용 적 인물 이미지. 실제 플레이 적 보병 스킨은 아직 별도 필요.",
      file: "assets/ui/soubok-north-soldier.png",
      status: "UI 적용"
    },
    {
      kind: "ui",
      title: "커스텀 버튼",
      meta: "메인 메뉴 커스텀/샌드박스 버튼 이미지.",
      file: "assets/ui/soubok-button-custom.png",
      status: "UI 적용"
    },
    {
      kind: "ui",
      title: "온라인 버튼",
      meta: "메인 메뉴 온라인 버튼 이미지.",
      file: "assets/ui/soubok-button-online.png",
      status: "UI 적용"
    },
    {
      kind: "ui",
      title: "스토리 버튼",
      meta: "메인 메뉴 스토리 버튼 이미지.",
      file: "assets/ui/soubok-button-story.png",
      status: "UI 적용"
    },
    {
      kind: "system",
      title: "대한민국 세력 로고",
      meta: "세력 선택/로비 로고.",
      file: "assets/factions/korea.png",
      status: "로고"
    },
    {
      kind: "system",
      title: "미국 세력 로고",
      meta: "세력 선택/로비 로고.",
      file: "assets/factions/usa.png",
      status: "로고"
    },
    {
      kind: "system",
      title: "러시아 세력 로고",
      meta: "세력 선택/로비 로고.",
      file: "assets/factions/russia.png",
      status: "로고"
    },
    {
      kind: "system",
      title: "중국 세력 로고",
      meta: "세력 선택/로비 로고.",
      file: "assets/factions/china.png",
      status: "로고"
    },
    {
      kind: "system",
      title: "싱귤래리티 세력 로고",
      meta: "커뮤니티/미래 세력 로고.",
      file: "assets/factions/singularity.png",
      status: "로고"
    },
    {
      kind: "system",
      title: "군사 갤러리 세력 로고",
      meta: "커뮤니티 세력 로고.",
      file: "assets/factions/military-gallery.png",
      status: "로고"
    },
    ...[
      ["rifle", "소총"],
      ["machinegun", "기관총"],
      ["pistol", "권총"],
      ["sniper", "저격총"],
      ["grenade", "수류탄"],
      ["rpg", "RPG"]
    ].map(([id, label]) => ({
      kind: "system",
      title: `${label} 아이콘`,
      meta: "현재 슬롯은 채워져 있지만, 실제 캐릭터가 들고 있는 총기 스킨은 별도 작업 필요.",
      file: `assets/weapons/${id}.png`,
      status: "임시 슬롯"
    })),
    {
      kind: "next",
      title: "적 보병 플레이 스킨",
      meta: "북한군/중국군/테러조 탑뷰 프레임. 아군 보병과 실루엣이 달라야 함.",
      status: "다음 필요"
    },
    {
      kind: "next",
      title: "총기별 held-weapon 스킨",
      meta: "아이콘이 아니라 캐릭터 손에 들린 rifle/pistol/grenade/machinegun/rpg/sniper 실루엣 분리.",
      status: "다음 필요"
    },
    {
      kind: "next",
      title: "사망 모션 추가 세트",
      meta: "엎드린 사망 전환, 방향별 시체, 피격 상황별 변형을 늘려 반복감을 줄임.",
      status: "다음 필요"
    },
    {
      kind: "next",
      title: "전차/험비 세력별 스킨",
      meta: "보병 그림이 올라간 만큼 차량도 같은 품질로 교체 필요.",
      status: "다음 필요"
    },
    {
      kind: "next",
      title: "캐릭터 크기 기준 맵 스케일",
      meta: "도로 폭, 엄폐물 간격, 건물 크기를 새 보병 크기에 맞춰 재조정.",
      status: "다음 필요"
    }
  ];

  const grid = document.getElementById("assetGrid");
  if (!grid) return;

  function card(asset) {
    const article = document.createElement("article");
    article.className = "asset-card";
    article.dataset.kind = asset.kind;

    const preview = document.createElement("div");
    preview.className = "asset-preview";
    if (asset.file) {
      const image = document.createElement("img");
      image.src = asset.file;
      image.alt = asset.title;
      image.loading = "lazy";
      image.addEventListener("error", () => {
        preview.textContent = "파일 없음";
      });
      preview.append(image);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "asset-placeholder";
      placeholder.textContent = "예정";
      preview.append(placeholder);
    }

    const body = document.createElement("div");
    body.className = "asset-body";
    const title = document.createElement("div");
    title.className = "asset-title";
    title.innerHTML = `<strong></strong><span class="asset-status"></span>`;
    title.querySelector("strong").textContent = asset.title;
    title.querySelector(".asset-status").textContent = asset.status;

    const meta = document.createElement("div");
    meta.className = "asset-meta";
    meta.textContent = asset.meta;

    body.append(title, meta);
    if (asset.file) {
      const file = document.createElement("code");
      file.className = "asset-file";
      file.textContent = asset.file;
      body.append(file);
    }

    article.append(preview, body);
    return article;
  }

  function render(filter = "all") {
    grid.replaceChildren();
    for (const asset of assets) {
      if (filter !== "all" && asset.kind !== filter) continue;
      grid.append(card(asset));
    }
  }

  function count(kind) {
    return assets.filter((asset) => asset.kind === kind).length;
  }

  for (const kind of ["play", "ui", "system", "next"]) {
    const target = document.querySelector(`[data-count="${kind}"]`);
    if (target) target.textContent = String(count(kind));
  }

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-filter]").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      render(button.dataset.filter || "all");
    });
  });

  render();
})();
