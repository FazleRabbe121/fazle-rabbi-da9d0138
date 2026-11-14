import test from 'node:test';
import assert from 'node:assert/strict';
import { InterviewService } from '../../src/personal-ai-engine/interviews/interview-service.mjs';
import { InMemoryAgentRepository } from '../../src/personal-ai-engine/storage/in-memory-repository.mjs';

test('starts role interview and stores answer without fabricating an AI score', async () => {
  const repository = new InMemoryAgentRepository();
  let sourceMaterialCalls = 0;
  const host = { async getInterviewSourceMaterials() { sourceMaterialCalls += 1; return [{ title: 'Bartending manual', excerpt: 'Responsible service' }]; } };
  const service = new InterviewService({ repository, host, model: null });
  const session = await service.start({ userId: 'u1', category: 'Bartender', level: 1, mode: 'written' });
  assert.match(session.currentQuestion, /bar station/i);
  const result = await service.submitAnswer({ userId: 'u1', sessionId: session.id, answerText: 'I clean and sanitise the station, check tools and prepare mise en place.' });
  assert.equal(result.evaluation, null);
  assert.equal(result.evaluationStatus, 'waiting_for_model');
  assert.match(result.nextQuestion, /Mojito/i);
  assert.equal(sourceMaterialCalls, 2);
  assert.equal(result.answer.pronunciationAssessment, 'not_available_from_text_transcript');
});

test('enforces the configured minimum duration before finishing', async () => {
  let clock = new Date('2026-11-02T10:00:00.000Z');
  const now = () => new Date(clock);
  const repository = new InMemoryAgentRepository({ now });
  const service = new InterviewService({ repository, model: null, now });
  const session = await service.start({ userId: 'u2', category: 'Bartender', level: 1 });
  for (const answerText of ['I prepare the station safely.', 'I measure the recipe and check the garnish.', 'I follow responsible service rules.']) {
    await service.submitAnswer({ userId: 'u2', sessionId: session.id, answerText });
  }
  await assert.rejects(() => service.finish({ userId: 'u2', sessionId: session.id }), /minimum interview duration/i);
  clock = new Date('2026-11-02T10:05:01.000Z');
  const finished = await service.finish({ userId: 'u2', sessionId: session.id });
  assert.equal(finished.status, 'completed_unscored');
  assert.equal(finished.result.pass, null);
});
