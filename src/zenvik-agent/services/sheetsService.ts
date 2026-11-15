import { getCachedGoogleToken, isGoogleTokenExpired, signInWithGoogle } from './firebase';
import { AppliedJobRecord } from './jobDatabaseService';

const STORAGE_KEY_CONNECTED_SHEET_ID = 'connected_google_sheet_id';
const STORAGE_KEY_CONNECTED_SHEET_NAME = 'connected_google_sheet_name';
const STORAGE_KEY_AUTO_SYNC = 'sheets_auto_sync_enabled';

export interface GoogleSpreadsheetItem {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface SheetRowData {
  rowIndex: number;
  dateApplied: string;
  company: string;
  position: string;
  location: string;
  recipientEmail: string;
  status: string;
  matchScore: string;
  jobUrl: string;
  notes: string;
  lastUpdated: string;
}

export interface SpreadsheetDetails {
  id: string;
  title: string;
  url: string;
  sheets: string[];
  totalRows: number;
  rows: SheetRowData[];
}

export function getConnectedSpreadsheetId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY_CONNECTED_SHEET_ID);
  } catch {
    return null;
  }
}

export function setConnectedSpreadsheetId(id: string | null, name?: string): void {
  try {
    if (id) {
      localStorage.setItem(STORAGE_KEY_CONNECTED_SHEET_ID, id);
      if (name) localStorage.setItem(STORAGE_KEY_CONNECTED_SHEET_NAME, name);
    } else {
      localStorage.removeItem(STORAGE_KEY_CONNECTED_SHEET_ID);
      localStorage.removeItem(STORAGE_KEY_CONNECTED_SHEET_NAME);
    }
  } catch {}
}

export function getConnectedSpreadsheetName(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_CONNECTED_SHEET_NAME) || 'Job Hunter AI - Applications Tracker';
  } catch {
    return 'Job Hunter AI - Applications Tracker';
  }
}

export function isSheetsAutoSyncEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_AUTO_SYNC) === 'true';
  } catch {
    return false;
  }
}

export function setSheetsAutoSyncEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY_AUTO_SYNC, enabled ? 'true' : 'false');
  } catch {}
}

export function getSpreadsheetUrl(id: string): string {
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}

/**
 * Get a valid access token or request sign in
 */
export async function getValidSheetsToken(): Promise<string> {
  let token = getCachedGoogleToken();
  if (!token || isGoogleTokenExpired()) {
    const res = await signInWithGoogle();
    token = res?.accessToken || getCachedGoogleToken();
  }
  if (!token) {
    throw new Error('Google authentication required. Please connect your Google account.');
  }
  return token;
}

/**
 * List all Google Spreadsheets from user's Google Drive
 */
export async function listUserSpreadsheets(): Promise<GoogleSpreadsheetItem[]> {
  const token = await getValidSheetsToken();
  const query = encodeURIComponent("mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,webViewLink)&orderBy=modifiedTime desc&pageSize=30`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to fetch Google Spreadsheets (${res.status})`);
  }

  const data = await res.json();
  return (data.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    modifiedTime: f.modifiedTime,
    webViewLink: f.webViewLink || getSpreadsheetUrl(f.id),
  }));
}

/**
 * Find default tracker spreadsheet or return null
 */
export async function findDefaultTrackerSpreadsheet(): Promise<GoogleSpreadsheetItem | null> {
  const token = await getValidSheetsToken();
  const query = encodeURIComponent("name contains 'Job Hunter' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,webViewLink)&orderBy=modifiedTime desc&pageSize=1`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (data.files && data.files.length > 0) {
    const f = data.files[0];
    return {
      id: f.id,
      name: f.name,
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink || getSpreadsheetUrl(f.id),
    };
  }
  return null;
}

/**
 * Create a new Job Applications Tracker Spreadsheet in Google Sheets
 */
