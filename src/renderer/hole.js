// HoleEngine — the black hole LIVES IN THE OVERLAY (Omar's architecture call):
// like the dwarf, it coexists with his real work. Transparent WebGL canvas:
// alpha = 0 everywhere except the hole's lensed region, so far from the void
// his actual screen shows through untouched. Grows toward the deadline while
// he works, recedes during rest. No fullscreen takeover window.
// Shader core: blackhole-timer port (MIT) + alpha-mask wrapper.

"use strict";

export const HoleEngine = {
  ready: false,
  active: false,
  _progress: 0,
  _phase: "idle", // idle | grow | recede
  _lock: false,
  onLockChange: null,
};

const AREA_MIN = 0.0045;
const AREA_MAX = 0.3000;
const MAX_DPR = 1.6;

const HOLE = HoleEngine;

let gl, program, locations, sceneTexture, buffer, video, fallbackCanvas, fallbackCtx;
let stream = null;
let humOsc = null, subOsc = null, humGain = null;

/* ---------- gravity hum ---------- */
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
function setHum(i) { if (humGain) humGain.gain.value = Math.min(0.35, i * 0.35); }
function stopHum() { try { humOsc?.stop(); subOsc?.stop(); humOsc = subOsc = humGain = null; } catch {} }

/* ---------- init ---------- */

export async function initHole(canvasEl, videoEl) {
  video = videoEl;
  gl = canvasEl.getContext("webgl2", { alpha: true, antialias: false, depth: false, premultipliedAlpha: true });
  if (!gl) throw new Error("WebGL2 unavailable in overlay");

  const raw = window.devchaos ? window.devchaos.shaderSource() : "";
  const patched = raw
    .replace("#define SIZE_MODE MODE_DEMO", "#define SIZE_MODE MODE_TOKENS")
    .replace("const float TOKEN_AREA_MIN = 0.0100;", `const float TOKEN_AREA_MIN = ${AREA_MIN.toFixed(4)};`)
    .replace("const float TOKEN_AREA_MAX = 0.5000;", `const float TOKEN_AREA_MAX = ${AREA_MAX.toFixed(4)};`)
    .replace("float shield = vis * smoothstep(WORK_AREA, WORK_AREA + 0.18, yUp);", "float shield = vis;")
    .replace(
      "center = (lo + hi) * 0.5 + wander * ampEff\n               + wobAmp * vec2(cos(t * 0.8), sin(t * 1.0));",
      "center = iBlackholeCenter;",
    )
    // Live 3D tumble: inclination + roll become uniforms driven from JS, so the
    // disk precesses like a real orbiting body instead of a flat ball.
    .replace("const float DISK_INCL     = 1.5000;", "uniform float DISK_INCL;")
    .replace("const float DISK_ROLL     = 0.3500;", "uniform float DISK_ROLL;")
    .replace(
      "const DiskLook LOOK_DEFAULT = DiskLook(\n    DISK_TEMP, DISK_INCL, DISK_ROLL, DISK_INNER, DISK_OUTER, DISK_OPACITY,\n    DOPPLER_MIX, DISK_BEAM, DISK_GAIN, DISK_CONTRAST, DISK_WIND, DISK_SPEED,\n    EXPOSURE, STAR_GAIN);",
      "#define LOOK_DEFAULT DiskLook(DISK_TEMP, DISK_INCL, DISK_ROLL, DISK_INNER, DISK_OUTER, DISK_OPACITY, DOPPLER_MIX, DISK_BEAM, DISK_GAIN, DISK_CONTRAST, DISK_WIND, DISK_SPEED, EXPOSURE, STAR_GAIN)",
    );

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
uniform vec2 u_holeCenter;
uniform float u_holeMaskRadius;
out vec4 outColor;
${patched}
void main() {
  mainImage(outColor, gl_FragCoord.xy);
  // Overlay alpha mask: transparent far from the void so Omar's real work
  // shows through; opaque inside the lensed region (disk reaches ~3x shadow).
  float d = length((gl_FragCoord.xy - u_holeCenter * iResolution.xy) / iResolution.y);
  float a = 1.0 - smoothstep(u_holeMaskRadius * 2.2, u_holeMaskRadius * 3.2, d);
  outColor = vec4(outColor.rgb * a, outColor.a * a);
}
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
    holeCenter: gl.getUniformLocation(program, "u_holeCenter"),
    holeMaskRadius: gl.getUniformLocation(program, "u_holeMaskRadius"),
    diskIncl: gl.getUniformLocation(program, "DISK_INCL"),
    diskRoll: gl.getUniformLocation(program, "DISK_ROLL"),
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

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied
  gl.clearColor(0, 0, 0, 0);

  fallbackCanvas = document.createElement("canvas");
  fallbackCtx = fallbackCanvas.getContext("2d", { alpha: false });

  HOLE.ready = true;
}

