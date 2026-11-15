import '../utils/belvorineQrLib.js';
import { db, auth } from './firebase';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  getDoc,
} from 'firebase/firestore';

export interface CertificateLevelConfig {
  award: string;
}

export interface CertificateProgramConfig {
  id: string;
  name: string;
  levels: [CertificateLevelConfig, CertificateLevelConfig, CertificateLevelConfig];
}

export interface CertificateSettings {
  brand: string;
  directorName: string;
  directorRole: string;
  siteHost: string;
  adminPin: string;
  programs: CertificateProgramConfig[];
}

export interface IssuedCertificateRecord {
  id: string; // BLV-XXXXXXXX-2026
  name: string;
  programId: string;
  programName: string;
  level: 1 | 2 | 3;
  award: string;
  issuedAt: string; // YYYY-MM-DD
  directorName: string;
  directorRole: string;
  siteHost: string;
  photoDataUrl?: string;
  createdAt: string;
  sourceAttemptId?: string;
}

export interface CertificatePreselection {
  name?: string;
  programId?: string;
  level?: 1 | 2 | 3;
  issuedAt?: string;
  sourceAttemptId?: string;
}

const STORAGE_KEY_CERTIFICATES = 'belvorine_issued_certificates_v1';
const STORAGE_KEY_SETTINGS = 'belvorine_certificate_settings_v1';
const STORAGE_KEY_PRESELECTION = 'belvorine_certificate_preselection_v1';
const STORAGE_KEY_ADMIN_UNLOCKED = 'belvorine_certificate_admin_unlocked_v1';

export const DEFAULT_CERTIFICATE_PROGRAMS: CertificateProgramConfig[] = [
  {
    id: 'waiter',
    name: 'Waiter',
    levels: [
      { award: 'Professional Waiter — Level 1 (Basic)' },
      { award: 'Professional Waiter — Level 2 (Intermediate)' },
      { award: 'Professional Waiter — Level 3 (Advanced)' },
    ],
  },
  {
    id: 'bar-career',
    name: 'Bar Career',
    levels: [
      { award: 'Barback — Level 1' },
      { award: 'Bartender — Level 2' },
      { award: 'Professional Bartender — Level 3' },
    ],
  },
  {
    id: 'bartender',
    name: 'Bartender',
    levels: [
      { award: 'Professional Bartender — Level 1 (Basic)' },
      { award: 'Professional Bartender — Level 2 (Intermediate)' },
      { award: 'Professional Bartender — Level 3 (Advanced)' },
    ],
  },
  {
    id: 'barista',
    name: 'Barista',
    levels: [
      { award: 'Professional Barista — Level 1 (Basic)' },
      { award: 'Professional Barista — Level 2 (Intermediate)' },
      { award: 'Professional Barista — Level 3 (Advanced)' },
    ],
  },
  {
    id: 'electrician',
    name: 'Maintenance Electrician',
    levels: [
      { award: 'Maintenance Electrician — Level 1 (Basic)' },
      { award: 'Maintenance Electrician — Level 2 (Intermediate)' },
      { award: 'Maintenance Electrician — Level 3 (Advanced)' },
    ],
  },
  {
    id: 'plumber',
    name: 'Plumber',
    levels: [
      { award: 'Professional Plumber — Level 1 (Basic)' },
      { award: 'Professional Plumber — Level 2 (Intermediate)' },
      { award: 'Professional Plumber — Level 3 (Advanced)' },
    ],
  },
  {
    id: 'cefr-english',
    name: 'English Level Assessment',
    levels: [
      { award: 'English Proficiency — Level 1 (Basic A1–A2)' },
      { award: 'English Proficiency — Level 2 (Intermediate B1–B2)' },
      { award: 'English Proficiency — Level 3 (Advanced C1–C2)' },
    ],
  },
];

export const DEFAULT_CERTIFICATE_SETTINGS: CertificateSettings = {
  brand: 'Belvoriné Mixology',
  directorName: 'Fazle Rabbi',
  directorRole: 'Program Director',
  siteHost: 'belvorine.lovable.app',
  adminPin: 'C++Rabbe',
  programs: DEFAULT_CERTIFICATE_PROGRAMS,
};

/**
 * Generates a unique Certificate ID in the exact format BLV-XXXXXXXX-2026
 * using unambiguous characters (no 0/O or 1/I).
 */
