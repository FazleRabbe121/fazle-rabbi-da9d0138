import test from 'node:test';
import assert from 'node:assert/strict';
import { GreenhouseJobBoardConnector } from '../../src/personal-ai-engine/jobs/connectors/greenhouse.mjs';
import { LeverJobBoardConnector } from '../../src/personal-ai-engine/jobs/connectors/lever.mjs';

test('Greenhouse public board connector normalizes official board posts', async () => {
  const connector = new GreenhouseJobBoardConnector({
    boardToken: 'example', employer: 'Example Hotel',
    fetchImpl: async () => new Response(JSON.stringify({ jobs: [{ id: 11, title: 'Bartender', location: { name: 'Malta' }, content: '<p>Visa sponsorship is available.</p>', absolute_url: 'https://boards.greenhouse.io/example/jobs/11', updated_at: '2026-11-01T10:00:00Z' }] }), { status: 200 }),
  });
  const [job] = await connector.fetchJobs();
  assert.equal(job.title, 'Bartender');
  assert.equal(job.employer, 'Example Hotel');
  assert.equal(job.location, 'Malta');
  assert.equal(connector.type, 'greenhouse_official_board');
});

test('Lever connector uses EU postings host when configured', async () => {
  let requestedUrl = '';
  const connector = new LeverJobBoardConnector({
    site: 'example-eu', region: 'eu', employer: 'Example EU Hotel',
    fetchImpl: async (url) => { requestedUrl = String(url); return new Response(JSON.stringify([{ id: 'p1', text: 'Barista', categories: { location: 'Cyprus' }, descriptionPlain: 'Coffee service', hostedUrl: 'https://jobs.eu.lever.co/example-eu/p1', createdAt: 1793520000000 }]), { status: 200 }); },
  });
  const [job] = await connector.fetchJobs();
  assert.match(requestedUrl, /api\.eu\.lever\.co/);
  assert.equal(job.title, 'Barista');
  assert.equal(job.location, 'Cyprus');
});
