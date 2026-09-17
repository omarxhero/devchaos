// App orchestrator v2: everything lives in the draggable dialogue panel.
// IDE prompts get scored and roasted; the manual box is ordinary conversation.
// Deadline chip → black hole.

"use strict";

import { analyze } from "../brain/scorer.js";
import { get, ORDER } from "../brain/personalities.js";
import * as canned from "../brain/canned.js";
import * as memory from "../brain/memory.js";
import { offlineReply } from "../brain/conversation.js";

const $ = (id) => document.getElementById(id);
const dwarfEngine = window.DEVCHAOS_DWARF;

let session = null;
let memoryState = memory.create();
let roastometer = 50;
let config = { demo: false, breakMinutes: 180, breakDurationMinutes: 30, voiceOn: true };
let breakStartedAt = null;
let hole = null; // overlay-native black hole engine (./hole.js)

function applyConfig(next) {
  const timingChanged = config.demo !== next.demo || config.breakMinutes !== next.breakMinutes;
  config = next;
  if (window.DEVCHAOS_SFX) window.DEVCHAOS_SFX.volume = config.volume ?? 0.7;
  if (timingChanged && !window.__breaking) window.__resetDeadline?.();
}

async function boot() {
  if (window.devchaos) {
    let receivedChange = false;
    window.devchaos.onConfigChanged?.((next) => { receivedChange = true; applyConfig(next); });
    const initial = await window.devchaos.getConfig();
    if (!receivedChange) applyConfig(initial);
    session = await window.devchaos.sessionGet();
    if (session && session.memory) memoryState = session.memory;
  }

  // The black hole lives HERE, in the overlay, over the real work — like the dwarf.
  try {
    hole = await import("./hole.js");
    await hole.initHole($("hole"), $("holevid"));
    hole.HoleEngine.onLockChange = (locked) => {
      window.__holeLock = locked;
      window.devchaos?.passthrough(!locked);
    };
  } catch (e) {
    console.warn("hole engine unavailable — falling back to break window:", e);
    hole = null;
  }

  buildCycleButton();
  wireDialogue();
  wireIslands();
  startDeadlineTimer();
  startClockWatch();
  startIdleLife();
  setInterval(persistSession, 8000);
  window.devchaos?.onHoleRun?.(() => triggerBreak());
  window.devchaos?.onBreakEnded?.(() => { if (window.__breaking) breakEnded(); });

  // 🎧 IDE listening: visible toggle + captured prompts run the same pipeline.
  // Debounced (800ms); the chip UI is ALSO re-synced from main every 3s, so
  // whatever happens, the label can never drift from the real state.
  const listenChip = $("listen-chip");
  const paintListen = (on) => {
    listenChip.classList.toggle("on", on);
    listenChip.setAttribute("aria-pressed", String(on));
    $("listen-label").textContent = on ? "IDE: ON" : "IDE: OFF";
    dwarfEngine.el.classList.toggle("listening", on);
  };
  let lastToggleAt = 0;
  listenChip.onclick = async () => {
    const now = performance.now();
    if (now - lastToggleAt < 800) return;
    lastToggleAt = now;
    const next = !(await window.devchaos.getListening());
    paintListen(next);
    window.devchaos?.setListening(next);
  };
  $("settings-chip").onclick = () => window.devchaos?.openSettings?.();
  window.devchaos?.onIdePrompt?.(({ text }) => submitText(text, { source: "ide" }));
  let lastListenAnnounced = null;
  setInterval(async () => {
    if (!window.devchaos?.getListening) return;
    const on = await window.devchaos.getListening();
    paintListen(on);
    if (on !== lastListenAnnounced) {
      lastListenAnnounced = on;
      chatPush("dwarf", on
        ? "🎧 L-listener ON. Bjarreb el2ot l-prompts men nawafez l-AI li ba3refa."
        : "🎧 L-listener OFF. Halla2 bkhalle l-keyboard la7alo.");
      if (on) quip("\u{1F3A7} L-listener sheghghal. Dall 3aynak 3al chip.");
    }
  }, 3000);

  dwarfEngine.setDwarf(dwarfEngine.id, { poof: false });
  dwarfEngine.setState("walk");
  setTimeout(() => quip("Ne7na l-prompt dwarfs. Farjina shu 3andak!"), 1000);

  updateMoodUI();
  chatPush("dwarf", "Ahla! Hon fina ne7ke sawa bala ta2yim. L-prompts li btekteba bel-IDE henne li bya5do score.");
}
window.addEventListener("DOMContentLoaded", boot);

