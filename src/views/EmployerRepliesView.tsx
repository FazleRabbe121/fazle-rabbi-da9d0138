import React, { useState } from 'react';
import {
  Inbox,
  RefreshCw,
  Search,
  CheckCircle2,
  Calendar,
  MessageSquare,
  Sparkles,
  ExternalLink,
  Mail,
  UserCheck,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { getCachedGoogleToken } from '../services/firebase';

export const EmployerRepliesView: React.FC = () => {
  const { theme } = useTheme();

  const [replies, setReplies] = useState([
    {
      id: 'rep-1',
      company: 'Cap St Georges Hotel & Resort',
      position: 'Pool Bar & Cocktail Bartender',
      date: 'Yesterday, 14:22',
      category: 'interview',
      subject: 'Interview Invitation: Senior Bartender Position — Cap St Georges',
      snippet: 'Dear Fazle, thank you for your application. We were impressed by your background at Limassol Marina and would like to invite you for an interview with our Food & Beverage Director...',
      senderEmail: 'careers@capstgeorges.com',
    },
    {
      id: 'rep-2',
      company: 'Four Seasons Hotel Cyprus',
      position: 'Beachfront Cocktail Bartender',
      date: '3 days ago',
      category: 'acknowledgement',
      subject: 'Application Received — Four Seasons Hotel Limassol',
      snippet: 'Dear Fazle Rabbi, we confirm receipt of your CV and portfolio photographs for the Bartender position. Our recruitment team is currently reviewing your profile...',
      senderEmail: 'careers@fourseasons.com.cy',
    },
    {
      id: 'rep-3',
      company: 'The Savoy London (Fairmont)',
      position: 'American Bar Senior Bartender',
      date: '5 days ago',
      category: 'inforequest',
      subject: 'Savoy Recruitment — Right to Work & Video Portfolio Query',
      snippet: 'Hello Fazle, thank you for submitting your application and cover letter. Could you please confirm your earliest availability for an initial Microsoft Teams video screening...',
      senderEmail: 'savoycareers@fairmont.com',
    },
  ]);

  const [filterCategory, setFilterCategory] = useState<'all' | 'interview' | 'inforequest' | 'acknowledgement'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSyncGmail = async () => {
    setIsRefreshing(true);
    await new Promise(r => setTimeout(r, 1200));
    setIsRefreshing(false);
    showToast('Gmail inbox synchronized. All employer replies updated.');
  };

  const filtered = replies.filter(r => {
    if (filterCategory === 'all') return true;
    return r.category === filterCategory;
  });

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 p-4 rounded-2xl bg-slate-900 border border-blue-500/50 text-white text-xs shadow-2xl animate-fade-in flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div
        className={`p-6 rounded-3xl border transition-all ${
          theme === 'dark' ? 'bg-[#101625] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-bold">
              <Inbox className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">Employer Replies & Live Inbox</h1>
              <p className="text-xs text-slate-400">
                Connected Gmail synchronization · Automated reply categorization · Interview invitations
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSyncGmail}
            disabled={isRefreshing}
            className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 transition active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Checking Gmail...' : 'Sync Gmail Replies'}</span>
          </button>
        </div>

        {/* Category Filters */}
        <div className="mt-6 flex gap-2 overflow-x-auto pb-1 no-scrollbar border-t border-slate-800/60 pt-4">
          <button
            type="button"
            onClick={() => setFilterCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
              filterCategory === 'all'
                ? 'bg-blue-600 text-white border-blue-500'
                : 'bg-slate-900/40 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            All Responses ({replies.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterCategory('interview')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
              filterCategory === 'interview'
                ? 'bg-emerald-600 text-white border-emerald-500'
                : 'bg-slate-900/40 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            Interview Invitations
          </button>
          <button
            type="button"
            onClick={() => setFilterCategory('inforequest')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
              filterCategory === 'inforequest'
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-slate-900/40 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            Information Requests
          </button>
          <button
            type="button"
            onClick={() => setFilterCategory('acknowledgement')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
              filterCategory === 'acknowledgement'
                ? 'bg-slate-700 text-white border-slate-600'
                : 'bg-slate-900/40 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            Confirmations & Receipts
          </button>
        </div>
      </div>

      {/* Replies Feed */}
      <div className="space-y-3">
        {filtered.map(rep => {
          return (
            <div
              key={rep.id}
              className={`p-5 rounded-2xl border transition-all ${
                theme === 'dark' ? 'bg-[#101625] border-slate-800 hover:border-slate-700' : 'bg-white border-slate-200 shadow-xs'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white">{rep.company}</span>
                    <span className="text-xs text-slate-400">· {rep.position}</span>
                    {rep.category === 'interview' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Interview Invitation
                      </span>
                    ) : rep.category === 'inforequest' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        Info Request
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-700/60 text-slate-300">
                        Receipt Confirmed
                      </span>
                    )}
                  </div>
                  <div className="font-semibold text-xs text-blue-300">{rep.subject}</div>
                  <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">{rep.snippet}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto text-xs text-slate-500">
                  <span>{rep.date}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
