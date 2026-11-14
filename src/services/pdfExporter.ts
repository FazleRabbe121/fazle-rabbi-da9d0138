import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { toPng } from 'html-to-image';

/**
 * Renders a single CV page DOM element into an image data URL (PNG/JPEG)
 * Uses html2canvas-pro with full support for modern CSS color spaces (oklab, oklch),
 * with an automatic fallback to html-to-image (browser SVG foreignObject).
 */
async function renderPageToImage(pageEl: HTMLElement, containerId: string): Promise<string> {
  try {
    const canvas = await html2canvas(pageEl, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 1200,
      onclone: (clonedDoc) => {
        // Reset scale transform on container in the clone to capture at exact A4 1:1 pixel fidelity
        const clonedContainer = clonedDoc.getElementById(containerId);
        if (clonedContainer) {
          clonedContainer.style.transform = 'none';
        }
      },
    });

    return canvas.toDataURL('image/jpeg', 0.95);
  } catch (primaryErr) {
    console.warn('html2canvas-pro capture encounter, trying native browser renderer:', primaryErr);
    // Fallback: html-to-image renders using native browser engine, completely bypassing manual CSS color parsing
    return await toPng(pageEl, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      cacheBust: true,
    });
  }
}

export async function exportCVToPDF(
  containerId: string = 'cv-print-area',
  filename: string = 'Fazle_Rabbi_CV.pdf'
): Promise<void> {
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error('CV preview container not found.');
  }

  // Find all .cv-page elements inside the container
  const pageElements = container.querySelectorAll<HTMLElement>('.cv-page');
  if (pageElements.length === 0) {
    throw new Error('No CV page elements found.');
  }

  // A4 dimensions in mm: 210 x 297
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  for (let i = 0; i < pageElements.length; i++) {
    const pageEl = pageElements[i];

    // Render page element to high-res image
    const imgData = await renderPageToImage(pageEl, containerId);

    if (i > 0) {
      pdf.addPage('a4', 'portrait');
    }

    const format = imgData.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    pdf.addImage(imgData, format, 0, 0, 210, 297);
  }

  pdf.save(filename);
}

/**
 * Generates a complete, professional vector PDF Base64 string directly in memory
 * without requiring any DOM container elements. Guarantees that CV attachments are NEVER omitted.
 */
export function stripBase64Prefix(b64: string): string {
  if (!b64) return '';
  const trimmed = b64.trim();
  if (trimmed.includes(',')) {
    return trimmed.split(',')[1].trim();
  }
  return trimmed;
}

export function isValidPdfBase64(b64?: string | null): boolean {
  if (!b64 || typeof b64 !== 'string') return false;
  const clean = stripBase64Prefix(b64).replace(/\s+/g, '');
  if (clean.length < 100) return false;
  // Base64 of "%PDF-" starts with "JVBERi"
  if (clean.startsWith('JVBERi')) return true;
  try {
    const head = atob(clean.slice(0, 120));
    return head.includes('%PDF-');
  } catch {
    return false;
  }
}

