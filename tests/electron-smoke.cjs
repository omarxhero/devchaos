"use strict";

const { app, BrowserWindow, globalShortcut } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "devchaos-smoke-"));
app.setPath("userData", profile);
fs.writeFileSync(path.join(profile, "config.json"), JSON.stringify({
  provider: "gemini", apiKey: "test-only", demo: false, listen: false,
  breakMinutes: 120, voiceOn: false, volume: 0,
}));
for (const name of ["DEVCHAOS_LISTEN", "DEVCHAOS_TEST_BREAK", "DEVCHAOS_SNAP"]) delete process.env[name];
// An isolated test must not replace the running app's global shortcuts.
globalShortcut.register = () => false;
let mode = "success", requests = [];
let failConfigWrite = false;
const renameSync = fs.renameSync;
fs.renameSync = (from, to) => {
  if (failConfigWrite && to === path.join(profile, "config.json")) throw new Error("simulated write failure");
  return renameSync(from, to);
};
globalThis.fetch = async (_url, options) => {
  requests.push(JSON.parse(options.body));
  if (mode === "offline") throw new Error("simulated offline");
  return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({
    roast: "Yalla, specify the target.", refactored_prompt: "Fix [file] to produce [expected behavior].", label: "NEEDS CONTEXT",
  }) }] } }] }) };
};
app.on("browser-window-created", (_event, win) => {
  win.once("ready-to-show", () => { win.setAlwaysOnTop(false); win.hide(); });
});
require("../src/main/main.cjs");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, message) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await sleep(100);
  }
  throw new Error(message);
}
const timeout = setTimeout(() => { console.error("SMOKE FAIL: timeout"); app.exit(1); }, 30000);
app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  const run = (code) => win.webContents.executeJavaScript(code);
  try {
    await until(async () => !win.webContents.isLoading(), "overlay did not load");
    win.hide();
    await until(() => run("document.querySelectorAll('.hat-btn').length === 7"), "renderer boot did not finish");
    const { analyze } = await import(pathToFileURL(path.join(root, "src/brain/scorer.js")).href);
    const { LEBANESE_GUIDE } = await import(pathToFileURL(path.join(root, "src/brain/lebanese.js")).href);
    const { LEBANESE, pickRoast } = await import(pathToFileURL(path.join(root, "src/brain/canned.js")).href);
    assert.equal(await run("window.DEVCHAOS_SFX.volume"), 0);
    await run(`(() => {
      const d = window.DEVCHAOS_DWARF;
      d.setState('talk'); d.stateUntil = 0;
      const r = d.rect();
      d.el.dispatchEvent(new MouseEvent('mousedown', {clientX:r.left+10, clientY:r.top+10}));
      window.dispatchEvent(new MouseEvent('mousemove', {clientX:340, clientY:200}));
      window.__dragPosition = d.x;
    })()`);
    await sleep(100);
    const dragPosition = await run("window.__dragPosition");
    assert.ok(Math.abs(dragPosition - 330) <= 1, "MouseEvent integer coordinates can round the animated bounding rectangle");
    assert.equal(await run("window.DEVCHAOS_DWARF.x"), dragPosition);
    assert.equal(await run("document.getElementById('dwarf').style.left"), `${dragPosition}px`);
    await run("window.dispatchEvent(new MouseEvent('mouseup'))");
    console.log("PASS initial muted SFX and real renderer drag persists across frames");
    const scored = analyze("fix it");
    await run(`document.querySelectorAll('.hat-btn')[1].click(); document.getElementById('prompt').value = 'fix it'; document.getElementById('submit').click();`);
    await until(() => run("window.__submitting === false && [...document.querySelectorAll('.chat-dwarf')].some(x => x.textContent === 'Yalla, specify the target.')"), "provider result never reached renderer");
    const score = await run(`(() => { const el = document.querySelector('.chat-score'); return { className: el.className, number: el.querySelector('.num').textContent, label: el.querySelector('.lbl').textContent }; })()`);
    assert.deepEqual(score, { className: `chat-score tier-${scored.tier}`, number: `${scored.score}/10`, label: scored.label });
    assert.equal(requests.length, 1);
    assert.ok(requests[0].system_instruction.parts[0].text.includes(LEBANESE_GUIDE));
    assert.ok(requests[0].system_instruction.parts[0].text.includes("GRUMPY"));
    console.log("PASS actual submit button -> renderer -> preload -> main -> mocked provider -> rendered roast + score card");

    const { get } = await import(pathToFileURL(path.join(root, "src/brain/personalities.js")).href);
    const { memoryDigest } = await import(pathToFileURL(path.join(root, "src/brain/memory.js")).href);
    const savedSession = await run("window.devchaos.sessionGet()");
    const ipcPayload = { prompt: "fix it", scored, dwarf: get("grumpy"), roastometer: 50, digest: memoryDigest(savedSession.memory) };
    const cached = await run(`window.devchaos.roast(${JSON.stringify(ipcPayload)})`);
    assert.equal(cached.source, "cache");
    assert.equal(requests.length, 1);
    console.log("PASS repeat request served from main-process cache");

    mode = "offline";
    await run(`document.getElementById('prompt').value = 'make it work please'; document.getElementById('submit').click();`);
    await until(() => run("window.__submitting === false && !!document.querySelector('.chat-dwarf:last-child') && document.querySelector('.chat-dwarf:last-child').textContent.length > 0"), "offline fallback did not render");
    await sleep(5000);
    const fallback = await run("[...document.querySelectorAll('.chat-dwarf')].map(el => el.textContent)");
    const originalRandom = Math.random;
    const possible = new Set();
    try {
      for (let i = 0; i < 100; i++) { Math.random = () => i / 100; possible.add(pickRoast("grumpy", analyze("make it work please").tier)); }
    } finally { Math.random = originalRandom; }
    assert.ok(fallback.some((text) => possible.has(text)), "renderer must show a real offline-bank line");
    assert.equal(requests.length, 2);
    const allBubbles = await run(`import('../brain/canned.js').then(m => ['doc','grumpy','happy','sleepy','sneezy','bashful','dopey'].flatMap(id => ['mild','medium','savage'].map(tier => m.maybeLebanese(1,id,tier))))`);
    assert.equal(allBubbles.length, 21);
    assert.ok(allBubbles.every((line) => LEBANESE.includes(line)));
    console.log("PASS simulated network failure -> canned renderer output; all 21 dialect lines load in Chromium");
    mode = "success";
    await run("window.devchaos.openSettings()");
    await until(() => BrowserWindow.getAllWindows().length === 2, "settings window did not open");
    const settings = BrowserWindow.getAllWindows().find((w) => w !== win);
    const settingsRun = (code) => settings.webContents.executeJavaScript(code);
    await until(async () => !settings.webContents.isLoading(), "settings did not load");
    await until(() => settingsRun("typeof ready !== 'undefined' && ready"), "settings config did not load");
    const before = await run("window.devchaos.getConfig()");
    const diskBefore = fs.readFileSync(path.join(profile, "config.json"), "utf8");
    failConfigWrite = true;
    await settingsRun("document.getElementById('volume').value = '0.5'; document.getElementById('save').onclick()");
    assert.deepEqual(await run("window.devchaos.getConfig()"), before);
    assert.equal(fs.readFileSync(path.join(profile, "config.json"), "utf8"), diskBefore);
    assert.match(await settingsRun("document.getElementById('save-msg').textContent"), /Could not save/);
    assert.equal(await settingsRun("document.getElementById('save').disabled"), false);
    failConfigWrite = false;
    console.log("PASS failed settings save shows error and preserves memory + disk configuration");

    const rejectedStart = requests.length;
    await settingsRun("document.getElementById('provider').value = 'deepseek'; document.getElementById('save').onclick()");
    assert.match(await settingsRun("document.getElementById('save-msg').textContent"), /new API key/);
    assert.equal(requests.length, rejectedStart);
    assert.deepEqual(await run("window.devchaos.getConfig()"), before);
    console.log("PASS provider switch without replacement key rejected without outbound calls");

    const testStart = requests.length;
    await settingsRun("document.getElementById('test').onclick()");
    await settingsRun("document.getElementById('test').onclick()");
    assert.equal(requests.length, testStart + 2);
    assert.ok(requests.at(-1).system_instruction, "unsaved DeepSeek selection must not change saved Gemini provider");
    assert.match(await settingsRun("document.getElementById('result').textContent"), /LIVE LLM/);
    console.log("PASS two settings TEST clicks make two provider requests using saved settings");

    await settingsRun("document.getElementById('provider').value = 'gemini'; document.getElementById('save').onclick()");
    assert.match(await settingsRun("document.getElementById('save-msg').textContent"), /Saved/);
    assert.equal((await run("window.devchaos.setConfig({provider:'invalid'})")).ok, false);
    const requestCode = `window.devchaos.roast(${JSON.stringify(ipcPayload)})`;
    assert.equal((await run(requestCode)).source, "cache");
    assert.equal((await run("window.devchaos.setConfig({model:'test-model'})")).ok, true);
    const changedStart = requests.length;
    assert.equal((await run(requestCode)).source, "llm");
    assert.equal(requests.length, changedStart + 1);
    assert.equal((await run(requestCode)).source, "cache");
    console.log("PASS successful config save invalidates cache; invalid config is rejected");
    await run("window.__voiceCalls=0; window.DEVCHAOS_VOICE.blip=()=>window.__voiceCalls++; void 0");
    await run("window.devchaos.setConfig({voiceOn:true,volume:0.4})");
    await until(() => run("window.DEVCHAOS_SFX.volume===0.4"), "volume change did not reach overlay");
    await run("document.querySelectorAll('.hat-btn')[0].click()");
    await until(() => run("window.__voiceCalls>0"), "voice ON not applied live");
    await run("window.devchaos.setConfig({voiceOn:false,volume:0})");
    await until(() => run("window.DEVCHAOS_SFX.volume===0"), "mute did not reach overlay");
    await sleep(100);
    await run("window.__voiceCalls=0; document.querySelectorAll('.hat-btn')[1].click()");
    await sleep(250);
    assert.equal(await run("window.__voiceCalls"), 0);
    await run("window.devchaos.setConfig({demo:true})");
    await until(() => run("/^0:4[0-5]$/.test(document.getElementById('break-count').textContent)"), "demo deadline not reset live");
    await run("window.devchaos.setConfig({demo:false})");
    console.log("PASS committed settings update voice, SFX volume and demo deadline in live overlay");
    console.log("SMOKE OK (isolated profile, provider requests mocked, listener off)");
    clearTimeout(timeout);
    app.exit(0);
  } catch (error) {
    console.error("SMOKE FAIL:", error.stack);
    clearTimeout(timeout);
    app.exit(1);
  }
});
