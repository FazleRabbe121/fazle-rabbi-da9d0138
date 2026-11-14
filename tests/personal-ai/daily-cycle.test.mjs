import test from 'node:test';
import assert from 'node:assert/strict';
import { CareerAgentPlatform } from '../../src/personal-ai-engine/agents/career-agent-platform.mjs';
import { InMemoryAgentRepository } from '../../src/personal-ai-engine/storage/in-memory-repository.mjs';

test('daily cycle is idempotent per user and day', async () => {
  const now = () => new Date('2026-11-02T06:00:00.000Z');
  const repository = new InMemoryAgentRepository({ now });
  const host = { async getCandidateProfile() { return { targetRoles: ['Bartender'], targetCountries: ['Malta'] }; } };
  const platform = new CareerAgentPlatform({ repository, host, sources: [], now });
  const first = await platform.runDailyCycle({ userId: 'user-1' });
  assert.equal(first.jobsDiscoveredThisRun, 0);
  await assert.rejects(() => platform.runDailyCycle({ userId: 'user-1' }), /already running or has completed/i);
  const otherUser = await platform.runDailyCycle({ userId: 'user-2' });
  assert.equal(otherUser.jobsDiscoveredThisRun, 0);
});
