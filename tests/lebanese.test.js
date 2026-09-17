import test from "node:test";
import assert from "node:assert/strict";
import { LEBANESE_GUIDE, LEBANESE_BANK, PHRASES } from "../src/brain/lebanese.js";
import { maybeLebanese, pickRoast } from "../src/brain/canned.js";
import { get, ORDER } from "../src/brain/personalities.js";
import { roast, ideas } from "../src/brain/llm.js";

const payload = { prompt: "fix it", scored: { score: 2, label: "VAGUE", issues: [{ type: "context" }] }, dwarf: get("grumpy"), roastometer: 85, digest: {} };

test("bounded guide and all seven offline personalities cover every tier", () => {
  assert.ok(Buffer.byteLength(LEBANESE_GUIDE) <= 2048);
  assert.ok(LEBANESE_GUIDE.includes("optional"));
  for (const id of ORDER) {
    for (const tier of ["mild", "medium", "savage"]) {
      const entries = LEBANESE_BANK[id][tier];
      assert.ok(entries.length);
      for (const entry of entries) {
        assert.ok(entry.text.length > 10 && entry.text.length <= 120);
        assert.ok(PHRASES[entry.phrase]);
      }
      assert.ok(entries.some((entry) => entry.text === maybeLebanese(1, id, tier)));
      assert.equal(typeof pickRoast(id, tier), "string");
    }
  }
  assert.equal(maybeLebanese(0), null);
  assert.equal(typeof maybeLebanese(1, "unknown", "unknown"), "string");
});

test("actual provider requests preserve persona, grade and JSON while adding dialect", async (t) => {
  let request;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    request = JSON.parse(options.body);
    const result = JSON.stringify({ roast: "Ya 3amme, name the file.", refactored_prompt: "Fix [file] to [expected behavior].", label: "NEEDS CONTEXT" });
    return { ok: true, json: async () => request.messages ? { choices: [{ message: { content: result } }] } : { candidates: [{ content: { parts: [{ text: result }] } }] } };
  });
  for (const provider of ["gemini", "deepseek"]) {
    const result = await roast({ provider, apiKey: "test-only" }, payload);
    assert.equal(result.source, "llm");
    const system = request.system_instruction?.parts[0].text || request.messages[0].content;
    assert.ok(system.startsWith(payload.dwarf.system));
    assert.ok(system.includes(LEBANESE_GUIDE));
    const user = request.contents?.[0].parts[0].text || request.messages[1].content;
    assert.ok(user.includes("2/10") && user.includes("MAXIMUM SAVAGE") && user.includes("fix it"));
    if (provider === "gemini") assert.deepEqual(request.generationConfig.response_schema.required, ["roast", "refactored_prompt"]);
  }
});

test("missing key, HTTP error, malformed response and network failure still return null", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => ({ ok: false }));
  assert.equal(await roast({ provider: "gemini" }, payload), null);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(await roast({ provider: "gemini", apiKey: "test-only" }, payload), null);
  fetch.mock.mockImplementation(async () => ({ ok: true, json: async () => ({}) }));
  assert.equal(await roast({ provider: "gemini", apiKey: "test-only" }, payload), null);
  fetch.mock.mockImplementation(async () => { throw new Error("offline"); });
  assert.equal(await roast({ provider: "gemini", apiKey: "test-only" }, payload), null);
});

test("Doc ideas do not receive roast dialect instructions", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.ok(!JSON.stringify(JSON.parse(options.body)).includes("Lebanese spice"));
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ideas: ["Specify [file].", "Describe [expected behavior].", "Add [constraint]."] }) }] } }] }) };
  });
  assert.equal((await ideas({ provider: "gemini", apiKey: "test-only" }, payload)).length, 3);
});
