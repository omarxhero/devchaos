"use strict";

const fs = require("node:fs");
const { randomUUID } = require("node:crypto");

function configPatch(current, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Invalid settings");
  const next = { ...current };
  const validators = {
    provider: (v) => ["gemini", "deepseek", "openrouter"].includes(v),
    model: (v) => typeof v === "string" && v.length <= 150 && /^[\w-][\w.-]*(?:\/[\w-][\w.:-]*)?$/.test(v),
    apiKey: (v) => typeof v === "string" && v.length <= 1024,
    volume: (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1,
    voiceOn: (v) => typeof v === "boolean",
    demo: (v) => typeof v === "boolean",
    breakMinutes: (v) => typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 1440,
    breakDurationMinutes: (v) => Number.isInteger(v) && v >= 1 && v <= 120,
  };
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.hasOwn(validators, key) || !validators[key](value)) throw new Error("Invalid settings");
    if (key === "apiKey") {
      const trimmed = value.trim();
      if (trimmed && trimmed !== "SET") next.apiKey = trimmed;
    } else next[key] = value;
  }
  // Never let one provider's credential silently serve the other: a provider
  // switch must arrive together with that provider's own key.
  if (patch.provider !== undefined && patch.provider !== current.provider) {
    const key = typeof patch.apiKey === "string" ? patch.apiKey.trim() : "";
    if (!key || key === "SET") throw new Error("A new API key is required when switching providers.");
    if (patch.model === undefined) next.model = {
      gemini: "gemini-3.6-flash", deepseek: "deepseek-chat", openrouter: "deepseek/deepseek-v4.1-flash",
    }[patch.provider];
  }
  return next;
}

function writeConfig(file, config) {
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(config, null, 2), { flag: "wx", mode: 0o600 });
    fs.renameSync(temp, file);
    return true;
  } catch {
    try { fs.unlinkSync(temp); } catch {}
    return false;
  }
}

module.exports = { configPatch, writeConfig };
