"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles", "settings-panel.css"), "utf8");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function mustInclude(source, needle, label = needle) {
  if (!source.includes(needle)) fail(`settings controls missing ${label}`);
}

for (const text of [
  "보병 조작표",
  "주무기",
  "보조무기",
  "중화기",
  "지원장비",
  "투척류",
  "설치류",
  "빠른 총 전환",
  "투척 즉시 사용",
  "근접공격",
  "상호작용",
  "탑승/하차",
  "재장전",
  "전황판",
  "차량 조작표",
  "철갑",
  "고폭",
  "기관총",
  "연막",
  "모바일 조작표"
]) {
  mustInclude(html, text);
}

for (const key of ["<kbd>1</kbd>", "<kbd>2</kbd>", "<kbd>3</kbd>", "<kbd>4</kbd>", "<kbd>5</kbd>", "<kbd>6</kbd>", "<kbd>Q</kbd>", "<kbd>G</kbd>", "<kbd>V</kbd>", "<kbd>E</kbd>", "<kbd>F</kbd>", "<kbd>R</kbd>", "<kbd>Tab</kbd>"]) {
  mustInclude(html, key, key.replace(/<[^>]+>/g, ""));
}

for (const selector of [".control-map", ".control-row", ".control-row kbd"]) {
  mustInclude(css, selector, selector);
}

console.log("Settings controls check passed");
