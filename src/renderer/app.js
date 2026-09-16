// App orchestrator v2: everything lives in the draggable dialogue panel.
// Prompt flow: input → scorer → chat score + roast (LLM/canned) + Doc refactor +
// dual-dispatch copy bridge + quip bubble on the dwarf. Deadline chip → black hole.

"use strict";

import { analyze } from "../brain/scorer.js";
import { get, ORDER } from "../brain/personalities.js";
import * as canned from "../brain/canned.js";
import * as memory from "../brain/memory.js";

const $ = (id) => document.getElementById(id);
const dwarfEngine = window.DEVCHAOS_DWARF;

let session = null;
let memoryState = memory.create();
let roastometer = 50;
let config = { demo: false, breakMinutes: 25, voiceOn: true };
let hole = null; // overlay-native black hole engine (./hole.js)

async function boot() {
  if (window.devchaos) {
    config = await window.devchaos.getConfig();
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

  buildHats();
  wireDialogue();
  wireIslands();
  startDeadlineTimer();
  startClockWatch();
  startIdleLife();
  setInterval(persistSession, 8000);
  window.devchaos?.onHoleRun?.(() => triggerBreak());

  // 🎧 IDE listening: visible toggle + captured prompts run the same pipeline.
  // Debounced (800ms); the chip UI is ALSO re-synced from main every 3s, so
  // whatever happens, the label can never drift from the real state.
  const listenChip = $("listen-chip");
  const paintListen = (on) => {
    listenChip.classList.toggle("on", on);
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
        ? "🎧 IDE listening is ON — everything you say to your AI, I hear too."
        : "🎧 IDE listening off. I'll mind my own business.");
      if (on) quip("\u{1F3A7} I can hear your IDE now. Type carefully.");
    }
  }, 3000);

  dwarfEngine.setDwarf(dwarfEngine.id, { poof: false });
  dwarfEngine.setState("walk");
  setTimeout(() => quip("We are the prompt dwarfs. Talk to us."), 1000);

  updateMoodUI();
  chatPush("dwarf", "Ask your AI anything — I grade everything you type. Try me with something lazy.");
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
      setTimeout(() => { bubble.classList.add("hidden"); if (dwarfEngine.state === "talk") dwarfEngine.setState("idle"); }, 2200);
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

// One pipeline for both entry points: the bar (typed manually) and the
// IDE listener (captured automatically — marked 🎧 in the chat).
// One-slot queue: a prompt arriving while a roast is animating runs after,
// instead of vanishing silently mid-demo.
let __pendingPrompt = null;
function submitText(text, { source = "bar" } = {}) {
  if (window.__submitting) { __pendingPrompt = { text, source }; return; }
  window.__submitting = true;
  reactToPrompt(text, source)
    .catch(console.error)
    .finally(() => {
      window.__submitting = false;
      if (__pendingPrompt) {
        const next = __pendingPrompt;
        __pendingPrompt = null;
        submitText(next.text, next);
      }
    });
}

async function reactToPrompt(text, source) {
  openDialogue(); // auto-pop on every submission
  const userDiv = chatPush("user", text);
  if (source === "ide") userDiv.textContent = "\u{1F3A7} " + text; // proof it was heard, not typed

  const dwarf = get(dwarfEngine.id);
  let finalText = text;

  if (dwarf.id === "sneezy") {
    finalText = sneezeScramble(text);
    window.DEVCHAOS_SFX?.play("sneeze", { volume: 0.9 });
    dwarfEngine.setState("panic", { holdMs: 900 });
    chatPush("dwarf", "(ACHOO — grading the mangled version)");
  }

  const scored = analyze(finalText);
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
  chatPush("score", `${scored.score}/10`, scored.label, roastTier);
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
      prompt: finalText, scored, dwarf, roastometer,
      digest: memory.memoryDigest(memoryState),
    }).catch(() => null);
    if (res) { line = res.roast; refactored = res.refactored; }
  }
  if (!line) line = canned.pickRoast(dwarf.id, roastTier);
  if (!refactored && scored.score <= 6) refactored = quickRefactor(text, scored);

  const roastDiv = chatPush("dwarf", "");
  typeInto(roastDiv, line);            // typewriter + voice in the panel
  quip(shorten(line), canned.maybeLebanese(0.18));  // + quip bubble over the dwarf

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

