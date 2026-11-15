import React, { useState } from 'react';
import {
  LayoutDashboard,
  Globe,
  MapPin,
  Plane,
  Bot,
  Bookmark,
  FileText,
  Scroll,
  Image as ImageIcon,
  Mail,
  Layers,
  Clock,
  Inbox,
  AlertOctagon,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Flame,
  Wallet,
  Heart,
  UtensilsCrossed,
  FileBarChart,
  TrendingUp,
  X,
  FileSpreadsheet,
  Mic,
  Cpu,
  Award,
} from 'lucide-react';
import { useTheme, ThemeToggle } from '../context/ThemeContext';
import { CCDLogo } from './CCDLogo';

export type NavTab =
  | 'dashboard'
  | 'personal-ai'
  | 'recipe-book'
  | 'google-sheets'
  | 'europe-jobs'
  | 'europe'
  | 'europe-job-market'
  | 'cyprus-jobs'
  | 'cyprus'
  | 'sponsorship-jobs'
  | 'sponsorship'
  | 'global-sponsorship'
  | 'ai-job-search'
  | 'saved-jobs'
  | 'cv-library'
  | 'cover-letters'
  | 'photos-docs'
  | 'certificate'
  | 'gmail-center'
  | 'bulk-queue'
  | 'application-history'
  | 'employer-replies'
  | 'rejected-reapply'
  | 'settings'
  // Preserved personal & finance sections
  | 'jobs'
  | 'relapse'
  | 'finance'
  | 'family'
  | 'recipes'
  | 'ai'
  | 'reports'
  | 'stats'
  | 'cv'
  | 'apply-email'
  | 'interview-admin'
  | 'interview-portal';

