// Standalone black hole test rig — adapted from blackhole-timer (MIT) desktop-renderer.
// Changes: grow/recede cycle mode, corner-seed center path (demo.gif look),
// live max-area slider (shader recompile), debug handle windowBH.
const canvas = document.querySelector("#blackhole");
const video = document.querySelector("#capture");
const panel = document.querySelector(".panel");
const hostLabel = document.querySelector("#hostLabel");
const statusEl = document.querySelector("#status");
const meterFill = document.querySelector("#meterFill");
const intensityLabel = document.querySelector("#intensityLabel");
const elapsedLabel = document.querySelector("#elapsedLabel");
const fpsLabel = document.querySelector("#fpsLabel");
const captureButton = document.querySelector("#captureButton");
const passthroughButton = document.querySelector("#passthroughButton");
const resetButton = document.querySelector("#resetButton");
const thresholdInput = document.querySelector("#thresholdInput");
const thresholdLabel = document.querySelector("#thresholdLabel");
const speedInput = document.querySelector("#speedInput");
const strengthInput = document.querySelector("#strengthInput");
const strengthLabel = document.querySelector("#strengthLabel");
const areaInput = document.querySelector("#areaInput");
const areaLabel = document.querySelector("#areaLabel");
const homeInput = document.querySelector("#homeInput");

const params = new URLSearchParams(window.location.search);
const hostName = params.get("host") || detectHost();
const autoStart = params.get("autostart") === "1";
const demoMode = params.get("demo") === "1";
const debugRaw = params.get("debugraw") === "1";
const MAX_DPR = 1.6;

hostLabel.textContent = hostName === "electron" ? "DevChaos standalone" : "Browser standalone";

const gl = canvas.getContext("webgl2", {
  alpha: false,
  antialias: false,
  depth: false,
  preserveDrawingBuffer: false,
});

if (!gl) {
  setStatus("WebGL2 unavailable");
  throw new Error("WebGL2 is unavailable");
}

const fallbackCanvas = document.createElement("canvas");
const fallbackCtx = fallbackCanvas.getContext("2d", { alpha: false });
const state = {
  running: false,
  captureReady: false,
  passthrough: false,
  elapsed: 0,
  lastFrameAt: performance.now(),
  cycleSec: Number(thresholdInput.value),
  speed: Number(speedInput.value),
  strength: Number(strengthInput.value),
  maxArea: Number(areaInput.value),
  homeSeed: homeInput.checked,
  centerX: 0.5,
  centerY: 0.5,
  frames: 0,
  fpsStartedAt: performance.now(),
  fps: 0,
};

let program;
let locations;
let sceneTexture;
let buffer;
let stream = null;

init().catch((error) => {
  console.error(error);
  setStatus(error instanceof Error ? error.message : String(error));
});

async function init() {
  program = createProgram(vertexShaderSource(), await loadPatchedShader(state.maxArea));
  cacheLocations();

  buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );

  sceneTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  installListeners();
  if (debugRaw) {
    // Show the raw capture stream in a corner thumbnail so capturePage snaps
    // reveal whether the VIDEO itself carries frames or is black.
    video.style.cssText = "position:fixed;right:12px;top:12px;width:320px;height:180px;object-fit:contain;background:#000;border:2px solid #ff0;z-index:99;opacity:1;";
  }
  setStatus(demoMode ? "Demo texture" : "Ready");
  requestAnimationFrame(render);

  if (autoStart || demoMode) {
    await startCapture();
  }
}

function cacheLocations() {
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
}

function installListeners() {
  captureButton.addEventListener("click", () => {
    if (stream) {
      stopCapture();
    } else {
      startCapture();
    }
  });

  passthroughButton.addEventListener("click", () => {
    setPassthrough(!state.passthrough);
  });

  resetButton.addEventListener("click", () => {
    state.elapsed = 0;
    state.lastFrameAt = performance.now();
  });

  thresholdInput.addEventListener("input", () => {
    state.cycleSec = Number(thresholdInput.value);
    thresholdLabel.textContent = `${state.cycleSec} s`;
  });

  speedInput.addEventListener("change", () => {
    state.speed = Number(speedInput.value);
  });

  strengthInput.addEventListener("input", () => {
    state.strength = Number(strengthInput.value);
    strengthLabel.textContent = `${state.strength.toFixed(2)}x`;
  });

  areaInput.addEventListener("input", () => {
    state.maxArea = Number(areaInput.value);
    areaLabel.textContent = state.maxArea.toFixed(2);
  });
  areaInput.addEventListener("change", async () => {
    await rebuildProgram();
  });

  homeInput.addEventListener("change", () => {
    state.homeSeed = homeInput.checked;
  });

  window.addEventListener("resize", resize);
  window.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.altKey && event.key.toLowerCase() === "b") {
      setPassthrough(!state.passthrough);
    }
  });

  window.chrome?.webview?.addEventListener?.("message", (event) => {
    if (event.data?.type === "blackhole:passthrough") {
      applyPassthroughState(Boolean(event.data.enabled));
    }
  });

  window.blackholeHost?.onPassthroughChanged?.((enabled) => {
    applyPassthroughState(enabled);
  });

  thresholdLabel.textContent = `${state.cycleSec} s`;
  strengthLabel.textContent = `${state.strength.toFixed(2)}x`;
  areaLabel.textContent = state.maxArea.toFixed(2);
}

