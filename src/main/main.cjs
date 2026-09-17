// DevChaos main process: overlay window + break window + tray + config/session persistence.
// Window patterns adapted from blackhole-timer (MIT) and pixelpets (MIT) — see vendor-licenses/.

"use strict";

const { app, BrowserWindow, Tray, Menu, ipcMain, screen, desktopCapturer, session, nativeImage, globalShortcut, dialog } = require("electron");

// Black-frame fix (verified on this machine via standalone rig): with default GPU
// compositing, getDisplayMedia delivers black frames on this GPU/driver combo.
// CPU compositing keeps WebGL on the GPU (60 FPS verified) while making screen
// capture actually deliver frames.
app.commandLine.appendSwitch("disable-gpu-compositing");
const fs = require("node:fs");
const path = require("node:path");
const { configPatch, writeConfig } = require("./config-store.cjs");
const { createRoastService } = require("./roast-service.cjs");

const demoMode = process.argv.includes("--demo");
const ROOT = path.resolve(__dirname, "..", "..");
const DATA_DIR = app.getPath("userData");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");
const SESSION_PATH = path.join(DATA_DIR, "session.json");

const DEFAULT_CONFIG = {
  provider: "gemini",
  model: "gemini-3.6-flash",
  apiKey: "",
  breakMinutes: 180,
  breakDurationMinutes: 30,
  volume: 0.7,
  voiceOn: true,
  demo: demoMode,
};

let overlay = null;
let breakWin = null;
let tray = null;
let config = loadJson(CONFIG_PATH, DEFAULT_CONFIG);
let sessionState = loadJson(SESSION_PATH, null);

/* ---------------- IDE listener (headphones feature) ---------------- */
// PowerShell WH_KEYBOARD_LL child → line per Enter → gates here → overlay.
// The child buffers keystrokes globally in RAM; main forwards only lines passing
// the IDE and natural-language gates. OFF by default, with visible UI state.

const { spawn } = require("node:child_process");
const { isIdeWindow, looksLikePrompt } = require("./gates.cjs");
let listenerProc = null;
let listening = false;
let listenRestoreTimer = null;

function cancelListenRestore() {
  if (listenRestoreTimer) { clearTimeout(listenRestoreTimer); listenRestoreTimer = null; }
}

function setListening(on, { persist = true } = {}) {
  cancelListenRestore(); // an explicit change always outranks the delayed startup restore
  listening = Boolean(on);
  console.error(`[listen] setListening(${on}) -> listening=${listening} hadProc=${!!listenerProc}`);
  if (persist && !saveConfig({ ...config, listen: listening })) {
    dialog.showErrorBox("Listening preference not saved", "Listening changed for this session only. The saved preference was kept.");
  }
  if (listening && !listenerProc) {
    listenerProc = spawn("powershell.exe", [
      "-NoProfile", "-ExecutionPolicy", "Bypass",
      "-File", path.join(ROOT, "tools", "ide-listener.ps1"),
    ], { stdio: ["ignore", "pipe", "pipe"] });
    const child = listenerProc;
    let buf = "";
    listenerProc.stdout.setEncoding("utf8");
    listenerProc.stderr.setEncoding("utf8");
    listenerProc.stderr.on("data", () => console.error("[listener] stderr received (content omitted)"));
    listenerProc.stdout.on("data", (chunk) => {
      if (!listening || listenerProc !== child) return;
      buf += chunk;
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const rawLine = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!rawLine) continue;
        try {
          const evt = JSON.parse(rawLine);
          const windowOk = isIdeWindow(evt);
          const promptOk = looksLikePrompt(evt.line);
          // Decisions only: captured text and window metadata must not enter logs.
          console.error(`[gate] win=${windowOk} prompt=${promptOk}`);
          if (windowOk && promptOk) {
            overlay?.webContents.send("devchaos:ide-prompt", { text: evt.line, title: evt.title });
          }
        } catch { /* malformed line: skip */ }
      }
    });
    const stopped = () => {
      if (listenerProc !== child) return;
      listenerProc = null;
      setListening(false, { persist: false });
    };
    child.on("error", () => { console.error("[listener] process error"); stopped(); });
    child.on("exit", (code) => { console.error(`[listener] exited code=${code}`); stopped(); });
  }
  if (!listening && listenerProc) {
    try { listenerProc.kill(); } catch {}
    listenerProc = null;
  }
  overlay?.webContents.send("devchaos:listen-state", { on: listening });
  rebuildTrayMenu();
}

