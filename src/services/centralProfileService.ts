import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, auth, getCachedUserEmail, getCachedUserName } from './firebase';
import { GmailSendingRecord, SavedApplicationDraft, SavedRecipient } from './gmailService';
import { PreparedJobApplication } from '../types/jobApplication';

export interface CentralUserProfile {
  // 1. Personal Identity & Hospitality Bio
  fullName: string;
  email: string;
  phone: string;
  location: string;
  residenceStatus: string;
  portfolioUrl: string;
  linkedinUrl: string;
  yearsOfExperience: number;
  primaryRoles: string[];
  keySpecializations: string[];
  languages: string[];

  // 2. Master Cover Letter (Preserved template - not replaced without user consent)
  masterCoverLetter: string;
  defaultEmailSubject: string;

  // 3. Saved Templates
  emailTemplates: {
    id: string;
    title: string;
    subject: string;
    content: string;
  }[];

  // 4. Job Search & Market Preferences
  targetMarkets: ('cyprus' | 'europe')[];
  targetEuropeanCountries: string[];
  targetCyprusCities: string[];

  // 5. Sponsorship Preferences
  requiresVisaSponsorship: boolean;
  requiresAccommodation: boolean;
  requiresRelocationSupport: boolean;

  // 6. Application History & Sent Records
  sendingHistory: GmailSendingRecord[];
  savedRecipients: SavedRecipient[];

  // 7. Metadata
  lastSavedAt: string;
  version: number;
}

export const DEFAULT_MASTER_COVER_LETTER = `Fazle Rabbi Boyati
Limassol Marina, Cyprus
+357 9550 2363 | fazle.rabbe.doc@gmail.com
LinkedIn: https://www.linkedin.com/in/fazle-rabbi-5785aa269

Dear Hiring Manager,

I am writing to express my strong interest in joining your establishment. With over five years of hands-on experience in high-volume cocktail bars, luxury beach resorts, and five-star hotels across Cyprus and Bangladesh, I am confident in my ability to deliver exceptional beverage craft and 5-star guest hospitality.

I have gained valuable hands-on experience with reputable hospitality organisations, including:
• Flamingo Paradise Beach Hotel, Protaras, Cyprus
• O’Neill’s Irish Pub, Paphos, Cyprus
• Sea Pearl Beach Resort & Spa, Cox’s Bazar
• The Westin Dhaka (5-star hotel), Dhaka
• Sugar Boulangerie & Pâtisserie, Cox’s Bazar

My expertise includes preparing a wide range of classic and signature cocktails with speed and consistency, flair bartending, and premium barista service featuring specialty coffee and latte art. In addition, I maintain rigorous bar hygiene standards, cellar stock control, and warm, professional guest engagement in English.

I am currently residing and working legally in Cyprus, holding full flexibility and immediate availability. For your review, I have attached my updated CV and portfolio documentation. You may also view my work videos and credentials via:
Google Drive Portfolio: https://drive.google.com/drive/folders/1xVPTeJLJjcyigLGltGfwQlWDw_F3GDVN

Thank you for your time and consideration. I would welcome the opportunity to discuss how my dedication and skills will contribute to your team.

Best regards,
Fazle Rabbi Boyati`;

