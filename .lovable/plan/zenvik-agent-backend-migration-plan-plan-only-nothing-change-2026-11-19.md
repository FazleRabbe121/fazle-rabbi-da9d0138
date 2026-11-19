# ZENVIK-AGENT backend migration plan (plan only, nothing changes yet)

## Goal
Move the ZENVIK-AGENT server features (the Express server in `server.ts`, its JSON files, the Python JobHunter, Firebase storage and browser-held Gmail tokens) onto Lovable Cloud. The website must still work as a static site, and the portfolio, recipe book, sign-in and current data must stay exactly as they are.

## What I checked (facts read from the code and the database)
- **Live Cloud data, counted this turn:** 2 accounts, 1 recipe, 16 categories, 1 contact message, 0 admin roles, 0 recipe photos. These must not change.
- **Express server addresses:** about 45 in `server.ts`, plus 5 groups of routes: interview (`/api/interview`, 18), agent (`/api/agent/v1`, 22), personal AI (`/api/personal-ai`, 11), recipe book (`/api/recipe-book`, 9) and an internal daily scheduler.
- **Local files the server reads and writes:**
  - Saved in the repo: `data/job_discovery_database.json` (~447 KB), `interview_center_db.json`, `scheduler_quota_state.json`.
  - Created only while the server runs: `personal_ai_agent_db.json`, `personal_ai_conversations.json`, `recipe_book_database.json`.
- **Python JobHunter:** started with `spawn('python3', bridge.py)`.
  - It keeps a SQLite file, `jobhunter-agent/data/jobhunter.db`, with tables for companies, emails, outbox, suppression, searches, gemini_cache, ai_task_queue, events, cv_gallery and kv.
  - It needs httpx, dnspython and tzdata, and talks to Gmail, Telegram and Gemini.
- **Background work:** one repeating timer in `server.ts` (line ~2982), plus "catch up when the server wakes" logic.
- **Gmail:** Firebase Google sign-in asks for permission to send and read Gmail. The access token stays in the browser and is sent straight to the Gmail API. There is no refresh token today.
- **Firebase Firestore:** `users/{uid}` plus `settings`, `relapses`, `finance`, `familyMoney`, `recipes` and `reports`.
- **Browser-only storage:** about 17 named saved items on the device (CV library, applied jobs, access level and so on).
- **Unknowns I can't see from here:** how many records are in Firestore, how many rows are in the Python database, what each person has saved in their browser, which Google Cloud project the Gmail sign-in uses, and whether Gemini, OpenAI or Grok keys exist anywhere.

## Main architecture decision (needs your OK)
The site must stay a static GitHub Pages app, so the project's server functions can't be used. That leaves two options:
- **Option A (recommended):** Cloud backend functions plus database helpers, with built-in background jobs and timers. This works from GitHub Pages, Lovable hosting and the Android app.
- **Option B:** keep a small Node/Python worker that you host yourself (for example a VPS or Cloud Run) only for the crawler and Python parts. Everything else moves to Cloud.

The plan assumes A, with B as the fallback for whatever can't be ported.

## What fits on Cloud and what doesn't
- **Can be ported directly (logic rewritten in TypeScript):** job scoring, sponsorship checks, text tools, building drafts, the Greenhouse and Lever job feeds, interview scoring, recipe CRUD and search, cover-letter and report AI, and email address checks.
- **Needs a rewrite or simplification:**
  - **Crawler and job discovery:** must run in small batches through a queue, because each function call is short (seconds to a few minutes) and can't run continuously.
  - **Gmail inbox checking:** becomes a timed job using stored refresh tokens.
  - **Telegram:** becomes a simple outgoing message.
  - **DNS/MX checks:** become an online DNS lookup.
- **Not possible on Cloud:**
  - Starting Python processes.
  - A permanent SQLite file (it moves to database tables).
  - Ollama on your own machine (replaced by Lovable AI, or Option B).
  - Speech-to-text and text-to-speech need checking against Lovable AI's capabilities first. Until then they're marked unknown.
  - The project zip download, `/api/export/project-zip`, should become a file in storage or be dropped.

## Phases
### Phase 0 — Safety net (about 1 day, no changes to anything)
- Export the Cloud tables and storage list.
- Copy all `data/*.json` files and `jobhunter.db`.
- Add an "Export my data" button to ZENVIK-AGENT that downloads the device's saved data and Firestore data as JSON.
- Write down the starting record counts.
- **No-go if any export fails.**

