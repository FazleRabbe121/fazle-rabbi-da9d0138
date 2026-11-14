import test from 'node:test';
import assert from 'node:assert/strict';
import { ApprovalService } from '../../src/personal-ai-engine/approvals/approval-service.mjs';
import { InMemoryAgentRepository } from '../../src/personal-ai-engine/storage/in-memory-repository.mjs';

test('external action does not execute before approval and executes once', async () => {
  const repository = new InMemoryAgentRepository();
  const service = new ApprovalService(repository);
  let sends = 0;
  const action = await service.request({ userId: 'u1', type: 'send_application', payload: { draftId: 'd1' }, summary: 'Review email' });
  assert.equal(sends, 0);
  const result = await service.approve({ userId: 'u1', actionId: action.id, execute: async () => { sends += 1; return { accepted: true }; } });
  assert.equal(result.status, 'executed');
  assert.equal(sends, 1);
  await assert.rejects(() => service.approve({ userId: 'u1', actionId: action.id, execute: async () => { sends += 1; } }));
  assert.equal(sends, 1);
});

test('approval records failed or uncertain external operation for manual review', async () => {
  const repository = new InMemoryAgentRepository();
  const service = new ApprovalService(repository);
  const action = await service.request({ userId: 'u1', type: 'send_application', payload: { draftId: 'd1' } });
  const result = await service.approve({ userId: 'u1', actionId: action.id, execute: async () => { throw new Error('mail timeout; outcome unknown'); } });
  assert.equal(result.status, 'needs_review');
  assert.match(result.error, /outcome unknown/);
});
