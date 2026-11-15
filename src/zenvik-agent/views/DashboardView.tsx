import React, { useMemo } from 'react';
import {
  Flame,
  Wallet,
  Heart,
  Sparkles,
  ChevronRight,
  Clock,
  FileBarChart,
  FileText,
  Briefcase,
  Globe,
  ArrowRight,
  FileSpreadsheet,
  Search,
  Plane,
  Mail,
  Bell,
  Settings,
} from 'lucide-react';
import {
  UserProfile,
  UserSettings,
  ActivityRecord,
  FinanceRecord,
  FamilyMoneyRecord,
  RecipeRecord,
} from '../types';
import { NavTab } from '../components/BottomNav';
import { loadSavedJobs, loadApplications, buildEnrichedJobEntities } from '../services/jobSearchService';
import {
  loadFinanceSheetConfig,
  loadCachedSheetTransactions,
} from '../services/googleSheetsFinanceService';
import { useTheme } from '../context/ThemeContext';
import { CCDLogo } from '../components/CCDLogo';

interface DashboardViewProps {
  profile: UserProfile | null;
  settings: UserSettings;
  relapses: ActivityRecord[];
  finances: FinanceRecord[];
  familyMoney: FamilyMoneyRecord[];
  recipes: RecipeRecord[];
  onNavigate: (tab: NavTab) => void;
  onOpenRelapseModal: () => void;
  onOpenFinanceModal: (type?: 'income' | 'expense') => void;
  onOpenFamilyModal: () => void;
  onOpenRecipeModal: () => void;
  onOpenReportModal: () => void;
  onOpenUrgeGuide: () => void;
  isCloudSynced?: boolean;
  isOnline?: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  profile,
  settings,
  relapses,
  finances,
  familyMoney,
  onNavigate,
  onOpenReportModal,
  isCloudSynced = true,
  isOnline = true,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const currentMonth = new Date().toISOString().slice(0, 7);
  const displayTrackerTitle =
    settings.trackerSectionTitle || settings.habitName || 'Social Media Tracking';

  // Compute Streak Stats
  const sortedActivities = useMemo(() => {
    return [...relapses].sort((a, b) => b.timestamp - a.timestamp);
  }, [relapses]);

  const lastActivity = sortedActivities.length > 0 ? sortedActivities[0] : null;
  const streakStartTime = lastActivity
    ? lastActivity.timestamp
    : new Date(settings.habitStartDate || Date.now()).getTime();

  const now = Date.now();
  const diffMs = Math.max(0, now - streakStartTime);
  const currentStreakDays = Math.floor(diffMs / 86400000);
  const currentStreakHours = Math.floor((diffMs % 86400000) / 3600000);
  const dayCounterLabel =
    currentStreakDays === 0 ? 'Today • Day 1' : `Day ${currentStreakDays + 1}`;

  let longestStreak = currentStreakDays;
  for (let i = 0; i < sortedActivities.length; i++) {
    if (sortedActivities[i].streakDaysLost > longestStreak) {
      longestStreak = sortedActivities[i].streakDaysLost;
    }
  }

  // Job Search & Pipeline Metrics
  const savedJobs = useMemo(() => loadSavedJobs(), []);
  const applications = useMemo(() => loadApplications(), []);
  const allMasterJobs = useMemo(() => buildEnrichedJobEntities(), []);

  const appliedCount = applications.filter(
    a => a.status === 'applied' || a.status === 'new'
  ).length;
  const interviewCount = applications.filter(a => a.status === 'interview').length;
  const offerCount = applications.filter(a => a.status === 'offer').length;
  const highMatchJobsCount = allMasterJobs.filter(j => j.matchScore >= 80).length;
  const sponsorshipJobsCount = allMasterJobs.filter(
    j => j.visaSponsorshipStatus === 'confirmed'
  ).length;

  const topMatchJob = useMemo(() => {
    const sorted = [...allMasterJobs].sort((a, b) => b.matchScore - a.matchScore);
    return sorted[0];
  }, [allMasterJobs]);

