import React, { useState, useEffect, useMemo, useRef } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { onSnapshot, collection, doc } from 'firebase/firestore';
import { Loader2, AlertTriangle, RotateCcw, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { auth, db, signInWithGoogle, logOut as firebaseLogOut, saveRelapse, deleteRelapseRecord, saveFinance, deleteFinanceRecord, saveFamilyMoney, deleteFamilyMoneyRecord, saveRecipe, deleteRecipeRecord, saveReport, deleteReportRecord, saveUserSettings, saveUserProfile } from './services/firebase';
import { loadLocalState, saveLocalState } from './services/localStore';
import { syncAndLoadCloudCVLibrary } from './services/cvStorage';
import {
  loadUserDataFromCloud,
  subscribeToUserWorkspace,
  UserWorkspaceData,
} from './services/userDataPersistenceService';
import {
  AppStateData,
  FinanceRecord,
  RelapseRecord,
  FamilyMoneyRecord,
  RecipeRecord,
  MonthlyReportRecord,
  UserSettings,
  MonthlyStatsPayload,
  FinanceType,
} from './types';
import { Navbar } from './components/Navbar';
import { CCDLogo } from './components/CCDLogo';
import { SidebarNav, NavTab } from './components/SidebarNav';
import { BottomNav } from './components/BottomNav';
import { DashboardView } from './views/DashboardView';
import { JobSearchView } from './views/JobSearchView';
import { EuropeJobMarketView } from './views/EuropeJobMarketView';
import { GlobalSponsorshipView } from './views/GlobalSponsorshipView';
import { CyprusJobMarketView } from './views/CyprusJobMarketView';
import { CoverLetterManagerView } from './views/CoverLetterManagerView';
import { ProfessionalPhotosView } from './views/ProfessionalPhotosView';
import { BulkQueueView } from './views/BulkQueueView';
import { ApplicationHistoryView } from './views/ApplicationHistoryView';
import { EmployerRepliesView } from './views/EmployerRepliesView';
import { RejectedApplicationsView } from './views/RejectedApplicationsView';
import { RelapseTrackerView } from './views/RelapseTrackerView';
import { FinanceTrackerView } from './views/FinanceTrackerView';
import { FamilyMoneyView } from './views/FamilyMoneyView';
import { RecipeLibraryView } from './views/RecipeLibraryView';
import { AIAssistantView } from './views/AIAssistantView';
import { ReportsView } from './views/ReportsView';
import { ProgressStatsView } from './views/ProgressStatsView';
import { SettingsView } from './views/SettingsView';
import { CVBuilderView } from './views/CVBuilderView';
import { ApplyByEmailView } from './views/ApplyByEmailView';
import { GoogleSheetsTrackerView } from './views/GoogleSheetsTrackerView';
import { InterviewPortalView } from './views/InterviewPortalView';
import { InterviewAdminView } from './views/InterviewAdminView';
import { PersonalAIView } from './views/PersonalAIView';
import { CertificateGeneratorView } from './views/CertificateGeneratorView';
import {
  CertificatePreselection,
  setPendingCertificatePreselection,
} from './services/certificateService';
import { isDedicatedInterviewPortalUrl } from './services/interviewCenterService';
import { loadAppliedJobRecords } from './services/jobDatabaseService';
import { loadRejectedApplications } from './services/rejectionTrackingService';
import { loadSavedPreparedApplications } from './services/gmailService';
import { loadSavedJobs } from './services/jobSearchService';

import { RelapseModal } from './components/RelapseModal';
import { FinanceModal } from './components/FinanceModal';
import { FamilyMoneyModal } from './components/FamilyMoneyModal';
import { RecipeModal } from './components/RecipeModal';
import { AIReportModal } from './components/AIReportModal';
import { EducationalUrgeGuide } from './components/EducationalUrgeGuide';
import { AndroidExportModal } from './components/AndroidExportModal';
import { DeveloperGateModal, AppAccessLevel } from './components/DeveloperGateModal';
import { useTheme } from './context/ThemeContext';

export default function App() {
  const { theme } = useTheme();
  const [isDedicatedInterviewLink, setIsDedicatedInterviewLink] = useState<boolean>(() =>
    isDedicatedInterviewPortalUrl()
  );
  const [accessLevel, setAccessLevel] = useState<AppAccessLevel | 'none'>(() => {
    if (isDedicatedInterviewPortalUrl()) {
      return 'interview-only';
    }
    const stored = localStorage.getItem('app_access_level_auth');
    if (stored === 'full' || stored === 'cv-only' || stored === 'interview-only') {
      return stored;
    }
    if (localStorage.getItem('app_dev_authorized_89056') === 'true') {
      return 'full';
    }
    return 'none';
  });

  // Listen for URL hash or history changes that point to the dedicated Interview Portal
  useEffect(() => {
    const checkInterviewUrl = () => {
      if (isDedicatedInterviewPortalUrl()) {
        setIsDedicatedInterviewLink(true);
        setAccessLevel('interview-only');
      }
    };
    window.addEventListener('hashchange', checkInterviewUrl);
    window.addEventListener('popstate', checkInterviewUrl);
    return () => {
      window.removeEventListener('hashchange', checkInterviewUrl);
      window.removeEventListener('popstate', checkInterviewUrl);
    };
  }, []);
  const [VerifyCertIdFromUrl, setVerifyCertIdFromUrl] = useState<string>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const qVerify = params.get('verify');
      if (qVerify) return qVerify.trim();
      const pathMatch = window.location.pathname.match(/\/verify\/([^/?#]+)/i);
      if (pathMatch?.[1]) return decodeURIComponent(pathMatch[1]).trim();
      return '';
    } catch {
      return '';
    }
  });
  const [certPreselection, setCertPreselection] = useState<CertificatePreselection | null>(null);
  const [currentTab, setCurrentTab] = useState<NavTab>(() =>
    VerifyCertIdFromUrl ? 'certificate' : 'dashboard'
  );
  const [appState, setAppState] = useState<AppStateData>(() => loadLocalState());
  const [user, setUser] = useState<User | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isCloudSynced, setIsCloudSynced] = useState<boolean>(false);
  const [isLoadingUserData, setIsLoadingUserData] = useState<boolean>(false);
  const [userDataError, setUserDataError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  // Sidebar & Navigation State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar_collapsed_pref') === 'true';
    } catch {
      return false;
    }
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [navCounts, setNavCounts] = useState({
    saved: 0,
    approved: 0,
    history: 0,
    rejections: 0,
  });

  // Keep sidebar badge metrics synchronized on tab changes
  useEffect(() => {
    try {
      const saved = loadSavedJobs().length;
      const approved = loadSavedPreparedApplications().filter(a => a.isApproved).length;
      const history = loadAppliedJobRecords().length;
      const rejections = loadRejectedApplications().length;
      setNavCounts({ saved, approved, history, rejections });
    } catch {
      // ignore
    }
  }, [currentTab]);

  // Modal States
  const [isRelapseModalOpen, setIsRelapseModalOpen] = useState(false);
  const [isFinanceModalOpen, setIsFinanceModalOpen] = useState(false);
  const [financeModalType, setFinanceModalType] = useState<FinanceType>('expense');
  const [editingFinance, setEditingFinance] = useState<FinanceRecord | null>(null);
  const [isFamilyModalOpen, setIsFamilyModalOpen] = useState(false);
  const [editingFamily, setEditingFamily] = useState<FamilyMoneyRecord | null>(null);
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<RecipeRecord | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isUrgeGuideOpen, setIsUrgeGuideOpen] = useState(false);
  const [isAndroidExportOpen, setIsAndroidExportOpen] = useState(false);

  // Network connectivity listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Save to localStorage whenever appState updates
  useEffect(() => {
    saveLocalState(appState);
  }, [appState]);

  // Firebase Auth State Listener & Startup Sequence (Requirement 4)
  // Skipped when operating in isolated Interview Portal mode
  useEffect(() => {
    if (accessLevel === 'interview-only' || isDedicatedInterviewLink) {
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async currentUser => {
      setUser(currentUser);
      if (currentUser) {
        setAppState(prev => ({
          ...prev,
          settings: {
            ...prev.settings,
            userId: currentUser.uid,
          },
        }));
        setIsLoadingUserData(true);
        setUserDataError(null);
        try {
          // Strict startup sequence:
          // 1. Authenticate with Google
          // 2. Verified Firebase UID captured (currentUser.uid)
          // 3. Load user's existing profile & settings from Firestore
          // 4. Retrieve saved documents, CVs, and application records
          // 5. Load saved AI agent and queue states
          // 6. Display existing workspace only after initial data-loading succeeds
          const result = await loadUserDataFromCloud(currentUser.uid);
          setIsCloudSynced(true);
          setAuthNotice(
            result.isExistingUser
              ? `Welcome back! Cloud workspace restored for ${currentUser.displayName || currentUser.email}.`
              : `Cloud workspace activated for ${currentUser.displayName || currentUser.email}.`
          );
          setTimeout(() => setAuthNotice(null), 4000);
        } catch (err: any) {
          const msg = String(err?.message || '');
          if (msg.toLowerCase().includes('offline') || msg.toLowerCase().includes('unavailable')) {
            console.warn('Operating in local offline workspace mode.');
            setIsCloudSynced(false);
            setUserDataError(null);
          } else {
            console.error('Failed to load user data from cloud:', err);
            setUserDataError(err.message || 'Failed to retrieve your cloud workspace. Please check your network connection.');
            setIsCloudSynced(false);
          }
        } finally {
          setIsLoadingUserData(false);
        }
      } else {
        setIsCloudSynced(false);
        setIsLoadingUserData(false);
        setUserDataError(null);
      }
    });

    return () => unsubscribe();
  }, [accessLevel, isDedicatedInterviewLink]);

  const handleRetryLoadUserData = async () => {
    if (!user) return;
    setIsLoadingUserData(true);
    setUserDataError(null);
    try {
      await loadUserDataFromCloud(user.uid);
      setIsCloudSynced(true);
      setAuthNotice('Cloud workspace restored successfully!');
      setTimeout(() => setAuthNotice(null), 3000);
    } catch (err: any) {
      console.warn('Retry note:', err);
      setUserDataError(err.message || 'Cloud connection error.');
    } finally {
      setIsLoadingUserData(false);
    }
  };

  // Real-time Firestore sync when authenticated
  useEffect(() => {
    if (!user || accessLevel === 'interview-only' || isDedicatedInterviewLink) return;

    const unsubs: (() => void)[] = [];

    // Settings & Relapses listeners
    try {
      const settingsRef = doc(db, 'users', user.uid, 'settings', 'current');
      unsubs.push(
        onSnapshot(
          settingsRef,
          snapshot => {
            if (snapshot.exists()) {
              const remoteSettings = snapshot.data() as UserSettings;
              setAppState(prev => ({
                ...prev,
                settings: {
                  ...prev.settings,
                  ...remoteSettings,
                  userId: user.uid,
                },
              }));
            }
          },
          err => console.warn('Settings snapshot listener note:', err?.message || err)
        )
      );

      const relapsesRef = collection(db, 'users', user.uid, 'relapses');
      unsubs.push(
        onSnapshot(
          relapsesRef,
          snapshot => {
            const list: RelapseRecord[] = [];
            snapshot.forEach(docSnap => list.push(docSnap.data() as RelapseRecord));
            list.sort((a, b) => b.timestamp - a.timestamp);
            setAppState(prev => ({ ...prev, relapses: list }));
          },
          err => console.warn('Relapses snapshot listener note:', err?.message || err)
        )
      );

      // Finances listener
      const financesRef = collection(db, 'users', user.uid, 'finance');
      unsubs.push(
        onSnapshot(
          financesRef,
          snapshot => {
            const list: FinanceRecord[] = [];
            snapshot.forEach(docSnap => list.push(docSnap.data() as FinanceRecord));
            list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setAppState(prev => ({ ...prev, finances: list }));
          },
          err => console.warn('Finances snapshot listener note:', err?.message || err)
        )
      );

      // Family Money listener
      const familyRef = collection(db, 'users', user.uid, 'familyMoney');
      unsubs.push(
        onSnapshot(
          familyRef,
          snapshot => {
            const list: FamilyMoneyRecord[] = [];
            snapshot.forEach(docSnap => list.push(docSnap.data() as FamilyMoneyRecord));
            list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setAppState(prev => ({ ...prev, familyMoney: list }));
          },
          err => console.warn('Family money snapshot listener note:', err?.message || err)
        )
      );

      // Recipes listener
      const recipesRef = collection(db, 'users', user.uid, 'recipes');
      unsubs.push(
        onSnapshot(
          recipesRef,
          snapshot => {
            const list: RecipeRecord[] = [];
            snapshot.forEach(docSnap => list.push(docSnap.data() as RecipeRecord));
            if (list.length > 0) {
              setAppState(prev => ({ ...prev, recipes: list }));
            }
          },
          err => console.warn('Recipes snapshot listener note:', err?.message || err)
        )
      );

      // Reports listener
      const reportsRef = collection(db, 'users', user.uid, 'reports');
      unsubs.push(
        onSnapshot(
          reportsRef,
          snapshot => {
            const list: MonthlyReportRecord[] = [];
            snapshot.forEach(docSnap => list.push(docSnap.data() as MonthlyReportRecord));
            list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setAppState(prev => ({ ...prev, reports: list }));
          },
          err => console.warn('Reports snapshot listener note:', err?.message || err)
        )
      );

      // Multi-CV Library real-time listener across all devices
      const cvDocRef = doc(db, 'users', user.uid, 'cvLibrary', 'main');
      unsubs.push(
        onSnapshot(cvDocRef, snapshot => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            if (data?.cvLibrary) {
              try {
                const list = JSON.parse(data.cvLibrary);
                if (Array.isArray(list) && list.length > 0) {
                  localStorage.setItem('multi_cv_library_v2', JSON.stringify(list));
                  window.dispatchEvent(new CustomEvent('cv_library_cloud_updated', { detail: list }));
                }
              } catch (e) {
                // ignore
              }
            }
          }
        }, err => console.warn('CV library snapshot listener:', err))
      );
    } catch (err) {
      console.warn('Real-time listener setup error:', err);
    }

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [user]);

  // Auth Handlers
  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithGoogle();
      if (result) {
        setAuthNotice(`Signed in as ${result.user.displayName || result.user.email}`);
        setTimeout(() => setAuthNotice(null), 3500);
      }
    } catch (err: any) {
      console.error('Google Sign In error:', err);
      setAuthNotice('Sign-in unavailable. Operating in local offline mode.');
      setTimeout(() => setAuthNotice(null), 4000);
    }
  };

  const handleLogout = async () => {
    try {
      await firebaseLogOut();
      setUser(null);
      setIsCloudSynced(false);
      setAuthNotice('Logged out safely. Switched to local mode.');
      setTimeout(() => setAuthNotice(null), 3000);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Relapse Handlers
  const handleConfirmRelapse = async (recordData: Omit<RelapseRecord, 'id' | 'userId' | 'createdAt'>) => {
    const newRecord: RelapseRecord = {
      ...recordData,
      id: `relapse-${Date.now()}`,
      userId: user?.uid || 'local-user',
      createdAt: new Date().toISOString(),
    };

    const nextHabitStartDate = new Date().toISOString();
    const updatedSettings: UserSettings = {
      ...appState.settings,
      userId: user?.uid || appState.settings.userId || 'local-user',
      habitStartDate: nextHabitStartDate,
    };

    setAppState(prev => ({
      ...prev,
      relapses: [newRecord, ...prev.relapses],
      settings: updatedSettings,
    }));

    if (user) {
      await saveRelapse(user.uid, newRecord);
      await saveUserSettings(updatedSettings);
    }
  };

  const handleDeleteRelapse = async (id: string) => {
    setAppState(prev => ({
      ...prev,
      relapses: prev.relapses.filter(r => r.id !== id),
    }));

    if (user) {
      await deleteRelapseRecord(user.uid, id);
    }
  };

  const handleUpdateHabitName = async (name: string) => {
    const updatedSettings: UserSettings = {
      ...appState.settings,
      userId: user?.uid || appState.settings.userId || 'local-user',
      habitName: name,
    };
    setAppState(prev => ({ ...prev, settings: updatedSettings }));
    if (user) {
      await saveUserSettings(updatedSettings);
    }
  };

  // Finance Handlers
  const handleSaveFinance = async (
    recordData: Omit<FinanceRecord, 'id' | 'userId' | 'createdAt'>,
    existingId?: string
  ) => {
    if (existingId) {
      const updated: FinanceRecord = {
        ...recordData,
        id: existingId,
        userId: user?.uid || 'local-user',
        createdAt: new Date().toISOString(),
      };
      setAppState(prev => ({
        ...prev,
        finances: prev.finances.map(f => (f.id === existingId ? updated : f)),
      }));
      if (user) await saveFinance(user.uid, updated);
    } else {
      const newRecord: FinanceRecord = {
        ...recordData,
        id: `fin-${Date.now()}`,
        userId: user?.uid || 'local-user',
        createdAt: new Date().toISOString(),
      };
      setAppState(prev => ({
        ...prev,
        finances: [newRecord, ...prev.finances],
      }));
      if (user) await saveFinance(user.uid, newRecord);
    }
    setEditingFinance(null);
  };

  const handleDeleteFinance = async (id: string) => {
    setAppState(prev => ({
      ...prev,
      finances: prev.finances.filter(f => f.id !== id),
    }));
    if (user) await deleteFinanceRecord(user.uid, id);
  };

  // Family Money Handlers
  const handleSaveFamilyMoney = async (
    recordData: Omit<FamilyMoneyRecord, 'id' | 'userId' | 'createdAt'>,
    existingId?: string
  ) => {
    if (existingId) {
      const updated: FamilyMoneyRecord = {
        ...recordData,
        id: existingId,
        userId: user?.uid || 'local-user',
        createdAt: new Date().toISOString(),
      };
      setAppState(prev => ({
        ...prev,
        familyMoney: prev.familyMoney.map(f => (f.id === existingId ? updated : f)),
      }));
      if (user) await saveFamilyMoney(user.uid, updated);
    } else {
      const newRecord: FamilyMoneyRecord = {
        ...recordData,
        id: `fm-${Date.now()}`,
        userId: user?.uid || 'local-user',
        createdAt: new Date().toISOString(),
      };
      setAppState(prev => ({
        ...prev,
        familyMoney: [newRecord, ...prev.familyMoney],
      }));
      if (user) await saveFamilyMoney(user.uid, newRecord);
    }
    setEditingFamily(null);
  };

  const handleDeleteFamilyMoney = async (id: string) => {
    setAppState(prev => ({
      ...prev,
      familyMoney: prev.familyMoney.filter(f => f.id !== id),
    }));
    if (user) await deleteFamilyMoneyRecord(user.uid, id);
  };

  // Recipe Handlers
  const handleSaveRecipe = async (
    recordData: Omit<RecipeRecord, 'id' | 'userId' | 'createdAt'>,
    existingId?: string
  ) => {
    if (existingId) {
      const existing = appState.recipes.find(r => r.id === existingId);
      const updated: RecipeRecord = {
        ...recordData,
        id: existingId,
        userId: user?.uid || 'local-user',
        createdAt: existing?.createdAt || new Date().toISOString(),
      };
      setAppState(prev => ({
        ...prev,
        recipes: prev.recipes.map(r => (r.id === existingId ? updated : r)),
      }));
      if (user) await saveRecipe(user.uid, updated);
    } else {
      const newRecord: RecipeRecord = {
        ...recordData,
        id: `rec-${Date.now()}`,
        userId: user?.uid || 'local-user',
        createdAt: new Date().toISOString(),
      };
      setAppState(prev => ({
        ...prev,
        recipes: [newRecord, ...prev.recipes],
      }));
      if (user) await saveRecipe(user.uid, newRecord);
    }
    setEditingRecipe(null);
  };

  const handleDeleteRecipe = async (id: string) => {
    setAppState(prev => ({
      ...prev,
      recipes: prev.recipes.filter(r => r.id !== id),
    }));
    if (user) await deleteRecipeRecord(user.uid, id);
  };

  const handleToggleFavoriteRecipe = async (recipe: RecipeRecord) => {
    const updated = { ...recipe, isFavorite: !recipe.isFavorite };
    setAppState(prev => ({
      ...prev,
      recipes: prev.recipes.map(r => (r.id === recipe.id ? updated : r)),
    }));
    if (user) await saveRecipe(user.uid, updated);
  };

  // Report Handlers
  const handleSaveReport = async (month: string, stats: MonthlyStatsPayload, reportContent: string) => {
    const newReport: MonthlyReportRecord = {
      id: `rep-${Date.now()}`,
      userId: user?.uid || 'local-user',
      month,
      dataSnapshot: stats,
      reportContent,
      createdAt: new Date().toISOString(),
    };

    setAppState(prev => ({
      ...prev,
      reports: [newReport, ...prev.reports],
    }));

    if (user) {
      await saveReport(user.uid, newReport);
    }
  };

  const handleDeleteReport = async (id: string) => {
    setAppState(prev => ({
      ...prev,
      reports: prev.reports.filter(r => r.id !== id),
    }));
    if (user) await deleteReportRecord(user.uid, id);
  };

  // Settings Handlers
  const handleUpdateSettings = async (newSettings: Partial<UserSettings>) => {
    const merged: UserSettings = {
      ...appState.settings,
      ...newSettings,
      userId: user?.uid || appState.settings.userId || 'local-user',
    };
    setAppState(prev => ({ ...prev, settings: merged }));
    if (user) {
      await saveUserSettings(merged);
    }
  };

  // Monthly stats payload calculation for AI Report
  const currentMonthStats: MonthlyStatsPayload = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const mFinances = appState.finances.filter(f => f.date.startsWith(currentMonth));
    const mFamily = appState.familyMoney.filter(fm => fm.date.startsWith(currentMonth));
    const mRecipes = appState.recipes.filter(r => r.createdAt.startsWith(currentMonth));

    const salary = mFinances
      .filter(f => f.type === 'income' && f.category === 'Salary')
      .reduce((s, f) => s + f.amount, 0);
    const tips = mFinances
      .filter(f => f.type === 'income' && f.category === 'Tips')
      .reduce((s, f) => s + f.amount, 0);
    const other = mFinances
      .filter(f => f.type === 'income' && f.category === 'Other Income')
      .reduce((s, f) => s + f.amount, 0);
    const totalIncome = salary + tips + other;

    const expensesByCategory: Record<string, number> = {};
    let totalExpenses = 0;
    mFinances
      .filter(f => f.type === 'expense')
      .forEach(f => {
        expensesByCategory[f.category] = (expensesByCategory[f.category] || 0) + f.amount;
        totalExpenses += f.amount;
      });

    const familyTotal = mFamily.reduce((s, fm) => s + fm.amount, 0);

    // Relapses this month
    const mRelapses = appState.relapses.filter(r => r.relapseDate.startsWith(currentMonth));

    // Calculate streaks
    const currentStreakDays = Math.max(
      0,
      Math.floor(
        (Date.now() - new Date(appState.settings.habitStartDate).getTime()) / (1000 * 60 * 60 * 24)
      )
    );

    return {
      month: currentMonth,
      income: {
        salary,
        tips,
        other,
        total: totalIncome,
      },
      expenses: {
        total: totalExpenses,
        byCategory: expensesByCategory,
      },
      savings: totalIncome - totalExpenses,
      familyMoney: {
        total: familyTotal,
        count: mFamily.length,
      },
      habit: {
        habitName: appState.settings.habitName,
        relapses: mRelapses.length,
        currentStreak: currentStreakDays,
        longestStreak: Math.max(currentStreakDays, 14),
      },
      recipes: {
        total: appState.recipes.length,
        addedThisMonth: mRecipes.length,
      },
    };
  }, [appState]);

  // If a QR code verification URL (?verify=BLV-...) is opened while unauthenticated,
  // show the Certificate Verification screen directly so anyone scanning a QR code can verify it
  if (VerifyCertIdFromUrl && accessLevel === 'none') {
    return (
      <div className="min-h-screen bg-[#090c14] text-slate-100 p-4 sm:p-8">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center justify-between gap-4">
            <CCDLogo size={36} mode="lockup" forceDark={true} />
            <button
              type="button"
              onClick={() => setVerifyCertIdFromUrl('')}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 cursor-pointer"
            >
              Open Full Application Login
            </button>
          </div>
          <CertificateGeneratorView initialVerifyId={VerifyCertIdFromUrl} />
        </div>
      </div>
    );
  }

  if (accessLevel === 'none') {
    return (
      <DeveloperGateModal
        onAuthorize={(level) => setAccessLevel(level)}
      />
    );
  }

  // Temporary CV-Only Mode: Passcode 00000 strictly isolates the CV Builder/Library
  // All other personal sections (habit, finance, family money, recipes, reports, stats) are completely hidden and restricted
  if (accessLevel === 'cv-only') {
    return (
      <CVBuilderView
        isCvOnlyMode={true}
        onExitSession={() => {
          localStorage.removeItem('app_access_level_auth');
          setAccessLevel('none');
        }}
      />
    );
  }

  // Isolated Participant Interview Portal Mode:
  // Approved Gmail participants see ONLY the standalone Interview Portal and cannot reach main app routes, CV library, or settings
  if (accessLevel === 'interview-only' || isDedicatedInterviewLink) {
    return (
      <InterviewPortalView
        isDedicatedPortal={isDedicatedInterviewLink}
        onExitPortal={() => {
          if (isDedicatedInterviewLink) {
            // In Dedicated Interview Portal link mode, exiting/signing out stays strictly on the Interview Portal landing screen
            setAccessLevel('interview-only');
            return;
          }
          localStorage.removeItem('app_access_level_auth');
          setAccessLevel('none');
        }}
      />
    );
  }

  return (
    <div
      className={`min-h-screen flex flex-col font-sans transition-colors duration-200 selection:bg-emerald-500/20 ${
        theme === 'dark'
          ? 'bg-[#131519] text-[#f4f4f5]'
          : 'bg-gradient-to-br from-[#f4f7fb] via-[#f8fafc] to-[#eef2ff]/60 text-[#0f172a]'
      }`}
    >
      {/* Facebook-style Vertical Sidebar Navigation (Desktop Collapsible & Mobile Slide-in Drawer) */}
      <SidebarNav
        currentTab={currentTab}
        onSelectTab={(tab) => {
          if (tab === 'europe' || tab === 'europe-job-market') {
            setCurrentTab('europe-jobs');
          } else if (tab === 'sponsorship' || tab === 'global-sponsorship') {
            setCurrentTab('sponsorship-jobs');
          } else if (tab === 'cyprus') {
            setCurrentTab('cyprus-jobs');
          } else {
            setCurrentTab(tab);
          }
          setIsMobileSidebarOpen(false);
        }}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => {
          setIsSidebarCollapsed(prev => {
            const next = !prev;
            try { localStorage.setItem('sidebar_collapsed_pref', next ? 'true' : 'false'); } catch {}
            return next;
          });
        }}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        savedJobsCount={navCounts.saved}
        approvedCount={navCounts.approved}
        historyCount={navCounts.history}
        rejectionsCount={navCounts.rejections}
        userEmail={user?.email || 'fazle.rabbe.doc@gmail.com'}
        userName={user?.displayName || 'Fazle Rabbi'}
      />

      {/* Main Content Shell (offset by desktop sidebar width) */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ease-in-out ${
          isSidebarCollapsed ? 'lg:pl-[72px]' : 'lg:pl-64'
        }`}
      >
        {/* Main Top Navigation Bar */}
        <Navbar
          user={user}
          isOnline={isOnline}
          isCloudSynced={isCloudSynced}
          onGoogleSignIn={handleGoogleSignIn}
          onLogout={handleLogout}
          onOpenRelapseModal={() => setIsRelapseModalOpen(true)}
          onOpenUrgeGuide={() => setIsUrgeGuideOpen(true)}
          onOpenAndroidExport={() => setIsAndroidExportOpen(true)}
          onOpenCVBuilder={() => setCurrentTab('cv-library')}
          onOpenApplyByEmail={() => setCurrentTab('gmail-center')}
          onLockApp={() => {
            localStorage.removeItem('app_access_level_auth');
            setAccessLevel('none');
          }}
          onToggleMobileMenu={() => setIsMobileSidebarOpen(prev => !prev)}
        />

        {/* Floating Auth Notification Toast */}
        {authNotice && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 animate-fade-in max-w-md w-[90%] pointer-events-none">
            <div
              className={`px-4 py-2.5 rounded-2xl shadow-xl text-xs text-center font-semibold border ${
                theme === 'dark'
                  ? 'bg-slate-900 border-blue-500/40 text-white'
                  : 'bg-white border-blue-200 text-slate-900 shadow-blue-500/10'
              }`}
            >
              {authNotice}
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 pb-28">
          {isLoadingUserData ? (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[55vh] py-16 text-center animate-fade-in">
              <div className="relative mb-5 flex flex-col items-center gap-3">
                <div className="relative">
                  <CCDLogo size={56} mode="icon" />
                  <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-emerald-500 border-2 border-white dark:border-[#0b0c10] flex items-center justify-center">
                    <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                  </div>
                </div>
                <CCDLogo size={32} mode="lockup" />
              </div>
              <h3 className={`text-xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                Restoring Your Cloud Workspace
              </h3>
              <p className={`text-sm max-w-md mb-5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                Retrieving your uploaded CVs, cover letters, saved jobs, Europe market progress, and application queue for{' '}
                <span className="text-blue-600 dark:text-blue-400 font-semibold">{user?.email || 'authenticated Google account'}</span>...
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 text-[11px] font-mono text-emerald-700 dark:text-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span>Verified Firebase UID: {user?.uid.slice(0, 16)}...</span>
              </div>
            </div>
          ) : userDataError ? (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[55vh] py-16 text-center animate-fade-in">
              <div className="max-w-md w-full p-6 rounded-3xl bg-rose-950/30 border border-rose-500/40 text-rose-300 shadow-2xl">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4 border border-rose-500/30">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Cloud Workspace Sync Failed</h3>
                <p className="text-xs text-rose-200/90 leading-relaxed mb-6 font-mono bg-black/40 p-3 rounded-xl border border-rose-900/50 break-words text-left">
                  {userDataError}
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    onClick={handleRetryLoadUserData}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white text-xs font-semibold shadow-lg transition flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Retry Loading</span>
                  </button>
                  <button
                    onClick={() => setUserDataError(null)}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition"
                  >
                    Continue in Local Mode
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* 1. Dashboard View */}
              {currentTab === 'dashboard' && (
            <DashboardView
              profile={appState.profile}
              settings={appState.settings}
              relapses={appState.relapses}
              finances={appState.finances}
              familyMoney={appState.familyMoney}
              recipes={appState.recipes}
              onNavigate={setCurrentTab}
              onOpenRelapseModal={() => setIsRelapseModalOpen(true)}
              onOpenFinanceModal={type => {
                setFinanceModalType(type || 'expense');
                setEditingFinance(null);
                setIsFinanceModalOpen(true);
              }}
              onOpenFamilyModal={() => {
                setEditingFamily(null);
                setIsFamilyModalOpen(true);
              }}
              onOpenRecipeModal={() => {
                setEditingRecipe(null);
                setIsRecipeModalOpen(true);
              }}
              onOpenReportModal={() => setIsReportModalOpen(true)}
              onOpenUrgeGuide={() => setIsUrgeGuideOpen(true)}
            />
          )}

          {/* 1b. Personal AI Workspace (Isolated CareerPilot AI Agent Engineer System) */}
          {currentTab === 'personal-ai' && (
            <PersonalAIView
              onOpenCVLibrary={() => setCurrentTab('cv-library')}
              onOpenGmailCenter={() => setCurrentTab('gmail-center')}
              onOpenExistingInterviewCenter={() => setCurrentTab('interview-admin')}
            />
          )}

          {/* 2. Europe Job Market - Dedicated Independent View */}
          {(currentTab === 'europe-jobs' || currentTab === 'europe' || currentTab === 'europe-job-market') && (
            <EuropeJobMarketView
              onNavigateToCompose={() => setCurrentTab('gmail-center')}
              onNavigateToQueue={() => setCurrentTab('bulk-queue')}
              onOpenCVLibrary={() => setCurrentTab('cv-library')}
            />
          )}

          {/* 3. Global Job Sponsorship - Dedicated Independent View */}
          {(currentTab === 'sponsorship-jobs' || currentTab === 'sponsorship' || currentTab === 'global-sponsorship') && (
            <GlobalSponsorshipView
              onNavigateToHistory={() => setCurrentTab('application-history')}
              onNavigateToCVLibrary={() => setCurrentTab('cv-library')}
            />
          )}

          {/* 4. Cyprus Job Market - Dedicated Independent View */}
          {(currentTab === 'cyprus-jobs' || currentTab === 'cyprus') && (
            <CyprusJobMarketView
              onNavigateToCompose={() => setCurrentTab('gmail-center')}
            />
          )}

          {/* 5. AI Job Search */}
          {(currentTab === 'ai-job-search' || currentTab === 'jobs') && (
            <JobSearchView
              onNavigateToComposeEmail={() => setCurrentTab('gmail-center')}
            />
          )}

          {/* 6. Saved Jobs */}
          {currentTab === 'saved-jobs' && (
            <JobSearchView
              initialTab="saved"
              onNavigateToComposeEmail={() => setCurrentTab('gmail-center')}
            />
          )}

          {/* 7. CV Library & Builder */}
          {(currentTab === 'cv-library' || currentTab === 'cv') && (
            <CVBuilderView
              onBackToApp={() => setCurrentTab('dashboard')}
              onOpenApplyByEmail={() => setCurrentTab('gmail-center')}
            />
          )}

          {/* 8. Cover Letter Manager */}
          {currentTab === 'cover-letters' && (
            <CoverLetterManagerView />
          )}

          {/* 9. Professional Photos & Documents */}
          {currentTab === 'photos-docs' && (
            <ProfessionalPhotosView />
          )}

          {/* 10. Gmail Application Center */}
          {(currentTab === 'gmail-center' || currentTab === 'apply-email') && (
            <ApplyByEmailView
              onBackToDashboard={() => setCurrentTab('dashboard')}
              onOpenCVLibrary={() => setCurrentTab('cv-library')}
            />
          )}

          {/* 11. Bulk Application Queue */}
          {currentTab === 'bulk-queue' && (
            <BulkQueueView
              onOpenGmailCenter={() => setCurrentTab('gmail-center')}
            />
          )}

          {/* 11b. Google Sheets Applications Tracker */}
          {currentTab === 'google-sheets' && (
            <GoogleSheetsTrackerView />
          )}

          {/* 12. Application History */}
          {currentTab === 'application-history' && (
            <ApplicationHistoryView />
          )}

          {/* 13. Employer Replies */}
          {currentTab === 'employer-replies' && (
            <EmployerRepliesView />
          )}

          {/* 14. Rejected Applications & Reapply Later */}
          {currentTab === 'rejected-reapply' && (
            <RejectedApplicationsView />
          )}

          {/* 15. Profile & Settings */}
          {currentTab === 'settings' && (
            <SettingsView
              user={user}
              settings={appState.settings}
              fullAppState={appState}
              onUpdateSettings={handleUpdateSettings}
              onGoogleSignIn={handleGoogleSignIn}
              onLogout={handleLogout}
              onRestoreState={setAppState}
              onOpenAndroidExport={() => setIsAndroidExportOpen(true)}
              isCloudSynced={isCloudSynced}
            />
          )}

          {/* 16. AI Interview & English Assessment Center (Admin Control Panel & Portal Preview) */}
          {currentTab === 'interview-admin' && (
            <InterviewAdminView
              onLaunchParticipantPortalPreview={() => setCurrentTab('interview-portal')}
              onGetCertificate={pre => {
                setPendingCertificatePreselection(pre);
                setCertPreselection(pre);
                setCurrentTab('certificate');
              }}
            />
          )}

          {currentTab === 'interview-portal' && (
            <InterviewPortalView
              isAdminPreview={true}
              onExitPortal={() => setCurrentTab('interview-admin')}
              onSwitchToAdminPanel={() => setCurrentTab('interview-admin')}
              onGetCertificate={pre => {
                setPendingCertificatePreselection(pre);
                setCertPreselection(pre);
                setCurrentTab('certificate');
              }}
            />
          )}

          {/* 17. Belvoriné Mixology Official Certificate Generator & Verification */}
          {currentTab === 'certificate' && (
            <CertificateGeneratorView
              initialVerifyId={VerifyCertIdFromUrl || undefined}
              initialPreselection={certPreselection}
            />
          )}

          {/* Preserved Personal Hub Sections */}
          {currentTab === 'relapse' && (
            <RelapseTrackerView
              settings={appState.settings}
              relapses={appState.relapses}
              onOpenRelapseModal={() => setIsRelapseModalOpen(true)}
              onOpenUrgeGuide={() => setIsUrgeGuideOpen(true)}
              onDeleteRelapse={handleDeleteRelapse}
              onUpdateHabitName={handleUpdateHabitName}
            />
          )}

          {currentTab === 'finance' && (
            <FinanceTrackerView
              finances={appState.finances}
              currency={appState.settings.currency || '$'}
              onOpenAddModal={type => {
                setFinanceModalType(type || 'expense');
                setEditingFinance(null);
                setIsFinanceModalOpen(true);
              }}
              onEditRecord={record => {
                setEditingFinance(record);
                setFinanceModalType(record.type);
                setIsFinanceModalOpen(true);
              }}
              onDeleteRecord={handleDeleteFinance}
            />
          )}

          {currentTab === 'family' && (
            <FamilyMoneyView
              familyMoney={appState.familyMoney}
              currency={appState.settings.currency || '$'}
              onOpenAddModal={() => {
                setEditingFamily(null);
                setIsFamilyModalOpen(true);
              }}
              onEditRecord={record => {
                setEditingFamily(record);
                setIsFamilyModalOpen(true);
              }}
              onDeleteRecord={handleDeleteFamilyMoney}
            />
          )}

          {(currentTab === 'recipe-book' || currentTab === 'recipes') && (
            <RecipeLibraryView
              recipes={appState.recipes}
              onOpenAddModal={() => {
                setEditingRecipe(null);
                setIsRecipeModalOpen(true);
              }}
              onEditRecipe={recipe => {
                setEditingRecipe(recipe);
                setIsRecipeModalOpen(true);
              }}
              onDeleteRecipe={handleDeleteRecipe}
              onToggleFavorite={handleToggleFavoriteRecipe}
              onSyncLegacyRecipe={handleSaveRecipe}
            />
          )}

          {currentTab === 'ai' && (
            <AIAssistantView
              settings={appState.settings}
              relapses={appState.relapses}
              finances={appState.finances}
              familyMoney={appState.familyMoney}
              currency={appState.settings.currency || '$'}
              onOpenUrgeGuide={() => setIsUrgeGuideOpen(true)}
            />
          )}

          {currentTab === 'reports' && (
            <ReportsView
              reports={appState.reports}
              onOpenReportModal={() => setIsReportModalOpen(true)}
              onDeleteReport={handleDeleteReport}
              currency={appState.settings.currency || '$'}
            />
          )}

          {currentTab === 'stats' && (
            <ProgressStatsView
              finances={appState.finances}
              relapses={appState.relapses}
              familyMoney={appState.familyMoney}
              settings={appState.settings}
              currency={appState.settings.currency || '$'}
            />
          )}
          </>
        )}
        </main>

        {/* Global Bottom Navigation */}
        <BottomNav
          currentTab={currentTab}
          onSelectTab={(tab) => {
            if (tab === 'europe' || tab === 'europe-job-market') {
              setCurrentTab('europe-jobs');
            } else if (tab === 'sponsorship' || tab === 'global-sponsorship') {
              setCurrentTab('sponsorship-jobs');
            } else if (tab === 'cyprus') {
              setCurrentTab('cyprus-jobs');
            } else {
              setCurrentTab(tab);
            }
          }}
          onToggleMobileMenu={() => setIsMobileSidebarOpen(prev => !prev)}
        />
      </div>

      {/* Modals */}
      {isRelapseModalOpen && (
        <RelapseModal
          isOpen={isRelapseModalOpen}
          onClose={() => setIsRelapseModalOpen(false)}
          onConfirmRelapse={handleConfirmRelapse}
          habitName={appState.settings.habitName}
          currentStreakDays={Math.max(
            0,
            Math.floor(
              (Date.now() - new Date(appState.settings.habitStartDate).getTime()) / (1000 * 60 * 60 * 24)
            )
          )}
          onOpenGuide={() => {
            setIsRelapseModalOpen(false);
            setIsUrgeGuideOpen(true);
          }}
        />
      )}

      {isFinanceModalOpen && (
        <FinanceModal
          isOpen={isFinanceModalOpen}
          onClose={() => {
            setIsFinanceModalOpen(false);
            setEditingFinance(null);
          }}
          onSave={handleSaveFinance}
          currency={appState.settings.currency || '$'}
          initialRecord={editingFinance}
        />
      )}

      {isFamilyModalOpen && (
        <FamilyMoneyModal
          isOpen={isFamilyModalOpen}
          onClose={() => {
            setIsFamilyModalOpen(false);
            setEditingFamily(null);
          }}
          onSave={handleSaveFamilyMoney}
          currency={appState.settings.currency || '$'}
          initialRecord={editingFamily}
        />
      )}

      {isRecipeModalOpen && (
        <RecipeModal
          isOpen={isRecipeModalOpen}
          onClose={() => {
            setIsRecipeModalOpen(false);
            setEditingRecipe(null);
          }}
          onSave={handleSaveRecipe}
          initialRecord={editingRecipe}
        />
      )}

      {isReportModalOpen && (
        <AIReportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          statsPayload={currentMonthStats}
          currency={appState.settings.currency || '$'}
          onSaveReport={handleSaveReport}
        />
      )}

      {isUrgeGuideOpen && (
        <EducationalUrgeGuide
          habitName={appState.settings.habitName}
          onClose={() => setIsUrgeGuideOpen(false)}
        />
      )}

      {isAndroidExportOpen && (
        <AndroidExportModal
          isOpen={isAndroidExportOpen}
          onClose={() => setIsAndroidExportOpen(false)}
        />
      )}
    </div>
  );
}
