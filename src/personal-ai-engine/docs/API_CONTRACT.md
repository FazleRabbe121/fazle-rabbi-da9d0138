# HTTP API contract

All `/api/agent/v1/*` routes must be mounted behind the existing app's authentication and tenant authorization middleware. The `userId` comes from the verified session, never from JSON input.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/agent/v1/health` | Agent/model configuration status |
| POST | `/api/agent/v1/missions/execute` | Bounded multi-agent task plan |
| POST | `/api/agent/v1/jobs/discover` | Discover from configured sources |
| GET | `/api/agent/v1/jobs?limit=50` | List saved opportunities |
| POST | `/api/agent/v1/daily/run` | Run one user's daily discovery cycle |
| GET | `/api/agent/v1/actions?limit=50` | List pending approval actions |
| POST | `/api/agent/v1/applications/draft` | Prepare CV-based application draft |
| POST | `/api/agent/v1/applications/request-send` | Create approval request for a draft |
| POST | `/api/agent/v1/actions/:id/approve` | Approve and execute one permitted action |
| POST | `/api/agent/v1/actions/:id/reject` | Reject a pending action |
| POST | `/api/agent/v1/interviews/start` | Start interview practice |
| POST | `/api/agent/v1/interviews/:id/answers` | Submit answer and evaluate (when model is available) |
| POST | `/api/agent/v1/interviews/:id/finish` | Finish after target duration and question requirements |

Scheduled route:

| Method | Route | Authorization |
|---|---|---|
| POST | `/internal/agent/v1/scheduler/daily` | `Authorization: Bearer <AGENT_SCHEDULER_SECRET>` |

## Example payloads

Discover jobs:

```json
{"roles":["Bartender","Barista","Waiter"],"countries":["Malta","Greece","Croatia"]}
```

Draft application:

```json
{"vacancyId":"<saved-vacancy-id>"}
```

Request send approval:

```json
{"draftId":"<draft-id>"}
```

Mission:

```json
{"goal":"Find new bartender vacancies in configured European employer boards and rank them by candidate fit and sponsorship evidence.","context":{}}
```

Interview start:

```json
{"category":"Bartender","level":2,"mode":"spoken"}
```

## Response principles

- Return `503 MODEL_UNAVAILABLE` when self-hosted model is not reachable for AI-dependent work.
- Never fabricate model evaluation scores. Save the answer and clearly state that evaluation is pending when the model is unavailable.
- Keep job source errors per source; one failing board should not erase jobs from other sources.
- Include sponsorship evidence status and source provenance in job records.
- `accepted_by_mail_provider` means provider accepted the message, not confirmed delivery.