async function rebuildProgram() {
  const next = createProgram(vertexShaderSource(), await loadPatchedShader(state.maxArea));
  gl.deleteProgram(program);
  program = next;
  cacheLocations();
  setStatus(`Rebuilt @ area ${state.maxArea.toFixed(2)}`);
}

async function startCapture() {
  if (demoMode) {
    state.running = true;
    state.captureReady = false;
    captureButton.textContent = "Demo Running";
    setStatus("Demo");
    return;
  }

  try {
    setStatus("Requesting screen");
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 30, max: 60 },
        width: { ideal: Math.round(screen.width * (window.devicePixelRatio || 1)) },
        height: { ideal: Math.round(screen.height * (window.devicePixelRatio || 1)) },
      },
      audio: false,
    });

    stream = displayStream;
    video.srcObject = displayStream;
    await video.play();

    const [track] = displayStream.getVideoTracks();
    track.addEventListener("ended", stopCapture, { once: true });
    console.log(`[rig] capture stream: ${video.videoWidth}x${video.videoHeight} settings=${JSON.stringify(track.getSettings())}`);
    state.captureReady = true;
    state.running = true;
    captureButton.textContent = "Stop Capture";
    setStatus("Capturing");
  } catch (error) {
    state.captureReady = false;
    stream = null;
    setStatus(error instanceof Error ? error.message : "Capture failed");
  }
}

function stopCapture() {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
  state.captureReady = false;
  state.running = false;
  captureButton.textContent = "Start Capture";
  setStatus(demoMode ? "Demo texture" : "Ready");
}

function cycleProgress() {
  const cyc = Math.max(2, state.cycleSec);
  const t = state.elapsed % (cyc * 2);
  return t < cyc ? t / cyc : 1 - (t - cyc) / cyc;
}

function render(now) {
  resize();
  const dt = Math.min((now - state.lastFrameAt) / 1000, 0.2);
  state.lastFrameAt = now;
  if (state.running) {
    state.elapsed += dt * state.speed;
  }

  const progress = clamp01(cycleProgress() * state.strength);
  const age = now / 1000;

  if (state.homeSeed) {
    // demo.gif path: seed top-right corner, drift toward center as it grows
    const g = easeInOut(progress);
    state.centerX = 0.90 - 0.45 * g;
    state.centerY = 0.78 - 0.30 * g;
  } else {
    const reach = 0.08 + progress * 0.2;
    state.centerX = clamp(0.62 + Math.sin(age * 0.19) * reach + Math.sin(age * 0.047) * reach * 0.35, 0.16, 0.84);
    state.centerY = clamp(0.52 + Math.cos(age * 0.16) * reach * 0.58 + Math.sin(age * 0.071) * reach * 0.28, 0.18, 0.82);
  }

  updateTexture(now, progress);
  drawBlackhole(now, progress);
  updateReadout(progress, now);
  requestAnimationFrame(render);
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function updateTexture(now, progress) {
  gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
  if (state.captureReady && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    return;
  }

  drawFallbackTexture(now, progress);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fallbackCanvas);
}

function drawBlackhole(now, progress) {
  const tokenColor = encodeTokenColor(progress);
  const date = new Date();
  const secondsToday = date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(locations.position);
  gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
  gl.uniform1i(locations.channel0, 0);
  gl.uniform3f(locations.resolution, canvas.width, canvas.height, 1);
  gl.uniform1f(locations.time, now / 1000);
  gl.uniform4f(locations.date, date.getFullYear(), date.getMonth() + 1, date.getDate(), secondsToday);
  gl.uniform1f(locations.timeCursorChange, now / 1000);
  gl.uniform4fv(locations.currentCursorColor, tokenColor);
  gl.uniform4fv(locations.previousCursorColor, tokenColor);
  gl.uniform2f(locations.blackholeCenter, state.centerX, state.centerY);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    fallbackCanvas.width = width;
    fallbackCanvas.height = height;
    gl.viewport(0, 0, width, height);
  }
}

