import React, { useCallback, useEffect, useState } from "react";
import "./agent-mission-control.css";

type Job = {
  id: string;
  title: string;
  employer: string;
  location: string;
  url: string | null;
  sponsorshipEvidence?: { status?: string; reason?: string; sourceUrl?: string | null };
  opportunityScore?: { score?: number; label?: string; explanation?: string[] };
};
type ApprovalAction = { id: string; summary: string; createdAt?: string };
type Props = { apiBase?: string };

/** Optional React reference UI. Reuse the host app's auth and design tokens. */
export function AgentMissionControl({ apiBase = "/api/agent/v1" }: Props) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading Agent Engine status…");
  const [health, setHealth] = useState<{ model: string; modelHealth?: { reachable?: boolean; modelInstalled?: boolean }; approvedEmailSendEnabled?: boolean } | null>(null);
  const [actions, setActions] = useState<ApprovalAction[]>([]);

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      credentials: "include",
      headers: { "content-type": "application/json", ...(init?.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }, [apiBase]);

  const refresh = useCallback(async () => {
    try {
      const [status, result, pending] = await Promise.all([request("/health"), request("/jobs?limit=50"), request("/actions?limit=30")]);
      setHealth(status);
      setJobs(result.jobs || []);
      setActions(pending.actions || []);
      setMessage("Agent Engine is connected to the application account.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load Agent Engine.");
    }
  }, [request]);

  useEffect(() => { void refresh(); }, [refresh]);

  const decide = async (actionId: string, decision: "approve" | "reject") => {
    setBusy(true);
    setMessage(decision === "approve" ? "Submitting approved action…" : "Rejecting action…");
    try {
      await request(`/actions/${encodeURIComponent(actionId)}/${decision}`, { method: "POST", body: JSON.stringify({ reason: "Rejected in Agent Mission Control." }) });
      setMessage(decision === "approve" ? "Action processed. Check application status for the provider result." : "Action rejected.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Approval action failed.");
    } finally { setBusy(false); }
  };

  const run = async (path: string, label: string) => {
    setBusy(true);
    setMessage(`${label} is running…`);
    try {
      const result = await request(path, { method: "POST", body: JSON.stringify({}) });
      setMessage(result.note || result.message || `${label} completed. Review the result below.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `${label} failed.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="agent-mission" aria-label="AI Agent Mission Control">
      <header className="agent-mission__header">
        <div>
          <p className="agent-mission__eyebrow">CAREER OPERATIONS</p>
          <h1>AI Agent Mission Control</h1>
          <p>Job discovery, sponsorship evidence, application preparation and interview practice.</p>
        </div>
        <span className={`agent-mission__status ${health?.modelHealth?.reachable && health?.modelHealth?.modelInstalled ? "is-ready" : ""}`}>{health ? `${health.modelHealth?.reachable && health.modelHealth?.modelInstalled ? "Ollama ready" : health.model === "configured" ? "Model configured · connection needs review" : "Model not configured"}` : "Checking"}</span>
      </header>
      <div className="agent-mission__actions">
        <button type="button" disabled={busy} onClick={() => void run("/jobs/discover", "Job discovery")}>Discover jobs</button>
        <button type="button" className="is-secondary" disabled={busy} onClick={() => void run("/daily/run", "Daily cycle")}>Run daily cycle</button>
        <button type="button" className="is-ghost" disabled={busy} onClick={() => void refresh()}>Refresh</button>
      </div>
      <p className="agent-mission__message" role="status">{message}</p>
      <div className="agent-mission__section-heading">
        <h2>Pending approvals</h2><span>{actions.length} waiting</span>
      </div>
      {actions.length === 0 ? <div className="agent-mission__empty">No pending actions. Application emails remain disabled until an administrator enables approved sending.</div> : (
        <div className="agent-mission__approvals">
          {actions.map((action) => (
            <article className="agent-mission__approval" key={action.id}>
              <p>{action.summary}</p>
              <div className="agent-mission__approval-actions">
                <button type="button" disabled={busy || !health?.approvedEmailSendEnabled} onClick={() => void decide(action.id, "approve")}>Approve</button>
                <button type="button" className="is-secondary" disabled={busy} onClick={() => void decide(action.id, "reject")}>Reject</button>
              </div>
              {!health?.approvedEmailSendEnabled && <small>Approved sending is disabled by the administrator.</small>}
            </article>
          ))}
        </div>
      )}
      <div className="agent-mission__section-heading">
        <h2>Prioritised opportunities</h2><span>{jobs.length} saved</span>
      </div>
      {jobs.length === 0 ? <div className="agent-mission__empty">No saved opportunities yet. Run job discovery after official sources are configured.</div> : (
        <div className="agent-mission__list">
          {jobs.map((job) => (
            <article className="agent-mission__job" key={job.id}>
              <div className="agent-mission__job-top">
                <div><h3>{job.title}</h3><p>{job.employer} · {job.location || "Location not supplied"}</p></div>
                <strong>{job.opportunityScore?.score ?? "—"}<small>/100</small></strong>
              </div>
              <div className="agent-mission__meta">
                <span>{job.sponsorshipEvidence?.status || "unknown sponsorship"}</span>
                <span>{job.opportunityScore?.label || "Not scored"}</span>
              </div>
              <p className="agent-mission__reason">{job.sponsorshipEvidence?.reason || "Sponsorship evidence has not been assessed."}</p>
              <div className="agent-mission__links">
                {job.url && <a href={job.url} target="_blank" rel="noreferrer">Open vacancy</a>}
                {job.sponsorshipEvidence?.sourceUrl && <a href={job.sponsorshipEvidence.sourceUrl} target="_blank" rel="noreferrer">Evidence source</a>}
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="agent-mission__footnote">A fit score is a prioritisation aid, not a hiring probability. Confirmed sponsorship requires explicit evidence and personal eligibility checks. Application emails require admin opt-in plus a separate owner approval; the daily cycle never sends emails.</p>
    </section>
  );
}
