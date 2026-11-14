# Configuration reference

| Variable | Required | Meaning |
|---|---|---|
| `AGENT_MODEL_PROVIDER` | Yes | `ollama` or `none`; no paid model fallback |
| `OLLAMA_BASE_URL` | If Ollama | Backend-reachable Ollama `/api` endpoint |
| `OLLAMA_MODEL` | If Ollama | Exact model tag already installed on the model host |
| `OLLAMA_TIMEOUT_MS` | No | Model request timeout (default 90000) |
| `OLLAMA_KEEP_ALIVE` | No | Ollama keep-alive duration (default `10m`) |
| `OLLAMA_BEARER_TOKEN` | No | Token for an authenticated reverse proxy, not native Ollama auth |
| `AGENT_SCHEDULER_SECRET` | For daily schedule | High-entropy bearer token for the scheduler route |
| `AGENT_ALLOW_APPROVED_EMAIL_SEND` | No | Default `false`; admin opt-in for manual sends, still gated by approval |
| `AGENT_AUTO_SEND_ENABLED` | No | Keep `false`; this release does not implement unapproved autonomous sends |
| `AGENT_MAX_JOBS_PER_SOURCE` | No | Per-source result ceiling |
| `AGENT_MAX_SOURCES_PER_RUN` | No | Maximum configured source count |
| `AGENT_MAX_STEPS_PER_RUN` | No | Orchestrator planning step ceiling |
| `AGENT_MAX_RUN_DURATION_MS` | No | Bounded mission duration |
| `GREENHOUSE_BOARD_TOKENS_JSON` | No | Admin-approved JSON array of `{boardToken, employer, enabled}` |
| `LEVER_SITES_JSON` | No | Admin-approved JSON array of `{site, employer, region, enabled}` |

Example board configuration (replace with actual employer board IDs after verification):

```json
[
  {"boardToken":"example-company","employer":"Example Company","enabled":true}
]
```

Do not add guessed board IDs or treat an employer as a sponsor because a public board exists. Add board configuration through the app's admin settings where possible rather than storing per-user values in a global environment variable.