/* ---------------- chat panel ---------------- */

function chatPush(kind, text, { tier } = {}) {
  const chat = $("chat");
  const div = document.createElement("div");
  if (kind === "user") { div.className = "chat-user"; div.textContent = text; }
  else if (kind === "dwarf") { div.className = "chat-dwarf"; div.textContent = text; }
  else if (kind === "score") {
    div.className = `chat-score tier-${tier}`;
    div.innerHTML = `<span class="num"></span><span class="lbl"></span>`;
    div.querySelector(".num").textContent = text;
    div.querySelector(".lbl").textContent = arguments[3] || "";
  }
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  while (chat.children.length > 40) chat.removeChild(chat.firstChild);
  return div;
}

function openDialogue() { $("dialogue").classList.remove("hidden"); }

/* ---------------- quip bubble (typewriter + gibberish) ---------------- */

function quip(text, lebanese = null) {
  const bubble = $("bubble"), span = $("bubble-text");
  clearTimeout(window.__bubbleHideTimer);
  bubble.classList.remove("hidden");
  span.innerHTML = "";
  if (lebanese) {
    const lb = document.createElement("span");
    lb.className = "lb-line";
    lb.textContent = lebanese;
    span.appendChild(lb);
  }
  const main = document.createElement("span");
  span.appendChild(main);

  const dwarf = get(dwarfEngine.id);
  const vp = window.DEVCHAOS_VOICE ? window.DEVCHAOS_VOICE.paramsFor(dwarf) : null;
  let i = 0;
  clearInterval(window.__bubbleTimer);
  dwarfEngine.setState("talk");

  window.__bubbleTimer = setInterval(() => {
    if (i >= text.length) {
      clearInterval(window.__bubbleTimer);
      window.__bubbleHideTimer = setTimeout(() => { bubble.classList.add("hidden"); if (dwarfEngine.state === "talk") dwarfEngine.setState("idle"); }, 4600);
      return;
    }
    const ch = text[i++];
    main.textContent += ch;
    if (config.voiceOn !== false && vp && window.DEVCHAOS_VOICE) window.DEVCHAOS_VOICE.blip(ch, vp);
    positionBubble();
  }, 34);
}

function positionBubble() {
  const bubble = $("bubble");
  const r = dwarfEngine.rect();
  const x = Math.min(Math.max(12, r.left - 40), window.innerWidth - 320);
  const y = Math.max(12, r.top - 100);
  bubble.style.left = x + "px";
  bubble.style.top = y + "px";
}

/* ---------------- prompt flow (single input, dual-dispatch) ---------------- */

async function submitPrompt() {
  const input = $("prompt");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  submitText(text, { source: "bar" });
}

const pendingInputs = [];
const conversationHistory = new Map();
function submitText(text, { source = "bar", dwarfId = dwarfEngine.id } = {}) {
  if (window.__submitting) { pendingInputs.push({ text, source, dwarfId }); return; }
  window.__submitting = true;
  const respond = source === "ide" ? reactToPrompt : converse;
  respond(text, source, dwarfId)
    .catch(() => chatPush("dwarf", "Ma zabtet hal marra. Jarrib marra tenye."))
    .finally(() => {
      window.__submitting = false;
      const next = pendingInputs.shift();
      if (next) submitText(next.text, next);
    });
}

async function converse(text, _source, dwarfId) {
  openDialogue();
  chatPush("user", text);
  $("docbox").classList.add("hidden");
  const history = conversationHistory.get(dwarfId) || [];
  const replyDiv = chatPush("dwarf", "La7za...");
  const result = await window.devchaos?.chat?.({ message: text, dwarfId, history }).catch(() => null);
  const reply = result?.reply || offlineReply(text, dwarfId, result?.error);
  if (result?.source === "llm") conversationHistory.set(dwarfId, [...history,
    { role: "user", content: text.slice(0, 1000) },
    { role: "assistant", content: reply.slice(0, 1000) },
  ].slice(-10));
  replyDiv.textContent = reply;
  $("chat").scrollTop = $("chat").scrollHeight;
  if (dwarfEngine.id === dwarfId) quip(shorten(reply));
}