export function generateDirectCVPdfBase64(cvInput?: any, fallbackTitle?: string): string {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  // Unwrap CVDocumentItem ({ data: CVData }) or direct CVData
  const rawData = cvInput?.data || cvInput || {};
  const personal = rawData?.personalDetails || rawData?.personalInfo || {};

  const primaryName =
    rawData?.fullName ||
    personal.fullName ||
    personal.name ||
    cvInput?.personalDetails?.fullName ||
    'Fazle Rabbi Boyati';
  const roleTitle =
    rawData?.professionalTitle ||
    personal.professionalTitle ||
    personal.title ||
    cvInput?.roleSubtitle ||
    fallbackTitle ||
    cvInput?.title ||
    'Bartender, Mixologist & Barista';
  const email = rawData?.email || personal.email || 'fazle.rabbe.doc@gmail.com';
  const phone = rawData?.phone || personal.phone || '+357 9550 2363';
  const location = rawData?.location || personal.location || 'Limassol Marina, Cyprus';
  const citizenship = rawData?.citizenship || personal.citizenship || '';
  const linkedin = rawData?.linkedin || personal.linkedin || 'linkedin.com/in/fazle-rabbi-5785aa269';
  const driveLink =
    rawData?.website ||
    'https://drive.google.com/drive/folders/1xVPTeJLJjcyigLGltGfwQlWDw_F3GDVN';

  // Margins
  const marginX = 18;
  let cursorY = 19;

  // Header Background accent band
  pdf.setFillColor(24, 33, 53); // Deep slate / navy
  pdf.rect(0, 0, 210, 42, 'F');

  // Candidate Name
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.setTextColor(255, 255, 255);
  pdf.text(String(primaryName), marginX, cursorY);
  cursorY += 6.5;

  // Role subtitle
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10.5);
  pdf.setTextColor(218, 165, 32); // Gold accent
  pdf.text(String(roleTitle).toUpperCase(), marginX, cursorY);
  cursorY += 5.5;

  // Contact line 1
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(220, 225, 235);
  const contactParts = [location, phone, email, citizenship ? `Nationality: ${citizenship}` : ''].filter(Boolean);
  pdf.text(contactParts.join('  |  '), marginX, cursorY);
  cursorY += 4.5;

  // Contact line 2 (LinkedIn & Portfolio)
  const linkParts = [
    linkedin ? `LinkedIn: ${linkedin.replace(/^https?:\/\/(www\.)?/, '')}` : '',
    'Portfolio: drive.google.com/drive/folders/1xVPTeJLJjcyigLGltGfwQlWDw_F3GDVN',
  ].filter(Boolean);
  pdf.setFontSize(7.8);
  pdf.setTextColor(190, 205, 230);
  pdf.text(linkParts.join('  |  '), marginX, cursorY);

  cursorY = 49;

  // Helper section renderer
  const drawSectionHeader = (title: string) => {
    if (cursorY > 268) {
      pdf.addPage('a4', 'portrait');
      cursorY = 20;
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10.5);
    pdf.setTextColor(18, 24, 38);
    pdf.text(title.toUpperCase(), marginX, cursorY);
    cursorY += 1.8;
    pdf.setDrawColor(218, 165, 32);
    pdf.setLineWidth(0.5);
    pdf.line(marginX, cursorY, marginX + 174, cursorY);
    cursorY += 5.2;
  };

  // Executive Summary
  drawSectionHeader('Executive Profile');
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.0);
  pdf.setTextColor(50, 55, 65);
  const rawAboutContent = rawData?.aboutMe?.content || rawData?.profileSummary || rawData?.summary || '';
  const isUploadedPlaceholderSummary = rawAboutContent.startsWith('Uploaded native CV document:');
  const summaryText =
    !isUploadedPlaceholderSummary && rawAboutContent.trim().length > 25
      ? rawAboutContent.trim()
      : 'Dedicated and passionate Bartender & Barista with over 5 years of experience in luxury 5-star hotel chains, high-volume beach bars, and vibrant restaurant lounges in Cyprus. Proven ability to craft creative signature and classic cocktails, prepare specialty coffee with precision latte art, and maintain impeccable bar hygiene (HACCP) and inventory control.';
  const summaryLines = pdf.splitTextToSize(String(summaryText), 174);
  pdf.text(summaryLines, marginX, cursorY);
  cursorY += summaryLines.length * 4.2 + 3.5;

  // Work Experience
  drawSectionHeader('Work Experience');
  const defaultCompleteExperiences = [
    {
      position: 'Bartender & Barista',
      companyName: 'Captains Restro Bar / Sugar Boulangerie & Patisserie',
      location: 'Limassol, Cyprus',
      startDate: 'Nov 2024',
      endDate: 'Present',
      bullets: [
        'Operate high-volume bar and specialty coffee station serving international guests at Limassol Marina.',
        'Craft classic and signature cocktails, commercial espresso beverages, and cold brews with precision latte art.',
        'Manage daily bar opening/closing checklists, stock rotation, garnish preparation, and strict HACCP sanitation.',
      ],
    },
    {
      position: 'Bartender',
      companyName: 'Nissi Beach Resort',
      location: 'Ayia Napa, Cyprus',
      startDate: 'Mar 2024',
      endDate: 'Oct 2024',
      bullets: [
        'Delivered high-speed cocktail and beverage service across busy beachfront and pool bar outlets.',
        'Prepared tropical cocktails, mocktails, and draft beverages for up to 500+ international resort guests daily.',
        'Handled POS billing, cash/card reconciliation, and requisitioning of spirits, wines, and mixers.',
      ],
    },
    {
      position: 'Bartender & Beverage Attendant',
      companyName: 'Atlantica Hotels & Resorts (Mare Village / Bay Hotel)',
      location: 'Ayia Napa & Limassol, Cyprus',
      startDate: 'Apr 2022',
      endDate: 'Nov 2023',
      bullets: [
        'Provided 5-star beverage hospitality across lobby bar, lounge bar, and fine-dining restaurant outlets.',
        'Maintained consistent drink presentation, glassware polishing, cellar organization, and guest upselling.',
      ],
    },
    {
      position: 'Hospitality & Bar Associate',
      companyName: 'Kanika Hotels & Resorts / Adams Beach Hotel',
      location: 'Cyprus',
      startDate: '2020',
      endDate: '2022',
      bullets: [
        'Supported senior mixologists with bar mise-en-place, fresh syrups, infusions, and table/counter service.',
        'Upheld food safety and hygiene regulations while assisting multi-national hotel bar teams.',
      ],
    },
  ];

  const rawExperiences =
    Array.isArray(rawData?.workExperience) && rawData.workExperience.length > 0
      ? rawData.workExperience
      : Array.isArray(rawData?.experiences) && rawData.experiences.length > 0
      ? rawData.experiences
      : defaultCompleteExperiences;

  for (const exp of rawExperiences) {
    if (cursorY > 262) {
      pdf.addPage('a4', 'portrait');
      cursorY = 20;
    }
    const roleLabel = exp.jobTitle || exp.position || exp.role || 'Bartender & Barista';
    const companyLabel = exp.companyName || exp.company || '';
    const locLabel = exp.location || '';
    const dateLabel = exp.dates || [exp.startDate, exp.endDate].filter(Boolean).join(' – ');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.4);
    pdf.setTextColor(20, 25, 35);
    const titleLine = companyLabel ? `${roleLabel}  —  ${companyLabel}` : String(roleLabel);
    pdf.text(titleLine, marginX, cursorY);

    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8.3);
    pdf.setTextColor(100, 110, 125);
    const locDate = [locLabel, dateLabel ? `(${dateLabel})` : ''].filter(Boolean).join('  ');
    if (locDate) {
      pdf.text(locDate, Math.max(marginX + 95, 210 - marginX - pdf.getTextWidth(locDate)), cursorY);
    }
    cursorY += 4.2;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.4);
    pdf.setTextColor(55, 60, 70);
    const bullets = Array.isArray(exp.responsibilities)
      ? exp.responsibilities
      : Array.isArray(exp.bullets)
      ? exp.bullets
      : exp.description
      ? [String(exp.description)]
      : [];
    for (const bullet of bullets) {
      if (cursorY > 278) {
        pdf.addPage('a4', 'portrait');
        cursorY = 20;
      }
      const bText = `•  ${bullet}`;
      const bLines = pdf.splitTextToSize(bText, 170);
      pdf.text(bLines, marginX + 2, cursorY);
      cursorY += bLines.length * 3.9;
    }
    cursorY += 2.2;
  }

  // Skills & Core Competencies
  if (cursorY > 245) {
    pdf.addPage('a4', 'portrait');
    cursorY = 20;
  }
  cursorY += 1.5;
  drawSectionHeader('Key Competencies & Skills');

  let skillsList: string[] = [];
  if (Array.isArray(rawData?.skillCategories) && rawData.skillCategories.length > 0) {
    for (const cat of rawData.skillCategories) {
      if (cat && cat.name && Array.isArray(cat.skills) && cat.skills.length > 0) {
        skillsList.push(`${cat.name}: ${cat.skills.join(', ')}`);
      }
    }
  } else if (Array.isArray(rawData?.coreSkills) && rawData.coreSkills.length > 0) {
    for (const item of rawData.coreSkills) {
      if (typeof item === 'string') {
        skillsList.push(item);
      } else if (item && typeof item === 'object') {
        if (item.category && item.items) {
          skillsList.push(`${item.category}: ${item.items}`);
        } else if (item.items) {
          skillsList.push(String(item.items));
        }
      }
    }
  }
  if (skillsList.length === 0) {
    skillsList = [
      'Mixology & Bar Craft: Classic & Signature Cocktails, Speed Pouring, Flair & Garnish Artistry, Spirit & Wine Knowledge',
      'Barista & Coffee Mastery: Commercial Espresso Calibration, Milk Texturing & Latte Art, Cold Brew & Specialty Teas',
      'Operations & Standards: High-Volume Resort Bar Service, POS & Cash Reconciliation, Inventory Control, HACCP Hygiene',
    ];
  }

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.4);
  pdf.setTextColor(40, 45, 55);
  for (const skillEntry of skillsList) {
    if (cursorY > 278) {
      pdf.addPage('a4', 'portrait');
      cursorY = 20;
    }
    const sLines = pdf.splitTextToSize(`•  ${skillEntry}`, 170);
    pdf.text(sLines, marginX + 2, cursorY);
    cursorY += sLines.length * 4.0;
  }

  // Education & Certifications
  const educationList =
    Array.isArray(rawData?.educations) && rawData.educations.length > 0
      ? rawData.educations
      : Array.isArray(rawData?.education) && rawData.education.length > 0
      ? rawData.education
      : [
          {
            degree: 'Higher Secondary Certificate & Hospitality Studies',
            institution: 'College of Tourism & Hotel Management',
            location: 'Cyprus / Bangladesh',
            startDate: '2016',
            endDate: '2019',
          },
        ];
  const certList = Array.isArray(rawData?.certifications) ? rawData.certifications : [];
  if (educationList.length > 0 || certList.length > 0) {
    cursorY += 2;
    drawSectionHeader('Education & Certifications');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.4);
    pdf.setTextColor(45, 50, 60);

    for (const edu of educationList) {
      if (cursorY > 278) {
        pdf.addPage('a4', 'portrait');
        cursorY = 20;
      }
      const eduDates = edu.graduationDate || [edu.startDate, edu.endDate].filter(Boolean).join(' – ');
      const line = `${edu.degree || ''} — ${edu.institution || ''}${edu.location ? `, ${edu.location}` : ''}${eduDates ? ` (${eduDates})` : ''}`;
      const eLines = pdf.splitTextToSize(`•  ${line}`, 170);
      pdf.text(eLines, marginX + 2, cursorY);
      cursorY += eLines.length * 4.0;
    }

    for (const cert of certList) {
      if (cursorY > 278) {
        pdf.addPage('a4', 'portrait');
        cursorY = 20;
      }
      const cText = typeof cert === 'string' ? cert : `${cert.name || ''} ${cert.issuer ? `— ${cert.issuer}` : ''}`;
      const cLines = pdf.splitTextToSize(`•  ${cText}`, 170);
      pdf.text(cLines, marginX + 2, cursorY);
      cursorY += cLines.length * 4.0;
    }
  }

  // Languages
  const languagesList =
    Array.isArray(rawData?.languages) && rawData.languages.length > 0
      ? rawData.languages
      : [
          { name: 'English', proficiency: 'Fluent / Professional Working' },
          { name: 'Bengali', proficiency: 'Native' },
          { name: 'Hindi / Urdu', proficiency: 'Conversational' },
          { name: 'Greek', proficiency: 'Basic Hospitality' },
        ];
  if (languagesList.length > 0) {
    cursorY += 2;
    drawSectionHeader('Languages');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.4);
    pdf.setTextColor(45, 50, 60);
    const langStr = languagesList
      .map((l: any) => (typeof l === 'string' ? l : `${l.name || l.language || ''} (${l.proficiency || ''})`))
      .join('   |   ');
    const lLines = pdf.splitTextToSize(langStr, 170);
    pdf.text(lLines, marginX + 2, cursorY);
    cursorY += lLines.length * 4.2;
  }

  // Portfolio Links Footer
  cursorY += 2.5;
  drawSectionHeader('Verified Portfolio & Relocation Readiness');
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.4);
  pdf.setTextColor(30, 80, 180);
  pdf.text(`Digital Cocktail & Barista Portfolio: ${driveLink}`, marginX, cursorY);
  cursorY += 4.2;
  pdf.setTextColor(80, 85, 95);
  const availNote =
    rawData?.additionalInfo ||
    'Valid passport holder ready for immediate employer-sponsored work permit processing and international relocation.';
  const availLines = pdf.splitTextToSize(String(availNote), 174);
  pdf.text(availLines, marginX, cursorY);

  const dataUri = pdf.output('datauristring');
  return stripBase64Prefix(dataUri);
}

