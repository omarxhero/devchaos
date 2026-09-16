// IDE listener gates — pure functions, unit-testable with plain node.
// IDE_MATCH: focused window must look like a code editor. DEVCHAOS_IDE_EXTRA
// env appends patterns (testing / adding editors without code changes).

"use strict";

const IDE_EXTRA = process.env.DEVCHAOS_IDE_EXTRA ? `|${process.env.DEVCHAOS_IDE_EXTRA}` : "";
const IDE_MATCH = new RegExp(
  `visual studio code|vscode|code\\.exe|\\bzed\\b|cursor|zcode|windsurf|trae` +
  `|gemini|claude|chatgpt|copilot|deepseek|grok|mistral|perplexity|poe\\.com|chat\\.com` +
  IDE_EXTRA, "i");
const CODE_CHARS = /[;{}()[\]=<>|&/^~`#@$*+\\]/;
const CLI_START = /^\s*(npm|npx|yarn|pnpm|git|cd|ls|dir|pip|python|node|deno|bun|docker|curl|wget|ssh|rm|mkdir|touch|code|export|echo)\b/i;

function isIdeWindow(evt) {
  return IDE_MATCH.test(evt.title || "") || IDE_MATCH.test(evt.proc || "");
}

function looksLikePrompt(line) {
  const t = line.trim();
  if (t.length < 8 || t.length > 400) return false;
  if (CODE_CHARS.test(t)) return false;
  if (CLI_START.test(t)) return false; // terminal commands, not prompts
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  const letters = (t.match(/[\p{L}\p{M}]/gu) || []).length; // \p{L} counts Arabic too
  return letters / t.replace(/\s/g, "").length >= 0.8;
}

module.exports = { isIdeWindow, looksLikePrompt };

if (require.main === module) {
  const cases = [
    [{ title: "main.js - myproject - Visual Studio Code", proc: "Code" }, true],
    [{ title: "myproject - Zed", proc: "zed" }, true],
    [{ title: "Untitled - Notepad", proc: "notepad" }, false],
    [{ title: "DevChaos", proc: "electron" }, false], // our own overlay must not self-trigger
  ];
  const lines = [
    ["hi now we will work on big project", true],
    ["make it better please", true],
    ["test test", true], // 2 words + 9 chars = a test prompt, let it through
    ["const x = 5;", false],
    ["if (a > b) { return null }", false],
    ["hello", false],
    ["مرحبا كيف حال اليوم يا صديقي", true],
    ["npm install electron", false],
  ];
  let ok = true;
  for (const [evt, want] of cases) {
    const got = isIdeWindow(evt);
    if (got !== want) { ok = false; console.log("FAIL window:", JSON.stringify(evt.title), "got", got, "want", want); }
  }
  for (const [line, want] of lines) {
    const got = looksLikePrompt(line);
    if (got !== want) { ok = false; console.log("FAIL line:", JSON.stringify(line), "got", got, "want", want); }
  }
  console.log(ok ? "GATES-OK" : "GATES-FAILED");
  process.exit(ok ? 0 : 1);
}
