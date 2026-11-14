import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryAgentRepository } from '../../src/personal-ai-engine/storage/in-memory-repository.mjs';
import { discoverAndStoreJobs } from '../../src/personal-ai-engine/jobs/discovery-service.mjs';

test('discovers, filters and deduplicates vacancies for one user', async () => {
  const repository = new InMemoryAgentRepository();
  const source = {
    id: 'greenhouse:example', type: 'greenhouse_official_board', sourceUrl: 'https://boards.greenhouse.io/example',
    async fetchJobs() { return [
      { id: 7, title: 'Bartender', employer: 'Example Hotel', location: 'Malta', description: 'We will sponsor a work visa for eligible candidates.', url: 'https://boards.greenhouse.io/example/jobs/7?utm_source=test' },
      { id: 8, title: 'Maintenance Electrician', employer: 'Other', location: 'Germany', description: 'No visa sponsorship.', url: 'https://jobs.example/8' },
    ]; },
  };
  const args = {
    userId: 'user-1', sources: [source], repository,
    candidateProfile: { targetRoles: ['Bartender'], skills: ['cocktails'], targetCountries: ['Malta'] },
    roles: ['Bartender'], countries: ['Malta'],
  };
  const first = await discoverAndStoreJobs(args);
  const second = await discoverAndStoreJobs(args);
  const jobs = await repository.listVacancies('user-1');
  assert.equal(first.matchedJobs, 1);
  assert.equal(second.matchedJobs, 1);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].sponsorshipEvidence.status, 'confirmed');
  assert.ok(jobs[0].opportunityScore.score >= 50);
});
