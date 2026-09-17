// Break window: the black hole sequence — DEADLINE-DRIVEN (Omar spec, ghostty-blackhole DNA):
// Phase 1 GROW: spawns preWindow seconds before target time; hole grows with approaching
// deadline; FULL coverage exactly AT the target time.
// Phase 2 RECEDE: during the break the hole SHRINKS continuously with rest progress;
// screen clears at break end. Inputs lock only while coverage > 85%.
// WebGL port of blackhole-timer desktop-renderer (MIT, same patch strategy).

"use strict";

let audioConfig = { voiceOn: true, volume: 0.7 };
let receivedConfig = false;
function applyAudioConfig(next) {
  audioConfig = next;
  if (window.DEVCHAOS_SFX) window.DEVCHAOS_SFX.volume = next.volume ?? 0.7;
}
window.devchaos?.onConfigChanged?.((next) => { receivedConfig = true; applyAudioConfig(next); });
const audioReady = window.devchaos?.getConfig().then((next) => {
  if (!receivedConfig) applyAudioConfig(next);
}).catch(() => {});

const params = new URLSearchParams(window.location.search);
// Timeline params from main: growSec = pre-window, recedeSec = break length.
const GROW_SEC = Number(params.get("growSec") || 45);
const RECEDE_SEC = Number(params.get("recedeSec") || 30);
const DWARF_ID = params.get("dwarf") || "sleepy";
const MAX_DPR = 1.6;

const $ = (id) => document.getElementById(id);
const canvas = $("blackhole");
const video = $("capture");
const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false });

const fallbackCanvas = document.createElement("canvas");
const fallbackCtx = fallbackCanvas.getContext("2d", { alpha: false });

const state = {
  captureReady: false,
  phase: "grow",           // grow → recede → done
  phaseStart: performance.now(),
  progress: 0,             // 0..1 hole coverage
  center: [0.5, 0.48],
};

let program, locations, sceneTexture, buffer;

/* ---------- audio: gravity hum ---------- */
let humOsc = null, subOsc = null, humGain = null;
function startHum() {
  try {
    const ctx = window.DEVCHAOS_VOICE ? window.DEVCHAOS_VOICE.ctx : null;
    if (!ctx || humOsc) return;
    humOsc = ctx.createOscillator(); humOsc.type = "sawtooth"; humOsc.frequency.value = 38;
    subOsc = ctx.createOscillator(); subOsc.type = "sine"; subOsc.frequency.value = 55;
    humGain = ctx.createGain(); humGain.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 160;
    humOsc.connect(lp); subOsc.connect(lp); lp.connect(humGain).connect(ctx.destination);
    humOsc.start(); subOsc.start();
  } catch {}
}
function setHum(intensity) { if (humGain) humGain.gain.value = Math.min(0.35, intensity * 0.35); }
function stopHum() { try { humOsc?.stop(); subOsc?.stop(); humOsc = subOsc = humGain = null; } catch {} }

/* ---------- sequence ---------- */

async function run() {
  // PHASE 1 — GROW: deadline pressure. Sleepy warns, dwarf resists, void devours.
  placeSleepy();
  setTimeout(() => { $("sleepy").style.left = "38%"; }, 60);
  await wait(Math.min(2200, GROW_SEC * 300));
  showBubble("the deadline is coming... it's HUNGRY...");
  window.DEVCHAOS_SFX?.play("whoosh", { volume: 0.35 });
  startHum();
  placeSacrifice(Math.max(1200, GROW_SEC * 350));

  // Sleep until the deadline lands.
  await waitUntil(state.phaseStart + GROW_SEC * 1000);

  // Full coverage moment: SLEEP. NOW.
  $("bbubble").style.display = "none";
  $("sleepy").style.display = "none";
  $("sacrifice").style.display = "none";
  $("lock").style.display = "flex";
  window.DEVCHAOS_SFX?.play("alarm", { volume: 0.9 });
  await wait(2600);
  $("lock").style.display = "none";

  // PHASE 2 — RECEDE: rest shrinks the void. Progress runs backwards in render loop.
  state.phase = "recede";
  state.phaseStart = performance.now();
  showBubble("rest now... every second of sleep, the void gets smaller...");
  await waitUntil(state.phaseStart + RECEDE_SEC * 1000);

  finish();
}