export const NEW_MASTER_COVER_LETTER_BARTENDER_BARISTA = `Fazle Rabbi Boyati
Limassol Marina, Cyprus
+357 9550 2363 | fazle.rabbe.doc@gmail.com
LinkedIn: https://www.linkedin.com/in/fazle-rabbi-5785aa269

Dear Hiring Manager,

I am writing to apply for the Bartender/Barista position at your establishment. With over five years of experience in high-volume bars, beach resorts and five-star hotels across Cyprus and Bangladesh, I am confident I can deliver consistent, high-quality service to your guests.

I am currently working as a Senior Bartender at Gazebo Mare / Epsilon / Delta Restro Bar in Limassol Marina. My previous experience includes:

- Flamingo Paradise Beach Hotel, Protaras, Cyprus
- O'Neill's Irish Pub and Restaurant, Paphos, Cyprus
- Sea Pearl Beach Resort & Spa, Cox's Bazar
- The Westin Dhaka (Marriott), Dhaka
- Sugar Boulangerie & Pâtisserie, Cox's Bazar

I prepare classic and signature cocktails with precision and speed, and I craft specialty coffee with professional latte art. I am also skilled in stock control, POS and cash handling, bar hygiene and responsible alcohol service, and I communicate confidently in English with guests and teams.

I am eligible to work in Cyprus and available to start immediately. I am happy to attend an interview by phone, WhatsApp or video call at your convenience.

I have attached my CV and photographs. My work videos and documents are available here:

Google Drive Portfolio: https://drive.google.com/drive/folders/1xVPTeJLJjcyigLGltGfwQlWDw_F3GDVN

Thank you for your time and consideration. I would welcome the chance to discuss how I can contribute to your team.

Best regards,
Fazle Rabbi Boyati`;

export const INITIAL_CENTRAL_PROFILE: CentralUserProfile = {
  fullName: 'Fazle Rabbi Boyati',
  email: 'fazle.rabbe.doc@gmail.com',
  phone: '+357 9550 2363',
  location: 'Limassol Marina, Cyprus',
  residenceStatus: 'Residing & working legally in Cyprus (Immediate Availability)',
  portfolioUrl: 'https://drive.google.com/drive/folders/1xVPTeJLJjcyigLGltGfwQlWDw_F3GDVN',
  linkedinUrl: 'https://www.linkedin.com/in/fazle-rabbi-5785aa269',
  yearsOfExperience: 6,
  primaryRoles: ['Bartender', 'Senior Mixologist', 'Head Barista', 'Beverage Specialist'],
  keySpecializations: [
    'Classic & Signature Cocktail Crafting',
    'Specialty Coffee & Latte Art',
    'Bar & Cellar Stock Management',
    'Luxury 5-Star Hotel Guest Relations',
    'Bar Hygiene & Food Safety (HACCP)',
  ],
  languages: ['English (Fluent)', 'Greek (Basic / Hospitality)', 'Bengali (Native)'],

  masterCoverLetter: NEW_MASTER_COVER_LETTER_BARTENDER_BARISTA,
  defaultEmailSubject: 'Application for Bartender/Barista Position – Fazle Rabbi Boyati',

  emailTemplates: [
    {
      id: 'tpl-bartender-barista-master',
      title: 'Bartender & Barista — Master Cover Letter',
      subject: 'Application for Bartender/Barista Position – Fazle Rabbi Boyati',
      content: NEW_MASTER_COVER_LETTER_BARTENDER_BARISTA,
    },
    {
      id: 'tpl-luxury-hotel',
      title: 'Luxury 5-Star Hotel & Resort',
      subject: 'Application for Bartender & Mixologist Position – Fazle Rabbi Boyati',
      content: DEFAULT_MASTER_COVER_LETTER,
    },
    {
      id: 'tpl-high-volume',
      title: 'High-Volume Cocktail Bar & Lounge',
      subject: 'Experienced Bartender Application – Fazle Rabbi Boyati',
      content: `Fazle Rabbi Boyati
Limassol Marina, Cyprus | +357 9550 2363 | fazle.rabbe.doc@gmail.com

Dear Hiring Team,

I am writing to express my interest in the Bartender position at your venue. Having worked in high-volume bars and luxury resort operations in Cyprus including Flamingo Paradise and O'Neill's Irish Pub, I thrive in fast-paced service environments while maintaining drink quality, speed, and great guest energy.

My core strengths include rapid classic and signature cocktail service, bar prep, stock rotation, and team collaboration. I am residing in Cyprus, immediately available, and have attached my full CV and portfolio.

Best regards,
Fazle Rabbi Boyati`,
    },
    {
      id: 'tpl-barista-cafe',
      title: 'Specialty Coffee & Barista Specialist',
      subject: 'Head Barista Position Application – Fazle Rabbi Boyati',
      content: `Fazle Rabbi Boyati
Limassol Marina, Cyprus | +357 9550 2363 | fazle.rabbe.doc@gmail.com

Dear Hiring Manager,

I am pleased to submit my application for the Barista position at your establishment. With dedicated coffee-making expertise and artisan bakery experience at Sugar Boulangerie, I specialize in manual espresso extraction, milk texturing, free-pour latte art, and maintaining clean, calibrated brewing equipment.

Please find my complete CV attached for your review. I look forward to speaking with you regarding this opportunity.

Warm regards,
Fazle Rabbi Boyati`,
    },
  ],

  targetMarkets: ['cyprus', 'europe'],
  targetEuropeanCountries: ['United Kingdom', 'Malta', 'Greece', 'Spain', 'Italy', 'Germany', 'Switzerland'],
  targetCyprusCities: ['Limassol', 'Paphos', 'Ayia Napa', 'Protaras', 'Larnaca', 'Nicosia'],

  requiresVisaSponsorship: false, // Currently in Cyprus legally, but available for European sponsorship
  requiresAccommodation: false,
  requiresRelocationSupport: false,

  sendingHistory: [],
  savedRecipients: [],

  lastSavedAt: new Date().toISOString(),
  version: 2,
};