function loadJson(file, fallback) {
  try { return { ...fallback, ...JSON.parse(fs.readFileSync(file, "utf8")) }; }
  catch { return fallback ? structuredClone(fallback) : null; }
}

function saveConfig(next) {
  if (!writeConfig(CONFIG_PATH, next)) return false;
  config = next;
  return true;
}

function broadcastConfig() {
  // Committed config only, key redacted — renderers re-sync voice/volume/timings live.
  const safe = { ...config, apiKey: config.apiKey ? "SET" : "" };
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("devchaos:config-changed", safe);
  }
}

function updateSettings(patch) {
  let next;
  try { next = configPatch(config, patch); }
  catch (e) { return { ok: false, error: e?.message === "Invalid settings" ? "Invalid settings." : e?.message || "Invalid settings." }; }
  const changed = ["provider", "model", "apiKey", "demo"].some((key) => next[key] !== config[key]);
  if (!saveConfig(next)) return { ok: false, error: "Could not save settings. Previous settings were kept." };
  if (changed) {
    roastService.invalidate();
    schedulePrefetch();
  }
  broadcastConfig();
  if (tray) rebuildTrayMenu();
  return { ok: true };
}
function saveSession(state) { sessionState = state; try { fs.writeFileSync(SESSION_PATH, JSON.stringify(state)); } catch {} }

app.whenReady().then(() => {
  installCaptureHandler();
  createOverlay();
  createTray();
  // Standard exit hotkey — works no matter what has focus.
  globalShortcut.register("CommandOrControl+Alt+Q", () => app.quit());
  // Headphones toggle hotkey (demo-friendly, reliable even when the chip is busy).
  globalShortcut.register("CommandOrControl+Alt+L", () => setListening(!listening));
  app.on("activate", () => { if (!overlay) createOverlay(); });
  // Test/rehearsal hatch: auto-run the black hole in the overlay shortly after launch.
  if (process.env.DEVCHAOS_TEST_BREAK) {
    setTimeout(() => overlay?.webContents.send("devchaos:hole-run"), Math.max(1, Number(process.env.DEVCHAOS_TEST_BREAK) || 3) * 1000);
  }
  // Headphones: restore persisted listening state (survives restarts — demo safety).
  // Delayed so one explicit OFF during startup still wins over the saved preference.
  if (config.listen === true || process.env.DEVCHAOS_LISTEN) {
    listenRestoreTimer = setTimeout(() => {
      listenRestoreTimer = null;
      setListening(true, { persist: false });
    }, 2500);
  }
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  cancelListenRestore();
  setListening(false, { persist: false });
  roastService.invalidate();
  tray?.destroy(); globalShortcut.unregisterAll();
});

function createOverlay() {
  const display = screen.getPrimaryDisplay();
  overlay = new BrowserWindow({
    x: display.bounds.x, y: display.bounds.y,
    width: display.bounds.width, height: display.bounds.height,
    frame: false, transparent: true, resizable: false, movable: false,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
      backgroundThrottling: false,
    },
  });
  overlay.setAlwaysOnTop(true, "screen-saver");
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlay.setIgnoreMouseEvents(true, { forward: true });
  // The overlay now samples the screen for the black hole — it must be excluded
  // from its own capture (no recursion / no frozen UI in the lens).
  overlay.setContentProtection(true);
  overlay.loadFile(path.join(ROOT, "src", "renderer", "overlay.html"));
  overlay.on("closed", () => { overlay = null; });

  // Verification hatch: self-capture the overlay (bypasses content protection)
  // so the black hole can be machine-vision checked without a second screen.
  if (process.env.DEVCHAOS_SNAP) {
    const interval = Math.max(2, Number(process.env.DEVCHAOS_SNAP) || 3) * 1000;
    let n = 0;
    const dir = path.join(ROOT, "shots");
    fs.mkdirSync(dir, { recursive: true });
    setInterval(async () => {
      if (!overlay || overlay.isDestroyed()) return;
      try {
        const image = await overlay.webContents.capturePage();
        fs.writeFileSync(path.join(dir, `hole_${String(++n).padStart(2, "0")}.png`), image.toPNG());
        if (n % 3 === 0) {
          const truth = await overlay.webContents.executeJavaScript(
            `JSON.stringify({cls: document.getElementById('listen-chip').className, label: document.getElementById('listen-label').textContent, dwarfs: document.getElementById('dwarf').className})`
          ).catch((e) => "DUMP-ERR " + e.message);
          console.error("[dom]", truth);
        }
      } catch {}
    }, interval);
  }
}

