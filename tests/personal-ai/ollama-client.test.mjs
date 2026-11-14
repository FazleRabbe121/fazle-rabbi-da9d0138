import test from 'node:test';
import assert from 'node:assert/strict';
import { OllamaChatClient } from '../../src/personal-ai-engine/llm/ollama-client.mjs';

test('uses Ollama chat endpoint and parses structured JSON', async () => {
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (String(url).endsWith('/tags')) return new Response(JSON.stringify({ models: [{ name: 'qwen3:8b' }] }), { status: 200 });
    return new Response(JSON.stringify({ message: { content: '{"ok":true,"count":3}' } }), { status: 200 });
  };
  const client = new OllamaChatClient({ baseUrl: 'http://localhost:11434/api', model: 'qwen3:8b', fetchImpl: fakeFetch });
  assert.deepEqual(await client.generateJSON({ system: 'return json', user: { ping: true } }), { ok: true, count: 3 });
  const health = await client.health();
  assert.equal(health.modelInstalled, true);
  assert.equal(calls[0].url, 'http://localhost:11434/api/chat');
  assert.equal(calls[0].init.body.includes('api_key'), false);
});