  // Monthly Finances (combines connected Google Sheets records + local app records)
  const financeSheetConfig = useMemo(() => loadFinanceSheetConfig(), []);
  const cachedSheetTxs = useMemo(
    () => (financeSheetConfig ? loadCachedSheetTransactions() : []),
    [financeSheetConfig]
  );

  const monthlyFinances = finances.filter(f => f.date.startsWith(currentMonth));
  const monthlySheetTxs = cachedSheetTxs.filter(t => t.date.startsWith(currentMonth));

  const localIncome = monthlyFinances
    .filter(f => f.type === 'income')
    .reduce((sum, f) => sum + f.amount, 0);
  const localExpenses = monthlyFinances
    .filter(f => f.type === 'expense')
    .reduce((sum, f) => sum + f.amount, 0);

  const sheetIncome = monthlySheetTxs.reduce((sum, t) => sum + t.income, 0);
  const sheetExpenses = monthlySheetTxs.reduce((sum, t) => sum + t.expense, 0);

  const totalIncome = localIncome + sheetIncome;
  const totalExpenses = localExpenses + sheetExpenses;
  const monthlySavings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? Math.round((monthlySavings / totalIncome) * 100) : 0;

  // Monthly Family Money
  const monthlyFamilyTotal = familyMoney
    .filter(fm => fm.date.startsWith(currentMonth))
    .reduce((sum, fm) => sum + fm.amount, 0);

  const currency = settings.currency || '$';
  const candidateName = profile?.displayName || 'Fazle Rabbi';

  const glassPanelClass = isDark
    ? 'bg-[#1d1f26]/85 backdrop-blur-xl border border-white/[0.08] rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.45)]'
    : 'bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-[24px] shadow-[0_10px_30px_rgba(15,23,42,0.05)]';

  // Helper to render reference-video tick-mark radial dial
  const renderMiniTickDial = (
    pct: number,
    centerTitle: string,
    centerSub: string,
    activeColorHex: string
  ) => {
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    const ticks = 24;
    const litTicks = Math.round((clamped / 100) * ticks);

    return (
      <div className="relative w-32 h-32 mx-auto flex items-center justify-center select-none">
        <svg viewBox="0 0 140 140" className="w-full h-full">
          {Array.from({ length: ticks }).map((_, i) => {
            const angleDeg = -215 + (i / (ticks - 1)) * 250;
            const rad = (angleDeg * Math.PI) / 180;
            const x1 = 70 + 50 * Math.cos(rad);
            const y1 = 70 + 50 * Math.sin(rad);
            const x2 = 70 + 59 * Math.cos(rad);
            const y2 = 70 + 59 * Math.sin(rad);
            const active = i < litTicks;
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={
                  active
                    ? activeColorHex
                    : isDark
                    ? 'rgba(255,255,255,0.12)'
                    : 'rgba(15,23,42,0.12)'
                }
                strokeWidth="3"
                strokeLinecap="round"
              />
            );
          })}
          <circle
            cx="70"
            cy="70"
            r="41"
            fill="none"
            stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)'}
            strokeWidth="1.5"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
          <span className="text-lg font-extrabold font-mono tabular-nums text-white leading-none">
            {centerTitle}
          </span>
          <span className="text-[10px] text-zinc-400 font-semibold mt-1">{centerSub}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 sm:space-y-7 animate-fade-in pb-20">
      {/* ========================================================
          1. EXECUTIVE HERO PANEL & QUICK LAUNCHER (Reference Video Match)
          ======================================================== */}
      <div className={`${glassPanelClass} relative p-5 sm:p-7 overflow-hidden`}>
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-gradient-to-br from-emerald-500/10 via-sky-500/10 to-transparent blur-3xl pointer-events-none" />