async function reactToPrompt(text, source, dwarfId = dwarfEngine.id) {
  openDialogue(); // auto-pop on every submission
  const userDiv = chatPush("user", text);
  if (source === "ide") userDiv.textContent = "\u{1F3A7} " + text; // proof it was heard, not typed

  const dwarf = get(dwarfId);

  if (dwarf.id === "sneezy") {
    window.DEVCHAOS_SFX?.play("sneeze", { volume: 0.9 });
    dwarfEngine.setState("panic", { holdMs: 900 });
    chatPush("dwarf", "(ACHOO! Ma tkhaf, l-prompt ba3do metel ma katabto.)");
  }

  const scored = analyze(text);
  window.__lastPrompt = text;        // Doc "help me" works on the ORIGINAL ask
  window.__lastScored = scored;
  const roastTier = tierFromRoastometer(scored.tier);
  memory.record(memoryState, {
    text, score: scored.score, tier: scored.tier, dwarf: dwarf.id,
    vague: scored.issues.some((i) => /vague|lazy|empty/.test(i.type)),
  });
  persistSession();
  updateMoodUI();

  // instant score card INSIDE the dialogue
  chatPush("score", `${scored.score}/10`, { tier: roastTier }, scored.label);
  if (scored.score <= 1) {
    // total meltdown: alarm + long panic — the dwarf cannot believe this
    window.DEVCHAOS_SFX?.play("alarm", { volume: 0.8 });
    window.DEVCHAOS_SFX?.play("stamp", { volume: 0.9 });
    dwarfEngine.setState("panic", { holdMs: 2400 });
  } else {
    window.DEVCHAOS_SFX?.play(roastTier === "savage" ? "stamp" : "blip", { volume: 0.8 });
    dwarfEngine.setState(scored.score <= 3 ? "panic" : scored.score >= 8 ? "victory" : "think", { holdMs: 1500 });
  }

  // roast: LLM via main (key never here) → canned fallback
  let line = null, refactored = null;
  if (window.devchaos) {
    const res = await window.devchaos.roast({
      prompt: text, scored, dwarf, roastometer,
      digest: memory.memoryDigest(memoryState),
    }).catch(() => null);
    if (res) { line = res.roast; refactored = res.refactored; }
  }
  if (!line) line = canned.pickRoast(dwarf.id, roastTier);
  if (!refactored && scored.score <= 6) refactored = quickRefactor(text, scored);

  const roastDiv = chatPush("dwarf", "");
  typeInto(roastDiv, line);            // typewriter + voice in the panel
  quip(shorten(line), canned.maybeLebanese(0.18, dwarf.id, roastTier));  // + quip bubble over the dwarf

  if (refactored) showDocBox(refactored);
  fireTriggers();
}

function typeInto(div, text) {
  const dwarf = get(dwarfEngine.id);
  const vp = window.DEVCHAOS_VOICE ? window.DEVCHAOS_VOICE.paramsFor(dwarf) : null;
  let i = 0;
  clearInterval(div._t);
  div._t = setInterval(() => {
    if (i >= text.length) return clearInterval(div._t);
    const ch = text[i++];
    div.textContent += ch;
    if (config.voiceOn !== false && vp && window.DEVCHAOS_VOICE) window.DEVCHAOS_VOICE.blip(ch, vp);
    const chat = $("chat");
    chat.scrollTop = chat.scrollHeight;
  }, 30);
}

function shorten(text) { return text.length > 90 ? text.slice(0, 88) + "..." : text; }

function tierFromRoastometer(scoredTier) {
  if (roastometer >= 65) return "savage";
  if (roastometer <= 35) return "mild";
  return scoredTier;
}

