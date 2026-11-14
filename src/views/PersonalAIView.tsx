import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Bot,
  Plus,
  Search,
  MessageSquare,
  Edit3,
  Trash2,
  Copy,
  Check,
  RotateCcw,
  Square,
  Send,
  Image as ImageIcon,
  Camera,
  X,
  Sparkles,
  Plug,
  FileSpreadsheet,
  FileText,
  HardDrive,
  Mail,
  Calendar,
  Globe,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronRight,
  ChevronLeft,
  Sliders,
  Terminal,
  RefreshCw,
  Languages,
  Eye,
  ExternalLink,
  Lock,
  Unlock,
  PlusCircle,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { CCDLogo } from '../components/CCDLogo';
import {
  getValidSheetsToken,
  listUserSpreadsheets,
  GoogleSpreadsheetItem,
} from '../services/sheetsService';

interface PersonalAIViewProps {
  onOpenCVLibrary?: () => void;
  onOpenGmailCenter?: () => void;
  onOpenExistingInterviewCenter?: () => void;
}

interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  sizeBytes?: number;
}

interface PersonalAIChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  edited?: boolean;
  providerUsed?: 'openai' | 'gemini' | 'fallback';
  modelUsed?: string;
  attachments?: ChatAttachment[];
}

interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
  preferredProvider?: 'auto' | 'openai' | 'gemini';
  preferredModel?: string;
  messageCount?: number;
  lastMessageSnippet?: string;
}

interface WorkspaceToolIntegration {
  id: string;
  name: string;
  category: string;
  description: string;
  iconName: string;
  connected: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'needs_reauth' | 'error';
  authType: string;
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
}

interface StagedWriteConfirmation {
  toolId: string;
  toolName: string;
  operation: 'create_sheet' | 'append_row' | 'update_row';
  description: string;
  spreadsheetId?: string;
  sheetTitle?: string;
  sheetName?: string;
  rowValues?: string[];
  headers?: string[];
  rowIndex?: number;
}

// ============================================================================
// RICH MARKDOWN & CODE BLOCK RENDERER WITH ONE-CLICK COPY
// ============================================================================

