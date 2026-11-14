import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Filter,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  PieChart,
  TrendingUp,
  FileSpreadsheet,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  FolderOpen,
  Sliders,
  BarChart3,
  FileText,
  Layers,
  ChevronRight,
  ChevronDown,
  ArrowUpDown,
  Eye,
  X,
  Copy,
  Check,
  Sparkles,
  ShieldCheck,
  Clock,
  Link2,
  Unlink,
  Code2,
} from 'lucide-react';
import { FinanceRecord, FinanceType } from '../types';
import { useTheme } from '../context/ThemeContext';
import {
  getCachedGoogleToken,
  isGoogleTokenExpired,
  signInWithGoogle,
  getCachedUserEmail,
} from '../services/firebase';
import { GoogleSpreadsheetItem } from '../services/sheetsService';
import {
  StandardFinanceCategory,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  SheetColumnMapping,
  NormalizedSheetTransaction,
  ConnectedFinanceSheetConfig,
  loadFinanceSheetConfig,
  saveFinanceSheetConfig,
  loadCachedSheetTransactions,
  disconnectFinanceSheet,
  fetchUserDriveSpreadsheets,
  syncFinanceSpreadsheet,
  classifyFinanceCategory,
  generateAppsScriptOnEditSnippet,
} from '../services/googleSheetsFinanceService';

interface FinanceTrackerViewProps {
  finances: FinanceRecord[];
  currency: string;
  onOpenAddModal: (type?: FinanceType) => void;
  onEditRecord: (record: FinanceRecord) => void;
  onDeleteRecord: (id: string) => Promise<void>;
}

type DateFilterPreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'prevMonth'
  | 'custom'
  | 'all';

type FinanceSectionTab =
  | 'overview'
  | 'analytics'
  | 'transactions'
  | 'monthly-report'
  | 'sheet-sync';

type SortField = 'date' | 'description' | 'category' | 'income' | 'expense' | 'balance';
type SortOrder = 'asc' | 'desc';

const CATEGORY_COLORS: Record<string, { bar: string; badge: string; hex: string }> = {
  'Food & Dining': {
    bar: 'from-amber-400 to-orange-500',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    hex: '#f59e0b',
  },
  Transportation: {
    bar: 'from-sky-400 to-blue-500',
    badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    hex: '#38bdf8',
  },
  Accommodation: {
    bar: 'from-violet-400 to-purple-500',
    badge: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    hex: '#a78bfa',
  },
  Shopping: {
    bar: 'from-pink-400 to-rose-500',
    badge: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
    hex: '#f472b6',
  },
  'Personal Expenses': {
    bar: 'from-teal-400 to-emerald-500',
    badge: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
    hex: '#2dd4bf',
  },
  'Bills & Utilities': {
    bar: 'from-indigo-400 to-blue-600',
    badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    hex: '#818cf8',
  },
  'Other Expenses': {
    bar: 'from-zinc-400 to-slate-500',
    badge: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
    hex: '#a1a1aa',
  },
  Salary: {
    bar: 'from-emerald-400 to-green-500',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    hex: '#34d399',
  },
  Tips: {
    bar: 'from-lime-400 to-emerald-500',
    badge: 'bg-lime-500/15 text-lime-300 border-lime-500/30',
    hex: '#a3e635',
  },
  'Additional Income': {
    bar: 'from-cyan-400 to-sky-500',
    badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    hex: '#22d3ee',
  },
};

function toLocalISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const FinanceTrackerView: React.FC<FinanceTrackerViewProps> = ({
  finances,
  currency,
  onOpenAddModal,
  onEditRecord,
  onDeleteRecord,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Active sub-navigation tab
  const [activeTab, setActiveTab] = useState<FinanceSectionTab>('overview');

  // Google Sheets Connection & Sync State
  const [sheetConfig, setSheetConfig] = useState<ConnectedFinanceSheetConfig | null>(() =>
    loadFinanceSheetConfig()
  );
  const [sheetTransactions, setSheetTransactions] = useState<NormalizedSheetTransaction[]>(() =>
    loadFinanceSheetConfig() ? loadCachedSheetTransactions() : []
  );
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncStatusBanner, setSyncStatusBanner] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Drive Picker & Direct URL/ID Connection State
  const [driveSheets, setDriveSheets] = useState<GoogleSpreadsheetItem[]>([]);
  const [isLoadingDriveList, setIsLoadingDriveList] = useState<boolean>(false);
  const [showDrivePickerModal, setShowDrivePickerModal] = useState<boolean>(false);
  const [spreadsheetInputUrl, setSpreadsheetInputUrl] = useState<string>(
    () => loadFinanceSheetConfig()?.spreadsheetId || ''
  );
  const [dataSourceFilter, setDataSourceFilter] = useState<'all' | 'sheets' | 'local'>('all');
  const [copiedWebhookScript, setCopiedWebhookScript] = useState<boolean>(false);
  const lastWebhookTimestampRef = useRef<number>(0);

  // Date Filtering State
  const todayStr = useMemo(() => toLocalISODate(new Date()), []);
  const currentMonthStr = useMemo(() => todayStr.slice(0, 7), [todayStr]);
  const currentYearStr = useMemo(() => todayStr.slice(0, 4), [todayStr]);

  const [datePreset, setDatePreset] = useState<DateFilterPreset>('thisMonth');
  const [customStartDate, setCustomStartDate] = useState<string>(() => `${currentMonthStr}-01`);
  const [customEndDate, setCustomEndDate] = useState<string>(() => todayStr);

  // Transaction History Table State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [flowFilter, setFlowFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [inspectedTransaction, setInspectedTransaction] =
    useState<NormalizedSheetTransaction | null>(null);

  // Monthly Report Month Selector
  const [reportMonth, setReportMonth] = useState<string>(currentMonthStr);

  const isGoogleConnected = Boolean(getCachedGoogleToken() && !isGoogleTokenExpired());
  const userEmail = getCachedUserEmail();

  // Execute synchronization with the connected Google Sheet
  const performSheetSync = useCallback(
    async (options?: {
      targetIdOrUrl?: string;
      preferredWorksheet?: string;
      customMapping?: SheetColumnMapping;
      interactiveAuth?: boolean;
      silent?: boolean;
    }) => {
      const targetId = options?.targetIdOrUrl ?? sheetConfig?.spreadsheetId ?? spreadsheetInputUrl;
      if (!targetId) {
        if (!options?.silent) {
          setSyncError('Please select a Google Sheet from Drive or paste your Spreadsheet URL/ID.');
        }
        return;
      }

      if (!options?.silent) {
        setIsSyncing(true);
        setSyncError(null);
      }

      try {
        const result = await syncFinanceSpreadsheet({
          spreadsheetIdOrUrl: targetId,
          preferredWorksheet: options?.preferredWorksheet ?? sheetConfig?.selectedWorksheet,
          customMapping: options?.customMapping ?? sheetConfig?.columnMapping,
          interactiveAuth: options?.interactiveAuth ?? false,
        });

        setSheetConfig(result.config);
        setSheetTransactions(result.transactions);
        setSpreadsheetInputUrl(result.config.spreadsheetId);
        setSyncError(null);

        if (!options?.silent) {
          setSyncStatusBanner({
            type: 'success',
            message: `Synchronized ${result.validTransactionCount} financial record(s) from "${result.config.spreadsheetTitle}" (${result.config.selectedWorksheet}).`,
          });
          setTimeout(() => setSyncStatusBanner(null), 5000);
        }
      } catch (err: any) {
        const msg = err?.message || 'Failed to synchronize with Google Sheets.';
        setSyncError(msg);
        if (!options?.silent) {
          setSyncStatusBanner({
            type: 'error',
            message: msg,
          });
        }
      } finally {
        if (!options?.silent) {
          setIsSyncing(false);
        }
      }
    },
    [sheetConfig, spreadsheetInputUrl]
  );

  // Initial sync on mount if a sheet is configured and token is valid
  useEffect(() => {
    if (sheetConfig?.spreadsheetId && isGoogleConnected) {
      performSheetSync({
        targetIdOrUrl: sheetConfig.spreadsheetId,
        preferredWorksheet: sheetConfig.selectedWorksheet,
        customMapping: sheetConfig.columnMapping,
        silent: true,
      });
    }
  }, []);

  // Periodic background auto-sync + window focus sync + onEdit webhook listener
  useEffect(() => {
    if (!sheetConfig?.spreadsheetId || !sheetConfig.autoSyncEnabled) return;

    const intervalMs = Math.max(15, sheetConfig.pollIntervalSeconds || 30) * 1000;
    const pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && !isGoogleTokenExpired()) {
        performSheetSync({ silent: true });
      }
    }, intervalMs);

    // Check lightweight onEdit webhook endpoint every 5 seconds for near-real-time push updates
    const webhookTimer = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch(
          `/api/finance/sheets-webhook-status?spreadsheetId=${encodeURIComponent(
            sheetConfig.spreadsheetId
          )}`
        );
        if (!res.ok) return;
        const data = await res.json();
        const receivedAt = Number(data?.lastEvent?.receivedAt || 0);
        if (receivedAt > 0 && receivedAt > lastWebhookTimestampRef.current) {
          lastWebhookTimestampRef.current = receivedAt;
          performSheetSync({ silent: true });
        }
      } catch {
        // ignore network poll errors
      }
    }, 5000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' && !isGoogleTokenExpired()) {
        performSheetSync({ silent: true });
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      clearInterval(pollTimer);
      clearInterval(webhookTimer);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [
    sheetConfig?.spreadsheetId,
    sheetConfig?.autoSyncEnabled,
    sheetConfig?.pollIntervalSeconds,
    performSheetSync,
  ]);

  // Convert local app FinanceRecord items into NormalizedSheetTransaction format
  const normalizedLocalTransactions: NormalizedSheetTransaction[] = useMemo(() => {
    return finances.map((rec, index) => {
      const isIncome = rec.type === 'income';
      const mappedCat = classifyFinanceCategory(rec.category, rec.notes || '', rec.type);
      const salaryAmount = isIncome && mappedCat === 'Salary' ? rec.amount : 0;
      const tipsAmount = isIncome && mappedCat === 'Tips' ? rec.amount : 0;
      const additionalIncomeAmount = isIncome && mappedCat === 'Additional Income' ? rec.amount : 0;

      return {
        id: rec.id,
        rowIndex: index + 1,
        date: rec.date,
        rawDate: rec.date,
        description: rec.notes || rec.category,
        category: mappedCat,
        originalCategory: rec.category,
        flowType: rec.type,
        income: isIncome ? rec.amount : 0,
        salaryAmount,
        tipsAmount,
        additionalIncomeAmount,
        expense: !isIncome ? rec.amount : 0,
        balance: null,
        computedBalance: 0,
        source: 'local',
        worksheetName: 'App Ledger',
        rawRow: {
          Date: rec.date,
          Type: rec.type,
          Category: rec.category,
          Amount: String(rec.amount),
          Notes: rec.notes || '',
        },
      };
    });
  }, [finances]);

  // Unified transaction stream based on source filter, deduplicated and with running balance
  const allUnifiedTransactions: NormalizedSheetTransaction[] = useMemo(() => {
    let combined: NormalizedSheetTransaction[] = [];
    if (dataSourceFilter === 'sheets') {
      combined = [...sheetTransactions];
    } else if (dataSourceFilter === 'local') {
      combined = [...normalizedLocalTransactions];
    } else {
      // Combine both, avoiding duplicates if a local entry matches a sheet row on date + amount + category
      const sheetKeys = new Set(
        sheetTransactions.map(
          t => `${t.date}|${t.category}|${t.income.toFixed(2)}|${t.expense.toFixed(2)}`
        )
      );
      const nonDuplicateLocal = normalizedLocalTransactions.filter(
        l =>
          !sheetKeys.has(`${l.date}|${l.category}|${l.income.toFixed(2)}|${l.expense.toFixed(2)}`)
      );
      combined = [...sheetTransactions, ...nonDuplicateLocal];
    }

    // Sort oldest -> newest to compute running balance if needed
    const chronological = [...combined].sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      if (cmp !== 0) return cmp;
      return a.rowIndex - b.rowIndex;
    });

    let running = 0;
    chronological.forEach(item => {
      running += item.income - item.expense;
      item.computedBalance = item.balance !== null ? item.balance : running;
    });

    return chronological.reverse();
  }, [sheetTransactions, normalizedLocalTransactions, dataSourceFilter]);

  // Compute Date Range Bounds for active DateFilterPreset
  const activeDateBounds = useMemo(() => {
    const now = new Date();
    const today = toLocalISODate(now);

    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(now.getDate() - 1);
    const yesterday = toLocalISODate(yesterdayDate);

    const last7Date = new Date(now);
    last7Date.setDate(now.getDate() - 6);
    const last7Start = toLocalISODate(last7Date);

    const last30Date = new Date(now);
    last30Date.setDate(now.getDate() - 29);
    const last30Start = toLocalISODate(last30Date);

    const thisMonthStart = `${today.slice(0, 7)}-01`;

    const prevMonthFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthLast = new Date(now.getFullYear(), now.getMonth(), 0);
    const prevMonthStart = toLocalISODate(prevMonthFirst);
    const prevMonthEnd = toLocalISODate(prevMonthLast);

    switch (datePreset) {
      case 'today':
        return { start: today, end: today, label: 'Today' };
      case 'yesterday':
        return { start: yesterday, end: yesterday, label: 'Yesterday' };
      case 'last7':
        return { start: last7Start, end: today, label: 'Last 7 Days' };
      case 'last30':
        return { start: last30Start, end: today, label: 'Last 30 Days' };
      case 'thisMonth':
        return { start: thisMonthStart, end: `${today.slice(0, 7)}-31`, label: 'This Month' };
      case 'prevMonth':
        return { start: prevMonthStart, end: prevMonthEnd, label: 'Previous Month' };
      case 'custom':
        return {
          start: customStartDate || '1970-01-01',
          end: customEndDate || '2099-12-31',
          label: `${customStartDate} → ${customEndDate}`,
        };
      case 'all':
      default:
        return { start: '1970-01-01', end: '2099-12-31', label: 'All Synchronized Records' };
    }
  }, [datePreset, customStartDate, customEndDate]);

  // Filtered transactions for the active date range
  const periodTransactions = useMemo(() => {
    return allUnifiedTransactions.filter(
      tx => tx.date >= activeDateBounds.start && tx.date <= activeDateBounds.end
    );
  }, [allUnifiedTransactions, activeDateBounds]);

  // ============================================================================
  // PART 2.B — FINANCE DASHBOARD METRICS
  // ============================================================================

  // 1. Total Expenses across all required windows (Today, Weekly, Monthly, Yearly, Custom/Selected Range)
  const expenseMetrics = useMemo(() => {
    const now = new Date();
    const today = toLocalISODate(now);
    const weekAgoDate = new Date(now);
    weekAgoDate.setDate(now.getDate() - 6);
    const weekStart = toLocalISODate(weekAgoDate);

    let todayExp = 0;
    let weeklyExp = 0;
    let monthlyExp = 0;
    let yearlyExp = 0;

    allUnifiedTransactions.forEach(tx => {
      if (tx.expense <= 0) return;
      if (tx.date === today) todayExp += tx.expense;
      if (tx.date >= weekStart && tx.date <= today) weeklyExp += tx.expense;
      if (tx.date.startsWith(currentMonthStr)) monthlyExp += tx.expense;
      if (tx.date.startsWith(currentYearStr)) yearlyExp += tx.expense;
    });

    const periodExp = periodTransactions.reduce((sum, tx) => sum + tx.expense, 0);

    return {
      todayExp,
      weeklyExp,
      monthlyExp,
      yearlyExp,
      periodExp,
    };
  }, [allUnifiedTransactions, periodTransactions, currentMonthStr, currentYearStr]);

  // 2. Income Overview (Monthly Salary, Tips Received, Additional Income, Daily & Monthly Income, Period Total)
  const incomeMetrics = useMemo(() => {
    let monthlySalary = 0;
    let monthlyTips = 0;
    let monthlyAdditional = 0;
    let todayIncome = 0;

    allUnifiedTransactions.forEach(tx => {
      if (tx.income <= 0) return;
      if (tx.date === todayStr) {
        todayIncome += tx.income;
      }
      if (tx.date.startsWith(currentMonthStr)) {
        monthlySalary += tx.salaryAmount;
        monthlyTips += tx.tipsAmount;
        monthlyAdditional += tx.additionalIncomeAmount;
      }
    });

    const monthlyTotalIncome = monthlySalary + monthlyTips + monthlyAdditional;

    let periodSalary = 0;
    let periodTips = 0;
    let periodAdditional = 0;
    periodTransactions.forEach(tx => {
      periodSalary += tx.salaryAmount;
      periodTips += tx.tipsAmount;
      periodAdditional += tx.additionalIncomeAmount;
    });
    const periodTotalIncome = periodSalary + periodTips + periodAdditional;

    return {
      monthlySalary,
      monthlyTips,
      monthlyAdditional,
      monthlyTotalIncome,
      todayIncome,
      periodSalary,
      periodTips,
      periodAdditional,
      periodTotalIncome,
    };
  }, [allUnifiedTransactions, periodTransactions, todayStr, currentMonthStr]);

  // 3. Financial Summary (Net Balance = Total Income - Total Expenses, Savings %, Income vs Expense)
  const summaryMetrics = useMemo(() => {
    const totalIncome = incomeMetrics.periodTotalIncome;
    const totalExpenses = expenseMetrics.periodExp;
    const netBalance = totalIncome - totalExpenses;
    const savingsPercentage = totalIncome > 0 ? (netBalance / totalIncome) * 100 : 0;
    const expenseRatio = totalIncome > 0 ? Math.min(100, (totalExpenses / totalIncome) * 100) : 0;

    return {
      totalIncome,
      totalExpenses,
      netBalance,
      savingsPercentage,
      expenseRatio,
    };
  }, [incomeMetrics.periodTotalIncome, expenseMetrics.periodExp]);

  // ============================================================================
  // PART 2.C & 2.D — ANALYTICS SERIES & CATEGORY BREAKDOWN
  // ============================================================================

  // Expense Category Breakdown for Selected Period
  const expenseCategoryBreakdown = useMemo(() => {
    const totals: Record<string, { amount: number; count: number }> = {};
    EXPENSE_CATEGORIES.forEach(c => {
      totals[c] = { amount: 0, count: 0 };
    });

    periodTransactions.forEach(tx => {
      if (tx.expense > 0) {
        const cat = EXPENSE_CATEGORIES.includes(tx.category as any)
          ? tx.category
          : 'Other Expenses';
        totals[cat].amount += tx.expense;
        totals[cat].count += 1;
      }
    });

    const totalExp = Object.values(totals).reduce((s, v) => s + v.amount, 0);
    return EXPENSE_CATEGORIES.map(category => ({
      category,
      amount: totals[category].amount,
      count: totals[category].count,
      percentage: totalExp > 0 ? (totals[category].amount / totalExp) * 100 : 0,
      color: CATEGORY_COLORS[category] || CATEGORY_COLORS['Other Expenses'],
    })).sort((a, b) => b.amount - a.amount);
  }, [periodTransactions]);

  // Daily Expense Series (for Daily Expense Chart — up to 14 or 30 days in period)
  const dailyExpenseSeries = useMemo(() => {
    const map: Record<string, { date: string; expense: number; income: number }> = {};
    periodTransactions.forEach(tx => {
      if (!map[tx.date]) {
        map[tx.date] = { date: tx.date, expense: 0, income: 0 };
      }
      map[tx.date].expense += tx.expense;
      map[tx.date].income += tx.income;
    });

    const sorted = Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
    return sorted.slice(-20); // Show up to 20 recent active days cleanly
  }, [periodTransactions]);

  // Monthly Series across all synchronized records (for Monthly Expense Trend, Salary & Tips Comparison, Income vs Expenses, Monthly Savings Trend)
  const monthlyAnalyticsSeries = useMemo(() => {
    const map: Record<
      string,
      {
        month: string;
        income: number;
        salary: number;
        tips: number;
        additionalIncome: number;
        expense: number;
        savings: number;
        savingsRate: number;
      }
    > = {};

    allUnifiedTransactions.forEach(tx => {
      const m = tx.date.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(m)) return;
      if (!map[m]) {
        map[m] = {
          month: m,
          income: 0,
          salary: 0,
          tips: 0,
          additionalIncome: 0,
          expense: 0,
          savings: 0,
          savingsRate: 0,
        };
      }
      map[m].income += tx.income;
      map[m].salary += tx.salaryAmount;
      map[m].tips += tx.tipsAmount;
      map[m].additionalIncome += tx.additionalIncomeAmount;
      map[m].expense += tx.expense;
    });

    const list = Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
    list.forEach(item => {
      item.savings = item.income - item.expense;
      item.savingsRate = item.income > 0 ? (item.savings / item.income) * 100 : 0;
    });

    return list.slice(-12);
  }, [allUnifiedTransactions]);

  // ============================================================================
  // PART 2.E — TRANSACTION HISTORY FILTERING & SORTING
  // ============================================================================
  const filteredSortedTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = periodTransactions.filter(tx => {
      if (flowFilter === 'income' && tx.income <= 0) return false;
      if (flowFilter === 'expense' && tx.expense <= 0) return false;
      if (selectedCategory !== 'all' && tx.category !== selectedCategory) return false;

      if (q) {
        const matchDesc = tx.description.toLowerCase().includes(q);
        const matchCat =
          tx.category.toLowerCase().includes(q) || tx.originalCategory.toLowerCase().includes(q);
        const matchDate = tx.date.includes(q) || tx.rawDate.toLowerCase().includes(q);
        const matchRaw = Object.values(tx.rawRow).some(v => v.toLowerCase().includes(q));
        if (!matchDesc && !matchCat && !matchDate && !matchRaw) return false;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'date') cmp = a.date.localeCompare(b.date) || a.rowIndex - b.rowIndex;
      else if (sortField === 'description') cmp = a.description.localeCompare(b.description);
      else if (sortField === 'category') cmp = a.category.localeCompare(b.category);
      else if (sortField === 'income') cmp = a.income - b.income;
      else if (sortField === 'expense') cmp = a.expense - b.expense;
      else if (sortField === 'balance') cmp = a.computedBalance - b.computedBalance;
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [periodTransactions, flowFilter, selectedCategory, searchQuery, sortField, sortOrder]);

  // Available months for Monthly Financial Report selector
  const availableReportMonths = useMemo(() => {
    const set = new Set<string>([currentMonthStr]);
    allUnifiedTransactions.forEach(tx => {
      const m = tx.date.slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(m)) set.add(m);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [allUnifiedTransactions, currentMonthStr]);

  // ============================================================================
  // PART 2.F — AUTOMATED MONTHLY FINANCIAL REPORT & PREVIOUS MONTH COMPARISON
  // ============================================================================
  const monthlyFinancialReport = useMemo(() => {
    const computeForMonth = (monthStr: string) => {
      const txs = allUnifiedTransactions.filter(tx => tx.date.startsWith(monthStr));
      let salary = 0;
      let tips = 0;
      let additionalIncome = 0;
      let totalSpent = 0;
      const byCategory: Record<string, number> = {};
      const activeDays = new Set<string>();

      txs.forEach(tx => {
        salary += tx.salaryAmount;
        tips += tx.tipsAmount;
        additionalIncome += tx.additionalIncomeAmount;
        totalSpent += tx.expense;
        if (tx.expense > 0) {
          byCategory[tx.category] = (byCategory[tx.category] || 0) + tx.expense;
          activeDays.add(tx.date);
        }
      });

      const totalIncome = salary + tips + additionalIncome;
      const remainingBalance = totalIncome - totalSpent;
      const totalSavings = remainingBalance;
      const savingsRate = totalIncome > 0 ? (totalSavings / totalIncome) * 100 : 0;

      // Days in month calculation for Average Daily Expenses
      const [yStr, mStr] = monthStr.split('-');
      const year = parseInt(yStr, 10) || new Date().getFullYear();
      const month = parseInt(mStr, 10) || 1;
      const daysInCalendarMonth = new Date(year, month, 0).getDate();
      const isCurrentMonth = monthStr === currentMonthStr;
      const elapsedDays = isCurrentMonth
        ? Math.max(1, new Date().getDate())
        : daysInCalendarMonth;
      const avgDailyExpense = totalSpent / elapsedDays;

      // Highest spending category
      let highestCategory = 'None';
      let highestCategoryAmount = 0;
      Object.entries(byCategory).forEach(([cat, amt]) => {
        if (amt > highestCategoryAmount) {
          highestCategoryAmount = amt;
          highestCategory = cat;
        }
      });

      return {
        month: monthStr,
        transactionCount: txs.length,
        salary,
        tips,
        additionalIncome,
        totalIncome,
        totalSpent,
        remainingBalance,
        totalSavings,
        savingsRate,
        avgDailyExpense,
        elapsedDays,
        highestCategory,
        highestCategoryAmount,
        byCategory,
      };
    };

    // Determine previous month string YYYY-MM
    const [yr, mo] = reportMonth.split('-').map(Number);
    const prevDate = new Date(yr || 2026, (mo || 1) - 2, 1);
    const prevMonthStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(
      2,
      '0'
    )}`;

    const current = computeForMonth(reportMonth);
    const previous = computeForMonth(prevMonthStr);

    const calcDeltaPct = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return ((curr - prev) / prev) * 100;
    };

    return {
      current,
      previous,
      deltas: {
        incomeDiff: current.totalIncome - previous.totalIncome,
        incomePct: calcDeltaPct(current.totalIncome, previous.totalIncome),
        spentDiff: current.totalSpent - previous.totalSpent,
        spentPct: calcDeltaPct(current.totalSpent, previous.totalSpent),
        savingsDiff: current.totalSavings - previous.totalSavings,
        savingsPct: calcDeltaPct(current.totalSavings, previous.totalSavings),
        salaryDiff: current.salary - previous.salary,
        tipsDiff: current.tips - previous.tips,
      },
    };
  }, [allUnifiedTransactions, reportMonth, currentMonthStr]);

  // Handlers for Google Sheets Picker & Column Mapping
  const handleOpenDriveSheetPicker = async () => {
    setShowDrivePickerModal(true);
    setIsLoadingDriveList(true);
    setSyncError(null);
    try {
      const sheets = await fetchUserDriveSpreadsheets();
      setDriveSheets(sheets);
    } catch (err: any) {
      setSyncError(err?.message || 'Could not list spreadsheets from Google Drive.');
    } finally {
      setIsLoadingDriveList(false);
    }
  };

  const handleSelectDriveSpreadsheet = async (item: GoogleSpreadsheetItem) => {
    setShowDrivePickerModal(false);
    setSpreadsheetInputUrl(item.id);
    await performSheetSync({
      targetIdOrUrl: item.id,
      interactiveAuth: true,
    });
  };

  const handleChangeWorksheet = async (newWorksheet: string) => {
    if (!sheetConfig) return;
    await performSheetSync({
      targetIdOrUrl: sheetConfig.spreadsheetId,
      preferredWorksheet: newWorksheet,
      // Re-detect column mapping on the newly selected tab
      customMapping: undefined,
    });
  };

  const handleUpdateColumnMappingField = async (
    field: keyof SheetColumnMapping,
    colIdx: number
  ) => {
    if (!sheetConfig) return;
    const updatedMapping: SheetColumnMapping = {
      ...sheetConfig.columnMapping,
      [field]: colIdx,
    };
    await performSheetSync({
      targetIdOrUrl: sheetConfig.spreadsheetId,
      preferredWorksheet: sheetConfig.selectedWorksheet,
      customMapping: updatedMapping,
    });
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Glassmorphism card utility classes matching the reference video
  const glassCardClass = isDark
    ? 'bg-[#1d1f26]/85 backdrop-blur-xl border border-white/[0.08] rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.45)]'
    : 'bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-[24px] shadow-[0_10px_30px_rgba(15,23,42,0.05)]';

  const subtleInnerClass = isDark
    ? 'bg-[#14161b]/90 border border-white/[0.06] rounded-2xl'
    : 'bg-slate-50/90 border border-slate-200/70 rounded-2xl';

  // Radial gauge helper for Net Savings / Efficiency (Reference Video Dial Style)
  const renderRadialSavingsDial = (savingsPct: number, netAmount: number) => {
    const clampedPct = Math.max(0, Math.min(100, Math.round(savingsPct)));
    const totalTicks = 28;
    const activeTicks = Math.round((clampedPct / 100) * totalTicks);

    return (
      <div className="relative w-44 h-44 mx-auto flex items-center justify-center select-none">
        <svg viewBox="0 0 180 180" className="w-full h-full">
          {/* Outer tick marks arranged in a 260-degree arc (-220deg to +40deg) */}
          {Array.from({ length: totalTicks }).map((_, i) => {
            const angleDeg = -215 + (i / (totalTicks - 1)) * 250;
            const angleRad = (angleDeg * Math.PI) / 180;
            const innerR = 68;
            const outerR = 78;
            const x1 = 90 + innerR * Math.cos(angleRad);
            const y1 = 90 + innerR * Math.sin(angleRad);
            const x2 = 90 + outerR * Math.cos(angleRad);
            const y2 = 90 + outerR * Math.sin(angleRad);
            const isActive = i < activeTicks;

            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={
                  isActive
                    ? netAmount >= 0
                      ? '#34d399'
                      : '#f43f5e'
                    : isDark
                    ? 'rgba(255,255,255,0.12)'
                    : 'rgba(15,23,42,0.12)'
                }
                strokeWidth="3"
                strokeLinecap="round"
              />
            );
          })}
          {/* Inner subtle ring */}
          <circle
            cx="90"
            cy="90"
            r="56"
            fill="none"
            stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)'}
            strokeWidth="1.5"
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-3">
          <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold">
            Savings Rate
          </span>
          <span
            className={`text-2xl sm:text-3xl font-extrabold font-mono tabular-nums tracking-tight mt-0.5 ${
              netAmount >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {savingsPct.toFixed(1)}%
          </span>
          <span className="text-[11px] font-mono tabular-nums text-zinc-400 mt-0.5">
            {netAmount >= 0 ? '+' : ''}
            {currency}
            {netAmount.toFixed(0)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* =====================================================================
          1. EXECUTIVE HEADER & REAL-TIME GOOGLE SHEETS CONNECTION BAR
          ===================================================================== */}
      <div className={`${glassCardClass} p-5 sm:p-6`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Google Sheets Live Finance Engine</span>
              </span>

              {sheetConfig ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-white/[0.06] text-zinc-200 border border-white/[0.08]">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>
                    Connected: <strong>{sheetConfig.spreadsheetTitle}</strong> ({sheetConfig.selectedWorksheet})
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>No Google Sheet Connected Yet</span>
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Finance &amp; Expense Tracker
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400">
              Non-destructive live Google Sheets synchronization, automated category intelligence, cashflow analytics &amp; monthly performance reports
            </p>
          </div>

          {/* Primary Actions: Sync Now, Connect Sheet, Manual Entry */}
          <div className="flex flex-wrap items-center gap-2.5">
            {sheetConfig ? (
              <>
                <button
                  type="button"
                  onClick={() => performSheetSync({ interactiveAuth: true })}
                  disabled={isSyncing}
                  className="px-4 py-2.5 rounded-2xl bg-white text-[#141517] hover:bg-zinc-100 text-xs font-bold tracking-tight transition flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Syncing Sheet...' : 'Sync Now'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('sheet-sync')}
                  className="px-3.5 py-2.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-zinc-200 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Sheet Settings</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('sheet-sync')}
                className="px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-[#111317] text-xs font-extrabold tracking-tight transition flex items-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Connect Existing Google Sheet</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onOpenAddModal('income')}
              className="px-3.5 py-2.5 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Income</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenAddModal('expense')}
              className="px-3.5 py-2.5 rounded-2xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Expense</span>
            </button>
          </div>
        </div>

        {/* Status / Sync Alert Banner */}
        {(syncStatusBanner || syncError) && (
          <div
            className={`mt-4 p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
              (syncStatusBanner?.type === 'error' || syncError)
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {syncStatusBanner?.type === 'error' || syncError ? (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              )}
              <span>{syncError || syncStatusBanner?.message}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSyncError(null);
                setSyncStatusBanner(null);
              }}
              className="p-1 hover:bg-white/10 rounded-lg"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Sub-Navigation Pills + Date Range Filter Bar */}
        <div className="mt-5 pt-4 border-t border-white/[0.07] flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          {/* Section Navigation Tabs (Reference Video White Pill Active Style) */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar p-1 rounded-2xl bg-[#14161b]/90 border border-white/[0.06]">
            {[
              { id: 'overview' as FinanceSectionTab, label: 'Dashboard', icon: Wallet },
              { id: 'analytics' as FinanceSectionTab, label: 'Analytics & Charts', icon: BarChart3 },
              {
                id: 'transactions' as FinanceSectionTab,
                label: `Transactions (${periodTransactions.length})`,
                icon: Layers,
              },
              { id: 'monthly-report' as FinanceSectionTab, label: 'Monthly Report', icon: FileText },
              {
                id: 'sheet-sync' as FinanceSectionTab,
                label: 'Google Sheets Sync',
                icon: FileSpreadsheet,
              },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold tracking-tight transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-white text-[#141517] shadow-md'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Date Filter Bar (Today, Yesterday, Last 7d, Last 30d, This Month, Prev Month, Custom, All) */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: 'last7', label: 'Last 7D' },
                { id: 'last30', label: 'Last 30D' },
                { id: 'thisMonth', label: 'This Month' },
                { id: 'prevMonth', label: 'Previous Month' },
                { id: 'custom', label: 'Custom Range' },
                { id: 'all', label: 'All Time' },
              ] as { id: DateFilterPreset; label: string }[]
            ).map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setDatePreset(preset.id)}
                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition cursor-pointer ${
                  datePreset === preset.id
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 border border-white/[0.06]'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Range Pickers if 'custom' is active */}
        {datePreset === 'custom' && (
          <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-wrap items-center gap-3 text-xs">
            <span className="text-zinc-400 font-semibold">Custom Date Range:</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-[#14161b] border border-white/10 text-white font-mono text-xs"
              />
              <span className="text-zinc-500">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-[#14161b] border border-white/10 text-white font-mono text-xs"
              />
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          TAB 1: OVERVIEW & FINANCE DASHBOARD
          ===================================================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Prompt Banner if no Google Sheet is connected yet */}
          {!sheetConfig && (
            <div className={`${glassCardClass} p-5 border-emerald-500/30`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Connect Your Existing Google Sheets Financial Ledger
                    </h3>
                    <p className="text-xs text-zinc-400 mt-0.5 max-w-2xl leading-relaxed">
                      Link the spreadsheet where you already record your daily expenses, salary, and tips. We read your existing columns and rows non-destructively—no double entry, no fake data, and zero changes to your original sheet.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('sheet-sync')}
                  className="px-4 py-2.5 rounded-2xl bg-white text-[#141517] hover:bg-zinc-100 text-xs font-bold shrink-0 transition cursor-pointer shadow-md"
                >
                  Select Spreadsheet &rarr;
                </button>
              </div>
            </div>
          )}

          {/* 3-Column Master Dashboard Panels:
              1. Total Expenses (Today, Weekly, Monthly, Yearly, Selected Period)
              2. Income Overview (Monthly Salary, Tips, Additional Income, Daily & Period Total)
              3. Financial Summary (Net Balance = Total Income - Total Expenses, Radial Savings Gauge, Income vs Expense)
          */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* PANEL 1: TOTAL EXPENSES */}
            <div className={`${glassCardClass} p-6 flex flex-col justify-between`}>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    1. Total Expenses
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center">
                    <ArrowDownRight className="w-4 h-4" />
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-[11px] text-zinc-400 font-medium">
                    Selected Period ({activeDateBounds.label})
                  </div>
                  <div className="text-3xl sm:text-4xl font-extrabold font-mono tabular-nums text-rose-400 tracking-tight mt-1">
                    {currency}
                    {expenseMetrics.periodExp.toFixed(2)}
                  </div>
                </div>

                {/* Multi-Horizon Expense Breakdown Grid */}
                <div className="grid grid-cols-2 gap-2.5 mt-5">
                  <div className={`${subtleInnerClass} p-3`}>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                      Today&apos;s Expenses
                    </div>
                    <div className="text-base font-extrabold font-mono tabular-nums text-white mt-1">
                      {currency}
                      {expenseMetrics.todayExp.toFixed(2)}
                    </div>
                  </div>

                  <div className={`${subtleInnerClass} p-3`}>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                      Weekly (7 Days)
                    </div>
                    <div className="text-base font-extrabold font-mono tabular-nums text-white mt-1">
                      {currency}
                      {expenseMetrics.weeklyExp.toFixed(2)}
                    </div>
                  </div>

                  <div className={`${subtleInnerClass} p-3`}>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                      Monthly ({currentMonthStr})
                    </div>
                    <div className="text-base font-extrabold font-mono tabular-nums text-rose-300 mt-1">
                      {currency}
                      {expenseMetrics.monthlyExp.toFixed(2)}
                    </div>
                  </div>

                  <div className={`${subtleInnerClass} p-3`}>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                      Yearly ({currentYearStr})
                    </div>
                    <div className="text-base font-extrabold font-mono tabular-nums text-zinc-200 mt-1">
                      {currency}
                      {expenseMetrics.yearlyExp.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-zinc-400">
                <span>
                  {periodTransactions.filter(t => t.expense > 0).length} expense entries in period
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFlowFilter('expense');
                    setActiveTab('transactions');
                  }}
                  className="text-rose-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <span>Inspect</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* PANEL 2: INCOME OVERVIEW */}
            <div className={`${glassCardClass} p-6 flex flex-col justify-between`}>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    2. Income Overview
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-[11px] text-zinc-400 font-medium">
                    Total Income ({activeDateBounds.label})
                  </div>
                  <div className="text-3xl sm:text-4xl font-extrabold font-mono tabular-nums text-emerald-400 tracking-tight mt-1">
                    {currency}
                    {incomeMetrics.periodTotalIncome.toFixed(2)}
                  </div>
                </div>

                {/* Salary, Tips, Additional, Daily & Monthly Breakdown */}
                <div className="space-y-2 mt-5">
                  <div className={`${subtleInnerClass} px-3.5 py-2.5 flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-xs text-zinc-300 font-medium">Total Salary</span>
                    </div>
                    <span className="text-sm font-bold font-mono tabular-nums text-white">
                      {currency}
                      {incomeMetrics.periodSalary.toFixed(2)}
                    </span>
                  </div>

                  <div className={`${subtleInnerClass} px-3.5 py-2.5 flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-lime-400" />
                      <span className="text-xs text-zinc-300 font-medium">Total Tips Received</span>
                    </div>
                    <span className="text-sm font-bold font-mono tabular-nums text-lime-300">
                      {currency}
                      {incomeMetrics.periodTips.toFixed(2)}
                    </span>
                  </div>

                  <div className={`${subtleInnerClass} px-3.5 py-2.5 flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-400" />
                      <span className="text-xs text-zinc-300 font-medium">Additional Income</span>
                    </div>
                    <span className="text-sm font-bold font-mono tabular-nums text-cyan-300">
                      {currency}
                      {incomeMetrics.periodAdditional.toFixed(2)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className={`${subtleInnerClass} px-3 py-2`}>
                      <div className="text-[10px] uppercase text-zinc-400 font-semibold">
                        Today&apos;s Income
                      </div>
                      <div className="text-xs font-bold font-mono tabular-nums text-emerald-300 mt-0.5">
                        {currency}
                        {incomeMetrics.todayIncome.toFixed(2)}
                      </div>
                    </div>
                    <div className={`${subtleInnerClass} px-3 py-2`}>
                      <div className="text-[10px] uppercase text-zinc-400 font-semibold">
                        This Month Total
                      </div>
                      <div className="text-xs font-bold font-mono tabular-nums text-emerald-300 mt-0.5">
                        {currency}
                        {incomeMetrics.monthlyTotalIncome.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs text-zinc-400">
                <span>
                  {periodTransactions.filter(t => t.income > 0).length} income entries in period
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFlowFilter('income');
                    setActiveTab('transactions');
                  }}
                  className="text-emerald-400 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <span>Inspect</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* PANEL 3: FINANCIAL SUMMARY & RADIAL DIAL */}
            <div className={`${glassCardClass} p-6 flex flex-col justify-between`}>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    3. Financial Summary
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/[0.06] text-zinc-300 border border-white/[0.08]">
                    Net = Income − Expenses
                  </span>
                </div>

                {/* Signature Reference Video Tick-Mark Radial Gauge */}
                <div className="my-2">
                  {renderRadialSavingsDial(
                    summaryMetrics.savingsPercentage,
                    summaryMetrics.netBalance
                  )}
                </div>

                {/* Summary Key-Value Rows */}
                <div className="space-y-2 mt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">Total Income</span>
                    <span className="font-mono tabular-nums font-bold text-emerald-400">
                      +{currency}
                      {summaryMetrics.totalIncome.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400">Total Expenses</span>
                    <span className="font-mono tabular-nums font-bold text-rose-400">
                      −{currency}
                      {summaryMetrics.totalExpenses.toFixed(2)}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-white/[0.07] flex items-center justify-between text-sm">
                    <span className="font-bold text-white">Remaining Balance / Net Savings</span>
                    <span
                      className={`font-mono tabular-nums font-extrabold ${
                        summaryMetrics.netBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {summaryMetrics.netBalance >= 0 ? '+' : ''}
                      {currency}
                      {summaryMetrics.netBalance.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Income vs Expense Comparison Bar */}
              <div className="mt-4 pt-3 border-t border-white/[0.06]">
                <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1.5">
                  <span>Income vs. Expense Ratio</span>
                  <span className="font-mono tabular-nums text-zinc-200">
                    {summaryMetrics.expenseRatio.toFixed(1)}% spent
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-[#14161b] overflow-hidden flex">
                  <div
                    className="h-full bg-gradient-to-r from-rose-500 to-amber-500 transition-all duration-500"
                    style={{ width: `${Math.min(100, summaryMetrics.expenseRatio)}%` }}
                  />
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                    style={{
                      width: `${Math.max(0, 100 - Math.min(100, summaryMetrics.expenseRatio))}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Category Breakdown + Quick Recent Transactions Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Expense Categories Distribution (5 cols) */}
            <div className={`${glassCardClass} lg:col-span-5 p-6`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-emerald-400" />
                    <span>Expense Category Breakdown</span>
                  </h2>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Automatic mapping across 7 core spending categories
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('analytics')}
                  className="text-xs text-emerald-400 hover:underline font-semibold cursor-pointer"
                >
                  Full Charts &rarr;
                </button>
              </div>

              <div className="space-y-3">
                {expenseCategoryBreakdown.map(item => (
                  <div key={item.category} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: item.color.hex }}
                        />
                        <span className="font-semibold text-zinc-200">{item.category}</span>
                        <span className="text-[10px] text-zinc-500 font-mono">({item.count})</span>
                      </div>
                      <div className="font-mono tabular-nums text-xs">
                        <span className="text-white font-bold">
                          {currency}
                          {item.amount.toFixed(2)}
                        </span>
                        <span className="text-zinc-400 ml-1.5">
                          ({item.percentage.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[#14161b] overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${item.color.bar} transition-all duration-500`}
                        style={{ width: `${Math.max(item.amount > 0 ? 2 : 0, item.percentage)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Synchronized Transactions Preview (7 cols) */}
            <div className={`${glassCardClass} lg:col-span-7 p-6 flex flex-col justify-between`}>
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                      <Layers className="w-4 h-4 text-sky-400" />
                      <span>Recent Financial Transactions</span>
                    </h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Showing latest entries for {activeDateBounds.label}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('transactions')}
                    className="text-xs text-sky-400 hover:underline font-semibold cursor-pointer"
                  >
                    View All ({periodTransactions.length}) &rarr;
                  </button>
                </div>

                {periodTransactions.length === 0 ? (
                  <div className={`${subtleInnerClass} p-8 text-center`}>
                    <Wallet className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
                    <div className="text-xs font-bold text-zinc-300">
                      No transactions recorded for {activeDateBounds.label}
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1 max-w-sm mx-auto">
                      {sheetConfig
                        ? 'Try selecting "All Time" or "Previous Month" in the date filter bar above, or add a new row to your Google Sheet.'
                        : 'Connect your existing Google Sheet or log an entry to populate your live dashboard.'}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/[0.07] text-[10px] uppercase tracking-wider text-zinc-400">
                          <th className="pb-2.5">Date</th>
                          <th className="pb-2.5">Description</th>
                          <th className="pb-2.5">Category</th>
                          <th className="pb-2.5 text-right">Income</th>
                          <th className="pb-2.5 text-right">Expense</th>
                          <th className="pb-2.5 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.05]">
                        {periodTransactions.slice(0, 7).map(tx => {
                          const catStyle =
                            CATEGORY_COLORS[tx.category] || CATEGORY_COLORS['Other Expenses'];
                          return (
                            <tr
                              key={tx.id}
                              onClick={() => setInspectedTransaction(tx)}
                              className="hover:bg-white/[0.04] transition cursor-pointer"
                            >
                              <td className="py-2.5 font-mono tabular-nums text-zinc-300 whitespace-nowrap">
                                {tx.date}
                              </td>
                              <td className="py-2.5 font-semibold text-white max-w-[180px] truncate pr-2">
                                {tx.description}
                              </td>
                              <td className="py-2.5">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${catStyle.badge}`}
                                >
                                  {tx.category}
                                </span>
                              </td>
                              <td className="py-2.5 text-right font-mono tabular-nums font-bold text-emerald-400">
                                {tx.income > 0 ? `+${currency}${tx.income.toFixed(2)}` : '—'}
                              </td>
                              <td className="py-2.5 text-right font-mono tabular-nums font-bold text-rose-400">
                                {tx.expense > 0 ? `−${currency}${tx.expense.toFixed(2)}` : '—'}
                              </td>
                              <td className="py-2.5 text-right font-mono tabular-nums text-zinc-300">
                                {currency}
                                {tx.computedBalance.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: INTERACTIVE ANALYTICS & 6 CHARTS
          ===================================================================== */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* CHART 1: DAILY EXPENSE CHART */}
            <div className={`${glassCardClass} p-6`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white">1. Daily Expense Chart</h3>
                  <p className="text-[11px] text-zinc-400">
                    Day-by-day spending intensity ({activeDateBounds.label})
                  </p>
                </div>
                <span className="text-xs font-mono tabular-nums font-bold text-rose-400">
                  Total: {currency}
                  {expenseMetrics.periodExp.toFixed(2)}
                </span>
              </div>

              {dailyExpenseSeries.length === 0 ? (
                <div className={`${subtleInnerClass} h-52 flex items-center justify-center text-xs text-zinc-500`}>
                  No daily expense data in the selected date range.
                </div>
              ) : (
                <div className="h-56 flex items-end gap-2 pt-6 pb-2 px-2 border-b border-white/[0.07]">
                  {(() => {
                    const maxExp = Math.max(...dailyExpenseSeries.map(d => d.expense), 1);
                    return dailyExpenseSeries.map(d => {
                      const heightPct = Math.max(6, (d.expense / maxExp) * 100);
                      return (
                        <div
                          key={d.date}
                          className="flex-1 flex flex-col items-center gap-1.5 group relative h-full justify-end"
                        >
                          {/* Tooltip */}
                          <div className="opacity-0 group-hover:opacity-100 transition pointer-events-none absolute -top-7 px-2 py-1 rounded-lg bg-black/90 border border-white/15 text-[10px] font-mono text-white whitespace-nowrap z-10">
                            {d.date}: {currency}
                            {d.expense.toFixed(2)}
                          </div>
                          <div
                            className="w-full max-w-[28px] rounded-t-lg bg-gradient-to-t from-rose-500/70 to-amber-400/90 group-hover:from-rose-400 group-hover:to-amber-300 transition-all"
                            style={{ height: `${heightPct}%` }}
                          />
                          <span className="text-[9px] font-mono text-zinc-400 rotate-0 truncate max-w-full">
                            {d.date.slice(5)}
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>

            {/* CHART 2: MONTHLY EXPENSE TREND */}
            <div className={`${glassCardClass} p-6`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white">2. Monthly Expense Trend</h3>
                  <p className="text-[11px] text-zinc-400">
                    Multi-month spending trajectory across synchronized history
                  </p>
                </div>
                <span className="text-xs font-mono tabular-nums text-zinc-400">
                  {monthlyAnalyticsSeries.length} month(s)
                </span>
              </div>

              {monthlyAnalyticsSeries.length === 0 ? (
                <div className={`${subtleInnerClass} h-52 flex items-center justify-center text-xs text-zinc-500`}>
                  No monthly trend records available yet.
                </div>
              ) : (
                <div className="h-56 flex items-end gap-3 pt-6 pb-2 px-2 border-b border-white/[0.07]">
                  {(() => {
                    const maxVal = Math.max(...monthlyAnalyticsSeries.map(m => m.expense), 1);
                    return monthlyAnalyticsSeries.map(m => {
                      const heightPct = Math.max(6, (m.expense / maxVal) * 100);
                      return (
                        <div
                          key={m.month}
                          className="flex-1 flex flex-col items-center gap-1.5 group relative h-full justify-end"
                        >
                          <div className="opacity-0 group-hover:opacity-100 transition pointer-events-none absolute -top-7 px-2 py-1 rounded-lg bg-black/90 border border-white/15 text-[10px] font-mono text-white whitespace-nowrap z-10">
                            {m.month}: {currency}
                            {m.expense.toFixed(2)}
                          </div>
                          <div
                            className="w-full max-w-[36px] rounded-t-xl bg-gradient-to-t from-violet-600/80 to-rose-400/90 transition-all"
                            style={{ height: `${heightPct}%` }}
                          />
                          <span className="text-[10px] font-mono text-zinc-400">{m.month}</span>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>

            {/* CHART 3: SALARY & TIPS COMPARISON */}
            <div className={`${glassCardClass} p-6`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white">3. Salary &amp; Tips Comparison</h3>
                  <p className="text-[11px] text-zinc-400">
                    Monthly Salary vs. Tips vs. Additional Income breakdown
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" /> Salary
                  </span>
                  <span className="flex items-center gap-1 text-lime-300">
                    <span className="w-2 h-2 rounded-full bg-lime-400" /> Tips
                  </span>
                  <span className="flex items-center gap-1 text-cyan-300">
                    <span className="w-2 h-2 rounded-full bg-cyan-400" /> Extra
                  </span>
                </div>
              </div>

              {monthlyAnalyticsSeries.length === 0 ? (
                <div className={`${subtleInnerClass} h-52 flex items-center justify-center text-xs text-zinc-500`}>
                  No income comparison data available yet.
                </div>
              ) : (
                <div className="h-56 flex items-end gap-4 pt-6 pb-2 px-2 border-b border-white/[0.07]">
                  {(() => {
                    const maxInc = Math.max(
                      ...monthlyAnalyticsSeries.map(
                        m => Math.max(m.salary, m.tips, m.additionalIncome)
                      ),
                      1
                    );
                    return monthlyAnalyticsSeries.map(m => (
                      <div
                        key={m.month}
                        className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group relative"
                      >
                        <div className="opacity-0 group-hover:opacity-100 transition pointer-events-none absolute -top-7 px-2 py-1 rounded-lg bg-black/90 border border-white/15 text-[10px] font-mono text-white whitespace-nowrap z-10">
                          Sal: {currency}
                          {m.salary.toFixed(0)} | Tips: {currency}
                          {m.tips.toFixed(0)}
                        </div>
                        <div className="w-full flex items-end justify-center gap-1 h-full">
                          <div
                            className="w-2.5 sm:w-3 rounded-t-md bg-emerald-400"
                            style={{ height: `${Math.max(4, (m.salary / maxInc) * 100)}%` }}
                          />
                          <div
                            className="w-2.5 sm:w-3 rounded-t-md bg-lime-400"
                            style={{ height: `${Math.max(4, (m.tips / maxInc) * 100)}%` }}
                          />
                          {m.additionalIncome > 0 && (
                            <div
                              className="w-2.5 sm:w-3 rounded-t-md bg-cyan-400"
                              style={{
                                height: `${Math.max(4, (m.additionalIncome / maxInc) * 100)}%`,
                              }}
                            />
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-zinc-400">{m.month}</span>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>

            {/* CHART 4: INCOME VS. EXPENSES */}
            <div className={`${glassCardClass} p-6`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white">4. Income vs. Expenses</h3>
                  <p className="text-[11px] text-zinc-400">
                    Side-by-side cashflow comparison per month
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" /> Income
                  </span>
                  <span className="flex items-center gap-1 text-rose-400">
                    <span className="w-2 h-2 rounded-full bg-rose-400" /> Expenses
                  </span>
                </div>
              </div>

              {monthlyAnalyticsSeries.length === 0 ? (
                <div className={`${subtleInnerClass} h-52 flex items-center justify-center text-xs text-zinc-500`}>
                  No monthly cashflow records available yet.
                </div>
              ) : (
                <div className="h-56 flex items-end gap-4 pt-6 pb-2 px-2 border-b border-white/[0.07]">
                  {(() => {
                    const maxFlow = Math.max(
                      ...monthlyAnalyticsSeries.map(m => Math.max(m.income, m.expense)),
                      1
                    );
                    return monthlyAnalyticsSeries.map(m => (
                      <div
                        key={m.month}
                        className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group relative"
                      >
                        <div className="opacity-0 group-hover:opacity-100 transition pointer-events-none absolute -top-7 px-2 py-1 rounded-lg bg-black/90 border border-white/15 text-[10px] font-mono text-white whitespace-nowrap z-10">
                          +{currency}
                          {m.income.toFixed(0)} / −{currency}
                          {m.expense.toFixed(0)}
                        </div>
                        <div className="w-full flex items-end justify-center gap-1.5 h-full">
                          <div
                            className="w-3 sm:w-4 rounded-t-md bg-emerald-400/90"
                            style={{ height: `${Math.max(4, (m.income / maxFlow) * 100)}%` }}
                          />
                          <div
                            className="w-3 sm:w-4 rounded-t-md bg-rose-400/90"
                            style={{ height: `${Math.max(4, (m.expense / maxFlow) * 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-zinc-400">{m.month}</span>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>

            {/* CHART 5: EXPENSE CATEGORY BREAKDOWN (DONUT + LEGEND) */}
            <div className={`${glassCardClass} p-6`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white">5. Expense Category Breakdown</h3>
                  <p className="text-[11px] text-zinc-400">
                    Proportional share across standard spending categories
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                {/* SVG Ring Chart */}
                <div className="relative w-44 h-44 mx-auto">
                  <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                    <circle
                      cx="60"
                      cy="60"
                      r="46"
                      fill="none"
                      stroke="rgba(255,255,255,0.06)"
                      strokeWidth="14"
                    />
                    {(() => {
                      const circumference = 2 * Math.PI * 46;
                      let accumulatedPct = 0;
                      return expenseCategoryBreakdown
                        .filter(c => c.percentage > 0)
                        .map(c => {
                          const strokeDasharray = `${
                            (c.percentage / 100) * circumference
                          } ${circumference}`;
                          const strokeDashoffset = -((accumulatedPct / 100) * circumference);
                          accumulatedPct += c.percentage;
                          return (
                            <circle
                              key={c.category}
                              cx="60"
                              cy="60"
                              r="46"
                              fill="none"
                              stroke={c.color.hex}
                              strokeWidth="14"
                              strokeDasharray={strokeDasharray}
                              strokeDashoffset={strokeDashoffset}
                            />
                          );
                        });
                    })()}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] uppercase text-zinc-400 font-semibold">
                      Spent
                    </span>
                    <span className="text-sm font-extrabold font-mono text-white">
                      {currency}
                      {expenseMetrics.periodExp.toFixed(0)}
                    </span>
                  </div>
                </div>

                {/* Category Legend */}
                <div className="space-y-2">
                  {expenseCategoryBreakdown.map(item => (
                    <div
                      key={item.category}
                      className="flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: item.color.hex }}
                        />
                        <span className="text-zinc-300 truncate">{item.category}</span>
                      </div>
                      <span className="font-mono tabular-nums text-white font-semibold">
                        {item.percentage.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* CHART 6: MONTHLY SAVINGS TREND */}
            <div className={`${glassCardClass} p-6`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white">6. Monthly Savings Trend</h3>
                  <p className="text-[11px] text-zinc-400">
                    Net monthly savings (Income − Expenses) &amp; retention rate
                  </p>
                </div>
              </div>

              {monthlyAnalyticsSeries.length === 0 ? (
                <div className={`${subtleInnerClass} h-52 flex items-center justify-center text-xs text-zinc-500`}>
                  No monthly savings trend data available yet.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {monthlyAnalyticsSeries.map(m => {
                    const maxAbs = Math.max(
                      ...monthlyAnalyticsSeries.map(x => Math.abs(x.savings)),
                      1
                    );
                    const widthPct = Math.min(100, Math.max(6, (Math.abs(m.savings) / maxAbs) * 100));
                    const isPositive = m.savings >= 0;
                    return (
                      <div key={m.month} className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                          <span className="text-zinc-300 font-semibold">{m.month}</span>
                          <span className={isPositive ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                            {isPositive ? '+' : ''}
                            {currency}
                            {m.savings.toFixed(2)} ({m.savingsRate.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="w-full h-2.5 rounded-full bg-[#14161b] overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              isPositive
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                : 'bg-gradient-to-r from-rose-600 to-rose-400'
                            }`}
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: FINANCIAL TRANSACTION HISTORY
          ===================================================================== */}
      {activeTab === 'transactions' && (
        <div className={`${glassCardClass} p-6 space-y-5`}>
          {/* Search, Category, Flow Type, and Source Filters */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-white/[0.07]">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-zinc-400" />
              <input
                type="text"
                placeholder="Search by description, category, date, or spreadsheet value..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-2xl bg-[#14161b] border border-white/[0.08] text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-white/30"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Category Selector */}
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="px-3 py-2 rounded-2xl bg-[#14161b] border border-white/[0.08] text-xs font-semibold text-zinc-200 focus:outline-none"
              >
                <option value="all">All Categories</option>
                <optgroup label="Expense Categories">
                  {EXPENSE_CATEGORIES.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Income Categories">
                  {INCOME_CATEGORIES.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </optgroup>
              </select>

              {/* Flow Filter */}
              <div className="flex items-center p-1 rounded-2xl bg-[#14161b] border border-white/[0.08] text-xs">
                {(['all', 'income', 'expense'] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFlowFilter(f)}
                    className={`px-3 py-1 rounded-xl font-semibold capitalize transition cursor-pointer ${
                      flowFilter === f
                        ? 'bg-white text-[#141517] font-bold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              {/* Source Filter */}
              <select
                value={dataSourceFilter}
                onChange={e => setDataSourceFilter(e.target.value as any)}
                className="px-3 py-2 rounded-2xl bg-[#14161b] border border-white/[0.08] text-xs font-semibold text-zinc-200 focus:outline-none"
              >
                <option value="all">All Sources (Sheets + App)</option>
                <option value="sheets">Google Sheets Only</option>
                <option value="local">App Manual Entries Only</option>
              </select>
            </div>
          </div>

          {/* High-Density Sortable Transaction Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-[10px] uppercase tracking-wider text-zinc-400">
                  <th
                    onClick={() => toggleSort('date')}
                    className="py-3 pl-2 cursor-pointer hover:text-white select-none"
                  >
                    <span className="inline-flex items-center gap-1">
                      Date <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    onClick={() => toggleSort('description')}
                    className="py-3 cursor-pointer hover:text-white select-none"
                  >
                    <span className="inline-flex items-center gap-1">
                      Description <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    onClick={() => toggleSort('category')}
                    className="py-3 cursor-pointer hover:text-white select-none"
                  >
                    <span className="inline-flex items-center gap-1">
                      Category <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    onClick={() => toggleSort('income')}
                    className="py-3 text-right cursor-pointer hover:text-white select-none"
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      Income <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    onClick={() => toggleSort('expense')}
                    className="py-3 text-right cursor-pointer hover:text-white select-none"
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      Expense <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th
                    onClick={() => toggleSort('balance')}
                    className="py-3 text-right cursor-pointer hover:text-white select-none"
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      Balance <ArrowUpDown className="w-3 h-3" />
                    </span>
                  </th>
                  <th className="py-3 text-right pr-2">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filteredSortedTransactions.map(tx => {
                  const catStyle =
                    CATEGORY_COLORS[tx.category] || CATEGORY_COLORS['Other Expenses'];
                  const matchingLocal =
                    tx.source === 'local' ? finances.find(f => f.id === tx.id) : null;

                  return (
                    <tr
                      key={tx.id}
                      className="hover:bg-white/[0.04] transition group"
                    >
                      <td className="py-3 pl-2 font-mono tabular-nums text-xs text-zinc-200 whitespace-nowrap">
                        {tx.date}
                      </td>
                      <td className="py-3 font-semibold text-white max-w-xs truncate pr-3">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{tx.description}</span>
                          {tx.source === 'google-sheets' && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                              Row #{tx.rowIndex}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${catStyle.badge}`}
                        >
                          {tx.category}
                        </span>
                      </td>
                      <td className="py-3 text-right font-mono tabular-nums font-bold text-emerald-400">
                        {tx.income > 0 ? `+${currency}${tx.income.toFixed(2)}` : '—'}
                      </td>
                      <td className="py-3 text-right font-mono tabular-nums font-bold text-rose-400">
                        {tx.expense > 0 ? `−${currency}${tx.expense.toFixed(2)}` : '—'}
                      </td>
                      <td className="py-3 text-right font-mono tabular-nums text-zinc-300">
                        {currency}
                        {tx.computedBalance.toFixed(2)}
                      </td>
                      <td className="py-3 text-right pr-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setInspectedTransaction(tx)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                            title="Inspect Transaction Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {matchingLocal && (
                            <>
                              <button
                                type="button"
                                onClick={() => onEditRecord(matchingLocal)}
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-300 hover:bg-white/10 transition cursor-pointer"
                                title="Edit Local Entry"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteRecord(matchingLocal.id)}
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-white/10 transition cursor-pointer"
                                title="Delete Local Entry"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredSortedTransactions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-xs text-zinc-500">
                      No transactions match your current filter and search criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 4: AUTOMATED MONTHLY FINANCIAL REPORT
          ===================================================================== */}
      {activeTab === 'monthly-report' && (
        <div className="space-y-6">
          <div className={`${glassCardClass} p-6`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/[0.07]">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                  Automated Statement • Real Synchronized Records
                </span>
                <h2 className="text-xl sm:text-2xl font-extrabold text-white mt-0.5">
                  Monthly Financial Report — {monthlyFinancialReport.current.month}
                </h2>
              </div>

              <div className="flex items-center gap-2.5">
                <label className="text-xs text-zinc-400 font-semibold">Select Month:</label>
                <select
                  value={reportMonth}
                  onChange={e => setReportMonth(e.target.value)}
                  className="px-3.5 py-2 rounded-2xl bg-[#14161b] border border-white/[0.1] text-xs font-mono font-bold text-white"
                >
                  {availableReportMonths.map(m => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 8 Required Monthly Report KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
              <div className={`${subtleInnerClass} p-4`}>
                <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                  1. Total Salary Received
                </div>
                <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-emerald-400 mt-1">
                  {currency}
                  {monthlyFinancialReport.current.salary.toFixed(2)}
                </div>
                <div className="text-[11px] font-mono text-zinc-500 mt-1">
                  vs {monthlyFinancialReport.previous.month}:{' '}
                  {monthlyFinancialReport.deltas.salaryDiff >= 0 ? '+' : ''}
                  {currency}
                  {monthlyFinancialReport.deltas.salaryDiff.toFixed(0)}
                </div>
              </div>

              <div className={`${subtleInnerClass} p-4`}>
                <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                  2. Total Tips Received
                </div>
                <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-lime-300 mt-1">
                  {currency}
                  {monthlyFinancialReport.current.tips.toFixed(2)}
                </div>
                <div className="text-[11px] font-mono text-zinc-500 mt-1">
                  vs {monthlyFinancialReport.previous.month}:{' '}
                  {monthlyFinancialReport.deltas.tipsDiff >= 0 ? '+' : ''}
                  {currency}
                  {monthlyFinancialReport.deltas.tipsDiff.toFixed(0)}
                </div>
              </div>

              <div className={`${subtleInnerClass} p-4`}>
                <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                  3. Additional Income
                </div>
                <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-cyan-300 mt-1">
                  {currency}
                  {monthlyFinancialReport.current.additionalIncome.toFixed(2)}
                </div>
                <div className="text-[11px] font-mono text-zinc-500 mt-1">
                  Total Inc: {currency}
                  {monthlyFinancialReport.current.totalIncome.toFixed(2)}
                </div>
              </div>

              <div className={`${subtleInnerClass} p-4`}>
                <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                  4. Total Money Spent
                </div>
                <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-rose-400 mt-1">
                  {currency}
                  {monthlyFinancialReport.current.totalSpent.toFixed(2)}
                </div>
                <div className="text-[11px] font-mono text-zinc-500 mt-1">
                  {monthlyFinancialReport.deltas.spentDiff <= 0 ? 'Saved ' : '+'}
                  {currency}
                  {Math.abs(monthlyFinancialReport.deltas.spentDiff).toFixed(0)} vs prev month
                </div>
              </div>

              <div className={`${subtleInnerClass} p-4`}>
                <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                  5. Remaining Balance
                </div>
                <div
                  className={`text-xl sm:text-2xl font-extrabold font-mono tabular-nums mt-1 ${
                    monthlyFinancialReport.current.remainingBalance >= 0
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }`}
                >
                  {currency}
                  {monthlyFinancialReport.current.remainingBalance.toFixed(2)}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">
                  Net Income − Total Spent
                </div>
              </div>

              <div className={`${subtleInnerClass} p-4`}>
                <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                  6. Highest Spending Category
                </div>
                <div className="text-base sm:text-lg font-extrabold text-amber-300 mt-1 truncate">
                  {monthlyFinancialReport.current.highestCategory}
                </div>
                <div className="text-[11px] font-mono text-zinc-400 mt-1">
                  {currency}
                  {monthlyFinancialReport.current.highestCategoryAmount.toFixed(2)}
                </div>
              </div>

              <div className={`${subtleInnerClass} p-4`}>
                <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                  7. Average Daily Expenses
                </div>
                <div className="text-xl sm:text-2xl font-extrabold font-mono tabular-nums text-white mt-1">
                  {currency}
                  {monthlyFinancialReport.current.avgDailyExpense.toFixed(2)}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">
                  Across {monthlyFinancialReport.current.elapsedDays} calendar days
                </div>
              </div>

              <div className={`${subtleInnerClass} p-4`}>
                <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">
                  8. Total Savings &amp; Rate
                </div>
                <div
                  className={`text-xl sm:text-2xl font-extrabold font-mono tabular-nums mt-1 ${
                    monthlyFinancialReport.current.totalSavings >= 0
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }`}
                >
                  {monthlyFinancialReport.current.savingsRate.toFixed(1)}%
                </div>
                <div className="text-[11px] font-mono text-zinc-400 mt-1">
                  {currency}
                  {monthlyFinancialReport.current.totalSavings.toFixed(2)} saved
                </div>
              </div>
            </div>

            {/* Month-over-Month Comparison Table */}
            <div className="mt-6 pt-5 border-t border-white/[0.07]">
              <h3 className="text-sm font-bold text-white mb-3">
                9. Comparison with Previous Month ({monthlyFinancialReport.current.month} vs.{' '}
                {monthlyFinancialReport.previous.month})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-[10px] uppercase tracking-wider text-zinc-400">
                      <th className="py-2.5">Metric / Category</th>
                      <th className="py-2.5 text-right">
                        Previous ({monthlyFinancialReport.previous.month})
                      </th>
                      <th className="py-2.5 text-right">
                        Selected ({monthlyFinancialReport.current.month})
                      </th>
                      <th className="py-2.5 text-right">Variance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05] font-mono tabular-nums">
                    <tr>
                      <td className="py-2.5 font-sans font-semibold text-white">Total Income</td>
                      <td className="py-2.5 text-right text-zinc-400">
                        {currency}
                        {monthlyFinancialReport.previous.totalIncome.toFixed(2)}
                      </td>
                      <td className="py-2.5 text-right text-emerald-400 font-bold">
                        {currency}
                        {monthlyFinancialReport.current.totalIncome.toFixed(2)}
                      </td>
                      <td
                        className={`py-2.5 text-right font-bold ${
                          monthlyFinancialReport.deltas.incomeDiff >= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {monthlyFinancialReport.deltas.incomeDiff >= 0 ? '+' : ''}
                        {currency}
                        {monthlyFinancialReport.deltas.incomeDiff.toFixed(2)} (
                        {monthlyFinancialReport.deltas.incomePct.toFixed(1)}%)
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-sans font-semibold text-white">
                        Total Money Spent
                      </td>
                      <td className="py-2.5 text-right text-zinc-400">
                        {currency}
                        {monthlyFinancialReport.previous.totalSpent.toFixed(2)}
                      </td>
                      <td className="py-2.5 text-right text-rose-400 font-bold">
                        {currency}
                        {monthlyFinancialReport.current.totalSpent.toFixed(2)}
                      </td>
                      <td
                        className={`py-2.5 text-right font-bold ${
                          monthlyFinancialReport.deltas.spentDiff <= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {monthlyFinancialReport.deltas.spentDiff >= 0 ? '+' : ''}
                        {currency}
                        {monthlyFinancialReport.deltas.spentDiff.toFixed(2)} (
                        {monthlyFinancialReport.deltas.spentPct.toFixed(1)}%)
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-sans font-semibold text-white">Net Savings</td>
                      <td className="py-2.5 text-right text-zinc-400">
                        {currency}
                        {monthlyFinancialReport.previous.totalSavings.toFixed(2)}
                      </td>
                      <td className="py-2.5 text-right text-white font-bold">
                        {currency}
                        {monthlyFinancialReport.current.totalSavings.toFixed(2)}
                      </td>
                      <td
                        className={`py-2.5 text-right font-bold ${
                          monthlyFinancialReport.deltas.savingsDiff >= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {monthlyFinancialReport.deltas.savingsDiff >= 0 ? '+' : ''}
                        {currency}
                        {monthlyFinancialReport.deltas.savingsDiff.toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 5: GOOGLE SHEETS INTEGRATION, WORKSHEET & COLUMN MAPPING
          ===================================================================== */}
      {activeTab === 'sheet-sync' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 7 Cols: Connect Existing Spreadsheet & Select Worksheet */}
            <div className={`${glassCardClass} lg:col-span-7 p-6 space-y-5`}>
              <div className="flex items-center justify-between border-b border-white/[0.07] pb-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                    <span>Google Sheets Connection &amp; Worksheet Selection</span>
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Strictly read-only synchronization — your original spreadsheet is never overwritten or restructured
                  </p>
                </div>

                {!isGoogleConnected ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await signInWithGoogle();
                      if (spreadsheetInputUrl) {
                        performSheetSync({ interactiveAuth: false });
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl bg-white text-[#141517] text-xs font-bold cursor-pointer"
                  >
                    Authorize Google Account
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{userEmail}</span>
                  </span>
                )}
              </div>

              {/* Option 1: Pick from Google Drive OR Paste Spreadsheet URL / ID */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-zinc-300 block">
                  Connect Existing Google Spreadsheet (Paste URL / ID or Pick from Drive)
                </label>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    value={spreadsheetInputUrl}
                    onChange={e => setSpreadsheetInputUrl(e.target.value)}
                    placeholder="Paste Google Sheets URL (https://docs.google.com/spreadsheets/d/...) or ID"
                    className="flex-1 px-3.5 py-2.5 rounded-2xl bg-[#14161b] border border-white/[0.1] text-xs text-white font-mono focus:outline-none focus:border-emerald-400"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      performSheetSync({
                        targetIdOrUrl: spreadsheetInputUrl,
                        interactiveAuth: true,
                      })
                    }
                    disabled={isSyncing}
                    className="px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-[#111317] text-xs font-extrabold transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Link2 className="w-4 h-4" />
                    <span>{isSyncing ? 'Connecting...' : 'Connect & Read Sheet'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenDriveSheetPicker}
                    className="px-4 py-2.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <FolderOpen className="w-4 h-4 text-emerald-400" />
                    <span>Browse Drive</span>
                  </button>
                </div>
              </div>

              {/* Active Connected Spreadsheet Details & Worksheet Selector */}
              {sheetConfig && (
                <div className={`${subtleInnerClass} p-4 space-y-4`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/[0.06]">
                    <div>
                      <div className="text-[11px] text-zinc-400">Connected Spreadsheet</div>
                      <div className="text-sm font-bold text-white mt-0.5">
                        {sheetConfig.spreadsheetTitle}
                      </div>
                      <div className="text-[11px] font-mono text-zinc-500 mt-0.5">
                        Last synced:{' '}
                        {sheetConfig.lastSyncedAt
                          ? new Date(sheetConfig.lastSyncedAt).toLocaleTimeString()
                          : 'Just now'}{' '}
                        • {sheetTransactions.length} verified records
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={sheetConfig.spreadsheetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-emerald-300 flex items-center gap-1.5"
                      >
                        <span>Open Sheet</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          disconnectFinanceSheet();
                          setSheetConfig(null);
                          setSheetTransactions([]);
                          setSpreadsheetInputUrl('');
                        }}
                        className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 cursor-pointer"
                        title="Disconnect Spreadsheet"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Worksheet / Tab Selector */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                    <div>
                      <label className="text-xs font-bold text-zinc-300 block mb-1">
                        Active Worksheet / Tab
                      </label>
                      <select
                        value={sheetConfig.selectedWorksheet}
                        onChange={e => handleChangeWorksheet(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-[#1d1f26] border border-white/[0.1] text-xs font-bold text-white"
                      >
                        {sheetConfig.availableWorksheets.map(ws => (
                          <option key={ws} value={ws}>
                            {ws}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Auto-Sync Polling Toggle */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-[#1d1f26] border border-white/[0.06]">
                      <div>
                        <div className="text-xs font-bold text-white">Auto-Sync Changes</div>
                        <div className="text-[10px] text-zinc-400">
                          Polls every {sheetConfig.pollIntervalSeconds}s &amp; on tab focus
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={sheetConfig.autoSyncEnabled}
                        onChange={e => {
                          const updated = {
                            ...sheetConfig,
                            autoSyncEnabled: e.target.checked,
                          };
                          setSheetConfig(updated);
                          saveFinanceSheetConfig(updated);
                        }}
                        className="w-4 h-4 accent-emerald-500 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Optional Real-Time Google Apps Script onEdit Trigger Snippet */}
              {sheetConfig && (
                <div className={`${subtleInnerClass} p-4 space-y-2.5`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Code2 className="w-4 h-4 text-sky-400" />
                      <span className="text-xs font-bold text-white">
                        Instant Real-Time Google Apps Script onEdit Trigger (Optional)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const snippet = generateAppsScriptOnEditSnippet(
                          `${window.location.origin}/api/finance/sheets-webhook`,
                          sheetConfig.spreadsheetId
                        );
                        navigator.clipboard.writeText(snippet);
                        setCopiedWebhookScript(true);
                        setTimeout(() => setCopiedWebhookScript(false), 3000);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-[11px] font-semibold text-white flex items-center gap-1 cursor-pointer"
                    >
                      {copiedWebhookScript ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Apps Script</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Background auto-sync is already active. If you also want sub-second push updates the moment you press Enter in a Google Sheets cell, paste this read-safe <code className="text-emerald-300">onEdit(e)</code> trigger into <strong>Extensions &rarr; Apps Script</strong> in your sheet.
                  </p>
                </div>
              )}
            </div>

            {/* Right 5 Cols: Automatic Column Mapping Inspector */}
            <div className={`${glassCardClass} lg:col-span-5 p-6 space-y-4`}>
              <div className="border-b border-white/[0.07] pb-4">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  <span>Column Header Mapping</span>
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Automatically mapped from your spreadsheet headers. Customize any column below if needed.
                </p>
              </div>

              {!sheetConfig ? (
                <div className={`${subtleInnerClass} p-8 text-center text-xs text-zinc-500`}>
                  Connect a Google Spreadsheet on the left to inspect and customize its column headers.
                </div>
              ) : (
                <div className="space-y-3">
                  {(
                    [
                      { key: 'dateCol', label: 'Date Column' },
                      { key: 'descriptionCol', label: 'Description / Notes Column' },
                      { key: 'categoryCol', label: 'Category Column' },
                      { key: 'expenseCol', label: 'Expense / Spent Column' },
                      { key: 'incomeCol', label: 'Total Income Column' },
                      { key: 'salaryCol', label: 'Salary Column (Optional)' },
                      { key: 'tipsCol', label: 'Tips Column (Optional)' },
                      {
                        key: 'additionalIncomeCol',
                        label: 'Additional Income Column (Optional)',
                      },
                      { key: 'balanceCol', label: 'Running Balance Column (Optional)' },
                    ] as { key: keyof SheetColumnMapping; label: string }[]
                  ).map(field => {
                    const currentVal = Number(sheetConfig.columnMapping[field.key] ?? -1);
                    return (
                      <div
                        key={field.key}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="text-zinc-300 font-medium">{field.label}</span>
                        <select
                          value={currentVal}
                          onChange={e =>
                            handleUpdateColumnMappingField(
                              field.key,
                              parseInt(e.target.value, 10)
                            )
                          }
                          className="px-3 py-1.5 rounded-xl bg-[#14161b] border border-white/[0.1] text-xs font-mono text-white max-w-[200px]"
                        >
                          <option value={-1}>— Not Mapped / Auto —</option>
                          {sheetConfig.headers.map((h, i) => (
                            <option key={i} value={i}>
                              Col {String.fromCharCode(65 + i)}: {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}

                  {sheetConfig.columnMapping.categoryColumns.length > 0 && (
                    <div className="pt-3 border-t border-white/[0.07]">
                      <div className="text-[11px] font-bold text-emerald-400 mb-1.5">
                        Multi-Column Category Headers Detected:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {sheetConfig.columnMapping.categoryColumns.map(cc => (
                          <span
                            key={cc.colIndex}
                            className="px-2 py-0.5 rounded-lg bg-white/[0.06] text-[10px] font-mono text-zinc-300"
                          >
                            {cc.headerName} &rarr; {cc.mappedCategory}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 1: GOOGLE DRIVE SPREADSHEET PICKER
          ===================================================================== */}
      {showDrivePickerModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${glassCardClass} w-full max-w-lg p-6`}>
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">
                  Select Existing Google Sheet from Drive
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDrivePickerModal(false)}
                className="p-1 text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 max-h-80 overflow-y-auto space-y-2">
              {isLoadingDriveList ? (
                <div className="py-10 text-center text-xs text-zinc-400">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-400" />
                  Loading your Google Spreadsheets...
                </div>
              ) : driveSheets.length === 0 ? (
                <div className="py-10 text-center text-xs text-zinc-400">
                  No spreadsheets found or Google account not yet authorized.
                </div>
              ) : (
                driveSheets.map(item => (
                  <div
                    key={item.id}
                    onClick={() => handleSelectDriveSpreadsheet(item)}
                    className={`${subtleInnerClass} p-3.5 hover:border-emerald-500/40 cursor-pointer transition flex items-center justify-between`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileSpreadsheet className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">{item.name}</div>
                        <div className="text-[10px] text-zinc-400 font-mono">
                          Modified:{' '}
                          {item.modifiedTime
                            ? new Date(item.modifiedTime).toLocaleDateString()
                            : 'N/A'}
                        </div>
                      </div>
                    </div>
                    <span className="px-3 py-1 rounded-xl bg-white text-[#141517] text-xs font-bold shrink-0">
                      Connect
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: TRANSACTION DETAILS INSPECTOR
          ===================================================================== */}
      {inspectedTransaction && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${glassCardClass} w-full max-w-md p-6 space-y-4`}>
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400">
                  {inspectedTransaction.source === 'google-sheets'
                    ? `Google Sheets • ${inspectedTransaction.worksheetName} (Row #${inspectedTransaction.rowIndex})`
                    : 'Local App Ledger Entry'}
                </span>
                <h3 className="text-base font-bold text-white mt-0.5">
                  {inspectedTransaction.description}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectedTransaction(null)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className={`${subtleInnerClass} p-3`}>
                <div className="text-[10px] text-zinc-400 uppercase">Date</div>
                <div className="font-mono font-bold text-white mt-0.5">
                  {inspectedTransaction.date}
                </div>
              </div>
              <div className={`${subtleInnerClass} p-3`}>
                <div className="text-[10px] text-zinc-400 uppercase">Category</div>
                <div className="font-bold text-emerald-300 mt-0.5">
                  {inspectedTransaction.category}
                </div>
              </div>
              <div className={`${subtleInnerClass} p-3`}>
                <div className="text-[10px] text-zinc-400 uppercase">Income</div>
                <div className="font-mono font-bold text-emerald-400 mt-0.5">
                  +{currency}
                  {inspectedTransaction.income.toFixed(2)}
                </div>
              </div>
              <div className={`${subtleInnerClass} p-3`}>
                <div className="text-[10px] text-zinc-400 uppercase">Expense</div>
                <div className="font-mono font-bold text-rose-400 mt-0.5">
                  −{currency}
                  {inspectedTransaction.expense.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Raw Row Cells from Google Sheets */}
            <div className={`${subtleInnerClass} p-3.5 space-y-2`}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Original Spreadsheet Row Values
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto text-xs">
                {Object.entries(inspectedTransaction.rawRow).map(([colName, val]) => (
                  <div
                    key={colName}
                    className="flex items-center justify-between gap-2 border-b border-white/[0.04] pb-1"
                  >
                    <span className="text-zinc-400">{colName}</span>
                    <span className="font-mono text-white text-right">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
