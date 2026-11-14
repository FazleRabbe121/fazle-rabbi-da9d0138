import React from 'react';
import {
  LayoutDashboard,
  Globe,
  Plane,
  MapPin,
  Briefcase,
  FileText,
  Mail,
  Clock,
  Settings,
  Menu,
  Cpu,
  UtensilsCrossed,
  Award,
  Wallet,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { NavTab } from './SidebarNav';

export { type NavTab } from './SidebarNav';

interface BottomNavProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onToggleMobileMenu?: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onSelectTab,
  onToggleMobileMenu,
}) => {
  const { theme } = useTheme();

  const tabs: { id: NavTab; label: string; icon: any; isMenu?: boolean }[] = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'finance', label: 'Finance', icon: Wallet },
    { id: 'personal-ai', label: 'Personal AI', icon: Cpu },
    { id: 'recipe-book', label: 'Recipe Book', icon: UtensilsCrossed },
    { id: 'certificate', label: 'Certificate', icon: Award },
    { id: 'europe-jobs', label: 'Europe', icon: Globe },
    { id: 'sponsorship-jobs', label: 'Sponsorship', icon: Plane },
    { id: 'cyprus-jobs', label: 'Cyprus', icon: MapPin },
    { id: 'ai-job-search', label: 'Search', icon: Briefcase },
    { id: 'cv-library', label: 'CV', icon: FileText },
    { id: 'gmail-center', label: 'Apply', icon: Mail },
    { id: 'application-history', label: 'History', icon: Clock },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const isTabActive = (tabId: NavTab) => {
    if (currentTab === tabId) return true;
    if (tabId === 'europe-jobs' || tabId === 'europe' || tabId === 'europe-job-market') {
      return currentTab === 'europe-jobs' || currentTab === 'europe' || currentTab === 'europe-job-market';
    }
    if (tabId === 'sponsorship-jobs' || tabId === 'sponsorship' || tabId === 'global-sponsorship') {
      return currentTab === 'sponsorship-jobs' || currentTab === 'sponsorship' || currentTab === 'global-sponsorship';
    }
    if (tabId === 'cyprus-jobs' || tabId === 'cyprus') {
      return currentTab === 'cyprus-jobs' || currentTab === 'cyprus';
    }
    if (tabId === 'cv-library' || tabId === 'cv') return currentTab === 'cv-library' || currentTab === 'cv';
    if (tabId === 'gmail-center' || tabId === 'apply-email') return currentTab === 'gmail-center' || currentTab === 'apply-email';
    if (tabId === 'ai-job-search' || tabId === 'jobs') return currentTab === 'ai-job-search' || currentTab === 'jobs';
    if (tabId === 'recipe-book' || tabId === 'recipes') return currentTab === 'recipe-book' || currentTab === 'recipes';
    return false;
  };

  const handleTabClick = (tabId: NavTab) => {
    if (tabId === 'europe' || tabId === 'europe-job-market') {
      onSelectTab('europe-jobs');
    } else if (tabId === 'sponsorship' || tabId === 'global-sponsorship') {
      onSelectTab('sponsorship-jobs');
    } else if (tabId === 'cyprus') {
      onSelectTab('cyprus-jobs');
    } else {
      onSelectTab(tabId);
    }
  };

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-40 backdrop-blur-2xl border-t pb-safe pt-1 px-1 sm:px-4 transition-all ${
        theme === 'dark'
          ? 'bg-[#15171c]/95 border-white/[0.07]'
          : 'bg-white/95 border-slate-200/80 shadow-[0_-4px_20px_-2px_rgba(15,23,42,0.05)]'
      }`}
    >
      <div className="max-w-5xl mx-auto flex items-center justify-between sm:justify-around overflow-x-auto no-scrollbar py-1 gap-1">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = isTabActive(tab.id);

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabClick(tab.id)}
              title={tab.label}
              className={`relative flex flex-col items-center justify-center py-1 px-2 sm:px-3 rounded-2xl transition-all duration-200 shrink-0 cursor-pointer ${
                isActive
                  ? theme === 'dark'
                    ? 'text-white'
                    : 'text-slate-900'
                  : theme === 'dark'
                  ? 'text-zinc-400 hover:text-zinc-200'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <div
                className={`p-1.5 rounded-xl transition-all ${
                  isActive
                    ? theme === 'dark'
                      ? 'bg-white text-[#141517] shadow-md scale-105'
                      : 'bg-slate-900 text-white shadow-sm scale-105'
                    : theme === 'dark'
                    ? 'hover:bg-white/[0.06]'
                    : 'hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>

              <span
                className={`text-[9px] sm:text-[10px] tracking-tight mt-0.5 font-medium max-w-[68px] sm:max-w-none truncate text-center ${
                  isActive
                    ? theme === 'dark'
                      ? 'text-white font-bold'
                      : 'text-slate-900 font-bold'
                    : theme === 'dark'
                    ? 'text-zinc-400'
                    : 'text-slate-500'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}

        {onToggleMobileMenu && (
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className={`lg:hidden relative flex flex-col items-center justify-center py-1 px-2 rounded-2xl transition-all shrink-0 cursor-pointer ${
              theme === 'dark' ? 'text-zinc-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
            }`}
            title="Open all sections menu"
          >
            <div className={`p-1.5 rounded-xl ${theme === 'dark' ? 'hover:bg-white/[0.06]' : 'hover:bg-slate-100'}`}>
              <Menu className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <span className="text-[9px] sm:text-[10px] tracking-tight mt-0.5 font-medium">
              More
            </span>
          </button>
        )}
      </div>
    </nav>
  );
};