### Phase 1 — Database tables (2–3 days)
- Every new table belongs to one account, with access rules so each person sees only their own rows. Admin checks use the existing roles table.
- **Tables:**
  - **Jobs:** `zen_jobs` (from job_discovery), `zen_job_applications` (applied, dismissed, the 10-day hide), `zen_rejections`.
  - **Documents:** `zen_cover_letters`, `zen_cv_documents`.
  - **Interviews:** `zen_interview_participants`, `zen_interview_attempts`, `zen_interview_rubric`.
  - **AI:** `zen_ai_conversations`, `zen_ai_messages`, `zen_agent_state`.
  - **Personal records (from Firestore):** `zen_finance`, `zen_family_money`, `zen_relapses`, `zen_reports`, `zen_user_settings`.
  - **From the Python database:** `zen_companies`, `zen_outbox`, `zen_suppression`, `zen_events`, `zen_ai_cache`.
  - **Gmail:** `zen_gmail_tokens` (encrypted, readable only by the backend).
  - **Background work:** `zen_job_queue`.
- **CCD's separate recipe list:** the plan maps it into the existing `recipes` table. You need to confirm this; until then it stays in its own table.
- **Data access:** the website reads and writes through the normal client with access rules. Grouped actions use database helpers.

### Phase 2 — Bring the data across (2–3 days)
- One import tool per source, using a stable key so it can be re-run without creating duplicates.
- After each run, compare counts and spot-check a sample of records.
- Nothing is deleted at the source.

### Phase 3 — Backend functions (5–8 days)
- One backend function per route group: `zen-jobs`, `zen-ai`, `zen-interview`, `zen-agent`, `zen-recipes`, `zen-gmail`, `zen-python-port`.
- The browser bridge (`backend.ts`) starts sending `/api/*` calls to these functions. The screens themselves don't change.
- Each call checks who is signed in, and inputs are checked before use.

### Phase 4 — Background jobs (2–3 days)
- A queue table plus a timer at the lowest useful frequency. The daily run replaces the in-server timer.
- The queue wakes when work is added and stops when it's empty, to keep Cloud costs down.

### Phase 5 — Gmail (3–4 days, highest risk)
- A server-side Google sign-in flow that stores an encrypted refresh token.
- Ask for the smallest permissions possible: sending first, reading only for reply tracking.
- Google's verification for reading Gmail may take weeks. **Unknown.**
- Includes revoke/disconnect, sending only after your approval (matching `AGENT_ALLOW_APPROVED_EMAIL_SEND`) and a daily sending limit.

### Phase 6 — AI providers (1–2 days)
- Gemini, OpenAI and Grok are replaced by Lovable AI, with no keys in the website code.
- The 3-AI "consensus" becomes several calls to different Lovable AI models. Ollama goes to Option B, or is retired.

### Phase 7 — Move over and switch off the old parts (2 days)
- Run old and new side by side, with a setting that lets each feature read from either.
- Keep an "old source" switch for 14 days.
- Retire Firebase, the JSON files and Python only after counts and tests pass.

### Android
- Point the app's built-in website at the Cloud function addresses. The Android code itself doesn't change.

## Security tests
- One account can't read another account's rows on any new table.
- People who aren't signed in get nothing.
- Gmail tokens are never returned to the browser.
- Admin-only interview pages can't be reached by non-admins.
- Rate limits hold, and a security scan is clean.

## Acceptance tests (per feature, run while signed in)
- The portfolio, recipe book, logos and events look unchanged.
- Recipe counts stay the same.
- Each ZENVIK screen loads, saves and reloads its data.
- Job search returns results.
- An application draft sends to a test Gmail address.
- An interview attempt is scored.
- An AI chat reply is saved.
- Nothing claims to work until a test has actually run it.

## Effort
About 20–30 working days in total. The ranges above are rough. Gmail verification time with Google is outside our control.

## Main risks
- Google's approval for Gmail access.
- Crawler limits.
- Data that exists only in people's browsers can't be read by the server.
- Firestore access may need your Firebase admin login.
- Speech features aren't confirmed.

## No-go checklist (stop if any is true)
- No backup, or counts don't match after an import.
- Any access-rule test fails, or tokens are visible to the browser.
- The portfolio or recipe book changes in any way.
- Gmail sign-in isn't approved, but sending would go live anyway.
- The rollback switch hasn't been tested.
- Any secret ends up in the website code.
