import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { CVData, CVUserAccount, CVDocumentItem, CVTemplateType, CVDesignTemplateId } from '../types/cv';
import { generateDirectCVPdfBase64, isValidPdfBase64, stripBase64Prefix } from './pdfExporter';
import {
  BARTENDER_CV_DATA,
  BARISTA_CV_DATA,
  HOTEL_CV_DATA,
  BLANK_CV_DATA,
  getTemplateData,
} from './cvTemplates';

export const REQUIRED_DEVELOPER_CODE = 'C++Rabbe';
export const DEFAULT_CV_DATA: CVData = BARTENDER_CV_DATA;

const STORAGE_KEY_LIBRARY = 'multi_cv_library_v2';
const STORAGE_KEY_ACTIVE_ID = 'multi_cv_active_id_v2';
const STORAGE_KEY_LATEST_UPLOADED_ID = 'cv_latest_uploaded_id_v1';
const STORAGE_KEY_LEGACY_CV = 'dynamic_cv_data_v4';
const STORAGE_KEY_USER = 'dynamic_cv_user_session_v4';
const STORAGE_KEY_UPLOADED_BINARIES = 'cv_uploaded_binaries_vault_v1';

interface UploadedCVBinaryRecord {
  id: string;
  fileName: string;
  fileType?: 'pdf' | 'docx' | 'doc' | 'structured';
  fileMimeType?: string;
  fileSize?: number;
  fileSizeBytesFormatted?: string;
  fileBase64: string;
  fileDataUri?: string;
  updatedAt: string;
}

// Fast synchronous in-memory cache so uploaded CVs of any size (up to 20MB) never fail on localStorage 5MB quota
const inMemoryUploadedBinaries: Record<string, UploadedCVBinaryRecord> = {};
let idbHydrationPromise: Promise<void> | null = null;

const IDB_NAME = 'cv_uploaded_files_idb_v1';
const IDB_STORE = 'binaries';

function openBinaryIndexedDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const dbInstance = req.result;
        if (!dbInstance.objectStoreNames.contains(IDB_STORE)) {
          dbInstance.createObjectStore(IDB_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function persistBinaryToIndexedDB(record: UploadedCVBinaryRecord): Promise<void> {
  const dbInstance = await openBinaryIndexedDB();
  if (!dbInstance) return;
  return new Promise(resolve => {
    try {
      const tx = dbInstance.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function hydrateBinariesFromIndexedDB(): Promise<void> {
  if (idbHydrationPromise) return idbHydrationPromise;
  idbHydrationPromise = (async () => {
    const dbInstance = await openBinaryIndexedDB();
    if (!dbInstance) return;
    await new Promise<void>(resolve => {
      try {
        const tx = dbInstance.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).getAll();
        req.onsuccess = () => {
          const rows = Array.isArray(req.result) ? req.result : [];
          let updated = false;
          for (const r of rows) {
            if (r && r.id && r.fileBase64 && !inMemoryUploadedBinaries[r.id]) {
              const mime = r.fileMimeType || 'application/pdf';
              inMemoryUploadedBinaries[r.id] = {
                ...r,
                fileDataUri: r.fileDataUri || `data:${mime};base64,${r.fileBase64}`,
              };
              updated = true;
            }
          }
          if (updated && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('cv_library_updated'));
          }
          resolve();
        };
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  })();
  return idbHydrationPromise;
}

// Kick off background IndexedDB hydration on module load in browser
if (typeof window !== 'undefined') {
  hydrateBinariesFromIndexedDB().catch(() => {});
}

function loadUploadedBinariesVault(): Record<string, UploadedCVBinaryRecord> {
  const combined: Record<string, UploadedCVBinaryRecord> = { ...inMemoryUploadedBinaries };
  if (typeof localStorage === 'undefined') return combined;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_UPLOADED_BINARIES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed as Record<string, UploadedCVBinaryRecord>)) {
          if (v && v.fileBase64) {
            const mime = v.fileMimeType || 'application/pdf';
            const rec: UploadedCVBinaryRecord = {
              ...v,
              fileDataUri: v.fileDataUri || `data:${mime};base64,${v.fileBase64}`,
            };
            combined[k] = rec;
            inMemoryUploadedBinaries[k] = rec;
          }
        }
      }
    }
  } catch {
    // ignore localStorage read errors
  }
  return combined;
}

function saveUploadedBinaryToVault(item: CVDocumentItem): void {
  if (!item || !item.id) return;
  const rawBase64 =
    item.fileBase64 ||
    (item.fileDataUri && item.fileDataUri.includes(',') ? item.fileDataUri.split(',')[1] : '');
  if (!rawBase64 || rawBase64.length < 50) return;

  const cleanBase64 = stripBase64Prefix(rawBase64).replace(/\s+/g, '');
  const mime =
    item.fileMimeType ||
    (item.fileType === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : item.fileType === 'doc'
      ? 'application/msword'
      : 'application/pdf');

  const record: UploadedCVBinaryRecord = {
    id: item.id,
    fileName: item.fileName || `${item.title || 'Uploaded_CV'}.pdf`,
    fileType: item.fileType || 'pdf',
    fileMimeType: mime,
    fileSize: item.fileSize,
    fileSizeBytesFormatted: item.fileSizeBytesFormatted,
    fileBase64: cleanBase64,
    fileDataUri: `data:${mime};base64,${cleanBase64}`,
    updatedAt: new Date().toISOString(),
  };

  // 1. Always store in memory immediately
  inMemoryUploadedBinaries[item.id] = record;

  // 2. Persist to IndexedDB asynchronously (handles large PDFs/DOCX up to 20MB without quota errors)
  persistBinaryToIndexedDB({
    ...record,
    fileDataUri: undefined, // save space in IDB too, reconstructed on load
  }).catch(() => {});

  // 3. Best-effort save to localStorage without duplicate fileDataUri
  if (typeof localStorage !== 'undefined') {
    try {
      const existingVault = loadUploadedBinariesVault();
      const compactVault: Record<string, UploadedCVBinaryRecord> = {};
      for (const [k, v] of Object.entries(existingVault)) {
        compactVault[k] = {
          ...v,
          fileDataUri: undefined, // Never store duplicate dataURI in localStorage
        };
      }
      compactVault[item.id] = {
        ...record,
        fileDataUri: undefined,
      };
      localStorage.setItem(STORAGE_KEY_UPLOADED_BINARIES, JSON.stringify(compactVault));
    } catch {
      // Quota reached for full vault; keep only the newest uploaded binary in localStorage
      try {
        const singleVault: Record<string, UploadedCVBinaryRecord> = {
          [item.id]: {
            ...record,
            fileDataUri: undefined,
          },
        };
        localStorage.setItem(STORAGE_KEY_UPLOADED_BINARIES, JSON.stringify(singleVault));
      } catch {
        // File itself exceeds localStorage 5MB quota; safely held in inMemoryUploadedBinaries + IndexedDB + Firestore
      }
    }
  }
}

function rehydrateLibraryWithUploadedBinaries(library: CVDocumentItem[]): CVDocumentItem[] {
  if (!Array.isArray(library)) return [];
  const vault = loadUploadedBinariesVault();
  return library.map(item => {
    if (!item) return item;
    if (item.fileBase64 && item.fileBase64.length > 50) {
      saveUploadedBinaryToVault(item);
      const cleanB64 = stripBase64Prefix(item.fileBase64).replace(/\s+/g, '');
      const mime = item.fileMimeType || 'application/pdf';
      const resolvedFileName = item.fileName || item.originalFile?.fileName || `${item.title || 'Fazle_Rabbi_CV'}.pdf`;
      return {
        ...item,
        name: item.name || item.title,
        isUploadedFile: true,
        fileName: resolvedFileName,
        fileBase64: cleanB64,
        fileDataUri: item.fileDataUri || `data:${mime};base64,${cleanB64}`,
        originalFile: {
          fileName: resolvedFileName,
          mimeType: mime,
          sizeBytes: item.fileSize || item.originalFile?.sizeBytes || Math.round((cleanB64.length * 3) / 4),
          base64: cleanB64,
          uploadedAt: item.uploadedAt || item.createdAt,
        },
      };
    }
    const byId = vault[item.id];
    const byName =
      !byId && (item.fileName || item.originalFile?.fileName)
        ? Object.values(vault).find(v => v.fileName === (item.fileName || item.originalFile?.fileName))
        : undefined;
    const match = byId || byName;
    if (match && match.fileBase64) {
      const mime = item.fileMimeType || match.fileMimeType || 'application/pdf';
      const resolvedFileName = item.fileName || match.fileName || item.originalFile?.fileName || `${item.title}.pdf`;
      return {
        ...item,
        name: item.name || item.title,
        isUploadedFile: true,
        fileBase64: match.fileBase64,
        fileDataUri: item.fileDataUri || match.fileDataUri || `data:${mime};base64,${match.fileBase64}`,
        fileName: resolvedFileName,
        fileType: item.fileType || match.fileType,
        fileMimeType: mime,
        fileSize: item.fileSize || match.fileSize,
        fileSizeBytesFormatted: item.fileSizeBytesFormatted || match.fileSizeBytesFormatted,
        originalFile: {
          fileName: resolvedFileName,
          mimeType: mime,
          sizeBytes: item.fileSize || match.fileSize || Math.round((match.fileBase64.length * 3) / 4),
          base64: match.fileBase64,
          uploadedAt: item.uploadedAt || item.createdAt,
        },
      };
    }
    if (item.isUploadedFile || item.storageSource === 'phone_upload' || item.fileName) {
      const resolvedFileName = item.fileName || item.originalFile?.fileName || `${item.title}.pdf`;
      const mime = item.fileMimeType || item.originalFile?.mimeType || 'application/pdf';
      return {
        ...item,
        name: item.name || item.title,
        isUploadedFile: true,
        fileName: resolvedFileName,
        originalFile: item.originalFile || {
          fileName: resolvedFileName,
          mimeType: mime,
          sizeBytes: item.fileSize,
          uploadedAt: item.uploadedAt || item.createdAt,
        },
      };
    }
    return {
      ...item,
      name: item.name || item.title,
    };
  });
}

/**
 * Initializes the default 3 professional CV documents requested by the user:
 * 1. "Fazle Rabbi — Bartender CV"
 * 2. "Fazle Rabbi — Barista CV"
 * 3. "Fazle Rabbi — Hotel CV"
 */
function createDefaultStarterLibrary(): CVDocumentItem[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'cv-bartender-primary',
      title: 'Fazle Rabbi — Bartender CV',
      roleSubtitle: 'Senior Bartender & Mixologist',
      createdAt: now,
      updatedAt: now,
      data: JSON.parse(JSON.stringify(BARTENDER_CV_DATA)),
      thumbnailColor: '#d4af37',
      isPinned: true,
    },
    {
      id: 'cv-barista-specialist',
      title: 'Fazle Rabbi — Barista CV',
      roleSubtitle: 'Head Barista & Specialty Coffee Artisan',
      createdAt: now,
      updatedAt: now,
      data: JSON.parse(JSON.stringify(BARISTA_CV_DATA)),
      thumbnailColor: '#c5a059',
      isPinned: false,
    },
    {
      id: 'cv-hotel-hospitality',
      title: 'Fazle Rabbi — Hotel CV',
      roleSubtitle: 'Luxury 5-Star Hotel Hospitality & F&B Specialist',
      createdAt: now,
      updatedAt: now,
      data: JSON.parse(JSON.stringify(HOTEL_CV_DATA)),
      thumbnailColor: '#aa771c',
      isPinned: false,
    },
  ];
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-z0-9@_.-]/g, '');
}

