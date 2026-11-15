import { getCachedGoogleToken, isGoogleTokenExpired, signInWithGoogle } from './firebase';
import { GoogleSpreadsheetItem, listUserSpreadsheets, getSpreadsheetUrl } from './sheetsService';

export type StandardExpenseCategory =
  | 'Food & Dining'
  | 'Transportation'
  | 'Accommodation'
  | 'Shopping'
  | 'Personal Expenses'
  | 'Bills & Utilities'
  | 'Other Expenses';

export type StandardIncomeCategory =
  | 'Salary'
  | 'Tips'
  | 'Additional Income';

export type StandardFinanceCategory = StandardExpenseCategory | StandardIncomeCategory;

export const EXPENSE_CATEGORIES: StandardExpenseCategory[] = [
  'Food & Dining',
  'Transportation',
  'Accommodation',
  'Shopping',
  'Personal Expenses',
  'Bills & Utilities',
  'Other Expenses',
];

export const INCOME_CATEGORIES: StandardIncomeCategory[] = [
  'Salary',
  'Tips',
  'Additional Income',
];

export interface SheetColumnMapping {
  headerRowIndex: number; // 0-based index in raw values array
  dateCol: number; // -1 if unmapped
  descriptionCol: number;
  categoryCol: number;
  typeCol: number; // optional Income/Expense indicator column
  amountCol: number; // optional unified amount column
  incomeCol: number; // optional dedicated income column
  salaryCol: number; // optional dedicated salary column
  tipsCol: number; // optional dedicated tips column
  additionalIncomeCol: number; // optional dedicated additional income column
  expenseCol: number; // optional dedicated expense column
  balanceCol: number; // optional running balance column
  /**
   * Optional multi-column category map: when a user's sheet has separate columns
   * for specific categories (e.g. a column named "Food", a column named "Transport", etc.)
   */
  categoryColumns: {
    colIndex: number;
    headerName: string;
    mappedCategory: StandardFinanceCategory;
    flowType: 'income' | 'expense';
  }[];
}

export interface NormalizedSheetTransaction {
  id: string; // deterministic hash for deduplication
  rowIndex: number; // 1-based row number in Google Sheet
  date: string; // normalized YYYY-MM-DD
  rawDate: string;
  description: string;
  category: StandardFinanceCategory;
  originalCategory: string;
  flowType: 'income' | 'expense' | 'both';
  income: number;
  salaryAmount: number;
  tipsAmount: number;
  additionalIncomeAmount: number;
  expense: number;
  balance: number | null; // explicit from sheet or computed running balance
  computedBalance: number;
  source: 'google-sheets' | 'local';
  worksheetName: string;
  rawRow: Record<string, string>;
}

export interface ConnectedFinanceSheetConfig {
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl: string;
  selectedWorksheet: string;
  availableWorksheets: string[];
  headers: string[];
  columnMapping: SheetColumnMapping;
  autoSyncEnabled: boolean;
  pollIntervalSeconds: number;
  lastSyncedAt: string | null;
  lastRowHash: string | null;
}

export interface FinanceSheetSyncResult {
  config: ConnectedFinanceSheetConfig;
  transactions: NormalizedSheetTransaction[];
  rawRowCount: number;
  validTransactionCount: number;
  duplicatesSkipped: number;
  syncedAt: string;
}

const STORAGE_KEY_FINANCE_SHEET_CONFIG = 'ccd_finance_connected_sheet_config_v1';
const STORAGE_KEY_FINANCE_SHEET_TRANSACTIONS = 'ccd_finance_synced_transactions_v1';

/**
 * Extract a Google Spreadsheet ID from either a full URL or a raw ID string.
 */
export function extractSpreadsheetIdFromInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

/**
 * Load persisted finance sheet configuration from localStorage
 */
export function loadFinanceSheetConfig(): ConnectedFinanceSheetConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FINANCE_SHEET_CONFIG);
    if (!raw) return null;
    return JSON.parse(raw) as ConnectedFinanceSheetConfig;
  } catch {
    return null;
  }
}

/**
 * Save finance sheet configuration to localStorage
 */
export function saveFinanceSheetConfig(config: ConnectedFinanceSheetConfig | null): void {
  try {
    if (!config) {
      localStorage.removeItem(STORAGE_KEY_FINANCE_SHEET_CONFIG);
    } else {
      localStorage.setItem(STORAGE_KEY_FINANCE_SHEET_CONFIG, JSON.stringify(config));
    }
  } catch {}
}