function finish() {
  if (state.phase === "done") return;
  state.phase = "done";
  state.progress = 0;
  stopHum();
  setHum(0);
  $("bbubble").style.display = "none";
  $("victory").style.display = "flex";
  window.DEVCHAOS_SFX?.play("victory", { volume: 0.9 });
  setTimeout(() => window.devchaos?.breakFinished(), 1800);
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function waitUntil(ts) {
  const left = ts - performance.now();
  return left > 0 ? wait(left) : Promise.resolve();
}

function showBubble(text) {
  const b = $("bbubble");
  b.textContent = text;
  b.style.display = "block";
  b.style.left = "44%";
  b.style.top = (window.innerHeight * 0.55) + "px";
  let i = 0;
  const vp = { waveform: "sine", baseFreq: 240, pitch: 0.82, speed: 0.62, gain: 0.8 };
  const t = setInterval(() => {
    if (i >= text.length) return clearInterval(t);
    const ch = text[i++];
    if (audioConfig.voiceOn !== false) window.DEVCHAOS_VOICE?.blip(ch, vp);
  }, 60);
}

function dwarfImg(id, el) {
  const img = new Image();
  img.onload = () => { el.innerHTML = ""; el.appendChild(img); };
  img.src = `../../assets/sprites/processed/${id}.png`;
}

function placeSleepy() {
  const el = $("sleepy");
  el.style.left = "-140px";
  dwarfImg("sleepy", el);
}

function placeSacrifice(spiralAtMs) {
  const el = $("sacrifice");
  el.style.left = "72%";
  el.style.top = (window.innerHeight - 180) + "px";
  el.style.display = "block";
  dwarfImg(DWARF_ID, el);
  // as the hole nears full, the active dwarf loses the fight
  setTimeout(() => {
    el.style.transition = "transform 3s cubic-bezier(.3,.6,.6,1), opacity 3s";
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const r = el.getBoundingClientRect();
    const dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2);
    el.style.transform = `translate(${dx}px, ${dy}px) rotate(1440deg) scale(0.02)`;
    el.style.opacity = "0";
    window.DEVCHAOS_SFX?.play("whoosh", { volume: 0.8 });
  }, spiralAtMs);
}

/* skip hatch: triple-click top-left = bail out (demo insurance) */
let skipClicks = 0, skipTimer;
$("skip").addEventListener("click", () => {
  skipClicks++;
  clearTimeout(skipTimer);
  skipTimer = setTimeout(() => (skipClicks = 0), 900);
  if (skipClicks >= 3) finish();
});

/* ---------- WebGL (ported from blackhole-timer, MIT) ---------- */

async function initGL() {
  if (!gl) throw new Error("WebGL2 unavailable");
  const raw = window.devchaos ? window.devchaos.shaderSource() : "";
  const patched = raw
    .replace("#define SIZE_MODE MODE_DEMO", "#define SIZE_MODE MODE_TOKENS")
    .replace("const float TOKEN_AREA_MIN = 0.0100;", "const float TOKEN_AREA_MIN = 0.0045;")
    .replace("const float TOKEN_AREA_MAX = 0.5000;", "const float TOKEN_AREA_MAX = 0.3000;")
    .replace("float shield = vis * smoothstep(WORK_AREA, WORK_AREA + 0.18, yUp);", "float shield = vis;")
    .replace("center = (lo + hi) * 0.5 + wander * ampEff\n               + wobAmp * vec2(cos(t * 0.8), sin(t * 1.0));", "center = iBlackholeCenter;");

  const frag = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D iChannel0;
uniform vec3 iResolution;
uniform float iTime;
uniform vec4 iDate;
uniform float iTimeCursorChange;
uniform vec4 iCurrentCursorColor;
uniform vec4 iPreviousCursorColor;
uniform vec2 iBlackholeCenter;
out vec4 outColor;
${patched}
void main() { mainImage(outColor, gl_FragCoord.xy); }
`;
  program = createProgram(vertexShaderSource(), frag);
  locations = {
    position: gl.getAttribLocation(program, "a_position"),
    channel0: gl.getUniformLocation(program, "iChannel0"),
    resolution: gl.getUniformLocation(program, "iResolution"),
    time: gl.getUniformLocation(program, "iTime"),
    date: gl.getUniformLocation(program, "iDate"),
    timeCursorChange: gl.getUniformLocation(program, "iTimeCursorChange"),
    currentCursorColor: gl.getUniformLocation(program, "iCurrentCursorColor"),
    previousCursorColor: gl.getUniformLocation(program, "iPreviousCursorColor"),
    blackholeCenter: gl.getUniformLocation(program, "iBlackholeCenter"),
  };
  buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  sceneTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 30, max: 60 },
        width: { ideal: Math.round(screen.width * (window.devicePixelRatio || 1)) },
        height: { ideal: Math.round(screen.height * (window.devicePixelRatio || 1)) },
      },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    state.captureReady = true;
  } catch { state.captureReady = false; }
}

function vertexShaderSource() {
  return `#version 300 es
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;
}

