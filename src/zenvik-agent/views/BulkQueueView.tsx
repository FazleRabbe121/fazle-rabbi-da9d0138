import React, { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  Play,
  Pause,
  RotateCcw,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Mail,
  Send,
  Eye,
  Trash2,
  Sparkles,
  ShieldCheck,
  Timer,
  RefreshCw,
  ExternalLink,
  Edit3,
  UserCheck,
  PlusCircle,
  CheckSquare,
  FileCheck,
  AlertOctagon,
  HelpCircle,
  Activity,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { PreparedJobApplication } from '../types/jobApplication';
import {
  loadSavedPreparedApplications,
  saveSavedPreparedApplications,
  loadLocalSendingHistory,
  syncAllGmailDeliveryStatuses,
  loadAuthorizedSenderAccounts,
  getActiveSenderAccount,
  switchActiveSenderAccount,
  connectAdditionalGmailAccountViaOAuth,
  assessSenderAccountQuotaNeed,
  testGmailTokenValidity,
  AuthorizedGmailSenderAccount,
} from '../services/gmailService';
import { getCachedGoogleToken } from '../services/firebase';
import {
  persistentGmailQueueEngine,
  GmailQueueItem,
  normalizeQueueStatusLabel,
  SafeDiagnosticTestCaseResult,
} from '../services/gmailQueueService';
import { resolveVerifiedEmployerEmail } from '../utils/verifiedEmployerEmails';

interface BulkQueueViewProps {
  onOpenGmailCenter?: () => void;
}

type DeliveryCenterFilter =
  | 'All'
  | 'Queued'
  | 'Sent'
  | 'Delivery Unconfirmed'
  | 'Bounced'
  | 'Failed'
  | 'Needs Action';

export const BulkQueueView: React.FC<BulkQueueViewProps> = ({ onOpenGmailCenter }) => {
  const { theme } = useTheme();

  // Synchronize persistent queue with prepared applications and sending history
  const [queueItems, setQueueItems] = useState<GmailQueueItem[]>(() => {
    const prepared = loadSavedPreparedApplications();
    return persistentGmailQueueEngine.syncFromPreparedApplications(prepared);
  });

  const [activeFilter, setActiveFilter] = useState<DeliveryCenterFilter>('All');
  const [isProcessing, setIsProcessing] = useState<boolean>(() => persistentGmailQueueEngine.getState().isProcessing);
  const [isPaused, setIsPaused] = useState<boolean>(() => persistentGmailQueueEngine.getState().isPaused);
  const [delaySeconds, setDelaySeconds] = useState<number>(() =>
    Math.round(persistentGmailQueueEngine.getDelayMs() / 1000)
  );
  const [isSlow10MinMode, setIsSlow10MinMode] = useState(false);
  const [activeProgressItem, setActiveProgressItem] = useState<GmailQueueItem | null>(null);
  const [isSyncingBounces, setIsSyncingBounces] = useState(false);

  // Sender Accounts State
  const [senderAccounts, setSenderAccounts] = useState<AuthorizedGmailSenderAccount[]>(() =>
    loadAuthorizedSenderAccounts()
  );
  const [activeSender, setActiveSender] = useState<AuthorizedGmailSenderAccount>(() => getActiveSenderAccount());
  const [isConnectingOAuth, setIsConnectingOAuth] = useState(false);

  // Modals & Inline Resolve State
  const [previewItem, setPreviewItem] = useState<GmailQueueItem | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editedRecipientEmail, setEditedRecipientEmail] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Safe 8-Case Diagnostic Suite State
  const [diagnosticResults, setDiagnosticResults] = useState<SafeDiagnosticTestCaseResult[] | null>(null);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
  const [showErrorDiagnosisCard, setShowErrorDiagnosisCard] = useState(true);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 5000);
  };

  // Sync queue changes back to PreparedJobApplication list so all views stay synchronized
  const syncQueueToPreparedStorage = (items: GmailQueueItem[]) => {
    const prepared = loadSavedPreparedApplications();
    let changed = false;
    const updatedPrepared = prepared.map(app => {
      const match = items.find(q => q.jobId === app.id || q.id === `queue-${app.id}`);
      if (!match) return app;
      const norm = normalizeQueueStatusLabel(match.status);
      let newStatus: PreparedJobApplication['status'] = app.status;
      let newDeliveryStatus: PreparedJobApplication['deliveryStatus'] = app.deliveryStatus;

      if (norm === 'Accepted by Gmail / Sent') {
        newStatus = 'applied';
        newDeliveryStatus = 'sent_accepted_by_gmail';
      } else if (norm === 'Delivery Unconfirmed') {
        newStatus = 'applied';
        newDeliveryStatus = 'delivery_unconfirmed';
      } else if (norm === 'Bounced / Rejected') {
        newStatus = 'bounced';
        newDeliveryStatus = 'bounced';
      } else if (norm === 'Temporary Delivery Failure') {
        newStatus = 'failed';
        newDeliveryStatus = 'temporary_delivery_failure';
      } else if (norm === 'Failed to Send') {
        newStatus = 'failed';
        newDeliveryStatus = 'failed_to_send';
      } else if (norm === 'Needs Action') {
        newStatus = 'needs_action';
        newDeliveryStatus = 'needs_action';
      } else if (norm === 'Queued') {
        newStatus = 'queued';
        newDeliveryStatus = 'queued';
      }

      if (
        newStatus !== app.status ||
        newDeliveryStatus !== app.deliveryStatus ||
        match.recipient !== app.recipientEmail
      ) {
        changed = true;
        return {
          ...app,
          recipientEmail: match.recipient,
          status: newStatus,
          deliveryStatus: newDeliveryStatus,
          messageId: match.gmailMessageId || app.messageId,
          errorReason: match.errorReason,
          sendingAccount: match.senderAccount,
          attemptCount: match.attemptCount || match.retryCount,
          lastAttemptAt: match.lastAttemptAt,
        };
      }
      return app;
    });

    if (changed) {
      saveSavedPreparedApplications(updatedPrepared);
    }
  };

  useEffect(() => {
    const unsub = persistentGmailQueueEngine.subscribe(updated => {
      setQueueItems(updated);
      const state = persistentGmailQueueEngine.getState();
      setIsProcessing(state.isProcessing);
      setIsPaused(state.isPaused);
      setSenderAccounts(loadAuthorizedSenderAccounts());
      setActiveSender(getActiveSenderAccount());
      syncQueueToPreparedStorage(updated);
    });
    return () => unsub();
  }, []);

  // Also merge any historical sent/bounced records from Sending History into the unified Delivery Center view
  const unifiedRecords = useMemo(() => {
    const history = loadLocalSendingHistory();
    const combined: GmailQueueItem[] = [...queueItems];
    const seenKeys = new Set(
      combined.map(q => `${q.company.toLowerCase()}::${q.position.toLowerCase()}::${q.recipient.toLowerCase()}`)
    );

    history.forEach((h, idx) => {
      const key = `${(h.company || '').toLowerCase()}::${(h.position || h.subject || '').toLowerCase()}::${(h.recipient || '').toLowerCase()}`;
      if (seenKeys.has(key)) {
        // Update existing queue item if history detected a bounce or delivery update
        const existingIdx = combined.findIndex(
          q =>
            q.gmailMessageId === h.messageId ||
            (q.recipient.toLowerCase() === (h.recipient || '').toLowerCase() &&
              q.company.toLowerCase() === (h.company || '').toLowerCase())
        );
        if (existingIdx !== -1) {
          if (h.status === 'bounced' || h.deliveryStatus === 'bounced') {
            combined[existingIdx] = {
              ...combined[existingIdx],
              status: 'Bounced / Rejected',
              errorReason: h.errorReason || h.replySnippet || combined[existingIdx].errorReason,
            };
          } else if (h.deliveryStatus === 'delivery_unconfirmed' && combined[existingIdx].status === 'Accepted by Gmail / Sent') {
            combined[existingIdx] = {
              ...combined[existingIdx],
              status: 'Delivery Unconfirmed',
            };
          }
        }
        return;
      }

      const contactRes = resolveVerifiedEmployerEmail(h.recipient, h.company);
      let mappedStatus: GmailQueueItem['status'] = 'Accepted by Gmail / Sent';
      if (h.status === 'bounced' || h.deliveryStatus === 'bounced') {
        mappedStatus = 'Bounced / Rejected';
      } else if (h.deliveryStatus === 'delivery_unconfirmed' || h.status === 'delivery_unconfirmed') {
        mappedStatus = 'Delivery Unconfirmed';
      } else if (h.status === 'temporary_delivery_failure') {
        mappedStatus = 'Temporary Delivery Failure';
      } else if (h.status === 'failed' || h.status === 'failed_to_send') {
        mappedStatus = 'Failed to Send';
      } else if (h.status === 'needs_action' || h.status === 'blocked') {
        mappedStatus = 'Needs Action';
      } else if (h.status === 'queued') {
        mappedStatus = 'Queued';
      }

      combined.push({
        id: `hist-${h.id || idx}`,
        queuePosition: combined.length + 1,
        jobId: h.id || `hist-${idx}`,
        market: 'europe',
        recipient: h.recipient || '',
        senderAccount: h.sendingAccount || 'fazle.rabbe.doc@gmail.com',
        company: h.company || 'Hospitality Employer',
        position: h.position || h.subject || 'Hospitality Application',
        subject: h.subject || `Application — ${h.company || 'Employer'}`,
        bodyText: '',
        cvTitle: h.cvTitle,
        status: mappedStatus,
        retryCount: h.attemptCount || 1,
        attemptCount: h.attemptCount || 1,
        maxRetries: 3,
        errorReason: h.errorReason || h.replySnippet,
        recommendedAction:
          mappedStatus === 'Bounced / Rejected'
            ? 'Recipient server rejected or expired delivery. Correct the address or apply via official portal.'
            : undefined,
        gmailMessageId: h.messageId,
        threadId: h.threadId,
        createdAt: h.timestamp || new Date().toISOString(),
        updatedAt: h.timestamp || new Date().toISOString(),
        lastAttemptAt: h.timestamp,
        contactSourceUrl: h.contactSourceUrl || contactRes.sourceUrl,
        contactFoundOnPage: h.contactFoundOnPage || contactRes.foundOnPage,
        contactType: (h.contactType as any) || contactRes.contactType,
        contactVerificationDate: h.contactVerificationDate || contactRes.verificationDate,
        contactConfidence: h.contactConfidence || contactRes.confidence,
        officialPortalUrl: h.applicationUrl || contactRes.officialPortalUrl,
      });
    });

    return combined;
  }, [queueItems]);

  // Filter counts
  const counts = useMemo(() => {
    const c = {
      All: unifiedRecords.length,
      Queued: 0,
      Sent: 0,
      'Delivery Unconfirmed': 0,
      Bounced: 0,
      Failed: 0,
      'Needs Action': 0,
    };
    for (const item of unifiedRecords) {
      const norm = normalizeQueueStatusLabel(item.status);
      if (norm === 'Queued' || norm === 'Sending') c.Queued++;
      else if (norm === 'Accepted by Gmail / Sent' || norm === 'Reply Received (Confirmed)') c.Sent++;
      else if (norm === 'Delivery Unconfirmed') c['Delivery Unconfirmed']++;
      else if (norm === 'Bounced / Rejected') c.Bounced++;
      else if (norm === 'Failed to Send' || norm === 'Temporary Delivery Failure') c.Failed++;
      else if (norm === 'Needs Action') c['Needs Action']++;
    }
    return c;
  }, [unifiedRecords]);

  const filteredRecords = useMemo(() => {
    if (activeFilter === 'All') return unifiedRecords;
    return unifiedRecords.filter(item => {
      const norm = normalizeQueueStatusLabel(item.status);
      if (activeFilter === 'Queued') return norm === 'Queued' || norm === 'Sending';
      if (activeFilter === 'Sent') return norm === 'Accepted by Gmail / Sent' || norm === 'Reply Received (Confirmed)';
      if (activeFilter === 'Delivery Unconfirmed') return norm === 'Delivery Unconfirmed';
      if (activeFilter === 'Bounced') return norm === 'Bounced / Rejected';
      if (activeFilter === 'Failed') return norm === 'Failed to Send' || norm === 'Temporary Delivery Failure';
      if (activeFilter === 'Needs Action') return norm === 'Needs Action';
      return true;
    });
  }, [unifiedRecords, activeFilter]);

  const quotaDiagnostics = useMemo(() => assessSenderAccountQuotaNeed(), [senderAccounts, queueItems]);

  const handleDelayChange = (sec: number) => {
    setDelaySeconds(sec);
    setIsSlow10MinMode(false);
    persistentGmailQueueEngine.setDelay(sec * 1000);
    showToast(`Sequential queue delay set to ${sec} seconds between emails.`);
  };

  const handleToggle10MinMode = () => {
    const next = !isSlow10MinMode;
    setIsSlow10MinMode(next);
    const pending = Math.max(1, counts.Queued);
    const newDelayMs = next ? Math.max(15000, Math.floor((10 * 60 * 1000) / pending)) : delaySeconds * 1000;
    persistentGmailQueueEngine.setDelay(newDelayMs);
    showToast(
      next
        ? `10-Minute Paced Mode enabled (${Math.round(newDelayMs / 1000)}s between emails).`
        : `Standard sequential pacing restored (${delaySeconds}s between emails).`
    );
  };

  const handleStartOrResumeQueue = async () => {
    const token = getCachedGoogleToken();
    const isValid = token ? await testGmailTokenValidity(token) : false;
    if (!token || !isValid) {
      showToast('Gmail OAuth session expired or not connected. Please authorize Gmail first.');
      return;
    }

    if (persistentGmailQueueEngine.getPendingCount() === 0) {
      showToast('No pending items in "Queued" state. Use "Retry Failed" or add vacancies to queue.');
      return;
    }

    setIsProcessing(true);
    setIsPaused(false);
    showToast('Sequential sending queue started — sending strictly 1 application at a time.');

    const res = await persistentGmailQueueEngine.resumeQueue({
      delayBetweenEmailsMs: isSlow10MinMode
        ? Math.max(15000, Math.floor((10 * 60 * 1000) / Math.max(1, counts.Queued)))
        : delaySeconds * 1000,
      onProgress: item => setActiveProgressItem({ ...item }),
    });

    setActiveProgressItem(null);
    setIsProcessing(false);
    showToast(
      `Queue pass finished: ${res.successCount} accepted by Gmail, ${res.failureCount} require attention.`
    );
  };

  const handlePauseQueue = () => {
    persistentGmailQueueEngine.pauseQueue();
    setIsPaused(true);
    setIsProcessing(false);
    showToast('Queue paused safely. Current progress saved — click Resume anytime.');
  };

  const handleRetryFailed = () => {
    const { retriedCount, skippedPermanentCount } = persistentGmailQueueEngine.retryFailedItems();
    if (retriedCount > 0) {
      showToast(
        `Re-queued ${retriedCount} failed item(s). (${skippedPermanentCount} permanent bounces/invalid contacts kept in Needs Action).`
      );
    } else {
      showToast(
        `No temporary failures eligible for auto-retry. ${skippedPermanentCount} item(s) have permanent bounce/contact errors and require address correction.`
      );
    }
  };

  const handleCancelPending = () => {
    const count = persistentGmailQueueEngine.cancelPendingItems();
    setIsProcessing(false);
    setIsPaused(false);
    showToast(`Cancelled ${count} pending queue item(s).`);
  };

  const handleSyncBouncesAndDeliveries = async () => {
    setIsSyncingBounces(true);
    try {
      const res = await syncAllGmailDeliveryStatuses();
      setQueueItems([...persistentGmailQueueEngine.getQueue()]);
      showToast(
        `Synced with Gmail: ${res.bouncedCount} bounce(s) matched, ${res.deliveredCount} confirmed employer replies.`
      );
    } finally {
      setIsSyncingBounces(false);
    }
  };

  const handleSaveRecipientOverride = (itemId: string) => {
    const res = persistentGmailQueueEngine.updateItemRecipient(itemId, editedRecipientEmail);
    showToast(res.message);
    if (res.success) {
      setEditingItemId(null);
      setEditedRecipientEmail('');
    }
  };

  const handleConnectSecondGmailOAuth = async () => {
    setIsConnectingOAuth(true);
    try {
      const res = await connectAdditionalGmailAccountViaOAuth();
      setSenderAccounts(loadAuthorizedSenderAccounts());
      setActiveSender(getActiveSenderAccount());
      showToast(res.error || (res.account ? `Connected ${res.account.email}` : 'Updated sender accounts'));
    } finally {
      setIsConnectingOAuth(false);
    }
  };

  const handleRunSafeDiagnosticSuite = async (sendLiveSelfTest: boolean) => {
    setIsRunningDiagnostics(true);
    try {
      const suite = await persistentGmailQueueEngine.runSafeDeliveryDiagnosticSuite({
        sendLiveSelfTestEmail: sendLiveSelfTest,
      });
      setDiagnosticResults(suite.results);
      showToast(
        suite.allPassed
          ? 'All 8 Safe Diagnostic Verification Checks PASSED!'
          : 'Diagnostic suite completed — inspect results below.'
      );
    } finally {
      setIsRunningDiagnostics(false);
    }
  };

  const getStatusBadgeStyle = (status: string) => {
    const norm = normalizeQueueStatusLabel(status);
    switch (norm) {
      case 'Accepted by Gmail / Sent':
      case 'Reply Received (Confirmed)':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'Delivery Unconfirmed':
        return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
      case 'Queued':
        return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      case 'Sending':
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 animate-pulse';
      case 'Temporary Delivery Failure':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'Bounced / Rejected':
        return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
      case 'Failed to Send':
        return 'bg-red-500/15 text-red-400 border-red-500/30';
      case 'Needs Action':
      default:
        return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 p-4 rounded-2xl bg-slate-900 border border-blue-500/50 text-white text-xs shadow-2xl flex items-center gap-2 max-w-md">
          <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header & Persistent Queue Control Bar */}
      <div
        className={`p-6 rounded-3xl border transition-all ${
          theme === 'dark' ? 'bg-[#101625] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-extrabold tracking-tight">
                  Email Delivery Center & Persistent Queue
                </h1>
                <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  Strictly 1-by-1 Sequential Dispatch
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Crash-safe persistent queue · Gmail Sent deduplication before retry · Real-time bounce & DSN matching · Verified HR contact provenance
              </p>
            </div>
          </div>

          {/* Queue Controls: Start/Resume, Pause, Retry Failed, Cancel Pending */}
          <div className="flex items-center gap-2 flex-wrap">
            {!isProcessing ? (
              <button
                onClick={handleStartOrResumeQueue}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/25 transition-all cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                {isPaused ? 'Resume Queue' : `Start Queue (${counts.Queued})`}
              </button>
            ) : (
              <button
                onClick={handlePauseQueue}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all cursor-pointer"
              >
                <Pause className="w-3.5 h-3.5" />
                Pause Queue
              </button>
            )}

            <button
              onClick={handleRetryFailed}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-all cursor-pointer"
              title="Retries temporary failures while skipping permanent bounces or invalid addresses"
            >
              <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
              Retry Failed
            </button>

            <button
              onClick={handleCancelPending}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-rose-600/15 hover:bg-rose-600/25 text-rose-300 border border-rose-500/30 text-xs font-bold transition-all cursor-pointer"
            >
              <XCircle className="w-3.5 h-3.5" />
              Cancel Pending
            </button>

            <button
              onClick={handleSyncBouncesAndDeliveries}
              disabled={isSyncingBounces}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingBounces ? 'animate-spin' : ''}`} />
              Check Bounces / DSN
            </button>
          </div>
        </div>

        {/* Configurable Delay & Pacing Bar */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
              <Timer className="w-3.5 h-3.5 text-blue-400" />
              Delay Between Emails:
            </span>
            {[4, 8, 15, 30].map(sec => (
              <button
                key={sec}
                onClick={() => handleDelayChange(sec)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                  !isSlow10MinMode && delaySeconds === sec
                    ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                    : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {sec}s
              </button>
            ))}
            <button
              onClick={handleToggle10MinMode}
              className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                isSlow10MinMode
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              10-Min Conservative Batch
            </button>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-400">
            <span>
              Max Auto-Retries (Temp Failures):{' '}
              <strong className="text-slate-200">{persistentGmailQueueEngine.getMaxRetries()}</strong>
            </span>
            <span>·</span>
            <span>
              Duplicate Guard: <strong className="text-emerald-400">Checks Gmail Sent Before Retry</strong>
            </span>
          </div>
        </div>

        {/* Active Progress Banner */}
        {isProcessing && activeProgressItem && (
          <div className="mt-4 p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-blue-400 animate-spin" />
              <span className="text-xs font-bold text-blue-300">
                Sending #{activeProgressItem.queuePosition}: {activeProgressItem.company} ({activeProgressItem.recipient}) via {activeProgressItem.senderAccount}...
              </span>
            </div>
            <span className="text-[11px] font-bold text-blue-400">
              Attempt #{activeProgressItem.attemptCount || 1}
            </span>
          </div>
        )}
      </div>

      {/* Sender Account & Error Diagnostics Section (Requirements 2 & 7) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Authorized Gmail Sender Accounts Card */}
        <div
          className={`p-5 rounded-3xl border ${
            theme === 'dark' ? 'bg-[#101625] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-extrabold">Authorized Gmail Sender Accounts</h2>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              Google OAuth 2.0 Only (No Passwords)
            </span>
          </div>

          <div className="space-y-2.5">
            {senderAccounts.map(acc => (
              <div
                key={acc.email}
                className={`p-3 rounded-2xl border flex items-center justify-between gap-3 ${
                  acc.email.toLowerCase() === activeSender.email.toLowerCase()
                    ? 'bg-blue-500/10 border-blue-500/40'
                    : 'bg-slate-900/40 border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">{acc.email}</span>
                    {acc.isPrimaryDefault && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold">
                        Default Sender
                      </span>
                    )}
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                        acc.lastStatus === 'Ready'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {acc.lastStatus === 'Ready' ? 'Healthy' : acc.lastStatus}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Sent today: <strong>{acc.sentTodayCount}</strong> / 45 safe daily limit
                    {acc.connectedAt ? ` · Connected: ${new Date(acc.connectedAt).toLocaleDateString()}` : ''}
                  </p>
                </div>

                {acc.email.toLowerCase() !== activeSender.email.toLowerCase() && (
                  <button
                    onClick={() => {
                      switchActiveSenderAccount(acc.email);
                      setActiveSender(getActiveSenderAccount());
                      showToast(`Switched active sender to ${acc.email}`);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 cursor-pointer"
                  >
                    Use Account
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-400 leading-relaxed">{quotaDiagnostics.explanation}</p>
            <button
              onClick={handleConnectSecondGmailOAuth}
              disabled={isConnectingOAuth}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-bold transition-all cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5 text-blue-400" />
              {isConnectingOAuth ? 'Authorizing...' : 'Connect Another Gmail (OAuth)'}
            </button>
          </div>
        </div>

        {/* Root-Cause Diagnosis of Existing 550 5.4.317 Error & Safe Diagnostic Suite */}
        <div
          className={`p-5 rounded-3xl border ${
            theme === 'dark' ? 'bg-[#101625] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-extrabold">
                Root-Cause Diagnosis: Error 550 5.4.317 & Safe Verification Suite
              </h2>
            </div>
            <button
              onClick={() => setShowErrorDiagnosisCard(!showErrorDiagnosisCard)}
              className="text-[11px] text-slate-400 hover:text-slate-200 font-bold cursor-pointer"
            >
              {showErrorDiagnosisCard ? 'Hide Details' : 'Show Details'}
            </button>
          </div>

          {showErrorDiagnosisCard && (
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200/90 space-y-1.5 mb-3">
              <div className="font-bold text-amber-300">
                Diagnosed Bounce: arts.ambassador@ritzcarlton.com · PH0PR08MB11004.namprd08.prod.outlook.com
              </div>
              <div className="font-mono text-[10px] bg-slate-950/60 p-2 rounded-lg text-rose-300">
                550 5.4.317 Message expired, cannot connect to remote server (451 4.4.0 Socket error: ConnectionReset)
              </div>
              <p className="text-slate-300 leading-relaxed">
                <strong>Cause:</strong> This is a <strong>recipient-side remote mail server connection failure</strong>. Gmail successfully delivered the message to Ritz-Carlton&apos;s inbound Exchange Online Protection server (<code className="text-amber-300">PH0PR08MB11004.namprd08.prod.outlook.com</code>), but that server&apos;s internal downstream mail server repeatedly reset the TCP socket (<code className="text-amber-300">451 4.4.0 ConnectionReset</code>) until the delivery queue expired (<code className="text-amber-300">550 5.4.317</code>).
              </p>
              <p className="text-emerald-300 font-semibold">
                ✓ Your Gmail account (fazle.rabbe.doc@gmail.com) and CV attachment are healthy. Do NOT connect a second Gmail account for this error — use Ritz-Carlton&apos;s verified HR contact or official Marriott Careers portal instead.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <button
              onClick={() => handleRunSafeDiagnosticSuite(false)}
              disabled={isRunningDiagnostics}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-bold transition-all cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5" />
              {isRunningDiagnostics ? 'Running 8 Safe Tests...' : 'Run 8-Case Safe Diagnostic Suite'}
            </button>

            <button
              onClick={() => handleRunSafeDiagnosticSuite(true)}
              disabled={isRunningDiagnostics}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition-all cursor-pointer"
              title="Sends 1 real test email ONLY to your own fazle.rabbe.doc@gmail.com inbox"
            >
              <Send className="w-3.5 h-3.5" />
              Send Safe Self-Test to My Gmail
            </button>
          </div>
        </div>
      </div>

      {/* Safe 8-Case Diagnostic Suite Results Panel */}
      {diagnosticResults && (
        <div
          className={`p-5 rounded-3xl border ${
            theme === 'dark' ? 'bg-[#101625] border-emerald-500/40' : 'bg-white border-emerald-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-extrabold">
                Safe 8-Case Verification Results (Zero Real Employers Contacted)
              </h3>
            </div>
            <button
              onClick={() => setDiagnosticResults(null)}
              className="text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {diagnosticResults.map(test => (
              <div
                key={test.id}
                className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between gap-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    {test.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    {test.title}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
                    {test.statusLabel}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300">{test.summary}</p>
                <p className="text-[10px] text-slate-500 font-mono">{test.technicalDetails}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dedicated Email Delivery Center Filter Tabs (Requirement 3) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {(
          [
            'All',
            'Queued',
            'Sent',
            'Delivery Unconfirmed',
            'Bounced',
            'Failed',
            'Needs Action',
          ] as DeliveryCenterFilter[]
        ).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveFilter(tab)}
            className={`px-3.5 py-2 rounded-2xl text-xs font-bold border transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
              activeFilter === tab
                ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-600/20'
                : theme === 'dark'
                ? 'bg-[#101625] border-slate-800 text-slate-400 hover:text-white'
                : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>{tab === 'Sent' ? 'Accepted by Gmail / Sent' : tab}</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                activeFilter === tab ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {counts[tab]}
            </span>
          </button>
        ))}
      </div>

      {/* Email Delivery Center Records List */}
      <div
        className={`rounded-3xl border overflow-hidden ${
          theme === 'dark' ? 'bg-[#101625] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400">
            Showing {filteredRecords.length} of {unifiedRecords.length} application delivery records
          </span>
          <span className="text-[11px] text-slate-500">
            Note: &quot;Accepted by Gmail / Sent&quot; means Gmail accepted the send request; confirmed delivery is only shown when an employer reply is verified.
          </span>
        </div>

        <div className="divide-y divide-slate-800/60">
          {filteredRecords.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm">
              No records match the <strong>{activeFilter}</strong> filter.
            </div>
          ) : (
            filteredRecords.map(item => {
              const normStatus = normalizeQueueStatusLabel(item.status);
              const isEditingThis = editingItemId === item.id;

              return (
                <div
                  key={item.id}
                  className="p-4 hover:bg-slate-800/20 transition-all flex flex-col gap-3"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] font-bold">
                          #{item.queuePosition}
                        </span>
                        <span className="font-bold text-sm text-white">{item.company}</span>
                        <span className="text-xs text-blue-400 font-semibold">— {item.position}</span>
                        <span
                          className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold border ${getStatusBadgeStyle(
                            item.status
                          )}`}
                        >
                          {normStatus}
                        </span>
                      </div>

                      {/* Recipient, Sender Account, Attempt Count, Timestamps, Gmail Message ID */}
                      <div className="flex items-center gap-3 flex-wrap text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5 text-slate-500" />
                          To:{' '}
                          <strong className={item.recipient ? 'text-slate-200' : 'text-amber-400'}>
                            {item.recipient || 'No verified hiring contact found'}
                          </strong>
                        </span>
                        <span>·</span>
                        <span>
                          Sender: <strong className="text-slate-300">{item.senderAccount || 'fazle.rabbe.doc@gmail.com'}</strong>
                        </span>
                        <span>·</span>
                        <span>
                          Attempts: <strong className="text-slate-300">{item.attemptCount ?? item.retryCount ?? 0}</strong>
                        </span>
                        {item.lastAttemptAt && (
                          <>
                            <span>·</span>
                            <span>
                              Last Attempt:{' '}
                              <strong className="text-slate-300">
                                {new Date(item.lastAttemptAt).toLocaleString('en-GB')}
                              </strong>
                            </span>
                          </>
                        )}
                        {item.gmailMessageId && (
                          <>
                            <span>·</span>
                            <span className="text-emerald-400 font-mono text-[11px]">
                              Gmail ID: {item.gmailMessageId}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Hiring Contact Verification Provenance (Requirement 4) */}
                      <div className="flex items-center gap-2 flex-wrap pt-1 text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                          Contact Type:{' '}
                          <strong>
                            {item.contactType === 'Vacancy Stated Email'
                              ? 'Priority 1: Vacancy-Stated Email'
                              : item.contactType === 'Official HR / Recruitment'
                              ? 'Priority 2: Official HR / Recruitment'
                              : item.contactType === 'Official Portal Only'
                              ? 'Official Career Portal Required'
                              : 'Needs Verification'}
                          </strong>
                        </span>
                        {item.contactConfidence && (
                          <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                            Confidence: <strong className="uppercase">{item.contactConfidence}</strong>
                          </span>
                        )}
                        {item.contactFoundOnPage && (
                          <span className="text-slate-400">
                            Source: <strong className="text-slate-300">{item.contactFoundOnPage}</strong>
                          </span>
                        )}
                        {item.contactVerificationDate && (
                          <span className="text-slate-500">Verified: {item.contactVerificationDate}</span>
                        )}
                        {item.contactSourceUrl && (
                          <a
                            href={item.contactSourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 font-semibold"
                          >
                            Verify Source <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>

                      {/* Error Explanation & Recommended Action */}
                      {item.errorReason && (
                        <div className="mt-1.5 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-[11px] text-rose-300 space-y-1">
                          <div>
                            <strong>Diagnostic Explanation:</strong> {item.errorReason}
                          </div>
                          {item.recommendedAction && (
                            <div className="text-amber-300">
                              <strong>Action:</strong> {item.recommendedAction}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Direct Retry / Resolve / Portal / Preview Actions */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {(normStatus === 'Temporary Delivery Failure' ||
                        normStatus === 'Failed to Send' ||
                        normStatus === 'Needs Action' ||
                        normStatus === 'Bounced / Rejected') && (
                        <>
                          <button
                            onClick={() => {
                              const res = persistentGmailQueueEngine.retryItem(item.id);
                              if (res.success) {
                                showToast(`Moved ${item.company} back to Queued.`);
                              } else {
                                showToast(res.reason || 'Please update the recipient address before retrying.');
                                setEditingItemId(item.id);
                                setEditedRecipientEmail(item.recipient || '');
                              }
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-bold cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Retry
                          </button>

                          <button
                            onClick={() => {
                              setEditingItemId(isEditingThis ? null : item.id);
                              setEditedRecipientEmail(item.recipient || '');
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-bold cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Resolve / Edit Email
                          </button>
                        </>
                      )}

                      {(item.officialPortalUrl || item.contactSourceUrl) && (
                        <a
                          href={item.officialPortalUrl || item.contactSourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                          Official Portal
                        </a>
                      )}

                      {item.bodyText && (
                        <button
                          onClick={() => setPreviewItem(item)}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                          title="Preview Cover Letter & CV Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}

                      {!item.id.startsWith('hist-') && (
                        <button
                          onClick={() => {
                            persistentGmailQueueEngine.removeItem(item.id);
                            showToast(`Removed ${item.company} from queue.`);
                          }}
                          className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 cursor-pointer"
                          title="Remove from Queue"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline Resolve / Correct Recipient Email Box */}
                  {isEditingThis && (
                    <div className="p-3 rounded-2xl bg-slate-900/90 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center gap-2">
                      <span className="text-xs font-bold text-amber-300 shrink-0">
                        Verified HR / Careers Email:
                      </span>
                      <input
                        type="email"
                        value={editedRecipientEmail}
                        onChange={e => setEditedRecipientEmail(e.target.value)}
                        placeholder="e.g., careers@company.com or hr@hotel.com"
                        className="flex-1 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={() => handleSaveRecipientOverride(item.id)}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                      >
                        Verify & Re-Queue
                      </button>
                      <button
                        onClick={() => setEditingItemId(null)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-400 text-xs font-bold cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-2xl rounded-3xl border p-6 space-y-4 ${
              theme === 'dark' ? 'bg-[#101625] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-base">
                  {previewItem.company} — {previewItem.position}
                </h3>
                <p className="text-xs text-blue-400">
                  To: {previewItem.recipient || 'Official Portal'} · Status: {normalizeQueueStatusLabel(previewItem.status)}
                </p>
              </div>
              <button
                onClick={() => setPreviewItem(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-900 text-slate-300 font-semibold">
                Subject: {previewItem.subject}
              </div>
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto text-slate-300">
                {previewItem.bodyText}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setPreviewItem(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
