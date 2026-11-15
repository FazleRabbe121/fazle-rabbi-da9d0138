import React, { useState, useEffect } from 'react';
import { Lock, ArrowRight, AlertCircle, FileText, ShieldCheck, KeyRound, Mic, Mail, RefreshCw } from 'lucide-react';
import { CCDLogo } from './CCDLogo';
import {
  checkParticipantEmailAuthMode,
  enterInterviewWithEmail,
} from '../services/interviewCenterService';

export type AppAccessLevel = 'full' | 'cv-only' | 'interview-only';

interface DeveloperGateModalProps {
  onAuthorize: (level: AppAccessLevel) => void;
}

export const FULL_ACCESS_PASSCODE = '89056';
export const CV_ONLY_PASSCODE = '00000';

export const DeveloperGateModal: React.FC<DeveloperGateModalProps> = ({ onAuthorize }) => {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Interview Section Approved Gmail Login State
  const [gmailInput, setGmailInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [requiresPin, setRequiresPin] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [isSubmittingGmail, setIsSubmittingGmail] = useState(false);

  // Automatic Access Detection: automatically check if the entered Gmail address has an assigned PIN
  useEffect(() => {
    const cleanEmail = gmailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setRequiresPin(false);
      setPinInput('');
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingEmail(true);
      try {
        const status = await checkParticipantEmailAuthMode(cleanEmail);
        if (status.approved && status.requireAccessCode) {
          setRequiresPin(true);
        } else if (!status.requireAccessCode) {
          setRequiresPin(false);
          setPinInput('');
        }
      } finally {
        setIsCheckingEmail(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [gmailInput]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = passcode.trim();

    if (clean === FULL_ACCESS_PASSCODE) {
      localStorage.setItem('app_access_level_auth', 'full');
      localStorage.setItem('app_dev_authorized_89056', 'true');
      setError(false);
      onAuthorize('full');
    } else if (clean === CV_ONLY_PASSCODE) {
      localStorage.setItem('app_access_level_auth', 'cv-only');
      setError(false);
      onAuthorize('cv-only');
    } else {
      setError(true);
      setErrorMessage('ভুল পাসকোড! সঠিক পাসকোড দিন (Invalid Passcode).');
      setPasscode('');
    }
  };

  const handleGmailInterviewLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = gmailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError(true);
      setErrorMessage('Please enter a valid approved Gmail address.');
      return;
    }

    setError(false);
    setIsSubmittingGmail(true);
    try {
      const res = await enterInterviewWithEmail(cleanEmail, requiresPin ? pinInput : undefined);
      if (!res.authorized) {
        if (res.requireAccessCode) {
          setRequiresPin(true);
        }
        setError(true);
        setErrorMessage(
          res.error ||
            'Access denied. Only Gmail addresses approved by the Admin can access the Interview Section.'
        );
        return;
      }

      localStorage.setItem('app_access_level_auth', 'interview-only');
      onAuthorize('interview-only');
    } catch (err: any) {
      setError(true);
      setErrorMessage(err?.message || 'Unable to verify Gmail access. Please try again.');
    } finally {
      setIsSubmittingGmail(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gradient-to-br from-[#f4f7fb] via-white to-[#eef2ff] dark:from-[#090b10] dark:via-[#0d1017] dark:to-[#111522] animate-fade-in select-none overflow-y-auto">
      <div className="relative w-full max-w-md bg-white dark:bg-[#131724] border border-slate-200/90 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-[0_20px_60px_-15px_rgba(37,99,235,0.12)] text-slate-900 dark:text-slate-100 my-auto">
        {/* Brand Crest & Logo */}
        <div className="flex flex-col items-center text-center pb-3">
          <div className="mb-3 flex flex-col items-center gap-2.5">
            <CCDLogo size={54} mode="icon" />
            <CCDLogo size={34} mode="lockup" />
          </div>

          <span className="text-[10px] uppercase font-bold tracking-widest text-slate-700 dark:text-slate-300 px-3 py-1 rounded-full bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.1] mb-2">
            Secure Dual Access
          </span>

          <h2 className="font-['Montserrat'] font-extrabold text-xl sm:text-2xl text-slate-900 dark:text-white tracking-tight leading-snug">
            Security Authorization
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-['Inter'] max-w-xs">
            Enter your designated access passcode to open the ZENVIK workspace
          </p>
        </div>

        {/* Access Modes Info Card */}
        <div className="my-4 p-3.5 rounded-2xl bg-slate-50 dark:bg-[#090b10]/80 border border-slate-200/80 dark:border-slate-800 text-xs space-y-2">
          <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
            <span className="flex items-center gap-1.5 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Full Application Suite:</span>
            </span>
            <span className="font-mono text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/20 border border-blue-200 dark:border-blue-500/30 px-2 py-0.5 rounded-md text-[11px] font-semibold">
              Master Passcode
            </span>
          </div>

          <div className="flex items-center justify-between text-slate-700 dark:text-slate-300 pt-1.5 border-t border-slate-200/70 dark:border-slate-800/60">
            <span className="flex items-center gap-1.5 font-semibold">
              <FileText className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
              <span>CV-Only Workspace:</span>
            </span>
            <span className="font-mono text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-500/30 px-2 py-0.5 rounded-md text-[11px] font-bold">
              Passcode: 00000
            </span>
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-500/50 text-rose-700 dark:text-rose-200 text-xs flex items-center gap-2 animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Passcode Form (Master Passcode & CV-Only Passcode 00000) */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 font-['Montserrat']">
              Enter Passcode
            </label>
            <div className="relative">
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                autoFocus
                required
                value={passcode}
                onChange={e => {
                  setPasscode(e.target.value);
                  if (error) setError(false);
                }}
                placeholder="• • • • •"
                className="w-full px-4 py-3.5 bg-slate-50 dark:bg-[#07090e] border border-slate-200 dark:border-slate-800 rounded-2xl text-xl font-mono tracking-[0.4em] text-blue-600 dark:text-blue-400 placeholder-slate-300 dark:placeholder-slate-700 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-center transition-all shadow-inner"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-blue-500/25 active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Unlock Workspace</span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        </form>

        {/* Interview Section — Approved Gmail Login Option with Automatic PIN Detection */}
        <div className="mt-4 pt-4 border-t border-slate-200/80 dark:border-slate-800/70 space-y-3">
          <p className="text-[11px] text-center text-slate-500 dark:text-slate-400">
            For temporary CV-only access, enter <span className="font-mono text-violet-600 dark:text-violet-400 font-bold">00000</span>
          </p>

          <form onSubmit={handleGmailInterviewLogin} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#090b10]/90 border border-slate-200/80 dark:border-slate-800 space-y-2.5 text-left">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                <Mic className="w-3.5 h-3.5" />
                <span>Interview Section — Gmail Login</span>
              </label>
              {isCheckingEmail && (
                <RefreshCw className="w-3 h-3 text-slate-400 animate-spin" />
              )}
            </div>

            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email"
                required
                autoComplete="email"
                value={gmailInput}
                onChange={e => {
                  setGmailInput(e.target.value);
                  if (error) setError(false);
                }}
                placeholder="Enter approved Gmail address..."
                className="w-full pl-9 pr-3.5 py-2.5 bg-white dark:bg-[#07090e] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            {requiresPin && (
              <div className="space-y-1 animate-fade-in">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Assigned PIN Required for this Gmail
                </label>
                <div className="relative">
                  <KeyRound className="w-3.5 h-3.5 text-amber-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="password"
                    required
                    value={pinInput}
                    onChange={e => {
                      setPinInput(e.target.value);
                      if (error) setError(false);
                    }}
                    placeholder="Enter assigned PIN"
                    className="w-full pl-9 pr-3.5 py-2.5 bg-white dark:bg-[#07090e] border border-amber-400/60 dark:border-amber-500/40 rounded-xl text-xs font-mono tracking-widest text-slate-900 dark:text-amber-300 placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmittingGmail}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600/10 dark:bg-blue-600/20 hover:bg-blue-600 hover:text-white border border-blue-500/30 text-blue-700 dark:text-blue-300 font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmittingGmail ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying Gmail Access...</span>
                </>
              ) : (
                <>
                  <span>Enter Interview Section</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