function quickRefactor(text, scored) {
  const fixes = scored.issues.map((i) => i.fix).slice(0, 2).join("; ");
  return `${text.trim().replace(/[.!?]+$/, "")} — [ADD: language/file${fixes ? "; " + fixes.toLowerCase() : ""}; expected behavior; one constraint]`;
}

function showDocBox(refactored) {
  $("docbox-prompt").textContent = refactored;
  $("docbox").classList.remove("hidden");
}

function showIdeasBox(ideas) {
  $("docbox-prompt").innerHTML = ideas
    .map((x, i) => `<div style="margin:4px 0"><b>${i + 1})</b> ${x.replace(/</g, "&lt;")}</div>`)
    .join("");
  $("docbox").classList.remove("hidden");
  $("docbox-copy").textContent = "COPY FOR YOUR AI";
}

/* ---------------- triggers ---------------- */

function fireTriggers() {
  const s = memoryState.stats;
  if (s.vagueStreak >= 3 && dwarfEngine.id === "grumpy") {
    chatPush("dwarf", canned.pickTrigger("vague_streak"));
    quip("TLETE prompts bala details. Ana fellet. DOPEY! Khod ma7alle!");
    // storm-off: he SPRINTS off the screen, then Dopey poofs in
    dwarfEngine.stormOff(() => {
      setActiveDwarf("dopey");
    });
    s.vagueStreak = 0;
  } else if (s.crashStreak >= 3 && dwarfEngine.id !== "happy") {
    chatPush("dwarf", canned.pickTrigger("score_crash"));
    setTimeout(() => setActiveDwarf("happy"), 2400);
    s.crashStreak = 0;
  } else if (s.count >= 4 && s.count % 4 === 0) {
    const d = memory.memoryDigest(memoryState);
    const line = canned.pickTrigger("memory_callback", { worst: `"${d.worstText.slice(0, 24)}"`, avg: d.avg, trend: "the same" });
    chatPush("dwarf", line);
  }
}

/* ---------------- idle life: quips + AFK nap ---------------- */

let lastActivity = Date.now();
let napping = false;

function wakeUp() {
  lastActivity = Date.now();
  if (napping) {
    napping = false;
    dwarfEngine.setState("panic", { holdMs: 700 });
    quip("ANA FEYE2. ANA FEYE2!");
  }
}

function startIdleLife() {
  ["mousemove", "mousedown", "keydown"].forEach((ev) =>
    window.addEventListener(ev, wakeUp, { passive: true }));
  $("prompt").addEventListener("focus", wakeUp);

  setInterval(() => {
    if (window.__breaking || !dwarfEngine) return;
    const idleMs = Date.now() - lastActivity;

    if (idleMs > 120_000) {
      // AFK: the dwarf gives up and naps
      if (!napping && dwarfEngine.state !== "sleep") {
        napping = true;
        dwarfEngine.setState("sleep");
        quip("...zzz... wa33ine bas yje l-prompt...");
      }
      return;
    }
    if (napping) return; // only activity wakes him

    // idle flavour: occasional per-dwarf quip when nothing is happening
    const bubble = document.getElementById("bubble");
    const bubbleBusy = bubble && !bubble.classList.contains("hidden");
    if (!bubbleBusy && dwarfEngine.state !== "sleep" && Math.random() < 0.4) {
      const d = get(dwarfEngine.id);
      if (d.quips && d.quips.length) quip(d.quips[Math.floor(Math.random() * d.quips.length)]);
    }
  }, 45_000);
}

/* ---------------- hats / mood / leaderboard ---------------- */

// The header color chip cycles through the seven dwarfs: one click = next dwarf.
function buildCycleButton() {
  const btn = $("dwarf-cycle");
  btn.style.background = get(dwarfEngine.id).color;
  btn.onclick = () => setActiveDwarf(ORDER[(ORDER.indexOf(dwarfEngine.id) + 1) % ORDER.length]);
}

function setActiveDwarf(id) {
  const d = get(id);
  dwarfEngine.setDwarf(id);
  window.devchaos?.activeDwarf(id);
  $("dialogue-title").textContent = `${d.name.toUpperCase()} — ${d.job.toUpperCase()}`;
  $("dialogue").style.setProperty("--hat", d.color);
  $("dwarf-cycle").style.background = d.color;
  quip(entranceLine(id));
}

