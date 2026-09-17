import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { roast, ideas } from "../src/brain/llm.js";
import { analyze } from "../src/brain/scorer.js";
import { get } from "../src/brain/personalities.js";
const require = createRequire(import.meta.url);
const { createRoastService, cacheKey } = require("../src/main/roast-service.cjs");
const { configPatch, writeConfig } = require("../src/main/config-store.cjs");
const payload = (prompt = "fix it", roastometer = 50) => ({ prompt, roastometer, dwarf: get("grumpy"), scored: analyze(prompt), digest: {} });
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fixture(roastFn = async () => ({ roast: "test", source: "llm" }), wait = async () => {}) {
  let config = { provider: "gemini", apiKey: "test-only", demo: false };
  const service = createRoastService({ getConfig: () => config, loadBrain: async (file) => {
    if (file.endsWith("llm.js")) return { roast: roastFn };
    if (file.endsWith("scorer.js")) return { analyze };
    return { get };
  }, wait, maxEntries: 2 });
  return { service, change(next) { config = { ...config, ...next }; service.invalidate(); } };
}

test("cache keys preserve zero, exact intensity, casing, long text, persona and score", () => {
  const key = (p) => cacheKey(p, false);
  for (const [a, b] of [[payload("fix it", 0), payload()], [payload("fix it", 65), payload("fix it", 95)], [payload(), payload("FIX IT")], [payload("a".repeat(300) + "x"), payload("a".repeat(300) + "y")], [payload(), { ...payload(), dwarf: get("doc") }], [payload(), { ...payload(), scored: { ...analyze("fix it"), score: 8 } }]]) assert.notEqual(key(a), key(b));
  assert.notEqual(key(payload()), key({ ...payload(), digest: { count: 2 } }));
  assert.equal(cacheKey(payload(), true), cacheKey({ ...payload(), digest: { count: 2 } }, true));
});

test("requests deduplicate, cache is bounded, bypass works, settings invalidate", async () => {
  let calls = 0;
  const { service, change } = fixture(async () => { calls++; await tick(); return { roast: "test", source: "llm" }; });
  await Promise.all([service.request(payload()), service.request(payload())]);
  assert.equal(calls, 1);
  assert.equal((await service.request(payload())).source, "cache");
  await service.request(payload(), { bypassCache: true });
  assert.equal(calls, 2);
  await service.request(payload("second prompt")); await service.request(payload("third prompt"));
  await service.request(payload()); assert.equal(calls, 5);
  change({ model: "different-model" });
  assert.equal((await service.request(payload())).source, "llm");
});

test("old in-flight responses cannot repopulate cache after settings change", async () => {
  let release, calls = 0;
  const { service, change } = fixture(async () => {
    calls++;
    if (calls === 1) await new Promise((resolve) => { release = resolve; });
    return { roast: "test", source: "llm" };
  });
  const pending = service.request(payload()); await tick();
  change({ apiKey: "another-test-only" }); release();
  assert.equal(await pending, null);
  assert.equal((await service.request(payload())).source, "llm");
  assert.equal(calls, 2);
});

test("prefetch uses actual scorer, serial calls, deterministic demo context and stops on failure", async () => {
  let active = 0, peak = 0, waits = 0;
  const seen = [];
  const { service, change } = fixture(async (_config, data) => {
    active++; peak = Math.max(peak, active); seen.push(data); await tick(); active--;
    return { roast: "demo", source: "llm" };
  }, async (ms) => { assert.equal(ms, 3000); waits++; });
  change({ demo: true });
  await service.prefetch(["fix it", "Describe a JavaScript function with input and output examples."]);
  assert.equal(peak, 1); assert.equal(seen.length, 4); assert.equal(waits, 3);
  for (const p of seen) assert.deepEqual(p.scored, analyze(p.prompt));
  assert.equal((await service.request({ ...seen.at(-1), digest: { count: 99 } })).source, "cache");
  assert.deepEqual(seen.at(-1).digest, {});
  let failures = 0;
  const failed = fixture(async () => { failures++; return null; }); failed.change({ demo: true });
  await failed.service.prefetch(["first prompt", "second prompt"]);
  assert.equal(failures, 1);
});

test("repeated prefetch stays single-worker and cancellation discards queued work", async () => {
  let release, calls = 0;
  const { service, change } = fixture(async () => {
    calls++; await new Promise((resolve) => { release = resolve; });
    return { roast: "test", source: "llm" };
  });
  change({ demo: true });
  const first = service.prefetch(["first prompt"]); await tick();
  const second = service.prefetch(["second prompt"]); await tick();
  assert.equal(calls, 1);
  change({ demo: false }); release(); await Promise.all([first, second]);
  assert.equal(calls, 1);
});

