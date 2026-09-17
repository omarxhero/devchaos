// Deterministic prompt scorer. <100ms, zero deps, offline forever.
// Vague-regex families ported from Promptlinter (MIT) indirect_flags.go,
// adapted + extended for DevChaos. Everything else is original.

"use strict";

const VAGUE_PATTERNS = [
  [/\bfix (it|this|that)\b/i, "vague_reference", "Specify exactly what to fix"],
  [/\bmake (it|this) (work|better|good)\b/i, "vague_reference", "Describe the expected behavior"],
  [/\b(it|this|that) (doesn'?t|does not|isn'?t|is not) (work|working|right|good)\b/i, "vague_reference", "Say what's broken and what you expected"],
  [/\bthe (file|function|method|class|module|bug|error|issue|problem|thing|code)\b/i, "vague_reference", "Name the file or function explicitly"],
  [/\bthat (file|function|method|class|module|bug|error|issue|thing)\b/i, "vague_reference", "Name it explicitly"],
  [/\bsomewhere in\b/i, "vague_reference", "Specify the exact location"],
  [/\bthe (code|thing) (i|we) (wrote|did|made)\b/i, "vague_reference", "Reference the specific file or function"],
  [/^\s*(fix|do|make|help|pls|please|please help|help me)\b[.!\s]*$/i, "empty_request", "Say what you actually want"],
  [/^\s*(please\s+)?(just\s+)?(fix|make|do|build|help)\b.{0,26}$/is, "lazy_imperative", "A command is not a prompt. Add: what, where, expected result"],
  [/\basap\b|\bquickly\b|\bfast\b/i, "no_specs", "Deadlines are not specifications"],
  [/^\s*(hello|hi|hey)\b/i, "greeting", "The AI does not need a handshake"],
  [/\b(can|could) you (help|do|make|fix|write)\b/i, "generic_ask", "Help with WHAT? Name the task"],
  [/\bmy (code|app|program|project|website|thing)\b/i, "vague_reference", "Which file? Which function?"],
  [/\byou know what (i|we) (mean|want)\b/i, "mind_reading", "The AI does not, in fact, know what you mean"],
];

const TYPOS = {
  functoin: "function", fucntion: "function", definately: "definitely",
  seperate: "separate", recieve: "receive", occured: "occurred",
  lenght: "length", widht: "width", reccomend: "recommend",
  baord: "board", wrok: "work", wirte: "write", stirng: "string",
  varaible: "variable", paramter: "parameter", reuslt: "result",
  impport: "import", exprot: "export", comiler: "compiler",
  syncronize: "synchronize", alligned: "aligned", existance: "existence",
};

// Cheap Damerau-ish check: single-edit distance on words >= 5 chars.
function editDistanceAtMost1(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la === lb) {
    let diff = 0;
    for (let i = 0; i < la; i++) if (a[i] !== b[i] && ++diff > 1) return false;
    return diff === 1;
  }
  const [short, long] = la < lb ? [a, b] : [b, a];
  let i = 0, j = 0, skipped = false;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) { i++; j++; continue; }
    if (skipped) return false;
    skipped = true; j++;
  }
  return true;
}

const COMMON_WORDS = new Set([
  "about", "above", "after", "again", "could", "every", "first", "great",
  "house", "large", "learn", "money", "night", "other", "place", "point",
  "right", "small", "sound", "spell", "still", "study", "their", "there",
  "these", "thing", "think", "three", "water", "where", "which", "world",
  "would", "write", "wrong", "your", "please", "change", "check", "click",
  "create", "document", "element", "example", "feedback", "important",
  "information", "language", "machine", "network", "question", "response",
  "result", "server", "should", "system", "target", "update", "browser",
  "screen", "window", "problem", "prompt", "string", "table", "value",
]);

