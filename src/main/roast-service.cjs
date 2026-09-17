"use strict";

const { createHash } = require("node:crypto");

function cacheKey(payload, demo) {
  return createHash("sha256").update(JSON.stringify([
    payload.prompt, payload.dwarf, payload.roastometer, payload.scored,
    demo ? {} : (payload.digest || {}),
  ])).digest("hex");
}

function createRoastService({ getConfig, loadBrain, maxEntries = 200,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  const cache = new Map(), pending = new Map();
  let generation = 0, worker = null, queued = null;

  function invalidate() {
    generation++;
    cache.clear();
    pending.clear();
    queued = null;
  }

  async function request(payload, { bypassCache = false } = {}) {
    const config = { ...getConfig() };
    if (!config.apiKey) return null;
    // Demo responses intentionally ignore changing session history for repeatable rehearsals.
    const data = config.demo ? { ...payload, digest: {} } : payload;
    const key = cacheKey(data, config.demo);
    if (!bypassCache && cache.has(key)) {
      const result = cache.get(key);
      cache.delete(key); cache.set(key, result);
      return { ...result, source: "cache" };
    }
    if (!bypassCache && pending.has(key)) return pending.get(key);
    const version = generation;
    const job = (async () => {
      try {
        const { roast } = await loadBrain("src/brain/llm.js");
        if (version !== generation) return null;
        const result = await roast(config, data);
        if (version !== generation) return null;
        if (result) {
          cache.delete(key); cache.set(key, result);
          while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
        }
        return result;
      } catch { return null; }
    })();
    if (!bypassCache) pending.set(key, job);
    try { return await job; }
    finally { if (pending.get(key) === job) pending.delete(key); }
  }

  function prefetch(prompts) {
    if (!getConfig().demo || !getConfig().apiKey) return Promise.resolve();
    queued = [...new Set(prompts)];
    if (worker) return worker;
    worker = (async () => {
      const [{ analyze }, { get }] = await Promise.all([
        loadBrain("src/brain/scorer.js"), loadBrain("src/brain/personalities.js"),
      ]);
      let attempted = false;
      while (queued) {
        const batch = queued; queued = null;
        const version = generation;
        for (const prompt of batch) {
          for (const roastometer of [50, 85]) {
            if (version !== generation) break;
            if (!getConfig().demo || !getConfig().apiKey) return;
            const data = { prompt, scored: analyze(prompt), dwarf: get("grumpy"), roastometer, digest: {} };
            if (cache.has(cacheKey(data, true))) continue;
            // One seed request at a time; spacing is conservative, not a quota guarantee.
            if (attempted) await wait(3000);
            if (version !== generation) break;
            attempted = true;
            const result = await request(data);
            if (version !== generation) break;
            if (!result) { queued = null; return; }
          }
          if (version !== generation) break;
        }
      }
    })().catch(() => { queued = null; }).finally(() => { worker = null; });
    return worker;
  }

  return { request, invalidate, prefetch };
}

module.exports = { cacheKey, createRoastService };