interface SidebarNavProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  savedJobsCount?: number;
  approvedCount?: number;
  repliesCount?: number;
  rejectionsCount?: number;
  historyCount?: number;
  userEmail?: string;
  userName?: string;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  currentTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  savedJobsCount = 0,
  approvedCount = 0,
  repliesCount = 0,
  rejectionsCount = 0,
  historyCount = 0,
  userEmail = 'fazle.rabbe.doc@gmail.com',
  userName = 'Fazle Rabbi',
}) => {
  const { theme } = useTheme();
  const [isPersonalHubOpen, setIsPersonalHubOpen] = useState(true);

  // Group 1: Core Dashboard, Finance & Markets
  const marketItems = [
    { id: 'dashboard' as NavTab, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'finance' as NavTab, label: 'Finance & Expense Tracker', icon: Wallet, badge: 'Sheets', pulse: true },
    { id: 'personal-ai' as NavTab, label: 'Personal AI', icon: Cpu, badge: 'AI Chat' },
    { id: 'recipe-book' as NavTab, label: 'Recipe Book', icon: UtensilsCrossed, badge: 'AI Vault' },
    { id: 'europe-jobs' as NavTab, label: 'Europe Job Market', icon: Globe, pulse: true },
    { id: 'cyprus-jobs' as NavTab, label: 'Cyprus Job Market', icon: MapPin },
    { id: 'sponsorship-jobs' as NavTab, label: 'Sponsorship', icon: Plane, badge: 'Worldwide' },
    { id: 'ai-job-search' as NavTab, label: 'AI Job Search', icon: Bot },
    { id: 'saved-jobs' as NavTab, label: 'Saved Jobs', icon: Bookmark, count: savedJobsCount },
  ];

  // Group 2: Candidate Materials & Documents
  const candidateMaterials = [
    { id: 'cv-library' as NavTab, label: 'CV Library', icon: FileText },
    { id: 'cover-letters' as NavTab, label: 'Cover Letter Manager', icon: Scroll },
    { id: 'photos-docs' as NavTab, label: 'Professional Photos & Docs', icon: ImageIcon },
    { id: 'interview-admin' as NavTab, label: 'AI Interview Center', icon: Mic, badge: 'Gemini' },
    { id: 'certificate' as NavTab, label: 'Certificate', icon: Award, badge: 'Belvoriné' },
  ];

  // Group 3: Gmail, Applications & History
  const applicationWorkflow = [
    { id: 'gmail-center' as NavTab, label: 'Gmail Application Center', icon: Mail },
    { id: 'bulk-queue' as NavTab, label: 'Email Delivery Center & Queue', icon: Layers, count: approvedCount, badge: 'Queue' },
    { id: 'google-sheets' as NavTab, label: 'Google Sheets Tracker', icon: FileSpreadsheet, badge: 'Live' },
    { id: 'application-history' as NavTab, label: 'Application History', icon: Clock, count: historyCount },
    { id: 'employer-replies' as NavTab, label: 'Employer Replies', icon: Inbox, count: repliesCount, highlight: repliesCount > 0 },
    { id: 'rejected-reapply' as NavTab, label: 'Rejected & Reapply Later', icon: AlertOctagon, count: rejectionsCount },
    { id: 'settings' as NavTab, label: 'Profile & Settings', icon: Settings },
  ];

  // Group 4: Personal Wellness & Financial Hub
  const personalItems = [
    { id: 'finance' as NavTab, label: 'Finance & Expense Tracker', icon: Wallet },
    { id: 'family' as NavTab, label: 'Family Money', icon: Heart },
    { id: 'relapse' as NavTab, label: 'Habit & Recovery', icon: Flame },
    { id: 'recipes' as NavTab, label: 'Recipe Library', icon: UtensilsCrossed },
    { id: 'reports' as NavTab, label: 'AI Reports', icon: FileBarChart },
    { id: 'stats' as NavTab, label: 'Progress Stats', icon: TrendingUp },
  ];

  const handleItemClick = (id: NavTab) => {
    if (id === 'europe' || id === 'europe-job-market') {
      onSelectTab('europe-jobs');
    } else if (id === 'sponsorship' || id === 'global-sponsorship') {
      onSelectTab('sponsorship-jobs');
    } else if (id === 'cyprus') {
      onSelectTab('cyprus-jobs');
    } else {
      onSelectTab(id);
    }
    onCloseMobile();
  };

  const renderNavButton = (
    item: {
      id: NavTab;
      label: string;
      icon: any;
      count?: number;
      badge?: string;
      pulse?: boolean;
      highlight?: boolean;
    },
    sectionKey?: string
  ) => {
    const Icon = item.icon;
    const isActive =
      currentTab === item.id ||
      ((item.id === 'europe-jobs' || item.id === 'europe' || item.id === 'europe-job-market') &&
        (currentTab === 'europe-jobs' || currentTab === 'europe' || currentTab === 'europe-job-market')) ||
      ((item.id === 'sponsorship-jobs' || item.id === 'sponsorship' || item.id === 'global-sponsorship') &&
        (currentTab === 'sponsorship-jobs' || currentTab === 'sponsorship' || currentTab === 'global-sponsorship')) ||
      ((item.id === 'cyprus-jobs' || item.id === 'cyprus') &&
        (currentTab === 'cyprus-jobs' || currentTab === 'cyprus')) ||
      (item.id === 'cv-library' && currentTab === 'cv') ||
      (item.id === 'cv' && currentTab === 'cv-library') ||
      (item.id === 'gmail-center' && currentTab === 'apply-email') ||
      (item.id === 'apply-email' && currentTab === 'gmail-center') ||
      (item.id === 'ai-job-search' && currentTab === 'jobs') ||
      (item.id === 'jobs' && currentTab === 'ai-job-search') ||
      (item.id === 'recipe-book' && currentTab === 'recipes') ||
      (item.id === 'recipes' && currentTab === 'recipe-book');

    return (
      <button
        key={`${sectionKey || 'nav'}-${item.id}`}
        type="button"
        onClick={() => handleItemClick(item.id)}
        title={isCollapsed ? item.label : undefined}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left text-xs font-semibold transition-all duration-200 group relative cursor-pointer ${
          isActive
            ? theme === 'dark'
              ? 'bg-white text-[#141517] font-bold shadow-[0_8px_20px_rgba(255,255,255,0.14)]'
              : 'bg-slate-900 text-white font-bold shadow-md'
            : theme === 'dark'
            ? 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/90'
        }`}
      >
        <div
          className={`shrink-0 p-1 rounded-lg transition-colors ${
            isActive
              ? theme === 'dark'
                ? 'text-[#141517]'
                : 'text-white'
              : theme === 'dark'
              ? 'text-zinc-400 group-hover:text-white'
              : 'text-slate-500 group-hover:text-slate-900'
          }`}
        >
          <Icon className="w-4 h-4" />
        </div>

        {!isCollapsed && (
          <div className="flex-1 min-w-0 flex items-center justify-between gap-1.5">
            <span className="truncate">{item.label}</span>
            <div className="flex items-center gap-1 shrink-0">
              {item.pulse && (
                <span className="flex h-2 w-2 relative" title="Live sync active">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              )}
              {item.badge && (
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border ${
                    isActive
                      ? 'bg-[#141517]/10 text-[#141517] border-[#141517]/20'
                      : theme === 'dark'
                      ? 'bg-white/[0.06] text-zinc-300 border-white/[0.1]'
                      : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {item.badge}
                </span>
              )}
              {typeof item.count === 'number' && item.count > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    isActive
                      ? 'bg-[#141517] text-white'
                      : item.highlight
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : theme === 'dark'
                      ? 'bg-white/[0.08] text-zinc-300'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {item.count}
                </span>
              )}
            </div>
          </div>
        )}
      </button>
    );
  };

  return (
    <>
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden transition-opacity"
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col border-r transition-all duration-300 ease-in-out ${
          theme === 'dark'
            ? 'bg-[#17191f]/90 backdrop-blur-2xl border-white/[0.07]'
            : 'bg-white/95 backdrop-blur-2xl border-slate-200/80 shadow-[4px_0_24px_-4px_rgba(15,23,42,0.04)]'
        } ${isCollapsed ? 'lg:w-[72px]' : 'lg:w-64'} ${
          isMobileOpen ? 'translate-x-0 w-72' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Sidebar Header */}
        <div
          className={`h-16 flex items-center justify-between px-3 border-b ${
            theme === 'dark' ? 'border-white/[0.07]' : 'border-slate-100'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0 overflow-hidden">
            {isCollapsed ? (
              <CCDLogo size={36} mode="icon" />
            ) : (
              <CCDLogo size={34} mode="lockup" />
            )}
          </div>

          <button
            type="button"
            onClick={onToggleCollapse}
            className={`hidden lg:flex p-1.5 rounded-xl border transition cursor-pointer ${
              theme === 'dark'
                ? 'border-white/[0.08] hover:bg-white/[0.08] text-zinc-400 hover:text-white'
                : 'border-slate-200 hover:bg-slate-100 text-slate-500 hover:text-slate-900'
            }`}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onCloseMobile}
            className={`lg:hidden p-1.5 rounded-xl ${
              theme === 'dark' ? 'text-zinc-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Groups */}
        <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4 no-scrollbar">
          <div>
            {!isCollapsed && (
              <div className="px-3 pb-1.5 text-[10px] font-bold tracking-wider uppercase text-zinc-500">
                Core &amp; Markets
              </div>
            )}
            <div className="space-y-1">{marketItems.map(item => renderNavButton(item, 'main'))}</div>
          </div>

          <div>
            {!isCollapsed && (
              <div className="px-3 pb-1.5 text-[10px] font-bold tracking-wider uppercase text-zinc-500">
                Candidate Materials
              </div>
            )}
            <div className="space-y-1">{candidateMaterials.map(item => renderNavButton(item, 'mat'))}</div>
          </div>

          <div>
            {!isCollapsed && (
              <div className="px-3 pb-1.5 text-[10px] font-bold tracking-wider uppercase text-zinc-500">
                Outreach &amp; History
              </div>
            )}
            <div className="space-y-1">{applicationWorkflow.map(item => renderNavButton(item, 'out'))}</div>
          </div>

          <div className={`pt-2 border-t ${theme === 'dark' ? 'border-white/[0.07]' : 'border-slate-100'}`}>
            {!isCollapsed ? (
              <button
                type="button"
                onClick={() => setIsPersonalHubOpen(!isPersonalHubOpen)}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-bold tracking-wider uppercase rounded-xl transition cursor-pointer ${
                  theme === 'dark'
                    ? 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                <span>Personal &amp; Finance Hub</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${isPersonalHubOpen ? 'rotate-180' : ''}`}
                />
              </button>
            ) : null}

            {(!isCollapsed ? isPersonalHubOpen : true) && (
              <div className="space-y-1 mt-1">
                {personalItems.map(item => renderNavButton(item, 'personal'))}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Theme Switcher (Reference Video Match) & User Profile */}
        <div
          className={`p-3 border-t shrink-0 space-y-2.5 ${
            theme === 'dark' ? 'border-white/[0.07] bg-[#14161b]/80' : 'border-slate-100 bg-slate-50/70'
          }`}
        >
          {!isCollapsed && (
            <div className="flex justify-center">
              <ThemeToggle className="w-full justify-between" />
            </div>
          )}

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-white text-[#141517] font-extrabold text-xs flex items-center justify-center shrink-0 shadow-sm">
              {userName
                .split(' ')
                .map(n => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase() || 'FR'}
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <div className={`text-xs font-bold truncate ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                  {userName}
                </div>
                <div className="text-[10px] text-zinc-400 truncate">{userEmail}</div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