/**
 * Non-destructively migrates any legacy standalone phone CV uploads (e.g., from ApplyByEmailView's old cache)
 * into the unified Central CV Library so no existing user CV files or data are ever lost.
 */
function migrateLegacyPhoneUploadsIntoLibrary(library: CVDocumentItem[]): CVDocumentItem[] {
  if (typeof localStorage === 'undefined') return library;
  let result = [...library];
  try {
    const legacyKeys = ['cv_phone_uploaded_cache_v1', 'cv_phone_uploaded_document_v1'];
    for (const key of legacyKeys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.base64 && parsed.base64.length > 50 && parsed.name) {
        const alreadyExists = result.some(
          item => item.id === parsed.id || (item.fileName && item.fileName === parsed.name && item.isUploadedFile)
        );
        if (!alreadyExists) {
          const lowerName = String(parsed.name).toLowerCase();
          const fileType: 'pdf' | 'docx' | 'doc' = lowerName.endsWith('.docx')
            ? 'docx'
            : lowerName.endsWith('.doc')
            ? 'doc'
            : 'pdf';
          const mimeType =
            fileType === 'docx'
              ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              : fileType === 'doc'
              ? 'application/msword'
              : 'application/pdf';
          const cleanBase64 = stripBase64Prefix(parsed.base64).replace(/\s+/g, '');
          const migratedId = parsed.id || `cv-uploaded-migrated-${Date.now()}`;
          const migratedItem: CVDocumentItem = {
            id: migratedId,
            title: String(parsed.name).replace(/\.[^/.]+$/, ''),
            roleSubtitle: `Uploaded ${fileType.toUpperCase()} Resume (${parsed.sizeFormatted || 'Saved File'})`,
            createdAt: parsed.uploadedAt || new Date().toISOString(),
            updatedAt: parsed.uploadedAt || new Date().toISOString(),
            data: JSON.parse(JSON.stringify(BARTENDER_CV_DATA)),
            thumbnailColor: fileType === 'pdf' ? '#e11d48' : '#2563eb',
            isPinned: true,
            isUploadedFile: true,
            fileType,
            fileName: parsed.name,
            fileSize: parsed.sizeBytes,
            fileSizeBytesFormatted: parsed.sizeFormatted,
            fileBase64: cleanBase64,
            fileDataUri: `data:${mimeType};base64,${cleanBase64}`,
            fileMimeType: mimeType,
            uploadedAt: parsed.uploadedAt || new Date().toISOString(),
            storageSource: 'phone_upload',
          };
          saveUploadedBinaryToVault(migratedItem);
          result = [migratedItem, ...result];
          try {
            localStorage.setItem(STORAGE_KEY_LATEST_UPLOADED_ID, migratedId);
            if (localStorage.getItem('cv_is_using_phone_cv_v1') === 'true') {
              localStorage.setItem(STORAGE_KEY_ACTIVE_ID, migratedId);
            }
          } catch {
            // ignore
          }
        }
      }
    }
  } catch {
    // ignore migration parse errors
  }
  return result;
}

