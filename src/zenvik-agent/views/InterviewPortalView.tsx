import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  Play,
  Square,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldAlert,
  RotateCcw,
  Award,
  BookOpen,
  Wrench,
  Coffee,
  UtensilsCrossed,
  Wine,
  Zap,
  Droplets,
  Languages,
  LogOut,
  ChevronRight,
  Lock,
  FileText,
  RefreshCw,
  HelpCircle,
  Mail,
  KeyRound,
  ArrowRight,
} from 'lucide-react';
import {
  checkParticipantEmailAuthMode,
  enterInterviewWithEmail,
  logoutInterviewParticipant,
  verifyInterviewPortalAccess,
  fetchParticipantPortalOverview,
  startNewInterviewAttempt,
  fetchInterviewAttemptById,
  submitInterviewAnswer,
  completeInterviewAttempt,
  translateSpokenTranscriptToEnglish,
  transcribeSpokenAudioWithGemini,
  synthesizeQuestionAudioWithGemini,
  getRememberedParticipantEmail,
  isDedicatedInterviewPortalUrl,
  ActiveQuestionPayload,
} from '../services/interviewCenterService';
import {
  ApprovedParticipant,
  InterviewAttemptRecord,
  InterviewAnswerRecord,
  InterviewRoleId,
  InterviewLevel,
  InterviewMode,
  RubricConfig,
} from '../types/interviewCenter';
import {
  ROLE_METADATA,
  SPOKEN_INTERVIEW_INSTRUCTION,
  DEFAULT_RUBRIC_CONFIG,
} from '../data/interviewQuestionBank';
import {
  EnglishLevelExamModule,
  CEFR_LEVELS,
} from '../components/EnglishLevelExamModule';
import {
  CertificatePreselection,
  mapAttemptToCertificatePreselection,
  setPendingCertificatePreselection,
} from '../services/certificateService';
import { CertificateGeneratorView } from './CertificateGeneratorView';
import { CCDLogo } from '../components/CCDLogo';

interface InterviewPortalViewProps {
  onExitPortal: () => void;
  isAdminPreview?: boolean;
  isDedicatedPortal?: boolean;
  onSwitchToAdminPanel?: () => void;
  onGetCertificate?: (pre: CertificatePreselection) => void;
}

const ROLE_ICONS: Record<InterviewRoleId, React.FC<{ className?: string }>> = {
  waiter: UtensilsCrossed,
  bartender: Wine,
  barista: Coffee,
  electrician: Zap,
  plumber: Droplets,
  cefr_english: Languages,
};

const SPOKEN_LANGUAGE_OPTIONS = [
  { code: 'auto', bcp47: 'en-US', label: 'English — International / Auto-Detect' },
  { code: 'en-GB', bcp47: 'en-GB', label: 'English (UK / British Accent)' },
  { code: 'en-US', bcp47: 'en-US', label: 'English (US / North American Accent)' },
  { code: 'en-IN', bcp47: 'en-IN', label: 'English (South Asian Accent)' },
  { code: 'bn', bcp47: 'bn-BD', label: 'Bengali — বাংলা (Auto-Translates to English)' },
  { code: 'hi', bcp47: 'hi-IN', label: 'Hindi — हिन्दी (Auto-Translates to English)' },
  { code: 'ur', bcp47: 'ur-PK', label: 'Urdu — اردو (Auto-Translates to English)' },
  { code: 'ar', bcp47: 'ar-SA', label: 'Arabic — العربية (Auto-Translates to English)' },
  { code: 'es', bcp47: 'es-ES', label: 'Spanish — Español (Auto-Translates to English)' },
  { code: 'fr', bcp47: 'fr-FR', label: 'French — Français (Auto-Translates to English)' },
  { code: 'pt', bcp47: 'pt-BR', label: 'Portuguese — Português (Auto-Translates to English)' },
  { code: 'ru', bcp47: 'ru-RU', label: 'Russian — Русский (Auto-Translates to English)' },
  { code: 'tl', bcp47: 'tl-PH', label: 'Filipino / Tagalog (Auto-Translates to English)' },
  { code: 'ne', bcp47: 'ne-NP', label: 'Nepali — नेपाली (Auto-Translates to English)' },
];

const LEVEL_PASS_REQUIREMENTS_PREVIEW: Record<string, { passScore: number; minQs: number; summary: string }> = {
  '1': {
    passScore: 65,
    minQs: 3,
    summary: 'Level 1 (Basic): 65/100 Pass Threshold · Min 3 Questions · Foundational duties, polite English & basic safety.',
  },
  '2': {
    passScore: 70,
    minQs: 3,
    summary: 'Level 2 (Intermediate): 70/100 Pass Threshold · Min 3 Questions · Troubleshooting, service recovery & safety protocols.',
  },
  '3': {
    passScore: 75,
    minQs: 3,
    summary: 'Level 3 (Advanced): 75/100 Pass Threshold · Min 3 Questions · Complex diagnostics, leadership & strict compliance.',
  },
  A1: { passScore: 60, minQs: 3, summary: 'CEFR A1 (Beginner): 60/100 Pass Threshold · Simple everyday phrases & present tense.' },
  A2: { passScore: 65, minQs: 3, summary: 'CEFR A2 (Elementary): 65/100 Pass Threshold · Connected short sentences & past/future.' },
  B1: { passScore: 70, minQs: 3, summary: 'CEFR B1 (Intermediate): 70/100 Pass Threshold · Connected explanations & reasons.' },
  B2: { passScore: 72, minQs: 3, summary: 'CEFR B2 (Upper Intermediate): 72/100 Pass Threshold · Detailed arguments & comparisons.' },
  C1: { passScore: 75, minQs: 3, summary: 'CEFR C1 (Advanced): 75/100 Pass Threshold · Nuanced vocabulary & complex structure.' },
  C2: { passScore: 78, minQs: 3, summary: 'CEFR C2 (Proficient): 78/100 Pass Threshold · Precision, synthesis & counterarguments.' },
};