function sneezeScramble(text) {
  const chars = text.split("");
  for (let i = chars.length - 1; i > 0; i--) {
    if (Math.random() < 0.35 && /[a-z]/i.test(chars[i])) {
      const j = Math.floor(Math.random() * chars.length);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
  }
  return chars.join("");
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
    quip("THREE lazy ones. I'm out. DOPEY! You're up.");
    // storm-off: he SPRINTS off the screen, then Dopey poofs in
    dwarfEngine.stormOff(() => {
      dwarfEngine.setDwarf("dopey");
      quip("hii!! I'm the replacement!!");
    });
    s.vagueStreak = 0;
  } else if (s.crashStreak >= 3 && dwarfEngine.id !== "happy") {
    chatPush("dwarf", canned.pickTrigger("score_crash"));
    setTimeout(() => dwarfEngine.setDwarf("happy"), 2400);
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
    quip("I'M AWAKE. I'M AWAKE.");
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
        quip("...zzz... wake me when you write something decent...");
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

function buildHats() {
  const wrap = $("hats");
  wrap.innerHTML = "";
  for (const id of ORDER) {
    const d = get(id);
    const b = document.createElement("div");
    b.className = "hat-btn" + (id === dwarfEngine.id ? " active" : "");
    b.style.background = d.color;
    b.textContent = d.name.toUpperCase();
    b.title = `${d.name} — ${d.job}`;
    b.onclick = () => {
      dwarfEngine.setDwarf(id);
      wrap.querySelectorAll(".hat-btn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      window.devchaos?.activeDwarf(id);
      $("dialogue-title").textContent = `${d.name.toUpperCase()} — ${d.job.toUpperCase()}`;
      document.getElementById("dialogue").style.setProperty("--hat", d.color);
      quip(entranceLine(id));
    };
    wrap.appendChild(b);
  }
}

function entranceLine(id) {
  return {
    doc: "Doc here. Show me the prompt. I'll show you the way.",
    grumpy: "What. WHAT do you want now.",
    happy: "IT'S ME!! I BROUGHT ENTHUSIASM!!",
    sleepy: "...mmh. five more minutes. fine. show me.",
    sneezy: "ah... AH... give me the prompt... carefully...",
    bashful: "oh!! um!! hi!! I'll try my best...",
    dopey: "I'M HERE!! what are we doing?! I LOVE it already!!",
  }[id] || "...";
}

function updateMoodUI() {
  const band = memory.moodBand(memoryState);
  const fill = $("mood-fill");
  fill.style.width = Math.round(memoryState.mood * 100) + "%";
  const colors = { thriving: "#9dffb0", neutral: "#ffd94a", sick: "#8fd4ff" };
  fill.style.background = colors[band];
  $("mood-wrap").style.color = colors[band];
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

  if (hole) {
    // OVERLAY-NATIVE sequence: hole spawns small over the real work and grows.
    dwarfEngine.setDwarf("sleepy", { poof: true });
    dwarfEngine.setState("walk");
    quip("the deadline is coming... it's HUNGRY...");
    window.DEVCHAOS_SFX?.play("whoosh", { volume: 0.35 });
    const ok = hole.runHoleCycle({
      growSec: config.demo ? 8 : 180,
      recedeSec: config.demo ? 12 : 30,
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
  window.devchaos?.onBreakEnded(() => breakEnded());
}

function breakEnded() {
  window.__breaking = false;
  window.__resetDeadline?.();
  memoryState.stats.blackHoleMinutes += config.demo ? 1 : config.breakMinutes;
  persistSession();
  dwarfEngine.setDwarf(dwarfEngine.id, { poof: true });
  dwarfEngine.setState("victory");
  chatPush("dwarf", "You rested. We're proud. Mostly.");
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
    if (e.target.id === "dialogue-close") return;
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

  // X = hide panel (dwarfs keep living; hats bring it back)
  $("dialogue-close").onclick = () => $("dialogue").classList.add("hidden");

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

  // DOC, HELP ME: 3 sharper versions of the last prompt (LLM when keyed,
  // built from the scorer's own diagnosis when offline).
  $("doc-help").onclick = async () => {
    const prompt = window.__lastPrompt, scored = window.__lastScored;
    if (!prompt) return;
    openDialogue();
    chatPush("user", "Doc, help me with: " + prompt.slice(0, 60));
    chatPush("dwarf", "One moment. Teaching mode.");
    let ideas = window.devchaos ? await window.devchaos.ideas({ prompt, scored, digest: memory.memoryDigest(memoryState) }) : null;
    if (!ideas) {
      const fixes = (scored.issues || []).map((i) => i.fix).slice(0, 3);
      const base = prompt.trim().replace(/[.!?]+$/, "");
      ideas = [
        `${base} — in FILE: <name>, LANGUAGE: <language>`,
        `${base} — EXPECTED BEHAVIOR: <what should happen exactly>`,
        `${base} — CONSTRAINT: ${fixes[0] || "<one limit, e.g. no libraries>"}`,
      ];
      chatPush("dwarf", "(offline — built from the scorer's diagnosis)");
    }
    showIdeasBox(ideas);
  };

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
