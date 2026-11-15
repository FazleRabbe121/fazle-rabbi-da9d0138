import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Globe,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  ExternalLink,
  Mail,
  Send,
  Building,
  MapPin,
  AlertCircle,
  EyeOff,
  Upload,
  Eye,
  FileText,
  Image as ImageIcon,
  CheckSquare,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  X,
  Play,
  RotateCcw,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import {
  fetchJobBatch,
  submitApplicationToBackend,
  dismissJobFromBackend,
  markJobExpiredInBackend,
  fetchApplicationHistoryFromBackend,
  advanceJobBatch,
  recordAppliedJob,
  BackendJobRecord,
  BatchResponse,
} from '../services/jobDatabaseService';
import { formatLifecycleStatusBadge } from './CyprusJobMarketView';
import {
  sendJobApplicationViaGmail,
  testGmailTokenValidity,
  validateSingleCoverLetter,
} from '../services/gmailService';
import {
  persistentGmailQueueEngine,
  EmailDeliveryLifecycleStatus,
} from '../services/gmailQueueService';
import { getCachedGoogleToken, signInWithGoogle } from '../services/firebase';
import { loadProfessionalPhotos, ProfessionalPhotoItem } from '../services/photoStorageService';
import { GmailDispatchModal } from '../components/GmailDispatchModal';
import { evaluateHospitalitySponsorship } from '../services/sponsorshipEvaluator';
import {
  loadCVLibrary,
  getActiveCVId,
  setActiveCVId,
  saveUploadedCVFromDevice,
  getCVAttachmentPayload,
  formatFileSize,
} from '../services/cvStorage';
import { CVDocumentItem } from '../types/cv';
import { resolveVerifiedEmployerEmail } from '../utils/verifiedEmployerEmails';

interface EuropeJobMarketViewProps {
  onNavigateToCompose?: (email: string, subject: string, body: string) => void;
  onNavigateToQueue?: () => void;
  onOpenCVLibrary?: () => void;
}

