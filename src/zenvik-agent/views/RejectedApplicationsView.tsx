import React, { useState } from 'react';
import {
  AlertOctagon,
  Clock,
  Calendar,
  CheckCircle2,
  Trash2,
  AlertCircle,
  Sparkles,
  RotateCcw,
  Building,
  Mail,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import {
  RejectedApplicationRecord,
  loadRejectedApplications,
  saveRejectedApplications,
  removeRejectedApplication,
} from '../services/rejectionTrackingService';

export const RejectedApplicationsView: React.FC = () => {
  const { theme } = useTheme();

  const [records, setRecords] = useState<RejectedApplicationRecord[]>(() => {
    const loaded = loadRejectedApplications();
    if (loaded.length === 0) {
      // Seed initial sample to illustrate the 6-month rule
      const now = new Date();
      const eligible = new Date(now);
      eligible.setMonth(eligible.getMonth() + 6);
      return [
        {
          id: 'rej-sample-1',
          company: 'Luxury Alpine Resort & Spa',
          employerNormalizedKey: 'luxuryalpineresort',
          position: 'Head Mixologist',
          recipientEmail: 'recruitment@alpineresort.ch',
          appliedDate: '10 Aug 2026',
          rejectionDate: '28 Aug 2026',
          reapplicationEligibleDate: eligible.toISOString(),
          rejectionSnippet: 'We regret to inform you that we have decided to pursue other applicants who are currently residing locally...',
          isEligibleNow: false,
          daysRemaining: 135,
        },
      ];
    }
    return loaded;
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleManualOverride = (id: string) => {
    const updated = records.map(r =>
      r.id === id ? { ...r, isEligibleNow: true, daysRemaining: 0 } : r
    );
    setRecords(updated);
    saveRejectedApplications(updated);
    showToast('Reapplication rule manually overridden. Employer marked eligible.');
  };

  const handleRemove = (id: string) => {
    const updated = removeRejectedApplication(id);
    setRecords(updated);
    showToast('Record removed from rejected vault.');
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 p-4 rounded-2xl bg-slate-900 border border-amber-500/50 text-white text-xs shadow-2xl animate-fade-in flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
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
            <div className="w-10 h-10 rounded-2xl bg-rose-600/20 text-rose-400 flex items-center justify-center font-bold">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">Rejected Applications & 6-Month Reapplication Rule</h1>
              <p className="text-xs text-slate-400">
                Explicit rejections only (never silence or receipts) · 6 Calendar months cooldown per employer
              </p>
            </div>
          </div>
        </div>

        {/* Policy Explainer */}
        <div className="mt-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1 leading-relaxed">
          <div className="font-bold text-white flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span>Candidate Protection & Six-Month Reapply Guard</span>
          </div>
          <p>
            When an employer sends an unambiguous rejection, the engine moves that employer into cooldown for exactly 6 calendar months. Automatic resubmission is disabled until the eligibility date arrives. You can manually correct or override classifications at any time.
          </p>
        </div>
      </div>

      {/* Rejections Records */}
      <div className="space-y-3">
        {records.map(r => {
          return (
            <div
              key={r.id}
              className={`p-5 rounded-2xl border transition-all ${
                theme === 'dark' ? 'bg-[#101625] border-slate-800 hover:border-slate-700' : 'bg-white border-slate-200 shadow-xs'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-white">{r.company}</span>
                    <span className="text-xs text-slate-400">· {r.position}</span>
                    {r.isEligibleNow || r.daysRemaining <= 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Eligible to Re-apply Now
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-400" />
                        <span>Eligible in {r.daysRemaining} days ({new Date(r.reapplicationEligibleDate).toLocaleDateString()})</span>
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-slate-500" />
                    <span>{r.recipientEmail}</span>
                    <span className="text-slate-600">·</span>
                    <span>Rejection Date: {r.rejectionDate}</span>
                  </div>

                  {r.rejectionSnippet && (
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800/80 text-[11px] text-slate-300 italic">
                      "{r.rejectionSnippet}"
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => handleManualOverride(r.id)}
                    className="px-3 py-1.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition"
                    title="Manual correction of classification"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{r.isEligibleNow ? 'Eligible' : 'Override to Eligible'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRemove(r.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"
                    title="Delete record"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {records.length === 0 && (
          <div className="p-10 text-center text-xs text-slate-400 rounded-3xl border border-dashed border-slate-800">
            No rejection records found. When an explicit rejection is received in Gmail, it will be automatically indexed here with the 6-month reapplication schedule.
          </div>
        )}
      </div>
    </div>
  );
};