const SPECIFIC_BONUS = [
  [/file\s*=\s*[\w./-]+|\b[\w-]+\.(js|ts|py|json|css|html|c|cpp|java|go|rs)\b/i, 1.5, "names a file"],
  [/\d+/, 0.75, "has numbers/constraints"],
  [/step[- ]by[- ]step|explain|why|compare|list|refactor|unit test/i, 0.75, "asks for an approach"],
  [/error|traceback|exception|stack trace/i, 1, "includes error context"],
  [/\b(using|with|in|for)\s+(javascript|typescript|python|react|node|css|html|sql|git|c\+\+|java|rust|go)\b/i, 1, "names the stack"],
  [/(constraints?|requirements?|assume|must|should|don'?t|avoid|instead of)/i, 0.75, "sets constraints"],
];

const LABELS = [
  [2, "PURE LAZINESS"], [4, "SPAGHETTI THOUGHT"], [6, "MID"],
  [8, "SOLID"], [10, "PROMPT ENGINEER"],
];

function labelFor(score) {
  for (const [max, label] of LABELS) if (score <= max) return label;
  return "PROMPT ENGINEER";
}

function analyze(prompt) {
  const text = String(prompt ?? "").trim();
  const issues = [];
  let score = 10;

  if (!text) {
    return { score: 1, label: "PURE LAZINESS", tier: "savage", issues: [{ type: "empty", fix: "You typed NOTHING. Bold." }], typos: [] };
  }

  // Length floors.
  if (text.length < 12) { score -= 3; issues.push({ type: "too_short", fix: "Say more than a grunt" }); }
  else if (text.length < 30) { score -= 1.5; issues.push({ type: "thin", fix: "Add context: what, where, expected result" }); }
  if (text.length > 800) { score -= 1; issues.push({ type: "wall_of_text", fix: "Nobody reads your novella. Trim it." }); }

  // Vague language (each family hits once).
  const seen = new Set();
  for (const [re, type, fix] of VAGUE_PATTERNS) {
    if (seen.has(type)) continue;
    if (re.test(text)) {
      seen.add(type);
      score -= type === "empty_request" ? 4 : type === "lazy_imperative" ? 3.5 : 2;
      issues.push({ type, fix });
    }
  }

  // Shouting.
  const letters = text.replace(/[^a-z]/gi, "");
  if (letters.length >= 8) {
    const capsRatio = text.replace(/[^A-Z]/g, "").length / letters.length;
    if (capsRatio > 0.7) { score -= 4; issues.push({ type: "all_caps", fix: "Shouting at the AI won't make it smarter" }); }
  }

  // Punctuation desert (long text, zero punctuation).
  if (text.length > 60 && !/[.!?,;:\n]/.test(text)) {
    score -= 1; issues.push({ type: "no_punctuation", fix: "Punctuation exists. Try it." });
  }

  // Typos: known dict + edit-distance vs common words.
  const typos = [];
  const words = text.toLowerCase().match(/[a-z]{5,}/g) || [];
  for (const w of words) {
    if (TYPOS[w]) { typos.push({ word: w, fix: TYPOS[w] }); continue; }
    if (typos.length >= 3) break;
    if (COMMON_WORDS.has(w)) continue;
    for (const common of COMMON_WORDS) {
      if (common.length >= 5 && common[0] === w[0] && editDistanceAtMost1(w, common)) {
        typos.push({ word: w, fix: common });
        break;
      }
    }
  }
  if (typos.length) { score -= Math.min(2, typos.length * 0.75); issues.push({ type: "typos", fix: "Spellcheck is free" }); }

  // Specificity bonuses (floor of bonuses = +2).
  let bonus = 0;
  for (const [re, value] of SPECIFIC_BONUS) if (re.test(text)) bonus += value;
  score += Math.min(2, bonus);

  score = Math.max(1, Math.min(10, Math.round(score)));
  const tier = score <= 3 ? "savage" : score <= 6 ? "medium" : "mild";
  return { score, label: labelFor(score), tier, issues, typos: typos.slice(0, 3) };
}



export { analyze, labelFor };