function entranceLine(id) {
  return {
    doc: "Ana Doc. Shu baddak ne7ke lyom?",
    grumpy: "Shu. SHU baddak halla2?",
    happy: "ANA EJET! W JEBET L-7AMAS MA3E!",
    sleepy: "...mmh. khams d2aye2 ba3d... tayyeb, farjine...",
    sneezy: "ah... AH... 3tine l-prompt... shway shway...",
    bashful: "Euh... mar7aba... ra7 jarrib se3dak...",
    dopey: "ANA HON! Shu 3am na3mol?! 3AJABNE!",
  }[id] || "...";
}

function updateMoodUI() {
  const band = memory.moodBand(memoryState);
  const fill = $("mood-fill");
  fill.style.width = Math.round(memoryState.mood * 100) + "%";
  if (band === "sick") dwarfEngine.setState("sick", { holdMs: 4000 });
}

function showLeaderboard() {
  const lb = memory.leaderboard(memoryState);
  $("lb-rows").innerHTML = `
    <div>roasts received: <b>${lb.roasts}</b></div>
    <div>worst prompt: <b>${lb.worst}</b></div>
    <div>average score: <b>${lb.avg}</b></div>
    <div>time lost to black holes: <b>${lb.blackHoleMinutes} min</b></div>
    <div>favorite dwarf: <b>${lb.favoriteDwarf}</b></div>
    <div>dwarf mood: <b>${lb.moodPercent}%</b></div>`;
  $("leaderboard").classList.remove("hidden");
  window.DEVCHAOS_SFX?.play("victory", { volume: 0.7 });
  setTimeout(() => $("leaderboard").classList.add("hidden"), 6500);
}

/* ---------------- deadline chip (black hole schedule) ---------------- */

function startDeadlineTimer() {
  const minutes = config.demo ? 0.75 : config.breakMinutes;
  let deadline = Date.now() + minutes * 60_000;
  setInterval(() => {
    if (window.__breaking) { $("break-count").textContent = "BREAK"; return; }
    const left = Math.max(0, deadline - Date.now());
    const m = Math.floor(left / 60_000), s = Math.floor((left % 60_000) / 1000);
    $("break-count").textContent = left ? `${m}:${String(s).padStart(2, "0")}` : "VOID";
    if (left === 0) { deadline = Infinity; triggerBreak(); }
  }, 1000);
  window.__resetDeadline = () => {
    deadline = Date.now() + (config.demo ? 0.75 : config.breakMinutes) * 60_000;
  };
}

function triggerBreak() {
  if (window.__breaking) return;
  window.__breaking = true;
  breakStartedAt = Date.now();

  if (hole) {
    // OVERLAY-NATIVE sequence: hole spawns small over the real work and grows.
    dwarfEngine.setDwarf("sleepy", { poof: true });
    dwarfEngine.setState("walk");
    quip("L-wa2t kholis... l-black hole je3an...");
    window.DEVCHAOS_SFX?.play("whoosh", { volume: 0.35 });
    const ok = hole.runHoleCycle({
      growSec: config.demo ? 10 : (config.breakDurationMinutes ?? 30) * 30,
      recedeSec: config.demo ? 10 : (config.breakDurationMinutes ?? 30) * 30,
      // The hole alone tells the story — no text overlays.
      onDone: () => {
        window.DEVCHAOS_SFX?.play("victory", { volume: 0.7 });
        breakEnded();
      },
    });
    if (ok) return;
  }

  // Fallback: old fullscreen break window (if overlay WebGL is unavailable).
  window.devchaos?.breakRequest();
}

function breakEnded() {
  window.__breaking = false;
  window.__resetDeadline?.();
  if (breakStartedAt !== null) memoryState.stats.blackHoleMinutes += Math.max(0, Date.now() - breakStartedAt) / 60_000;
  breakStartedAt = null;
  persistSession();
  dwarfEngine.setDwarf(dwarfEngine.id, { poof: true });
  dwarfEngine.setState("victory");
  chatPush("dwarf", "Rayya7et shway. Bravo 3alayk... ma tkhallina n3ida.");
  setTimeout(showLeaderboard, 1500);
}

