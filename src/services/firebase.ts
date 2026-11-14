import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  setLogLevel,
  doc,
  collection,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocFromServer,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  UserProfile,
  UserSettings,
  RelapseRecord,
  FinanceRecord,
  FamilyMoneyRecord,
  RecipeRecord,
  MonthlyReportRecord,
} from '../types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function isFirestoreOfflineError(error: unknown): boolean {
  const code = String((error as any)?.code || '').toLowerCase();
  const msg = String((error as any)?.message || error || '').toLowerCase();
  return (
    code === 'unavailable' ||
    code === 'failed-precondition' ||
    msg.includes('client is offline') ||
    msg.includes('could not reach cloud firestore backend') ||
    msg.includes('network error')
  );
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const currentAuth = getAuth();
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentAuth.currentUser?.uid,
      email: currentAuth.currentUser?.email,
      emailVerified: currentAuth.currentUser?.emailVerified,
      isAnonymous: currentAuth.currentUser?.isAnonymous,
      tenantId: currentAuth.currentUser?.tenantId,
      providerInfo: currentAuth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  if (isFirestoreOfflineError(error)) {
    console.warn('Firestore offline mode notice:', JSON.stringify(errInfo));
  } else {
    console.error('Firestore Error:', JSON.stringify(errInfo));
  }
  return errInfo;
}

// Suppress noisy internal SDK WebChannel retry logs in proxied/offline environments
try {
  setLogLevel('silent');
} catch {}

// Initialize Firebase with automatic long-polling detection for proxy/iframe resilience
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const databaseId = (firebaseConfig as any).firestoreDatabaseId || '(default)';
export const db = (() => {
  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
      },
      databaseId
    );
  } catch {
    return getFirestore(app, databaseId);
  }
})();
export const auth = getAuth(app);

// Persistent OAuth token & user caching for Google Workspace access (Drive, Gmail)
const STORAGE_KEY_TOKEN = 'cached_google_token_v1';
const STORAGE_KEY_TOKEN_EXPIRY = 'cached_google_token_expiry_v1';
const STORAGE_KEY_USER_EMAIL = 'cached_google_user_email_v1';
const STORAGE_KEY_USER_NAME = 'cached_google_user_name_v1';

let cachedGoogleToken: string | null = (() => {
  try {
    const exp = localStorage.getItem(STORAGE_KEY_TOKEN_EXPIRY);
    if (exp && Date.now() > parseInt(exp, 10)) {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      localStorage.removeItem(STORAGE_KEY_TOKEN_EXPIRY);
      return null;
    }
    return localStorage.getItem(STORAGE_KEY_TOKEN);
  } catch {
    return null;
  }
})();

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive');
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
googleProvider.addScope('https://www.googleapis.com/auth/drive.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/gmail.send');
googleProvider.addScope('https://www.googleapis.com/auth/gmail.readonly');
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export function isGoogleTokenExpired(): boolean {
  try {
    const token = localStorage.getItem(STORAGE_KEY_TOKEN);
    if (!token) return true;
    const exp = localStorage.getItem(STORAGE_KEY_TOKEN_EXPIRY);
    if (!exp) return false;
    return Date.now() > parseInt(exp, 10);
  } catch {
    return true;
  }
}

export function getGoogleTokenTimeRemainingMs(): number {
  try {
    const token = localStorage.getItem(STORAGE_KEY_TOKEN);
    if (!token) return 0;
    const exp = localStorage.getItem(STORAGE_KEY_TOKEN_EXPIRY);
    if (!exp) return 30 * 60 * 1000;
    return Math.max(0, parseInt(exp, 10) - Date.now());
  } catch {
    return 0;
  }
}

export function getCachedGoogleToken(): string | null {
  try {
    const exp = localStorage.getItem(STORAGE_KEY_TOKEN_EXPIRY);
    if (exp && Date.now() > parseInt(exp, 10)) {
      setCachedGoogleToken(null);
      return null;
    }
    if (cachedGoogleToken) return cachedGoogleToken;
    return localStorage.getItem(STORAGE_KEY_TOKEN);
  } catch {
    return cachedGoogleToken;
  }
}

export function setCachedGoogleToken(token: string | null, expiresInSeconds = 3600) {
  cachedGoogleToken = token;
  try {
    if (token) {
      localStorage.setItem(STORAGE_KEY_TOKEN, token);
      // Buffer by 120 seconds to prevent using tokens that are on the verge of expiring
      const expiry = Date.now() + Math.max(300, expiresInSeconds - 120) * 1000;
      localStorage.setItem(STORAGE_KEY_TOKEN_EXPIRY, expiry.toString());
    } else {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      localStorage.removeItem(STORAGE_KEY_TOKEN_EXPIRY);
    }
  } catch {}
}