/**
 * Load cached synchronized transactions (only shown when a sheet is actively configured)
 */
export function loadCachedSheetTransactions(): NormalizedSheetTransaction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FINANCE_SHEET_TRANSACTIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCachedSheetTransactions(txs: NormalizedSheetTransaction[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_FINANCE_SHEET_TRANSACTIONS, JSON.stringify(txs));
  } catch {}
}

export function disconnectFinanceSheet(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_FINANCE_SHEET_CONFIG);
    localStorage.removeItem(STORAGE_KEY_FINANCE_SHEET_TRANSACTIONS);
  } catch {}
}

/**
 * Obtain a valid Google OAuth token with Sheets & Drive read permissions.
 */
export async function ensureFinanceSheetsAuth(interactive = false): Promise<string> {
  let token = getCachedGoogleToken();
  if ((!token || isGoogleTokenExpired()) && interactive) {
    const authRes = await signInWithGoogle();
    token = authRes?.accessToken || getCachedGoogleToken();
  }
  if (!token || isGoogleTokenExpired()) {
    throw new Error('Google account authorization is required to synchronize with Google Sheets.');
  }
  return token;
}

/**
 * List user's spreadsheets from Google Drive
 */
export async function fetchUserDriveSpreadsheets(): Promise<GoogleSpreadsheetItem[]> {
  return listUserSpreadsheets();
}

/**
 * Classify a raw category or description string into one of the standard financial categories.
 */
export function classifyFinanceCategory(
  rawCategory: string,
  description: string,
  flowType: 'income' | 'expense'
): StandardFinanceCategory {
  const combined = `${rawCategory} ${description}`.toLowerCase().trim();
  const catLower = rawCategory.toLowerCase().trim();

  if (flowType === 'income') {
    if (
      catLower.includes('tip') ||
      catLower.includes('gratuity') ||
      catLower.includes('service charge') ||
      combined.includes('tips') ||
      combined.includes('tip ')
    ) {
      return 'Tips';
    }
    if (
      catLower.includes('salary') ||
      catLower.includes('wage') ||
      catLower.includes('paycheck') ||
      catLower.includes('payroll') ||
      catLower.includes('basic pay') ||
      combined.includes('salary') ||
      combined.includes('monthly pay')
    ) {
      return 'Salary';
    }
    return 'Additional Income';
  }

  // Expense classification
  if (
    /food|dining|restaurant|grocery|groceries|supermarket|lunch|dinner|breakfast|coffee|cafe|meal|snack|takeaway| takeaway|drink|bar|kitchen|market|bakery|water|fruit|meat|veg/i.test(
      combined
    )
  ) {
    return 'Food & Dining';
  }

  if (
    /transport|uber|bolt|taxi|bus|train|metro|fuel|petrol|gas|diesel|parking|flight|ticket|commute|car|bike|scooter|ride|toll|ferry/i.test(
      combined
    )
  ) {
    return 'Transportation';
  }

  if (
    /accommodation|rent|hotel|hostel|housing|apartment|flat|room|lease|mortgage|airbnb|stay|lodge|deposit/i.test(
      combined
    )
  ) {
    return 'Accommodation';
  }

  if (
    /shopping|clothes|clothing|shoes|amazon|mall|electronics|gadget|gift|store|purchase|wear|fashion|jacket|shirt|pants|accessories/i.test(
      combined
    )
  ) {
    return 'Shopping';
  }

  if (
    /bill|utility|utilities|internet|wifi|phone|mobile|sim|data|electric|electricity|water bill|heating|gas bill|subscription|netflix|icloud|spotify|insurance|tax|bank fee/i.test(
      combined
    )
  ) {
    return 'Bills & Utilities';
  }

  if (
    /personal|haircut|barber|gym|fitness|health|pharmacy|medicine|doctor|medical|laundry|toiletries|cosmetics|self care|hygiene|wellness|family|remittance|parents/i.test(
      combined
    )
  ) {
    return 'Personal Expenses';
  }

  return 'Other Expenses';
}

/**
 * Parse diverse spreadsheet date formats into canonical YYYY-MM-DD.
 * Handles:
 * - YYYY-MM-DD, YYYY/MM/DD
 * - DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
 * - MM/DD/YYYY
 * - "14 Oct 2026", "Oct 14, 2026", "14-Oct-26"
 * - Google Sheets serial numbers (e.g., 45580)
 */
