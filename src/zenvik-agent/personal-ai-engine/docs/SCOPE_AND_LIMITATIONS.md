# Scope and limitations

## Included

- Self-hosted Ollama model adapter; no OpenAI, Gemini or Claude runtime fallback.
- Bounded, allow-listed multi-agent orchestration.
- Greenhouse and Lever public-board connectors (only configured boards; not a universal job crawler).
- Conservative sponsorship evidence classification with source provenance.
- Explainable candidate-fit prioritization.
- Draft generation using the host application's selected central CV.
- Approval-gated Gmail sending through the host application's existing adapter.
- Interview practice/evaluation through host-provided PDF retrieval and access controls.
- Signed daily scheduler endpoint and run idempotency contract.
- Optional React Mission Control component.

## Not included / not claimed

- A newly trained foundation model or guaranteed ChatGPT/Claude parity.
- A universal crawler for every European job site.
- Guaranteed sponsorship, visa eligibility or job outcomes.
- Automatic application/email sending without an individual approval.
- A production database adapter for an unknown host schema.
- Live Google AI Studio integration, deployment, Gmail delivery or Ollama benchmark.
- Automatic self-modifying production code or unrestricted computer/browser control.

## Integration prerequisite

The host app must implement the adapter contract in `docs/HOST_APP_ADAPTER.md`, connect it to existing auth/data/CV/Gmail/interview services, and run the host application's regression tests.
