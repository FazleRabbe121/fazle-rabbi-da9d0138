import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

export const personalAIChatRouter = express.Router();

// ============================================================================
// DATA STRUCTURES & PERSISTENT STORAGE
// ============================================================================

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string; // base64 data URL
  sizeBytes?: number;
  extractedSummary?: string;
}

export interface ChatToolExecutionRecord {
  id: string;
  toolId: string;
  toolName: string;
  operation: string;
  status: 'pending_confirmation' | 'executed' | 'cancelled' | 'failed';
  requiresConfirmation: boolean;
  parameters: Record<string, any>;
  resultSummary?: string;
  rawResult?: any;
  timestamp: string;
}

export interface PersonalAIChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  updatedAt?: string;
  edited?: boolean;
  providerUsed?: 'openai' | 'gemini' | 'fallback';
  modelUsed?: string;
  attachments?: ChatAttachment[];
  toolExecutions?: ChatToolExecutionRecord[];
  tokenEstimate?: number;
}

export interface PersonalAIConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
  preferredProvider?: 'auto' | 'openai' | 'gemini';
  preferredModel?: string;
  messages: PersonalAIChatMessage[];
}

export interface WorkspaceToolIntegration {
  id: string;
  name: string;
  category: 'google_workspace' | 'database' | 'custom_api' | 'productivity';
  description: string;
  iconName: string;
  connected: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'needs_reauth' | 'error';
  authType: 'oauth2_client_token' | 'api_key' | 'webhook' | 'internal';
  scopes: string[];
  capabilities: string[];
  permissions: {
    read: boolean;
    write: boolean;
    requireConfirmationForWrite: boolean;
  };
  connectedAccount?: string;
  connectedResourceName?: string;
  connectedResourceId?: string;
  customEndpointUrl?: string;
  lastSyncedAt?: string | null;
  lastError?: string | null;
}

export interface ToolExecutionLogEntry {
  id: string;
  toolId: string;
  toolName: string;
  action: string;
  status: 'success' | 'error' | 'awaiting_confirmation' | 'cancelled';
  summary: string;
  details?: any;
  createdAt: string;
}

interface PersonalAIChatStoreData {
  conversations: PersonalAIConversation[];
  integrations: WorkspaceToolIntegration[];
  executionLogs: ToolExecutionLogEntry[];
  pendingConfirmations: ChatToolExecutionRecord[];
  usageStats: {
    totalMessages: number;
    totalVisionAnalyses: number;
    totalToolCalls: number;
    openaiCalls: number;
    geminiCalls: number;
    estimatedTokens: number;
    lastActiveAt: string | null;
  };
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'personal_ai_conversations.json');

const DEFAULT_INTEGRATIONS: WorkspaceToolIntegration[] = [
  {
    id: 'google-sheets',
    name: 'Google Sheets',
    category: 'google_workspace',
    description:
      'Read spreadsheet rows, find specific items (e.g. "Mango"), create new sheets, append rows, update cells, summarize data, detect duplicates, and calculate totals.',
    iconName: 'FileSpreadsheet',
    connected: false,
    connectionStatus: 'disconnected',
    authType: 'oauth2_client_token',
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
    capabilities: [
      'Read sheet data',
      'Find specific records (e.g. Mango)',
      'Create new spreadsheet',
      'Add new records (Confirmation required)',
      'Update existing rows (Confirmation required)',
      'Summarize sheet data & calculate totals',
      'Identify duplicate rows',
      'Organize columns',
    ],
    permissions: {
      read: true,
      write: true,
      requireConfirmationForWrite: true,
    },
    lastSyncedAt: null,
    lastError: null,
  },
  {
    id: 'google-docs',
    name: 'Google Docs',
    category: 'google_workspace',
    description: 'Read, summarize, draft, and export structured documents with your Google account.',
    iconName: 'FileText',
    connected: false,
    connectionStatus: 'disconnected',
    authType: 'oauth2_client_token',
    scopes: ['https://www.googleapis.com/auth/documents', 'https://www.googleapis.com/auth/drive.file'],
    capabilities: ['Read document text', 'Summarize document', 'Create new Google Doc (Confirmation required)'],
    permissions: {
      read: true,
      write: true,
      requireConfirmationForWrite: true,
    },
    lastSyncedAt: null,
    lastError: null,
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    category: 'google_workspace',
    description: 'Search files, inspect spreadsheets and documents, and manage cloud workspace files.',
    iconName: 'HardDrive',
    connected: false,
    connectionStatus: 'disconnected',
    authType: 'oauth2_client_token',
    scopes: ['https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/drive.file'],
    capabilities: ['Search Drive files', 'List recent spreadsheets & docs', 'Inspect file metadata'],
    permissions: {
      read: true,
      write: false,
      requireConfirmationForWrite: true,
    },
    lastSyncedAt: null,
    lastError: null,
  },
  {
    id: 'gmail',
    name: 'Gmail Workspace',
    category: 'google_workspace',
    description: 'Draft messages, summarize email threads, and translate correspondence in Bengali or English.',
    iconName: 'Mail',
    connected: false,
    connectionStatus: 'disconnected',
    authType: 'oauth2_client_token',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.compose'],
    capabilities: ['Summarize emails', 'Draft email replies', 'Send email (Confirmation required)'],
    permissions: {
      read: true,
      write: true,
      requireConfirmationForWrite: true,
    },
    lastSyncedAt: null,
    lastError: null,
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    category: 'google_workspace',
    description: 'Check upcoming schedules, plan study or preparation blocks, and create calendar events.',
    iconName: 'Calendar',
    connected: false,
    connectionStatus: 'disconnected',
    authType: 'oauth2_client_token',
    scopes: ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar.events'],
    capabilities: ['List upcoming events', 'Check availability', 'Create event (Confirmation required)'],
    permissions: {
      read: true,
      write: true,
      requireConfirmationForWrite: true,
    },
    lastSyncedAt: null,
    lastError: null,
  },
];