        {/* Welcome Row + ZENVIK Brand & Circular FR Avatar */}
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <CCDLogo size={28} mode="icon" />
              <span className={`text-xs font-semibold ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                Welcome back,
              </span>
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                  isOnline && isCloudSynced
                    ? isDark
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : isDark
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                    : 'bg-amber-50 border-amber-200 text-amber-700'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isOnline && isCloudSynced ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
                  }`}
                />
                <span>{isOnline && isCloudSynced ? 'Cloud Synced' : 'Local Workspace'}</span>
              </div>
              {financeSheetConfig && (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                    isDark
                      ? 'bg-white/[0.06] text-zinc-200 border-white/[0.08]'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  <FileSpreadsheet className="w-3 h-3 text-emerald-500" />
                  <span>Sheet Connected: {financeSheetConfig.spreadsheetTitle}</span>
                </span>
              )}
            </div>

            <h1
              className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              {candidateName}
            </h1>
            <p className={`text-xs sm:text-sm font-medium ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
              ZENVIK Agent · AI Career &amp; Employment Platform · Executive Command Center
            </p>
          </div>

          {/* Circular FR Avatar Badge */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => onNavigate('settings')}
              className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full font-extrabold text-base sm:text-lg flex items-center justify-center shadow-lg transition hover:scale-105 cursor-pointer ${
                isDark
                  ? 'bg-white text-[#141517]'
                  : 'bg-slate-900 text-white'
              }`}
              title="Open Profile & Settings"
            >
              FR
            </button>
          </div>
        </div>

