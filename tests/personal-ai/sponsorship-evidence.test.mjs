import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySponsorshipEvidence } from '../../src/personal-ai-engine/jobs/sponsorship-evidence.mjs';

test('confirms sponsorship only with explicit wording on a configured official source', () => {
  const result = classifySponsorshipEvidence({
    description: 'We will sponsor a work visa for eligible candidates.',
    sourceType: 'greenhouse_official_board',
    sourceUrl: 'https://boards.greenhouse.io/example/jobs/1',
  });
  assert.equal(result.status, 'confirmed');
  assert.equal(result.confidence, 'high');
  assert.match(result.evidenceQuote, /sponsor a work visa/i);
});

test('does not treat non-EU welcome as confirmed sponsorship', () => {
  const result = classifySponsorshipEvidence({
    description: 'Applicants from non-EU countries are welcome.',
    sourceType: 'official_employer',
    sourceUrl: 'https://employer.example/jobs/1',
  });
  assert.equal(result.status, 'possible');
  assert.notEqual(result.status, 'confirmed');
});

test('negative wording overrides positive signals', () => {
  const result = classifySponsorshipEvidence({
    description: 'Visa support is available for some roles, but we cannot sponsor a work visa for this vacancy.',
    sourceType: 'official_vacancy',
    sourceUrl: 'https://employer.example/jobs/1',
  });
  assert.equal(result.status, 'not_supported');
});

test('returns unknown rather than inventing sponsorship', () => {
  assert.equal(classifySponsorshipEvidence({ description: 'Competitive salary and free meals.' }).status, 'unknown');
});

test('treats possible sponsorship language as possible rather than confirmed', () => {
  const result = classifySponsorshipEvidence({
    description: 'The employer may sponsor a work visa for selected candidates.',
    sourceType: 'official_employer',
    sourceUrl: 'https://employer.example/jobs/1',
  });
  assert.equal(result.status, 'possible');
});