export function generateUniqueCertificateId(existingIds: Set<string> = new Set()): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 25; attempt++) {
    let out = '';
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      const r = new Uint32Array(8);
      window.crypto.getRandomValues(r);
      for (let i = 0; i < 8; i++) {
        out += chars[r[i] % chars.length];
      }
    } else {
      for (let i = 0; i < 8; i++) {
        out += chars[Math.floor(Math.random() * chars.length)];
      }
    }
    const candidateId = `BLV-${out}-2026`;
    if (!existingIds.has(candidateId)) {
      return candidateId;
    }
  }
  return `BLV-${Date.now().toString(36).toUpperCase().slice(-8).padStart(8, 'X')}-2026`;
}

/**
 * Formats YYYY-MM-DD as DD.MM.YYYY for the circular Belvoriné Mixology issue date stamp
 */
export function formatCertificateStampDate(isoDate: string): string {
  if (!isoDate) {
    const today = new Date().toISOString().slice(0, 10).split('-');
    return `${today[2]}.${today[1]}.${today[0]}`;
  }
  const parts = isoDate.slice(0, 10).split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function toBase64Url(str: string): string {
  try {
    return btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  } catch {
    return '';
  }
}

function fromBase64Url(b64: string): string {
  let s = b64.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return decodeURIComponent(escape(atob(s)));
}

/**
 * Builds the verification URL encoded inside the certificate QR code.
 * Privacy rule: NEVER includes any passport number.
 */
export function buildCertificateVerifyUrl(cert: IssuedCertificateRecord): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : `https://${cert.siteHost || 'belvorine.lovable.app'}`;
  const payload = {
    n: cert.name,
    p: cert.programName,
    pid: cert.programId,
    l: cert.level,
    a: cert.award,
    d: cert.issuedAt,
    i: cert.id,
    dir: cert.directorName,
  };
  const encoded = toBase64Url(JSON.stringify(payload));
  return `${origin}/?verify=${encodeURIComponent(cert.id)}#verify=${encoded}`;
}

export function decodeEmbeddedCertificatePayload(
  rawHashOrToken: string
): Partial<IssuedCertificateRecord> | null {
  try {
    const cleaned = rawHashOrToken
      .replace(/^#?verify=/i, '')
      .replace(/^#/, '')
      .trim();
    if (!cleaned) return null;
    const obj = JSON.parse(fromBase64Url(cleaned));
    if (!obj || !obj.i || !obj.n) return null;
    return {
      id: String(obj.i),
      name: String(obj.n),
      programId: String(obj.pid || 'bar-career'),
      programName: String(obj.p || 'Bar Career'),
      level: (Number(obj.l) >= 1 && Number(obj.l) <= 3 ? Number(obj.l) : 1) as 1 | 2 | 3,
      award: String(obj.a || ''),
      issuedAt: String(obj.d || new Date().toISOString().slice(0, 10)),
      directorName: String(obj.dir || DEFAULT_CERTIFICATE_SETTINGS.directorName),
      directorRole: DEFAULT_CERTIFICATE_SETTINGS.directorRole,
      siteHost: DEFAULT_CERTIFICATE_SETTINGS.siteHost,
    };
  } catch {
    return null;
  }
}

/**
 * Generates the exact SVG QR code using the bundled Kazuhiko Arase QRLib
 */
export function generateQrCodeSvg(text: string): string {
  try {
    const QRLib = (window as any).QRLib;
    if (!QRLib || !QRLib.QRCode) {
      return '';
    }
    const q = new QRLib.QRCode(-1, QRLib.ECL.M);
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    let rects = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (q.isDark(y, x)) {
          rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`;
        }
      }
    }
    return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" fill="#111">${rects}</svg>`;
  } catch (err) {
    console.error('QR generation error:', err);
    return '';
  }
}

export function loadCertificateSettings(): CertificateSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (!raw) return DEFAULT_CERTIFICATE_SETTINGS;
    const parsed = JSON.parse(raw);
    const mergedPrograms: CertificateProgramConfig[] = Array.isArray(parsed.programs) && parsed.programs.length > 0
      ? parsed.programs
      : DEFAULT_CERTIFICATE_PROGRAMS;
    return {
      brand: parsed.brand || DEFAULT_CERTIFICATE_SETTINGS.brand,
      directorName: parsed.directorName || DEFAULT_CERTIFICATE_SETTINGS.directorName,
      directorRole: parsed.directorRole || DEFAULT_CERTIFICATE_SETTINGS.directorRole,
      siteHost: parsed.siteHost || DEFAULT_CERTIFICATE_SETTINGS.siteHost,
      adminPin: parsed.adminPin || DEFAULT_CERTIFICATE_SETTINGS.adminPin,
      programs: mergedPrograms,
    };
  } catch {
    return DEFAULT_CERTIFICATE_SETTINGS;
  }
}

export function saveCertificateSettings(settings: CertificateSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save certificate settings:', e);
  }
}

