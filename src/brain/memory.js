// Session memory + stats + mood. Pure state container; main process persists to session.json.

"use strict";

const DEFAULT_STATE = {
  prompts: [],            // [{text, score, tier, dwarf, ts}]
  stats: {
    count: 0,
    vagueStreak: 0,
    crashStreak: 0,
    worstScore: null,
    worstText: "",
    totalRoasts: 0,
    perDwarf: {},          // id -> count
    blackHoleMinutes: 0,
  },
  mood: 0.7,               // 0..1, starts content
  breaks: 0,
  lastActiveTs: 0,
};

const MAX_PROMPTS = 40; // in-memory window for LLM context; stats keep cumulative

function create(initial = {}) {
  const state = {
    ...structuredClone(DEFAULT_STATE),
    ...initial,
    stats: { ...DEFAULT_STATE.stats, ...(initial.stats || {}) },
  };
  return state;
}

function record(state, { text, score, tier, dwarf, vague }) {
  const entry = { text: String(text).slice(0, 300), score, tier, dwarf, ts: Date.now() };
  state.prompts.push(entry);
  if (state.prompts.length > MAX_PROMPTS) state.prompts.shift();

  const s = state.stats;
  s.count += 1;
  s.totalRoasts += 1;
  s.perDwarf[dwarf] = (s.perDwarf[dwarf] || 0) + 1;
  if (s.worstScore === null || score < s.worstScore) { s.worstScore = score; s.worstText = entry.text; }

  s.vagueStreak = vague ? s.vagueStreak + 1 : 0;
  s.crashStreak = score <= 3 ? s.crashStreak + 1 : 0;

  // Mood: prompt quality is his diet. EMA weighted toward new evidence, clamped.
  const normalized = score / 10;
  state.mood = Math.max(0, Math.min(1, state.mood * 0.55 + normalized * 0.45));
  state.lastActiveTs = entry.ts;
  return entry;
}

function moodBand(state) {
  if (state.mood >= 0.65) return "thriving";
  if (state.mood >= 0.35) return "neutral";
  return "sick";
}

// Rule-based callback lines work offline. Returns a template-vars bag.
function memoryDigest(state) {
  const recent = state.prompts.slice(-10).map((p) => ({ role: "user", text: p.text, score: p.score }));
  const fixIts = state.prompts.filter((p) => /^\s*(fix (it|this)|make it work)\b/i.test(p.text)).length;
  const s = state.stats;
  return {
    recent,
    count: s.count,
    fixItCount: fixIts,
    worstScore: s.worstScore ?? 10,
    worstText: s.worstText,
    avg: s.count ? (state.prompts.reduce((a, p) => a + p.score, 0) / Math.max(1, state.prompts.length)).toFixed(1) : "n/a",
    moodBand: moodBand(state),
    perDwarf: s.perDwarf,
  };
}

function leaderboard(state) {
  const s = state.stats;
  const favorite = Object.entries(s.perDwarf).sort((a, b) => b[1] - a[1])[0];
  return {
    roasts: s.totalRoasts,
    worst: s.worstScore !== null ? `${s.worstScore}/10 — "${s.worstText.slice(0, 60)}"` : "none yet (coward)",
    avg: state.prompts.length
      ? (state.prompts.reduce((a, p) => a + p.score, 0) / state.prompts.length).toFixed(1) + "/10"
      : "n/a",
    blackHoleMinutes: s.blackHoleMinutes,
    favoriteDwarf: favorite ? favorite[0] : "nobody",
    moodPercent: Math.round(state.mood * 100),
  };
}

export { create, record, memoryDigest, leaderboard, moodBand };
