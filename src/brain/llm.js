// LLM adapter: Gemini Flash primary (native JSON mode), DeepSeek backup.
// Timeout, straight fallback — no retry theater. Caller falls back to canned.
// 12s: gemini-3.6-flash TTFB measured 4.7-5.0s on this machine (Sep 16 2026) —
// the old 5s abort killed live roasts at the wire, every single time.

"use strict";

import { LEBANESE_GUIDE } from "./lebanese.js";
import { conversationPayload, conversationSystem } from "./conversation.js";

const TIMEOUT_MS = 12000;

const PROVIDERS = {
  gemini: {
    url: (model, key) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    buildBody: (system, user, jsonSchema) => ({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 1.0,
        response_mime_type: "application/json",
        ...(jsonSchema ? { response_schema: jsonSchema } : {}),
      },
    }),
    parse: (data) => {
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      return text ? JSON.parse(text) : null;
    },
  },
  deepseek: {
    url: () => "https://api.deepseek.com/chat/completions",
    buildBody: (system, user, jsonSchema) => ({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: system + '\nRespond ONLY with JSON matching this schema: ' + JSON.stringify(jsonSchema) },
        { role: "user", content: user },
      ],
      temperature: 1.0,
      response_format: { type: "json_object" },
    }),
    parse: (data) => {
      const text = data?.choices?.[0]?.message?.content;
      return text ? JSON.parse(text) : null;
    },
  },
};

PROVIDERS.openrouter = {
  ...PROVIDERS.deepseek,
  url: () => "https://openrouter.ai/api/v1/chat/completions",
  buildBody: (system, user, jsonSchema, model) => ({
    ...PROVIDERS.deepseek.buildBody(system, user, jsonSchema),
    model: model || "deepseek/deepseek-v4.1-flash",
  }),
};

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    roast: { type: "STRING" },
    refactored_prompt: { type: "STRING" },
    label: { type: "STRING" },
  },
  required: ["roast", "refactored_prompt"],
};

function buildUserMessage({ prompt, scored, dwarf, roastometer, digest }) {
  const intensity =
    roastometer >= 85 ? "MAXIMUM SAVAGE (100/100): no mercy, pure comedic destruction" :
    roastometer >= 60 ? `savage (${roastometer}/100): sharp, cutting, brutal wit` :
    roastometer >= 40 ? `balanced (${roastometer}/100): honest with a bite` :
    roastometer >= 15 ? `gentle (${roastometer}/100): kind, constructive, soft` :
    `WHOLESALE GRANDMA MODE (0-14/100): maximum kindness, almost useless levels of nice`;

  const memory = digest?.count
    ? `\nSession memory: ${digest.count} prompts so far, ${digest.fixItCount} were some variant of "fix it", worst score ${digest.worstScore}/10, avg ${digest.avg}.`
    : "\nThis is the user's first prompt today.";

  return `PROMPT TO REVIEW (from a ${dwarf.name} viewpoint — you ARE ${dwarf.name}, ${dwarf.job}):
"""
${prompt}
"""

Machine-graded: ${scored.score}/10 (${scored.label}). Issues: ${scored.issues.map((i) => i.type).join(", ") || "none"}.
Roast intensity setting: ${intensity}.${memory}

Reply as JSON: {"roast": "<in-character line, max 2 short sentences>", "refactored_prompt": "<the properly engineered version of their prompt>", "label": "<3-word max verdict>"}.
The roast MUST be in ${dwarf.name}'s voice. The refactored_prompt must be genuinely usable — that part is real teaching.`;
}

async function roast(config, { prompt, scored, dwarf, roastometer, digest }) {
  const provider = PROVIDERS[config.provider] || PROVIDERS.gemini;
  if (!config.apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const body = provider.buildBody(
      `${dwarf.system}\n\n${LEBANESE_GUIDE}`,
      buildUserMessage({ prompt, scored, dwarf, roastometer, digest }),
      RESPONSE_SCHEMA, config.model,
    );
    const res = await fetch(provider.url(config.model || "gemini-3.6-flash", config.apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(["deepseek", "openrouter"].includes(config.provider) ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const parsed = provider.parse(await res.json());
    if (!parsed || typeof parsed.roast !== "string" || !parsed.roast.trim()) return null;
    return {
      roast: parsed.roast.trim().slice(0, 300),
      refactored: (parsed.refactored_prompt || "").trim().slice(0, 800),
      label: (parsed.label || "").trim().slice(0, 40),
      source: "llm",
    };
  } catch {
    return null; // timeout / network / parse — canned takes over
  } finally {
    clearTimeout(timer);
  }
}

// Doc ideas: 3 sharper versions of the user's last prompt (teaching moment).
async function ideas(config, { prompt, scored, digest }) {
  const provider = PROVIDERS[config.provider] || PROVIDERS.gemini;
  if (!config.apiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const system = "You are Doc, a patient prompt-engineering teacher inside a fun desktop app. Given a weak prompt, return 3 sharper rewritten versions: 1) names the target file/context, 2) states the expected behavior, 3) adds one constraint. Keep each under 30 words. Write copy-ready technical prompts in clean English, not character dialogue. Preserve supplied facts and use explicit [placeholders] for unknown files or requirements. Never invent project facts.";
  const user = `WEAK PROMPT: """${prompt}"""
Machine diagnosis: ${scored?.score ?? "?"}/10, issues: ${(scored?.issues || []).map((i) => i.type).join(", ") || "vague"}.`;
  try {
    const body = provider.buildBody(
      system, user,
      { type: "OBJECT", properties: { ideas: { type: "ARRAY", items: { type: "STRING" }, minItems: 3, maxItems: 3 } }, required: ["ideas"] }, config.model,
    );
    const res = await fetch(provider.url(config.model || "gemini-3.6-flash", config.apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(["deepseek", "openrouter"].includes(config.provider) ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const parsed = provider.parse(await res.json());
    const list = parsed?.ideas;
    if (!Array.isArray(list) || list.length !== 3 || !list.every((x) => typeof x === "string" && x.trim())) return null;
    return list.map((x) => x.trim());
  } catch { return null; } finally { clearTimeout(timer); }
}

async function chat(config, payload) {
  const data = conversationPayload(payload);
  if (!data) return null;
  if (!config.apiKey) return { source: "offline", error: "missing_key" };
  const provider = PROVIDERS[config.provider] || PROVIDERS.gemini;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const body = provider.buildBody(conversationSystem(data.dwarf), JSON.stringify({
      history: data.history, message: data.message,
    }), { type: "OBJECT", properties: { reply: { type: "STRING" } }, required: ["reply"] }, config.model);
    const res = await fetch(provider.url(config.model || "gemini-3.6-flash", config.apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(["deepseek", "openrouter"].includes(config.provider) ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
      body: JSON.stringify(body), signal: controller.signal,
    });
    if (!res.ok) {
      const error = res.status === 429 ? "rate_limit" :
        [401, 403].includes(res.status) ? "auth" : res.status === 404 ? "model" : "provider";
      return { source: "offline", error };
    }
    let parsed;
    try { parsed = provider.parse(await res.json()); }
    catch { return { source: "offline", error: "response" }; }
    if (typeof parsed?.reply !== "string" || !parsed.reply.trim()) return { source: "offline", error: "response" };
    return { reply: parsed.reply.trim().slice(0, 1200), source: "llm" };
  } catch (error) {
    return { source: "offline", error: controller.signal.aborted || error?.name === "AbortError" ? "timeout" : "network" };
  } finally { clearTimeout(timer); }
}

export { roast, ideas, chat };

