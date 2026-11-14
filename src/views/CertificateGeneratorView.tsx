import React, { useState, useEffect, useRef } from 'react';
import {
  Award,
  Download,
  FileSpreadsheet,
  Search,
  CheckCircle2,
  XCircle,
  Trash2,
  FolderOpen,
  Settings,
  Lock,
  Unlock,
  Upload,
  X,
  Plus,
  Sparkles,
  QrCode,
  ShieldCheck,
  Calendar,
  User,
  BookOpen,
  Printer,
  RefreshCw,
} from 'lucide-react';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { BelvorineCertificateCanvas } from '../components/BelvorineCertificateCanvas';
import {
  CertificateProgramConfig,
  CertificateSettings,
  IssuedCertificateRecord,
  CertificatePreselection,
  loadCertificateSettings,
  saveCertificateSettings,
  loadIssuedCertificates,
  issueAndSaveCertificate,
  deleteIssuedCertificate,
  syncCertificatesFromFirestore,
  verifyCertificateById,
  consumePendingCertificatePreselection,
  mapAttemptToCertificatePreselection,
  isCertificateAdminUnlocked,
  verifyCertificateAdminPin,
  lockCertificateAdminSession,
  formatCertificateStampDate,
  DEFAULT_CERTIFICATE_SETTINGS,
} from '../services/certificateService';
import {
  fetchParticipantPortalOverview,
  fetchAdminInterviewOverview,
} from '../services/interviewCenterService';
import { InterviewAttemptRecord } from '../types/interviewCenter';

interface CertificateGeneratorViewProps {
  initialVerifyId?: string;
  initialPreselection?: CertificatePreselection | null;
}

