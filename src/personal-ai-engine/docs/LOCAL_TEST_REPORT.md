# Local validation report — v1.0.0

Validation performed in the generated integration-kit workspace before packaging.

## Results

- `npm run check`: PASS — Node.js syntax check completed for all `.mjs` source and test files.
- `npm test`: PASS — 22 tests, 22 passed, 0 failed.
- `AgentMissionControl.tsx`: PASS — standalone TypeScript syntax/type check using a temporary minimal React declaration shim because this package intentionally does not install or vendor the host application's React dependency.

## Coverage represented by the test suite

- Application drafts reuse the selected/default CV reference.
- Email send is disabled by default and requires admin opt-in plus a one-time user approval.
- Approval claims prevent duplicate side effects; uncertain outcomes become manual-review state.
- Greenhouse and Lever connector normalization.
- Daily job discovery idempotency, vacancy deduplication and source error handling.
- Authenticated user identity comes from the host adapter, not request bodies.
- Scheduler secret validation and request body size limits.
- Interview identity isolation, minimum duration and no fabricated scores / pronunciation scores.
- Ollama structured-response client behavior.
- Multi-agent registry allow-list and execution trace.
- Sponsorship evidence classification, including negative and ambiguous wording.

## Not tested in this isolated package

- No live Ollama server or model was configured or benchmarked.
- No real CareerPilot production database migration was run.
- No live Gmail message was sent.
- No live Google AI Studio / Cloud Run deployment was executed.
- No end-to-end regression test against the actual CareerPilot main application was possible because its complete source repository was not present in the files available for this package build.
- The host application's React version, router, CSS tokens, authentication middleware, database schema and existing adapters still require integration-time typecheck and regression tests.

These results validate the module's local behavior only. They do not certify production readiness of the host application after integration.
