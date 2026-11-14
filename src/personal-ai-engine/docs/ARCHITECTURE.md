# Architecture

## Runtime topology

```text
Android phone (owner UI / approval console)
        |
        v
Existing CareerPilot web app (React UI + authenticated backend)
        |
        +-- existing Auth / user identity
        +-- existing single CV Library
        +-- existing Gmail OAuth + application history
        +-- existing Interview Centre + approved participant access
        +-- existing database and uploaded PDFs
        |
        v
CareerPilot Agent Engine (additive module)
        |
        +-- Agent Orchestrator (allow-listed agents only)
        +-- Ollama Model Client (self-hosted open-weight model)
        +-- Job Discovery connectors (configured Greenhouse / Lever boards)
        +-- Sponsorship Evidence Classifier
        +-- Candidate Fit Scorer
        +-- Application Draft Service
        +-- Approval Service
        +-- Interview Practice / Evaluation Service
        +-- Daily Run Service
        |
        v
Existing database adapter + additive agent_* records
        |
        +-- Audit trail / approvals / jobs / drafts / interview sessions / runs
        |
        v
Private model host (Ollama) + Cloud Scheduler (signed daily trigger)
```

## Design boundaries

1. **Model / orchestration separation.** Ollama is an inference provider, not the Agent Engine. The Agent Engine may be adapted to another self-hosted model interface without changing application workflows.
2. **Host app is the source of truth.** The existing profile, CV Library, Gmail OAuth, application status, interview allowlist and uploaded interview PDFs remain authoritative. This package must not create parallel CVs, OAuth tokens or candidate profiles.
3. **Least privilege.** The orchestrator only invokes registered agents. No arbitrary shell or browser automation tool is exposed by default.
4. **External side effects are gated.** Application email sending is disabled until admin opt-in and still requires a unique user approval. No job application is submitted by the daily discovery cycle.
5. **Evidence is inspectable.** Sponsorship decisions include status, confidence, source URL, evidence excerpt and reasoning.
6. **Daily execution is stateless at the service layer.** The scheduler invokes a signed endpoint; the persistent database records runs. Do not rely on in-process timers in scale-to-zero hosting.
7. **Per-user isolation.** The authenticated host app supplies `userId`. Request-body values cannot choose another user's data partition.

## Agent roles included

- `job-discovery`
- `sponsorship-evidence-review`
- `candidate-fit-ranking`
- `job-ranking`
- `application-drafting`
- `interview-preparation`

More specialist agents can be added by registering explicit capabilities. Keep external actions out of autonomous planning unless separately protected by a permission/approval service.

## Current scope and non-goals

This is an integration foundation, not a trained foundation model and not a full autonomous browser operator. It does not promise ChatGPT/Claude parity, unrestricted web coverage, automatic visa/legal determinations, automatic Gmail sending, or self-modifying production code. Those would require separate models, infrastructure, tests, security review and provider permissions.