export function loadIssuedCertificates(): IssuedCertificateRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CERTIFICATES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveIssuedCertificates(list: IssuedCertificateRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_CERTIFICATES, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to save certificates to localStorage:', e);
  }
}

export async function issueAndSaveCertificate(input: {
  id?: string;
  name: string;
  programId: string;
  level: 1 | 2 | 3;
  issuedAt?: string;
  photoDataUrl?: string;
  sourceAttemptId?: string;
}): Promise<IssuedCertificateRecord> {
  const settings = loadCertificateSettings();
  const existing = loadIssuedCertificates();
  const existingIds = new Set(existing.map(c => c.id.toUpperCase()));

  const program =
    settings.programs.find(p => p.id === input.programId) ||
    settings.programs[0] ||
    DEFAULT_CERTIFICATE_PROGRAMS[0];
  const levelNum: 1 | 2 | 3 = input.level >= 1 && input.level <= 3 ? input.level : 1;
  const levelObj = program.levels[levelNum - 1] || program.levels[0];
  const dateStr = (input.issuedAt || new Date().toISOString().slice(0, 10)).slice(0, 10);

  const certId =
    input.id && input.id.trim()
      ? input.id.trim().toUpperCase()
      : generateUniqueCertificateId(existingIds);

  const record: IssuedCertificateRecord = {
    id: certId,
    name: input.name.trim(),
    programId: program.id,
    programName: program.name,
    level: levelNum,
    award: levelObj.award,
    issuedAt: dateStr,
    directorName: settings.directorName || 'Fazle Rabbi',
    directorRole: settings.directorRole || 'Program Director',
    siteHost: settings.siteHost || 'belvorine.lovable.app',
    photoDataUrl: input.photoDataUrl || undefined,
    createdAt: new Date().toISOString(),
    sourceAttemptId: input.sourceAttemptId,
  };

  const filtered = existing.filter(c => c.id.toUpperCase() !== record.id.toUpperCase());
  const updated = [record, ...filtered];
  saveIssuedCertificates(updated);

  // Sync to Firestore if signed in
  try {
    const uid = auth.currentUser?.uid;
    if (uid) {
      await setDoc(doc(db, 'users', uid, 'certificates', record.id), {
        ...record,
        uid,
      });
    }
  } catch {
    // LocalStorage remains primary source of truth if offline or unauthenticated
  }

  return record;
}

export async function deleteIssuedCertificate(certId: string): Promise<IssuedCertificateRecord[]> {
  const cleanId = certId.trim().toUpperCase();
  const existing = loadIssuedCertificates();
  const updated = existing.filter(c => c.id.toUpperCase() !== cleanId);
  saveIssuedCertificates(updated);

  try {
    const uid = auth.currentUser?.uid;
    if (uid) {
      await deleteDoc(doc(db, 'users', uid, 'certificates', cleanId));
    }
  } catch {
    // Ignore Firestore errors when offline
  }

  return updated;
}

export async function syncCertificatesFromFirestore(): Promise<IssuedCertificateRecord[]> {
  const local = loadIssuedCertificates();
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return local;
    const snap = await getDocs(collection(db, 'users', uid, 'certificates'));
    if (snap.empty) return local;

    const byId = new Map<string, IssuedCertificateRecord>();
    local.forEach(c => byId.set(c.id.toUpperCase(), c));
    snap.forEach(d => {
      const data = d.data() as IssuedCertificateRecord;
      if (data && data.id && !byId.has(data.id.toUpperCase())) {
        byId.set(data.id.toUpperCase(), data);
      }
    });
    const merged = Array.from(byId.values()).sort((a, b) =>
      (b.createdAt || b.issuedAt).localeCompare(a.createdAt || a.issuedAt)
    );
    saveIssuedCertificates(merged);
    return merged;
  } catch {
    return local;
  }
}