/**
 * Load all saved CV documents from persistent local storage.
 * Automatically migrates existing single CV data and standalone phone uploads if present.
 */
export function loadCVLibrary(): CVDocumentItem[] {
  if (typeof localStorage === 'undefined') {
    return rehydrateLibraryWithUploadedBinaries(createDefaultStarterLibrary());
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LIBRARY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const migrated = migrateLegacyPhoneUploadsIntoLibrary(parsed);
        return rehydrateLibraryWithUploadedBinaries(migrated);
      }
    }

    // Check for legacy single-CV data to preserve user's past edits
    const legacyRaw = localStorage.getItem(STORAGE_KEY_LEGACY_CV);
    const starter = createDefaultStarterLibrary();
    if (legacyRaw) {
      try {
        const legacyCV = JSON.parse(legacyRaw);
        starter[0].data = {
          ...BARTENDER_CV_DATA,
          ...legacyCV,
        };
      } catch (err) {
        console.warn('Could not parse legacy CV data:', err);
      }
    }

    const migratedStarter = migrateLegacyPhoneUploadsIntoLibrary(starter);
    saveCVLibrary(migratedStarter);
    return rehydrateLibraryWithUploadedBinaries(migratedStarter);
  } catch (err) {
    console.warn('Fallback to default CV library:', err);
    return rehydrateLibraryWithUploadedBinaries(createDefaultStarterLibrary());
  }
}

/**
 * Save the entire CV library list to persistent storage and cloud without exceeding localStorage quota.
 */
export function saveCVLibrary(library: CVDocumentItem[]): void {
  const hydrated = rehydrateLibraryWithUploadedBinaries(library);

  if (typeof localStorage !== 'undefined') {
    // Store metadata in STORAGE_KEY_LIBRARY without duplicating huge base64/dataUri strings
    // (the actual binaries are stored in inMemoryUploadedBinaries + STORAGE_KEY_UPLOADED_BINARIES + IndexedDB + Firestore)
    const compactLibraryForLocalStorage = hydrated.map(item => {
      if (item.fileBase64 || item.fileDataUri || item.isUploadedFile || item.storageSource === 'phone_upload') {
        saveUploadedBinaryToVault(item);
        return {
          ...item,
          isUploadedFile: true,
          fileBase64: undefined,
          fileDataUri: undefined,
          originalFile: item.originalFile
            ? {
                ...item.originalFile,
                base64: undefined,
              }
            : undefined,
        };
      }
      return item;
    });

    try {
      localStorage.setItem(STORAGE_KEY_LIBRARY, JSON.stringify(compactLibraryForLocalStorage));
      if (hydrated.length > 0 && hydrated[0]?.data) {
        localStorage.setItem(STORAGE_KEY_LEGACY_CV, JSON.stringify(hydrated[0].data));
      }
    } catch (err) {
      // If localStorage is still full due to other keys, free legacy/redundant cache keys and retry
      try {
        localStorage.removeItem('cv_phone_uploaded_document_v1');
        localStorage.setItem(STORAGE_KEY_LIBRARY, JSON.stringify(compactLibraryForLocalStorage));
      } catch (retryErr) {
        console.warn('LocalStorage quota full; CV library held in memory, IndexedDB, and Firestore:', retryErr);
      }
    }
  }

  // Automatically trigger cloud push to Firestore so changes reflect across all devices
  pushCVLibraryToFirestore(hydrated).catch(err => {
    console.warn('Background CV cloud sync deferred:', err);
  });
}

import {
  sanitizeCVLibraryForFirestore,
  persistCvFilePayloads,
  loadCvFilePayload,
} from './userDataPersistenceService';

/**
 * Push CV Library to Firestore under user's UID and email account safely,
 * preventing document size from exceeding 1MB limit.
 */