function createShader(type, source) {
  const s = gl.createShader(type);
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "compile failed");
  return s;
}
function createProgram(vs, fs) {
  const v = createShader(gl.VERTEX_SHADER, vs), f = createShader(gl.FRAGMENT_SHADER, fs);
  const p = gl.createProgram();
  gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link failed");
  gl.deleteShader(v); gl.deleteShader(f);
  return p;
}

function encodeProgress(level) {
  const fill = Math.max(0, Math.min(250, Math.round(level * 250)));
  const hi = fill >> 4, lo = fill & 0xf;
  return [(0xf0 | (hi ^ lo ^ 0x5)) / 255, (0xb0 | hi) / 255, lo / 255, 1];
}

function drawFallbackTexture(now) {
  // Synthetic terminal rows (same pattern as the verified rig): if capture is
  // unavailable the hole still lenses readable colored text, like the demo gif.
  const w = fallbackCanvas.width, h = fallbackCanvas.height;
  const ctx = fallbackCtx;
  ctx.fillStyle = "#0c100e";
  ctx.fillRect(0, 0, w, h);
  const fontSize = Math.max(10, Math.floor(w / 118));
  const lineHeight = Math.floor(fontSize * 1.55);
  ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  ctx.textBaseline = "top";
  const snippets = [
    "DevChaos — screen capture unavailable, synthetic mode",
    "the deadline approaches, the void grows",
    "rest taken, the void recedes",
    "SLEEPY IS WATCHING YOUR TOKENS",
    "7 dwarfs stand between you and good prompts",
  ];
  const colors = ["#b8ffc1", "#d7ded8", "#98d7ff", "#ffcf70", "#ff8a70"];
  for (let y = 18, row = 0; y < h - 42; y += lineHeight, row += 1) {
    let line = "";
    let index = row;
    while (line.length < 180) {
      line += `${snippets[index % snippets.length]}   `;
      index += 1;
    }
    ctx.fillStyle = colors[row % colors.length];
    ctx.fillText(line, 16 + Math.sin(now / 900 + row) * 5, y);
  }
}

function render(now) {
  resize();
  // Coverage timeline: GROW ramps 0→1 toward deadline; RECEDE ramps 1→0 with rest.
  if (state.phase === "grow") {
    state.progress = Math.min(1, (now - state.phaseStart) / (GROW_SEC * 1000));
  } else if (state.phase === "recede") {
    state.progress = Math.max(0, 1 - (now - state.phaseStart) / (RECEDE_SEC * 1000));
  } else {
    state.progress = Math.max(0, state.progress - 0.01); // done: fade out remnants
  }
  setHum(state.progress);

  // While the void covers most of the screen, inputs are locked (it IS the lockout).
  // (The window is fullscreen+opaque; during recede <85% we re-enable passthrough so
  // the user can watch their screen return.)
  const lockInputs = state.progress > 0.85 && state.phase !== "done";
  window.devchaos?.passthrough(!lockInputs);

  gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
  if (state.captureReady && video.readyState >= video.HAVE_CURRENT_DATA) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
  } else {
    drawFallbackTexture(now);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fallbackCanvas);
  }

  const token = encodeProgress(state.progress);
  const d = new Date();
  // demo.gif motion: seed top-right corner, drift toward center as the void grows;
  // recede walks the same path home.
  const g = state.progress < 0.5 ? 2 * state.progress * state.progress : 1 - Math.pow(-2 * state.progress + 2, 2) / 2;
  const cx = 0.90 - 0.45 * g;
  const cy = 0.78 - 0.30 * g;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(locations.position);
  gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
  gl.uniform1i(locations.channel0, 0);
  gl.uniform3f(locations.resolution, canvas.width, canvas.height, 1);
  gl.uniform1f(locations.time, now / 1000);
  gl.uniform4f(locations.date, d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds());
  gl.uniform1f(locations.timeCursorChange, now / 1000);
  gl.uniform4fv(locations.currentCursorColor, token);
  gl.uniform4fv(locations.previousCursorColor, token);
  gl.uniform2f(locations.blackholeCenter, cx, cy);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  requestAnimationFrame(render);
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
    fallbackCanvas.width = w; fallbackCanvas.height = h;
    gl.viewport(0, 0, w, h);
  }
}

initGL().catch((e) => console.error("shader init failed:", e)).finally(async () => {
  await audioReady;
  requestAnimationFrame(render);
  run().catch(console.error);
});
