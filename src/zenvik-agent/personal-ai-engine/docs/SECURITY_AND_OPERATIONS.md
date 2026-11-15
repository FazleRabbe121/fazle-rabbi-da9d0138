# Security and operations checklist

## Identity and data

- Obtain `userId` only from the existing server-side authentication middleware.
- Enforce tenant/user ownership in every repository query.
- Preserve the existing admin Gmail allowlist + optional PIN for Interview Center. This Agent Engine does not replace or broaden it.
- Reuse the existing CV Library and existing file permissions. Never expose CV text, passport data, tokens or private interview documents to another user.
- Treat job descriptions, uploaded files and web content as untrusted instructions/data.

## Model and secrets

- Keep all secrets in Google AI Studio / Cloud Run secrets or the existing backend secret manager.
- Never commit `.env`, service-account JSON, OAuth refresh tokens or API keys.
- Keep Ollama behind private networking or a protected proxy. The optional bearer token protects only a proxy that validates it.
- Do not silently fall back to paid OpenAI/Gemini/Claude providers. If the self-hosted model is down, return a clear unavailable status and keep non-AI deterministic operations usable where possible.

## External actions

- `AGENT_AUTO_SEND_ENABLED=false` by default. No daily automatic sending is implemented.
- `AGENT_ALLOW_APPROVED_EMAIL_SEND=false` by default. An administrator must enable manual approved sends only after verifying the existing Gmail adapter.
- Every send action needs a pending approval record and one atomic claim; duplicate clicks/retries must not send twice.
- Do not automatically submit external website forms, create accounts, accept offers or pay fees.
- A provider timeout during email send is an uncertain outcome. Mark `needs_review`; never blindly retry.

## Job evidence

- `confirmed` means explicit positive visa/work-permit sponsorship wording on a configured official employer/official vacancy source. It is not a guarantee that the candidate's nationality or individual case qualifies.
- `possible` is not confirmed. “Non-EU applicants welcome” does not prove sponsorship.
- Preserve exact evidence excerpt, canonical source URL and last checked timestamp.
- `unknown` must remain unknown where no reliable statement exists.
- Sponsorship classification is not legal advice or an immigration decision.

## Scheduling and reliability

- Use Cloud Scheduler or a durable external scheduler; do not run `setInterval` inside a serverless request process.
- Protect the daily scheduler endpoint with a high-entropy secret stored in the hosting Secrets panel.
- Process only users who opted in via `listAgentEnabledUsers()`.
- Use run IDs, idempotency keys, bounded concurrency and source-specific request limits.
- Keep retry logic safe. Do not retry an uncertain external side effect automatically.

## Privacy and retention

- Define retention for logs, interview transcripts, draft emails and CV-derived text.
- Add data export/deletion support consistent with the existing app's privacy obligations.
- Avoid sending sensitive data into third-party AI services. Self-hosted inference still requires access controls on the model host.
- Do not store raw model prompts containing full CVs in application logs.