function drawFallbackTexture(now, progress) {
  const w = fallbackCanvas.width;
  const h = fallbackCanvas.height;
  const ctx = fallbackCtx;
  ctx.fillStyle = "#0c100e";
  ctx.fillRect(0, 0, w, h);

  const fontSize = Math.max(10, Math.floor(w / 118));
  const lineHeight = Math.floor(fontSize * 1.55);
  ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  ctx.textBaseline = "top";
  const snippets = [
    "DevChaos standalone rig — synthetic terminal until live capture",
    "deadline pressure mounts, the hole grows",
    "rest taken, the void recedes",
    "7 dwarfs incoming",
    `focus pressure ${Math.round(progress * 100)}%`,
    "the hole warps what is behind it",
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

async function loadPatchedShader(maxArea) {
  const source = await fetchShaderText();
  const patched = source
    .replace("#define SIZE_MODE MODE_DEMO", "#define SIZE_MODE MODE_TOKENS")
    .replace("const float TOKEN_AREA_MIN = 0.0100;", "const float TOKEN_AREA_MIN = 0.0045;")
    .replace("const float TOKEN_AREA_MAX = 0.5000;", `const float TOKEN_AREA_MAX = ${maxArea.toFixed(4)};`)
    .replace(
      "float shield = vis * smoothstep(WORK_AREA, WORK_AREA + 0.18, yUp);",
      "float shield = vis;",
    )
    .replace(
      "center = (lo + hi) * 0.5 + wander * ampEff\n               + wobAmp * vec2(cos(t * 0.8), sin(t * 1.0));",
      "center = iBlackholeCenter;",
    );

  return `#version 300 es
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

void main() {
  mainImage(outColor, gl_FragCoord.xy);
}
`;
}

async function fetchShaderText() {
  const candidates = ["/src/blackhole-port.frag", "../src/blackhole-port.frag", "./src/blackhole-port.frag"];
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, { cache: "no-store" });
      if (response.ok) {
        return response.text();
      }
    } catch {
      // Try the next host path.
    }
  }
  throw new Error("Unable to load /src/blackhole-port.frag");
}

function vertexShaderSource() {
  return `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;
}

function createShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(message || "Shader compile failed");
  }
  return shader;
}

function createProgram(vertexSource, fragmentSource) {
  const vertex = createShader(gl.VERTEX_SHADER, vertexSource);
  const fragment = createShader(gl.FRAGMENT_SHADER, fragmentSource);
  const linkedProgram = gl.createProgram();
  gl.attachShader(linkedProgram, vertex);
  gl.attachShader(linkedProgram, fragment);
  gl.linkProgram(linkedProgram);
  if (!gl.getProgramParameter(linkedProgram, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(linkedProgram);
    gl.deleteShader(linkedProgram);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    throw new Error(message || "Program link failed");
  }
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  return linkedProgram;
}

function encodeTokenColor(level) {
  const fill = Math.max(0, Math.min(250, Math.round(level * 250)));
  const hi = fill >> 4;
  const lo = fill & 0xf;
  return [(0xf0 | (hi ^ lo ^ 0x5)) / 255, (0xb0 | hi) / 255, lo / 255, 1];
}

function updateReadout(progress, now) {
  intensityLabel.textContent = `${Math.round(progress * 100)}%`;
  elapsedLabel.textContent = `${Math.floor(state.elapsed)}s`;
  meterFill.style.width = `${progress * 100}%`;
  state.frames += 1;
  if (now - state.fpsStartedAt >= 800) {
    state.fps = Math.round((state.frames * 1000) / (now - state.fpsStartedAt));
    state.frames = 0;
    state.fpsStartedAt = now;
    fpsLabel.textContent = String(state.fps);
  }
}

function setStatus(text) {
  statusEl.textContent = text.length > 28 ? `${text.slice(0, 25)}...` : text;
  statusEl.title = text;
}

function setPassthrough(enabled) {
  window.blackholeHost?.setPassthrough?.(enabled);
  if (window.chrome?.webview) {
    window.chrome.webview.postMessage({ type: "blackhole:set-passthrough", enabled });
  }
  applyPassthroughState(enabled);
}

function applyPassthroughState(enabled) {
  state.passthrough = enabled;
  panel.classList.toggle("is-pass-through", enabled);
  passthroughButton.textContent = enabled ? "Interactive" : "Pass Through";
}

function detectHost() {
  if (window.blackholeHost) {
    return "electron";
  }
  if (window.chrome?.webview) {
    return "webview2";
  }
  return "browser";
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// devtools handle: windowBH.cycle(16), windowBH.area(0.35), windowBH.progress()
window.BH = {
  cycle(sec) {
    state.cycleSec = Math.max(2, Number(sec) || 16);
    thresholdInput.value = state.cycleSec;
    thresholdLabel.textContent = `${state.cycleSec} s`;
    return state.cycleSec;
  },
  area(a) {
    state.maxArea = Math.min(0.5, Math.max(0.05, Number(a) || 0.3));
    areaInput.value = state.maxArea;
    areaLabel.textContent = state.maxArea.toFixed(2);
    rebuildProgram();
    return state.maxArea;
  },
  progress() {
    return cycleProgress();
  },
  freeze() {
    state.running = false;
  },
  unfreeze() {
    state.running = true;
    state.lastFrameAt = performance.now();
  },
};