/* ---------- capture ---------- */

async function startCapture() {
  if (stream) return;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 30, max: 60 },
        width: { ideal: Math.round(screen.width * (window.devicePixelRatio || 1)) },
        height: { ideal: Math.round(screen.height * (window.devicePixelRatio || 1)) },
      },
      audio: false,
    });
    video.srcObject = stream;
    await video.play().catch(() => {});
  } catch { stream = null; }
}

function stopCapture() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  if (video) video.srcObject = null;
}

/* ---------- cycle ---------- */

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Mirror the shader's own sizing math so the alpha mask tracks the real hole
// radius: rhT = mix(sqrt(AREA_MIN*aspect/pi), sqrt(AREA_MAX*aspect/pi), g) * (HOLE_RADIUS/0.08)
function maskRadius(g) {
  const aspect = Math.max(0.5, gl.canvas.width / gl.canvas.height);
  const rhMin = Math.sqrt(AREA_MIN * aspect / Math.PI);
  const rhMax = Math.sqrt(AREA_MAX * aspect / Math.PI);
  return (rhMin + (rhMax - rhMin) * g) * (0.02 / 0.08);
}

function centerFor(g, t) {
  // Random spawn point anywhere in a safe margin, drifting home toward center
  // as it grows, plus a slow lissajous float so it never sits still.
  const fx = 0.035 * Math.sin(t * 0.43 + 1.7);
  const fy = 0.028 * Math.cos(t * 0.31 + 0.4);
  return [
    HOLE._seed[0] + (0.45 - HOLE._seed[0]) * g + fx,
    HOLE._seed[1] + (0.48 - HOLE._seed[1]) * g + fy,
  ];
}

function diskPose(t) {
  // Slow tumble: inclination sweeps edge-on (1.5 rad) toward face-on (~0.35 =
  // the "big black circle" view) and back; roll turns the whole system in the
  // screen plane. Feels like a floating 3D body, not a resizing ball.
  const w = HOLE._tumbleW;
  const incl = 0.925 + 0.575 * Math.sin(t * w + HOLE._tumblePhase);
  const roll = t * 0.22 + HOLE._tumblePhase;
  return [incl, roll];
}