export async function pushCVLibraryToFirestore(library: CVDocumentItem[]): Promise<void> {
  const currentUser = auth.currentUser;
  const userSession = loadUserSession();
  const targetEmail = currentUser?.email || userSession?.email || 'fazle.rabbe.doc@gmail.com';

  const { metadataLibrary, filePayloads } = sanitizeCVLibraryForFirestore(library);

  const docData = {
    cvLibrary: JSON.stringify(metadataLibrary),
    cvData: JSON.stringify(metadataLibrary[0]?.data || DEFAULT_CV_DATA),
    totalCount: metadataLibrary.length,
    updatedAt: new Date().toISOString(),
  };

  // 1. If Firebase Auth user is signed in, sync to their UID
  if (currentUser?.uid) {
    try {
      const userDocRef = doc(db, 'users', currentUser.uid, 'cvLibrary', 'main');
      await setDoc(userDocRef, docData, { merge: true });

      const workspaceRef = doc(db, 'users', currentUser.uid, 'workspace', 'main');
      await setDoc(workspaceRef, {
        cvLibrary: JSON.stringify(metadataLibrary),
        activeCvId: metadataLibrary[0]?.id || 'cv-bartender-primary',
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      if (filePayloads.length > 0) {
        await persistCvFilePayloads(currentUser.uid, filePayloads);
      }
    } catch (e) {
      console.warn('Could not sync CVs to users UID doc:', e);
    }
  }

  // 2. Also sync to cv_accounts keyed by normalized Gmail
  if (targetEmail) {
    try {
      const emailDocId = normalizeEmail(targetEmail).replace(/[@.]/g, '_');
      const accountDocRef = doc(db, 'cv_accounts', emailDocId);
      await setDoc(accountDocRef, { ...docData, email: targetEmail }, { merge: true });
    } catch (e) {
      console.warn('Could not sync CVs to cv_accounts doc:', e);
    }
  }
}

/**
 * Fetch CV library from Firestore on login or device startup.
 * Ensures that installing the app on any phone with internet will automatically load all CVs
 * AND preserve/re-hydrate any uploaded original CV binary files!
 */
export async function syncAndLoadCloudCVLibrary(
  userId?: string,
  userEmail?: string
): Promise<CVDocumentItem[]> {
  const email = userEmail || auth.currentUser?.email || loadUserSession()?.email || 'fazle.rabbe.doc@gmail.com';
  const uid = userId || auth.currentUser?.uid;

  let cloudLibrary: CVDocumentItem[] | null = null;

  // 1. Try reading from users/{uid}/cvLibrary/main
  if (uid) {
    try {
      const snap = await getDoc(doc(db, 'users', uid, 'cvLibrary', 'main'));
      if (snap.exists() && snap.data()?.cvLibrary) {
        const parsed = JSON.parse(snap.data().cvLibrary);
        if (Array.isArray(parsed) && parsed.length > 0) {
          cloudLibrary = parsed;
        }
      }
    } catch (e) {
      console.warn('Could not read CV library from users UID:', e);
    }
  }

  // 2. If not found, try reading from cv_accounts/{emailDocId} (with automatic fallback to legacy fazlerabbe905_gmail_com)
  if (!cloudLibrary && email) {
    const candidateDocIds = Array.from(
      new Set([
        normalizeEmail(email).replace(/[@.]/g, '_'),
        'fazle_rabbe_doc_gmail_com',
        'fazlerabbe905_gmail_com',
      ])
    );
    for (const emailDocId of candidateDocIds) {
      try {
        const snap = await getDoc(doc(db, 'cv_accounts', emailDocId));
        if (snap.exists() && snap.data()?.cvLibrary) {
          const parsed = JSON.parse(snap.data().cvLibrary);
          if (Array.isArray(parsed) && parsed.length > 0) {
            cloudLibrary = parsed;
            break;
          }
        }
      } catch (e) {
        console.warn('Could not read CV library from cv_accounts:', e);
      }
    }
  }

  // If cloud has valid CVs, merge with local uploaded binaries & cloud cv_files so fileBase64 is NEVER lost!
  if (cloudLibrary && cloudLibrary.length > 0) {
    let hydrated = rehydrateLibraryWithUploadedBinaries(cloudLibrary);
    if (uid) {
      for (let i = 0; i < hydrated.length; i++) {
        const item = hydrated[i];
        if ((item.storageSource === 'phone_upload' || item.fileName) && !item.fileBase64) {
          try {
            const payload = await loadCvFilePayload(uid, item.id);
            if (payload && payload.fileBase64) {
              hydrated[i] = {
                ...item,
                fileBase64: payload.fileBase64,
                fileDataUri: payload.fileDataUri || item.fileDataUri,
                fileName: payload.fileName || item.fileName,
                fileType: (payload.fileType as any) || item.fileType,
              };
              saveUploadedBinaryToVault(hydrated[i]);
            }
          } catch {
            // ignore
          }
        }
      }
    }
    saveCVLibrary(hydrated);
    window.dispatchEvent(new CustomEvent('cv_library_cloud_updated', { detail: hydrated }));
    window.dispatchEvent(new CustomEvent('central_cv_library_updated', { detail: hydrated }));
    return hydrated;
  }

  // If cloud was empty, upload our current local library to cloud so it's ready for any new phone!
  const local = loadCVLibrary();
  await pushCVLibraryToFirestore(local);
  return local;
}

/**
 * Get or set the ID of the currently active CV across the entire application.
 * Guarantees that the most recently uploaded CV automatically becomes the default active CV
 * unless the user manually selects a different valid CV from the Central CV Library.
 */
export function getActiveCVId(): string {
  const lib = loadCVLibrary();
  try {
    const active = localStorage.getItem(STORAGE_KEY_ACTIVE_ID);
    if (active && lib.some(c => c.id === active)) {
      return active;
    }
    const latestUploadedId = localStorage.getItem(STORAGE_KEY_LATEST_UPLOADED_ID);
    if (latestUploadedId && lib.some(c => c.id === latestUploadedId)) {
      localStorage.setItem(STORAGE_KEY_ACTIVE_ID, latestUploadedId);
      return latestUploadedId;
    }
  } catch (e) {
    // fallback
  }
  // Prefer most recently uploaded CV if present in the library
  const newestUploaded = lib.find(c => c.isUploadedFile || c.storageSource === 'phone_upload');
  const fallbackId = newestUploaded?.id || lib[0]?.id || 'cv-bartender-primary';
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_ACTIVE_ID, fallbackId);
    }
  } catch {
    // ignore storage errors during read
  }
  return fallbackId;
}

export function syncActiveCVToPythonAgent(cvId?: string): void {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
  try {
    const payload = getCVAttachmentPayload(cvId);
    if (!payload || !payload.base64) return;
    const docItem = payload.cvDocument;
    fetch('/api/python-agent/sync-cv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cv_id: docItem?.id || cvId || 'cv-bartender-primary',
        title: docItem?.title || payload.filename,
        filename: payload.filename,
        role_target: docItem?.roleSubtitle || docItem?.data?.professionalTitle || 'Bartender, Barista, Waiter',
        base64_data: payload.base64,
        is_active: true,
      }),
    }).catch(() => {});
  } catch {
    // non-blocking background sync
  }
}

export function setActiveCVId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVE_ID, id);
    // Keep saved email application draft in sync so Apply section always reflects the active CV
    const rawDraft = localStorage.getItem('cv_email_saved_draft_v1');
    if (rawDraft) {
      const parsedDraft = JSON.parse(rawDraft);
      if (parsedDraft && typeof parsedDraft === 'object') {
        parsedDraft.selectedCvId = id;
        localStorage.setItem('cv_email_saved_draft_v1', JSON.stringify(parsedDraft));
      }
    }
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('cv_active_id_changed', { detail: id }));
        window.dispatchEvent(new CustomEvent('active_cv_changed', { detail: id }));
        syncActiveCVToPythonAgent(id);
      }, 0);
    }
  } catch (e) {
    // ignore
  }
}

/**
 * Get a specific CV by its ID
 */
export function getCVById(id: string): CVDocumentItem | null {
  const lib = loadCVLibrary();
  return lib.find(item => item.id === id) || null;
}

/**
 * Load the currently selected CV (or active default CV if not specified) from the Central CV Library
 */
export function loadSelectedCV(cvId?: string): CVDocumentItem {
  const lib = loadCVLibrary();
  const targetId = cvId || getActiveCVId();
  return (targetId ? lib.find(item => item.id === targetId) : undefined) || lib[0] || createDefaultStarterLibrary()[0];
}

/**
 * Create a new, completely independent CV in its own workspace.
 * Existing CVs remain untouched.
 */
