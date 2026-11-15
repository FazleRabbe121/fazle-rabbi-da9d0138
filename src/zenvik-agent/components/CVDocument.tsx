import React from 'react';
import { CVData, CVDesignTemplateId, WorkExperience } from '../types/cv';
import { Mail, Phone, MapPin, Globe, Award, GraduationCap, Briefcase, User } from 'lucide-react';
import { getResumeTemplateById, ResumeExampleTemplateDefinition } from '../services/resumeExampleTemplates';

interface CVDocumentProps {
  data: CVData;
  scale?: number;
  id?: string;
  overrideTemplateId?: CVDesignTemplateId;
  overrideAccentColor?: string;
  hidePhotoPagesInPreview?: boolean;
}

export const CVDocument: React.FC<CVDocumentProps> = ({
  data,
  scale = 1,
  id = 'cv-print-area',
  overrideTemplateId,
  overrideAccentColor,
  hidePhotoPagesInPreview = false,
}) => {
  const activeTemplateId: CVDesignTemplateId =
    overrideTemplateId || data.designTemplateId || 'classic-hospitality';
  const tpl: ResumeExampleTemplateDefinition = getResumeTemplateById(activeTemplateId);
  const accentColor = overrideAccentColor || data.templateAccentColor || tpl.defaultAccent;
  const showPhoto = data.showProfilePhoto !== false;

  // Sort experiences according to user preference
  const sortedExperiences = [...(data.experiences || [])].sort((a, b) => {
    if (data.experienceSortOrder === 'oldest-first') {
      return (a.startDate || '').localeCompare(b.startDate || '');
    }
    return 0;
  });

  const partTimeList = data.partTimeExperiences || [];
  const additionalPhotos = (data.additionalPhotos || []).filter(p => p.included && p.url);
  const showPhotosPage =
    !hidePhotoPagesInPreview &&
    data.showAdditionalPhotosPage !== false &&
    additionalPhotos.length > 0;

  // Natural content-driven capacity calculation for A4 (210mm x 297mm)
  const PAGE1_USABLE_HEIGHT = 1040;

  const estimateExpHeight = (exp: WorkExperience): number => {
    let h = 32;
    const resps = exp.responsibilities || [];
    for (const r of resps) {
      const lines = Math.max(1, Math.ceil((r || '').length / 70));
      h += lines * 13 + 2;
    }
    return h;
  };

  let page1ContentHeight = 100;
  const page1Experiences: WorkExperience[] = [];
  const page2Experiences: WorkExperience[] = [];

  for (let i = 0; i < sortedExperiences.length; i++) {
    const exp = sortedExperiences[i];
    const eh = estimateExpHeight(exp) + 8;
    if (page2Experiences.length === 0 && page1ContentHeight + eh <= PAGE1_USABLE_HEIGHT) {
      page1Experiences.push(exp);
      page1ContentHeight += eh;
    } else {
      page2Experiences.push(exp);
    }
  }

  const page1PartTime: WorkExperience[] = [];
  const page2PartTime: WorkExperience[] = [];

  if (partTimeList.length > 0) {
    const ptTotal = 24 + partTimeList.reduce((acc, p) => acc + estimateExpHeight(p) + 6, 0);
    if (page2Experiences.length === 0 && page1ContentHeight + ptTotal <= PAGE1_USABLE_HEIGHT) {
      page1PartTime.push(...partTimeList);
      page1ContentHeight += ptTotal;
    } else {
      page2PartTime.push(...partTimeList);
    }
  }

  const skillsCount =
    data.skills && data.skills.enabled && data.skills.items ? data.skills.items.length : 0;
  const skillsHeight = skillsCount > 0 ? 20 + Math.ceil(skillsCount / 3) * 14 : 0;

  let page1HasSkills = false;
  let page2HasSkills = false;

  if (skillsCount > 0) {
    if (
      page2Experiences.length === 0 &&
      page2PartTime.length === 0 &&
      page1ContentHeight + skillsHeight <= PAGE1_USABLE_HEIGHT
    ) {
      page1HasSkills = true;
    } else {
      page2HasSkills = true;
    }
  }

  const isMultiPage = page2Experiences.length > 0 || page2PartTime.length > 0 || page2HasSkills;
  const mainCvPages = isMultiPage ? 2 : 1;
  const photoPagesCount = showPhotosPage ? additionalPhotos.length : 0;
  const totalPages = mainCvPages + photoPagesCount;

  // Helper to convert language proficiency text to percentage for bar/dot templates
  const getProficiencyScore = (prof: string): number => {
    const p = (prof || '').toLowerCase();
    if (p.includes('native') || p.includes('mother') || p.includes('c2')) return 100;
    if (p.includes('fluent') || p.includes('c1') || p.includes('advanced')) return 90;
    if (p.includes('professional') || p.includes('b2') || p.includes('upper')) return 82;
    if (p.includes('conversational') || p.includes('intermediate') || p.includes('b1')) return 70;
    if (p.includes('basic') || p.includes('elementary') || p.includes('a2') || p.includes('a1')) return 50;
    return 80;
  };

  // Helper to render profile photo in template-specific shape
  const renderAvatar = (sizeClass = 'w-24 h-24', borderClass = 'border-2 border-white/90') => {
    if (!showPhoto) return null;
    const shapeClass =
      tpl.photoShape === 'circle'
        ? 'rounded-full'
        : tpl.photoShape === 'rounded'
        ? 'rounded-2xl'
        : 'rounded-none';
    return (
      <div
        className={`relative ${sizeClass} ${shapeClass} overflow-hidden ${borderClass} shadow-md bg-slate-800 flex items-center justify-center shrink-0`}
      >
        {data.photoUrl ? (
          <img
            src={data.photoUrl}
            alt={data.fullName}
            className="w-full h-full object-cover object-top"
            onError={e => {
              (e.target as HTMLImageElement).src =
                'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-white/60">
            {data.fullName?.charAt(0) || 'F'}
          </div>
        )}
      </div>
    );
  };

  // Helper to render Skills according to template's SkillDisplayStyle
  const renderSkillsBlock = (onDark = false) => {
    if (!data.skills || !data.skills.enabled || !data.skills.items || data.skills.items.length === 0) {
      return null;
    }
    const items: string[] = data.skills.items.map((s: any) =>
      typeof s === 'string' ? s : s?.name || String(s)
    );

    if (tpl.skillStyle === 'bars') {
      return (
        <div className="space-y-1.5">
          {items.map((skill, idx) => {
            const pct = idx % 3 === 0 ? 95 : idx % 2 === 0 ? 88 : 92;
            return (
              <div key={idx} className="space-y-0.5">
                <div
                  className={`flex justify-between text-[8.3px] font-medium leading-tight ${
                    onDark ? 'text-white/95' : 'text-slate-800'
                  }`}
                >
                  <span>{skill}</span>
                </div>
                <div
                  className={`w-full h-1.5 rounded-full overflow-hidden ${
                    onDark ? 'bg-white/20' : 'bg-slate-200'
                  }`}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: onDark ? '#ffffff' : accentColor,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (tpl.skillStyle === 'dots') {
      return (
        <div className="space-y-1.5">
          {items.map((skill, idx) => {
            const filled = idx % 4 === 0 ? 5 : 4;
            return (
              <div key={idx} className="flex items-center justify-between gap-2 text-[8.3px]">
                <span className={`font-medium truncate ${onDark ? 'text-white/95' : 'text-slate-800'}`}>
                  {skill}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {[1, 2, 3, 4, 5].map(dot => (
                    <span
                      key={dot}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        backgroundColor:
                          dot <= filled
                            ? onDark
                              ? '#ffffff'
                              : accentColor
                            : onDark
                            ? 'rgba(255,255,255,0.25)'
                            : '#cbd5e1',
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (tpl.skillStyle === 'pills') {
      return (
        <div className="flex flex-wrap gap-1.5">
          {items.map((skill, idx) => (
            <span
              key={idx}
              className="px-2 py-0.5 rounded-md text-[8px] font-semibold leading-snug"
              style={{
                backgroundColor: onDark ? 'rgba(255,255,255,0.14)' : `${accentColor}14`,
                color: onDark ? '#ffffff' : accentColor,
                border: onDark ? '1px solid rgba(255,255,255,0.22)' : `1px solid ${accentColor}35`,
              }}
            >
              {skill}
            </span>
          ))}
        </div>
      );
    }

    if (tpl.skillStyle === 'two-col-grid') {
      return (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {items.map((skill, idx) => (
            <div
              key={idx}
              className={`flex items-center gap-1.5 text-[8.4px] font-medium ${
                onDark ? 'text-white/90' : 'text-slate-800'
              }`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: onDark ? '#ffffff' : accentColor }}
              />
              <span className="truncate">{skill}</span>
            </div>
          ))}
        </div>
      );
    }

    // Default inline-bullets
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[8.3px] font-medium">
        {items.map((skill, idx) => (
          <span
            key={idx}
            className={`inline-flex items-center gap-1 ${onDark ? 'text-white/90' : 'text-slate-800'}`}
          >
            <span style={{ color: onDark ? '#ffffff' : accentColor }}>•</span>
            <span>{skill}</span>
          </span>
        ))}
      </div>
    );
  };

  // Helper to render Languages with optional bars/dots
  const renderLanguagesBlock = (onDark = false) => {
    if (!data.languages?.enabled || !data.languages.items?.length) return null;
    return (
      <div className="space-y-1.5">
        {data.languages.items.map(item => {
          const pct = getProficiencyScore(item.proficiency);
          return (
            <div key={item.id} className="space-y-0.5">
              <div className="flex justify-between text-[8.4px] leading-tight">
                <span className={`font-semibold ${onDark ? 'text-white' : 'text-slate-800'}`}>
                  {item.language}
                </span>
                <span className={`text-[7.8px] ${onDark ? 'text-white/75' : 'text-slate-500'}`}>
                  {item.proficiency}
                </span>
              </div>
              {(tpl.skillStyle === 'bars' || tpl.skillStyle === 'dots') && (
                <div
                  className={`w-full h-1 rounded-full overflow-hidden ${
                    onDark ? 'bg-white/20' : 'bg-slate-200'
                  }`}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: onDark ? '#ffffff' : accentColor,
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Helper to render standard Experience entry for Resume-Example layouts
  const renderModernExperienceItem = (exp: WorkExperience, key: string, accentBorder = false) => (
    <div
      key={key}
      className={`pb-2 ${accentBorder ? 'pl-3 border-l-2' : ''}`}
      style={accentBorder ? { borderColor: accentColor } : undefined}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h4
          className="font-bold text-[10.5px] text-slate-900 leading-tight"
          style={{ fontFamily: tpl.fontFamilyHeading }}
        >
          {exp.position}
          {exp.employmentType && exp.employmentType !== 'Full-time' && (
            <span className="font-normal text-[8px] text-slate-500 ml-1.5">
              · {exp.employmentType}
            </span>
          )}
        </h4>
        {exp.startDate && (
          <span
            className="text-[8.2px] font-semibold shrink-0 px-1.5 py-0.2 rounded"
            style={{ color: accentColor }}
          >
            {exp.startDate} – {exp.endDate || 'Present'}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between text-[8.8px] font-semibold text-slate-600 mt-0.5">
        <span>{exp.companyName}</span>
        {exp.location && <span className="text-[8px] font-normal text-slate-500">📍 {exp.location}</span>}
      </div>
      {exp.responsibilities && exp.responsibilities.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-[8.6px] leading-[1.38] text-slate-700">
          {exp.responsibilities.map((resp, idx) => (
            <li key={idx} className="flex items-start gap-1.5">
              <span className="font-bold text-[8px] mt-0.5 shrink-0" style={{ color: accentColor }}>
                •
              </span>
              <span className="flex-1">{resp}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  // Supporting Photos Pages renderer (shared across all templates)
  const renderSupportingPhotoPages = () => {
    if (!showPhotosPage) return null;
    return additionalPhotos.map((photo, pIdx) => (
      <div
        key={photo.id || `photo-page-${pIdx}`}
        className="cv-page relative bg-white shadow-2xl print:shadow-none overflow-hidden flex items-center justify-center"
        style={{
          width: '210mm',
          minHeight: '297mm',
          height: '297mm',
          boxSizing: 'border-box',
          padding: '12mm',
        }}
      >
        <img
          src={photo.url}
          alt={`Supporting Document ${pIdx + 1}`}
          className="max-w-full max-h-full w-auto h-auto object-contain select-none"
          style={{
            maxWidth: '186mm',
            maxHeight: '273mm',
          }}
        />
      </div>
    ));
  };

  // ============================================================================
  // ARCHITECTURE 1: CLASSIC HOSPITALITY TIMELINE (Original Default)
  // ============================================================================
  if (tpl.architecture === 'classic-hospitality-timeline') {
    const sidebarBg = overrideAccentColor || data.templateAccentColor || '#424242';

    const renderTimelineItem = (exp: WorkExperience, isLast: boolean, key: string) => (
      <div key={key} className="relative flex items-start group">
        <div className="w-[36%] pr-3 text-left shrink-0">
          <div className="font-['Inter'] font-semibold text-[11px] text-[#1e293b] leading-snug">
            {exp.companyName}
          </div>
          {exp.location && (
            <div className="flex items-start gap-1 font-['Inter'] font-normal text-[8.5px] text-[#4b5563] mt-1 leading-snug">
              <span className="text-red-600 text-[9.5px] shrink-0 select-none">📍</span>
              <span>{exp.location}</span>
            </div>
          )}
          {exp.startDate && (
            <div className="font-['Inter'] font-normal text-[8.5px] text-[#555555] mt-1">
              {exp.startDate} – {exp.endDate || 'Present'}
            </div>
          )}
        </div>

        <div className="relative flex flex-col items-center w-5 shrink-0 self-stretch">
          <div
            className="w-2 h-2 rounded-full border border-white shadow-xs mt-1 z-10 shrink-0"
            style={{ backgroundColor: sidebarBg === '#424242' ? '#1e293b' : sidebarBg }}
          />
          {!isLast && <div className="w-[1.2px] bg-[#1e293b]/40 flex-1 -mt-0.5 -mb-2" />}
        </div>

        <div className="flex-1 pl-2.5 text-left pb-1">
          <div className="flex items-baseline gap-2">
            <h4 className="font-['Inter'] font-semibold text-[11px] text-[#111111] leading-tight">
              {exp.position}
            </h4>
            {exp.employmentType && exp.employmentType !== 'Full-time' && (
              <span className="font-['Inter'] text-[8px] text-[#64748b] font-medium">
                · {exp.employmentType}
              </span>
            )}
          </div>
          {exp.responsibilities && exp.responsibilities.length > 0 && (
            <ul className="mt-1 space-y-1 font-['Inter'] font-normal text-[8.8px] leading-[1.4] text-[#222222]">
              {exp.responsibilities.map((resp, rIdx) => (
                <li key={rIdx} className="flex items-start gap-1.5">
                  <span className="text-[#111111] select-none font-bold text-[8.5px] shrink-0 mt-0.5">
                    •
                  </span>
                  <span className="flex-1">{resp}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );

    const renderSkillsSection = () => {
      if (!data.skills || !data.skills.enabled || !data.skills.items || data.skills.items.length === 0) {
        return null;
      }
      return (
        <div className="mt-4 pt-2.5 border-t border-[#1e293b]/40 pb-1">
          <h3 className="font-['Montserrat'] font-semibold text-center text-[11.5px] tracking-[0.25em] text-[#1e293b] uppercase mb-1.5">
            S K I L L
          </h3>
          <div className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1.5 font-['Inter'] font-medium text-[8.2px] text-[#374151] uppercase tracking-wide text-center leading-relaxed max-w-[96%] mx-auto">
            {data.skills.items.map((skill, sIdx) => (
              <span key={sIdx} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className="text-[#111111] select-none font-bold text-[8px]">•</span>
                <span>{typeof skill === 'string' ? skill : skill?.name || String(skill)}</span>
              </span>
            ))}
          </div>
        </div>
      );
    };

    return (
      <div
        id={id}
        className="flex flex-col items-center gap-8 print:gap-0 print:m-0"
        style={{
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'top center',
        }}
      >
        <div
          className="cv-page relative bg-white text-[#111111] shadow-2xl print:shadow-none overflow-hidden flex flex-row items-stretch"
          style={{
            width: '210mm',
            minHeight: '297mm',
            height: '297mm',
            boxSizing: 'border-box',
          }}
        >
          <aside
            className="w-[70mm] flex-shrink-0 text-[#f3f4f6] px-4 py-5 flex flex-col justify-between select-none"
            style={{ backgroundColor: sidebarBg }}
          >
            <div className="space-y-4">
              {showPhoto && (
                <div className="flex flex-col items-center pt-0.5 pb-1">
                  <div className="relative w-26 h-26 rounded-full overflow-hidden border-2 border-white/90 shadow-md bg-[#252525] flex items-center justify-center">
                    {data.photoUrl ? (
                      <img
                        src={data.photoUrl}
                        alt={data.fullName}
                        className="w-full h-full object-cover object-top"
                        onError={e => {
                          (e.target as HTMLImageElement).src =
                            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl font-bold font-['Montserrat'] text-white/40">
                        {data.fullName?.charAt(0) || 'F'}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {data.aboutMe.enabled && (
                <div>
                  <h3 className="font-['Montserrat'] font-semibold text-[11px] tracking-wider text-white uppercase">
                    {data.aboutMe.title || 'ABOUT ME'}
                  </h3>
                  <div className="w-full h-[1px] bg-white/60 mt-0.5 mb-1.5" />
                  <p className="font-['Inter'] font-normal text-[8.8px] leading-[1.38] text-white/90 text-justify">
                    {data.aboutMe.content}
                  </p>
                </div>
              )}

              {data.personalInfo.enabled && (
                <div>
                  <h3 className="font-['Montserrat'] font-semibold text-[11px] tracking-wider text-white uppercase">
                    {data.personalInfo.title || 'PERSONAL INFORMATION'}
                  </h3>
                  <div className="w-full h-[1px] bg-white/60 mt-0.5 mb-1.5" />
                  <div className="space-y-2 font-['Inter'] text-[9px] text-white/90">
                    {data.personalInfo.items.map(item => (
                      <div key={item.id} className="leading-snug">
                        <span className="font-semibold text-white">{item.label} : </span>
                        <span className="font-normal text-white/85">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.trainingSummary.enabled && (
                <div>
                  <h3 className="font-['Montserrat'] font-semibold text-[11px] tracking-wider text-white uppercase">
                    {data.trainingSummary.title || 'TRAINING SUMMARY'}
                  </h3>
                  <div className="w-full h-[1px] bg-white/60 mt-0.5 mb-1.5" />
                  <ul className="space-y-1 font-['Inter'] font-normal text-[8.2px] leading-snug text-white/90">
                    {data.trainingSummary.items.map(item => (
                      <li key={item.id} className="flex items-start gap-1">
                        <span className="text-white select-none">•</span>
                        <span>{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data.academicQualifications.enabled && (
                <div>
                  <h3 className="font-['Montserrat'] font-semibold text-[11px] tracking-wider text-white uppercase">
                    {data.academicQualifications.title || 'ACADEMIC QUALIFICATIONS'}
                  </h3>
                  <div className="w-full h-[1px] bg-white/60 mt-0.5 mb-1.5" />
                  <div className="space-y-1 font-['Inter'] text-[8.2px] text-white/90">
                    {data.academicQualifications.items.map(item => (
                      <div key={item.id} className="leading-tight">
                        <div className="font-semibold text-white">{item.degree}</div>
                        <div className="font-normal text-white/80 text-[8px]">{item.institution}</div>
                        {item.year && (
                          <div className="font-normal text-white/70 text-[7.5px]">{item.year}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.languages.enabled && (
                <div>
                  <h3 className="font-['Montserrat'] font-semibold text-[11px] tracking-wider text-white uppercase">
                    {data.languages.title || 'LANGUAGE'}
                  </h3>
                  <div className="w-full h-[1px] bg-white/60 mt-0.5 mb-1.5" />
                  <div className="space-y-1.2 font-['Inter'] text-[8.5px] text-white/90">
                    {data.languages.items.map(item => (
                      <div key={item.id} className="flex justify-between leading-tight">
                        <span className="font-normal text-white">{item.language}</span>
                        <span className="font-normal text-white/80 text-[8px]">{item.proficiency}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="text-[8px] font-['Inter'] font-normal text-white/50 text-center pt-2 border-t border-white/10 mt-auto">
              Page 1 of {totalPages}
            </div>
          </aside>

          <main className="flex-1 bg-white text-[#111111] px-5 py-4 flex flex-col justify-between overflow-hidden">
            <div>
              <header className="flex items-start justify-between pb-2.5">
                <div className="space-y-0.5">
                  <h1 className="font-['Montserrat'] font-bold text-[24px] leading-tight text-[#0f172a] tracking-tight">
                    {data.fullName}
                  </h1>
                  <div className="font-['Montserrat'] font-medium text-[11.5px] tracking-[0.25em] text-[#334155] uppercase">
                    {data.professionalTitle.split('').join(' ')}
                  </div>
                </div>

                <div className="space-y-0.5 text-right font-['Inter'] font-normal text-[8.8px] text-[#222222] max-w-[240px]">
                  {data.location && (
                    <div className="flex items-center justify-end gap-1.5 leading-snug">
                      <span className="text-right">{data.location}</span>
                      <span className="text-red-600 shrink-0 font-bold select-none text-[10px]">📍</span>
                    </div>
                  )}
                  {data.email && (
                    <div className="flex items-center justify-end gap-1.5 leading-snug">
                      <span className="text-right truncate">{data.email}</span>
                      <span className="text-[#1e293b] shrink-0">
                        <Mail className="w-3.5 h-3.5 text-[#1e293b] fill-[#1e293b]" />
                      </span>
                    </div>
                  )}
                  {data.phone && (
                    <div className="flex items-center justify-end gap-1.5 leading-snug">
                      <span className="text-right font-mono text-[8.5px]">{data.phone}</span>
                      <span className="text-[#1e293b] shrink-0">
                        <Phone className="w-3.5 h-3.5 text-[#1e293b] fill-[#1e293b]" />
                      </span>
                    </div>
                  )}
                  {data.linkedIn && (
                    <div className="flex items-center justify-end gap-1.5 leading-snug">
                      <span className="text-right truncate">{data.linkedIn}</span>
                      <span className="text-[#1e293b] font-bold text-[10px] leading-none shrink-0">
                        in
                      </span>
                    </div>
                  )}
                </div>
              </header>

              <div className="mt-1 mb-2">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-['Montserrat'] font-semibold text-[14px] text-[#1e293b] tracking-wide inline-block uppercase">
                    {data.workExperienceTitle || 'Work Experience'}
                  </h2>
                  <span className="font-['Inter'] font-normal text-[8.5px] text-[#475569] uppercase tracking-wider pr-1">
                    {data.jobResponsibilitiesTitle || 'JOB RESPONSIBILITIES'}
                  </span>
                </div>
                <div className="w-full h-[1.2px] bg-[#1e293b]/70 mt-0.5 mb-1.5" />
              </div>

              <div className="relative space-y-2.5 pt-0.5">
                {page1Experiences.map((exp, index) =>
                  renderTimelineItem(
                    exp,
                    index === page1Experiences.length - 1 &&
                      page1PartTime.length === 0 &&
                      !page1HasSkills,
                    `p1-${exp.id}`
                  )
                )}
              </div>

              {page1PartTime.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-baseline justify-between mb-0.5">
                    <h3 className="font-['Montserrat'] font-semibold text-[11.5px] text-[#1e293b] tracking-wider uppercase inline-block">
                      PART-TIME EXPERIENCE
                    </h3>
                  </div>
                  <div className="w-full h-[1px] bg-[#1e293b]/50 mt-0.5 mb-1.5" />
                  <div className="relative space-y-2 pt-0.5">
                    {page1PartTime.map((exp, index) =>
                      renderTimelineItem(
                        exp,
                        index === page1PartTime.length - 1 && !page1HasSkills,
                        `p1-pt-${exp.id}`
                      )
                    )}
                  </div>
                </div>
              )}

              {page1HasSkills && renderSkillsSection()}
            </div>

            <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[8px] font-['Inter'] font-normal text-[#888888] mt-auto">
              <span>{data.fullName} — Hospitality Curriculum Vitae</span>
              <span>Page 1 of {totalPages}</span>
            </div>
          </main>
        </div>

        {isMultiPage && (
          <div
            className="cv-page relative bg-white text-[#111111] shadow-2xl print:shadow-none overflow-hidden flex flex-row items-stretch"
            style={{
              width: '210mm',
              minHeight: '297mm',
              height: '297mm',
              boxSizing: 'border-box',
            }}
          >
            <aside
              className="w-[70mm] flex-shrink-0 text-[#f3f4f6] px-4 py-5 flex flex-col justify-between select-none"
              style={{ backgroundColor: sidebarBg }}
            >
              <div className="space-y-4">
                <div className="pt-1 pb-2 text-center border-b border-white/20">
                  <div className="font-['Montserrat'] font-bold text-xs tracking-wider uppercase text-white/95">
                    {data.fullName}
                  </div>
                  <div className="font-['Montserrat'] font-medium text-[9px] tracking-widest uppercase text-white/70 mt-0.5">
                    {data.professionalTitle}
                  </div>
                </div>
                <div className="space-y-2 font-['Inter'] font-normal text-[8.5px] text-white/80 pt-1">
                  {data.location && (
                    <div className="leading-snug">
                      <span className="text-white/50 block text-[7.5px] uppercase tracking-wider font-semibold">
                        Location
                      </span>
                      <span className="text-white/90">{data.location}</span>
                    </div>
                  )}
                  {data.email && (
                    <div className="leading-snug">
                      <span className="text-white/50 block text-[7.5px] uppercase tracking-wider font-semibold">
                        Email
                      </span>
                      <span className="text-white/90">{data.email}</span>
                    </div>
                  )}
                  {data.phone && (
                    <div className="leading-snug">
                      <span className="text-white/50 block text-[7.5px] uppercase tracking-wider font-semibold">
                        Phone
                      </span>
                      <span className="text-white/90">{data.phone}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="text-[8px] font-['Inter'] font-normal text-white/50 text-center pt-2 border-t border-white/10 mt-auto">
                Page 2 of {totalPages}
              </div>
            </aside>

            <main className="flex-1 bg-white text-[#111111] px-5 py-4 flex flex-col justify-between overflow-hidden">
              <div>
                {page2Experiences.length > 0 && (
                  <div>
                    <div className="flex items-baseline justify-between mb-1">
                      <h2 className="font-['Montserrat'] font-semibold text-[14px] text-[#1e293b] tracking-wide inline-block uppercase">
                        {data.workExperienceTitle || 'Work Experience'} (Continued)
                      </h2>
                    </div>
                    <div className="w-full h-[1.2px] bg-[#1e293b]/70 mt-0.5 mb-2" />
                    <div className="relative space-y-1.5 pt-0.5">
                      {page2Experiences.map((exp, index) =>
                        renderTimelineItem(
                          exp,
                          index === page2Experiences.length - 1 &&
                            page2PartTime.length === 0 &&
                            !page2HasSkills,
                          `p2-exp-${exp.id}`
                        )
                      )}
                    </div>
                  </div>
                )}

                {page2PartTime.length > 0 && (
                  <div className="mt-2.5">
                    <div className="flex items-baseline justify-between mb-0.5">
                      <h3 className="font-['Montserrat'] font-semibold text-[11.5px] text-[#1e293b] tracking-wider uppercase inline-block">
                        PART-TIME EXPERIENCE
                      </h3>
                    </div>
                    <div className="w-full h-[1px] bg-[#1e293b]/50 mt-0.5 mb-1.5" />
                    <div className="relative space-y-1.5 pt-0.5">
                      {page2PartTime.map((exp, index) =>
                        renderTimelineItem(
                          exp,
                          index === page2PartTime.length - 1 && !page2HasSkills,
                          `p2-pt-${exp.id}`
                        )
                      )}
                    </div>
                  </div>
                )}

                {page2HasSkills && renderSkillsSection()}
              </div>
              <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[8px] font-['Inter'] font-normal text-[#888888] mt-auto">
                <span>{data.fullName} — Hospitality Curriculum Vitae</span>
                <span>Page 2 of {totalPages}</span>
              </div>
            </main>
          </div>
        )}

        {renderSupportingPhotoPages()}
      </div>
    );
  }

  // ============================================================================
  // ARCHITECTURE 2: LEFT DARK SIDEBAR (Budapest, Berlin)
  // ============================================================================
  if (tpl.architecture === 'left-dark-sidebar') {
    return (
      <div
        id={id}
        className="flex flex-col items-center gap-8 print:gap-0 print:m-0"
        style={{
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'top center',
          fontFamily: tpl.fontFamilyBody,
        }}
      >
        <div
          className="cv-page relative bg-white text-slate-900 shadow-2xl print:shadow-none overflow-hidden flex flex-row items-stretch"
          style={{ width: '210mm', minHeight: '297mm', height: '297mm', boxSizing: 'border-box' }}
        >
          {/* Left Dark Column */}
          <aside
            className="w-[72mm] shrink-0 text-white px-5 py-6 flex flex-col justify-between"
            style={{ backgroundColor: accentColor }}
          >
            <div className="space-y-4">
              {showPhoto && (
                <div className="flex flex-col items-center pb-1">
                  {renderAvatar('w-26 h-26', 'border-2 border-white/80')}
                </div>
              )}

              {/* Contact Details in Left Sidebar (Budapest signature style) */}
              <div>
                <h3
                  className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-white/95 pb-1 border-b border-white/25 mb-2"
                  style={{ fontFamily: tpl.fontFamilyHeading }}
                >
                  Contact Details
                </h3>
                <div className="space-y-1.5 text-[8.5px] text-white/90">
                  {data.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3 h-3 text-white/75 shrink-0" />
                      <span>{data.phone}</span>
                    </div>
                  )}
                  {data.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3 h-3 text-white/75 shrink-0" />
                      <span className="truncate">{data.email}</span>
                    </div>
                  )}
                  {data.location && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3 h-3 text-white/75 shrink-0 mt-0.5" />
                      <span>{data.location}</span>
                    </div>
                  )}
                  {data.linkedIn && (
                    <div className="flex items-center gap-2">
                      <Globe className="w-3 h-3 text-white/75 shrink-0" />
                      <span className="truncate">{data.linkedIn}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Personal Info */}
              {data.personalInfo.enabled && data.personalInfo.items.length > 0 && (
                <div>
                  <h3
                    className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-white/95 pb-1 border-b border-white/25 mb-2"
                    style={{ fontFamily: tpl.fontFamilyHeading }}
                  >
                    {data.personalInfo.title || 'Personal Details'}
                  </h3>
                  <div className="space-y-1.5 text-[8.4px] text-white/90">
                    {data.personalInfo.items.map(item => (
                      <div key={item.id} className="flex justify-between gap-2">
                        <span className="text-white/70 font-medium">{item.label}</span>
                        <span className="font-semibold text-right">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Skills with Progress Bars */}
              {data.skills?.enabled && data.skills.items?.length > 0 && (
                <div>
                  <h3
                    className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-white/95 pb-1 border-b border-white/25 mb-2"
                    style={{ fontFamily: tpl.fontFamilyHeading }}
                  >
                    {data.skills.title || 'Skills'}
                  </h3>
                  {renderSkillsBlock(true)}
                </div>
              )}

              {/* Languages with Progress Bars */}
              {data.languages.enabled && data.languages.items.length > 0 && (
                <div>
                  <h3
                    className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-white/95 pb-1 border-b border-white/25 mb-2"
                    style={{ fontFamily: tpl.fontFamilyHeading }}
                  >
                    {data.languages.title || 'Languages'}
                  </h3>
                  {renderLanguagesBlock(true)}
                </div>
              )}
            </div>

            <div className="text-[7.5px] text-white/50 text-center pt-2 border-t border-white/15">
              {tpl.name} Template · Page 1
            </div>
          </aside>

          {/* Right Main Content Column */}
          <main className="flex-1 bg-white px-6 py-6 flex flex-col justify-between overflow-hidden">
            <div className="space-y-3.5">
              {/* Name & Role Header */}
              <header className="pb-3 border-b-2" style={{ borderColor: accentColor }}>
                <h1
                  className="text-[26px] font-extrabold tracking-tight uppercase leading-none"
                  style={{ fontFamily: tpl.fontFamilyHeading, color: accentColor }}
                >
                  {data.fullName}
                </h1>
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500 mt-1.5">
                  {data.professionalTitle}
                </div>
              </header>

              {/* Profile Summary */}
              {data.aboutMe.enabled && data.aboutMe.content && (
                <section>
                  <h2
                    className="text-[11px] font-bold uppercase tracking-[0.16em] mb-1"
                    style={{ fontFamily: tpl.fontFamilyHeading, color: accentColor }}
                  >
                    {data.aboutMe.title || 'Profile'}
                  </h2>
                  <p className="text-[8.8px] leading-[1.45] text-slate-700 text-justify">
                    {data.aboutMe.content}
                  </p>
                </section>
              )}

              {/* Employment History */}
              <section>
                <h2
                  className="text-[11px] font-bold uppercase tracking-[0.16em] pb-1 border-b border-slate-200 mb-2"
                  style={{ fontFamily: tpl.fontFamilyHeading, color: accentColor }}
                >
                  {data.workExperienceTitle || 'Employment History'}
                </h2>
                <div className="space-y-2.5">
                  {sortedExperiences.slice(0, 5).map(exp =>
                    renderModernExperienceItem(exp, `bud-${exp.id}`, true)
                  )}
                </div>
              </section>

              {/* Part-time Experience */}
              {partTimeList.length > 0 && (
                <section>
                  <h2
                    className="text-[10.5px] font-bold uppercase tracking-[0.16em] pb-1 border-b border-slate-200 mb-1.5"
                    style={{ fontFamily: tpl.fontFamilyHeading, color: accentColor }}
                  >
                    Part-Time Experience
                  </h2>
                  <div className="space-y-2">
                    {partTimeList.map(exp =>
                      renderModernExperienceItem(exp, `bud-pt-${exp.id}`, true)
                    )}
                  </div>
                </section>
              )}

              {/* Education & Training */}
              <div className="grid grid-cols-2 gap-4 pt-1">
                {data.academicQualifications.enabled && (
                  <section>
                    <h2
                      className="text-[10px] font-bold uppercase tracking-[0.14em] pb-1 border-b border-slate-200 mb-1.5"
                      style={{ fontFamily: tpl.fontFamilyHeading, color: accentColor }}
                    >
                      {data.academicQualifications.title || 'Education'}
                    </h2>
                    <div className="space-y-1.5 text-[8.4px]">
                      {data.academicQualifications.items.map(item => (
                        <div key={item.id}>
                          <div className="font-bold text-slate-900">{item.degree}</div>
                          <div className="text-slate-600">{item.institution}</div>
                          {item.year && <div className="text-[7.8px] text-slate-400">{item.year}</div>}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {data.trainingSummary.enabled && (
                  <section>
                    <h2
                      className="text-[10px] font-bold uppercase tracking-[0.14em] pb-1 border-b border-slate-200 mb-1.5"
                      style={{ fontFamily: tpl.fontFamilyHeading, color: accentColor }}
                    >
                      {data.trainingSummary.title || 'Certifications & Training'}
                    </h2>
                    <ul className="space-y-1 text-[8.2px] text-slate-700">
                      {data.trainingSummary.items.map(item => (
                        <li key={item.id} className="flex items-start gap-1">
                          <span style={{ color: accentColor }}>•</span>
                          <span>{item.text}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            </div>

            <footer className="pt-2 border-t border-slate-100 flex justify-between text-[7.8px] text-slate-400">
              <span>{data.fullName} — Curriculum Vitae</span>
              <span>Page 1 of {1 + photoPagesCount}</span>
            </footer>
          </main>
        </div>

        {renderSupportingPhotoPages()}
      </div>
    );
  }

  // ============================================================================
  // ARCHITECTURE 3: TOP BANNER + TWO-COLUMN BODY (Riga, Prague, Dubai)
  // ============================================================================
  if (tpl.architecture === 'top-banner-two-col') {
    const isDubai = tpl.id === 'dubai';
    return (
      <div
        id={id}
        className="flex flex-col items-center gap-8 print:gap-0 print:m-0"
        style={{
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'top center',
          fontFamily: tpl.fontFamilyBody,
        }}
      >
        <div
          className="cv-page relative bg-white text-slate-900 shadow-2xl print:shadow-none overflow-hidden flex flex-col justify-between"
          style={{ width: '210mm', minHeight: '297mm', height: '297mm', boxSizing: 'border-box' }}
        >
          {/* Top Full-Width Hero Banner */}
          <header
            className="w-full px-7 py-5 text-white flex items-center justify-between gap-5 shrink-0"
            style={{
              backgroundColor: accentColor,
              borderBottom: isDubai ? '4px solid #d4af37' : undefined,
            }}
          >
            <div className="flex items-center gap-4">
              {showPhoto && renderAvatar('w-20 h-20', 'border-2 border-white/90')}
              <div>
                <h1
                  className="text-[24px] font-extrabold tracking-tight uppercase leading-tight text-white"
                  style={{ fontFamily: tpl.fontFamilyHeading }}
                >
                  {data.fullName}
                </h1>
                <div
                  className="text-[11px] font-bold uppercase tracking-[0.22em] mt-0.5"
                  style={{ color: isDubai ? '#fde047' : 'rgba(255,255,255,0.85)' }}
                >
                  {data.professionalTitle}
                </div>
                {data.aboutMe.enabled && data.aboutMe.content && (
                  <p className="text-[8.4px] leading-[1.35] text-white/85 mt-2 max-w-[410px] line-clamp-3">
                    {data.aboutMe.content}
                  </p>
                )}
              </div>
            </div>

            <div className="text-right space-y-1 text-[8.4px] text-white/90 shrink-0">
              {data.location && <div>📍 {data.location}</div>}
              {data.phone && <div className="font-mono">📞 {data.phone}</div>}
              {data.email && <div>✉️ {data.email}</div>}
              {data.linkedIn && <div className="truncate max-w-[180px]">🔗 {data.linkedIn}</div>}
            </div>
          </header>

          {/* 2-Column Body Below Banner */}
          <div className="flex-1 grid grid-cols-12 gap-5 px-7 py-5 overflow-hidden">
            {/* Left Main Column (8 cols) */}
            <div className="col-span-8 space-y-3.5 pr-2">
              <section>
                <h2
                  className="text-[11.5px] font-bold uppercase tracking-[0.16em] pb-1 border-b-2 mb-2"
                  style={{ fontFamily: tpl.fontFamilyHeading, color: accentColor, borderColor: accentColor }}
                >
                  {data.workExperienceTitle || 'Professional Experience'}
                </h2>
                <div className="space-y-2.5">
                  {sortedExperiences.slice(0, 5).map(exp =>
                    renderModernExperienceItem(exp, `riga-${exp.id}`, false)
                  )}
                </div>
              </section>

              {partTimeList.length > 0 && (
                <section>
                  <h2
                    className="text-[10.5px] font-bold uppercase tracking-[0.15em] pb-1 border-b mb-2"
                    style={{ fontFamily: tpl.fontFamilyHeading, color: accentColor }}
                  >
                    Part-Time & Seasonal Roles
                  </h2>
                  <div className="space-y-2">
                    {partTimeList.map(exp => renderModernExperienceItem(exp, `riga-pt-${exp.id}`, false))}
                  </div>
                </section>
              )}
            </div>

            {/* Right Sidebar Column (4 cols) */}
            <aside
              className="col-span-4 rounded-xl p-4 space-y-4 self-stretch"
              style={{ backgroundColor: tpl.secondaryBg }}
            >
              {data.personalInfo.enabled && (
                <div>
                  <h3
                    className="text-[10px] font-bold uppercase tracking-[0.15em] pb-1 border-b border-slate-300 mb-2"
                    style={{ fontFamily: tpl.fontFamilyHeading, color: accentColor }}
                  >
                    {data.personalInfo.title || 'Personal Details'}
                  </h3>
                  <div className="space-y-1.5 text-[8.3px]">
                    {data.personalInfo.items.map(item => (
                      <div key={item.id}>
                        <span className="text-slate-500 font-medium">{item.label}: </span>
                        <span className="font-semibold text-slate-900">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.skills?.enabled && (
                <div>
                  <h3
                    className="text-[10px] font-bold uppercase tracking-[0.15em] pb-1 border-b border-slate-300 mb-2"
                    style={{ fontFamily: tpl.fontFamilyHeading, color: accentColor }}
                  >
                    {data.skills.title || 'Core Competencies'}
                  </h3>
                  {renderSkillsBlock(false)}
                </div>
              )}

              {data.academicQualifications.enabled && (
                <div>
                  <h3
                    className="text-[10px] font-bold uppercase tracking-[0.15em] pb-1 border-b border-slate-300 mb-2"
                    style={{ fontFamily: tpl.fontFamilyHeading, color: accentColor }}
                  >
                    {data.academicQualifications.title || 'Education'}
                  </h3>
                  <div className="space-y-1.5 text-[8.3px]">
                    {data.academicQualifications.items.map(item => (
                      <div key={item.id}>
                        <div className="font-bold text-slate-900">{item.degree}</div>
                        <div className="text-slate-600">{item.institution}</div>
                        {item.year && <div className="text-[7.5px] text-slate-500">{item.year}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.trainingSummary.enabled && (
                <div>
                  <h3
                    className="text-[10px] font-bold uppercase tracking-[0.15em] pb-1 border-b border-slate-300 mb-2"
                    style={{ fontFamily: tpl.fontFamilyHeading, color: accentColor }}
                  >
                    {data.trainingSummary.title || 'Training'}
                  </h3>
                  <ul className="space-y-1 text-[8px] text-slate-700">
                    {data.trainingSummary.items.map(item => (
                      <li key={item.id} className="flex items-start gap-1">
                        <span style={{ color: accentColor }}>•</span>
                        <span>{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data.languages.enabled && (
                <div>
                  <h3
                    className="text-[10px] font-bold uppercase tracking-[0.15em] pb-1 border-b border-slate-300 mb-2"
                    style={{ fontFamily: tpl.fontFamilyHeading, color: accentColor }}
                  >
                    {data.languages.title || 'Languages'}
                  </h3>
                  {renderLanguagesBlock(false)}
                </div>
              )}
            </aside>
          </div>

          <footer className="px-7 py-2 border-t border-slate-100 flex justify-between text-[7.8px] text-slate-400">
            <span>
              {data.fullName} — {tpl.name} Resume
            </span>
            <span>Page 1 of {1 + photoPagesCount}</span>
          </footer>
        </div>

        {renderSupportingPhotoPages()}
      </div>
    );
  }

  // ============================================================================
  // ARCHITECTURE 4: WEBSITE-ACCENT TWO-COLUMN (Rotterdam, Madrid, Oslo)
  // ============================================================================
  if (tpl.architecture === 'website-accent-two-col') {
    return (
      <div
        id={id}
        className="flex flex-col items-center gap-8 print:gap-0 print:m-0"
        style={{
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'top center',
          fontFamily: tpl.fontFamilyBody,
        }}
      >
        <div
          className="cv-page relative bg-white text-slate-900 shadow-2xl print:shadow-none overflow-hidden flex flex-col"
          style={{ width: '210mm', minHeight: '297mm', height: '297mm', boxSizing: 'border-box' }}
        >
          {/* Top Accent Bar */}
          <div className="h-3 w-full shrink-0" style={{ backgroundColor: accentColor }} />

          <div className="flex-1 flex flex-row items-stretch overflow-hidden">
            {/* Tinted Left Column */}
            <aside
              className="w-[68mm] shrink-0 px-5 py-5 flex flex-col justify-between border-r border-slate-200"
              style={{ backgroundColor: tpl.secondaryBg }}
            >
              <div className="space-y-4">
                <div className="flex flex-col items-start gap-2.5">
                  {showPhoto && renderAvatar('w-22 h-22', 'border-2 border-white shadow')}
                  <div>
                    <h1
                      className="text-[20px] font-extrabold leading-tight text-slate-900"
                      style={{ fontFamily: tpl.fontFamilyHeading }}
                    >
                      {data.fullName}
                    </h1>
                    <div
                      className="text-[9.5px] font-bold uppercase tracking-[0.18em] mt-0.5"
                      style={{ color: accentColor }}
                    >
                      {data.professionalTitle}
                    </div>
                  </div>
                </div>

                {/* Contact Block */}
                <div className="space-y-1 text-[8.3px] text-slate-700 pt-2 border-t border-slate-300/80">
                  {data.location && <div>📍 {data.location}</div>}
                  {data.phone && <div>📞 {data.phone}</div>}
                  {data.email && <div className="truncate">✉️ {data.email}</div>}
                  {data.linkedIn && <div className="truncate">🔗 {data.linkedIn}</div>}
                </div>

                {data.personalInfo.enabled && (
                  <div>
                    <h3
                      className="text-[9.8px] font-bold uppercase tracking-wider mb-1.5"
                      style={{ color: accentColor, fontFamily: tpl.fontFamilyHeading }}
                    >
                      {data.personalInfo.title || 'Personal Details'}
                    </h3>
                    <div className="space-y-1 text-[8.2px]">
                      {data.personalInfo.items.map(item => (
                        <div key={item.id} className="flex justify-between">
                          <span className="text-slate-500">{item.label}:</span>
                          <span className="font-semibold text-slate-800">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {data.skills?.enabled && (
                  <div>
                    <h3
                      className="text-[9.8px] font-bold uppercase tracking-wider mb-1.5"
                      style={{ color: accentColor, fontFamily: tpl.fontFamilyHeading }}
                    >
                      {data.skills.title || 'Skills'}
                    </h3>
                    {renderSkillsBlock(false)}
                  </div>
                )}

                {data.languages.enabled && (
                  <div>
                    <h3
                      className="text-[9.8px] font-bold uppercase tracking-wider mb-1.5"
                      style={{ color: accentColor, fontFamily: tpl.fontFamilyHeading }}
                    >
                      {data.languages.title || 'Languages'}
                    </h3>
                    {renderLanguagesBlock(false)}
                  </div>
                )}

                {data.academicQualifications.enabled && (
                  <div>
                    <h3
                      className="text-[9.8px] font-bold uppercase tracking-wider mb-1.5"
                      style={{ color: accentColor, fontFamily: tpl.fontFamilyHeading }}
                    >
                      {data.academicQualifications.title || 'Education'}
                    </h3>
                    <div className="space-y-1.5 text-[8.2px]">
                      {data.academicQualifications.items.map(item => (
                        <div key={item.id}>
                          <div className="font-bold text-slate-900">{item.degree}</div>
                          <div className="text-slate-600">{item.institution}</div>
                          {item.year && <div className="text-[7.5px] text-slate-500">{item.year}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="text-[7.5px] text-slate-400 pt-2 border-t border-slate-200">
                {tpl.name} Layout · Page 1
              </div>
            </aside>

            {/* Right Main Column */}
            <main className="flex-1 bg-white px-6 py-5 flex flex-col justify-between overflow-hidden">
              <div className="space-y-3.5">
                {data.aboutMe.enabled && (
                  <section className="p-3 rounded-xl" style={{ backgroundColor: tpl.secondaryBg }}>
                    <h2
                      className="text-[10px] font-bold uppercase tracking-[0.15em] mb-1"
                      style={{ color: accentColor, fontFamily: tpl.fontFamilyHeading }}
                    >
                      {data.aboutMe.title || 'Profile Summary'}
                    </h2>
                    <p className="text-[8.6px] leading-[1.42] text-slate-700 text-justify">
                      {data.aboutMe.content}
                    </p>
                  </section>
                )}

                <section>
                  <h2
                    className="text-[11px] font-bold uppercase tracking-[0.15em] pb-1 border-b-2 mb-2"
                    style={{ color: accentColor, borderColor: accentColor, fontFamily: tpl.fontFamilyHeading }}
                  >
                    {data.workExperienceTitle || 'Work Experience'}
                  </h2>
                  <div className="space-y-2.5">
                    {sortedExperiences.slice(0, 5).map(exp =>
                      renderModernExperienceItem(exp, `rot-${exp.id}`, true)
                    )}
                  </div>
                </section>

                {partTimeList.length > 0 && (
                  <section>
                    <h2
                      className="text-[10.5px] font-bold uppercase tracking-[0.15em] pb-1 border-b border-slate-200 mb-1.5"
                      style={{ color: accentColor, fontFamily: tpl.fontFamilyHeading }}
                    >
                      Part-Time Experience
                    </h2>
                    <div className="space-y-2">
                      {partTimeList.map(exp => renderModernExperienceItem(exp, `rot-pt-${exp.id}`, true))}
                    </div>
                  </section>
                )}

                {data.trainingSummary.enabled && (
                  <section>
                    <h2
                      className="text-[10.5px] font-bold uppercase tracking-[0.15em] pb-1 border-b border-slate-200 mb-1.5"
                      style={{ color: accentColor, fontFamily: tpl.fontFamilyHeading }}
                    >
                      {data.trainingSummary.title || 'Courses & Certifications'}
                    </h2>
                    <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[8.2px] text-slate-700">
                      {data.trainingSummary.items.map(item => (
                        <li key={item.id} className="flex items-start gap-1">
                          <span style={{ color: accentColor }}>•</span>
                          <span>{item.text}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>

              <footer className="pt-2 border-t border-slate-100 flex justify-between text-[7.8px] text-slate-400">
                <span>{data.fullName} — Curriculum Vitae</span>
                <span>Page 1 of {1 + photoPagesCount}</span>
              </footer>
            </main>
          </div>
        </div>

        {renderSupportingPhotoPages()}
      </div>
    );
  }

  // ============================================================================
  // ARCHITECTURE 5: SINGLE-COLUMN ATS (Perth, Simple & Clear)
  // ============================================================================
  if (tpl.architecture === 'single-col-ats') {
    return (
      <div
        id={id}
        className="flex flex-col items-center gap-8 print:gap-0 print:m-0"
        style={{
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'top center',
          fontFamily: tpl.fontFamilyBody,
        }}
      >
        <div
          className="cv-page relative bg-white text-slate-900 shadow-2xl print:shadow-none overflow-hidden px-8 py-6 flex flex-col justify-between"
          style={{ width: '210mm', minHeight: '297mm', height: '297mm', boxSizing: 'border-box' }}
        >
          <div className="space-y-3">
            {/* Clean ATS Header */}
            <header
              className="flex items-center justify-between pb-3 border-b-2"
              style={{ borderColor: accentColor }}
            >
              <div className="flex items-center gap-4">
                {showPhoto && renderAvatar('w-16 h-16', 'border border-slate-300')}
                <div>
                  <h1
                    className="text-[24px] font-extrabold tracking-tight text-slate-900 uppercase"
                    style={{ fontFamily: tpl.fontFamilyHeading }}
                  >
                    {data.fullName}
                  </h1>
                  <div
                    className="text-[11px] font-bold uppercase tracking-[0.2em]"
                    style={{ color: accentColor }}
                  >
                    {data.professionalTitle}
                  </div>
                </div>
              </div>
              <div className="text-right text-[8.5px] text-slate-600 space-y-0.5">
                {data.location && <div>{data.location}</div>}
                <div className="font-medium text-slate-800">
                  {[data.phone, data.email].filter(Boolean).join('  •  ')}
                </div>
                {data.linkedIn && <div className="text-slate-500">{data.linkedIn}</div>}
              </div>
            </header>

            {/* Summary + Personal Info Strip */}
            {data.aboutMe.enabled && (
              <section>
                <h2
                  className="text-[10.5px] font-bold uppercase tracking-[0.16em] pb-0.5 border-b mb-1"
                  style={{ color: accentColor, borderColor: `${accentColor}40`, fontFamily: tpl.fontFamilyHeading }}
                >
                  {data.aboutMe.title || 'Professional Summary'}
                </h2>
                <p className="text-[8.6px] leading-[1.4] text-slate-700">{data.aboutMe.content}</p>
              </section>
            )}

            {/* Experience */}
            <section>
              <h2
                className="text-[10.5px] font-bold uppercase tracking-[0.16em] pb-0.5 border-b mb-2"
                style={{ color: accentColor, borderColor: `${accentColor}40`, fontFamily: tpl.fontFamilyHeading }}
              >
                {data.workExperienceTitle || 'Work Experience'}
              </h2>
              <div className="space-y-2">
                {sortedExperiences.slice(0, 5).map(exp =>
                  renderModernExperienceItem(exp, `perth-${exp.id}`, false)
                )}
              </div>
            </section>

            {partTimeList.length > 0 && (
              <section>
                <h2
                  className="text-[10px] font-bold uppercase tracking-[0.16em] pb-0.5 border-b mb-1.5"
                  style={{ color: accentColor, borderColor: `${accentColor}40`, fontFamily: tpl.fontFamilyHeading }}
                >
                  Part-Time Experience
                </h2>
                <div className="space-y-1.5">
                  {partTimeList.map(exp => renderModernExperienceItem(exp, `perth-pt-${exp.id}`, false))}
                </div>
              </section>
            )}

            {/* Skills */}
            {data.skills?.enabled && (
              <section>
                <h2
                  className="text-[10px] font-bold uppercase tracking-[0.16em] pb-0.5 border-b mb-1.5"
                  style={{ color: accentColor, borderColor: `${accentColor}40`, fontFamily: tpl.fontFamilyHeading }}
                >
                  {data.skills.title || 'Key Skills & Competencies'}
                </h2>
                {renderSkillsBlock(false)}
              </section>
            )}

            {/* Bottom 3-Column Grid for Education, Languages, Personal Details */}
            <div className="grid grid-cols-3 gap-4 pt-1">
              {data.academicQualifications.enabled && (
                <section>
                  <h2
                    className="text-[9.5px] font-bold uppercase tracking-wider pb-0.5 border-b mb-1"
                    style={{ color: accentColor, borderColor: `${accentColor}40` }}
                  >
                    {data.academicQualifications.title || 'Education'}
                  </h2>
                  <div className="space-y-1 text-[8px]">
                    {data.academicQualifications.items.map(item => (
                      <div key={item.id}>
                        <div className="font-bold text-slate-900">{item.degree}</div>
                        <div className="text-slate-600">{item.institution}</div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {data.languages.enabled && (
                <section>
                  <h2
                    className="text-[9.5px] font-bold uppercase tracking-wider pb-0.5 border-b mb-1"
                    style={{ color: accentColor, borderColor: `${accentColor}40` }}
                  >
                    {data.languages.title || 'Languages'}
                  </h2>
                  <div className="space-y-0.5 text-[8px]">
                    {data.languages.items.map(item => (
                      <div key={item.id} className="flex justify-between">
                        <span className="font-semibold">{item.language}</span>
                        <span className="text-slate-500">{item.proficiency}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {data.personalInfo.enabled && (
                <section>
                  <h2
                    className="text-[9.5px] font-bold uppercase tracking-wider pb-0.5 border-b mb-1"
                    style={{ color: accentColor, borderColor: `${accentColor}40` }}
                  >
                    {data.personalInfo.title || 'Details'}
                  </h2>
                  <div className="space-y-0.5 text-[8px]">
                    {data.personalInfo.items.slice(0, 5).map(item => (
                      <div key={item.id} className="flex justify-between">
                        <span className="text-slate-500">{item.label}:</span>
                        <span className="font-semibold">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>

          <footer className="pt-2 border-t border-slate-100 flex justify-between text-[7.8px] text-slate-400">
            <span>
              {data.fullName} — {tpl.name} ATS Resume
            </span>
            <span>Page 1 of {1 + photoPagesCount}</span>
          </footer>
        </div>

        {renderSupportingPhotoPages()}
      </div>
    );
  }

  // ============================================================================
  // ARCHITECTURE 6: RIGHT DARK SIDEBAR MODERN (Sydney, Helsinki)
  // ============================================================================
  if (tpl.architecture === 'right-sidebar-modern') {
    return (
      <div
        id={id}
        className="flex flex-col items-center gap-8 print:gap-0 print:m-0"
        style={{
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'top center',
          fontFamily: tpl.fontFamilyBody,
        }}
      >
        <div
          className="cv-page relative bg-white text-slate-900 shadow-2xl print:shadow-none overflow-hidden flex flex-row items-stretch"
          style={{ width: '210mm', minHeight: '297mm', height: '297mm', boxSizing: 'border-box' }}
        >
          {/* Left Main Content Column (66%) */}
          <main className="flex-1 bg-white px-6 py-6 flex flex-col justify-between overflow-hidden">
            <div className="space-y-3.5">
              <header className="pb-3 border-b-2" style={{ borderColor: accentColor }}>
                <h1
                  className="text-[26px] font-extrabold tracking-tight text-slate-900"
                  style={{ fontFamily: tpl.fontFamilyHeading }}
                >
                  {data.fullName}
                </h1>
                <div
                  className="text-[11px] font-bold uppercase tracking-[0.2em] mt-0.5"
                  style={{ color: accentColor }}
                >
                  {data.professionalTitle}
                </div>
                {data.aboutMe.enabled && (
                  <p className="text-[8.6px] leading-[1.42] text-slate-600 mt-2 text-justify">
                    {data.aboutMe.content}
                  </p>
                )}
              </header>

              <section>
                <h2
                  className="text-[11px] font-bold uppercase tracking-[0.16em] mb-2"
                  style={{ color: accentColor, fontFamily: tpl.fontFamilyHeading }}
                >
                  {data.workExperienceTitle || 'Employment History'}
                </h2>
                <div className="space-y-2.5">
                  {sortedExperiences.slice(0, 5).map(exp =>
                    renderModernExperienceItem(exp, `syd-${exp.id}`, true)
                  )}
                </div>
              </section>

              {partTimeList.length > 0 && (
                <section>
                  <h2
                    className="text-[10.5px] font-bold uppercase tracking-[0.16em] mb-1.5"
                    style={{ color: accentColor, fontFamily: tpl.fontFamilyHeading }}
                  >
                    Part-Time Experience
                  </h2>
                  <div className="space-y-2">
                    {partTimeList.map(exp => renderModernExperienceItem(exp, `syd-pt-${exp.id}`, true))}
                  </div>
                </section>
              )}

              {data.academicQualifications.enabled && (
                <section>
                  <h2
                    className="text-[10.5px] font-bold uppercase tracking-[0.16em] mb-1.5"
                    style={{ color: accentColor, fontFamily: tpl.fontFamilyHeading }}
                  >
                    {data.academicQualifications.title || 'Education'}
                  </h2>
                  <div className="grid grid-cols-2 gap-3 text-[8.4px]">
                    {data.academicQualifications.items.map(item => (
                      <div key={item.id}>
                        <div className="font-bold text-slate-900">{item.degree}</div>
                        <div className="text-slate-600">{item.institution}</div>
                        {item.year && <div className="text-[7.5px] text-slate-400">{item.year}</div>}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <footer className="pt-2 border-t border-slate-100 flex justify-between text-[7.8px] text-slate-400">
              <span>
                {data.fullName} — {tpl.name} Resume
              </span>
              <span>Page 1 of {1 + photoPagesCount}</span>
            </footer>
          </main>

          {/* Right Dark Sidebar (34%) */}
          <aside
            className="w-[70mm] shrink-0 text-white px-5 py-6 flex flex-col justify-between"
            style={{ backgroundColor: accentColor }}
          >
            <div className="space-y-4">
              {showPhoto && (
                <div className="flex flex-col items-center">
                  {renderAvatar('w-24 h-24', 'border-2 border-white/90')}
                </div>
              )}

              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/90 pb-1 border-b border-white/20 mb-2">
                  Details
                </h3>
                <div className="space-y-1 text-[8.3px] text-white/90">
                  {data.location && <div>📍 {data.location}</div>}
                  {data.phone && <div>📞 {data.phone}</div>}
                  {data.email && <div className="truncate">✉️ {data.email}</div>}
                  {data.linkedIn && <div className="truncate">🔗 {data.linkedIn}</div>}
                </div>
              </div>

              {data.personalInfo.enabled && (
                <div>
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/90 pb-1 border-b border-white/20 mb-2">
                    {data.personalInfo.title || 'Personal Info'}
                  </h3>
                  <div className="space-y-1 text-[8.2px] text-white/90">
                    {data.personalInfo.items.map(item => (
                      <div key={item.id} className="flex justify-between">
                        <span className="text-white/70">{item.label}:</span>
                        <span className="font-semibold">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.skills?.enabled && (
                <div>
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/90 pb-1 border-b border-white/20 mb-2">
                    {data.skills.title || 'Skills'}
                  </h3>
                  {renderSkillsBlock(true)}
                </div>
              )}

              {data.languages.enabled && (
                <div>
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/90 pb-1 border-b border-white/20 mb-2">
                    {data.languages.title || 'Languages'}
                  </h3>
                  {renderLanguagesBlock(true)}
                </div>
              )}

              {data.trainingSummary.enabled && (
                <div>
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/90 pb-1 border-b border-white/20 mb-2">
                    {data.trainingSummary.title || 'Certifications'}
                  </h3>
                  <ul className="space-y-1 text-[8px] text-white/85">
                    {data.trainingSummary.items.map(item => (
                      <li key={item.id}>• {item.text}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="text-[7.5px] text-white/50 text-center pt-2 border-t border-white/15">
              {tpl.name} · Page 1
            </div>
          </aside>
        </div>

        {renderSupportingPhotoPages()}
      </div>
    );
  }

  // ============================================================================
  // ARCHITECTURE 7: EXECUTIVE SERIF (Chicago, Boston, London)
  // ============================================================================
  if (tpl.architecture === 'executive-serif') {
    const isBoston = tpl.id === 'boston';
    return (
      <div
        id={id}
        className="flex flex-col items-center gap-8 print:gap-0 print:m-0"
        style={{
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'top center',
          fontFamily: tpl.fontFamilyBody,
        }}
      >
        <div
          className="cv-page relative bg-white text-slate-900 shadow-2xl print:shadow-none overflow-hidden px-8 py-6 flex flex-col justify-between"
          style={{ width: '210mm', minHeight: '297mm', height: '297mm', boxSizing: 'border-box' }}
        >
          <div className="space-y-3">
            {/* Classic Centered Executive Header */}
            <header className="text-center pb-3 border-b-2" style={{ borderColor: accentColor }}>
              <div className="flex items-center justify-center gap-4">
                {showPhoto && renderAvatar('w-16 h-16', 'border border-slate-300')}
                <div>
                  <h1
                    className="text-[25px] font-bold tracking-wide uppercase"
                    style={{ fontFamily: tpl.fontFamilyHeading, color: accentColor }}
                  >
                    {data.fullName}
                  </h1>
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-slate-600 mt-0.5">
                    {data.professionalTitle}
                  </div>
                  <div className="text-[8.4px] text-slate-600 mt-1.5 flex flex-wrap items-center justify-center gap-x-3">
                    {data.location && <span>{data.location}</span>}
                    {data.phone && <span>• {data.phone}</span>}
                    {data.email && <span>• {data.email}</span>}
                    {data.linkedIn && <span>• {data.linkedIn}</span>}
                  </div>
                </div>
              </div>
            </header>

            {data.aboutMe.enabled && (
              <section>
                <h2
                  className={`text-[10.5px] font-bold uppercase tracking-[0.18em] mb-1 ${
                    isBoston ? 'px-2 py-0.5' : 'border-b pb-0.5'
                  }`}
                  style={{
                    fontFamily: tpl.fontFamilyHeading,
                    color: accentColor,
                    backgroundColor: isBoston ? tpl.secondaryBg : undefined,
                    borderColor: accentColor,
                  }}
                >
                  {data.aboutMe.title || 'Executive Summary'}
                </h2>
                <p className="text-[8.6px] leading-[1.42] text-slate-700 text-justify">
                  {data.aboutMe.content}
                </p>
              </section>
            )}

            <section>
              <h2
                className={`text-[10.5px] font-bold uppercase tracking-[0.18em] mb-2 ${
                  isBoston ? 'px-2 py-0.5' : 'border-b pb-0.5'
                }`}
                style={{
                  fontFamily: tpl.fontFamilyHeading,
                  color: accentColor,
                  backgroundColor: isBoston ? tpl.secondaryBg : undefined,
                  borderColor: accentColor,
                }}
              >
                {data.workExperienceTitle || 'Professional Experience'}
              </h2>
              <div className="space-y-2.5">
                {sortedExperiences.slice(0, 5).map(exp =>
                  renderModernExperienceItem(exp, `exec-${exp.id}`, false)
                )}
              </div>
            </section>

            {partTimeList.length > 0 && (
              <section>
                <h2
                  className={`text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5 ${
                    isBoston ? 'px-2 py-0.5' : 'border-b pb-0.5'
                  }`}
                  style={{
                    fontFamily: tpl.fontFamilyHeading,
                    color: accentColor,
                    backgroundColor: isBoston ? tpl.secondaryBg : undefined,
                    borderColor: accentColor,
                  }}
                >
                  Additional Hospitality Experience
                </h2>
                <div className="space-y-1.5">
                  {partTimeList.map(exp => renderModernExperienceItem(exp, `exec-pt-${exp.id}`, false))}
                </div>
              </section>
            )}

            {data.skills?.enabled && (
              <section>
                <h2
                  className={`text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5 ${
                    isBoston ? 'px-2 py-0.5' : 'border-b pb-0.5'
                  }`}
                  style={{
                    fontFamily: tpl.fontFamilyHeading,
                    color: accentColor,
                    backgroundColor: isBoston ? tpl.secondaryBg : undefined,
                    borderColor: accentColor,
                  }}
                >
                  {data.skills.title || 'Areas of Expertise'}
                </h2>
                {renderSkillsBlock(false)}
              </section>
            )}

            <div className="grid grid-cols-3 gap-4 pt-1">
              {data.academicQualifications.enabled && (
                <section>
                  <h3
                    className="text-[9.5px] font-bold uppercase tracking-wider border-b pb-0.5 mb-1"
                    style={{ fontFamily: tpl.fontFamilyHeading, color: accentColor }}
                  >
                    {data.academicQualifications.title || 'Education'}
                  </h3>
                  <div className="space-y-1 text-[8px]">
                    {data.academicQualifications.items.map(item => (
                      <div key={item.id}>
                        <div className="font-bold">{item.degree}</div>
                        <div className="text-slate-600">{item.institution}</div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {data.trainingSummary.enabled && (
                <section>
                  <h3
                    className="text-[9.5px] font-bold uppercase tracking-wider border-b pb-0.5 mb-1"
                    style={{ fontFamily: tpl.fontFamilyHeading, color: accentColor }}
                  >
                    {data.trainingSummary.title || 'Certifications'}
                  </h3>
                  <ul className="space-y-0.5 text-[8px] text-slate-700">
                    {data.trainingSummary.items.slice(0, 4).map(item => (
                      <li key={item.id}>• {item.text}</li>
                    ))}
                  </ul>
                </section>
              )}

              {data.languages.enabled && (
                <section>
                  <h3
                    className="text-[9.5px] font-bold uppercase tracking-wider border-b pb-0.5 mb-1"
                    style={{ fontFamily: tpl.fontFamilyHeading, color: accentColor }}
                  >
                    {data.languages.title || 'Languages & Details'}
                  </h3>
                  <div className="space-y-0.5 text-[8px]">
                    {data.languages.items.map(item => (
                      <div key={item.id} className="flex justify-between">
                        <span className="font-semibold">{item.language}</span>
                        <span className="text-slate-500">{item.proficiency}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>

          <footer className="pt-2 border-t border-slate-200 flex justify-between text-[7.8px] text-slate-400">
            <span>
              {data.fullName} — {tpl.name} Executive CV
            </span>
            <span>Page 1 of {1 + photoPagesCount}</span>
          </footer>
        </div>

        {renderSupportingPhotoPages()}
      </div>
    );
  }

  // ============================================================================
  // ARCHITECTURE 8: SWISS LEFT-RAIL GRID (Geneva)
  // ============================================================================
  if (tpl.architecture === 'swiss-left-rail') {
    return (
      <div
        id={id}
        className="flex flex-col items-center gap-8 print:gap-0 print:m-0"
        style={{
          transform: scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'top center',
          fontFamily: tpl.fontFamilyBody,
        }}
      >
        <div
          className="cv-page relative bg-white text-slate-900 shadow-2xl print:shadow-none overflow-hidden px-8 py-6 flex flex-col justify-between"
          style={{ width: '210mm', minHeight: '297mm', height: '297mm', boxSizing: 'border-box' }}
        >
          <div className="space-y-3.5">
            {/* Swiss Grid Header */}
            <header className="grid grid-cols-12 gap-4 items-center pb-3 border-b-2" style={{ borderColor: accentColor }}>
              <div className="col-span-3 flex items-center gap-2">
                {showPhoto && renderAvatar('w-18 h-18', 'border border-slate-300')}
              </div>
              <div className="col-span-9 flex items-start justify-between">
                <div>
                  <h1 className="text-[24px] font-black tracking-tight text-slate-900 uppercase">
                    {data.fullName}
                  </h1>
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.2em]" style={{ color: accentColor }}>
                    {data.professionalTitle}
                  </div>
                </div>
                <div className="text-right text-[8.2px] text-slate-600 space-y-0.5">
                  {data.location && <div>{data.location}</div>}
                  {data.phone && <div>{data.phone}</div>}
                  {data.email && <div>{data.email}</div>}
                </div>
              </div>
            </header>

            {/* Row 1: Profile */}
            {data.aboutMe.enabled && (
              <div className="grid grid-cols-12 gap-4 pt-1">
                <div className="col-span-3">
                  <h2 className="text-[9.5px] font-extrabold uppercase tracking-wider" style={{ color: accentColor }}>
                    {data.aboutMe.title || 'Profile'}
                  </h2>
                </div>
                <div className="col-span-9 text-[8.6px] leading-[1.42] text-slate-700">
                  {data.aboutMe.content}
                </div>
              </div>
            )}

            {/* Row 2: Experience */}
            <div className="grid grid-cols-12 gap-4 pt-2 border-t border-slate-200">
              <div className="col-span-3">
                <h2 className="text-[9.5px] font-extrabold uppercase tracking-wider" style={{ color: accentColor }}>
                  {data.workExperienceTitle || 'Experience'}
                </h2>
              </div>
              <div className="col-span-9 space-y-2.5">
                {sortedExperiences.slice(0, 5).map(exp =>
                  renderModernExperienceItem(exp, `gen-${exp.id}`, false)
                )}
              </div>
            </div>

            {/* Row 3: Skills */}
            {data.skills?.enabled && (
              <div className="grid grid-cols-12 gap-4 pt-2 border-t border-slate-200">
                <div className="col-span-3">
                  <h2 className="text-[9.5px] font-extrabold uppercase tracking-wider" style={{ color: accentColor }}>
                    {data.skills.title || 'Skills'}
                  </h2>
                </div>
                <div className="col-span-9">{renderSkillsBlock(false)}</div>
              </div>
            )}

            {/* Row 4: Education & Languages */}
            <div className="grid grid-cols-12 gap-4 pt-2 border-t border-slate-200">
              <div className="col-span-3">
                <h2 className="text-[9.5px] font-extrabold uppercase tracking-wider" style={{ color: accentColor }}>
                  Credentials & Languages
                </h2>
              </div>
              <div className="col-span-9 grid grid-cols-3 gap-4 text-[8.2px]">
                {data.academicQualifications.enabled && (
                  <div>
                    <div className="font-bold text-slate-900 mb-1">Education</div>
                    {data.academicQualifications.items.map(item => (
                      <div key={item.id} className="mb-1">
                        <div className="font-semibold">{item.degree}</div>
                        <div className="text-slate-500">{item.institution}</div>
                      </div>
                    ))}
                  </div>
                )}
                {data.languages.enabled && (
                  <div>
                    <div className="font-bold text-slate-900 mb-1">Languages</div>
                    {data.languages.items.map(item => (
                      <div key={item.id} className="flex justify-between">
                        <span>{item.language}</span>
                        <span className="text-slate-500">{item.proficiency}</span>
                      </div>
                    ))}
                  </div>
                )}
                {data.personalInfo.enabled && (
                  <div>
                    <div className="font-bold text-slate-900 mb-1">Personal Info</div>
                    {data.personalInfo.items.slice(0, 4).map(item => (
                      <div key={item.id}>
                        <span className="text-slate-500">{item.label}: </span>
                        <span className="font-semibold">{item.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <footer className="pt-2 border-t border-slate-100 flex justify-between text-[7.8px] text-slate-400">
            <span>
              {data.fullName} — {tpl.name} Swiss Grid CV
            </span>
            <span>Page 1 of {1 + photoPagesCount}</span>
          </footer>
        </div>

        {renderSupportingPhotoPages()}
      </div>
    );
  }

  // ============================================================================
  // ARCHITECTURE 9 & 10: ICON-BADGE TWO-COL & MINIMAL ACCENT BORDER
  // (Crisp, Vienna, Coral, Modern Writer)
  // ============================================================================
  return (
    <div
      id={id}
      className="flex flex-col items-center gap-8 print:gap-0 print:m-0"
      style={{
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: 'top center',
        fontFamily: tpl.fontFamilyBody,
      }}
    >
      <div
        className="cv-page relative bg-white text-slate-900 shadow-2xl print:shadow-none overflow-hidden px-7 py-6 flex flex-col justify-between"
        style={{ width: '210mm', minHeight: '297mm', height: '297mm', boxSizing: 'border-box' }}
      >
        <div className="space-y-4">
          {/* Header Card */}
          <header
            className="p-4 rounded-2xl flex items-center justify-between gap-4 border"
            style={{
              backgroundColor: tpl.secondaryBg,
              borderColor: `${accentColor}30`,
            }}
          >
            <div className="flex items-center gap-4">
              {showPhoto && renderAvatar('w-20 h-20', 'border-2 border-white shadow')}
              <div>
                <h1
                  className="text-[24px] font-extrabold tracking-tight leading-none"
                  style={{ fontFamily: tpl.fontFamilyHeading, color: accentColor }}
                >
                  {data.fullName}
                </h1>
                <div className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-slate-600 mt-1">
                  {data.professionalTitle}
                </div>
                {data.aboutMe.enabled && (
                  <p className="text-[8.4px] leading-[1.38] text-slate-600 mt-1.5 max-w-[420px]">
                    {data.aboutMe.content}
                  </p>
                )}
              </div>
            </div>

            <div className="text-right space-y-1 text-[8.3px] text-slate-700 shrink-0">
              {data.location && <div>📍 {data.location}</div>}
              {data.phone && <div className="font-mono">📞 {data.phone}</div>}
              {data.email && <div>✉️ {data.email}</div>}
              {data.linkedIn && <div className="truncate max-w-[170px]">🔗 {data.linkedIn}</div>}
            </div>
          </header>

          {/* Two-Column Body */}
          <div className="grid grid-cols-12 gap-5">
            {/* Left 8 Cols: Experience */}
            <div className="col-span-8 space-y-3.5">
              <section>
                <div className="flex items-center gap-2 pb-1 border-b-2 mb-2" style={{ borderColor: accentColor }}>
                  <span
                    className="w-5 h-5 rounded-md flex items-center justify-center text-white"
                    style={{ backgroundColor: accentColor }}
                  >
                    <Briefcase className="w-3 h-3" />
                  </span>
                  <h2
                    className="text-[11px] font-bold uppercase tracking-[0.16em]"
                    style={{ fontFamily: tpl.fontFamilyHeading, color: accentColor }}
                  >
                    {data.workExperienceTitle || 'Work Experience'}
                  </h2>
                </div>
                <div className="space-y-2.5">
                  {sortedExperiences.slice(0, 5).map(exp =>
                    renderModernExperienceItem(exp, `crisp-${exp.id}`, true)
                  )}
                </div>
              </section>

              {partTimeList.length > 0 && (
                <section>
                  <h3
                    className="text-[10px] font-bold uppercase tracking-[0.15em] pb-1 border-b border-slate-200 mb-1.5"
                    style={{ fontFamily: tpl.fontFamilyHeading, color: accentColor }}
                  >
                    Part-Time Experience
                  </h3>
                  <div className="space-y-2">
                    {partTimeList.map(exp => renderModernExperienceItem(exp, `crisp-pt-${exp.id}`, true))}
                  </div>
                </section>
              )}
            </div>

            {/* Right 4 Cols: Personal Info, Skills, Education, Languages */}
            <aside className="col-span-4 space-y-3.5">
              {data.personalInfo.enabled && (
                <section>
                  <div className="flex items-center gap-1.5 pb-1 border-b border-slate-200 mb-1.5">
                    <User className="w-3.5 h-3.5" style={{ color: accentColor }} />
                    <h3
                      className="text-[9.8px] font-bold uppercase tracking-wider"
                      style={{ fontFamily: tpl.fontFamilyHeading, color: accentColor }}
                    >
                      {data.personalInfo.title || 'Personal Info'}
                    </h3>
                  </div>
                  <div className="space-y-1 text-[8.2px]">
                    {data.personalInfo.items.map(item => (
                      <div key={item.id} className="flex justify-between">
                        <span className="text-slate-500">{item.label}:</span>
                        <span className="font-semibold text-slate-800">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {data.skills?.enabled && (
                <section>
                  <div className="flex items-center gap-1.5 pb-1 border-b border-slate-200 mb-1.5">
                    <Award className="w-3.5 h-3.5" style={{ color: accentColor }} />
                    <h3
                      className="text-[9.8px] font-bold uppercase tracking-wider"
                      style={{ fontFamily: tpl.fontFamilyHeading, color: accentColor }}
                    >
                      {data.skills.title || 'Skills'}
                    </h3>
                  </div>
                  {renderSkillsBlock(false)}
                </section>
              )}

              {data.academicQualifications.enabled && (
                <section>
                  <div className="flex items-center gap-1.5 pb-1 border-b border-slate-200 mb-1.5">
                    <GraduationCap className="w-3.5 h-3.5" style={{ color: accentColor }} />
                    <h3
                      className="text-[9.8px] font-bold uppercase tracking-wider"
                      style={{ fontFamily: tpl.fontFamilyHeading, color: accentColor }}
                    >
                      {data.academicQualifications.title || 'Education'}
                    </h3>
                  </div>
                  <div className="space-y-1.5 text-[8.2px]">
                    {data.academicQualifications.items.map(item => (
                      <div key={item.id}>
                        <div className="font-bold text-slate-900">{item.degree}</div>
                        <div className="text-slate-600">{item.institution}</div>
                        {item.year && <div className="text-[7.5px] text-slate-400">{item.year}</div>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {data.trainingSummary.enabled && (
                <section>
                  <h3
                    className="text-[9.8px] font-bold uppercase tracking-wider pb-1 border-b border-slate-200 mb-1.5"
                    style={{ fontFamily: tpl.fontFamilyHeading, color: accentColor }}
                  >
                    {data.trainingSummary.title || 'Training'}
                  </h3>
                  <ul className="space-y-1 text-[8px] text-slate-700">
                    {data.trainingSummary.items.map(item => (
                      <li key={item.id} className="flex items-start gap-1">
                        <span style={{ color: accentColor }}>•</span>
                        <span>{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {data.languages.enabled && (
                <section>
                  <h3
                    className="text-[9.8px] font-bold uppercase tracking-wider pb-1 border-b border-slate-200 mb-1.5"
                    style={{ fontFamily: tpl.fontFamilyHeading, color: accentColor }}
                  >
                    {data.languages.title || 'Languages'}
                  </h3>
                  {renderLanguagesBlock(false)}
                </section>
              )}
            </aside>
          </div>
        </div>

        <footer className="pt-2 border-t border-slate-100 flex justify-between text-[7.8px] text-slate-400">
          <span>
            {data.fullName} — {tpl.name} Resume
          </span>
          <span>Page 1 of {1 + photoPagesCount}</span>
        </footer>
      </div>

      {renderSupportingPhotoPages()}
    </div>
  );
};