test("config patches reject unknown/type-invalid fields and atomic write reports failure", () => {
  const base = { provider: "gemini", apiKey: "test-only", volume: 0.5, demo: false };
  assert.deepEqual(configPatch(base, { volume: 0, apiKey: "SET" }), { ...base, volume: 0 });
  assert.equal(configPatch(base, { apiKey: "" }).apiKey, base.apiKey);
  for (const patch of [{ volume: 2 }, { provider: "unknown" }, { demo: "false" }, { listen: true }, { unknown: 1 }, null]) assert.throws(() => configPatch(base, patch));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "devchaos-config-test-"));
  try {
    const file = path.join(dir, "config.json");
    assert.equal(writeConfig(file, base), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(file)), base);
    assert.equal(writeConfig(path.join(dir, "missing", "config.json"), base), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("actual quit handler stops capture without persisting off", () => {
  const source = fs.readFileSync(new URL("../src/main/main.cjs", import.meta.url), "utf8");
  const start = source.indexOf('app.on("before-quit",');
  const end = source.indexOf("\n});", start) + 4;
  let callback, shutdown;
  vm.runInNewContext(source.slice(start, end), {
    app: { on: (_event, fn) => { callback = fn; } }, setListening: (...args) => { shutdown = args; },
    cancelListenRestore() {}, roastService: { invalidate() {} }, tray: null, globalShortcut: { unregisterAll() {} },
  });
  callback(); assert.equal(shutdown[0], false); assert.equal(shutdown[1]?.persist, false);
});

test("listener shutdown and stale child events preserve preference without leaking captures", () => {
  const source = fs.readFileSync(new URL("../src/main/main.cjs", import.meta.url), "utf8");
  const start = source.indexOf("function setListening(");
  const end = source.indexOf("\nfunction loadJson", start);
  const children = [], logs = [], sent = [];
  const context = {
    listening: false, listenerProc: null, config: { listen: false }, ROOT: ".", path,
    console: { error: (...args) => logs.push(args.join(" ")) },
    overlay: { webContents: { send: (...args) => sent.push(args) } },
    cancelListenRestore() {}, rebuildTrayMenu() {}, dialog: { showErrorBox() {} },
    spawn() {
      const handlers = {}, stdout = {}, stderr = {};
      const stream = (events) => ({ setEncoding() {}, on: (name, fn) => { events[name] = fn; } });
      const child = { stdout: stream(stdout), stderr: stream(stderr), on: (name, fn) => { handlers[name] = fn; }, kill() {}, handlers, stdoutEvents: stdout, stderrEvents: stderr };
      children.push(child); return child;
    },
  };
  context.saveConfig = (next) => { context.config = next; return true; };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  vm.runInContext("setListening(true)", context);
  const first = children[0];
  vm.runInContext("setListening(false, {persist:false}); setListening(true, {persist:false})", context);
  first.handlers.exit(0);
  assert.equal(context.listening, true);
  assert.equal(context.listenerProc, children[1]);
  first.stdoutEvents.data('sensitive captured text\n');
  children[1].stderrEvents.data("sensitive captured text");
  vm.runInContext("setListening(false, {persist:false})", context);
  children[1].handlers.exit(0);
  assert.equal(context.config.listen, true);
  assert.equal(context.listening, false);
  assert.ok(!logs.join(" ").includes("sensitive captured text"));
  assert.ok(!sent.some(([event]) => event === "devchaos:ide-prompt"));
});

test("gate diagnostics do not interpolate captured content", () => {
  const source = fs.readFileSync(new URL("../src/main/main.cjs", import.meta.url), "utf8");
  const trace = source.split(/\r?\n/).find((line) => line.includes('console.error(`[gate]'));
  assert.ok(trace); assert.ok(!/evt\.(line|title|proc)/.test(trace));
});

test("DeepSeek roast and ideas carry separate JSON contracts and malformed ideas fall back", async (t) => {
  const bodies = [];
  const fetch = t.mock.method(globalThis, "fetch", async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ ideas: ["one", "two", "three"] }) } }] }) };
  });
  const config = { provider: "deepseek", apiKey: "test-only" };
  assert.equal((await ideas(config, payload())).length, 3);
  assert.ok(bodies[0].messages[0].content.includes('"ideas"'));
  assert.ok(!bodies[0].messages[0].content.includes('"roast"'));
  await roast(config, payload());
  assert.ok(bodies[1].messages[0].content.includes('"roast"'));
  fetch.mock.mockImplementation(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"ideas":["only one"]}' } }] }) }));
  assert.equal(await ideas(config, payload()), null);
});
