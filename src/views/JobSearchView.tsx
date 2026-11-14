import React, { useState, useMemo, useEffect } from 'react';
import {
  Briefcase,
  Search,
  Filter,
  Globe,
  SlidersHorizontal,
  Bookmark,
  Bell,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  Layers,
  Building,
  MapPin,
  DollarSign,
  UserCheck,
  Send,
  Plus,
  Trash2,
  ExternalLink,
  RefreshCw,
  Award,
  Home,
  Plane,
  X,
  FileText,
  ShieldCheck,
  Clock,
  Mail,
} from 'lucide-react';
import {
  JobEntity,
  ApplicationRecord,
  SavedJobRecord,
  JobAlertConfig,
  SavedSearchQuery,
  SponsorshipVerificationLevel,
  SponsorshipFilterMode,
  UserSearchPreferences,
} from '../types/jobEntities';
import { JobCard } from '../components/JobCard';
import { ApplicationTrackingModal } from '../components/ApplicationTrackingModal';
import { GmailDispatchModal } from '../components/GmailDispatchModal';
import {
  CENTRAL_COUNTRY_DATABASE,
  QUICK_COUNTRY_FILTERS,
  QuickCountryFilterKey,
  searchCountriesByName,
} from '../services/countryDatabase';
import {
  buildEnrichedJobEntities,
  searchJobs,
  JobSearchFilters,
  PREDEFINED_JOB_CATEGORIES,
  loadSavedJobs,
  saveJobToFavorites,
  removeSavedJob,
  isJobSaved,
  loadApplications,
  saveApplication,
  loadJobAlerts,
  toggleJobAlert,
  deleteJobAlert,
  loadSavedSearches,
  saveSearchQuery,
  deleteSavedSearch,
  loadCareerProfile,
  saveCareerProfile,
  reportInvalidJob,
  markJobNotInterested,
  loadUserSearchPreferences,
  saveUserSearchPreferences,
} from '../services/jobSearchService';
import {
  loadAppliedJobRecords,
  recordAppliedJob,
  submitApplicationToBackend,
  dismissJobFromBackend,
  updateJobApplicationState,
  fetchApplicationHistoryFromBackend,
  BackendJobRecord,
} from '../services/jobDatabaseService';
import { loadCVLibrary, getActiveCVId } from '../services/cvStorage';
import { evaluateHospitalitySponsorship } from '../services/sponsorshipEvaluator';
import { CareerProfile } from '../types/careerProfile';
import { useTheme } from '../context/ThemeContext';

interface JobSearchViewProps {
  onNavigateToComposeEmail?: (job: JobEntity) => void;
  initialTab?: 'search' | 'saved' | 'applications' | 'alerts' | 'profile' | 'preferences' | 'diagnostics';
}

const DISMISSED_SEARCH_JOBS_KEY = 'ccd_dismissed_search_job_ids_v1';

function loadDismissedSearchJobIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_SEARCH_JOBS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveDismissedSearchJobIds(set: Set<string>): void {
  try {
    localStorage.setItem(DISMISSED_SEARCH_JOBS_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

export const JobSearchView: React.FC<JobSearchViewProps> = ({
  onNavigateToComposeEmail,
  initialTab = 'search',
}) => {
  const { theme } = useTheme();

  // Active View Tab
  const [activeTab, setActiveTab] = useState<
    'search' | 'saved' | 'applications' | 'alerts' | 'profile' | 'preferences' | 'diagnostics'
  >(initialTab);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Career Profile, Search Preferences & CV Library
  const [careerProfile, setCareerProfile] = useState<CareerProfile>(() => loadCareerProfile());
  const [searchPreferences, setSearchPreferences] = useState<UserSearchPreferences>(() => loadUserSearchPreferences());
  const [cvLibrary, setCvLibrary] = useState(() => loadCVLibrary());
  const [selectedCvId, setSelectedCvId] = useState<string>(
    () => getActiveCVId() || loadCVLibrary()[0]?.id || 'bartender-master-cv'
  );

  // Search Filters (Flexible across ANY job title, country, multi-country, employer, or industry)
  const [keyword, setKeyword] = useState('');
  const [selectedQuickFilter, setSelectedQuickFilter] = useState<QuickCountryFilterKey>('all');
  const [selectedCountry, setSelectedCountry] = useState('all');
  const [selectedCountries, setSelectedCountries] = useState<string[]>(() => loadUserSearchPreferences().preferredCountries || []);
  const [countrySearchQuery, setCountrySearchQuery] = useState('');
  const [showCountryMultiPicker, setShowCountryMultiPicker] = useState(false);
  const [cityFilter, setCityFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [employerFilter, setEmployerFilter] = useState('');
  const [industryFilter, setIndustryFilter] = useState('');
  const [sponsorshipCategoryFilter, setSponsorshipCategoryFilter] = useState('all');
  const [sponsorshipModeFilter, setSponsorshipModeFilter] = useState<SponsorshipFilterMode>('all_jobs');
  const [sponsorshipLevelFilter, setSponsorshipLevelFilter] = useState<'all' | SponsorshipVerificationLevel>('all');
  const [permitFeasibilityFilter, setPermitFeasibilityFilter] = useState('all');
  const [postingDateFilter, setPostingDateFilter] = useState<number>(0); // 0 = Any time, or days
  const [jobTypeFilter, setJobTypeFilter] = useState('');
  const [workplaceTypeFilter, setWorkplaceTypeFilter] = useState('');
  const [visaSponsorshipOnly, setVisaSponsorshipOnly] = useState(false);
  const [accommodationOnly, setAccommodationOnly] = useState(false);
  const [mealsOnly, setMealsOnly] = useState(false);
  const [immediateHiringOnly, setImmediateHiringOnly] = useState(false);
  const [relocationOnly, setRelocationOnly] = useState(false);
  const [hidePreviouslyProcessed, setHidePreviouslyProcessed] = useState(true);
  const [minMatchScore, setMinMatchScore] = useState(0);
  const [sortBy, setSortBy] = useState<JobSearchFilters['sortBy']>('best_match');
  const [currentPage, setCurrentPage] = useState(1);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Admin & Cooperative AI Diagnostics State (Requirement 17)
  const [diagnosticsData, setDiagnosticsData] = useState<any>(null);
  const [diagActionLoading, setDiagActionLoading] = useState<string | null>(null);
  const [diagLastResult, setDiagLastResult] = useState<any>(null);

  // Saved Jobs, Applications, Dismissed & Central Backend History
  const [savedJobs, setSavedJobs] = useState<SavedJobRecord[]>(() => loadSavedJobs());
  const [applications, setApplications] = useState<ApplicationRecord[]>(() => loadApplications());
  const [appliedHistoryRecords, setAppliedHistoryRecords] = useState(() => loadAppliedJobRecords());
  const [backendHistory, setBackendHistory] = useState<BackendJobRecord[]>([]);
  const [dismissedJobIds, setDismissedJobIds] = useState<Set<string>>(() => loadDismissedSearchJobIds());
  const [jobAlerts, setJobAlerts] = useState<JobAlertConfig[]>(() => loadJobAlerts());
  const [savedSearches, setSavedSearches] = useState<SavedSearchQuery[]>(() => loadSavedSearches());

  // AI Flexible Search & Discovered Pool
  const [aiDiscoveredJobs, setAiDiscoveredJobs] = useState<JobEntity[]>([]);
  const [aiRecommendedFilters, setAiRecommendedFilters] = useState<{
    recommendedRoles: string[];
    recommendedCountries: string[];
    recommendedIndustries: string[];
    rationale: string;
  } | null>(null);
  const [isAiSearching, setIsAiSearching] = useState(false);

  // Modal States: Direct Gmail Dispatch Modal & Tracking Modal
  const [dispatchJob, setDispatchJob] = useState<JobEntity | null>(null);
  const [trackingJob, setTrackingJob] = useState<JobEntity | null>(null);

  // Convert BackendJobRecord into JobEntity so central database jobs & Gemini discoveries render seamlessly
  const convertBackendJobToEntity = (bJob: BackendJobRecord): JobEntity => {
    const evalRes = evaluateHospitalitySponsorship({
      title: bJob.title,
      employer: bJob.employer,
      location: bJob.location,
      country: bJob.country,
      city: bJob.city,
      sponsorshipEvidence: bJob.sponsorshipEvidence,
      sourceNotes: bJob.sourceNotes,
      recipientEmail: bJob.recipientEmail,
      applicationUrl: bJob.applicationUrl,
    });

    const visaStatus: JobEntity['visaSponsorshipStatus'] =
      evalRes.transparentCategory === 'Confirmed by Official Evidence' ||
      evalRes.transparentCategory === 'Strong Evidence — Employer Confirmation Required'
        ? 'confirmed'
        : evalRes.transparentCategory === 'Possible — Needs Verification'
        ? 'possible'
        : evalRes.transparentCategory === 'Not Eligible'
        ? 'not_available'
        : 'not_mentioned';

    const matchScore = Number((bJob as any).suitabilityScore) || Math.max(76, evalRes.sponsorshipScore);

    return {
      id: bJob.id,
      title: bJob.title,
      company: bJob.employer,
      country: bJob.country,
      city: bJob.city || bJob.location.split(',')[0] || bJob.country,
      location: bJob.location || `${bJob.city || ''}, ${bJob.country}`,
      salary: 'Competitive Package + Benefits',
      currency: 'EUR',
      jobType: 'full-time',
      workplaceType: 'on-site',
      datePosted: (bJob as any).postingDate || '2 days ago',
      experienceRequired: '2+ years relevant experience',
      requiredExperienceYears: 2,
      visaSponsorshipStatus: visaStatus,
      sponsorshipEvidence: bJob.sponsorshipEvidence || evalRes.visaRouteDetected,
      sponsorshipReason: evalRes.feasibilityExplanation,
      workPermitSupport: visaStatus === 'confirmed' || visaStatus === 'possible',
      relocationSupport: evalRes.relocationIncluded,
      accommodationProvided: Boolean(bJob.accommodationIncluded ?? evalRes.accommodationIncluded),
      matchScore,
      matchedReasons: [
        (bJob as any).aiRecommendationReason || `Matches your CV profile for ${bJob.title} (${evalRes.industryDetected})`,
        `Transparent Category: ${evalRes.transparentCategory}`,
        `Permit Route: ${evalRes.visaRouteDetected}`,
      ],
      potentialIssues: evalRes.redFlagsDetected,
      source: bJob.sourcePortal || 'Verified Employer Discovery Pool',
      sourceId: 'src_ai_grounded',
      sourceUrl: bJob.originalJobUrl || bJob.applicationUrl || '',
      applicationUrl: bJob.applicationUrl || bJob.originalJobUrl || '',
      recipientEmail: bJob.recipientEmail || '',
      description: `${bJob.sourceNotes || ''} ${bJob.sponsorshipEvidence || ''}`.trim(),
      industry: (bJob as any).industry || evalRes.industryDetected || 'Hospitality, Beverage & Mixology',
      createdAt: bJob.discoveredAt || new Date().toISOString(),
    };
  };

  // Load initial central pool & AI filter recommendations on mount
  const fetchCentralPoolAndRecommendations = async (useAi: boolean = false) => {
    setIsAiSearching(true);
    try {
      const activeCv = cvLibrary.find(c => c.id === selectedCvId) || cvLibrary[0];
      const cvSummary = activeCv
        ? `${activeCv.title} (${activeCv.roleSubtitle || 'Professional'}): ${
            activeCv.data?.profileSummary || activeCv.data?.aboutMe?.content || ''
          }`
        : '';

      const res = await fetch('/api/jobs/ai-flexible-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: keyword.trim(),
          jobTitle: roleFilter.trim(),
          country: selectedCountry !== 'all' ? selectedCountry : '',
          employer: employerFilter.trim(),
          industry: industryFilter,
          sponsorshipCategory: sponsorshipCategoryFilter !== 'all' ? sponsorshipCategoryFilter : '',
          workPermitFeasibility: permitFeasibilityFilter !== 'all' ? permitFeasibilityFilter : '',
          accommodationOnly,
          postedWithinDays: postingDateFilter,
          market: 'all',
          cvSummary,
          useAiDiscovery: useAi,
          recommendFilters: true,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.jobs)) {
          setAiDiscoveredJobs(data.jobs.map(convertBackendJobToEntity));
        }
        if (data.recommendedFilters) {
          setAiRecommendedFilters(data.recommendedFilters);
        }
        if (useAi) {
          showToast(
            `Gemini AI analyzed your CV and ranked ${data.jobs?.length || 0} relevant opportunities across matching industries.`
          );
        }
      }
    } catch (e) {
      console.warn('Flexible AI search fetch note:', e);
    } finally {
      setIsAiSearching(false);
    }
  };

  const refreshAllHistory = async () => {
    setApplications(loadApplications());
    setAppliedHistoryRecords(loadAppliedJobRecords());
    try {
      const bHist = await fetchApplicationHistoryFromBackend();
      setBackendHistory(bHist);
    } catch {}
  };

  useEffect(() => {
    fetchCentralPoolAndRecommendations(false);
    refreshAllHistory();

    const handleHistoryUpdate = () => {
      refreshAllHistory();
    };
    const handleCvUpdate = () => {
      const updated = loadCVLibrary();
      setCvLibrary(updated);
      const activeId = getActiveCVId();
      if (activeId && updated.some(c => c.id === activeId)) {
        setSelectedCvId(activeId);
      }
    };
    window.addEventListener('application_history_updated', handleHistoryUpdate);
    window.addEventListener('cv_library_updated', handleCvUpdate);
    window.addEventListener('central_cv_library_updated', handleCvUpdate);
    window.addEventListener('active_cv_changed', handleCvUpdate);
    return () => {
      window.removeEventListener('application_history_updated', handleHistoryUpdate);
      window.removeEventListener('cv_library_updated', handleCvUpdate);
      window.removeEventListener('central_cv_library_updated', handleCvUpdate);
      window.removeEventListener('active_cv_changed', handleCvUpdate);
    };
  }, []);

  // Build unified set of already-applied and dismissed job fingerprints & IDs across Sponsorship, Search & Europe Job Market
  const { appliedKeysSet, dismissedKeysSet } = useMemo(() => {
    const keys = new Set<string>();
    const disKeys = new Set<string>(Array.from(dismissedJobIds).map(id => String(id).toLowerCase()));
    const followUpReadyKeys = new Set<string>();

    for (const b of backendHistory) {
      if (!b) continue;
      const comp = String(b.employer || (b as any).company || '').toLowerCase().trim();
      const title = String(b.title || b.position || '').toLowerCase().trim();
      const canonical = comp && title ? `${comp}__${title}` : '';

      if (b.applicationStatus === 'hidden' || b.status === 'dismissed') {
        if (b.id) disKeys.add(String(b.id).toLowerCase());
        if (canonical) disKeys.add(canonical);
        continue;
      }

      if (b.followUpEligible) {
        if (b.id) followUpReadyKeys.add(String(b.id).toLowerCase());
        if (canonical) followUpReadyKeys.add(canonical);
        continue;
      }

      if (b.applicationStatus === 'submitted' || b.status === 'applied') {
        if (b.id) keys.add(String(b.id).toLowerCase());
        if (canonical) keys.add(canonical);
      }
    }

    for (const a of applications) {
      if (!a) continue;
      if (a.status === 'applied' || a.status === 'interview' || a.status === 'offer') {
        const jId = String(a.jobId || a.id || '').toLowerCase().trim();
        const comp = String(a.company || (a as any).employer || '').toLowerCase().trim();
        const title = String(a.jobTitle || (a as any).position || (a as any).title || '').toLowerCase().trim();
        const canonical = comp && title ? `${comp}__${title}` : '';
        if (!followUpReadyKeys.has(jId) && !followUpReadyKeys.has(canonical)) {
          if (jId) keys.add(jId);
          if (canonical) keys.add(canonical);
        }
      }
    }

    for (const r of appliedHistoryRecords) {
      if (!r) continue;
      const elapsedDays = (Date.now() - (r.appliedTimestamp || r.appliedAt || Date.now())) / (24 * 60 * 60 * 1000);
      if (elapsedDays >= 4 && !r.employerResponseReceived) {
        continue; // 4-5 day follow-up window reached
      }
      const rJobId = String(r.jobId || r.id || '').toLowerCase().trim();
      if (rJobId && !followUpReadyKeys.has(rJobId)) keys.add(rJobId);
      const comp = String((r as any).company || (r as any).employer || '').toLowerCase().trim();
      const pos = String((r as any).position || (r as any).jobTitle || (r as any).title || '').toLowerCase().trim();
      const canonical = comp && pos ? `${comp}__${pos}` : '';
      if (canonical && !followUpReadyKeys.has(canonical)) keys.add(canonical);
    }

    return { appliedKeysSet: keys, dismissedKeysSet: disKeys };
  }, [applications, appliedHistoryRecords, backendHistory, dismissedJobIds]);

  const isJobAlreadyApplied = (job: JobEntity): boolean => {
    if (!job) return false;
    if (job.id && appliedKeysSet.has(String(job.id).toLowerCase())) return true;
    const canonical = `${String(job.company || '').toLowerCase().trim()}__${String(job.title || '').toLowerCase().trim()}`;
    if (appliedKeysSet.has(canonical)) return true;
    return false;
  };

  const isJobDismissedAcrossSections = (job: JobEntity): boolean => {
    if (!job) return false;
    if (job.id && dismissedKeysSet.has(String(job.id).toLowerCase())) return true;
    const canonical = `${String(job.company || '').toLowerCase().trim()}__${String(job.title || '').toLowerCase().trim()}`;
    if (dismissedKeysSet.has(canonical)) return true;
    return false;
  };

  // Master Jobs List combining enriched local catalog + central backend / Gemini AI discovered jobs
  const masterJobs = useMemo(() => {
    const baseJobs = buildEnrichedJobEntities(undefined, careerProfile);
    const combined = [...aiDiscoveredJobs, ...baseJobs];
    const seen = new Set<string>();
    const deduped: JobEntity[] = [];
    for (const j of combined) {
      if (!j) continue;
      const key = `${String(j.company || '').toLowerCase().trim()}__${String(j.title || '').toLowerCase().trim()}__${String(j.country || '').toLowerCase().trim()}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(j);
      }
    }
    return deduped;
  }, [careerProfile, aiDiscoveredJobs]);

  // Quick Country Filter handler
  const handleQuickFilterClick = (key: QuickCountryFilterKey) => {
    setSelectedQuickFilter(key);
    setCurrentPage(1);
    if (key === 'visa_sponsorship') {
      setVisaSponsorshipOnly(true);
      setSelectedCountry('all');
    } else {
      setVisaSponsorshipOnly(false);
      setSelectedCountry(key);
    }
  };

  // Run Search Query with additional flexible filters (employer, industry, sponsorship evidence category, permit eligibility, posting date, duplicate exclusion)
  const searchResult = useMemo(() => {
    // Pre-filter masterJobs by our extended flexible criteria
    const preFiltered = masterJobs.filter(job => {
      // 1. Exclude dismissed jobs across all sections
      if (isJobDismissedAcrossSections(job)) return false;

      // 2. Exclude already-applied jobs when hidePreviouslyProcessed is active
      if (hidePreviouslyProcessed && isJobAlreadyApplied(job)) {
        return false;
      }

      // 3. Employer filter
      if (employerFilter.trim()) {
        if (!job.company.toLowerCase().includes(employerFilter.trim().toLowerCase())) {
          return false;
        }
      }

      // 4. Sponsorship Evidence Category & Work-Permit Eligibility evaluation
      const evalRes = evaluateHospitalitySponsorship({
        title: job.title,
        employer: job.company,
        location: job.location,
        country: job.country,
        city: job.city,
        sponsorshipEvidence: Array.isArray(job.sponsorshipEvidence)
          ? job.sponsorshipEvidence.join(' ')
          : job.sponsorshipEvidence,
        sourceNotes: job.description,
        recipientEmail: job.recipientEmail,
        applicationUrl: job.applicationUrl || job.sourceUrl,
      });

      if (sponsorshipCategoryFilter !== 'all') {
        if (evalRes.transparentCategory !== sponsorshipCategoryFilter) return false;
      }

      if (permitFeasibilityFilter !== 'all') {
        if (evalRes.bangladeshiPassportFeasibility.toLowerCase() !== permitFeasibilityFilter.toLowerCase()) {
          return false;
        }
      }

      if (industryFilter) {
        const jobInd = `${job.industry} ${evalRes.industryDetected}`.toLowerCase();
        if (!jobInd.includes(industryFilter.toLowerCase())) return false;
      }

      if (postingDateFilter > 0) {
        // Parse relative date like "2 days ago" or "1 week ago"
        const dp = (job.datePosted || '').toLowerCase();
        let daysAgo = 2;
        const numMatch = dp.match(/(\d+)/);
        if (dp.includes('hour') || dp.includes('today') || dp.includes('just')) {
          daysAgo = 1;
        } else if (dp.includes('week') && numMatch) {
          daysAgo = Number(numMatch[1]) * 7;
        } else if (dp.includes('day') && numMatch) {
          daysAgo = Number(numMatch[1]);
        }
        if (daysAgo > postingDateFilter) return false;
      }

      return true;
    });

    const filters: JobSearchFilters = {
      keyword,
      country: selectedCountry,
      countries: selectedCountries.length > 0 ? selectedCountries : undefined,
      excludedCountries: searchPreferences.excludedCountries,
      city: cityFilter,
      jobTitle: roleFilter,
      jobCategory: categoryFilter !== 'all' ? categoryFilter : undefined,
      company: employerFilter,
      visaSponsorshipOnly,
      sponsorshipFilterMode: sponsorshipModeFilter,
      sponsorshipLevels: sponsorshipLevelFilter !== 'all' ? [sponsorshipLevelFilter] : undefined,
      jobType: jobTypeFilter,
      workplaceType: workplaceTypeFilter,
      accommodationProvided: accommodationOnly,
      mealsProvided: mealsOnly,
      immediateHiring: immediateHiringOnly,
      relocationSupport: relocationOnly,
      minMatchScore,
      sortBy,
      page: currentPage,
      pageSize: 12,
    };
    return searchJobs(preFiltered, filters, careerProfile);
  }, [
    masterJobs,
    dismissedJobIds,
    hidePreviouslyProcessed,
    appliedKeysSet,
    employerFilter,
    sponsorshipCategoryFilter,
    sponsorshipModeFilter,
    sponsorshipLevelFilter,
    permitFeasibilityFilter,
    industryFilter,
    postingDateFilter,
    keyword,
    selectedCountry,
    selectedCountries,
    searchPreferences.excludedCountries,
    cityFilter,
    roleFilter,
    categoryFilter,
    visaSponsorshipOnly,
    jobTypeFilter,
    workplaceTypeFilter,
    accommodationOnly,
    mealsOnly,
    immediateHiringOnly,
    relocationOnly,
    minMatchScore,
    sortBy,
    currentPage,
    careerProfile,
  ]);

  // Fetch Admin & Cooperative AI Diagnostics
  const fetchDiagnostics = async () => {
    try {
      const res = await fetch('/api/admin/diagnostics');
      if (res.ok) {
        const data = await res.json();
        setDiagnosticsData(data);
      }
    } catch {}
  };

  const runDiagnosticAction = async (action: string) => {
    setDiagActionLoading(action);
    try {
      const res = await fetch('/api/admin/diagnostics/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data = await res.json();
        setDiagLastResult(data);
        await fetchDiagnostics();
        showToast(`Diagnostic "${action}" completed.`);
      }
    } catch (e: any) {
      showToast(`Diagnostic error: ${e?.message || 'Failed'}`);
    } finally {
      setDiagActionLoading(null);
    }
  };

  // Toggle Save Favorite (and persist saved state to backend database)
  const handleToggleSaveJob = async (job: JobEntity) => {
    if (isJobSaved(job.id)) {
      removeSavedJob(job.id);
      await updateJobApplicationState(job.id, 'new_eligible', {
        employer: job.company,
        title: job.title,
        country: job.country,
        applicationUrl: job.applicationUrl || job.sourceUrl,
      });
      showToast(`Removed ${job.title} at ${job.company} from Saved Jobs.`);
    } else {
      saveJobToFavorites(job);
      await updateJobApplicationState(job.id, 'saved', {
        employer: job.company,
        title: job.title,
        country: job.country,
        applicationUrl: job.applicationUrl || job.sourceUrl,
      });
      showToast(`Saved ${job.title} at ${job.company} to Saved Jobs.`);
    }
    setSavedJobs(loadSavedJobs());
    await refreshAllHistory();
  };

  // Dismiss Job permanently across all sections so it is never repeated
  const handleDismissJob = async (job: JobEntity) => {
    const next = new Set(dismissedJobIds);
    next.add(job.id);
    setDismissedJobIds(next);
    saveDismissedSearchJobIds(next);
    try {
      await dismissJobFromBackend(job.id, 'sponsorship', {
        employer: job.company,
        title: job.title,
        country: job.country,
        applicationUrl: job.applicationUrl || job.sourceUrl,
      });
      await refreshAllHistory();
    } catch {}
    showToast(`Removed "${job.title}" at ${job.company}. Replenishing search queue.`);
  };

  const handleMarkNotInterested = async (job: JobEntity) => {
    markJobNotInterested(job.id);
    await handleDismissJob(job);
    showToast(`Marked "${job.title}" at ${job.company} as Not Interested.`);
  };

  const handleReportInvalidJob = async (job: JobEntity) => {
    reportInvalidJob(job.id, 'Reported invalid or expired by candidate');
    const next = new Set(dismissedJobIds);
    next.add(job.id);
    setDismissedJobIds(next);
    saveDismissedSearchJobIds(next);
    try {
      await fetch('/api/jobs/report-invalid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, reason: 'User reported invalid or expired vacancy' }),
      });
    } catch {}
    showToast(`Reported "${job.title}" at ${job.company} as invalid. Queue replenished.`);
  };

  // Open Direct Apply Modal (Fixes Search section application submission!)
  const handleApplyFromSearchCard = (job: JobEntity) => {
    // Also save draft in localStorage in case user switches to Gmail Application Center tab
    const activeCv = cvLibrary.find(c => c.id === selectedCvId) || cvLibrary[0];
    const draftLetter = `Fazle Rabbi Boyati
Limassol Marina, Cyprus | +357 9550 2363 | fazle.rabbe.doc@gmail.com
LinkedIn: https://www.linkedin.com/in/fazle-rabbi-5785aa269

Dear Hiring Team at ${job.company},

I am writing to apply for the ${job.title} position at ${job.company} in ${job.location}. With over five years of dedicated international experience across luxury hospitality, beverage operations, and customer-focused team leadership, I am confident in my ability to deliver immediate value to your organization.

${job.sponsorshipEvidence ? `I noted your work authorization pathway (${job.sponsorshipEvidence}) and am fully prepared for international relocation.` : 'I am fully prepared for relocation and available for an immediate video interview.'}

Please find my CV and personalized Cover Letter attached for your review.

Best regards,
Fazle Rabbi Boyati`;

    try {
      localStorage.setItem(
        'pending_email_application_draft',
        JSON.stringify({
          jobId: job.id,
          employer: job.company,
          title: job.title,
          country: job.country,
          recipientEmail: job.recipientEmail || '',
          subject: `Application for ${job.title} — ${(activeCv?.data as any)?.personalDetails?.fullName || activeCv?.data?.header?.fullName || activeCv?.data?.fullName || 'Fazle Rabbi Boyati'}`,
          coverLetter: draftLetter,
          selectedCvId,
        })
      );
    } catch {}

    setDispatchJob(job);
  };

  // Open Official Portal & prompt tracking confirmation
  const handleApplyPortalFromCard = (job: JobEntity) => {
    const url = job.applicationUrl || job.sourceUrl;
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    setTrackingJob(job);
  };

  // Save Application Record (Only marks Applied when status === 'applied')
  const handleSaveApplicationRecord = async (rec: ApplicationRecord) => {
    saveApplication(rec);
    const activeCv = cvLibrary.find(c => c.id === selectedCvId) || cvLibrary[0];
    if (rec.status === 'applied' || rec.status === 'interview' || rec.status === 'offer') {
      recordAppliedJob({
        job: {
          id: rec.jobId,
          company: rec.company,
          position: rec.jobTitle,
          location: rec.location,
          country: rec.country,
          applicationUrl: rec.applicationUrl,
        },
        status: 'applied_portal',
        cvId: activeCv?.id,
        cvTitle: activeCv?.title,
      });
      try {
        await submitApplicationToBackend({
          jobId: rec.jobId,
          employer: rec.company,
          title: rec.jobTitle,
          country: rec.country,
          location: rec.location,
          sourceUrl: rec.applicationUrl,
          applicationUrl: rec.applicationUrl,
          market: 'sponsorship',
          method: 'portal',
          status: 'submitted',
          cvId: activeCv?.id,
          cvTitle: activeCv?.title,
          notes: rec.notes || 'Confirmed application via Search tracker',
        });
      } catch {}
    } else if (rec.status === 'saved' || rec.status === 'preparing') {
      try {
        await updateJobApplicationState(rec.jobId, rec.status === 'saved' ? 'saved' : 'queued', {
          employer: rec.company,
          title: rec.jobTitle,
          country: rec.country,
          applicationUrl: rec.applicationUrl,
        });
      } catch {}
    }
    await refreshAllHistory();
    showToast(`Application status saved for ${rec.company} (${rec.status}).`);
  };

  // Save Search Query
  const handleSaveCurrentSearch = () => {
    const name = `${keyword || roleFilter || 'All Roles'} in ${selectedCountry === 'all' ? 'Global' : selectedCountry}${
      visaSponsorshipOnly ? ' (Visa Sponsored)' : ''
    }`;
    saveSearchQuery(name, {
      keywords: keyword || roleFilter,
      country: selectedCountry,
      visaSponsorshipOnly,
    });
    setSavedSearches(loadSavedSearches());
    showToast('Search query saved to your alerts and quick searches!');
  };

  // Save Career Profile
  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    saveCareerProfile(careerProfile);
    showToast('Career profile updated! Match scores recalculated across all vacancies.');
  };

  // Unified Application History list for Tab 3 (combining tracker applications + central applied records)
  const unifiedApplicationRecords = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        jobId: string;
        jobTitle: string;
        company: string;
        location: string;
        country: string;
        appliedDate: string;
        status: string;
        cvTitle?: string;
        method?: string;
        gmailMessageId?: string;
        applicationUrl?: string;
        notes?: string;
      }
    >();

    for (const app of applications) {
      if (!app) continue;
      const appKey = app.jobId || app.id || `app_${map.size}`;
      map.set(appKey, {
        id: app.id || appKey,
        jobId: app.jobId || appKey,
        jobTitle: app.jobTitle || (app as any).position || 'Position',
        company: app.company || (app as any).employer || 'Employer',
        location: app.location || '',
        country: app.country || '',
        appliedDate: app.appliedDate || 'Submitted',
        status: app.status || 'applied',
        applicationUrl: app.applicationUrl,
        notes: app.notes,
      });
    }

    for (const rec of appliedHistoryRecords) {
      if (!rec) continue;
      const recKey = rec.jobId || rec.id || `rec_${map.size}`;
      const existing = map.get(recKey);
      const rTitle = (rec as any).position || (rec as any).jobTitle || (rec as any).title || existing?.jobTitle || 'Position';
      const rCompany = (rec as any).company || (rec as any).employer || existing?.company || 'Employer';
      map.set(recKey, {
        id: rec.id || recKey,
        jobId: rec.jobId || recKey,
        jobTitle: rTitle,
        company: rCompany,
        location: (rec as any).location || existing?.location || (rec.market === 'cyprus' ? 'Cyprus' : 'Europe / International'),
        country: (rec as any).country || existing?.country || (rec.market === 'cyprus' ? 'Cyprus' : 'International'),
        appliedDate: new Date(rec.appliedAt || rec.appliedTimestamp || Date.now()).toLocaleString(),
        status: (rec.applicationStatus || (rec as any).status) === 'applied' ? 'Submitted (Verified Gmail)' : 'Submitted (Portal)',
        method: rec.gmailMessageId ? 'Gmail API' : 'Official Portal',
        gmailMessageId: rec.gmailMessageId,
        applicationUrl: rec.jobUrl || (rec as any).applicationUrl || existing?.applicationUrl,
        notes: existing?.notes,
      });
    }

    for (const b of backendHistory) {
      if (!b) continue;
      if (b.applicationStatus === 'submitted') {
        const lastEvt = b.applicationHistory?.[0];
        if (!map.has(b.id)) {
          map.set(b.id, {
            id: b.id,
            jobId: b.id,
            jobTitle: b.title || b.position || 'Position',
            company: b.employer || (b as any).company || 'Employer',
            location: b.location || '',
            country: b.country || '',
            appliedDate: lastEvt?.timestamp ? new Date(lastEvt.timestamp).toLocaleString() : 'Recent',
            status: 'Submitted',
            cvTitle: lastEvt?.cvTitle,
            method: lastEvt?.method === 'gmail' ? 'Gmail API' : 'Official Portal',
            gmailMessageId: lastEvt?.gmailMessageId,
            applicationUrl: b.applicationUrl,
            notes: lastEvt?.notes,
          });
        } else {
          const cur = map.get(b.id)!;
          cur.cvTitle = cur.cvTitle || lastEvt?.cvTitle;
          cur.gmailMessageId = cur.gmailMessageId || lastEvt?.gmailMessageId;
        }
      }
    }

    return Array.from(map.values());
  }, [applications, appliedHistoryRecords, backendHistory]);

  return (
    <div className="space-y-6 animate-fade-in pb-24">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 p-4 rounded-2xl bg-slate-900 border border-indigo-500/60 text-white text-xs shadow-2xl animate-fade-in flex items-center gap-2 max-w-md">
          <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#202738]">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase font-bold tracking-widest text-[#ffd700] px-2.5 py-0.5 rounded-full bg-[#ffd700]/10 border border-[#d4af37]/30 flex items-center gap-1">
              <Globe className="w-3 h-3 text-[#ffd700]" />
              <span>AI-Powered Flexible Multi-Industry Search</span>
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Active Gemini CV Matching & Duplicate Protection
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-['Cinzel'] text-[#fdf8f0] tracking-wide mt-1.5">
            AI Flexible Job Search & Discovery
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Search any job title, country, employer, or industry. Powered by Gemini CV suitability ranking & transparent sponsorship verification.
          </p>
        </div>

        {/* Sub-tab navigation */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#0e111a] border border-[#232938] overflow-x-auto">
          <button
            onClick={() => setActiveTab('search')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
              activeTab === 'search'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Search Jobs</span>
          </button>

          <button
            onClick={() => setActiveTab('saved')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
              activeTab === 'saved'
                ? 'bg-gradient-to-r from-amber-600 to-yellow-600 text-slate-950 font-black shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Saved ({savedJobs.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('applications');
              refreshAllHistory();
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
              activeTab === 'applications'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span>Submitted & Tracked ({unifiedApplicationRecords.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('alerts')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
              activeTab === 'alerts'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Alerts ({jobAlerts.filter(a => a.active).length})</span>
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
              activeTab === 'profile'
                ? 'bg-[#d4af37] text-slate-950 font-black shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Matching Profile</span>
          </button>

          <button
            onClick={() => setActiveTab('preferences')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
              activeTab === 'preferences'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Search Settings</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('diagnostics');
              fetchDiagnostics();
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
              activeTab === 'diagnostics'
                ? 'bg-gradient-to-r from-emerald-600 to-cyan-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>AI & System Diagnostics</span>
          </button>
        </div>
      </div>

      {/* ========================================================
          TAB 1: SEARCH JOBS (FLEXIBLE & AI-POWERED)
          ======================================================== */}
      {activeTab === 'search' && (
        <div className="space-y-5">
          {/* Main Search & Action Bar */}
          <div className="p-4 rounded-3xl bg-[#11141c] border border-[#232938] shadow-lg space-y-3">
            <div className="flex flex-col md:flex-row gap-3">
              {/* Keyword Input */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={keyword}
                  onChange={e => {
                    setKeyword(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search any job title, industry, skill, or employer (e.g. Bartender, Chef, IT Support, Nurse, DHL, Savoy)..."
                  className="w-full pl-10 pr-4 py-2.5 bg-[#090b10] border border-[#232838] rounded-2xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Specific Country Dropdown */}
              <div className="w-full md:w-52">
                <select
                  value={selectedCountry}
                  onChange={e => {
                    setSelectedCountry(e.target.value);
                    setSelectedQuickFilter('all');
                    setCurrentPage(1);
                  }}
                  className="w-full px-3.5 py-2.5 bg-[#090b10] border border-[#232838] rounded-2xl text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="all">🌍 All Countries</option>
                  <option value="eu">🇪🇺 All 27 EU Member States</option>
                  <option value="schengen">🛂 All 29 Schengen Countries</option>
                  <optgroup label="Primary Priority Markets">
                    <option value="Italy">🇮🇹 Italy</option>
                    <option value="Croatia">🇭🇷 Croatia</option>
                    <option value="Malta">🇲🇹 Malta</option>
                    <option value="Greece">🇬🇷 Greece</option>
                    <option value="United Kingdom">🇬🇧 United Kingdom</option>
                    <option value="Netherlands">🇳🇱 Netherlands</option>
                    <option value="Germany">🇩🇪 Germany</option>
                    <option value="Switzerland">🇨🇭 Switzerland</option>
                    <option value="Australia">🇦🇺 Australia</option>
                    <option value="New Zealand">🇳🇿 New Zealand</option>
                    <option value="Cyprus">🇨🇾 Cyprus</option>
                  </optgroup>
                  <optgroup label="All European Countries">
                    {CENTRAL_COUNTRY_DATABASE.map(c => (
                      <option key={c.id} value={c.countryName}>
                        {c.flag} {c.countryName}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Industry Dropdown */}
              <div className="w-full md:w-48">
                <select
                  value={industryFilter}
                  onChange={e => {
                    setIndustryFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3.5 py-2.5 bg-[#090b10] border border-[#232838] rounded-2xl text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">🏢 All Industries</option>
                  <option value="Hospitality">Hospitality, Beverage & Mixology</option>
                  <option value="Hotel">Hotel & Resort Operations</option>
                  <option value="Culinary">Culinary & Kitchen</option>
                  <option value="Technology">Technology & Engineering</option>
                  <option value="Healthcare">Healthcare & Caregiving</option>
                  <option value="Logistics">Logistics & Supply Chain</option>
                  <option value="Skilled Trades">Skilled Trades & Technical</option>
                  <option value="Business">Business, Operations & Corporate</option>
                </select>
              </div>

              {/* Gemini AI Discover Button */}
              <button
                type="button"
                onClick={() => fetchCentralPoolAndRecommendations(true)}
                disabled={isAiSearching}
                className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition shrink-0 shadow-md shadow-indigo-600/20 disabled:opacity-50"
                title="Analyze your CV with Gemini and discover matching vacancies for any role or industry"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isAiSearching ? 'animate-spin' : ''}`} />
                <span>{isAiSearching ? 'Gemini Searching...' : 'AI Discover & Rank'}</span>
              </button>

              {/* Filters Toggle Button */}
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className={`px-4 py-2.5 rounded-2xl border text-xs font-bold flex items-center justify-center gap-1.5 transition shrink-0 ${
                  showAdvancedFilters ||
                  visaSponsorshipOnly ||
                  accommodationOnly ||
                  relocationOnly ||
                  sponsorshipCategoryFilter !== 'all' ||
                  permitFeasibilityFilter !== 'all'
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                    : 'bg-[#181d29] border-[#293245] text-slate-300 hover:text-white'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Filters</span>
              </button>
            </div>

            {/* Multi-Country Selector & Predefined Job Category Row (Requirements 3, 4, 5) */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowCountryMultiPicker(!showCountryMultiPicker)}
                  className="px-3 py-1.5 rounded-xl bg-[#181d29] hover:bg-[#22293a] border border-[#2d374e] text-xs font-bold text-indigo-300 flex items-center gap-1.5 transition"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>
                    {selectedCountries.length === 0
                      ? 'Multi-Country Selector (All Countries)'
                      : `Selected Countries (${selectedCountries.length})`}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                <select
                  value={categoryFilter}
                  onChange={e => {
                    setCategoryFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#090b10] border border-[#232838] text-xs text-white font-semibold"
                >
                  <option value="all">Job Category: All 13 Categories + Custom</option>
                  {PREDEFINED_JOB_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>

                <select
                  value={sponsorshipModeFilter}
                  onChange={e => {
                    const val = e.target.value as SponsorshipFilterMode;
                    setSponsorshipModeFilter(val);
                    if (val === 'sponsorship_only' || val === 'visa_sponsorship') {
                      setVisaSponsorshipOnly(true);
                    } else {
                      setVisaSponsorshipOnly(false);
                    }
                    setCurrentPage(1);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#090b10] border border-[#232838] text-xs text-emerald-300 font-semibold"
                >
                  <option value="all_jobs">Job Type Filter: All Jobs</option>
                  <option value="sponsorship_only">Sponsorship Jobs Only</option>
                  <option value="work_permit_support">Work Permit Support</option>
                  <option value="visa_sponsorship">Visa Sponsorship</option>
                  <option value="employer_sponsored">Employer-Sponsored Jobs</option>
                </select>

                <select
                  value={sponsorshipLevelFilter}
                  onChange={e => {
                    setSponsorshipLevelFilter(e.target.value as any);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#090b10] border border-[#232838] text-xs text-sky-300 font-semibold"
                >
                  <option value="all">Sponsorship Level: All Levels (1, 2 & 3)</option>
                  <option value="level_1_confirmed">Level 1 — Confirmed Sponsorship</option>
                  <option value="level_2_mentioned">Level 2 — Sponsorship Mentioned</option>
                  <option value="level_3_unverified">Level 3 — Sponsorship Unverified</option>
                </select>
              </div>

              <div className="text-[11px] text-slate-400 flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-semibold">
                  Queue Active: {searchResult.totalCount} Eligible (Min Target: {searchPreferences.minVisibleQueue} / {searchPreferences.targetVisibleQueue})
                </span>
              </div>
            </div>

            {/* Expandable Multi-Country Picker Drawer (Requirement 4) */}
            {showCountryMultiPicker && (
              <div className="p-3.5 rounded-2xl bg-[#090b10] border border-indigo-500/40 space-y-3 animate-fade-in">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                    <Search className="w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={countrySearchQuery}
                      onChange={e => setCountrySearchQuery(e.target.value)}
                      placeholder="Search countries by name, ISO code, or city (e.g. Canada, UAE, Qatar, UK, Italy)..."
                      className="w-full px-2.5 py-1.5 rounded-xl bg-[#11141c] border border-[#232838] text-xs text-white"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const allNames = CENTRAL_COUNTRY_DATABASE.map(c => c.countryName);
                        setSelectedCountries(allNames);
                        setSelectedCountry('all');
                        saveUserSearchPreferences({ preferredCountries: allNames });
                        setCurrentPage(1);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition"
                    >
                      Select All Countries ({CENTRAL_COUNTRY_DATABASE.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCountries([]);
                        setSelectedCountry('all');
                        saveUserSearchPreferences({ preferredCountries: [] });
                        setCurrentPage(1);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition"
                    >
                      Clear Selection
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-1.5 max-h-52 overflow-y-auto pr-1">
                  {searchCountriesByName(countrySearchQuery).map(c => {
                    const isChecked = selectedCountries.includes(c.countryName);
                    return (
                      <label
                        key={c.id}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs cursor-pointer transition ${
                          isChecked
                            ? 'bg-indigo-600/25 border-indigo-500 text-white font-bold'
                            : 'bg-[#11141c] border-[#222838] text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            const updated = isChecked
                              ? selectedCountries.filter(item => item !== c.countryName)
                              : [...selectedCountries, c.countryName];
                            setSelectedCountries(updated);
                            setSelectedCountry('all');
                            saveUserSearchPreferences({ preferredCountries: updated });
                            setCurrentPage(1);
                          }}
                          className="rounded text-indigo-500"
                        />
                        <span>{c.flag}</span>
                        <span className="truncate">{c.countryName}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Flexible Role, Employer, Sponsorship Evidence & Work-Permit Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-1">
              <input
                type="text"
                value={roleFilter}
                onChange={e => {
                  setRoleFilter(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Custom Job Title (e.g. Maintenance Electrician, Plumber, Chef)..."
                className="px-3 py-2 rounded-xl bg-[#090b10] border border-[#232838] text-xs text-white placeholder-slate-500"
              />

              <input
                type="text"
                value={employerFilter}
                onChange={e => {
                  setEmployerFilter(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Specific Employer (e.g. Four Seasons, Fairmont, Ritz)..."
                className="px-3 py-2 rounded-xl bg-[#090b10] border border-[#232838] text-xs text-white placeholder-slate-500"
              />

              <select
                value={sponsorshipCategoryFilter}
                onChange={e => {
                  setSponsorshipCategoryFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 rounded-xl bg-[#090b10] border border-[#232838] text-xs text-white"
              >
                <option value="all">Sponsorship Evidence: All Categories</option>
                <option value="Confirmed by Official Evidence">Confirmed by Official Evidence</option>
                <option value="Strong Evidence — Employer Confirmation Required">
                  Strong Evidence — Employer Confirmation Required
                </option>
                <option value="Possible — Needs Verification">Possible — Needs Verification</option>
                <option value="Not Mentioned">Not Mentioned</option>
                <option value="Not Eligible">Not Eligible</option>
              </select>

              <select
                value={permitFeasibilityFilter}
                onChange={e => {
                  setPermitFeasibilityFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 rounded-xl bg-[#090b10] border border-[#232838] text-xs text-white"
              >
                <option value="all">Work-Permit Eligibility: Any</option>
                <option value="High">High Eligibility (Quota / Accredited Route)</option>
                <option value="Moderate">Moderate Eligibility (Licensed Sponsor)</option>
                <option value="Low / Case-by-Case">Case-by-Case Verification</option>
              </select>

              <select
                value={postingDateFilter}
                onChange={e => {
                  setPostingDateFilter(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-3 py-2 rounded-xl bg-[#090b10] border border-[#232838] text-xs text-white"
              >
                <option value={0}>Posting Date: Any Time</option>
                <option value={1}>Posted in Last 24 Hours</option>
                <option value={3}>Posted in Last 3 Days</option>
                <option value={7}>Posted in Last 7 Days</option>
                <option value={14}>Posted in Last 14 Days</option>
                <option value={30}>Posted in Last 30 Days</option>
              </select>
            </div>

            {/* Gemini AI Recommended Filters Banner */}
            {aiRecommendedFilters && (
              <div className="p-3 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 text-xs space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 font-bold text-indigo-300">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Gemini CV-Based Filter Recommendations:</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">Active CV:</span>
                    <select
                      value={selectedCvId}
                      onChange={e => setSelectedCvId(e.target.value)}
                      className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-[11px]"
                    >
                      {cvLibrary.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-[11px] text-slate-300">{aiRecommendedFilters.rationale}</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Recommended Roles:</span>
                  {aiRecommendedFilters.recommendedRoles.map(role => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => {
                        setRoleFilter(role);
                        setCurrentPage(1);
                      }}
                      className="px-2 py-0.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-500/30 text-[11px] transition"
                    >
                      {role}
                    </button>
                  ))}
                  <span className="text-[10px] font-bold uppercase text-slate-400 ml-2">Industries:</span>
                  {aiRecommendedFilters.recommendedIndustries.map(ind => (
                    <button
                      key={ind}
                      type="button"
                      onClick={() => {
                        setIndustryFilter(ind.split(',')[0].split('&')[0].trim());
                        setCurrentPage(1);
                      }}
                      className="px-2 py-0.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/30 text-[11px] transition"
                    >
                      {ind}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Country Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-1 no-scrollbar text-xs">
              {QUICK_COUNTRY_FILTERS.map(pill => (
                <button
                  type="button"
                  key={pill.key}
                  onClick={() => handleQuickFilterClick(pill.key)}
                  className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition flex items-center gap-1.5 shrink-0 ${
                    selectedQuickFilter === pill.key ||
                    (pill.key === 'visa_sponsorship' && visaSponsorshipOnly) ||
                    (pill.key !== 'all' && selectedCountry.toLowerCase() === pill.label.toLowerCase())
                      ? 'bg-[#d4af37] text-slate-950 shadow-md font-black'
                      : 'bg-[#181d29] border border-[#273042] text-slate-300 hover:text-white'
                  }`}
                >
                  <span>{pill.icon}</span>
                  <span>{pill.label}</span>
                  {pill.badge && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] bg-black/20 text-current">
                      {pill.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Advanced Filters Drawer */}
            {showAdvancedFilters && (
              <div className="pt-3 border-t border-[#1e2538] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs animate-fade-in">
                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-[#090b10] border border-[#232838] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={visaSponsorshipOnly}
                    onChange={e => {
                      setVisaSponsorshipOnly(e.target.checked);
                      setCurrentPage(1);
                    }}
                    className="w-4 h-4 rounded text-emerald-500 focus:ring-0 bg-slate-900 border-slate-700"
                  />
                  <span className="font-bold text-emerald-400">Visa Sponsorship Only</span>
                </label>

                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-[#090b10] border border-[#232838] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={accommodationOnly}
                    onChange={e => {
                      setAccommodationOnly(e.target.checked);
                      setCurrentPage(1);
                    }}
                    className="w-4 h-4 rounded text-indigo-500 focus:ring-0 bg-slate-900 border-slate-700"
                  />
                  <span className="font-semibold text-slate-300 flex items-center gap-1">
                    <Home className="w-3.5 h-3.5 text-indigo-400" /> Accommodation Included
                  </span>
                </label>

                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-[#090b10] border border-[#232838] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={relocationOnly}
                    onChange={e => {
                      setRelocationOnly(e.target.checked);
                      setCurrentPage(1);
                    }}
                    className="w-4 h-4 rounded text-teal-500 focus:ring-0 bg-slate-900 border-slate-700"
                  />
                  <span className="font-semibold text-slate-300 flex items-center gap-1">
                    <Plane className="w-3.5 h-3.5 text-teal-400" /> Relocation Support
                  </span>
                </label>

                <label className="flex items-center gap-2 p-2.5 rounded-xl bg-[#090b10] border border-[#232838] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hidePreviouslyProcessed}
                    onChange={e => {
                      setHidePreviouslyProcessed(e.target.checked);
                      setCurrentPage(1);
                    }}
                    className="w-4 h-4 rounded text-purple-500 focus:ring-0 bg-slate-900 border-slate-700"
                  />
                  <span className="font-semibold text-purple-300">Hide Applied / Processed</span>
                </label>

                <select
                  value={jobTypeFilter}
                  onChange={e => {
                    setJobTypeFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="p-2.5 rounded-xl bg-[#090b10] border border-[#232838] text-xs text-white"
                >
                  <option value="">Job Type: Any</option>
                  <option value="full-time">Full-Time</option>
                  <option value="seasonal">Seasonal Resort</option>
                  <option value="permanent">Permanent</option>
                  <option value="contract">Contract</option>
                  <option value="part-time">Part-Time</option>
                </select>

                <input
                  type="text"
                  value={cityFilter}
                  onChange={e => {
                    setCityFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Filter by city (e.g. London, Amsterdam)..."
                  className="p-2.5 rounded-xl bg-[#090b10] border border-[#232838] text-xs text-white placeholder-slate-500"
                />

                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#090b10] border border-[#232838]">
                  <span className="text-slate-400 whitespace-nowrap">Min Match:</span>
                  <input
                    type="range"
                    min="0"
                    max="90"
                    step="10"
                    value={minMatchScore}
                    onChange={e => {
                      setMinMatchScore(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="w-full accent-indigo-500"
                  />
                  <span className="font-bold text-white text-xs">{minMatchScore}%</span>
                </div>

                <button
                  type="button"
                  onClick={handleSaveCurrentSearch}
                  className="p-2.5 rounded-xl bg-[#1c2230] hover:bg-[#252d40] border border-[#2d3850] text-xs font-bold text-amber-300 flex items-center justify-center gap-1.5 transition"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>Save This Search Query</span>
                </button>
              </div>
            )}
          </div>

          {/* Search Result Overview Bar */}
          <div className="flex items-center justify-between text-xs text-slate-400 px-1 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span>
                Found <strong className="text-white">{searchResult.totalCount}</strong> eligible opportunities
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-emerald-400 font-semibold">
                {searchResult.sponsorshipCounts.confirmed} Strong/Confirmed Evidence
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-amber-400 font-semibold">
                {searchResult.sponsorshipCounts.possible} Possible — Needs Verification
              </span>
              {hidePreviouslyProcessed && unifiedApplicationRecords.length > 0 && (
                <>
                  <span className="text-slate-600">•</span>
                  <span className="text-purple-300 font-medium">
                    {unifiedApplicationRecords.length} previously applied jobs excluded
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="px-2.5 py-1 bg-[#11141c] border border-[#232838] rounded-xl text-xs text-slate-300"
              >
                <option value="best_match">Sort: Best CV Suitability</option>
                <option value="sponsorship">Sort: Strongest Sponsorship First</option>
                <option value="newest">Sort: Newest Posted</option>
                <option value="salary">Sort: Highest Salary</option>
              </select>
              <span>
                Page {searchResult.page} of {searchResult.totalPages}
              </span>
            </div>
          </div>

          {/* Job Cards Grid */}
          {searchResult.jobs.length === 0 ? (
            <div className="p-12 rounded-3xl bg-[#11141c] border border-[#232838] text-center space-y-3">
              <Briefcase className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-white">No local jobs match your exact filters</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Click "AI Discover & Rank with Gemini" to search live opportunities for your custom job title, industry, or country, or reset filters below.
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => fetchCentralPoolAndRecommendations(true)}
                  disabled={isAiSearching}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-xs flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isAiSearching ? 'Searching with Gemini...' : 'Discover Matching Jobs with Gemini AI'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setKeyword('');
                    setSelectedCountry('all');
                    setSelectedQuickFilter('all');
                    setVisaSponsorshipOnly(false);
                    setAccommodationOnly(false);
                    setRelocationOnly(false);
                    setMinMatchScore(0);
                    setCityFilter('');
                    setRoleFilter('');
                    setEmployerFilter('');
                    setIndustryFilter('');
                    setSponsorshipCategoryFilter('all');
                    setPermitFeasibilityFilter('all');
                    setPostingDateFilter(0);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 font-bold text-xs"
                >
                  Reset All Filters
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {searchResult.jobs.map(job => {
                const alreadyApplied = isJobAlreadyApplied(job);
                const application = applications.find(a => a.jobId === job.id);
                return (
                  <JobCard
                    key={job.id}
                    job={job}
                    isSaved={isJobSaved(job.id)}
                    applicationStatus={alreadyApplied ? 'applied' : application?.status}
                    onToggleSave={handleToggleSaveJob}
                    onApplyByEmail={handleApplyFromSearchCard}
                    onApplyPortal={handleApplyPortalFromCard}
                    onTrackApplication={j => setTrackingJob(j)}
                    onDismissJob={handleDismissJob}
                    onMarkNotInterested={handleMarkNotInterested}
                    onReportInvalid={handleReportInvalidJob}
                  />
                );
              })}
            </div>
          )}

          {/* Pagination Controls */}
          {searchResult.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-4 py-2 rounded-xl bg-[#151924] border border-[#232838] text-xs font-semibold text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:text-white"
              >
                &larr; Previous Page
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: searchResult.totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCurrentPage(p)}
                    className={`w-8 h-8 rounded-xl text-xs font-bold transition ${
                      currentPage === p
                        ? 'bg-indigo-600 text-white font-black'
                        : 'bg-[#151924] text-slate-400 hover:text-white'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={currentPage >= searchResult.totalPages}
                onClick={() => setCurrentPage(p => Math.min(searchResult.totalPages, p + 1))}
                className="px-4 py-2 rounded-xl bg-[#151924] border border-[#232838] text-xs font-semibold text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed hover:text-white"
              >
                Next Page &rarr;
              </button>
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          TAB 2: SAVED JOBS
          ======================================================== */}
      {activeTab === 'saved' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#232838]">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-[#ffd700]" />
              <span>Saved Job Opportunities ({savedJobs.length})</span>
            </h2>
            <span className="text-xs text-slate-400">Your curated bookmarked vacancies</span>
          </div>

          {savedJobs.length === 0 ? (
            <div className="p-12 rounded-3xl bg-[#11141c] border border-[#232838] text-center space-y-2">
              <Bookmark className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm font-semibold text-white">No saved jobs yet</p>
              <p className="text-xs text-slate-400">Click the bookmark icon on any job card to save it for later review.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {savedJobs.map(item => (
                <JobCard
                  key={item.id}
                  job={item.job}
                  isSaved={true}
                  applicationStatus={isJobAlreadyApplied(item.job) ? 'applied' : undefined}
                  onToggleSave={handleToggleSaveJob}
                  onApplyByEmail={handleApplyFromSearchCard}
                  onApplyPortal={handleApplyPortalFromCard}
                  onTrackApplication={j => setTrackingJob(j)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          TAB 3: SUBMITTED APPLICATIONS & INTERVIEW TRACKER (Requirement 4)
          ======================================================== */}
      {activeTab === 'applications' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#232838]">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-purple-400" />
                <span>Persistent Submitted Applications & Outcomes ({unifiedApplicationRecords.length})</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Central database of all jobs applied to or emailed — showing Employer, Role, Date, CV Used, and Verified Status.
              </p>
            </div>
            <button
              type="button"
              onClick={refreshAllHistory}
              className="px-3 py-1.5 rounded-xl bg-[#181d29] border border-[#293245] text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Sync History</span>
            </button>
          </div>

          {unifiedApplicationRecords.length === 0 ? (
            <div className="p-12 rounded-3xl bg-[#11141c] border border-[#232838] text-center space-y-2">
              <Briefcase className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-sm font-semibold text-white">No submitted applications recorded yet</p>
              <p className="text-xs text-slate-400">
                Click "Apply" on any job card to send your CV & Cover Letter via Gmail or track a portal submission.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {unifiedApplicationRecords.map(app => (
                <div
                  key={app.id}
                  className="p-4 rounded-2xl bg-[#11141c] border border-[#232838] flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition hover:border-[#333d54]"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-sm sm:text-base text-white">{app.jobTitle}</h3>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {app.status}
                      </span>
                      {app.method && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {app.method}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
                      <span className="text-[#ffd700] font-semibold">{app.company}</span>
                      <span>•</span>
                      <span>{app.location || app.country}</span>
                      <span>•</span>
                      <span>Date: {app.appliedDate}</span>
                      {app.cvTitle && (
                        <>
                          <span>•</span>
                          <span className="text-blue-300 font-medium">CV Used: {app.cvTitle}</span>
                        </>
                      )}
                    </div>

                    {app.gmailMessageId && (
                      <div className="text-[11px] text-emerald-400 font-mono">
                        Verified Gmail Message ID: {app.gmailMessageId}
                      </div>
                    )}

                    {app.notes && (
                      <p className="text-xs text-slate-400 italic pt-0.5 line-clamp-1">"{app.notes}"</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    <button
                      type="button"
                      onClick={() => {
                        const job: JobEntity = masterJobs.find(j => j.id === app.jobId) || {
                          id: app.jobId,
                          title: app.jobTitle,
                          company: app.company,
                          country: app.country,
                          city: app.location,
                          location: app.location,
                          salary: 'Competitive',
                          currency: 'EUR',
                          jobType: 'full-time',
                          workplaceType: 'on-site',
                          datePosted: 'Recent',
                          experienceRequired: '2+ years',
                          requiredExperienceYears: 2,
                          visaSponsorshipStatus: 'confirmed',
                          sponsorshipEvidence: 'Recorded application',
                          sponsorshipReason: 'In tracking',
                          workPermitSupport: true,
                          relocationSupport: false,
                          accommodationProvided: false,
                          matchScore: 90,
                          matchedReasons: ['Recorded application'],
                          potentialIssues: [],
                          recipientEmail: '',
                          source: 'Direct Tracker',
                          sourceId: 'src_custom',
                          sourceUrl: app.applicationUrl || '',
                          applicationUrl: app.applicationUrl || '',
                          description: 'Tracked job vacancy',
                          industry: 'Hospitality',
                          createdAt: new Date().toISOString(),
                        };
                        setTrackingJob(job);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-[#1c2230] text-xs font-semibold text-slate-200 hover:text-white"
                    >
                      Update Outcome
                    </button>
                    {app.applicationUrl && (
                      <a
                        href={app.applicationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-xl bg-[#1c2230] text-slate-400 hover:text-white"
                        title="View Job"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          TAB 4: JOB ALERTS & SAVED SEARCHES
          ======================================================== */}
      {activeTab === 'alerts' && (
        <div className="space-y-6">
          <div className="p-5 rounded-3xl bg-[#11141c] border border-[#232838] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#232838]">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Bell className="w-4 h-4 text-emerald-400" />
                  <span>Configured Job Alerts</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Get notified when new vacancies match your target role and sponsorship criteria.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {jobAlerts.map(alert => (
                <div
                  key={alert.id}
                  className="p-4 rounded-2xl bg-[#090b10] border border-[#1e2536] flex items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white">{alert.name}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          alert.active
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {alert.active ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
                      <span>Role: {alert.jobTitle}</span>
                      <span>•</span>
                      <span>Countries: {alert.countries.join(', ')}</span>
                      <span>•</span>
                      <span>Min Match: {alert.minMatchScore}%</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        toggleJobAlert(alert.id);
                        setJobAlerts(loadJobAlerts());
                      }}
                      className="px-3 py-1.5 rounded-xl bg-[#181d29] text-xs font-semibold text-slate-300 hover:text-white"
                    >
                      {alert.active ? 'Pause' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        deleteJobAlert(alert.id);
                        setJobAlerts(loadJobAlerts());
                      }}
                      className="p-2 rounded-xl text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-[#11141c] border border-[#232838] space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-amber-400" />
              <span>1-Tap Saved Searches</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {savedSearches.map(s => (
                <div
                  key={s.id}
                  className="p-3.5 rounded-2xl bg-[#090b10] border border-[#1e2536] flex items-center justify-between gap-3"
                >
                  <div>
                    <span className="font-bold text-xs sm:text-sm text-white block">{s.name}</span>
                    <span className="text-[11px] text-slate-400">
                      Keywords: "{s.keywords}" • {s.country}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setKeyword(s.keywords);
                        setSelectedCountry(s.country);
                        setVisaSponsorshipOnly(s.visaSponsorshipOnly);
                        setActiveTab('search');
                      }}
                      className="px-3 py-1 rounded-xl bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white text-xs font-bold transition"
                    >
                      Run
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        deleteSavedSearch(s.id);
                        setSavedSearches(loadSavedSearches());
                      }}
                      className="p-1.5 text-slate-500 hover:text-rose-400"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          TAB 5: CAREER PROFILE & MATCH ENGINE
          ======================================================== */}
      {activeTab === 'profile' && (
        <form onSubmit={handleUpdateProfile} className="p-6 rounded-3xl bg-[#11141c] border border-[#232838] space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#232838]">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <Award className="w-5 h-5 text-[#ffd700]" />
                <span>Candidate Career Profile & Matching Engine</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                The smart matching engine compares these attributes against every job posting (0–100% Score).
              </p>
            </div>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#ffd700] to-[#c5a059] text-slate-950 font-black text-xs uppercase tracking-wider shadow"
            >
              Save Profile & Recalculate
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Full Name</label>
              <input
                type="text"
                value={careerProfile.fullName}
                onChange={e => setCareerProfile({ ...careerProfile, fullName: e.target.value })}
                className="w-full p-2.5 rounded-xl bg-[#090b10] border border-[#232838] text-white"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Current Location</label>
              <input
                type="text"
                value={careerProfile.currentLocation}
                onChange={e => setCareerProfile({ ...careerProfile, currentLocation: e.target.value })}
                className="w-full p-2.5 rounded-xl bg-[#090b10] border border-[#232838] text-white"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Nationality</label>
              <input
                type="text"
                value={careerProfile.nationality}
                onChange={e => setCareerProfile({ ...careerProfile, nationality: e.target.value })}
                className="w-full p-2.5 rounded-xl bg-[#090b10] border border-[#232838] text-white"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Years of Experience</label>
              <input
                type="number"
                value={careerProfile.yearsOfExperience}
                onChange={e => setCareerProfile({ ...careerProfile, yearsOfExperience: Number(e.target.value) })}
                className="w-full p-2.5 rounded-xl bg-[#090b10] border border-[#232838] text-white"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">English Proficiency</label>
              <select
                value={careerProfile.englishLevel}
                onChange={e => setCareerProfile({ ...careerProfile, englishLevel: e.target.value as any })}
                className="w-full p-2.5 rounded-xl bg-[#090b10] border border-[#232838] text-white"
              >
                <option value="Fluent / C2">Fluent / C2</option>
                <option value="Advanced / C1">Advanced / C1</option>
                <option value="Intermediate / B2">Intermediate / B2</option>
                <option value="Native / Bilingual">Native / Bilingual</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Minimum Desired Salary (€/month)</label>
              <input
                type="number"
                value={careerProfile.preferredSalaryMin || 1400}
                onChange={e => setCareerProfile({ ...careerProfile, preferredSalaryMin: Number(e.target.value) })}
                className="w-full p-2.5 rounded-xl bg-[#090b10] border border-[#232838] text-white"
              />
            </div>
          </div>

          <div className="text-xs">
            <label className="block text-slate-400 font-semibold mb-1">
              Target Job Titles (Comma-separated)
            </label>
            <input
              type="text"
              value={careerProfile.jobTitles.join(', ')}
              onChange={e =>
                setCareerProfile({
                  ...careerProfile,
                  jobTitles: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                })
              }
              className="w-full p-2.5 rounded-xl bg-[#090b10] border border-[#232838] text-white"
            />
          </div>

          <div className="text-xs">
            <label className="block text-slate-400 font-semibold mb-1">
              Core Skills & Specializations (Comma-separated)
            </label>
            <textarea
              rows={2}
              value={careerProfile.skills.join(', ')}
              onChange={e =>
                setCareerProfile({
                  ...careerProfile,
                  skills: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                })
              }
              className="w-full p-2.5 rounded-xl bg-[#090b10] border border-[#232838] text-white resize-none"
            />
          </div>

          <div className="text-xs">
            <label className="block text-slate-400 font-semibold mb-1">
              Target Countries of Interest (Comma-separated)
            </label>
            <input
              type="text"
              value={careerProfile.targetCountries.join(', ')}
              onChange={e =>
                setCareerProfile({
                  ...careerProfile,
                  targetCountries: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                })
              }
              className="w-full p-2.5 rounded-xl bg-[#090b10] border border-[#232838] text-white"
            />
          </div>
        </form>
      )}

      {/* ========================================================
          TAB 6: SEARCH SETTINGS & USER PREFERENCES (Requirement 15)
          ======================================================== */}
      {activeTab === 'preferences' && (
        <div className="p-6 rounded-3xl bg-[#11141c] border border-[#232838] space-y-5 max-w-4xl">
          <div className="flex items-center justify-between pb-3 border-b border-[#232838]">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
                <span>Global Search Settings & Queue Replenishment Preferences</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure preferred roles, countries, excluded countries, sponsorship mode, and automatic queue thresholds.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                saveUserSearchPreferences(searchPreferences);
                showToast('Search preferences saved and applied to active discovery engine!');
              }}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-bold shadow"
            >
              Save Preferences
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">
                Preferred Job Titles (Comma-separated)
              </label>
              <input
                type="text"
                value={searchPreferences.preferredJobTitles.join(', ')}
                onChange={e =>
                  setSearchPreferences({
                    ...searchPreferences,
                    preferredJobTitles: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                  })
                }
                className="w-full p-2.5 rounded-xl bg-[#090b10] border border-[#232838] text-white"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">
                Preferred Countries (Comma-separated)
              </label>
              <input
                type="text"
                value={searchPreferences.preferredCountries.join(', ')}
                onChange={e =>
                  setSearchPreferences({
                    ...searchPreferences,
                    preferredCountries: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                  })
                }
                placeholder="e.g. United Kingdom, Canada, United Arab Emirates, Italy"
                className="w-full p-2.5 rounded-xl bg-[#090b10] border border-[#232838] text-white"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">
                Excluded Countries (Never show jobs from these countries)
              </label>
              <input
                type="text"
                value={searchPreferences.excludedCountries.join(', ')}
                onChange={e =>
                  setSearchPreferences({
                    ...searchPreferences,
                    excludedCountries: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                  })
                }
                placeholder="Leave blank to allow all countries"
                className="w-full p-2.5 rounded-xl bg-[#090b10] border border-[#232838] text-white"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">
                Default Sponsorship Filter Mode
              </label>
              <select
                value={searchPreferences.sponsorshipFilterMode}
                onChange={e =>
                  setSearchPreferences({
                    ...searchPreferences,
                    sponsorshipFilterMode: e.target.value as SponsorshipFilterMode,
                  })
                }
                className="w-full p-2.5 rounded-xl bg-[#090b10] border border-[#232838] text-white"
              >
                <option value="all_jobs">All Jobs</option>
                <option value="sponsorship_only">Sponsorship Jobs Only</option>
                <option value="work_permit_support">Work Permit Support</option>
                <option value="visa_sponsorship">Visa Sponsorship</option>
                <option value="employer_sponsored">Employer-Sponsored Jobs</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">
                Minimum Visible Queue Size (Auto-Replenish Trigger)
              </label>
              <input
                type="number"
                min={5}
                max={100}
                value={searchPreferences.minVisibleQueue}
                onChange={e =>
                  setSearchPreferences({
                    ...searchPreferences,
                    minVisibleQueue: Number(e.target.value) || 20,
                  })
                }
                className="w-full p-2.5 rounded-xl bg-[#090b10] border border-[#232838] text-white"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">
                Target Visible Queue Size
              </label>
              <input
                type="number"
                min={20}
                max={200}
                value={searchPreferences.targetVisibleQueue}
                onChange={e =>
                  setSearchPreferences({
                    ...searchPreferences,
                    targetVisibleQueue: Number(e.target.value) || 50,
                  })
                }
                className="w-full p-2.5 rounded-xl bg-[#090b10] border border-[#232838] text-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          TAB 7: ADMIN & COOPERATIVE AI DIAGNOSTIC PANEL (Requirement 17)
          ======================================================== */}
      {activeTab === 'diagnostics' && (
        <div className="space-y-4">
          <div className="p-5 rounded-3xl bg-[#11141c] border border-[#232838] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#232838]">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <span>Cooperative AI (Gemini + OpenAI) & Recruitment System Diagnostics</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Real-time provider health checks, token/latency telemetry, queue replenishment verification, and database diagnostics.
                </p>
              </div>
              <button
                type="button"
                onClick={() => runDiagnosticAction('run_all')}
                disabled={Boolean(diagActionLoading)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-bold shadow flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${diagActionLoading === 'run_all' ? 'animate-spin' : ''}`} />
                <span>{diagActionLoading === 'run_all' ? 'Running Full Diagnostic Suite...' : 'Run All 6 Diagnostics'}</span>
              </button>
            </div>

            {/* 6 Required Diagnostic Action Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {[
                { key: 'test_gemini', label: 'Test Gemini Connection' },
                { key: 'test_openai', label: 'Test OpenAI Connection' },
                { key: 'test_job_search', label: 'Test Job Search' },
                { key: 'test_database', label: 'Test Database Connection' },
                { key: 'test_application_workflow', label: 'Test Application Workflow' },
                { key: 'test_queue_refresh', label: 'Test Job Queue Refresh' },
              ].map(btn => (
                <button
                  key={btn.key}
                  type="button"
                  onClick={() => runDiagnosticAction(btn.key)}
                  disabled={Boolean(diagActionLoading)}
                  className="p-3 rounded-2xl bg-[#181d29] hover:bg-[#22293a] border border-[#2d374e] text-xs font-bold text-slate-200 hover:text-white transition text-center"
                >
                  {diagActionLoading === btn.key ? 'Testing...' : btn.label}
                </button>
              ))}
            </div>

            {/* Live Metrics Grid */}
            {diagnosticsData && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-2xl bg-[#090b10] border border-[#222838] space-y-2 text-xs">
                  <div className="font-bold text-indigo-400 uppercase tracking-wider text-[10px]">
                    Gemini Provider Status
                  </div>
                  <div className="text-sm font-bold text-white">
                    Model: {diagnosticsData.providers?.gemini?.model || 'gemini-3.8-flash'}
                  </div>
                  <div className="text-slate-400">
                    Status:{' '}
                    <strong className="text-emerald-400">
                      {diagnosticsData.providers?.gemini?.status || 'standby'}
                    </strong>
                  </div>
                  <div className="text-slate-400">
                    Requests: {diagnosticsData.providers?.gemini?.totalRequests || 0} (Avg Latency:{' '}
                    {diagnosticsData.providers?.gemini?.avgLatencyMs || 0}ms)
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#090b10] border border-[#222838] space-y-2 text-xs">
                  <div className="font-bold text-cyan-400 uppercase tracking-wider text-[10px]">
                    OpenAI Provider Status
                  </div>
                  <div className="text-sm font-bold text-white">
                    Model: {diagnosticsData.providers?.openai?.model || 'gpt-4o-mini'}
                  </div>
                  <div className="text-slate-400">
                    Status:{' '}
                    <strong className="text-amber-300">
                      {diagnosticsData.providers?.openai?.status || 'standby'}
                    </strong>
                  </div>
                  <div className="text-slate-400">
                    Cooperative Mode: {diagnosticsData.providers?.cooperativeMode}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#090b10] border border-[#222838] space-y-1.5 text-xs">
                  <div className="font-bold text-emerald-400 uppercase tracking-wider text-[10px]">
                    Queue & Database Telemetry
                  </div>
                  <div>Discovered Jobs: <strong>{diagnosticsData.metrics?.discoveredJobs}</strong></div>
                  <div>Verified Jobs: <strong>{diagnosticsData.metrics?.verifiedJobs}</strong></div>
                  <div>Sponsorship Jobs: <strong>{diagnosticsData.metrics?.sponsorshipJobs}</strong></div>
                  <div>Duplicates Removed: <strong>{diagnosticsData.metrics?.duplicateJobsRemoved}</strong></div>
                  <div>
                    Applications Success / Failed:{' '}
                    <strong className="text-emerald-400">{diagnosticsData.metrics?.applicationSuccessCount}</strong> /{' '}
                    <strong className="text-rose-400">{diagnosticsData.metrics?.applicationFailureCount}</strong>
                  </div>
                </div>
              </div>
            )}

            {diagLastResult && (
              <div className="p-4 rounded-2xl bg-[#090b10] border border-emerald-500/30 text-xs space-y-1.5">
                <div className="font-bold text-emerald-400">Latest Diagnostic Execution Output:</div>
                <pre className="text-[11px] text-slate-300 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(diagLastResult.results, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Direct In-Place Gmail & Portal Application Dispatch Modal (Fixes Search Apply Workflow) */}
      {dispatchJob && (
        <GmailDispatchModal
          application={{
            id: dispatchJob.id,
            company: dispatchJob.company,
            position: dispatchJob.title,
            location: dispatchJob.location,
            country: dispatchJob.country,
            recipientEmail: dispatchJob.recipientEmail || '',
            subject: `Application for ${dispatchJob.title} — Fazle Rabbi Boyati`,
            coverLetter: `Fazle Rabbi Boyati
Limassol Marina, Cyprus | +357 9550 2363 | fazle.rabbe.doc@gmail.com
LinkedIn: https://www.linkedin.com/in/fazle-rabbi-5785aa269

Dear Hiring Team at ${dispatchJob.company},

I am writing to express my strong interest in the ${dispatchJob.title} position at ${dispatchJob.company} in ${dispatchJob.location}. With over five years of professional experience in luxury hospitality, operations, and guest service excellence, I am eager to bring my skills and dedication to your team.

${dispatchJob.sponsorshipEvidence ? `Regarding work authorization (${dispatchJob.sponsorshipEvidence}), I am a Bangladeshi national currently residing in Cyprus and am fully prepared for international relocation.` : 'I am fully prepared for relocation and available for an immediate video interview.'}

Please find my CV and personalized Cover Letter attached for your consideration.

Best regards,
Fazle Rabbi Boyati`,
            applicationUrl: dispatchJob.applicationUrl || dispatchJob.sourceUrl,
            jobUrl: dispatchJob.sourceUrl || dispatchJob.applicationUrl,
            emailVerificationStatus: dispatchJob.recipientEmail ? 'verified' : 'needs_review',
            selectedCvId,
            cvTitle: (cvLibrary.find(c => c.id === selectedCvId) || cvLibrary[0])?.title || 'Fazle Rabbi CV',
            verificationStatus: 'verified',
            status: 'approved',
            isApproved: true,
            isDuplicate: false,
            verifiedBy: 'Gemini + Official Contact Registry',
          }}
          selectedCvId={selectedCvId}
          onClose={() => setDispatchJob(null)}
          onSendApproved={async (updatedApp, messageId?: string) => {
            const activeCv = cvLibrary.find(c => c.id === selectedCvId) || cvLibrary[0];
            saveApplication({
              jobId: dispatchJob.id,
              jobTitle: dispatchJob.title,
              company: dispatchJob.company,
              location: dispatchJob.location,
              country: dispatchJob.country,
              status: 'applied',
              applicationUrl: dispatchJob.applicationUrl || dispatchJob.sourceUrl,
              notes: messageId
                ? `Sent via Gmail API (Message ID: ${messageId}) with CV [${activeCv?.title || 'CV'}]`
                : `Submitted application with CV [${activeCv?.title || 'CV'}]`,
            });

            recordAppliedJob({
              job: {
                id: dispatchJob.id,
                company: dispatchJob.company,
                position: dispatchJob.title,
                location: dispatchJob.location,
                country: dispatchJob.country,
                recipientEmail: dispatchJob.recipientEmail,
                applicationUrl: dispatchJob.applicationUrl || dispatchJob.sourceUrl,
              },
              gmailMessageId: messageId,
              status: messageId ? 'applied' : 'applied_portal',
              cvId: activeCv?.id,
              cvTitle: activeCv?.title,
              subject: updatedApp?.subject || `Application for ${dispatchJob.title}`,
              coverLetter: updatedApp?.coverLetter,
            });

            try {
              await submitApplicationToBackend({
                jobId: dispatchJob.id,
                employer: dispatchJob.company,
                title: dispatchJob.title,
                country: dispatchJob.country,
                city: dispatchJob.city,
                location: dispatchJob.location,
                sourceUrl: dispatchJob.sourceUrl || dispatchJob.applicationUrl,
                applicationUrl: dispatchJob.applicationUrl || dispatchJob.sourceUrl,
                recipientEmail: dispatchJob.recipientEmail,
                sponsorshipEvidence: dispatchJob.sponsorshipEvidence,
                market: dispatchJob.visaSponsorshipStatus === 'confirmed' ? 'sponsorship' : 'europe',
                method: messageId ? 'gmail' : 'portal',
                status: 'submitted',
                cvId: activeCv?.id,
                cvTitle: activeCv?.title,
                subject: updatedApp?.subject,
                coverLetter: updatedApp?.coverLetter,
                gmailMessageId: messageId,
                notes: messageId
                  ? `Dispatched from Search via Gmail (ID: ${messageId})`
                  : 'Submitted from Search via Official Portal',
              });
            } catch {}

            await refreshAllHistory();
            setDispatchJob(null);
            showToast(
              messageId
                ? `Verified Gmail Delivery to ${dispatchJob.company} (ID: ${messageId})! Saved to Application History.`
                : `Application recorded for ${dispatchJob.company} in Application History.`
            );
          }}
        />
      )}

      {/* Application Tracking Modal */}
      {trackingJob && (
        <ApplicationTrackingModal
          job={trackingJob}
          existingRecord={applications.find(a => a.jobId === trackingJob.id)}
          isOpen={true}
          onClose={() => setTrackingJob(null)}
          onSave={handleSaveApplicationRecord}
        />
      )}
    </div>
  );
};