export function generateCoverLetterPdfBase64(params: {
  candidateName?: string;
  candidateTitle?: string;
  candidateEmail?: string;
  candidatePhone?: string;
  candidateLocation?: string;
  employer?: string;
  company?: string;
  jobTitle?: string;
  position?: string;
  country?: string;
  coverLetterText: string;
}): string {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const name = params.candidateName || 'Fazle Rabbi Boyati';
  const title = params.candidateTitle || 'Hospitality & Operations Professional';
  const email = params.candidateEmail || 'fazle.rabbe.doc@gmail.com';
  const phone = params.candidatePhone || '+357 9550 2363';
  const location = params.candidateLocation || 'Cyprus';
  const employerName = params.employer || params.company || 'Hiring Team';
  const roleName = params.jobTitle || params.position || 'Professional Position';

  const marginX = 20;
  let cursorY = 22;

  // Header band
  pdf.setFillColor(24, 33, 53);
  pdf.rect(0, 0, 210, 36, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(19);
  pdf.setTextColor(255, 255, 255);
  pdf.text(name, marginX, cursorY);
  cursorY += 6.5;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(218, 165, 32);
  pdf.text(`APPLICATION COVER LETTER  —  ${roleName.toUpperCase()}`, marginX, cursorY);
  cursorY += 5.5;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(220, 225, 235);
  pdf.text(`${location}  |  ${phone}  |  ${email}  |  ${title}`, marginX, cursorY);

  cursorY = 48;

  // Date & Recipient Header
  const todayStr = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.setTextColor(80, 85, 95);
  pdf.text(`Date: ${todayStr}`, marginX, cursorY);
  cursorY += 6;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10.5);
  pdf.setTextColor(20, 25, 35);
  pdf.text(`To: Hiring & Recruitment Team — ${employerName}`, marginX, cursorY);
  cursorY += 5;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.8);
  pdf.setTextColor(35, 70, 140);
  pdf.text(
    `Subject: Application for ${roleName}${params.country ? ` (${params.country})` : ''}`,
    marginX,
    cursorY
  );
  cursorY += 3;

  pdf.setDrawColor(218, 165, 32);
  pdf.setLineWidth(0.5);
  pdf.line(marginX, cursorY, marginX + 170, cursorY);
  cursorY += 8;

  // Body paragraphs — deduplicate any leading contact header lines if already present before "Dear "
  let cleanBodyText = (params.coverLetterText || '').replace(/\r\n/g, '\n').trim();
  const dearIdx = cleanBodyText.search(/\bDear\s+/i);
  if (dearIdx > 0 && dearIdx < 420) {
    cleanBodyText = cleanBodyText.slice(dearIdx).trim();
  }

  const paragraphs = cleanBodyText.split('\n');

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      cursorY += 3.2;
      continue;
    }

    const isSalutation = /^Dear\s+/i.test(trimmed);
    const isSignoff = /^(Best regards|Warm regards|Sincerely|Kind regards|Respectfully),?$/i.test(trimmed);
    const isBullet = /^[-•*]\s+/.test(trimmed);

    if (isSalutation || isSignoff) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10.2);
      pdf.setTextColor(20, 25, 35);
    } else {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(35, 40, 50);
    }

    const xOffset = isBullet ? marginX + 4 : marginX;
    const maxWidth = isBullet ? 166 : 170;
    const textToWrap = isBullet ? `•  ${trimmed.replace(/^[-•*]\s+/, '')}` : trimmed;

    const wrapped = pdf.splitTextToSize(textToWrap, maxWidth);
    for (const line of wrapped) {
      if (cursorY > 275) {
        pdf.addPage('a4', 'portrait');
        cursorY = 22;
      }
      pdf.text(line, xOffset, cursorY);
      cursorY += 5;
    }
    cursorY += 1.5;
  }

  const dataUri = pdf.output('datauristring');
  return stripBase64Prefix(dataUri);
}

