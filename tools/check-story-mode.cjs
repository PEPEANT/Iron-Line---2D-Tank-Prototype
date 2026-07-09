"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function mustInclude(source, needle, label) {
  if (!source.includes(needle)) fail(`story mode missing ${label || needle}`);
}

const html = read("index.html");
const data = read("src/data/story-chapters.js");
const system = read("src/systems/story-mode.js");
const css = read("styles/story-mode.css");
const entryFlow = read("src/systems/entry-flow.js");
const mainJs = read("src/main.js");

// 배선: 스크립트/스타일이 로드되고 진입 버튼이 연결되어야 한다.
mustInclude(html, "src/data/story-chapters.js");
mustInclude(html, "src/systems/story-mode.js");
mustInclude(html, "styles/story-mode.css");
mustInclude(entryFlow, "openStoryMode", "entry story button binding");
mustInclude(entryFlow, "IronLine.storyMode?.open?.()", "story open call");

// 데이터 계약: 챕터마다 필수 필드가 있어야 한다.
const chapterIds = [...data.matchAll(/id:\s*"(chapter-\d+)"/g)].map((match) => match[1]);
if (chapterIds.length < 4) fail(`story chapters too few: ${chapterIds.length}`);
if (new Set(chapterIds).size !== chapterIds.length) fail("story chapter ids must be unique");
for (const field of ["title:", "deck:", "briefing:", "art:", "config:", "mapId:"]) {
  const count = (data.match(new RegExp(field, "g")) || []).length;
  if (count < chapterIds.length) fail(`story chapters missing field ${field} (${count}/${chapterIds.length})`);
}
const artPaths = [...data.matchAll(/art:\s*"([^"]+)"/g)].map((match) => match[1]);
for (const artPath of artPaths) {
  if (!artPath.startsWith("assets/ui/story/")) fail(`story art must live in assets/ui/story/: ${artPath}`);
}

// 진행도: 저장/해금/클리어 로직이 있어야 한다.
for (const token of [
  "iron-line-story-progress-v1",
  "isUnlocked",
  "markCleared",
  "resetProgress",
  "BLUE VICTORY",
  "storyChapterId",
  "installFinishHook",
  "data-story-chapter",
  "startChapter"
]) {
  mustInclude(system, token);
}

// 커스텀/메뉴 복귀 시 스토리 세션이 남지 않아야 한다.
mustInclude(entryFlow, "game.storyChapterId = \"\"", "custom mode clears story session");
mustInclude(mainJs, "this.storyChapterId = \"\"", "returnToMainMenu clears story session");

// 화면: 카드 그리드와 상세 패널 스타일.
for (const selector of [".story-screen", ".story-grid", ".story-card", ".story-detail", ".story-card-art"]) {
  mustInclude(css, selector);
}

// 카드 아트 폴더 계약 안내가 있어야 한다.
if (!fs.existsSync(path.join(root, "assets", "ui", "story", "README.md"))) {
  fail("missing assets/ui/story/README.md (card art drop contract)");
}

console.log(`Story mode check passed: ${chapterIds.length} chapters, art contract assets/ui/story/`);
