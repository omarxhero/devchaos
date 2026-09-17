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
  const body = JSON.parse(options.body);
  requests.push(body);
  if (mode === "offline") throw new Error("simulated offline");
  if (mode === "rate_limit") return { ok: false, status: 429 };
  if (body.messages) {
    assert.equal(_url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer openrouter-test-only');
    assert.equal(body.model, 'deepseek/deepseek-v4.1-flash');
  }
  const result = (body.generationConfig?.response_schema.properties.reply || body.messages?.[0].content.includes('NOT prompt evaluation'))
    ? { reply: "Tayyeb, shu baddak nse3dak fi?" }
    : { roast: "Ya 3amme, sammi l-file w elle shu l-error!", refactored_prompt: "Fix [file] to produce [expected behavior].", label: "NEEDS CONTEXT" };
  return { ok: true, json: async () => body.messages
    ? { choices: [{ message: { content: JSON.stringify(result) } }] }
    : { candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] } };
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
const cycleTo = async (run, name) => {
  for (let i = 0; i < 8; i++) {
    if ((await run("document.getElementById('dialogue-title').textContent")).startsWith(name)) return;
    await run("document.getElementById('dwarf-cycle').click()");
  }
  throw new Error("dwarf cycle never reached " + name);
};
app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  const run = (code) => win.webContents.executeJavaScript(code);
  try {
    await until(async () => !win.webContents.isLoading(), "overlay did not load");
    win.hide();
    await until(() => run("!!document.getElementById('dwarf-cycle') && document.getElementById('dwarf-cycle').style.background !== ''"), "renderer boot did not finish");
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
    await run(`document.getElementById('prompt').value = 'fix it'; document.getElementById('submit').click();`);
    await until(() => run("window.__submitting === false"), "manual conversation did not finish");
    assert.equal(await run("document.querySelectorAll('.chat-score').length"), 0);
    assert.equal(await run("window.__lastPrompt === undefined"), true);
    assert.equal(await run("document.getElementById('docbox').classList.contains('hidden')"), true);
    assert.equal(await run("[...document.querySelectorAll('.chat-dwarf')].some(x => x.textContent === 'Tayyeb, shu baddak nse3dak fi?')"), true);
    assert.match(requests[0].system_instruction.parts[0].text, /NOT prompt evaluation/);
    assert.deepEqual(JSON.parse(requests[0].contents[0].parts[0].text), { history: [], message: 'fix it' });
    await run("document.getElementById('prompt').value='tell me more'; document.getElementById('submit').click()");
    await until(() => run("window.__submitting === false"), "follow-up did not finish");
    assert.deepEqual(JSON.parse(requests[1].contents[0].parts[0].text).history, [
      { role: 'user', content: 'fix it' }, { role: 'assistant', content: 'Tayyeb, shu baddak nse3dak fi?' },
    ]);
    assert.equal((await run('window.devchaos.sessionGet()'))?.memory?.stats?.count ?? 0, 0);
    console.log('PASS manual button -> normal chat + follow-up history, no grading or Doc rewrite');
    requests.length = 0;
    win.webContents.send('devchaos:ide-prompt', { text: 'fix it' });
    await until(() => run("window.__submitting === false && [...document.querySelectorAll('.chat-dwarf')].some(x => x.textContent === 'Ya 3amme, sammi l-file w elle shu l-error!')"), "provider result never reached renderer");
    const score = await run(`(() => { const el = document.querySelector('.chat-score'); return { className: el.className, number: el.querySelector('.num').textContent, label: el.querySelector('.lbl').textContent }; })()`);
    assert.deepEqual(score, { className: `chat-score tier-${scored.tier}`, number: `${scored.score}/10`, label: scored.label });
    assert.equal(requests.length, 1);
    assert.ok(requests[0].system_instruction.parts[0].text.includes(LEBANESE_GUIDE));
    assert.ok(requests[0].system_instruction.parts[0].text.includes("GRUMPY"));
    console.log("PASS synthetic IDE event -> renderer -> preload -> main -> mocked provider -> roast + score card");

    const { get } = await import(pathToFileURL(path.join(root, "src/brain/personalities.js")).href);
    const { memoryDigest } = await import(pathToFileURL(path.join(root, "src/brain/memory.js")).href);
    const savedSession = await run("window.devchaos.sessionGet()");
    const ipcPayload = { prompt: "fix it", scored, dwarf: get("grumpy"), roastometer: 50, digest: memoryDigest(savedSession.memory) };
    const cached = await run(`window.devchaos.roast(${JSON.stringify(ipcPayload)})`);
    assert.equal(cached.source, "cache");
    assert.equal(requests.length, 1);
    console.log("PASS repeat request served from main-process cache");

    mode = "offline";
    win.webContents.send('devchaos:ide-prompt', { text: 'make it work please' });
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
    const promptMemory = (await run('window.devchaos.sessionGet()')).memory;
    const scoreCount = await run("document.querySelectorAll('.chat-score').length");
    await run("document.getElementById('prompt').value='hello'; document.getElementById('submit').click()");
    await until(() => run("window.__submitting === false"), 'offline conversation did not finish');
    assert.equal(await run("[...document.querySelectorAll('.chat-dwarf')].some(x => x.textContent === 'Ahla! Ana Grumpy. Kifak lyom?')"), true);
    assert.equal(await run("document.querySelectorAll('.chat-score').length"), scoreCount);
    assert.deepEqual((await run('window.devchaos.sessionGet()')).memory, promptMemory);
    assert.equal(await run('window.__lastPrompt'), 'make it work please');
    assert.equal(await run("document.getElementById('docbox').classList.contains('hidden')"), true);
    console.log('PASS offline manual chat leaves IDE memory, score cards and Doc target unchanged');

    mode = "success";
    const exactPrompt = 'Refactor calculateTotal() in cart.js to handle null input, keep the API and add 3 tests.';
    await cycleTo(run, "SNEEZY");
    const sneezyStart = requests.length;
    win.webContents.send('devchaos:ide-prompt', { text: exactPrompt });
    await until(async () => requests.length === sneezyStart + 1 && await run("window.__submitting === false"), 'Sneezy IDE request did not finish');
    const sent = requests.at(-1).contents[0].parts[0].text;
    assert.ok(sent.includes(`\"\"\"\n${exactPrompt}\n\"\"\"`));
    assert.ok(sent.includes(`Machine-graded: ${analyze(exactPrompt).score}/10`));
    assert.equal(await run('window.__lastPrompt'), exactPrompt);
    assert.deepEqual(await run('window.__lastScored'), analyze(exactPrompt));
    assert.equal(await run("[...document.querySelectorAll('.chat-score .num')].at(-1).textContent"), `${analyze(exactPrompt).score}/10`);
    assert.equal((await run('window.devchaos.sessionGet()')).memory.stats.count, 3);
    console.log('PASS Sneezy grades and sends exact original IDE input, with matching displayed score');
    assert.deepEqual(await run(`(() => {
      const style = id => getComputedStyle(document.getElementById(id));
      return [style('dialogue').backgroundColor, style('dialogue-drag').backgroundColor,
        style('dialogue-drag').color, getComputedStyle(document.body).backgroundColor];
    })()`), ['rgb(255, 255, 255)', 'rgb(23, 107, 69)', 'rgb(255, 255, 255)', 'rgba(0, 0, 0, 0)']);
    const toolbar = await run(`(() => {
      const panel = document.getElementById('dialogue').getBoundingClientRect();
      const ids = ['listen-chip','break-chip','settings-chip'];
      const tools = ids.map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { id, inside: r.top >= panel.top && r.bottom <= panel.bottom && r.left >= panel.left && r.right <= panel.right, top: r.top, x: r.left }; });
      const row = tools.every(t => Math.abs(t.top - tools[0].top) < 2) && tools.every((t, i) => i === 0 || t.x > tools[i-1].x);
      const cycle = document.getElementById('dwarf-cycle').getBoundingClientRect();
      const close = document.getElementById('dialogue-close').getBoundingClientRect();
      return { inside: tools.every(t => t.inside), row, oneRow: tools.length === 3,
        cycleBesideClose: cycle.width > 0 && cycle.right <= close.left && Math.abs((cycle.top + cycle.bottom) - (close.top + close.bottom)) < 2,
        oldHatsRemoved: !document.getElementById('hats') && document.querySelectorAll('.hat-btn').length === 0 };
    })()`);
    assert.deepEqual(toolbar, { inside: true, row: true, oneRow: true, cycleBesideClose: true, oldHatsRemoved: true });
    console.log('PASS Settings/IDE/timer controls live in one aligned row inside the chat panel');
    for (const id of ['bashful', 'dopey', 'doc', 'grumpy', 'happy', 'sleepy', 'sneezy']) {
      await run("document.getElementById('dwarf-cycle').click()");
      assert.equal(await run('window.DEVCHAOS_DWARF.id'), id);
      assert.ok((await run("document.getElementById('dialogue-title').textContent")).startsWith(id.toUpperCase()));
    }
    await run("document.getElementById('dialogue-close').click()");
    assert.equal(await run("document.getElementById('dialogue').classList.contains('hidden')"), true);
    await run(`(() => {
      const el = document.getElementById('dwarf');
      el.dispatchEvent(new MouseEvent('mousedown', {clientX:100, clientY:100}));
      window.dispatchEvent(new MouseEvent('mouseup', {clientX:100, clientY:100}));
      el.dispatchEvent(new MouseEvent('click', {clientX:100, clientY:100}));
    })()`);
    assert.equal(await run("document.getElementById('dialogue').classList.contains('hidden')"), false);
    console.log('PASS header switch cycles all seven dwarfs and wraps; dwarf click reopens closed panel');
    await run("window.devchaos.openSettings()");
    await until(() => BrowserWindow.getAllWindows().length === 2, "settings window did not open");
    const settings = BrowserWindow.getAllWindows().find((w) => w !== win);
    const settingsRun = (code) => settings.webContents.executeJavaScript(code);
    await until(async () => !settings.webContents.isLoading(), "settings did not load");
    await until(() => settingsRun("typeof ready !== 'undefined' && ready"), "settings config did not load");
    assert.equal(await settingsRun("getComputedStyle(document.body).backgroundColor"), 'rgb(255, 255, 255)');
    mode = 'rate_limit';
    const zakaMessage = 'do you know zaka ai they give courses and teach you how to be an ai consultent what do you think of them';
    await run(`document.getElementById('prompt').value=${JSON.stringify(zakaMessage)}; document.getElementById('submit').click()`);
    await until(() => run('window.__submitting === false'), 'quota fallback did not finish');
    assert.equal(await run("[...document.querySelectorAll('.chat-dwarf')].some(el => el.textContent.includes('429') && el.textContent.includes('quota'))"), true);
    assert.equal((await run('window.devchaos.getConfig()')).apiKey, 'SET');
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'config.json'), 'utf8')).apiKey, 'test-only');
    assert.equal(await run("document.getElementById('doc-help') === null"), true);
    assert.match(await settingsRun("document.getElementById('key-status').textContent"), /Key saved for gemini/);
    mode = 'success';
    console.log('PASS exact Zaka chat shows 429 reason without deleting key; saved-key indicator and Doc-help removal');
    console.log('PASS rendered white panels, cedar header and transparent desktop root');
    const accents = await run(`(() => {
      const s = id => getComputedStyle(document.getElementById(id));
      return { sendButton: s('submit').backgroundColor, inputBorder: s('prompt').borderTopColor,
        moodBarBorder: s('mood-bar').borderTopColor, moodFill: s('mood-fill').backgroundColor,
        cedarWatermark: s('chat').backgroundImage.includes('svg') };
    })()`);
    assert.deepEqual(accents, { sendButton: 'rgb(181, 43, 57)', inputBorder: 'rgb(181, 43, 57)',
      moodBarBorder: 'rgb(181, 43, 57)', moodFill: 'rgb(181, 43, 57)',
      cedarWatermark: true });
    console.log('PASS crimson send/input/health accents and cedar chat watermark applied');
    const resizing = await run(`(() => {
      const panel = document.getElementById('dialogue');
      const original = panel.style.cssText;
      const docbox = document.getElementById('docbox');
      const originalDocClass = docbox.className;
      docbox.classList.remove('hidden');
      const resizeMode = getComputedStyle(panel).resize;
      const measure = (width, height) => {
        panel.style.width = width + 'px'; panel.style.height = height + 'px';
        const p = panel.getBoundingClientRect();
        const chat = document.getElementById('chat').getBoundingClientRect();
        const controlsVisible = ['dialogue-input-row', 'submit', 'dialogue-controls'].every(id => {
          const r = document.getElementById(id).getBoundingClientRect();
          return r.left >= p.left && r.right <= p.right && r.top >= p.top && r.bottom <= p.bottom;
        });
        return { width: p.width, height: p.height, chatHeight: chat.height, controlsVisible };
      };
      const compact = measure(360, 320);
      const expanded = measure(Math.min(650, innerWidth - 24), innerHeight - 100);
      measure(360, 320);
      document.getElementById('prompt').value = 'compact panel send check';
      document.getElementById('submit').click();
      const sent = [...document.querySelectorAll('.chat-user')].some(el => el.textContent === 'compact panel send check');
      panel.style.cssText = original;
      docbox.className = originalDocClass;
      return { resizeMode, compact, expanded, sent };
    })()`);
    assert.equal(resizing.resizeMode, 'both');
    assert.equal(resizing.compact.width, 360);
    assert.equal(resizing.compact.height, 320);
    assert.equal(resizing.compact.controlsVisible, true, JSON.stringify(resizing));
    assert.equal(resizing.expanded.controlsVisible, true);
    assert.ok(resizing.expanded.width > resizing.compact.width);
    assert.ok(resizing.expanded.chatHeight > resizing.compact.chatHeight);
    assert.equal(resizing.sent, true);
    await until(() => run('window.__submitting === false'), 'compact panel send did not finish');
    console.log('PASS resizable panel: exact 360x320 with Doc open, SEND works, expanded chat grows');
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
    await cycleTo(run, "DOC");
    await until(() => run("window.__voiceCalls>0"), "voice ON not applied live");
    await run("window.devchaos.setConfig({voiceOn:false,volume:0})");
    await until(() => run("window.DEVCHAOS_SFX.volume===0"), "mute did not reach overlay");
    await sleep(100);
    await run("window.__voiceCalls=0; document.getElementById('dwarf-cycle').click()");
    await sleep(250);
    assert.equal(await run("window.__voiceCalls"), 0);
    await run("window.devchaos.setConfig({demo:true})");
    await until(() => run("/^0:4[0-5]$/.test(document.getElementById('break-count').textContent)"), "demo deadline not reset live");
    await run("window.devchaos.setConfig({demo:false})");
    console.log("PASS committed settings update voice, SFX volume and demo deadline in live overlay");
    await settingsRun("document.getElementById('breakHours').value='3'; document.getElementById('breakDurationMinutes').value='30'; document.getElementById('save').onclick()");
    const savedTiming = await run('window.devchaos.getConfig()');
    assert.equal(savedTiming.breakMinutes, 180);
    assert.equal(savedTiming.breakDurationMinutes, 30);
    const savedDisk = JSON.parse(fs.readFileSync(path.join(profile, 'config.json'), 'utf8'));
    assert.equal(savedDisk.breakMinutes, 180);
    assert.equal(savedDisk.breakDurationMinutes, 30);
    await until(() => run("/^179:5[0-9]$/.test(document.getElementById('break-count').textContent)"), 'three-hour timer not applied');
    await settingsRun("document.getElementById('breakDurationMinutes').value='0'; document.getElementById('save').onclick()");
    assert.match(await settingsRun("document.getElementById('save-msg').textContent"), /Invalid settings/);
    assert.equal((await run('window.devchaos.getConfig()')).breakDurationMinutes, 30);
    settings.close();
    await run('window.devchaos.openSettings()');
    const reopened = BrowserWindow.getAllWindows().find(w => w !== win);
    await until(() => reopened.webContents.executeJavaScript("typeof ready !== 'undefined' && ready"), 'reopened settings did not load');
    assert.deepEqual(await reopened.webContents.executeJavaScript("[document.getElementById('breakHours').value, document.getElementById('breakDurationMinutes').value]"), ['3', '30']);
    console.log('PASS black-hole settings save 3h/30min, reset timer, reject zero and survive reopening');
    const holeSource = fs.readFileSync(path.join(root, 'src/renderer/hole.js'), 'utf8').replace(/export /g, '');
    const holeCheck = await run(`(async () => {
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:fixed;width:320px;height:180px;visibility:hidden';
      document.body.appendChild(canvas);
      const videoEl = document.createElement('video');
      ${holeSource}
      await initHole(canvas, videoEl);
      HOLE._seed = [0.5, 0.5]; HOLE._tumbleW = 0; HOLE._tumblePhase = 0;
      const frames = [];
      for (const p of [0.25, 0.25001, 1, 0.99999]) {
        render(10000, p);
        gl.finish();
        frames.push({
          progress: gl.getUniform(program, locations.progress),
          radius: gl.getUniform(program, locations.holeMaskRadius),
          error: gl.getError(),
        });
      }
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
      return frames;
    })()`);
    assert.equal(holeCheck[0].progress, 0.125);
    assert.ok(holeCheck[1].progress > holeCheck[0].progress);
    assert.ok(holeCheck[1].radius > holeCheck[0].radius);
    assert.equal(holeCheck[2].progress, 1);
    assert.ok(holeCheck.every(frame => frame.error === 0));
    console.log('PASS actual WebGL shader compiles and receives continuous eased growth; synthetic background, no capture');
    const routerSettings = code => reopened.webContents.executeJavaScript(code);
    await routerSettings("document.getElementById('provider').value='openrouter'; document.getElementById('apiKey').value='openrouter-test-only'; document.getElementById('save').onclick()");
    assert.equal((await run('window.devchaos.getConfig()')).model, 'deepseek/deepseek-v4.1-flash');
    await routerSettings("document.getElementById('test').onclick()");
    assert.match(await routerSettings("document.getElementById('result').textContent"), /LIVE LLM/);
    assert.equal(requests.at(-1).model, 'deepseek/deepseek-v4.1-flash');
    await run("document.getElementById('prompt').value='hello OpenRouter'; document.getElementById('submit').click()");
    await until(() => run('window.__submitting === false'), 'OpenRouter conversation did not finish');
    assert.ok(requests.at(-1).messages[0].content.includes('NOT prompt evaluation'));
    assert.equal(await run("[...document.querySelectorAll('.chat-dwarf')].some(x => x.textContent === 'Tayyeb, shu baddak nse3dak fi?')"), true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'config.json'), 'utf8')).apiKey, 'openrouter-test-only');
    console.log('PASS OpenRouter settings save, TEST ROAST and manual chat through real IPC with mocked provider');
    console.log("SMOKE OK (isolated profile, provider requests mocked, listener off)");
    clearTimeout(timeout);
    app.exit(0);
  } catch (error) {
    console.error("SMOKE FAIL:", error.stack);
    clearTimeout(timeout);
    app.exit(1);
  }
});