export async function generateCVPdfBase64(
  containerId: string = 'cv-print-area',
  fallbackCvData?: any
): Promise<string> {
  const container = document.getElementById(containerId);
  if (!container) {
    return generateDirectCVPdfBase64(fallbackCvData);
  }

  const pageElements = container.querySelectorAll<HTMLElement>('.cv-page');
  if (pageElements.length === 0) {
    return generateDirectCVPdfBase64(fallbackCvData);
  }

  try {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    for (let i = 0; i < pageElements.length; i++) {
      const pageEl = pageElements[i];
      const imgData = await renderPageToImage(pageEl, containerId);

      if (i > 0) {
        pdf.addPage('a4', 'portrait');
      }

      const format = imgData.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      pdf.addImage(imgData, format, 0, 0, 210, 297);
    }

    const dataUri = pdf.output('datauristring');
    const base64 = stripBase64Prefix(dataUri);
    return isValidPdfBase64(base64) ? base64 : generateDirectCVPdfBase64(fallbackCvData);
  } catch (err) {
    console.warn('DOM PDF generation error, using direct vector PDF engine:', err);
    return generateDirectCVPdfBase64(fallbackCvData);
  }
}

/**
 * Exports the user's CVData into a rich Word-compatible DOCX/DOC document
 * reflecting the selected Resume-Example template design, column layout, typography, and accent color.
 */