function startClockWatch() {
  let invaded = false;
  setInterval(() => {
    const h = new Date().getHours();
    if (h >= 2 && h < 5 && !invaded) {
      invaded = true;
      dwarfEngine.setDwarf("sleepy");
      window.DEVCHAOS_SFX?.play("alarm", { volume: 0.8 });
      quip(canned.pickTrigger("two_am"));
      chatPush("dwarf", canned.pickTrigger("two_am"));
    }
    if (h >= 5) invaded = false;
  }, 30_000);
}

/* ---------------- wiring ---------------- */

function wireDialogue() {
  $("submit").onclick = submitPrompt;
  $("prompt").addEventListener("keydown", (e) => { if (e.key === "Enter") submitPrompt(); });

  // drag by header — free repositioning anywhere on screen
  const panel = $("dialogue"), drag = $("dialogue-drag");
  let dx = 0, dy = 0, dragging = false;
  drag.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return;
    dragging = true;
    const r = panel.getBoundingClientRect();
    dx = e.clientX - r.left; dy = e.clientY - r.top;
    panel.style.right = "auto";
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    panel.style.left = Math.max(0, Math.min(window.innerWidth - 120, e.clientX - dx)) + "px";
    panel.style.top = Math.max(0, Math.min(window.innerHeight - 60, e.clientY - dy)) + "px";
  });
  window.addEventListener("mouseup", () => (dragging = false));

  // X = hide panel (dwarfs keep living; a plain click on the dwarf brings it back)
  $("dialogue-close").onclick = () => $("dialogue").classList.add("hidden");
  let dwarfDownX = null;
  dwarfEngine.el.addEventListener("mousedown", (e) => { dwarfDownX = e.clientX; });
  dwarfEngine.el.addEventListener("click", (e) => {
    if (dwarfDownX !== null && Math.abs(e.clientX - dwarfDownX) < 6) openDialogue();
  });

  // Roastometer
  const slider = $("roastometer");
  let wasSavageZone = false;
  slider.addEventListener("input", () => {
    const v = Number(slider.value);
    roastometer = Math.round(95 - v * 0.9);
    $("roast-caption").textContent =
      roastometer >= 85 ? "grill session" :
      roastometer >= 60 ? "savage" :
      roastometer >= 40 ? "balanced" :
      roastometer >= 15 ? "gentle" : "grandma mode";
    dwarfEngine.el.classList.toggle("savage", roastometer >= 90);
    // crossing into grill-session territory makes the dwarf flinch
    const savageZone = roastometer >= 85;
    if (savageZone && !wasSavageZone && !window.__breaking) {
      dwarfEngine.setState("panic", { holdMs: 500 });
      window.DEVCHAOS_SFX?.play("blip", { volume: 0.4 });
    }
    wasSavageZone = savageZone;
  });
  slider.dispatchEvent(new Event("input"));

  // dual-dispatch bridge: copy the engineered prompt for the user's real AI
  $("docbox-copy").onclick = () => {
    navigator.clipboard?.writeText($("docbox-prompt").textContent);
    $("docbox-copy").textContent = "COPIED!";
    setTimeout(() => ($("docbox-copy").textContent = "COPY FOR YOUR AI"), 1200);
  };

  $("break-chip").onclick = triggerBreak;
}

function wireIslands() {
  document.querySelectorAll(".island").forEach((el) => {
    el.addEventListener("mouseenter", () => window.devchaos?.passthrough(false));
    el.addEventListener("mouseleave", () => { if (!window.__holeLock) window.devchaos?.passthrough(true); });
  });
  dwarfEngine.el.addEventListener("mouseenter", () => window.devchaos?.passthrough(false));
  dwarfEngine.el.addEventListener("mouseleave", () => { if (!dwarfEngine.dragging && !window.__holeLock) window.devchaos?.passthrough(true); });
}

function persistSession() {
  window.devchaos?.sessionSet({ ...(session || {}), memory: memoryState, activeDwarf: dwarfEngine.id, savedAt: Date.now() });
}
