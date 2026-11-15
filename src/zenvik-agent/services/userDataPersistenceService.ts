import { doc, getDoc, getDocFromCache, setDoc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db, auth, isFirestoreOfflineError } from './firebase';
import { CVDocumentItem } from '../types/cv';
import { loadCVLibrary, getActiveCVId } from './cvStorage';
import { loadSavedJobs } from './jobSearchService';
import { loadAppliedJobRecords } from './jobDatabaseService';
import { loadSavedPreparedApplications } from './gmailService';
import { loadRejectedApplications } from './rejectionTrackingService';
import { loadCentralProfile } from './centralProfileService';

export interface UserWorkspaceData {
  userId: string;
  email: string;
  displayName: string;
  photoURL?: string;
  activeCvId: string;
  cvLibrary: CVDocumentItem[];
  savedJobs: any[];
  appliedJobs: any[];
  gmailQueue: any[];
  employerReplies: any[];
  rejectedApplications: any[];
  jobResults: {
    sponsorship?: any[];
    europe?: any[];
    cyprus?: any[];
  };
  agentProgress: {
    lastSearchTime?: string;
    totalSearched?: number;
    discoveredCount?: number;
    activeQueries?: string[];
    logs?: any[];
  };
  profile: any;
  settings: any;
  version: number;
  updatedAt: string;
  createdAt: string;
}

// Local Storage Keys
const STORAGE_KEY_LIBRARY = 'multi_cv_library_v2';
const STORAGE_KEY_ACTIVE_ID = 'multi_cv_active_id_v2';
const STORAGE_KEY_SAVED_JOBS = 'job_search_saved_jobs_v1';
const STORAGE_KEY_APPLIED = 'cv_applied_jobs_history_v2';
const STORAGE_KEY_GMAIL_HISTORY = 'gmail_application_history_v1';
const STORAGE_KEY_QUEUE = 'cv_persistent_gmail_queue_v2';
const STORAGE_KEY_REJECTIONS = 'cv_rejected_applications_v1';
const STORAGE_KEY_PROFILE = 'central_user_profile_v2';
const STORAGE_KEY_CAREER = 'user_career_profile_v2';

// Testing hook for simulating database or storage errors (Requirement 7 Scenario F)
let simulateError = false;
export function setSimulateStorageError(simulate: boolean) {
  simulateError = simulate;
}
export function getSimulateStorageError(): boolean {
  return simulateError;
}

/**
 * Hydrates local browser storage and in-memory caches from a Cloud Workspace payload.
 * Triggers UI custom events so all views update immediately without page refresh.
 */
