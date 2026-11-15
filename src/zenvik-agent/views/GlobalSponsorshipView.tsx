import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plane,
  ShieldCheck,
  Search,
  RefreshCw,
  ExternalLink,
  Mail,
  Send,
  Building,
  MapPin,
  Calendar,
  CheckCircle2,
  AlertCircle,
  FileText,
  Image as ImageIcon,
  Sparkles,
  Layers,
  Award,
  ArrowRight,
  RotateCcw,
  Clock,
  CheckSquare,
  Square,
  HelpCircle,
  X,
  Upload,
  Eye,
  EyeOff,
  Paperclip,
  AlertTriangle,
  Globe,
  BookOpen,
  Filter,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import {
  BackendJobRecord,
  BatchResponse,
  AppliedJobRecord,
  fetchJobBatch,
  submitApplicationToBackend,
  updateJobApplicationState,
  advanceJobBatch,
  dismissJobFromBackend,
  fetchApplicationHistoryFromBackend,
  triggerManualDiscovery,
  recordAppliedJob,
  loadAppliedJobRecords,
  evaluateSponsorshipJobFollowUpEligibility,
  simulateSponsorshipFollowUpWindow,
} from '../services/jobDatabaseService';
import {
  sendJobApplicationViaGmail,
  sendApplicationsInControlledBatch,
  testGmailTokenValidity,
  GmailService,
  loadLocalSendingHistory,
  loadPreservedFailedApplications,
  removePreservedFailedApplication,
  GmailSendingRecord,
  PreservedApplicationDraft,
  EmailTrackingStatus,
  generatePersonalizedCoverLetterWithGemini,
} from '../services/gmailService';
import { getCachedGoogleToken, signInWithGoogle } from '../services/firebase';
import { loadProfessionalPhotos, ProfessionalPhotoItem } from '../services/photoStorageService';
import {
  loadCVLibrary,
  saveUploadedCVFromDevice,
  getCVAttachmentPayload,
  resolveCVAttachmentPayloadAsync,
  formatFileSize,
  setActiveCVId,
  getActiveCVId,
  saveTailoredSponsorshipCVToGallery,
} from '../services/cvStorage';
import { CVDocumentItem } from '../types/cv';
import { DEFAULT_MASTER_COVER_LETTER } from '../services/centralProfileService';
import {
  evaluateHospitalitySponsorship,
  EvaluatedSponsorshipRecord,
} from '../services/sponsorshipEvaluator';
import {
  CountryImmigrationProfile,
  loadCountryProfiles,
  getCountryProfileById,
} from '../services/countryPriorityService';
import {
  CountryPriorityManagerModal,
  CountryImmigrationModal,
} from '../components/CountryPriorityManagerModal';
import { PythonHybridAgentPanel } from '../components/PythonHybridAgentPanel';

interface GlobalSponsorshipViewProps {
  onNavigateToHistory?: () => void;
  onNavigateToCVLibrary?: () => void;
}

