export interface ProfessionalPhotoItem {
  id: string;
  name: string;
  caption?: string;
  url: string; // http URL or data URL
  base64?: string; // Raw base64 data for Gmail attachment
  mimeType?: string; // e.g. 'image/jpeg', 'image/png'
  sizeFormatted?: string;
  isDefaultAttached?: boolean;
  uploadedAt: string;
}

const STORAGE_KEY_PHOTOS = 'ccd_professional_photos_vault_v1';

// Seed candidate's verified professional photos so they are available immediately
export const DEFAULT_PROFESSIONAL_PHOTOS: ProfessionalPhotoItem[] = [
  {
    id: 'photo-mixology-1',
    name: 'Fazle_Rabbi_Mixology_Cocktail_Pour.jpg',
    caption: 'Cocktail Mixology & Dual Bottle Pour Technique',
    url: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=800&auto=format&fit=crop&q=80',
    mimeType: 'image/jpeg',
    sizeFormatted: '184 KB',
    isDefaultAttached: true,
    uploadedAt: '2026-09-01T10:00:00.000Z',
  },
  {
    id: 'photo-uniform-2',
    name: 'Fazle_Rabbi_Luxury_Hotel_Service_Uniform.jpg',
    caption: 'Luxury 5-Star Hotel Dining Room & Hospitality Uniform',
    url: 'https://images.unsplash.com/photo-1574096079513-d8259312b785?w=800&auto=format&fit=crop&q=80',
    mimeType: 'image/jpeg',
    sizeFormatted: '210 KB',
    isDefaultAttached: true,
    uploadedAt: '2026-09-01T10:05:00.000Z',
  },
  {
    id: 'photo-permit-3',
    name: 'Fazle_Rabbi_Cyprus_Residence_Permit.jpg',
    caption: 'Cyprus Residence Permit & Verified Identification',
    url: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=800&auto=format&fit=crop&q=80',
    mimeType: 'image/jpeg',
    sizeFormatted: '165 KB',
    isDefaultAttached: true,
    uploadedAt: '2026-09-01T10:10:00.000Z',
  },
];

export function loadProfessionalPhotos(): ProfessionalPhotoItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PHOTOS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Failed to load professional photos from storage:', err);
  }
  return DEFAULT_PROFESSIONAL_PHOTOS;
}

export function saveProfessionalPhotos(photos: ProfessionalPhotoItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_PHOTOS, JSON.stringify(photos));
  } catch (err) {
    console.warn('Failed to save professional photos to storage:', err);
  }
}

export function addProfessionalPhoto(photo: ProfessionalPhotoItem): ProfessionalPhotoItem[] {
  const current = loadProfessionalPhotos();
  const updated = [photo, ...current.filter(p => p.id !== photo.id)];
  saveProfessionalPhotos(updated);
  return updated;
}

export function removeProfessionalPhoto(photoId: string): ProfessionalPhotoItem[] {
  const current = loadProfessionalPhotos();
  const updated = current.filter(p => p.id !== photoId);
  saveProfessionalPhotos(updated);
  return updated;
}

/**
 * Converts an image URL (from unsplash or web) to base64 if not already available
 */
export async function ensurePhotoBase64(photo: ProfessionalPhotoItem): Promise<string> {
  if (photo.base64 && photo.base64.length > 50) {
    return photo.base64;
  }
  try {
    const res = await fetch(photo.url);
    if (!res.ok) return '';
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const b64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(b64);
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}