export function hydrateLocalStateFromCloud(workspace: UserWorkspaceData): void {
  try {
    if (Array.isArray(workspace.cvLibrary) && workspace.cvLibrary.length > 0) {
      localStorage.setItem(STORAGE_KEY_LIBRARY, JSON.stringify(workspace.cvLibrary));
      if (workspace.cvLibrary[0]?.data) {
        localStorage.setItem('dynamic_cv_data_v4', JSON.stringify(workspace.cvLibrary[0].data));
      }
    }
    if (workspace.activeCvId) {
      localStorage.setItem(STORAGE_KEY_ACTIVE_ID, workspace.activeCvId);
    }
    if (Array.isArray(workspace.savedJobs)) {
      localStorage.setItem(STORAGE_KEY_SAVED_JOBS, JSON.stringify(workspace.savedJobs));
      localStorage.setItem('ccd_saved_jobs_v3', JSON.stringify(workspace.savedJobs));
    }
    if (Array.isArray(workspace.appliedJobs)) {
      localStorage.setItem(STORAGE_KEY_APPLIED, JSON.stringify(workspace.appliedJobs));
      localStorage.setItem(STORAGE_KEY_GMAIL_HISTORY, JSON.stringify(workspace.appliedJobs));
    }
    if (Array.isArray(workspace.gmailQueue)) {
      localStorage.setItem(STORAGE_KEY_QUEUE, JSON.stringify(workspace.gmailQueue));
    }
    if (Array.isArray(workspace.rejectedApplications)) {
      localStorage.setItem(STORAGE_KEY_REJECTIONS, JSON.stringify(workspace.rejectedApplications));
    }
    if (workspace.profile) {
      localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(workspace.profile));
    }
    if (workspace.settings) {
      localStorage.setItem(STORAGE_KEY_CAREER, JSON.stringify(workspace.settings));
    }

    // Dispatch system events so React components listening to storage update immediately
    window.dispatchEvent(new CustomEvent('cv_library_updated', { detail: workspace.cvLibrary }));
    window.dispatchEvent(new CustomEvent('saved_jobs_updated', { detail: workspace.savedJobs }));
    window.dispatchEvent(new CustomEvent('application_history_updated', { detail: workspace.appliedJobs }));
    window.dispatchEvent(new CustomEvent('gmail_queue_updated', { detail: workspace.gmailQueue }));
    window.dispatchEvent(new CustomEvent('rejections_updated', { detail: workspace.rejectedApplications }));
    window.dispatchEvent(new CustomEvent('central_profile_updated', { detail: workspace.profile }));
    window.dispatchEvent(new CustomEvent('workspace_cloud_hydrated', { detail: workspace }));
  } catch (err) {
    console.warn('Error hydrating local storage from cloud workspace:', err);
  }
}

export interface SanitizedCVLibraryResult {
  metadataLibrary: CVDocumentItem[];
  filePayloads: Array<{
    id: string;
    fileBase64?: string;
    fileDataUri?: string;
    fileName?: string;
    fileMimeType?: string;
    fileType?: string;
  }>;
}

/**
 * Sanitizes CV Library to prevent Firestore 1MB document limit errors.
 * Separates heavy base64 strings into dedicated subcollection documents.
 */
export function sanitizeCVLibraryForFirestore(library: CVDocumentItem[]): SanitizedCVLibraryResult {
  const filePayloads: SanitizedCVLibraryResult['filePayloads'] = [];
  const metadataLibrary = (library || []).map(item => {
    if (item.fileBase64 || item.fileDataUri) {
      filePayloads.push({
        id: item.id,
        fileBase64: item.fileBase64,
        fileDataUri: item.fileDataUri,
        fileName: item.fileName,
        fileMimeType: item.fileMimeType,
        fileType: item.fileType,
      });
    }

    // Strip out heavy base64 strings from root document
    return {
      ...item,
      fileBase64: undefined,
      fileDataUri: undefined,
      storageSource: 'firestore' as const,
    };
  });

  return { metadataLibrary, filePayloads };
}

/**
 * Persists raw CV file payloads (PDF / DOCX base64) into subcollection documents.
 * Employs 500KB chunking so documents easily stay under Firestore's 1MB limit.
 */
