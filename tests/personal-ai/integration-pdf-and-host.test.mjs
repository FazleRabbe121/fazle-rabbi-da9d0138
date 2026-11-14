import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CareerAgentPlatform,
  InMemoryAgentRepository,
  renderPdfKit,
  inspectDocument,
  assertDocumentQuality,
  assertHostAppAdapter,
  createAgentRequestHandler,
} from '../../src/personal-ai-engine/index.mjs';

class DeterministicJsonModelClient {
  async generateJSON({ user }) {
    if (user?.language === 'English' || user?.instruction) {
      return {
        title: 'Hospitality Sponsorship & Career Readiness Dossier',
        subtitle: 'Personal AI Document Intelligence Verification',
        sections: [
          {
            heading: 'Candidate Profile & Verified Experience',
            paragraphs: [
              'Candidate holds more than five years of verified international hospitality experience across waiter, barista, and mixology service in high-volume hotels and specialty coffee venues.',
              'All statements in this document are strictly grounded in the single-source CV Library without fabricated employers or unverified claims.',
            ],
            bullets: [
              'Espresso extraction and grinder calibration (18g dose, 36g yield in 27-29 seconds)',
              'Full table service, wine pairing fundamentals, and POS billing accuracy',
              'HACCP food safety and allergen matrix compliance across all shifts',
            ],
            table: {
              headers: ['Market', 'Target Role', 'Evidence Policy'],
              rows: [
                ['Europe (Malta/Cyprus)', 'Waiter / Barista', 'Confirmed or Possible Only'],
                ['GCC / Middle East', 'Hospitality Supervisor', 'Verified Employer Permit'],
              ],
            },
          },
          {
            heading: 'Sponsorship Evidence Policy',
            paragraphs: [
              'Personal AI never marks an opportunity as 100% sponsored without explicit visa or work-permit evidence in the official vacancy text from a verified employer or public job board.',
            ],
            bullets: [
              'Confirmed: Explicit visa sponsorship or work permit support stated on an official source',
              'Possible: International, EU, or relocation hints requiring employer verification',
              'Not Supported: Explicit statement that no sponsorship is available',
            ],
          },
        ],
        sources: [
          {
            title: 'CareerPilot Official Hospitality Registry',
            url: 'https://careers.example.com/hospitality-policy',
          },
        ],
      };
    }
    return {};
  }
}

test('renderPdfKit generates a valid multi-section binary PDF buffer with pdfkit', async () => {
  const spec = {
    title: 'CareerPilot Personal AI Verification Report',
    subtitle: 'Automated Integration & PDF Engine Test',
    author: 'CareerPilot Personal AI',
    dateLabel: '2026-11-02',
    sections: [
      {
        heading: 'Architecture & Isolation',
        paragraphs: [
          'The Personal AI system operates in an isolated namespace (/api/agent/v1/*) without modifying the existing GEN MODEL GEN HASH 1 Gemini service. It enforces strict approval gates, duplicate vacancy prevention, and automated PDF quality checks before rendering.',
        ],
        bullets: [
          'AgentOrchestrator and CareerAgentPlatform active',
          'Approval-gated application and follow-up workflows',
          'Binary PDF rendering with pdfkit and quality inspection',
        ],
        table: {
          headers: ['Subsystem', 'Status', 'Verification'],
          rows: [
            ['Job Discovery & Deduplication', 'Active', 'Passed'],
            ['Sponsorship Classifier', 'Active', 'Passed'],
            ['Document Intelligence PDF', 'Active', 'Passed'],
          ],
        },
      },
    ],
    sources: [
      {
        title: 'CareerPilot Architecture Specification v1.1.0',
        url: 'https://careerpilot.example/docs/architecture',
      },
    ],
  };

  const qualityReport = inspectDocument(spec);
  assert.equal(qualityReport.passed, true);
  assert.doesNotThrow(() => assertDocumentQuality(spec));

  const pdfBuffer = await renderPdfKit(spec);
  assert.ok(Buffer.isBuffer(pdfBuffer));
  assert.ok(pdfBuffer.length > 500);
  assert.equal(pdfBuffer.subarray(0, 5).toString('ascii'), '%PDF-');
});