export function parseSpreadsheetDate(rawCell: any, fallbackYear?: number): string | null {
  if (rawCell === null || rawCell === undefined) return null;
  const str = String(rawCell).trim();
  if (!str) return null;

  // 1. Check if Google Sheets numeric serial date (e.g. 44000 - 50000)
  if (/^\d{5}(\.\d+)?$/.test(str)) {
    const serial = parseFloat(str);
    if (serial > 30000 && serial < 70000) {
      // Excel/Sheets epoch: Dec 30, 1899
      const utcDays = Math.floor(serial - 25569);
      const dateObj = new Date(utcDays * 86400 * 1000);
      if (!isNaN(dateObj.getTime())) {
        return dateObj.toISOString().slice(0, 10);
      }
    }
  }

  // 2. ISO YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // 3. DD/MM/YYYY or MM/DD/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmyMatch) {
    const p1 = parseInt(dmyMatch[1], 10);
    const p2 = parseInt(dmyMatch[2], 10);
    let y = parseInt(dmyMatch[3], 10);
    if (y < 100) y += 2000;

    // Prefer DD/MM/YYYY unless p2 > 12
    let day = p1;
    let month = p2;
    if (p1 <= 12 && p2 > 12) {
      month = p1;
      day = p2;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // 4. Text month formats ("15 Oct 2026", "Oct 15, 2026", "15-Oct")
  const cleanStr = str.replace(/(\d+)(st|nd|rd|th)/gi, '$1');
  const parsed = new Date(cleanStr);
  if (!isNaN(parsed.getTime())) {
    let year = parsed.getFullYear();
    if (year < 2000 && fallbackYear) {
      year = fallbackYear;
    }
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 5. Short "DD/MM" without year
  const shortMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})$/);
  if (shortMatch) {
    const p1 = parseInt(shortMatch[1], 10);
    const p2 = parseInt(shortMatch[2], 10);
    const year = fallbackYear || new Date().getFullYear();
    const day = p2 > 12 ? p2 : p1;
    const month = p2 > 12 ? p1 : p2;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return null;
}

/**
 * Parse currency/number strings like "€1,250.50", "$ 45.00", "-120.5", "(35.00)", "1.200,50"
 */
export function parseSpreadsheetAmount(rawCell: any): number {
  if (rawCell === null || rawCell === undefined) return 0;
  if (typeof rawCell === 'number') return isFinite(rawCell) ? rawCell : 0;
  let str = String(rawCell).trim();
  if (!str || str === '-' || str === '—' || str.toLowerCase() === 'n/a') return 0;

  // Handle accounting parentheses e.g. (45.00) -> -45.00
  let isNegative = false;
  if (str.startsWith('(') && str.endsWith(')')) {
    isNegative = true;
    str = str.slice(1, -1);
  }
  if (str.includes('-')) {
    isNegative = true;
  }

  // Strip currency symbols and letters
  let cleaned = str.replace(/[^0-9.,]/g, '');
  if (!cleaned) return 0;

  // Handle European format "1.250,50" vs US/UK "1,250.50"
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma > lastDot && cleaned.length - lastComma <= 3) {
    // Comma is decimal separator
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    // Dot is decimal separator
    cleaned = cleaned.replace(/,/g, '');
  }

  const num = parseFloat(cleaned);
  if (isNaN(num) || !isFinite(num)) return 0;
  return isNegative ? -Math.abs(num) : num;
}

/**
 * Automatically detect the header row and map columns from a 2D array of spreadsheet values.
 */
