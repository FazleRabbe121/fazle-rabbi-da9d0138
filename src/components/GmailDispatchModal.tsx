import React, { useState, useEffect, useMemo } from 'react';
import {
  Mail,
  Send,
  X,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  FileText,
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
  Loader2,
  LogIn,
  Globe,
  Download,
  RefreshCw,
  Eye,
} from 'lucide-react';
import { PreparedJobApplication } from '../types/jobApplication';
import {
  GmailService,
  createGmailWebmailUrl,
  getPreservedFailedApplication,
  hasAlreadySentApplication,
  generatePersonalizedCoverLetterWithGemini,
} from '../services/gmailService';
import {
  loadCVLibrary,
  getActiveCVId,
  setActiveCVId,
  getCVAttachmentPayload,
  resolveCVAttachmentPayloadAsync,
} from '../services/cvStorage';
import { generateCoverLetterPdfBase64, isValidPdfBase64 } from '../services/pdfExporter';
import { CVDocumentItem } from '../types/cv';
import { resolveVerifiedEmployerEmail } from '../utils/verifiedEmployerEmails';

interface GmailDispatchModalProps {
  application: PreparedJobApplication;
  pdfBase64?: string;
  pdfFilename?: string;
  selectedCvId?: string;
  onClose: () => void;
  onSendApproved?: (updatedApp: PreparedJobApplication, messageId?: string) => void;
  onSentSuccess?: (messageId?: string, updatedApp?: PreparedJobApplication) => void;
}

