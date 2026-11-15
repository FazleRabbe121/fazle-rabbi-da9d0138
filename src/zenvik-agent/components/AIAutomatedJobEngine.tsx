import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Sparkles,
  Bot,
  Search,
  CheckCircle2,
  AlertTriangle,
  Send,
  Eye,
  Edit3,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Mail,
  CheckSquare,
  Square,
  ShieldCheck,
  Check,
  Building,
  Briefcase,
  MapPin,
  Paperclip,
  Smartphone,
  FileText,
  Inbox,
  Filter,
  Calendar,
  Clock,
  X,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import {
  PreparedJobApplication,
  JobMarket,
  JobLifeCycleStatus,
  DEFAULT_HOSPITALITY_ROLES,
  DEFAULT_CYPRUS_LOCATIONS,
  DEFAULT_EUROPE_LOCATIONS,
} from '../types/jobApplication';
import { CVDocumentItem } from '../types/cv';
import { PhoneUploadedCV } from '../views/ApplyByEmailView';
import {
  GmailSendingRecord,
  checkApplicationReplyInGmail,
  generatePersonalizedCoverLetterWithGemini,
} from '../services/gmailService';
import {
  loadSelectedMarket,
  saveSelectedMarket,
  loadAppliedJobRecords,
  isJobAppliedWithin10Days,
  mergeFreshJobsIntoDatabase,
  filterVisibleJobsForMarket,
  AppliedJobRecord,
  loadSearchesHistory,
  loadCompaniesByDomain,
  getActiveSearchId,
  setActiveSearchId,
  extractWebsiteDomain,
  SearchSessionRecord,
} from '../services/jobDatabaseService';
import { GmailDispatchModal } from './GmailDispatchModal';

interface AIAutomatedJobEngineProps {
  userEmail: string;
  userName: string;
  hasToken: boolean;
  selectedCV?: CVDocumentItem;
  phoneCV?: PhoneUploadedCV | null;
  isUsingPhoneCV?: boolean;
  sendingHistory: GmailSendingRecord[];
  preparedApplications: PreparedJobApplication[];
  onUpdateApplications: (apps: PreparedJobApplication[]) => void;
  onSendApprovedApplications: (approvedApps: PreparedJobApplication[]) => Promise<void>;
  onConnectGmail: () => Promise<boolean | void>;
  isSending: boolean;
}