export const GlobalSponsorshipView: React.FC<GlobalSponsorshipViewProps> = ({
  onNavigateToHistory,
  onNavigateToCVLibrary,
}) => {
  const { theme } = useTheme();

  // 5-Job Batch State
  const [batchData, setBatchData] = useState<BatchResponse>({
    market: 'sponsorship',
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
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedSponsorshipLevel, setSelectedSponsorshipLevel] = useState<string>('all');
  const [selectedIndustry, setSelectedIndustry] = useState<string>('all');
  const [accommodationOnly, setAccommodationOnly] = useState<boolean>(false);
  const [showFollowUpEligibleOnly, setShowFollowUpEligibleOnly] = useState<boolean>(false);
  const [allSponsorshipPool, setAllSponsorshipPool] = useState<BackendJobRecord[]>([]);
  const [schedulerStatus, setSchedulerStatus] = useState<any>(null);
  const [testDeliveryEmail, setTestDeliveryEmail] = useState<string>('fazle.rabbe.doc@gmail.com');
  const [isTestingDelivery, setIsTestingDelivery] = useState<boolean>(false);
  const [testDeliveryMsg, setTestDeliveryMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Dedicated Independent Apply Modal State
  const [selectedJob, setSelectedJob] = useState<BackendJobRecord | null>(null);
  const [cvLibrary, setCvLibrary] = useState<CVDocumentItem[]>(() => loadCVLibrary());
  const [selectedCvId, setSelectedCvId] = useState<string>(() => {
    const active = getActiveCVId();
    const list = loadCVLibrary();
    return list.some(c => c.id === active) ? active : list[0]?.id || 'cv-bartender-primary';
  });
  const [availablePhotos, setAvailablePhotos] = useState<ProfessionalPhotoItem[]>(() => loadProfessionalPhotos());
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [emailSubject, setEmailSubject] = useState('');
  const [recipientOverride, setRecipientOverride] = useState('');
  const [coverLetterText, setCoverLetterText] = useState('');
  const [masterSubjectTemplate, setMasterSubjectTemplate] = useState(
    'Application: {ROLE} — Fazle Rabbi Boyati (Visa Sponsorship / Work Permit Ready)'
  );
  const [masterCoverLetterTemplate, setMasterCoverLetterTemplate] = useState<string>(() => {
    try {
      return localStorage.getItem('sponsorship_master_cover_letter_v1') || DEFAULT_MASTER_COVER_LETTER;
    } catch {
      return DEFAULT_MASTER_COVER_LETTER;
    }
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCustomizingWithGemini, setIsCustomizingWithGemini] = useState(false);
  const [isPortalModalOpen, setIsPortalModalOpen] = useState(false);

  // Per-Email Granular Tracking State (Sent, Pending, Failed, Blocked/Rate Limited, Needs Action)
  const [emailHistoryRecords, setEmailHistoryRecords] = useState<GmailSendingRecord[]>(() => loadLocalSendingHistory());
  const [preservedFailedMap, setPreservedFailedMap] = useState<Record<string, PreservedApplicationDraft>>(() =>
    loadPreservedFailedApplications()
  );
  const [liveBatchStatusMap, setLiveBatchStatusMap] = useState<
    Record<string, { status: EmailTrackingStatus; message?: string; messageId?: string; cvFile?: string }>
  >({});
  const [appliedJobRecords, setAppliedJobRecords] = useState<AppliedJobRecord[]>(() => loadAppliedJobRecords());

  // Custom Tailored CV Generator in Central CV Gallery
  const [customRoleInput, setCustomRoleInput] = useState('');
  const [customEmployerInput, setCustomEmployerInput] = useState('');
  const [isGeneratingGalleryCv, setIsGeneratingGalleryCv] = useState(false);

  // Bulk Application Selection within the 5-Job Batch
  const [selectedBatchJobIds, setSelectedBatchJobIds] = useState<Set<string>>(new Set());

  // Country Priority Intelligence Configuration Modal State
  const [isCountryModalOpen, setIsCountryModalOpen] = useState(false);
  const [inspectCountry, setInspectCountry] = useState<CountryImmigrationProfile | null>(null);

  // Mobile phone file input ref & upload states
  const phoneFileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingCv, setIsUploadingCv] = useState(false);
  const [previewingCv, setPreviewingCv] = useState<CVDocumentItem | null>(null);
  const [previewPdfDataUri, setPreviewPdfDataUri] = useState<string | null>(null);

  // View mode tab: Active Vacancies, Central CV Gallery & Studio, Email Status Tracker, Application History & 4-5 Day Follow-Up
  const [viewTab, setViewTab] = useState<'active' | 'cv_gallery' | 'email_tracker' | 'history'>('active');
  const [appHistory, setAppHistory] = useState<BackendJobRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4800);
  };

  const refreshTrackingStates = () => {
    setEmailHistoryRecords(loadLocalSendingHistory());
    setPreservedFailedMap(loadPreservedFailedApplications());
    setAppliedJobRecords(loadAppliedJobRecords());
    setCvLibrary(loadCVLibrary());
  };

  useEffect(() => {
    const syncCentralLibrary = () => {
      const updated = loadCVLibrary();
      setCvLibrary(updated);
      const activeId = getActiveCVId();
      if (activeId && updated.some(c => c.id === activeId)) {
        setSelectedCvId(activeId);
      }
    };
    window.addEventListener('central_cv_library_updated', syncCentralLibrary);
    window.addEventListener('active_cv_changed', syncCentralLibrary);
    return () => {
      window.removeEventListener('central_cv_library_updated', syncCentralLibrary);
      window.removeEventListener('active_cv_changed', syncCentralLibrary);
    };
  }, []);

  const handleSelectActiveCv = (cvId: string) => {
    setSelectedCvId(cvId);
    setActiveCVId(cvId);
  };

  const handleOpenCvPreview = async (cv: CVDocumentItem) => {
    setPreviewingCv(cv);
    if (cv.fileDataUri && cv.fileType === 'pdf') {
      setPreviewPdfDataUri(cv.fileDataUri);
      return;
    }
    if (cv.fileType === 'docx' || cv.fileType === 'doc') {
      setPreviewPdfDataUri(null);
      return;
    }
    try {
      const payload = await resolveCVAttachmentPayloadAsync(cv.id);
      if (payload.base64) {
        setPreviewPdfDataUri(`data:application/pdf;base64,${payload.base64}`);
      } else {
        setPreviewPdfDataUri(null);
      }
    } catch {
      setPreviewPdfDataUri(null);
    }
  };

  const loadSchedulerAndPool = async (useAi: boolean = false) => {
    try {
      const [schedRes, searchRes] = await Promise.all([
        fetch('/api/jobs/scheduler-status').then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/jobs/ai-flexible-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: keyword,
            country: selectedRegion === 'all' ? '' : selectedRegion,
            industry: selectedIndustry === 'all' ? '' : selectedIndustry,
            sponsorshipCategory: selectedSponsorshipLevel === 'all' ? '' : selectedSponsorshipLevel,
            accommodationOnly,
            market: 'sponsorship',
            useAiDiscovery: useAi,
          }),
        }).then(r => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (schedRes) setSchedulerStatus(schedRes);
      if (searchRes && Array.isArray(searchRes.jobs)) {
        setAllSponsorshipPool(searchRes.jobs);
      }
    } catch (e) {
      // ignore
    }
  };

  // Load the current 5-job batch from the persistent backend database with auto-replenishment
  const loadBatch = async (forceSearch: boolean = false) => {
    setIsLoading(true);
    try {
      if (forceSearch) {
        setIsSearchingNew(true);
        await fetch('/api/jobs/trigger-scheduled-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: true }),
        }).catch(() => triggerManualDiscovery('sponsorship'));
        setIsSearchingNew(false);
      }
      const data = await fetchJobBatch('sponsorship', 5);
      setBatchData(data);
      await loadSchedulerAndPool(forceSearch);
      refreshTrackingStates();
      const unapplied = data.batch.filter(j => j.applicationStatus !== 'submitted').map(j => j.id);
      setSelectedBatchJobIds(new Set(unapplied));
    } catch (e) {
      console.warn('Sponsorship batch load error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  // Load persistent application history from backend (shared unified history)
  const loadApplicationHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const history = await fetchApplicationHistoryFromBackend({ includeAllStatuses: true });
      setAppHistory(history);
      refreshTrackingStates();
    } catch (e) {
      console.warn('Could not load application history:', e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadBatch();
    loadApplicationHistory();
    const interval = setInterval(() => loadBatch(false), 90 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Listen to external CV library & application history updates
  useEffect(() => {
    const handleUpdated = () => refreshTrackingStates();
    window.addEventListener('cv_library_updated', handleUpdated);
    window.addEventListener('application_history_updated', handleUpdated);
    return () => {
      window.removeEventListener('cv_library_updated', handleUpdated);
      window.removeEventListener('application_history_updated', handleUpdated);
    };
  }, []);

  // Native Mobile / Device File Picker CV Upload
  const handleUploadCvFromPhone = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingCv(true);
    try {
      const newDoc = await saveUploadedCVFromDevice(file);
      const updated = loadCVLibrary();
      setCvLibrary(updated);
      handleSelectActiveCv(newDoc.id);
      showToast(
        `Uploaded original CV "${file.name}" (${formatFileSize(file.size)})! When selected, this exact original file is attached to your emails.`
      );
    } catch (err: any) {
      showToast(err.message || 'Failed to upload CV from device.');
    } finally {
      setIsUploadingCv(false);
      if (e.target) e.target.value = '';
    }
  };

  // Generate or Customize a Complete Role-Specific CV using Gemini (only when requested by user)
  const handleGenerateCustomizedCvWithGemini = async (roleTitle: string, employerName?: string, countryName?: string) => {
    const cleanRole = roleTitle.trim() || 'Hospitality & Mixology Specialist';
    setIsGeneratingGalleryCv(true);
    try {
      let tailoredSummary = '';
      try {
        const res = await fetch('/api/ai/personalize-cover-letter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company: employerName || 'International Sponsorship Employer',
            position: cleanRole,
            location: countryName || 'Europe',
            sourceNotes: `Write a concise 3-sentence executive CV summary for Fazle Rabbi Boyati tailored for ${cleanRole}${employerName ? ` at ${employerName}` : ''}, preserving his real Cyprus & 5-star hotel experience.`,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.personalizedCoverLetter) {
            // Extract main paragraph for summary or build a clean summary
            tailoredSummary = `Results-driven ${cleanRole} with over 5 years of international luxury hotel, high-volume resort bar, and specialty beverage experience across Cyprus (Flamingo Paradise Beach Hotel, O'Neill's Irish Pub) and 5-star hospitality properties (The Westin, Sea Pearl Beach Resort). Proven expertise in signature mixology, specialty coffee & latte art, HACCP compliance, inventory control, and high-standard guest service. Ready for immediate international relocation under employer-sponsored work authorization.`;
          }
        }
      } catch {
        // Fallback summary
      }
      if (!tailoredSummary) {
        tailoredSummary = `Results-driven ${cleanRole} with over 5 years of international luxury hotel, high-volume resort bar, and specialty beverage experience across Cyprus (Flamingo Paradise Beach Hotel, O'Neill's Irish Pub) and 5-star hospitality properties (The Westin, Sea Pearl Beach Resort). Proven expertise in signature mixology, specialty coffee & latte art, HACCP compliance, inventory control, and high-standard guest service.`;
      }

      const created = saveTailoredSponsorshipCVToGallery({
        title: `Fazle Rabbi — ${cleanRole} CV${employerName ? ` (${employerName})` : ''}`,
        targetRole: cleanRole,
        targetEmployer: employerName,
        targetCountry: countryName,
        tailoredSummary,
        baseCvId: selectedCvId,
      });

      refreshTrackingStates();
      handleSelectActiveCv(created.id);
      showToast(`Created complete customized CV "${created.title}" with all personal details & work experience! Click Preview to inspect.`);
      return created;
    } finally {
      setIsGeneratingGalleryCv(false);
    }
  };

  // Filter and rank jobs by strongest verified sponsorship evidence + Smart 4-5 Day Reappearance Rule
  const displayedBatch = useMemo(() => {
    const hasActiveFilter =
      selectedRegion !== 'all' ||
      selectedSponsorshipLevel !== 'all' ||
      selectedIndustry !== 'all' ||
      accommodationOnly ||
      showFollowUpEligibleOnly ||
      keyword.trim().length > 0;

    const sourceList =
      hasActiveFilter && allSponsorshipPool.length > 0 ? allSponsorshipPool : batchData.batch;

    const filtered = sourceList.filter(job => {
      const followUpEval = evaluateSponsorshipJobFollowUpEligibility(job, appliedJobRecords);

      // Smart Sponsorship Reappearance Rule:
      // Do not repeatedly show a job applied to < 4 days ago in active searches unless the user is viewing history
      if (followUpEval.status === 'cooldown_active' && !keyword.trim()) {
        return false;
      }

      if (showFollowUpEligibleOnly && followUpEval.status !== 'followup_ready') {
        return false;
      }

      const evalRes = evaluateHospitalitySponsorship({
        title: job.title,
        employer: job.employer,
        location: job.location,
        country: job.country,
        city: job.city,
        sourceNotes: job.sourceNotes,
        sponsorshipEvidence: job.sponsorshipEvidence,
        applicationUrl: job.applicationUrl,
        recipientEmail: job.recipientEmail,
      });

      if (selectedRegion !== 'all') {
        const cLower = (job.country || '').toLowerCase();
        if (!cLower.includes(selectedRegion.toLowerCase())) return false;
      }
      if (selectedIndustry !== 'all') {
        const jobInd = ((job as any).industry || evalRes.industryDetected || '').toLowerCase();
        if (!jobInd.includes(selectedIndustry.toLowerCase())) return false;
      }
      if (accommodationOnly && !evalRes.accommodationIncluded) {
        return false;
      }
      if (selectedSponsorshipLevel !== 'all') {
        if (evalRes.transparentCategory !== selectedSponsorshipLevel) return false;
      }
      if (keyword.trim()) {
        const q = keyword.toLowerCase();
        const mEmp = (job.employer || '').toLowerCase().includes(q);
        const mTitle = (job.title || '').toLowerCase().includes(q);
        const mLoc = (job.location || '').toLowerCase().includes(q);
        const mEv = (job.sponsorshipEvidence || '').toLowerCase().includes(q);
        const mInd = ((job as any).industry || evalRes.industryDetected || '').toLowerCase().includes(q);
        if (!mEmp && !mTitle && !mLoc && !mEv && !mInd) return false;
      }
      return true;
    });

    // Prioritize fresh sponsorship opportunities first, while keeping 4-5 day follow-up opportunities available
    return [...filtered].sort((a, b) => {
      const fA = evaluateSponsorshipJobFollowUpEligibility(a, appliedJobRecords);
      const fB = evaluateSponsorshipJobFollowUpEligibility(b, appliedJobRecords);
      if (fA.status === 'fresh' && fB.status !== 'fresh') return -1;
      if (fB.status === 'fresh' && fA.status !== 'fresh') return 1;

      const scoreA = evaluateHospitalitySponsorship({
        title: a.title,
        employer: a.employer,
        location: a.location,
        country: a.country,
        sponsorshipEvidence: a.sponsorshipEvidence,
        sourceNotes: a.sourceNotes,
        recipientEmail: a.recipientEmail,
        applicationUrl: a.applicationUrl,
      }).sponsorshipScore;
      const scoreB = evaluateHospitalitySponsorship({
        title: b.title,
        employer: b.employer,
        location: b.location,
        country: b.country,
        sponsorshipEvidence: b.sponsorshipEvidence,
        sourceNotes: b.sourceNotes,
        recipientEmail: b.recipientEmail,
        applicationUrl: b.applicationUrl,
      }).sponsorshipScore;
      return scoreB - scoreA;
    });
  }, [
    batchData.batch,
    allSponsorshipPool,
    appliedJobRecords,
    selectedRegion,
    selectedSponsorshipLevel,
    selectedIndustry,
    accommodationOnly,
    showFollowUpEligibleOnly,
    keyword,
  ]);

  // Count how many of the 5 jobs in this batch are already submitted
  const batchSubmittedCount = useMemo(() => {
    return batchData.batch.filter(j => j.applicationStatus === 'submitted').length;
  }, [batchData.batch]);

  // Dismiss a job from the visible batch and replenish immediately with next opportunity
  const handleDismissJob = async (jobId: string, employer: string) => {
    try {
      showToast(`Dismissing ${employer}... Replenishing next eligible sponsorship opportunity from pool.`);
      await dismissJobFromBackend(jobId, 'sponsorship');
      await loadBatch();
      await loadApplicationHistory();
    } catch (err: any) {
      showToast(`Could not dismiss vacancy: ${err.message}`);
    }
  };

  // Open the dedicated independent Sponsorship application workflow
  const handleOpenApply = (job: BackendJobRecord, draftOverride?: PreservedApplicationDraft) => {
    setSelectedJob(job);
    const photos = loadProfessionalPhotos();
    setAvailablePhotos(photos);
    setSelectedPhotoIds(photos.filter(p => p.isDefaultAttached).map(p => p.id));
    const currentLibrary = loadCVLibrary();
    setCvLibrary(currentLibrary);
    if (draftOverride?.selectedCvId && currentLibrary.some(c => c.id === draftOverride.selectedCvId)) {
      handleSelectActiveCv(draftOverride.selectedCvId);
    } else if (!selectedCvId || !currentLibrary.some(c => c.id === selectedCvId)) {
      handleSelectActiveCv(currentLibrary[0]?.id || '');
    }

    const followUpEval = evaluateSponsorshipJobFollowUpEligibility(job, appliedJobRecords);
    const isFollowUp = followUpEval.status === 'followup_ready';

    setRecipientOverride(draftOverride?.recipient || job.recipientEmail || '');

    const defaultSubj = isFollowUp
      ? `Follow-Up on Application: ${job.title} — Fazle Rabbi Boyati`
      : masterSubjectTemplate.replace('{ROLE}', job.title).replace('{EMPLOYER}', job.employer);
    setEmailSubject(draftOverride?.subject || defaultSubj);

    if (draftOverride?.coverLetter) {
      setCoverLetterText(draftOverride.coverLetter);
      return;
    }

    const letter = isFollowUp
      ? `Fazle Rabbi Boyati
Limassol Marina, Cyprus
+357 9550 2363 | fazle.rabbe.doc@gmail.com
LinkedIn: https://www.linkedin.com/in/fazle-rabbi-5785aa269

Dear Hiring Team at ${job.employer},

I am writing to politely follow up on my previous application for the ${job.title} position at ${job.employer} in ${job.location}, submitted ${followUpEval.daysSinceApplied} days ago. I remain highly enthusiastic about the opportunity to bring my 5+ years of luxury hotel and high-volume cocktail & specialty coffee experience to your team.

As noted in your recruitment route ("${job.sponsorshipEvidence || 'Employer-sponsored work permit & visa support'}"), all of my international relocation and credential documents are ready for immediate processing, and I am available for a brief video interview at your convenience.

I have re-attached my CV and portfolio credentials for your review:
Google Drive Portfolio: https://drive.google.com/drive/folders/1xVPTeJLJjcyigLGltGfwQlWDw_F3GDVN

Thank you very much for your time and consideration.

Best regards,
Fazle Rabbi Boyati`
      : `Fazle Rabbi Boyati
Limassol Marina, Cyprus
+357 9550 2363 | fazle.rabbe.doc@gmail.com
LinkedIn: https://www.linkedin.com/in/fazle-rabbi-5785aa269

Dear Hiring Team at ${job.employer},

I am writing to express my strong interest in the ${job.title} vacancy at ${job.employer} in ${job.location}. With over five years of dedicated experience across luxury hotels, high-volume beachfront resorts, and premier cocktail bars, I am eager to contribute my beverage mastery and high-standard guest hospitality to your team.

I craft signature and classic cocktails with speed and precision, and I provide specialty coffee service with professional latte art. Furthermore, I am thoroughly skilled in stock management, hygiene standards (HACCP), and team collaboration, and I communicate fluently in English with international clientele.

I noted your sponsorship route: "${job.sponsorshipEvidence || 'Employer-sponsored work permit & visa support'}". I am fully prepared for international relocation and available for an immediate video interview via Zoom, Microsoft Teams, or WhatsApp at your convenience.

I have attached my updated CV and professional photographs. My full digital portfolio of cocktails and hospitality credentials is also accessible here:
Google Drive Portfolio: https://drive.google.com/drive/folders/1xVPTeJLJjcyigLGltGfwQlWDw_F3GDVN

Thank you for your consideration. I look forward to speaking with you.

Best regards,
Fazle Rabbi Boyati`;

    setCoverLetterText(letter);
  };

  // Customize cover letter & optional CV using Gemini inside the Apply Modal
  const handleCustomizeModalWithGemini = async () => {
    if (!selectedJob) return;
    setIsCustomizingWithGemini(true);
    try {
      const res = await generatePersonalizedCoverLetterWithGemini({
        company: selectedJob.employer,
        jobTitle: selectedJob.title,
        location: selectedJob.location,
        verifiedRequirements: `${selectedJob.sponsorshipEvidence || ''} | ${selectedJob.sourceNotes || ''}`,
        selectedCvId,
      });
      if (res.coverLetter) {
        setCoverLetterText(res.coverLetter);
        if (res.subjectLine) setEmailSubject(res.subjectLine);
        showToast(
          `Gemini customized your cover letter for ${selectedJob.employer} using your active CV (${res.cvUsedName})!`
        );
      }
    } catch (e: any) {
      showToast('Kept verified cover letter template.');
    } finally {
      setIsCustomizingWithGemini(false);
    }
  };

  // Submit application via connected Gmail with selected CV attachment and auto-replenishment
  const handleSendViaGmail = async () => {
    if (!selectedJob) return;

    const targetRecipient = (recipientOverride || selectedJob.recipientEmail || '').trim();
    if (!targetRecipient) {
      showToast('This employer requires direct application through their official careers portal, or enter a verified HR email.');
      if (selectedJob.applicationUrl) handleOpenOfficialPortal();
      return;
    }

    if (!selectedCvId) {
      showToast('CV Required: Please upload or select your CV from the CV Gallery before sending this application.');
      return;
    }

    const activeCv = cvLibrary.find(c => c.id === selectedCvId) || cvLibrary[0];
    if (!activeCv) {
      showToast('CV Required: No CV document found. Tap "Upload CV" to select your PDF/DOCX resume.');
      return;
    }

    // Check employer policy & 4-5 day follow-up rule before resending
    const followUpEval = evaluateSponsorshipJobFollowUpEligibility(selectedJob, appliedJobRecords);
    if (followUpEval.status === 'policy_restricted') {
      showToast(`Blocked by Employer Policy: ${followUpEval.employerPolicyNote}`);
      return;
    }
    if (followUpEval.status === 'cooldown_active') {
      showToast(`Duplicate Prevented: ${followUpEval.employerPolicyNote}`);
      return;
    }

    let token = getCachedGoogleToken();
    let isTokenValid = token ? await testGmailTokenValidity(token) : false;

    if (!token || !isTokenValid) {
      showToast('Connecting your Google Gmail account to authorize CV & Cover Letter dispatch...');
      const authRes = await signInWithGoogle();
      if (!authRes || !authRes.accessToken) {
        showToast('Needs Action: Gmail authorization is required to send applications via email.');
        return;
      }
      token = authRes.accessToken;
      isTokenValid = true;
    }

    setIsSubmitting(true);
    setLiveBatchStatusMap(prev => ({
      ...prev,
      [selectedJob.id]: { status: 'pending', message: 'Sending via Gmail API...' },
    }));

    try {
      const chosenPhotos = availablePhotos.filter(p => selectedPhotoIds.includes(p.id));
      const photoAttachments = chosenPhotos.map(p => ({
        filename: p.name,
        base64: p.base64 || '',
        mimeType: p.mimeType || 'image/jpeg',
      }));

      // Retrieve actual attached document payload (exact original uploaded file if uploaded CV is selected!)
      const cvPayload = getCVAttachmentPayload(selectedCvId);
      const docName = cvPayload.isUploadedFile
        ? `${activeCv.title} (Original File: ${cvPayload.filename})`
        : activeCv.title;

      const finalSubject = (emailSubject || `Application: ${selectedJob.title} — Fazle Rabbi Boyati`).trim();

      const res = await sendJobApplicationViaGmail({
        recipient: targetRecipient,
        subject: finalSubject,
        bodyText: coverLetterText,
        selectedCvId: activeCv.id,
        attachCoverLetterPdf: true,
        company: selectedJob.employer,
        position: selectedJob.title,
        location: selectedJob.location,
        jobId: selectedJob.id,
        cvTitle: docName,
        allowResend: followUpEval.isFollowUp,
        cvAttachment: cvPayload.base64
          ? {
              filename: cvPayload.filename,
              base64: cvPayload.base64,
              mimeType: cvPayload.mimeType,
            }
          : undefined,
        imageAttachments: photoAttachments,
      });

      if (res.success && res.messageId) {
        setLiveBatchStatusMap(prev => ({
          ...prev,
          [selectedJob.id]: {
            status: 'sent',
            messageId: res.messageId,
            cvFile: res.attachedCvFilename || cvPayload.filename,
            message: `Confirmed Sent (ID: ${res.messageId})`,
          },
        }));

        await submitApplicationToBackend({
          jobId: selectedJob.id,
          market: 'sponsorship',
          method: 'gmail',
          status: 'submitted',
          employer: selectedJob.employer,
          title: selectedJob.title,
          country: selectedJob.country,
          location: selectedJob.location,
          recipientEmail: targetRecipient,
          sourceUrl: selectedJob.originalJobUrl || selectedJob.applicationUrl,
          subject: finalSubject,
          cvId: activeCv.id,
          cvTitle: docName,
          coverLetter: coverLetterText,
          attachments: [
            cvPayload.filename,
            `Cover_Letter_${selectedJob.employer.replace(/[^\w]/g, '_')}.pdf`,
            ...photoAttachments.map(a => a.filename),
          ],
          gmailMessageId: res.messageId,
          notes: `Sent via Gmail (ID: ${res.messageId}) with ${
            cvPayload.isUploadedFile ? 'ORIGINAL UPLOADED CV' : 'Structured CV PDF'
          } [${cvPayload.filename}] + Cover Letter PDF`,
        });

        recordAppliedJob({
          job: { ...selectedJob, recipientEmail: targetRecipient },
          gmailMessageId: res.messageId,
          status: 'applied',
          cvId: activeCv.id,
          cvTitle: docName,
          subject: finalSubject,
          coverLetter: coverLetterText,
          sourceUrl: selectedJob.originalJobUrl || selectedJob.applicationUrl,
        });

        showToast(
          `Confirmed Sent to ${selectedJob.employer} (Message ID: ${res.messageId}) with attached CV "${cvPayload.filename}"!`
        );
        setSelectedJob(null);

        await loadBatch();
        await loadApplicationHistory();
      } else {
        const trackStatus: EmailTrackingStatus = res.trackingStatus || 'failed';
        setLiveBatchStatusMap(prev => ({
          ...prev,
          [selectedJob.id]: {
            status: trackStatus,
            message: res.error || 'Dispatch could not be confirmed',
          },
        }));
        throw new Error(res.error || 'Gmail dispatch failed');
      }
    } catch (err: any) {
      await submitApplicationToBackend({
        jobId: selectedJob.id,
        market: 'sponsorship',
        method: 'gmail',
        status: 'failed',
        employer: selectedJob.employer,
        title: selectedJob.title,
        country: selectedJob.country,
        location: selectedJob.location,
        recipientEmail: targetRecipient,
        sourceUrl: selectedJob.originalJobUrl || selectedJob.applicationUrl,
        subject: emailSubject,
        cvId: activeCv.id,
        cvTitle: activeCv.title,
        coverLetter: coverLetterText,
        errorReason: err.message || 'Transmission failed',
      });
      refreshTrackingStates();
      showToast(`Status tracked (${err.message || 'Error sending email'}). Application preserved for editing & retry.`);
      await loadBatch();
      await loadApplicationHistory();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Launch official external careers portal
  const handleOpenOfficialPortal = () => {
    if (!selectedJob) return;
    const destUrl = selectedJob.applicationUrl || selectedJob.originalJobUrl;
    if (!destUrl) {
      showToast('No external application URL recorded for this vacancy.');
      return;
    }
    window.open(destUrl, '_blank', 'noopener,noreferrer');
    setIsPortalModalOpen(true);
  };

  // Confirm portal application was submitted externally
  const handleConfirmPortalSubmission = async () => {
    if (!selectedJob) return;

    if (!selectedCvId) {
      showToast('CV Required: Please upload or select your CV from your phone before confirming application.');
      return;
    }

    const activeCv = cvLibrary.find(c => c.id === selectedCvId) || cvLibrary[0];
    const docName = activeCv.fileName ? `${activeCv.title} (${activeCv.fileName})` : activeCv.title;

    setIsSubmitting(true);
    try {
      await submitApplicationToBackend({
        jobId: selectedJob.id,
        market: 'sponsorship',
        method: 'portal',
        status: 'submitted',
        employer: selectedJob.employer,
        title: selectedJob.title,
        country: selectedJob.country,
        location: selectedJob.location,
        recipientEmail: selectedJob.recipientEmail,
        sourceUrl: selectedJob.applicationUrl || selectedJob.originalJobUrl,
        subject: emailSubject,
        cvId: activeCv.id,
        cvTitle: docName,
        coverLetter: coverLetterText,
        notes: `Submitted externally on official employer careers portal: ${selectedJob.applicationUrl || selectedJob.originalJobUrl}`,
      });

      recordAppliedJob({
        job: selectedJob,
        status: 'applied_portal',
        cvId: activeCv.id,
        cvTitle: docName,
        subject: emailSubject,
        coverLetter: coverLetterText,
        sourceUrl: selectedJob.applicationUrl || selectedJob.originalJobUrl,
      });

      showToast(`Confirmed! Application record saved in Application History for ${selectedJob.employer}. Replenishing visible vacancies...`);
      setIsPortalModalOpen(false);
      setSelectedJob(null);

      await loadBatch();
      await loadApplicationHistory();
    } catch (e: any) {
      showToast(e.message || 'Failed to update application status.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Controlled Batch Apply to Selected Vacancies within Gmail Limits
  const handleApplySelectedBatch = async () => {
    const selectedJobs = displayedBatch.filter(
      j => selectedBatchJobIds.has(j.id) && j.applicationStatus !== 'submitted' && Boolean(j.recipientEmail)
    );
    if (selectedJobs.length === 0) {
      showToast('Please select at least one vacancy with a verified email address to run controlled batch sending.');
      return;
    }

    if (!selectedCvId) {
      showToast('CV Required: Please upload or select a CV in the CV Gallery before running batch applications.');
      return;
    }

    const activeCv = cvLibrary.find(c => c.id === selectedCvId) || cvLibrary[0];
    let token = getCachedGoogleToken();
    const isTokenValid = token ? await testGmailTokenValidity(token) : false;

    if (!token || !isTokenValid) {
      showToast('Connecting Gmail account for controlled batch sending...');
      const authRes = await signInWithGoogle();
      if (!authRes || !authRes.accessToken) {
        showToast('Needs Action: Please authorize Gmail to run controlled batch applications.');
        return;
      }
      token = authRes.accessToken;
    }

    setIsSubmitting(true);
    const cvPayload = getCVAttachmentPayload(selectedCvId);
    const docName = cvPayload.isUploadedFile
      ? `${activeCv.title} (Original File: ${cvPayload.filename})`
      : activeCv.title;

    // Filter out any job restricted by cooldown (< 4 days) or employer policy
    const eligibleBatchItems = selectedJobs
      .filter(job => {
        const evalRes = evaluateSponsorshipJobFollowUpEligibility(job, appliedJobRecords);
        return evalRes.canApply;
      })
      .map(job => {
        const evalRes = evaluateSponsorshipJobFollowUpEligibility(job, appliedJobRecords);
        const letter = `Fazle Rabbi Boyati
Limassol Marina, Cyprus | +357 9550 2363 | fazle.rabbe.doc@gmail.com
LinkedIn: https://www.linkedin.com/in/fazle-rabbi-5785aa269

Dear Hiring Team at ${job.employer},

I am writing to express my strong interest in the ${job.title} vacancy in ${job.location}. With over 5 years of hospitality experience in luxury hotels and bars, I craft signature cocktails and specialty coffee, and communicate fluently with international guests. I am fully prepared for international relocation under your sponsorship route ("${job.sponsorshipEvidence || 'Work Permit'}").

Please find my attached CV (${cvPayload.filename}) and cover letter PDF for your consideration.

Best regards,
Fazle Rabbi Boyati`;

        return {
          id: job.id,
          jobId: job.id,
          recipient: job.recipientEmail,
          company: job.employer,
          position: job.title,
          location: job.location,
          subject: evalRes.isFollowUp
            ? `Follow-Up: ${job.title} Application — Fazle Rabbi Boyati`
            : masterSubjectTemplate.replace('{ROLE}', job.title).replace('{EMPLOYER}', job.employer),
          bodyText: letter,
          selectedCvId: activeCv.id,
          cvTitle: docName,
          attachCoverLetterPdf: true,
          allowResend: evalRes.isFollowUp,
        };
      });

    if (eligibleBatchItems.length === 0) {
      setIsSubmitting(false);
      showToast('Selected jobs were recently applied to (< 4 days ago). Wait for the 4–5 day follow-up window.');
      return;
    }

    showToast(
      `Dispatching controlled batch of ${eligibleBatchItems.length} application(s) with 4.2s rate-limit pacing and CV "${cvPayload.filename}"...`
    );

    const batchSummary = await sendApplicationsInControlledBatch({
      items: eligibleBatchItems,
      maxBatchSize: 5,
      delayBetweenEmailsMs: 4200,
      onItemStatusChange: update => {
        setLiveBatchStatusMap(prev => ({
          ...prev,
          [update.id]: {
            status: update.status,
            messageId: update.messageId,
            cvFile: update.attachedCvFilename,
            message:
              update.status === 'sent'
                ? `Sent (ID: ${update.messageId})`
                : update.status === 'pending'
                ? 'Dispatching within Gmail rate limits...'
                : update.error || update.status,
          },
        }));
      },
    });

    // Sync backend state for each sent item
    for (const item of eligibleBatchItems) {
      const r = batchSummary.results[item.id];
      const matchedJob = selectedJobs.find(j => j.id === item.id);
      if (r && r.success && r.messageId) {
        await submitApplicationToBackend({
          jobId: item.id,
          market: 'sponsorship',
          method: 'gmail',
          status: 'submitted',
          employer: item.company,
          title: item.position,
          country: matchedJob?.country || 'Europe',
          location: item.location,
          recipientEmail: item.recipient,
          sourceUrl: matchedJob?.originalJobUrl || matchedJob?.applicationUrl,
          subject: item.subject,
          cvId: activeCv.id,
          cvTitle: docName,
          coverLetter: item.bodyText,
          gmailMessageId: r.messageId,
          notes: `Controlled batch sent via Gmail (ID: ${r.messageId}) with CV [${cvPayload.filename}]`,
        });
      }
    }

    setIsSubmitting(false);
    refreshTrackingStates();
    await loadBatch();
    await loadApplicationHistory();

    showToast(
      `Batch complete: ${batchSummary.sentCount} Sent, ${batchSummary.rateLimitedCount} Blocked/Rate Limited, ${batchSummary.needsActionCount} Needs Action, ${batchSummary.failedCount} Failed.`
    );
  };

  // Controlled Test Email Delivery to user-controlled email address
  const handleSendControlledTestEmail = async () => {
    const dest = testDeliveryEmail.trim();
    if (!dest || !dest.includes('@')) {
      showToast('Please enter a valid email address you control to test delivery.');
      return;
    }
    let token = getCachedGoogleToken();
    const isValid = token ? await testGmailTokenValidity(token) : false;
    if (!token || !isValid) {
      const authRes = await signInWithGoogle();
      if (!authRes?.accessToken) {
        showToast('Please connect your Gmail account first to run a real delivery test.');
        return;
      }
      token = authRes.accessToken;
    }

    setIsTestingDelivery(true);
    setTestDeliveryMsg(null);
    try {
      const cvPayload = getCVAttachmentPayload(selectedCvId);
      const activeCv = cvLibrary.find(c => c.id === selectedCvId) || cvLibrary[0];
      const res = await GmailService.sendTestDeliveryEmail({
        testRecipientEmail: dest,
        subject: `Sponsorship CV & Cover Letter Verification — ${activeCv?.title || 'Fazle Rabbi'}`,
        body: masterCoverLetterTemplate || DEFAULT_MASTER_COVER_LETTER,
        selectedCvId,
        company: 'Sponsorship Test Verification',
        position: activeCv?.roleSubtitle || 'Hospitality & Mixology Specialist',
        location: 'Europe / Worldwide',
        attachCoverLetterPdf: true,
      });

      refreshTrackingStates();
      if (res.success && res.messageId) {
        setTestDeliveryMsg(
          `Confirmed Sent to ${dest}! Gmail Message ID: ${res.messageId} · Attached CV: ${
            res.attachedCvFilename || cvPayload.filename
          } (${cvPayload.isUploadedFile ? 'Exact Original Uploaded File' : 'Complete Multi-Section CV PDF'}) + Cover Letter PDF.`
        );
        showToast(`Verified delivery to ${dest} (Message ID: ${res.messageId})!`);
      } else {
        setTestDeliveryMsg(`Delivery test reported status [${res.trackingStatus || 'failed'}]: ${res.error}`);
      }
    } catch (e: any) {
      setTestDeliveryMsg(`Error: ${e.message || 'Test delivery failed'}`);
    } finally {
      setIsTestingDelivery(false);
    }
  };

  // Advance to next batch manually if desired
  const handleAdvanceNextBatch = async () => {
    setIsLoading(true);
    await advanceJobBatch('sponsorship');
    await loadBatch();
    setIsLoading(false);
    showToast('Advanced to the next 5 sponsorship vacancies.');
  };

  // Render transparent sponsorship evidence badge
  const renderSponsorshipBadge = (_level: string, evidence?: string, jobObj?: BackendJobRecord) => {
    const evalRes = evaluateHospitalitySponsorship({
      title: jobObj?.title || '',
      employer: jobObj?.employer || '',
      location: jobObj?.location || '',
      country: jobObj?.country || '',
      sponsorshipEvidence: evidence || jobObj?.sponsorshipEvidence,
      sourceNotes: jobObj?.sourceNotes,
      recipientEmail: jobObj?.recipientEmail,
      applicationUrl: jobObj?.applicationUrl,
    });
    const cat = evalRes.transparentCategory;
    if (cat === 'Confirmed by Official Evidence') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
          <ShieldCheck className="w-3 h-3 text-emerald-400" />
          <span>Confirmed by Official Evidence</span>
        </span>
      );
    }
    if (cat === 'Strong Evidence — Employer Confirmation Required') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-indigo-400" />
          <span>Strong Evidence — Employer Confirmation Required</span>
        </span>
      );
    }
    if (cat === 'Possible — Needs Verification') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
          <Plane className="w-3 h-3 text-amber-400" />
          <span>Possible — Needs Verification</span>
        </span>
      );
    }
    if (cat === 'Not Eligible') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
          <AlertCircle className="w-3 h-3 text-rose-400" />
          <span>Not Eligible</span>
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-slate-500/20 text-slate-300 border border-slate-500/30 flex items-center gap-1">
        <span>Not Mentioned</span>
      </span>
    );
  };

  // Render application lifecycle state tag
  const renderStateBadge = (state: string) => {
    switch (state) {
      case 'submitted':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-blue-400" />
            <span>Application Submitted</span>
          </span>
        );
      case 'failed':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-rose-400" />
            <span>Transmission Failed (Retry Ready)</span>
          </span>
        );
      case 'saved':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
            Saved
          </span>
        );
      case 'queued':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
            In Bulk Queue
          </span>
        );
      case 'new_eligible':
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            New & Eligible
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 p-4 rounded-2xl bg-slate-900 border border-purple-500/60 text-white text-xs shadow-2xl animate-fade-in flex items-center gap-2 max-w-md">
          <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div
        className={`p-6 rounded-3xl border transition-all ${
          theme === 'dark' ? 'bg-[#101524] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-bold shadow-lg shadow-purple-600/30">
              <Plane className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Global Job Sponsorship</h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Worldwide Isolated Market
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>5-Job Continuous Engine</span>
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Persistent worldwide hospitality opportunities with employer visa sponsorship (UK, UAE, Qatar, Canada, Australia, Switzerland, Malta). Completely isolated from Europe Market.
              </p>
            </div>
          </div>

          {/* Continuous Daemon & Batch Status Indicator */}
          <div className="flex items-center gap-3 flex-wrap self-end lg:self-auto">
            <div
              className={`p-3 rounded-2xl border text-xs flex items-center gap-3 ${
                theme === 'dark' ? 'bg-[#151c2e] border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
              </div>
              <div>
                <div className="font-bold text-[11px] text-purple-300">
                  Batch {batchData.currentBatchIndex + 1} ({batchSubmittedCount}/5 Applied)
                </div>
                <div className="text-[10px] text-slate-400">
                  {batchData.totalDiscovered} total worldwide vacancies indexed
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsCountryModalOpen(true)}
              className="px-3.5 py-2.5 rounded-2xl border border-purple-500/40 hover:bg-purple-500/10 text-purple-300 font-bold text-xs flex items-center gap-2 transition active:scale-95 shadow-sm"
              title="Configure country priority groups A, B, C & official immigration database"
            >
              <Globe className="w-3.5 h-3.5 text-purple-400" />
              <span>Country Priorities (A/B/C)</span>
            </button>

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

            <button
              type="button"
              onClick={() => loadBatch(true)}
              disabled={isLoading || isSearchingNew}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-2 transition active:scale-95 disabled:opacity-50 shadow-md shadow-purple-600/30"
              title="Query next available vacancies from worldwide sources"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading || isSearchingNew ? 'animate-spin' : ''}`} />
              <span>{isSearchingNew ? 'Discovering New...' : 'Scan Worldwide Jobs'}</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs: Active 5-Job Pipeline, Central CV Gallery & Studio, Gmail Delivery Tracker, Application History */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-b border-slate-800/80 pb-3">
          <button
            type="button"
            onClick={() => setViewTab('active')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              viewTab === 'active'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Plane className="w-3.5 h-3.5" />
            <span>Active Sponsorship Vacancies ({displayedBatch.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setViewTab('cv_gallery');
              refreshTrackingStates();
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              viewTab === 'cv_gallery'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Central CV Gallery & Cover Letter Studio ({cvLibrary.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setViewTab('email_tracker');
              refreshTrackingStates();
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              viewTab === 'email_tracker'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Gmail Delivery & Status Tracker ({emailHistoryRecords.length})</span>
            {Object.keys(preservedFailedMap).length > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-black">
                {Object.keys(preservedFailedMap).length} Retry Ready
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setViewTab('history');
              loadApplicationHistory();
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              viewTab === 'history'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Follow-Up & History ({appliedJobRecords.length || appHistory.length})</span>
          </button>
        </div>

        {/* Daily Background Discovery & Gemini Primary Status Bar */}
        <div className="mt-4 p-3.5 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold text-[10px] uppercase">
              Primary AI: Gemini Active
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700 text-[10px]">
              OpenAI & Grok: Preserved (Inactive)
            </span>
            <span className="text-slate-300">
              Active CV:{' '}
              <strong className="text-amber-300">
                {cvLibrary.find(c => c.id === selectedCvId)?.title || 'Default CV'}
              </strong>{' '}
              ({cvLibrary.find(c => c.id === selectedCvId)?.isUploadedFile ? 'Original Uploaded File Attached Verbatim' : 'Complete Structured CV PDF'})
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-300">
              Last Verified Search:{' '}
              <strong className="text-indigo-300">
                {schedulerStatus?.lastSuccessfulSearchTime
                  ? new Date(schedulerStatus.lastSuccessfulSearchTime).toLocaleString()
                  : batchData.lastSearchTime}
              </strong>
            </span>
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-indigo-200 cursor-pointer">
            <input
              type="checkbox"
              checked={showFollowUpEligibleOnly}
              onChange={e => setShowFollowUpEligibleOnly(e.target.checked)}
              className="rounded accent-purple-600"
            />
            <span>Show Only 4–5 Day Follow-Up Eligible Jobs</span>
          </label>
        </div>

        {/* Filters */}
        {viewTab === 'active' && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Search Any Role, Employer, or Visa Route
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  placeholder="Bartender, Chef, Nurse, IT, Fairmont, Decreto Flussi..."
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
                Destination / Priority Group
              </label>
              <select
                value={selectedRegion}
                onChange={e => setSelectedRegion(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl text-xs border ${
                  theme === 'dark' ? 'bg-[#161d2d] border-slate-800 text-white' : 'bg-white border-slate-300'
                }`}
              >
                <option value="all">🌍 All Worldwide Destinations</option>
                <optgroup label="Priority Group 1 (A) — Highest Search Priority">
                  <option value="Poland">1. 🇵🇱 Poland (Type A / Type S Work Permit)</option>
                  <option value="Portugal">2. 🇵🇹 Portugal (Visto D1 / Seasonal Hospitality)</option>
                  <option value="Croatia">3. 🇭🇷 Croatia (MUP Stay & Work Permit)</option>
                  <option value="Netherlands">4. 🇳🇱 Netherlands (GVVA Single Permit)</option>
                  <option value="Malta">5. 🇲🇹 Malta (Single Permit + ITS Skills Pass)</option>
                  <option value="Spain">6. 🇪🇸 Spain (GECCO / Seasonal Authorization)</option>
                  <option value="Luxembourg">7. 🇱🇺 Luxembourg (ADEM Third-Country Permit)</option>
                </optgroup>
                <optgroup label="Priority Group 2 (B) — International Destinations">
                  <option value="United Kingdom — England">8. 🏴󠁧󠁢󠁥󠁮󠁧󠁿 United Kingdom — England (Skilled Worker CoS)</option>
                  <option value="United Kingdom — Scotland">9. 🏴󠁧󠁢󠁳󠁣󠁴󠁿 United Kingdom — Scotland (Skilled Worker CoS)</option>
                  <option value="Australia">10. 🇦🇺 Australia (Subclass 482 / 494 / DAMA)</option>
                  <option value="New Zealand">11. 🇳🇿 New Zealand (AEWV Accredited Employer)</option>
                </optgroup>
                <optgroup label="Priority Group 3 (C) — Additional European & Global">
                  <option value="Italy">🇮🇹 Italy (Decreto Flussi Quota)</option>
                  <option value="Greece">🇬🇷 Greece (Law 5038/2023 Metaklisi)</option>
                  <option value="Belgium">🇧🇪 Belgium (Single Permit Authorization)</option>
                  <option value="Switzerland">🇨🇭 Switzerland (Cantonal L/B Permit)</option>
                  <option value="Germany">🇩🇪 Germany (Skilled Immigration §18a/18b)</option>
                  <option value="Austria">🇦🇹 Austria (§ 5 AuslBG Seasonal)</option>
                  <option value="Romania">🇷🇴 Romania (IGI Aviz de Angajare)</option>
                </optgroup>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Transparent Sponsorship Category
              </label>
              <select
                value={selectedSponsorshipLevel}
                onChange={e => setSelectedSponsorshipLevel(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl text-xs border ${
                  theme === 'dark' ? 'bg-[#161d2d] border-slate-800 text-white' : 'bg-white border-slate-300'
                }`}
              >
                <option value="all">All Transparent Evidence Categories</option>
                <option value="Confirmed by Official Evidence">Confirmed by Official Evidence</option>
                <option value="Strong Evidence — Employer Confirmation Required">Strong Evidence — Employer Confirmation Required</option>
                <option value="Possible — Needs Verification">Possible — Needs Verification</option>
                <option value="Not Mentioned">Not Mentioned</option>
                <option value="Not Eligible">Not Eligible</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Industry & Accommodation
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={selectedIndustry}
                  onChange={e => setSelectedIndustry(e.target.value)}
                  className={`flex-1 px-2.5 py-2 rounded-xl text-xs border ${
                    theme === 'dark' ? 'bg-[#161d2d] border-slate-800 text-white' : 'bg-white border-slate-300'
                  }`}
                >
                  <option value="all">All Industries</option>
                  <option value="Hospitality">Hospitality & Mixology</option>
                  <option value="Hotel">Hotel & Resort Operations</option>
                  <option value="Culinary">Culinary & Kitchen</option>
                  <option value="Technology">Technology & Engineering</option>
                  <option value="Healthcare">Healthcare & Caregiving</option>
                  <option value="Logistics">Logistics & Supply Chain</option>
                  <option value="Skilled Trades">Skilled Trades & Technical</option>
                  <option value="Business">Business & Operations</option>
                </select>
                <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={accommodationOnly}
                    onChange={e => setAccommodationOnly(e.target.checked)}
                    className="rounded accent-purple-600"
                  />
                  <span>Housing</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Integrated Python-First + Gemini Hybrid JobHunter Automation Engine */}
      {viewTab === 'active' && (
        <PythonHybridAgentPanel
          selectedCvId={selectedCvId}
          onShowToast={showToast}
          onSelectCompanyForEmailApply={(comp) => {
            const nowIso = new Date().toISOString();
            const syntheticJob: BackendJobRecord = {
              id: `py_hybrid_${comp.employer.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
              canonicalKey: `py_hybrid_${comp.employer.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
              market: 'sponsorship',
              title: comp.title,
              position: comp.title,
              employer: comp.employer,
              company: comp.employer,
              city: comp.city,
              location: `${comp.city}, ${comp.country}`,
              country: comp.country,
              recipientEmail: comp.recipientEmail,
              emailVerificationStatus: 'verified',
              originalJobUrl: comp.sourceUrl,
              applicationUrl: comp.sourceUrl,
              sourceUrl: comp.sourceUrl,
              sponsorshipStatus: 'confirmed',
              sponsorshipEvidence: comp.sponsorshipEvidence,
              sourceName: 'Python-First Hybrid JobHunter Engine',
              sourceNotes: comp.sponsorshipEvidence,
              postingDate: nowIso.split('T')[0],
              firstDiscoveredDate: nowIso,
              discoveredAt: nowIso,
              jobStatus: 'active',
              applicationMethod: 'both',
              applicationStatus: 'new_eligible',
              status: 'unapplied',
            } as unknown as BackendJobRecord;
            setSelectedJob(syntheticJob);
            setRecipientOverride(comp.recipientEmail);
            setEmailSubject(comp.subject);
            setCoverLetterText(comp.body);
          }}
        />
      )}

      {/* =================================================================
          TAB: CENTRAL CV GALLERY, UPLOADED FILES & COVER LETTER STUDIO
          ================================================================= */}
      {viewTab === 'cv_gallery' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Uploaded & Structured CV Gallery */}
            <div className="lg:col-span-6 space-y-4">
              <div
                className={`p-5 rounded-3xl border space-y-4 ${
                  theme === 'dark' ? 'bg-[#101524] border-slate-800' : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <FileText className="w-4 h-4 text-purple-400" />
                      <span>Central CV Gallery ({cvLibrary.length} Saved CVs)</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Uploaded CVs (.pdf, .docx, .doc) are attached as the exact original binary file—never replaced by a partial PDF.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => phoneFileInputRef.current?.click()}
                    disabled={isUploadingCv}
                    className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isUploadingCv ? 'Uploading...' : 'Upload Original CV'}</span>
                  </button>
                </div>

                <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                  {cvLibrary.map(cv => {
                    const isSelected = cv.id === selectedCvId;
                    const isUploaded = Boolean(cv.isUploadedFile && (cv.fileBase64 || cv.fileDataUri));
                    return (
                      <div
                        key={cv.id}
                        className={`p-3.5 rounded-2xl border transition ${
                          isSelected
                            ? 'bg-purple-600/15 border-purple-500/60'
                            : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div
                            onClick={() => handleSelectActiveCv(cv.id)}
                            className="cursor-pointer flex-1"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-xs text-white">{cv.title}</span>
                              {isSelected && (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-black uppercase">
                                  Active for Sponsorship
                                </span>
                              )}
                              <span
                                className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                                  isUploaded
                                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                }`}
                              >
                                {isUploaded
                                  ? `Original Uploaded ${cv.fileType?.toUpperCase() || 'File'}`
                                  : 'Complete Multi-Section CV PDF'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-1">
                              {cv.fileName ? `${cv.fileName} (${cv.fileSizeBytesFormatted || 'Original File'})` : cv.roleSubtitle}
                              {' · '}Candidate: <strong className="text-slate-200">{cv.data?.fullName || 'Fazle Rabbi Boyati'}</strong>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleOpenCvPreview(cv)}
                              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 transition"
                            >
                              <Eye className="w-3.5 h-3.5 text-blue-400" />
                              <span>Preview</span>
                            </button>
                            {!isSelected && (
                              <button
                                type="button"
                                onClick={() => handleSelectActiveCv(cv.id)}
                                className="px-2.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold transition"
                              >
                                Select
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* On-Demand Gemini CV Customizer (only generates when user requests) */}
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <div className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    <span>On-Demand Gemini CV Customizer (Full Profile & Experience Preserved)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={customRoleInput}
                      onChange={e => setCustomRoleInput(e.target.value)}
                      placeholder="Target Role (e.g. Head Bartender)"
                      className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                    <input
                      type="text"
                      value={customEmployerInput}
                      onChange={e => setCustomEmployerInput(e.target.value)}
                      placeholder="Optional Employer (e.g. Fairmont)"
                      className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleGenerateCustomizedCvWithGemini(customRoleInput, customEmployerInput)}
                    disabled={isGeneratingGalleryCv}
                    className="w-full py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {isGeneratingGalleryCv
                        ? 'Gemini Generating Complete Tailored CV...'
                        : 'Generate Complete Role-Tailored CV & Preview'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Master Email Subject & Cover Letter Studio */}
            <div className="lg:col-span-6 space-y-4">
              <div
                className={`p-5 rounded-3xl border space-y-4 ${
                  theme === 'dark' ? 'bg-[#101524] border-slate-800' : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <h3 className="text-base font-bold text-white">
                      Email Subject & Cover Letter Studio
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Configure default email subjects and cover letters for individual & batch sponsorship applications.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        localStorage.setItem('sponsorship_master_cover_letter_v1', masterCoverLetterTemplate);
                        showToast('Saved default cover letter & subject templates for Sponsorship applications.');
                      } catch {
                        // ignore
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Save Studio Template</span>
                  </button>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                    Default Email Subject Template (Supports {'{ROLE}'} and {'{EMPLOYER}'})
                  </label>
                  <input
                    type="text"
                    value={masterSubjectTemplate}
                    onChange={e => setMasterSubjectTemplate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                    Master Sponsorship Cover Letter Template
                  </label>
                  <textarea
                    rows={12}
                    value={masterCoverLetterTemplate}
                    onChange={e => setMasterCoverLetterTemplate(e.target.value)}
                    className="w-full p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 font-mono leading-relaxed"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================
          TAB: GMAIL DELIVERY, RATE LIMITS & PRESERVED FAILED APPLICATIONS
          ================================================================= */}
      {viewTab === 'email_tracker' && (
        <div className="space-y-5">
          {/* Granular Status Breakdown */}
          {(() => {
            const sentCount = emailHistoryRecords.filter(r => r.status === 'sent').length;
            const pendingCount = emailHistoryRecords.filter(r => r.status === 'pending').length;
            const rateLimitedCount = emailHistoryRecords.filter(r => r.status === 'blocked_rate_limited').length;
            const needsActionCount = emailHistoryRecords.filter(r => r.status === 'needs_action').length;
            const failedCount = emailHistoryRecords.filter(r => r.status === 'failed').length;

            return (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-950/20">
                  <div className="text-[11px] font-bold text-emerald-300 uppercase">Sent (Confirmed)</div>
                  <div className="text-2xl font-black text-white mt-1">{sentCount}</div>
                  <div className="text-[10px] text-slate-400">Verified Gmail Message ID</div>
                </div>
                <div className="p-4 rounded-2xl border border-sky-500/30 bg-sky-950/20">
                  <div className="text-[11px] font-bold text-sky-300 uppercase">Pending</div>
                  <div className="text-2xl font-black text-white mt-1">{pendingCount}</div>
                  <div className="text-[10px] text-slate-400">In controlled batch queue</div>
                </div>
                <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-950/20">
                  <div className="text-[11px] font-bold text-amber-300 uppercase">Blocked / Rate Limited</div>
                  <div className="text-2xl font-black text-white mt-1">{rateLimitedCount}</div>
                  <div className="text-[10px] text-slate-400">Quota cooldown · OAuth kept</div>
                </div>
                <div className="p-4 rounded-2xl border border-purple-500/30 bg-purple-950/20">
                  <div className="text-[11px] font-bold text-purple-300 uppercase">Needs Action</div>
                  <div className="text-2xl font-black text-white mt-1">{needsActionCount}</div>
                  <div className="text-[10px] text-slate-400">Check recipient or re-auth</div>
                </div>
                <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-950/20">
                  <div className="text-[11px] font-bold text-rose-300 uppercase">Failed (Preserved)</div>
                  <div className="text-2xl font-black text-white mt-1">{failedCount}</div>
                  <div className="text-[10px] text-slate-400">Ready for safe manual retry</div>
                </div>
              </div>
            );
          })()}

          {/* Controlled Real Test Email Verification Box */}
          <div className="p-5 rounded-3xl border border-indigo-500/30 bg-indigo-950/20 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Real Gmail Delivery & CV Attachment Test (To Your Controlled Email)</span>
                </h4>
                <p className="text-xs text-slate-300 mt-0.5">
                  Send a real verification email with your currently selected CV ({cvLibrary.find(c => c.id === selectedCvId)?.title || 'Default CV'}) and Cover Letter PDF to verify exact file attachment and Gmail API delivery.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="email"
                  value={testDeliveryEmail}
                  onChange={e => setTestDeliveryEmail(e.target.value)}
                  placeholder="Your email address"
                  className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono w-56"
                />
                <button
                  type="button"
                  onClick={handleSendControlledTestEmail}
                  disabled={isTestingDelivery}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isTestingDelivery ? 'Verifying via Gmail...' : 'Send Real Test Email'}</span>
                </button>
              </div>
            </div>
            {testDeliveryMsg && (
              <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-emerald-300 font-mono">
                {testDeliveryMsg}
              </div>
            )}
          </div>

          {/* Preserved Failed / Rate Limited / Needs Action Applications */}
          {Object.values(preservedFailedMap).length > 0 && (
            <div className="p-5 rounded-3xl border border-rose-500/30 bg-rose-950/10 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>Preserved Applications Ready for Correction & Safe Retry ({Object.values(preservedFailedMap).length})</span>
                </h4>
                <span className="text-xs text-slate-400">
                  Never auto-retried blindly — click Correct & Retry to review and resend safely
                </span>
              </div>

              <div className="space-y-2.5">
                {Object.values(preservedFailedMap).map(draft => (
                  <div
                    key={draft.jobId}
                    className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-white">{draft.position}</span>
                        <span className="text-xs text-slate-400">at {draft.company}</span>
                        <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold uppercase">
                          {draft.trackingStatus || 'failed'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-300">
                        Recipient: <span className="font-mono text-blue-300">{draft.recipient || '(missing email)'}</span> · CV: <span className="text-slate-200">{draft.cvFilename || 'Selected CV'}</span>
                      </div>
                      <div className="text-[11px] text-rose-300">
                        Diagnostic: {draft.lastError}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const matchingJob =
                            batchData.batch.find(j => j.id === draft.jobId) ||
                            allSponsorshipPool.find(j => j.id === draft.jobId) || {
                              id: draft.jobId,
                              title: draft.position,
                              employer: draft.company,
                              location: draft.location || 'International',
                              country: draft.location || 'International',
                              city: '',
                              market: 'sponsorship',
                              recipientEmail: draft.recipient,
                              sponsorshipStatus: 'Strong Evidence — Employer Confirmation Required',
                              sponsorshipEvidence: 'Preserved Sponsorship Application Retry',
                              applicationStatus: 'failed',
                              discoveredAt: Date.now(),
                              updatedAt: Date.now(),
                            };
                          handleOpenApply(matchingJob as BackendJobRecord, draft);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Correct & Retry</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          removePreservedFailedApplication({
                            jobId: draft.jobId,
                            recipient: draft.recipient,
                            company: draft.company,
                            position: draft.position,
                          });
                          refreshTrackingStates();
                        }}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Individual Email Status Log */}
          <div
            className={`p-5 rounded-3xl border space-y-3 ${
              theme === 'dark' ? 'bg-[#101524] border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <h4 className="text-sm font-bold text-white">
              Individual Gmail Dispatch Log ({emailHistoryRecords.length})
            </h4>
            {emailHistoryRecords.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                No Gmail dispatches recorded yet.
              </p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {emailHistoryRecords.slice(0, 40).map(rec => (
                  <div
                    key={rec.id}
                    className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white">{rec.position}</span>
                        <span className="text-slate-400">· {rec.company}</span>
                        <span className="font-mono text-[11px] text-blue-300">&lt;{rec.recipient}&gt;</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        CV Attached: <span className="text-slate-200">{rec.cvTitle || 'CV'}</span>
                        {rec.messageId ? ` · Gmail ID: ${rec.messageId}` : ''}
                        {rec.errorReason ? ` · Reason: ${rec.errorReason}` : ''}
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase shrink-0 ${
                        rec.status === 'sent'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : rec.status === 'pending'
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                          : rec.status === 'blocked_rate_limited'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : rec.status === 'needs_action'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      }`}
                    >
                      {rec.status === 'sent'
                        ? 'Sent'
                        : rec.status === 'pending'
                        ? 'Pending'
                        : rec.status === 'blocked_rate_limited'
                        ? 'Blocked / Rate Limited'
                        : rec.status === 'needs_action'
                        ? 'Needs Action'
                        : 'Failed'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bulk Action Bar when jobs are checked */}
      {viewTab === 'active' && selectedBatchJobIds.size > 0 && (
        <div className="p-3 rounded-2xl bg-gradient-to-r from-purple-900/30 via-indigo-900/30 to-blue-900/30 border border-purple-500/40 flex items-center justify-between gap-3 flex-wrap shadow-sm">
          <div className="flex items-center gap-2 text-xs text-purple-200">
            <CheckSquare className="w-4 h-4 text-purple-400 shrink-0" />
            <span>
              <strong>{selectedBatchJobIds.size}</strong> vacancies selected for controlled batch delivery (4.2s pacing within Gmail limits)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleApplySelectedBatch}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-purple-600/30 disabled:opacity-50 transition active:scale-95"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Sending Controlled Batch...' : `Send Controlled Batch (${selectedBatchJobIds.size}) via Gmail`}</span>
            </button>
          </div>
        </div>
      )}

      {/* 5-Job Current Batch Display Header */}
      {viewTab === 'active' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1 text-xs text-slate-400">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-white text-sm">
              Current Batch: {displayedBatch.length} Eligible Vacancies
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-emerald-400 font-semibold">
              {batchSubmittedCount} of 5 Applied
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-purple-300 font-medium text-[11px]">
              Fresh opportunities prioritized · Unanswered jobs reappear after 4–5 days
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAdvanceNextBatch}
              className="px-3 py-1.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white transition flex items-center gap-1.5"
              title="Advance and display the next batch of 5 jobs"
            >
              <span>Retrieve Next Batch of 5</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Vacancies in Current Batch */}
      {viewTab === 'active' && (
        <div className="space-y-4">
        {displayedBatch.map((job, idx) => {
          const isSubmitted = job.applicationStatus === 'submitted';
          const isFailed = job.applicationStatus === 'failed';

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
                    <label className="cursor-pointer flex items-center pr-1" title="Select for batch application">
                      <input
                        type="checkbox"
                        checked={selectedBatchJobIds.has(job.id)}
                        onChange={(e) => {
                          const next = new Set(selectedBatchJobIds);
                          if (e.target.checked) {
                            next.add(job.id);
                          } else {
                            next.delete(job.id);
                          }
                          setSelectedBatchJobIds(next);
                        }}
                        className="w-4 h-4 rounded text-purple-600 accent-purple-600 focus:ring-purple-500 cursor-pointer"
                      />
                    </label>
                    <span className="text-xs font-mono font-bold text-purple-400/80">
                      #{idx + 1}
                    </span>
                    <h3 className="text-base sm:text-lg font-bold text-white">{job.employer}</h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      {job.country}
                    </span>
                    {renderSponsorshipBadge(job.sponsorshipStatus, job.sponsorshipEvidence, job)}
                    {renderStateBadge(job.applicationStatus)}
                  </div>

                  <div className="text-sm font-semibold text-slate-200 flex items-center gap-2 flex-wrap">
                    <span>{job.title}</span>
                    <span className="text-slate-600">·</span>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      {job.location}
                    </span>
                    {job.recipientEmail && (
                      <>
                        <span className="text-slate-600">·</span>
                        <span className="text-xs text-blue-400 flex items-center gap-1 font-mono">
                          <Mail className="w-3 h-3 text-blue-400" />
                          {job.recipientEmail}
                        </span>
                      </>
                    )}
                  </div>

                  {(() => {
                    const evalResult = evaluateHospitalitySponsorship({
                      title: job.title,
                      employer: job.employer,
                      location: job.location,
                      country: job.country,
                      city: job.city,
                      sourceNotes: job.sourceNotes,
                      sponsorshipEvidence: job.sponsorshipEvidence,
                      applicationUrl: job.applicationUrl,
                      recipientEmail: job.recipientEmail,
                    });

                    return (
                      <div className="space-y-2 pt-1">
                        {/* Intelligence Badge Line */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2.5 py-1 rounded-xl text-[11px] font-black border flex items-center gap-1 ${
                              evalResult.sponsorshipScore >= 75
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : evalResult.sponsorshipScore >= 50
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Sponsorship Score: {evalResult.sponsorshipScore}/100</span>
                          </span>

                          <span className="px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                            Route: {evalResult.visaRouteDetected}
                          </span>

                          {evalResult.accommodationIncluded && (
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                              🏠 Staff Housing / Accommodation
                            </span>
                          )}

                          {evalResult.skillsPassMandatory && (
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              ⭐ ITS Skills Pass Required
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              const prof = getCountryProfileById(job.country);
                              if (prof) setInspectCountry(prof);
                              else setIsCountryModalOpen(true);
                            }}
                            className="px-2.5 py-1 rounded-xl border border-slate-700 hover:border-purple-500/40 text-[11px] text-slate-300 hover:text-purple-300 transition flex items-center gap-1"
                            title="Inspect official immigration rules & quota decrees for this country"
                          >
                            <BookOpen className="w-3 h-3 text-purple-400" />
                            <span>Immigration Profile</span>
                          </button>
                        </div>

                        {/* Evidence Quote */}
                        {job.sponsorshipEvidence && (
                          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs text-purple-200 flex items-start gap-2 max-w-3xl">
                            <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                            <div>
                              <strong>Verified Sponsorship Evidence:</strong> "{job.sponsorshipEvidence}"
                              <div className="text-[11px] text-slate-300 mt-0.5">
                                Feasibility for Bangladeshi Passport: <strong>{evalResult.bangladeshiPassportFeasibility}</strong> — {evalResult.feasibilityExplanation}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
                    {job.sourceNotes || 'Verified active establishment through continuous background search engine.'}
                  </p>

                  {/* Application History Indicator */}
                  {job.applicationHistory && job.applicationHistory.length > 0 && (
                    <div className="text-[11px] text-slate-400 pt-1 flex items-center gap-2 flex-wrap">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>
                        Last action: {new Date(job.applicationHistory[0].timestamp).toLocaleString()} ({job.applicationHistory[0].method === 'gmail' ? 'Gmail' : 'Portal'}) — Status: <strong>{job.applicationHistory[0].status}</strong>
                      </span>
                    </div>
                  )}
                </div>

                {/* Independent Actions (Requirement 4: Never redirects to Europe Job Market!) */}
                <div className="flex items-center gap-2.5 shrink-0 self-end lg:self-auto flex-wrap">
                  {isSubmitted ? (
                    <div className="flex items-center gap-2">
                      <span className="px-3.5 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Submitted</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenApply(job)}
                        className="px-3 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold"
                        title="Re-open details or send updated materials"
                      >
                        Re-apply
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleOpenApply(job)}
                        className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-purple-600/30"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>Apply (CV & Letter)</span>
                      </button>

                      {job.applicationUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedJob(job);
                            handleOpenOfficialPortal();
                          }}
                          className="px-3.5 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition"
                          title="Open official employer career application form directly"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                          <span>Official Portal</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDismissJob(job.id, job.employer)}
                        className="px-2.5 py-2.5 rounded-xl border border-slate-700/80 hover:border-red-500/40 hover:bg-red-500/10 text-slate-400 hover:text-red-300 text-xs font-semibold flex items-center gap-1 transition"
                        title="Dismiss vacancy (will not be shown again) and immediately replenish next opportunity"
                      >
                        <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                        <span>Dismiss</span>
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
            <Plane className="w-12 h-12 mx-auto text-slate-600" />
            <div className="text-base font-bold text-white">Batch Completed or In Discovery</div>
            <p className="text-xs max-w-md mx-auto">
              All vacancies in the current batch have been processed. Querying the backend persistent database for the next batch of 5 sponsorship opportunities.
            </p>
            <button
              type="button"
              onClick={() => loadBatch(true)}
              className="px-5 py-2.5 rounded-xl bg-purple-600 text-white font-bold text-xs shadow-lg shadow-purple-600/30"
            >
              Trigger Discovery of Next Batch
            </button>
          </div>
        )}
        </div>
      )}

      {/* Application History & 4-5 Day Reappearance View */}
      {viewTab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1 text-xs text-slate-400 flex-wrap gap-2">
            <div>
              <span className="font-bold text-white text-sm">
                Complete Application History & 4–5 Day Reappearance Controls ({appliedJobRecords.length || appHistory.length})
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Jobs without an employer response become eligible to reappear after 4–5 days for polite follow-up.
              </p>
            </div>
            <button
              type="button"
              onClick={loadApplicationHistory}
              className="text-xs text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
              <span>Refresh History</span>
            </button>
          </div>

          {appliedJobRecords.length > 0 && (
            <div className="space-y-3">
              {appliedJobRecords.map(rec => {
                const daysElapsed = Math.floor((Date.now() - rec.appliedAt) / (24 * 60 * 60 * 1000));
                const isFollowUpReady = daysElapsed >= 4 && !rec.employerResponded;
                return (
                  <div
                    key={rec.id}
                    className={`p-4 rounded-3xl border ${
                      theme === 'dark' ? 'bg-[#101524] border-slate-800' : 'bg-white border-slate-200'
                    } flex flex-col md:flex-row md:items-center justify-between gap-3`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-sm">{rec.position}</span>
                        <span className="text-xs text-purple-300 font-semibold">at {rec.company}</span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-bold">
                          {rec.submissionCount || 1} Submission(s)
                        </span>
                        {isFollowUpReady ? (
                          <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[10px] font-black uppercase">
                            4–5 Day Follow-Up Eligible ({daysElapsed}d elapsed)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                            Applied {daysElapsed}d ago (Hidden from search until Day 4)
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">
                        Recipient: <span className="font-mono text-blue-300">{rec.email || 'Portal'}</span> · CV Used: <span className="text-slate-200">{rec.cvTitle || 'Default CV'}</span> · Date: {new Date(rec.appliedAt).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {daysElapsed < 4 && (
                        <button
                          type="button"
                          onClick={() => {
                            simulateSponsorshipFollowUpWindow(rec.jobId, 5);
                            refreshTrackingStates();
                            showToast(`Simulated 5 days elapsed for ${rec.company}. It is now eligible for follow-up reappearance!`);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 text-xs font-bold transition cursor-pointer"
                        >
                          Simulate 5 Days Elapsed
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {appHistory.length === 0 && appliedJobRecords.length === 0 ? (
            <div className="text-center py-14 rounded-3xl border border-dashed border-slate-800 text-slate-400 space-y-3">
              <Clock className="w-12 h-12 mx-auto text-slate-600" />
              <div className="text-base font-bold text-white">No Application Records Yet</div>
              <p className="text-xs max-w-md mx-auto">
                Applications you submit via connected Gmail or confirm through official employer careers portals will be permanently recorded here with full delivery receipts.
              </p>
              <button
                type="button"
                onClick={() => setViewTab('active')}
                className="px-5 py-2.5 rounded-xl bg-purple-600 text-white font-bold text-xs shadow-lg shadow-purple-600/30"
              >
                Go to Active Vacancies
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
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      {item.country}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>{item.applicationStatus === 'submitted' ? 'Application Submitted' : item.applicationStatus}</span>
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">ID: {item.id}</span>
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
                      <span>Method: <strong className="uppercase text-purple-300">{item.applicationHistory[0].method}</strong></span>
                      <span className="text-slate-600">•</span>
                      <span>Dispatched: <strong>{new Date(item.applicationHistory[0].timestamp).toLocaleString()}</strong></span>
                      {item.applicationHistory[0].cvTitle && (
                        <>
                          <span className="text-slate-600">•</span>
                          <span>CV: <strong className="text-blue-300">{item.applicationHistory[0].cvTitle}</strong></span>
                        </>
                      )}
                    </div>
                    {item.applicationHistory[0].gmailMessageId && (
                      <div className="text-[11px] text-slate-400 font-mono">
                        Gmail Message ID: <span className="text-slate-300">{item.applicationHistory[0].gmailMessageId}</span>
                      </div>
                    )}
                    {item.applicationHistory[0].notes && (
                      <div className="text-[11px] text-slate-400 italic">
                        {item.applicationHistory[0].notes}
                      </div>
                    )}
                    {(item.originalJobUrl || item.applicationUrl) && (
                      <div className="text-[11px] pt-1">
                        <a
                          href={item.originalJobUrl || item.applicationUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-400 hover:underline inline-flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Source URL: {item.originalJobUrl || item.applicationUrl}</span>
                        </a>
                      </div>
                    )}
                    {(item.lastUsedCoverLetter || item.applicationHistory[0].coverLetter) && (
                      <details className="pt-1 text-[11px] text-slate-300">
                        <summary className="cursor-pointer font-semibold text-purple-300">
                          View Stored Cover Letter
                        </summary>
                        <pre className="mt-1.5 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 whitespace-pre-wrap font-mono text-[10px] text-slate-300 max-h-40 overflow-y-auto">
                          {item.lastUsedCoverLetter || item.applicationHistory[0].coverLetter}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ========================================================
          DEDICATED INDEPENDENT SPONSORSHIP APPLICATION MODAL
          ======================================================== */}
      {selectedJob && !isPortalModalOpen && (
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
                  <span className="text-xs font-mono font-bold text-purple-400">ID: {selectedJob.id}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Sponsorship Application
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white mt-1">
                  Apply for {selectedJob.title} at {selectedJob.employer}
                </h3>
                <p className="text-xs text-slate-400">
                  {selectedJob.location} · {selectedJob.country}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedJob(null)}
                className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Employer Policy & Previous Submission Check Banner */}
            {(() => {
              const followUpCheck = evaluateSponsorshipJobFollowUpEligibility(selectedJob, appliedJobRecords);
              return (
                <div
                  className={`p-3.5 rounded-2xl border text-xs space-y-1 ${
                    followUpCheck.status === 'policy_restricted'
                      ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                      : followUpCheck.status === 'followup_ready'
                      ? 'bg-indigo-950/40 border-indigo-500/40 text-indigo-200'
                      : 'bg-purple-500/10 border-purple-500/30 text-purple-200'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-purple-400" />
                      <span>Employer Policy & Submission Check</span>
                    </span>
                    <span className="text-[10px] uppercase font-black">
                      {followUpCheck.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300">
                    {followUpCheck.employerPolicyNote}
                  </div>
                </div>
              );
            })()}

            {/* Step 1: CV Selection & Phone Upload */}
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-400" />
                  <span>Resume / CV Document (Uploaded Files Attach Verbatim):</span>
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
                  {onNavigateToCVLibrary && (
                    <button
                      type="button"
                      onClick={onNavigateToCVLibrary}
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
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
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
                          {activeCv.isUploadedFile ? (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              Original Uploaded File (Attached Verbatim)
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                              Complete Multi-Section CV PDF
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap mt-0.5">
                          {activeCv.fileName && <span className="font-mono text-slate-300">{activeCv.fileName}</span>}
                          {activeCv.fileSizeBytesFormatted && <span>• {activeCv.fileSizeBytesFormatted}</span>}
                          <span>• {activeCv.roleSubtitle || 'Hospitality Professional'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => handleOpenCvPreview(activeCv)}
                        className="px-2.5 py-1.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition"
                        title="Preview exact CV attachment before sending"
                      >
                        <Eye className="w-3.5 h-3.5 text-blue-400" />
                        <span>Preview CV</span>
                      </button>

                      <select
                        value={selectedCvId}
                        onChange={e => handleSelectActiveCv(e.target.value)}
                        className="px-2.5 py-1.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-200 text-xs font-medium max-w-[190px]"
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

            {/* Editable Recipient Email & Subject Line */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Recipient Employer Email:
                </label>
                <input
                  type="email"
                  value={recipientOverride}
                  onChange={e => setRecipientOverride(e.target.value)}
                  placeholder="hr@employer.com"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">
                  Email Subject Line:
                </label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={e => setEmailSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                />
              </div>
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
                          ? 'bg-purple-600/20 border-purple-500/50 text-white'
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
                        className="rounded accent-purple-600"
                      />
                      <span className="truncate">{photo.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Step 3: Personalized Master Cover Letter */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-300">
                  Personalized Worldwide Cover Letter:
                </label>
                <button
                  type="button"
                  onClick={handleCustomizeModalWithGemini}
                  disabled={isCustomizingWithGemini}
                  className="px-2.5 py-1 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>{isCustomizingWithGemini ? 'Gemini Tailoring...' : 'Tailor Cover Letter with Gemini'}</span>
                </button>
              </div>
              <textarea
                rows={8}
                value={coverLetterText}
                onChange={e => setCoverLetterText(e.target.value)}
                className={`w-full p-3 rounded-xl text-xs border font-mono leading-relaxed ${
                  theme === 'dark' ? 'bg-[#182136] border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300'
                }`}
              />
            </div>

            {/* Dual Application Pathways: Connected Gmail OR Official Careers Portal */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              {selectedJob.applicationUrl && (
                <button
                  type="button"
                  onClick={handleOpenOfficialPortal}
                  className="w-full sm:w-1/2 py-2.5 rounded-xl border border-blue-500/40 bg-blue-600/10 hover:bg-blue-600/20 text-blue-300 font-bold text-xs flex items-center justify-center gap-2 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Official Careers Portal</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleSendViaGmail}
                disabled={isSubmitting}
                className={`w-full ${
                  selectedJob.applicationUrl ? 'sm:w-1/2' : 'sm:w-full'
                } py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 disabled:opacity-50`}
              >
                <Send className="w-3.5 h-3.5 -rotate-12" />
                <span>{isSubmitting ? 'Confirming Delivery with Gmail...' : 'Submit via Connected Gmail'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Careers Portal External Confirmation Modal */}
      {isPortalModalOpen && selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div
            className={`w-full max-w-md rounded-3xl border p-6 space-y-4 shadow-2xl ${
              theme === 'dark' ? 'bg-[#111728] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold">
                <ExternalLink className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-sm">Official Portal Submission</h4>
                <p className="text-xs text-slate-400">{selectedJob.employer}</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              We opened the official careers portal for <strong>{selectedJob.employer}</strong>. Have you finished submitting your application form on their website?
            </p>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsPortalModalOpen(false)}
                className="w-1/2 py-2.5 rounded-xl border border-slate-700 text-xs font-semibold hover:bg-slate-800"
              >
                Still In Progress
              </button>
              <button
                type="button"
                onClick={handleConfirmPortalSubmission}
                disabled={isSubmitting}
                className="w-1/2 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/30"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirm Submitted</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Country Priority Intelligence Configuration Modal */}
      <CountryPriorityManagerModal
        isOpen={isCountryModalOpen}
        onClose={() => setIsCountryModalOpen(false)}
        onProfilesUpdated={() => loadBatch(false)}
      />

      {/* Country Immigration Intelligence Inspector Modal */}
      {inspectCountry && (
        <CountryImmigrationModal
          country={inspectCountry}
          onClose={() => setInspectCountry(null)}
        />
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
                    {previewingCv.fileName || 'Master Hospitality Resume'} {previewingCv.fileSizeBytesFormatted ? `• ${previewingCv.fileSizeBytesFormatted}` : ''} {previewingCv.isUploadedFile ? '• Original Uploaded File (Attached Verbatim)' : '• Complete Structured CV PDF'}
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
            {(previewingCv.fileDataUri && previewingCv.fileType === 'pdf') || previewPdfDataUri ? (
              <div className="w-full h-[65vh] rounded-2xl overflow-hidden border border-slate-800 bg-white">
                <iframe
                  src={previewingCv.fileDataUri || previewPdfDataUri || ''}
                  title="PDF Preview"
                  className="w-full h-full border-0"
                />
              </div>
            ) : previewingCv.fileType === 'docx' || previewingCv.fileType === 'doc' ? (
              <div className="p-8 text-center rounded-2xl border border-slate-800 bg-slate-900/50 space-y-3">
                <FileText className="w-12 h-12 text-blue-400 mx-auto" />
                <h4 className="font-bold text-white text-base">Microsoft Word Document ({previewingCv.fileName})</h4>
                <p className="text-xs text-slate-300 max-w-md mx-auto">
                  This DOCX resume file is stored persistently in your CV Library ({previewingCv.fileSizeBytesFormatted}). When applying via connected Gmail, this exact binary file is attached as an official document.
                </p>
              </div>
            ) : (
              <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/50 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white text-sm">{previewingCv.data.fullName} — {previewingCv.roleSubtitle}</h4>
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
                        <div className="font-bold text-white">{exp.position} — {exp.companyName}</div>
                        <div className="text-[11px] text-slate-400">{exp.startDate} - {exp.endDate} · {exp.location}</div>
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
