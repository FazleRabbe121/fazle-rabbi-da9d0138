import React, { useState, useMemo } from 'react';
import { CVData, CVDesignTemplateId, CVDocumentItem, CVTemplateType } from '../types/cv';
import {
  RESUME_EXAMPLE_TEMPLATES,
  RESUME_EXAMPLE_ACCENT_SWATCHES,
  ResumeExampleTemplateDefinition,
  getResumeTemplateById,
} from '../services/resumeExampleTemplates';
import { CVDocument } from './CVDocument';
import { exportCVToPDF, exportCVToDOCX } from '../services/pdfExporter';
import { useTheme } from '../context/ThemeContext';
import {
  Layout,
  CheckCircle,
  Eye,
  Plus,
  Edit3,
  Download,
  Palette,
  Search,
  FileText,
  Sparkles,
  X,
  Info,
  Camera,
  Check,
} from 'lucide-react';

interface CVTemplateSelectorSectionProps {
  library: CVDocumentItem[];
  activeCvId: string;
  onApplyTemplateToCV: (
    cvId: string,
    templateId: CVDesignTemplateId,
    accentColor?: string,
    openEditorAfter?: boolean
  ) => void;
  onCreateNewCVWithTemplate: (
    title: string,
    rolePreset: CVTemplateType,
    templateId: CVDesignTemplateId,
    accentColor?: string
  ) => void;
  onTogglePhotoPreference?: (cvId: string, showPhoto: boolean) => void;
}

