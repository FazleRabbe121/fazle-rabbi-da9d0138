import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  Cloud,
  HardDrive,
  User,
  Shield,
  Smartphone,
  Download,
  Upload,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  FileCode,
  DollarSign,
  Flame,
  Bell,
  LogOut,
  LogIn,
} from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { UserSettings, AppStateData } from '../types';
import {
  findDriveBackupFile,
  uploadBackupToDrive,
  downloadBackupFromDrive,
} from '../services/driveService';
import { exportBackupJSON, importBackupJSON } from '../services/localStore';
import { ThemeToggle, useTheme } from '../context/ThemeContext';
import { CCDLogo } from '../components/CCDLogo';
import { exportAllCVsAsJSON, syncAndLoadCloudCVLibrary, loadCVLibrary } from '../services/cvStorage';
import { syncCloudCentralProfile, loadCentralProfile } from '../services/centralProfileService';

interface SettingsViewProps {
  user: FirebaseUser | null;
  settings: UserSettings;
  fullAppState: AppStateData;
  onUpdateSettings: (newSettings: Partial<UserSettings>) => Promise<void>;
  onGoogleSignIn: () => void;
  onLogout: () => void;
  onRestoreState: (importedState: AppStateData) => void;
  onOpenAndroidExport: () => void;
  isCloudSynced: boolean;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  settings,
  fullAppState,
  onUpdateSettings,
  onGoogleSignIn,
  onLogout,
  onRestoreState,
  onOpenAndroidExport,
  isCloudSynced,
}) => {
  const [habitNameInput, setHabitNameInput] = useState(
    settings.trackerSectionTitle || settings.habitName || 'Social Media Tracking'
  );
  const [financeNameInput, setFinanceNameInput] = useState(
    settings.customSectionNames?.finance || 'Personal Finances'
  );
  const [recipesNameInput, setRecipesNameInput] = useState(
    settings.customSectionNames?.recipes || 'Culinary Recipes'
  );
  const [jobsNameInput, setJobsNameInput] = useState(
    settings.customSectionNames?.jobs || 'Global Job Search'
  );
  const [currencyInput, setCurrencyInput] = useState(settings.currency || '$');
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveMessage, setDriveMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const currencies = [
    { symbol: '$', name: 'USD ($)' },
    { symbol: '€', name: 'EUR (€)' },
    { symbol: '£', name: 'GBP (£)' },
    { symbol: '৳', name: 'BDT (৳)' },
    { symbol: '₹', name: 'INR (₹)' },
    { symbol: '¥', name: 'JPY / CNY (¥)' },
    { symbol: '₱', name: 'PHP (₱)' },
    { symbol: 'C$', name: 'CAD (C$)' },
    { symbol: 'A$', name: 'AUD (A$)' },
  ];

  const handleSaveGeneral = async () => {
    try {
      const cleanTrackerTitle = habitNameInput.trim() || 'Social Media Tracking';
      await onUpdateSettings({
        habitName: cleanTrackerTitle,
        trackerSectionTitle: cleanTrackerTitle,
        currency: currencyInput,
        customSectionNames: {
          tracker: cleanTrackerTitle,
          activity: cleanTrackerTitle,
          finance: financeNameInput.trim() || 'Personal Finances',
          recipes: recipesNameInput.trim() || 'Culinary Recipes',
          jobs: jobsNameInput.trim() || 'Global Job Search',
        },
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      console.error(err);
    }
  };

  // Google Drive Handlers
  const handleDriveBackupNow = async () => {
    setDriveLoading(true);
    setDriveMessage(null);
    try {
      const res = await uploadBackupToDrive(fullAppState);
      setDriveMessage({ text: `Backup successfully saved to Google Drive!` });
      await onUpdateSettings({
        lastBackupAt: new Date().toISOString(),
        googleDriveConnected: true,
      });
    } catch (err: any) {
      setDriveMessage({ text: err?.message || 'Google Drive backup failed.', isError: true });
    } finally {
      setDriveLoading(false);
    }
  };

  const handleDriveRestoreNow = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to restore data from Google Drive? This will merge and update your local records.'
    );
    if (!confirmed) return;

    setDriveLoading(true);
    setDriveMessage(null);
    try {
      const restored = await downloadBackupFromDrive();
      onRestoreState(restored);
      setDriveMessage({ text: 'Data successfully restored from Google Drive!' });
    } catch (err: any) {
      setDriveMessage({ text: err?.message || 'Failed to restore from Google Drive.', isError: true });
    } finally {
      setDriveLoading(false);
    }
  };

  const [migrationSyncLoading, setMigrationSyncLoading] = useState(false);

  // Local JSON File Export (Complete Zero-Data-Loss Migration Snapshot)
  const handleDownloadLocalBackup = () => {
    const jsonStr = exportBackupJSON(fullAppState);
    let completeSnapshot: any = {};
    try {
      completeSnapshot = JSON.parse(jsonStr);
    } catch {
      completeSnapshot = { appState: fullAppState };
    }
    completeSnapshot.migrationMetadata = {
      primaryAdminAccount: 'fazle.rabbe.doc@gmail.com',
      legacyRetainedAccount: 'fazlerabbe905@gmail.com',
      firebaseProjectId: 'gen-lang-client-0382607670',
      firestoreDatabaseId: 'ai-studio-e4405bff-96e5-4e9d-8fc6-6665341e100c',
      exportedAt: new Date().toISOString(),
    };
    completeSnapshot.cvLibraryBackup = loadCVLibrary();
    completeSnapshot.centralProfileBackup = loadCentralProfile();

    const finalStr = JSON.stringify(completeSnapshot, null, 2);
    const blob = new Blob([finalStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CCD_Complete_Migration_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSyncLegacyCloudDataToPrimary = async () => {
    setMigrationSyncLoading(true);
    setDriveMessage(null);
    try {
      await syncAndLoadCloudCVLibrary(user?.uid, user?.email || 'fazle.rabbe.doc@gmail.com');
      await syncCloudCentralProfile(user?.uid, user?.email || 'fazle.rabbe.doc@gmail.com');
      setDriveMessage({
        text: 'Cloud CV Library, Central Profile, and Legacy Account records synchronized to fazle.rabbe.doc@gmail.com with zero data loss!',
      });
    } catch (err: any) {
      setDriveMessage({
        text: err?.message || 'Cloud migration sync encountered an issue.',
        isError: true,
      });
    } finally {
      setMigrationSyncLoading(false);
    }
  };

  // Local JSON File Import
  const handleUploadLocalBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      const content = event.target?.result as string;
      const imported = importBackupJSON(content);
      if (imported) {
        onRestoreState(imported);
        setDriveMessage({ text: 'Local backup file successfully imported and restored!' });
      } else {
        setDriveMessage({ text: 'Invalid or corrupted backup file format.', isError: true });
      }
    };
    reader.readAsText(file);
  };

  const { theme, toggleTheme } = useTheme();

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in pb-16">
      {/* Top Reference Screen 7 Settings Card — Profile Summary + Grouped Preferences */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#12151e] border border-slate-200/90 dark:border-[#232838] shadow-[0_10px_30px_-8px_rgba(15,23,42,0.06)] space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-[#2563eb] dark:text-blue-400 px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-500/10 border border-blue-200/80 dark:border-blue-500/30">
              Account & Preferences
            </span>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-1">
              Settings
            </h1>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-[10px] uppercase font-bold tracking-wider border ${
              user && isCloudSynced
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-500/30 text-[#2563eb] dark:text-blue-300'
            }`}
          >
            {user && isCloudSynced ? 'Cloud Synced' : 'Active Profile'}
          </span>
        </div>

        {/* Profile Identity Row (FR Avatar + Fazle Rabbi + Email) */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50/80 via-indigo-50/40 to-violet-50/60 dark:from-slate-900 dark:to-slate-900 border border-blue-100/90 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || 'Fazle Rabbi'}
                className="w-14 h-14 rounded-full object-cover ring-2 ring-blue-500/40 shadow-sm"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#2563eb] to-[#7c3aed] text-white font-extrabold text-lg flex items-center justify-center shadow-md shadow-blue-600/20">
                FR
              </div>
            )}
            <div>
              <div className="text-base font-extrabold text-slate-900 dark:text-white">
                {user?.displayName || 'Fazle Rabbi'}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {user?.email || 'fazle.rabbe.doc@gmail.com'}
              </div>
              <div className="text-[11px] text-[#2563eb] dark:text-blue-400 font-semibold mt-0.5">
                Bartender / Barista · Hospitality & Visa Sponsorship Profile
              </div>
            </div>
          </div>

          {!user && (
            <button
              onClick={onGoogleSignIn}
              className="px-4 py-2.5 rounded-xl bg-[#2563eb] hover:bg-blue-700 text-white font-bold text-xs shadow-sm shadow-blue-600/20 transition flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>Connect Google</span>
            </button>
          )}
        </div>

        {/* Reference Screen 7 Grouped Settings List */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/70 overflow-hidden bg-slate-50/50 dark:bg-slate-900/50">
          <div className="px-4 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-500/15 text-[#2563eb] dark:text-blue-400 flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Profile Details</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Fazle Rabbi · Bartender & Barista</div>
              </div>
            </div>
            <span className="text-xs font-semibold text-[#2563eb] dark:text-blue-400">Verified</span>
          </div>

          <div className="px-4 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-violet-50 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Email & Job Alert Preferences</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Gmail API Dispatch & Europe Sponsorship Alerts</div>
              </div>
            </div>
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Active</span>
          </div>

          <div className="px-4 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <SettingsIcon className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Dark Mode</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Switch between Premium White UI and Dark Mode
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={theme === 'dark'}
                onClick={toggleTheme}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  theme === 'dark' ? 'bg-[#2563eb]' : 'bg-slate-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    theme === 'dark' ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
              <div className="hidden sm:block">
                <ThemeToggle compact={false} />
              </div>
            </div>
          </div>
        </div>

        {/* Soft Red Logout Button — Matching Bottom of Reference Screen 7 */}
        {user && (
          <div className="pt-1">
            <button
              onClick={onLogout}
              className="w-full py-2.5 rounded-2xl bg-rose-50 hover:bg-rose-100/80 dark:bg-rose-950/30 dark:hover:bg-rose-950/50 border border-rose-200/80 dark:border-rose-500/30 text-rose-600 dark:text-rose-300 font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        )}
      </div>

      {saveSuccess && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2 animate-fade-in">
          <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Preferences successfully updated and synchronized!</span>
        </div>
      )}

      {/* 1. Google Account & Multi-Device Sync Card */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#12151e] border border-slate-200/90 dark:border-[#232838] shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#1f2434]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-500/15 border border-blue-200/80 dark:border-blue-500/30 flex items-center justify-center text-[#2563eb] dark:text-blue-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">Google Account & Cloud Identity</h2>
              <p className="text-[11px] text-slate-500 dark:text-[#8c96ab]">
                Sign in with the same Google Account on any phone to access all your cloud records
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-[10px] uppercase font-bold tracking-wider border ${
                user && isCloudSynced
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                  : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300'
              }`}
            >
              {user && isCloudSynced ? 'Firestore Active' : 'Local Storage Mode'}
            </span>
          </div>
        </div>

        {user ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200/80 dark:border-[#1e2332]">
            <div className="flex items-center gap-3">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-12 h-12 rounded-2xl object-cover ring-2 ring-blue-500/40"
                />
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#2563eb] to-[#7c3aed] text-white font-bold text-base flex items-center justify-center">
                  {(user.displayName || user.email || 'U')[0].toUpperCase()}
                </div>
              )}
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-white">{user.displayName || 'Authenticated User'}</div>
                <div className="text-xs text-slate-500 dark:text-[#8c96ab] font-mono">{user.email}</div>
                <div className="text-[10px] text-slate-400 dark:text-[#64748b] font-mono mt-0.5">UID: {user.uid}</div>
              </div>
            </div>

            <button
              onClick={onLogout}
              className="px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-[#1b202e] dark:hover:bg-[#252c3f] border border-rose-200 dark:border-[#2f374c] text-rose-600 dark:text-rose-300 text-xs font-semibold tracking-wider uppercase transition flex items-center justify-center gap-2"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        ) : (
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200/80 dark:border-[#1e2332] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">Not Signed In</h3>
              <p className="text-xs text-slate-500 dark:text-[#8c96ab] max-w-md">
                Sign in with Google to enable permanent Firestore cloud synchronization across your phone, tablet, and desktop.
              </p>
            </div>
            <button
              onClick={onGoogleSignIn}
              className="px-5 py-2.5 rounded-xl bg-[#2563eb] hover:bg-blue-700 text-white font-bold text-xs tracking-wider uppercase shadow-sm shadow-blue-600/20 transition flex items-center justify-center gap-2 shrink-0"
            >
              <svg className="w-4 h-4 bg-white rounded-full p-0.5" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.8 7.3l3.7 2.9C6.4 7.2 8.9 5 12 5z" />
                <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z" />
                <path fill="#FBBC05" d="M5.5 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.8 7.3C.7 9.5 0 10.7 0 12s.7 2.5 1.8 4.7l3.7-1.9z" />
                <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.6-2.2-6.5-5.2L1.8 16c1.9 3.7 5.7 7 10.2 7z" />
              </svg>
              <span>Continue with Google</span>
            </button>
          </div>
        )}
      </div>

      {/* 1B. Google Account Ownership Migration & Zero-Data-Loss Verification Center */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#12151e] border border-emerald-200/90 dark:border-emerald-500/30 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-[#1f2434]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200/80 dark:border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Google Account Ownership Migration &amp; Verification Center
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-[#8c96ab]">
                Zero-data-loss administration transfer from fazlerabbe905@gmail.com to fazle.rabbe.doc@gmail.com
              </p>
            </div>
          </div>

          <span className="px-3 py-1 rounded-full text-[10px] uppercase font-bold tracking-wider bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400 self-start sm:self-auto">
            Primary Owner: fazle.rabbe.doc@gmail.com
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200/80 dark:border-[#1e2332] space-y-1.5">
            <div className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400">
              Application &amp; Portal Administration
            </div>
            <div className="text-slate-700 dark:text-slate-200 font-semibold">
              New Primary Admin: <span className="font-mono text-[#2563eb] dark:text-blue-400">fazle.rabbe.doc@gmail.com</span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              • Full Admin Control Panel, Interview Portal &amp; Self-Test Diagnostics active.
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              • Master Passcode (<code className="font-mono">89056</code>) &amp; CV-Only Passcode (<code className="font-mono">00000</code>) preserved.
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              • Transition Co-Admin (<code className="font-mono">fazlerabbe905@gmail.com</code>) retained until final verification.
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#0b0d13] border border-slate-200/80 dark:border-[#1e2332] space-y-1.5">
            <div className="text-[10px] uppercase font-bold tracking-wider text-[#2563eb] dark:text-blue-400">
              Preserved Cloud Infrastructure &amp; Databases
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-300 font-mono">
              Project ID: gen-lang-client-0382607670
            </div>
            <div className="text-[11px] text-slate-600 dark:text-slate-300 font-mono">
              Firestore DB: ai-studio-e4405bff-96e5-4e9d-8fc6-6665341e100c
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              • Automatic cloud account bridge merges CVs, Central Profile &amp; History from <code className="font-mono">cv_accounts/fazlerabbe905_gmail_com</code> into <code className="font-mono">fazle.rabbe.doc@gmail.com</code>.
            </div>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-500/30 text-[11px] text-slate-700 dark:text-slate-300 space-y-1">
          <div className="font-bold text-[#2563eb] dark:text-blue-400">
            Manual Google Cloud &amp; Firebase Console IAM Ownership Transfer Steps (Required by Google Cloud Security):
          </div>
          <div>
            1. Open <strong>Google Cloud Console &rarr; IAM &amp; Admin &rarr; IAM</strong> for project <code className="font-mono">gen-lang-client-0382607670</code> (while signed into <code className="font-mono">fazlerabbe905@gmail.com</code>) and click <strong>Grant Access</strong> to add <code className="font-mono">fazle.rabbe.doc@gmail.com</code> with role <strong>Owner (roles/owner)</strong> and <strong>Firebase Admin (roles/firebase.admin)</strong>.
          </div>
          <div>
            2. Accept the owner invitation email sent to <code className="font-mono">fazle.rabbe.doc@gmail.com</code>, verify OAuth Consent Screen &amp; Firebase Console access, and only remove <code className="font-mono">fazlerabbe905@gmail.com</code> after all verification checks pass.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleSyncLegacyCloudDataToPrimary}
            disabled={migrationSyncLoading}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold tracking-wider uppercase transition flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${migrationSyncLoading ? 'animate-spin' : ''}`} />
            <span>{migrationSyncLoading ? 'Syncing Cloud Records...' : 'Sync & Bridge Cloud Records Now'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadLocalBackup}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#1a2030] dark:hover:bg-[#232b40] border border-slate-200 dark:border-[#2f374c] text-slate-800 dark:text-white text-xs font-bold tracking-wider uppercase transition flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#2563eb]" />
            <span>Export Full Migration Backup (.JSON)</span>
          </button>
        </div>
      </div>

      {/* 2. Google Drive Backup & Restore */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#12151e] border border-slate-200/90 dark:border-[#232838] shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#1f2434]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/30 flex items-center justify-center text-sky-600 dark:text-sky-400">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">Google Drive Cloud Storage</h2>
              <p className="text-[11px] text-slate-500 dark:text-[#8c96ab]">
                Optional secondary export/backup layer using standard Google Drive file storage
              </p>
            </div>
          </div>
        </div>

        {driveMessage && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              driveMessage.isError
                ? 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-300'
                : 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {driveMessage.isError ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle className="w-4 h-4 shrink-0" />}
            <span>{driveMessage.text}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleDriveBackupNow}
            disabled={driveLoading}
            className="px-4 py-2.5 rounded-xl bg-[#2563eb] hover:bg-blue-700 text-white text-xs font-semibold tracking-wider uppercase transition flex items-center gap-2 disabled:opacity-50 shadow-xs"
          >
            {driveLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            <span>Backup to Google Drive</span>
          </button>

          <button
            onClick={handleDriveRestoreNow}
            disabled={driveLoading}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#1a2030] dark:hover:bg-[#232b40] border border-slate-200 dark:border-[#2f374c] text-slate-700 dark:text-[#cbd5e1] text-xs font-semibold tracking-wider uppercase transition flex items-center gap-2 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Restore from Google Drive</span>
          </button>
        </div>

        <div className="pt-2 text-[11px] text-slate-500 dark:text-[#64748b]">
          Last Drive Backup: {settings.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleString() : 'Never'}
        </div>
      </div>

      {/* 3. Local JSON Backup & Restore */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#12151e] border border-slate-200/90 dark:border-[#232838] shadow-sm space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-[#1f2434]">
          <div className="w-10 h-10 rounded-2xl bg-violet-50 dark:bg-[#171b26] border border-violet-200 dark:border-[#2a3144] flex items-center justify-center text-violet-600 dark:text-[#ffd700]">
            <FileCode className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">Direct JSON Data Export / Import</h2>
            <p className="text-[11px] text-slate-500 dark:text-[#8c96ab]">
              Download an unencrypted raw JSON file of your entire database or restore from a previous file
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleDownloadLocalBackup}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#1b202e] dark:hover:bg-[#252c3f] border border-slate-200 dark:border-[#2f374c] text-slate-800 dark:text-white text-xs font-semibold tracking-wider uppercase transition flex items-center gap-2"
          >
            <Download className="w-3.5 h-3.5 text-[#2563eb]" />
            <span>Export JSON File</span>
          </button>

          <label className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#1b202e] dark:hover:bg-[#252c3f] border border-slate-200 dark:border-[#2f374c] text-slate-700 dark:text-[#cbd5e1] text-xs font-semibold tracking-wider uppercase transition flex items-center gap-2 cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-violet-600" />
            <span>Import JSON File</span>
            <input type="file" accept=".json" onChange={handleUploadLocalBackup} className="hidden" />
          </label>
        </div>
      </div>

      {/* 4. Custom Section Names & Currency Configuration */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#12151e] border border-slate-200/90 dark:border-[#232838] shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#1f2434]">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Custom Section Names & Ledger Settings
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Customize visible names for all main modules. Default for tracker is "Social Media Tracking".
            </p>
          </div>
          {saveSuccess && (
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold border border-emerald-200 dark:border-emerald-500/30 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#94a3b8] mb-1.5">
              Tracker & Activity Section Title
            </label>
            <div className="relative">
              <Flame className="w-4 h-4 absolute left-3 top-3 text-[#2563eb]" />
              <input
                type="text"
                value={habitNameInput}
                onChange={e => setHabitNameInput(e.target.value)}
                placeholder="Social Media Tracking"
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-[#232838] rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">Default: Social Media Tracking (Configurable anytime)</span>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#94a3b8] mb-1.5">
              Preferred Currency
            </label>
            <div className="relative">
              <DollarSign className="w-4 h-4 absolute left-3 top-3 text-[#2563eb]" />
              <select
                value={currencyInput}
                onChange={e => setCurrencyInput(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-[#232838] rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              >
                {currencies.map(c => (
                  <option key={c.symbol} value={c.symbol}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#94a3b8] mb-1.5">
              Finances Section Title
            </label>
            <input
              type="text"
              value={financeNameInput}
              onChange={e => setFinanceNameInput(e.target.value)}
              placeholder="Personal Finances"
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-[#232838] rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#94a3b8] mb-1.5">
              Job Search & Career Title
            </label>
            <input
              type="text"
              value={jobsNameInput}
              onChange={e => setJobsNameInput(e.target.value)}
              placeholder="Global Job Search"
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#0b0d13] border border-slate-200 dark:border-[#232838] rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={handleSaveGeneral}
            className="px-6 py-2.5 rounded-xl bg-[#2563eb] hover:bg-blue-700 text-white font-bold text-xs tracking-wider uppercase shadow-sm shadow-blue-600/20 transition cursor-pointer"
          >
            Save Custom Section Names
          </button>
        </div>
      </div>

      {/* 5. GitHub & Android APK Building Center */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#12151e] border border-blue-200/80 dark:border-emerald-500/30 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-[#2563eb] dark:text-emerald-400 uppercase tracking-wider">
            <Smartphone className="w-4 h-4" />
            <span>GitHub Sync & Android APK Build Station</span>
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1">Package: com.ccd.abetteryou</h3>
          <p className="text-xs text-slate-500 dark:text-[#8c96ab] mt-0.5">
            Download complete project (.zip), push to GitHub, and automatically build Android APK with GitHub Actions.
          </p>
        </div>

        <button
          onClick={onOpenAndroidExport}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#2563eb] to-[#7c3aed] text-white font-bold text-xs tracking-wider uppercase shadow-md shadow-blue-600/20 hover:opacity-95 transition flex items-center justify-center gap-2 shrink-0 cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>GitHub & APK Hub</span>
        </button>
      </div>

      {/* 6. About ZENVIK & Privacy */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#0b0d13] border border-slate-200/80 dark:border-[#1f2434] text-center space-y-2.5 text-xs text-slate-500 dark:text-[#64748b] flex flex-col items-center">
        <CCDLogo size={38} mode="lockup" />
        <p>Version 1.0.0 • Production Build • Zero Third-Party Advertising • Strict ABAC Privacy</p>
        <p className="text-[11px] text-slate-400 dark:text-[#475569]">
          All habit records, finances, and career assets belong solely to your account.
        </p>
      </div>
    </div>
  );
};
