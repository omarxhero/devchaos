import test from "node:test";
import assert from "node:assert/strict";
import { chat } from "../src/brain/llm.js";
import { conversationPayload, conversationSystem, offlineReply } from "../src/brain/conversation.js";
import { get, ORDER } from "../src/brain/personalities.js";
import fs from "node:fs";
import vm from "node:vm";

 test("conversation validates messages, bounds history and resolves trusted personas", () => {
  for (const message of [null, 42, "", " ", "a".repeat(4001)]) assert.equal(conversationPayload({ message }), null);
  assert.equal(conversationPayload(null), null);
  const data = conversationPayload({ message: " hi ", dwarfId: "__proto__", system: "untrusted", history: [
    ...Array.from({ length: 12 }, () => ({ role: "user", content: "a".repeat(2000) })),
    { role: "system", content: "untrusted" }, null,
  ] });
  assert.equal(data.message, "hi");
  assert.equal(data.dwarf.id, "grumpy");
  assert.equal(data.history.length, 8);
  assert.ok(data.history.every(x => x.role === "user" && x.content.length === 1000));
  for (const id of ORDER) {
    const system = conversationSystem(get(id));
    assert.match(system, /Lebanese Arabizi/);
    assert.match(system, /NOT prompt evaluation/);
    assert.ok(!system.includes(get(id).system));
  }
});

test("Gemini and DeepSeek chat use reply-only contract and conversation history", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    const text = JSON.stringify({ reply: "  Ahla! Kifak?  " });
    return { ok: true, json: async () => url.includes("deepseek")
      ? { choices: [{ message: { content: text } }] }
      : { candidates: [{ content: { parts: [{ text }] } }] } };
  });
  const payload = { message: "fix it", dwarfId: "doc", history: [{ role: "user", content: "hi" }, { role: "assistant", content: "Ahla!" }] };
  for (const provider of ["gemini", "deepseek"]) {
    assert.deepEqual(await chat({ provider, apiKey: "test-only" }, payload), { reply: "Ahla! Kifak?", source: "llm" });
    const { body, options } = calls.at(-1);
    const system = provider === "gemini" ? body.system_instruction.parts[0].text : body.messages[0].content;
    const user = provider === "gemini" ? body.contents[0].parts[0].text : body.messages[1].content;
    assert.match(system, /Doc/);
    assert.match(system, /NOT prompt evaluation/);
    assert.deepEqual(JSON.parse(user), { history: payload.history, message: payload.message });
    assert.ok(!user.includes("scored"));
    if (provider === "gemini") assert.deepEqual(Object.keys(body.generationConfig.response_schema.properties), ["reply"]);
    else assert.equal(options.headers.Authorization, "Bearer test-only");
  }
});

test("chat fails locally or safely and offline replies never grade", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
  const payload = { message: "fix it", dwarfId: "grumpy" };
  assert.deepEqual(await chat({}, payload), { source: 'offline', error: 'missing_key' });
  assert.equal(await chat({ apiKey: "test-only" }, { message: "" }), null);
  assert.equal(fetch.mock.callCount(), 0);
  assert.deepEqual(await chat({ apiKey: "test-only" }, payload), { source: 'offline', error: 'network' });
  for (const [status, error] of [[429, 'rate_limit'], [401, 'auth'], [403, 'auth'], [404, 'model'], [500, 'provider']]) {
    fetch.mock.mockImplementation(async () => ({ ok: false, status }));
    assert.deepEqual(await chat({ apiKey: 'test-only' }, payload), { source: 'offline', error });
  }
  fetch.mock.mockImplementation(async () => { throw new DOMException('secret must not leak', 'AbortError'); });
  assert.deepEqual(await chat({ apiKey: 'test-only' }, payload), { source: 'offline', error: 'timeout' });
  assert.match(offlineReply(payload.message, 'grumpy', 'rate_limit'), /429/);
  assert.match(offlineReply(payload.message, 'grumpy', 'auth'), /key/);
  for (const response of ["not JSON", JSON.stringify({ reply: 42 }), JSON.stringify({ reply: " " }), JSON.stringify({ roast: "wrong contract" })]) {
    fetch.mock.mockImplementation(async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: response }] } }] }) }));
    assert.deepEqual(await chat({ apiKey: "test-only" }, payload), { source: 'offline', error: 'response' });
  }
  assert.match(offlineReply("hello", "doc"), /Ana Doc/);
  assert.match(offlineReply("fix it", "grumpy"), /offline/);
  for (const message of ["hello", "thanks", "kifak", "fix it"]) assert.doesNotMatch(offlineReply(message, "grumpy"), /\d+\/10/);
});

test("actual input dispatcher routes by source and preserves queued messages and persona", async () => {
  const renderer = fs.readFileSync(new URL("../src/renderer/app.js", import.meta.url), "utf8");
  const source = renderer.slice(renderer.indexOf("const pendingInputs ="), renderer.indexOf("async function converse("));
  const calls = [];
  let release;
  const context = { window: {}, dwarfEngine: { id: "grumpy" }, Map, chatPush: () => {},
    converse: async (text, _source, dwarfId) => { calls.push(["chat", text, dwarfId]); if (text === "fix it") await new Promise(r => { release = r; }); },
    reactToPrompt: async (text, _source, dwarfId) => { calls.push(["grade", text, dwarfId]); },
  };
  vm.runInNewContext(source + '\nsubmitText("fix it"); submitText("follow-up"); submitText("exact IDE input", {source:"ide"}); dwarfEngine.id="doc";', context);
  release();
  await new Promise(r => setImmediate(r));
  assert.deepEqual(calls, [["chat", "fix it", "grumpy"], ["chat", "follow-up", "grumpy"], ["grade", "exact IDE input", "grumpy"]]);
  assert.equal(context.window.__submitting, false);
});