test('CareerAgentPlatform end-to-end document creation, job deduplication, sponsorship verification, and HTTP handler', async () => {
  const repository = new InMemoryAgentRepository();
  const model = new DeterministicJsonModelClient();

  const officialSource = {
    id: 'valletta_official_careers',
    name: 'Valletta Harbour Bistro Official Careers',
    type: 'official_employer',
    sourceUrl: 'https://careers.vallettabistro.example/jobs',
    async fetchJobs() {
      return [
        {
          id: 'job-001',
          url: 'https://careers.vallettabistro.example/jobs/barista-waiter?utm_source=test',
          title: 'Specialty Barista & Waiter',
          employer: 'Valletta Harbour Bistro',
          location: 'Valletta, Malta',
          country: 'Malta',
          language: 'English',
          applicationEmail: 'careers@vallettabistro.example',
          description:
            'Seeking an experienced Waiter and Specialty Barista. We will sponsor a work visa and provide work permit support for eligible candidates.',
        },
      ];
    },
  };

  const host = assertHostAppAdapter({
    async getAuthenticatedUser() {
      return { userId: 'owner-1', email: 'fazle.rabbe.doc@gmail.com' };
    },
    async getCandidateProfile() {
      return {
        fullName: 'Fazle Rabbi',
        targetRoles: ['Waiter', 'Barista'],
        skills: ['espresso', 'customer service', 'table service', 'pos'],
        targetCountries: ['Malta'],
        yearsExperience: 5,
        requiresSponsorship: true,
        defaultCvId: 'cv-main-1',
      };
    },
    async getCvText() {
      return 'Fazle Rabbi - Senior Waiter & Barista with 5+ years hospitality experience in espresso extraction, table service, POS, and guest relations.';
    },
    async getConfiguredJobSources() {
      return [officialSource];
    },
    async sendApplication() {
      return { accepted: true, applicationId: 'app-1', messageId: 'msg-1' };
    },
    async listAgentEnabledUsers() {
      return ['owner-1'];
    },
  });

  const platform = new CareerAgentPlatform({
    repository,
    model,
    host,
    sources: [officialSource],
    renderer: renderPdfKit,
  });

  // 1. Discover jobs and verify sponsorship evidence
  const discovery1 = await platform.discoverJobs({ userId: 'owner-1' });
  assert.equal(discovery1.matchedJobs, 1);
  assert.equal(discovery1.jobs[0].sponsorshipEvidence.status, 'confirmed');

  // 2. Re-run discovery to verify duplicate prevention via stableVacancyKey in repository
  await platform.discoverJobs({ userId: 'owner-1' });
  const storedJobs = await repository.listVacancies('owner-1');
  assert.equal(storedJobs.length, 1);

  // 3. Generate PDF document through platform.documents.createDocument
  const docRun = await platform.documents.createDocument({
    userId: 'owner-1',
    type: 'report',
    language: 'English',
    instruction: 'Create a Malta Hospitality Opportunity & Sponsorship Verification Dossier',
  });
  assert.equal(docRun.qualityReport.passed, true);
  assert.ok(Buffer.isBuffer(docRun.pdf));
  assert.equal(docRun.pdf.subarray(0, 5).toString('ascii'), '%PDF-');

  // 4. Test HTTP handler for /api/agent/v1/documents/review and /api/agent/v1/documents/pdf
  const handler = createAgentRequestHandler({
    platform,
    authorizeRequest: async () => ({ userId: 'owner-1' }),
  });

  const reviewRes = await handler(
    new Request('https://app.example/api/agent/v1/documents/review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ document: docRun.document }),
    })
  );
  assert.equal(reviewRes.status, 200);
  const reviewBody = await reviewRes.json();
  assert.equal(reviewBody.qualityReport.passed, true);

  const pdfRes = await handler(
    new Request('https://app.example/api/agent/v1/documents/pdf', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'report',
        language: 'English',
        instruction: 'Create a Malta Hospitality Opportunity & Sponsorship Verification Dossier',
      }),
    })
  );
  assert.equal(pdfRes.status, 200);
  assert.equal(pdfRes.headers.get('content-type'), 'application/pdf');
});
