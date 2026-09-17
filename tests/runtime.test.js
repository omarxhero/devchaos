import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { configPatch } = require("../src/main/config-store.cjs");
const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), "utf8");

test("provider switches require replacement credentials, including demo mode", () => {
  const base = { provider: "gemini", apiKey: "fixture-key", demo: true };
  for (const apiKey of [undefined, "", "  ", "SET"]) {
    const patch = { provider: "deepseek" };
    if (apiKey !== undefined) patch.apiKey = apiKey;
    assert.throws(() => configPatch(base, patch), /new API key/);
    assert.equal(base.provider, "gemini");
  }
  assert.equal(configPatch(base, { provider: "deepseek", apiKey: "replacement-fixture" }).apiKey, "replacement-fixture");
});

test("actual drag handler retains horizontal position across animation frames", () => {
  let src = read("../src/renderer/dwarf.js");
  src = src.replace(/^import .*;$/m, "").replace(/window\.DEVCHAOS_DWARF = new DwarfEngine\(\);[\s\S]*$/, "globalThis.Engine = DwarfEngine;");
  const events = {}, elementEvents = {}, style = {};
  const c = { window: { innerWidth: 1200, addEventListener: (name, fn) => { events[name] = fn; } }, requestAnimationFrame() {}, performance: { now: () => 1 } };
  vm.runInNewContext(src, c);
  const dwarf = Object.create(c.Engine.prototype);
  Object.assign(dwarf, { x: 100, state: "talk", el: { style, getBoundingClientRect: () => ({ left: 100 }), addEventListener: (name, fn) => { elementEvents[name] = fn; } } });
  dwarf._wireDrag();
  elementEvents.mousedown({ clientX: 110, screenX: 1510 });
  events.mousemove({ clientX: 340, clientY: 200, screenX: 1740, screenY: 1000 });
  dwarf._loop(0);
  assert.equal(dwarf.x, 330);
  assert.equal(style.left, "330px");
  assert.equal(style.top, "140px");
  dwarf.setState = () => {};
  events.mouseup(); dwarf._loop(0);
  assert.equal(style.left, "330px");
});

test("actual config application updates audio and pending deadline, not active cycle", () => {
  const src = read("../src/renderer/app.js");
  const apply = src.slice(src.indexOf("function applyConfig("), src.indexOf("async function boot()"));
  let resets = 0;
  const c = { config: { demo: false, breakMinutes: 25 }, window: { DEVCHAOS_SFX: { volume: 0.7 }, __resetDeadline: () => resets++ } };
  vm.createContext(c); vm.runInContext(apply, c);
  c.applyConfig({ demo: false, breakMinutes: 25, volume: 0, voiceOn: false });
  assert.equal(c.window.DEVCHAOS_SFX.volume, 0); assert.equal(c.config.voiceOn, false); assert.equal(resets, 0);
  c.applyConfig({ demo: true, breakMinutes: 25, volume: 0.5, voiceOn: true });
  assert.equal(resets, 1); assert.equal(c.window.DEVCHAOS_SFX.volume, 0.5);
  c.window.__breaking = true;
  c.applyConfig({ demo: false, breakMinutes: 120, volume: 0.2 });
  assert.equal(resets, 1);
});

test("preload config subscription unwraps Electron event", () => {
  let api, callback, received;
  vm.runInNewContext(read("../src/main/preload.cjs"), { require: () => ({ contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } }, ipcRenderer: { on: (_name, fn) => { callback = fn; } } }) });
  api.onConfigChanged((value) => { received = value; });
  const payload = { volume: 0 }; callback({ sender: "not-config" }, payload);
  assert.equal(received, payload);
});

test("startup restore is cancelled by explicit OFF and by quit", () => {
  const src = read("../src/main/main.cjs");
  const functions = src.slice(src.indexOf("function cancelListenRestore("), src.indexOf("function loadJson("));
  const scheduleStart = src.indexOf("  if (config.listen === true || process.env.DEVCHAOS_LISTEN)");
  const schedule = src.slice(scheduleStart, src.indexOf("\n});", scheduleStart));
  for (const action of ["off", "quit", "restore"]) {
    const timers = new Map(); let nextId = 0, spawned = 0;
    const c = { config: { listen: true }, process: { env: {} }, listening: false, listenerProc: null, listenRestoreTimer: null,
      setTimeout: (fn) => { timers.set(++nextId, fn); return nextId; }, clearTimeout: (id) => timers.delete(id),
      console: { error() {} }, overlay: null, rebuildTrayMenu() {}, dialog: { showErrorBox() {} }, ROOT: ".", path: { join: () => "fixture" },
      saveConfig: () => true, spawn: () => { spawned++; return { stdout: { setEncoding() {}, on() {} }, stderr: { setEncoding() {}, on() {} }, on() {}, kill() {} }; } };
    vm.createContext(c); vm.runInContext(functions + schedule, c);
    if (action === "off") vm.runInContext("setListening(false)", c);
    if (action === "quit") vm.runInContext("cancelListenRestore(); setListening(false, {persist:false})", c);
    for (const fn of [...timers.values()]) fn();
    assert.equal(spawned, action === "restore" ? 1 : 0);
    assert.equal(c.listening, action === "restore");
  }
});
