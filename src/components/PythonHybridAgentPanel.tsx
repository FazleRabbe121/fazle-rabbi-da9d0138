import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Mail,
  Globe,
  FileText,
  Sparkles,
  ExternalLink,
  Play,
  Pause,
  Send,
  Layers,
  Award,
} from 'lucide-react';
import {
  HOSPITALITY_SPECIALIZATION_ROLES,
  SPONSORSHIP_EVIDENCE_CATEGORIES,
  SponsorshipEvidenceCategory,
} from '../services/countryPriorityService';
import { syncActiveCVToPythonAgent, getActiveCVId, loadCVLibrary } from '../services/cvStorage';

interface PythonCompany {
  id: number;
  name: string;
  website: string;
  domain: string;
  country: string;
  country_name: string;
  city: string;
  address: string;
  phone: string;
  status: string;
  score: number;
  score_reasons: string;
  job_suitability_score: number;
  sponsorship_evidence_score: number;
  work_permit_feasibility_score: number;
  overall_priority_score: number;
  sponsorship_category: SponsorshipEvidenceCategory;
  sponsorship_category_label: string;
  sponsorship_confidence: string;
  evidence_source: string;
  verification_date: string;
  has_job: number;
  visa_signal: string;
  accommodation: number;
  roles: string;
  canonical_roles: string;
  canonical_roles_list: string[];
  summary: string;
  career_url: string;
  apply_url: string;
  best_email: string;
  publication_date: string;
  priority_group: 1 | 2 | 3;
  priority_rank: number;
  country_permit_info?: {
    pathway?: string;
    authority?: string;
    notes?: string;
  };
  outbox?: {
    id: number;
    to_email: string;
    subject: string;
    body: string;
    status: string;
    cv_id: string;
    cv_filename: string;
  };
}

interface PythonHybridAgentPanelProps {
  selectedCvId: string;
  onSelectCompanyForEmailApply?: (company: {
    employer: string;
    title: string;
    country: string;
    city: string;
    recipientEmail: string;
    subject: string;
    body: string;
    sourceUrl: string;
    sponsorshipEvidence: string;
  }) => void;
  onShowToast?: (msg: string) => void;
}