export async function createJobTrackerSpreadsheet(customTitle?: string): Promise<SpreadsheetDetails> {
  const token = await getValidSheetsToken();
  const title = customTitle?.trim() || `Job Hunter AI - Applications Tracker (${new Date().toLocaleDateString('en-GB')})`;

  const createPayload = {
    properties: {
      title,
    },
    sheets: [
      {
        properties: {
          title: 'Applications',
          gridProperties: {
            frozenRowCount: 1,
            rowCount: 100,
            columnCount: 10,
          },
        },
      },
      {
        properties: {
          title: 'Summary Stats',
          gridProperties: {
            frozenRowCount: 1,
            rowCount: 20,
            columnCount: 4,
          },
        },
      },
    ],
  };

  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createPayload),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to create Google Spreadsheet (${createRes.status})`);
  }

  const createdData = await createRes.json();
  const spreadsheetId = createdData.spreadsheetId;
  const sheetId = createdData.sheets?.[0]?.properties?.sheetId ?? 0;

  // Add Headers and formatting
  const headers = [
    'Date Applied',
    'Company',
    'Position / Role',
    'Location',
    'Recipient Email',
    'Status',
    'Match Score',
    'Job URL / Source',
    'Cover Letter Summary',
    'Last Updated',
  ];

  // Set Applications header row
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Applications!A1:J1?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: [headers],
    }),
  });

  // Set Summary Stats header row
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Summary Stats'!A1:C1?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: [['Metric', 'Value', 'Last Checked']],
    }),
  });

  // Apply styling to header row (Blue background, bold white text)
  try {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: 10,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.1, green: 0.25, blue: 0.5 },
                  textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                  horizontalAlignment: 'CENTER',
                },
              },
              fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
            },
          },
        ],
      }),
    });
  } catch (styleErr) {
    console.warn('Could not apply custom header style:', styleErr);
  }

  setConnectedSpreadsheetId(spreadsheetId, title);

  return {
    id: spreadsheetId,
    title,
    url: getSpreadsheetUrl(spreadsheetId),
    sheets: ['Applications', 'Summary Stats'],
    totalRows: 0,
    rows: [],
  };
}

/**
 * Fetch details and recent rows from a connected spreadsheet
 */
export async function getSpreadsheetDetails(spreadsheetId: string): Promise<SpreadsheetDetails> {
  const token = await getValidSheetsToken();

  // Get metadata
  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!metaRes.ok) {
    const err = await metaRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to access spreadsheet (${metaRes.status})`);
  }

  const metaData = await metaRes.json();
  const title = metaData.properties?.title || 'Google Sheet';
  const sheetNames = (metaData.sheets || []).map((s: any) => s.properties?.title || 'Sheet1');
  const targetSheet = sheetNames.includes('Applications') ? 'Applications' : sheetNames[0];

  // Fetch rows
  const rowsRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${targetSheet}'!A2:J200`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const rowsData = rowsRes.ok ? await rowsRes.json() : { values: [] };
  const rawValues = rowsData.values || [];

  const rows: SheetRowData[] = rawValues.map((row: any[], index: number) => ({
    rowIndex: index + 2,
    dateApplied: row[0] || '',
    company: row[1] || '',
    position: row[2] || '',
    location: row[3] || '',
    recipientEmail: row[4] || '',
    status: row[5] || 'Applied',
    matchScore: row[6] || '',
    jobUrl: row[7] || '',
    notes: row[8] || '',
    lastUpdated: row[9] || '',
  }));

  return {
    id: spreadsheetId,
    title,
    url: getSpreadsheetUrl(spreadsheetId),
    sheets: sheetNames,
    totalRows: rows.length,
    rows,
  };
}

/**
 * Append a single job application to the connected Google Sheet
 */
