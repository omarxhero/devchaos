// Preload bridge — renderer talks to main through window.devchaos only.

"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("devchaos", {
  passthrough: (enabled) => ipcRenderer.send("devchaos:passthrough", enabled),
  setListening: (on) => ipcRenderer.send("devchaos:set-listening", on),
  openSettings: () => ipcRenderer.send("devchaos:open-settings"),
  getListening: () => ipcRenderer.invoke("devchaos:get-listening"),
  breakRequest: () => ipcRenderer.send("devchaos:break-request"),
  breakFinished: () => ipcRenderer.send("devchaos:break-finished"),
  activeDwarf: (id) => ipcRenderer.send("devchaos:active-dwarf", id),
  getConfig: () => ipcRenderer.invoke("devchaos:get-config"),
  setConfig: (patch) => ipcRenderer.invoke("devchaos:set-config", patch),
  sessionGet: () => ipcRenderer.invoke("devchaos:session-get"),
  sessionSet: (state) => ipcRenderer.invoke("devchaos:session-set", state),
  roast: (payload) => ipcRenderer.invoke("devchaos:roast", payload),
  ideas: (payload) => ipcRenderer.invoke("devchaos:ideas", payload),
  recordPrompt: (entry) => ipcRenderer.invoke("devchaos:record-prompt", entry),
  // All subscriptions unwrap the IPC event: the payload is arg #2.
  onBreakStarted: (cb) => ipcRenderer.on("devchaos:break-started", (_e, p) => cb(p)),
  onBreakEnded: (cb) => ipcRenderer.on("devchaos:break-ended", (_e, p) => cb(p)),
  onHoleRun: (cb) => ipcRenderer.on("devchaos:hole-run", (_e, p) => cb(p)),
  onIdePrompt: (cb) => ipcRenderer.on("devchaos:ide-prompt", (_e, p) => cb(p)),
  onListenState: (cb) => ipcRenderer.on("devchaos:listen-state", (_e, p) => cb(p)),
  onConfigChanged: (cb) => ipcRenderer.on("devchaos:config-changed", (_e, p) => cb(p)),
  isElectron: true,
  // Shader source read via fs (file:// fetch is CORS-blocked in renderers).
  shaderSource: () => require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "..", "src", "shaders", "blackhole-port.frag"), "utf8"),
});
