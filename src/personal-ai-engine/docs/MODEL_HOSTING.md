# Self-hosted model hosting (no paid LLM API required)

## Recommended setup

- Use an always-on Linux server / VM with RAM and (for larger models) GPU sized for the chosen model.
- Install Ollama on that server and pull a model that its memory can support.
- Keep Ollama private behind a VPN/private network or an authenticated reverse proxy.
- Set `OLLAMA_BASE_URL` to a URL reachable from the CareerPilot backend, not the Android phone's `localhost`.
- If a reverse proxy expects a bearer token, set `OLLAMA_BEARER_TOKEN` in the host's secrets manager.
- Do not expose port `11434` publicly without access controls. The native Ollama API does not provide production-grade user authentication by itself.

## Why the Android phone is not the model server

Your phone can manage the app and approve actions. A cloud-hosted backend cannot access `127.0.0.1` on your phone. Keeping a phone awake for a 24-hour AI service is also fragile. The model should run on a separate server that remains online.

## Cost and limits

Self-hosting avoids hosted LLM token billing, but does not mean zero cost or mathematically unlimited usage. Throughput is limited by the server's CPU/GPU/RAM, concurrency, storage, electricity and uptime. Hosting, backups, traffic and external job/email providers may still charge or impose quotas.

## Model quality

Use the best open-weight model that fits the server. The Agent Engine supplies tool boundaries, task routing, workflow state and approval controls; it does not turn a smaller model into ChatGPT or Claude. Benchmark the model on your own CV drafting, job classification, interview scoring and tool-planning test set before relying on it.

## Suggested operating controls

- Start with one model and low concurrency.
- Set run duration, source count, job count and request timeouts.
- Save prompts/model names/model revisions with each run.
- Redact CV/passport/contact data from routine logs.
- Do not use the model to decide legal work-permit eligibility. Require official-source evidence and human verification.