function loadStore(): PersonalAIChatStoreData {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
        integrations:
          Array.isArray(parsed.integrations) && parsed.integrations.length > 0
            ? parsed.integrations
            : DEFAULT_INTEGRATIONS,
        executionLogs: Array.isArray(parsed.executionLogs) ? parsed.executionLogs : [],
        pendingConfirmations: Array.isArray(parsed.pendingConfirmations) ? parsed.pendingConfirmations : [],
        usageStats: parsed.usageStats || {
          totalMessages: 0,
          totalVisionAnalyses: 0,
          totalToolCalls: 0,
          openaiCalls: 0,
          geminiCalls: 0,
          estimatedTokens: 0,
          lastActiveAt: null,
        },
      };
    }
  } catch {
    // Initialize fresh store if file does not exist or is unreadable
  }

  const initialConversation: PersonalAIConversation = {
    id: 'conv-welcome-1',
    title: 'Welcome to Personal AI Assistant',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    preferredProvider: 'auto',
    messages: [
      {
        id: 'msg-welcome-1',
        role: 'assistant',
        content: `Hello! I am your **Personal AI Assistant** — a general-purpose, multimodal intelligence workspace.\n\nঅভিনন্দন! আপনি বাংলা এবং ইংরেজি — উভয় ভাষাতেই আমার সাথে স্বাভাবিকভাবে কথা বলতে পারেন।\n\nHere is what we can do together:\n- **General Questions, Research & Brainstorming**: Coding, mathematics, hospitality & mixology science, business strategy, and daily productivity.\n- **Natural Bengali & English**: Write in Bengali (\`বাংলা\`), English, or a mix of both — I will respond naturally and translate whenever needed.\n- **Real Vision & Image Analysis**: Upload photos, handwritten notes, documents, screenshots, or food/drink images for instant OCR and visual breakdown.\n- **Connected Workspace Tools**: Connect **Google Sheets**, **Google Docs**, **Google Drive**, **Gmail**, or custom APIs to read, search (e.g., find *"Mango"* in a sheet), summarize, or update records with full confirmation control.\n\nHow can I help you today? আজ আপনাকে কীভাবে সাহায্য করতে পারি?`,
        createdAt: new Date().toISOString(),
        providerUsed: 'gemini',
        modelUsed: 'gemini-3.8-flash',
      },
    ],
  };

  const initial: PersonalAIChatStoreData = {
    conversations: [initialConversation],
    integrations: DEFAULT_INTEGRATIONS,
    executionLogs: [],
    pendingConfirmations: [],
    usageStats: {
      totalMessages: 1,
      totalVisionAnalyses: 0,
      totalToolCalls: 0,
      openaiCalls: 0,
      geminiCalls: 1,
      estimatedTokens: 180,
      lastActiveAt: new Date().toISOString(),
    },
  };
  saveStore(initial);
  return initial;
}

function saveStore(data: PersonalAIChatStoreData): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // Ignore transient disk write issues
  }
}

let chatStore = loadStore();

function appendExecutionLog(entry: Omit<ToolExecutionLogEntry, 'id' | 'createdAt'>) {
  const newEntry: ToolExecutionLogEntry = {
    ...entry,
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  chatStore.executionLogs.unshift(newEntry);
  if (chatStore.executionLogs.length > 100) {
    chatStore.executionLogs = chatStore.executionLogs.slice(0, 100);
  }
  saveStore(chatStore);
  return newEntry;
}

// ============================================================================
// AI PROVIDER HEALTH & MULTIMODAL GENERATION (OPENAI PRIMARY + GEMINI)
// ============================================================================

let openAICreditsExhausted = false;

export function getAIProvidersStatus() {
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim().length > 5);
  const hasOpenAI = hasOpenAIKey && !openAICreditsExhausted;
  const hasGemini = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 5);

  return {
    openai: {
      configured: hasOpenAI,
      status: openAICreditsExhausted
        ? 'quota_exhausted_using_gemini'
        : hasOpenAIKey
        ? 'connected'
        : 'not_configured',
      models: ['gpt-4o', 'gpt-4o-mini'],
      defaultModel: 'gpt-4o',
      supportsVision: true,
      supportsStreaming: true,
    },
    gemini: {
      configured: hasGemini,
      status: hasGemini ? 'connected' : 'not_configured',
      models: ['gemini-3.8-flash'],
      defaultModel: 'gemini-3.8-flash',
      supportsVision: true,
      supportsStreaming: true,
    },
    activePrimaryProvider: hasOpenAI ? 'openai' : hasGemini ? 'gemini' : 'unavailable',
  };
}

