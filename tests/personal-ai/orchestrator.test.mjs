import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentOrchestrator } from '../../src/personal-ai-engine/agents/agent-orchestrator.mjs';

test('planner can delegate only to registered agents and returns execution trace', async () => {
  const model = { async generateJSON() { return { steps: [{ agent: 'research', task: 'Look for roles', input: { country: 'Malta' } }] }; } };
  const orchestrator = new AgentOrchestrator({ model, agents: { research: { async execute({ input }) { return { found: 2, country: input.country }; }, summarize: (value) => `${value.found} found` } } });
  const result = await orchestrator.execute({ goal: 'Find jobs', context: { userId: 'u1' } });
  assert.equal(result.status, 'completed');
  assert.equal(result.trace[0].outputSummary, '2 found');
  const unsafePlanner = new AgentOrchestrator({ model: { async generateJSON() { return { steps: [{ agent: "shell", task: "run shell", input: {} }] }; } }, agents: { research: { async execute() { return {}; } } } });
  await assert.rejects(() => unsafePlanner.execute({ goal: "Find jobs", context: { userId: "u1" } }));
});