export function runHoleCycle({ growSec = 8, recedeSec = 12, onPeak, onRecedeStart, onDone } = {}) {
  if (!HOLE.ready || HOLE.active) return false;
  HOLE.active = true;
  HOLE._phase = "grow";
  // Random spawn: anywhere in the middle 60% of the screen.
  HOLE._seed = [0.2 + Math.random() * 0.6, 0.22 + Math.random() * 0.56];
  HOLE._tumblePhase = Math.random() * Math.PI * 2;
  HOLE._tumbleW = (Math.PI * 2) / Math.max(14, growSec + recedeSec); // ~one tumble per cycle
  const t0 = performance.now();
  startHum();
  startCapture(); // async; fallback texture covers until frames arrive

  const step = (now) => {
    if (!HOLE.active) return;
    const el = (now - t0) / 1000;
    let p;
    if (HOLE._phase === "grow") {
      p = Math.min(1, el / growSec);
      if (p >= 1 && !HOLE._peaked) {
        HOLE._peaked = true;
        HOLE._peakAt = now;
        onPeak?.();
      }
      // NO dead hold: the instant growth tops out, the turn-around begins.
      if (p >= 1) {
        HOLE._phase = "recede";
        HOLE._recedeStart = now;
        onRecedeStart?.();
      }
    } else if (HOLE._phase === "recede") {
      p = Math.max(0, 1 - (now - HOLE._recedeStart) / (recedeSec * 1000));
      if (p <= 0) {
        endCycle(onDone);
        return;
      }
    }
    HOLE._progress = p;
    setHum(p);
    setLock(p > 0.85 && HOLE._phase !== "recede");
    render(now, p);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return true;
}

function endCycle(onDone) {
  HOLE.active = false;
  HOLE._phase = "idle";
  HOLE._peaked = false;
  HOLE._progress = 0;
  setLock(false);
  stopHum();
  stopCapture();
  gl.clear(gl.COLOR_BUFFER_BIT);
  onDone?.();
}

function setLock(v) {
  if (v === HOLE._lock) return;
  HOLE._lock = v;
  HOLE.onLockChange?.(v);
}

/* ---------- render ---------- */

function encodeProgress(level) {
  const fill = Math.max(0, Math.min(250, Math.round(level * 250)));
  const hi = fill >> 4, lo = fill & 0xf;
  return [(0xf0 | (hi ^ lo ^ 0x5)) / 255, (0xb0 | hi) / 255, lo / 255, 1];
}

function resize() {
  const c = gl.canvas;
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const w = Math.max(1, Math.floor(c.clientWidth * dpr));
  const h = Math.max(1, Math.floor(c.clientHeight * dpr));
  if (c.width !== w || c.height !== h) {
    c.width = w; c.height = h;
    fallbackCanvas.width = w; fallbackCanvas.height = h;
    gl.viewport(0, 0, w, h);
  }
}

function render(now, progress) {
  resize();
  const ts = now / 1000;
  const g = easeInOut(progress);
  const [cx, cy] = centerFor(g, ts);
  const [incl, roll] = diskPose(ts);

  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
  if (stream && video && video.readyState >= video.HAVE_CURRENT_DATA) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
  } else {
    drawFallback(now);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fallbackCanvas);
  }

  const token = encodeProgress(progress);
  const d = new Date();
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(locations.position);
  gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
  gl.uniform1i(locations.channel0, 0);
  gl.uniform3f(locations.resolution, gl.canvas.width, gl.canvas.height, 1);
  gl.uniform1f(locations.time, now / 1000);
  gl.uniform4f(locations.date, d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds());
  gl.uniform1f(locations.timeCursorChange, now / 1000);
  gl.uniform4fv(locations.currentCursorColor, token);
  gl.uniform4fv(locations.previousCursorColor, token);
  gl.uniform2f(locations.blackholeCenter, cx, cy);
  gl.uniform2f(locations.holeCenter, cx, cy);
  gl.uniform1f(locations.holeMaskRadius, maskRadius(g));
  gl.uniform1f(locations.diskIncl, incl);
  gl.uniform1f(locations.diskRoll, roll);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function drawFallback(now) {
  // Synthetic lensed content for when capture is unavailable — the hole still
  // bends readable colored text instead of nothing.
  const w = fallbackCanvas.width, h = fallbackCanvas.height;
  const ctx = fallbackCtx;
  ctx.fillStyle = "#0c100e";
  ctx.fillRect(0, 0, w, h);
  if (w < 4) return;
  const fontSize = Math.max(10, Math.floor(w / 118));
  const lineHeight = Math.floor(fontSize * 1.55);
  ctx.font = `${fontSize}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textBaseline = "top";
  const snippets = [
    "the void grows while you work",
    "rest taken, the void recedes",
    "SLEEPY IS WATCHING YOUR TOKENS",
    "DevChaos synthetic mode",
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

/* ---------- gl helpers (ported from blackhole-timer, MIT) ---------- */

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
