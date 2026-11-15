import React, { useState } from 'react';
import {
  Briefcase,
  MapPin,
  Calendar,
  Building,
  DollarSign,
  Award,
  Bookmark,
  ExternalLink,
  Mail,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Home,
  Plane,
  Sparkles,
  EyeOff,
  Utensils,
  Clock,
  Flag,
  FileText,
  Trash2,
} from 'lucide-react';
import { JobEntity, ApplicationStatus } from '../types/jobEntities';
import { useTheme } from '../context/ThemeContext';
import { evaluateHospitalitySponsorship } from '../services/sponsorshipEvaluator';

interface JobCardProps {
  job: JobEntity;
  isSaved?: boolean;
  onToggleSave?: (job: JobEntity) => void;
  onApplyByEmail?: (job: JobEntity) => void;
  onApplyPortal?: (job: JobEntity) => void;
  onTrackApplication?: (job: JobEntity) => void;
  onDismissJob?: (job: JobEntity) => void;
  onReportInvalid?: (job: JobEntity) => void;
  onMarkNotInterested?: (job: JobEntity) => void;
  applicationStatus?: ApplicationStatus;
}

export const JobCard: React.FC<JobCardProps> = ({
  job,
  isSaved = false,
  onToggleSave,
  onApplyByEmail,
  onApplyPortal,
  onTrackApplication,
  onDismissJob,
  onReportInvalid,
  onMarkNotInterested,
  applicationStatus,
}) => {
  const { theme } = useTheme();
  const [showMatchDetails, setShowMatchDetails] = useState(false);

  const evalSponsorship = evaluateHospitalitySponsorship({
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

  // 3-Level Sponsorship Classification Badge (Requirement 5 & 9)
  const getSponsorshipBadge = () => {
    const level = job.sponsorshipVerificationLevel;
    const cat = (job as any).transparentCategory || evalSponsorship.transparentCategory;

    if (level === 'level_1_confirmed' || cat === 'Confirmed by Official Evidence' || job.visaSponsorshipStatus === 'confirmed') {
      return {
        levelBadge: 'Level 1 — Confirmed Sponsorship',
        label: 'Confirmed Sponsorship',
        subLabel: 'Employer Explicitly Confirms Visa / Work Permit Sponsorship',
        classes:
          theme === 'dark'
            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
            : 'bg-emerald-50 text-emerald-700 border-emerald-200',
        dot: 'bg-emerald-500',
      };
    }
    if (
      level === 'level_2_mentioned' ||
      cat === 'Strong Evidence — Employer Confirmation Required' ||
      cat === 'Possible — Needs Verification' ||
      job.visaSponsorshipStatus === 'possible'
    ) {
      return {
        levelBadge: 'Level 2 — Sponsorship Mentioned',
        label: 'Sponsorship Mentioned',
        subLabel: 'Mentions Permit Support — Further Verification Required',
        classes:
          theme === 'dark'
            ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
            : 'bg-sky-50 text-sky-700 border-sky-200',
        dot: 'bg-sky-500',
      };
    }
    if (cat === 'Not Eligible' || job.visaSponsorshipStatus === 'not_available') {
      return {
        levelBadge: 'Level 3 — Sponsorship Unverified',
        label: 'Sponsorship Unverified (Right to Work Required)',
        subLabel: 'Does Not Confirm Sponsorship',
        classes:
          theme === 'dark'
            ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
            : 'bg-rose-50 text-rose-700 border-rose-200',
        dot: 'bg-rose-500',
      };
    }
    return {
      levelBadge: 'Level 3 — Sponsorship Unverified',
      label: 'Sponsorship Unverified',
      subLabel: 'Does Not Clearly Confirm Sponsorship',
      classes:
        theme === 'dark'
          ? 'bg-slate-800 text-slate-300 border-slate-700'
          : 'bg-slate-100 text-slate-600 border-slate-200',
      dot: 'bg-slate-400',
    };
  };

  const badge = getSponsorshipBadge();

  const getMatchScoreColor = (score: number) => {
    if (score >= 85) {
      return theme === 'dark'
        ? 'text-emerald-300 border-emerald-500/40 bg-emerald-950/30'
        : 'text-emerald-700 border-emerald-200 bg-emerald-50';
    }
    if (score >= 70) {
      return theme === 'dark'
        ? 'text-blue-300 border-blue-500/40 bg-blue-950/30'
        : 'text-blue-700 border-blue-200 bg-blue-50';
    }
    return theme === 'dark'
      ? 'text-slate-300 border-slate-700 bg-slate-800'
      : 'text-slate-600 border-slate-200 bg-slate-50';
  };

  const aiProviders = job.aiVerificationRecord?.providersUsed?.join(' + ') || 'Gemini + OpenAI';

  return (
    <div
      className={`rounded-2xl border p-5 transition-all duration-200 flex flex-col justify-between ${
        theme === 'dark'
          ? 'bg-[#11131a] border-[#222838] hover:border-blue-500/40 text-slate-100 shadow-md'
          : 'bg-white border-slate-200/90 hover:border-blue-300 text-slate-900 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] hover:shadow-[0_8px_28px_-4px_rgba(37,99,235,0.08)]'
      }`}
    >
      <div>
        {/* Top Header: Title, Company, Location & AI Relevance Score */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3
                className={`font-bold text-base sm:text-lg leading-snug tracking-tight ${
                  theme === 'dark' ? 'text-white' : 'text-slate-900'
                }`}
              >
                {job.title}
              </h3>
              {job.jobCategory && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20">
                  {job.jobCategory}
                </span>
              )}
              {applicationStatus && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/40">
                  {applicationStatus.replace(/_/g, ' ')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 flex-wrap">
              <span className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                <Building className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                {job.company}
              </span>
              <span className="text-slate-300 dark:text-slate-600">•</span>
              <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                {job.city},{' '}
                <strong className={theme === 'dark' ? 'text-slate-200' : 'text-slate-700'}>{job.country}</strong>
              </span>
            </div>
          </div>

          {/* AI Relevance Score Badge */}
          <div
            className={`px-2.5 py-1 rounded-xl border flex items-center gap-1 shrink-0 cursor-pointer transition hover:scale-105 ${getMatchScoreColor(
              job.matchScore
            )}`}
            onClick={() => setShowMatchDetails(!showMatchDetails)}
            title="Click to view Full Job Details, AI Verification & Match Factors"
          >
            <Sparkles className="w-3 h-3" />
            <span className="font-extrabold text-xs">{job.matchScore}% AI Match</span>
          </div>
        </div>

        {/* Sponsorship Level Pill & Key Metadata Row */}
        <div className="mt-3.5 flex items-center gap-2 flex-wrap">
          <div
            className={`px-3 py-1 rounded-full text-xs font-bold border inline-flex items-center gap-1.5 ${badge.classes}`}
            title={badge.subLabel}
          >
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>{badge.levelBadge}</span>
          </div>

          <span
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border capitalize ${
              theme === 'dark'
                ? 'bg-slate-800/80 text-slate-300 border-slate-700'
                : 'bg-slate-100/80 text-slate-700 border-slate-200/80'
            }`}
          >
            {job.jobType || 'Full-time'}
          </span>

          {job.workPermitSupport && (
            <span
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border flex items-center gap-1 ${
                theme === 'dark'
                  ? 'bg-violet-500/15 text-violet-300 border-violet-500/30'
                  : 'bg-violet-50 text-violet-700 border-violet-200/80'
              }`}
            >
              <Plane className="w-3 h-3" /> Work Permit Support
            </span>
          )}

          {job.accommodationProvided && (
            <span
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border flex items-center gap-1 ${
                theme === 'dark'
                  ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                  : 'bg-indigo-50 text-indigo-700 border-indigo-200/80'
              }`}
            >
              <Home className="w-3 h-3" /> Accommodation
            </span>
          )}

          {job.mealsProvided && (
            <span
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border flex items-center gap-1 ${
                theme === 'dark'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-amber-50 text-amber-700 border-amber-200/80'
              }`}
            >
              <Utensils className="w-3 h-3" /> Meals Provided
            </span>
          )}

          {job.salary && (
            <span
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border flex items-center gap-1 ${
                theme === 'dark'
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                  : 'bg-emerald-50/70 text-emerald-700 border-emerald-200/70'
              }`}
            >
              <DollarSign className="w-3 h-3" /> {job.salary}
            </span>
          )}
        </div>

        {/* Experience, Deadline & Verification Status Bar */}
        <div className="mt-2.5 flex items-center gap-3 flex-wrap text-[11px] text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <Award className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            Exp: <strong className={theme === 'dark' ? 'text-slate-200' : 'text-slate-700'}>{job.experienceRequired || '1+ years'}</strong>
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            Deadline:{' '}
            <strong className={theme === 'dark' ? 'text-slate-200' : 'text-slate-700'}>
              {job.applicationDeadline || 'Open Until Filled'}
            </strong>
          </span>
          <span>•</span>
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            {aiProviders} Verified
          </span>
        </div>

        {/* Sponsorship Evidence & Original Source Link Box */}
        <div
          className={`mt-3 p-3 rounded-xl border space-y-1.5 ${
            theme === 'dark' ? 'bg-[#090b10] border-[#1a1f2e]' : 'bg-slate-50/70 border-slate-200/70'
          }`}
        >
          <p className={`text-[11px] leading-relaxed ${theme === 'dark' ? 'text-slate-300' : 'text-slate-600'}`}>
            <strong className="font-semibold">Evidence: </strong>
            {Array.isArray(job.sponsorshipEvidence) && job.sponsorshipEvidence.length > 0
              ? job.sponsorshipEvidence.join(' · ')
              : evalSponsorship.visaRouteDetected}
          </p>
          <div
            className={`flex items-center justify-between flex-wrap gap-2 text-[10px] pt-1 border-t ${
              theme === 'dark' ? 'text-slate-400 border-slate-800/80' : 'text-slate-500 border-slate-200/70'
            }`}
          >
            <span>
              Route:{' '}
              <strong className={theme === 'dark' ? 'text-slate-200' : 'text-slate-700'}>
                {evalSponsorship.visaRouteDetected}
              </strong>
            </span>
            {(job.sourceUrl || job.applicationUrl) && (
              <a
                href={job.sourceUrl || job.applicationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 font-semibold"
              >
                <span>Original Vacancy Link</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
        </div>

        {/* Collapsible View Details & Cooperative AI Analysis Breakdown */}
        {showMatchDetails && (
          <div
            className={`mt-3 p-3.5 rounded-xl border text-xs space-y-2.5 animate-fade-in ${
              theme === 'dark' ? 'bg-slate-950/90 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between text-slate-500 font-bold uppercase tracking-wider text-[10px]">
              <span>Vacancy Details & Cooperative AI Verification ({job.matchScore}%)</span>
              <button
                type="button"
                onClick={() => setShowMatchDetails(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                Close
              </button>
            </div>

            <p className={`text-xs leading-relaxed ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
              {job.description}
            </p>

            {job.aiVerificationRecord && (
              <div
                className={`p-2.5 rounded-lg border text-[11px] space-y-1 ${
                  theme === 'dark' ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
                }`}
              >
                <div className="font-bold text-blue-600 dark:text-blue-400">
                  Cooperative AI Consensus: {job.aiVerificationRecord.consensusStatus.replace(/_/g, ' ').toUpperCase()}
                </div>
                {job.aiVerificationRecord.geminiAnalysis && (
                  <div>
                    <strong>Gemini ({job.aiVerificationRecord.geminiAnalysis.model}):</strong>{' '}
                    {job.aiVerificationRecord.geminiAnalysis.summary}
                  </div>
                )}
                {job.aiVerificationRecord.openaiAnalysis && (
                  <div>
                    <strong>OpenAI ({job.aiVerificationRecord.openaiAnalysis.model}):</strong>{' '}
                    {job.aiVerificationRecord.openaiAnalysis.verificationNote}
                  </div>
                )}
              </div>
            )}

            {job.matchedReasons && job.matchedReasons.length > 0 && (
              <div className="space-y-1">
                {job.matchedReasons.map((reason, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-emerald-600 dark:text-emerald-400 text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            )}

            {job.potentialIssues && job.potentialIssues.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-slate-200 dark:border-slate-800">
                {job.potentialIssues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400 text-[11px]">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{issue}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions (All 6 Required Actions: View Details, Apply Now, Save Job, Remove Job, Report Invalid Job, Mark as Not Interested) */}
      <div
        className={`mt-4 pt-3 border-t flex flex-wrap items-center justify-between gap-2 ${
          theme === 'dark' ? 'border-[#1f2434]' : 'border-slate-100'
        }`}
      >
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[240px]">
          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="truncate">{job.datePosted}</span>
          <span>·</span>
          <span className="truncate font-medium" title={job.source}>
            {job.source}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
          {/* 1. View Details Button */}
          <button
            type="button"
            onClick={() => setShowMatchDetails(!showMatchDetails)}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition flex items-center gap-1 ${
              theme === 'dark'
                ? 'bg-[#181d29] hover:bg-[#22293a] border-[#293245] text-slate-300 hover:text-white'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
            }`}
            title="View full vacancy description and AI verification details"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{showMatchDetails ? 'Hide Details' : 'View Details'}</span>
          </button>

          {/* 2. Save Job Button */}
          {onToggleSave && (
            <button
              type="button"
              onClick={() => onToggleSave(job)}
              className={`p-2 rounded-xl border transition ${
                isSaved
                  ? 'bg-rose-50 dark:bg-rose-500/20 border-rose-200 dark:border-rose-500/40 text-rose-600 dark:text-rose-400'
                  : theme === 'dark'
                  ? 'bg-[#181d29] border-[#293245] text-slate-400 hover:text-white'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-500 hover:text-slate-800'
              }`}
              title={isSaved ? 'Remove from Saved Jobs' : 'Save Job'}
            >
              <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-current' : ''}`} />
            </button>
          )}

          {/* 3. Mark as Not Interested Button */}
          {(onMarkNotInterested || onDismissJob) && (
            <button
              type="button"
              onClick={() => {
                if (onMarkNotInterested) onMarkNotInterested(job);
                else if (onDismissJob) onDismissJob(job);
              }}
              className={`p-2 rounded-xl border transition ${
                theme === 'dark'
                  ? 'bg-[#181d29] hover:bg-amber-500/15 border-[#293245] hover:border-amber-500/40 text-slate-400 hover:text-amber-300'
                  : 'bg-slate-50 hover:bg-amber-50 border-slate-200 hover:border-amber-200 text-slate-400 hover:text-amber-600'
              }`}
              title="Mark as Not Interested"
            >
              <EyeOff className="w-3.5 h-3.5" />
            </button>
          )}

          {/* 4. Remove Job Button */}
          {onDismissJob && (
            <button
              type="button"
              onClick={() => onDismissJob(job)}
              className={`p-2 rounded-xl border transition ${
                theme === 'dark'
                  ? 'bg-[#181d29] hover:bg-rose-500/15 border-[#293245] hover:border-rose-500/40 text-slate-400 hover:text-rose-300'
                  : 'bg-slate-50 hover:bg-rose-50 border-slate-200 hover:border-rose-200 text-slate-400 hover:text-rose-600'
              }`}
              title="Remove Job from Queue"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* 5. Report Invalid Job Button */}
          {onReportInvalid && (
            <button
              type="button"
              onClick={() => onReportInvalid(job)}
              className={`p-2 rounded-xl border transition ${
                theme === 'dark'
                  ? 'bg-[#181d29] hover:bg-rose-500/15 border-[#293245] hover:border-rose-500/40 text-slate-400 hover:text-rose-300'
                  : 'bg-slate-50 hover:bg-rose-50 border-slate-200 hover:border-rose-200 text-slate-400 hover:text-rose-600'
              }`}
              title="Report Invalid or Expired Job"
            >
              <Flag className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Track Application Button */}
          {onTrackApplication && (
            <button
              type="button"
              onClick={() => onTrackApplication(job)}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition ${
                theme === 'dark'
                  ? 'bg-[#1c2230] hover:bg-[#252e42] border-[#2e3952] text-slate-200'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
              }`}
              title="Track Application Status & Interviews"
            >
              Track
            </button>
          )}

          {/* 6. Primary Apply Now Action */}
          {onApplyByEmail && (
            <button
              type="button"
              onClick={() => onApplyByEmail(job)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold transition shadow-sm shadow-blue-500/20 flex items-center gap-1.5"
              title="Apply Now with Selected CV & Cover Letter"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>{applicationStatus === 'applied' || applicationStatus === 'submitted' ? 'Applied' : 'Apply Now'}</span>
            </button>
          )}

          {(job.applicationUrl || job.sourceUrl) && (
            <button
              type="button"
              onClick={() => {
                if (onApplyPortal) {
                  onApplyPortal(job);
                } else {
                  window.open(job.applicationUrl || job.sourceUrl, '_blank', 'noopener,noreferrer');
                }
              }}
              className={`p-2 rounded-xl border transition ${
                theme === 'dark'
                  ? 'bg-[#181d29] hover:bg-[#22293a] border-[#293245] text-slate-300 hover:text-white'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600 hover:text-blue-600'
              }`}
              title="Open Official Employer Careers Portal"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