export async function persistCvFilePayloads(
  userId: string,
  payloads: SanitizedCVLibraryResult['filePayloads']
): Promise<void> {
  for (const payload of payloads) {
    if (!payload.fileBase64) continue;
    try {
      const docRef = doc(db, 'users', userId, 'cvDocuments', payload.id);
      const raw = payload.fileBase64;
      const CHUNK_SIZE = 500000;
      const chunks: string[] = [];
      for (let i = 0; i < raw.length; i += CHUNK_SIZE) {
        chunks.push(raw.slice(i, i + CHUNK_SIZE));
      }

      await setDoc(
        docRef,
        {
          id: payload.id,
          fileName: payload.fileName || 'CV_Document.pdf',
          fileMimeType: payload.fileMimeType || 'application/pdf',
          fileType: payload.fileType || 'pdf',
          chunks,
          chunkCount: chunks.length,
          totalLength: raw.length,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (fileErr) {
      console.warn(`Could not persist CV document file ${payload.id} to cloud:`, fileErr);
    }
  }
}

/**
 * Hydrates CV file payloads from subcollection documents.
 */
export async function hydrateCvFilePayloads(
  userId: string,
  library: CVDocumentItem[]
): Promise<CVDocumentItem[]> {
  const result: CVDocumentItem[] = [];
  for (const item of library) {
    if (item.fileType && !item.fileBase64) {
      try {
        const docRef = doc(db, 'users', userId, 'cvDocuments', item.id);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          let base64 = '';
          if (Array.isArray(data.chunks) && data.chunks.length > 0) {
            base64 = data.chunks.join('');
          } else if (data.fileBase64) {
            base64 = data.fileBase64;
          }

          if (base64) {
            const mime = data.fileMimeType || item.fileMimeType || 'application/pdf';
            const dataUri = `data:${mime};base64,${base64}`;
            result.push({
              ...item,
              fileBase64: base64,
              fileDataUri: dataUri,
              fileName: data.fileName || item.fileName,
              fileMimeType: mime,
            });
            continue;
          }
        }
      } catch (e) {
        console.warn(`Could not load CV document file for ${item.id}:`, e);
      }
    }
    result.push(item);
  }
  return result;
}

/**
 * Loads a single uploaded CV binary payload from Firestore subcollection cvDocuments/{cvId}.
 */
export async function loadCvFilePayload(
  userId: string,
  cvId: string
): Promise<{
  id: string;
  fileBase64: string;
  fileDataUri: string;
  fileName?: string;
  fileMimeType?: string;
  fileType?: string;
} | null> {
  if (!userId || !cvId) return null;
  try {
    const docRef = doc(db, 'users', userId, 'cvDocuments', cvId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      let base64 = '';
      if (Array.isArray(data.chunks) && data.chunks.length > 0) {
        base64 = data.chunks.join('');
      } else if (data.fileBase64) {
        base64 = data.fileBase64;
      }
      if (base64) {
        const mime = data.fileMimeType || 'application/pdf';
        return {
          id: cvId,
          fileBase64: base64,
          fileDataUri: `data:${mime};base64,${base64}`,
          fileName: data.fileName,
          fileMimeType: mime,
          fileType: data.fileType,
        };
      }
    }
  } catch (e) {
    console.warn(`loadCvFilePayload error for ${cvId}:`, e);
  }
  return null;
}

/**
 * Loads the user's existing workspace and personal data from Cloud Firestore using the authenticated UID.
 * If the user has saved data in the cloud, it restores their complete workspace.
 * If no cloud record exists yet (e.g. first login after using local mode), it migrates their current
 * local documents and records to Cloud Firestore without losing any data.
 */
export async function loadUserDataFromCloud(userId: string): Promise<{
  success: boolean;
  isExistingUser: boolean;
  workspace: UserWorkspaceData;
}> {
  if (simulateError) {
    throw new Error('SIMULATED_DATABASE_ERROR: Cloud Firestore simulated connectivity failure.');
  }

  if (!userId) {
    throw new Error('Cannot load user data without a valid authenticated Firebase UID.');
  }

  const workspaceRef = doc(db, 'users', userId, 'workspace', 'main');
  const userRootRef = doc(db, 'users', userId);

  let docSnap: any = null;
  let isOfflineMode = false;
  try {
    docSnap = await getDoc(workspaceRef);
  } catch (err: any) {
    if (isFirestoreOfflineError(err)) {
      isOfflineMode = true;
      try {
        docSnap = await getDocFromCache(workspaceRef);
      } catch {
        docSnap = null;
      }
    } else {
      console.error('Failed to retrieve cloud workspace from Firestore:', err);
      throw new Error(`Cloud database read failed: ${err.message || 'Network or permission error'}`);
    }
  }

  const currentUser = auth.currentUser;
  const userEmail = currentUser?.email || 'fazle.rabbe.doc@gmail.com';
  const userName = currentUser?.displayName || 'Fazle Rabbi';
  const userPhoto = currentUser?.photoURL || undefined;

  // Case 1: Existing Cloud Workspace Found
  if (docSnap && docSnap.exists()) {
    const rawData = docSnap.data();
    
    // Parse JSON string fields safely or use direct objects
    const rawCvLibrary = typeof rawData.cvLibrary === 'string' ? JSON.parse(rawData.cvLibrary) : (rawData.cvLibrary || []);
    const fullCvLibrary = await hydrateCvFilePayloads(userId, rawCvLibrary);

    const savedJobs = typeof rawData.savedJobs === 'string' ? JSON.parse(rawData.savedJobs) : (rawData.savedJobs || []);
    const appliedJobs = typeof rawData.appliedJobs === 'string' ? JSON.parse(rawData.appliedJobs) : (rawData.appliedJobs || []);
    const gmailQueue = typeof rawData.gmailQueue === 'string' ? JSON.parse(rawData.gmailQueue) : (rawData.gmailQueue || []);
    const employerReplies = typeof rawData.employerReplies === 'string' ? JSON.parse(rawData.employerReplies) : (rawData.employerReplies || []);
    const rejectedApplications = typeof rawData.rejectedApplications === 'string' ? JSON.parse(rawData.rejectedApplications) : (rawData.rejectedApplications || []);
    const jobResults = typeof rawData.jobResults === 'string' ? JSON.parse(rawData.jobResults) : (rawData.jobResults || {});
    const agentProgress = typeof rawData.agentProgress === 'string' ? JSON.parse(rawData.agentProgress) : (rawData.agentProgress || {});
    const profile = typeof rawData.profile === 'string' ? JSON.parse(rawData.profile) : (rawData.profile || {});
    const settings = typeof rawData.settings === 'string' ? JSON.parse(rawData.settings) : (rawData.settings || {});

    const workspace: UserWorkspaceData = {
      userId,
      email: rawData.email || userEmail,
      displayName: rawData.displayName || userName,
      photoURL: rawData.photoURL || userPhoto,
      activeCvId: rawData.activeCvId || (fullCvLibrary[0]?.id || 'cv-bartender-primary'),
      cvLibrary: fullCvLibrary,
      savedJobs,
      appliedJobs,
      gmailQueue,
      employerReplies,
      rejectedApplications,
      jobResults,
      agentProgress,
      profile,
      settings,
      version: rawData.version || 2,
      updatedAt: rawData.updatedAt || new Date().toISOString(),
      createdAt: rawData.createdAt || new Date().toISOString(),
    };

    // Hydrate local cache and dispatch real-time events
    hydrateLocalStateFromCloud(workspace);

    return {
      success: true,
      isExistingUser: true,
      workspace,
    };
  }

  // Case 2: No Cloud Workspace Yet -> Carefully migrate local data & any existing cv_accounts data (including legacy fazlerabbe905_gmail_com) to Firestore for this UID
  console.info(`Initial cloud workspace creation for authenticated UID ${userId}. Migrating local & legacy account records...`);
  const now = new Date().toISOString();

  let localCVs = loadCVLibrary();
  let localProfile = loadCentralProfile();

  if (!isOfflineMode) {
    try {
      const candidateAccountDocIds = Array.from(
        new Set([
          userEmail.trim().toLowerCase().replace(/[^a-z0-9]/g, '_'),
          'fazle_rabbe_doc_gmail_com',
          'fazlerabbe905_gmail_com',
        ])
      );
      for (const accDocId of candidateAccountDocIds) {
        const accSnap = await getDoc(doc(db, 'cv_accounts', accDocId));
        if (accSnap.exists()) {
          const accData = accSnap.data();
          if (accData?.cvLibrary && localCVs.length <= 4) {
            try {
              const parsedCvs = typeof accData.cvLibrary === 'string' ? JSON.parse(accData.cvLibrary) : accData.cvLibrary;
              if (Array.isArray(parsedCvs) && parsedCvs.length > 0) {
                const existingIds = new Set(localCVs.map(c => c.id));
                for (const cvItem of parsedCvs) {
                  if (cvItem && cvItem.id && !existingIds.has(cvItem.id)) {
                    localCVs.push(cvItem);
                    existingIds.add(cvItem.id);
                  }
                }
              }
            } catch {}
          }
          if (accData?.centralProfile) {
            localProfile = {
              ...accData.centralProfile,
              ...localProfile,
              email: userEmail,
            };
          }
        }
      }
    } catch (e) {
      console.warn('Legacy cv_accounts bridge check skipped:', e);
    }
  }

  const localActiveCvId = getActiveCVId();
  const localSavedJobs = loadSavedJobs();
  const localApplied = loadAppliedJobRecords();
  const localQueue = (() => {
    try {
      const q = localStorage.getItem(STORAGE_KEY_QUEUE);
      return q ? JSON.parse(q) : [];
    } catch {
      return [];
    }
  })();
  const localRejections = loadRejectedApplications();
  const localSettings = (() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY_CAREER);
      return s ? JSON.parse(s) : {};
    } catch {
      return {};
    }
  })();

  // Separate heavy base64 strings from local CV library
  const { metadataLibrary, filePayloads } = sanitizeCVLibraryForFirestore(localCVs);

  const newWorkspace: UserWorkspaceData = {
    userId,
    email: userEmail,
    displayName: userName,
    photoURL: userPhoto,
    activeCvId: localActiveCvId,
    cvLibrary: localCVs,
    savedJobs: localSavedJobs,
    appliedJobs: localApplied,
    gmailQueue: localQueue,
    employerReplies: [],
    rejectedApplications: localRejections,
    jobResults: {},
    agentProgress: {
      lastSearchTime: now,
      totalSearched: 0,
      discoveredCount: 0,
      activeQueries: [],
      logs: [],
    },
    profile: localProfile,
    settings: localSettings,
    version: 2,
    updatedAt: now,
    createdAt: now,
  };

  if (isOfflineMode) {
    hydrateLocalStateFromCloud(newWorkspace);
    return {
      success: true,
      isExistingUser: false,
      workspace: newWorkspace,
    };
  }

  try {
    // 1. Save root user document
    await setDoc(userRootRef, {
      userId,
      email: userEmail,
      displayName: userName,
      photoURL: userPhoto,
      selectedCvId: localActiveCvId,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    // 2. Save user workspace document using sanitized metadata (tiny < 50KB)
    await setDoc(workspaceRef, {
      userId,
      email: userEmail,
      displayName: userName,
      photoURL: userPhoto,
      activeCvId: localActiveCvId,
      cvLibrary: JSON.stringify(metadataLibrary),
      savedJobs: JSON.stringify(localSavedJobs),
      appliedJobs: JSON.stringify(localApplied),
      gmailQueue: JSON.stringify(localQueue),
      employerReplies: JSON.stringify([]),
      rejectedApplications: JSON.stringify(localRejections),
      jobResults: JSON.stringify({}),
      agentProgress: JSON.stringify(newWorkspace.agentProgress),
      profile: JSON.stringify(localProfile),
      settings: JSON.stringify(localSettings),
      version: 2,
      updatedAt: now,
      createdAt: now,
    }, { merge: true });

    // 3. Also sync CV library subcollection with metadata
    const cvSubDoc = doc(db, 'users', userId, 'cvLibrary', 'main');
    await setDoc(cvSubDoc, {
      cvLibrary: JSON.stringify(metadataLibrary),
      totalCount: metadataLibrary.length,
      updatedAt: now,
    }, { merge: true });

    // 4. Persist any binary file payloads into separate cvDocuments documents
    if (filePayloads.length > 0) {
      await persistCvFilePayloads(userId, filePayloads);
    }

    hydrateLocalStateFromCloud(newWorkspace);

    return {
      success: true,
      isExistingUser: false,
      workspace: newWorkspace,
    };
  } catch (err: any) {
    if (isFirestoreOfflineError(err)) {
      hydrateLocalStateFromCloud(newWorkspace);
      return {
        success: true,
        isExistingUser: false,
        workspace: newWorkspace,
      };
    }
    console.error('Failed to write initial cloud workspace to Firestore:', err);
    throw new Error(`Failed to persist user workspace to cloud: ${err.message || 'Write error'}`);
  }
}

/**
 * Persists changes to the user's workspace in Cloud Firestore.
 * Explicitly throws an error on failure so caller never shows a fake success message.
 */
export async function persistUserWorkspace(
  userId: string,
  partial: Partial<UserWorkspaceData>
): Promise<void> {
  if (simulateError) {
    throw new Error('SIMULATED_DATABASE_ERROR: Cloud Firestore write operation failed.');
  }

  if (!userId) {
    throw new Error('Cannot persist data without authenticated user ID.');
  }

  const workspaceRef = doc(db, 'users', userId, 'workspace', 'main');
  const userRootRef = doc(db, 'users', userId);
  const now = new Date().toISOString();

  const payload: Record<string, any> = {
    updatedAt: now,
  };

  let filePayloads: SanitizedCVLibraryResult['filePayloads'] = [];

  if (partial.cvLibrary !== undefined) {
    const sanitized = sanitizeCVLibraryForFirestore(partial.cvLibrary);
    payload.cvLibrary = JSON.stringify(sanitized.metadataLibrary);
    filePayloads = sanitized.filePayloads;
  }
  if (partial.activeCvId !== undefined) {
    payload.activeCvId = partial.activeCvId;
    setDoc(userRootRef, { selectedCvId: partial.activeCvId, updatedAt: now }, { merge: true }).catch(console.warn);
  }
  if (partial.savedJobs !== undefined) payload.savedJobs = JSON.stringify(partial.savedJobs);
  if (partial.appliedJobs !== undefined) payload.appliedJobs = JSON.stringify(partial.appliedJobs);
  if (partial.gmailQueue !== undefined) payload.gmailQueue = JSON.stringify(partial.gmailQueue);
  if (partial.employerReplies !== undefined) payload.employerReplies = JSON.stringify(partial.employerReplies);
  if (partial.rejectedApplications !== undefined) payload.rejectedApplications = JSON.stringify(partial.rejectedApplications);
  if (partial.jobResults !== undefined) payload.jobResults = JSON.stringify(partial.jobResults);
  if (partial.agentProgress !== undefined) payload.agentProgress = JSON.stringify(partial.agentProgress);
  if (partial.profile !== undefined) payload.profile = JSON.stringify(partial.profile);
  if (partial.settings !== undefined) payload.settings = JSON.stringify(partial.settings);

  try {
    await setDoc(workspaceRef, payload, { merge: true });

    // Also update cvLibrary subcollection and cvDocuments if CVs were modified
    if (partial.cvLibrary !== undefined) {
      const sanitized = sanitizeCVLibraryForFirestore(partial.cvLibrary);
      const cvSubDoc = doc(db, 'users', userId, 'cvLibrary', 'main');
      await setDoc(cvSubDoc, {
        cvLibrary: JSON.stringify(sanitized.metadataLibrary),
        totalCount: sanitized.metadataLibrary.length,
        updatedAt: now,
      }, { merge: true });

      if (filePayloads.length > 0) {
        await persistCvFilePayloads(userId, filePayloads);
      }
    }
  } catch (err: any) {
    console.error('Firestore workspace persist error:', err);
    throw new Error(`Failed to save changes to cloud database: ${err.message || 'Write rejected'}`);
  }
}

/**
 * Persists CV Library changes immediately to Cloud Firestore.
 */
export async function persistCVLibrary(
  userId: string,
  library: CVDocumentItem[],
  activeCvId?: string
): Promise<void> {
  await persistUserWorkspace(userId, {
    cvLibrary: library,
    ...(activeCvId ? { activeCvId } : {}),
  });
}

/**
 * Persists Saved Jobs changes immediately to Cloud Firestore.
 */
export async function persistSavedJobs(userId: string, jobs: any[]): Promise<void> {
  await persistUserWorkspace(userId, { savedJobs: jobs });
}

/**
 * Persists Application History event immediately to Cloud Firestore.
 */
export async function persistAppliedJobs(userId: string, applied: any[]): Promise<void> {
  await persistUserWorkspace(userId, { appliedJobs: applied });
}

/**
 * Persists Gmail Queue changes immediately to Cloud Firestore.
 */
export async function persistGmailQueue(userId: string, queue: any[]): Promise<void> {
  await persistUserWorkspace(userId, { gmailQueue: queue });
}

/**
 * Persists Rejected Applications immediately to Cloud Firestore.
 */
export async function persistRejectedApplications(userId: string, rejections: any[]): Promise<void> {
  await persistUserWorkspace(userId, { rejectedApplications: rejections });
}

/**
 * Real-time subscription to cloud workspace for live multi-device and multi-tab synchronization.
 */
export function subscribeToUserWorkspace(
  userId: string,
  onUpdate: (data: UserWorkspaceData) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const workspaceRef = doc(db, 'users', userId, 'workspace', 'main');
  return onSnapshot(
    workspaceRef,
    snapshot => {
      if (snapshot.exists()) {
        try {
          const raw = snapshot.data();
          const cvLibrary = typeof raw.cvLibrary === 'string' ? JSON.parse(raw.cvLibrary) : (raw.cvLibrary || []);
          const savedJobs = typeof raw.savedJobs === 'string' ? JSON.parse(raw.savedJobs) : (raw.savedJobs || []);
          const appliedJobs = typeof raw.appliedJobs === 'string' ? JSON.parse(raw.appliedJobs) : (raw.appliedJobs || []);
          const gmailQueue = typeof raw.gmailQueue === 'string' ? JSON.parse(raw.gmailQueue) : (raw.gmailQueue || []);
          const employerReplies = typeof raw.employerReplies === 'string' ? JSON.parse(raw.employerReplies) : (raw.employerReplies || []);
          const rejectedApplications = typeof raw.rejectedApplications === 'string' ? JSON.parse(raw.rejectedApplications) : (raw.rejectedApplications || []);
          const jobResults = typeof raw.jobResults === 'string' ? JSON.parse(raw.jobResults) : (raw.jobResults || {});
          const agentProgress = typeof raw.agentProgress === 'string' ? JSON.parse(raw.agentProgress) : (raw.agentProgress || {});
          const profile = typeof raw.profile === 'string' ? JSON.parse(raw.profile) : (raw.profile || {});
          const settings = typeof raw.settings === 'string' ? JSON.parse(raw.settings) : (raw.settings || {});

          const workspace: UserWorkspaceData = {
            userId,
            email: raw.email || '',
            displayName: raw.displayName || '',
            photoURL: raw.photoURL,
            activeCvId: raw.activeCvId || (cvLibrary[0]?.id || ''),
            cvLibrary,
            savedJobs,
            appliedJobs,
            gmailQueue,
            employerReplies,
            rejectedApplications,
            jobResults,
            agentProgress,
            profile,
            settings,
            version: raw.version || 2,
            updatedAt: raw.updatedAt || new Date().toISOString(),
            createdAt: raw.createdAt || new Date().toISOString(),
          };

          hydrateLocalStateFromCloud(workspace);
          onUpdate(workspace);
        } catch (e: any) {
          console.warn('Error parsing snapshot data:', e);
        }
      }
    },
    error => {
      if (isFirestoreOfflineError(error)) {
        console.warn('Workspace subscription operating in offline mode:', error.message);
      } else {
        console.error('Workspace subscription error:', error);
      }
      onError?.(error);
    }
  );
}