const SYSTEM_INSTRUCTION = `You are a highly intelligent, accurate, ChatGPT-style General-Purpose Personal AI Assistant.

CORE CAPABILITIES & RULES:
1. BILINGUAL FLUENCY (BENGALI & ENGLISH):
   - Understand and respond naturally in Bengali (বাংলা), English, or mixed Bengali-English based on how the user writes.
   - Support seamless translation between Bengali and English when requested.
   - Never require manual language switching.

2. GENERAL-PURPOSE VERSATILITY:
   - Help with writing, editing, summarization, translation, brainstorming, coding, technical troubleshooting, math, science, culinary & mixology knowledge, business planning, and daily tasks.
   - Use clean Markdown formatting: headings, bullet points, numbered lists, tables, and fenced code blocks with language tags.

3. REAL IMAGE & DOCUMENT UNDERSTANDING:
   - When the user attaches one or more images, carefully inspect every visual detail:
     * Read and transcribe visible printed or handwritten text (OCR) accurately.
     * Identify objects, products, labels, diagrams, charts, or UI screenshots.
     * For food or beverage photos, identify the dish or drink, glassware, garnish, color, texture, and visible ingredients.
   - Never fabricate text or details that are not visible in the image; if part of an image is blurry or cut off, state clearly what is certain vs. uncertain.

4. CONNECTED WORKSPACE TOOLS & INTEGRATIONS:
   - Never claim you have modified an external Google Sheet, Google Doc, or external tool unless a confirmed tool execution result is explicitly provided in the context.
   - When a user asks to read, search, or analyze data from a connected Google Sheet (provided in the tool context), give exact row numbers, column values, totals, duplicates, or summaries based strictly on the real data.`;

function parseDataUrl(dataUrl: string): { mimeType: string; base64Data: string } | null {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], base64Data: match[2] };
  }
  return null;
}

