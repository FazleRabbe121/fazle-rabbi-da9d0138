import test from 'node:test';
import assert from 'node:assert/strict';
import { executeScheduledDailyRun } from '../../src/personal-ai-engine/scheduler/daily-run.mjs';

test('scheduled daily operation requires the secret token', async () => {
  const platform = { async runDailyCycleForEnabledUsers() { return { usersProcessed: 2 }; } };
  await assert.rejects(() => executeScheduledDailyRun({ authorizationHeader: 'Bearer wrong', expectedSecret: 'correct', platform }), { status: 401 });
  const result = await executeScheduledDailyRun({ authorizationHeader: 'Bearer correct', expectedSecret: 'correct', platform });
  assert.deepEqual(result, { usersProcessed: 2 });
});