function createBreakWindow() {
  if (breakWin) return;
  const display = screen.getPrimaryDisplay();
  breakWin = new BrowserWindow({
    x: display.bounds.x, y: display.bounds.y,
    width: display.bounds.width, height: display.bounds.height,
    frame: false, fullscreen: true, resizable: false, movable: false,
    alwaysOnTop: true, skipTaskbar: false, backgroundColor: "#000000",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
      backgroundThrottling: false,
    },
  });
  breakWin.setAlwaysOnTop(true, "screen-saver");
  breakWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // CRITICAL: window invisible to screen capture — otherwise the capture texture
  // would show this very window (recursion = black background). Pattern from blackhole-timer.
  breakWin.setContentProtection(true);
  breakWin.loadFile(path.join(ROOT, "src", "renderer", "break.html"),
    { search: `growSec=${config.demo ? 10 : (config.breakDurationMinutes ?? 30) * 30}&recedeSec=${config.demo ? 10 : (config.breakDurationMinutes ?? 30) * 30}&dwarf=${currentDwarfForBreak()}` });
  breakWin.once("ready-to-show", () => {
    breakWin.show();
    overlay?.hide(); // keep captured texture = clean desktop (no frozen dwarf in the warp)
    overlay?.webContents.send("devchaos:break-started");
    if (process.env.DEVCHAOS_SNAP) {
      const interval = Math.max(2, Number(process.env.DEVCHAOS_SNAP) || 3) * 1000;
      let n = 0;
      const dir = path.join(ROOT, "shots");
      fs.mkdirSync(dir, { recursive: true });
      const timer = setInterval(async () => {
        if (!breakWin || breakWin.isDestroyed()) return clearInterval(timer);
        try {
          const image = await breakWin.webContents.capturePage();
          fs.writeFileSync(path.join(dir, `break_${String(++n).padStart(2, "0")}.png`), image.toPNG());
        } catch {}
      }, interval);
    }
  });
  breakWin.on("closed", () => { breakWin = null; });
}

function currentDwarfForBreak() {
  // Overlay owns the active dwarf id in session; fall back to sleepy.
  return (sessionState && sessionState.activeDwarf) || "sleepy";
}

function installCaptureHandler() {
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, callback) => {
    try {
      const primary = screen.getPrimaryDisplay();
      const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1, height: 1 } });
      const source = sources.find((s) => s.display_id === String(primary.id)) ||
        sources.find((s) => /screen|entire/i.test(s.name)) || sources[0];
      callback(source ? { video: source } : {});
    } catch {
      callback({});
    }
  });
}