export async function appendApplicationToSheet(
  spreadsheetId: string,
  record: AppliedJobRecord | {
    company: string;
    position: string;
    recipientEmail: string;
    jobUrl?: string;
    matchScore?: number;
    status?: string;
    location?: string;
    coverLetterSnippet?: string;
  }
): Promise<{ success: boolean; updatedRange?: string }> {
  const token = await getValidSheetsToken();

  const dateApplied = (record as AppliedJobRecord).appliedAt
    ? new Date((record as AppliedJobRecord).appliedAt).toLocaleDateString('en-GB')
    : new Date().toLocaleDateString('en-GB');

  const rowValues = [
    dateApplied,
    record.company || 'Unknown Company',
    record.position || 'Specialist',
    (record as any).location || 'Europe / Cyprus / Global',
    record.recipientEmail || 'N/A',
    (record as any).status || 'Applied (Email Sent)',
    (record as any).matchScore ? `${(record as any).matchScore}%` : '95%',
    record.jobUrl || '',
    (record as any).coverLetterSnippet || 'Personalized application dispatched via Gmail',
    new Date().toLocaleString('en-GB'),
  ];

  const targetRange = `'Applications'!A:J`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${targetRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: [rowValues],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to append row to Google Sheet (${res.status})`);
  }

  const data = await res.json();
  return {
    success: true,
    updatedRange: data.updates?.updatedRange,
  };
}

/**
 * Sync all applied jobs to the Google Sheet (skipping existing rows by company + role)
 */
export async function syncAllApplicationsToSheet(
  spreadsheetId: string,
  appliedRecords: AppliedJobRecord[],
  onProgress?: (processed: number, total: number, added: number) => void
): Promise<{ total: number; added: number; skipped: number }> {
  if (appliedRecords.length === 0) {
    return { total: 0, added: 0, skipped: 0 };
  }

  const token = await getValidSheetsToken();
  const details = await getSpreadsheetDetails(spreadsheetId);

  // Build a set of existing company+position combinations to prevent duplicate rows
  const existingKeys = new Set(
    details.rows.map(r => `${r.company.toLowerCase().trim()}_${r.position.toLowerCase().trim()}`)
  );

  const rowsToAppend: any[][] = [];
  let skipped = 0;

  appliedRecords.forEach(rec => {
    const key = `${(rec.company || '').toLowerCase().trim()}_${(rec.position || '').toLowerCase().trim()}`;
    if (existingKeys.has(key)) {
      skipped++;
    } else {
      const dateApplied = rec.appliedAt ? new Date(rec.appliedAt).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');
      rowsToAppend.push([
        dateApplied,
        rec.company || '',
        rec.position || '',
        (rec as any).location || 'Europe / Global',
        rec.recipientEmail || '',
        'Applied (Email Sent)',
        (rec as any).matchScore ? `${(rec as any).matchScore}%` : '95%',
        rec.jobUrl || '',
        rec.gmailMessageId ? `Gmail ID: ${rec.gmailMessageId}` : 'Dispatched via Gmail API',
        new Date().toLocaleString('en-GB'),
      ]);
      existingKeys.add(key);
    }
  });

  if (rowsToAppend.length > 0) {
    const targetRange = `'Applications'!A:J`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${targetRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: rowsToAppend,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Failed to sync batch into Google Sheet (${res.status})`);
    }
  }

  if (onProgress) {
    onProgress(appliedRecords.length, appliedRecords.length, rowsToAppend.length);
  }

  return {
    total: appliedRecords.length,
    added: rowsToAppend.length,
    skipped,
  };
}

/**
 * Clear and overwrite the spreadsheet with provided records (requires explicit user confirmation dialog first)
 */
export async function overwriteSpreadsheetWithRecords(
  spreadsheetId: string,
  appliedRecords: AppliedJobRecord[]
): Promise<void> {
  const token = await getValidSheetsToken();

  // Clear existing values in Applications
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Applications'!A2:J500:clear`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  // Re-write headers just in case
  const headers = [
    'Date Applied',
    'Company',
    'Position / Role',
    'Location',
    'Recipient Email',
    'Status',
    'Match Score',
    'Job URL / Source',
    'Cover Letter Summary',
    'Last Updated',
  ];

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Applications'!A1:J1?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [headers] }),
  });

  // Populate all records
  const rows = appliedRecords.map(rec => [
    rec.appliedAt ? new Date(rec.appliedAt).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'),
    rec.company || '',
    rec.position || '',
    (rec as any).location || 'Europe / Global',
    rec.recipientEmail || '',
    'Applied (Email Sent)',
    (rec as any).matchScore ? `${(rec as any).matchScore}%` : '95%',
    rec.jobUrl || '',
    rec.gmailMessageId ? `Gmail ID: ${rec.gmailMessageId}` : 'Dispatched via Gmail API',
    new Date().toLocaleString('en-GB'),
  ]);

  if (rows.length > 0) {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'Applications'!A2:J?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: rows }),
    });
  }
}
