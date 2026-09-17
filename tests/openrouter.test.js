import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { roast, ideas, chat } from '../src/brain/llm.js';
import { get } from '../src/brain/personalities.js';
const { configPatch } = createRequire(import.meta.url)('../src/main/config-store.cjs');

test('OpenRouter authenticates and selects models for roast, ideas and chat', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({url, options, body: JSON.parse(options.body)});
    return {ok: true, json: async () => ({choices: [{message: {content: JSON.stringify({
      roast: 'Sammi l-file!', refactored_prompt: 'Fix [file].', label: 'Context',
      ideas: ['Specify [file].', 'Describe [behavior].', 'Add [constraint].'], reply: 'Ahla!',
    })}}]})};
  });
  const payload = {prompt: 'fix it', scored: {score: 2, label: 'VAGUE', issues: []}, dwarf: get('grumpy'), roastometer: 80};
  for (const model of [undefined, 'deepseek/deepseek-v4-flash']) {
    const config = {provider: 'openrouter', apiKey: 'test-only', model};
    assert.equal((await roast(config, payload))?.source, 'llm');
    assert.equal((await ideas(config, payload))?.length, 3);
    assert.equal((await chat(config, {message: 'hello', dwarfId: 'grumpy'}))?.reply, 'Ahla!');
    for (const call of calls.splice(0)) {
      assert.equal(call.url, 'https://openrouter.ai/api/v1/chat/completions');
      assert.equal(call.options.headers.Authorization, 'Bearer test-only');
      assert.equal(call.body.model, model || 'deepseek/deepseek-v4.1-flash');
      assert.equal(call.body.response_format.type, 'json_object');
    }
  }
});

test('provider changes reset model safely and require replacement credentials', () => {
  const base = {provider: 'gemini', model: 'gemini-3.6-flash', apiKey: 'test-only'};
  assert.throws(() => configPatch(base, {provider: 'openrouter'}), /new API key/);
  const next = configPatch(base, {provider: 'openrouter', apiKey: 'replacement-fixture'});
  assert.equal(next.model, 'deepseek/deepseek-v4.1-flash');
  assert.equal(configPatch(next, {model: 'deepseek/deepseek-v4-flash'}).model, 'deepseek/deepseek-v4-flash');
  assert.equal(configPatch(next, {provider: 'openrouter', apiKey: ''}).apiKey, 'replacement-fixture');
  assert.equal(configPatch(next, {provider: 'gemini', apiKey: 'new-fixture'}).model, 'gemini-3.6-flash');
  for (const model of ['https://evil.test/x', '../x', 'a b', 'a/b/c']) assert.throws(() => configPatch(next, {model}));
});