export function autoDetectColumnMapping(values: any[][]): {
  headers: string[];
  mapping: SheetColumnMapping;
} {
  if (!values || values.length === 0) {
    return {
      headers: [],
      mapping: {
        headerRowIndex: 0,
        dateCol: 0,
        descriptionCol: 1,
        categoryCol: 2,
        typeCol: -1,
        amountCol: -1,
        incomeCol: 3,
        salaryCol: -1,
        tipsCol: -1,
        additionalIncomeCol: -1,
        expenseCol: 4,
        balanceCol: 5,
        categoryColumns: [],
      },
    };
  }

  // Scan the first 10 rows to find the row that looks most like a header row
  let bestRowIdx = 0;
  let bestScore = -1;

  const headerKeywords = [
    'date',
    'day',
    'description',
    'details',
    'note',
    'notes',
    'item',
    'particulars',
    'category',
    'type',
    'expense',
    'expenses',
    'spent',
    'cost',
    'amount',
    'income',
    'salary',
    'tips',
    'tip',
    'balance',
    'remaining',
    'saving',
    'savings',
    'food',
    'transport',
    'rent',
    'shopping',
    'bills',
    'debit',
    'credit',
  ];

  const maxScanRows = Math.min(10, values.length);
  for (let r = 0; r < maxScanRows; r++) {
    const row = values[r] || [];
    let score = 0;
    row.forEach(cell => {
      const text = String(cell || '').toLowerCase().trim();
      if (!text) return;
      if (headerKeywords.some(kw => text === kw || text.includes(kw))) {
        score += 3;
      } else if (isNaN(Number(text)) && text.length > 1 && text.length < 30) {
        score += 1;
      }
    });
    if (score > bestScore) {
      bestScore = score;
      bestRowIdx = r;
    }
  }

  const rawHeaders = (values[bestRowIdx] || []).map((h, i) => {
    const clean = String(h ?? '').trim();
    return clean || `Column ${String.fromCharCode(65 + i)}`;
  });

  const mapping: SheetColumnMapping = {
    headerRowIndex: bestRowIdx,
    dateCol: -1,
    descriptionCol: -1,
    categoryCol: -1,
    typeCol: -1,
    amountCol: -1,
    incomeCol: -1,
    salaryCol: -1,
    tipsCol: -1,
    additionalIncomeCol: -1,
    expenseCol: -1,
    balanceCol: -1,
    categoryColumns: [],
  };

  rawHeaders.forEach((header, idx) => {
    const h = header.toLowerCase().trim();

    if (mapping.dateCol === -1 && (h === 'date' || h.includes('date') || h === 'day' || h === 'timestamp')) {
      mapping.dateCol = idx;
      return;
    }

    if (
      mapping.descriptionCol === -1 &&
      (h.includes('description') ||
        h.includes('detail') ||
        h.includes('particular') ||
        h.includes('note') ||
        h.includes('memo') ||
        h.includes('merchant') ||
        h.includes('item') ||
        h.includes('title') ||
        h.includes('reason') ||
        h.includes('purpose'))
    ) {
      mapping.descriptionCol = idx;
      return;
    }

    if (mapping.categoryCol === -1 && (h === 'category' || h.includes('category') || h === 'group' || h === 'head')) {
      mapping.categoryCol = idx;
      return;
    }

    if (mapping.typeCol === -1 && (h === 'type' || h === 'transaction type' || h === 'flow' || h === 'in/out')) {
      mapping.typeCol = idx;
      return;
    }

    if (
      mapping.salaryCol === -1 &&
      (h === 'salary' || h.includes('salary') || h === 'basic pay' || h === 'wages' || h === 'payroll')
    ) {
      mapping.salaryCol = idx;
      return;
    }

    if (mapping.tipsCol === -1 && (h === 'tips' || h === 'tip' || h.includes('tips') || h.includes('gratuity'))) {
      mapping.tipsCol = idx;
      return;
    }

    if (
      mapping.additionalIncomeCol === -1 &&
      (h.includes('additional income') ||
        h.includes('other income') ||
        h.includes('extra income') ||
        h.includes('side income') ||
        h.includes('bonus'))
    ) {
      mapping.additionalIncomeCol = idx;
      return;
    }

    if (
      mapping.incomeCol === -1 &&
      (h === 'income' ||
        h.includes('total income') ||
        h === 'credit' ||
        h === 'inflow' ||
        h === 'money in' ||
        h === 'earnings' ||
        h === 'received')
    ) {
      mapping.incomeCol = idx;
      return;
    }

    if (
      mapping.expenseCol === -1 &&
      (h === 'expense' ||
        h === 'expenses' ||
        h.includes('expense') ||
        h === 'spent' ||
        h.includes('money spent') ||
        h === 'debit' ||
        h === 'outflow' ||
        h === 'money out' ||
        h === 'cost' ||
        h === 'paid')
    ) {
      mapping.expenseCol = idx;
      return;
    }

    if (
      mapping.balanceCol === -1 &&
      (h === 'balance' ||
        h.includes('balance') ||
        h.includes('remaining') ||
        h === 'net' ||
        h.includes('net saving') ||
        h === 'left')
    ) {
      mapping.balanceCol = idx;
      return;
    }

    if (mapping.amountCol === -1 && (h === 'amount' || h === 'value' || h === 'total' || h === 'sum' || h === 'price')) {
      mapping.amountCol = idx;
      return;
    }
  });

  // Check if remaining columns represent specific expense/income categories (multi-column daily tracker sheet)
  const usedCols = new Set([
    mapping.dateCol,
    mapping.descriptionCol,
    mapping.categoryCol,
    mapping.typeCol,
    mapping.amountCol,
    mapping.incomeCol,
    mapping.salaryCol,
    mapping.tipsCol,
    mapping.additionalIncomeCol,
    mapping.expenseCol,
    mapping.balanceCol,
  ]);

  rawHeaders.forEach((header, idx) => {
    if (usedCols.has(idx)) return;
    const h = header.toLowerCase().trim();
    if (!h || h.startsWith('column ')) return;

    // Skip summary/total/month columns
    if (h.includes('total') || h.includes('month') || h.includes('average') || h.includes('remark') || h.includes('status')) {
      return;
    }

    // Check if header matches known expense or income terms
    const isSpecificCategory =
      /food|dining|grocery|groceries|drink|coffee|meal|transport|bus|taxi|uber|fuel|rent|accommodation|hotel|house|room|shop|shopping|clothes|personal|bill|utility|electric|internet|wifi|phone|other|misc/i.test(
        h
      );

    if (isSpecificCategory) {
      const mappedCategory = classifyFinanceCategory(header, '', 'expense');
      mapping.categoryColumns.push({
        colIndex: idx,
        headerName: header,
        mappedCategory,
        flowType: 'expense',
      });
    }
  });

  // Fallback heuristics if Date or Amount/Expense columns weren't explicitly named
  if (mapping.dateCol === -1 && rawHeaders.length > 0) {
    // Inspect first few data rows to find a column containing valid dates
    for (let c = 0; c < rawHeaders.length; c++) {
      let dateHits = 0;
      for (let r = bestRowIdx + 1; r < Math.min(values.length, bestRowIdx + 8); r++) {
        if (parseSpreadsheetDate(values[r]?.[c])) {
          dateHits++;
        }
      }
      if (dateHits >= 1) {
        mapping.dateCol = c;
        break;
      }
    }
  }

  return { headers: rawHeaders, mapping };
}