export const CVTemplateSelectorSection: React.FC<CVTemplateSelectorSectionProps> = ({
  library,
  activeCvId,
  onApplyTemplateToCV,
  onCreateNewCVWithTemplate,
  onTogglePhotoPreference,
}) => {
  const { theme } = useTheme();

  const [targetCvId, setTargetCvId] = useState<string>(activeCvId || library[0]?.id || '');
  const [categoryFilter, setCategoryFilter] = useState<
    'all' | 'two-column' | 'banner' | 'single-ats' | 'executive' | 'european'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [customAccentColor, setCustomAccentColor] = useState<string | undefined>(undefined);
  const [previewModalTemplate, setPreviewModalTemplate] =
    useState<ResumeExampleTemplateDefinition | null>(null);
  const [createModalTemplate, setCreateModalTemplate] =
    useState<ResumeExampleTemplateDefinition | null>(null);
  const [newCvTitle, setNewCvTitle] = useState('');
  const [newCvRolePreset, setNewCvRolePreset] = useState<CVTemplateType>('bartender');
  const [isExportingModalPDF, setIsExportingModalPDF] = useState(false);
  const [showInspectionReport, setShowInspectionReport] = useState(false);

  // Sync targetCvId if activeCvId changes externally
  React.useEffect(() => {
    if (activeCvId && library.some(c => c.id === activeCvId)) {
      setTargetCvId(activeCvId);
    }
  }, [activeCvId, library]);

  const targetCV = useMemo(() => {
    return library.find(c => c.id === targetCvId) || library[0];
  }, [library, targetCvId]);

  const activeTemplateId: CVDesignTemplateId =
    targetCV?.data?.designTemplateId || targetCV?.designTemplateId || 'classic-hospitality';

  const currentTemplateDef = useMemo(
    () => getResumeTemplateById(activeTemplateId),
    [activeTemplateId]
  );

  const showPhoto = targetCV?.data?.showProfilePhoto !== false;

  const filteredTemplates = useMemo(() => {
    return RESUME_EXAMPLE_TEMPLATES.filter(tpl => {
      if (categoryFilter !== 'all' && tpl.category !== categoryFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          tpl.name.toLowerCase().includes(q) ||
          tpl.tagline.toLowerCase().includes(q) ||
          tpl.features.some(f => f.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [categoryFilter, searchQuery]);

  const handleDownloadFromModalPDF = async () => {
    if (!previewModalTemplate || !targetCV) return;
    setIsExportingModalPDF(true);
    try {
      const safeName = `${targetCV.title.replace(/[^a-zA-Z0-9]/g, '_')}_${previewModalTemplate.id}.pdf`;
      await exportCVToPDF('cv-template-modal-print-area', safeName);
    } finally {
      setIsExportingModalPDF(false);
    }
  };

  const handleDownloadFromModalDOCX = () => {
    if (!previewModalTemplate || !targetCV) return;
    const effectiveAccent =
      customAccentColor || targetCV.data.templateAccentColor || previewModalTemplate.defaultAccent;
    const dataWithDesign: CVData = {
      ...targetCV.data,
      designTemplateId: previewModalTemplate.id,
      templateAccentColor: effectiveAccent,
    };
    const safeName = `${targetCV.title.replace(/[^a-zA-Z0-9]/g, '_')}_${previewModalTemplate.id}.doc`;
    exportCVToDOCX(dataWithDesign, safeName);
  };

  return (
    <div className="space-y-6">
      {/* ================================================================= */}
      {/* HEADER & TARGET CV CONTROL BAR                                    */}
      {/* ================================================================= */}
      <div
        className={`rounded-3xl p-5 sm:p-6 border transition-all ${
          theme === 'dark'
            ? 'bg-gradient-to-br from-[#121726] via-[#0f1320] to-[#0b0e17] border-slate-800'
            : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-600 dark:text-amber-300 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1">
                <Layout className="w-3 h-3" />
                <span>Select CV Template</span>
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-300 text-[11px] font-semibold">
                {RESUME_EXAMPLE_TEMPLATES.length} Functional Templates Ready
              </span>
              <button
                onClick={() => setShowInspectionReport(!showInspectionReport)}
                className="text-[11px] font-semibold text-blue-500 hover:underline flex items-center gap-1"
              >
                <Info className="w-3.5 h-3.5" />
                <span>{showInspectionReport ? 'Hide Source Report' : 'Resume-Example.com Inspection Report'}</span>
              </button>
            </div>

            <h3
              className={`font-['Montserrat'] font-extrabold text-xl sm:text-2xl tracking-tight ${
                theme === 'dark' ? 'text-white' : 'text-slate-900'
              }`}
            >
              Select CV Template & Live Layout Switcher
            </h3>
            <p
              className={`text-xs sm:text-sm mt-1 max-w-3xl ${
                theme === 'dark' ? 'text-slate-300' : 'text-slate-600'
              }`}
            >
              Switch between any recreated{' '}
              <span className="font-semibold text-amber-500">resume-example.com/builder</span> template
              at any time. Changing the template updates your visual presentation immediately while{' '}
              <span className="font-semibold text-emerald-500">
                100% preserving your saved CV content
              </span>
              .
            </p>
          </div>

          {/* Target CV Selector & Active Template Status */}
          <div
            className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0 ${
              theme === 'dark' ? 'bg-[#0b0e17] border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Apply Template To Saved CV:
              </label>
              <select
                value={targetCvId}
                onChange={e => setTargetCvId(e.target.value)}
                className={`w-full sm:w-60 px-3 py-1.5 rounded-xl text-xs font-bold outline-none border ${
                  theme === 'dark'
                    ? 'bg-[#151a2a] border-slate-700 text-white'
                    : 'bg-white border-slate-300 text-slate-900'
                }`}
              >
                {library.map(cv => (
                  <option key={cv.id} value={cv.id}>
                    {cv.title} ({getResumeTemplateById(cv.data?.designTemplateId || cv.designTemplateId).name})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 pt-2 sm:pt-0 sm:pl-3 sm:border-l border-slate-700/30">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Active Design
                </div>
                <div className="text-xs font-extrabold text-amber-500 flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{
                      backgroundColor:
                        targetCV?.data?.templateAccentColor || currentTemplateDef.defaultAccent,
                    }}
                  />
                  <span>{currentTemplateDef.name}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Inspection Report Collapsible Box */}
        {showInspectionReport && (
          <div
            className={`mt-4 p-4 rounded-2xl border text-xs space-y-2 ${
              theme === 'dark'
                ? 'bg-blue-950/25 border-blue-500/30 text-slate-200'
                : 'bg-blue-50/70 border-blue-200 text-slate-700'
            }`}
          >
            <div className="font-bold text-blue-500 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              <span>Reference Website Inspection Summary (https://resume-example.com/builder)</span>
            </div>
            <p className="leading-relaxed">
              • <strong>Public Gallery & Builder Bundle Templates Recreated (20 Templates)</strong>:{' '}
              <em>
                Budapest, Riga, Rotterdam, Perth, Sydney, Chicago, Crisp, Coral, Modern Writer, Prague,
                Vienna, Berlin (With/Without Photo), Madrid (With/Without Photo), London, Boston
                (With/Without Photo), Geneva, Oslo, Helsinki, Dubai, and Simple & Clear
              </em>
              , plus your original <em>Classic Hospitality</em> layout (21 total).
            </p>
            <p className="leading-relaxed">
              • <strong>Subscription / Login Access Report</strong>: On{' '}
              <code>resume-example.com/builder</code>, all 20 template structures and style definitions are
              accessible inside the client builder bundle, while final PDF and DOCX file downloads on the
              reference site are locked behind a paid checkout subscription. In your application, all 21
              templates are <strong>100% unlocked</strong> with direct high-resolution A4 PDF and Word DOCX
              export.
            </p>
          </div>
        )}

        {/* ================================================================= */}
        {/* FILTER TABS, ACCENT COLOR PICKER & PHOTO TOGGLE                   */}
        {/* ================================================================= */}
        <div className="mt-5 pt-4 border-t border-slate-200/70 dark:border-slate-800 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4">
          {/* Category Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: `All Templates (${RESUME_EXAMPLE_TEMPLATES.length})` },
              { id: 'two-column', label: 'Two-Column Sidebar' },
              { id: 'banner', label: 'Top Hero Banner' },
              { id: 'single-ats', label: 'Single-Column ATS' },
              { id: 'executive', label: 'Executive & Serif' },
              { id: 'european', label: 'European & Swiss' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setCategoryFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  categoryFilter === tab.id
                    ? 'bg-[#d4af37] text-slate-950 shadow-xs'
                    : theme === 'dark'
                    ? 'bg-slate-800/80 hover:bg-slate-800 text-slate-300'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Right Controls: Accent Color Swatches, Photo Toggle & Search */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Accent Color Swatches */}
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/70 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <Palette className="w-3.5 h-3.5 text-amber-500 mr-1" />
              <button
                onClick={() => {
                  setCustomAccentColor(undefined);
                  if (targetCV) {
                    const tpl = getResumeTemplateById(activeTemplateId);
                    onApplyTemplateToCV(targetCV.id, activeTemplateId, tpl.defaultAccent, false);
                  }
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                  !customAccentColor
                    ? 'bg-amber-500 text-slate-950'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                }`}
                title="Use each template's default signature color"
              >
                Default
              </button>
              {RESUME_EXAMPLE_ACCENT_SWATCHES.map(swatch => {
                const isSelected = customAccentColor === swatch.hex;
                return (
                  <button
                    key={swatch.hex}
                    onClick={() => {
                      setCustomAccentColor(swatch.hex);
                      if (targetCV) {
                        onApplyTemplateToCV(targetCV.id, activeTemplateId, swatch.hex, false);
                      }
                    }}
                    className={`w-4 h-4 rounded-full transition transform flex items-center justify-center ${
                      isSelected ? 'scale-125 ring-2 ring-amber-400' : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: swatch.hex }}
                    title={`Accent Color: ${swatch.name}`}
                  >
                    {isSelected && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                  </button>
                );
              })}
            </div>

            {/* With / Without Photo Toggle (for Berlin, Boston, Madrid, etc.) */}
            {onTogglePhotoPreference && targetCV && (
              <button
                onClick={() => onTogglePhotoPreference(targetCV.id, !showPhoto)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition ${
                  showPhoto
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-300'
                    : 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
                title="Toggle profile photo visibility across templates"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{showPhoto ? 'Photo: Shown' : 'Photo: Hidden (ATS)'}</span>
              </button>
            )}

            {/* Search Input */}
            <div className="relative w-full sm:w-52">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search template (e.g. Riga)..."
                className={`w-full pl-8 pr-3 py-1.5 rounded-xl text-xs outline-none border ${
                  theme === 'dark'
                    ? 'bg-[#151a2a] border-slate-700 text-white placeholder-slate-500'
                    : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                }`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* TEMPLATES GALLERY GRID (LIVE DYNAMIC A4 MINIATURE PREVIEWS)       */}
      {/* ================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredTemplates.map(tpl => {
          const isCurrentTemplate = activeTemplateId === tpl.id;
          const previewAccent = customAccentColor || tpl.defaultAccent;

          return (
            <div
              key={tpl.id}
              className={`group rounded-3xl border transition-all duration-300 flex flex-col justify-between overflow-hidden ${
                isCurrentTemplate
                  ? theme === 'dark'
                    ? 'bg-[#141a2b] border-[#ffd700] ring-2 ring-[#ffd700]/30 shadow-xl'
                    : 'bg-amber-50/40 border-amber-500 ring-2 ring-amber-500/25 shadow-lg'
                  : theme === 'dark'
                  ? 'bg-[#111522] hover:bg-[#151a2a] border-slate-800 hover:border-slate-700 shadow-md'
                  : 'bg-white hover:bg-slate-50/60 border-slate-200/90 hover:border-blue-300 shadow-sm'
              }`}
            >
              {/* Top Template Header Bar */}
              <div className="p-4 pb-3 flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: previewAccent }}
                    />
                    <h4
                      className={`font-['Montserrat'] font-extrabold text-base ${
                        theme === 'dark' ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      {tpl.name}
                    </h4>
                    {isCurrentTemplate && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-500 text-[10px] font-bold flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        <span>Active</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                    {tpl.tagline}
                  </p>
                </div>

                {tpl.badge && (
                  <span
                    className={`shrink-0 text-[9.5px] font-bold px-2 py-0.5 rounded-md border ${
                      theme === 'dark'
                        ? 'bg-slate-800 border-slate-700 text-amber-300'
                        : 'bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    {tpl.badge}
                  </span>
                )}
              </div>

              {/* Live Scaled A4 Document Preview Viewport */}
              <div
                onClick={() => setPreviewModalTemplate(tpl)}
                className="relative bg-slate-200/70 dark:bg-[#090c14] py-4 flex justify-center items-start overflow-hidden cursor-pointer group/preview"
                style={{ height: '305px' }}
              >
                <div
                  className="origin-top transition-transform duration-300 group-hover/preview:scale-[1.03] pointer-events-none select-none shadow-lg"
                  style={{ width: '210mm', height: '297mm', transform: 'scale(0.24)' }}
                >
                  {targetCV && (
                    <CVDocument
                      data={targetCV.data}
                      scale={1}
                      id={`preview-card-${tpl.id}`}
                      overrideTemplateId={tpl.id}
                      overrideAccentColor={previewAccent}
                      hidePhotoPagesInPreview={true}
                    />
                  )}
                </div>

                {/* Hover Overlay for Full A4 Inspection */}
                <div className="absolute inset-0 bg-slate-950/55 opacity-0 group-hover/preview:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-4 text-center">
                  <span className="px-3.5 py-2 rounded-xl bg-white text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg">
                    <Eye className="w-4 h-4 text-blue-600" />
                    <span>Inspect Full A4 Template</span>
                  </span>
                  <span className="text-[11px] text-white font-medium">
                    Live preview with your real CV data ({targetCV?.data?.fullName})
                  </span>
                </div>
              </div>

              {/* Feature Chips & Action Buttons */}
              <div className="p-4 pt-3 space-y-3">
                <div className="flex flex-wrap gap-1">
                  {tpl.features.map((feat, idx) => (
                    <span
                      key={idx}
                      className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                        theme === 'dark'
                          ? 'bg-slate-800/90 text-slate-300'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {feat}
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  {/* Apply to Existing CV (Preserves 100% Content) */}
                  <button
                    onClick={() => {
                      if (!targetCV) return;
                      onApplyTemplateToCV(targetCV.id, tpl.id, previewAccent, false);
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition border ${
                      isCurrentTemplate
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : theme === 'dark'
                        ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-900 border-slate-200'
                    }`}
                    title="Apply this template design to your selected CV without changing any text"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>{isCurrentTemplate ? 'Applied to CV' : 'Apply to CV'}</span>
                  </button>

                  {/* Apply & Open in Editor */}
                  <button
                    onClick={() => {
                      if (!targetCV) return;
                      onApplyTemplateToCV(targetCV.id, tpl.id, previewAccent, true);
                    }}
                    className="px-3 py-2 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#ffd700] to-[#c5a059] text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs hover:opacity-95 transition"
                    title="Apply template and open in full CV Editor"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Use & Edit</span>
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/60">
                  <button
                    onClick={() => {
                      setCreateModalTemplate(tpl);
                      setNewCvTitle(`Fazle Rabbi — ${tpl.name} CV`);
                    }}
                    className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create New CV with {tpl.name}</span>
                  </button>

                  <button
                    onClick={() => setPreviewModalTemplate(tpl)}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Full Preview</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ================================================================= */}
      {/* MODAL 1: FULL-SIZE INTERACTIVE A4 PREVIEW & EXPORT (PDF / DOCX)   */}
      {/* ================================================================= */}
      {previewModalTemplate && targetCV && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-6xl h-[92vh] rounded-3xl bg-[#0d111d] border border-slate-700 shadow-2xl flex flex-col overflow-hidden">
            {/* Modal Top Toolbar */}
            <div className="px-5 py-3.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className="w-4 h-4 rounded-full"
                  style={{
                    backgroundColor: customAccentColor || previewModalTemplate.defaultAccent,
                  }}
                />
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                    <span>{previewModalTemplate.name} Template — Live A4 Preview</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px]">
                      {previewModalTemplate.badge || 'Resume-Example.com'}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Displaying real data from: <strong className="text-white">{targetCV.title}</strong>
                  </p>
                </div>
              </div>

              {/* Template Quick Switcher inside Modal */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={previewModalTemplate.id}
                  onChange={e =>
                    setPreviewModalTemplate(getResumeTemplateById(e.target.value))
                  }
                  className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-bold outline-none"
                >
                  {RESUME_EXAMPLE_TEMPLATES.map(t => (
                    <option key={t.id} value={t.id}>
                      Switch Template: {t.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => {
                    const accent = customAccentColor || previewModalTemplate.defaultAccent;
                    onApplyTemplateToCV(targetCV.id, previewModalTemplate.id, accent, true);
                    setPreviewModalTemplate(null);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-[#ffd700] hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Apply & Edit CV</span>
                </button>

                <button
                  onClick={handleDownloadFromModalPDF}
                  disabled={isExportingModalPDF}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isExportingModalPDF ? 'Exporting PDF...' : 'Export PDF'}</span>
                </button>

                <button
                  onClick={handleDownloadFromModalDOCX}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Export DOCX</span>
                </button>

                <button
                  onClick={() => setPreviewModalTemplate(null)}
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Full A4 Render Area */}
            <div className="flex-1 overflow-auto bg-slate-950/90 p-6 flex justify-center">
              <CVDocument
                data={targetCV.data}
                scale={0.85}
                id="cv-template-modal-print-area"
                overrideTemplateId={previewModalTemplate.id}
                overrideAccentColor={customAccentColor || previewModalTemplate.defaultAccent}
              />
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 2: CREATE NEW CV WITH SELECTED TEMPLATE                     */}
      {/* ================================================================= */}
      {createModalTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div
            className={`w-full max-w-md rounded-3xl p-6 border shadow-2xl space-y-4 ${
              theme === 'dark'
                ? 'bg-[#131724] border-slate-800 text-white'
                : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-700/30">
              <div className="flex items-center gap-2">
                <span
                  className="w-3.5 h-3.5 rounded-full"
                  style={{
                    backgroundColor: customAccentColor || createModalTemplate.defaultAccent,
                  }}
                />
                <h3 className="font-['Montserrat'] font-bold text-base">
                  Create New CV with {createModalTemplate.name}
                </h3>
              </div>
              <button
                onClick={() => setCreateModalTemplate(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                const accent = customAccentColor || createModalTemplate.defaultAccent;
                onCreateNewCVWithTemplate(
                  newCvTitle.trim() || `Fazle Rabbi — ${createModalTemplate.name} CV`,
                  newCvRolePreset,
                  createModalTemplate.id,
                  accent
                );
                setCreateModalTemplate(null);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                  New CV Title
                </label>
                <input
                  type="text"
                  required
                  value={newCvTitle}
                  onChange={e => setNewCvTitle(e.target.value)}
                  className={`w-full px-3.5 py-2 rounded-xl text-sm outline-none border ${
                    theme === 'dark'
                      ? 'bg-[#181d2c] border-slate-700 text-white'
                      : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                  Role Content Starter
                </label>
                <select
                  value={newCvRolePreset}
                  onChange={e => setNewCvRolePreset(e.target.value as CVTemplateType)}
                  className={`w-full px-3.5 py-2 rounded-xl text-xs font-semibold outline-none border ${
                    theme === 'dark'
                      ? 'bg-[#181d2c] border-slate-700 text-white'
                      : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                >
                  <option value="bartender">🍸 Bartender & Mixologist Content</option>
                  <option value="barista">☕ Barista & Specialty Coffee Content</option>
                  <option value="hotel">🏨 Luxury 5-Star Hotel Hospitality Content</option>
                  <option value="blank">📄 Blank Custom Content</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModalTemplate(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#ffd700] hover:bg-amber-400 text-slate-950 font-bold text-xs"
                >
                  Create & Open CV
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
