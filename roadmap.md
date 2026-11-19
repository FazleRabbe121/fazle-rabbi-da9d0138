# Roadmap — ZENVIK-AGENT migration to Lovable Cloud
Decisions: crawler/Python simplified onto Cloud; ZENVIK recipes stay separate from the Recipe Book.

- [x] Restore portfolio build, mount ZENVIK-AGENT at /zenvik-agent behind passcode + sign-in
- [x] Phase 0: device "Export my data", file backups of data/*.json and jobhunter.db
- [x] Phase 1: private zen_* tables (empty), Gmail token + queue tables (backend only)
- [ ] Phase 2: re-runnable importers for the JSON files and jobhunter.db, with count checks
- [ ] Phase 3: backend functions per route group; point backend.ts at them
- [ ] Phase 4: queue + daily timer to replace the in-server scheduler
- [ ] Phase 5: Gmail server-side sign-in (needs Google OAuth client from owner)
- [ ] Phase 6: swap Gemini/OpenAI/Grok/Ollama for Lovable AI
- [ ] Phase 7: run old and new side by side, switch over, keep the old version as a fallback for 14 days
