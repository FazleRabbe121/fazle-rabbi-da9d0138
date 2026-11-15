import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  History,
  Settings,
  Activity,
  Plus,
  Trash2,
  Copy,
  Check,
  Download,
  Eye,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Play,
  Search,
  Filter,
  X,
  Award,
} from 'lucide-react';
import {
  fetchAdminInterviewOverview,
  upsertApprovedParticipant,
  updateApprovedParticipant,
  deleteApprovedParticipant,
  updateAdminRubricConfig,
  deleteAdminAttemptRecord,
  triggerAdminGeminiHealthCheck,
} from '../services/interviewCenterService';
import {
  ApprovedParticipant,
  InterviewAttemptRecord,
  QuestionBankItem,
  RubricConfig,
  GeminiHealthSummary,
  AdminAuditEvent,
} from '../types/interviewCenter';
import { DEFAULT_RUBRIC_CONFIG } from '../data/interviewQuestionBank';
import {
  CertificatePreselection,
  mapAttemptToCertificatePreselection,
  setPendingCertificatePreselection,
} from '../services/certificateService';

interface InterviewAdminViewProps {
  onLaunchParticipantPortalPreview: () => void;
  onGetCertificate?: (pre: CertificatePreselection) => void;
}

export const InterviewAdminView: React.FC<InterviewAdminViewProps> = ({
  onLaunchParticipantPortalPreview,
  onGetCertificate,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'participants' | 'attempts' | 'rubric' | 'health'>('participants');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Data States
  const [participants, setParticipants] = useState<ApprovedParticipant[]>([]);
  const [attempts, setAttempts] = useState<InterviewAttemptRecord[]>([]);
  const [rubricConfig, setRubricConfig] = useState<RubricConfig>(DEFAULT_RUBRIC_CONFIG);
  const [questionBankVersion, setQuestionBankVersion] = useState('');
  const [questionBankCount, setQuestionBankCount] = useState(0);
  const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
  const [geminiHealth, setGeminiHealth] = useState<GeminiHealthSummary | null>(null);
  const [auditEvents, setAuditEvents] = useState<AdminAuditEvent[]>([]);

  // Participant Form State
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newCategoryScope, setNewCategoryScope] = useState<string>('all');
  const [newAccessCode, setNewAccessCode] = useState('');
  const [newExpiresAt, setNewExpiresAt] = useState('');
  const [newCanViewResults, setNewCanViewResults] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);

  // History Filters State
  const [filterEmail, setFilterEmail] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterLevel, setFilterLevel] = useState('all');
  const [filterOutcome, setFilterOutcome] = useState('all');
  const [inspectingAttempt, setInspectingAttempt] = useState<InterviewAttemptRecord | null>(null);

  // Health Check State
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);

  const loadAdminData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAdminInterviewOverview();
      setParticipants(data.approvedParticipants || []);
      setAttempts(data.attempts || []);
      setRubricConfig(data.rubricConfig || DEFAULT_RUBRIC_CONFIG);
      setQuestionBankVersion(data.questionBankVersion || '');
      setQuestionBankCount(data.questionBankCount || 0);
      setQuestions(data.questions || []);
      setGeminiHealth(data.geminiHealth || null);
      setAuditEvents(data.auditEvents || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load Admin Control Panel.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const showToast = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  };

  const participantShareUrl = `${window.location.origin}/interview?interview=1#interview`;

  const handleCopyInviteLink = () => {
    navigator.clipboard.writeText(participantShareUrl);
    setCopiedLink(true);
    showToast(`Copied standalone Interview Portal link: ${participantShareUrl}`);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyParticipantDirectLink = (email: string) => {
    const directUrl = `${window.location.origin}/interview?interview=1&email=${encodeURIComponent(email.trim().toLowerCase())}#interview`;
    navigator.clipboard.writeText(directUrl);
    showToast(`Copied personalized Interview Portal link for ${email}`);
  };

  const handleAddParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    try {
      const allowedCategories =
        newCategoryScope === 'all'
          ? ['all']
          : newCategoryScope === 'professional'
          ? ['waiter', 'bartender', 'barista', 'electrician', 'plumber']
          : newCategoryScope === 'english'
          ? ['cefr_english']
          : [newCategoryScope];

      await upsertApprovedParticipant({
        email: newEmail.trim().toLowerCase(),
        displayName: newName.trim() || undefined,
        status: 'approved',
        allowedCategories,
        canViewResults: newCanViewResults,
        accessCode: newAccessCode.trim() ? newAccessCode.trim() : null,
        expiresAt: newExpiresAt ? new Date(newExpiresAt).toISOString() : null,
      });
      const addedEmail = newEmail.trim().toLowerCase();
      setNewEmail('');
      setNewName('');
      setNewAccessCode('');
      setNewExpiresAt('');
      showToast(`Activated interview access for ${addedEmail}`);
      await loadAdminData();
    } catch (err: any) {
      setError(err?.message || 'Failed to add participant.');
    }
  };

  const handleStatusChange = async (id: string, status: 'approved' | 'suspended' | 'revoked') => {
    try {
      await updateApprovedParticipant(id, { status });
      showToast(
        status === 'approved'
          ? 'Participant access activated'
          : `Participant ${status} & active sessions terminated`
      );
      await loadAdminData();
    } catch (err: any) {
      setError(err?.message || 'Failed to update status.');
    }
  };

  const handleRotateOrClearAccessCode = async (p: ApprovedParticipant) => {
    try {
      if (p.requireAccessCode) {
        await updateApprovedParticipant(p.id, { accessCode: null });
        showToast(`Switched ${p.email} to direct 1-step email access`);
      } else {
        const randomCode = String(Math.floor(100000 + Math.random() * 900000));
        await updateApprovedParticipant(p.id, { accessCode: randomCode });
        showToast(`Issued Access Code ${randomCode} for ${p.email}`);
      }
      await loadAdminData();
    } catch (err: any) {
      setError(err?.message || 'Failed to update access code.');
    }
  };

  const handleDeleteParticipant = async (id: string) => {
    try {
      await deleteApprovedParticipant(id);
      showToast('Participant removed & active sessions terminated immediately');
      await loadAdminData();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete participant.');
    }
  };

  const handleSaveRubric = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await updateAdminRubricConfig(rubricConfig);
      setRubricConfig(res.rubricConfig);
      showToast(`Saved rubric configuration (${res.rubricConfig.version})`);
      await loadAdminData();
    } catch (err: any) {
      setError(err?.message || 'Failed to update rubric.');
    }
  };

  const handleDeleteAttempt = async (attemptId: string) => {
    try {
      await deleteAdminAttemptRecord(attemptId);
      if (inspectingAttempt?.attemptId === attemptId) {
        setInspectingAttempt(null);
      }
      showToast('Interview attempt & transcript deleted');
      await loadAdminData();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete attempt.');
    }
  };

  const handlePingGemini = async () => {
    setIsCheckingHealth(true);
    try {
      const res = await triggerAdminGeminiHealthCheck();
      if (res.ok) {
        showToast(`Gemini API (${res.model}) responded HEALTHY`);
      } else {
        setError(`Gemini Health Alert: ${res.error}`);
      }
      await loadAdminData();
    } catch (err: any) {
      setError(err?.message || 'Health check failed.');
    } finally {
      setIsCheckingHealth(false);
    }
  };

  const filteredAttempts = useMemo(() => {
    return attempts.filter(a => {
      if (
        filterEmail.trim() &&
        !a.participantEmail.toLowerCase().includes(filterEmail.trim().toLowerCase()) &&
        !a.participantName.toLowerCase().includes(filterEmail.trim().toLowerCase())
      ) {
        return false;
      }
      if (filterRole !== 'all' && a.role !== filterRole) return false;
      if (filterLevel !== 'all' && a.level !== filterLevel) return false;
      if (filterOutcome !== 'all') {
        if (filterOutcome === 'in_progress' && a.status !== 'in_progress') return false;
        if (filterOutcome !== 'in_progress' && a.passFailStatus !== filterOutcome) return false;
      }
      return true;
    });
  }, [attempts, filterEmail, filterRole, filterLevel, filterOutcome]);

  const handleExportCsv = () => {
    const headers = [
      'Attempt ID',
      'Participant Name',
      'Participant Email',
      'Role',
      'Level',
      'Mode',
      'Status',
      'Started At',
      'Completed At',
      'Duration (sec)',
      'Score',
      'Pass/Fail',
      'Estimated CEFR',
      'Provider Used',
      'Question Bank Version',
    ];
    const rows = filteredAttempts.map(a => [
      a.attemptId,
      `"${(a.participantName || '').replace(/"/g, '""')}"`,
      a.participantEmail,
      `"${a.roleTitle}"`,
      `"${a.levelLabel}"`,
      a.mode,
      a.status,
      a.startedAt,
      a.completedAt || '',
      a.durationSeconds,
      a.totalScore ?? '',
      `"${a.passFailStatus || 'In Progress'}"`,
      a.cefrEvaluation?.estimatedLevel || '',
      a.providerUsed,
      a.questionBankVersion,
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `interview-center-results-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Admin Header Banner */}
      <div className="p-6 rounded-2xl bg-white dark:bg-[#111624] border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>Administrator Control Panel · Gemini API Exclusive Engine</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            AI Interview & English Assessment Center
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Manage Gmail-approved participant access, inspect transcripts, configure rubrics, and monitor Gemini API health ({questionBankCount} seeded questions · {questionBankVersion}).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleCopyInviteLink}
            className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLink ? 'Invite Link Copied!' : 'Copy Participant Invite Link'}</span>
          </button>

          <button
            type="button"
            onClick={onLaunchParticipantPortalPreview}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 transition cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Open Interview Portal</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-500/40 text-xs text-emerald-800 dark:text-emerald-200 font-semibold">
          ✓ {notice}
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-500/40 text-xs text-rose-800 dark:text-rose-200 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Sub-navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-100 dark:bg-[#0d111c] border border-slate-200 dark:border-slate-800 rounded-xl w-fit">
        {[
          { id: 'participants', label: `Approved Gmail Access (${participants.length})`, icon: Users },
          { id: 'attempts', label: `Attempts & History (${attempts.length})`, icon: History },
          { id: 'rubric', label: 'Rubric & Duration Config', icon: Settings },
          { id: 'health', label: 'Gemini Quota & Audit Log', icon: Activity },
        ].map(tab => {
          const Icon = tab.icon;
          const active = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                active
                  ? 'bg-white dark:bg-blue-600 text-blue-600 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: PARTICIPANT ALLOWLIST */}
      {activeSubTab === 'participants' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Add / Approve Participant Form */}
          <form
            onSubmit={handleAddParticipant}
            className="lg:col-span-4 p-5 rounded-2xl bg-white dark:bg-[#111624] border border-slate-200 dark:border-slate-800 space-y-4"
          >
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-blue-500" />
              <span>Approve Participant Google Email</span>
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Exact Google Email Address *
              </label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="candidate@gmail.com"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Participant Name (Optional)
              </label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Candidate Full Name"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Permitted Categories / Roles
              </label>
              <select
                value={newCategoryScope}
                onChange={e => setNewCategoryScope(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
              >
                <option value="all">All Professional Roles & CEFR English</option>
                <option value="professional">All Professional Roles Only</option>
                <option value="english">CEFR English Assessment Only</option>
                <option value="waiter">Waiter Only</option>
                <option value="bartender">Bartender Only</option>
                <option value="barista">Barista Only</option>
                <option value="electrician">Maintenance Electrician Only</option>
                <option value="plumber">Plumber Only</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Optional PIN Protection
                </label>
                <button
                  type="button"
                  onClick={() => setNewAccessCode(String(Math.floor(100000 + Math.random() * 900000)))}
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
                >
                  Generate PIN
                </button>
              </div>
              <input
                type="text"
                value={newAccessCode}
                onChange={e => setNewAccessCode(e.target.value)}
                placeholder="Leave blank for Gmail-only login, or enter a PIN"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Leave blank for Gmail-only login, or assign a PIN to require both Gmail + PIN.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Access Expiry Date (Optional)
              </label>
              <input
                type="date"
                value={newExpiresAt}
                onChange={e => setNewExpiresAt(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={newCanViewResults}
                onChange={e => setNewCanViewResults(e.target.checked)}
                className="rounded border-slate-600 text-blue-600"
              />
              <span>Allow participant to view detailed scorecard & feedback</span>
            </label>

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition cursor-pointer"
            >
              Approve & Activate Access
            </button>
          </form>

          {/* Allowlist Table */}
          <div className="lg:col-span-8 p-5 rounded-2xl bg-white dark:bg-[#111624] border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Approved Participant Allowlist
              </h3>
              <span className="text-[11px] font-mono text-slate-400">
                Invite URL: {participantShareUrl}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-3">Email & Name</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Verification</th>
                    <th className="py-2.5 px-3">Allowed Tracks</th>
                    <th className="py-2.5 px-3">Expiry</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/70">
                  {participants.map(p => (
                    <tr key={p.id}>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 dark:text-white">{p.email}</div>
                        <div className="text-[11px] text-slate-500">{p.displayName || '—'}</div>
                      </td>
                      <td className="py-3 px-3 font-semibold capitalize">
                        <span
                          className={
                            p.status === 'approved'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : p.status === 'suspended'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px]">
                        {p.requireAccessCode && p.accessCodeDisplay ? (
                          <span className="text-amber-500 font-semibold">
                            PIN: {p.accessCodeDisplay}
                          </span>
                        ) : (
                          <span className="text-slate-400">Direct Email</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                        {(p.allowedCategories || ['all']).join(', ')}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                        {p.expiresAt ? new Date(p.expiresAt).toLocaleDateString() : 'No expiry'}
                      </td>
                      <td className="py-3 px-3 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleCopyParticipantDirectLink(p.email)}
                          className="px-2 py-1 rounded-lg bg-blue-600/15 text-blue-600 dark:text-blue-400 hover:bg-blue-600/25 font-semibold cursor-pointer"
                          title={`Copy direct Interview Portal link for ${p.email}`}
                        >
                          Copy Link
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRotateOrClearAccessCode(p)}
                          className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium cursor-pointer"
                          title={p.requireAccessCode ? 'Clear PIN (enable 1-step email entry)' : 'Generate 6-digit PIN'}
                        >
                          {p.requireAccessCode ? 'Clear PIN' : '+ PIN'}
                        </button>
                        {p.status !== 'approved' && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(p.id, 'approved')}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 font-semibold cursor-pointer"
                          >
                            Approve
                          </button>
                        )}
                        {p.status !== 'suspended' && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(p.id, 'suspended')}
                            className="px-2.5 py-1 rounded-lg bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 font-semibold cursor-pointer"
                          >
                            Suspend
                          </button>
                        )}
                        {p.status !== 'revoked' && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(p.id, 'revoked')}
                            className="px-2.5 py-1 rounded-lg bg-rose-600/20 text-rose-400 hover:bg-rose-600/30 font-semibold cursor-pointer"
                          >
                            Revoke
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteParticipant(p.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 cursor-pointer"
                          title="Delete participant"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ATTEMPTS & TRANSCRIPT HISTORY */}
      {activeSubTab === 'attempts' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-[#111624] border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="text"
                value={filterEmail}
                onChange={e => setFilterEmail(e.target.value)}
                placeholder="Filter by email or name..."
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
              />
              <select
                value={filterRole}
                onChange={e => setFilterRole(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
              >
                <option value="all">All Roles / Tracks</option>
                <option value="waiter">Waiter</option>
                <option value="bartender">Bartender</option>
                <option value="barista">Barista</option>
                <option value="electrician">Maintenance Electrician</option>
                <option value="plumber">Plumber</option>
                <option value="cefr_english">CEFR English</option>
              </select>
              <select
                value={filterOutcome}
                onChange={e => setFilterOutcome(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
              >
                <option value="all">All Outcomes</option>
                <option value="PASS">PASS</option>
                <option value="FAIL">FAIL</option>
                <option value="Fail — Safety Concern">Fail — Safety Concern</option>
                <option value="in_progress">In Progress / Incomplete</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV ({filteredAttempts.length})</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400">
                  <th className="py-2.5 px-3">Participant</th>
                  <th className="py-2.5 px-3">Role & Level</th>
                  <th className="py-2.5 px-3">Mode</th>
                  <th className="py-2.5 px-3">Started</th>
                  <th className="py-2.5 px-3 text-right">Duration</th>
                  <th className="py-2.5 px-3 text-right">Score</th>
                  <th className="py-2.5 px-3">Outcome</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/70">
                {filteredAttempts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No interview attempts match the current filter.
                    </td>
                  </tr>
                ) : (
                  filteredAttempts.map(att => (
                    <tr key={att.attemptId}>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 dark:text-white">{att.participantName}</div>
                        <div className="text-[11px] text-slate-400">{att.participantEmail}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-900 dark:text-white">{att.roleTitle}</div>
                        <div className="text-[11px] text-slate-400">{att.levelLabel}</div>
                      </td>
                      <td className="py-3 px-3 capitalize text-slate-400">{att.mode}</td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-400">
                        {new Date(att.startedAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-300">
                        {Math.floor(att.durationSeconds / 60)}m {att.durationSeconds % 60}s
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                        {att.totalScore !== undefined ? `${att.totalScore}/100` : `${att.answers.length} ans`}
                      </td>
                      <td className="py-3 px-3 font-semibold">
                        <span
                          className={
                            att.passFailStatus === 'PASS'
                              ? 'text-emerald-400'
                              : att.passFailStatus === 'Fail — Safety Concern'
                              ? 'text-rose-400'
                              : 'text-amber-400'
                          }
                        >
                          {att.passFailStatus || 'In Progress'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right space-x-2 whitespace-nowrap">
                        {onGetCertificate && (
                          <button
                            type="button"
                            onClick={() => {
                              const pre = mapAttemptToCertificatePreselection(att);
                              setPendingCertificatePreselection(pre);
                              onGetCertificate(pre);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#c8102e]/20 text-rose-500 dark:text-rose-300 hover:bg-[#c8102e]/30 font-bold inline-flex items-center gap-1 cursor-pointer"
                            title="Generate Belvoriné Mixology Certificate for this attempt"
                          >
                            <Award className="w-3.5 h-3.5" />
                            <span>Get Certificate</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setInspectingAttempt(att)}
                          className="px-2.5 py-1 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 font-semibold cursor-pointer"
                        >
                          Inspect
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAttempt(att.attemptId)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 cursor-pointer"
                          title="Delete attempt & transcript"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: RUBRIC & DURATION CONFIG */}
      {activeSubTab === 'rubric' && (
        <form
          onSubmit={handleSaveRubric}
          className="p-6 rounded-2xl bg-white dark:bg-[#111624] border border-slate-200 dark:border-slate-800 space-y-5 max-w-3xl"
        >
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Scoring Rubric & Minimum Duration Configuration
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Changes apply to new attempts only. Historical attempts retain their original rubric snapshot ({rubricConfig.version}).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Pass Threshold (out of 100)
              </label>
              <input
                type="number"
                min={40}
                max={95}
                value={rubricConfig.passThreshold}
                onChange={e => setRubricConfig({ ...rubricConfig, passThreshold: Number(e.target.value) })}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800 text-xs font-mono text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Level 1 / CEFR Min Duration (sec)
              </label>
              <input
                type="number"
                min={300}
                max={1200}
                value={rubricConfig.minDurationSecondsL1}
                onChange={e =>
                  setRubricConfig({
                    ...rubricConfig,
                    minDurationSecondsL1: Number(e.target.value),
                    minDurationSecondsCefr: Number(e.target.value),
                  })
                }
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800 text-xs font-mono text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Level 2 Min Duration (sec)
              </label>
              <input
                type="number"
                min={300}
                max={1200}
                value={rubricConfig.minDurationSecondsL2}
                onChange={e => setRubricConfig({ ...rubricConfig, minDurationSecondsL2: Number(e.target.value) })}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800 text-xs font-mono text-white"
              />
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={rubricConfig.strictFiveMinuteCap}
                onChange={e => setRubricConfig({ ...rubricConfig, strictFiveMinuteCap: e.target.checked })}
                className="rounded border-slate-600 text-blue-600"
              />
              <span>Enforce strict 5-minute (300s) target duration across all levels</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={rubricConfig.showModelAnswersAfterCompletion}
                onChange={e =>
                  setRubricConfig({ ...rubricConfig, showModelAnswersAfterCompletion: e.target.checked })
                }
                className="rounded border-slate-600 text-blue-600"
              />
              <span>Show example model answers after candidate completes the interview</span>
            </label>
          </div>

          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition cursor-pointer"
          >
            Save Rubric Settings
          </button>
        </form>
      )}

      {/* TAB 4: GEMINI QUOTA & AUDIT LOG */}
      {activeSubTab === 'health' && geminiHealth && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 p-5 rounded-2xl bg-white dark:bg-[#111624] border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Gemini API Provider Health & Quota Telemetry
                </h3>
                <p className="text-[11px] text-slate-400">
                  Models: {geminiHealth.primaryModel} · {geminiHealth.transcribeModel} · {geminiHealth.ttsModel}
                </p>
              </div>
              <button
                type="button"
                disabled={isCheckingHealth}
                onClick={handlePingGemini}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCheckingHealth ? 'animate-spin' : ''}`} />
                <span>Ping Gemini</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800">
                <div className="text-slate-400">Status</div>
                <div className="font-bold text-emerald-400 uppercase mt-1">{geminiHealth.status}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800">
                <div className="text-slate-400">Successful Calls</div>
                <div className="font-bold font-mono text-white mt-1">
                  {geminiHealth.successfulRequests} / {geminiHealth.totalRequests}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800">
                <div className="text-slate-400">429 Quota Events</div>
                <div className="font-bold font-mono text-amber-400 mt-1">{geminiHealth.rateLimitEvents}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800">
                <div className="text-slate-400">401/403 Config Errors</div>
                <div className="font-bold font-mono text-rose-400 mt-1">{geminiHealth.configErrorEvents}</div>
              </div>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              <div className="text-xs font-semibold text-slate-400">Recent Provider Events</div>
              {geminiHealth.recentEvents.length === 0 ? (
                <p className="text-xs text-slate-500">No Gemini events logged yet.</p>
              ) : (
                geminiHealth.recentEvents.map(ev => (
                  <div
                    key={ev.id}
                    className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800 text-[11px] flex items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-bold text-white">{ev.operation}</span> ({ev.model}) —{' '}
                      <span className="text-slate-400">{ev.message}</span>
                    </div>
                    <span className="font-mono text-slate-500 shrink-0">{ev.latencyMs}ms</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="lg:col-span-6 p-5 rounded-2xl bg-white dark:bg-[#111624] border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Admin Security Audit Log</h3>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {auditEvents.length === 0 ? (
                <p className="text-xs text-slate-500">No admin changes recorded yet.</p>
              ) : (
                auditEvents.map(ae => (
                  <div
                    key={ae.id}
                    className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800 text-[11px] flex items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-bold text-blue-400">{ae.action}</span> →{' '}
                      <span className="text-white font-semibold">{ae.target}</span> ({ae.details})
                    </div>
                    <span className="font-mono text-slate-500 shrink-0">
                      {new Date(ae.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Attempt Transcript Inspector Modal */}
      {inspectingAttempt && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-4xl bg-[#111624] border border-slate-800 rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  Attempt Review: {inspectingAttempt.participantName} ({inspectingAttempt.participantEmail})
                </h3>
                <p className="text-xs text-slate-400">
                  {inspectingAttempt.roleTitle} · {inspectingAttempt.levelLabel} · Score:{' '}
                  {inspectingAttempt.totalScore ?? 'In Progress'}/100 · {inspectingAttempt.passFailStatus}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {onGetCertificate && (
                  <button
                    type="button"
                    onClick={() => {
                      const pre = mapAttemptToCertificatePreselection(inspectingAttempt);
                      setPendingCertificatePreselection(pre);
                      setInspectingAttempt(null);
                      onGetCertificate(pre);
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-[#c8102e] hover:bg-[#a50d26] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Award className="w-3.5 h-3.5" />
                    <span>Get Certificate</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setInspectingAttempt(null)}
                  className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {inspectingAttempt.answers.map((ans, i) => (
                <div key={ans.answerId} className="p-4 rounded-xl bg-[#090c14] border border-slate-800 text-xs space-y-1.5">
                  <div className="flex items-center justify-between font-bold text-blue-400">
                    <span>
                      Q{i + 1} {ans.isFollowUp ? '(Follow-up)' : ''}: {ans.questionText}
                    </span>
                    <span className="font-mono text-white">{ans.perQuestionScore}/100</span>
                  </div>
                  <div className="text-slate-200 bg-slate-900 p-2.5 rounded-lg">
                    <strong>Transcript ({ans.inputMode}):</strong> {ans.answerText}
                  </div>
                  <div className="text-slate-400">
                    <strong>AI Evaluator:</strong> {ans.feedback}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