async function callOpenAIChat(
  messages: PersonalAIChatMessage[],
  toolContextText: string,
  modelName = 'gpt-4o'
): Promise<{ text: string; modelUsed: string; provider: 'openai' }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured on the server.');
  }

  const openAIMessages: any[] = [
    {
      role: 'system',
      content: toolContextText ? `${SYSTEM_INSTRUCTION}\n\n${toolContextText}` : SYSTEM_INSTRUCTION,
    },
  ];

  // Include last 20 messages for multi-turn conversation memory
  const recentMessages = messages.slice(-20);
  for (const msg of recentMessages) {
    if (msg.role === 'user' && msg.attachments && msg.attachments.length > 0) {
      const contentParts: any[] = [];
      if (msg.content && msg.content.trim()) {
        contentParts.push({ type: 'text', text: msg.content });
      } else {
        contentParts.push({
          type: 'text',
          text: 'Please analyze the attached image(s) in detail and describe or extract all key information.',
        });
      }
      for (const att of msg.attachments) {
        if (att.dataUrl && att.dataUrl.startsWith('data:image/')) {
          contentParts.push({
            type: 'image_url',
            image_url: { url: att.dataUrl, detail: 'high' },
          });
        }
      }
      openAIMessages.push({ role: 'user', content: contentParts });
    } else {
      openAIMessages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content || '',
      });
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName || 'gpt-4o',
        messages: openAIMessages,
        temperature: 0.6,
        max_tokens: 2500,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody?.error?.message || `OpenAI API returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const replyText = data?.choices?.[0]?.message?.content;
    if (!replyText) {
      throw new Error('OpenAI returned an empty response.');
    }

    return {
      text: replyText,
      modelUsed: data?.model || modelName || 'gpt-4o',
      provider: 'openai',
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callGeminiChat(
  messages: PersonalAIChatMessage[],
  toolContextText: string
): Promise<{ text: string; modelUsed: string; provider: 'gemini' }> {
  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  const recentMessages = messages.slice(-20);

  const contents = recentMessages.map((msg) => {
    const parts: any[] = [];
    if (msg.attachments && msg.attachments.length > 0) {
      for (const att of msg.attachments) {
        const parsed = parseDataUrl(att.dataUrl);
        if (parsed) {
          parts.push({
            inlineData: {
              mimeType: parsed.mimeType,
              data: parsed.base64Data,
            },
          });
        }
      }
    }
    parts.push({
      text:
        msg.content?.trim() ||
        (msg.attachments && msg.attachments.length > 0
          ? 'Please analyze the attached image(s) carefully.'
          : '...'),
    });

    return {
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts,
    };
  });

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents,
    config: {
      systemInstruction: toolContextText ? `${SYSTEM_INSTRUCTION}\n\n${toolContextText}` : SYSTEM_INSTRUCTION,
    },
  });

  const replyText = response.text;
  if (!replyText) {
    throw new Error('Gemini returned an empty response.');
  }

  return {
    text: replyText,
    modelUsed: 'gemini-4-hydrogen',
    provider: 'gemini',
  };
}

export async function generateMultimodalChatCompletion(
  messages: PersonalAIChatMessage[],
  preferredProvider: 'auto' | 'openai' | 'gemini' = 'auto',
  preferredModel?: string,
  toolContextText = ''
): Promise<{ text: string; modelUsed: string; provider: 'openai' | 'gemini' }> {
  const status = getAIProvidersStatus();

  // Attempt OpenAI only if credits are not exhausted and key is configured
  if (
    !openAICreditsExhausted &&
    (preferredProvider === 'openai' || (preferredProvider === 'auto' && status.openai.configured))
  ) {
    try {
      const res = await callOpenAIChat(
        messages,
        toolContextText,
        preferredModel && preferredModel.startsWith('gpt-') ? preferredModel : 'gpt-4o'
      );
      chatStore.usageStats.openaiCalls += 1;
      return res;
    } catch (openAiErr: any) {
      const msg = String(openAiErr?.message || '').toLowerCase();
      if (
        msg.includes('credits') ||
        msg.includes('quota') ||
        msg.includes('billing') ||
        msg.includes('429') ||
        msg.includes('insufficient_quota')
      ) {
        openAICreditsExhausted = true;
      }
      if (!status.gemini.configured) {
        throw openAiErr;
      }
      // Seamlessly fall back to Gemini without writing to stderr
    }
  }

  // Use Gemini (gemini-3.8-flash)
  if (status.gemini.configured) {
    const res = await callGeminiChat(messages, toolContextText);
    chatStore.usageStats.geminiCalls += 1;
    return res;
  }

  throw new Error(
    'No AI provider is currently reachable. Please verify GEMINI_API_KEY on the server.'
  );
}

// ============================================================================
// GOOGLE SHEETS & WORKSPACE TOOL EXECUTION HELPERS
// ============================================================================

export async function executeGoogleSheetsReadAction(params: {
  accessToken: string;
  spreadsheetId: string;
  action: 'read_all' | 'search_records' | 'summarize' | 'find_duplicates' | 'calculate_totals';
  query?: string;
  sheetName?: string;
}) {
  const { accessToken, spreadsheetId, action, query, sheetName } = params;
  if (!accessToken) {
    throw new Error('Google OAuth access token is required to access Google Sheets.');
  }
  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID is required.');
  }

  // Fetch metadata first
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!metaRes.ok) {
    const err = await metaRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Google Sheets API error (${metaRes.status})`);
  }

  const meta = await metaRes.json();
  const title = meta?.properties?.title || 'Spreadsheet';
  const availableSheets: string[] = (meta?.sheets || []).map((s: any) => s?.properties?.title || 'Sheet1');
  const targetTab = sheetName && availableSheets.includes(sheetName) ? sheetName : availableSheets[0] || 'Sheet1';

  const valuesRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`'${targetTab}'!A1:Z500`)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!valuesRes.ok) {
    const err = await valuesRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Failed to read rows from ${targetTab} (${valuesRes.status})`);
  }

  const valuesData = await valuesRes.json();
  const rawRows: string[][] = valuesData.values || [];
  const headers: string[] = rawRows.length > 0 ? rawRows[0].map((h) => String(h || '').trim()) : [];
  const dataRows = rawRows.slice(1).map((row, idx) => ({
    rowNumber: idx + 2,
    values: row,
    record: headers.reduce((acc, h, colIdx) => {
      acc[h || `Column_${colIdx + 1}`] = row[colIdx] ?? '';
      return acc;
    }, {} as Record<string, any>),
  }));

  if (action === 'search_records') {
    const q = (query || '').trim().toLowerCase();
    const matches = dataRows.filter((r) =>
      r.values.some((cell) => String(cell || '').toLowerCase().includes(q))
    );
    return {
      spreadsheetId,
      title,
      sheetName: targetTab,
      headers,
      query: query || '',
      totalRowsScanned: dataRows.length,
      matchCount: matches.length,
      matches: matches.slice(0, 50),
    };
  }

  if (action === 'find_duplicates') {
    const seen = new Map<string, number[]>();
    for (const r of dataRows) {
      const signature = r.values
        .map((v) => String(v || '').trim().toLowerCase())
        .filter(Boolean)
        .join(' | ');
      if (!signature) continue;
      const list = seen.get(signature) || [];
      list.push(r.rowNumber);
      seen.set(signature, list);
    }
    const duplicates = Array.from(seen.entries())
      .filter(([, rows]) => rows.length > 1)
      .map(([signature, rowNumbers]) => ({ signature, rowNumbers, count: rowNumbers.length }));

    return {
      spreadsheetId,
      title,
      sheetName: targetTab,
      headers,
      totalRowsScanned: dataRows.length,
      duplicateGroupsCount: duplicates.length,
      duplicates,
    };
  }

  if (action === 'calculate_totals') {
    const numericTotals: Record<string, { sum: number; count: number; min: number; max: number; average: number }> = {};
    headers.forEach((h, colIdx) => {
      const colName = h || `Column_${colIdx + 1}`;
      const nums: number[] = [];
      for (const r of dataRows) {
        const rawVal = String(r.values[colIdx] ?? '').replace(/[$,€£%\s,]/g, '');
        if (rawVal && !isNaN(Number(rawVal))) {
          nums.push(Number(rawVal));
        }
      }
      if (nums.length > 0) {
        const sum = nums.reduce((a, b) => a + b, 0);
        numericTotals[colName] = {
          sum: Number(sum.toFixed(2)),
          count: nums.length,
          min: Math.min(...nums),
          max: Math.max(...nums),
          average: Number((sum / nums.length).toFixed(2)),
        };
      }
    });

    return {
      spreadsheetId,
      title,
      sheetName: targetTab,
      headers,
      totalRows: dataRows.length,
      numericTotals,
    };
  }

  // Default: read_all or summarize
  return {
    spreadsheetId,
    title,
    sheetName: targetTab,
    availableSheets,
    headers,
    totalRows: dataRows.length,
    sampleRows: dataRows.slice(0, 40),
  };
}

export async function executeGoogleSheetsWriteConfirmed(params: {
  accessToken: string;
  operation: 'create_sheet' | 'append_row' | 'update_row';
  spreadsheetId?: string;
  sheetTitle?: string;
  sheetName?: string;
  rowValues?: any[];
  headers?: string[];
  rowIndex?: number;
}) {
  const { accessToken, operation, spreadsheetId, sheetTitle, sheetName = 'Sheet1', rowValues = [], headers } = params;
  if (!accessToken) {
    throw new Error('Google OAuth access token is required to modify Google Sheets.');
  }

  if (operation === 'create_sheet') {
    const title = sheetTitle?.trim() || `Personal AI Sheet (${new Date().toLocaleDateString('en-GB')})`;
    const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: { title },
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Failed to create spreadsheet (${createRes.status})`);
    }
    const created = await createRes.json();
    const newId = created.spreadsheetId;

    if (Array.isArray(headers) && headers.length > 0) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(newId)}/values/Sheet1!A1?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values: [headers] }),
        }
      );
    }

    return {
      spreadsheetId: newId,
      title,
      url: `https://docs.google.com/spreadsheets/d/${newId}/edit`,
    };
  }

  if (!spreadsheetId) {
    throw new Error('spreadsheetId is required for append_row or update_row.');
  }

  if (operation === 'append_row') {
    const appendRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`'${sheetName}'!A:Z`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [rowValues],
        }),
      }
    );

    if (!appendRes.ok) {
      const err = await appendRes.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Failed to append row (${appendRes.status})`);
    }
    const appendData = await appendRes.json();
    return {
      spreadsheetId,
      updatedRange: appendData?.updates?.updatedRange || `${sheetName}!A:Z`,
      rowValues,
    };
  }

  if (operation === 'update_row') {
    const rowIdx = Number(params.rowIndex) || 2;
    const updateRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`'${sheetName}'!A${rowIdx}:Z${rowIdx}`)}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: [rowValues],
        }),
      }
    );

    if (!updateRes.ok) {
      const err = await updateRes.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Failed to update row ${rowIdx} (${updateRes.status})`);
    }
    const updateData = await updateRes.json();
    return {
      spreadsheetId,
      updatedRange: updateData?.updatedRange || `${sheetName}!A${rowIdx}`,
      rowIndex: rowIdx,
      rowValues,
    };
  }

  throw new Error(`Unsupported sheet write operation: ${operation}`);
}