export function createNewCV(
  customTitle?: string,
  templateType: CVTemplateType = 'bartender',
  designTemplateId: CVDesignTemplateId = 'classic-hospitality',
  templateAccentColor?: string
): CVDocumentItem {
  const template = getTemplateData(templateType);
  const now = new Date().toISOString();
  const id = `cv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const cvDataWithDesign: CVData = {
    ...template.data,
    designTemplateId,
    ...(templateAccentColor ? { templateAccentColor } : {}),
  };

  const newCV: CVDocumentItem = {
    id,
    title: customTitle?.trim() || template.title,
    roleSubtitle: template.subtitle,
    createdAt: now,
    updatedAt: now,
    data: cvDataWithDesign,
    designTemplateId,
    templateAccentColor,
    thumbnailColor: templateAccentColor || '#d4af37',
    isPinned: false,
  };

  const lib = loadCVLibrary();
  const updatedLib = [newCV, ...lib];
  saveCVLibrary(updatedLib);
  setActiveCVId(id);
  return newCV;
}

/**
 * Applies a visual CV template design (and optional accent color) to an existing CV
 * without modifying or overwriting any of the user's saved CV content.
 */
export function applyDesignTemplateToCV(
  cvId: string,
  designTemplateId: CVDesignTemplateId,
  templateAccentColor?: string
): CVDocumentItem | null {
  const lib = loadCVLibrary();
  let updatedItem: CVDocumentItem | null = null;
  const now = new Date().toISOString();

  const updatedLib = lib.map(item => {
    if (item.id === cvId) {
      const nextData: CVData = {
        ...item.data,
        designTemplateId,
        templateAccentColor: templateAccentColor ?? item.data.templateAccentColor,
      };
      updatedItem = {
        ...item,
        data: nextData,
        designTemplateId,
        templateAccentColor: templateAccentColor ?? item.templateAccentColor,
        updatedAt: now,
      };
      return updatedItem;
    }
    return item;
  });

  if (updatedItem) {
    saveCVLibrary(updatedLib);
  }
  return updatedItem;
}

/**
 * Duplicate an existing CV into a completely independent clone.
 * Editing the clone NEVER modifies the original CV.
 */
export function duplicateCV(sourceId: string, customTitle?: string): CVDocumentItem {
  const lib = loadCVLibrary();
  const source = lib.find(c => c.id === sourceId) || lib[0];

  const now = new Date().toISOString();
  const newId = `cv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const title = customTitle?.trim() || `${source.title} (Copy)`;

  const clonedCV: CVDocumentItem = {
    id: newId,
    title,
    roleSubtitle: source.roleSubtitle || source.data.professionalTitle || 'Bartender',
    createdAt: now,
    updatedAt: now,
    data: JSON.parse(JSON.stringify(source.data)),
    thumbnailColor: source.thumbnailColor || '#d4af37',
    isPinned: false,
    fileType: source.fileType,
    fileName: source.fileName,
    fileSize: source.fileSize,
    fileSizeBytesFormatted: source.fileSizeBytesFormatted,
    fileBase64: source.fileBase64,
    fileDataUri: source.fileDataUri,
    fileMimeType: source.fileMimeType,
    uploadedAt: source.uploadedAt,
    storageSource: source.storageSource,
  };

  // Insert right after the source or at top
  const index = lib.findIndex(c => c.id === sourceId);
  const updatedLib = [...lib];
  if (index !== -1) {
    updatedLib.splice(index + 1, 0, clonedCV);
  } else {
    updatedLib.unshift(clonedCV);
  }

  saveCVLibrary(updatedLib);
  return clonedCV;
}

/**
 * Update CV metadata (title, subtitle, pinned state, etc.)
 */
export function updateCV(id: string, updates: Partial<CVDocumentItem>): void {
  const lib = loadCVLibrary();
  const updatedLib = lib.map(item => {
    if (item.id === id) {
      return {
        ...item,
        ...updates,
        updatedAt: new Date().toISOString(),
      };
    }
    return item;
  });
  saveCVLibrary(updatedLib);
}

/**
 * Update the full content data of a specific CV independently.
 */
export function updateCVData(id: string, data: CVData): void {
  const lib = loadCVLibrary();
  const updatedLib = lib.map(item => {
    if (item.id === id) {
      return {
        ...item,
        data,
        updatedAt: new Date().toISOString(),
      };
    }
    return item;
  });
  saveCVLibrary(updatedLib);
}

/**
 * Rename a specific CV
 */
export function renameCV(id: string, newTitle: string): void {
  const trimmed = newTitle.trim();
  if (!trimmed) return;
  updateCV(id, { title: trimmed });
}

/**
 * Delete a specific CV.
 * Guarantees at least 1 CV remains in the library.
 */
export function deleteCV(id: string): CVDocumentItem[] {
  const lib = loadCVLibrary();
  let filtered = lib.filter(c => c.id !== id);

  if (filtered.length === 0) {
    filtered = createDefaultStarterLibrary();
  }

  saveCVLibrary(filtered);

  // If active CV was deleted, point active ID to the first remaining CV
  const activeId = getActiveCVId();
  if (activeId === id) {
    setActiveCVId(filtered[0].id);
  }

  return filtered;
}

/**
 * Export all CVs as an offline JSON backup archive
 */