export const EuropeJobMarketView: React.FC<EuropeJobMarketViewProps> = ({
  onNavigateToCompose,
  onNavigateToQueue,
  onOpenCVLibrary,
}) => {
  const { theme } = useTheme();

  // 5-Job Batch State (Persistent Backend Database)
  const [batchData, setBatchData] = useState<BatchResponse>({
    market: 'europe',
    batch: [],
    batchSize: 5,
    currentBatchIndex: 0,
    totalEligibleRemaining: 0,
    allBatchCompleted: false,
    totalDiscovered: 0,
    lastSearchTime: new Date().toLocaleTimeString(),
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSearchingNew, setIsSearchingNew] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('all');
  const [selectedRole, setSelectedRole] = useState('all');
  const [customRoleInput, setCustomRoleInput] = useState('');
  const [selectedIndustry, setSelectedIndustry] = useState('all');
  const [selectedSponsorshipCategory, setSelectedSponsorshipCategory] = useState('all');
  const [accommodationOnly, setAccommodationOnly] = useState(false);
  const [attachCoverLetterPdf, setAttachCoverLetterPdf] = useState(true);
  const [aiSearchResults, setAiSearchResults] = useState<BackendJobRecord[] | null>(null);
  const [aiRecommendedFilters, setAiRecommendedFilters] = useState<{
    recommendedRoles: string[];
    recommendedCountries: string[];
    recommendedIndustries: string[];
    rationale: string;
  } | null>(null);
  const [isAiSearching, setIsAiSearching] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Background Daemon Status from Server
  const [daemonStatus, setDaemonStatus] = useState<{
    active: boolean;
    lastSearchTime: string;
    totalDiscovered: number;
    totalRuns: number;
    cursorState?: {
      europeCountryIndex: number;
      europeRoleIndex: number;
      europePageIndex: number;
      lastSuccessfulRun: string;
      nextScheduledRun: string;
      activeSearchStatus: string;
    };
    status: string;
  }>({
    active: true,
    lastSearchTime: new Date().toLocaleTimeString(),
    totalDiscovered: 48,
    totalRuns: 0,
    status: 'Operational · Persistent European Job Discovery Scheduler Active',
  });

  // CV Library & Selection State (Synchronized with Central CV Library)
  const [cvLibrary, setCvLibrary] = useState<CVDocumentItem[]>(() => loadCVLibrary());
  const [selectedCvId, setSelectedCvId] = useState<string>(() => {
    const active = getActiveCVId();
    const list = loadCVLibrary();
    return list.some(c => c.id === active) ? active : list[0]?.id || 'bartender-master-cv';
  });
  const [isUploadingCv, setIsUploadingCv] = useState(false);
  const [previewingCv, setPreviewingCv] = useState<CVDocumentItem | null>(null);
  const phoneFileInputRef = useRef<HTMLInputElement>(null);

  // Review & Apply Modal State
  const [reviewingJob, setReviewingJob] = useState<BackendJobRecord | null>(null);
  const [availablePhotos, setAvailablePhotos] = useState<ProfessionalPhotoItem[]>(() =>
    loadProfessionalPhotos()
  );
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [personalizedLetter, setPersonalizedLetter] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [inFlightJobIds, setInFlightJobIds] = useState<Set<string>>(new Set());
  const [portalOpenedJobIds, setPortalOpenedJobIds] = useState<Set<string>>(new Set());

  // Bulk Application Selection within Batch
  const [selectedBatchJobIds, setSelectedBatchJobIds] = useState<Set<string>>(new Set());

  // Navigation Tabs: 'active' 5-job batch vs 'history'
  const [viewTab, setViewTab] = useState<'active' | 'history'>('active');
  const [appHistory, setAppHistory] = useState<BackendJobRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Safe Test Email State
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: string;
    message: string;
    messageId?: string;
  } | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Load the current 5-job batch from the persistent backend database with auto-replenishment
  const loadBatch = async () => {
    setIsLoading(true);
    try {
      const data = await fetchJobBatch('europe', 5);
      setBatchData(data);
      // Pre-select unsubmitted jobs for convenient bulk handling
      const unapplied = data.batch.filter(j => j.applicationStatus !== 'submitted').map(j => j.id);
      setSelectedBatchJobIds(new Set(unapplied));
    } catch (e) {
      console.warn('Europe batch load error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  // Load server background discovery daemon status
  const loadDaemonStatus = async () => {
    try {
      const res = await fetch('/api/jobs/continuous-status');
      if (res.ok) {
        const data = await res.json();
        setDaemonStatus(data);
      }
    } catch (e) {
      console.warn('Could not load daemon status:', e);
    }
  };

  // Load application history for Europe market (shared unified database)
  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const allHistory = await fetchApplicationHistoryFromBackend({ includeAllStatuses: true });
      const europeHistory = allHistory.filter(
        j => j.market === 'europe' || j.market === 'sponsorship'
      );
      setAppHistory(europeHistory);
    } catch (e) {
      console.warn('Could not load Europe application history:', e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadBatch();
    loadDaemonStatus();
    loadHistory();
    // Poll daemon status and active batch every 60 seconds
    const interval = setInterval(() => {
      loadDaemonStatus();
      loadBatch();
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Listen to Central CV library & active CV updates
  useEffect(() => {
    const handleCvUpdated = () => {
      const updated = loadCVLibrary();
      setCvLibrary(updated);
      const activeId = getActiveCVId();
      if (activeId && updated.some(c => c.id === activeId)) {
        setSelectedCvId(activeId);
      }
    };
    window.addEventListener('cv_library_updated', handleCvUpdated);
    window.addEventListener('central_cv_library_updated', handleCvUpdated);
    window.addEventListener('active_cv_changed', handleCvUpdated);
    return () => {
      window.removeEventListener('cv_library_updated', handleCvUpdated);
      window.removeEventListener('central_cv_library_updated', handleCvUpdated);
      window.removeEventListener('active_cv_changed', handleCvUpdated);
    };
  }, []);

  // Native Mobile File Picker CV Upload
  const handleUploadCvFromPhone = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingCv(true);
    try {
      const newDoc = await saveUploadedCVFromDevice(file);
      const updated = loadCVLibrary();
      setCvLibrary(updated);
      setSelectedCvId(newDoc.id);
      showToast(
        `Uploaded "${file.name}" (${formatFileSize(
          file.size
        )}) from phone! Automatically selected for applications.`
      );
    } catch (err: any) {
      showToast(err.message || 'Failed to upload CV from device.');
    } finally {
      setIsUploadingCv(false);
      if (e.target) e.target.value = '';
    }
  };

  // Trigger manual immediate discovery run on backend scheduler
  const handleTriggerSearchNow = async () => {
    setIsSearchingNew(true);
    try {
      const res = await fetch('/api/jobs/search-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market: 'europe' }),
      });
      if (res.ok) {
        const data = await res.json();
        showToast(
          `Discovery Engine Advanced: Discovered ${data.newDiscovered} new European vacancies! Total indexed: ${data.totalDiscovered}.`
        );
        setAiSearchResults(null);
        await loadBatch();
        await loadDaemonStatus();
      }
    } catch (e: any) {
      showToast(`Search failed: ${e.message}`);
    } finally {
      setIsSearchingNew(false);
    }
  };

  // Run Gemini AI Flexible Search across any role, industry, employer, or European country
  const handleRunAiFlexibleSearch = async (useGeminiDiscovery: boolean = true) => {
    setIsAiSearching(true);
    try {
      const activeCv = cvLibrary.find(c => c.id === selectedCvId) || cvLibrary[0];
      const cvSummary = activeCv
        ? `${activeCv.title} (${activeCv.roleSubtitle || 'Professional'}): ${
            activeCv.data?.profileSummary || activeCv.data?.aboutMe?.content || ''
          }`
        : '';

      const effectiveRole =
        customRoleInput.trim() || (selectedRole !== 'all' ? selectedRole : '');

      const res = await fetch('/api/jobs/ai-flexible-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: keyword.trim(),
          jobTitle: effectiveRole,
          country: selectedCountry !== 'all' ? selectedCountry : '',
          industry: selectedIndustry !== 'all' ? selectedIndustry : '',
          sponsorshipCategory:
            selectedSponsorshipCategory !== 'all' ? selectedSponsorshipCategory : '',
          accommodationOnly,
          market: 'europe',
          cvSummary,
          useAiDiscovery: useGeminiDiscovery,
          recommendFilters: true,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.jobs)) {
          setAiSearchResults(
            data.jobs.filter(
              (j: BackendJobRecord) =>
                !(j.country || '').toLowerCase().includes('cyprus')
            )
          );
        }
        if (data.recommendedFilters) {
          setAiRecommendedFilters(data.recommendedFilters);
        }
        showToast(
          `Gemini AI Search found ${data.jobs?.length || 0} matching European opportunities ranked by suitability.`
        );
      }
    } catch (err: any) {
      showToast(`AI flexible search error: ${err.message}`);
    } finally {
      setIsAiSearching(false);
    }
  };

  // Dismiss a job from the visible batch and replenish immediately with the next opportunity
  const handleDismissJob = async (jobId: string, employer: string) => {
    try {
      showToast(
        `Dismissing ${employer}... Replenishing next European hospitality vacancy from pool.`
      );
      await dismissJobFromBackend(jobId, 'europe');
      if (aiSearchResults !== null) {
        const remaining = aiSearchResults.filter(j => j.id !== jobId);
        setAiSearchResults(remaining.length > 0 ? remaining : null);
      }
      await loadBatch();
      await loadHistory();
    } catch (err: any) {
      showToast(`Could not dismiss vacancy: ${err.message}`);
    }
  };

  // Mark an expired or demonstrably invalid vacancy and remove from active listings while preserving history
  const handleMarkExpiredJob = async (jobId: string, employer: string) => {
    try {
      await markJobExpiredInBackend({
        jobId,
        status: 'expired',
        reason: 'Marked expired/closed from active European listings (application history preserved)',
        market: 'europe',
      });
      if (aiSearchResults !== null) {
        const remaining = aiSearchResults.filter(j => j.id !== jobId);
        setAiSearchResults(remaining.length > 0 ? remaining : null);
      }
      showToast(`Removed expired vacancy at ${employer} from active listings (history preserved).`);
      await loadBatch();
      await loadHistory();
    } catch (err: any) {
      showToast(`Could not mark vacancy expired: ${err.message}`);
    }
  };

  // Open official external portal link WITHOUT marking the job as applied
  const handleOpenExternalPortalLink = (job: BackendJobRecord) => {
    const portalUrl = job.applicationUrl || job.originalJobUrl || job.sourceUrl;
    if (!portalUrl) {
      showToast('No external portal link provided for this vacancy.');
      return;
    }
    setPortalOpenedJobIds(prev => new Set(prev).add(job.id));
    window.open(portalUrl, '_blank', 'noopener,noreferrer');
    showToast(
      `Opened official vacancy page for ${job.employer}. Click "Confirm Portal Submitted" only after completing your application on the employer site.`
    );
  };

  // Record Official Career Portal Application and immediately replenish next European vacancy
  const handleConfirmPortalApplication = async (job: BackendJobRecord) => {
    if (inFlightJobIds.has(job.id)) return;
    setInFlightJobIds(prev => new Set(prev).add(job.id));
    try {
      const activeCv = cvLibrary.find(c => c.id === selectedCvId) || cvLibrary[0];
      const portalUrl = job.applicationUrl || job.originalJobUrl || job.sourceUrl || '';
      await submitApplicationToBackend({
        jobId: job.id,
        market: 'europe',
        method: 'portal',
        status: 'submitted_portal',
        submissionLifecycleStatus: 'submitted_portal',
        employer: job.employer,
        title: job.title,
        country: job.country,
        location: job.location,
        sourceUrl: portalUrl,
        cvId: activeCv?.id,
        cvTitle: activeCv?.title || 'Master Hospitality CV',
        notes: `Submitted via official employer careers portal (${portalUrl || 'Direct Portal'})`,
      });
      recordAppliedJob({
        job,
        gmailMessageId: `portal-${Date.now()}`,
        status: 'applied',
        cvId: activeCv?.id,
        cvTitle: activeCv?.title || 'Master Hospitality CV',
        sourceUrl: portalUrl,
      });
      if (aiSearchResults !== null) {
        const remaining = aiSearchResults.filter(j => j.id !== job.id);
        setAiSearchResults(remaining.length > 0 ? remaining : null);
      }
      setReviewingJob(null);
      showToast(`Official portal application recorded for ${job.employer}! Replenishing visible European vacancies...`);
      await loadBatch();
      await loadHistory();
    } catch (err: any) {
      showToast(`Could not record portal application: ${err.message}`);
    } finally {
      setInFlightJobIds(prev => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
    }
  };

  // Open Review & Apply modal for a single job
  const handleOpenReview = (job: BackendJobRecord) => {
    const resolved = resolveVerifiedEmployerEmail(job.recipientEmail, job.employer);
    const effectiveEmail = resolved.isDeliverable && resolved.verifiedEmail
      ? resolved.verifiedEmail
      : (job.recipientEmail || '');
    setReviewingJob({
      ...job,
      recipientEmail: effectiveEmail,
      applicationUrl: job.applicationUrl || resolved.officialPortalUrl || job.originalJobUrl,
    });
    const photos = loadProfessionalPhotos();
    setAvailablePhotos(photos);
    setSelectedPhotoIds(photos.filter(p => p.isDefaultAttached).map(p => p.id));
    const currentLibrary = loadCVLibrary();
    setCvLibrary(currentLibrary);
    if (!selectedCvId || !currentLibrary.some(c => c.id === selectedCvId)) {
      setSelectedCvId(currentLibrary[0]?.id || '');
    }

    const letter = `Fazle Rabbi Boyati
Limassol Marina, Cyprus | +357 9550 2363 | fazle.rabbe.doc@gmail.com
LinkedIn: https://www.linkedin.com/in/fazle-rabbi-5785aa269

Dear Hiring Team at ${job.employer},

I am writing to express my strong interest in the ${job.title} vacancy at your establishment in ${job.location}. With over five years of professional hospitality experience across luxury beachfront resorts, premier cocktail lounges, and 5-star hotel bars, I am eager to contribute my beverage mastery and high-standard service to your team.

I specialize in crafting classic and signature cocktails with precision and speed, and I deliver specialty coffee service with professional latte art. Furthermore, I am thoroughly skilled in cellar inventory management, POS operation, HACCP hygiene compliance, and team leadership, and I communicate fluently in English with international clientele.

I have attached my updated CV and professional photographs. My full digital portfolio of cocktails and hospitality credentials is also accessible here:
Google Drive Portfolio: https://drive.google.com/drive/folders/1xVPTeJLJjcyigLGltGfwQlWDw_F3GDVN

Thank you for your consideration. I am available for a video interview at your earliest convenience and look forward to speaking with you.

Best regards,
Fazle Rabbi Boyati`;

    setPersonalizedLetter(letter);
  };

  // Submit application via connected Gmail with selected CV attachment and auto-replenishment
  const handleSendApplication = async () => {
    if (!reviewingJob || isSending) return;
    if (inFlightJobIds.has(reviewingJob.id)) {
      showToast('Submission is already in progress for this vacancy. Preventing duplicate submission.');
      return;
    }

    const cleanRecipient = (reviewingJob.recipientEmail || '').trim();
    if (!cleanRecipient) {
      showToast('No verified email address provided. Please use the Official Careers Portal link to apply and click Confirm Portal Submission.');
      return;
    }

    const contactCheck = resolveVerifiedEmployerEmail(cleanRecipient, reviewingJob.employer);
    if (!contactCheck.isDeliverable) {
      showToast(contactCheck.bouncePreventionNote || 'Unverified or invalid email address. Please use a verified HR contact or apply via the official portal.');
      return;
    }

    if (!selectedCvId) {
      showToast('CV Required: Please upload or select your CV from your phone before sending.');
      return;
    }

    const activeCv = cvLibrary.find(c => c.id === selectedCvId) || cvLibrary[0];
    if (!activeCv) {
      showToast('CV Required: No CV document found. Tap "Upload CV from Phone" to select your PDF/DOCX resume.');
      return;
    }

    let token = getCachedGoogleToken();
    let isTokenValid = token ? await testGmailTokenValidity(token) : false;

    if (!token || !isTokenValid) {
      showToast('Connecting Google Gmail to authorize PDF CV & Cover Letter dispatch...');
      const authRes = await signInWithGoogle();
      if (!authRes || !authRes.accessToken) {
        showToast('Gmail authorization is required to send applications via email.');
        return;
      }
      token = authRes.accessToken;
      isTokenValid = true;
    }

    setIsSending(true);
    setInFlightJobIds(prev => new Set(prev).add(reviewingJob.id));
    const targetRecipient = contactCheck.verifiedEmail || cleanRecipient;
    const docName = activeCv.fileName ? `${activeCv.title} (${activeCv.fileName})` : activeCv.title;

    try {
      // 1. Record 'sending' in-flight state in backend
      await submitApplicationToBackend({
        jobId: reviewingJob.id,
        market: 'europe',
        method: 'gmail',
        status: 'sending',
        submissionLifecycleStatus: 'sending',
        employer: reviewingJob.employer,
        title: reviewingJob.title,
        country: reviewingJob.country,
        location: reviewingJob.location,
        recipientEmail: targetRecipient,
        sourceUrl: reviewingJob.originalJobUrl || reviewingJob.applicationUrl,
        cvId: activeCv.id,
        cvTitle: docName,
        coverLetter: personalizedLetter,
        notes: 'Dispatching application via Gmail API...',
      });

      const chosenPhotos = availablePhotos.filter(p => selectedPhotoIds.includes(p.id));
      const photoAttachments = chosenPhotos.map(p => ({
        filename: p.name,
        base64: p.base64 || '',
        mimeType: p.mimeType || 'image/jpeg',
      }));

      // Retrieve actual attached document payload (uploaded phone PDF/DOCX or structured)
      const cvPayload = getCVAttachmentPayload(selectedCvId);

      const res = await sendJobApplicationViaGmail({
        recipient: targetRecipient,
        subject: `Job Application: ${reviewingJob.title} — Fazle Rabbi Boyati`,
        bodyText: personalizedLetter,
        selectedCvId: activeCv.id,
        attachCoverLetterPdf,
        company: reviewingJob.employer,
        position: reviewingJob.title,
        location: reviewingJob.location,
        jobId: reviewingJob.id,
        cvTitle: docName,
        cvAttachment: cvPayload.base64 ? {
          filename: cvPayload.filename,
          base64: cvPayload.base64,
          mimeType: cvPayload.mimeType,
        } : undefined,
        imageAttachments: photoAttachments,
      });

      if (res.success && res.messageId) {
        // Record persistent submission in backend database as accepted_by_provider
        await submitApplicationToBackend({
          jobId: reviewingJob.id,
          market: 'europe',
          method: 'gmail',
          status: 'accepted_by_provider',
          submissionLifecycleStatus: 'accepted_by_provider',
          employer: reviewingJob.employer,
          title: reviewingJob.title,
          country: reviewingJob.country,
          location: reviewingJob.location,
          recipientEmail: targetRecipient,
          sourceUrl: reviewingJob.originalJobUrl || reviewingJob.applicationUrl,
          subject: `Job Application: ${reviewingJob.title} — Fazle Rabbi Boyati`,
          cvId: activeCv.id,
          cvTitle: docName,
          coverLetter: personalizedLetter,
          attachments: [
            cvPayload.filename,
            ...(attachCoverLetterPdf ? [`Cover_Letter_${reviewingJob.employer.replace(/[^\w]/g, '_')}.pdf`] : []),
            ...photoAttachments.map(a => a.filename),
          ],
          gmailMessageId: res.messageId,
          notes: `Accepted by Gmail Provider (ID: ${res.messageId}) with attached CV [${cvPayload.filename}]${attachCoverLetterPdf ? ' + Cover Letter PDF' : ''}`,
        });

        // Record to local cooldown cache
        recordAppliedJob({
          job: { ...reviewingJob, recipientEmail: targetRecipient },
          gmailMessageId: res.messageId,
          status: 'applied',
          cvId: activeCv.id,
          cvTitle: docName,
          subject: `Job Application: ${reviewingJob.title} — Fazle Rabbi Boyati`,
          coverLetter: personalizedLetter,
          sourceUrl: reviewingJob.originalJobUrl || reviewingJob.applicationUrl,
        });

        if (aiSearchResults !== null) {
          const remaining = aiSearchResults.filter(j => j.id !== reviewingJob.id);
          setAiSearchResults(remaining.length > 0 ? remaining : null);
        }

        showToast(`Application accepted by Gmail for ${reviewingJob.employer} (ID: ${res.messageId})! Replenishing visible vacancies...`);
        setReviewingJob(null);

        // Immediately replenish the visible list!
        await loadBatch();
        await loadHistory();
      } else {
        throw new Error(res.error || 'Failed to dispatch email');
      }
    } catch (err: any) {
      await submitApplicationToBackend({
        jobId: reviewingJob.id,
        market: 'europe',
        method: 'gmail',
        status: 'failed',
        submissionLifecycleStatus: 'failed',
        employer: reviewingJob.employer,
        title: reviewingJob.title,
        country: reviewingJob.country,
        location: reviewingJob.location,
        recipientEmail: reviewingJob.recipientEmail,
        sourceUrl: reviewingJob.originalJobUrl || reviewingJob.applicationUrl,
        cvId: activeCv.id,
        cvTitle: activeCv.title,
        coverLetter: personalizedLetter,
        errorReason: err.message || 'Transmission failed',
      });
      showToast(`Application failed: ${err.message}. The vacancy remains saved for safe retry.`);
      await loadBatch();
      await loadHistory();
    } finally {
      setIsSending(false);
      setInFlightJobIds(prev => {
        const next = new Set(prev);
        next.delete(reviewingJob.id);
        return next;
      });
    }
  };

  // Bulk Apply to All Selected Vacancies in Batch with Auto-Replenishment
  const handleApplySelectedBatch = async () => {
    const selectedJobs = batchData.batch.filter(
      j => selectedBatchJobIds.has(j.id) && j.applicationStatus !== 'submitted'
    );
    if (selectedJobs.length === 0) {
      showToast('Please select at least one active European vacancy to apply.');
      return;
    }

    if (!selectedCvId) {
      showToast('CV Required: Please upload or select a CV from your phone before running batch applications.');
      return;
    }

    const activeCv = cvLibrary.find(c => c.id === selectedCvId) || cvLibrary[0];
    const token = getCachedGoogleToken();
    const isTokenValid = token ? await testGmailTokenValidity(token) : false;

    if (!token || !isTokenValid) {
      showToast('Gmail session not connected. Please connect your Gmail account in Profile & Settings or Apply section.');
      return;
    }

    setIsSending(true);
    showToast(`Enqueuing ${selectedJobs.length} European vacancies into the persistent sending queue...`);

    const cvPayload = getCVAttachmentPayload(selectedCvId);
    const docName = activeCv.fileName ? `${activeCv.title} (${activeCv.fileName})` : activeCv.title;

    for (const job of selectedJobs) {
      if (job.recipientEmail) {
        const letter = `Fazle Rabbi Boyati
Limassol Marina, Cyprus | +357 9550 2363 | fazle.rabbe.doc@gmail.com
LinkedIn: https://www.linkedin.com/in/fazle-rabbi-5785aa269

Dear Hiring Team at ${job.employer},

I am writing to apply for the ${job.title} vacancy in ${job.location}. With over five years of dedicated experience across luxury hotels, resort pool bars, and cocktail lounges, I craft signature drinks, specialty coffee, and ensure top-tier guest satisfaction.

Please find my updated CV attached for your consideration.

Best regards,
Fazle Rabbi Boyati`;

        persistentGmailQueueEngine.enqueue({
          jobId: job.id,
          market: 'europe',
          recipient: job.recipientEmail,
          company: job.employer,
          position: job.title,
          subject: `Job Application: ${job.title} — Fazle Rabbi Boyati`,
          bodyText: letter,
          cvId: activeCv.id,
          cvTitle: docName,
          cvAttachment: cvPayload.base64
            ? {
                filename: cvPayload.filename,
                base64: cvPayload.base64,
                mimeType: cvPayload.mimeType,
              }
            : undefined,
        });
      }
    }

    // Process queue sequentially with 4s intervals
    const result = await persistentGmailQueueEngine.processQueue({
      delayBetweenEmailsMs: 4000,
    });

    showToast(
      `Queue execution finished: ${result.successCount} sent, ${result.failureCount} failed. Batch automatically replenished!`
    );
    setIsSending(false);
    await loadBatch();
    await loadHistory();
  };

  // Run Authorized Test Email to fazle.rabbe.doc@gmail.com (Never contacts real employers)
  const handleRunAuthorizedTest = async () => {
    setIsTestingEmail(true);
    setTestResult(null);
    try {
      const res = await persistentGmailQueueEngine.executeAuthorizedTestEmail({
        recipientEmail: 'fazle.rabbe.doc@gmail.com',
        cvId: selectedCvId,
      });

      if (res.success) {
        setTestResult({
          status: 'PASS',
          message: `Test email successfully accepted by Gmail API! Message ID: ${res.messageId}. Verified RFC 2822 formatting and attached CV.`,
          messageId: res.messageId,
        });
        showToast('Authorized test email delivered successfully to fazle.rabbe.doc@gmail.com!');
      } else {
        setTestResult({
          status: 'FAIL',
          message: res.diagnostic.reason,
        });
        showToast(`Test failed: ${res.diagnostic.reason}`);
      }
    } catch (e: any) {
      setTestResult({
        status: 'FAIL',
        message: e.message || 'Diagnostic test encountered unexpected error.',
      });
    } finally {
      setIsTestingEmail(false);
    }
  };

  // Filter batch jobs or AI flexible search results by search keyword, country, role, industry, and sponsorship
  const displayedBatch = useMemo(() => {
    const sourceJobs = aiSearchResults !== null ? aiSearchResults : batchData.batch;
    return sourceJobs.filter(job => {
      // Strictly exclude Cyprus
      const cLower = (job.country || '').toLowerCase();
      const locLower = (job.location || '').toLowerCase();
      if (cLower.includes('cyprus') || locLower.includes('cyprus')) return false;

      const evalRes = evaluateHospitalitySponsorship({
        title: job.title,
        employer: job.employer,
        location: job.location,
        country: job.country,
        sponsorshipEvidence: job.sponsorshipEvidence,
        sourceNotes: job.sourceNotes,
        recipientEmail: job.recipientEmail,
        applicationUrl: job.applicationUrl,
      });

      if (selectedCountry !== 'all') {
        if (!cLower.includes(selectedCountry.toLowerCase())) return false;
      }

      const roleQuery = (customRoleInput.trim() || (selectedRole !== 'all' ? selectedRole : '')).toLowerCase();
      if (roleQuery) {
        const pLower = (job.title || '').toLowerCase();
        const indLower = ((job as any).industry || evalRes.industryDetected || '').toLowerCase();
        if (!pLower.includes(roleQuery) && !indLower.includes(roleQuery)) return false;
      }

      if (selectedIndustry !== 'all') {
        const indLower = ((job as any).industry || evalRes.industryDetected || '').toLowerCase();
        if (!indLower.includes(selectedIndustry.toLowerCase())) return false;
      }

      if (selectedSponsorshipCategory !== 'all') {
        if (evalRes.transparentCategory !== selectedSponsorshipCategory) return false;
      }

      if (accommodationOnly && !evalRes.accommodationIncluded) {
        return false;
      }

      if (keyword.trim()) {
        const q = keyword.toLowerCase();
        const mEmp = (job.employer || '').toLowerCase().includes(q);
        const mTitle = (job.title || '').toLowerCase().includes(q);
        const mLoc = (job.location || '').toLowerCase().includes(q);
        const mInd = ((job as any).industry || evalRes.industryDetected || '').toLowerCase().includes(q);
        if (!mEmp && !mTitle && !mLoc && !mInd) return false;
      }

      return true;
    });
  }, [
    batchData.batch,
    aiSearchResults,
    selectedCountry,
    selectedRole,
    customRoleInput,
    selectedIndustry,
    selectedSponsorshipCategory,
    accommodationOnly,
    keyword,
  ]);

  // Count how many of the 5 jobs in this batch are already submitted
  const batchSubmittedCount = useMemo(() => {
    return batchData.batch.filter(j => j.applicationStatus === 'submitted').length;
  }, [batchData.batch]);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 p-4 rounded-2xl bg-slate-900 border border-blue-500/50 text-white text-xs shadow-2xl animate-fade-in flex items-center gap-2 max-w-md">
          <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Header Banner */}
      <div
        className={`p-6 sm:p-7 rounded-3xl border transition-all ${
          theme === 'dark' ? 'bg-[#101524] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="w-10 h-10 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-extrabold tracking-tight">Europe Job Market</h1>
                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    Cyprus Excluded
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Auto-Replenishing (5 Active)
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Continuous multi-country European hospitality vacancies · Bartender, Barista & Mixologist roles
                </p>
              </div>
            </div>
          </div>

          {/* Action & Scheduler Header Controls */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Live Daemon Status Badge */}
            <div
              className={`p-2.5 px-3.5 rounded-2xl border text-xs flex items-center gap-2.5 ${
                theme === 'dark' ? 'bg-[#151c2e] border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </div>
              <div>
                <div className="font-bold text-[11px] text-emerald-300">
                  Background Scheduler Active (Batch {batchData.currentBatchIndex + 1})
                </div>
                <div className="text-[10px] text-slate-400">
                  {daemonStatus.totalDiscovered} total vacancies indexed across Europe
                </div>
              </div>
            </div>

            {/* Native Mobile Phone CV Upload Button */}
            <button
              type="button"
              onClick={() => phoneFileInputRef.current?.click()}
              disabled={isUploadingCv}
              className="px-3.5 py-2.5 rounded-2xl border border-blue-500/40 hover:bg-blue-500/10 text-blue-300 font-bold text-xs flex items-center gap-2 transition active:scale-95 shadow-sm"
              title="Upload your PDF or DOCX CV directly from phone storage"
            >
              <Upload className={`w-3.5 h-3.5 text-blue-400 ${isUploadingCv ? 'animate-bounce' : ''}`} />
              <span>{isUploadingCv ? 'Uploading...' : 'Upload CV from Phone'}</span>
            </button>

            {/* Hidden Native File Input for Mobile Device / Phone Storage */}
            <input
              type="file"
              ref={phoneFileInputRef}
              accept=".pdf,.docx,.doc,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              style={{ display: 'none' }}
              onChange={handleUploadCvFromPhone}
            />

            {/* Scan Europe Jobs Now (Advances Pagination Cursor) */}
            <button
              type="button"
              onClick={handleTriggerSearchNow}
              disabled={isLoading || isSearchingNew}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-2 transition active:scale-95 disabled:opacity-50 shadow-md shadow-blue-600/30"
              title="Scan and paginate fresh vacancies across European luxury hotels"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading || isSearchingNew ? 'animate-spin' : ''}`} />
              <span>{isSearchingNew ? 'Discovering New...' : 'Scan Europe Jobs'}</span>
            </button>
          </div>
        </div>

        {/* Server Background Scheduler Live Details Card */}
        {daemonStatus.cursorState && (
          <div className="mt-4 p-3 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-bold text-blue-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                <span>Continuous Server Daemon:</span>
              </span>
              <span className="text-slate-300">
                Last run: <strong>{new Date(daemonStatus.cursorState.lastSuccessfulRun).toLocaleTimeString()}</strong>
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-300">
                Page Cursor: <strong>Page {daemonStatus.cursorState.europePageIndex}</strong>
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-300">
                Total background cycles: <strong>{daemonStatus.totalRuns}</strong>
              </span>
            </div>

            {/* Safe Test Email Diagnostic Button */}
            <button
              type="button"
              onClick={handleRunAuthorizedTest}
              disabled={isTestingEmail}
              className="px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-300 font-bold text-[11px] flex items-center gap-1.5 transition active:scale-95 shrink-0 self-end sm:self-auto"
              title="Send a safe authorized diagnostic test message to fazle.rabbe.doc@gmail.com with attached CV"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isTestingEmail ? 'Running Diagnostic...' : 'Safe Test to fazle.rabbe.doc@gmail.com'}</span>
            </button>
          </div>
        )}

        {/* Diagnostic Test Result Banner */}
        {testResult && (
          <div
            className={`mt-3 p-3 rounded-2xl border text-xs flex items-start gap-2.5 ${
              testResult.status === 'PASS'
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
            }`}
          >
            {testResult.status === 'PASS' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <div className="font-bold flex items-center gap-2">
                <span>Diagnostic Test Result: [{testResult.status}]</span>
                {testResult.messageId && (
                  <span className="font-mono text-[10px] text-emerald-400">ID: {testResult.messageId}</span>
                )}
              </div>
              <p className="mt-0.5 text-[11px]">{testResult.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setTestResult(null)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Navigation Tabs: Active 5-Job Pipeline vs Application History */}
        <div className="mt-5 flex items-center gap-2 border-b border-slate-800/80 pb-3">
          <button
            type="button"
            onClick={() => setViewTab('active')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              viewTab === 'active'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Active European Vacancies (5)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setViewTab('history');
              loadHistory();
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              viewTab === 'history'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Application History ({appHistory.length})</span>
          </button>
        </div>

        {/* Flexible AI-Powered Filters for Any Job Title, Industry, Country, or Employer (Requirement 3) */}
        <div className="mt-4 space-y-3 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Search Any Employer, Role, or Keyword
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  placeholder="Ritz Paris, Chef, IT Support, DHL, Nurse, Bartender..."
                  value={keyword}
                  onChange={e => setKeyword(e.target.value)}
                  className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs border ${
                    theme === 'dark' ? 'bg-[#161d2d] border-slate-800 text-white' : 'bg-white border-slate-300'
                  }`}
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                European Destination (Excludes Cyprus)
              </label>
              <select
                value={selectedCountry}
                onChange={e => setSelectedCountry(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl text-xs border ${
                  theme === 'dark' ? 'bg-[#161d2d] border-slate-800 text-white' : 'bg-white border-slate-300'
                }`}
              >
                <option value="all">🌍 All European Destinations</option>
                <option value="France">🇫🇷 France (Paris, Cannes, Courchevel)</option>
                <option value="Italy">🇮🇹 Italy (Venice, Rome, Florence, Milan)</option>
                <option value="Spain">🇪🇸 Spain (Barcelona, Madrid, Ibiza, Marbella)</option>
                <option value="Switzerland">🇨🇭 Switzerland (Zurich, St. Moritz, Geneva)</option>
                <option value="Austria">🇦🇹 Austria (Vienna, Salzburg, Kitzbühel)</option>
                <option value="Greece">🇬🇷 Greece (Santorini, Mykonos, Athens)</option>
                <option value="Portugal">🇵🇹 Portugal (Lisbon, Porto, Algarve)</option>
                <option value="Ireland">🇮🇪 Ireland (Dublin, Limerick, Killarney)</option>
                <option value="Germany">🇩🇪 Germany (Berlin, Munich, Frankfurt)</option>
                <option value="Netherlands">🇳🇱 Netherlands (Amsterdam)</option>
                <option value="Belgium">🇧🇪 Belgium (Brussels, Antwerp)</option>
                <option value="Sweden">🇸🇪 Sweden (Stockholm)</option>
                <option value="Norway">🇳🇴 Norway (Oslo)</option>
                <option value="Croatia">🇭🇷 Croatia (Dubrovnik, Poreč, Zadar)</option>
                <option value="Malta">🇲🇹 Malta (Valletta, St. Julian's)</option>
                <option value="United Kingdom">🇬🇧 United Kingdom (London, Edinburgh)</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Any Job Title / Custom Role
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Type any job title (e.g. Chef, Receptionist)..."
                  value={customRoleInput}
                  onChange={e => setCustomRoleInput(e.target.value)}
                  className={`flex-1 px-3 py-2 rounded-xl text-xs border ${
                    theme === 'dark' ? 'bg-[#161d2d] border-slate-800 text-white' : 'bg-white border-slate-300'
                  }`}
                />
                <select
                  value={selectedRole}
                  onChange={e => {
                    setSelectedRole(e.target.value);
                    if (e.target.value !== 'all') setCustomRoleInput('');
                  }}
                  className={`w-28 px-2 py-2 rounded-xl text-xs border ${
                    theme === 'dark' ? 'bg-[#161d2d] border-slate-800 text-white' : 'bg-white border-slate-300'
                  }`}
                  title="Quick role presets"
                >
                  <option value="all">Presets</option>
                  <option value="Bartender">Bartender</option>
                  <option value="Barista">Barista</option>
                  <option value="Mixologist">Mixologist</option>
                  <option value="Chef">Chef / Culinary</option>
                  <option value="Receptionist">Front Office</option>
                  <option value="Warehouse">Logistics</option>
                  <option value="Support">Tech / Customer Support</option>
                  <option value="Maintenance">Maintenance</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Industry & Sponsorship Evidence
              </label>
              <div className="flex gap-1.5">
                <select
                  value={selectedIndustry}
                  onChange={e => setSelectedIndustry(e.target.value)}
                  className={`w-1/2 px-2 py-2 rounded-xl text-xs border ${
                    theme === 'dark' ? 'bg-[#161d2d] border-slate-800 text-white' : 'bg-white border-slate-300'
                  }`}
                >
                  <option value="all">All Industries</option>
                  <option value="Hospitality">Hospitality & Mixology</option>
                  <option value="Hotel">Hotel & Resort Ops</option>
                  <option value="Culinary">Culinary & Kitchen</option>
                  <option value="Technology">Tech & Engineering</option>
                  <option value="Healthcare">Healthcare & Care</option>
                  <option value="Logistics">Logistics & Supply</option>
                  <option value="Skilled Trades">Skilled Trades</option>
                  <option value="Business">Business & Corporate</option>
                </select>
                <select
                  value={selectedSponsorshipCategory}
                  onChange={e => setSelectedSponsorshipCategory(e.target.value)}
                  className={`w-1/2 px-2 py-2 rounded-xl text-xs border ${
                    theme === 'dark' ? 'bg-[#161d2d] border-slate-800 text-white' : 'bg-white border-slate-300'
                  }`}
                >
                  <option value="all">Any Sponsorship</option>
                  <option value="Confirmed by Official Evidence">Confirmed Official</option>
                  <option value="Strong Evidence — Employer Confirmation Required">Strong Evidence</option>
                  <option value="Possible — Needs Verification">Possible</option>
                  <option value="Not Mentioned">Not Mentioned</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-3 flex-wrap text-xs">
              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={accommodationOnly}
                  onChange={e => setAccommodationOnly(e.target.checked)}
                  className="rounded accent-blue-600"
                />
                <span>Accommodation / Staff Housing Included</span>
              </label>
              {aiSearchResults !== null && (
                <button
                  type="button"
                  onClick={() => setAiSearchResults(null)}
                  className="text-xs text-amber-400 hover:text-amber-300 underline font-semibold"
                >
                  Reset to 5-Job Batch View ({aiSearchResults.length} AI results active)
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleRunAiFlexibleSearch(true)}
                disabled={isAiSearching}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50 transition"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isAiSearching ? 'animate-spin' : ''}`} />
                <span>{isAiSearching ? 'Analyzing CV & Discovering...' : 'AI Discover & Recommend Filters (Gemini)'}</span>
              </button>
            </div>
          </div>

          {/* AI Recommended Filters Banner */}
          {aiRecommendedFilters && (
            <div className="p-3 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-indigo-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Gemini CV Analysis & Recommended Filters:</span>
                </span>
                <button
                  type="button"
                  onClick={() => setAiRecommendedFilters(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-slate-300">{aiRecommendedFilters.rationale}</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Suggested Roles:</span>
                {aiRecommendedFilters.recommendedRoles.map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setCustomRoleInput(r)}
                    className="px-2 py-0.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-500/30 text-[11px] transition"
                  >
                    {r}
                  </button>
                ))}
                <span className="text-[10px] text-slate-400 uppercase font-bold ml-2">Countries:</span>
                {aiRecommendedFilters.recommendedCountries.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedCountry(c)}
                    className="px-2 py-0.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/30 text-[11px] transition"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Action Bar when jobs are selected */}
      {viewTab === 'active' && selectedBatchJobIds.size > 0 && (
        <div className="p-3 rounded-2xl bg-gradient-to-r from-blue-900/30 via-indigo-900/30 to-purple-900/30 border border-blue-500/40 flex items-center justify-between gap-3 flex-wrap shadow-sm">
          <div className="flex items-center gap-2 text-xs text-blue-200">
            <CheckSquare className="w-4 h-4 text-blue-400 shrink-0" />
            <span>
              <strong>{selectedBatchJobIds.size}</strong> European vacancies selected for automated queue delivery
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleApplySelectedBatch}
              disabled={isSending}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-blue-600/30 disabled:opacity-50 transition active:scale-95"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {isSending
                  ? 'Delivering via Queue...'
                  : `Apply to Selected (${selectedBatchJobIds.size}) & Auto-Replenish`}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* 5-Job Batch Display Header */}
      {viewTab === 'active' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1 text-xs text-slate-400">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-white text-sm">
              Current Active Batch: 5 European Vacancies
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-emerald-400 font-semibold">
              {batchSubmittedCount} of 5 Applied
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-blue-300 font-medium text-[11px]">
              Auto-replenishing upon application & dismissal
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                setIsLoading(true);
                await advanceJobBatch('europe');
                await loadBatch();
                setIsLoading(false);
                showToast('Advanced to next batch of 5 European vacancies.');
              }}
              className="px-3 py-1.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white transition flex items-center gap-1.5"
              title="Advance and display the next batch of 5 jobs"
            >
              <span>Retrieve Next Batch of 5</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* 5-Job Batch Cards */}
      {viewTab === 'active' && (
        <div className="space-y-4">
          {displayedBatch.map((job, idx) => {
            const isSubmitted = job.applicationStatus === 'submitted';

            return (
              <div
                key={job.id}
                className={`p-6 rounded-3xl border transition-all ${
                  isSubmitted
                    ? theme === 'dark'
                      ? 'bg-[#0f1420]/80 border-slate-800 opacity-90'
                      : 'bg-slate-50 border-slate-200 opacity-90'
                    : theme === 'dark'
                    ? 'bg-[#101524] border-slate-800 hover:border-slate-700 shadow-sm'
                    : 'bg-white border-slate-200 shadow-xs'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <label
                        className="cursor-pointer flex items-center pr-1"
                        title="Select for bulk delivery"
                      >
                        <input
                          type="checkbox"
                          checked={selectedBatchJobIds.has(job.id)}
                          onChange={e => {
                            const next = new Set(selectedBatchJobIds);
                            if (e.target.checked) next.add(job.id);
                            else next.delete(job.id);
                            setSelectedBatchJobIds(next);
                          }}
                          className="w-4 h-4 rounded text-blue-600 accent-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </label>
                      <span className="text-xs font-mono font-bold text-blue-400/80">
                        #{idx + 1}
                      </span>
                      <h3 className="text-base sm:text-lg font-bold text-white">{job.employer}</h3>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        {job.country}
                      </span>
                      {isSubmitted && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Application Submitted</span>
                        </span>
                      )}
                    </div>

                    <div className="text-sm font-semibold text-slate-200 flex items-center gap-2 flex-wrap">
                      <span>{job.title}</span>
                      <span className="text-slate-600">·</span>
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-500" />
                        {job.location}
                      </span>
                      {job.recipientEmail ? (
                        <>
                          <span className="text-slate-600">·</span>
                          <span className="text-xs text-blue-400 flex items-center gap-1 font-mono">
                            <Mail className="w-3 h-3 text-blue-400" />
                            {job.recipientEmail}
                          </span>
                          {(() => {
                            const check = resolveVerifiedEmployerEmail(job.recipientEmail, job.employer);
                            const isVerified = check.contactStatus === 'Verified Hiring Contact' && job.emailVerificationStatus !== 'unverified';
                            return (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                  isVerified
                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                }`}
                              >
                                {isVerified ? check.contactType || 'Verified HR Contact' : 'Unverified'}
                              </span>
                            );
                          })()}
                        </>
                      ) : (
                        <>
                          <span className="text-slate-600">·</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            Unverified Contact — Apply via Official Link
                          </span>
                        </>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
                      <span>
                        Source: <strong className="text-slate-300">{job.source || 'Employer Careers'}</strong>
                      </span>
                      <span>·</span>
                      <span>
                        Method:{' '}
                        <strong className="uppercase text-blue-300">
                          {job.applicationMethod || (job.recipientEmail && (job.applicationUrl || job.originalJobUrl) ? 'both' : job.recipientEmail ? 'email' : 'portal')}
                        </strong>
                      </span>
                      {job.postingDate && (
                        <>
                          <span>·</span>
                          <span>Posted: {new Date(job.postingDate).toLocaleDateString()}</span>
                        </>
                      )}
                      <span>·</span>
                      <span>
                        Verified:{' '}
                        {new Date(job.lastVerificationTime || job.lastCheckedDate || Date.now()).toLocaleDateString()}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
                      {job.sourceNotes ||
                        'Verified active establishment discovered through continuous multi-country European discovery scheduler.'}
                    </p>

                    {/* Historical receipts indicator */}
                    {job.applicationHistory && job.applicationHistory.length > 0 && (
                      <div className="text-[11px] text-slate-400 pt-1 flex items-center gap-2 flex-wrap">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>
                          Dispatched:{' '}
                          {new Date(job.applicationHistory[0].timestamp).toLocaleString()} (
                          {job.applicationHistory[0].method === 'gmail' ? 'Gmail' : 'Portal'}) — Status:{' '}
                          <strong>{job.applicationHistory[0].status}</strong>
                          {job.applicationHistory[0].errorReason
                            ? ` (${job.applicationHistory[0].errorReason})`
                            : ''}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2.5 shrink-0 self-end lg:self-auto flex-wrap">
                    {isSubmitted ? (
                      <div className="flex items-center gap-2">
                        <span className="px-3.5 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Submitted</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenReview(job)}
                          className="px-3 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold"
                        >
                          Re-apply
                        </button>
                      </div>
                    ) : (
                      <>
                        {(job.applicationUrl || job.originalJobUrl) && (
                          <button
                            type="button"
                            onClick={() => handleOpenExternalPortalLink(job)}
                            className="px-3.5 py-2.5 rounded-xl border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 text-blue-200 text-xs font-bold flex items-center gap-1.5 transition"
                            title="Open official vacancy link on employer website (does not mark as applied until confirmed)"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                            <span>Official Vacancy Link</span>
                          </button>
                        )}

                        {portalOpenedJobIds.has(job.id) && (
                          <button
                            type="button"
                            onClick={() => handleConfirmPortalApplication(job)}
                            disabled={inFlightJobIds.has(job.id)}
                            className="px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-md"
                            title="Confirm that you completed your submission on the external portal"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Confirm Portal Submitted</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenReview(job)}
                          disabled={inFlightJobIds.has(job.id)}
                          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-blue-600/30 disabled:opacity-50"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          <span>
                            {job.applicationStatus === 'failed'
                              ? 'Retry Application'
                              : 'Apply (CV & Letter)'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDismissJob(job.id, job.employer)}
                          className="px-2.5 py-2.5 rounded-xl border border-slate-700/80 hover:border-amber-500/40 hover:bg-amber-500/10 text-slate-400 hover:text-amber-300 text-xs font-semibold flex items-center gap-1 transition"
                          title="Temporarily hide vacancy and immediately replenish next opportunity"
                        >
                          <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                          <span>Hide</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleMarkExpiredJob(job.id, job.employer)}
                          className="px-2.5 py-2.5 rounded-xl border border-slate-700/80 hover:border-red-500/40 hover:bg-red-500/10 text-slate-400 hover:text-red-300 text-xs font-semibold flex items-center gap-1 transition"
                          title="Mark vacancy expired/closed and remove from active listings (preserves history)"
                        >
                          <X className="w-3.5 h-3.5 text-slate-400" />
                          <span>Expired</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {displayedBatch.length === 0 && (
            <div className="text-center py-14 rounded-3xl border border-dashed border-slate-800 text-slate-400 space-y-3">
              <Globe className="w-12 h-12 mx-auto text-slate-600" />
              <div className="text-base font-bold text-white">
                {batchData.noMoreJobsAvailable
                  ? 'No New Eligible European Vacancies Available Right Now'
                  : 'Current Batch Completed or Filtered'}
              </div>
              <p className="text-xs max-w-md mx-auto">
                {batchData.noMoreJobsAvailable
                  ? `All verified European vacancies in the current pool have been applied to or reviewed. Already-applied jobs are never shown as new opportunities. Last successful refresh: ${
                      batchData.lastSearchTime
                        ? new Date(batchData.lastSearchTime).toLocaleString()
                        : 'Just now'
                    }.`
                  : 'All vacancies in the current batch or filter view have been processed. Click below to scan configured European sources for the next batch of 5 opportunities.'}
              </p>
              <button
                type="button"
                onClick={handleTriggerSearchNow}
                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-md shadow-blue-600/30"
              >
                Scan More European Vacancies Now
              </button>
            </div>
          )}
        </div>
      )}

      {/* Application History View Tab */}
      {viewTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <span className="font-bold text-white text-sm">
              European Application History ({appHistory.length} Recorded)
            </span>
            <button
              type="button"
              onClick={loadHistory}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
              <span>Refresh History</span>
            </button>
          </div>

          {appHistory.length === 0 ? (
            <div className="text-center py-14 rounded-3xl border border-dashed border-slate-800 text-slate-400 space-y-3">
              <Clock className="w-12 h-12 mx-auto text-slate-600" />
              <div className="text-base font-bold text-white">No Application Records Yet</div>
              <p className="text-xs max-w-md mx-auto">
                Applications you submit via connected Gmail or confirm through employer career pages will be permanently recorded here with delivery receipts.
              </p>
              <button
                type="button"
                onClick={() => setViewTab('active')}
                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs shadow-lg shadow-blue-600/30"
              >
                Go to Active European Vacancies
              </button>
            </div>
          ) : (
            appHistory.map((item, idx) => (
              <div
                key={item.id || idx}
                className={`p-5 rounded-3xl border ${
                  theme === 'dark' ? 'bg-[#101524] border-slate-800' : 'bg-white border-slate-200'
                } space-y-3`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-white text-base">{item.employer}</h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      {item.country}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 border ${
                        item.applicationStatus === 'submitted'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : item.applicationStatus === 'failed'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      }`}
                    >
                      {item.applicationStatus === 'submitted' ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <AlertCircle className="w-3 h-3 text-rose-400" />
                      )}
                      <span>
                        {item.applicationStatus === 'submitted'
                          ? 'Accepted by Gmail / Sent'
                          : item.applicationStatus === 'failed'
                          ? 'Failed to Send — Retry Available'
                          : item.applicationStatus}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.applicationStatus === 'failed' && (
                      <button
                        type="button"
                        onClick={() => handleOpenReview(item)}
                        className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold flex items-center gap-1 transition"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Retry Application</span>
                      </button>
                    )}
                    <span className="text-[11px] font-mono text-slate-400">ID: {item.id}</span>
                  </div>
                </div>

                <div className="text-xs text-slate-300 flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{item.title}</span>
                  <span className="text-slate-600">•</span>
                  <span>{item.location}</span>
                  {item.recipientEmail && (
                    <>
                      <span className="text-slate-600">•</span>
                      <span className="font-mono text-blue-400">{item.recipientEmail}</span>
                    </>
                  )}
                </div>

                {item.applicationHistory && item.applicationHistory.length > 0 && (
                  <div className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 text-xs space-y-1">
                    <div className="text-slate-200 font-semibold flex items-center gap-2 flex-wrap">
                      <span>
                        Method: <strong className="uppercase text-blue-300">{item.applicationHistory[0].method}</strong>
                      </span>
                      <span className="text-slate-600">•</span>
                      <span>
                        Dispatched:{' '}
                        <strong>{new Date(item.applicationHistory[0].timestamp).toLocaleString()}</strong>
                      </span>
                      {item.applicationHistory[0].cvTitle && (
                        <>
                          <span className="text-slate-600">•</span>
                          <span>
                            Attached CV:{' '}
                            <strong className="text-blue-300">{item.applicationHistory[0].cvTitle}</strong>
                          </span>
                        </>
                      )}
                    </div>
                    {item.applicationHistory[0].gmailMessageId && (
                      <div className="text-[11px] text-slate-400 font-mono">
                        Gmail Message ID:{' '}
                        <span className="text-slate-300">{item.applicationHistory[0].gmailMessageId}</span>
                      </div>
                    )}
                    {item.applicationHistory[0].notes && (
                      <div className="text-[11px] text-slate-400 italic">
                        {item.applicationHistory[0].notes}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Review & Apply Modal with CV Selection & Attachments */}
      {reviewingJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-xs">
          <div
            className={`w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl border p-6 sm:p-7 space-y-4 shadow-2xl ${
              theme === 'dark' ? 'bg-[#111728] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-blue-400">ID: {reviewingJob.id}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    European Hospitality Application
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white mt-1">
                  Apply for {reviewingJob.title} at {reviewingJob.employer}
                </h3>
                <p className="text-xs text-slate-400">
                  {reviewingJob.location} · {reviewingJob.country}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewingJob(null)}
                className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Recipient Destination Banner */}
            {(() => {
              const check = resolveVerifiedEmployerEmail(reviewingJob.recipientEmail, reviewingJob.employer);
              const isVerified = check.contactStatus === 'Verified Hiring Contact' && reviewingJob.emailVerificationStatus !== 'unverified';
              return (
                <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-xs space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 font-bold text-blue-300">
                      <Mail className="w-4 h-4 text-blue-400" />
                      <span>Application Destination (HR / Recruitment Contact):</span>
                    </div>
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
                    placeholder="Enter verified HR/Recruitment email or apply via official careers portal below"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-200 font-mono text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              );
            })()}

            {/* Step 1: CV Selection & Phone Upload */}
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-400" />
                  <span>Resume / CV Document (Required to Apply):</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => phoneFileInputRef.current?.click()}
                    disabled={isUploadingCv}
                    className="px-2.5 py-1 rounded-lg bg-blue-600/20 border border-blue-500/40 hover:bg-blue-600/30 text-blue-300 text-[11px] font-bold flex items-center gap-1.5 transition active:scale-95"
                    title="Open phone file storage to select a PDF or Word CV"
                  >
                    <Upload className={`w-3 h-3 ${isUploadingCv ? 'animate-bounce' : ''}`} />
                    <span>{isUploadingCv ? 'Uploading...' : 'Upload CV from Phone'}</span>
                  </button>
                  {onOpenCVLibrary && (
                    <button
                      type="button"
                      onClick={onOpenCVLibrary}
                      className="text-[11px] text-slate-400 hover:text-blue-300 transition"
                    >
                      CV Library
                    </button>
                  )}
                </div>
              </div>

              {/* Active Selected CV Document Card */}
              {(() => {
                const activeCv = cvLibrary.find(c => c.id === selectedCvId);
                if (!activeCv) {
                  return (
                    <div className="p-3 rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>No CV selected. You must upload or select a CV to apply.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => phoneFileInputRef.current?.click()}
                        className="px-3 py-1 bg-amber-500 text-slate-950 font-bold text-xs rounded-lg shrink-0 shadow-sm"
                      >
                        Upload Resume
                      </button>
                    </div>
                  );
                }

                const isPdf = activeCv.fileType === 'pdf';
                const isWord = activeCv.fileType === 'docx' || activeCv.fileType === 'doc';

                return (
                  <div className="p-3 rounded-2xl border border-slate-700 bg-slate-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start sm:items-center gap-3">
                      <div
                        className={`px-2 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider shrink-0 ${
                          isPdf
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : isWord
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        {activeCv.fileType?.toUpperCase() || 'CV'}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1.5 flex-wrap">
                          <span>{activeCv.title}</span>
                          {activeCv.storageSource === 'phone_upload' && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              Phone Upload
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap mt-0.5">
                          {activeCv.fileName && (
                            <span className="font-mono text-slate-300">{activeCv.fileName}</span>
                          )}
                          {activeCv.fileSizeBytesFormatted && <span>• {activeCv.fileSizeBytesFormatted}</span>}
                          <span>• {activeCv.roleSubtitle || 'Hospitality Professional'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setPreviewingCv(activeCv)}
                        className="px-2.5 py-1.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition"
                        title="Preview uploaded document content"
                      >
                        <Eye className="w-3.5 h-3.5 text-blue-400" />
                        <span>Preview</span>
                      </button>

                      <select
                        value={selectedCvId}
                        onChange={e => setSelectedCvId(e.target.value)}
                        className="px-2.5 py-1.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 text-xs font-medium max-w-[170px]"
                        title="Switch to another saved CV from your persistent library"
                      >
                        {cvLibrary.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.title} {c.fileName ? `(${c.fileName})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Step 2: Select Professional Photographs & Portfolio Assets */}
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                <span>Select Professional Photographs to Attach ({selectedPhotoIds.length} chosen):</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {availablePhotos.map(photo => {
                  const isChecked = selectedPhotoIds.includes(photo.id);
                  return (
                    <label
                      key={photo.id}
                      className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition text-xs ${
                        isChecked
                          ? 'bg-blue-600/20 border-blue-500/50 text-white'
                          : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setSelectedPhotoIds(prev => prev.filter(id => id !== photo.id));
                          } else {
                            setSelectedPhotoIds(prev => [...prev, photo.id]);
                          }
                        }}
                        className="rounded accent-blue-600"
                      />
                      <span className="truncate">{photo.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Step 3: Personalized European Cover Letter */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-300">
                  Personalized Cover Letter (Included in Email Body & Optional PDF):
                </label>
                <label className="flex items-center gap-1.5 text-xs text-emerald-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={attachCoverLetterPdf}
                    onChange={e => setAttachCoverLetterPdf(e.target.checked)}
                    className="rounded accent-emerald-500"
                  />
                  <span>Also Attach Cover Letter as PDF</span>
                </label>
              </div>
              <textarea
                rows={9}
                value={personalizedLetter}
                onChange={e => setPersonalizedLetter(e.target.value)}
                className={`w-full p-3 rounded-xl text-xs border font-mono leading-relaxed ${
                  theme === 'dark' ? 'bg-[#182136] border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                }`}
              />
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col gap-2.5 pt-2">
              {(reviewingJob.applicationUrl || reviewingJob.originalJobUrl) && (
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleOpenExternalPortalLink(reviewingJob)}
                    className="w-full sm:w-1/2 py-2.5 rounded-xl border border-blue-500/40 bg-blue-600/10 hover:bg-blue-600/20 text-blue-300 font-bold text-xs flex items-center justify-center gap-2 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>1. Open Official Careers Page</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmPortalApplication(reviewingJob)}
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
                onClick={handleSendApplication}
                disabled={isSending}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5 -rotate-12" />
                <span>{isSending ? 'Dispatching via Gmail...' : 'Submit Application via Gmail'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CV Document Preview Modal (Phone Uploaded PDF / Word / Structured) */}
      {previewingCv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-xs">
          <div
            className={`w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl border p-6 space-y-4 shadow-2xl ${
              theme === 'dark' ? 'bg-[#111728] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div
                  className={`px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-wider ${
                    previewingCv.fileType === 'pdf'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : previewingCv.fileType === 'docx' || previewingCv.fileType === 'doc'
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}
                >
                  {previewingCv.fileType?.toUpperCase() || 'CV'}
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">{previewingCv.title}</h3>
                  <p className="text-xs text-slate-400">
                    {previewingCv.fileName || 'Master Hospitality Resume'}{' '}
                    {previewingCv.fileSizeBytesFormatted ? `• ${previewingCv.fileSizeBytesFormatted}` : ''}{' '}
                    {previewingCv.storageSource === 'phone_upload' ? '• Uploaded from Phone' : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewingCv(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Embedded Document Preview */}
            {previewingCv.fileDataUri && previewingCv.fileType === 'pdf' ? (
              <div className="w-full h-[65vh] rounded-2xl overflow-hidden border border-slate-800 bg-white">
                <iframe
                  src={previewingCv.fileDataUri}
                  title="PDF Preview"
                  className="w-full h-full border-0"
                />
              </div>
            ) : previewingCv.fileType === 'docx' || previewingCv.fileType === 'doc' ? (
              <div className="p-8 text-center rounded-2xl border border-slate-800 bg-slate-900/50 space-y-3">
                <FileText className="w-12 h-12 text-blue-400 mx-auto" />
                <h4 className="font-bold text-white text-base">
                  Microsoft Word Document ({previewingCv.fileName})
                </h4>
                <p className="text-xs text-slate-300 max-w-md mx-auto">
                  This DOCX resume file is stored persistently in your CV Library (
                  {previewingCv.fileSizeBytesFormatted}). When applying via connected Gmail, this exact binary file is attached as an official document.
                </p>
              </div>
            ) : (
              <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/50 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white text-sm">
                    {previewingCv.data.fullName} — {previewingCv.roleSubtitle}
                  </h4>
                  <span className="text-xs text-slate-400">{previewingCv.data.location}</span>
                </div>
                <div className="text-xs text-slate-300 leading-relaxed">
                  {previewingCv.data.aboutMe?.content}
                </div>
                <div className="pt-2 border-t border-slate-800/80">
                  <div className="text-xs font-bold text-slate-200 mb-2">Work Experience Highlights:</div>
                  <div className="space-y-2">
                    {previewingCv.data.experiences?.map(exp => (
                      <div key={exp.id} className="p-2.5 rounded-xl bg-slate-800/40 text-xs">
                        <div className="font-bold text-white">
                          {exp.position} — {exp.companyName}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {exp.startDate} - {exp.endDate} · {exp.location}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setPreviewingCv(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