const MarkdownMessageRenderer: React.FC<{ content: string; isDark: boolean }> = ({ content, isDark }) => {
  const [copiedBlockIndex, setCopiedBlockIndex] = useState<number | null>(null);

  const handleCopyCode = (codeText: string, idx: number) => {
    navigator.clipboard.writeText(codeText);
    setCopiedBlockIndex(idx);
    setTimeout(() => setCopiedBlockIndex(null), 2000);
  };

  // Split by fenced code blocks ```lang ... ```
  const segments = useMemo(() => {
    const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    const parts: Array<{ type: 'text' | 'code'; lang?: string; value: string }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
      }
      parts.push({
        type: 'code',
        lang: match[1] || 'code',
        value: match[2].replace(/\n$/, ''),
      });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < content.length) {
      parts.push({ type: 'text', value: content.slice(lastIndex) });
    }
    return parts;
  }, [content]);

  const renderInlineFormatting = (line: string) => {
    const tokens = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return tokens.map((tok, i) => {
      if (tok.startsWith('**') && tok.endsWith('**')) {
        return (
          <strong key={i} className="font-bold text-slate-900 dark:text-white">
            {tok.slice(2, -2)}
          </strong>
        );
      }
      if (tok.startsWith('`') && tok.endsWith('`')) {
        return (
          <code
            key={i}
            className="px-1.5 py-0.5 rounded-md font-mono text-xs bg-slate-200/80 dark:bg-slate-800 text-blue-700 dark:text-blue-300"
          >
            {tok.slice(1, -1)}
          </code>
        );
      }
      return <React.Fragment key={i}>{tok}</React.Fragment>;
    });
  };

  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {segments.map((seg, idx) => {
        if (seg.type === 'code') {
          return (
            <div
              key={idx}
              className="rounded-xl overflow-hidden border border-slate-700/80 bg-[#0d1117] text-slate-100 my-2.5 shadow-sm"
            >
              <div className="flex items-center justify-between px-3.5 py-2 bg-[#161b22] border-b border-slate-800 text-xs font-mono text-slate-400">
                <span className="uppercase tracking-wider font-semibold">{seg.lang || 'code'}</span>
                <button
                  type="button"
                  onClick={() => handleCopyCode(seg.value, idx)}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 transition text-[11px]"
                >
                  {copiedBlockIndex === idx ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy code</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3.5 overflow-x-auto text-xs font-mono leading-relaxed">
                <code>{seg.value}</code>
              </pre>
            </div>
          );
        }

        const lines = seg.value.split('\n');
        return (
          <div key={idx} className="space-y-1.5">
            {lines.map((line, lIdx) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={lIdx} className="h-1.5" />;
              if (trimmed.startsWith('### ')) {
                return (
                  <h4
                    key={lIdx}
                    className={`text-sm font-bold pt-2 ${isDark ? 'text-white' : 'text-slate-900'}`}
                  >
                    {renderInlineFormatting(trimmed.slice(4))}
                  </h4>
                );
              }
              if (trimmed.startsWith('## ')) {
                return (
                  <h3
                    key={lIdx}
                    className={`text-base font-bold pt-2.5 ${isDark ? 'text-white' : 'text-slate-900'}`}
                  >
                    {renderInlineFormatting(trimmed.slice(3))}
                  </h3>
                );
              }
              if (trimmed.startsWith('# ')) {
                return (
                  <h2
                    key={lIdx}
                    className={`text-lg font-extrabold pt-3 ${isDark ? 'text-white' : 'text-slate-900'}`}
                  >
                    {renderInlineFormatting(trimmed.slice(2))}
                  </h2>
                );
              }
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                return (
                  <div key={lIdx} className="flex items-start gap-2 pl-2">
                    <span className="text-blue-500 font-bold mt-0.5">•</span>
                    <span className="flex-1">{renderInlineFormatting(trimmed.slice(2))}</span>
                  </div>
                );
              }
              if (/^\d+\.\s/.test(trimmed)) {
                const dotIdx = trimmed.indexOf('.');
                return (
                  <div key={lIdx} className="flex items-start gap-2 pl-2">
                    <span className="text-blue-500 font-bold font-mono text-xs mt-0.5">
                      {trimmed.slice(0, dotIdx + 1)}
                    </span>
                    <span className="flex-1">{renderInlineFormatting(trimmed.slice(dotIdx + 1).trim())}</span>
                  </div>
                );
              }
              return <p key={lIdx}>{renderInlineFormatting(line)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
};

// ============================================================================
// MAIN UPGRADED PERSONAL AI VIEW (CHATGPT-STYLE + MULTIMODAL VISION + TOOLS)
// ============================================================================

export const PersonalAIView: React.FC<PersonalAIViewProps> = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Workspace view mode: 'chat' | 'integrations'
  const [activeTab, setActiveTab] = useState<'chat' | 'integrations'>('chat');
  const [isHistorySidebarOpen, setIsHistorySidebarOpen] = useState<boolean>(true);

  // Conversations & Active Chat
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>('');
  const [messages, setMessages] = useState<PersonalAIChatMessage[]>([]);
  const [searchHistoryQuery, setSearchHistoryQuery] = useState<string>('');
  const [renamingConvId, setRenamingConvId] = useState<string | null>(null);
  const [renameTitleInput, setRenameTitleInput] = useState<string>('');

  // Composer & Multimodal Attachments
  const [promptInput, setPromptInput] = useState<string>('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // Edit Previous Message state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState<string>('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  // AI Provider & Model Selector
  const [preferredProvider, setPreferredProvider] = useState<'auto' | 'openai' | 'gemini'>('auto');
  const [preferredModel, setPreferredModel] = useState<string>('gpt-4o');
  const [providersStatus, setProvidersStatus] = useState<any>(null);
  const [usageStats, setUsageStats] = useState<any>(null);

  // Camera Capture Modal (WebRTC + fallback input)
  const [isCameraModalOpen, setIsCameraModalOpen] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Extensible Workspace Tool Integrations & Google Sheets Live Connector
  const [integrations, setIntegrations] = useState<WorkspaceToolIntegration[]>([]);
  const [executionLogs, setExecutionLogs] = useState<any[]>([]);
  const [userSpreadsheets, setUserSpreadsheets] = useState<GoogleSpreadsheetItem[]>([]);
  const [selectedSpreadsheetId, setSelectedSpreadsheetId] = useState<string>(
    () => localStorage.getItem('personal_ai_sheet_id') || ''
  );
  const [selectedSpreadsheetName, setSelectedSpreadsheetName] = useState<string>(
    () => localStorage.getItem('personal_ai_sheet_name') || ''
  );
  const [sheetSearchTerm, setSheetSearchTerm] = useState<string>('Mango');
  const [sheetBusy, setSheetBusy] = useState<boolean>(false);
  const [activeSheetContext, setActiveSheetContext] = useState<any>(null);

  // Mandatory Confirmation Gate Modal for Mutating Tool Actions
  const [stagedConfirmation, setStagedConfirmation] = useState<StagedWriteConfirmation | null>(null);
  const [newRowCompanyOrItem, setNewRowCompanyOrItem] = useState<string>('');
  const [newRowCategoryOrRole, setNewRowCategoryOrRole] = useState<string>('');
  const [newRowQuantityOrNotes, setNewRowQuantityOrNotes] = useState<string>('');
  const [newSheetTitleInput, setNewSheetTitleInput] = useState<string>('');

  // Custom API / Tool Registration Form
  const [customToolName, setCustomToolName] = useState<string>('');
  const [customToolDesc, setCustomToolDesc] = useState<string>('');
  const [customToolEndpoint, setCustomToolEndpoint] = useState<string>('');

  // Banner Feedback
  const [banner, setBanner] = useState<{ type: 'success' | 'info' | 'warning' | 'error'; text: string } | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Load Personal AI overview and active conversation
  const loadOverview = useCallback(async (selectConvId?: string) => {
    try {
      const res = await fetch('/api/personal-ai/overview');
      if (!res.ok) throw new Error('Failed to load Personal AI overview');
      const data = await res.json();
      setProvidersStatus(data.providers);
      setConversations(data.conversations || []);
      setIntegrations(data.integrations || []);
      setExecutionLogs(data.executionLogs || []);
      setUsageStats(data.usageStats || null);

      const targetId = selectConvId || activeConversationId || data.conversations?.[0]?.id;
      if (targetId) {
        const convRes = await fetch(`/api/personal-ai/conversations/${targetId}`);
        if (convRes.ok) {
          const convData = await convRes.json();
          setActiveConversationId(convData.conversation.id);
          setMessages(convData.conversation.messages || []);
        }
      }
    } catch (err: any) {
      setBanner({ type: 'warning', text: err?.message || 'Could not load Personal AI overview.' });
    }
  }, [activeConversationId]);

  useEffect(() => {
    void loadOverview();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, streamingContent]);

  // Select a conversation from sidebar
  const handleSelectConversation = async (convId: string) => {
    try {
      const res = await fetch(`/api/personal-ai/conversations/${convId}`);
      if (res.ok) {
        const data = await res.json();
        setActiveConversationId(data.conversation.id);
        setMessages(data.conversation.messages || []);
        setEditingMessageId(null);
      }
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Could not open conversation.' });
    }
  };

  // Start a New Chat
  const handleNewChat = async () => {
    try {
      const res = await fetch('/api/personal-ai/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'New Chat',
          preferredProvider,
          preferredModel,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveConversationId(data.conversation.id);
        setMessages([]);
        setPromptInput('');
        setAttachments([]);
        await loadOverview(data.conversation.id);
      }
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Could not create new chat.' });
    }
  };

  // Rename Conversation
  const handleSaveRename = async (convId: string) => {
    if (!renameTitleInput.trim()) {
      setRenamingConvId(null);
      return;
    }
    try {
      await fetch(`/api/personal-ai/conversations/${convId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: renameTitleInput.trim() }),
      });
      setRenamingConvId(null);
      await loadOverview(activeConversationId);
    } catch (err: any) {
      setBanner({ type: 'error', text: 'Failed to rename conversation.' });
    }
  };

  // Delete Conversation
  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/personal-ai/conversations/${convId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const data = await res.json();
        const nextId = data.conversations?.[0]?.id || '';
        setActiveConversationId(nextId);
        await loadOverview(nextId);
      }
    } catch {
      setBanner({ type: 'error', text: 'Failed to delete conversation.' });
    }
  };

  // File / Gallery Image Upload Handler (Multiple Images)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setAttachments((prev) => [
            ...prev,
            {
              id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: file.name,
              mimeType: file.type || 'image/jpeg',
              dataUrl: reader.result as string,
              sizeBytes: file.size,
            },
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  // Live Camera Capture Modal (WebRTC)
  const handleOpenCameraModal = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      mediaStreamRef.current = stream;
      setIsCameraModalOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 150);
    } catch {
      // Fallback to native camera file input if camera permission denied or unavailable in iframe
      cameraInputRef.current?.click();
    }
  };

  const handleCloseCameraModal = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setIsCameraModalOpen(false);
  };

  const handleCaptureCameraFrame = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setAttachments((prev) => [
        ...prev,
        {
          id: `cam-${Date.now()}`,
          name: `camera-capture-${new Date().toLocaleTimeString()}.jpg`,
          mimeType: 'image/jpeg',
          dataUrl,
        },
      ]);
    }
    handleCloseCameraModal();
  };

  // Stop Generating (AbortController)
  const handleStopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    if (streamingContent) {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-stopped-${Date.now()}`,
          role: 'assistant',
          content: `${streamingContent}\n\n*(Generation stopped by user)*`,
          createdAt: new Date().toISOString(),
        },
      ]);
      setStreamingContent('');
    }
  };

  // Send Message / Edit Previous Message / Regenerate with Streaming SSE
  const handleSendChat = async (options?: {
    overrideContent?: string;
    editMessageId?: string;
    regenerateFromMessageId?: string;
    customToolContext?: any;
  }) => {
    const textToSend =
      options?.overrideContent !== undefined ? options.overrideContent : promptInput.trim();
    const currentAttachments = options?.editMessageId || options?.regenerateFromMessageId ? [] : attachments;

    if (!textToSend && currentAttachments.length === 0 && !options?.regenerateFromMessageId) {
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsGenerating(true);
    setStreamingContent('');

    // Optimistic UI update
    if (!options?.regenerateFromMessageId) {
      const optimisticUserMsg: PersonalAIChatMessage = {
        id: options?.editMessageId || `temp-user-${Date.now()}`,
        role: 'user',
        content: textToSend,
        createdAt: new Date().toISOString(),
        edited: Boolean(options?.editMessageId),
        attachments: currentAttachments,
      };

      if (options?.editMessageId) {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === options.editMessageId);
          return idx !== -1 ? [...prev.slice(0, idx), optimisticUserMsg] : [...prev, optimisticUserMsg];
        });
        setEditingMessageId(null);
      } else {
        setMessages((prev) => [...prev, optimisticUserMsg]);
        setPromptInput('');
        setAttachments([]);
      }
    }

    try {
      const response = await fetch('/api/personal-ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: activeConversationId,
          content: textToSend,
          attachments: currentAttachments,
          editMessageId: options?.editMessageId,
          regenerateFromMessageId: options?.regenerateFromMessageId,
          preferredProvider,
          preferredModel,
          toolContext: options?.customToolContext || activeSheetContext,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error || `AI request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const ev of events) {
          const line = ev.trim();
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.replace(/^data:\s*/, '');
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.type === 'delta' && parsed.delta) {
              accumulated += parsed.delta;
              setStreamingContent(accumulated);
            } else if (parsed.type === 'done') {
              setStreamingContent('');
              if (parsed.conversation?.id) {
                await loadOverview(parsed.conversation.id);
              }
            }
          } catch {
            // ignore partial JSON chunk
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setBanner({
          type: 'error',
          text: err?.message || 'An error occurred while communicating with the AI backend.',
        });
      }
    } finally {
      setIsGenerating(false);
      setStreamingContent('');
      abortControllerRef.current = null;
    }
  };

  // ============================================================================
  // WORKSPACE TOOL INTEGRATIONS & GOOGLE SHEETS ACTIONS
  // ============================================================================

  const handleConnectGoogleSheets = async () => {
    setSheetBusy(true);
    try {
      await getValidSheetsToken();
      const files = await listUserSpreadsheets();
      setUserSpreadsheets(files);

      const chosen = files[0];
      if (chosen && !selectedSpreadsheetId) {
        setSelectedSpreadsheetId(chosen.id);
        setSelectedSpreadsheetName(chosen.name);
        localStorage.setItem('personal_ai_sheet_id', chosen.id);
        localStorage.setItem('personal_ai_sheet_name', chosen.name);
      }

      await fetch('/api/personal-ai/integrations/google-sheets/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connected: true,
          connectedResourceName: chosen?.name || 'Google Drive Spreadsheets',
          connectedResourceId: chosen?.id || '',
        }),
      });

      setBanner({
        type: 'success',
        text: `Connected to Google Sheets (${files.length} spreadsheet(s) available).`,
      });
      await loadOverview(activeConversationId);
    } catch (err: any) {
      setBanner({
        type: 'error',
        text: err?.message || 'Google Sheets authentication failed.',
      });
    } finally {
      setSheetBusy(false);
    }
  };

  const handleToggleIntegrationConnection = async (tool: WorkspaceToolIntegration) => {
    if (tool.id === 'google-sheets' && !tool.connected) {
      await handleConnectGoogleSheets();
      return;
    }

    try {
      const nextState = !tool.connected;
      if (nextState && tool.category === 'google_workspace') {
        await getValidSheetsToken();
      }
      await fetch(`/api/personal-ai/integrations/${tool.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connected: nextState }),
      });
      setBanner({
        type: 'info',
        text: nextState ? `Connected ${tool.name}.` : `Disconnected ${tool.name} and revoked active session access.`,
      });
      await loadOverview(activeConversationId);
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || `Could not toggle ${tool.name}.` });
    }
  };

  const handleExecuteSheetsRead = async (
    action: 'read_all' | 'search_records' | 'summarize' | 'find_duplicates' | 'calculate_totals'
  ) => {
    if (!selectedSpreadsheetId.trim()) {
      setBanner({ type: 'warning', text: 'Please connect or select a Google Sheet first.' });
      return;
    }
    setSheetBusy(true);
    try {
      const token = await getValidSheetsToken();
      const res = await fetch('/api/personal-ai/tools/google-sheets/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: token,
          spreadsheetId: selectedSpreadsheetId.trim(),
          action,
          query: sheetSearchTerm,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to read Google Sheet.');

      setActiveSheetContext(data.result);
      setActiveTab('chat');

      const promptMap: Record<typeof action, string> = {
        read_all: `Read and summarize the structure and records of my connected Google Sheet "${data.result.title}".`,
        search_records: `Find all records matching "${sheetSearchTerm}" in my connected Google Sheet "${data.result.title}" and show the exact matching rows and details.`,
        summarize: `Provide an executive summary and key insights for my Google Sheet "${data.result.title}".`,
        find_duplicates: `Inspect my Google Sheet "${data.result.title}" for duplicate rows and list any duplicates found.`,
        calculate_totals: `Calculate numeric column totals, averages, mins, and maxes for my Google Sheet "${data.result.title}".`,
      };

      await handleSendChat({
        overrideContent: promptMap[action],
        customToolContext: data.result,
      });
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Google Sheets operation failed.' });
    } finally {
      setSheetBusy(false);
    }
  };

  // Stage a Write Operation -> Opens Mandatory Confirmation Modal
  const handleStageSheetWrite = (operation: 'create_sheet' | 'append_row' | 'update_row') => {
    if (operation === 'create_sheet') {
      const title = newSheetTitleInput.trim() || `Personal AI Sheet (${new Date().toLocaleDateString('en-GB')})`;
      setStagedConfirmation({
        toolId: 'google-sheets',
        toolName: 'Google Sheets',
        operation: 'create_sheet',
        description: `Create a brand-new Google Spreadsheet titled "${title}" in your Google Drive.`,
        sheetTitle: title,
        headers: ['Item / Record Name', 'Category / Role', 'Quantity / Details', 'Created Date'],
      });
      return;
    }

    if (!selectedSpreadsheetId.trim()) {
      setBanner({ type: 'warning', text: 'Select or enter a Spreadsheet ID before adding or updating rows.' });
      return;
    }

    const rowValues = [
      newRowCompanyOrItem.trim() || 'Mango Puree',
      newRowCategoryOrRole.trim() || 'Beverage Inventory',
      newRowQuantityOrNotes.trim() || '12 Bottles (Verified)',
      new Date().toLocaleString('en-GB'),
    ];

    setStagedConfirmation({
      toolId: 'google-sheets',
      toolName: 'Google Sheets',
      operation,
      description:
        operation === 'append_row'
          ? `Append a new row [${rowValues.join(' | ')}] to spreadsheet "${selectedSpreadsheetName || selectedSpreadsheetId}".`
          : `Update row 2 with [${rowValues.join(' | ')}] in spreadsheet "${selectedSpreadsheetName || selectedSpreadsheetId}".`,
      spreadsheetId: selectedSpreadsheetId.trim(),
      rowValues,
      rowIndex: 2,
    });
  };

  // Execute Confirmed Write Operation
  const handleConfirmStagedWrite = async () => {
    if (!stagedConfirmation) return;
    setSheetBusy(true);
    try {
      const token = await getValidSheetsToken();
      const res = await fetch('/api/personal-ai/tools/google-sheets/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: token,
          operation: stagedConfirmation.operation,
          spreadsheetId: stagedConfirmation.spreadsheetId,
          sheetTitle: stagedConfirmation.sheetTitle,
          rowValues: stagedConfirmation.rowValues,
          headers: stagedConfirmation.headers,
          rowIndex: stagedConfirmation.rowIndex,
          userConfirmed: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Write operation failed.');

      if (stagedConfirmation.operation === 'create_sheet' && data.result?.spreadsheetId) {
        setSelectedSpreadsheetId(data.result.spreadsheetId);
        setSelectedSpreadsheetName(data.result.title);
        localStorage.setItem('personal_ai_sheet_id', data.result.spreadsheetId);
        localStorage.setItem('personal_ai_sheet_name', data.result.title);
      }

      setBanner({
        type: 'success',
        text: `Confirmed & Executed: ${stagedConfirmation.description}`,
      });
      setStagedConfirmation(null);
      setNewRowCompanyOrItem('');
      setNewRowCategoryOrRole('');
      setNewRowQuantityOrNotes('');
      await loadOverview(activeConversationId);
    } catch (err: any) {
      setBanner({ type: 'error', text: err?.message || 'Confirmed write failed.' });
    } finally {
      setSheetBusy(false);
    }
  };

  const handleAddCustomTool = async () => {
    if (!customToolName.trim()) return;
    try {
      const res = await fetch('/api/personal-ai/integrations/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: customToolName.trim(),
          description: customToolDesc.trim(),
          customEndpointUrl: customToolEndpoint.trim(),
        }),
      });
      if (res.ok) {
        setCustomToolName('');
        setCustomToolDesc('');
        setCustomToolEndpoint('');
        setBanner({ type: 'success', text: 'Custom workspace tool integration registered.' });
        await loadOverview(activeConversationId);
      }
    } catch {
      setBanner({ type: 'error', text: 'Could not register custom tool.' });
    }
  };

  const filteredConversations = useMemo(() => {
    const q = searchHistoryQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.lastMessageSnippet && c.lastMessageSnippet.toLowerCase().includes(q))
    );
  }, [conversations, searchHistoryQuery]);

  const connectedToolsCount = integrations.filter((t) => t.connected).length;

  return (
    <div className="space-y-4 pb-8">
      {/* Top Workspace Header */}
      <div
        className={`p-4 sm:p-5 rounded-2xl border flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 ${
          isDark ? 'bg-[#111622] border-slate-800' : 'bg-white border-slate-200 shadow-xs'
        }`}
      >
        <div className="flex items-start sm:items-center gap-3.5">
          <CCDLogo size={42} mode="icon" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                ZENVIK Personal AI Assistant
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                Bilingual বাংলা & English • Vision • Tools
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              General-purpose ChatGPT-style AI assistant with multi-turn memory, real image & OCR analysis, and connected Google Workspace tools.
            </p>
          </div>
        </div>

        {/* Provider / Model Selector & Mode Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
            <span className="font-semibold">AI Engine:</span>
            <select
              value={preferredProvider}
              onChange={(e) => {
                const next = e.target.value as 'auto' | 'openai' | 'gemini';
                setPreferredProvider(next);
                if (next === 'gemini') setPreferredModel('gemini-3.8-flash');
                else setPreferredModel('gpt-4o');
              }}
              className="bg-transparent font-bold text-blue-600 dark:text-blue-400 focus:outline-none cursor-pointer"
            >
              <option value="auto" className="bg-slate-900 text-white">
                Auto (OpenAI + Gemini)
              </option>
              <option value="openai" className="bg-slate-900 text-white">
                OpenAI (GPT-4o)
              </option>
              <option value="gemini" className="bg-slate-900 text-white">
                Gemini (3.8 Flash)
              </option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'chat'
                ? 'bg-blue-600 text-white shadow-xs'
                : isDark
                ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>AI Chat</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('integrations')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'integrations'
                ? 'bg-indigo-600 text-white shadow-xs'
                : isDark
                ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Plug className="w-3.5 h-3.5" />
            <span>Workspace Tools & Sheets</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20">
              {connectedToolsCount}/{integrations.length}
            </span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {banner && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs font-medium ${
            banner.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : banner.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
              : 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {banner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : banner.type === 'error' ? (
              <XCircle className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{banner.text}</span>
          </div>
          <button type="button" onClick={() => setBanner(null)} className="opacity-70 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =====================================================================
          MODE 1: CHATGPT-STYLE CONVERSATIONAL WORKSPACE
         ===================================================================== */}
      {activeTab === 'chat' && (
        <div
          className={`rounded-2xl border overflow-hidden flex flex-col lg:flex-row min-h-[72vh] ${
            isDark ? 'bg-[#0e131f] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          {/* Left Collapsible Conversation History Sidebar */}
          {isHistorySidebarOpen && (
            <div
              className={`w-full lg:w-72 shrink-0 border-b lg:border-b-0 lg:border-r flex flex-col ${
                isDark ? 'bg-[#0b0e17] border-slate-800' : 'bg-slate-50/70 border-slate-200'
              }`}
            >
              {/* New Chat & Search Bar */}
              <div className="p-3 space-y-2.5 border-b border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => void handleNewChat()}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-sm transition flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Chat</span>
                </button>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchHistoryQuery}
                    onChange={(e) => setSearchHistoryQuery(e.target.value)}
                    placeholder="Search conversations..."
                    className={`w-full pl-8 pr-3 py-1.5 rounded-xl border text-xs focus:outline-none focus:border-blue-500 ${
                      isDark
                        ? 'bg-slate-900 border-slate-800 text-white placeholder-slate-500'
                        : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
                    }`}
                  />
                </div>
              </div>

              {/* Conversation History List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1 max-h-60 lg:max-h-[54vh]">
                {filteredConversations.map((conv) => {
                  const isActive = conv.id === activeConversationId;
                  const isRenaming = renamingConvId === conv.id;

                  return (
                    <div
                      key={conv.id}
                      onClick={() => !isRenaming && void handleSelectConversation(conv.id)}
                      className={`group px-3 py-2.5 rounded-xl cursor-pointer transition flex items-center justify-between gap-2 text-xs ${
                        isActive
                          ? isDark
                            ? 'bg-blue-600/20 text-white border border-blue-500/40 font-semibold'
                            : 'bg-blue-50 text-blue-700 border border-blue-200 font-semibold'
                          : isDark
                          ? 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        {isRenaming ? (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={renameTitleInput}
                              onChange={(e) => setRenameTitleInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void handleSaveRename(conv.id);
                                if (e.key === 'Escape') setRenamingConvId(null);
                              }}
                              autoFocus
                              className="w-full px-2 py-1 rounded bg-slate-900 text-white border border-blue-500 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => void handleSaveRename(conv.id)}
                              className="p-1 text-emerald-400 hover:text-emerald-300"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="truncate">{conv.title}</div>
                            <div className="text-[10px] opacity-60 truncate mt-0.5">
                              {new Date(conv.updatedAt).toLocaleDateString()} • {conv.messageCount ?? 0} msgs
                            </div>
                          </>
                        )}
                      </div>

                      {!isRenaming && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                          <button
                            type="button"
                            title="Rename conversation"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingConvId(conv.id);
                              setRenameTitleInput(conv.title);
                            }}
                            className="p-1 rounded hover:bg-slate-700/40 text-slate-400 hover:text-blue-400"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Delete conversation"
                            onClick={(e) => void handleDeleteConversation(conv.id, e)}
                            className="p-1 rounded hover:bg-slate-700/40 text-slate-400 hover:text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Connected Sheet Status Footer in Sidebar */}
              <div className="p-3 border-t border-slate-200 dark:border-slate-800 text-[11px] space-y-1.5">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Active AI Status:</span>
                  <span className="text-emerald-500 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                    Online
                  </span>
                </div>
                {selectedSpreadsheetName && (
                  <div className="flex items-center gap-1.5 text-emerald-400 truncate">
                    <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Sheet: {selectedSpreadsheetName}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Main Chat Column */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Chat Sub-bar */}
            <div
              className={`px-4 py-2.5 border-b flex items-center justify-between gap-2 text-xs ${
                isDark ? 'border-slate-800 bg-[#111622]/60' : 'border-slate-100 bg-slate-50/50'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setIsHistorySidebarOpen((prev) => !prev)}
                  className={`p-1.5 rounded-lg border transition ${
                    isDark
                      ? 'border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                      : 'border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                  title={isHistorySidebarOpen ? 'Hide chat history' : 'Show chat history'}
                >
                  {isHistorySidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                <span className="font-bold truncate text-slate-800 dark:text-slate-200">
                  {conversations.find((c) => c.id === activeConversationId)?.title || 'Personal AI Conversation'}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {activeSheetContext && (
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300 text-[11px] font-semibold flex items-center gap-1">
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Live Sheet Context Attached</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab('integrations')}
                  className="px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 text-[11px] font-semibold hover:bg-blue-500/20 transition flex items-center gap-1"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Google Sheets Actions</span>
                </button>
              </div>
            </div>

            {/* Messages Scroll Stream */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 max-h-[56vh]">
              {messages.length === 0 && !streamingContent && (
                <div className="py-10 text-center max-w-2xl mx-auto space-y-6">
                  <div className="w-14 h-14 rounded-2xl bg-blue-600/15 border border-blue-500/30 text-blue-500 flex items-center justify-center mx-auto">
                    <Sparkles className="w-7 h-7" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                      How can I help you today? আজ আপনাকে কীভাবে সাহায্য করতে পারি?
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Ask anything in Bengali or English, upload photos or handwritten notes for instant Vision OCR, or query your connected Google Sheets.
                    </p>
                  </div>

                  {/* Quick Prompt Suggestions (Bengali & English) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
                    {[
                      {
                        label: 'বাংলায় প্রশ্ন ও অনুবাদ (Bengali & Translation)',
                        prompt: 'আমি একটি নতুন প্রজেক্টের পরিকল্পনা করছি। আমাকে ৫টি কার্যকর প্রোডাক্টিভিটি টিপস বাংলায় এবং ইংরেজিতে লিখে দাও।',
                      },
                      {
                        label: 'Analyze & Find "Mango" in Google Sheets',
                        prompt: 'How can I search for "Mango" in my connected Google Sheet, calculate column totals, and summarize matching records?',
                      },
                      {
                        label: 'Hospitality & Mixology Science',
                        prompt: 'Explain the science of clarification (milk washing vs agar clarification) for crystal-clear signature cocktails.',
                      },
                      {
                        label: 'Coding, Math & Technical Problem Solving',
                        prompt: 'Write a clean TypeScript helper function that deduplicates an array of objects by multiple keys and calculates summary totals.',
                      },
                    ].map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => void handleSendChat({ overrideContent: item.prompt })}
                        className={`p-3.5 rounded-xl border text-left transition ${
                          isDark
                            ? 'bg-slate-900/70 border-slate-800 hover:border-blue-500/50 text-slate-200'
                            : 'bg-slate-50 border-slate-200 hover:border-blue-400 text-slate-800'
                        }`}
                      >
                        <div className="text-xs font-bold text-blue-500 mb-1">{item.label}</div>
                        <div className="text-[11px] opacity-80 line-clamp-2">{item.prompt}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                const isEditing = editingMessageId === msg.id;

                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && (
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-violet-600 text-white flex items-center justify-center shrink-0 mt-1 shadow-xs">
                        <Bot className="w-4 h-4" />
                      </div>
                    )}

                    <div
                      className={`max-w-3xl w-full sm:w-auto rounded-2xl p-4 border ${
                        isUser
                          ? isDark
                            ? 'bg-blue-600/20 border-blue-500/40 text-white'
                            : 'bg-blue-50/90 border-blue-200 text-slate-900'
                          : isDark
                          ? 'bg-[#141a29] border-slate-800 text-slate-100'
                          : 'bg-slate-50/80 border-slate-200/80 text-slate-900'
                      }`}
                    >
                      {/* Header Metadata & Timestamp */}
                      <div className="flex items-center justify-between gap-4 mb-2 text-[10px] opacity-65">
                        <span className="font-bold uppercase tracking-wider">
                          {isUser ? 'You' : `Personal AI (${msg.modelUsed || 'Multimodal'})`}
                          {msg.edited ? ' • Edited' : ''}
                        </span>
                        <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      {/* Attached Images Preview in Message */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {msg.attachments.map((att) => (
                            <div
                              key={att.id}
                              className="relative w-36 h-36 rounded-xl overflow-hidden border border-slate-700 bg-black"
                            >
                              <img
                                src={att.dataUrl}
                                alt={att.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Message Content or Inline Edit Box */}
                      {isEditing ? (
                        <div className="space-y-2 min-w-[260px] sm:min-w-[420px]">
                          <textarea
                            value={editingMessageText}
                            onChange={(e) => setEditingMessageText(e.target.value)}
                            rows={3}
                            className="w-full p-2.5 rounded-xl bg-slate-900 text-white border border-blue-500 text-xs focus:outline-none"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingMessageId(null)}
                              className="px-3 py-1 rounded-lg bg-slate-800 text-slate-300 text-xs"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void handleSendChat({
                                  overrideContent: editingMessageText,
                                  editMessageId: msg.id,
                                })
                              }
                              className="px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-bold"
                            >
                              Save & Submit
                            </button>
                          </div>
                        </div>
                      ) : (
                        <MarkdownMessageRenderer content={msg.content} isDark={isDark} />
                      )}

                      {/* Message Footer Action Buttons */}
                      {!isEditing && (
                        <div className="mt-3 pt-2 border-t border-slate-500/15 flex items-center gap-3 text-[11px] opacity-75 hover:opacity-100 transition">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(msg.content);
                              setCopiedMessageId(msg.id);
                              setTimeout(() => setCopiedMessageId(null), 2000);
                            }}
                            className="inline-flex items-center gap-1 hover:text-blue-400"
                          >
                            {copiedMessageId === msg.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-emerald-400">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>

                          {isUser && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMessageId(msg.id);
                                setEditingMessageText(msg.content);
                              }}
                              className="inline-flex items-center gap-1 hover:text-blue-400"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit Message</span>
                            </button>
                          )}

                          {!isUser && index === messages.length - 1 && !isGenerating && (
                            <button
                              type="button"
                              onClick={() =>
                                void handleSendChat({
                                  regenerateFromMessageId: msg.id,
                                })
                              }
                              className="inline-flex items-center gap-1 hover:text-blue-400"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Regenerate</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Active Streaming Response Bubble */}
              {isGenerating && (
                <div className="flex gap-3.5 justify-start">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-violet-600 text-white flex items-center justify-center shrink-0 mt-1 animate-pulse">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div
                    className={`max-w-3xl rounded-2xl p-4 border ${
                      isDark ? 'bg-[#141a29] border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  >
                    {streamingContent ? (
                      <MarkdownMessageRenderer content={streamingContent} isDark={isDark} />
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-blue-500 font-semibold">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Thinking & analyzing context...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Bottom Multimodal Composer Bar */}
            <div
              className={`p-3 sm:p-4 border-t ${
                isDark ? 'border-slate-800 bg-[#0b0e17]' : 'border-slate-200 bg-slate-50/70'
              }`}
            >
              {/* Image Preview Strip Before Sending */}
              {attachments.length > 0 && (
                <div className="flex items-center gap-2.5 overflow-x-auto pb-3 mb-2">
                  {attachments.map((att) => (
                    <div
                      key={att.id}
                      className="relative w-20 h-20 rounded-xl overflow-hidden border-2 border-blue-500/50 bg-black shrink-0 group"
                    >
                      <img src={att.dataUrl} alt={att.name} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/80 text-white hover:bg-rose-600 transition"
                        title="Remove attachment"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Hidden File & Camera Inputs */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileUpload}
                className="hidden"
              />

              <div className="flex items-end gap-2">
                {/* Upload Image Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload image(s) from device gallery"
                  className={`p-2.5 rounded-xl border transition shrink-0 ${
                    isDark
                      ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-blue-400 hover:border-blue-500/40'
                      : 'bg-white border-slate-200 text-slate-600 hover:text-blue-600'
                  }`}
                >
                  <ImageIcon className="w-5 h-5" />
                </button>

                {/* Camera Capture Button */}
                <button
                  type="button"
                  onClick={() => void handleOpenCameraModal()}
                  title="Capture photo directly with camera"
                  className={`p-2.5 rounded-xl border transition shrink-0 ${
                    isDark
                      ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-emerald-400 hover:border-emerald-500/40'
                      : 'bg-white border-slate-200 text-slate-600 hover:text-emerald-600'
                  }`}
                >
                  <Camera className="w-5 h-5" />
                </button>

                {/* Prompt Textarea */}
                <textarea
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (!isGenerating) void handleSendChat();
                    }
                  }}
                  rows={2}
                  placeholder="Message Personal AI in English or বাংলা... (Attach photos for OCR/Vision or press Enter to send)"
                  className={`flex-1 px-4 py-2.5 rounded-xl border text-xs sm:text-sm resize-none focus:outline-none focus:border-blue-500 ${
                    isDark
                      ? 'bg-slate-900 border-slate-800 text-white placeholder-slate-500'
                      : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
                  }`}
                />

                {/* Send or Stop Generating Button */}
                {isGenerating ? (
                  <button
                    type="button"
                    onClick={handleStopGenerating}
                    className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 shrink-0 shadow-md"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    <span>Stop</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleSendChat()}
                    disabled={!promptInput.trim() && attachments.length === 0}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1.5 shrink-0 shadow-md transition"
                  >
                    <Send className="w-4 h-4" />
                    <span className="hidden sm:inline">Send</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODE 2: EXTENSIBLE WORKSPACE TOOLS & GOOGLE SHEETS COMMAND CENTER
         ===================================================================== */}
      {activeTab === 'integrations' && (
        <div className="space-y-6">
          {/* Google Sheets Deep Integration Command Panel (Section 4.3 & 4.4) */}
          <div
            className={`p-5 sm:p-6 rounded-2xl border ${
              isDark ? 'bg-[#111622] border-slate-800' : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    Google Sheets AI Workspace Integration
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Connect your Google Sheets to read rows, search for specific items (e.g., &ldquo;Mango&rdquo;), summarize data, find duplicates, calculate totals, or create/update records with confirmation control.
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={sheetBusy}
                onClick={() => void handleConnectGoogleSheets()}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shrink-0 shadow-sm"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${sheetBusy ? 'animate-spin' : ''}`} />
                <span>Connect & Load My Google Sheets</span>
              </button>
            </div>

            {/* Spreadsheet Selector + Direct ID Input */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-xs font-bold mb-1.5 text-slate-700 dark:text-slate-300">
                  Select From Your Google Drive Spreadsheets
                </label>
                <select
                  value={selectedSpreadsheetId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedSpreadsheetId(id);
                    const found = userSpreadsheets.find((f) => f.id === id);
                    if (found) {
                      setSelectedSpreadsheetName(found.name);
                      localStorage.setItem('personal_ai_sheet_name', found.name);
                    }
                    localStorage.setItem('personal_ai_sheet_id', id);
                  }}
                  className={`w-full px-3.5 py-2 rounded-xl border text-xs ${
                    isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                >
                  <option value="">-- Choose a connected Google Sheet --</option>
                  {userSpreadsheets.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold mb-1.5 text-slate-700 dark:text-slate-300">
                  Or Paste Any Google Spreadsheet ID
                </label>
                <input
                  type="text"
                  value={selectedSpreadsheetId}
                  onChange={(e) => {
                    setSelectedSpreadsheetId(e.target.value);
                    localStorage.setItem('personal_ai_sheet_id', e.target.value);
                  }}
                  placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                  className={`w-full px-3.5 py-2 rounded-xl border text-xs font-mono ${
                    isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
              </div>
            </div>

            {/* Non-Destructive Read & AI Analysis Operations */}
            <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                1. Read, Search & Analyze Sheet Data in AI Chat
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={sheetSearchTerm}
                    onChange={(e) => setSheetSearchTerm(e.target.value)}
                    placeholder="Keyword (e.g. Mango)"
                    className={`px-3 py-2 rounded-xl border text-xs ${
                      isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                    }`}
                  />
                  <button
                    type="button"
                    disabled={sheetBusy}
                    onClick={() => void handleExecuteSheetsRead('search_records')}
                    className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>Find &ldquo;{sheetSearchTerm || 'Mango'}&rdquo; in Sheet</span>
                  </button>
                </div>

                <button
                  type="button"
                  disabled={sheetBusy}
                  onClick={() => void handleExecuteSheetsRead('read_all')}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs"
                >
                  Read All Rows
                </button>

                <button
                  type="button"
                  disabled={sheetBusy}
                  onClick={() => void handleExecuteSheetsRead('summarize')}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs"
                >
                  Summarize Sheet
                </button>

                <button
                  type="button"
                  disabled={sheetBusy}
                  onClick={() => void handleExecuteSheetsRead('calculate_totals')}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs"
                >
                  Calculate Column Totals
                </button>

                <button
                  type="button"
                  disabled={sheetBusy}
                  onClick={() => void handleExecuteSheetsRead('find_duplicates')}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs"
                >
                  Identify Duplicates
                </button>
              </div>
            </div>

            {/* Mutating Sheet Operations (Strictly Confirmation-Gated) */}
            <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-500">
                  2. Create Sheet, Add Record, or Update Row (Confirmation Required)
                </span>
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  Protected by User Confirmation Gate
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
                <input
                  type="text"
                  value={newRowCompanyOrItem}
                  onChange={(e) => setNewRowCompanyOrItem(e.target.value)}
                  placeholder="Column A (e.g. Mango Puree)"
                  className={`px-3 py-2 rounded-xl border text-xs ${
                    isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
                <input
                  type="text"
                  value={newRowCategoryOrRole}
                  onChange={(e) => setNewRowCategoryOrRole(e.target.value)}
                  placeholder="Column B (e.g. Tropical Fruit)"
                  className={`px-3 py-2 rounded-xl border text-xs ${
                    isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
                <input
                  type="text"
                  value={newRowQuantityOrNotes}
                  onChange={(e) => setNewRowQuantityOrNotes(e.target.value)}
                  placeholder="Column C (e.g. 25 Liters In Stock)"
                  className={`px-3 py-2 rounded-xl border text-xs ${
                    isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleStageSheetWrite('append_row')}
                    className="flex-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                  >
                    + Add Row
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStageSheetWrite('update_row')}
                    className="flex-1 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs"
                  >
                    Update Row
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2">
                <input
                  type="text"
                  value={newSheetTitleInput}
                  onChange={(e) => setNewSheetTitleInput(e.target.value)}
                  placeholder="New Spreadsheet Title (e.g. Bar Inventory & Mango Stock 2026)"
                  className={`flex-1 px-3 py-2 rounded-xl border text-xs ${
                    isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => handleStageSheetWrite('create_sheet')}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Create New Google Sheet</span>
                </button>
              </div>
            </div>
          </div>

          {/* Modular Workspace Tool Integrations Registry (Section 4.1 & 4.2) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {integrations.map((tool) => (
              <div
                key={tool.id}
                className={`p-5 rounded-2xl border flex flex-col justify-between ${
                  isDark ? 'bg-[#111622] border-slate-800' : 'bg-white border-slate-200 shadow-xs'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">{tool.name}</h3>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full mt-1 ${
                          tool.connected
                            ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                            : 'bg-slate-500/15 text-slate-400 border border-slate-500/30'
                        }`}
                      >
                        {tool.connected ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleToggleIntegrationConnection(tool)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                        tool.connected
                          ? 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 border border-rose-500/30'
                          : 'bg-blue-600 text-white hover:bg-blue-500'
                      }`}
                    >
                      {tool.connected ? 'Disconnect' : 'Connect'}
                    </button>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{tool.description}</p>

                  <div className="space-y-1 mb-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Capabilities:
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {tool.capabilities.map((cap, i) => (
                        <span
                          key={i}
                          className={`text-[10px] px-2 py-0.5 rounded-md ${
                            isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
                  <span>Write Confirmation: {tool.permissions.requireConfirmationForWrite ? 'Required' : 'Auto'}</span>
                  <span>{tool.lastSyncedAt ? `Synced ${new Date(tool.lastSyncedAt).toLocaleTimeString()}` : 'Not synced yet'}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Add Custom API / Webhook / Database Connector */}
          <div
            className={`p-5 rounded-2xl border ${
              isDark ? 'bg-[#111622] border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
              Register New Custom Tool / REST API / Database Connector
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                value={customToolName}
                onChange={(e) => setCustomToolName(e.target.value)}
                placeholder="Tool Name (e.g. Notion / Custom POS API)"
                className={`px-3 py-2 rounded-xl border text-xs ${
                  isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                }`}
              />
              <input
                type="text"
                value={customToolEndpoint}
                onChange={(e) => setCustomToolEndpoint(e.target.value)}
                placeholder="Endpoint URL (https://api.example.com/v1)"
                className={`px-3 py-2 rounded-xl border text-xs ${
                  isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                }`}
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customToolDesc}
                  onChange={(e) => setCustomToolDesc(e.target.value)}
                  placeholder="Capabilities description"
                  className={`flex-1 px-3 py-2 rounded-xl border text-xs ${
                    isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => void handleAddCustomTool()}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shrink-0"
                >
                  Add Tool
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MANDATORY USER CONFIRMATION MODAL FOR EXTERNAL WRITE ACTIONS
         ===================================================================== */}
      {stagedConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div
            className={`max-w-md w-full p-6 rounded-2xl border shadow-2xl space-y-4 ${
              isDark ? 'bg-[#111622] border-amber-500/40 text-white' : 'bg-white border-amber-300 text-slate-900'
            }`}
          >
            <div className="flex items-center gap-3 text-amber-500">
              <ShieldCheck className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold">Confirm External Tool Modification</h3>
            </div>
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Personal AI is requesting permission to modify data in <strong>{stagedConfirmation.toolName}</strong>:
            </p>
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-mono">
              {stagedConfirmation.description}
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setStagedConfirmation(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sheetBusy}
                onClick={() => void handleConfirmStagedWrite()}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
              >
                {sheetBusy ? 'Executing...' : 'Confirm & Execute in Google Sheets'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          LIVE CAMERA CAPTURE MODAL
         ===================================================================== */}
      {isCameraModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="max-w-lg w-full rounded-2xl bg-[#111622] border border-slate-700 p-5 space-y-4 text-white">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Camera className="w-4 h-4 text-emerald-400" />
                <span>Live Camera Capture for Vision Analysis</span>
              </h3>
              <button type="button" onClick={handleCloseCameraModal} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="rounded-xl overflow-hidden bg-black aspect-video border border-slate-800">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseCameraModal}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCaptureCameraFrame}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
              >
                Take Photo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