/**
 * Parse raw 2D sheet values into normalized, deduplicated financial transactions
 * without altering the source spreadsheet.
 */
export function parseSheetRowsToTransactions(
  values: any[][],
  headers: string[],
  mapping: SheetColumnMapping,
  worksheetName: string,
  spreadsheetId: string
): {
  transactions: NormalizedSheetTransaction[];
  duplicatesSkipped: number;
} {
  if (!values || values.length <= mapping.headerRowIndex + 1) {
    return { transactions: [], duplicatesSkipped: 0 };
  }

  const transactions: NormalizedSheetTransaction[] = [];
  const seenSignatures = new Set<string>();
  let duplicatesSkipped = 0;
  let lastValidDate = new Date().toISOString().slice(0, 10);

  for (let r = mapping.headerRowIndex + 1; r < values.length; r++) {
    const row = values[r];
    if (!row || row.length === 0) continue;

    // Check if the entire row is blank or a "Total / Summary" footer row
    const nonEmptyCells = row.filter(c => c !== null && c !== undefined && String(c).trim() !== '');
    if (nonEmptyCells.length === 0) continue;

    const joinedRowLower = row.map(c => String(c || '').toLowerCase().trim()).join(' | ');
    if (
      /^(total|grand total|monthly total|sum|sub-total|subtotal|average|balance brought forward)\b/i.test(
        String(row[0] || '').trim()
      ) ||
      /^(total|grand total|monthly total|sum|sub-total|subtotal)\b/i.test(
        String(row[mapping.descriptionCol] || '').trim()
      )
    ) {
      continue;
    }

    // Build rawRow key-value dictionary for inspection
    const rawRowRecord: Record<string, string> = {};
    headers.forEach((h, cIdx) => {
      const val = row[cIdx];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        rawRowRecord[h] = String(val).trim();
      }
    });

    // Resolve Date
    const rawDateVal = mapping.dateCol >= 0 ? row[mapping.dateCol] : row[0];
    const parsedDate = parseSpreadsheetDate(rawDateVal);
    if (!parsedDate) {
      // If there's no date in this row and no numbers, skip
      const hasAnyAmount = row.some((cell, idx) => idx !== mapping.dateCol && parseSpreadsheetAmount(cell) !== 0);
      if (!hasAnyAmount) continue;
    } else {
      lastValidDate = parsedDate;
    }
    const effectiveDate = parsedDate || lastValidDate;

    const rawDescription =
      mapping.descriptionCol >= 0 && row[mapping.descriptionCol] !== undefined
        ? String(row[mapping.descriptionCol]).trim()
        : '';

    const rawCategory =
      mapping.categoryCol >= 0 && row[mapping.categoryCol] !== undefined
        ? String(row[mapping.categoryCol]).trim()
        : '';

    const rawType =
      mapping.typeCol >= 0 && row[mapping.typeCol] !== undefined
        ? String(row[mapping.typeCol]).toLowerCase().trim()
        : '';

    const explicitBalance =
      mapping.balanceCol >= 0 && row[mapping.balanceCol] !== undefined && String(row[mapping.balanceCol]).trim() !== ''
        ? parseSpreadsheetAmount(row[mapping.balanceCol])
        : null;

    // Extract dedicated income components if mapped
    let salaryAmt = mapping.salaryCol >= 0 ? Math.max(0, parseSpreadsheetAmount(row[mapping.salaryCol])) : 0;
    let tipsAmt = mapping.tipsCol >= 0 ? Math.max(0, parseSpreadsheetAmount(row[mapping.tipsCol])) : 0;
    let addIncomeAmt =
      mapping.additionalIncomeCol >= 0 ? Math.max(0, parseSpreadsheetAmount(row[mapping.additionalIncomeCol])) : 0;
    let directIncomeAmt = mapping.incomeCol >= 0 ? Math.max(0, parseSpreadsheetAmount(row[mapping.incomeCol])) : 0;
    let directExpenseAmt =
      mapping.expenseCol >= 0 ? Math.abs(parseSpreadsheetAmount(row[mapping.expenseCol])) : 0;

    // Handle unified Amount column if used instead of split Income/Expense columns
    if (
      mapping.amountCol >= 0 &&
      directIncomeAmt === 0 &&
      directExpenseAmt === 0 &&
      salaryAmt === 0 &&
      tipsAmt === 0 &&
      addIncomeAmt === 0
    ) {
      const rawAmt = parseSpreadsheetAmount(row[mapping.amountCol]);
      const isIncomeByType =
        rawType.includes('inc') ||
        rawType.includes('credit') ||
        rawType.includes('in') ||
        rawType === '+' ||
        /salary|tips|tip|bonus|income|wage|deposit/i.test(rawCategory);

      if (isIncomeByType || (rawAmt > 0 && rawType === 'income')) {
        directIncomeAmt = Math.abs(rawAmt);
      } else if (rawAmt < 0) {
        directExpenseAmt = Math.abs(rawAmt);
      } else {
        directExpenseAmt = Math.abs(rawAmt);
      }
    }

    // Also check if multi-column categories exist on this row
    if (mapping.categoryColumns.length > 0) {
      mapping.categoryColumns.forEach(catCol => {
        const cellAmt = Math.abs(parseSpreadsheetAmount(row[catCol.colIndex]));
        if (cellAmt > 0) {
          const txId = `sheet_${spreadsheetId}_${worksheetName}_r${r + 1}_c${catCol.colIndex}`;
          const dedupSig = `${effectiveDate}|${catCol.headerName}|${cellAmt}|r${r + 1}_c${catCol.colIndex}`;
          if (seenSignatures.has(dedupSig)) {
            duplicatesSkipped++;
            return;
          }
          seenSignatures.add(dedupSig);

          transactions.push({
            id: txId,
            rowIndex: r + 1,
            date: effectiveDate,
            rawDate: String(rawDateVal || effectiveDate),
            description: rawDescription || catCol.headerName,
            category: catCol.mappedCategory,
            originalCategory: catCol.headerName,
            flowType: catCol.flowType,
            income: catCol.flowType === 'income' ? cellAmt : 0,
            salaryAmount: catCol.mappedCategory === 'Salary' ? cellAmt : 0,
            tipsAmount: catCol.mappedCategory === 'Tips' ? cellAmt : 0,
            additionalIncomeAmount: catCol.mappedCategory === 'Additional Income' ? cellAmt : 0,
            expense: catCol.flowType === 'expense' ? cellAmt : 0,
            balance: explicitBalance,
            computedBalance: 0,
            source: 'google-sheets',
            worksheetName,
            rawRow: rawRowRecord,
          });
        }
      });
    }

    // Reconcile total income for standard row
    const sumBreakdownIncome = salaryAmt + tipsAmt + addIncomeAmt;
    let totalRowIncome = Math.max(directIncomeAmt, sumBreakdownIncome);

    // If directIncomeAmt > 0 and breakdown wasn't in separate columns, classify the income category
    if (totalRowIncome > 0 && sumBreakdownIncome === 0) {
      const incClass = classifyFinanceCategory(rawCategory, rawDescription, 'income');
      if (incClass === 'Salary') salaryAmt = totalRowIncome;
      else if (incClass === 'Tips') tipsAmt = totalRowIncome;
      else addIncomeAmt = totalRowIncome;
    } else if (totalRowIncome > sumBreakdownIncome && sumBreakdownIncome > 0) {
      addIncomeAmt += totalRowIncome - sumBreakdownIncome;
    }

    // Skip if standard columns yielded 0 and categoryColumns already handled the row
    if (totalRowIncome === 0 && directExpenseAmt === 0) {
      continue;
    }

    // Determine primary category for the row
    const primaryFlow: 'income' | 'expense' | 'both' =
      totalRowIncome > 0 && directExpenseAmt > 0
        ? 'both'
        : totalRowIncome > 0
        ? 'income'
        : 'expense';

    const resolvedCategory: StandardFinanceCategory =
      primaryFlow === 'income'
        ? classifyFinanceCategory(rawCategory, rawDescription, 'income')
        : classifyFinanceCategory(rawCategory, rawDescription, 'expense');

    const displayDescription =
      rawDescription ||
      rawCategory ||
      (primaryFlow === 'income' ? resolvedCategory : `${resolvedCategory} Entry`);

    // Duplicate prevention signature (same date, description, category, income, expense, and row index)
    const signature = `${effectiveDate}|${displayDescription.toLowerCase()}|${resolvedCategory}|${totalRowIncome.toFixed(
      2
    )}|${directExpenseAmt.toFixed(2)}|row_${r + 1}`;

    if (seenSignatures.has(signature)) {
      duplicatesSkipped++;
      continue;
    }
    seenSignatures.add(signature);

    transactions.push({
      id: `sheet_${spreadsheetId}_${worksheetName}_row_${r + 1}`,
      rowIndex: r + 1,
      date: effectiveDate,
      rawDate: String(rawDateVal || effectiveDate),
      description: displayDescription,
      category: resolvedCategory,
      originalCategory: rawCategory || resolvedCategory,
      flowType: primaryFlow,
      income: totalRowIncome,
      salaryAmount: salaryAmt,
      tipsAmount: tipsAmt,
      additionalIncomeAmount: addIncomeAmt,
      expense: directExpenseAmt,
      balance: explicitBalance,
      computedBalance: 0,
      source: 'google-sheets',
      worksheetName,
      rawRow: rawRowRecord,
    });
  }

  // Sort chronologically (oldest to newest) to compute accurate running balance, then reverse for display
  const chronological = [...transactions].sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    if (cmp !== 0) return cmp;
    return a.rowIndex - b.rowIndex;
  });

  let runningBalance = 0;
  chronological.forEach(tx => {
    runningBalance += tx.income - tx.expense;
    tx.computedBalance = tx.balance !== null ? tx.balance : runningBalance;
  });

  // Return newest first by default
  const newestFirst = [...chronological].reverse();
  return {
    transactions: newestFirst,
    duplicatesSkipped,
  };
}

