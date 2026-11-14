export type EmploymentType =
  | 'Full-time'
  | 'Part-time'
  | 'Seasonal'
  | 'Internship'
  | 'Contract';

export interface WorkExperience {
  id: string;
  companyName: string;
  position: string;
  employmentType?: EmploymentType | string;
  startDate: string;
  endDate: string;
  location: string;
  responsibilities: string[];
}

export interface PersonalInfoItem {
  id: string;
  label: string;
  value: string;
}

export interface TrainingItem {
  id: string;
  text: string;
}

export interface AcademicItem {
  id: string;
  degree: string;
  institution: string;
  year: string;
}

export interface LanguageItem {
  id: string;
  language: string;
  proficiency: string;
}

export interface AdditionalPhoto {
  id: string;
  url: string;
  caption?: string;
  included: boolean;
}

export type CVDesignTemplateId =
  | 'classic-hospitality'
  | 'budapest'
  | 'riga'
  | 'rotterdam'
  | 'perth'
  | 'sydney'
  | 'chicago'
  | 'crisp'
  | 'coral'
  | 'modern-writer'
  | 'prague'
  | 'vienna'
  | 'berlin'
  | 'madrid'
  | 'london'
  | 'boston'
  | 'geneva'
  | 'oslo'
  | 'helsinki'
  | 'dubai'
  | 'simple-and-clear';

export interface CVData {
  // Visual Design Template Selection (decoupled from CV content)
  designTemplateId?: CVDesignTemplateId;
  templateAccentColor?: string;
  showProfilePhoto?: boolean;
  header?: {
    fullName?: string;
    professionalTitle?: string;
  };

  // Header / Personal
  fullName: string;
  professionalTitle: string;
  photoUrl: string;
  location: string;
  email: string;
  phone: string;
  linkedIn: string;
  website?: string;

  // Additional Supporting Photos (up to 3, as in original CV PDF pages 2, 3, 4)
  additionalPhotos?: AdditionalPhoto[];
  showAdditionalPhotosPage?: boolean;

  // Sidebar Sections
  aboutMe: {
    enabled: boolean;
    title: string;
    content: string;
  };

  personalInfo: {
    enabled: boolean;
    title: string;
    items: PersonalInfoItem[];
  };

  trainingSummary: {
    enabled: boolean;
    title: string;
    items: TrainingItem[];
  };

  academicQualifications: {
    enabled: boolean;
    title: string;
    items: AcademicItem[];
  };

  languages: {
    enabled: boolean;
    title: string;
    items: LanguageItem[];
  };

  // Main Section
  workExperienceTitle: string;
  jobResponsibilitiesTitle: string;
  experiences: WorkExperience[];
  partTimeExperiences?: WorkExperience[];
  skills?: {
    enabled: boolean;
    title: string;
    items: any[];
  };
  profileSummary?: string;
  highlightedSkills?: string[];
  educations?: any[];
  experienceSortOrder: 'newest-first' | 'oldest-first';
}

export interface CVUserAccount {
  name: string;
  email: string;
  passcode: string;
  phoneNumber: string;
  developerCode: string;
  registeredAt: string;
  lastLoginAt: string;
}

export interface CVOriginalFileMetadata {
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  base64?: string;
  uploadedAt?: string;
}

export interface CVDocumentItem {
  id: string;
  title: string;
  name?: string;
  roleSubtitle: string;
  createdAt: string;
  updatedAt: string;
  data: CVData;
  designTemplateId?: CVDesignTemplateId;
  templateAccentColor?: string;
  thumbnailColor?: string;
  isPinned?: boolean;
  isUploadedFile?: boolean;
  originalFile?: CVOriginalFileMetadata;
  // Uploaded Document File Storage (PDF / DOCX from mobile phone / device)
  fileType?: 'pdf' | 'docx' | 'doc' | 'structured';
  fileName?: string;
  fileSize?: number;
  fileSizeBytesFormatted?: string;
  fileBase64?: string; // Raw base64 data for Gmail attachment
  fileDataUri?: string; // data:application/...;base64,... for preview iframe / download
  fileMimeType?: string;
  uploadedAt?: string;
  storageSource?: 'phone_upload' | 'local' | 'firestore';
}

export type CVTemplateType = 'bartender' | 'barista' | 'hotel' | 'blank';


