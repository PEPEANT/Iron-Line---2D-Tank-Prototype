"use strict";

// 에셋 드롭 상태 리포트.
// 어떤 파일을 어디에 넣으면 게임에 반영되는지, 지금 뭐가 채워졌고 뭐가 비었는지 보여준다.
// 계약 문서: docs/asset-contract.md

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function existsAny(relList) {
  return relList.find((rel) => exists(rel)) || "";
}

function listFiles(rel) {
  const dir = path.join(root, rel);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
}

const WEAPON_IDS = [
  "rifle", "smg", "lmg", "machinegun", "pistol", "sniper",
  "grenade", "grenadeLauncher", "rpg", "repairKit", "fieldRadio", "reconDrone", "kamikazeDrone"
];

const UI_ART = [
  "loading-background.png", "main-background.png",
  "soubok-title.png", "soubok-soldier.png",
  "soubok-button-custom.png", "soubok-button-online.png", "soubok-button-story.png",
  "soubok-refugee.png", "soubok-north-soldier.png",
  "soubok-infantry-prone.png", "soubok-infantry-dead.png", "soubok-infantry-top.png",
  "infantry/soubok-infantry-stand-01.png", "infantry/soubok-infantry-stand-02.png",
  "infantry/soubok-infantry-stand-fire.png", "infantry/soubok-infantry-stand-fire-walk.png",
  "infantry/soubok-infantry-prone-crawl-01.png", "infantry/soubok-infantry-prone-crawl-02.png",
  "infantry/soubok-infantry-prone-fire.png", "infantry/soubok-infantry-prone-no-gun.png",
  "infantry/soubok-infantry-dead-01.png", "infantry/soubok-infantry-dead-02.png",
  "infantry/soubok-infantry-dead-prone.png"
];

const AUDIO_SLOTS = [
  "explosion-he", "explosion-drone",
  "tank-fire", "tank-fire-he", "tank-fire-ap",
  "rifle-fire", "mg-fire", "pistol-fire", "rpg-fire", "sniper-fire",
  "hit-metal", "music/soubok-bgm"
];

const FACTION_IDS = ["korea", "usa", "russia", "china", "singularity", "military-gallery"];

function storyChapterArt() {
  const source = fs.readFileSync(path.join(root, "src", "data", "story-chapters.js"), "utf8");
  const matches = [...source.matchAll(/art:\s*"([^"]+)"/g)].map((match) => match[1]);
  return matches;
}

const sections = [];

function section(title, rows) {
  sections.push({ title, rows });
}

section("무기 아이콘 (필수) — assets/weapons/<무기id>.png", WEAPON_IDS.map((id) => ({
  label: `${id}.png`,
  filled: exists(`assets/weapons/${id}.png`)
})));

section("UI 아트 (필수) — assets/ui/", UI_ART.map((file) => ({
  label: file,
  filled: exists(`assets/ui/${file}`)
})));

section("스토리 카드 (선택, 없으면 플레이스홀더) — assets/ui/story/", storyChapterArt().map((rel) => ({
  label: path.basename(rel),
  filled: exists(rel)
})));

section("오디오 슬롯 (선택, 없으면 무음) — assets/audio/<슬롯>.ogg|mp3", AUDIO_SLOTS.map((id) => ({
  label: `${id}.ogg|mp3`,
  filled: Boolean(existsAny([`assets/audio/${id}.ogg`, `assets/audio/${id}.mp3`]))
})));

section("세력 로고 — assets/factions/<세력id>.png", FACTION_IDS.map((id) => ({
  label: `${id}.png`,
  filled: exists(`assets/factions/${id}.png`)
})));

// 스토리 폴더의 예상 밖 파일 경고 (오타난 파일명은 게임이 못 읽는다)
const expectedStoryFiles = new Set([...storyChapterArt().map((rel) => path.basename(rel)), "README.md"]);
const strayStoryFiles = listFiles("assets/ui/story").filter((file) => !expectedStoryFiles.has(file));

let totalFilled = 0;
let totalSlots = 0;
for (const { title, rows } of sections) {
  const filled = rows.filter((row) => row.filled).length;
  totalFilled += filled;
  totalSlots += rows.length;
  console.log(`\n${title} [${filled}/${rows.length}]`);
  for (const row of rows) {
    console.log(`  ${row.filled ? "O" : "-"} ${row.label}`);
  }
}

if (strayStoryFiles.length) {
  console.log(`\n경고: assets/ui/story/ 에 계약에 없는 파일이 있습니다 (게임이 읽지 않음):`);
  for (const file of strayStoryFiles) console.log(`  ? ${file}`);
}

console.log(`\n에셋 드롭 현황: ${totalFilled}/${totalSlots} 슬롯 채움. 계약 문서: docs/asset-contract.md`);
