import React, { useState, useEffect, useMemo } from 'react';
import {
  MapPin,
  Search,
  RefreshCw,
  Mail,
  Send,
  Calendar,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Clock,
  FileText,
  AlertCircle,
  EyeOff,
  RotateCcw,
  ArrowRight,
  Globe,
  XCircle,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import {
  loadAppliedJobRecords,
  isJobAppliedWithin10Days,
  recordAppliedJob,
  fetchJobBatch,
  advanceJobBatch,
  submitApplicationToBackend,
  dismissJobFromBackend,
  markJobExpiredInBackend,
  triggerManualDiscovery,
  fetchApplicationHistoryFromBackend,
  BackendJobRecord,
  BatchResponse,
} from '../services/jobDatabaseService';
import {
  sendJobApplicationViaGmail,
  testGmailTokenValidity,
  createGmailWebmailUrl,
} from '../services/gmailService';
import { getCachedGoogleToken, signInWithGoogle } from '../services/firebase';
import { loadProfessionalPhotos } from '../services/photoStorageService';
import {
  loadCVLibrary,
  getActiveCVId,
  setActiveCVId,
  getCVAttachmentPayload,
} from '../services/cvStorage';
import { CVDocumentItem } from '../types/cv';
import { GmailDispatchModal } from '../components/GmailDispatchModal';
import { resolveVerifiedEmployerEmail } from '../utils/verifiedEmployerEmails';

interface CyprusJobMarketViewProps {
  onNavigateToCompose?: (email: string, subject: string, body: string) => void;
}

export function formatLifecycleStatusBadge(
  status?: string,
  lifecycleStatus?: string,
  method?: string
): { label: string; colorClass: string } {
  const effective = lifecycleStatus || status || 'eligible';
  switch (effective) {
    case 'prepared':
      return {
        label: 'Application Prepared',
        colorClass: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
      };
    case 'sending':
      return {
        label: 'Sending...',
        colorClass: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
      };
    case 'accepted_by_provider':
    case 'accepted_by_gmail':
      return {
        label: 'Accepted by Email Provider',
        colorClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      };
    case 'delivery_confirmed':
    case 'delivered':
      return {
        label: 'Delivery Confirmed',
        colorClass: 'bg-emerald-500/25 text-emerald-200 border-emerald-400/50',
      };
    case 'submitted_portal':
      return {
        label: 'Submitted through External Portal',
        colorClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
      };
    case 'submitted':
      return {
        label:
          method === 'portal'
            ? 'Submitted through External Portal'
            : 'Accepted by Email Provider',
        colorClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      };
    case 'bounced':
      return {
        label: 'Bounced — Check Recipient',
        colorClass: 'bg-rose-500/25 text-rose-200 border-rose-500/50',
      };
    case 'failed':
      return {
        label: 'Failed — Retry Available',
        colorClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      };
    default:
      return {
        label: 'New & Eligible',
        colorClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      };
  }
}

export const CyprusJobMarketView: React.FC<CyprusJobMarketViewProps> = ({
  onNavigateToCompose,
}) => {
  const { theme } = useTheme();

  const [keyword, setKeyword] = useState('');
  const [selectedCity, setSelectedCity] = useState('all');
  const [batchData, setBatchData] = useState<BatchResponse>({
    market: 'cyprus',
    batch: [],
    batchSize: 5,
    currentBatchIndex: 0,
    totalDiscovered: 0,
    totalEligibleRemaining: 0,
    allBatchCompleted: false,
    noMoreJobsAvailable: false,
    lastSearchTime: new Date().toISOString(),
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDiscoveringMore, setIsDiscoveringMore] = useState(false);
  const [showAppliedOnly, setShowAppliedOnly] = useState(false);
  const [viewTab, setViewTab] = useState<'active' | 'history'>('active');
  const [cyprusHistory, setCyprusHistory] = useState<BackendJobRecord[]>([]);
  const [appliedRecords, setAppliedRecords] = useState(() => loadAppliedJobRecords());
  const [dispatchModalJob, setDispatchModalJob] = useState<BackendJobRecord | null>(null);

  // Central CV Library State
  const [cvLibrary, setCvLibrary] = useState<CVDocumentItem[]>(() => loadCVLibrary());
  const [selectedCvId, setSelectedCvId] = useState<string>(() => {
    const active = getActiveCVId();
    const list = loadCVLibrary();
    return list.some(c => c.id === active) ? active : list[0]?.id || 'bartender-master-cv';
  });

  useEffect(() => {
    const syncCv = () => {
      const updated = loadCVLibrary();
      setCvLibrary(updated);
      const activeId = getActiveCVId();
      if (activeId && updated.some(c => c.id === activeId)) {
        setSelectedCvId(activeId);
      }
    };
    window.addEventListener('cv_library_updated', syncCv);
    window.addEventListener('central_cv_library_updated', syncCv);
    window.addEventListener('active_cv_changed', syncCv);
    return () => {
      window.removeEventListener('cv_library_updated', syncCv);
      window.removeEventListener('central_cv_library_updated', syncCv);
      window.removeEventListener('active_cv_changed', syncCv);
    };
  }, []);

  // Review Modal & Lifecycle State
  const [reviewingJob, setReviewingJob] = useState<BackendJobRecord | null>(null);
  const [personalizedLetter, setPersonalizedLetter] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [inFlightJobIds, setInFlightJobIds] = useState<Set<string>>(new Set());
  const [portalOpenedJobIds, setPortalOpenedJobIds] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Load 5-job active Cyprus batch from persistent backend database
  const loadCyprusBatch = async () => {
    setIsRefreshing(true);
    try {
      const data = await fetchJobBatch('cyprus', 5);
      setBatchData(data);
      setAppliedRecords(loadAppliedJobRecords());
    } catch (e) {
      console.warn('Cyprus batch fetch note:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadCyprusHistory = async () => {
    try {
      const allHistory = await fetchApplicationHistoryFromBackend({
        includeAllStatuses: true,
      });
      const cyprusOnly = allHistory.filter(
        j =>
          j.market === 'cyprus' ||
          (j.country || '').toLowerCase().includes('cyprus') ||
          (j.location || '').toLowerCase().includes('cyprus')
      );
      setCyprusHistory(cyprusOnly);
    } catch (e) {
      console.warn('Cyprus history load note:', e);
    }
  };

  useEffect(() => {
    loadCyprusBatch();
    loadCyprusHistory();
  }, []);

  const handleDiscoverMoreCyprus = async () => {
    setIsDiscoveringMore(true);
    try {
      const res = await triggerManualDiscovery('cyprus');
      showToast(
        res.newDiscovered > 0
          ? `Discovered ${res.newDiscovered} new verified Cyprus hospitality vacancies!`
          : 'All currently verified Cyprus sources have been checked and deduplicated.'
      );
      await loadCyprusBatch();
      await loadCyprusHistory();
    } catch (e: any) {
      showToast(`Cyprus discovery check: ${e?.message || 'Unable to refresh'}`);
    } finally {
      setIsDiscoveringMore(false);
    }
  };

  const handleDismissCyprusJob = async (jobId: string, employer: string) => {
    try {
      await dismissJobFromBackend(jobId, 'cyprus');
      showToast(`Hidden ${employer}. Replenishing next eligible Cyprus vacancy...`);
      await loadCyprusBatch();
      await loadCyprusHistory();
    } catch (e: any) {
      showToast(`Could not hide vacancy: ${e?.message}`);
    }
  };

  const handleMarkExpiredCyprusJob = async (jobId: string, employer: string) => {
    try {
      await markJobExpiredInBackend({
        jobId,
        status: 'expired',
        reason: 'Marked expired/closed from active Cyprus listings (history preserved)',
        market: 'cyprus',
      });
      showToast(
        `Removed expired vacancy at ${employer} from active listings (application history preserved).`
      );
      await loadCyprusBatch();
      await loadCyprusHistory();
    } catch (e: any) {
      showToast(`Could not mark vacancy expired: ${e?.message}`);
    }
  };

  // Open external vacancy link without falsely marking the application as submitted
  const handleOpenExternalPortalLink = (job: BackendJobRecord) => {
    const targetUrl = job.applicationUrl || job.originalJobUrl || job.sourceUrl;
    if (!targetUrl) {
      showToast('No external portal URL provided for this vacancy.');
      return;
    }
    setPortalOpenedJobIds(prev => {
      const next = new Set(prev);
      next.add(job.id);
      return next;
    });
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
    showToast(
      `Opened official vacancy page for ${job.employer}. Click "Confirm Portal Submitted" only after completing your submission on the employer site.`
    );
  };

  // Explicit user confirmation that an external portal application was completed
  const handleConfirmPortalSubmitted = async (job: BackendJobRecord) => {
    if (inFlightJobIds.has(job.id)) return;
    setInFlightJobIds(prev => new Set(prev).add(job.id));
    try {
      const activeCv = cvLibrary.find(c => c.id === selectedCvId) || cvLibrary[0];
      const portalUrl = job.applicationUrl || job.originalJobUrl || job.sourceUrl || '';
      await submitApplicationToBackend({
        jobId: job.id,
        market: 'cyprus',
        method: 'portal',
        status: 'submitted_portal',
        submissionLifecycleStatus: 'submitted_portal',
        employer: job.employer || job.company || 'Cyprus Hospitality Employer',
        title: job.title || job.position || 'Hospitality Role',
        country: 'Cyprus',
        location: job.location || 'Cyprus',
        sourceUrl: portalUrl,
        cvId: activeCv?.id,
        cvTitle: activeCv?.originalFile?.fileName || activeCv?.title || 'Master CV',
        notes: `Submitted through official employer portal (${portalUrl || 'Direct Career Page'})`,
      });

      recordAppliedJob({
        job: {
          ...job,
          company: job.employer || job.company,
          position: job.title || job.position,
        },
        gmailMessageId: `portal-cyp-${Date.now()}`,
        status: 'applied',
        cvId: activeCv?.id,
        cvTitle: activeCv?.originalFile?.fileName || activeCv?.title,
        sourceUrl: portalUrl,
      });

      setAppliedRecords(loadAppliedJobRecords());
      setReviewingJob(null);
      showToast(
        `Portal submission recorded for ${job.employer || job.company}! Loading next eligible Cyprus vacancy...`
      );
      await loadCyprusBatch();
      await loadCyprusHistory();
    } catch (err: any) {
      showToast(`Could not record portal application: ${err?.message}`);
    } finally {
      setInFlightJobIds(prev => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
    }
  };

  const filteredVacancies = useMemo(() => {
    const sourceList = showAppliedOnly ? cyprusHistory : batchData.batch;
    return sourceList.filter(job => {
      // Strictly ensure job is in Cyprus and not expired/closed in active view
      const countryLower = (job.country || '').toLowerCase();
      const locLower = (job.location || '').toLowerCase();
      const isCyprus =
        job.market === 'cyprus' ||
        countryLower.includes('cyprus') ||
        locLower.includes('cyprus') ||
        locLower.includes('limassol') ||
        locLower.includes('paphos') ||
        locLower.includes('ayia napa') ||
        locLower.includes('protaras') ||
        locLower.includes('larnaca') ||
        locLower.includes('nicosia');
      if (!isCyprus) return false;

      if (!showAppliedOnly && (job.jobStatus === 'expired' || job.jobStatus === 'closed')) {
        return false;
      }

      const cooldownCheck = isJobAppliedWithin10Days(job);
      const isAlreadyApplied =
        cooldownCheck.isApplied ||
        job.applicationStatus === 'submitted' ||
        job.status === 'applied';

      if (!showAppliedOnly && isAlreadyApplied && !job.followUpEligible) {
        return false;
      }
      if (showAppliedOnly && !isAlreadyApplied && job.applicationStatus !== 'failed') {
        return false;
      }

      if (selectedCity !== 'all') {
        if (!locLower.includes(selectedCity.toLowerCase())) return false;
      }

      if (keyword.trim()) {
        const q = keyword.toLowerCase();
        const emp = (job.employer || job.company || '').toLowerCase();
        const pos = (job.title || job.position || '').toLowerCase();
        if (!emp.includes(q) && !pos.includes(q) && !locLower.includes(q)) return false;
      }

      return true;
    });
  }, [batchData.batch, cyprusHistory, selectedCity, keyword, showAppliedOnly, appliedRecords]);

  const handleOpenReview = (job: BackendJobRecord) => {
    const employerName = job.employer || job.company || 'Cyprus Employer';
    const roleTitle = job.title || job.position || 'Bartender / Barista';
    const rawEmail = job.recipientEmail || (job as any).email || '';
    const resolved = resolveVerifiedEmployerEmail(rawEmail, employerName);
    const effectiveEmail =
      resolved.isDeliverable && resolved.verifiedEmail ? resolved.verifiedEmail : rawEmail;

    setReviewingJob({
      ...job,
      employer: employerName,
      company: employerName,
      title: roleTitle,
      position: roleTitle,
      recipientEmail: effectiveEmail,
      applicationUrl:
        job.applicationUrl || resolved.officialPortalUrl || job.originalJobUrl || job.sourceUrl || '',
      emailVerificationStatus:
        resolved.contactStatus === 'Verified Hiring Contact'
          ? 'verified'
          : 'unverified',
      contactLabel:
        resolved.contactStatus === 'Verified Hiring Contact'
          ? 'Verified HR Contact'
          : resolved.contactType === 'Official Portal Only'
          ? 'Official Portal Only'
          : 'Unverified',
    });

    const letter = `Fazle Rabbi Boyati
Limassol Marina, Cyprus
+357 9550 2363 | fazle.rabbe.doc@gmail.com
LinkedIn: https://www.linkedin.com/in/fazle-rabbi-5785aa269

Dear Hiring Team at ${employerName},

I am writing to express my strong interest in the ${roleTitle} position at your establishment in ${
      job.location || 'Cyprus'
    }. With over five years of experience in high-volume bars, beach resorts and five-star hotels across Cyprus and Bangladesh, I am confident I can deliver consistent, high-quality service to your guests.

I am currently working as a Senior Bartender at Gazebo Mare / Epsilon / Delta Restro Bar in Limassol Marina. My previous Cyprus experience includes:
- Flamingo Paradise Beach Hotel, Protaras, Cyprus
- O'Neill's Irish Pub and Restaurant, Paphos, Cyprus

I prepare classic and signature cocktails with precision and speed, and I craft specialty coffee with professional latte art. I am also skilled in stock control, POS and cash handling, bar hygiene and responsible alcohol service, and I communicate confidently in English with guests and teams.

I am eligible to work in Cyprus and available to start immediately. I am happy to attend an in-person or video interview at your earliest convenience.

I have attached my CV and photographs. My work videos and credentials are also available here:
Google Drive Portfolio: https://drive.google.com/drive/folders/1xVPTeJLJjcyigLGltGfwQlWDw_F3GDVN

Thank you for your time and consideration.

Best regards,
Fazle Rabbi Boyati`;
    setPersonalizedLetter(letter);
  };

  const handleSendApplication = async () => {
    if (!reviewingJob || isSending) return;
    if (inFlightJobIds.has(reviewingJob.id)) {
      showToast('Submission is already in progress for this vacancy. Preventing duplicate send.');
      return;
    }

    const employerName = reviewingJob.employer || reviewingJob.company || 'Cyprus Employer';
    const roleTitle = reviewingJob.title || reviewingJob.position || 'Bartender';
    const rawRecipient = (reviewingJob.recipientEmail || (reviewingJob as any).email || '').trim();

    if (!rawRecipient) {
      showToast(
        'No verified email address on file for this vacancy. Please use the Official Vacancy Link to apply directly on the employer portal.'
      );
      return;
    }

    const contactCheck = resolveVerifiedEmployerEmail(rawRecipient, employerName);
    if (!contactCheck.isDeliverable) {
      showToast(
        contactCheck.bouncePreventionNote ||
          'Unverified or invalid recipient email. Please apply through the official vacancy link instead.'
      );
      return;
    }

    let token = getCachedGoogleToken();
    let isTokenValid = token ? await testGmailTokenValidity(token) : false;

    if (!token || !isTokenValid) {
      showToast('Connecting your Gmail account...');
      try {
        const authRes = await signInWithGoogle();
        if (authRes && authRes.accessToken) {
          token = authRes.accessToken;
          isTokenValid = true;
        }
      } catch (authErr: any) {
        console.warn('Gmail sign-in notice:', authErr);
      }
    }

    setIsSending(true);
    setInFlightJobIds(prev => new Set(prev).add(reviewingJob.id));

    const activeCv = cvLibrary.find(c => c.id === selectedCvId) || cvLibrary[0];
    const targetRecipient = contactCheck.verifiedEmail || rawRecipient;
    const sourceUrl =
      reviewingJob.originalJobUrl || reviewingJob.applicationUrl || reviewingJob.sourceUrl || '';

    try {
      // 1. Record 'sending' state in backend before dispatch
      await submitApplicationToBackend({
        jobId: reviewingJob.id,
        market: 'cyprus',
        method: 'gmail',
        status: 'sending',
        submissionLifecycleStatus: 'sending',
        employer: employerName,
        title: roleTitle,
        country: 'Cyprus',
        location: reviewingJob.location || 'Cyprus',
        recipientEmail: targetRecipient,
        sourceUrl,
        cvId: activeCv?.id,
        cvTitle: activeCv?.originalFile?.fileName || activeCv?.title,
        coverLetter: personalizedLetter,
        notes: 'Dispatching application via Gmail API...',
      });

      const photos = loadProfessionalPhotos().filter(p => p.isDefaultAttached);
      const attachments = photos.map(p => ({
        filename: p.name,
        base64: p.base64 || '',
        mimeType: p.mimeType || 'image/jpeg',
      }));

      const cvPayload = getCVAttachmentPayload(selectedCvId);
      const res = await sendJobApplicationViaGmail({
        recipient: targetRecipient,
        subject: `Job Application: ${roleTitle} — Fazle Rabbi Boyati`,
        bodyText: personalizedLetter,
        selectedCvId: activeCv?.id,
        company: employerName,
        position: roleTitle,
        location: reviewingJob.location || 'Cyprus',
        jobId: reviewingJob.id,
        cvTitle: activeCv?.originalFile?.fileName || activeCv?.title,
        cvAttachment: cvPayload.base64
          ? {
              filename: cvPayload.filename,
              base64: cvPayload.base64,
              mimeType: cvPayload.mimeType,
            }
          : undefined,
        attachCoverLetterPdf: true,
        imageAttachments: attachments,
        accessToken: token || undefined,
      });

      if (res.success && res.messageId) {
        // 2. Record 'accepted_by_provider' in persistent backend database & replenish batch
        await submitApplicationToBackend({
          jobId: reviewingJob.id,
          market: 'cyprus',
          method: 'gmail',
          status: 'accepted_by_provider',
          submissionLifecycleStatus: 'accepted_by_provider',
          employer: employerName,
          title: roleTitle,
          country: 'Cyprus',
          location: reviewingJob.location || 'Cyprus',
          recipientEmail: targetRecipient,
          sourceUrl,
          subject: `Job Application: ${roleTitle} — Fazle Rabbi Boyati`,
          cvId: activeCv?.id,
          cvTitle: activeCv?.originalFile?.fileName || activeCv?.title,
          coverLetter: personalizedLetter,
          gmailMessageId: res.messageId,
          notes: `Accepted by Gmail API (Message ID: ${res.messageId})`,
        });

        recordAppliedJob({
          job: {
            ...reviewingJob,
            company: employerName,
            position: roleTitle,
            recipientEmail: targetRecipient,
          },
          gmailMessageId: res.messageId,
          status: 'applied',
          cvId: activeCv?.id,
          cvTitle: activeCv?.originalFile?.fileName || activeCv?.title,
          sourceUrl,
        });

        setAppliedRecords(loadAppliedJobRecords());
        showToast(
          `Application accepted by Gmail for ${employerName} (Message ID: ${res.messageId})! Replenishing next Cyprus vacancy...`
        );
        setReviewingJob(null);
        await loadCyprusBatch();
        await loadCyprusHistory();
      } else {
        const errReason = res.error || 'Email provider did not return a confirmed message ID';
        await submitApplicationToBackend({
          jobId: reviewingJob.id,
          market: 'cyprus',
          method: 'gmail',
          status: 'failed',
          submissionLifecycleStatus: 'failed',
          employer: employerName,
          title: roleTitle,
          country: 'Cyprus',
          location: reviewingJob.location || 'Cyprus',
          recipientEmail: targetRecipient,
          sourceUrl,
          cvId: activeCv?.id,
          cvTitle: activeCv?.originalFile?.fileName || activeCv?.title,
          coverLetter: personalizedLetter,
          errorReason: errReason,
          notes: `Send failed: ${errReason}`,
        });
        showToast(`Application not sent: ${errReason}. Saved with Retry option.`);
        await loadCyprusBatch();
        await loadCyprusHistory();
      }
    } catch (err: any) {
      const errReason = err?.message || 'Failed to send application email.';
      await submitApplicationToBackend({
        jobId: reviewingJob.id,
        market: 'cyprus',
        method: 'gmail',
        status: 'failed',
        submissionLifecycleStatus: 'failed',
        employer: employerName,
        title: roleTitle,
        country: 'Cyprus',
        location: reviewingJob.location || 'Cyprus',
        recipientEmail: targetRecipient,
        sourceUrl,
        cvId: activeCv?.id,
        cvTitle: activeCv?.originalFile?.fileName || activeCv?.title,
        coverLetter: personalizedLetter,
        errorReason: errReason,
        notes: `Send failed: ${errReason}`,
      });
      showToast(`Application failed: ${errReason}. Preserved for retry.`);
      await loadCyprusBatch();
      await loadCyprusHistory();
    } finally {
      setIsSending(false);
      setInFlightJobIds(prev => {
        const next = new Set(prev);
        next.delete(reviewingJob.id);
        return next;
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 p-4 rounded-2xl bg-slate-900 border border-emerald-500/50 text-white text-xs shadow-2xl animate-fade-in flex items-center gap-2 max-w-md">
          <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div
        className={`p-6 rounded-3xl border transition-all ${
          theme === 'dark'
            ? 'bg-[#101625] border-slate-800'
            : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-bold">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">Cyprus Job Market</h1>
              <p className="text-xs text-slate-400">
                Limassol Marina · Paphos · Ayia Napa · Protaras · Larnaca · Nicosia · Verified Cyprus Vacancies
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap self-end md:self-auto">
            <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-semibold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              <span>Cyprus Eligible: {batchData.totalEligibleRemaining} Remaining</span>
            </div>

            <button
              type="button"
              onClick={handleDiscoverMoreCyprus}
              disabled={isDiscoveringMore}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
            >
              <Globe className={`w-3.5 h-3.5 text-emerald-400 ${isDiscoveringMore ? 'animate-spin' : ''}`} />
              <span>{isDiscoveringMore ? 'Scanning Sources...' : 'Scan New Cyprus Jobs'}</span>
            </button>

            <button
              type="button"
              onClick={loadCyprusBatch}
              disabled={isRefreshing}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 transition active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Loading...' : 'Refresh Cyprus'}</span>
            </button>
          </div>
        </div>

        {/* Central CV Library Active Selector Bar */}
        <div className="mt-5 p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <FileText className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-white">Active Central CV for Cyprus Applications:</span>
            <span className="text-emerald-400 font-semibold">
              {cvLibrary.find(c => c.id === selectedCvId)?.originalFile?.fileName ||
                cvLibrary.find(c => c.id === selectedCvId)?.title ||
                'Master CV'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-slate-400 font-semibold">Select CV:</label>
            <select
              value={selectedCvId}
              onChange={e => {
                setSelectedCvId(e.target.value);
                setActiveCVId(e.target.value);
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
            >
              {cvLibrary.map(cv => (
                <option key={cv.id} value={cv.id}>
                  {cv.title}{' '}
                  {cv.isUploadedFile
                    ? `(Uploaded: ${cv.originalFile?.fileName || cv.name})`
                    : '(Structured CV)'}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* View Mode Tabs & Filters */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800/60">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setViewTab('active');
                setShowAppliedOnly(false);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                viewTab === 'active' && !showAppliedOnly
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800'
              }`}
            >
              Active Cyprus Batch ({batchData.batch.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setViewTab('history');
                loadCyprusHistory();
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                viewTab === 'history'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800'
              }`}
            >
              Cyprus Application History ({cyprusHistory.length})
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              Last verified refresh:{' '}
              {batchData.lastSearchTime
                ? new Date(batchData.lastSearchTime).toLocaleTimeString()
                : 'Just now'}
            </span>
            <button
              type="button"
              onClick={async () => {
                setIsRefreshing(true);
                await advanceJobBatch('cyprus');
                await loadCyprusBatch();
                setIsRefreshing(false);
                showToast('Loaded next batch of 5 eligible Cyprus vacancies.');
              }}
              className="ml-2 px-3 py-1.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-200 font-semibold flex items-center gap-1 transition"
            >
              <span>Next 5 Cyprus Jobs</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-800/40">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Search Cyprus Venues
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
              <input
                type="text"
                placeholder="Hotel, lounge, resort, or role..."
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs border ${
                  theme === 'dark'
                    ? 'bg-[#161d2d] border-slate-800 text-white'
                    : 'bg-white border-slate-300'
                }`}
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Cyprus Region
            </label>
            <select
              value={selectedCity}
              onChange={e => setSelectedCity(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl text-xs border ${
                theme === 'dark'
                  ? 'bg-[#161d2d] border-slate-800 text-white'
                  : 'bg-white border-slate-300'
              }`}
            >
              <option value="all">All Cyprus Locations</option>
              <option value="Limassol">Limassol Marina & Coast</option>
              <option value="Paphos">Paphos & Coral Bay</option>
              <option value="Ayia Napa">Ayia Napa</option>
              <option value="Protaras">Protaras</option>
              <option value="Larnaca">Larnaca</option>
              <option value="Nicosia">Nicosia</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                const next = !showAppliedOnly;
                setShowAppliedOnly(next);
                if (next) loadCyprusHistory();
              }}
              className={`w-full py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition ${
                showAppliedOnly
                  ? 'bg-amber-600/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-800/40 text-slate-300 border-slate-800 hover:bg-slate-800'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>
                {showAppliedOnly
                  ? 'Showing Applied / History Jobs'
                  : 'Show Applied Jobs (10-Day Cooldown)'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Active Vacancy Feed or History Tab */}
      {viewTab === 'active' ? (
        <div className="space-y-3">
          {filteredVacancies.map((job, idx) => {
            const employerName = job.employer || job.company || 'Cyprus Hospitality Employer';
            const roleTitle = job.title || job.position || 'Bartender / Hospitality';
            const rawEmail = job.recipientEmail || (job as any).email || '';
            const officialUrl =
              job.applicationUrl || job.originalJobUrl || job.sourceUrl || '';
            const emailResolution = resolveVerifiedEmployerEmail(rawEmail, employerName);
            const isVerifiedContact =
              emailResolution.contactStatus === 'Verified Hiring Contact' &&
              job.emailVerificationStatus !== 'unverified';
            const displayEmail =
              emailResolution.isDeliverable && emailResolution.verifiedEmail
                ? emailResolution.verifiedEmail
                : rawEmail;

            const cooldownInfo = isJobAppliedWithin10Days(job);
            const latestEvt = job.applicationHistory?.[0];
            const statusBadge = formatLifecycleStatusBadge(
              job.applicationStatus,
              job.submissionLifecycleStatus || latestEvt?.status,
              latestEvt?.method
            );
            const isPortalOpened = portalOpenedJobIds.has(job.id);
            const isFailed =
              job.applicationStatus === 'failed' ||
              job.submissionLifecycleStatus === 'failed' ||
              job.submissionLifecycleStatus === 'bounced';

            return (
              <div
                key={job.id || `cyp-job-${idx}-${employerName}`}
                className={`p-5 rounded-2xl border transition-all ${
                  theme === 'dark'
                    ? 'bg-[#101625] border-slate-800/80 hover:border-slate-700'
                    : 'bg-white border-slate-200 shadow-xs'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        #{idx + 1}
                      </span>
                      <h3 className="text-base font-bold text-white">{employerName}</h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                        {job.location || (job as any).city || 'Cyprus'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusBadge.colorClass}`}
                      >
                        {statusBadge.label}
                      </span>
                      {cooldownInfo.isApplied && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Applied ({cooldownInfo.remainingDays}d cooldown)
                        </span>
                      )}
                    </div>

                    <div className="text-sm font-semibold text-slate-200 flex items-center gap-2 flex-wrap">
                      <span>{roleTitle}</span>
                      <span className="text-slate-600">·</span>
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-500" />
                        {job.location || 'Cyprus'}
                      </span>
                      {displayEmail ? (
                        <>
                          <span className="text-slate-600">·</span>
                          <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {displayEmail}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              isVerifiedContact
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            }`}
                          >
                            {isVerifiedContact
                              ? emailResolution.contactType || 'Verified HR Contact'
                              : 'Unverified'}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-slate-600">·</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            Unverified Email — Official Portal Required
                          </span>
                        </>
                      )}
                    </div>

                    {/* Metadata: Source, Vacancy Date, Last Verification Time, Application Method */}
                    <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
                      <span>
                        Source: <strong className="text-slate-300">{job.source || 'Employer Careers'}</strong>
                      </span>
                      <span>·</span>
                      <span>
                        Method:{' '}
                        <strong className="uppercase text-emerald-300">
                          {job.applicationMethod || (displayEmail && officialUrl ? 'both' : officialUrl ? 'portal' : 'email')}
                        </strong>
                      </span>
                      {job.postingDate && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            Posted: {new Date(job.postingDate).toLocaleDateString()}
                          </span>
                        </>
                      )}
                      <span>·</span>
                      <span>
                        Verified:{' '}
                        {new Date(
                          job.lastVerificationTime || job.lastCheckedDate || Date.now()
                        ).toLocaleDateString()}
                      </span>
                      {officialUrl && (
                        <>
                          <span>·</span>
                          <a
                            href={officialUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>Official Vacancy URL</span>
                          </a>
                        </>
                      )}
                    </div>

                    <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                      {job.sourceNotes}
                    </p>

                    {isFailed && latestEvt?.errorReason && (
                      <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                          <span>Last Error: {latestEvt.errorReason}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenReview(job)}
                          className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold flex items-center gap-1 shrink-0"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Retry</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0 self-end lg:self-auto flex-wrap">
                    {officialUrl && (
                      <button
                        type="button"
                        onClick={() => handleOpenExternalPortalLink(job)}
                        className="px-3.5 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-bold text-xs flex items-center gap-1.5 transition"
                        title="Open official vacancy link in new tab (does not mark as applied until confirmed)"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Official Vacancy Link</span>
                      </button>
                    )}

                    {isPortalOpened && (
                      <button
                        type="button"
                        onClick={() => handleConfirmPortalSubmitted(job)}
                        disabled={inFlightJobIds.has(job.id)}
                        className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-md"
                        title="Confirm that you submitted your application on the external portal"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Confirm Portal Submitted</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleOpenReview(job)}
                      disabled={inFlightJobIds.has(job.id)}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-emerald-600/20 disabled:opacity-50"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>{isFailed ? 'Retry via Gmail' : 'Apply via Gmail'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDismissCyprusJob(job.id, employerName)}
                      className="p-2 rounded-xl border border-slate-700/80 hover:border-amber-500/40 hover:bg-amber-500/10 text-slate-400 hover:text-amber-300 text-xs transition"
                      title="Temporarily hide vacancy and load next Cyprus job"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleMarkExpiredCyprusJob(job.id, employerName)}
                      className="p-2 rounded-xl border border-slate-700/80 hover:border-rose-500/40 hover:bg-rose-500/10 text-slate-400 hover:text-rose-300 text-xs transition"
                      title="Mark vacancy expired/closed and remove from active listings"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredVacancies.length === 0 && (
            <div className="p-10 rounded-3xl border border-dashed border-slate-800 text-center space-y-3 text-slate-400">
              <MapPin className="w-10 h-10 mx-auto text-emerald-500/60" />
              <div className="text-base font-bold text-white">
                {batchData.noMoreJobsAvailable
                  ? 'No Additional New Cyprus Vacancies Available Right Now'
                  : 'No Matching Cyprus Vacancies in Current Filter'}
              </div>
              <p className="text-xs max-w-md mx-auto">
                {batchData.noMoreJobsAvailable
                  ? `All currently verified Cyprus vacancies have been applied to or reviewed. Stale or already-applied jobs are hidden to prevent duplicate applications. Last successful refresh: ${
                      batchData.lastSearchTime
                        ? new Date(batchData.lastSearchTime).toLocaleString()
                        : 'Just now'
                    }.`
                  : 'Try clearing your search filter or click Scan New Cyprus Jobs to fetch the next batch from verified sources.'}
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleDiscoverMoreCyprus}
                  disabled={isDiscoveringMore}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition"
                >
                  {isDiscoveringMore ? 'Scanning Sources...' : 'Scan Configured Cyprus Sources'}
                </button>
                {(keyword || selectedCity !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setKeyword('');
                      setSelectedCity('all');
                    }}
                    className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Cyprus Application History Tab */
        <div className="space-y-3">
          {cyprusHistory.length === 0 ? (
            <div className="p-10 rounded-3xl border border-dashed border-slate-800 text-center text-xs text-slate-400">
              No Cyprus applications recorded yet. Apply to a vacancy in the Active Cyprus Batch tab to track its status here.
            </div>
          ) : (
            cyprusHistory.map((item, idx) => {
              const latestEvt = item.applicationHistory?.[0];
              const badge = formatLifecycleStatusBadge(
                item.applicationStatus,
                item.submissionLifecycleStatus || latestEvt?.status,
                latestEvt?.method
              );
              return (
                <div
                  key={item.id || idx}
                  className={`p-5 rounded-2xl border ${
                    theme === 'dark'
                      ? 'bg-[#101625] border-slate-800'
                      : 'bg-white border-slate-200'
                  } space-y-2`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-white text-base">
                        {item.employer || item.company}
                      </h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {item.location || 'Cyprus'}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badge.colorClass}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {(item.applicationStatus === 'failed' ||
                        item.submissionLifecycleStatus === 'failed' ||
                        item.submissionLifecycleStatus === 'bounced') && (
                        <button
                          type="button"
                          onClick={() => handleOpenReview(item)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Retry Application</span>
                        </button>
                      )}
                      <span className="text-[11px] font-mono text-slate-400">
                        {latestEvt?.timestamp
                          ? new Date(latestEvt.timestamp).toLocaleString()
                          : ''}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-300 flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{item.title || item.position}</span>
                    {item.recipientEmail && (
                      <>
                        <span>·</span>
                        <span className="font-mono text-emerald-400">{item.recipientEmail}</span>
                      </>
                    )}
                    {(item.applicationUrl || item.originalJobUrl) && (
                      <>
                        <span>·</span>
                        <a
                          href={item.applicationUrl || item.originalJobUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-400 hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Source Vacancy</span>
                        </a>
                      </>
                    )}
                  </div>
                  {latestEvt?.gmailMessageId && (
                    <div className="text-[11px] font-mono text-slate-400">
                      Message Receipt ID: <span className="text-slate-200">{latestEvt.gmailMessageId}</span>
                    </div>
                  )}
                  {latestEvt?.errorReason && (
                    <div className="text-[11px] text-rose-400">
                      Error recorded: {latestEvt.errorReason}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Review Modal */}
      {reviewingJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div
            className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border p-6 space-y-4 shadow-2xl ${
              theme === 'dark'
                ? 'bg-[#121826] border-slate-700 text-white'
                : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold">
                  Apply to {reviewingJob.employer || reviewingJob.company} (Cyprus)
                </h3>
                <p className="text-xs text-slate-400">
                  {reviewingJob.title || reviewingJob.position} · {reviewingJob.location || 'Cyprus'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewingJob(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {(() => {
              const check = resolveVerifiedEmployerEmail(
                reviewingJob.recipientEmail,
                reviewingJob.employer || reviewingJob.company
              );
              const isVerified = check.contactStatus === 'Verified Hiring Contact';
              return (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-semibold text-emerald-300">
                      Recipient Email: {reviewingJob.recipientEmail || 'None (Use Official Portal)'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        isVerified
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      }`}
                    >
                      {isVerified ? check.contactType || 'Verified HR Contact' : 'Unverified'}
                    </span>
                  </div>
                  <input
                    type="email"
                    value={reviewingJob.recipientEmail || ''}
                    onChange={e =>
                      setReviewingJob(prev =>
                        prev ? { ...prev, recipientEmail: e.target.value } : null
                      )
                    }
                    placeholder="Enter verified employer HR email or apply via official link below"
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-700 text-xs text-white font-mono"
                  />
                  <div className="text-slate-400">
                    Attachments: Active Central CV + Default Professional Photographs
                  </div>
                </div>
              );
            })()}

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">
                Personalized Cyprus Cover Letter:
              </label>
              <textarea
                rows={10}
                value={personalizedLetter}
                onChange={e => setPersonalizedLetter(e.target.value)}
                className={`w-full p-3 rounded-xl text-xs border font-mono ${
                  theme === 'dark'
                    ? 'bg-[#182133] border-slate-700 text-slate-200'
                    : 'bg-slate-50 border-slate-300'
                }`}
              />
            </div>

            <div className="flex flex-col gap-2 pt-2">
              {(reviewingJob.applicationUrl || reviewingJob.originalJobUrl) && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenExternalPortalLink(reviewingJob)}
                    className="w-full sm:w-1/2 py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>1. Open Official Vacancy Link</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmPortalSubmitted(reviewingJob)}
                    disabled={isSending}
                    className="w-full sm:w-1/2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>2. Confirm Portal Submission</span>
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setDispatchModalJob(reviewingJob);
                  setReviewingJob(null);
                }}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 transition active:scale-95"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Gmail Dispatch Center (1-Click Webmail or API)</span>
              </button>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setReviewingJob(null)}
                  className="w-1/2 py-2.5 rounded-xl border border-slate-700 text-xs font-semibold hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSendApplication}
                  disabled={isSending}
                  className="w-1/2 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5 -rotate-12" />
                  <span>{isSending ? 'Sending via Gmail...' : 'Send Application via Gmail'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Gmail Dispatch Center Modal */}
      {dispatchModalJob && (
        <GmailDispatchModal
          application={{
            id: dispatchModalJob.id || `cyp-${Date.now()}`,
            company: dispatchModalJob.employer || dispatchModalJob.company || 'Cyprus Employer',
            position: dispatchModalJob.title || dispatchModalJob.position || 'Bartender',
            location: dispatchModalJob.location || 'Cyprus',
            recipientEmail: dispatchModalJob.recipientEmail || '',
            subject: `Job Application: ${
              dispatchModalJob.title || dispatchModalJob.position
            } — Fazle Rabbi Boyati`,
            coverLetter: personalizedLetter,
            status: 'approved',
            isApproved: true,
            isDuplicate: false,
            selectedCvId,
            cvTitle: (cvLibrary.find(c => c.id === selectedCvId) || cvLibrary[0])?.title || 'Fazle Rabbi CV',
            emailVerificationStatus:
              dispatchModalJob.emailVerificationStatus === 'verified' ? 'verified' : 'needs_review',
            verificationStatus:
              dispatchModalJob.emailVerificationStatus === 'verified' ? 'verified' : 'needs_review',
            verifiedBy: 'Gemini + Official Contact Registry',
          }}
          selectedCvId={selectedCvId}
          onClose={() => setDispatchModalJob(null)}
          onSendApproved={async (_, msgId) => {
            await submitApplicationToBackend({
              jobId: dispatchModalJob.id,
              market: 'cyprus',
              method: 'gmail',
              status: 'accepted_by_provider',
              submissionLifecycleStatus: 'accepted_by_provider',
              employer: dispatchModalJob.employer || dispatchModalJob.company,
              title: dispatchModalJob.title || dispatchModalJob.position,
              country: 'Cyprus',
              location: dispatchModalJob.location || 'Cyprus',
              recipientEmail: dispatchModalJob.recipientEmail,
              sourceUrl:
                dispatchModalJob.originalJobUrl ||
                dispatchModalJob.applicationUrl ||
                dispatchModalJob.sourceUrl,
              cvId: selectedCvId,
              gmailMessageId: msgId,
              notes: `Accepted by Gmail Dispatch Center (Message ID: ${msgId})`,
            });
            recordAppliedJob({
              job: dispatchModalJob,
              gmailMessageId: msgId,
              status: 'applied',
              cvId: selectedCvId,
            });
            setAppliedRecords(loadAppliedJobRecords());
            showToast(
              `Application accepted by Gmail for ${
                dispatchModalJob.employer || dispatchModalJob.company
              } (Message ID: ${msgId})! Replenishing Cyprus batch...`
            );
            setDispatchModalJob(null);
            await loadCyprusBatch();
            await loadCyprusHistory();
          }}
        />
      )}
    </div>
  );
};