// ============================================================================
// EXPRESS ROUTES FOR PERSONAL AI CHAT & INTEGRATIONS
// ============================================================================

// 1. Get Overview: Providers, Conversations List, Integrations, Usage Stats
personalAIChatRouter.get('/overview', (_req: Request, res: Response) => {
  chatStore = loadStore();
  return res.json({
    providers: getAIProvidersStatus(),
    conversations: chatStore.conversations.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      pinned: Boolean(c.pinned),
      preferredProvider: c.preferredProvider || 'auto',
      preferredModel: c.preferredModel,
      messageCount: c.messages.length,
      lastMessageSnippet:
        c.messages.length > 0
          ? c.messages[c.messages.length - 1].content.slice(0, 110)
          : 'New conversation',
    })),
    integrations: chatStore.integrations,
    executionLogs: chatStore.executionLogs.slice(0, 40),
    pendingConfirmations: chatStore.pendingConfirmations,
    usageStats: chatStore.usageStats,
  });
});

// 2. Get Single Conversation with Full Messages
personalAIChatRouter.get('/conversations/:id', (req: Request, res: Response) => {
  chatStore = loadStore();
  const conv = chatStore.conversations.find((c) => c.id === req.params.id);
  if (!conv) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }
  return res.json({ conversation: conv });
});

