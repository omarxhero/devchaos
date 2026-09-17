import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const renderer = fs.readFileSync(new URL("../src/renderer/app.js", import.meta.url), "utf8");

test("actual renderer score call renders label and tier in the right places", () => {
  const call = renderer.match(/chatPush\("score",[^\n]+/)[0];
  const fn = renderer.slice(renderer.indexOf("function chatPush("), renderer.indexOf("function openDialogue("));
  const num = {}, label = {};
  const div = { querySelector: (selector) => selector === ".num" ? num : label };
  const chat = { children: [], appendChild: (d) => chat.children.push(d) };
  vm.runInNewContext(fn + "\n" + call, {
    document: { createElement: () => div }, $: () => chat,
    scored: { score: 2, label: "VAGUE PROMPT" }, roastTier: "savage",
  });
  assert.equal(div.className, "chat-score tier-savage");
  assert.equal(num.textContent, "2/10");
  assert.equal(label.textContent, "VAGUE PROMPT");
});