function createTray() {
  // 1x1 transparent PNG — no icon file needed for Day 1.
  const img = nativeImage.createFromDataURL("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");
  tray = new Tray(img);
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  const menu = Menu.buildFromTemplate([
    { label: "Show dwarfs", click: () => overlay?.show() },
    { label: "Hide dwarfs", click: () => overlay?.hide() },
    { type: "separator" },
    { label: `Summon black hole${config.demo ? " (demo timings)" : ""}`, click: () => overlay?.webContents.send("devchaos:hole-run") },
    { label: "⚙ Settings (API key, voice)", click: () => openSettings() },
    { label: `\u{1F3A7} Listen to IDE: ${listening ? "ON" : "OFF"}`, type: "checkbox", checked: listening, click: () => setListening(!listening) },
    { label: `Demo mode: ${config.demo ? "ON" : "OFF"}`, click: () => {
      const result = updateSettings({ demo: !config.demo });
      if (!result.ok) dialog.showErrorBox("Settings not saved", result.error);
    } },
    { type: "separator" },
    { label: "Quit DevChaos", click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip("DevChaos — 7 Dwarfs of Prompt Engineering");
}

/* ---------------- IPC ---------------- */

ipcMain.on("devchaos:set-listening", (_e, on) => setListening(Boolean(on)));

ipcMain.handle("devchaos:get-listening", () => listening);

ipcMain.on("devchaos:passthrough", (_e, enabled) => {
  overlay?.setIgnoreMouseEvents(Boolean(enabled), { forward: true });
});

ipcMain.handle("devchaos:get-config", () => ({ ...config, apiKey: config.apiKey ? "SET" : "" }));

ipcMain.handle("devchaos:set-config", (_e, patch) => {
  return updateSettings(patch);
});

ipcMain.handle("devchaos:record-prompt", (_e, entry) => {
  if (!sessionState) sessionState = {};
  const list = sessionState.prompts || (sessionState.prompts = []);
  list.push(entry);
  if (list.length > 200) list.shift();
  return { ok: true };
});

ipcMain.handle("devchaos:session-get", () => sessionState);
ipcMain.handle("devchaos:session-set", (_e, state) => { saveSession(state); return { ok: true }; });

// LLM requests run in main; stored keys are never returned to renderers.

// ESM dynamic import needs a file:/// URL — a raw backslash path throws
// ERR_UNSUPPORTED_ESM_URL_SCHEME, which silently degraded every roast to canned.
const { pathToFileURL } = require("node:url");
const importBrain = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

const roastService = createRoastService({ getConfig: () => config, loadBrain: importBrain });

ipcMain.handle("devchaos:roast", async (_e, payload) => {
  try {
    const result = await roastService.request(payload, { bypassCache: payload?.bypassCache === true });
    console.error(`[roast] served: ${result ? result.source : "null (canned will cover)"}`);
    return result;
  } catch {
    console.error("[roast] failed (details omitted)");
    return null;
  }
});

ipcMain.handle("devchaos:chat", async (_e, payload) => {
  try {
    const { chat } = await importBrain("src/brain/llm.js");
    return await chat(config, payload);
  } catch { return null; }
});

ipcMain.handle("devchaos:ideas", async (_e, payload) => {
  try {
    const { ideas } = await importBrain("src/brain/llm.js");
    const res = await ideas(config, payload);
    console.error(`[ideas] served: ${res ? res.length + " items" : "null (offline fallback will cover)"}`);
    return res;
  } catch (e) {
    console.error("[ideas] FAILED:", e?.message || e);
    return null; // renderer falls back to scorer-built suggestions
  }
});

// Seed Grumpy at exact demo intensities using the same scorer and request path.
// Serial spacing reduces bursts; provider quotas still apply.
function schedulePrefetch() {
  if (!config.demo || !config.apiKey) return;
  const file = path.join(ROOT, "demo", "DEMO_PROMPTS.txt");
  let prompts;
  try {
    prompts = fs.readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  } catch (e) { console.error("[prefetch] no demo file:", e.message); return; }
  return roastService.prefetch(prompts);
}
if (config.demo && config.apiKey) setTimeout(schedulePrefetch, 3000);

let settingsWin = null;
function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) return settingsWin.focus();
  settingsWin = new BrowserWindow({
    width: 420, height: 620, resizable: false,
    title: "DevChaos Settings", backgroundColor: "#14101a",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(ROOT, "src", "renderer", "settings.html"));
  settingsWin.on("closed", () => { settingsWin = null; });
}

ipcMain.on("devchaos:open-settings", () => openSettings());

ipcMain.on("devchaos:active-dwarf", (_e, id) => {
  if (!sessionState) sessionState = {};
  sessionState.activeDwarf = id;
  try { fs.writeFileSync(SESSION_PATH, JSON.stringify(sessionState)); } catch {}
});

ipcMain.on("devchaos:break-request", () => createBreakWindow());

ipcMain.on("devchaos:break-finished", () => {
  breakWin?.close();
  overlay?.show();
  overlay?.webContents.send("devchaos:break-ended");
  rebuildTrayMenu();
});