export function exportAllCVsAsJSON(): void {
  try {
    const lib = loadCVLibrary();
    const payload = {
      exportVersion: '2.0',
      exportedAt: new Date().toISOString(),
      owner: 'Fazle Rabbi',
      totalCVs: lib.length,
      cvLibrary: lib,
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `Fazle_Rabbi_CV_Library_Backup_${new Date().toISOString().slice(0, 10)}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  } catch (err) {
    console.error('Failed to export CV library JSON backup:', err);
  }
}

/**
 * Import CVs from a JSON backup file
 */
export function importCVsFromJSON(
  jsonString: string,
  mode: 'merge' | 'replace' = 'merge'
): { success: boolean; count: number; error?: string } {
  try {
    const parsed = JSON.parse(jsonString);
    const importedList: CVDocumentItem[] = Array.isArray(parsed.cvLibrary)
      ? parsed.cvLibrary
      : Array.isArray(parsed)
      ? parsed
      : null;

    if (!importedList || importedList.length === 0) {
      return { success: false, count: 0, error: 'ফাইলে কোনো সঠিক সিভি ডাটা পাওয়া যায়নি (No valid CV data found in file).' };
    }

    // Validate that each item has data and title
    const validItems: CVDocumentItem[] = importedList.map(item => ({
      id: item.id || `cv-import-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      title: item.title || 'Imported CV',
      roleSubtitle: item.roleSubtitle || item.data?.professionalTitle || 'Hospitality',
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      data: item.data || BARTENDER_CV_DATA,
      thumbnailColor: item.thumbnailColor || '#d4af37',
      isPinned: !!item.isPinned,
    }));

    const current = loadCVLibrary();
    let finalList: CVDocumentItem[];

    if (mode === 'replace') {
      finalList = validItems;
    } else {
      // Merge: append new items that don't share IDs or give fresh IDs
      const currentIds = new Set(current.map(c => c.id));
      const freshItems = validItems.map(item => {
        if (currentIds.has(item.id)) {
          return {
            ...item,
            id: `cv-copy-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            title: `${item.title} (Imported)`,
          };
        }
        return item;
      });
      finalList = [...freshItems, ...current];
    }

    saveCVLibrary(finalList);
    setActiveCVId(finalList[0].id);
    return { success: true, count: validItems.length };
  } catch (err: any) {
    return { success: false, count: 0, error: err.message || 'Invalid JSON format' };
  }
}

// ==========================================
// Backward Compatibility Helpers for Single CV
// ==========================================

export function loadLocalCVData(): CVData {
  const activeId = getActiveCVId();
  const cvItem = getCVById(activeId);
  if (cvItem && cvItem.data) {
    return cvItem.data;
  }
  const lib = loadCVLibrary();
  return lib[0]?.data || BARTENDER_CV_DATA;
}

export function saveLocalCVData(data: CVData): void {
  const activeId = getActiveCVId();
  updateCVData(activeId, data);
}

// ==========================================
// User Authentication & Cloud Sync
// ==========================================

export function loadUserSession(): CVUserAccount | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load user session:', err);
  }
  return null;
}

export function saveUserSession(account: CVUserAccount | null): void {
  try {
    if (account) {
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(account));
    } else {
      localStorage.removeItem(STORAGE_KEY_USER);
    }
  } catch (err) {
    console.error('Failed to save user session:', err);
  }
}

export async function signUpUserWithPasscode(
  name: string,
  email: string,
  passcode: string,
  phoneNumber: string,
  developerCode: string
): Promise<{ success: boolean; error?: string; account?: CVUserAccount; cvData?: CVData }> {
  const trimmedName = name.trim();
  const normalizedEmail = normalizeEmail(email);
  const trimmedPasscode = passcode.trim();
  const trimmedPhone = phoneNumber.trim();
  const trimmedDevCode = developerCode.trim();

  if (!trimmedName) {
    return { success: false, error: 'পূর্ণ নাম লিখুন (Please enter your Full Name).' };
  }

  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return { success: false, error: 'সঠিক জিমেইল বা ইমেইল ঠিকানা দিন (Please enter a valid Gmail / Email).' };
  }

  if (!/^\d{5}$/.test(trimmedPasscode)) {
    return { success: false, error: 'পাসকোডটি অবশ্যই ৫ ডিজিটের হতে হবে (Passcode must be exactly 5 digits, e.g. 12345).' };
  }

  if (!trimmedPhone || trimmedPhone.length < 5) {
    return { success: false, error: 'সঠিক ফোন নাম্বার দিন (Please enter a valid Phone Number).' };
  }

  if (trimmedDevCode !== REQUIRED_DEVELOPER_CODE) {
    return {
      success: false,
      error: `ডেভলপার পারমিশন কোডটি সঠিক নয়! অনুগ্রহ করে সঠিক কোড "${REQUIRED_DEVELOPER_CODE}" দিন (Invalid Developer Permission Code).`,
    };
  }

  const account: CVUserAccount = {
    name: trimmedName,
    email: normalizedEmail,
    passcode: trimmedPasscode,
    phoneNumber: trimmedPhone,
    developerCode: trimmedDevCode,
    registeredAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };

  try {
    const docId = normalizedEmail.replace(/[@.]/g, '_');
    const docRef = doc(db, 'cv_accounts', docId);
    const existing = await getDoc(docRef);

    if (existing.exists()) {
      const data = existing.data();
      if (data.passcode && data.passcode !== trimmedPasscode) {
        return {
          success: false,
          error: 'এই জিমেইলটি ইতিমধ্যে নিবন্ধিত রয়েছে। অনুগ্রহ করে লগইন ট্যাব ব্যবহার করুন।',
        };
      }
      if (data.cvLibrary) {
        try {
          const cloudLib = JSON.parse(data.cvLibrary);
          if (Array.isArray(cloudLib) && cloudLib.length > 0) {
            saveCVLibrary(cloudLib);
          }
        } catch (e) {
          // ignore
        }
      }
      saveUserSession(account);
      return { success: true, account, cvData: loadLocalCVData() };
    }

    const currentLibrary = loadCVLibrary();
    await setDoc(docRef, {
      name: trimmedName,
      email: normalizedEmail,
      passcode: trimmedPasscode,
      phoneNumber: trimmedPhone,
      developerCode: trimmedDevCode,
      cvLibrary: JSON.stringify(currentLibrary),
      cvData: JSON.stringify(currentLibrary[0]?.data || DEFAULT_CV_DATA),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    saveUserSession(account);
    return { success: true, account, cvData: loadLocalCVData() };
  } catch (err: any) {
    console.warn('Firestore signup error, fallback to local storage:', err);
    saveUserSession(account);
    return { success: true, account, cvData: loadLocalCVData() };
  }
}

export async function loginUserWithPasscode(
  email: string,
  passcode: string
): Promise<{ success: boolean; error?: string; account?: CVUserAccount; cvData?: CVData }> {
  const normalizedEmail = normalizeEmail(email);
  const trimmedPasscode = passcode.trim();

  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return { success: false, error: 'সঠিক জিমেইল ঠিকানা দিন (Please enter your Gmail / Email).' };
  }

  if (!/^\d{5}$/.test(trimmedPasscode)) {
    return { success: false, error: 'পাসকোডটি অবশ্যই ৫ ডিজিটের হতে হবে (Passcode must be exactly 5 digits).' };
  }

  try {
    const docId = normalizedEmail.replace(/[@.]/g, '_');
    const docRef = doc(db, 'cv_accounts', docId);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data();
      if (data.passcode && data.passcode !== trimmedPasscode) {
        return { success: false, error: 'ভুল পাসকোড! অনুগ্রহ করে সঠিক ৫ ডিজিট পাসকোড দিন।' };
      }

      const account: CVUserAccount = {
        name: data.name || 'Fazle Rabbi',
        email: normalizedEmail,
        passcode: trimmedPasscode,
        phoneNumber: data.phoneNumber || '',
        developerCode: data.developerCode || REQUIRED_DEVELOPER_CODE,
        registeredAt: data.createdAt || new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };

      if (data.cvLibrary) {
        try {
          const cloudLib = JSON.parse(data.cvLibrary);
          if (Array.isArray(cloudLib) && cloudLib.length > 0) {
            saveCVLibrary(cloudLib);
          }
        } catch (e) {
          // ignore
        }
      }

      saveUserSession(account);
      return { success: true, account, cvData: loadLocalCVData() };
    } else {
      const localAccount = loadUserSession();
      if (localAccount && normalizeEmail(localAccount.email) === normalizedEmail) {
        if (localAccount.passcode === trimmedPasscode) {
          return { success: true, account: localAccount, cvData: loadLocalCVData() };
        } else {
          return { success: false, error: 'ভুল পাসকোড! সঠিক ৫ ডিজিট পাসকোড দিন।' };
        }
      }

      return {
        success: false,
        error: `এই জিমেইলে কোনো অ্যাকাউন্ট পাওয়া যায়নি। অনুগ্রহ করে সাইন আপ (Sign Up) করুন। ডেভলপার কোড: ${REQUIRED_DEVELOPER_CODE}`,
      };
    }
  } catch (err: any) {
    console.warn('Firestore login error, checking local session:', err);
    const localAccount = loadUserSession();
    if (localAccount && normalizeEmail(localAccount.email) === normalizedEmail) {
      if (localAccount.passcode === trimmedPasscode) {
        return { success: true, account: localAccount, cvData: loadLocalCVData() };
      }
    }

    const fallbackAccount: CVUserAccount = {
      name: 'Fazle Rabbi',
      email: normalizedEmail,
      passcode: trimmedPasscode,
      phoneNumber: '+357-95502363',
      developerCode: REQUIRED_DEVELOPER_CODE,
      registeredAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
    saveUserSession(fallbackAccount);
    return { success: true, account: fallbackAccount, cvData: loadLocalCVData() };
  }
}

/**
 * Persist entire CV Library to Firestore
 */
export async function syncCVToCloud(
  account: CVUserAccount | null,
  activeCVData?: CVData
): Promise<void> {
  const lib = loadCVLibrary();
  if (activeCVData) {
    const activeId = getActiveCVId();
    updateCVData(activeId, activeCVData);
  }
  if (!account || !account.email) return;

  const docId = normalizeEmail(account.email).replace(/[@.]/g, '_');
  try {
    const { metadataLibrary } = sanitizeCVLibraryForFirestore(lib);
    const docRef = doc(db, 'cv_accounts', docId);
    await setDoc(
      docRef,
      {
        name: account.name,
        email: account.email,
        passcode: account.passcode,
        phoneNumber: account.phoneNumber,
        developerCode: account.developerCode,
        cvLibrary: JSON.stringify(metadataLibrary),
        cvData: JSON.stringify(metadataLibrary[0]?.data || DEFAULT_CV_DATA),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Cloud sync deferred to local storage:', err);
  }
}

/**
 * Format bytes to readable string (e.g., 420 KB, 1.4 MB)
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${Math.round(kb)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * Saves a real CV document (PDF or DOCX) uploaded from a mobile phone (Android/iOS) or desktop.
 * Stores document in persistent CV Library (both localStorage, IndexedDB, and Firestore) so it can be:
 * 1. Selected when applying to any sponsorship vacancy
 * 2. Previewed before applying
 * 3. Replaced or re-selected
 * 4. Reused for all future applications without re-uploading
 */
export async function saveUploadedCVFromDevice(
  file: File,
  customTitle?: string
): Promise<CVDocumentItem> {
  // Validate file size (max 20MB)
  const MAX_SIZE = 20 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    throw new Error('File size exceeds the 20MB limit. Please upload a smaller PDF or DOCX file.');
  }

  // Detect extension and mime
  const lowerName = file.name.toLowerCase();
  let fileType: 'pdf' | 'docx' | 'doc' = 'pdf';
  let mimeType = file.type;

  if (lowerName.endsWith('.pdf')) {
    fileType = 'pdf';
    mimeType = mimeType || 'application/pdf';
  } else if (lowerName.endsWith('.docx')) {
    fileType = 'docx';
    mimeType = mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  } else if (lowerName.endsWith('.doc')) {
    fileType = 'doc';
    mimeType = mimeType || 'application/msword';
  } else {
    throw new Error('Unsupported file format. Please upload a PDF or Microsoft Word (DOCX/DOC) resume.');
  }

  // Read file data as base64
  const base64DataUri: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file from phone storage.'));
    reader.readAsDataURL(file);
  });

  const rawBase64 = base64DataUri.includes(',') ? base64DataUri.split(',')[1] : base64DataUri;
  const now = new Date().toISOString();
  const id = `cv-uploaded-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const cleanTitle = customTitle?.trim() || file.name.replace(/\.[^/.]+$/, '');
  const formattedSize = formatFileSize(file.size);

  const newDocItem: CVDocumentItem = {
    id,
    title: cleanTitle,
    name: cleanTitle,
    roleSubtitle: `Uploaded ${fileType.toUpperCase()} Resume (${formattedSize})`,
    createdAt: now,
    updatedAt: now,
    data: JSON.parse(JSON.stringify(BARTENDER_CV_DATA)), // Fallback template for structured preview
    thumbnailColor: fileType === 'pdf' ? '#e11d48' : '#2563eb',
    isPinned: true,
    isUploadedFile: true,
    fileType,
    fileName: file.name,
    fileSize: file.size,
    fileSizeBytesFormatted: formattedSize,
    fileBase64: rawBase64,
    fileDataUri: base64DataUri,
    fileMimeType: mimeType,
    uploadedAt: now,
    storageSource: 'phone_upload',
    originalFile: {
      fileName: file.name,
      mimeType,
      sizeBytes: file.size,
      base64: rawBase64,
      uploadedAt: now,
    },
  };

  saveUploadedBinaryToVault(newDocItem);
  const lib = loadCVLibrary().filter(c => c.id !== id);
  const updatedLib = [newDocItem, ...lib];
  saveCVLibrary(updatedLib);

  try {
    localStorage.setItem(STORAGE_KEY_LATEST_UPLOADED_ID, id);
  } catch {
    // ignore
  }
  setActiveCVId(id);

  // Notify all active UI sections (Sponsorship, Europe, Cyprus, Search, Apply, CV Builder)
  try {
    window.dispatchEvent(new CustomEvent('cv_library_updated', { detail: updatedLib }));
    window.dispatchEvent(new CustomEvent('central_cv_library_updated', { detail: updatedLib }));
    window.dispatchEvent(new CustomEvent('cv_active_id_changed', { detail: id }));
    window.dispatchEvent(new CustomEvent('active_cv_changed', { detail: id }));
  } catch {
    // window not available or event failure
  }

  return newDocItem;
}

/**
 * Ensures IndexedDB binary hydration has completed before resolving an attachment payload.
 * Guarantees that even after a full browser refresh, large uploaded PDF/DOCX CVs in IndexedDB
 * are 100% loaded into memory before attaching or previewing.
 */
export async function ensureCVAttachmentPayloadReady(cvId?: string) {
  await hydrateBinariesFromIndexedDB();
  return getCVAttachmentPayload(cvId);
}

/**
 * Alias for ensureCVAttachmentPayloadReady used across Gmail service, Queue service, and modals.
 */
export async function resolveCVAttachmentPayloadAsync(cvId?: string) {
  return ensureCVAttachmentPayloadReady(cvId);
}

/**
 * Extracts verified, factual candidate information from the selected CV in the Central CV Library
 * so Gemini cover letter personalization uses the candidate's actual CV and never invents experience.
 */
export function extractVerifiedCvSummaryForCoverLetter(cvId?: string): {
  cvId: string;
  cvTitle: string;
  applicantName: string;
  professionalTitle: string;
  email: string;
  phone: string;
  location: string;
  summaryText: string;
  verifiedExperiences: string[];
  verifiedSkills: string[];
  educationAndCerts: string[];
} {
  const lib = loadCVLibrary();
  const activeId = cvId || getActiveCVId();
  const target = (activeId ? lib.find(c => c.id === activeId) : undefined) || lib[0];
  const cvData = target?.data || BARTENDER_CV_DATA;

  const verifiedExperiences = (cvData.experiences || []).map(
    exp => `${exp.position} at ${exp.companyName} (${exp.location || 'Hospitality'}, ${exp.startDate} – ${exp.endDate})`
  );
  const verifiedSkills = (cvData.skills?.items || []).map((s: any) => (typeof s === 'string' ? s : s?.name || ''));
  const educationAndCerts = [
    ...(cvData.academicQualifications?.items || []).map(
      ed => `${ed.degree} — ${ed.institution} (${ed.year})`
    ),
    ...(cvData.trainingSummary?.items || []).map(tr => tr.text),
  ];

  return {
    cvId: target?.id || 'cv-bartender-primary',
    cvTitle: target?.originalFile?.fileName || target?.fileName || target?.title || 'Fazle Rabbi — Bartender CV',
    applicantName: cvData.fullName || 'Fazle Rabbi Boyati',
    professionalTitle: target?.roleSubtitle || cvData.professionalTitle || 'Senior Bartender & Barista',
    email: cvData.email || 'fazle.rabbe.doc@gmail.com',
    phone: cvData.phone || '+357 9550 2363',
    location: cvData.location || 'Limassol Marina, Cyprus',
    summaryText: cvData.aboutMe?.content || cvData.profileSummary || '',
    verifiedExperiences,
    verifiedSkills,
    educationAndCerts,
  };
}

/**
 * Formatted structured summary of a CVDocumentItem (or active CV ID) for Gemini Cover Letter personalization.
 */
export function extractVerifiedCvSummary(cvOrId?: CVDocumentItem | string | null): {
  cvSummaryText: string;
  candidateName: string;
  candidateTitle: string;
  candidateContact: string;
  verifiedExperiences: string[];
  verifiedSkills: string[];
  verifiedEducation: string[];
} {
  const targetId = typeof cvOrId === 'string' ? cvOrId : cvOrId?.id;
  const info = extractVerifiedCvSummaryForCoverLetter(targetId);
  const cvSummaryText = [
    `Active CV Document: ${info.cvTitle}`,
    `Candidate Name: ${info.applicantName}`,
    `Role / Title: ${info.professionalTitle}`,
    `Current Location: ${info.location}`,
    `Contact: ${info.phone} | ${info.email}`,
    `Profile Summary: ${info.summaryText}`,
    `Verified Hospitality Work History:\n- ${info.verifiedExperiences.join('\n- ')}`,
    `Verified Skills:\n- ${info.verifiedSkills.filter(Boolean).join(', ')}`,
    `Academic & Training Credentials:\n- ${info.educationAndCerts.join('\n- ')}`,
  ].join('\n');

  return {
    cvSummaryText,
    candidateName: info.applicantName,
    candidateTitle: info.professionalTitle,
    candidateContact: `${info.location} | ${info.phone} | ${info.email}`,
    verifiedExperiences: info.verifiedExperiences,
    verifiedSkills: info.verifiedSkills.filter(Boolean),
    verifiedEducation: info.educationAndCerts,
  };
}

/**
 * Resolves the actual attachment payload for a given CV ID (either uploaded file or structured template).
 * CRITICAL GUARANTEE: When an uploaded CV is selected, the ACTUAL ORIGINAL CV FILE is attached,
 * never a newly generated title-only PDF.
 */
export function getCVAttachmentPayload(cvId?: string): {
  filename: string;
  base64: string;
  mimeType: string;
  isUploadedFile: boolean;
  cvDocument: CVDocumentItem | null;
} {
  const lib = loadCVLibrary();
  const activeId = cvId || getActiveCVId();
  const target = (activeId ? lib.find(c => c.id === activeId) : undefined) || lib[0];

  if (!target) {
    return {
      filename: 'Fazle_Rabbi_CV.pdf',
      base64: generateDirectCVPdfBase64(),
      mimeType: 'application/pdf',
      isUploadedFile: false,
      cvDocument: null,
    };
  }

  // Check target.fileBase64, target.fileDataUri, or the persistent uploaded binaries vault
  const vault = loadUploadedBinariesVault();
  const vaultEntry =
    vault[target.id] ||
    (target.fileName ? Object.values(vault).find(v => v.fileName === target.fileName) : undefined);

  let rawUploadedBase64 =
    target.fileBase64 ||
    (target.fileDataUri && target.fileDataUri.includes(',') ? target.fileDataUri.split(',')[1] : '') ||
    vaultEntry?.fileBase64 ||
    '';

  // Also check legacy phone uploaded CV storage if target is a phone upload and binary was in phone storage key
  if (!rawUploadedBase64 && (target.storageSource === 'phone_upload' || target.fileName || target.isUploadedFile)) {
    try {
      for (const legacyKey of ['cv_phone_uploaded_document_v1', 'cv_phone_uploaded_cache_v1']) {
        const phoneRaw = localStorage.getItem(legacyKey);
        if (phoneRaw) {
          const parsedPhone = JSON.parse(phoneRaw);
          if (parsedPhone?.base64 && (!target.fileName || parsedPhone.name === target.fileName)) {
            rawUploadedBase64 = parsedPhone.base64;
            break;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  if (rawUploadedBase64) {
    const cleanBase64 = stripBase64Prefix(rawUploadedBase64).replace(/\s+/g, '');
    const effectiveFileName = target.fileName || vaultEntry?.fileName || `${target.title || 'Fazle_Rabbi_CV'}.pdf`;
    const lowerFileName = effectiveFileName.toLowerCase();
    const isDocx =
      target.fileType === 'docx' ||
      target.fileType === 'doc' ||
      lowerFileName.endsWith('.docx') ||
      lowerFileName.endsWith('.doc');

    if (isDocx && cleanBase64.length > 50) {
      return {
        filename: effectiveFileName,
        base64: cleanBase64,
        mimeType:
          target.fileMimeType ||
          vaultEntry?.fileMimeType ||
          (lowerFileName.endsWith('.doc')
            ? 'application/msword'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
        isUploadedFile: true,
        cvDocument: target,
      };
    }

    if (cleanBase64.length > 50) {
      return {
        filename: lowerFileName.endsWith('.pdf') ? effectiveFileName : `${effectiveFileName}.pdf`,
        base64: cleanBase64,
        mimeType: target.fileMimeType || 'application/pdf',
        isUploadedFile: true,
        cvDocument: target,
      };
    }
  }

  const generatedBase64 = generateDirectCVPdfBase64(target, target.roleSubtitle || target.title);
  const safeTitle = (target.title || 'Fazle_Rabbi_CV').replace(/[^\w\d-_]/g, '_').replace(/_+/g, '_');
  return {
    filename: `${safeTitle}.pdf`,
    base64: generatedBase64,
    mimeType: 'application/pdf',
    isUploadedFile: false,
    cvDocument: target,
  };
}

/**
 * Creates and saves a complete, professional AI-tailored CV in the CV Gallery when requested by the user,
 * preserving all personal details, work experience, skills, and education while customizing the role & profile.
 */
export function saveTailoredSponsorshipCVToGallery(params: {
  title: string;
  targetRole: string;
  targetEmployer?: string;
  targetCountry?: string;
  tailoredSummary?: string;
  highlightedSkills?: string[];
  baseCvId?: string;
}): CVDocumentItem {
  const lib = loadCVLibrary();
  const baseCv = (params.baseCvId ? lib.find(c => c.id === params.baseCvId) : undefined) ||
    lib.find(c => !c.fileBase64 && c.data?.experiences?.length > 0) ||
    lib[0];

  const baseData: CVData = JSON.parse(JSON.stringify(baseCv?.data?.experiences?.length ? baseCv.data : BARTENDER_CV_DATA));
  baseData.professionalTitle = params.targetRole || baseData.professionalTitle || 'Senior Bartender & Mixologist';
  if (params.tailoredSummary && params.tailoredSummary.trim().length > 20) {
    baseData.aboutMe = {
      ...baseData.aboutMe,
      content: params.tailoredSummary.trim(),
    };
  }
  if (Array.isArray(params.highlightedSkills) && params.highlightedSkills.length > 0) {
    baseData.highlightedSkills = params.highlightedSkills;
  }

  const now = new Date().toISOString();
  const id = `cv-tailored-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const newCvItem: CVDocumentItem = {
    id,
    title: params.title || `Fazle Rabbi — ${params.targetRole} CV${params.targetEmployer ? ` (${params.targetEmployer})` : ''}`,
    roleSubtitle: `${params.targetRole}${params.targetCountry ? ` · ${params.targetCountry}` : ''}`,
    createdAt: now,
    updatedAt: now,
    data: baseData,
    thumbnailColor: '#9333ea',
    isPinned: false,
    fileType: 'structured',
    storageSource: 'local',
  };

  const updatedLib = [newCvItem, ...lib];
  saveCVLibrary(updatedLib);
  setActiveCVId(id);

  try {
    window.dispatchEvent(new CustomEvent('cv_library_updated', { detail: updatedLib }));
  } catch {
    // ignore
  }

  return newCvItem;
}