export const AIAutomatedJobEngine: React.FC<AIAutomatedJobEngineProps> = ({
  userEmail,
  userName,
  hasToken,
  selectedCV,
  phoneCV,
  isUsingPhoneCV,
  sendingHistory,
  preparedApplications,
  onUpdateApplications,
  onSendApprovedApplications,
  onConnectGmail,
  isSending,
}) => {
  const { theme } = useTheme();

  // Two Main Job Markets (Requirement 14, 15, 19, 20)
  const [selectedMarket, setSelectedMarket] = useState<JobMarket>(() => loadSelectedMarket());
  const [appliedRecords, setAppliedRecords] = useState<AppliedJobRecord[]>(() => loadAppliedJobRecords());
  const [isAppliedVaultOpen, setIsAppliedVaultOpen] = useState(false);

  // Targeting filters
  const [selectedRoles, setSelectedRoles] = useState<string[]>(DEFAULT_HOSPITALITY_ROLES);
  const [selectedLocations, setSelectedLocations] = useState<string[]>(() =>
    selectedMarket === 'cyprus' ? DEFAULT_CYPRUS_LOCATIONS : DEFAULT_EUROPE_LOCATIONS
  );
  const [showFilterSettings, setShowFilterSettings] = useState(false);

  // Pipeline search state + Separate Searches & Deduplicated Companies stores (ported from db.py)
  const [isSearching, setIsSearching] = useState(false);
  const [searchStage, setSearchStage] = useState('');
  const [dispatchModalApp, setDispatchModalApp] = useState<PreparedJobApplication | null>(null);
  const [searchesHistory, setSearchesHistory] = useState<SearchSessionRecord[]>(() => loadSearchesHistory());
  const [companiesByDomainCount, setCompaniesByDomainCount] = useState<number>(
    () => Object.keys(loadCompaniesByDomain()).length
  );
  const [activeSearchSessionId, setActiveSearchSessionId] = useState<string>(() => getActiveSearchId() || '');

  // Cooldown Bypass toggle
  const [bypassCooldown, setBypassCooldown] = useState(false);

  // Switch between CYPRUS JOB MARKET and EUROPE JOB MARKET
  const handleSwitchMarket = (market: JobMarket) => {
    setSelectedMarket(market);
    saveSelectedMarket(market);
    setSelectedLocations(market === 'cyprus' ? DEFAULT_CYPRUS_LOCATIONS : DEFAULT_EUROPE_LOCATIONS);
    setAppliedRecords(loadAppliedJobRecords());
    showNotice(
      market === 'cyprus'
        ? 'Switched to CYPRUS JOB MARKET. Displaying only verified Cyprus hospitality vacancies.'
        : 'Switched to EUROPE JOB MARKET. Displaying hospitality vacancies across European countries.'
    );
  };

  // Review & View Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'needs_review' | 'duplicates'>('all');
  const [expandedAppId, setExpandedAppId] = useState<string | null>(null);
  const [editingAppId, setEditingAppId] = useState<string | null>(null);
  const [reviewingApp, setReviewingApp] = useState<PreparedJobApplication | null>(null);

  // Modal confirmation
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [checkingReplyId, setCheckingReplyId] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [isPersonalizing, setIsPersonalizing] = useState(false);

  const showNotice = (msg: string) => {
    setStatusNotice(msg);
    setTimeout(() => setStatusNotice(null), 4500);
  };

  const handlePersonalizeCurrentApp = async (app: PreparedJobApplication) => {
    setIsPersonalizing(true);
    try {
      const res = await generatePersonalizedCoverLetterWithGemini({
        company: app.company,
        jobTitle: app.position,
        location: app.location,
        verifiedRequirements: app.sourceNotes,
        selectedCvId: selectedCV?.id,
      });
      if (res.coverLetter) {
        const textarea = document.getElementById(`review-cover-${app.id}`) as HTMLTextAreaElement;
        if (textarea) textarea.value = res.coverLetter;
        handleSaveAppEdit(app.id, {
          coverLetter: res.coverLetter,
          subject: res.subjectLine || app.subject,
          applicationMessage: undefined,
        });
        showNotice(`Cover letter personalized for ${app.company} using CV "${res.cvUsedName}"!`);
      }
    } catch (e: any) {
      showNotice(e.message || 'Personalization request failed.');
    } finally {
      setIsPersonalizing(false);
    }
  };

  // Toggle role selection
  const handleToggleRole = (role: string) => {
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  // Toggle location selection
  const handleToggleLocation = (loc: string) => {
    setSelectedLocations(prev =>
      prev.includes(loc) ? prev.filter(l => l !== loc) : [...prev, loc]
    );
  };

  // Run the 3-AI Pipeline with Separate Search IDs, Fresh Results List & Website Domain Deduplication (ported from db.py)
  const handleRunPipeline = async (options?: { forceBypass?: boolean; isNewSearchSession?: boolean }) => {
    const shouldBypass = Boolean(options?.forceBypass);
    const isNewSearchSession = options?.isNewSearchSession !== false;
    if (shouldBypass) {
      setBypassCooldown(true);
    }
    setIsSearching(true);
    setSearchStage(
      selectedMarket === 'cyprus'
        ? 'Step 1/4: Creating fresh search session & scanning real-time Cyprus hospitality vacancies...'
        : 'Step 1/4: Creating fresh search session & scanning real-time European hospitality jobs...'
    );

    const timer1 = setTimeout(() => {
      setSearchStage('Step 2/4: Deduplicating companies by website domain & verifying official HR contacts...');
    }, 1800);

    const timer2 = setTimeout(() => {
      setSearchStage('Step 3/4: Evaluating 6-Month Sponsorship Reality & visa timelines (Target: April 18, 2027)...');
    }, 3600);

    const timer3 = setTimeout(() => {
      setSearchStage('Step 4/4: Preparing fresh results list with tailored cover letters & CV matching...');
    }, 5400);

    try {
      const currentAppliedRecords = loadAppliedJobRecords();
      setAppliedRecords(currentAppliedRecords);

      // Keep "searches", "companies", and "emailHistory" separate:
      // Gather all previously contacted emails and all seen company domains across searches
      const existingEmails = Array.from(
        new Set([
          ...(sendingHistory || [])
            .map(h => (h && h.recipient ? String(h.recipient).toLowerCase().trim() : ''))
            .filter(Boolean),
          ...currentAppliedRecords
            .map(r => (r.recipientEmail ? r.recipientEmail.toLowerCase().trim() : ''))
            .filter(Boolean),
        ])
      );

      const companiesRegistry = loadCompaniesByDomain();
      const seenDomains = Object.keys(companiesRegistry);

      const res = await fetch('/api/ai/jobs/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          market: selectedMarket,
          roles: selectedRoles.length > 0 ? selectedRoles : DEFAULT_HOSPITALITY_ROLES,
          locations:
            selectedLocations.length > 0
              ? selectedLocations
              : selectedMarket === 'cyprus'
              ? DEFAULT_CYPRUS_LOCATIONS
              : DEFAULT_EUROPE_LOCATIONS,
          existingEmails,
          seenDomains,
          applicantName: userName || 'Fazle Rabbi',
          applicantEmail: userEmail || 'fazle.rabbe.doc@gmail.com',
          applicantPhone: selectedCV?.data?.phone || '+357-95502363',
          selectedCvId: selectedCV?.id || '',
          selectedCvTitle: isUsingPhoneCV && phoneCV ? phoneCV.name : selectedCV?.title || 'Fazle Rabbi — Bartender CV',
          bypassCooldown: true,
          forceFresh: true,
        }),
      });

      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);

      if (!res.ok) {
        throw new Error(`Pipeline response error: ${res.statusText}`);
      }

      const data = await res.json();
      const freshApps: PreparedJobApplication[] = (data.applications || []).map((app: any) => ({
        ...app,
        companyDomain: extractWebsiteDomain(app) || undefined,
        overrideCooldown: true,
        isNewVacancy: true,
      }));

      // Every search gets its own id and a fresh results list!
      // Old results stay in searchesHistory and emailHistory, and never block a new search.
      const { merged, newCount, searchId } = mergeFreshJobsIntoDatabase(
        preparedApplications,
        freshApps,
        selectedMarket,
        {
          keepOtherMarkets: !isNewSearchSession,
          roles: selectedRoles,
          locations: selectedLocations,
        }
      );

      setSearchesHistory(loadSearchesHistory());
      setCompaniesByDomainCount(Object.keys(loadCompaniesByDomain()).length);
      setActiveSearchSessionId(searchId);
      setStatusFilter('all');
      onUpdateApplications(merged);

      showNotice(
        `New Search (${searchId}) complete: loaded ${newCount || freshApps.length} fresh ${
          selectedMarket === 'cyprus' ? 'Cyprus' : 'European'
        } vacancies (deduplicated by company website domain). Old results remain safely in history!`
      );
    } catch (err: any) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      const errMsg = err?.message || 'Error running job search.';
      showNotice(
        errMsg.includes('429') || errMsg.includes('quota')
          ? `Loaded verified authentic ${selectedMarket === 'cyprus' ? 'Cyprus' : 'European'} vacancies for review.`
          : errMsg
      );
    } finally {
      setIsSearching(false);
      setSearchStage('');
    }
  };

  // Explicit "New search" handler: starts a brand new search session ID with a fresh results list
  const handleStartNewSearch = async () => {
    await handleRunPipeline({ forceBypass: true, isNewSearchSession: true });
  };

  // Initial load: only run once on mount if no applications exist for this market
  const initialBootRef = useRef(false);
  useEffect(() => {
    if (initialBootRef.current) return;
    initialBootRef.current = true;
    const timer = setTimeout(() => {
      const activeJobs = filterVisibleJobsForMarket(preparedApplications, selectedMarket, appliedRecords, true);
      if (activeJobs.length === 0 && !isSearching) {
        void handleRunPipeline({ forceBypass: true, isNewSearchSession: true });
      }
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  // Toggle approval for an individual application (LifeCycle tracking: Requirement 17)
  const handleToggleApproval = (id: string) => {
    const updated = preparedApplications.map(app => {
      if (app.id === id) {
        if (!app.recipientEmail) {
          showNotice('Email unavailable for this role — please use the official employer portal link to apply.');
          return { ...app, isApproved: false };
        }
        const nextApproved = !app.isApproved;
        return {
          ...app,
          isApproved: nextApproved,
          lifeCycleStatus: nextApproved
            ? ('approved' as const)
            : app.lifeCycleStatus === 'approved'
            ? ('ready_to_apply' as const)
            : app.lifeCycleStatus,
        };
      }
      return app;
    });
    onUpdateApplications(updated);
  };

  // Batch approve all verified
  const handleApproveAllVerified = () => {
    const updated = preparedApplications.map(app => {
      if (app.verificationStatus === 'verified' && Boolean(app.recipientEmail) && !app.isDuplicate) {
        return { ...app, isApproved: true, lifeCycleStatus: 'approved' as const };
      }
      return app;
    });
    onUpdateApplications(updated);
    showNotice('Approved all verified applications with deliverable employer emails.');
  };

  // Deselect all
  const handleDeselectAll = () => {
    const updated = preparedApplications.map(app => ({
      ...app,
      isApproved: false,
      lifeCycleStatus: app.lifeCycleStatus === 'approved' ? ('ready_to_apply' as const) : app.lifeCycleStatus,
    }));
    onUpdateApplications(updated);
  };

  // Delete/Exclude single application
  const handleDeleteApplication = (id: string) => {
    const updated = preparedApplications.filter(app => app.id !== id);
    onUpdateApplications(updated);
  };

  // Save manual edit
  const handleSaveAppEdit = (id: string, updates: Partial<PreparedJobApplication>) => {
    const updated = preparedApplications.map(app => {
      if (app.id === id) {
        const next = { ...app, ...updates };
        // If email was fixed by user, re-verify status
        if (next.recipientEmail && next.recipientEmail.includes('@') && next.verificationStatus === 'needs_review') {
          next.verificationStatus = 'verified';
          next.reviewReason = 'Manually verified and updated by user';
          next.isApproved = true;
          next.lifeCycleStatus = 'ready_to_apply';
        }
        return next;
      }
      return app;
    });
    onUpdateApplications(updated);
    setEditingAppId(null);
    showNotice('Application details updated successfully.');
  };

  // Check for reply in connected Gmail
  const handleCheckReply = async (app: PreparedJobApplication) => {
    if (!hasToken) {
      await onConnectGmail();
      return;
    }
    setCheckingReplyId(app.id);
    try {
      const dummyRecord: GmailSendingRecord = {
        id: app.id,
        timestamp: app.sentTimestamp || new Date().toLocaleString(),
        recipient: app.recipientEmail,
        company: app.company,
        position: app.position,
        subject: app.subject,
        cvTitle: app.cvTitle,
        status: 'accepted_by_gmail',
        threadId: app.threadId,
      };

      const result = await checkApplicationReplyInGmail(dummyRecord);
      const updated = preparedApplications.map(a => {
        if (a.id === app.id) {
          if (result.isBounce) {
            return {
              ...a,
              status: 'bounced' as const,
              deliveryStatus: 'bounced' as const,
              lifeCycleStatus: 'delivery_failed' as const,
              replyStatus: 'bounced' as const,
              errorReason: result.snippet || 'Delivery failed to recipient mail server (Bounce)',
              replySnippet: result.snippet,
              replyDate: result.date,
            };
          }
          if (result.hasReply) {
            return {
              ...a,
              status: 'delivered' as const,
              deliveryStatus: 'delivered' as const,
              lifeCycleStatus: 'replied' as const,
              replyStatus: 'reply_received' as const,
              replySnippet: result.snippet,
              replyDate: result.date,
            };
          }
          return {
            ...a,
            replyStatus: 'checked_no_reply' as const,
            replySnippet: result.snippet,
            replyDate: result.date,
          };
        }
        return a;
      });
      onUpdateApplications(updated);

      if (result.isBounce) {
        showNotice(`⚠️ Bounce detected for ${app.company} (${app.recipientEmail}): ${result.snippet}`);
      } else if (result.hasReply) {
        showNotice(`🎉 Confirmed delivered — Employer reply received from ${app.company} in your Gmail inbox!`);
      } else {
        showNotice(`Accepted by Gmail — No bounce or reply yet from ${app.company}.`);
      }
    } catch (err: any) {
      showNotice(err.message || 'Failed to check Gmail for replies.');
    } finally {
      setCheckingReplyId(null);
    }
  };

  const [isCheckingAllReplies, setIsCheckingAllReplies] = useState(false);

  // Check replies for all sent applications in connected Gmail
  const handleCheckAllReplies = async () => {
    if (!hasToken) {
      await onConnectGmail();
      return;
    }
    const sentApps = preparedApplications.filter(
      a => a.status === 'sent' || a.status === 'accepted_by_gmail' || a.status === 'delivered' || a.status === 'applied'
    );
    if (sentApps.length === 0) {
      showNotice('No sent applications to check yet. Send applications first!');
      return;
    }
    setIsCheckingAllReplies(true);
    let replyFoundCount = 0;
    let bounceFoundCount = 0;
    const updated = [...preparedApplications];

    for (let i = 0; i < updated.length; i++) {
      const app = updated[i];
      if (
        app.status === 'sent' ||
        app.status === 'accepted_by_gmail' ||
        app.status === 'delivered' ||
        app.status === 'applied'
      ) {
        const dummyRecord: GmailSendingRecord = {
          id: app.id,
          timestamp: app.sentTimestamp || new Date().toLocaleString(),
          recipient: app.recipientEmail,
          company: app.company,
          position: app.position,
          subject: app.subject,
          cvTitle: app.cvTitle,
          status: 'accepted_by_gmail',
          threadId: app.threadId,
        };
        try {
          const result = await checkApplicationReplyInGmail(dummyRecord);
          if (result.isBounce) {
            bounceFoundCount++;
            updated[i] = {
              ...app,
              status: 'bounced',
              deliveryStatus: 'bounced',
              lifeCycleStatus: 'delivery_failed',
              replyStatus: 'bounced',
              errorReason: result.snippet || 'Delivery failed to recipient mail server (Bounce)',
              replySnippet: result.snippet,
              replyDate: result.date,
            };
          } else if (result.hasReply) {
            replyFoundCount++;
            updated[i] = {
              ...app,
              status: 'delivered',
              deliveryStatus: 'delivered',
              lifeCycleStatus: 'replied',
              replyStatus: 'reply_received',
              replySnippet: result.snippet,
              replyDate: result.date,
            };
          } else {
            updated[i] = {
              ...app,
              replyStatus: 'checked_no_reply',
            };
          }
        } catch (e) {
          console.warn('Reply check error:', e);
        }
      }
    }

    onUpdateApplications(updated);
    setIsCheckingAllReplies(false);
    if (bounceFoundCount > 0 || replyFoundCount > 0) {
      showNotice(
        `Gmail Sync Complete: ${replyFoundCount} confirmed delivered with reply, ${bounceFoundCount} bounced.`
      );
    } else {
      showNotice(
        'Checked Gmail inbox: No bounces or new replies found. Messages remain Accepted by Gmail.'
      );
    }
  };

  // Filter for active market and enforce 10-day applied cooldown (Requirement 13 & 14)
  const marketJobs = useMemo(() => {
    return filterVisibleJobsForMarket(preparedApplications, selectedMarket, appliedRecords, bypassCooldown);
  }, [preparedApplications, selectedMarket, appliedRecords, bypassCooldown]);

  // Count how many jobs in database are currently hidden under the 10-day rule for this market
  const hiddenCountForMarket = useMemo(() => {
    if (bypassCooldown) return 0;
    return preparedApplications.filter(app => {
      const isCyprus =
        app.market === 'cyprus' ||
        app.location?.toLowerCase().includes('cyprus') ||
        app.country?.toLowerCase().includes('cyprus');
      if (selectedMarket === 'cyprus' && !isCyprus) return false;
      if (selectedMarket !== 'cyprus' && isCyprus) return false;
      const { isApplied } = isJobAppliedWithin10Days(app, appliedRecords, bypassCooldown);
      return isApplied;
    }).length;
  }, [preparedApplications, selectedMarket, appliedRecords, bypassCooldown]);

  // Filtered applications by status tabs (Guarantees candidate feed is never blank if jobs are available)
  const filteredApps = useMemo(() => {
    const list = marketJobs.filter(app => {
      if (statusFilter === 'verified') return app.verificationStatus === 'verified' && !app.isDuplicate;
      if (statusFilter === 'needs_review') return app.verificationStatus === 'needs_review' && !app.isDuplicate;
      if (statusFilter === 'duplicates') return app.isDuplicate;
      return true;
    });

    if (list.length === 0 && marketJobs.length > 0 && statusFilter !== 'duplicates') {
      return marketJobs;
    }
    return list;
  }, [marketJobs, statusFilter]);

  // Keep separate searches, companies, and emailHistory synced when sendingHistory changes
  useEffect(() => {
    setSearchesHistory(loadSearchesHistory());
    setCompaniesByDomainCount(Object.keys(loadCompaniesByDomain()).length);
  }, [sendingHistory.length, preparedApplications.length]);

  const approvedApps = marketJobs.filter(a => a.isApproved);
  const verifiedCount = marketJobs.filter(a => a.verificationStatus === 'verified' && !a.isDuplicate).length;
  const reviewCount = marketJobs.filter(a => a.verificationStatus === 'needs_review' && !a.isDuplicate).length;
  const duplicateCount = marketJobs.filter(a => a.isDuplicate).length;

  const attachedCvName =
    selectedCV?.originalFile?.fileName ||
    selectedCV?.fileName ||
    (isUsingPhoneCV && phoneCV ? phoneCV.name : selectedCV?.title || 'Fazle Rabbi — Bartender CV');

  return (
    <div className="space-y-6">
      {/* Toast Notification Banner */}
      {statusNotice && (
        <div className="p-3.5 rounded-2xl bg-blue-600 text-white text-xs font-semibold shadow-lg flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>{statusNotice}</span>
          </div>
          <button onClick={() => setStatusNotice(null)} className="text-white/80 hover:text-white text-sm">
            ✕
          </button>
        </div>
      )}

      {/* ========================================================
          TWO MAIN JOB MARKETS SWITCHER (Requirement 14, 15, 19)
          1. CYPRUS JOB MARKET: Only Cyprus hospitality vacancies
          2. EUROPE JOB MARKET: European countries vacancies
          ======================================================== */}
      <div
        className={`p-3 sm:p-4 rounded-3xl border transition-all shadow-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 ${
          theme === 'dark' ? 'bg-[#121826] border-slate-700/80' : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex items-center p-1.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 gap-1.5 flex-1 max-w-xl">
          <button
            type="button"
            onClick={() => handleSwitchMarket('cyprus')}
            className={`flex-1 py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition ${
              selectedMarket === 'cyprus'
                ? 'bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 text-white shadow-lg shadow-amber-500/25 ring-1 ring-amber-400/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="text-base leading-none">🇨🇾</span>
            <div className="text-left">
              <div className="font-extrabold tracking-wide">CYPRUS JOB MARKET</div>
              <div className="text-[10px] opacity-80 font-normal">Only Cyprus vacancies</div>
            </div>
            {selectedMarket === 'cyprus' && (
              <span className="ml-auto w-2 h-2 rounded-full bg-white animate-pulse" />
            )}
          </button>

          <button
            type="button"
            onClick={() => handleSwitchMarket('europe')}
            className={`flex-1 py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition ${
              selectedMarket === 'europe'
                ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-lg shadow-blue-500/25 ring-1 ring-blue-400/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span className="text-base leading-none">🇪🇺</span>
            <div className="text-left">
              <div className="font-extrabold tracking-wide">EUROPE JOB MARKET</div>
              <div className="text-[10px] opacity-80 font-normal">Across European countries</div>
            </div>
            {selectedMarket === 'europe' && (
              <span className="ml-auto w-2 h-2 rounded-full bg-white animate-pulse" />
            )}
          </button>
        </div>

        {/* 10-Day Applied Protection Stats & Vault Trigger (Requirement 13) */}
        <div className="flex items-center gap-2 self-end md:self-center flex-wrap">
          {hiddenCountForMarket > 0 && !bypassCooldown && (
            <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>{hiddenCountForMarket} job(s) hidden under 10-day cooldown</span>
              <button
                type="button"
                onClick={() => setBypassCooldown(true)}
                className="ml-1 underline text-emerald-300 hover:text-white font-bold"
                title="Bypass 10-day filter to view and re-apply"
              >
                Bypass
              </button>
            </div>
          )}

          {bypassCooldown && (
            <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1.5">
              <span>Cooldown Bypassed (Showing all vacancies)</span>
              <button
                type="button"
                onClick={() => setBypassCooldown(false)}
                className="ml-1 text-[10px] underline text-amber-200 hover:text-white font-bold"
              >
                Re-enable
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsAppliedVaultOpen(true)}
            className="px-3 py-1.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition"
            title="View jobs you applied to that are hidden for 10 days"
          >
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span>10-Day Protected Vault ({appliedRecords.length})</span>
          </button>
        </div>
      </div>

      {/* ========================================================
          3-AI STATUS & HERO ENGINE CARD
          ======================================================== */}
      <section
        className={`p-5 sm:p-6 rounded-3xl border transition-all shadow-md relative overflow-hidden ${
          theme === 'dark'
            ? 'bg-gradient-to-br from-[#121826] via-[#151d30] to-[#121826] border-slate-700/80'
            : 'bg-gradient-to-br from-white via-slate-50 to-blue-50/30 border-slate-200'
        }`}
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-5 border-b border-slate-700/30">
          <div className="flex items-start gap-3.5">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-xl shrink-0 ${
                selectedMarket === 'cyprus'
                  ? 'bg-gradient-to-tr from-amber-500 to-orange-600 shadow-amber-500/25'
                  : 'bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 shadow-blue-500/25'
              }`}
            >
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-bold tracking-tight">
                  {selectedMarket === 'cyprus' ? '🇨🇾 Cyprus Job Market Engine' : '🇪🇺 Europe Job Market Engine'}
                </h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                    selectedMarket === 'cyprus'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                  }`}
                >
                  {selectedMarket === 'cyprus' ? 'Strict Cyprus Isolation' : 'All European Countries'}
                </span>
              </div>
              <p className={`text-xs mt-1 max-w-2xl leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                {selectedMarket === 'cyprus'
                  ? 'Gemini searches real Cyprus hospitality vacancies (Limassol, Paphos, Ayia Napa, Protaras, Larnaca); OpenAI & Grok verify legitimacy and contact emails. Jobs are prepared for your review.'
                  : 'Gemini searches vacancies across European hospitality destinations; OpenAI & Grok verify legitimacy, duplicate protection, and contact emails.'}
              </p>
            </div>
          </div>

          {/* Action Triggers: Prominent "New search" Button + Market Scan */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
            <button
              type="button"
              onClick={handleStartNewSearch}
              disabled={isSearching || isSending}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600 hover:from-emerald-400 hover:to-cyan-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
              title="Start a fresh search session with a new Search ID and fresh company domains (old results stay in history)"
            >
              <Search className={`w-4 h-4 ${isSearching ? 'animate-spin' : ''}`} />
              <span>New search</span>
            </button>

            <button
              type="button"
              onClick={() => handleRunPipeline({ forceBypass: true, isNewSearchSession: true })}
              disabled={isSearching || isSending}
              className={`px-5 py-3 rounded-2xl text-white font-bold text-xs shadow-lg flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50 ${
                selectedMarket === 'cyprus'
                  ? 'bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 hover:from-amber-400 hover:to-orange-500 shadow-amber-500/30'
                  : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-500/30'
              }`}
            >
              {isSearching ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Scanning {selectedMarket === 'cyprus' ? 'Cyprus' : 'Europe'}...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>
                    {selectedMarket === 'cyprus'
                      ? 'Find Fresh Cyprus Vacancies'
                      : 'Find Fresh European Vacancies'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Separate Data Stores Bar: Searches | Deduplicated Companies (by Website Domain) | Email History */}
        <div className="mt-4 p-3 rounded-2xl bg-slate-900/60 border border-slate-700/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-mono font-bold">
              Active Search ID: {activeSearchSessionId || 'init'}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
              Searches History: {searchesHistory.length}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold">
              Companies (Unique Domains): {companiesByDomainCount}
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-purple-500/15 text-purple-300 border border-purple-500/30 font-semibold">
              Email History: {sendingHistory.length}
            </span>
          </div>

          {searchesHistory.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Past Searches:</span>
              <select
                value={activeSearchSessionId}
                onChange={e => {
                  const chosenId = e.target.value;
                  const found = searchesHistory.find(s => s.id === chosenId);
                  if (found && Array.isArray(found.results) && found.results.length > 0) {
                    setActiveSearchSessionId(found.id);
                    setActiveSearchId(found.id);
                    const otherMarket = preparedApplications.filter(a => {
                      const isCyprus =
                        a.market === 'cyprus' ||
                        a.location?.toLowerCase().includes('cyprus') ||
                        a.country?.toLowerCase().includes('cyprus');
                      return selectedMarket === 'cyprus' ? !isCyprus : isCyprus;
                    });
                    onUpdateApplications([...found.results, ...otherMarket]);
                    showNotice(`Loaded Search Session ${found.id} (${found.results.length} results) from history.`);
                  }
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs font-mono"
              >
                {searchesHistory.slice(0, 15).map((s, idx) => (
                  <option key={s.id} value={s.id}>
                    #{searchesHistory.length - idx} · {s.market.toUpperCase()} ({s.resultCount} jobs) — {new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* 3 AI Service Status Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
          <div
            className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs ${
              theme === 'dark' ? 'bg-[#182133] border-slate-700/60' : 'bg-white border-slate-200'
            }`}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shrink-0" />
            <div>
              <div className="font-bold flex items-center gap-1">
                <span>1. Gemini AI</span>
                <span className="text-[10px] text-blue-400 font-mono">(Search)</span>
              </div>
              <div className={`text-[11px] ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                Live Google Search for European bars & hotels
              </div>
            </div>
          </div>

          <div
            className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs ${
              theme === 'dark' ? 'bg-[#182133] border-slate-700/60' : 'bg-white border-slate-200'
            }`}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
            <div>
              <div className="font-bold flex items-center gap-1">
                <span>2. OpenAI</span>
                <span className="text-[10px] text-emerald-400 font-mono">(Verify)</span>
              </div>
              <div className={`text-[11px] ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                Role match & official contact verification
              </div>
            </div>
          </div>

          <div
            className={`p-3 rounded-xl border flex items-center gap-2.5 text-xs ${
              theme === 'dark' ? 'bg-[#182133] border-slate-700/60' : 'bg-white border-slate-200'
            }`}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0" />
            <div>
              <div className="font-bold flex items-center gap-1">
                <span>3. Grok</span>
                <span className="text-[10px] text-purple-400 font-mono">(Consensus)</span>
              </div>
              <div className={`text-[11px] ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                Consensus validation & duplicate prevention
              </div>
            </div>
          </div>
        </div>

        {/* Live Search Progress Banner */}
        {isSearching && (
          <div className="mt-4 p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs flex items-center gap-3 animate-pulse">
            <RefreshCw className="w-5 h-5 animate-spin shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-bold text-white text-sm">Searching & Verifying Openings...</div>
              <div className="text-xs text-blue-300 mt-0.5">{searchStage}</div>
            </div>
          </div>
        )}

        {/* Filter Toggle and Attached CV Summary */}
        <div className="mt-4 pt-3 border-t border-slate-700/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <Paperclip className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>
              Attached to each application:{' '}
              <span className="font-semibold text-emerald-400">{attachedCvName}</span>
              {isUsingPhoneCV && <span className="text-[10px] text-blue-400 ml-1">(Phone Storage)</span>}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowFilterSettings(!showFilterSettings)}
            className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 font-semibold"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{showFilterSettings ? 'Hide Search Filters' : 'Customize Roles & Locations'}</span>
            {showFilterSettings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Expandable Filter Settings */}
        {showFilterSettings && (
          <div
            className={`mt-4 p-4 rounded-2xl border space-y-4 ${
              theme === 'dark' ? 'bg-[#161f30] border-slate-700' : 'bg-white border-slate-300'
            }`}
          >
            {/* Roles Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-2">
                Target Hospitality Roles:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {DEFAULT_HOSPITALITY_ROLES.map(role => {
                  const active = selectedRoles.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => handleToggleRole(role)}
                      className={`px-3 py-1 rounded-xl text-xs font-semibold border transition ${
                        active
                          ? 'bg-blue-600 text-white border-blue-500'
                          : theme === 'dark'
                          ? 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                          : 'bg-slate-100 text-slate-600 border-slate-200 hover:text-slate-900'
                      }`}
                    >
                      {active ? '✓ ' : '+ '}
                      {role}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Location Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-2">
                Target European Regions:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {DEFAULT_EUROPE_LOCATIONS.map(loc => {
                  const active = selectedLocations.includes(loc);
                  return (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => handleToggleLocation(loc)}
                      className={`px-3 py-1 rounded-xl text-xs font-semibold border transition ${
                        active
                          ? 'bg-emerald-600 text-white border-emerald-500'
                          : theme === 'dark'
                          ? 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                          : 'bg-slate-100 text-slate-600 border-slate-200 hover:text-slate-900'
                      }`}
                    >
                      {active ? '✓ ' : '+ '}
                      {loc}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ========================================================
          PREPARED APPLICATIONS REVIEW BOARD
          Strict requirement: Must show all prepared applications
          User must manually approve before sending.
          ======================================================== */}
      {preparedApplications.length > 0 ? (
        <section
          className={`p-5 sm:p-6 rounded-3xl border transition-all shadow-md space-y-5 ${
            theme === 'dark' ? 'bg-[#121826]/90 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          {/* Header & Metrics Bar */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-700/30">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold">
                  Prepared Applications for Your Review ({preparedApplications.length})
                </h3>
              </div>
              <p className={`text-xs mt-0.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                Check each company and contact. Only checked applications will be sent when you click Send.
              </p>
            </div>

            {/* Filter Tabs & Select All */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center p-1 rounded-xl border border-slate-700 bg-slate-800/40 text-xs">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    statusFilter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All ({preparedApplications.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('verified')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    statusFilter === 'verified' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-emerald-400'
                  }`}
                >
                  Verified ({verifiedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('needs_review')}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                    statusFilter === 'needs_review' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-amber-400'
                  }`}
                >
                  Review ({reviewCount})
                </button>
                {duplicateCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter('duplicates')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                      statusFilter === 'duplicates' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-rose-400'
                    }`}
                  >
                    Duplicates ({duplicateCount})
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleStartNewSearch}
                disabled={isSearching || isSending}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm disabled:opacity-50"
                title="Run a brand new search with a fresh results list (old results stay in history)"
              >
                <Search className="w-3.5 h-3.5" />
                <span>New search</span>
              </button>

              <button
                type="button"
                onClick={handleApproveAllVerified}
                className="px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Approve Verified</span>
              </button>

              <button
                type="button"
                onClick={handleDeselectAll}
                className="px-3 py-1.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition"
              >
                Deselect All
              </button>

              {preparedApplications.some(a => a.status === 'sent') && (
                <button
                  type="button"
                  onClick={handleCheckAllReplies}
                  disabled={isCheckingAllReplies}
                  className="px-3 py-1.5 rounded-xl border border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 text-xs font-semibold flex items-center gap-1.5 transition"
                  title="Check connected Gmail for incoming replies from employers"
                >
                  <Inbox className="w-3.5 h-3.5" />
                  <span>{isCheckingAllReplies ? 'Checking Gmail...' : 'Check All Replies in Gmail'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Cards List */}
          <div className="space-y-4">
            {filteredApps.map((app, idx) => {
              const isExpanded = expandedAppId === app.id;
              const isEditing = editingAppId === app.id;

              return (
                <div
                  key={`${app.id}-${idx}`}
                  className={`p-4 sm:p-5 rounded-2xl border-2 transition-all relative ${
                    app.isApproved
                      ? 'border-emerald-500/60 bg-emerald-950/10 shadow-sm'
                      : app.verificationStatus === 'needs_review'
                      ? 'border-amber-500/40 bg-amber-950/5'
                      : theme === 'dark'
                      ? 'border-slate-800 bg-[#161f30]'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    {/* Left: Checkbox + Title */}
                    <div className="flex items-start gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => handleToggleApproval(app.id)}
                        className={`mt-1 w-6 h-6 rounded-lg flex items-center justify-center border transition shrink-0 ${
                          app.isApproved
                            ? 'bg-emerald-600 border-emerald-500 text-white shadow-sm'
                            : 'border-slate-600 hover:border-emerald-400 bg-slate-800 text-transparent'
                        }`}
                        title={app.isApproved ? 'Click to deselect' : 'Click to approve for sending'}
                      >
                        <Check className="w-4 h-4 stroke-[3]" />
                      </button>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-sm sm:text-base text-white truncate">
                            {app.company}
                          </h4>

                          {/* NEW Vacancy Badge (Requirement 16 & 18) */}
                          {app.isNewVacancy && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-gradient-to-r from-amber-500 to-rose-500 text-white tracking-wider flex items-center gap-1 shadow-sm animate-pulse">
                              <Sparkles className="w-2.5 h-2.5" />
                              <span>NEW</span>
                            </span>
                          )}

                          {/* Real-Time Outbox Queue Status Tracker: queued -> sending -> sent / failed / needs_review */}
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                              app.status === 'delivered' || app.deliveryStatus === 'delivered' || app.replyStatus === 'reply_received'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                : app.status === 'bounced' || app.status === 'delivery_failed' || app.deliveryStatus === 'bounced' || app.lifeCycleStatus === 'delivery_failed'
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                : app.status === 'accepted_by_gmail' || app.status === 'sent' || app.status === 'applied' || app.lifeCycleStatus === 'applied'
                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                : app.status === 'sending'
                                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30 animate-pulse'
                                : app.status === 'queued'
                                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                                : app.status === 'needs_review' || app.deliveryStatus === 'needs_review'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : app.status === 'rate_limited'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                : app.status === 'needs_action' || !app.recipientEmail
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                : app.status === 'failed'
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                : app.isApproved || app.lifeCycleStatus === 'approved'
                                ? 'bg-teal-500/20 text-teal-300 border-teal-500/30'
                                : 'bg-slate-500/20 text-slate-300 border-slate-500/30'
                            }`}
                          >
                            {app.status === 'delivered' || app.deliveryStatus === 'delivered' || app.replyStatus === 'reply_received'
                              ? 'sent (delivered)'
                              : app.status === 'bounced' || app.status === 'delivery_failed' || app.deliveryStatus === 'bounced' || app.lifeCycleStatus === 'delivery_failed'
                              ? 'failed (bounced)'
                              : app.status === 'accepted_by_gmail' || app.status === 'sent' || app.status === 'applied' || app.lifeCycleStatus === 'applied'
                              ? 'sent'
                              : app.status === 'sending'
                              ? 'sending'
                              : app.status === 'queued'
                              ? 'queued'
                              : app.status === 'needs_review' || app.deliveryStatus === 'needs_review'
                              ? 'needs_review'
                              : app.status === 'rate_limited'
                              ? 'rate_limited (backoff)'
                              : app.status === 'needs_action' || !app.recipientEmail
                              ? 'needs_review'
                              : app.status === 'failed'
                              ? 'failed'
                              : 'draft'}
                          </span>

                          {/* Website Domain Badge (Deduplication key across searches) */}
                          {extractWebsiteDomain(app) && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-900 text-cyan-300 border border-cyan-500/25">
                              🌐 {extractWebsiteDomain(app)}
                            </span>
                          )}

                          {/* Market Tag */}
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                            {app.market === 'cyprus' || app.location?.toLowerCase().includes('cyprus')
                              ? '🇨🇾 Cyprus'
                              : '🇪🇺 Europe'}
                          </span>

                          {/* Verification Badge */}
                          {app.verificationStatus === 'verified' && Boolean(app.recipientEmail) && !app.isDuplicate ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" />
                              <span>Verified Official Email</span>
                            </span>
                          ) : app.isDuplicate ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Duplicate Prevented</span>
                            </span>
                          ) : !app.recipientEmail ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Email unavailable — Portal Only</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Needs Review: Verify Email</span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap">
                          <span className="font-medium text-slate-200">{app.position}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-500" />
                            {app.location}
                          </span>
                          <span>·</span>
                          {app.recipientEmail ? (
                            <span className="font-mono text-blue-400 font-semibold">
                              {app.recipientEmail}
                            </span>
                          ) : (
                            <span className="font-mono text-amber-300 font-bold">
                              Email unavailable
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[11px] text-slate-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            <span>Posted: {app.jobPostingDate || 'Recent (< 3 mos)'}</span>
                            {app.jobPostingDateVerified ? (
                              <span className="text-[10px] text-emerald-400 font-semibold">(Verified)</span>
                            ) : (
                              <span className="text-[10px] text-amber-400 font-semibold">(Date Needs Review)</span>
                            )}
                          </span>
                          <span>·</span>
                          {app.emailVerificationStatus === 'verified' && Boolean(app.recipientEmail) ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                              Email Verified
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/25">
                              Email unavailable — Apply via Official Portal
                            </span>
                          )}
                          {(app.applicationUrl || app.jobUrl || app.sourceUrl) && (
                            <>
                              <span>·</span>
                              <a
                                href={app.applicationUrl || app.jobUrl || app.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-400 hover:underline flex items-center gap-1 text-[11px] font-semibold"
                              >
                                <span>Official Application Portal</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </>
                          )}
                        </div>

                        {/* Six-Month Sponsorship Reality Section (Target: April 18, 2027) */}
                        <div className="mt-2.5 p-2.5 rounded-xl border border-indigo-500/25 bg-indigo-950/20 text-xs space-y-1.5">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-1.5 font-bold text-indigo-300">
                              <Clock className="w-3.5 h-3.5 text-indigo-400" />
                              <span>6-Month Sponsorship Reality:</span>
                              <span className="text-white font-mono bg-indigo-900/50 px-1.5 py-0.5 rounded text-[11px]">
                                Target: April 18, 2027
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {app.isFastestRoute && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-xs">
                                  ⚡ FASTEST ROUTE
                                </span>
                              )}
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  app.sponsorshipFeasibility === 'High' || app.sponsorshipStatus === 'Confirmed by Official Evidence'
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                    : app.sponsorshipFeasibility === 'Not Available'
                                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                }`}
                              >
                                Feasibility: {app.sponsorshipFeasibility || 'High'} ({app.sixMonthSponsorshipScore || 90}%)
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300">
                            <div>
                              <span className="text-slate-400">Legal Pathway: </span>
                              <span className="font-semibold text-white">
                                {app.legalRoute || app.permitType || (app.market === 'cyprus' ? 'Cyprus Seasonal Hospitality Permit' : 'EU Single Permit')}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400">Visa Processing: </span>
                              <span className="font-semibold text-emerald-300">
                                {app.processingTimeline || '4–8 weeks'} (Fits 6-Month Deadline)
                              </span>
                            </div>
                          </div>

                          {app.sponsorshipRationale && (
                            <div className="text-[11px] text-slate-300 leading-relaxed border-t border-indigo-500/20 pt-1">
                              <span className="text-slate-400">Rationale: </span>
                              {app.sponsorshipRationale}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto flex-wrap">
                      {app.recipientEmail ? (
                        <button
                          type="button"
                          onClick={() => setDispatchModalApp(app)}
                          className="px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition active:scale-95"
                          title="Open Gmail Dispatch Center"
                        >
                          <Send className="w-3.5 h-3.5 -rotate-12" />
                          <span>Send via Gmail</span>
                        </button>
                      ) : (
                        <a
                          href={app.applicationUrl || app.jobUrl || app.sourceUrl || '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-1.5 transition"
                          title="Direct email unavailable — apply on official employer portal"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Apply via Official Portal</span>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const updated = preparedApplications.map(a =>
                            a.id === app.id
                              ? {
                                  ...a,
                                  lifeCycleStatus: (a.status === 'applied' || a.lifeCycleStatus === 'applied'
                                    ? 'applied'
                                    : a.isApproved
                                    ? 'approved'
                                    : 'viewed') as JobLifeCycleStatus,
                                  viewedAt: Date.now(),
                                }
                              : a
                          );
                          onUpdateApplications(updated);
                          setReviewingApp({
                            ...app,
                            lifeCycleStatus: (app.status === 'applied' || app.lifeCycleStatus === 'applied'
                              ? 'applied'
                              : app.isApproved
                              ? 'approved'
                              : 'viewed') as JobLifeCycleStatus,
                            viewedAt: Date.now(),
                          });
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition"
                        title="Review complete application before approving"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Review Application</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setExpandedAppId(isExpanded ? null : app.id)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-semibold text-slate-300 flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{isExpanded ? 'Hide' : 'Cover Letter'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingAppId(isEditing ? null : app.id)}
                        className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white"
                        title="Edit email or cover letter"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      {app.status === 'sent' && (
                        <button
                          type="button"
                          onClick={() => handleCheckReply(app)}
                          disabled={checkingReplyId === app.id}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 text-xs font-semibold flex items-center gap-1"
                          title="Check Gmail for reply from this employer"
                        >
                          <Inbox className="w-3.5 h-3.5" />
                          <span>{checkingReplyId === app.id ? 'Checking...' : 'Check Reply'}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDeleteApplication(app.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"
                        title="Exclude this application"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Real Error Text Banner for failed, bounced, rate_limited, or needs_review emails */}
                  {app.errorReason && (
                    <div
                      className={`mt-3 p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                        app.status === 'needs_review' || app.deliveryStatus === 'needs_review'
                          ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                          : 'bg-rose-950/30 border-rose-500/40 text-rose-200'
                      }`}
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                      <div className="min-w-0 flex-1">
                        <div className="font-bold uppercase text-[10px] tracking-wider">
                          {app.status === 'needs_review' || app.deliveryStatus === 'needs_review'
                            ? 'Needs Review (Connection Dropped / Interrupted — Do Not Auto-Resend)'
                            : 'Delivery Error Details'}
                        </div>
                        <div className="font-mono text-[11px] mt-0.5 break-all">{app.errorReason}</div>
                      </div>
                    </div>
                  )}

                  {/* Review Notice if unverified or duplicate */}
                  {app.reviewReason && (
                    <div className="mt-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                      <span>{app.reviewReason}</span>
                    </div>
                  )}

                  {/* Live Employer Reply Banner if detected in Gmail */}
                  {app.replyStatus === 'reply_received' && (
                    <div className="mt-3 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Inbox className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div>
                          <span className="font-bold">Reply received in your Gmail inbox!</span>
                          {app.replySnippet && (
                            <div className="text-[11px] text-slate-300 mt-0.5 line-clamp-1 italic">
                              "{app.replySnippet}"
                            </div>
                          )}
                        </div>
                      </div>
                      <a
                        href="https://mail.google.com/mail/u/0/#inbox"
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shrink-0 flex items-center gap-1"
                      >
                        <span>Open Gmail</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                  {/* Inline Editor if active */}
                  {isEditing && (
                    <div className="mt-3.5 pt-3.5 border-t border-slate-700/60 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block text-slate-400 font-semibold mb-1">Company:</label>
                          <input
                            type="text"
                            defaultValue={app.company}
                            id={`edit-company-${app.id}`}
                            className="w-full p-2 rounded-xl bg-slate-900 border border-slate-700 text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 font-semibold mb-1">Recipient Email:</label>
                          <input
                            type="email"
                            defaultValue={app.recipientEmail}
                            id={`edit-email-${app.id}`}
                            placeholder="careers@hotel.com"
                            className="w-full p-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono"
                          />
                        </div>
                      </div>

                      <div className="text-xs">
                        <label className="block text-slate-400 font-semibold mb-1">Subject Line:</label>
                        <input
                          type="text"
                          defaultValue={app.subject}
                          id={`edit-subject-${app.id}`}
                          className="w-full p-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-medium"
                        />
                      </div>

                      <div className="text-xs">
                        <label className="block text-slate-400 font-semibold mb-1">Tailored Cover Letter:</label>
                        <textarea
                          defaultValue={app.coverLetter}
                          id={`edit-cover-${app.id}`}
                          rows={6}
                          className="w-full p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-[11px] leading-relaxed"
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingAppId(null)}
                          className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-semibold text-slate-400 hover:text-white"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const company = (document.getElementById(`edit-company-${app.id}`) as HTMLInputElement)?.value;
                            const email = (document.getElementById(`edit-email-${app.id}`) as HTMLInputElement)?.value;
                            const subject = (document.getElementById(`edit-subject-${app.id}`) as HTMLInputElement)?.value;
                            const coverLetter = (document.getElementById(`edit-cover-${app.id}`) as HTMLTextAreaElement)?.value;
                            handleSaveAppEdit(app.id, { company, recipientEmail: email, subject, coverLetter });
                          }}
                          className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Expandable Cover Letter & Subject Preview */}
                  {isExpanded && !isEditing && (
                    <div className="mt-3.5 pt-3.5 border-t border-slate-700/60 space-y-2 text-xs">
                      <div>
                        <span className="text-slate-400 font-semibold">Subject: </span>
                        <span className="font-semibold text-slate-200">{app.subject}</span>
                      </div>
                      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-slate-300 font-['Inter'] leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto">
                        {app.coverLetter}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                        <span>
                          Attachment: <span className="text-emerald-400 font-semibold">{attachedCvName}</span>
                        </span>
                        {app.sourceUrl && (
                          <a
                            href={app.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-400 hover:underline flex items-center gap-1"
                          >
                            <span>View Source Posting</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {filteredApps.length === 0 && (
              <div className="p-8 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-white text-base">No vacancies visible under current filter</h4>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    {marketJobs.length === 0
                      ? `Your 10-day protected vault contains ${appliedRecords.length} jobs. Bypass cooldown or scan fresh European openings to replenish active vacancies instantly.`
                      : `You have ${marketJobs.length} active vacancies available in your database.`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setBypassCooldown(true);
                      setStatusFilter('all');
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-md"
                  >
                    Bypass Cooldown & Show All ({preparedApplications.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRunPipeline({ forceBypass: true })}
                    disabled={isSearching}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition shadow-md flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSearching ? 'animate-spin' : ''}`} />
                    <span>Find Fresh European Vacancies</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ========================================================
              FINAL SEND BUTTON & STATUS BAR
              Strict requirement: Send each approved application
              separately from the connected Gmail account.
              ======================================================== */}
          <div className="pt-4 border-t border-slate-700/40 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-slate-400">
              <span className="font-bold text-white text-sm">{approvedApps.length}</span> of {preparedApplications.length} applications approved for sending · Connected Gmail:{' '}
              <span className="font-semibold text-blue-400">{userEmail}</span>
            </div>

            <button
              type="button"
              onClick={async () => {
                if (!hasToken) {
                  const connected = await onConnectGmail();
                  if (!connected) return;
                }
                setIsConfirmModalOpen(true);
              }}
              disabled={approvedApps.length === 0 || isSending}
              className={`w-full sm:w-auto px-6 py-3 rounded-2xl ${
                !hasToken
                  ? 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-600/25'
                  : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/25'
              } text-white font-bold text-sm shadow-xl flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {isSending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : !hasToken ? (
                <Mail className="w-4 h-4" />
              ) : (
                <Send className="w-4 h-4 -rotate-12" />
              )}
              <span>
                {isSending
                  ? 'Sending Applications...'
                  : !hasToken
                  ? `Connect Gmail & Send (${approvedApps.length})`
                  : `Send Approved Applications via Gmail (${approvedApps.length})`}
              </span>
            </button>
          </div>
        </section>
      ) : (
        <section
          className={`p-8 sm:p-10 rounded-3xl border text-center space-y-4 ${
            theme === 'dark' ? 'bg-[#121826]/90 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center mx-auto">
            <Sparkles className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white">
              Ready to Discover {selectedMarket === 'cyprus' ? 'Cyprus' : 'European'} Hospitality Vacancies
            </h3>
            <p className="text-xs text-slate-400 max-w-lg mx-auto">
              Click below to initiate the 3-AI agent pipeline (Gemini live search + OpenAI verification + Grok consensus) to populate fresh verified vacancies.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleRunPipeline({ forceBypass: true })}
            disabled={isSearching}
            className="px-6 py-3 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white font-bold text-xs shadow-xl flex items-center gap-2 mx-auto transition active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isSearching ? 'animate-spin' : ''}`} />
            <span>{isSearching ? 'Scanning Europe...' : selectedMarket === 'cyprus' ? 'Find Fresh Cyprus Vacancies' : 'Find Fresh European Vacancies'}</span>
          </button>
        </section>
      )}

      {/* ========================================================
          CONFIRMATION MODAL BEFORE SENDING
          ======================================================== */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <div
            className={`w-full max-w-lg rounded-3xl border p-6 sm:p-7 shadow-2xl space-y-4 ${
              theme === 'dark' ? 'bg-[#121826] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center mx-auto">
              <Send className="w-6 h-6 -rotate-12" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold">Send {approvedApps.length} Approved Applications?</h3>
              <p className="text-xs text-slate-400">
                You have manually approved {approvedApps.length} individual applications.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/25 text-xs space-y-2 text-slate-300">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                <Check className="w-4 h-4 shrink-0" />
                <span>Sent separately from your real connected Gmail ({userEmail})</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-blue-400 shrink-0" />
                <span>NO bulk CC or BCC used. Each company receives a personalized, private email</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-blue-400 shrink-0" />
                <span>
                  Attached CV: <span className="font-semibold text-white">{attachedCvName}</span>
                </span>
              </div>
              <div className="flex items-center gap-2 text-blue-300 font-semibold">
                <Inbox className="w-4 h-4 shrink-0" />
                <span>When employers reply, their response arrives directly in your Gmail inbox</span>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="w-1/2 py-2.5 rounded-xl border border-slate-700 text-xs font-semibold hover:bg-slate-800 transition"
              >
                Go Back & Review
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsConfirmModalOpen(false);
                  if (!hasToken) {
                    const connected = await onConnectGmail();
                    if (!connected) return;
                  }
                  await onSendApprovedApplications(approvedApps);
                }}
                className="w-1/2 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 transition"
              >
                <Send className="w-3.5 h-3.5 -rotate-12" />
                <span>
                  {!hasToken ? `Connect & Send All (${approvedApps.length})` : `Confirm & Send All (${approvedApps.length})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          USER REVIEW: COMPLETE APPLICATION REVIEW MODAL
          Strict requirement 7:
          First show me the complete application:
          1. Company
          2. Position
          3. Location
          4. Email
          5. Email verification status
          6. Job posting date
          7. Job URL
          8. Application URL if available
          9. Email subject
          10. Application message
          11. Cover letter
          12. Selected CV
          Only applications approved can be sent.
          ======================================================== */}
      {reviewingApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-sm overflow-y-auto">
          <div
            className={`w-full max-w-3xl my-auto rounded-3xl border p-5 sm:p-7 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto ${
              theme === 'dark' ? 'bg-[#121826] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-700/40">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg">Review Complete Job Application</h3>
                  <p className="text-[11px] text-slate-400">
                    Verify all 12 application details before manual approval. Only approved applications can be sent.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReviewingApp(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Complete 12-Item Review Grid */}
            <div className="space-y-4 text-xs">
              {/* Item 1, 2, 3: Company, Position, Location */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    1. Company Name
                  </span>
                  <input
                    type="text"
                    defaultValue={reviewingApp.company}
                    id={`review-company-${reviewingApp.id}`}
                    className="w-full bg-transparent font-bold text-white border-b border-transparent focus:border-blue-500 outline-none"
                  />
                </div>

                <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    2. Exact Position
                  </span>
                  <input
                    type="text"
                    defaultValue={reviewingApp.position}
                    id={`review-position-${reviewingApp.id}`}
                    className="w-full bg-transparent font-semibold text-white border-b border-transparent focus:border-blue-500 outline-none"
                  />
                </div>

                <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    3. Location (City, Country)
                  </span>
                  <div className="flex items-center gap-1 text-slate-200 font-medium">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{reviewingApp.location}</span>
                  </div>
                  {(reviewingApp.city || reviewingApp.country) && (
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      City: {reviewingApp.city || '—'} · Country: {reviewingApp.country || '—'}
                    </div>
                  )}
                </div>
              </div>

              {/* Item 4 & 5: Email & Email Verification Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      4. Recipient Email
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">Real business contact</span>
                  </div>
                  <input
                    type="email"
                    defaultValue={reviewingApp.recipientEmail}
                    id={`review-email-${reviewingApp.id}`}
                    placeholder="careers@company.com"
                    className="w-full p-2 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-blue-300 outline-none focus:border-blue-500"
                  />
                </div>

                <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    5. Email Verification Status
                  </span>
                  <div className="flex items-center gap-2">
                    {reviewingApp.emailVerificationStatus === 'verified' && !reviewingApp.isDuplicate ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        <span>VERIFIED (Valid Format & Domain Association)</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>EMAIL STATUS = NEEDS REVIEW</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {reviewingApp.emailVerificationReason || reviewingApp.reviewReason || 'Verified via official corporate domain.'}
                  </p>
                </div>
              </div>

              {/* Item 6, 7, 8: Job Posting Date, Job URL, Application URL */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    6. Job Posting Date
                  </span>
                  <div className="flex items-center gap-1.5 text-slate-200">
                    <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="font-semibold">{reviewingApp.jobPostingDate || 'Recent'}</span>
                  </div>
                  <div className="mt-1">
                    {reviewingApp.jobPostingDateVerified ? (
                      <span className="text-[10px] text-emerald-400 font-semibold">✓ Verified within 3 months</span>
                    ) : (
                      <span className="text-[10px] text-amber-400 font-semibold">JOB STATUS = NEEDS REVIEW</span>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    7. Job URL / Source
                  </span>
                  {reviewingApp.jobUrl || reviewingApp.sourceUrl ? (
                    <a
                      href={reviewingApp.jobUrl || reviewingApp.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 hover:underline flex items-center gap-1 break-all text-[11px]"
                    >
                      <span className="truncate">{reviewingApp.jobUrl || reviewingApp.sourceUrl}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="text-slate-500 italic">No external link</span>
                  )}
                </div>

                <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    8. Official Application URL
                  </span>
                  {reviewingApp.applicationUrl ? (
                    <a
                      href={reviewingApp.applicationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-400 hover:underline flex items-center gap-1 break-all text-[11px]"
                    >
                      <span className="truncate">{reviewingApp.applicationUrl}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="text-slate-400 text-[11px]">Direct email application used</span>
                  )}
                </div>
              </div>

              {/* Item 9: Email Subject */}
              <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    9. Email Subject Line
                  </span>
                  <span className="text-[10px] text-slate-400">Example: Application for [Role] Position – Fazle Rabbi Boyati</span>
                </div>
                <input
                  type="text"
                  defaultValue={reviewingApp.subject}
                  id={`review-subject-${reviewingApp.id}`}
                  className="w-full p-2 rounded-xl bg-slate-950 border border-slate-800 font-medium text-xs text-slate-200 outline-none focus:border-blue-500"
                />
              </div>

              {/* Item 10: Single Personalized Master Cover Letter */}
              <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      10. Single Personalized Cover Letter (Email Message Body)
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                      Single Letter Verified ✓
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={isPersonalizing}
                    onClick={() => handlePersonalizeCurrentApp(reviewingApp)}
                    className="px-3 py-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-[11px] font-bold flex items-center gap-1.5 transition disabled:opacity-50 shadow-sm"
                  >
                    <Sparkles className="w-3 h-3 text-amber-300" />
                    <span>{isPersonalizing ? 'Personalizing...' : `AI Personalize for ${reviewingApp.company}`}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Unified cover letter. No separate introduction or double salutation will be appended.
                </p>
                <textarea
                  defaultValue={reviewingApp.coverLetter}
                  id={`review-cover-${reviewingApp.id}`}
                  rows={9}
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 font-mono text-[11px] leading-relaxed outline-none focus:border-blue-500"
                />
              </div>

              {/* Item 11: Exact Live Gmail Transmission Preview */}
              <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" />
                    <span>11. Live Gmail Transmission Preview (What the Employer Receives)</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">No CC / No BCC</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1.5 font-mono">
                  <div className="text-slate-400">
                    <span className="text-slate-500">From: </span>
                    <span className="text-slate-200 font-semibold">{userName || 'Fazle Rabbi Boyati'} &lt;{userEmail || 'fazle.rabbe.doc@gmail.com'}&gt;</span>
                  </div>
                  <div className="text-slate-400">
                    <span className="text-slate-500">To: </span>
                    <span className="text-blue-400 font-semibold">{reviewingApp.recipientEmail || 'Direct Careers Email'}</span>
                  </div>
                  <div className="text-slate-400">
                    <span className="text-slate-500">Subject: </span>
                    <span className="text-slate-200">{reviewingApp.subject}</span>
                  </div>
                  <div className="text-slate-400 flex items-center gap-2 pt-1 border-t border-slate-800">
                    <Paperclip className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-300 font-semibold">{attachedCvName}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400">PDF Attached</span>
                  </div>
                </div>
              </div>

              {/* Item 12: Selected CV */}
              <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    12. Selected CV Attachment
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <Paperclip className="w-4 h-4 text-emerald-400" />
                    <span className="font-bold text-white text-xs">{attachedCvName}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                      PDF Ready
                    </span>
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 text-right">
                  Includes professional portfolio link & verified hospitality credentials
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-700/40">
              <div className="text-xs text-slate-400">
                Status:{' '}
                {reviewingApp.isApproved ? (
                  <span className="text-emerald-400 font-bold">Approved for sending</span>
                ) : (
                  <span className="text-amber-300 font-semibold">Pending your manual approval</span>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    const company = (document.getElementById(`review-company-${reviewingApp.id}`) as HTMLInputElement)?.value;
                    const position = (document.getElementById(`review-position-${reviewingApp.id}`) as HTMLInputElement)?.value;
                    const email = (document.getElementById(`review-email-${reviewingApp.id}`) as HTMLInputElement)?.value;
                    const subject = (document.getElementById(`review-subject-${reviewingApp.id}`) as HTMLInputElement)?.value;
                    const coverLetter = (document.getElementById(`review-cover-${reviewingApp.id}`) as HTMLTextAreaElement)?.value;

                    handleSaveAppEdit(reviewingApp.id, {
                      company,
                      position,
                      recipientEmail: email,
                      subject,
                      applicationMessage: undefined, // Single cover letter guaranteed
                      coverLetter,
                    });
                    showNotice('Application edits saved successfully!');
                  }}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-xs font-semibold text-slate-300 transition"
                >
                  Save Edits
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const company = (document.getElementById(`review-company-${reviewingApp.id}`) as HTMLInputElement)?.value;
                    const position = (document.getElementById(`review-position-${reviewingApp.id}`) as HTMLInputElement)?.value;
                    const email = (document.getElementById(`review-email-${reviewingApp.id}`) as HTMLInputElement)?.value;
                    const subject = (document.getElementById(`review-subject-${reviewingApp.id}`) as HTMLInputElement)?.value;
                    const coverLetter = (document.getElementById(`review-cover-${reviewingApp.id}`) as HTMLTextAreaElement)?.value;

                    const newApproved = !reviewingApp.isApproved;
                    handleSaveAppEdit(reviewingApp.id, {
                      company,
                      position,
                      recipientEmail: email,
                      subject,
                      applicationMessage: undefined, // Single cover letter guaranteed
                      coverLetter,
                      isApproved: newApproved,
                    });

                    setReviewingApp(null);
                    showNotice(
                      newApproved
                        ? `Approved application to ${company || reviewingApp.company}! Ready for sending.`
                        : `Revoked approval for ${company || reviewingApp.company}.`
                    );
                  }}
                  className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg transition ${
                    reviewingApp.isApproved
                      ? 'bg-amber-600 hover:bg-amber-500 text-white'
                      : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-500/30'
                  }`}
                >
                  {reviewingApp.isApproved ? (
                    <>
                      <X className="w-3.5 h-3.5" />
                      <span>Revoke Approval</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                      <span>Approve This Application</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ========================================================
          10-DAY APPLIED PROTECTION VAULT MODAL (Requirement 13)
          ======================================================== */}
      {isAppliedVaultOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-sm overflow-y-auto">
          <div
            className={`w-full max-w-4xl my-auto rounded-3xl border p-5 sm:p-7 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto ${
              theme === 'dark' ? 'bg-[#121826] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-700/40">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg">
                    10-Day Applied Protection Vault ({appliedRecords.length} Records)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Exact jobs you applied to are locked and hidden from normal results for 10 days to prevent duplicates.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAppliedVaultOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Explanatory Notice */}
            <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/25 text-xs text-blue-300 leading-relaxed flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 shrink-0 text-blue-400 mt-0.5" />
              <div>
                <span className="font-bold text-white">Rule 13 Enforced:</span> Once you apply to a job, that exact vacancy is saved persistently (Job ID, Company, Position, Job URL, Recipient Email, Application Date, Gmail Message ID, Application Status). For the next 10 days, that exact job will not appear in normal results, even after page reloads, app restarts, or browser refreshes. After 10 days, it only becomes eligible again if still active.
              </div>
            </div>

            {/* Applied Records Table */}
            {appliedRecords.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs">
                No applied jobs in cooldown yet. When you approve and send applications, they will appear here and be protected from redisplay for 10 days.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-2.5 font-bold uppercase tracking-wider text-[10px]">Market</th>
                      <th className="pb-2.5 font-bold uppercase tracking-wider text-[10px]">Company & Position</th>
                      <th className="pb-2.5 font-bold uppercase tracking-wider text-[10px]">Recipient Email</th>
                      <th className="pb-2.5 font-bold uppercase tracking-wider text-[10px]">Application Date</th>
                      <th className="pb-2.5 font-bold uppercase tracking-wider text-[10px]">Gmail ID</th>
                      <th className="pb-2.5 font-bold uppercase tracking-wider text-[10px] text-right">Cooldown Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {appliedRecords.map((rec, idx) => {
                      const elapsed = Date.now() - rec.appliedTimestamp;
                      const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
                      const remainingMs = tenDaysMs - elapsed;
                      const remainingDays = Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
                      const isStillHidden = elapsed < tenDaysMs;

                      return (
                        <tr key={`${rec.jobId || rec.id}-${idx}`} className="hover:bg-slate-800/30 transition">
                          <td className="py-2.5 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                              {rec.market === 'cyprus' ? '🇨🇾 Cyprus' : '🇪🇺 Europe'}
                            </span>
                          </td>
                          <td className="py-2.5 font-semibold text-white">
                            <div>{rec.company}</div>
                            <div className="text-[11px] text-slate-400 font-normal">{rec.position}</div>
                            {rec.jobUrl && (
                              <a
                                href={rec.jobUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] text-blue-400 hover:underline flex items-center gap-1 mt-0.5"
                              >
                                <span className="truncate max-w-[150px]">{rec.jobUrl}</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </td>
                          <td className="py-2.5 font-mono text-blue-300 text-[11px]">{rec.recipientEmail}</td>
                          <td className="py-2.5 text-slate-300 whitespace-nowrap text-[11px]">
                            {new Date(rec.applicationDate).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </td>
                          <td className="py-2.5 font-mono text-slate-400 text-[10px] truncate max-w-[120px]" title={rec.gmailMessageId || 'Direct'}>
                            {rec.gmailMessageId ? rec.gmailMessageId.slice(0, 14) + '...' : 'Verified'}
                          </td>
                          <td className="py-2.5 text-right whitespace-nowrap">
                            {isStillHidden ? (
                              <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                Hidden ({remainingDays}d left)
                              </span>
                            ) : (
                              <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                Cooldown Completed
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex justify-end pt-3 border-t border-slate-700/40">
              <button
                type="button"
                onClick={() => setIsAppliedVaultOpen(false)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition"
              >
                Close Vault
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gmail Dispatch Center Modal */}
      {dispatchModalApp && (
        <GmailDispatchModal
          application={dispatchModalApp}
          selectedCvId={selectedCV?.id || ''}
          pdfBase64={isUsingPhoneCV && phoneCV ? phoneCV.base64 : undefined}
          pdfFilename={isUsingPhoneCV && phoneCV ? phoneCV.name : selectedCV?.title ? `${selectedCV.title}.pdf` : 'Fazle_Rabbi_CV.pdf'}
          onClose={() => setDispatchModalApp(null)}
          onSendApproved={(updatedApp, messageId) => {
            const updated = preparedApplications.map(a =>
              a.id === dispatchModalApp.id
                ? {
                    ...a,
                    ...updatedApp,
                    status: 'accepted_by_gmail' as const,
                    lifeCycleStatus: 'applied' as const,
                    deliveryStatus: 'accepted_by_gmail' as const,
                    sentTimestamp: new Date().toLocaleTimeString(),
                    messageId: messageId || a.messageId,
                  }
                : a
            );
            onUpdateApplications(updated);
            showNotice(`Accepted by Gmail for ${dispatchModalApp.company} (Message ID: ${messageId || 'Confirmed'})!`);
            setDispatchModalApp(null);
          }}
        />
      )}
    </div>
  );
};