/**
 * Proactively checks if the Google OAuth access token is expired or within 5 minutes of expiring,
 * verifies it against the Google tokeninfo endpoint, and refreshes it before expiry so queued
 * email sends do not fail mid-batch.
 */
export async function ensureFreshGoogleAccessToken(minRemainingMs: number = 5 * 60 * 1000): Promise<string | null> {
  const existingToken = getCachedGoogleToken();
  const remainingMs = getGoogleTokenTimeRemainingMs();

  if (existingToken && remainingMs > minRemainingMs) {
    try {
      const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(existingToken)}`);
      if (infoRes.ok) {
        const info = await infoRes.json();
        const expiresIn = Number(info?.expires_in || 0);
        if (expiresIn > 300) {
          setCachedGoogleToken(existingToken, expiresIn);
          return existingToken;
        }
      }
    } catch {
      // Network hiccup checking tokeninfo; if local expiry is still well in the future, return existingToken
      if (remainingMs > minRemainingMs) {
        return existingToken;
      }
    }
  }

  // Token is missing, expired, or about to expire within 5 minutes — attempt silent/popup refresh
  try {
    const refreshed = await signInWithGoogle();
    if (refreshed?.accessToken) {
      return refreshed.accessToken;
    }
  } catch (err) {
    console.warn('Proactive token refresh notice:', err);
  }

  return getCachedGoogleToken();
}

export const PRIMARY_ADMIN_EMAIL = 'fazle.rabbe.doc@gmail.com';
export const LEGACY_ADMIN_EMAIL = 'fazlerabbe905@gmail.com';

export function getCachedUserEmail(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_USER_EMAIL) || auth.currentUser?.email || PRIMARY_ADMIN_EMAIL;
  } catch {
    return PRIMARY_ADMIN_EMAIL;
  }
}

export function setCachedUserEmail(email: string) {
  try {
    localStorage.setItem(STORAGE_KEY_USER_EMAIL, email);
  } catch {}
}

export function getCachedUserName(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_USER_NAME) || auth.currentUser?.displayName || 'Fazle Rabbi';
  } catch {
    return 'Fazle Rabbi';
  }
}

// Auto-sync auth state into local storage for seamless sync in downloaded app
onAuthStateChanged(auth, user => {
  if (user) {
    if (user.email) setCachedUserEmail(user.email);
    if (user.displayName) {
      try {
        localStorage.setItem(STORAGE_KEY_USER_NAME, user.displayName);
      } catch {}
    }
  }
});

// Auto-capture redirect authentication on top-level mobile devices & webviews only
// Skip in embedded iframes (like AI Studio preview) where redirect storage partitioning is unsupported
const isTopLevelWindow = (() => {
  try {
    return typeof window !== 'undefined' && window.self === window.top;
  } catch {
    return false;
  }
})();

if (isTopLevelWindow) {
  try {
    getRedirectResult(auth)
      .then(result => {
        if (result) {
          const credential = GoogleAuthProvider.credentialFromResult(result);
          const token = credential?.accessToken || null;
          if (token) setCachedGoogleToken(token);
          if (result.user.email) setCachedUserEmail(result.user.email);
          if (result.user.displayName) {
            try {
              localStorage.setItem(STORAGE_KEY_USER_NAME, result.user.displayName);
            } catch {}
          }
        }
      })
      .catch(() => {
        // Silently ignore redirect check errors (e.g., auth/operation-not-supported-in-this-environment)
      });
  } catch {}
}

// Test connection on boot
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is currently in offline mode.');
    }
    return false;
  }
}

// Google Sign-In with resilient Popup -> Redirect fallback for top-level mobile browsers
export async function signInWithGoogle(): Promise<{ user: User; accessToken: string | null } | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken || null;
    setCachedGoogleToken(token);
    if (result.user.email) {
      setCachedUserEmail(result.user.email);
    }
    if (result.user.displayName) {
      try {
        localStorage.setItem(STORAGE_KEY_USER_NAME, result.user.displayName);
      } catch {}
    }
    return { user: result.user, accessToken: token };
  } catch (error: any) {
    // Only fallback to redirect if running in a top-level window where popup was blocked
    if (
      isTopLevelWindow &&
      (error?.code === 'auth/popup-blocked' || error?.message?.includes('popup-blocked'))
    ) {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }

    // Gracefully handle user cancelling/closing popup or iframe environment limitations
    if (
      error?.code === 'auth/popup-closed-by-user' ||
      error?.code === 'auth/cancelled-popup-request' ||
      error?.code === 'auth/operation-not-supported-in-this-environment' ||
      error?.message?.includes('popup-closed-by-user') ||
      error?.message?.includes('cancelled-popup-request') ||
      error?.message?.includes('operation-not-supported-in-this-environment')
    ) {
      return null;
    }
    throw error;
  }
}

export const signInWithGooglePopup = signInWithGoogle;

export async function logOut(): Promise<void> {
  setCachedGoogleToken(null);
  await signOut(auth);
}

export function getCachedDriveToken(): string | null {
  return cachedGoogleToken;
}

export function setCachedDriveToken(token: string | null) {
  cachedGoogleToken = token;
}

// Helper to always resolve the authenticated Firebase UID and prevent writes to 'local-user'
function resolveAuthenticatedUid(candidateUid?: string | null): string | null {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) return null;
  if (candidateUid && candidateUid !== 'local-user' && candidateUid !== 'default' && candidateUid === currentUid) {
    return candidateUid;
  }
  return currentUid;
}

// Database CRUD with UID segregation
export async function saveUserProfile(user: UserProfile): Promise<void> {
  const effectiveUid = resolveAuthenticatedUid(user.userId);
  if (!effectiveUid) return;
  const payload: UserProfile = { ...user, userId: effectiveUid };
  const path = `users/${effectiveUid}`;
  try {
    await setDoc(doc(db, 'users', effectiveUid), payload, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

export async function saveUserSettings(settings: UserSettings): Promise<void> {
  const effectiveUid = resolveAuthenticatedUid(settings.userId);
  if (!effectiveUid) return;
  const payload: UserSettings = { ...settings, userId: effectiveUid, updatedAt: new Date().toISOString() };
  const path = `users/${effectiveUid}/settings/current`;
  try {
    await setDoc(doc(db, 'users', effectiveUid, 'settings', 'current'), payload, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

export async function saveRelapse(userId: string, record: RelapseRecord): Promise<void> {
  const effectiveUid = resolveAuthenticatedUid(userId);
  if (!effectiveUid) return;
  const payload: RelapseRecord = { ...record, userId: effectiveUid };
  const path = `users/${effectiveUid}/relapses/${record.id}`;
  try {
    await setDoc(doc(db, 'users', effectiveUid, 'relapses', record.id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

export async function deleteRelapseRecord(userId: string, id: string): Promise<void> {
  const effectiveUid = resolveAuthenticatedUid(userId);
  if (!effectiveUid) return;
  const path = `users/${effectiveUid}/relapses/${id}`;
  try {
    await deleteDoc(doc(db, 'users', effectiveUid, 'relapses', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    throw err;
  }
}

export async function saveFinance(userId: string, record: FinanceRecord): Promise<void> {
  const effectiveUid = resolveAuthenticatedUid(userId);
  if (!effectiveUid) return;
  const payload: FinanceRecord = { ...record, userId: effectiveUid };
  const path = `users/${effectiveUid}/finance/${record.id}`;
  try {
    await setDoc(doc(db, 'users', effectiveUid, 'finance', record.id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

export async function deleteFinanceRecord(userId: string, id: string): Promise<void> {
  const effectiveUid = resolveAuthenticatedUid(userId);
  if (!effectiveUid) return;
  const path = `users/${effectiveUid}/finance/${id}`;
  try {
    await deleteDoc(doc(db, 'users', effectiveUid, 'finance', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    throw err;
  }
}

export async function saveFamilyMoney(userId: string, record: FamilyMoneyRecord): Promise<void> {
  const effectiveUid = resolveAuthenticatedUid(userId);
  if (!effectiveUid) return;
  const payload: FamilyMoneyRecord = { ...record, userId: effectiveUid };
  const path = `users/${effectiveUid}/familyMoney/${record.id}`;
  try {
    await setDoc(doc(db, 'users', effectiveUid, 'familyMoney', record.id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

export async function deleteFamilyMoneyRecord(userId: string, id: string): Promise<void> {
  const effectiveUid = resolveAuthenticatedUid(userId);
  if (!effectiveUid) return;
  const path = `users/${effectiveUid}/familyMoney/${id}`;
  try {
    await deleteDoc(doc(db, 'users', effectiveUid, 'familyMoney', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    throw err;
  }
}

export async function saveRecipe(userId: string, record: RecipeRecord): Promise<void> {
  const effectiveUid = resolveAuthenticatedUid(userId);
  if (!effectiveUid) return;
  const payload: RecipeRecord = { ...record, userId: effectiveUid };
  const path = `users/${effectiveUid}/recipes/${record.id}`;
  try {
    await setDoc(doc(db, 'users', effectiveUid, 'recipes', record.id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

export async function deleteRecipeRecord(userId: string, id: string): Promise<void> {
  const effectiveUid = resolveAuthenticatedUid(userId);
  if (!effectiveUid) return;
  const path = `users/${effectiveUid}/recipes/${id}`;
  try {
    await deleteDoc(doc(db, 'users', effectiveUid, 'recipes', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    throw err;
  }
}

export async function saveReport(userId: string, record: MonthlyReportRecord): Promise<void> {
  const effectiveUid = resolveAuthenticatedUid(userId);
  if (!effectiveUid) return;
  const payload: MonthlyReportRecord = { ...record, userId: effectiveUid };
  const path = `users/${effectiveUid}/reports/${record.id}`;
  try {
    await setDoc(doc(db, 'users', effectiveUid, 'reports', record.id), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
    throw err;
  }
}

export async function deleteReportRecord(userId: string, id: string): Promise<void> {
  const effectiveUid = resolveAuthenticatedUid(userId);
  if (!effectiveUid) return;
  const path = `users/${effectiveUid}/reports/${id}`;
  try {
    await deleteDoc(doc(db, 'users', effectiveUid, 'reports', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
    throw err;
  }
}

// Real-time synchronization subscriptions
export function subscribeToUserData(
  userId: string,
  callbacks: {
    onSettings: (settings: UserSettings) => void;
    onRelapses: (relapses: RelapseRecord[]) => void;
    onFinances: (finances: FinanceRecord[]) => void;
    onFamilyMoney: (familyMoney: FamilyMoneyRecord[]) => void;
    onRecipes: (recipes: RecipeRecord[]) => void;
    onReports: (reports: MonthlyReportRecord[]) => void;
  }
): () => void {
  const effectiveUid = resolveAuthenticatedUid(userId);
  if (!effectiveUid) return () => {};
  const unsubs: Unsubscribe[] = [];

  // Settings
  const settingsPath = `users/${effectiveUid}/settings/current`;
  unsubs.push(
    onSnapshot(
      doc(db, 'users', effectiveUid, 'settings', 'current'),
      snapshot => {
        if (snapshot.exists()) {
          callbacks.onSettings(snapshot.data() as UserSettings);
        }
      },
      err => handleFirestoreError(err, OperationType.GET, settingsPath)
    )
  );

  // Relapses
  const relapsesPath = `users/${effectiveUid}/relapses`;
  unsubs.push(
    onSnapshot(
      collection(db, 'users', effectiveUid, 'relapses'),
      snapshot => {
        const list: RelapseRecord[] = [];
        snapshot.forEach(d => list.push(d.data() as RelapseRecord));
        list.sort((a, b) => b.timestamp - a.timestamp);
        callbacks.onRelapses(list);
      },
      err => handleFirestoreError(err, OperationType.LIST, relapsesPath)
    )
  );

  // Finance
  const financePath = `users/${effectiveUid}/finance`;
  unsubs.push(
    onSnapshot(
      collection(db, 'users', effectiveUid, 'finance'),
      snapshot => {
        const list: FinanceRecord[] = [];
        snapshot.forEach(d => list.push(d.data() as FinanceRecord));
        list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        callbacks.onFinances(list);
      },
      err => handleFirestoreError(err, OperationType.LIST, financePath)
    )
  );

  // Family Money
  const familyPath = `users/${effectiveUid}/familyMoney`;
  unsubs.push(
    onSnapshot(
      collection(db, 'users', effectiveUid, 'familyMoney'),
      snapshot => {
        const list: FamilyMoneyRecord[] = [];
        snapshot.forEach(d => list.push(d.data() as FamilyMoneyRecord));
        list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        callbacks.onFamilyMoney(list);
      },
      err => handleFirestoreError(err, OperationType.LIST, familyPath)
    )
  );

  // Recipes
  const recipesPath = `users/${effectiveUid}/recipes`;
  unsubs.push(
    onSnapshot(
      collection(db, 'users', effectiveUid, 'recipes'),
      snapshot => {
        const list: RecipeRecord[] = [];
        snapshot.forEach(d => list.push(d.data() as RecipeRecord));
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        callbacks.onRecipes(list);
      },
      err => handleFirestoreError(err, OperationType.LIST, recipesPath)
    )
  );

  // Reports
  const reportsPath = `users/${effectiveUid}/reports`;
  unsubs.push(
    onSnapshot(
      collection(db, 'users', effectiveUid, 'reports'),
      snapshot => {
        const list: MonthlyReportRecord[] = [];
        snapshot.forEach(d => list.push(d.data() as MonthlyReportRecord));
        list.sort((a, b) => b.month.localeCompare(a.month));
        callbacks.onReports(list);
      },
      err => handleFirestoreError(err, OperationType.LIST, reportsPath)
    )
  );

  return () => {
    unsubs.forEach(unsub => unsub());
  };
}