export async function verifyCertificateById(
  queryId: string,
  embeddedHash?: string
): Promise<IssuedCertificateRecord | null> {
  const cleanId = queryId.trim().toUpperCase();
  if (!cleanId) return null;

  const localList = loadIssuedCertificates();
  const foundLocal = localList.find(c => c.id.toUpperCase() === cleanId);
  if (foundLocal) return foundLocal;

  // Check Firestore if authenticated
  try {
    const uid = auth.currentUser?.uid;
    if (uid) {
      const docSnap = await getDoc(doc(db, 'users', uid, 'certificates', cleanId));
      if (docSnap.exists()) {
        return docSnap.data() as IssuedCertificateRecord;
      }
    }
  } catch {
    // Ignore
  }

  // If opened from a QR scan with an embedded hash for this exact ID, decode it
  if (embeddedHash) {
    const decoded = decodeEmbeddedCertificatePayload(embeddedHash);
    if (decoded && decoded.id && decoded.id.toUpperCase() === cleanId && decoded.name) {
      return {
        id: decoded.id.toUpperCase(),
        name: decoded.name,
        programId: decoded.programId || 'bar-career',
        programName: decoded.programName || 'Bar Career',
        level: decoded.level || 1,
        award: decoded.award || 'Professional Certificate',
        issuedAt: decoded.issuedAt || new Date().toISOString().slice(0, 10),
        directorName: decoded.directorName || DEFAULT_CERTIFICATE_SETTINGS.directorName,
        directorRole: decoded.directorRole || DEFAULT_CERTIFICATE_SETTINGS.directorRole,
        siteHost: decoded.siteHost || DEFAULT_CERTIFICATE_SETTINGS.siteHost,
        createdAt: new Date().toISOString(),
      };
    }
  }

  return null;
}

export function setPendingCertificatePreselection(pre: CertificatePreselection | null): void {
  try {
    if (!pre) {
      sessionStorage.removeItem(STORAGE_KEY_PRESELECTION);
    } else {
      sessionStorage.setItem(STORAGE_KEY_PRESELECTION, JSON.stringify(pre));
    }
  } catch {
    // Ignore
  }
}

export function consumePendingCertificatePreselection(): CertificatePreselection | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_PRESELECTION);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY_PRESELECTION);
    return JSON.parse(raw) as CertificatePreselection;
  } catch {
    return null;
  }
}

/**
 * Maps an interview or English exam attempt from the app into a CertificatePreselection
 * (Program ID + Level 1-3 + Candidate Name + Date).
 */
export function mapAttemptToCertificatePreselection(attempt: {
  attemptId?: string;
  participantName?: string;
  role?: string;
  level?: string;
  completedAt?: string;
  startedAt?: string;
  cefrEvaluation?: { estimatedLevel?: string };
  englishExamResult?: { objective?: { level?: string } };
}): CertificatePreselection {
  const roleMap: Record<string, string> = {
    waiter: 'waiter',
    bartender: 'bartender',
    'bar-career': 'bar-career',
    barista: 'barista',
    electrician: 'electrician',
    plumber: 'plumber',
    cefr_english: 'cefr-english',
  };
  const programId = roleMap[String(attempt.role || '').toLowerCase()] || 'waiter';

  let mappedLevel: 1 | 2 | 3 = 1;
  const rawLevel =
    attempt.englishExamResult?.objective?.level ||
    attempt.cefrEvaluation?.estimatedLevel ||
    attempt.level ||
    '1';
  const upper = String(rawLevel).toUpperCase();
  if (upper === '3' || upper === 'C1' || upper === 'C2') {
    mappedLevel = 3;
  } else if (upper === '2' || upper === 'B1' || upper === 'B2') {
    mappedLevel = 2;
  } else {
    mappedLevel = 1;
  }

  const rawDate = attempt.completedAt || attempt.startedAt || new Date().toISOString();
  const issuedAt = rawDate.slice(0, 10);

  return {
    name: attempt.participantName || '',
    programId,
    level: mappedLevel,
    issuedAt,
    sourceAttemptId: attempt.attemptId,
  };
}

export function isCertificateAdminUnlocked(): boolean {
  try {
    if (sessionStorage.getItem(STORAGE_KEY_ADMIN_UNLOCKED) === 'true') return true;
    // Also check if the main app security session is unlocked
    if (sessionStorage.getItem('ccd_security_unlocked_v2') === 'true') return true;
    return false;
  } catch {
    return false;
  }
}

export function verifyCertificateAdminPin(inputPin: string): boolean {
  const clean = inputPin.trim();
  if (!clean) return false;
  const settings = loadCertificateSettings();
  const customPin = localStorage.getItem('careerpilot_custom_passcode');
  const validPins = new Set([
    settings.adminPin,
    'C++Rabbe',
    '89056',
    ...(customPin ? [customPin] : []),
  ]);
  if (validPins.has(clean)) {
    try {
      sessionStorage.setItem(STORAGE_KEY_ADMIN_UNLOCKED, 'true');
    } catch {}
    return true;
  }
  return false;
}

export function lockCertificateAdminSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY_ADMIN_UNLOCKED);
  } catch {}
}
