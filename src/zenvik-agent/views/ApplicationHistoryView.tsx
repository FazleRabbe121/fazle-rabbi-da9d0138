import React, { useState, useMemo, useEffect } from 'react';
import {
  Clock,
  Search,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Calendar,
  Mail,
  FileSpreadsheet,
  RefreshCw,
  FileText,
  Globe,
  EyeOff,
  Bookmark,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import {
  loadAppliedJobRecords,
  AppliedJobRecord,
  fetchApplicationHistoryFromBackend,
  BackendJobRecord,
  simulateSponsorshipFollowUpWindow,
} from '../services/jobDatabaseService';
import {
  loadLocalSendingHistory,
  loadPreservedFailedApplications,
} from '../services/gmailService';
import {
  getConnectedSpreadsheetId,
  getSpreadsheetUrl,
  syncAllApplicationsToSheet,
  createJobTrackerSpreadsheet,
} from '../services/sheetsService';

type HistoryCategoryTab = 'all' | 'applied' | 'followup' | 'failed' | 'pending' | 'saved' | 'dismissed';

export const ApplicationHistoryView: React.FC<{ onNavigateToSheets?: () => void }> = ({ onNavigateToSheets }) => {
  const { theme } = useTheme();

  const [appliedRecords, setAppliedRecords] = useState<AppliedJobRecord[]>(() => loadAppliedJobRecords());
  const [sendingHistory, setSendingHistory] = useState(() => loadLocalSendingHistory());
  const [preservedFailedDrafts, setPreservedFailedDrafts] = useState(() =>
    Object.values(loadPreservedFailedApplications())
  );
  const [backendHistory, setBackendHistory] = useState<BackendJobRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusTab, setStatusTab] = useState<HistoryCategoryTab>('all');
  const [expandedCoverLetterId, setExpandedCoverLetterId] = useState<string | null>(null);
  const [connectedSheetId, setConnectedSheetId] = useState<string | null>(() => getConnectedSpreadsheetId());
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [sheetsSyncMsg, setSheetsSyncMsg] = useState<string | null>(null);

  const refreshHistory = async () => {
    setAppliedRecords(loadAppliedJobRecords());
    setSendingHistory(loadLocalSendingHistory());
    setPreservedFailedDrafts(Object.values(loadPreservedFailedApplications()));
    try {
      const bHist = await fetchApplicationHistoryFromBackend();
      setBackendHistory(bHist);
    } catch {}
  };

  useEffect(() => {
    refreshHistory();
    window.addEventListener('application_history_updated', refreshHistory);
    return () => window.removeEventListener('application_history_updated', refreshHistory);
  }, []);

  const handleSyncSheets = async () => {
    setIsSyncingSheets(true);
    setSheetsSyncMsg(null);
    try {
      let sheetId = connectedSheetId;
      if (!sheetId) {
        const newSheet = await createJobTrackerSpreadsheet();
        sheetId = newSheet.id;
        setConnectedSheetId(sheetId);
      }
      const res = await syncAllApplicationsToSheet(sheetId, appliedRecords);
      setSheetsSyncMsg(`Synced: ${res.added} added, ${res.skipped} already current.`);
    } catch (err: any) {
      setSheetsSyncMsg(err?.message || 'Failed to sync to Google Sheets');
    } finally {
      setIsSyncingSheets(false);
    }
  };

  const handleUpdateResponseStatus = async (
    jobId: string,
    responseStatus: 'awaiting_response' | 'reply_received' | 'interview_invited' | 'rejected'
  ) => {
    try {
      await fetch('/api/jobs/update-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          responseStatus,
          note: `Updated response status to ${responseStatus.replace(/_/g, ' ')}`,
        }),
      });
      await refreshHistory();
      setSheetsSyncMsg(`Updated employer response history for job ${jobId}.`);
    } catch {}
  };

  const handleSimulateFollowUp = async (jobId: string, company: string) => {
    simulateSponsorshipFollowUpWindow(jobId, 5);
    await refreshHistory();
    setSheetsSyncMsg(
      `Simulated 5 days elapsed for ${company}. Job is now marked Follow-Up Eligible (4–5d) — no email was automatically sent.`
    );
  };

  // Merge local appliedRecords, local Gmail sendingHistory, and central backendHistory into a single canonical list
  const unifiedRecords = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        jobId: string;
        company: string;
        position: string;
        country: string;
        sourceUrl: string;
        recipientEmail: string;
        appliedAt: number;
        cvUsed: string;
        coverLetter: string;
        method: string;
        statusLabel: string;
        category: HistoryCategoryTab;
        gmailMessageId?: string;
        notes?: string;
        followUpEligible?: boolean;
        daysSinceApplied: number;
        responseStatus: string;
        responseHistory: Array<{ timestamp: string; status: string; note: string }>;
      }
    >();

    for (const rec of appliedRecords) {
      if (!rec) continue;
      const rCompany = String((rec as any).company || (rec as any).employer || 'Hospitality Employer');
      const rPos = String((rec as any).position || (rec as any).jobTitle || (rec as any).title || 'Hospitality Professional');
      const key = `${rCompany.toLowerCase().trim()}__${rPos.toLowerCase().trim()}`;
      const matchSend = sendingHistory.find(
        s =>
          s &&
          ((rec.gmailMessageId && s.messageId === rec.gmailMessageId) ||
            (rec.recipientEmail && String(s.recipient || '').toLowerCase() === String(rec.recipientEmail).toLowerCase()))
      );
      const appliedTs = rec.appliedAt || rec.appliedTimestamp || Date.now();
      const daysElapsed = Math.floor((Date.now() - appliedTs) / (24 * 60 * 60 * 1000));
      const isFollowUp = daysElapsed >= 4 && !rec.employerResponseReceived;

      map.set(key, {
        id: rec.id || rec.jobId || `rec_${map.size}`,
        jobId: rec.jobId || rec.id || `rec_${map.size}`,
        company: rCompany,
        position: rPos,
        country: rec.country || rec.location || 'Europe',
        sourceUrl: rec.sourceUrl || rec.jobUrl || '',
        recipientEmail: rec.recipientEmail || 'Official Employer Portal',
        appliedAt: appliedTs,
        cvUsed: rec.cvTitle || matchSend?.cvTitle || 'Master Hospitality CV (PDF)',
        coverLetter: rec.coverLetter || rec.coverLetterSnippet || '',
        method: rec.gmailMessageId ? 'Gmail API' : 'Official Portal',
        statusLabel: rec.gmailMessageId ? 'Applied · Confirmed (Gmail)' : 'Applied · Confirmed (Portal)',
        category: 'applied',
        gmailMessageId: rec.gmailMessageId,
        followUpEligible: isFollowUp,
        daysSinceApplied: daysElapsed,
        responseStatus: rec.responseStatus || (rec.employerResponseReceived ? 'reply_received' : 'awaiting_response'),
        responseHistory: rec.responseHistory || [
          {
            timestamp: new Date(appliedTs).toISOString(),
            status: 'awaiting_response',
            note: 'Application confirmed — awaiting employer reply',
          },
        ],
      });
    }

    for (const b of backendHistory) {
      if (!b) continue;
      const bCompany = String(b.employer || (b as any).company || 'Hospitality Employer');
      const bTitle = String(b.title || b.position || 'Hospitality Professional');
      const key = `${bCompany.toLowerCase().trim()}__${bTitle.toLowerCase().trim()}`;
      const evt = b.applicationHistory?.[0];
      const existing = map.get(key);

      const lifecycle = b.submissionLifecycleStatus || evt?.status || b.applicationStatus;
      let cat: HistoryCategoryTab = 'applied';
      let statusLabel = 'Accepted by Email Provider';
      if (
        lifecycle === 'delivery_confirmed' ||
        lifecycle === 'delivered'
      ) {
        cat = 'applied';
        statusLabel = 'Delivery Confirmed';
      } else if (
        lifecycle === 'accepted_by_provider' ||
        lifecycle === 'accepted_by_gmail'
      ) {
        cat = 'applied';
        statusLabel = 'Accepted by Email Provider';
      } else if (
        lifecycle === 'submitted_portal' ||
        (b.applicationStatus === 'submitted' && evt?.method === 'portal')
      ) {
        cat = 'applied';
        statusLabel = 'Submitted through External Portal';
      } else if (b.applicationStatus === 'submitted' || b.status === 'applied') {
        cat = 'applied';
        statusLabel =
          evt?.method === 'gmail'
            ? 'Accepted by Email Provider'
            : 'Submitted through External Portal';
      } else if (lifecycle === 'bounced') {
        cat = 'failed';
        statusLabel = 'Bounced — Check Recipient';
      } else if (b.applicationStatus === 'failed' || lifecycle === 'failed') {
        cat = 'failed';
        statusLabel = evt?.errorReason
          ? `Failed: ${evt.errorReason}`
          : 'Failed — Preserved for Retry';
      } else if (lifecycle === 'sending') {
        cat = 'pending';
        statusLabel = 'Sending...';
      } else if (lifecycle === 'prepared') {
        cat = 'pending';
        statusLabel = 'Application Prepared';
      } else if (b.applicationStatus === 'queued' || b.applicationStatus === 'selected') {
        cat = 'pending';
        statusLabel = 'Pending / Queued';
      } else if (b.applicationStatus === 'saved') {
        cat = 'saved';
        statusLabel = 'Saved for Later';
      } else if (b.applicationStatus === 'hidden' || b.status === 'dismissed' || b.status === 'archived' || b.applicationStatus === 'expired') {
        cat = 'dismissed';
        statusLabel = b.jobStatus === 'expired' ? 'Expired (History Preserved)' : b.status === 'archived' ? 'Archived' : 'Temporarily Hidden';
      }

      const appliedTs = evt?.timestamp
        ? new Date(evt.timestamp).getTime()
        : b.lastCheckedDate
        ? new Date(b.lastCheckedDate).getTime()
        : Date.now();
      const daysElapsed =
        b.daysSinceApplied !== undefined
          ? b.daysSinceApplied
          : Math.floor((Date.now() - appliedTs) / (24 * 60 * 60 * 1000));
      const isFollowUp =
        Boolean(b.followUpEligible) ||
        (cat === 'applied' && daysElapsed >= 4 && b.responseStatus !== 'reply_received' && b.responseStatus !== 'interview_invited');

      if (!existing) {
        map.set(key, {
          id: b.id || `bh_${map.size}`,
          jobId: b.id || `bh_${map.size}`,
          company: bCompany,
          position: bTitle,
          country: b.country || b.location || 'Europe',
          sourceUrl: b.originalJobUrl || b.applicationUrl || evt?.sourceUrl || '',
          recipientEmail: b.recipientEmail || 'Official Employer Portal',
          appliedAt: appliedTs,
          cvUsed: evt?.cvTitle || evt?.attachments?.[0] || 'Master Hospitality CV (PDF)',
          coverLetter: evt?.coverLetter || evt?.coverLetterSnippet || '',
          method: evt?.method === 'gmail' ? 'Gmail API' : 'Official Portal',
          statusLabel,
          category: cat,
          gmailMessageId: evt?.gmailMessageId,
          notes: evt?.notes || evt?.errorReason,
          followUpEligible: isFollowUp,
          daysSinceApplied: daysElapsed,
          responseStatus: b.responseStatus || evt?.responseStatus || 'awaiting_response',
          responseHistory: b.responseHistory || [
            {
              timestamp: new Date(appliedTs).toISOString(),
              status: b.responseStatus || 'awaiting_response',
              note: evt?.notes || 'Tracked in persistent database',
            },
          ],
        });
      } else {
        existing.jobId = b.id || existing.jobId;
        if (b.country) existing.country = b.country;
        if (b.originalJobUrl || b.applicationUrl) existing.sourceUrl = b.originalJobUrl || b.applicationUrl;
        if (evt?.cvTitle) existing.cvUsed = evt.cvTitle;
        if (evt?.coverLetter || evt?.coverLetterSnippet) {
          existing.coverLetter = evt.coverLetter || evt.coverLetterSnippet || existing.coverLetter;
        }
        if (evt?.gmailMessageId) existing.gmailMessageId = evt.gmailMessageId;
        if (evt?.notes) existing.notes = evt.notes;
        if (isFollowUp) existing.followUpEligible = true;
        if (daysElapsed > existing.daysSinceApplied) existing.daysSinceApplied = daysElapsed;
        if (b.responseStatus) existing.responseStatus = b.responseStatus;
        if (b.responseHistory && b.responseHistory.length > 0) existing.responseHistory = b.responseHistory;
      }
    }

    return Array.from(map.values()).sort((a, b) => (b.appliedAt || 0) - (a.appliedAt || 0));
  }, [appliedRecords, sendingHistory, backendHistory]);

  const counts = useMemo(() => {
    return {
      all: unifiedRecords.length,
      applied: unifiedRecords.filter(r => r.category === 'applied').length,
      followup: unifiedRecords.filter(r => r.followUpEligible).length,
      failed: unifiedRecords.filter(r => r.category === 'failed').length + preservedFailedDrafts.length,
      pending: unifiedRecords.filter(r => r.category === 'pending').length,
      saved: unifiedRecords.filter(r => r.category === 'saved').length,
      dismissed: unifiedRecords.filter(r => r.category === 'dismissed').length,
    };
  }, [unifiedRecords, preservedFailedDrafts]);

  const filteredRecords = useMemo(() => {
    return unifiedRecords.filter(rec => {
      if (statusTab === 'applied' && rec.category !== 'applied') return false;
      if (statusTab === 'followup' && !rec.followUpEligible) return false;
      if (statusTab === 'failed' && rec.category !== 'failed') return false;
      if (statusTab === 'pending' && rec.category !== 'pending') return false;
      if (statusTab === 'saved' && rec.category !== 'saved') return false;
      if (statusTab === 'dismissed' && rec.category !== 'dismissed') return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        rec.company.toLowerCase().includes(q) ||
        rec.position.toLowerCase().includes(q) ||
        rec.country.toLowerCase().includes(q) ||
        rec.recipientEmail.toLowerCase().includes(q) ||
        rec.cvUsed.toLowerCase().includes(q)
      );
    });
  }, [unifiedRecords, statusTab, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header Banner — Reference Screen 6 */}
      <div
        className={`p-6 rounded-3xl border transition-all ${
          theme === 'dark' ? 'bg-[#101625] border-slate-800' : 'bg-white border-slate-200/90 shadow-[0_8px_28px_-6px_rgba(15,23,42,0.06)]'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-600/20 border border-blue-200/80 dark:border-blue-500/30 text-[#2563eb] dark:text-blue-400 flex items-center justify-center font-bold shadow-2xs">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Application History
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Unified across Sponsorship, Search & Europe Job Market · Employer, Title, Country, CV, Cover Letter & Status
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={refreshHistory}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>

            <button
              onClick={handleSyncSheets}
              disabled={isSyncingSheets}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#2563eb] hover:bg-blue-700 text-white flex items-center gap-1.5 transition-all shadow-sm shadow-blue-600/20 disabled:opacity-50"
            >
              {isSyncingSheets ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5" />
              )}
              <span>{isSyncingSheets ? 'Syncing...' : 'Sync to Google Sheets'}</span>
            </button>

            {connectedSheetId && (
              <a
                href={getSpreadsheetUrl(connectedSheetId)}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-xl text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 transition-all flex items-center gap-1"
                title="Open Google Sheet in new tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        {sheetsSyncMsg && (
          <div className="mt-3 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{sheetsSyncMsg}</span>
          </div>
        )}

        {/* Status Category Filter Pills — Matching Reference Screen 6 (All | Applied | Follow-Up | Saved...) */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/60 flex flex-wrap items-center gap-2">
          {(
            [
              { key: 'all', label: `All (${counts.all})` },
              { key: 'applied', label: `Applied (${counts.applied})` },
              { key: 'followup', label: `Follow Up (${counts.followup})` },
              { key: 'saved', label: `Saved (${counts.saved})` },
              { key: 'pending', label: `Pending (${counts.pending})` },
              { key: 'failed', label: `Failed (${counts.failed})` },
              { key: 'dismissed', label: `Archived (${counts.dismissed})` },
            ] as Array<{ key: HistoryCategoryTab; label: string }>
          ).map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusTab(tab.key)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusTab === tab.key
                  ? 'bg-[#2563eb] text-white shadow-sm shadow-blue-600/25'
                  : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="mt-4 max-w-md">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by employer, role, country, CV used, or email..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-3.5 py-2 rounded-2xl text-xs border transition-colors ${
                theme === 'dark'
                  ? 'bg-[#161d2d] border-slate-800 text-white'
                  : 'bg-slate-50/80 border-slate-200/90 text-slate-900 focus:bg-white'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Preserved Failed Drafts Banner (if any exist) */}
      {(statusTab === 'all' || statusTab === 'failed') && preservedFailedDrafts.length > 0 && (
        <div className="p-5 rounded-3xl border border-amber-200 dark:border-amber-500/40 bg-amber-50/90 dark:bg-amber-950/20 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>Preserved Prepared Applications Ready for Safe Retry ({preservedFailedDrafts.length})</span>
          </div>
          <div className="space-y-2">
            {preservedFailedDrafts.map((draft, idx) => (
              <div
                key={draft.jobId || `${draft.company}-${draft.position}-${idx}`}
                className="p-3.5 rounded-2xl bg-white dark:bg-slate-900/80 border border-amber-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs shadow-2xs"
              >
                <div>
                  <span className="font-bold text-slate-900 dark:text-white">{draft.company}</span>
                  <span className="text-slate-600 dark:text-slate-400"> · {draft.position}</span>
                  <span className="text-slate-500 font-mono ml-2">({draft.recipient})</span>
                  <div className="text-[11px] text-rose-600 dark:text-rose-300 mt-0.5">Last error: {draft.lastError}</div>
                </div>
                <span className="px-2.5 py-1 rounded-xl bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 text-[10px] font-bold">
                  Draft Preserved ({draft.cvFilename || 'CV Ready'})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History Cards List — Matching Reference Screen 6 Clean White Cards */}
      <div className="space-y-3">
        {filteredRecords.map(rec => {
          const isCoverExpanded = expandedCoverLetterId === rec.id;

          // Determine visual status badge style distinguishing all granular statuses
          let pillLabel = rec.statusLabel || 'Accepted by Email Provider';
          let pillClasses = 'bg-blue-50 text-[#2563eb] border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30';

          if (rec.followUpEligible) {
            pillLabel = 'Follow Up Eligible';
            pillClasses = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30';
          } else if (rec.responseStatus === 'reply_received' || rec.responseStatus === 'interview_invited') {
            pillLabel = 'Under Review · Replied';
            pillClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30';
          } else if (rec.category === 'saved') {
            pillLabel = 'Saved';
            pillClasses = 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/30';
          } else if (rec.category === 'failed') {
            pillLabel = rec.statusLabel || 'Failed';
            pillClasses = 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30';
          } else if (rec.category === 'pending') {
            pillLabel = rec.statusLabel || 'Sending...';
            pillClasses = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30';
          } else if (rec.category === 'dismissed') {
            pillLabel = rec.statusLabel || 'Temporarily Hidden';
            pillClasses = 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
          }

          return (
            <div
              key={rec.id}
              className={`p-5 rounded-2xl border transition-all ${
                theme === 'dark'
                  ? 'bg-[#101625] border-slate-800 hover:border-slate-700'
                  : 'bg-white border-slate-200/90 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.05)] hover:shadow-[0_10px_28px_-6px_rgba(37,99,235,0.10)]'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  {/* Top Title Row: Position + Employer + Country */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-extrabold text-base text-slate-900 dark:text-white tracking-tight">
                      {rec.position}
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-500/15 text-[#2563eb] dark:text-blue-300 border border-blue-200/80 dark:border-blue-500/30 flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      <span>{rec.country}</span>
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-violet-50 dark:bg-indigo-500/20 text-violet-700 dark:text-indigo-300 border border-violet-200/80 dark:border-indigo-500/30">
                      {rec.method}
                    </span>
                  </div>

                  {/* Subtitle Row: Employer • Recipient Email */}
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2 flex-wrap">
                    <span>{rec.company}</span>
                    <span className="text-slate-300 dark:text-slate-600">•</span>
                    <span className="font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      {rec.recipientEmail}
                    </span>
                  </div>

                  {/* Applied Date & CV Used */}
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap pt-0.5">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      Applied {new Date(rec.appliedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span className="text-slate-300 dark:text-slate-600">•</span>
                    <span className="flex items-center gap-1 text-[#2563eb] dark:text-blue-300 font-medium">
                      <FileText className="w-3.5 h-3.5" />
                      {rec.cvUsed}
                    </span>
                    {rec.sourceUrl && (
                      <>
                        <span className="text-slate-300 dark:text-slate-600">•</span>
                        <a
                          href={rec.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Source URL</span>
                        </a>
                      </>
                    )}
                  </div>

                  {rec.gmailMessageId && (
                    <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
                      Verified Gmail Message ID: {rec.gmailMessageId}
                    </div>
                  )}
                  {rec.notes && <div className="text-[11px] text-slate-500 dark:text-slate-400 italic">{rec.notes}</div>}
                </div>

                {/* Right Side: Status Pill & User Controls */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {rec.category === 'applied' && !rec.followUpEligible && (
                    <button
                      type="button"
                      onClick={() => handleSimulateFollowUp(rec.jobId, rec.company)}
                      className="px-2.5 py-1.5 rounded-xl text-[11px] font-semibold bg-violet-50 hover:bg-violet-100 dark:bg-purple-500/15 dark:hover:bg-purple-500/25 text-violet-700 dark:text-purple-300 border border-violet-200 dark:border-purple-500/30 transition"
                      title="Test 4–5 day follow-up eligibility without sending any email"
                    >
                      Simulate 5d
                    </button>
                  )}

                  {rec.category === 'applied' && (
                    <select
                      value={rec.responseStatus}
                      onChange={e =>
                        handleUpdateResponseStatus(
                          rec.jobId,
                          e.target.value as 'awaiting_response' | 'reply_received' | 'interview_invited' | 'rejected'
                        )
                      }
                      className="px-2.5 py-1.5 rounded-xl text-[11px] font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                      title="Record Employer Response Status"
                    >
                      <option value="awaiting_response">Sent · Awaiting Reply</option>
                      <option value="reply_received">Under Review · Replied</option>
                      <option value="interview_invited">Interview Invited</option>
                      <option value="rejected">Closed / Rejected</option>
                    </select>
                  )}

                  {rec.coverLetter && (
                    <button
                      type="button"
                      onClick={() => setExpandedCoverLetterId(isCoverExpanded ? null : rec.id)}
                      className="px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 flex items-center gap-1"
                    >
                      <span>Cover Letter</span>
                      {isCoverExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                  )}

                  {/* Reference Screen 6 Status Pill */}
                  <span
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${pillClasses}`}
                    title={rec.statusLabel}
                  >
                    {pillLabel === 'Under Review' || pillLabel === 'Sent' ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : pillLabel === 'Follow Up' ? (
                      <Clock className="w-3.5 h-3.5" />
                    ) : pillLabel === 'Saved' ? (
                      <Bookmark className="w-3.5 h-3.5" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5" />
                    )}
                    <span>{pillLabel}</span>
                  </span>
                </div>
              </div>

              {/* Expandable Cover Letter Used */}
              {isCoverExpanded && rec.coverLetter && (
                <div className="mt-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono">
                  <div className="text-[10px] font-bold uppercase text-[#2563eb] dark:text-blue-400 mb-1">
                    Stored Cover Letter Used for {rec.company}:
                  </div>
                  {rec.coverLetter}
                </div>
              )}

              {/* Response History Trail */}
              {rec.responseHistory && rec.responseHistory.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500 dark:text-slate-400 pt-2 mt-2 border-t border-slate-100 dark:border-slate-800/60">
                  <MessageSquare className="w-3 h-3 text-slate-400" />
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Status Trail:</span>
                  <span>
                    {rec.responseHistory[0].note} ({new Date(rec.responseHistory[0].timestamp).toLocaleDateString()})
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {filteredRecords.length === 0 && (
          <div className="p-10 rounded-3xl bg-white dark:bg-[#101625] border border-slate-200/80 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
            No application records match the selected filter ({statusTab}).
          </div>
        )}
      </div>
    </div>
  );
};