// 3. Create New Conversation
personalAIChatRouter.post('/conversations', (req: Request, res: Response) => {
  chatStore = loadStore();
  const { title, preferredProvider = 'auto', preferredModel } = req.body || {};
  const now = new Date().toISOString();
  const newConv: PersonalAIConversation = {
    id: `conv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: title?.trim() || 'New Chat',
    createdAt: now,
    updatedAt: now,
    preferredProvider,
    preferredModel,
    messages: [],
  };
  chatStore.conversations.unshift(newConv);
  saveStore(chatStore);
  return res.json({ conversation: newConv });
});

// 4. Rename or Update Conversation
personalAIChatRouter.patch('/conversations/:id', (req: Request, res: Response) => {
  chatStore = loadStore();
  const conv = chatStore.conversations.find((c) => c.id === req.params.id);
  if (!conv) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }
  const { title, pinned, preferredProvider, preferredModel } = req.body || {};
  if (typeof title === 'string' && title.trim()) {
    conv.title = title.trim();
  }
  if (typeof pinned === 'boolean') {
    conv.pinned = pinned;
  }
  if (preferredProvider) {
    conv.preferredProvider = preferredProvider;
  }
  if (preferredModel !== undefined) {
    conv.preferredModel = preferredModel;
  }
  conv.updatedAt = new Date().toISOString();
  saveStore(chatStore);
  return res.json({ conversation: conv });
});

// 5. Delete Conversation
personalAIChatRouter.delete('/conversations/:id', (req: Request, res: Response) => {
  chatStore = loadStore();
  const idx = chatStore.conversations.findIndex((c) => c.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Conversation not found.' });
  }
  chatStore.conversations.splice(idx, 1);
  if (chatStore.conversations.length === 0) {
    const now = new Date().toISOString();
    chatStore.conversations.push({
      id: `conv-${Date.now()}`,
      title: 'New Chat',
      createdAt: now,
      updatedAt: now,
      preferredProvider: 'auto',
      messages: [],
    });
  }
  saveStore(chatStore);
  return res.json({ success: true, conversations: chatStore.conversations });
});

// 6. Send Message / Edit Previous Message / Regenerate Response (Standard + Streaming SSE)
personalAIChatRouter.post('/chat', async (req: Request, res: Response) => {
  chatStore = loadStore();
  try {
    const {
      conversationId,
      content = '',
      attachments = [],
      editMessageId,
      regenerateFromMessageId,
      preferredProvider = 'auto',
      preferredModel,
      toolContext,
      stream = false,
    } = req.body || {};

    let conv = chatStore.conversations.find((c) => c.id === conversationId);
    const now = new Date().toISOString();

    if (!conv) {
      conv = {
        id: conversationId || `conv-${Date.now()}`,
        title: (content || 'Image Analysis').slice(0, 48) || 'New Chat',
        createdAt: now,
        updatedAt: now,
        preferredProvider,
        preferredModel,
        messages: [],
      };
      chatStore.conversations.unshift(conv);
    }

    // Handle Edit Previous Message: truncate everything after the edited user message
    if (editMessageId) {
      const editIdx = conv.messages.findIndex((m) => m.id === editMessageId);
      if (editIdx !== -1) {
        conv.messages = conv.messages.slice(0, editIdx);
      }
    }

    // Handle Regenerate Response: remove the last assistant message (or from specific message ID)
    if (regenerateFromMessageId) {
      const regenIdx = conv.messages.findIndex((m) => m.id === regenerateFromMessageId);
      if (regenIdx !== -1) {
        if (conv.messages[regenIdx].role === 'assistant') {
          conv.messages = conv.messages.slice(0, regenIdx);
        } else {
          conv.messages = conv.messages.slice(0, regenIdx + 1);
        }
      }
    } else {
      // Append the new user message
      const userMsg: PersonalAIChatMessage = {
        id: editMessageId || `msg-user-${Date.now()}`,
        role: 'user',
        content: String(content || ''),
        createdAt: now,
        edited: Boolean(editMessageId),
        attachments: Array.isArray(attachments) ? attachments : [],
      };
      conv.messages.push(userMsg);

      // Auto-title conversation on first user message
      if (conv.messages.filter((m) => m.role === 'user').length === 1 && (conv.title === 'New Chat' || !conv.title)) {
        const rawTitle = String(content || '').trim();
        conv.title = rawTitle
          ? rawTitle.slice(0, 52) + (rawTitle.length > 52 ? '...' : '')
          : attachments?.length > 0
          ? 'Visual Image Analysis'
          : 'New Chat';
      }
    }

    if (Array.isArray(attachments) && attachments.length > 0) {
      chatStore.usageStats.totalVisionAnalyses += attachments.length;
    }

    const formattedToolContext = toolContext
      ? `LIVE CONNECTED WORKSPACE TOOL DATA (Verified Real Data):\n${
          typeof toolContext === 'string' ? toolContext : JSON.stringify(toolContext, null, 2)
        }`
      : '';

    const completion = await generateMultimodalChatCompletion(
      conv.messages,
      preferredProvider || conv.preferredProvider || 'auto',
      preferredModel || conv.preferredModel,
      formattedToolContext
    );

    const assistantMsg: PersonalAIChatMessage = {
      id: `msg-ai-${Date.now()}`,
      role: 'assistant',
      content: completion.text,
      createdAt: new Date().toISOString(),
      providerUsed: completion.provider,
      modelUsed: completion.modelUsed,
      tokenEstimate: Math.ceil((completion.text.length + String(content).length) / 4),
    };

    conv.messages.push(assistantMsg);
    conv.updatedAt = new Date().toISOString();
    chatStore.usageStats.totalMessages += 2;
    chatStore.usageStats.estimatedTokens += assistantMsg.tokenEstimate || 0;
    chatStore.usageStats.lastActiveAt = conv.updatedAt;

    // Move active conversation to top
    chatStore.conversations = [
      conv,
      ...chatStore.conversations.filter((c) => c.id !== conv!.id),
    ];
    saveStore(chatStore);

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const words = completion.text.split(/(?=[ \n])/);
      const chunkSize = Math.max(2, Math.ceil(words.length / 35));
      for (let i = 0; i < words.length; i += chunkSize) {
        const delta = words.slice(i, i + chunkSize).join('');
        res.write(`data: ${JSON.stringify({ type: 'delta', delta })}\n\n`);
      }
      res.write(
        `data: ${JSON.stringify({
          type: 'done',
          message: assistantMsg,
          conversation: {
            id: conv.id,
            title: conv.title,
            updatedAt: conv.updatedAt,
          },
        })}\n\n`
      );
      return res.end();
    }

    return res.json({
      conversation: conv,
      assistantMessage: assistantMsg,
      providers: getAIProvidersStatus(),
    });
  } catch (err: any) {
    return res.status(500).json({
      error: err?.message || 'Failed to generate AI response.',
    });
  }
});

// ============================================================================
// EXTENSIBLE WORKSPACE TOOL INTEGRATIONS ROUTES
// ============================================================================

// Connect / Disconnect / Update Tool Integration
personalAIChatRouter.post('/integrations/:id/status', (req: Request, res: Response) => {
  chatStore = loadStore();
  const toolId = req.params.id;
  const {
    connected,
    connectedAccount,
    connectedResourceName,
    connectedResourceId,
    customEndpointUrl,
    permissions,
  } = req.body || {};

  let tool = chatStore.integrations.find((t) => t.id === toolId);
  if (!tool) {
    return res.status(404).json({ error: `Integration '${toolId}' not found.` });
  }

  if (typeof connected === 'boolean') {
    tool.connected = connected;
    tool.connectionStatus = connected ? 'connected' : 'disconnected';
    tool.lastSyncedAt = connected ? new Date().toISOString() : tool.lastSyncedAt;
    if (!connected) {
      tool.connectedResourceId = undefined;
      tool.connectedResourceName = undefined;
    }
  }
  if (connectedAccount !== undefined) tool.connectedAccount = connectedAccount;
  if (connectedResourceName !== undefined) tool.connectedResourceName = connectedResourceName;
  if (connectedResourceId !== undefined) tool.connectedResourceId = connectedResourceId;
  if (customEndpointUrl !== undefined) tool.customEndpointUrl = customEndpointUrl;
  if (permissions && typeof permissions === 'object') {
    tool.permissions = { ...tool.permissions, ...permissions };
  }

  saveStore(chatStore);

  appendExecutionLog({
    toolId: tool.id,
    toolName: tool.name,
    action: tool.connected ? 'Connected Integration' : 'Disconnected Integration',
    status: 'success',
    summary: tool.connected
      ? `Connected ${tool.name}${tool.connectedResourceName ? ` (${tool.connectedResourceName})` : ''}`
      : `Disconnected ${tool.name} and revoked active session link.`,
  });

  return res.json({ integration: tool, integrations: chatStore.integrations });
});

// Register a New Custom API / Webhook / Database Tool Integration
personalAIChatRouter.post('/integrations/custom', (req: Request, res: Response) => {
  chatStore = loadStore();
  const { name, category = 'custom_api', description, customEndpointUrl, capabilities = [] } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Tool name is required.' });
  }

  const newTool: WorkspaceToolIntegration = {
    id: `custom-${Date.now()}`,
    name: name.trim(),
    category,
    description: description?.trim() || 'Custom connected API or data source.',
    iconName: 'Globe',
    connected: true,
    connectionStatus: 'connected',
    authType: 'webhook',
    scopes: ['custom:read', 'custom:write'],
    capabilities:
      Array.isArray(capabilities) && capabilities.length > 0
        ? capabilities
        : ['Query endpoint', 'Send structured payload (Confirmation required)'],
    permissions: {
      read: true,
      write: true,
      requireConfirmationForWrite: true,
    },
    customEndpointUrl: customEndpointUrl?.trim() || '',
    lastSyncedAt: new Date().toISOString(),
    lastError: null,
  };

  chatStore.integrations.push(newTool);
  saveStore(chatStore);

  appendExecutionLog({
    toolId: newTool.id,
    toolName: newTool.name,
    action: 'Registered Custom Tool',
    status: 'success',
    summary: `Added custom tool integration "${newTool.name}".`,
  });

  return res.json({ integration: newTool, integrations: chatStore.integrations });
});

// Execute Google Sheets Read / Search / Analysis Action (Non-destructive)
personalAIChatRouter.post('/tools/google-sheets/read', async (req: Request, res: Response) => {
  chatStore = loadStore();
  try {
    const { accessToken, spreadsheetId, action = 'read_all', query, sheetName } = req.body || {};
    const result = await executeGoogleSheetsReadAction({
      accessToken,
      spreadsheetId,
      action,
      query,
      sheetName,
    });

    chatStore.usageStats.totalToolCalls += 1;
    appendExecutionLog({
      toolId: 'google-sheets',
      toolName: 'Google Sheets',
      action: `Sheets ${action}`,
      status: 'success',
      summary:
        action === 'search_records'
          ? `Searched "${query}" in "${result.title}" (${result.matchCount} match(es) found).`
          : `Executed ${action} on "${result.title}" (${result.sheetName}).`,
    });

    return res.json({ success: true, action, result });
  } catch (err: any) {
    appendExecutionLog({
      toolId: 'google-sheets',
      toolName: 'Google Sheets',
      action: 'Sheets Read Error',
      status: 'error',
      summary: err?.message || 'Failed to read Google Sheet.',
    });
    return res.status(400).json({ error: err?.message || 'Google Sheets read operation failed.' });
  }
});

// Stage or Execute Mutating Tool Operation (Enforces Explicit User Confirmation)
personalAIChatRouter.post('/tools/google-sheets/write', async (req: Request, res: Response) => {
  chatStore = loadStore();
  try {
    const {
      accessToken,
      operation,
      spreadsheetId,
      sheetTitle,
      sheetName,
      rowValues,
      headers,
      rowIndex,
      userConfirmed = false,
    } = req.body || {};

    if (!userConfirmed) {
      // Return a staged confirmation request — never modify external data without confirmation
      const pending: ChatToolExecutionRecord = {
        id: `confirm-${Date.now()}`,
        toolId: 'google-sheets',
        toolName: 'Google Sheets',
        operation,
        status: 'pending_confirmation',
        requiresConfirmation: true,
        parameters: {
          operation,
          spreadsheetId,
          sheetTitle,
          sheetName,
          rowValues,
          headers,
          rowIndex,
        },
        timestamp: new Date().toISOString(),
      };
      chatStore.pendingConfirmations.unshift(pending);
      saveStore(chatStore);

      appendExecutionLog({
        toolId: 'google-sheets',
        toolName: 'Google Sheets',
        action: `Awaiting Confirmation: ${operation}`,
        status: 'awaiting_confirmation',
        summary: `Staged ${operation} for user approval before modifying Google Sheets.`,
      });

      return res.json({
        requiresConfirmation: true,
        pendingConfirmation: pending,
        message: 'User confirmation is required before modifying Google Sheets.',
      });
    }

    const result = await executeGoogleSheetsWriteConfirmed({
      accessToken,
      operation,
      spreadsheetId,
      sheetTitle,
      sheetName,
      rowValues,
      headers,
      rowIndex,
    });

    chatStore.usageStats.totalToolCalls += 1;
    appendExecutionLog({
      toolId: 'google-sheets',
      toolName: 'Google Sheets',
      action: `Confirmed Write: ${operation}`,
      status: 'success',
      summary:
        operation === 'create_sheet'
          ? `Created new Google Sheet "${result.title}".`
          : `Completed ${operation} in range ${result.updatedRange}.`,
      details: result,
    });

    return res.json({
      success: true,
      confirmed: true,
      operation,
      result,
    });
  } catch (err: any) {
    appendExecutionLog({
      toolId: 'google-sheets',
      toolName: 'Google Sheets',
      action: `Write Failed: ${req.body?.operation || 'unknown'}`,
      status: 'error',
      summary: err?.message || 'Google Sheets write operation failed.',
    });
    return res.status(400).json({ error: err?.message || 'Google Sheets write failed.' });
  }
});
