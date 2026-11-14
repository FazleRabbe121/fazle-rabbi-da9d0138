# Implementation plan

## Stage A — Host discovery
- Confirm correct app repository.
- Inventory framework, auth, DB, CV Library, Gmail, job feeds, Interview Center, PDFs and scheduler.
- Establish baseline test/build status.

## Stage B — Safe foundation
- Add the Agent Engine as a backend-only module.
- Implement production repository + host adapter.
- Wire self-hosted Ollama connectivity and health.
- Keep local in-memory repository out of production builds.

## Stage C — Job intelligence
- Connect admin-configured official sources.
- Add evidence provenance and conservative sponsorship categories.
- Add explainable fit scoring and idempotent dedupe.
- Reuse current job lists/application data.

## Stage D — Application workflows
- Reuse central CV Library and text extraction.
- Generate drafts and missing-fact warnings.
- Reuse existing Gmail OAuth/attachments only.
- Require admin opt-in + user approval; no autonomous sends.

## Stage E — Interview workflows
- Reuse the current allowlist/PIN and restricted interview-only routes.
- Retrieve the user's uploaded PDFs through the current knowledge store.
- Add source-grounded question generation, answer scoring and timer rules.
- Preserve existing categories, progress and candidate results.

## Stage F — Durable operations
- Add signed scheduler endpoint to Cloud Scheduler.
- Process only opted-in users and prevent overlapping runs.
- Add owner dashboard and execution/audit history.

## Stage G — Verification
- Unit/integration tests and existing-app regression tests.
- Non-production Gmail flow with mock/test account only.
- Verify source data, RLS, user isolation, backups and rollback.
- Do not deploy or enable sending before owner sign-off.