export const CertificateGeneratorView: React.FC<CertificateGeneratorViewProps> = ({
  initialVerifyId,
  initialPreselection,
}) => {
  const [settings, setSettings] = useState<CertificateSettings>(() => loadCertificateSettings());
  const [history, setHistory] = useState<IssuedCertificateRecord[]>(() => loadIssuedCertificates());
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => isCertificateAdminUnlocked());
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'generator' | 'history' | 'verify' | 'settings'>(
    initialVerifyId ? 'verify' : 'generator'
  );

  // Completed trainings & interviews from the app
  const [completedAppAttempts, setCompletedAppAttempts] = useState<InterviewAttemptRecord[]>([]);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string>('');

  // Generator Form State
  const [candidateName, setCandidateName] = useState<string>('Fazle Rabbi');
  const [programId, setProgramId] = useState<string>(
    settings.programs[0]?.id || 'waiter'
  );
  const [level, setLevel] = useState<1 | 2 | 3>(1);
  const [issueDate, setIssueDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(undefined);

  // Current active certificate shown in live preview
  const [currentCert, setCurrentCert] = useState<IssuedCertificateRecord | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Verification State
  const [verifyQuery, setVerifyQuery] = useState<string>(initialVerifyId || '');
  const [verifySearched, setVerifySearched] = useState<boolean>(false);
  const [verifiedCert, setVerifiedCert] = useState<IssuedCertificateRecord | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  // Settings Editor State
  const [settingsDraft, setSettingsDraft] = useState<CertificateSettings>(settings);
  const [newProgramName, setNewProgramName] = useState('');

  // Responsive preview scaling
  const stageRef = useRef<HTMLDivElement | null>(null);
  const exportCertRef = useRef<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState<number>(0.68);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Sync from Firestore & load app trainings/interviews
  useEffect(() => {
    syncCertificatesFromFirestore().then(merged => {
      setHistory(merged);
    });

    const loadAppTrainings = async () => {
      try {
        const [portalData, adminData] = await Promise.allSettled([
          fetchParticipantPortalOverview(true),
          fetchAdminInterviewOverview(),
        ]);
        const byId = new Map<string, InterviewAttemptRecord>();
        if (portalData.status === 'fulfilled' && Array.isArray(portalData.value.attempts)) {
          portalData.value.attempts.forEach(a => {
            if (a.status === 'completed') byId.set(a.attemptId, a);
          });
        }
        if (adminData.status === 'fulfilled' && Array.isArray(adminData.value.attempts)) {
          adminData.value.attempts.forEach(a => {
            if (a.status === 'completed') byId.set(a.attemptId, a);
          });
        }
        setCompletedAppAttempts(Array.from(byId.values()));
      } catch {
        // Ignore if not available
      }
    };
    loadAppTrainings();
  }, []);

  // Apply preselection from training/interview result screen if present
  useEffect(() => {
    const pending = initialPreselection || consumePendingCertificatePreselection();
    if (pending) {
      const nextName = pending.name?.trim() || candidateName || 'Candidate';
      const validProg =
        settings.programs.find(p => p.id === pending.programId)?.id ||
        settings.programs[0]?.id ||
        'waiter';
      const nextLevel: 1 | 2 | 3 =
        pending.level && pending.level >= 1 && pending.level <= 3 ? pending.level : 1;
      const nextDate = pending.issuedAt || new Date().toISOString().slice(0, 10);

      setCandidateName(nextName);
      setProgramId(validProg);
      setLevel(nextLevel);
      setIssueDate(nextDate);
      if (pending.sourceAttemptId) {
        setSelectedAttemptId(pending.sourceAttemptId);
      }
      setActiveTab('generator');

      // Generate preview immediately
      issueAndSaveCertificate({
        name: nextName,
        programId: validProg,
        level: nextLevel,
        issuedAt: nextDate,
        photoDataUrl,
        sourceAttemptId: pending.sourceAttemptId,
      }).then(rec => {
        setCurrentCert(rec);
        setHistory(loadIssuedCertificates());
      });
      return;
    }

    // Otherwise initialize with most recent certificate or sample preview
    if (!currentCert) {
      const existing = loadIssuedCertificates();
      if (existing.length > 0) {
        const latest = existing[0];
        setCurrentCert(latest);
        setCandidateName(latest.name);
        setProgramId(latest.programId);
        setLevel(latest.level);
        setIssueDate(latest.issuedAt);
        setPhotoDataUrl(latest.photoDataUrl);
      } else {
        const defaultProg = settings.programs[0] || DEFAULT_CERTIFICATE_SETTINGS.programs[0];
        const previewOnly: IssuedCertificateRecord = {
          id: 'BLV-K7M4QX2D-2026',
          name: 'Fazle Rabbi',
          programId: defaultProg.id,
          programName: defaultProg.name,
          level: 1,
          award: defaultProg.levels[0].award,
          issuedAt: new Date().toISOString().slice(0, 10),
          directorName: settings.directorName,
          directorRole: settings.directorRole,
          siteHost: settings.siteHost,
          createdAt: new Date().toISOString(),
        };
        setCurrentCert(previewOnly);
      }
    }
  }, [initialPreselection]);

  // Handle URL verification query (?verify=BLV-... or #verify=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlVerifyId = initialVerifyId || params.get('verify') || '';
    const hash = window.location.hash || '';

    if (urlVerifyId) {
      setActiveTab('verify');
      setVerifyQuery(urlVerifyId);
      handleRunVerification(urlVerifyId, hash);
    }
  }, [initialVerifyId]);

  // Resize observer for responsive A4 landscape preview stage
  useEffect(() => {
    const updateScale = () => {
      if (!stageRef.current) return;
      const availableWidth = stageRef.current.clientWidth - 32;
      const scale = Math.min(1, Math.max(0.26, availableWidth / 1123));
      setPreviewScale(scale);
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [activeTab, isUnlocked]);

  const currentProgram =
    settings.programs.find(p => p.id === programId) ||
    settings.programs[0] ||
    DEFAULT_CERTIFICATE_SETTINGS.programs[0];

  // Update live preview when form fields change (keeping current ID until "Generate certificate" is clicked)
  const updateLivePreviewDraft = (overrides?: Partial<{
    name: string;
    programId: string;
    level: 1 | 2 | 3;
    issuedAt: string;
    photoDataUrl?: string;
  }>) => {
    const nextName = (overrides?.name !== undefined ? overrides.name : candidateName).trim() || 'Candidate Name';
    const nextProgId = overrides?.programId !== undefined ? overrides.programId : programId;
    const nextLevel = overrides?.level !== undefined ? overrides.level : level;
    const nextDate = overrides?.issuedAt !== undefined ? overrides.issuedAt : issueDate;
    const nextPhoto = overrides && 'photoDataUrl' in overrides ? overrides.photoDataUrl : photoDataUrl;

    const prog =
      settings.programs.find(p => p.id === nextProgId) ||
      settings.programs[0] ||
      DEFAULT_CERTIFICATE_SETTINGS.programs[0];
    const lvlObj = prog.levels[nextLevel - 1] || prog.levels[0];

    setCurrentCert(prev => ({
      id: prev?.id || 'BLV-K7M4QX2D-2026',
      name: nextName,
      programId: prog.id,
      programName: prog.name,
      level: nextLevel,
      award: lvlObj.award,
      issuedAt: nextDate,
      directorName: settings.directorName,
      directorRole: settings.directorRole,
      siteHost: settings.siteHost,
      photoDataUrl: nextPhoto,
      createdAt: prev?.createdAt || new Date().toISOString(),
    }));
  };

  // Generate a new unique Certificate (new ID BLV-XXXXXXXX-2026 + QR code + save to history)
  const handleGenerateCertificate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanName = candidateName.trim();
    if (!cleanName) {
      showToast('Please enter the candidate name.');
      return;
    }
    const created = await issueAndSaveCertificate({
      name: cleanName,
      programId,
      level,
      issuedAt: issueDate,
      photoDataUrl,
      sourceAttemptId: selectedAttemptId || undefined,
    });
    setCurrentCert(created);
    setHistory(loadIssuedCertificates());
    showToast(`Generated Certificate ${created.id} for ${created.name}`);
  };

  const handleSelectCompletedAttempt = (attemptId: string) => {
    setSelectedAttemptId(attemptId);
    if (!attemptId) return;
    const att = completedAppAttempts.find(a => a.attemptId === attemptId);
    if (!att) return;
    const mapped = mapAttemptToCertificatePreselection(att);
    const nextName = mapped.name || candidateName;
    const nextProg = mapped.programId || programId;
    const nextLevel = mapped.level || 1;
    const nextDate = mapped.issuedAt || issueDate;

    setCandidateName(nextName);
    setProgramId(nextProg);
    setLevel(nextLevel);
    setIssueDate(nextDate);
    updateLivePreviewDraft({
      name: nextName,
      programId: nextProg,
      level: nextLevel,
      issuedAt: nextDate,
    });
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxW = 360;
        const maxH = 440;
        let w = img.width;
        let h = img.height;
        if (w > maxW || h > maxH) {
          const ratio = Math.min(maxW / w, maxH / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
          setPhotoDataUrl(dataUrl);
          updateLivePreviewDraft({ photoDataUrl: dataUrl });
        }
      };
      img.src = String(ev.target?.result || '');
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setPhotoDataUrl(undefined);
    updateLivePreviewDraft({ photoDataUrl: undefined });
  };

  // Download A4 Landscape PDF (297mm x 210mm, exact colors kept)
  const handleDownloadPdf = async () => {
    let targetCert = currentCert;
    if (!targetCert || !history.some(h => h.id === targetCert?.id)) {
      targetCert = await issueAndSaveCertificate({
        name: candidateName.trim() || 'Candidate',
        programId,
        level,
        issuedAt: issueDate,
        photoDataUrl,
      });
      setCurrentCert(targetCert);
      setHistory(loadIssuedCertificates());
    }

    if (!exportCertRef.current) return;
    setIsExportingPdf(true);
    try {
      await new Promise(r => setTimeout(r, 120));
      const canvas = await html2canvas(exportCertRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: 1123,
        height: 794,
      });
      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });
      pdf.addImage(imgData, 'PNG', 0, 0, 297, 210, undefined, 'FAST');
      const safeName = targetCert.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      pdf.save(`Belvorine-Certificate-${safeName}-${targetCert.id}.pdf`);
      showToast(`Downloaded A4 Landscape PDF (${targetCert.id})`);
    } catch (err) {
      console.error('PDF export error:', err);
      window.print();
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Download High-Res PNG
  const handleDownloadPng = async () => {
    let targetCert = currentCert;
    if (!targetCert || !history.some(h => h.id === targetCert?.id)) {
      targetCert = await issueAndSaveCertificate({
        name: candidateName.trim() || 'Candidate',
        programId,
        level,
        issuedAt: issueDate,
        photoDataUrl,
      });
      setCurrentCert(targetCert);
      setHistory(loadIssuedCertificates());
    }

    if (!exportCertRef.current) return;
    setIsExportingPng(true);
    try {
      await new Promise(r => setTimeout(r, 120));
      const canvas = await html2canvas(exportCertRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: 1123,
        height: 794,
      });
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const link = document.createElement('a');
      const safeName = targetCert.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      link.download = `Belvorine-Certificate-${safeName}-${targetCert.id}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(`Downloaded PNG (${targetCert.id})`);
    } catch (err) {
      console.error('PNG export error:', err);
    } finally {
      setIsExportingPng(false);
    }
  };

  const handleOpenFromHistory = (cert: IssuedCertificateRecord) => {
    setCurrentCert(cert);
    setCandidateName(cert.name);
    setProgramId(cert.programId);
    setLevel(cert.level);
    setIssueDate(cert.issuedAt);
    setPhotoDataUrl(cert.photoDataUrl);
    setActiveTab('generator');
    showToast(`Opened certificate ${cert.id} (${cert.name})`);
  };

  const handleDeleteFromHistory = async (id: string) => {
    const updated = await deleteIssuedCertificate(id);
    setHistory(updated);
    showToast(`Deleted certificate ${id}`);
  };

  const handleRunVerification = async (idToVerify?: string, hashOverride?: string) => {
    const query = (idToVerify !== undefined ? idToVerify : verifyQuery).trim();
    if (!query) return;
    setIsVerifying(true);
    setVerifySearched(true);
    try {
      const found = await verifyCertificateById(
        query,
        hashOverride !== undefined ? hashOverride : window.location.hash
      );
      setVerifiedCert(found);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleUnlockAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyCertificateAdminPin(pinInput)) {
      setIsUnlocked(true);
      setPinInput('');
      setPinError(null);
      showToast('Admin Certificate Generator unlocked.');
    } else {
      setPinError('Invalid Admin PIN / Passcode. Please enter your admin PIN to create or manage certificates.');
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    saveCertificateSettings(settingsDraft);
    setSettings(settingsDraft);
    if (currentCert) {
      const prog =
        settingsDraft.programs.find(p => p.id === currentCert.programId) ||
        settingsDraft.programs[0];
      const award = prog?.levels[currentCert.level - 1]?.award || currentCert.award;
      setCurrentCert({
        ...currentCert,
        programName: prog?.name || currentCert.programName,
        award,
        directorName: settingsDraft.directorName,
        directorRole: settingsDraft.directorRole,
        siteHost: settingsDraft.siteHost,
      });
    }
    showToast('Saved Belvoriné Mixology certificate settings & programs.');
  };

  const handleAddProgram = () => {
    const clean = newProgramName.trim();
    if (!clean) return;
    const id = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (settingsDraft.programs.some(p => p.id === id)) {
      showToast('A program with this name already exists.');
      return;
    }
    const added: CertificateProgramConfig = {
      id,
      name: clean,
      levels: [
        { award: `Professional ${clean} — Level 1 (Basic)` },
        { award: `Professional ${clean} — Level 2 (Intermediate)` },
        { award: `Professional ${clean} — Level 3 (Advanced)` },
      ],
    };
    setSettingsDraft(prev => ({
      ...prev,
      programs: [...prev.programs, added],
    }));
    setNewProgramName('');
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Print-only stylesheet so browser Print -> Save as PDF outputs exact A4 landscape */}
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 0;
          }
          body * {
            visibility: hidden;
          }
          #belvorine-print-target,
          #belvorine-print-target * {
            visibility: visible;
          }
          #belvorine-print-target {
            position: fixed;
            left: 0;
            top: 0;
            width: 1123px;
            height: 794px;
            z-index: 99999;
          }
        }
      `}</style>

      {/* Offscreen Unscaled (1123x794) Render Target for Crisp PDF & PNG Export + Print */}
      {currentCert && (
        <div
          id="belvorine-print-target"
          style={{
            position: 'fixed',
            left: '-9999px',
            top: '0',
            width: '1123px',
            height: '794px',
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: -1,
          }}
        >
          <BelvorineCertificateCanvas certificate={currentCert} certRef={exportCertRef} />
        </div>
      )}

      {/* Top Feature Header */}
      <div className="p-6 rounded-2xl bg-white dark:bg-[#111624] border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#c8102e]/10 border border-[#c8102e]/30 flex items-center justify-center text-[#c8102e] shrink-0">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#c8102e] px-2.5 py-0.5 rounded-full bg-[#c8102e]/10 border border-[#c8102e]/25">
                Belvoriné Mixology Official System
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                Code-Generated A4 Landscape (HTML/CSS/SVG)
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">
              Belvoriné Mixology — Certificate Generator & Verification
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Issue official Level 1–3 certificates with automatic unique IDs (<code className="font-mono">BLV-XXXXXXXX-2026</code>), QR verification, A4 landscape PDF & PNG downloads.
            </p>
          </div>
        </div>

        {/* Navigation Sub-tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-slate-100 dark:bg-[#0b0f1a] border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('generator')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'generator'
                ? 'bg-[#c8102e] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Certificate Generator</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'history'
                ? 'bg-[#c8102e] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Issued History ({history.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('verify')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'verify'
                ? 'bg-[#c8102e] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Verify Certificate</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSettingsDraft(settings);
              setActiveTab('settings');
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-[#c8102e] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {toastMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-500/40 text-xs text-emerald-800 dark:text-emerald-200 font-semibold flex items-center justify-between">
          <span>✓ {toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-emerald-500 hover:text-emerald-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* =========================================================
          TAB 3: PUBLIC / QR CERTIFICATE VERIFICATION
         ========================================================= */}
      {activeTab === 'verify' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 p-6 rounded-2xl bg-white dark:bg-[#111624] border border-slate-200 dark:border-slate-800 space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#c8102e]/10 text-[#c8102e]">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Verify Certificate Authenticity
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Enter a Certificate ID (format <code className="font-mono">BLV-XXXXXXXX-2026</code>) or scan a certificate QR code.
                </p>
              </div>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                handleRunVerification();
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Certificate ID
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={verifyQuery}
                    onChange={e => setVerifyQuery(e.target.value)}
                    placeholder="e.g. BLV-K7M4QX2D-2026"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800 text-sm font-mono uppercase text-slate-900 dark:text-white focus:outline-none focus:border-[#c8102e]"
                  />
                  <button
                    type="submit"
                    disabled={isVerifying}
                    className="px-5 py-2.5 rounded-xl bg-[#c8102e] hover:bg-[#a50d26] text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                  >
                    <Search className="w-4 h-4" />
                    <span>Verify</span>
                  </button>
                </div>
              </div>
            </form>

            {/* Quick pick from recently issued certificates for easy testing */}
            {history.length > 0 && (
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <div className="text-[11px] font-semibold text-slate-400">
                  Recent Issued Certificate IDs (Click to verify):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {history.slice(0, 6).map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setVerifyQuery(item.id);
                        handleRunVerification(item.id);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-mono text-slate-700 dark:text-slate-300 transition cursor-pointer"
                    >
                      {item.id}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Verification Result Card */}
          <div className="lg:col-span-7 p-6 rounded-2xl bg-white dark:bg-[#111624] border border-slate-200 dark:border-slate-800">
            {!verifySearched ? (
              <div className="py-12 text-center space-y-2">
                <QrCode className="w-10 h-10 text-slate-400 mx-auto" />
                <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Enter a Certificate ID to Verify
                </div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Type any Belvoriné Mixology Certificate ID in the box on the left, or scan the QR code printed in the bottom-right corner of the certificate.
                </p>
              </div>
            ) : verifiedCert ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>✓ Verified — Authentic Certificate</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                    {verifiedCert.id}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-start gap-5">
                  {verifiedCert.photoDataUrl && (
                    <div className="w-24 h-28 rounded-lg border-2 border-[#c8102e] p-1 bg-white shrink-0">
                      <img
                        src={verifiedCert.photoDataUrl}
                        alt={verifiedCert.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs w-full">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0b0f1a] border border-slate-200 dark:border-slate-800">
                      <div className="text-slate-400">Candidate Name</div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                        {verifiedCert.name}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0b0f1a] border border-slate-200 dark:border-slate-800">
                      <div className="text-slate-400">Program & Level</div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                        {verifiedCert.programName} — Level {verifiedCert.level}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0b0f1a] border border-slate-200 dark:border-slate-800 sm:col-span-2">
                      <div className="text-slate-400">Awarded Qualification</div>
                      <div className="text-sm font-bold text-[#c8102e] dark:text-rose-400 mt-0.5">
                        {verifiedCert.award}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0b0f1a] border border-slate-200 dark:border-slate-800">
                      <div className="text-slate-400">Issue Date</div>
                      <div className="font-mono font-bold text-slate-900 dark:text-white mt-0.5">
                        {formatCertificateStampDate(verifiedCert.issuedAt)} ({verifiedCert.issuedAt})
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0b0f1a] border border-slate-200 dark:border-slate-800">
                      <div className="text-slate-400">Issued By</div>
                      <div className="font-bold text-slate-900 dark:text-white mt-0.5">
                        {verifiedCert.directorName} · Belvoriné Mixology
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleOpenFromHistory(verifiedCert)}
                    className="px-4 py-2.5 rounded-xl bg-[#c8102e] hover:bg-[#a50d26] text-white text-xs font-bold flex items-center gap-2 transition cursor-pointer"
                  >
                    <FolderOpen className="w-4 h-4" />
                    <span>Open Full Certificate Preview</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-10 text-center space-y-3">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-sm font-bold">
                  <XCircle className="w-5 h-5" />
                  <span>Certificate not found</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  No issued certificate matches ID <strong className="font-mono">{verifyQuery}</strong>. Please check the characters and try again.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================
          ADMIN / PIN GATE FOR GENERATOR, HISTORY & SETTINGS
         ========================================================= */}
      {activeTab !== 'verify' && !isUnlocked && (
        <div className="max-w-md mx-auto p-6 sm:p-8 rounded-2xl bg-white dark:bg-[#111624] border border-slate-200 dark:border-slate-800 space-y-5 shadow-lg">
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-[#c8102e]/15 text-[#c8102e] flex items-center justify-center">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Admin Authorization Required
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Only the owner / administrator can create, edit, or delete Belvoriné Mixology certificates. Enter your Admin PIN / Passcode to unlock.
            </p>
          </div>

          {pinError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 text-xs text-rose-700 dark:text-rose-200">
              {pinError}
            </div>
          )}

          <form onSubmit={handleUnlockAdmin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Admin PIN / Passcode
              </label>
              <input
                type="password"
                required
                value={pinInput}
                onChange={e => {
                  setPinInput(e.target.value);
                  if (pinError) setPinError(null);
                }}
                placeholder="Enter Admin PIN..."
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#c8102e]"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-[#c8102e] hover:bg-[#a50d26] text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Unlock className="w-4 h-4" />
              <span>Unlock Certificate Generator</span>
            </button>
          </form>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-center">
            <button
              type="button"
              onClick={() => setActiveTab('verify')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              Want to check a Certificate ID instead? Open Verify Certificate →
            </button>
          </div>
        </div>
      )}

      {/* =========================================================
          TAB 1: CERTIFICATE GENERATOR + LIVE A4 PREVIEW
         ========================================================= */}
      {activeTab === 'generator' && isUnlocked && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Left Column: Form Controls (4 cols) */}
          <div className="xl:col-span-4 p-6 rounded-2xl bg-white dark:bg-[#111624] border border-slate-200 dark:border-slate-800 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Certificate Details
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Fill in the candidate details and click <strong>Generate certificate</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  lockCertificateAdminSession();
                  setIsUnlocked(false);
                }}
                title="Lock Admin Session"
                className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 cursor-pointer"
              >
                <Lock className="w-4 h-4" />
              </button>
            </div>

            {/* Optional Quick Pre-select from App's Completed Trainings & Interviews */}
            {completedAppAttempts.length > 0 && (
              <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/25 border border-blue-200 dark:border-blue-500/30 space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                  Pre-select from Completed Training / Interview
                </label>
                <select
                  value={selectedAttemptId}
                  onChange={e => handleSelectCompletedAttempt(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-[#090c14] border border-blue-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                >
                  <option value="">— Manual Selection or Choose Completed Session —</option>
                  {completedAppAttempts.map(att => (
                    <option key={att.attemptId} value={att.attemptId}>
                      {att.participantName} — {att.roleTitle} ({att.levelLabel}) · {att.passFailStatus || 'Completed'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <form onSubmit={handleGenerateCertificate} className="space-y-4">
              {/* 1. Candidate Name (ANY name) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Candidate Name (Type Any Name) *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={candidateName}
                    onChange={e => {
                      setCandidateName(e.target.value);
                      updateLivePreviewDraft({ name: e.target.value });
                    }}
                    placeholder="e.g. Fazle Rabbi"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-[#c8102e]"
                  />
                </div>
              </div>

              {/* 2. Training / Interview / Program */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Training / Interview / Program
                </label>
                <div className="relative">
                  <BookOpen className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    value={programId}
                    onChange={e => {
                      const nextProg = e.target.value;
                      setProgramId(nextProg);
                      updateLivePreviewDraft({ programId: nextProg });
                    }}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-[#c8102e]"
                  >
                    {settings.programs.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 3. Level (1 - 3) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Level (1–3) & Award Title
                </label>
                <select
                  value={level}
                  onChange={e => {
                    const nextLvl = Number(e.target.value) as 1 | 2 | 3;
                    setLevel(nextLvl);
                    updateLivePreviewDraft({ level: nextLvl });
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-[#c8102e]"
                >
                  {currentProgram.levels.map((lvl, idx) => (
                    <option key={idx + 1} value={idx + 1}>
                      Level {idx + 1} — {lvl.award}
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. Issue Date (default today) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Issue Date
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="date"
                    value={issueDate}
                    onChange={e => {
                      setIssueDate(e.target.value);
                      updateLivePreviewDraft({ issuedAt: e.target.value });
                    }}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#c8102e]"
                  />
                </div>
              </div>

              {/* 5. Optional Photo Upload (Passport-Style) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Optional Photo (Passport-Style)
                  </label>
                  {photoDataUrl && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="text-[11px] font-semibold text-rose-500 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                      <span>Remove photo</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex-1 flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-[#c8102e] bg-slate-50 dark:bg-[#090c14] text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer transition">
                    <Upload className="w-4 h-4 text-[#c8102e]" />
                    <span>{photoDataUrl ? 'Change Photo' : 'Upload Passport-Style Photo'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                  {photoDataUrl && (
                    <img
                      src={photoDataUrl}
                      alt="Preview"
                      className="w-11 h-13 object-cover rounded border border-[#c8102e]"
                    />
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  If added, shown in a framed square inside the certificate border; if left out, omitted cleanly.
                </p>
              </div>

              {/* Generate Certificate Action Button */}
              <button
                type="submit"
                className="w-full py-3.5 px-5 rounded-xl bg-[#c8102e] hover:bg-[#a50d26] text-white font-bold text-xs uppercase tracking-wider shadow-md flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Generate certificate</span>
              </button>
            </form>

            {/* Export Buttons: Download PDF & Download PNG */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={isExportingPdf}
                  onClick={handleDownloadPdf}
                  className="py-3 px-3.5 rounded-xl bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  {isExportingPdf ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>Download PDF</span>
                </button>

                <button
                  type="button"
                  disabled={isExportingPng}
                  onClick={handleDownloadPng}
                  className="py-3 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  {isExportingPng ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4" />
                  )}
                  <span>Download PNG</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => window.print()}
                className="w-full py-2.5 px-3.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print / Save as PDF (A4 Landscape)</span>
              </button>

              {currentCert && (
                <div className="text-center pt-1 text-xs text-slate-500 dark:text-slate-400">
                  Certificate ID: <strong className="font-mono text-slate-900 dark:text-white">{currentCert.id}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Live Certificate Preview Stage (8 cols) */}
          <div className="xl:col-span-8 space-y-4">
            <div
              ref={stageRef}
              className="p-4 sm:p-6 rounded-2xl bg-[#e9e6e1] dark:bg-[#171923] border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-start overflow-hidden shadow-inner"
              style={{
                height: `${Math.round(794 * previewScale + 48)}px`,
              }}
            >
              {currentCert && (
                <div
                  style={{
                    width: '1123px',
                    height: '794px',
                    transform: `scale(${previewScale})`,
                    transformOrigin: 'top center',
                    boxShadow: '0 14px 36px rgba(0, 0, 0, 0.22)',
                  }}
                >
                  <BelvorineCertificateCanvas certificate={currentCert} />
                </div>
              )}
            </div>

            {/* Quick Verification Box right below preview */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#111624] border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-xs">
                <QrCode className="w-5 h-5 text-[#c8102e] shrink-0" />
                <div>
                  <span className="font-bold text-slate-900 dark:text-white">Quick Verify Certificate ID: </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    Type any Certificate ID to inspect saved verification details.
                  </span>
                </div>
              </div>
              <form
                onSubmit={e => {
                  e.preventDefault();
                  setActiveTab('verify');
                  handleRunVerification();
                }}
                className="flex items-center gap-2 w-full sm:w-auto"
              >
                <input
                  type="text"
                  value={verifyQuery}
                  onChange={e => setVerifyQuery(e.target.value)}
                  placeholder="BLV-XXXXXXXX-2026"
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800 text-xs font-mono uppercase text-slate-900 dark:text-white w-full sm:w-48"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#c8102e] hover:bg-[#a50d26] text-white text-xs font-bold shrink-0 cursor-pointer"
                >
                  Verify
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          TAB 2: ISSUED CERTIFICATES HISTORY LIST
         ========================================================= */}
      {activeTab === 'history' && isUnlocked && (
        <div className="p-6 rounded-2xl bg-white dark:bg-[#111624] border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Issued Certificates History ({history.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                All generated certificates saved in your application storage. Click <strong>Open again</strong> to preview/download or <strong>Delete</strong> to remove.
              </p>
            </div>
          </div>

          {history.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Award className="w-10 h-10 text-slate-400 mx-auto" />
              <div className="text-sm font-bold text-slate-700 dark:text-slate-200">
                No Certificates Issued Yet
              </div>
              <p className="text-xs text-slate-500">
                Use the Certificate Generator tab to issue your first Belvoriné Mixology certificate.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-3">Candidate Name</th>
                    <th className="py-3 px-3">Program</th>
                    <th className="py-3 px-3">Level & Award</th>
                    <th className="py-3 px-3">Issue Date</th>
                    <th className="py-3 px-3">Certificate ID</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/70">
                  {history.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5">
                          {item.photoDataUrl && (
                            <img
                              src={item.photoDataUrl}
                              alt={item.name}
                              className="w-7 h-8 object-cover rounded border border-[#c8102e]"
                            />
                          )}
                          <span className="font-bold text-slate-900 dark:text-white">{item.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-700 dark:text-slate-200">
                        {item.programName}
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                        <span className="font-bold text-[#c8102e] dark:text-rose-400">Level {item.level}</span> — {item.award}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-500 dark:text-slate-400">
                        {formatCertificateStampDate(item.issuedAt)} ({item.issuedAt})
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-900 dark:text-white">
                        {item.id}
                      </td>
                      <td className="py-3 px-3 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleOpenFromHistory(item)}
                          className="px-3 py-1.5 rounded-lg bg-blue-600/15 text-blue-600 dark:text-blue-400 hover:bg-blue-600/25 font-bold cursor-pointer"
                        >
                          Open again
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setVerifyQuery(item.id);
                            setActiveTab('verify');
                            handleRunVerification(item.id);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-600/25 font-bold cursor-pointer"
                        >
                          Verify
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteFromHistory(item.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-600/15 text-rose-600 dark:text-rose-400 hover:bg-rose-600/25 font-bold cursor-pointer"
                          title="Delete certificate"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* =========================================================
          TAB 4: CERTIFICATE SETTINGS (DIRECTOR NAME & PROGRAM LIST)
         ========================================================= */}
      {activeTab === 'settings' && isUnlocked && (
        <form
          onSubmit={handleSaveSettings}
          className="p-6 rounded-2xl bg-white dark:bg-[#111624] border border-slate-200 dark:border-slate-800 space-y-6 max-w-4xl"
        >
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Belvoriné Mixology — Certificate Configuration
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Customize the Director Name, verification host, Admin PIN, and the Program & Level (1–3) award titles.
              </p>
            </div>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-[#c8102e] hover:bg-[#a50d26] text-white text-xs font-bold cursor-pointer"
            >
              Save Settings
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                Director Name (Under Signature)
              </label>
              <input
                type="text"
                value={settingsDraft.directorName}
                onChange={e => setSettingsDraft({ ...settingsDraft, directorName: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                Director Title / Role
              </label>
              <input
                type="text"
                value={settingsDraft.directorRole}
                onChange={e => setSettingsDraft({ ...settingsDraft, directorRole: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                Verification Host (Under QR)
              </label>
              <input
                type="text"
                value={settingsDraft.siteHost}
                onChange={e => setSettingsDraft({ ...settingsDraft, siteHost: e.target.value })}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Editable Programs & Level 1-3 Award Titles */}
          <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Editable Programs & Level 1–3 Award Lines
              </h3>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newProgramName}
                  onChange={e => setNewProgramName(e.target.value)}
                  placeholder="New program name..."
                  className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-[#090c14] border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={handleAddProgram}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Program</span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {settingsDraft.programs.map((prog, pIdx) => (
                <div
                  key={prog.id}
                  className="p-4 rounded-xl bg-slate-50 dark:bg-[#0b0f1a] border border-slate-200 dark:border-slate-800 space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <input
                      type="text"
                      value={prog.name}
                      onChange={e => {
                        const next = [...settingsDraft.programs];
                        next[pIdx] = { ...prog, name: e.target.value };
                        setSettingsDraft({ ...settingsDraft, programs: next });
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#111624] border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white"
                    />
                    {settingsDraft.programs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSettingsDraft({
                            ...settingsDraft,
                            programs: settingsDraft.programs.filter((_, i) => i !== pIdx),
                          });
                        }}
                        className="text-xs text-rose-500 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {[0, 1, 2].map(lIdx => (
                      <div key={lIdx}>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                          Level {lIdx + 1} Award Line
                        </label>
                        <input
                          type="text"
                          value={prog.levels[lIdx]?.award || ''}
                          onChange={e => {
                            const nextPrograms = [...settingsDraft.programs];
                            const nextLevels = [...prog.levels] as CertificateProgramConfig['levels'];
                            nextLevels[lIdx] = { award: e.target.value };
                            nextPrograms[pIdx] = { ...prog, levels: nextLevels };
                            setSettingsDraft({ ...settingsDraft, programs: nextPrograms });
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#111624] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
