import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentRequestHandler } from '../../src/personal-ai-engine/http/create-agent-handler.mjs';

test('user ID comes from the host auth adapter, not the request body', async () => {
  let discoveredUser = null;
  const handler = createAgentRequestHandler({
    schedulerSecret: 'scheduler-secret',
    authorizeRequest: async () => ({ userId: 'verified-user' }),
    platform: {
      async discoverJobs({ userId }) { discoveredUser = userId; return { matchedJobs: 0 }; },
      async listJobs() { return []; },
    },
  });
  const response = await handler(new Request('https://app.example/api/agent/v1/jobs/discover', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 'spoofed-user' }) }));
  assert.equal(response.status, 200);
  assert.equal(discoveredUser, 'verified-user');
});

test('scheduler route rejects requests without the configured secret', async () => {
  const handler = createAgentRequestHandler({
    schedulerSecret: 'good-secret',
    authorizeRequest: async () => ({ userId: 'u1' }),
    platform: { async runDailyCycleForEnabledUsers() { return { usersProcessed: 1 }; } },
  });
  const response = await handler(new Request('https://app.example/internal/agent/v1/scheduler/daily', { method: 'POST', headers: { authorization: 'Bearer bad-secret' } }));
  assert.equal(response.status, 401);
});

test('rejects oversized request bodies before parsing them', async () => {
  const handler = createAgentRequestHandler({
    authorizeRequest: async () => ({ userId: 'u1' }),
    platform: { async discoverJobs() { throw new Error('should not be reached'); } },
  });
  const oversized = JSON.stringify({ roles: ['x'.repeat(300_000)] });
  const response = await handler(new Request('https://app.example/api/agent/v1/jobs/discover', { method: 'POST', headers: { 'content-type': 'application/json' }, body: oversized }));
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /too large/i);
});

test('interview routes override spoofed user IDs with authenticated identity', async () => {
  let receivedUserId = null;
  const handler = createAgentRequestHandler({
    authorizeRequest: async () => ({ userId: 'real-user' }),
    platform: { async startInterview(input) { receivedUserId = input.userId; return { id: 'session-1' }; } },
  });
  const response = await handler(new Request('https://app.example/api/agent/v1/interviews/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 'spoofed-user', category: 'Bartender', level: 1 }) }));
  assert.equal(response.status, 201);
  assert.equal(receivedUserId, 'real-user');
});