export const GmailDispatchModal: React.FC<GmailDispatchModalProps> = ({
  application,
  pdfBase64,
  pdfFilename = 'Fazle_Rabbi_CV.pdf',
  selectedCvId,
  onClose,
  onSendApproved,
  onSentSuccess,
}) => {
  const savedCvs = useMemo<CVDocumentItem[]>(() => loadCVLibrary(), []);
  const initialCvId = selectedCvId || getActiveCVId() || savedCvs[0]?.id || '';

  const resolvedInitialEmail = useMemo(() => {
    const raw = application.recipientEmail || (application as any).email || '';
    const check = resolveVerifiedEmployerEmail(raw, application.company);
    return check.verifiedEmail || raw;
  }, [application.recipientEmail, (application as any).email, application.company]);

  const preservedDraft = useMemo(
    () =>
      getPreservedFailedApplication({
        jobId: application.id,
        recipient: resolvedInitialEmail,
        company: application.company,
        position: application.position,
      }),
    [application, resolvedInitialEmail]
  );

  const duplicateCheck = useMemo(
    () =>
      hasAlreadySentApplication({
        jobId: application.id,
        recipient: resolvedInitialEmail,
        company: application.company,
        position: application.position,
      }),
    [application, resolvedInitialEmail]
  );

  const [chosenCvId, setChosenCvId] = useState<string>(preservedDraft?.selectedCvId || initialCvId);
  const [recipientEmail, setRecipientEmail] = useState(() => {
    const draftEmail = preservedDraft?.recipient || resolvedInitialEmail || '';
    const check = resolveVerifiedEmployerEmail(draftEmail, application.company);
    return check.verifiedEmail || draftEmail;
  });
  const [subject, setSubject] = useState(
    preservedDraft?.subject ||
      application.subject ||
      `Application for ${application.position} – Fazle Rabbi Boyati`
  );
  const [bodyText, setBodyText] = useState(
    preservedDraft?.coverLetter || application.coverLetter || ''
  );
  const [attachCoverLetterPdf, setAttachCoverLetterPdf] = useState<boolean>(
    preservedDraft?.attachCoverLetterPdf !== undefined ? preservedDraft.attachCoverLetterPdf : true
  );
  const [forceResend, setForceResend] = useState(false);

  const [isSending, setIsSending] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isGeneratingAiCl, setIsGeneratingAiCl] = useState(false);
  const [previewAttachmentType, setPreviewAttachmentType] = useState<'cv' | 'cl' | null>(null);
  const [hydratedCvBase64, setHydratedCvBase64] = useState<string>('');
  const [sendSuccess, setSendSuccess] = useState(false);
  const [verifiedMessageId, setVerifiedMessageId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(preservedDraft?.lastError || null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [gmailStatus, setGmailStatus] = useState<{
    connected: boolean;
    email: string | null;
  }>({ connected: false, email: null });

  // Test Actual Delivery state
  const [testEmailAddress, setTestEmailAddress] = useState<string>('fazle.rabbe.doc@gmail.com');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testDeliveryResult, setTestDeliveryResult] = useState<{
    success: boolean;
    messageId?: string;
    recipient?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    const status = GmailService.getConnectionStatus();
    setGmailStatus({ connected: status.connected, email: status.email });
    if (status.email) {
      setTestEmailAddress(status.email);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    resolveCVAttachmentPayloadAsync(chosenCvId).then((res) => {
      if (!cancelled && res.base64) {
        setHydratedCvBase64(res.base64);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [chosenCvId]);

  // Resolve the active CV attachment payload whenever chosenCvId changes
  const resolvedCvAttachment = useMemo(() => {
    const payload = getCVAttachmentPayload(chosenCvId);
    const effectiveB64 = hydratedCvBase64 || payload.base64;
    if (pdfBase64 && isValidPdfBase64(pdfBase64) && chosenCvId === initialCvId && !payload.isUploadedFile) {
      return {
        filename: pdfFilename || payload.filename,
        base64: pdfBase64,
        mimeType: 'application/pdf',
        isValid: true,
        isUploadedFile: false,
        cvDocument: payload.cvDocument,
      };
    }
    return {
      filename: payload.filename,
      base64: effectiveB64,
      mimeType: payload.mimeType,
      isValid: payload.mimeType !== 'application/pdf' || isValidPdfBase64(effectiveB64),
      isUploadedFile: payload.isUploadedFile,
      cvDocument: payload.cvDocument,
    };
  }, [chosenCvId, pdfBase64, pdfFilename, initialCvId, hydratedCvBase64]);

  const coverLetterPdfFilename = useMemo(() => {
    const safeComp = (application.company || 'Employer')
      .replace(/[^\w\d-_]/g, '_')
      .replace(/_+/g, '_');
    return `Cover_Letter_${safeComp}.pdf`;
  }, [application.company]);

  const handleConnectGmail = async () => {
    setIsConnecting(true);
    setErrorMsg(null);
    const res = await GmailService.connectGmailAccount();
    setIsConnecting(false);
    if (res.connected) {
      setGmailStatus({ connected: true, email: res.email });
      if (res.email) setTestEmailAddress(res.email);
    } else if (res.error) {
      setErrorMsg(res.error);
    }
  };

  const handleDownloadCvPreview = () => {
    if (!resolvedCvAttachment.base64) return;
    const link = document.createElement('a');
    link.href = `data:${resolvedCvAttachment.mimeType};base64,${resolvedCvAttachment.base64}`;
    link.download = resolvedCvAttachment.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadCoverLetterPreview = () => {
    const b64 = generateCoverLetterPdfBase64({
      employer: application.company,
      jobTitle: application.position,
      country: application.location,
      coverLetterText: bodyText,
    });
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${b64}`;
    link.download = coverLetterPdfFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePersonalizeWithGemini = async () => {
    setIsGeneratingAiCl(true);
    setErrorMsg(null);
    try {
      const res = await generatePersonalizedCoverLetterWithGemini({
        company: application.company,
        jobTitle: application.position,
        location: application.location,
        selectedCvId: chosenCvId,
      });
      if (res.coverLetter) {
        setBodyText(res.coverLetter);
      }
      if (res.subjectLine) {
        setSubject(res.subjectLine);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not personalize cover letter with Gemini.');
    } finally {
      setIsGeneratingAiCl(false);
    }
  };

  const handleTestActualDelivery = async () => {
    if (!testEmailAddress.trim() || !testEmailAddress.includes('@')) {
      setTestDeliveryResult({
        success: false,
        error: 'Please enter a valid email address you control to test delivery.',
      });
      return;
    }

    setIsSendingTest(true);
    setTestDeliveryResult(null);

    try {
      const currentStatus = GmailService.getConnectionStatus();
      if (!currentStatus.connected) {
        const authRes = await GmailService.connectGmailAccount();
        if (!authRes.connected) {
          setTestDeliveryResult({
            success: false,
            error: authRes.error || 'Please connect Gmail first to test actual delivery.',
          });
          setIsSendingTest(false);
          return;
        }
        setGmailStatus({ connected: true, email: authRes.email });
      }

      const res = await GmailService.sendTestDeliveryEmail({
        testRecipientEmail: testEmailAddress.trim(),
        subject,
        body: bodyText,
        selectedCvId: chosenCvId,
        company: application.company,
        position: application.position,
        location: application.location,
        attachCoverLetterPdf,
      });

      if (res.success && res.messageId) {
        setTestDeliveryResult({
          success: true,
          messageId: res.messageId,
          recipient: testEmailAddress.trim(),
        });
      } else {
        setTestDeliveryResult({
          success: false,
          error: res.error || 'Test email delivery failed.',
        });
      }
    } catch (err: any) {
      setTestDeliveryResult({
        success: false,
        error: err?.message || 'Error sending test email.',
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleOpenWebmailDraftOnly = () => {
    if (!recipientEmail.trim() || !recipientEmail.includes('@')) {
      setErrorMsg('Please enter a valid recipient email address first.');
      return;
    }
    const webmailUrl = createGmailWebmailUrl({
      recipient: recipientEmail.trim(),
      subject: subject.trim(),
      bodyText: bodyText.trim(),
    });
    window.open(webmailUrl, '_blank', 'noopener,noreferrer');
  };

  const handleSendViaGmailApi = async () => {
    if (!recipientEmail.trim() || !recipientEmail.includes('@')) {
      setErrorMsg('Please enter a valid recipient email address.');
      return;
    }

    if (duplicateCheck.alreadySent && !forceResend) {
      setErrorMsg(
        `Duplicate prevented: You already sent an application to ${recipientEmail} for ${application.company} (Message ID: ${duplicateCheck.record?.messageId}). Check "Allow Resend" below only if you intentionally want to send again.`
      );
      return;
    }

    setIsSending(true);
    setErrorMsg(null);

    try {
      const currentStatus = GmailService.getConnectionStatus();
      if (!currentStatus.connected) {
        const authRes = await GmailService.connectGmailAccount();
        if (!authRes.connected) {
          setErrorMsg(
            authRes.error ||
              'Gmail authorization is required to attach PDF files and confirm delivery.'
          );
          setIsSending(false);
          return;
        }
        setGmailStatus({ connected: true, email: authRes.email });
      }

      const clPdfBase64 = attachCoverLetterPdf
        ? generateCoverLetterPdfBase64({
            employer: application.company,
            jobTitle: application.position,
            country: application.location,
            coverLetterText: bodyText,
          })
        : undefined;

      const res = await GmailService.sendJobApplication({
        to: recipientEmail.trim(),
        subject: subject.trim(),
        body: bodyText,
        selectedCvId: chosenCvId,
        pdfBase64: resolvedCvAttachment.base64,
        pdfFilename: resolvedCvAttachment.filename,
        attachCoverLetterPdf,
        coverLetterPdfBase64: clPdfBase64,
        coverLetterPdfFilename: attachCoverLetterPdf ? coverLetterPdfFilename : undefined,
        company: application.company,
        position: application.position,
        location: application.location,
        jobId: application.id,
        cvTitle: resolvedCvAttachment.cvDocument?.title || resolvedCvAttachment.filename,
        allowResend: forceResend,
      });

      if (res.success && res.messageId) {
        const finalRecipient = recipientEmail.trim();
        setRecipientEmail(finalRecipient);
        setVerifiedMessageId(res.messageId);
        setSendSuccess(true);
        const updatedAppPayload: PreparedJobApplication = {
          ...application,
          recipientEmail: finalRecipient,
          subject: subject.trim(),
          coverLetter: bodyText,
          status: 'sent',
          sentTimestamp: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
        };
        setTimeout(() => {
          if (typeof onSendApproved === 'function') {
            onSendApproved(updatedAppPayload, res.messageId);
          }
          if (typeof onSentSuccess === 'function') {
            onSentSuccess(res.messageId, updatedAppPayload);
          }
        }, 1400);
      } else {
        setErrorMsg(
          res.error ||
            'Delivery could not be verified by Gmail API. Your prepared application has been saved so you can retry safely.'
        );
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Unexpected error during Gmail API dispatch.');
    } finally {
      setIsSending(false);
    }
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700/80 shadow-[0_24px_60px_-15px_rgba(15,23,42,0.18)] overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
        {/* Top Header — Application Preview */}
        <div className="flex flex-col gap-3 px-6 pt-5 pb-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-indigo-500/20 border border-blue-200/80 dark:border-indigo-500/40 flex items-center justify-center text-[#2563eb] dark:text-indigo-400 shadow-xs">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
                    Application Preview
                  </h3>
                  <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 rounded-full border border-emerald-200 dark:border-emerald-500/30 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> PDF CV + Cover Letter
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Applying to <span className="text-slate-800 dark:text-slate-200 font-semibold">{application.company}</span>{' '}
                  — {application.position} ({application.location})
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Reference Screen 5 Tabs: Email | CV | Cover Letter */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setPreviewAttachmentType(null)}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                previewAttachmentType === null
                  ? 'bg-[#2563eb] text-white shadow-sm shadow-blue-600/20'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70'
              }`}
            >
              Email
            </button>
            <button
              type="button"
              onClick={() => setPreviewAttachmentType(prev => (prev === 'cv' ? null : 'cv'))}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                previewAttachmentType === 'cv'
                  ? 'bg-[#2563eb] text-white shadow-sm shadow-blue-600/20'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70'
              }`}
            >
              CV
            </button>
            <button
              type="button"
              onClick={() => setPreviewAttachmentType(prev => (prev === 'cl' ? null : 'cl'))}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${
                previewAttachmentType === 'cl'
                  ? 'bg-[#2563eb] text-white shadow-sm shadow-blue-600/20'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70'
              }`}
            >
              Cover Letter
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 bg-[#f8fafc] dark:bg-slate-900">
          {/* Gmail Connection Status Bar */}
          <div
            className={`flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl border ${
              gmailStatus.connected
                ? 'bg-emerald-50/90 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                : 'bg-amber-50/90 dark:bg-amber-950/30 border-amber-200 dark:border-amber-500/40 text-amber-800 dark:text-amber-200'
            }`}
          >
            <div className="flex items-center gap-2.5 text-xs">
              {gmailStatus.connected ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    Connected to Gmail API:{' '}
                    <strong className="text-slate-900 dark:text-white">{gmailStatus.email || 'Authorized Account'}</strong>{' '}
                    (Real PDF attachment & delivery verification active)
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>
                    Connect your Google Gmail account to send with real PDF CV & Cover Letter attachments and verified delivery confirmation.
                  </span>
                </>
              )}
            </div>
            <button
              onClick={handleConnectGmail}
              disabled={isConnecting}
              className="px-3.5 py-1.5 rounded-xl bg-[#2563eb] hover:bg-blue-700 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors shrink-0 shadow-xs"
            >
              {isConnecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <LogIn className="w-3.5 h-3.5" />
              )}
              {gmailStatus.connected ? 'Reconnect / Switch Gmail' : 'Authorize Gmail API'}
            </button>
          </div>

          {/* Duplicate Prevention Warning Banner */}
          {duplicateCheck.alreadySent && duplicateCheck.record && (
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-500/40 text-amber-800 dark:text-amber-200 text-xs flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-900 dark:text-amber-100">
                    Duplicate Protection Active — Already Sent
                  </p>
                  <p className="text-amber-700 dark:text-amber-200/90 mt-0.5">
                    You already delivered an application to{' '}
                    <strong>{duplicateCheck.record.recipient}</strong> on{' '}
                    {duplicateCheck.record.timestamp} (Gmail Message ID:{' '}
                    <code className="text-amber-800 dark:text-amber-300">{duplicateCheck.record.messageId}</code>).
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={forceResend}
                  onChange={(e) => setForceResend(e.target.checked)}
                  className="rounded border-amber-500"
                />
                Allow Resend
              </label>
            </div>
          )}

          {/* Restored Preserved Draft Notice */}
          {preservedDraft && !duplicateCheck.alreadySent && (
            <div className="p-3 rounded-2xl bg-blue-50 dark:bg-indigo-950/40 border border-blue-200 dark:border-indigo-500/30 text-blue-800 dark:text-indigo-200 text-xs flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-blue-600 dark:text-indigo-400 shrink-0" />
              <span>
                Restored your preserved application draft from{' '}
                {new Date(preservedDraft.updatedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                . No duplicate email was sent.
              </span>
            </div>
          )}

          {/* Email Card (To, Subject, Body Preview) matching Reference Screen 5 */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/80 shadow-xs space-y-4">
            {/* Recipient & Subject */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    To:
                  </label>
                  <button
                    onClick={() => handleCopy(recipientEmail, 'email')}
                    className="text-xs text-[#2563eb] dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
                  >
                    {copiedField === 'email' ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    {copiedField === 'email' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="hr@hotel-career.com"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white font-medium focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    Subject:
                  </label>
                  <button
                    onClick={() => handleCopy(subject, 'subject')}
                    className="text-xs text-[#2563eb] dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
                  >
                    {copiedField === 'subject' ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    {copiedField === 'subject' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white font-semibold focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Personalized Cover Letter Body */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  Personalized Cover Letter (Email Body & PDF)
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handlePersonalizeWithGemini}
                    disabled={isGeneratingAiCl}
                    className="px-3 py-1 rounded-xl bg-violet-50 dark:bg-indigo-600/20 hover:bg-violet-100 dark:hover:bg-indigo-600/30 border border-violet-200 dark:border-indigo-500/40 text-xs font-semibold text-violet-700 dark:text-indigo-300 flex items-center gap-1.5 transition-colors"
                  >
                    {isGeneratingAiCl ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-violet-600 dark:text-indigo-400" />
                    )}
                    {isGeneratingAiCl ? 'Personalizing with Gemini...' : 'Personalize with Gemini'}
                  </button>
                  <button
                    onClick={() => handleCopy(bodyText, 'body')}
                    className="text-xs text-[#2563eb] dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
                  >
                    {copiedField === 'body' ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    {copiedField === 'body' ? 'Copied' : 'Copy Letter'}
                  </button>
                </div>
              </div>
              <textarea
                rows={7}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-sans focus:outline-none focus:border-blue-500 resize-y"
              />
            </div>
          </div>

          {/* Attached PDF Files Section — Matching Reference Screen 5 Red PDF Cards */}
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/80 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#2563eb]" />
                Attached Documents
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  resolvedCvAttachment.isValid
                    ? 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {resolvedCvAttachment.isValid
                  ? `Valid ${resolvedCvAttachment.mimeType === 'application/pdf' ? 'PDF' : 'DOCX'} Ready (${Math.round(
                      (resolvedCvAttachment.base64.length * 0.75) / 1024
                    )} KB)`
                  : 'Regenerating PDF...'}
              </span>
            </div>

            {/* CV Attachment Card with Red PDF Badge */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-xl bg-rose-500 text-white font-extrabold text-[11px] flex items-center justify-center shrink-0 shadow-xs">
                  PDF
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {resolvedCvAttachment.filename}
                  </div>
                  <select
                    value={chosenCvId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setChosenCvId(nextId);
                      setActiveCVId(nextId);
                    }}
                    className="mt-1 w-full px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                  >
                    {savedCvs.map((cv) => (
                      <option key={cv.id} value={cv.id}>
                        {cv.title} {cv.isUploadedFile || cv.fileBase64 ? `— Original Uploaded (${cv.originalFile?.fileName || cv.name})` : '(AI/Structured CV)'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setPreviewAttachmentType((prev) => (prev === 'cv' ? null : 'cv'))
                  }
                  className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-indigo-600/20 hover:bg-blue-100 text-xs font-semibold text-[#2563eb] dark:text-indigo-300 border border-blue-200/80 dark:border-indigo-500/40 flex items-center gap-1 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  {previewAttachmentType === 'cv' ? 'Hide' : 'Preview'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCvPreview}
                  title={`Download ${resolvedCvAttachment.filename}`}
                  className="p-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Cover Letter PDF Attachment Card with Red PDF Badge */}
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <label className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer">
                <div className="w-10 h-10 rounded-xl bg-rose-500 text-white font-extrabold text-[11px] flex items-center justify-center shrink-0 shadow-xs">
                  PDF
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={attachCoverLetterPdf}
                      onChange={(e) => setAttachCoverLetterPdf(e.target.checked)}
                      className="rounded border-slate-300 text-[#2563eb] focus:ring-blue-500"
                    />
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {coverLetterPdfFilename}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Personalized Cover Letter in email body & attached as PDF
                  </p>
                </div>
              </label>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setPreviewAttachmentType((prev) => (prev === 'cl' ? null : 'cl'))
                  }
                  className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-indigo-600/20 hover:bg-blue-100 text-xs font-semibold text-[#2563eb] dark:text-indigo-300 border border-blue-200/80 dark:border-indigo-500/40 flex items-center gap-1 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  {previewAttachmentType === 'cl' ? 'Hide' : 'Preview'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCoverLetterPreview}
                  title={`Download ${coverLetterPdfFilename}`}
                  className="p-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Inline Attachment Preview Panel */}
            {previewAttachmentType && (
              <div className="mt-3 p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-blue-200 dark:border-indigo-500/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#2563eb] dark:text-indigo-300 flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" />
                    {previewAttachmentType === 'cv'
                      ? `Previewing Attached CV: ${resolvedCvAttachment.filename}`
                      : `Previewing Attached Cover Letter PDF: ${coverLetterPdfFilename}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewAttachmentType(null)}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white"
                  >
                    Close Preview
                  </button>
                </div>
                {previewAttachmentType === 'cv' ? (
                  resolvedCvAttachment.mimeType === 'application/pdf' && resolvedCvAttachment.base64 ? (
                    <iframe
                      title="Actual CV Attachment Preview"
                      src={`data:application/pdf;base64,${resolvedCvAttachment.base64}`}
                      className="w-full h-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white"
                    />
                  ) : (
                    <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 flex items-center justify-between">
                      <span>
                        Original Word Document attached: <strong>{resolvedCvAttachment.filename}</strong> (
                        {Math.round((resolvedCvAttachment.base64.length * 0.75) / 1024)} KB)
                      </span>
                      <button
                        type="button"
                        onClick={handleDownloadCvPreview}
                        className="px-3 py-1.5 rounded-xl bg-[#2563eb] text-white font-semibold"
                      >
                        Download Original File to Inspect
                      </button>
                    </div>
                  )
                ) : (
                  <iframe
                    title="Cover Letter PDF Preview"
                    src={`data:application/pdf;base64,${generateCoverLetterPdfBase64({
                      employer: application.company,
                      jobTitle: application.position,
                      country: application.location,
                      coverLetterText: bodyText,
                    })}`}
                    className="w-full h-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white"
                  />
                )}
              </div>
            )}
          </div>

          {/* Test Actual Delivery Section */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-800/40 border border-slate-200/90 dark:border-slate-700/70 space-y-2 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Test Actual Delivery First (Send to an Email Address You Control)
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Sends this exact email + attached CV PDF + Cover Letter PDF to your own inbox to verify arrival.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                value={testEmailAddress}
                onChange={(e) => setTestEmailAddress(e.target.value)}
                placeholder="Enter your email address to test delivery..."
                className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleTestActualDelivery}
                disabled={isSendingTest}
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 shrink-0 shadow-xs"
              >
                {isSendingTest ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                Send Test Email to Me
              </button>
            </div>
            {testDeliveryResult && (
              <div
                className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                  testDeliveryResult.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-200'
                    : 'bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-500/40 text-red-800 dark:text-red-200'
                }`}
              >
                {testDeliveryResult.success ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>
                      <strong>Verified Test Delivery!</strong> Delivered to{' '}
                      <span className="underline">{testDeliveryResult.recipient}</span> with CV PDF
                      & Cover Letter attached (Gmail Message ID:{' '}
                      <code className="text-emerald-700 dark:text-emerald-300">{testDeliveryResult.messageId}</code>).
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                    <span>{testDeliveryResult.error}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Feedback Banners */}
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-500/40 text-red-800 dark:text-red-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold block">{errorMsg}</span>
                <span className="text-[11px] text-red-600/80 dark:text-red-300/80 block">
                  Status remains Unsent. Your prepared cover letter and selected CV are preserved so you can retry without re-typing.
                </span>
              </div>
            </div>
          )}

          {sendSuccess && (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-200 text-sm flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <p className="font-bold text-slate-900 dark:text-white">
                  Application Verified & Accepted by Gmail API!
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  Gmail Message ID: <code>{verifiedMessageId}</code> · Attached:{' '}
                  {resolvedCvAttachment.filename}
                  {attachCoverLetterPdf ? ` + ${coverLetterPdfFilename}` : ''}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-white dark:bg-slate-950/90 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            {application.applicationUrl && (
              <a
                href={application.applicationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Employer Job Page
              </a>
            )}
            <button
              type="button"
              onClick={handleOpenWebmailDraftOnly}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Opens Gmail web compose with text only (does not attach files or mark as Sent)"
            >
              <Globe className="w-3.5 h-3.5 text-[#2563eb] dark:text-indigo-400" />
              Open Text Draft
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold transition-colors"
            >
              Cancel
            </button>

            <button
              onClick={handleSendViaGmailApi}
              disabled={isSending || sendSuccess}
              className="px-6 py-2.5 rounded-xl bg-[#2563eb] hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-blue-600/25 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending Application...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Application
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
