import test from 'node:test';
import assert from 'node:assert/strict';
import { CareerAgentPlatform } from '../../src/personal-ai-engine/agents/career-agent-platform.mjs';
import { InMemoryAgentRepository } from '../../src/personal-ai-engine/storage/in-memory-repository.mjs';

test('draft uses the existing default CV and sending waits for admin opt-in plus owner approval', async () => {
  const repository = new InMemoryAgentRepository();
  const vacancy = await repository.upsertVacancy('user-1', {
    sourceId: 'official-board', sourceType: 'official_vacancy', externalId: 'job-1',
    title: 'Bartender', employer: 'Example Hotel', location: 'Malta',
    description: 'We will sponsor a work visa for eligible candidates.',
    url: 'https://employer.example/jobs/1', sourceUrl: 'https://employer.example/jobs/1',
    sponsorshipEvidence: { status: 'confirmed', evidenceQuote: 'We will sponsor a work visa', sourceUrl: 'https://employer.example/jobs/1' },
  });
  let sendCount = 0;
  const host = {
    async getCandidateProfile() { return { defaultCvId: 'cv-default', targetRoles: ['Bartender'] }; },
    async getCvText(userId, cvId) { assert.equal(userId, 'user-1'); assert.equal(cvId, 'cv-default'); return 'Bartender with verified bar operations experience.'; },
    async sendApplication() { sendCount += 1; return { accepted: true, messageId: 'provider-msg-1' }; },
  };
  const model = { async generateJSON() { return { subject: 'Bartender application', emailBody: 'Dear Hiring Manager', coverLetter: 'I am applying for the role.', missingFacts: [] }; } };
  const platform = new CareerAgentPlatform({ repository, host, model, policy: { allowExternalEmailSend: true } });
  const draft = await platform.prepareApplicationDraft({ userId: 'user-1', vacancyId: vacancy.id });
  assert.equal(draft.cvId, 'cv-default');
  assert.equal(draft.sendStatus, 'not_sent');
  const action = await platform.requestApplicationSendApproval({ userId: 'user-1', draftId: draft.id });
  assert.equal(action.status, 'pending');
  assert.equal(sendCount, 0);
  const result = await platform.approveAction({ userId: 'user-1', actionId: action.id });
  assert.equal(sendCount, 1);
  assert.equal(result.status, 'executed');
  assert.equal(result.result.status, 'accepted_by_mail_provider');
});

test('email sending stays disabled until administrator enables approved sends', async () => {
  const repository = new InMemoryAgentRepository();
  const platform = new CareerAgentPlatform({ repository, host: { async getCandidateProfile() { return {}; } }, model: null });
  await assert.rejects(() => platform.requestApplicationSendApproval({ userId: 'u1', draftId: 'draft-1' }), /disabled by the administrator/i);
});