export const PythonHybridAgentPanel: React.FC<PythonHybridAgentPanelProps> = ({
  selectedCvId,
  onSelectCompanyForEmailApply,
  onShowToast,
}) => {
  const [engineStatus, setEngineStatus] = useState<any>(null);
  const [companies, setCompanies] = useState<PythonCompany[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [discovering, setDiscovering] = useState<boolean>(false);
  const [filterPriorityGroup, setFilterPriorityGroup] = useState<string>('all');
  const [filterCountry, setFilterCountry] = useState<string>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [expandedCompanyId, setExpandedCompanyId] = useState<number | null>(null);

  const notify = (msg: string) => {
    if (onShowToast) onShowToast(msg);
  };

  const fetchPythonData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterCountry && filterCountry !== 'ALL') params.set('country', filterCountry);
      if (filterPriorityGroup && filterPriorityGroup !== 'all') params.set('priority_group', filterPriorityGroup);
      if (filterCategory && filterCategory !== 'ALL') params.set('sponsorship_category', filterCategory);
      if (filterRole && filterRole !== 'all') params.set('role', filterRole);
      params.set('limit', '100');

      const [statusRes, compRes] = await Promise.all([
        fetch('/api/python-agent/status').then((r) => r.json()),
        fetch(`/api/python-agent/companies?${params.toString()}`).then((r) => r.json()),
      ]);
      if (statusRes?.ok) setEngineStatus(statusRes);
      if (compRes?.ok && Array.isArray(compRes.companies)) {
        setCompanies(compRes.companies);
      }
    } catch (e: any) {
      console.warn('Failed to load Python hybrid agent data:', e);
    } finally {
      setLoading(false);
    }
  }, [filterCountry, filterPriorityGroup, filterCategory, filterRole]);

  useEffect(() => {
    syncActiveCVToPythonAgent(selectedCvId || getActiveCVId());
    fetchPythonData();
  }, [fetchPythonData, selectedCvId]);

  const handleTriggerDiscovery = async (liveOsm = false) => {
    setDiscovering(true);
    try {
      syncActiveCVToPythonAgent(selectedCvId || getActiveCVId());
      const res = await fetch('/api/python-agent/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countries:
            filterCountry !== 'ALL'
              ? [filterCountry]
              : ['PL', 'PT', 'HR', 'NL', 'MT', 'ES', 'LU', 'GB-ENG', 'GB-SCT', 'AU', 'NZ'],
          live_osm: liveOsm,
          max_crawl: 3,
        }),
      }).then((r) => r.json());

      if (res?.ok) {
        notify(
          `Python Engine Discovery Complete: ${res.companies?.length || 0} hospitality employers scored across Priority Groups 1 & 2.`
        );
        await fetchPythonData();
      }
    } catch (e: any) {
      notify(`Discovery error: ${e.message || 'Failed'}`);
    } finally {
      setDiscovering(false);
    }
  };

  const handleQueueAction = async (action: string, outboxId?: number, value?: string | number) => {
    try {
      const res = await fetch('/api/python-agent/queue-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, outbox_id: outboxId, value }),
      }).then((r) => r.json());
      if (res?.ok) {
        notify(res.message || `Executed ${action}`);
        await fetchPythonData();
      }
    } catch (e: any) {
      notify(`Action error: ${e.message}`);
    }
  };

  const renderCategoryBadge = (cat: SponsorshipEvidenceCategory) => {
    const labelText = SPONSORSHIP_EVIDENCE_CATEGORIES[cat] || SPONSORSHIP_EVIDENCE_CATEGORIES.D;
    const styleMap: Record<SponsorshipEvidenceCategory, string> = {
      A: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      B: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
      C: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      D: 'bg-slate-700/40 text-slate-300 border-slate-600/40',
      E: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    };
    return (
      <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold border ${styleMap[cat] || styleMap.D}`}>
        {labelText}
      </span>
    );
  };

  const activeCvObj = loadCVLibrary().find((c) => c.id === (selectedCvId || getActiveCVId()));

  return (
    <div className="p-5 rounded-3xl border bg-[#0d1322] border-indigo-500/30 space-y-5">
      {/* Top Engine Status Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[10px] font-black uppercase tracking-wider">
              Python-First + Gemini Hybrid Engine
            </span>
            <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
              SQLite Persistent Queue Active
            </span>
            <span className="px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
              CV Gallery Synced: {activeCvObj?.title || 'Fazle Rabbi CV'}
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-extrabold text-white">
            International Hospitality Sponsorship & 4-Score Matching Engine
          </h2>
          <p className="text-xs text-slate-400">
            Priority Group 1 (Poland, Portugal, Croatia, Netherlands, Malta, Spain, Luxembourg) & Priority Group 2 (UK — England, UK — Scotland, Australia, New Zealand) • 14 Hospitality Roles
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              syncActiveCVToPythonAgent(selectedCvId || getActiveCVId());
              notify(`Synced active CV "${activeCvObj?.title || 'CV'}" to Python Agent.`);
              fetchPythonData();
            }}
            className="px-3 py-2 rounded-xl border border-amber-500/40 hover:bg-amber-500/10 text-amber-300 text-xs font-bold flex items-center gap-1.5 transition"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Sync Active CV</span>
          </button>

          <button
            type="button"
            onClick={() => handleTriggerDiscovery(false)}
            disabled={discovering}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${discovering ? 'animate-spin' : ''}`} />
            <span>{discovering ? 'Scoring Employers...' : 'Verify Priority Employers'}</span>
          </button>

          {engineStatus?.config?.paused ? (
            <button
              type="button"
              onClick={() => handleQueueAction('resume')}
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Resume Engine</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleQueueAction('pause')}
              className="px-3 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold flex items-center gap-1.5"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pause</span>
            </button>
          )}
        </div>
      </div>

      {/* Telemetry & Queue Metrics Strip */}
      {engineStatus && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
          <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase font-bold">Indexed Employers</div>
            <div className="text-lg font-extrabold text-white mt-0.5">
              {engineStatus.stats?.total_companies || companies.length}
            </div>
            <div className="text-[10px] text-emerald-400">Priority 1 & 2 Ranked</div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase font-bold">Cat A & B Verified</div>
            <div className="text-lg font-extrabold text-emerald-400 mt-0.5">
              {(engineStatus.stats?.sponsorship_categories?.A || 0) +
                (engineStatus.stats?.sponsorship_categories?.B || 0)}
            </div>
            <div className="text-[10px] text-slate-400">Evidence-Backed</div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase font-bold">Application Drafts</div>
            <div className="text-lg font-extrabold text-indigo-300 mt-0.5">
              {engineStatus.stats?.outbox?.draft || 0} Drafts / {engineStatus.stats?.outbox?.approved || 0} Queued
            </div>
            <div className="text-[10px] text-slate-400">Mode: {engineStatus.config?.mode || 'approve'}</div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase font-bold">Gemini Quota & Cache</div>
            <div className="text-sm font-extrabold text-purple-300 mt-0.5">
              {engineStatus.gemini_telemetry?.daily_calls_used || 0}/
              {engineStatus.gemini_telemetry?.daily_calls_limit || 300} Calls
            </div>
            <div className="text-[10px] text-emerald-400">
              {engineStatus.gemini_telemetry?.cache_hits_today || 0} SQLite Cache Hits
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase font-bold">Fallback Resilience</div>
            <div className="text-sm font-extrabold text-emerald-300 mt-0.5">Python-First Active</div>
            <div className="text-[10px] text-slate-400">
              Pending AI Queue: {engineStatus.gemini_telemetry?.pending_ai_queue_count || 0}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase font-bold">Daily Send Cap</div>
            <div className="text-sm font-extrabold text-amber-300 mt-0.5">
              {engineStatus.config?.sent_today || 0} / {engineStatus.config?.daily_cap || 40} Sent
            </div>
            <div className="text-[10px] text-slate-400">Warm-up & MX Protected</div>
          </div>
        </div>
      )}

      {/* Priority Group, Country, Sponsorship Category & 14 Hospitality Role Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
            Priority Group Filter
          </label>
          <select
            value={filterPriorityGroup}
            onChange={(e) => setFilterPriorityGroup(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
          >
            <option value="all">All Priority Groups (1, 2 & 3)</option>
            <option value="1">Priority Group 1 — Highest (PL, PT, HR, NL, MT, ES, LU)</option>
            <option value="2">Priority Group 2 — International (UK-ENG, UK-SCT, AU, NZ)</option>
            <option value="3">Priority Group 3 — Additional European / EURES</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
            Country / Separate UK Region
          </label>
          <select
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
          >
            <option value="ALL">🌍 All Priority Countries</option>
            <optgroup label="Priority Group 1 — Highest Search Priority">
              <option value="PL">1. 🇵🇱 Poland (PL)</option>
              <option value="PT">2. 🇵🇹 Portugal (PT)</option>
              <option value="HR">3. 🇭🇷 Croatia (HR)</option>
              <option value="NL">4. 🇳🇱 Netherlands (NL)</option>
              <option value="MT">5. 🇲🇹 Malta (MT)</option>
              <option value="ES">6. 🇪🇸 Spain (ES)</option>
              <option value="LU">7. 🇱🇺 Luxembourg (LU)</option>
            </optgroup>
            <optgroup label="Priority Group 2 — International Destinations">
              <option value="GB-ENG">8. 🏴󠁧󠁢󠁥󠁮󠁧󠁿 United Kingdom — England (GB-ENG)</option>
              <option value="GB-SCT">9. 🏴󠁧󠁢󠁳󠁣󠁴󠁿 United Kingdom — Scotland (GB-SCT)</option>
              <option value="AU">10. 🇦🇺 Australia (AU)</option>
              <option value="NZ">11. 🇳🇿 New Zealand (NZ)</option>
            </optgroup>
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
            Sponsorship Evidence Category (A–E)
          </label>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
          >
            <option value="ALL">All Categories (A, B, C, D, E)</option>
            <option value="A">A. Verified sponsorship support</option>
            <option value="B">B. Employer explicitly states international/work-permit support</option>
            <option value="C">C. Potential sponsorship — requires employer confirmation</option>
            <option value="D">D. No sponsorship evidence</option>
            <option value="E">E. Not eligible or unsuitable</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
            Hospitality Specialization (14 Roles)
          </label>
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
          >
            <option value="all">All 14 Hospitality Roles</option>
            {HOSPITALITY_SPECIALIZATION_ROLES.map((role) => (
              <option key={role} value={role.toLowerCase()}>
                {role}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Scored Hospitality Employers List */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-6 text-center text-xs text-slate-400">
            Loading Python-First Hybrid Engine companies and 4-score evaluations...
          </div>
        ) : companies.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">
            No employers match the current filter. Click "Verify Priority Employers" to populate.
          </div>
        ) : (
          companies.map((c) => {
            const isExpanded = expandedCompanyId === c.id;
            return (
              <div
                key={c.id}
                className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-indigo-500/40 transition space-y-3"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-black">
                        Priority #{c.priority_rank} (Group {c.priority_group})
                      </span>
                      <h3 className="text-sm font-extrabold text-white">{c.name}</h3>
                      <span className="text-xs text-slate-400">
                        • {c.city}, <strong className="text-slate-200">{c.country_name}</strong> ({c.country})
                      </span>
                      {renderCategoryBadge(c.sponsorship_category)}
                      {c.accommodation === 1 && (
                        <span className="px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[10px] font-bold">
                          Housing / Accommodation
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">{c.summary}</p>

                    <div className="flex items-center gap-2 flex-wrap pt-0.5">
                      {(c.canonical_roles_list || []).map((role) => (
                        <span
                          key={role}
                          className="px-2 py-0.5 rounded-md bg-slate-800 text-amber-300 border border-slate-700 text-[10px] font-semibold"
                        >
                          {role}
                        </span>
                      ))}
                    </div>

                    {/* Evidence Source, Date & Confidence */}
                    <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
                      <span>
                        <strong className="text-slate-300">Evidence Source:</strong> {c.evidence_source || 'Employer career portal'}
                      </span>
                      <span>
                        <strong className="text-slate-300">Verified:</strong> {c.verification_date || c.publication_date || '2026-03-31'}
                      </span>
                      <span>
                        <strong className="text-slate-300">Confidence:</strong> {c.sponsorship_confidence || 'High'}
                      </span>
                      {c.best_email && (
                        <span className="text-emerald-400 font-semibold">
                          HR Email (MX Verified): {c.best_email}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 4 Separate Scores (Section 9) */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2 shrink-0 min-w-[270px]">
                    <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-center">
                      <div className="text-[9px] text-slate-400 uppercase font-bold">1. Job Suitability</div>
                      <div className="text-sm font-black text-blue-400">{c.job_suitability_score}%</div>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-center">
                      <div className="text-[9px] text-slate-400 uppercase font-bold">2. Sponsorship Evid.</div>
                      <div className="text-sm font-black text-emerald-400">{c.sponsorship_evidence_score}%</div>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-center">
                      <div className="text-[9px] text-slate-400 uppercase font-bold">3. Permit Feasibility</div>
                      <div className="text-sm font-black text-amber-400">{c.work_permit_feasibility_score}%</div>
                    </div>
                    <div className="p-2 rounded-xl bg-indigo-950/60 border border-indigo-500/40 text-center">
                      <div className="text-[9px] text-indigo-300 uppercase font-bold">4. Overall Priority</div>
                      <div className="text-sm font-black text-white">{c.overall_priority_score}%</div>
                    </div>
                  </div>
                </div>

                {/* Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/70">
                  <div className="text-[11px] text-slate-400">
                    <strong className="text-indigo-300">Work Permit Pathway:</strong>{' '}
                    {c.country_permit_info?.pathway || 'National Employer-Sponsored Work Permit'}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {c.career_url && (
                      <a
                        href={c.career_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3 text-indigo-400" />
                        <span>Official Careers</span>
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => setExpandedCompanyId(isExpanded ? null : c.id)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold"
                    >
                      {isExpanded ? 'Hide Draft & Details' : 'View Python Draft & Permit Rules'}
                    </button>

                    {c.outbox && c.outbox.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => handleQueueAction('approve', c.outbox?.id)}
                        className="px-2.5 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Approve in Queue</span>
                      </button>
                    )}

                    {onSelectCompanyForEmailApply && c.best_email && (
                      <button
                        type="button"
                        onClick={() =>
                          onSelectCompanyForEmailApply({
                            employer: c.name,
                            title: c.canonical_roles_list?.[0] || 'Bartender & Hospitality Specialist',
                            country: c.country_name || c.country,
                            city: c.city,
                            recipientEmail: c.best_email,
                            subject:
                              c.outbox?.subject ||
                              `Application — ${c.canonical_roles_list?.[0] || 'Bartender'} — Fazle Rabbi Boyati`,
                            body: c.outbox?.body || c.summary,
                            sourceUrl: c.career_url || c.website,
                            sponsorshipEvidence: `[${c.sponsorship_category_label}] ${c.evidence_source}`,
                          })
                        }
                        className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-[11px] font-bold flex items-center gap-1"
                      >
                        <Send className="w-3 h-3" />
                        <span>Open in Gmail Apply Studio</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Draft & Permit Notes */}
                {isExpanded && (
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                    <div className="text-slate-300">
                      <strong className="text-indigo-300">Immigration Authority:</strong>{' '}
                      {c.country_permit_info?.authority || 'National Immigration Office'} —{' '}
                      {c.country_permit_info?.notes}
                    </div>
                    {c.outbox && (
                      <div className="space-y-1 pt-2 border-t border-slate-800">
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>
                            <strong className="text-white">To:</strong> {c.outbox.to_email} |{' '}
                            <strong className="text-white">Subject:</strong> {c.outbox.subject}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold uppercase text-[10px]">
                            Queue Status: {c.outbox.status}
                          </span>
                        </div>
                        <pre className="whitespace-pre-wrap font-sans text-xs text-slate-300 bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                          {c.outbox.body}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