export function exportCVToDOCX(cvData: any, filename: string = 'Fazle_Rabbi_CV.doc'): void {
  const data = cvData?.data || cvData || {};
  const templateId = data.designTemplateId || 'classic-hospitality';
  const accentColor = data.templateAccentColor || '#1e293b';

  const fullName = data.fullName || 'Fazle Rabbi';
  const title = data.professionalTitle || 'Senior Bartender & Barista';
  const location = data.location || '';
  const phone = data.phone || '';
  const email = data.email || '';
  const linkedIn = data.linkedIn || '';
  const summary = data.aboutMe?.enabled ? data.aboutMe?.content || '' : '';
  const experiences = Array.isArray(data.experiences) ? data.experiences : [];
  const partTime = Array.isArray(data.partTimeExperiences) ? data.partTimeExperiences : [];
  const skills: string[] =
    data.skills?.enabled && Array.isArray(data.skills?.items)
      ? data.skills.items.map((s: any) => (typeof s === 'string' ? s : s?.name || String(s)))
      : [];
  const personalItems =
    data.personalInfo?.enabled && Array.isArray(data.personalInfo?.items)
      ? data.personalInfo.items
      : [];
  const educationItems =
    data.academicQualifications?.enabled && Array.isArray(data.academicQualifications?.items)
      ? data.academicQualifications.items
      : [];
  const trainingItems =
    data.trainingSummary?.enabled && Array.isArray(data.trainingSummary?.items)
      ? data.trainingSummary.items
      : [];
  const languageItems =
    data.languages?.enabled && Array.isArray(data.languages?.items)
      ? data.languages.items
      : [];

  const isSingleCol =
    templateId === 'perth' ||
    templateId === 'chicago' ||
    templateId === 'boston' ||
    templateId === 'london' ||
    templateId === 'simple-and-clear';

  const isRightSidebar = templateId === 'sydney' || templateId === 'helsinki';
  const fontFamily =
    templateId === 'chicago' || templateId === 'boston'
      ? 'Georgia, Times New Roman, serif'
      : 'Calibri, Arial, sans-serif';

  const expHtml = experiences
    .map(
      (exp: any) => `
      <div style="margin-bottom: 10pt;">
        <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:10.5pt; color:#0f172a;">
          <span>${exp.position || ''} — ${exp.companyName || ''}</span>
          <span style="color:${accentColor}; font-size:9pt;">${exp.startDate || ''} – ${exp.endDate || 'Present'}</span>
        </div>
        ${exp.location ? `<div style="font-size:8.5pt; color:#475569; margin-bottom:2pt;">${exp.location}</div>` : ''}
        <ul style="margin:2pt 0 0 14pt; padding:0; font-size:9pt; color:#1e293b;">
          ${(exp.responsibilities || []).map((r: string) => `<li style="margin-bottom:2pt;">${r}</li>`).join('')}
        </ul>
      </div>`
    )
    .join('');

  const ptHtml =
    partTime.length > 0
      ? `<h3 style="color:${accentColor}; font-size:11pt; text-transform:uppercase; border-bottom:1px solid ${accentColor}; padding-bottom:2pt; margin-top:12pt;">Part-Time Experience</h3>` +
        partTime
          .map(
            (exp: any) => `
          <div style="margin-bottom: 8pt;">
            <div style="font-weight:bold; font-size:10pt; color:#0f172a;">
              ${exp.position || ''} — ${exp.companyName || ''} (${exp.startDate || ''} – ${exp.endDate || 'Present'})
            </div>
            <ul style="margin:2pt 0 0 14pt; padding:0; font-size:9pt; color:#1e293b;">
              ${(exp.responsibilities || []).map((r: string) => `<li>${r}</li>`).join('')}
            </ul>
          </div>`
          )
          .join('')
      : '';

  const sidebarContentHtml = `
    ${
      personalItems.length > 0
        ? `<h3 style="font-size:10pt; text-transform:uppercase; border-bottom:1px solid #cbd5e1; padding-bottom:2pt; margin-top:8pt;">Personal Information</h3>
           <div style="font-size:8.5pt; margin-bottom:8pt;">
             ${personalItems.map((i: any) => `<div><strong>${i.label}:</strong> ${i.value}</div>`).join('')}
           </div>`
        : ''
    }
    ${
      skills.length > 0
        ? `<h3 style="font-size:10pt; text-transform:uppercase; border-bottom:1px solid #cbd5e1; padding-bottom:2pt; margin-top:8pt;">Skills</h3>
           <div style="font-size:8.5pt; margin-bottom:8pt;">
             ${skills.map(s => `<div>• ${s}</div>`).join('')}
           </div>`
        : ''
    }
    ${
      educationItems.length > 0
        ? `<h3 style="font-size:10pt; text-transform:uppercase; border-bottom:1px solid #cbd5e1; padding-bottom:2pt; margin-top:8pt;">Education</h3>
           <div style="font-size:8.5pt; margin-bottom:8pt;">
             ${educationItems
               .map((e: any) => `<div><strong>${e.degree}</strong><br/>${e.institution} ${e.year ? `(${e.year})` : ''}</div>`)
               .join('<div style="height:4pt;"></div>')}
           </div>`
        : ''
    }
    ${
      trainingItems.length > 0
        ? `<h3 style="font-size:10pt; text-transform:uppercase; border-bottom:1px solid #cbd5e1; padding-bottom:2pt; margin-top:8pt;">Training & Certifications</h3>
           <div style="font-size:8.5pt; margin-bottom:8pt;">
             ${trainingItems.map((t: any) => `<div>• ${t.text}</div>`).join('')}
           </div>`
        : ''
    }
    ${
      languageItems.length > 0
        ? `<h3 style="font-size:10pt; text-transform:uppercase; border-bottom:1px solid #cbd5e1; padding-bottom:2pt; margin-top:8pt;">Languages</h3>
           <div style="font-size:8.5pt;">
             ${languageItems.map((l: any) => `<div><strong>${l.language}:</strong> ${l.proficiency}</div>`).join('')}
           </div>`
        : ''
    }
  `;

  const mainContentHtml = `
    ${
      summary
        ? `<h3 style="color:${accentColor}; font-size:11pt; text-transform:uppercase; border-bottom:1px solid ${accentColor}; padding-bottom:2pt;">Profile Summary</h3>
           <p style="font-size:9.5pt; color:#1e293b; line-height:1.4;">${summary}</p>`
        : ''
    }
    <h3 style="color:${accentColor}; font-size:11pt; text-transform:uppercase; border-bottom:1px solid ${accentColor}; padding-bottom:2pt;">${data.workExperienceTitle || 'Work Experience'}</h3>
    ${expHtml}
    ${ptHtml}
  `;

  const bodyLayoutHtml = isSingleCol
    ? `<div>${mainContentHtml}${sidebarContentHtml}</div>`
    : `<table style="width:100%; border-collapse:collapse;">
         <tr>
           ${
             isRightSidebar
               ? `<td style="width:66%; vertical-align:top; padding-right:14pt;">${mainContentHtml}</td>
                  <td style="width:34%; vertical-align:top; background:#f8fafc; padding:12pt; border-left:2px solid ${accentColor};">${sidebarContentHtml}</td>`
               : `<td style="width:33%; vertical-align:top; background:#f8fafc; padding:12pt; border-right:2px solid ${accentColor};">${sidebarContentHtml}</td>
                  <td style="width:67%; vertical-align:top; padding-left:14pt;">${mainContentHtml}</td>`
           }
         </tr>
       </table>`;

  const wordDocHtml = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:w="urn:schemas-microsoft-com:office:word"
          xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8" />
      <title>${fullName} - CV (${templateId})</title>
      <style>
        @page { size: 21cm 29.7cm; margin: 1.2cm; }
        body { font-family: ${fontFamily}; color: #0f172a; margin: 0; padding: 0; }
      </style>
    </head>
    <body>
      <div style="background:${accentColor}; color:#ffffff; padding:14pt 18pt; margin-bottom:12pt;">
        <h1 style="margin:0; font-size:20pt; text-transform:uppercase; letter-spacing:1px;">${fullName}</h1>
        <div style="font-size:10.5pt; opacity:0.9; text-transform:uppercase; margin-top:2pt;">${title}</div>
        <div style="font-size:8.5pt; margin-top:6pt; opacity:0.85;">
          ${[location, phone, email, linkedIn].filter(Boolean).join('  |  ')}
        </div>
      </div>
      ${bodyLayoutHtml}
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff', wordDocHtml], {
    type: 'application/msword;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.doc') || filename.endsWith('.docx') ? filename : `${filename}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