/**
 * Fetch spreadsheet metadata and read all rows from the selected (or first) worksheet tab.
 * Strictly uses GET requests (`spreadsheets.get` and `spreadsheets.values.get`) so the
 * user's original spreadsheet is NEVER modified, overwritten, or restructured.
 */
export async function syncFinanceSpreadsheet(options: {
  spreadsheetIdOrUrl: string;
  preferredWorksheet?: string;
  customMapping?: SheetColumnMapping;
  interactiveAuth?: boolean;
}): Promise<FinanceSheetSyncResult> {
  const spreadsheetId = extractSpreadsheetIdFromInput(options.spreadsheetIdOrUrl);
  if (!spreadsheetId) {
    throw new Error('Please provide a valid Google Spreadsheet ID or URL.');
  }

  const token = await ensureFinanceSheetsAuth(Boolean(options.interactiveAuth));

  // 1. Fetch spreadsheet metadata (title + worksheet tabs)
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}?fields=properties.title,sheets.properties(title,sheetId,gridProperties)`;

  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!metaRes.ok) {
    const errBody = await metaRes.json().catch(() => ({}));
    const apiMessage = errBody?.error?.message || `HTTP ${metaRes.status}`;
    throw new Error(`Unable to read Google Spreadsheet: ${apiMessage}`);
  }

  const metaData = await metaRes.json();
  const spreadsheetTitle = metaData.properties?.title || 'Connected Finance Spreadsheet';
  const availableWorksheets: string[] = (metaData.sheets || []).map(
    (s: any) => s.properties?.title || 'Sheet1'
  );

  if (availableWorksheets.length === 0) {
    throw new Error('No worksheets found inside the selected Google Spreadsheet.');
  }

  const selectedWorksheet =
    options.preferredWorksheet && availableWorksheets.includes(options.preferredWorksheet)
      ? options.preferredWorksheet
      : availableWorksheets[0];

  // 2. Fetch all values from the selected worksheet (A1:Z5000) — strictly read-only
  const encodedRange = encodeURIComponent(`'${selectedWorksheet.replace(/'/g, "''")}'!A1:Z5000`);
  const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values/${encodedRange}?valueRenderOption=FORMATTED_VALUE`;

  const valuesRes = await fetch(valuesUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!valuesRes.ok) {
    const errBody = await valuesRes.json().catch(() => ({}));
    const apiMessage = errBody?.error?.message || `HTTP ${valuesRes.status}`;
    throw new Error(`Failed to read rows from worksheet "${selectedWorksheet}": ${apiMessage}`);
  }

  const valuesData = await valuesRes.json();
  const rawValues: any[][] = valuesData.values || [];

  // 3. Auto-detect column headers and mapping (or apply user's custom mapping)
  const detected = autoDetectColumnMapping(rawValues);
  const activeMapping = options.customMapping || detected.mapping;
  const activeHeaders =
    rawValues[activeMapping.headerRowIndex]?.map((h: any, idx: number) =>
      String(h ?? '').trim() || `Column ${String.fromCharCode(65 + idx)}`
    ) || detected.headers;

  // 4. Parse rows into normalized transactions
  const { transactions, duplicatesSkipped } = parseSheetRowsToTransactions(
    rawValues,
    activeHeaders,
    activeMapping,
    selectedWorksheet,
    spreadsheetId
  );

  const syncedAt = new Date().toISOString();
  const rowHash = `${rawValues.length}_${transactions.length}_${
    transactions[0]?.id || 'empty'
  }_${transactions.reduce((acc, t) => acc + t.income + t.expense, 0).toFixed(2)}`;

  const existingConfig = loadFinanceSheetConfig();
  const config: ConnectedFinanceSheetConfig = {
    spreadsheetId,
    spreadsheetTitle,
    spreadsheetUrl: getSpreadsheetUrl(spreadsheetId),
    selectedWorksheet,
    availableWorksheets,
    headers: activeHeaders,
    columnMapping: activeMapping,
    autoSyncEnabled: existingConfig ? existingConfig.autoSyncEnabled : true,
    pollIntervalSeconds: existingConfig?.pollIntervalSeconds || 30,
    lastSyncedAt: syncedAt,
    lastRowHash: rowHash,
  };

  saveFinanceSheetConfig(config);
  saveCachedSheetTransactions(transactions);

  return {
    config,
    transactions,
    rawRowCount: Math.max(0, rawValues.length - (activeMapping.headerRowIndex + 1)),
    validTransactionCount: transactions.length,
    duplicatesSkipped,
    syncedAt,
  };
}

/**
 * Generate a ready-to-paste Google Apps Script `onEdit` trigger snippet
 * for users who want instant push webhook notifications when they edit a row in Google Sheets.
 */
export function generateAppsScriptOnEditSnippet(webhookUrl: string, spreadsheetId: string): string {
  return `/**
 * CCD — Real-Time Finance Sheet onEdit Sync Trigger
 * Paste into Extensions -> Apps Script in your Google Sheet and save.
 * Does NOT modify or restructure your spreadsheet.
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.source.getActiveSheet();
    var payload = {
      spreadsheetId: "${spreadsheetId}",
      worksheetName: sheet.getName(),
      editedRow: e.range.getRow(),
      editedColumn: e.range.getColumn(),
      editedAt: new Date().toISOString()
    };
    UrlFetchApp.fetch("${webhookUrl}", {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (err) {
    Logger.log("CCD Sync notice: " + err);
  }
}`;
}