        {/* Clean Pill Search Bar Trigger */}
        <div className="relative z-10 mt-5">
          <div
            onClick={() => onNavigate('ai-job-search')}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border bg-[#14161b]/90 border-white/[0.08] hover:border-white/20 text-zinc-400 cursor-pointer transition-all"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Search className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-xs sm:text-sm truncate">
                Search jobs, countries, visa sponsors, or companies...
              </span>
            </div>
            <span className="px-3 py-1 rounded-xl bg-white text-[#141517] text-[11px] font-bold shrink-0">
              Search
            </span>
          </div>
        </div>

        {/* 6 Glassmorphic Quick-Access Cards Grid */}
        <div className="relative z-10 mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* 1. Finance & Expense Tracker (Google Sheets) */}
          <button
            type="button"
            onClick={() => onNavigate('finance')}
            className="group p-4 rounded-2xl border bg-[#14161b]/90 border-white/[0.08] hover:border-emerald-400/50 text-left transition-all hover:-translate-y-0.5 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Wallet className="w-5 h-5" />
            </div>
            <div className="font-bold text-xs sm:text-sm leading-snug text-white">
              Finance &amp; Expense
            </div>
            <div className="text-[11px] text-emerald-400 font-medium mt-0.5">
              Google Sheets Sync
            </div>
          </button>

          {/* 2. Europe Job Market */}
          <button
            type="button"
            onClick={() => onNavigate('europe-jobs')}
            className="group p-4 rounded-2xl border bg-[#14161b]/90 border-white/[0.08] hover:border-sky-400/50 text-left transition-all hover:-translate-y-0.5 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/30 text-sky-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Globe className="w-5 h-5" />
            </div>
            <div className="font-bold text-xs sm:text-sm leading-snug text-white">
              Europe Job Market
            </div>
            <div className="text-[11px] text-sky-400 font-medium mt-0.5">
              Explore jobs in Europe
            </div>
          </button>

          {/* 3. Sponsorship Jobs */}
          <button
            type="button"
            onClick={() => onNavigate('sponsorship-jobs')}
            className="group p-4 rounded-2xl border bg-[#14161b]/90 border-white/[0.08] hover:border-violet-400/50 text-left transition-all hover:-translate-y-0.5 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/30 text-violet-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Plane className="w-5 h-5" />
            </div>
            <div className="font-bold text-xs sm:text-sm leading-snug text-white">
              Sponsorship Jobs
            </div>
            <div className="text-[11px] text-violet-400 font-medium mt-0.5">
              Visa-sponsored roles
            </div>
          </button>

          {/* 4. Search Jobs */}
          <button
            type="button"
            onClick={() => onNavigate('ai-job-search')}
            className="group p-4 rounded-2xl border bg-[#14161b]/90 border-white/[0.08] hover:border-amber-400/50 text-left transition-all hover:-translate-y-0.5 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Search className="w-5 h-5" />
            </div>
            <div className="font-bold text-xs sm:text-sm leading-snug text-white">
              Search Jobs
            </div>
            <div className="text-[11px] text-amber-400 font-medium mt-0.5">
              Find specific roles
            </div>
          </button>

          {/* 5. Applications */}
          <button
            type="button"
            onClick={() => onNavigate('application-history')}
            className="group p-4 rounded-2xl border bg-[#14161b]/90 border-white/[0.08] hover:border-rose-400/50 text-left transition-all hover:-translate-y-0.5 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Mail className="w-5 h-5" />
            </div>
            <div className="font-bold text-xs sm:text-sm leading-snug text-white">
              Applications
            </div>
            <div className="text-[11px] text-rose-400 font-medium mt-0.5">
              Track your status
            </div>
          </button>

          {/* 6. Job Alerts / Saved */}
          <button
            type="button"
            onClick={() => onNavigate('saved-jobs')}
            className="group p-4 rounded-2xl border bg-[#14161b]/90 border-white/[0.08] hover:border-cyan-400/50 text-left transition-all hover:-translate-y-0.5 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Bell className="w-5 h-5" />
            </div>
            <div className="font-bold text-xs sm:text-sm leading-snug text-white">
              Job Alerts
            </div>
            <div className="text-[11px] text-cyan-400 font-medium mt-0.5">
              Saved ({savedJobs.length})
            </div>
          </button>
        </div>

        {/* Action Strip */}
        <div className="relative z-10 mt-5 p-4 rounded-2xl border bg-[#14161b]/90 border-white/[0.08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-white text-[#141517] flex items-center justify-center shadow-sm shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Executive Career &amp; Financial Intelligence
              </h3>
              <p className="text-xs text-zinc-400">
                Verified hospitality opportunities, CV Library, and real-time Google Sheets expense analytics
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('cv')}
              className="px-3.5 py-2 rounded-full border border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.1] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              <span>CV Library</span>
            </button>
            <button
              type="button"
              onClick={onOpenReportModal}
              className="px-3.5 py-2 rounded-full border border-white/[0.1] bg-white/[0.05] hover:bg-white/[0.1] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <FileBarChart className="w-3.5 h-3.5 text-sky-400" />
              <span>AI Report</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('finance')}
              className="px-4 py-2 rounded-full bg-white text-[#141517] hover:bg-zinc-100 font-bold text-xs shadow-md transition cursor-pointer"
            >
              Finance Tracker &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================
          2. PRIMARY KPI & RADIAL DIAL GRID (Reference Video Aesthetic)
          ======================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Card 1: Finance & Expense Tracker Radial Dial */}
        <div
          onClick={() => onNavigate('finance')}
          className={`${glassPanelClass} group p-6 cursor-pointer flex flex-col justify-between transition-all hover:border-emerald-500/40`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Finance &amp; Expense Tracker</div>
                <div className="text-[11px] text-zinc-400">
                  {financeSheetConfig ? 'Google Sheets Live Sync' : 'Monthly Cashflow & Savings'}
                </div>
              </div>
            </div>
            <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-emerald-300 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30">
              {savingsRate}% Saved
            </span>
          </div>

          <div className="my-3">
            {renderMiniTickDial(
              Math.max(0, savingsRate),
              `${currency}${monthlySavings.toFixed(0)}`,
              'Net Balance',
              '#34d399'
            )}
            <div className="text-xs text-center text-zinc-400 font-mono tabular-nums mt-2">
              Inc: {currency}
              {totalIncome.toFixed(0)} • Exp: {currency}
              {totalExpenses.toFixed(0)}
            </div>
          </div>

          <div className="pt-3 border-t border-white/[0.07] flex items-center justify-between text-xs text-emerald-400 font-semibold">
            <span>Open Finance &amp; Google Sheets Analytics</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Card 2: Dynamic Activity Tracker & Streak Radial Dial */}
        <div
          onClick={() => onNavigate('relapse')}
          className={`${glassPanelClass} group p-6 cursor-pointer flex flex-col justify-between transition-all hover:border-sky-500/40`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white truncate max-w-[160px]">
                  {displayTrackerTitle}
                </div>
                <div className="text-[11px] text-zinc-400">{dayCounterLabel}</div>
              </div>
            </div>
            <span className="text-[10px] font-mono uppercase font-bold text-sky-300 px-2.5 py-1 rounded-full bg-sky-500/15 border border-sky-500/30">
              Peak: {longestStreak}d
            </span>
          </div>

          <div className="my-3">
            {renderMiniTickDial(
              Math.min(100, (currentStreakDays / Math.max(1, longestStreak || 30)) * 100),
              `${currentStreakDays}d`,
              `+${currentStreakHours}h clean`,
              '#38bdf8'
            )}
            <div className="text-xs text-center text-zinc-400 mt-2 flex items-center justify-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              <span>Active streak momentum</span>
            </div>
          </div>

          <div className="pt-3 border-t border-white/[0.07] flex items-center justify-between text-xs text-sky-400 font-semibold">
            <span>Activity History &amp; Streak</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* Card 3: Family Support & Remittances */}
        <div
          onClick={() => onNavigate('family')}
          className={`${glassPanelClass} group p-6 cursor-pointer flex flex-col justify-between transition-all hover:border-violet-500/40`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
                <Heart className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Family Support</div>
                <div className="text-[11px] text-zinc-400">Monthly Remittances</div>
              </div>
            </div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-300 px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.08]">
              This Month
            </span>
          </div>

          <div className="my-3">
            {renderMiniTickDial(
              monthlyFamilyTotal > 0 ? 75 : 15,
              `${currency}${monthlyFamilyTotal.toFixed(0)}`,
              'Sent this month',
              '#a78bfa'
            )}
            <div className="text-xs text-center text-zinc-400 mt-2">
              Supporting parents &amp; family milestones
            </div>
          </div>

          <div className="pt-3 border-t border-white/[0.07] flex items-center justify-between text-xs text-violet-400 font-semibold">
            <span>Family Money Ledger</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>

      {/* ========================================================
          3. CAREER & JOB APPLICATION PIPELINE SECTION
          ======================================================== */}
      <div className={`${glassPanelClass} p-6 space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.07]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-white">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold leading-tight text-white">
                Career &amp; Job Application Pipeline
              </h2>
              <p className="text-xs text-zinc-400">
                UK, Australia, New Zealand, Malta, Greece, Cyprus &amp; Europe verified hospitality opportunities
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('europe-jobs')}
              className="text-xs text-sky-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Europe Job Market</span>
            </button>
            <span className="text-zinc-600">·</span>
            <button
              onClick={() => onNavigate('sponsorship-jobs')}
              className="text-xs text-emerald-400 hover:underline font-bold flex items-center gap-1 cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>Sponsorship</span>
            </button>
          </div>
        </div>

        {/* 6 Metric KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div
            onClick={() => onNavigate('europe-jobs')}
            className="p-3.5 rounded-2xl border bg-[#14161b]/90 border-white/[0.06] hover:border-sky-500/40 text-center cursor-pointer transition"
          >
            <span className="text-[10px] uppercase font-bold text-zinc-400 block">
              Europe Market
            </span>
            <span className="text-xl font-black font-mono tabular-nums text-sky-400 mt-1 block">
              {highMatchJobsCount}
            </span>
            <span className="text-[10px] text-zinc-500">Live Vacancies</span>
          </div>

          <div
            onClick={() => onNavigate('sponsorship-jobs')}
            className="p-3.5 rounded-2xl border bg-[#14161b]/90 border-white/[0.06] hover:border-emerald-500/40 text-center cursor-pointer transition"
          >
            <span className="text-[10px] uppercase font-bold text-zinc-400 block">
              Sponsorship
            </span>
            <span className="text-xl font-black font-mono tabular-nums text-emerald-400 mt-1 block">
              {sponsorshipJobsCount}
            </span>
            <span className="text-[10px] text-zinc-500">Confirmed Visa</span>
          </div>

          <div
            onClick={() => onNavigate('saved-jobs')}
            className="p-3.5 rounded-2xl border bg-[#14161b]/90 border-white/[0.06] hover:border-amber-500/40 text-center cursor-pointer transition"
          >
            <span className="text-[10px] uppercase font-bold text-zinc-400 block">
              Saved Jobs
            </span>
            <span className="text-xl font-black font-mono tabular-nums text-amber-400 mt-1 block">
              {savedJobs.length}
            </span>
            <span className="text-[10px] text-zinc-500">Bookmarked</span>
          </div>

          <div
            onClick={() => onNavigate('application-history')}
            className="p-3.5 rounded-2xl border bg-[#14161b]/90 border-white/[0.06] hover:border-indigo-500/40 text-center cursor-pointer transition"
          >
            <span className="text-[10px] uppercase font-bold text-zinc-400 block">
              Applied Jobs
            </span>
            <span className="text-xl font-black font-mono tabular-nums text-indigo-400 mt-1 block">
              {appliedCount}
            </span>
            <span className="text-[10px] text-zinc-500">Submitted</span>
          </div>

          <div
            onClick={() => onNavigate('jobs')}
            className="p-3.5 rounded-2xl border bg-[#14161b]/90 border-white/[0.06] hover:border-violet-500/40 text-center cursor-pointer transition"
          >
            <span className="text-[10px] uppercase font-bold text-zinc-400 block">
              Interviews
            </span>
            <span className="text-xl font-black font-mono tabular-nums text-violet-400 mt-1 block">
              {interviewCount}
            </span>
            <span className="text-[10px] text-zinc-500">In Progress</span>
          </div>

          <div
            onClick={() => onNavigate('jobs')}
            className="p-3.5 rounded-2xl border bg-[#14161b]/90 border-white/[0.06] hover:border-emerald-500/40 text-center cursor-pointer transition"
          >
            <span className="text-[10px] uppercase font-bold text-zinc-400 block">Offers</span>
            <span className="text-xl font-black font-mono tabular-nums text-emerald-300 mt-1 block">
              {offerCount}
            </span>
            <span className="text-[10px] text-zinc-500">Received</span>
          </div>
        </div>

        {/* Top Match Showcase Card */}
        {topMatchJob && (
          <div className="p-4 rounded-2xl border bg-[#14161b]/90 border-white/[0.08] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/[0.08] text-white border border-white/[0.1]">
                  TOP MATCH: {topMatchJob.matchScore}%
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Confirmed Sponsorship
                </span>
              </div>
              <h3 className="text-base font-bold text-white">
                {topMatchJob.title} — {topMatchJob.company}
              </h3>
              <p className="text-xs text-zinc-400">
                {topMatchJob.location} • {topMatchJob.salary} • {topMatchJob.experienceRequired}
              </p>
            </div>

            <button
              onClick={() => onNavigate('jobs')}
              className="px-4 py-2 rounded-xl bg-white text-[#141517] hover:bg-zinc-100 font-bold text-xs shadow-md shrink-0 transition cursor-pointer"
            >
              Apply Now &rarr;
            </button>
          </div>
        )}

        {/* Dual Google Sheets Banner: Applications Tracker & Personal Finance Tracker */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div
            onClick={() => onNavigate('finance')}
            className="p-4 rounded-2xl border bg-[#14161b]/90 border-emerald-500/30 hover:border-emerald-400 cursor-pointer transition flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center font-bold">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <span>Google Sheets Finance &amp; Expense Tracker</span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] bg-emerald-500/20 text-emerald-300 font-bold uppercase">
                    Live Sync
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400">
                  Connect your daily financial spreadsheet for automated analytics &amp; monthly reports
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-emerald-400 group-hover:translate-x-1 transition-transform" />
          </div>

          <div
            onClick={() => onNavigate('google-sheets')}
            className="p-4 rounded-2xl border bg-[#14161b]/90 border-white/[0.08] hover:border-white/25 cursor-pointer transition flex items-center justify-between group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center font-bold">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <span>Google Sheets Applications Tracker</span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] bg-sky-500/20 text-sky-300 font-bold uppercase">
                    Drive Sync
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400">
                  Manage all applied vacancies, recruiter emails, and statuses live in Google Drive
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-sky-400 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>
    </div>
  );
};