export const InterviewPortalView: React.FC<InterviewPortalViewProps> = ({
  onExitPortal,
  isAdminPreview = false,
  isDedicatedPortal = false,
  onSwitchToAdminPanel,
  onGetCertificate,
}) => {
  const [inlineCertPreselection, setInlineCertPreselection] = useState<CertificatePreselection | null>(null);
  const [showInlineCertificateView, setShowInlineCertificateView] = useState(false);

  const handleOpenCertificateForPreselection = (pre: CertificatePreselection) => {
    setPendingCertificatePreselection(pre);
    if (onGetCertificate) {
      onGetCertificate(pre);
    } else {
      setInlineCertPreselection(pre);
      setShowInlineCertificateView(true);
    }
  };
  // Auth & Access State
  const [isVerifying, setIsVerifying] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [accessReason, setAccessReason] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState<string>(() => getRememberedParticipantEmail());
  const [accessCodeInput, setAccessCodeInput] = useState('');
  const [needsAccessCode, setNeedsAccessCode] = useState(false);
  const [isCheckingEmailStatus, setIsCheckingEmailStatus] = useState(false);
  const [detectedApprovedName, setDetectedApprovedName] = useState<string | null>(null);
  const [isEmailApprovedHint, setIsEmailApprovedHint] = useState<boolean>(false);
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [userInfo, setUserInfo] = useState<{ uid: string; email: string; name: string } | null>(null);
  const [participant, setParticipant] = useState<ApprovedParticipant | null>(null);
  const [rubricConfig, setRubricConfig] = useState<RubricConfig>(DEFAULT_RUBRIC_CONFIG);
  const [pastAttempts, setPastAttempts] = useState<InterviewAttemptRecord[]>([]);

  const isSharedInterviewLink = isDedicatedPortal || isDedicatedInterviewPortalUrl();

  // Selection & Consent State
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<'professional' | 'english' | 'english_exam' | 'history'>('professional');
  const [selectedRole, setSelectedRole] = useState<InterviewRoleId>('waiter');
  const [selectedLevel, setSelectedLevel] = useState<InterviewLevel>('1');
  const [selectedMode, setSelectedMode] = useState<InterviewMode>('spoken');
  const [consentChecked, setConsentChecked] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  // Active Interview State
  const [activeAttempt, setActiveAttempt] = useState<InterviewAttemptRecord | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<ActiveQuestionPayload | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [answerDraft, setAnswerDraft] = useState('');
  const [originalSpokenTranscript, setOriginalSpokenTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [spokenLanguage, setSpokenLanguage] = useState<string>('auto');
  const [detectedLanguageLabel, setDetectedLanguageLabel] = useState<string>('English');
  const [wasAnswerTranslated, setWasAnswerTranslated] = useState<boolean>(false);
  const [isTranslatingSpeech, setIsTranslatingSpeech] = useState<boolean>(false);
  const [lastEvaluatedAnswer, setLastEvaluatedAnswer] = useState<InterviewAnswerRecord | null>(null);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [providerNotice, setProviderNotice] = useState<string | null>(null);
  const [lastFeedbackToast, setLastFeedbackToast] = useState<string | null>(null);

  // Spoken Audio & Microphone State
  const [micPermissionState, setMicPermissionState] = useState<'prompt' | 'granted' | 'denied' | 'error'>('prompt');
  const [micErrorMsg, setMicErrorMsg] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isSpeakingQuestion, setIsSpeakingQuestion] = useState(false);

  // Completed Scorecard Inspection State
  const [viewingAttempt, setViewingAttempt] = useState<InterviewAttemptRecord | null>(null);

  // Refs for MediaRecorder, SpeechRecognition & Timers
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const speechRecRef = useRef<any>(null);
  const isRecordingActiveRef = useRef<boolean>(false);
  const accumulatedTranscriptRef = useRef<string>('');
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const recordingStartRef = useRef<number>(0);

  const handleImmediateLockout = (reasonMsg?: string) => {
    stopAllAudioAndMic();
    setActiveAttempt(null);
    setCurrentQuestion(null);
    setViewingAttempt(null);
    setPastAttempts([]);
    setParticipant(null);
    setUserInfo(null);
    setIsAuthenticated(false);
    setIsAuthorized(false);
    setIsAdminUser(false);
    setSetupError(
      reasonMsg ||
        'Your interview access has been revoked, suspended, or removed by the administrator.'
    );
  };

  const syncParticipantAssignedCategoryAndRole = (part: ApprovedParticipant | null) => {
    if (!part) return;
    const allowed = part.allowedCategories || ['all'];
    const allRoles = Object.keys(ROLE_METADATA) as InterviewRoleId[];
    const permittedRoles = allRoles.filter(rKey => {
      const cat = ROLE_METADATA[rKey].category;
      return allowed.includes('all') || allowed.includes(rKey) || allowed.includes(cat);
    });

    if (permittedRoles.length > 0) {
      const firstPermitted = permittedRoles[0];
      const currentIsPermitted = permittedRoles.includes(selectedRole);
      const targetRole = currentIsPermitted ? selectedRole : firstPermitted;

      setSelectedRole(targetRole);
      setSelectedLevel(ROLE_METADATA[targetRole].levels[0].level);

      const hasProfessional = permittedRoles.some(r => ROLE_METADATA[r].category === 'professional');
      const hasEnglish = permittedRoles.some(r => ROLE_METADATA[r].category === 'english');

      if (!hasProfessional && hasEnglish) {
        setSelectedCategoryTab('english');
      } else if (hasProfessional && !hasEnglish) {
        setSelectedCategoryTab('professional');
      } else {
        setSelectedCategoryTab(ROLE_METADATA[targetRole].category === 'english' ? 'english' : 'professional');
      }
    }
  };

  // Verify access on mount
  const checkPortalAuthorization = async (silent = false) => {
    if (!silent) {
      setIsVerifying(true);
    }
    try {
      const verifyRes = await verifyInterviewPortalAccess(isAdminPreview);
      if (verifyRes.authenticated && verifyRes.authorized) {
        setIsAuthenticated(true);
        setIsAuthorized(true);
        setIsAdminUser(Boolean(verifyRes.isAdmin));
        if (verifyRes.user) setUserInfo(verifyRes.user);
        if (verifyRes.participant) setParticipant(verifyRes.participant);
        if (verifyRes.rubricConfig) setRubricConfig(verifyRes.rubricConfig);
        setAccessReason(null);

        if (!silent) {
          const overview = await fetchParticipantPortalOverview(isAdminPreview);
          setParticipant(overview.participant);
          setRubricConfig(overview.rubricConfig || DEFAULT_RUBRIC_CONFIG);
          setPastAttempts(overview.attempts || []);
          syncParticipantAssignedCategoryAndRole(overview.participant);
        }
        return;
      }

      // If not yet authenticated and this is the initial load on a direct link with ?email=...
      if (!silent && !isAuthorized) {
        try {
          const params = new URLSearchParams(window.location.search);
          const urlEmail = (params.get('email') || params.get('gmail') || '').trim().toLowerCase();
          if (urlEmail && urlEmail.includes('@')) {
            setEmailInput(urlEmail);
            const emailStatus = await checkParticipantEmailAuthMode(urlEmail);
            if (emailStatus.approved && !emailStatus.requireAccessCode) {
              const autoLogin = await enterInterviewWithEmail(urlEmail);
              if (autoLogin.authorized) {
                setIsAuthenticated(true);
                setIsAuthorized(true);
                setIsAdminUser(Boolean(autoLogin.isAdmin));
                if (autoLogin.user) setUserInfo(autoLogin.user);
                if (autoLogin.participant) setParticipant(autoLogin.participant);
                if (autoLogin.rubricConfig) setRubricConfig(autoLogin.rubricConfig);
                const overview = await fetchParticipantPortalOverview(false);
                setParticipant(overview.participant);
                setRubricConfig(overview.rubricConfig || DEFAULT_RUBRIC_CONFIG);
                setPastAttempts(overview.attempts || []);
                syncParticipantAssignedCategoryAndRole(overview.participant);
                return;
              }
            } else if (emailStatus.approved && emailStatus.requireAccessCode) {
              setNeedsAccessCode(true);
              setIsEmailApprovedHint(true);
              setDetectedApprovedName(emailStatus.displayName || null);
            }
          }
        } catch {}
      }

      if (isAuthorized || silent) {
        handleImmediateLockout(
          verifyRes.reason ||
            verifyRes.error ||
            'Your interview access is no longer active.'
        );
      } else {
        setIsAuthenticated(false);
        setIsAuthorized(false);
        setIsAdminUser(false);
        if (verifyRes.revoked && (verifyRes.reason || verifyRes.error)) {
          setSetupError(verifyRes.reason || verifyRes.error || null);
        }
      }
    } catch (err: any) {
      if (!silent) {
        setIsAuthenticated(false);
        setIsAuthorized(false);
      }
    } finally {
      if (!silent) {
        setIsVerifying(false);
      }
    }
  };

  useEffect(() => {
    checkPortalAuthorization(false);
    return () => {
      stopAllAudioAndMic();
    };
  }, [isAdminPreview]);

  // Live Server Revocation Heartbeat: Re-validate session on the server every 4 seconds and on tab focus
  // Ensures deleting, suspending, or revoking an email in Admin Control Panel immediately terminates open sessions
  useEffect(() => {
    if (!isAuthorized) return;
    const interval = setInterval(() => {
      checkPortalAuthorization(true);
    }, 4000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        checkPortalAuthorization(true);
      }
    };
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [isAuthorized, isAdminPreview]);

  // Automatic Access Detection for Gmail login screen: automatically detect if an approved Gmail has an assigned PIN
  useEffect(() => {
    if (isAuthorized) return;
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setNeedsAccessCode(false);
      setIsEmailApprovedHint(false);
      setDetectedApprovedName(null);
      setAccessCodeInput('');
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingEmailStatus(true);
      try {
        const status = await checkParticipantEmailAuthMode(cleanEmail);
        setIsEmailApprovedHint(Boolean(status.approved));
        setDetectedApprovedName(status.displayName || null);
        if (status.approved && status.requireAccessCode) {
          setNeedsAccessCode(true);
        } else if (!status.requireAccessCode) {
          setNeedsAccessCode(false);
          setAccessCodeInput('');
        }
      } finally {
        setIsCheckingEmailStatus(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [emailInput, isAuthorized]);

  // Session Elapsed Timer during active interview
  useEffect(() => {
    if (!activeAttempt || activeAttempt.status !== 'in_progress') return;
    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeAttempt?.attemptId, activeAttempt?.status]);

  // Recording Timer
  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => {
      setRecordingSeconds(Math.floor((Date.now() - recordingStartRef.current) / 1000));
    }, 500);
    return () => clearInterval(interval);
  }, [isRecording]);

  // Auto-speak question when a new question loads
  useEffect(() => {
    if (activeAttempt && activeAttempt.status === 'in_progress' && currentQuestion) {
      speakQuestionAloud(currentQuestion.questionText);
    }
  }, [currentQuestion?.id]);

  const stopAllAudioAndMic = () => {
    isRecordingActiveRef.current = false;
    try {
      if (speechRecRef.current) {
        speechRecRef.current.onend = null;
        speechRecRef.current.stop();
        speechRecRef.current = null;
      }
    } catch {}
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } catch {}
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop());
        mediaStreamRef.current = null;
      }
    } catch {}
    try {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch {}
    setIsRecording(false);
    setInterimTranscript('');
    setIsSpeakingQuestion(false);
  };

  const speakQuestionAloud = async (text: string) => {
    if (!text) return;
    setIsSpeakingQuestion(true);
    try {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-GB';
        utterance.rate = 0.96;
        utterance.onend = () => setIsSpeakingQuestion(false);
        utterance.onerror = () => setIsSpeakingQuestion(false);
        window.speechSynthesis.speak(utterance);
        return;
      }

      const ttsData = await synthesizeQuestionAudioWithGemini(text, isAdminPreview);
      if (ttsData.audioBase64 && !ttsData.useBrowserTts) {
        const audio = new Audio(`data:${ttsData.mimeType || 'audio/wav'};base64,${ttsData.audioBase64}`);
        audioPlayerRef.current = audio;
        audio.onended = () => setIsSpeakingQuestion(false);
        audio.onerror = () => setIsSpeakingQuestion(false);
        await audio.play();
        return;
      }
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403 || err?.revoked) {
        handleImmediateLockout(err?.message);
        return;
      }
    }
    setIsSpeakingQuestion(false);
  };

  const handleEmailAccessSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setSetupError('Please enter a valid approved Gmail / email address.');
      return;
    }

    setSetupError(null);
    setIsSubmittingEmail(true);
    try {
      const res = await enterInterviewWithEmail(cleanEmail, accessCodeInput);
      if (!res.authorized) {
        if (res.requireAccessCode) {
          setNeedsAccessCode(true);
        }
        setSetupError(
          res.error ||
            'Access denied. This email address is not on the active allowlist or has been revoked.'
        );
        return;
      }

      setIsAuthenticated(true);
      setIsAuthorized(true);
      setIsAdminUser(Boolean(res.isAdmin));
      if (res.user) setUserInfo(res.user);
      if (res.participant) setParticipant(res.participant);
      if (res.rubricConfig) setRubricConfig(res.rubricConfig);
      setAccessCodeInput('');
      setNeedsAccessCode(false);

      const overview = await fetchParticipantPortalOverview(false);
      setParticipant(overview.participant);
      setRubricConfig(overview.rubricConfig || DEFAULT_RUBRIC_CONFIG);
      setPastAttempts(overview.attempts || []);
      syncParticipantAssignedCategoryAndRole(overview.participant);
    } catch (err: any) {
      setSetupError(err?.message || 'Unable to verify email access. Please try again.');
    } finally {
      setIsSubmittingEmail(false);
    }
  };

  const handleParticipantLogout = async () => {
    stopAllAudioAndMic();
    await logoutInterviewParticipant();
    setActiveAttempt(null);
    setCurrentQuestion(null);
    setViewingAttempt(null);
    setPastAttempts([]);
    setParticipant(null);
    setUserInfo(null);
    setIsAuthenticated(false);
    setIsAuthorized(false);
    setIsAdminUser(false);
    setSetupError(null);
  };

  const handleRoleSelect = (roleId: InterviewRoleId) => {
    setSelectedRole(roleId);
    const firstLevel = ROLE_METADATA[roleId].levels[0].level;
    setSelectedLevel(firstLevel);
    setSetupError(null);
  };

  const isRoleAllowedForParticipant = (roleId: InterviewRoleId): boolean => {
    if (!participant) return false;
    const allowed = participant.allowedCategories || ['all'];
    const category = ROLE_METADATA[roleId].category;
    return allowed.includes('all') || allowed.includes(roleId) || allowed.includes(category);
  };

  const requestMicrophoneCheck = async (): Promise<boolean> => {
    setMicErrorMsg(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicPermissionState('error');
      setMicErrorMsg(
        'Microphone capture is not supported in this browser environment. Please use a modern browser with microphone support or select Written Practice mode.'
      );
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setMicPermissionState('granted');
      return true;
    } catch (err: any) {
      setMicPermissionState('denied');
      setMicErrorMsg(
        'Microphone permission was denied or no microphone was detected. Please allow microphone access in your browser address bar, or switch to Written Practice mode.'
      );
      return false;
    }
  };

  const handleStartInterview = async () => {
    setSetupError(null);
    if (!consentChecked) {
      setSetupError('Please check the consent box confirming audio/transcription processing before starting.');
      return;
    }

    if (selectedMode === 'spoken') {
      const micOk = await requestMicrophoneCheck();
      if (!micOk) return;
    }

    setIsStarting(true);
    try {
      const res = await startNewInterviewAttempt(
        {
          role: selectedRole,
          level: selectedLevel,
          mode: selectedMode,
          consentAccepted: true,
        },
        isAdminPreview
      );
      setActiveAttempt(res.attempt);
      setCurrentQuestion(res.currentQuestion);
      setElapsedSeconds(res.attempt.durationSeconds || 0);
      setAnswerDraft('');
      setOriginalSpokenTranscript('');
      setInterimTranscript('');
      setWasAnswerTranslated(false);
      setLastEvaluatedAnswer(null);
      setSessionError(null);
      setProviderNotice(null);
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403 || err?.revoked) {
        handleImmediateLockout(err?.message);
        return;
      }
      setSetupError(err?.message || 'Could not start interview session.');
    } finally {
      setIsStarting(false);
    }
  };

  const handleResumeAttempt = async (attemptId: string) => {
    setSetupError(null);
    setIsStarting(true);
    try {
      const res = await fetchInterviewAttemptById(attemptId, isAdminPreview);
      if (res.attempt.status === 'completed') {
        setViewingAttempt(res.attempt);
      } else {
        if (res.attempt.mode === 'spoken') {
          await requestMicrophoneCheck();
        }
        setActiveAttempt(res.attempt);
        setCurrentQuestion(res.currentQuestion);
        setElapsedSeconds(res.attempt.durationSeconds || 0);
        setAnswerDraft('');
        setOriginalSpokenTranscript('');
        setInterimTranscript('');
        setWasAnswerTranslated(false);
        setLastEvaluatedAnswer(
          res.attempt.answers.length > 0 ? res.attempt.answers[res.attempt.answers.length - 1] : null
        );
      }
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403 || err?.revoked) {
        handleImmediateLockout(err?.message);
        return;
      }
      setSetupError(err?.message || 'Failed to resume interview attempt.');
    } finally {
      setIsStarting(false);
    }
  };

  const handleTranslateManualOrSpokenDraft = async (rawTextToTranslate?: string) => {
    const sourceText = (rawTextToTranslate !== undefined ? rawTextToTranslate : originalSpokenTranscript || answerDraft).trim();
    if (!sourceText) return;
    setIsTranslatingSpeech(true);
    setMicErrorMsg(null);
    try {
      const transRes = await translateSpokenTranscriptToEnglish(sourceText, spokenLanguage, isAdminPreview);
      setOriginalSpokenTranscript(transRes.originalTranscript || sourceText);
      setAnswerDraft(transRes.englishTranslation || sourceText);
      setDetectedLanguageLabel(transRes.detectedLanguageLabel || 'English');
      setWasAnswerTranslated(Boolean(transRes.wasTranslated));
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403 || err?.revoked) {
        handleImmediateLockout(err?.message);
        return;
      }
      setMicErrorMsg(
        err?.message || 'Could not automatically translate transcript. You can review or edit your English response directly below.'
      );
    } finally {
      setIsTranslatingSpeech(false);
    }
  };

  const startSpokenRecording = async () => {
    setMicErrorMsg(null);
    setSessionError(null);
    try {
      // Stop question TTS if still speaking
      if (audioPlayerRef.current) audioPlayerRef.current.pause();
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      setIsSpeakingQuestion(false);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;
      setMicPermissionState('granted');

      // Seed accumulated transcript with any existing draft so "Record More" appends cleanly
      accumulatedTranscriptRef.current = (originalSpokenTranscript || answerDraft).trim();
      setInterimTranscript('');
      isRecordingActiveRef.current = true;

      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const recordedSec = Math.max(1, Math.floor((Date.now() - recordingStartRef.current) / 1000));
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(t => t.stop());
          mediaStreamRef.current = null;
        }

        const capturedLiveText = accumulatedTranscriptRef.current.trim();
        setInterimTranscript('');
        setIsTranscribing(true);

        try {
          let base64Audio = '';
          if (audioChunksRef.current.length > 0) {
            const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
            base64Audio = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(String(reader.result || ''));
              reader.onerror = reject;
              reader.readAsDataURL(audioBlob);
            });
          }

          const transRes = await transcribeSpokenAudioWithGemini(
            base64Audio,
            recorder.mimeType || 'audio/webm',
            isAdminPreview,
            capturedLiveText,
            spokenLanguage
          );

          const finalEnglish = (transRes.englishTranslation || transRes.transcript || capturedLiveText).trim();
          const finalOriginal = (transRes.originalTranscript || capturedLiveText || finalEnglish).trim();

          if (finalEnglish) {
            setOriginalSpokenTranscript(finalOriginal);
            setAnswerDraft(finalEnglish);
            setDetectedLanguageLabel(transRes.detectedLanguage || 'English');
            setWasAnswerTranslated(Boolean(transRes.wasTranslated));
          } else {
            setMicErrorMsg(
              'No speech was detected during recording. Please speak clearly into your microphone and click Record Answer again, or type your answer manually below.'
            );
          }
        } catch (err: any) {
          if (err?.status === 401 || err?.status === 403 || err?.revoked) {
            handleImmediateLockout(err?.message);
            return;
          }
          // If live speech recognition captured text, preserve and translate it locally
          if (capturedLiveText) {
            setOriginalSpokenTranscript(capturedLiveText);
            setAnswerDraft(capturedLiveText);
            await handleTranslateManualOrSpokenDraft(capturedLiveText);
          } else {
            setMicErrorMsg(
              'Speech recognition could not process the audio clip. Please try recording again or type your answer in the text box below.'
            );
          }
        } finally {
          setIsTranscribing(false);
          setRecordingSeconds(recordedSec);
        }
      };

      // Start continuous, pause-tolerant browser SpeechRecognition for real-time transcription across accents & languages
      try {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
          const langOption = SPOKEN_LANGUAGE_OPTIONS.find(l => l.code === spokenLanguage) || SPOKEN_LANGUAGE_OPTIONS[0];
          const createAndStartRecognition = () => {
            if (!isRecordingActiveRef.current) return;
            const rec = new SpeechRecognition();
            rec.lang = langOption.bcp47;
            rec.continuous = true;
            rec.interimResults = true;
            rec.maxAlternatives = 1;

            rec.onresult = (event: any) => {
              let finalAddition = '';
              let interimChunk = '';
              for (let i = event.resultIndex; i < event.results.length; i++) {
                const seg = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                  finalAddition += seg + ' ';
                } else {
                  interimChunk += seg;
                }
              }
              if (finalAddition.trim()) {
                accumulatedTranscriptRef.current = (
                  accumulatedTranscriptRef.current +
                  ' ' +
                  finalAddition.trim()
                ).trim();
                setOriginalSpokenTranscript(accumulatedTranscriptRef.current);
                setAnswerDraft(accumulatedTranscriptRef.current);
              }
              setInterimTranscript(interimChunk.trim());
            };

            rec.onerror = (ev: any) => {
              const code = String(ev?.error || '');
              if (code === 'not-allowed' || code === 'service-not-allowed') {
                setMicPermissionState('denied');
                setMicErrorMsg('Microphone speech recognition permission was blocked by the browser.');
                isRecordingActiveRef.current = false;
              }
            };

            // Automatically restart recognition if the speaker pauses for a breath while still recording
            rec.onend = () => {
              if (isRecordingActiveRef.current) {
                try {
                  rec.start();
                } catch {}
              }
            };

            try {
              rec.start();
              speechRecRef.current = rec;
            } catch {}
          };

          createAndStartRecognition();
        }
      } catch {
        // Fallback handled on stop
      }

      recordingStartRef.current = Date.now();
      setRecordingSeconds(0);
      recorder.start(500);
      setIsRecording(true);
    } catch (err: any) {
      setMicPermissionState('denied');
      setMicErrorMsg(
        'Microphone access was denied or no microphone was found. Please allow microphone permission in your browser settings or type your answer manually below.'
      );
    }
  };

  const stopSpokenRecording = () => {
    isRecordingActiveRef.current = false;
    try {
      if (speechRecRef.current) {
        speechRecRef.current.onend = null;
        speechRecRef.current.stop();
        speechRecRef.current = null;
      }
    } catch {}
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } catch {}
    setIsRecording(false);
  };

  const handleSubmitCurrentAnswer = async () => {
    if (!activeAttempt || !currentQuestion) return;
    const cleanText = answerDraft.trim();
    if (!cleanText) {
      setSessionError(
        activeAttempt.mode === 'spoken'
          ? 'Please tap Record Answer and speak your response (or type/edit your answer in the box) before submitting.'
          : 'Please type your answer in English before submitting.'
      );
      return;
    }

    stopAllAudioAndMic();
    setIsSubmittingAnswer(true);
    setSessionError(null);

    try {
      const res = await submitInterviewAnswer(
        {
          attemptId: activeAttempt.attemptId,
          answerText: cleanText,
          originalTranscript: originalSpokenTranscript || cleanText,
          spokenLanguage,
          inputMode: activeAttempt.mode,
          audioDurationSeconds: recordingSeconds || undefined,
          elapsedSessionSeconds: elapsedSeconds,
        },
        isAdminPreview
      );

      setActiveAttempt(res.attempt);
      setLastEvaluatedAnswer(res.answerRecord);
      setAnswerDraft('');
      setOriginalSpokenTranscript('');
      setInterimTranscript('');
      setWasAnswerTranslated(false);
      setRecordingSeconds(0);
      if (res.providerNotice) {
        setProviderNotice(res.providerNotice);
      }

      setLastFeedbackToast(
        `Evaluated Q${res.attempt.answers.length}: ${res.answerRecord.perQuestionScore}/100 (${
          res.answerRecord.questionPassStatus || (res.answerRecord.perQuestionScore >= 65 ? 'PASS' : 'FAIL')
        })`
      );
      setTimeout(() => setLastFeedbackToast(null), 4000);

      if (res.nextQuestion) {
        setCurrentQuestion(res.nextQuestion);
      } else {
        // All questions for this level completed — automatically generate final level scorecard
        await handleFinalizeInterview(res.attempt.attemptId, false);
      }
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403 || err?.revoked) {
        handleImmediateLockout(err?.message);
        return;
      }
      setSessionError(
        err?.message || 'Technical error saving answer. Your response draft is preserved here—click Retry Submit.'
      );
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  const handleFinalizeInterview = async (attemptId: string, forceEarlyExit = false) => {
    stopAllAudioAndMic();
    setIsCompleting(true);
    setSessionError(null);
    try {
      const res = await completeInterviewAttempt(
        {
          attemptId,
          elapsedSessionSeconds: elapsedSeconds,
          forceEarlyExit,
        },
        isAdminPreview
      );
      setActiveAttempt(null);
      setCurrentQuestion(null);
      setViewingAttempt(res.attempt);
      // Refresh participant attempt history
      const overview = await fetchParticipantPortalOverview(isAdminPreview);
      setPastAttempts(overview.attempts || []);
    } catch (err: any) {
      if (err?.status === 401 || err?.status === 403 || err?.revoked) {
        handleImmediateLockout(err?.message);
        return;
      }
      setSessionError(err?.message || 'Failed to finalize interview scorecard. Please try again.');
    } finally {
      setIsCompleting(false);
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // ========================================================
  // RENDER 1: LOADING / VERIFYING ACCESS
  // ========================================================
  if (isVerifying) {
    return (
      <div className="min-h-screen bg-[#090c14] text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 mb-4">
          <div className="relative">
            <CCDLogo size={52} mode="icon" forceDark={true} />
            <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-blue-600 border-2 border-[#090c14] flex items-center justify-center">
              <RefreshCw className="w-3.5 h-3.5 text-white animate-spin" />
            </div>
          </div>
          <CCDLogo size={30} mode="lockup" forceDark={true} />
        </div>
        <h2 className="text-lg font-bold tracking-tight">Verifying Interview Portal Authorization</h2>
        <p className="text-xs text-slate-400 mt-1">Checking active allowlist status...</p>
      </div>
    );
  }

  if (showInlineCertificateView) {
    return (
      <div className="min-h-screen bg-[#090c14] text-slate-100 flex flex-col">
        <header className="flex items-center justify-between gap-6 px-6 py-4 border-b border-slate-800 bg-[#0d121f]">
          <div className="flex items-center gap-3">
            <CCDLogo size={32} mode="icon" forceDark={true} />
            <span className="text-base font-bold tracking-tight text-white">
              Belvoriné Mixology — Certificate Center
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowInlineCertificateView(false)}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition cursor-pointer"
          >
            Back to Interview Portal
          </button>
        </header>
        <main className="max-w-7xl w-full mx-auto p-6">
          <CertificateGeneratorView initialPreselection={inlineCertPreselection} />
        </main>
      </div>
    );
  }

  // ========================================================
  // RENDER 2: DEDICATED INTERVIEW PORTAL LANDING PAGE
  // ========================================================
  if (!isAuthenticated || !isAuthorized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#090b10] via-[#0d1017] to-[#111522] text-slate-100 flex items-center justify-center p-4 select-none">
        <div className="w-full max-w-md bg-[#131724] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-[0_20px_60px_-15px_rgba(37,99,235,0.22)]">
          {/* Header Badge & Interview Portal Branding */}
          <div className="flex flex-col items-center text-center pb-5 border-b border-slate-800/80">
            <div className="flex flex-col items-center gap-2.5 mb-3">
              <CCDLogo size={50} mode="icon" forceDark={true} />
              <CCDLogo size={30} mode="lockup" forceDark={true} />
            </div>

            <span className="text-[10px] uppercase font-bold tracking-widest text-blue-400 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 mb-2">
              Dedicated Interview Portal
            </span>

            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              Welcome to the Interview Portal
            </h1>
            <p className="text-xs text-slate-400 mt-1.5 max-w-xs leading-relaxed">
              Sign in with your administrator-approved Gmail address to access your assigned interview categories, English assessments, and live session dashboard.
            </p>
          </div>

          {/* Error / Denial Notification */}
          {setupError && (
            <div className="mt-5 p-3.5 rounded-2xl bg-rose-950/70 border border-rose-500/50 text-rose-200 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{setupError}</span>
            </div>
          )}

          {/* Direct Approved Gmail + Optional PIN Verification Form */}
          <form onSubmit={handleEmailAccessSubmit} className="mt-5 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Approved Gmail Address
                </label>
                {isCheckingEmailStatus ? (
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Checking...</span>
                  </span>
                ) : isEmailApprovedHint ? (
                  <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{detectedApprovedName ? `Approved (${detectedApprovedName})` : 'Approved Gmail'}</span>
                  </span>
                ) : null}
              </div>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={emailInput}
                  onChange={e => {
                    setEmailInput(e.target.value);
                    if (setupError) setSetupError(null);
                  }}
                  placeholder="Enter your approved Gmail address..."
                  className="w-full pl-11 pr-4 py-3.5 bg-[#07090e] border border-slate-800 rounded-2xl text-sm font-medium text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                />
              </div>
            </div>

            {needsAccessCode && (
              <div className="animate-fade-in">
                <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1.5">
                  Assigned PIN / Passcode Required
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-amber-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="password"
                    required
                    value={accessCodeInput}
                    onChange={e => {
                      setAccessCodeInput(e.target.value);
                      if (setupError) setSetupError(null);
                    }}
                    placeholder="Enter your assigned PIN"
                    className="w-full pl-11 pr-4 py-3 bg-[#07090e] border border-amber-500/40 rounded-2xl text-sm font-mono tracking-widest text-amber-300 placeholder-slate-600 focus:outline-none focus:border-amber-400 transition-all"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Your administrator assigned a security PIN to this Gmail account.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmittingEmail}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-blue-500/25 active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmittingEmail ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying Interview Access...</span>
                </>
              ) : (
                <>
                  <span>Access Interview</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </>
              )}
            </button>
          </form>

          {/* Portal Security Info Footer */}
          <div className="mt-5 pt-4 border-t border-slate-800/70 text-center space-y-2">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Protected Participant Portal · Only Gmail addresses approved by the administrator can enter.
            </p>
            {!isSharedInterviewLink && (
              <button
                type="button"
                onClick={onExitPortal}
                className="w-full py-2.5 px-4 rounded-xl border border-slate-800 hover:bg-slate-800/60 text-slate-400 hover:text-white font-medium text-xs transition cursor-pointer"
              >
                Return to Security Authorization
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ========================================================
  // RENDER 3: COMPLETED SCORECARD & FEEDBACK VIEW
  // ========================================================
  if (viewingAttempt) {
    const att = viewingAttempt;
    const isPass = att.passFailStatus === 'PASS';
    const isSafetyFail = att.passFailStatus === 'Fail — Safety Concern';
    const canSeeDetails = participant?.canViewResults !== false || isAdminUser;

    return (
      <div className="min-h-screen bg-[#090c14] text-slate-100 flex flex-col">
        <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-800 bg-[#0d121f]">
          <div className="flex items-center gap-3 shrink-0">
            <CCDLogo size={32} mode="icon" forceDark={true} />
            <span className="text-base font-bold tracking-tight text-white whitespace-nowrap">
              AI Interview & English Assessment Center
            </span>
          </div>
          <div className="hidden md:flex items-center gap-6 text-xs text-slate-400">
            <span>Participant: {att.participantEmail}</span>
            <span>·</span>
            <span>Mode: {att.mode === 'spoken' ? 'Spoken Interview' : 'Written Practice'}</span>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                const pre = mapAttemptToCertificatePreselection(att);
                handleOpenCertificateForPreselection(pre);
              }}
              className="px-4 py-2 text-xs font-bold text-white bg-[#c8102e] hover:bg-[#a50d26] rounded-lg transition whitespace-nowrap flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Award className="w-4 h-4" />
              <span>Get Certificate</span>
            </button>
            <button
              type="button"
              onClick={() => setViewingAttempt(null)}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              Back to Interview Portal
            </button>
          </div>
        </header>

        <main className="max-w-5xl w-full mx-auto p-6 space-y-6">
          {/* Disclaimer Banner */}
          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong className="text-slate-200">Official Notice:</strong> This is an AI practice and readiness assessment, not a legally recognized professional trade license or official CEFR certificate.
            </span>
            <span className="font-mono text-[11px] text-slate-500">
              Attempt ID: {att.attemptId} · Rubric: {att.rubricSnapshot.version}
            </span>
          </div>

          {/* Outcome Hero Summary */}
          <div className="p-6 rounded-2xl bg-[#111624] border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>{att.roleTitle}</span>
                <span>·</span>
                <span>{att.levelLabel}</span>
                <span>·</span>
                <span className="font-mono tabular-nums">Duration: {formatTimer(att.durationSeconds)}</span>
              </div>
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <span>Assessment Outcome:</span>
                <span
                  className={
                    isPass
                      ? 'text-emerald-400'
                      : isSafetyFail
                      ? 'text-rose-400'
                      : 'text-amber-400'
                  }
                >
                  {att.passFailStatus}
                </span>
              </h2>
              <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">{att.overallSummary}</p>
              {att.pronunciationDisclaimer && (
                <p className="text-[11px] text-slate-400 italic">{att.pronunciationDisclaimer}</p>
              )}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const pre = mapAttemptToCertificatePreselection(att);
                    handleOpenCertificateForPreselection(pre);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-[#c8102e] hover:bg-[#a50d26] text-white text-xs font-bold inline-flex items-center gap-2 transition cursor-pointer shadow-sm"
                >
                  <Award className="w-4 h-4" />
                  <span>Get Certificate for {att.roleTitle} ({att.levelLabel})</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-6 shrink-0 bg-[#0b0f1a] border border-slate-800 rounded-2xl p-5">
              <div className="text-center">
                <div className="text-[11px] text-slate-400">Total Score</div>
                <div className="text-4xl font-extrabold font-mono tabular-nums text-white mt-0.5">
                  {att.totalScore ?? 0}
                  <span className="text-lg text-slate-500">/100</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-1 font-mono tabular-nums">
                  Pass Mark: {att.rubricSnapshot.passThreshold}/100
                </div>
              </div>
              {att.cefrEvaluation && (
                <div className="pl-6 border-l border-slate-800 text-center">
                  <div className="text-[11px] text-slate-400">Estimated CEFR</div>
                  <div className="text-3xl font-extrabold font-mono text-blue-400 mt-0.5">
                    {att.cefrEvaluation.estimatedLevel}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Confidence: {att.cefrEvaluation.confidence}
                  </div>
                </div>
              )}
            </div>
          </div>

          {isSafetyFail && (
            <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-500/40 text-xs text-rose-200 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-rose-300">Critical Safety Override Triggered</div>
                <p className="mt-1">
                  {att.safetyConcernDetails ||
                    'A critical unsafe procedure was proposed on a safety-critical question. Even if the numerical score exceeds the pass threshold, safety violations result in an automatic Fail — Safety Concern.'}
                </p>
              </div>
            </div>
          )}

          {canSeeDetails ? (
            <>
              {/* Rubric Breakdown */}
              {att.rubricBreakdown && (
                <div className="p-6 rounded-2xl bg-[#111624] border border-slate-800 space-y-4">
                  <h3 className="text-sm font-bold text-white">Rubric Score Breakdown (100 Points)</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {[
                      {
                        label: 'Role Knowledge & Procedures',
                        score: att.rubricBreakdown.roleKnowledge,
                        max: att.rubricSnapshot.roleKnowledgeWeight,
                      },
                      {
                        label: 'Situational Judgement',
                        score: att.rubricBreakdown.situationalJudgment,
                        max: att.rubricSnapshot.situationalJudgmentWeight,
                      },
                      {
                        label: 'English Grammar & Vocab',
                        score: att.rubricBreakdown.grammarVocab,
                        max: att.rubricSnapshot.grammarVocabWeight,
                      },
                      {
                        label: 'Clarity & Fluency',
                        score: att.rubricBreakdown.clarityFluency,
                        max: att.rubricSnapshot.clarityFluencyWeight,
                      },
                      {
                        label: 'Professionalism & Safety',
                        score: att.rubricBreakdown.professionalismSafety,
                        max: att.rubricSnapshot.professionalismSafetyWeight,
                      },
                    ].map(item => (
                      <div key={item.label} className="p-3.5 rounded-xl bg-[#0b0f1a] border border-slate-800/80">
                        <div className="text-xs text-slate-400">{item.label}</div>
                        <div className="text-xl font-bold font-mono tabular-nums text-white mt-1">
                          {item.score} <span className="text-xs text-slate-500">/ {item.max}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Full English Level Exam (CEFR A1-C2) Detailed Breakdown */}
              {att.englishExamResult && (
                <div className="p-6 rounded-2xl bg-[#111624] border border-slate-800 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-white">
                      English Level Exam Breakdown — Objective Score: {att.englishExamResult.objective.score} / {att.englishExamResult.objective.total}
                    </h3>
                    <span className="text-xs font-mono text-blue-400">
                      Achieved Band: {att.englishExamResult.objective.level}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        By CEFR Level (Climbing Rule: ≥ 3/5)
                      </div>
                      {CEFR_LEVELS.map(lvl => {
                        const raw = att.englishExamResult?.objective.byLevel[lvl] || '0/5';
                        const [num, den] = raw.split('/').map(Number);
                        const pct = den ? Math.round((num / den) * 100) : 0;
                        return (
                          <div key={lvl} className="grid grid-cols-[60px_1fr_44px] items-center gap-3 text-xs">
                            <span className="font-bold text-white">{lvl}</span>
                            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-right font-mono text-slate-300">{raw}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        By Skill
                      </div>
                      {Object.entries(att.englishExamResult.objective.bySkill || {}).map(([sk, raw]) => {
                        const [num, den] = String(raw).split('/').map(Number);
                        const pct = den ? Math.round((num / den) * 100) : 0;
                        return (
                          <div key={sk} className="grid grid-cols-[85px_1fr_48px] items-center gap-3 text-xs">
                            <span className="font-bold text-white">{sk}</span>
                            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-right font-mono text-slate-300">{raw}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {att.englishExamResult.incorrectAnswers && att.englishExamResult.incorrectAnswers.length > 0 && (
                    <div className="pt-4 border-t border-slate-800 space-y-2.5">
                      <div className="text-xs font-bold text-slate-300">
                        Review of Incorrect Objective Questions ({att.englishExamResult.incorrectAnswers.length})
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {att.englishExamResult.incorrectAnswers.map(w => (
                          <div key={w.n} className="p-3 rounded-xl bg-[#0b0f1a] border border-slate-800 text-xs space-y-1">
                            <div className="text-slate-400 font-mono">Q{w.n} · {w.type}</div>
                            <div className="text-white font-medium">{w.q}</div>
                            <div className="text-rose-400">Your answer: {w.yours}</div>
                            <div className="text-emerald-400 font-semibold">Correct: {w.correct}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Strengths, Weaknesses & Next Level */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-5 rounded-2xl bg-[#111624] border border-slate-800 space-y-2.5">
                  <h4 className="text-xs font-bold text-emerald-400">Key Strengths Observed</h4>
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {(att.strengths || []).map((s, idx) => (
                      <li key={idx}>• {s}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-5 rounded-2xl bg-[#111624] border border-slate-800 space-y-2.5">
                  <h4 className="text-xs font-bold text-amber-400">Areas for Improvement</h4>
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {(att.weaknesses || []).map((w, idx) => (
                      <li key={idx}>• {w}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-5 rounded-2xl bg-[#111624] border border-slate-800 space-y-2.5">
                  <h4 className="text-xs font-bold text-blue-400">Recommended Practice & Next Step</h4>
                  <p className="text-xs font-semibold text-white">{att.nextLevelRecommendation}</p>
                  <ul className="space-y-1.5 text-xs text-slate-300 pt-1">
                    {(att.recommendedPractice || []).map((r, idx) => (
                      <li key={idx}>• {r}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Grammar Corrections */}
              {att.grammarCorrections && att.grammarCorrections.length > 0 && (
                <div className="p-6 rounded-2xl bg-[#111624] border border-slate-800 space-y-3">
                  <h3 className="text-sm font-bold text-white">English Grammar & Phrasing Corrections</h3>
                  <div className="space-y-3">
                    {att.grammarCorrections.map((g, idx) => (
                      <div key={idx} className="p-3.5 rounded-xl bg-[#0b0f1a] border border-slate-800 text-xs space-y-1">
                        <div className="text-rose-300">
                          <span className="font-semibold">Spoken/Written:</span> “{g.original}”
                        </div>
                        <div className="text-emerald-300">
                          <span className="font-semibold">Better English:</span> “{g.corrected}”
                        </div>
                        <div className="text-slate-400">{g.explanation}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Question-by-Question Review & Post-Interview Model Answers */}
              <div className="p-6 rounded-2xl bg-[#111624] border border-slate-800 space-y-4">
                <h3 className="text-sm font-bold text-white">Question-by-Question Transcript & Automated Evaluator Feedback</h3>
                <div className="space-y-4">
                  {att.answers.map((ans, idx) => (
                    <div key={ans.answerId} className="p-4 rounded-xl bg-[#0b0f1a] border border-slate-800 space-y-2.5 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-blue-400">
                          Q{idx + 1} {ans.isFollowUp ? '(Follow-Up)' : ''}: {ans.questionText}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          {ans.questionPassStatus && (
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                ans.questionPassStatus === 'PASS'
                                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                  : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                              }`}
                            >
                              {ans.questionPassStatus}
                            </span>
                          )}
                          <span className="font-mono tabular-nums font-semibold text-white">
                            Score: {ans.perQuestionScore}/100
                          </span>
                        </div>
                      </div>

                      {ans.wasTranslated && ans.originalTranscript && ans.originalTranscript !== ans.answerText && (
                        <div className="p-2.5 rounded-lg bg-indigo-950/30 border border-indigo-500/30 text-indigo-200 space-y-1">
                          <div className="text-[11px] font-semibold text-indigo-300">
                            Original Spoken Transcript ({ans.detectedLanguage || 'Non-English'}):
                          </div>
                          <div>{ans.originalTranscript}</div>
                        </div>
                      )}

                      <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800/80 text-slate-200">
                        <div className="text-[11px] text-slate-400 mb-1">
                          {ans.wasTranslated
                            ? `Evaluated English Translation (${ans.inputMode}):`
                            : `Your Answer (${ans.inputMode}):`}
                        </div>
                        {ans.answerText}
                      </div>
                      <div className="text-slate-300">
                        <span className="font-semibold text-white">Automated Evaluator Feedback: </span>
                        {ans.feedback}
                      </div>
                      {ans.safetyFlagged && (
                        <div className="text-rose-400 font-semibold">
                          Safety Concern Flagged: {ans.safetyReason}
                        </div>
                      )}
                      {rubricConfig.showModelAnswersAfterCompletion && ans.modelAnswerExample && (
                        <div className="p-3 rounded-lg bg-emerald-950/25 border border-emerald-500/30 text-emerald-200">
                          <span className="font-semibold">Model Answer Example / Expected Key Points: </span>
                          {ans.modelAnswerExample}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="p-6 rounded-2xl bg-[#111624] border border-slate-800 text-xs text-slate-300">
              Your interview attempt has been recorded and submitted to the administrator. Detailed rubric breakdowns are restricted by administrator policy for your account.
            </div>
          )}
        </main>
      </div>
    );
  }

  // ========================================================
  // RENDER 4: ACTIVE INTERVIEW SESSION (ONE QUESTION AT A TIME)
  // ========================================================
  if (activeAttempt && currentQuestion) {
    const targetSec = activeAttempt.targetDurationSeconds || 300;
    const progressPct = Math.min(100, Math.round((elapsedSeconds / targetSec) * 100));
    const minDurationReached = elapsedSeconds >= targetSec;

    return (
      <div className="min-h-screen bg-[#090c14] text-slate-100 flex flex-col">
        {/* Top Session Bar */}
        <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-800 bg-[#0d121f]">
          <div className="flex items-center gap-3 min-w-0">
            <CCDLogo size={32} mode="icon" forceDark={true} />
            <span className="text-sm font-bold text-white truncate">
              {activeAttempt.roleTitle} — {activeAttempt.levelLabel}
            </span>
          </div>

          <div className="flex items-center gap-5 text-xs font-mono tabular-nums">
            <div>
              <span className="text-slate-400">Elapsed: </span>
              <span className={minDurationReached ? 'text-emerald-400 font-bold' : 'text-amber-300 font-bold'}>
                {formatTimer(elapsedSeconds)}
              </span>
              <span className="text-slate-500"> / {formatTimer(targetSec)} min target</span>
            </div>
            <div className="hidden sm:block text-slate-400">
              Answered: <span className="text-white font-bold">{activeAttempt.answers.length}</span>
            </div>
          </div>

          <button
            type="button"
            disabled={isCompleting || isSubmittingAnswer}
            onClick={() => handleFinalizeInterview(activeAttempt.attemptId, !minDurationReached)}
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition whitespace-nowrap shrink-0 cursor-pointer"
          >
            {minDurationReached ? 'Finish & Score Interview' : 'Save & Exit'}
          </button>
        </header>

        <main className="max-w-4xl w-full mx-auto p-6 flex-1 flex flex-col justify-between gap-6">
          {/* Automated Level Instructions & Progress */}
          <div className="space-y-3">
            <div className="p-3.5 rounded-xl bg-blue-950/40 border border-blue-500/30 text-xs text-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="font-bold text-white">
                  Automated Interview System — {activeAttempt.levelLabel} (Pass Mark: {currentQuestion.passingScore || activeAttempt.levelPassThreshold || 70}/100)
                </div>
                <div className="text-blue-200/90">
                  {currentQuestion.instructions || activeAttempt.levelInstructions || SPOKEN_INTERVIEW_INSTRUCTION}
                </div>
              </div>
              <span className="font-mono text-[11px] text-emerald-300 shrink-0">Self-Operating · Autosave Active</span>
            </div>

            {currentQuestion.safetyNote && (
              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-[11px] text-amber-200">
                {currentQuestion.safetyNote}
              </div>
            )}

            {/* Immediate Automated Evaluation Feedback from Previous Question */}
            {lastEvaluatedAnswer && (
              <div className="p-4 rounded-xl bg-[#111624] border border-slate-800 space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-slate-200">
                    Previous Answer Automated Evaluation ({lastEvaluatedAnswer.questionPassStatus || (lastEvaluatedAnswer.perQuestionScore >= 65 ? 'PASS' : 'FAIL')})
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full font-mono font-bold ${
                      (lastEvaluatedAnswer.questionPassStatus || (lastEvaluatedAnswer.perQuestionScore >= 65 ? 'PASS' : 'FAIL')) === 'PASS'
                        ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
                        : 'bg-amber-500/15 border border-amber-500/40 text-amber-300'
                    }`}
                  >
                    Score: {lastEvaluatedAnswer.perQuestionScore}/100
                  </span>
                </div>
                <p className="text-slate-300">{lastEvaluatedAnswer.feedback}</p>
                {lastEvaluatedAnswer.grammarCorrection && (
                  <div className="p-2.5 rounded-lg bg-[#0b0f1a] border border-slate-800/80 text-[11px] space-y-0.5">
                    <div className="text-emerald-300">
                      <span className="font-semibold">Suggested English Phrasing: </span>“{lastEvaluatedAnswer.grammarCorrection.corrected}”
                    </div>
                    <div className="text-slate-400">{lastEvaluatedAnswer.grammarCorrection.explanation}</div>
                  </div>
                )}
              </div>
            )}

            {/* Duration progress bar */}
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  minDurationReached ? 'bg-emerald-500' : 'bg-blue-500'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Active Question Card */}
          <div className="p-6 sm:p-8 rounded-2xl bg-[#111624] border border-slate-800 space-y-6 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2">
                <span className="font-bold text-blue-400">
                  Question {currentQuestion.questionNumber} of {currentQuestion.totalPrimaryQuestions}
                </span>
                {currentQuestion.isFollowUp && (
                  <>
                    <span>·</span>
                    <span className="text-amber-300 font-semibold">Adaptive Follow-Up Question</span>
                  </>
                )}
                {currentQuestion.isSafetyCritical && (
                  <>
                    <span>·</span>
                    <span className="text-rose-300 font-semibold">Safety-Critical Assessment Item</span>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => speakQuestionAloud(currentQuestion.questionText)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
              >
                <Volume2 className={`w-3.5 h-3.5 ${isSpeakingQuestion ? 'text-blue-400 animate-pulse' : ''}`} />
                <span>{isSpeakingQuestion ? 'Speaking Question...' : 'Repeat Question Aloud'}</span>
              </button>
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-white leading-snug">
              “{currentQuestion.questionText}”
            </h2>

            {/* Spoken Mode Recording & Multilingual Translation Controls */}
            {activeAttempt.mode === 'spoken' ? (
              <div className="space-y-4 pt-2">
                {/* Spoken Language & Accent Selector */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-[#0b0f1a] border border-slate-800/80 text-xs">
                  <label className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <Languages className="w-4 h-4 text-blue-400" />
                    <span>Spoken Language / Accent Recognition:</span>
                  </label>
                  <select
                    disabled={isRecording || isTranscribing}
                    value={spokenLanguage}
                    onChange={e => setSpokenLanguage(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-[#131826] border border-slate-700 text-xs text-white focus:outline-none focus:border-blue-500"
                  >
                    {SPOKEN_LANGUAGE_OPTIONS.map(opt => (
                      <option key={opt.code} value={opt.code}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-4 rounded-xl bg-[#0b0f1a] border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        isRecording
                          ? 'bg-rose-500/20 border border-rose-500/50 text-rose-400'
                          : isTranscribing || isTranslatingSpeech
                          ? 'bg-blue-500/20 border border-blue-500/50 text-blue-400'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {isRecording ? <Mic className="w-5 h-5 animate-pulse" /> : <Mic className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">
                        {isRecording
                          ? `Listening & Transcribing... (${formatTimer(recordingSeconds)})`
                          : isTranscribing || isTranslatingSpeech
                          ? 'Processing & Translating Spoken Answer to English...'
                          : 'Microphone Voice Recorder Ready'}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {isRecording
                          ? 'Speak naturally—pauses and accents are supported. Tap Stop when finished.'
                          : 'Speak in English or your selected language (non-English answers auto-translate to English).'}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {!isRecording ? (
                      <button
                        type="button"
                        disabled={isTranscribing || isTranslatingSpeech || isSubmittingAnswer}
                        onClick={startSpokenRecording}
                        className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 transition cursor-pointer"
                      >
                        <Mic className="w-4 h-4" />
                        <span>{answerDraft ? 'Record More' : 'Record Answer'}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={stopSpokenRecording}
                        className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2 transition cursor-pointer"
                      >
                        <Square className="w-4 h-4" />
                        <span>Stop & Finalize Text</span>
                      </button>
                    )}

                    {(answerDraft || originalSpokenTranscript) && !isRecording && (
                      <>
                        <button
                          type="button"
                          disabled={isTranslatingSpeech || isTranscribing}
                          onClick={() => handleTranslateManualOrSpokenDraft(answerDraft)}
                          className="px-3 py-2.5 rounded-xl bg-indigo-600/25 border border-indigo-500/40 hover:bg-indigo-600/40 text-indigo-200 text-xs font-semibold transition cursor-pointer"
                        >
                          {isTranslatingSpeech ? 'Translating...' : 'Translate to English'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAnswerDraft('');
                            setOriginalSpokenTranscript('');
                            setInterimTranscript('');
                            setWasAnswerTranslated(false);
                            accumulatedTranscriptRef.current = '';
                          }}
                          className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
                        >
                          Clear
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Live Interim Speech Indicator */}
                {isRecording && interimTranscript && (
                  <div className="p-3 rounded-xl bg-blue-950/30 border border-blue-500/30 text-xs text-blue-200 italic">
                    <span className="font-semibold not-italic text-blue-400">Live speech: </span>
                    {interimTranscript}...
                  </div>
                )}

                {micErrorMsg && (
                  <div className="p-3 rounded-xl bg-amber-950/50 border border-amber-500/40 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-3">
                    <span>{micErrorMsg}</span>
                    <button
                      type="button"
                      onClick={startSpokenRecording}
                      className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold shrink-0 cursor-pointer"
                    >
                      Retry Microphone
                    </button>
                  </div>
                )}

                {/* Original Non-English Spoken Transcript (Preserved when translated) */}
                {wasAnswerTranslated && originalSpokenTranscript && originalSpokenTranscript !== answerDraft && (
                  <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-500/30 text-xs space-y-1">
                    <div className="flex items-center justify-between text-indigo-300 font-semibold">
                      <span>Original Spoken Transcript ({detectedLanguageLabel})</span>
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/20">
                        Preserved
                      </span>
                    </div>
                    <p className="text-indigo-100">{originalSpokenTranscript}</p>
                  </div>
                )}

                {/* Recognized / Translated English Answer Display (Editable so participant can fix transcription errors before submitting) */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <label className="block text-xs font-semibold text-slate-300">
                      {wasAnswerTranslated
                        ? 'Translated English Answer (Verify or edit before submitting for evaluation)'
                        : 'Recognized English Answer (Verify or edit transcription errors before submitting)'}
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      Words: {answerDraft.trim() ? answerDraft.trim().split(/\s+/).length : 0}
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    value={answerDraft}
                    readOnly={isRecording}
                    onChange={e => setAnswerDraft(e.target.value)}
                    placeholder="Speak into your microphone (or type/edit here if needed). Your recognized English response will appear here..."
                    className="w-full p-4 rounded-xl bg-[#070a12] border border-slate-800 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            ) : (
              /* Written Practice Mode */
              <div className="space-y-3 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    Written Answer (Type your response in English — or click Translate to English if typed in another language)
                  </label>
                  <div className="flex items-center gap-2">
                    {answerDraft.trim() && (
                      <button
                        type="button"
                        disabled={isTranslatingSpeech}
                        onClick={() => handleTranslateManualOrSpokenDraft(answerDraft)}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600/25 border border-indigo-500/40 hover:bg-indigo-600/40 text-indigo-200 text-[11px] font-semibold transition cursor-pointer"
                      >
                        {isTranslatingSpeech ? 'Translating...' : 'Translate to English'}
                      </button>
                    )}
                    <span className="text-[11px] text-slate-400 font-mono">
                      Words: {answerDraft.trim() ? answerDraft.trim().split(/\s+/).length : 0}
                    </span>
                  </div>
                </div>
                {wasAnswerTranslated && originalSpokenTranscript && originalSpokenTranscript !== answerDraft && (
                  <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-500/30 text-xs text-indigo-200">
                    <span className="font-semibold text-indigo-300">Original Text ({detectedLanguageLabel}): </span>
                    {originalSpokenTranscript}
                  </div>
                )}
                <textarea
                  rows={5}
                  value={answerDraft}
                  onChange={e => setAnswerDraft(e.target.value)}
                  placeholder="Write your full step-by-step response here..."
                  className="w-full p-4 rounded-xl bg-[#070a12] border border-slate-800 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            {/* Error or Retry Banner */}
            {sessionError && (
              <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200 flex items-center justify-between gap-3">
                <span>{sessionError}</span>
                <button
                  type="button"
                  onClick={handleSubmitCurrentAnswer}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold shrink-0 cursor-pointer"
                >
                  Retry Submit
                </button>
              </div>
            )}

            {providerNotice && (
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs text-amber-200">
                {providerNotice}
              </div>
            )}

            {lastFeedbackToast && (
              <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-300 font-medium">
                ✓ {lastFeedbackToast}
              </div>
            )}

            {/* Submit Answer Action */}
            <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-800">
              <span className="text-xs text-slate-400">
                Automated evaluation & autosave run immediately after each answer.
              </span>
              <button
                type="button"
                disabled={isRecording || isTranscribing || isSubmittingAnswer || !answerDraft.trim()}
                onClick={handleSubmitCurrentAnswer}
                className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer"
              >
                {isSubmittingAnswer ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Evaluating Answer...</span>
                  </>
                ) : (
                  <>
                    <span>Submit Answer & Evaluate</span>
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ========================================================
  // RENDER 5: PARTICIPANT PORTAL DASHBOARD (ROLE & LEVEL SELECTION)
  // ========================================================
  const inProgressAttempts = pastAttempts.filter(a => a.status === 'in_progress');
  const completedAttempts = pastAttempts.filter(a => a.status === 'completed');
  const currentRoleMeta = ROLE_METADATA[selectedRole];

  const allRoleKeys = Object.keys(ROLE_METADATA) as InterviewRoleId[];
  const permittedRoles = allRoleKeys.filter(rKey => isRoleAllowedForParticipant(rKey));
  const permittedProfessionalRoles = permittedRoles.filter(rKey => ROLE_METADATA[rKey].category === 'professional');
  const hasPermittedProfessional = permittedProfessionalRoles.length > 0;
  const hasPermittedEnglish = permittedRoles.includes('cefr_english');

  return (
    <div className="min-h-screen bg-[#090c14] text-slate-100 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-800 bg-[#0d121f]">
        <div className="flex items-center gap-3 shrink-0">
          <CCDLogo size={34} mode="icon" forceDark={true} />
          <span className="text-base font-bold tracking-tight text-white whitespace-nowrap">
            AI Interview & English Assessment Portal
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-400">
          {hasPermittedProfessional && (
            <button
              type="button"
              onClick={() => {
                setSelectedCategoryTab('professional');
                if (ROLE_METADATA[selectedRole].category !== 'professional') {
                  handleRoleSelect(permittedProfessionalRoles[0] || 'waiter');
                }
              }}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedCategoryTab === 'professional' ? 'text-white underline underline-offset-8' : ''
              }`}
            >
              Professional Interviews
            </button>
          )}
          {hasPermittedEnglish && (
            <>
              <button
                type="button"
                onClick={() => {
                  setSelectedCategoryTab('english');
                  handleRoleSelect('cefr_english');
                }}
                className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedCategoryTab === 'english' ? 'text-white underline underline-offset-8' : ''
                }`}
              >
                Spoken English (A1–C2)
              </button>
              <button
                type="button"
                onClick={() => setSelectedCategoryTab('english_exam')}
                className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedCategoryTab === 'english_exam'
                    ? 'text-blue-400 font-bold underline underline-offset-8'
                    : 'text-blue-300'
                }`}
              >
                English Level Exam (30 Qs)
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setSelectedCategoryTab('history')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              selectedCategoryTab === 'history' ? 'text-white underline underline-offset-8' : ''
            }`}
          >
            My Results ({completedAttempts.length})
          </button>
          {isAdminUser && onSwitchToAdminPanel && (
            <button
              type="button"
              onClick={onSwitchToAdminPanel}
              className="text-blue-400 hover:text-blue-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Admin Control Panel
            </button>
          )}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={async () => {
              await handleParticipantLogout();
              if (isAdminPreview) {
                onExitPortal();
              }
            }}
            className="px-4 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isAdminPreview ? 'Back to Workspace' : 'Sign Out / Switch Gmail'}
          </button>
        </div>
      </header>

      <main className="max-w-6xl w-full mx-auto p-6 space-y-6">
        {/* Participant Welcome, Assigned Categories & Instructions Banner */}
        <div className="p-5 rounded-2xl bg-[#111624] border border-slate-800 space-y-4">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Verified Participant: {participant?.displayName || userInfo?.name || userInfo?.email}</span>
                </span>
                <span>({participant?.email || userInfo?.email})</span>
              </div>
              <h1 className="text-xl font-bold text-white">
                Your Assigned Interview & Assessment Dashboard
              </h1>
              <p className="text-xs text-blue-300 font-medium">{SPOKEN_INTERVIEW_INSTRUCTION}</p>
            </div>

            {/* Category Switcher */}
            <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0b0f1a] border border-slate-800 rounded-xl shrink-0">
              {hasPermittedProfessional && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategoryTab('professional');
                    if (ROLE_METADATA[selectedRole].category !== 'professional') {
                      handleRoleSelect(permittedProfessionalRoles[0] || 'waiter');
                    }
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap cursor-pointer ${
                    selectedCategoryTab === 'professional' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Professional Roles ({permittedProfessionalRoles.length})
                </button>
              )}
              {hasPermittedEnglish && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategoryTab('english');
                      handleRoleSelect('cefr_english');
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap cursor-pointer ${
                      selectedCategoryTab === 'english' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    CEFR Spoken (A1–C2)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryTab('english_exam')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap cursor-pointer ${
                      selectedCategoryTab === 'english_exam'
                        ? 'bg-blue-600 text-white'
                        : 'text-blue-400 hover:text-white'
                    }`}
                  >
                    English Level Exam (30 Qs)
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setSelectedCategoryTab('history')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition whitespace-nowrap cursor-pointer ${
                  selectedCategoryTab === 'history' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                History ({completedAttempts.length})
              </button>
            </div>
          </div>

          {/* Assigned Categories & Quick Instructions Bar */}
          <div className="pt-3 border-t border-slate-800/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-slate-400 font-semibold mr-1">Assigned by Admin:</span>
              {permittedRoles.map(rKey => (
                <button
                  key={rKey}
                  type="button"
                  onClick={() => {
                    setSelectedCategoryTab(ROLE_METADATA[rKey].category === 'english' ? 'english' : 'professional');
                    handleRoleSelect(rKey);
                  }}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition cursor-pointer ${
                    selectedRole === rKey && selectedCategoryTab !== 'english_exam' && selectedCategoryTab !== 'history'
                      ? 'bg-blue-600/25 border-blue-500 text-white'
                      : 'bg-[#0b0f1a] border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {ROLE_METADATA[rKey].title} ({ROLE_METADATA[rKey].levels.length} Levels)
                </button>
              ))}
              {hasPermittedEnglish && (
                <button
                  type="button"
                  onClick={() => setSelectedCategoryTab('english_exam')}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition cursor-pointer ${
                    selectedCategoryTab === 'english_exam'
                      ? 'bg-blue-600/25 border-blue-500 text-white'
                      : 'bg-[#0b0f1a] border-slate-800 text-blue-300 hover:border-slate-700'
                  }`}
                >
                  30-Question English Level Exam
                </button>
              )}
            </div>
            <div className="text-[11px] text-slate-400">
              <strong className="text-slate-200">How to start:</strong> 1. Select an assigned role · 2. Choose Level & Mode · 3. Check consent & click <strong className="text-blue-400">Start Interview</strong>
            </div>
          </div>
        </div>

        {/* Resume In-Progress Session Banner */}
        {inProgressAttempts.length > 0 && (
          <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-amber-300">Saved Session Ready to Resume</div>
              <div className="text-xs text-slate-300">
                {inProgressAttempts[0].roleTitle} ({inProgressAttempts[0].levelLabel}) —{' '}
                {inProgressAttempts[0].answers.length} answers saved · Elapsed:{' '}
                {formatTimer(inProgressAttempts[0].durationSeconds)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleResumeAttempt(inProgressAttempts[0].attemptId)}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              Resume Saved Interview
            </button>
          </div>
        )}

        {selectedCategoryTab === 'english_exam' ? (
          <EnglishLevelExamModule
            participantName={participant?.displayName || userInfo?.name || ''}
            participantEmail={participant?.email || userInfo?.email || ''}
            isAdminPreview={isAdminPreview}
            onExamSaved={savedAtt => {
              setPastAttempts(prev => [savedAtt, ...prev]);
            }}
            onRevokedAccess={reason => handleImmediateLockout(reason)}
            onGetCertificate={pre => handleOpenCertificateForPreselection(pre)}
          />
        ) : selectedCategoryTab === 'history' ? null : (
          /* Two-Column Sandbox Layout: Role/Track Selector (Left) + Level, Mode & Consent Deck (Right) */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Track / Role Cards (7 cols) */}
            <div className="lg:col-span-7 space-y-3">
              <h2 className="text-xs font-bold text-slate-400">
                {selectedCategoryTab === 'professional'
                  ? 'A. Professional Interview Roles (Levels 1–3)'
                  : 'B. CEFR English Level Assessment (A1–C2)'}
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {(Object.keys(ROLE_METADATA) as InterviewRoleId[])
                  .filter(rKey =>
                    selectedCategoryTab === 'professional'
                      ? ROLE_METADATA[rKey].category === 'professional'
                      : ROLE_METADATA[rKey].category === 'english'
                  )
                  .map(rKey => {
                    const meta = ROLE_METADATA[rKey];
                    const Icon = ROLE_ICONS[rKey];
                    const isSelected = selectedRole === rKey;
                    const permitted = isRoleAllowedForParticipant(rKey);

                    return (
                      <button
                        key={rKey}
                        type="button"
                        disabled={!permitted}
                        onClick={() => handleRoleSelect(rKey)}
                        className={`p-4 rounded-2xl border text-left transition flex flex-col justify-between gap-3 cursor-pointer ${
                          !permitted
                            ? 'opacity-45 bg-[#0c101a] border-slate-800 cursor-not-allowed'
                            : isSelected
                            ? 'bg-blue-600/15 border-blue-500 text-white'
                            : 'bg-[#111624] border-slate-800 hover:border-slate-700 text-slate-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="p-2.5 rounded-xl bg-slate-800/80 text-blue-400">
                            <Icon className="w-5 h-5" />
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono">
                            {meta.levels.length} Levels
                          </span>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white">{meta.title}</div>
                          <p className="text-xs text-slate-400 mt-1 line-clamp-2">{meta.subtitle}</p>
                        </div>
                      </button>
                    );
                  })}

                {selectedCategoryTab === 'english' && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryTab('english_exam')}
                    className="p-4 rounded-2xl border border-blue-500/40 bg-gradient-to-br from-blue-950/40 to-[#111624] hover:border-blue-400 text-left transition flex flex-col justify-between gap-3 cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="p-2.5 rounded-xl bg-blue-600/20 text-blue-400">
                        <BookOpen className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] text-blue-300 font-mono">
                        30 Qs + Audio + Speaking + Writing
                      </span>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">
                        Full English Level Exam (CEFR A1 to C2)
                      </div>
                      <p className="text-xs text-slate-300 mt-1">
                        Complete 45-minute placement exam with Grammar, Vocabulary, Reading, Listening audio, 3 Speaking tasks & 1 Writing task.
                      </p>
                    </div>
                  </button>
                )}
              </div>

              {/* Default Rubric Summary Card */}
              <div className="p-5 rounded-2xl bg-[#111624] border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white">Evaluation Rubric (100 Points Total)</span>
                  <span className="font-mono tabular-nums text-emerald-400">
                    Pass Threshold: {rubricConfig.passThreshold}/100
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] text-slate-400 pt-1">
                  <div>
                    Role Knowledge: <strong className="text-white font-mono">{rubricConfig.roleKnowledgeWeight}</strong>
                  </div>
                  <div>
                    Problem-Solving: <strong className="text-white font-mono">{rubricConfig.situationalJudgmentWeight}</strong>
                  </div>
                  <div>
                    Grammar/Vocab: <strong className="text-white font-mono">{rubricConfig.grammarVocabWeight}</strong>
                  </div>
                  <div>
                    Clarity/Fluency: <strong className="text-white font-mono">{rubricConfig.clarityFluencyWeight}</strong>
                  </div>
                  <div>
                    Safety/Teamwork: <strong className="text-white font-mono">{rubricConfig.professionalismSafetyWeight}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Level, Spoken/Written Mode & Consent Launch Deck (5 cols) */}
            <div className="lg:col-span-5 p-6 rounded-2xl bg-[#111624] border border-slate-800 space-y-5">
              <div>
                <span className="text-xs text-blue-400 font-semibold">{currentRoleMeta.title}</span>
                <h3 className="text-lg font-bold text-white mt-0.5">Configure & Start Session</h3>
              </div>

              {/* 1. Level Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  1. Select Assessment Level & Passing Criteria
                </label>
                <div className="space-y-2">
                  {currentRoleMeta.levels.map(lvl => {
                    const active = selectedLevel === lvl.level;
                    const reqInfo = LEVEL_PASS_REQUIREMENTS_PREVIEW[lvl.level];
                    return (
                      <button
                        key={lvl.level}
                        type="button"
                        onClick={() => setSelectedLevel(lvl.level)}
                        className={`w-full p-3 rounded-xl border text-left text-xs flex flex-col gap-1 transition cursor-pointer ${
                          active
                            ? 'bg-blue-600/20 border-blue-500 text-white'
                            : 'bg-[#0b0f1a] border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="font-bold">{lvl.label}</span>
                          <span className="font-mono text-[11px] text-emerald-400">
                            Pass: {reqInfo?.passScore || 70}% · {rubricConfig.strictFiveMinuteCap ? '5 min' : lvl.targetDuration}
                          </span>
                        </div>
                        {reqInfo && (
                          <div className="text-[11px] text-slate-400 font-normal">
                            {reqInfo.summary}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Mode & Spoken Language Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  2. Select Response Mode (Spoken Default)
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSelectedMode('spoken')}
                    className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                      selectedMode === 'spoken'
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-[#0b0f1a] border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Mic className="w-4 h-4" />
                    <span>Spoken Mode</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedMode('written')}
                    className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                      selectedMode === 'written'
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-[#0b0f1a] border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    <span>Written Practice</span>
                  </button>
                </div>

                {selectedMode === 'spoken' && (
                  <div className="pt-2">
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Spoken Language / Accent (Non-English speech auto-translates to English):
                    </label>
                    <select
                      value={spokenLanguage}
                      onChange={e => setSpokenLanguage(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-[#0b0f1a] border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      {SPOKEN_LANGUAGE_OPTIONS.map(opt => (
                        <option key={opt.code} value={opt.code}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {currentRoleMeta.safetyDisclaimer && (
                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-[11px] text-amber-200 leading-relaxed">
                  {currentRoleMeta.safetyDisclaimer}
                </div>
              )}

              {/* 3. Mandatory Consent Checkbox */}
              <label className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#0b0f1a] border border-slate-800 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={e => setConsentChecked(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  I consent to microphone audio capture, speech-to-text transcription, and AI evaluation of my responses. I understand this is a practice assessment and not a formal certification.
                </span>
              </label>

              {setupError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200">
                  {setupError}
                </div>
              )}

              {micErrorMsg && (
                <div className="p-3 rounded-xl bg-amber-950/50 border border-amber-500/40 text-xs text-amber-200">
                  {micErrorMsg}
                </div>
              )}

              <button
                type="button"
                disabled={isStarting}
                onClick={handleStartInterview}
                className="w-full py-3.5 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {isStarting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Initializing Session...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>Start {selectedMode === 'spoken' ? 'Spoken Interview' : 'Written Practice'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Interview History Section (Always visible on the main dashboard & when History tab is active) */}
        {selectedCategoryTab !== 'english_exam' && (
          <section className="p-6 rounded-2xl bg-[#111624] border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <span>Interview History</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Previous interview and English assessment sessions completed by {participant?.displayName || userInfo?.name || userInfo?.email}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-3 py-1 rounded-lg bg-[#0b0f1a] border border-slate-800 text-slate-300 font-mono">
                  Completed Sessions: <strong className="text-white">{completedAttempts.length}</strong>
                </span>
                {completedAttempts.length > 0 && (
                  <span className="px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono">
                    Passed: <strong>{completedAttempts.filter(a => a.passFailStatus === 'PASS').length}</strong>
                  </span>
                )}
              </div>
            </div>

            {completedAttempts.length === 0 ? (
              <div className="p-6 rounded-xl bg-[#0b0f1a] border border-slate-800/80 text-center space-y-1">
                <p className="text-xs font-semibold text-slate-300">No Completed Interview Sessions Yet</p>
                <p className="text-xs text-slate-500">
                  Once you complete a Professional Role interview or CEFR English assessment, your completion date, score, and PASS/FAIL status will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-3 px-3">Completion Date</th>
                      <th className="py-3 px-3">Interview / Assessment Track</th>
                      <th className="py-3 px-3">Level</th>
                      <th className="py-3 px-3">Mode</th>
                      <th className="py-3 px-3 text-right">Duration</th>
                      <th className="py-3 px-3 text-right">Score</th>
                      <th className="py-3 px-3">Score Status</th>
                      <th className="py-3 px-3 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {completedAttempts.map(att => {
                      const completedDateObj = new Date(att.completedAt || att.startedAt);
                      const isPass = att.passFailStatus === 'PASS';
                      const isSafetyFail = att.passFailStatus === 'Fail — Safety Concern';
                      return (
                        <tr key={att.attemptId} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-3 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                            <div>{completedDateObj.toLocaleDateString()}</div>
                            <div className="text-[10px] text-slate-500">
                              {completedDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>
                          <td className="py-3 px-3 font-semibold text-white">{att.roleTitle}</td>
                          <td className="py-3 px-3 text-slate-300">
                            <span>{att.levelLabel}</span>
                            {att.cefrEvaluation?.estimatedLevel && (
                              <span className="ml-1.5 px-1.5 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-blue-300 font-mono text-[10px]">
                                CEFR {att.cefrEvaluation.estimatedLevel}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 capitalize text-slate-300">{att.mode}</td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-300">
                            {formatTimer(att.durationSeconds)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-white">
                            {att.totalScore ?? 0}/100
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                                isPass
                                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                  : isSafetyFail
                                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                                  : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                              }`}
                            >
                              {att.passFailStatus || 'Completed'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap space-x-2">
                            <button
                              type="button"
                              onClick={() => {
                                const pre = mapAttemptToCertificatePreselection(att);
                                handleOpenCertificateForPreselection(pre);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-[#c8102e] hover:bg-[#a50d26] text-white font-bold inline-flex items-center gap-1 transition cursor-pointer"
                            >
                              <Award className="w-3.5 h-3.5" />
                              <span>Get Certificate</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setViewingAttempt(att)}
                              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 font-semibold transition cursor-pointer"
                            >
                              View Scorecard
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
};