const STORAGE_KEY_CENTRAL_PROFILE = 'ccd_central_profile_v2';

/**
 * Normalizes an email for Firestore doc ID
 */
function toEmailDocId(email: string): string {
  return email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
}

/**
 * Load Central Profile from local storage with automatic fallback
 */
export function loadCentralProfile(): CentralUserProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CENTRAL_PROFILE);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...INITIAL_CENTRAL_PROFILE,
        ...parsed,
        email: parsed.email || getCachedUserEmail() || INITIAL_CENTRAL_PROFILE.email,
        fullName: parsed.fullName || getCachedUserName() || INITIAL_CENTRAL_PROFILE.fullName,
      };
    }
  } catch (err) {
    console.warn('Failed to load local central profile:', err);
  }
  return { ...INITIAL_CENTRAL_PROFILE };
}

/**
 * Save Central Profile locally and trigger non-blocking cloud persistence
 */
export function saveCentralProfile(profile: CentralUserProfile): void {
  const updated: CentralUserProfile = {
    ...profile,
    lastSavedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(STORAGE_KEY_CENTRAL_PROFILE, JSON.stringify(updated));
    // Also sync the master cover letter to legacy draft key to ensure backward compatibility
    localStorage.setItem(
      'cv_email_saved_draft_v1',
      JSON.stringify({
        subject: updated.defaultEmailSubject,
        coverLetter: updated.masterCoverLetter,
        selectedCvId: 'cv-bartender-primary',
      })
    );
  } catch (err) {
    console.error('Failed to save central profile locally:', err);
  }

  // Asynchronous cloud push to Firestore
  pushCentralProfileToCloud(updated).catch(err => {
    console.warn('Background cloud profile sync deferred:', err);
  });
}

/**
 * Push Central Profile to Firestore under user's UID and email account
 */
export async function pushCentralProfileToCloud(profile: CentralUserProfile): Promise<void> {
  const currentUser = auth.currentUser;
  const targetEmail = currentUser?.email || profile.email || 'fazle.rabbe.doc@gmail.com';

  const docPayload = {
    ...profile,
    updatedAt: new Date().toISOString(),
  };

  // 1. Sync under users/{uid}/profile/central and workspace/main if signed in
  if (currentUser?.uid) {
    try {
      const userDocRef = doc(db, 'users', currentUser.uid, 'profile', 'central_profile');
      await setDoc(userDocRef, docPayload, { merge: true });

      const workspaceRef = doc(db, 'users', currentUser.uid, 'workspace', 'main');
      await setDoc(workspaceRef, {
        profile: JSON.stringify(docPayload),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (e) {
      console.warn('Could not sync central profile to users UID:', e);
    }
  }

  // 2. Also sync under cv_accounts/{emailDocId} so reconnecting Gmail immediately restores all data
  if (targetEmail) {
    try {
      const emailDocId = toEmailDocId(targetEmail);
      const accountDocRef = doc(db, 'cv_accounts', emailDocId);
      await setDoc(accountDocRef, { centralProfile: docPayload, email: targetEmail }, { merge: true });
    } catch (e) {
      console.warn('Could not sync central profile to cv_accounts:', e);
    }
  }
}

/**
 * Sync and load profile from Firestore on account login or Gmail reconnect
 */
export async function syncCloudCentralProfile(
  userId?: string,
  userEmail?: string
): Promise<CentralUserProfile> {
  const email = userEmail || auth.currentUser?.email || loadCentralProfile().email || 'fazle.rabbe.doc@gmail.com';
  const uid = userId || auth.currentUser?.uid;

  let cloudProfile: CentralUserProfile | null = null;

  // 1. Try reading from users/{uid}/profile/central_profile
  if (uid) {
    try {
      const snap = await getDoc(doc(db, 'users', uid, 'profile', 'central_profile'));
      if (snap.exists()) {
        cloudProfile = snap.data() as CentralUserProfile;
      }
    } catch (e) {
      console.warn('Could not read central profile from users UID:', e);
    }
  }

  // 2. If not found, try reading from cv_accounts/{emailDocId} (including fallback to legacy fazlerabbe905_gmail_com)
  if (!cloudProfile && email) {
    const candidateDocIds = Array.from(
      new Set([
        toEmailDocId(email),
        'fazle_rabbe_doc_gmail_com',
        'fazlerabbe905_gmail_com',
      ])
    );
    for (const emailDocId of candidateDocIds) {
      try {
        const snap = await getDoc(doc(db, 'cv_accounts', emailDocId));
        if (snap.exists() && snap.data()?.centralProfile) {
          cloudProfile = snap.data()?.centralProfile as CentralUserProfile;
          break;
        }
      } catch (e) {
        console.warn('Could not read central profile from cv_accounts:', e);
      }
    }
  }

  const local = loadCentralProfile();

  if (cloudProfile) {
    // Intelligent non-destructive merge:
    // If local has newer sending history or personalized templates, keep them merged!
    const rawMergedHistory = [...(local.sendingHistory || [])];
    if (Array.isArray(cloudProfile.sendingHistory)) {
      for (const item of cloudProfile.sendingHistory) {
        if (item && !rawMergedHistory.some(h => h.id === item.id)) {
          rawMergedHistory.push(item);
        }
      }
    }
    const seenHistoryIds = new Set<string>();
    const mergedHistory = rawMergedHistory.filter(h => {
      if (!h || !h.id) return false;
      if (seenHistoryIds.has(h.id)) return false;
      seenHistoryIds.add(h.id);
      return true;
    });

    const merged: CentralUserProfile = {
      ...INITIAL_CENTRAL_PROFILE,
      ...cloudProfile,
      ...local,
      // Prefer existing master cover letter if user wrote one
      masterCoverLetter: local.masterCoverLetter || cloudProfile.masterCoverLetter || DEFAULT_MASTER_COVER_LETTER,
      sendingHistory: mergedHistory,
      email: email || local.email,
    };

    localStorage.setItem(STORAGE_KEY_CENTRAL_PROFILE, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent('central_profile_cloud_updated', { detail: merged }));
    return merged;
  }

  // If cloud had no profile, upload current local profile to cloud for safe keeping
  await pushCentralProfileToCloud(local);
  return local;
}
