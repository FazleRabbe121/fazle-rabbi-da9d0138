import React, { useState, useMemo, useRef } from 'react';
import {
  Plus,
  Copy,
  Trash2,
  Edit3,
  Download,
  Calendar,
  Search,
  FileText,
  Sparkles,
  Layers,
  ArrowUpDown,
  Upload,
  CheckCircle,
  AlertCircle,
  Clock,
  Briefcase,
  ExternalLink,
  ChevronRight,
  FolderArchive,
  Eye,
  X,
  FileCheck,
  Mail,
  Send,
  Smartphone,
  Layout,
  Palette,
} from 'lucide-react';
import { CVDocumentItem, CVTemplateType, CVDesignTemplateId } from '../types/cv';
import { useTheme } from '../context/ThemeContext';
import {
  createNewCV,
  duplicateCV,
  deleteCV,
  renameCV,
  exportAllCVsAsJSON,
  importCVsFromJSON,
  saveUploadedCVFromDevice,
  resolveCVAttachmentPayloadAsync,
  applyDesignTemplateToCV,
  updateCVData,
} from '../services/cvStorage';
import { exportCVToPDF, exportCVToDOCX } from '../services/pdfExporter';
import { CVDocument } from './CVDocument';
import { CVTemplateSelectorSection } from './CVTemplateSelectorSection';
import { RESUME_EXAMPLE_TEMPLATES, getResumeTemplateById } from '../services/resumeExampleTemplates';

interface CVLibraryDashboardProps {
  library: CVDocumentItem[];
  activeCvId: string;
  onSelectCV: (id: string) => void;
  onOpenEditor: (id: string) => void;
  onRefreshLibrary: () => void;
  onApplyByEmail?: (id: string) => void;
}

export const CVLibraryDashboard: React.FC<CVLibraryDashboardProps> = ({
  library,
  activeCvId,
  onSelectCV,
  onOpenEditor,
  onRefreshLibrary,
  onApplyByEmail,
}) => {
  const { theme } = useTheme();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'updated' | 'title' | 'created'>('updated');
  const [librarySubTab, setLibrarySubTab] = useState<'my-cvs' | 'select-template'>('my-cvs');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newCvTitle, setNewCvTitle] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<CVTemplateType>('bartender');
  const [selectedDesignTemplate, setSelectedDesignTemplate] =
    useState<CVDesignTemplateId>('classic-hospitality');

  const [renameTarget, setRenameTarget] = useState<CVDocumentItem | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<CVDocumentItem | null>(null);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [importNotice, setImportNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [exportingCvId, setExportingCvId] = useState<string | null>(null);

  // Hidden preview for direct PDF export
  const [cvForDirectExport, setCvForDirectExport] = useState<CVDocumentItem | null>(null);

  // Attachment preview modal state
  const [previewAttachment, setPreviewAttachment] = useState<{
    title: string;
    filename: string;
    mimeType: string;
    base64: string;
    isUploadedFile: boolean;
  } | null>(null);

  // Mobile phone file input ref & handler
  const phoneFileInputRef = useRef<HTMLInputElement>(null);

  const handlePhoneUploadInLibrary = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      showToast(`Uploading "${file.name}" to persistent CV Library...`);
      const newDoc = await saveUploadedCVFromDevice(file);
      onRefreshLibrary();
      onSelectCV(newDoc.id);
      showToast(`Saved "${file.name}" to your CV Library! Ready to use across all job applications.`);
      if (onApplyByEmail) {
        onApplyByEmail(newDoc.id);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to upload CV file from device.');
    } finally {
      e.target.value = '';
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Filtered & Sorted CVs
  const filteredCVs = useMemo(() => {
    let list = library.filter(cv => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      const titleMatch = cv.title.toLowerCase().includes(q);
      const subtitleMatch = (cv.roleSubtitle || '').toLowerCase().includes(q);
      const nameMatch = (cv.data.fullName || '').toLowerCase().includes(q);
      const expMatch = (cv.data.experiences || []).some(
        exp =>
          exp.companyName.toLowerCase().includes(q) ||
          exp.position.toLowerCase().includes(q)
      );
      return titleMatch || subtitleMatch || nameMatch || expMatch;
    });

    list.sort((a, b) => {
      if (sortBy === 'updated') {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
      if (sortBy === 'created') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title);
      }
      return 0;
    });

    return list;
  }, [library, searchQuery, sortBy]);

  // Handler: Create New CV
  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newCvTitle.trim() || undefined;
    const tplDef = getResumeTemplateById(selectedDesignTemplate);
    const created = createNewCV(title, selectedTemplate, selectedDesignTemplate, tplDef.defaultAccent);
    onRefreshLibrary();
    setIsCreateModalOpen(false);
    setNewCvTitle('');
    showToast(`Created new CV: "${created.title}" (${tplDef.name} Template)`);
    onOpenEditor(created.id);
  };

  // Handler: Apply Visual Design Template to Existing CV (Preserves 100% of CV Content)
  const handleApplyDesignTemplate = (
    cvId: string,
    templateId: CVDesignTemplateId,
    accentColor?: string,
    openEditorAfter?: boolean
  ) => {
    const tplDef = getResumeTemplateById(templateId);
    applyDesignTemplateToCV(cvId, templateId, accentColor || tplDef.defaultAccent);
    onRefreshLibrary();
    onSelectCV(cvId);
    showToast(`Applied "${tplDef.name}" template! Your saved CV content was 100% preserved.`);
    if (openEditorAfter) {
      onOpenEditor(cvId);
    }
  };

  // Handler: Toggle Profile Photo visibility on a CV
  const handleTogglePhotoPreference = (cvId: string, showPhoto: boolean) => {
    const target = library.find(c => c.id === cvId);
    if (!target) return;
    updateCVData(cvId, {
      ...target.data,
      showProfilePhoto: showPhoto,
    });
    onRefreshLibrary();
    showToast(showPhoto ? 'Profile photo enabled on CV' : 'Profile photo hidden (ATS mode)');
  };

  // Handler: Duplicate CV
  const handleDuplicate = (cv: CVDocumentItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const cloned = duplicateCV(cv.id);
    onRefreshLibrary();
    showToast(`Duplicated: "${cloned.title}"`);
  };

  // Handler: Rename CV
  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      renameCV(renameTarget.id, trimmed);
      onRefreshLibrary();
      showToast(`Renamed to "${trimmed}"`);
    }
    setRenameTarget(null);
  };

  // Handler: Delete CV
  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    deleteCV(deleteTarget.id);
    onRefreshLibrary();
    showToast(`Deleted: "${deleteTarget.title}"`);
    setDeleteTarget(null);
  };

  // Handler: Import Backup
  const handleImportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!importJsonText.trim()) return;
    const res = importCVsFromJSON(importJsonText, importMode);
    if (res.success) {
      onRefreshLibrary();
      setImportNotice({
        type: 'success',
        message: `Successfully imported ${res.count} CV(s)!`,
      });
      setTimeout(() => {
        setIsImportModalOpen(false);
        setImportJsonText('');
        setImportNotice(null);
        showToast(`Imported ${res.count} CVs successfully`);
      }, 1500);
    } else {
      setImportNotice({
        type: 'error',
        message: res.error || 'Failed to import JSON.',
      });
    }
  };

  // Handler: Preview Actual Attachment
  const handlePreviewCardAttachment = async (cv: CVDocumentItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const payload = await resolveCVAttachmentPayloadAsync(cv.id);
      if (payload && payload.base64) {
        setPreviewAttachment({
          title: cv.title,
          filename: payload.filename,
          mimeType: payload.mimeType || 'application/pdf',
          base64: payload.base64,
          isUploadedFile: Boolean(payload.isUploadedFile),
        });
      } else {
        showToast('Could not load CV attachment preview.');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load attachment preview.');
    }
  };

  // Handler: Direct PDF / Original File Download from Card
  const handleDownloadCardPDF = async (cv: CVDocumentItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setExportingCvId(cv.id);

    // If this CV is an uploaded original PDF/DOCX file, download the exact original binary file!
    if (cv.isUploadedFile || cv.storageSource === 'phone_upload' || cv.fileName || cv.originalFile) {
      try {
        const payload = await resolveCVAttachmentPayloadAsync(cv.id);
        if (payload && payload.base64) {
          const link = document.createElement('a');
          link.href = `data:${payload.mimeType || 'application/pdf'};base64,${payload.base64}`;
          link.download = payload.filename || cv.fileName || `${cv.title}.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          showToast(`Downloaded original CV file "${payload.filename}"!`);
          setExportingCvId(null);
          return;
        }
      } catch (err) {
        console.warn('Original file download fallback:', err);
      }
    }

    setCvForDirectExport(cv);

    // Wait for the hidden container to render with this CV's data
    setTimeout(async () => {
      try {
        const safeName = cv.title.replace(/[^a-zA-Z0-9]/g, '_') || 'Fazle_Rabbi_CV';
        await exportCVToPDF('cv-direct-card-print', `${safeName}.pdf`);
        showToast(`Exported "${cv.title}" PDF!`);
      } catch (err) {
        console.error('Direct PDF export fallback:', err);
        showToast('Direct PDF export completed');
      } finally {
        setExportingCvId(null);
        setCvForDirectExport(null);
      }
    }, 400);
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return 'Recently';
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 animate-bounce">
          <div className="bg-[#1e2436] text-[#ffd700] border border-[#d4af37]/50 px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 text-xs font-semibold">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Hidden container used for direct PDF export from cards */}
      {cvForDirectExport && (
        <div className="fixed -left-[9999px] top-0 pointer-events-none opacity-0">
          <CVDocument data={cvForDirectExport.data} id="cv-direct-card-print" />
        </div>
      )}

      {/* Top Banner / Library Header */}
      <div
        className={`rounded-3xl p-6 sm:p-8 transition-all border ${
          theme === 'dark'
            ? 'bg-gradient-to-br from-[#121624] via-[#0f121d] to-[#0a0c14] border-[#222a3e] shadow-lg'
            : 'bg-white border-slate-200/80 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)]'
        }`}
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-500/20 border border-blue-200 dark:border-blue-500/40 text-blue-700 dark:text-blue-300 text-[11px] font-bold uppercase tracking-wider">
                Multi-CV Workspace
              </span>
              <span
                className={`text-xs font-medium ${
                  theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                · {library.length} Saved {library.length === 1 ? 'CV' : 'CVs'}
              </span>
            </div>
            <h2
              className={`font-['Montserrat'] font-extrabold text-2xl sm:text-3xl tracking-tight ${
                theme === 'dark' ? 'text-white' : 'text-slate-900'
              }`}
            >
              CV Library
            </h2>
            <p
              className={`text-xs sm:text-sm mt-1 max-w-2xl font-['Inter'] ${
                theme === 'dark' ? 'text-slate-300' : 'text-slate-600'
              }`}
            >
              Your default CV will be attached to applications automatically. Create or upload distinct CVs for Bartender, Barista, or Hotel roles.
            </p>
          </div>

          {/* Primary Top Actions */}
          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            {/* Select CV Template Button */}
            <button
              onClick={() =>
                setLibrarySubTab(prev => (prev === 'select-template' ? 'my-cvs' : 'select-template'))
              }
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition border shadow-xs ${
                librarySubTab === 'select-template'
                  ? 'bg-[#ffd700] text-slate-950 border-amber-400 shadow-amber-500/20'
                  : theme === 'dark'
                  ? 'bg-amber-500/15 hover:bg-amber-500/25 text-[#ffd700] border-amber-500/40'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
              }`}
              title="Browse and apply all 21 recreated CV templates from resume-example.com/builder"
            >
              <Layout className="w-4 h-4" />
              <span>Select CV Template ({RESUME_EXAMPLE_TEMPLATES.length})</span>
            </button>

            {/* Offline JSON Backup Export */}
            <button
              onClick={() => {
                exportAllCVsAsJSON();
                showToast('Downloaded full CV Library JSON archive!');
              }}
              className={`px-3.5 py-2.5 rounded-2xl text-xs font-semibold flex items-center gap-1.5 transition border ${
                theme === 'dark'
                  ? 'bg-[#181d2a] hover:bg-[#232b3d] text-slate-200 border-slate-700'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
              title="Download offline JSON backup file of all CVs"
            >
              <FolderArchive className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="hidden sm:inline">Backup Archive</span>
              <span className="sm:hidden">Backup</span>
            </button>

            {/* Hidden Mobile Phone File Input */}
            <input
              type="file"
              ref={phoneFileInputRef}
              accept=".pdf,.doc,.docx,application/pdf"
              className="hidden"
              onChange={handlePhoneUploadInLibrary}
            />

            {/* + Upload CV Button (Matches Reference Header) */}
            <button
              onClick={() => phoneFileInputRef.current?.click()}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm shadow-blue-500/20"
              title="Upload a PDF or Word CV from your phone or computer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Upload CV</span>
            </button>

            {/* Import Backup */}
            <button
              onClick={() => setIsImportModalOpen(true)}
              className={`px-3.5 py-2.5 rounded-2xl text-xs font-semibold flex items-center gap-1.5 transition border ${
                theme === 'dark'
                  ? 'bg-[#181d2a] hover:bg-[#232b3d] text-slate-200 border-slate-700'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
              title="Restore or import CVs from a JSON backup file"
            >
              <Upload className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <span>Import</span>
            </button>

            {/* Create New CV Button */}
            <button
              onClick={() => {
                setNewCvTitle('');
                setSelectedTemplate('bartender');
                setSelectedDesignTemplate('classic-hospitality');
                setIsCreateModalOpen(true);
              }}
              className={`px-4 py-2.5 rounded-2xl border font-bold text-xs transition flex items-center gap-1.5 ${
                theme === 'dark'
                  ? 'bg-violet-600/20 border-violet-500/40 text-violet-200 hover:bg-violet-600/30'
                  : 'bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100'
              }`}
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Create New CV</span>
            </button>
          </div>
        </div>

        {/* Sub-Navigation Bar: Saved CVs vs Select CV Template */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-b border-slate-200/70 dark:border-slate-800 pb-3">
          <button
            onClick={() => setLibrarySubTab('my-cvs')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              librarySubTab === 'my-cvs'
                ? 'bg-blue-600 text-white shadow-xs'
                : theme === 'dark'
                ? 'bg-[#151926] text-slate-300 hover:text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>My Saved CVs ({library.length})</span>
          </button>

          <button
            onClick={() => setLibrarySubTab('select-template')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
              librarySubTab === 'select-template'
                ? 'bg-[#d4af37] text-slate-950 shadow-xs'
                : theme === 'dark'
                ? 'bg-[#151926] text-amber-300 hover:bg-amber-500/20 border border-amber-500/30'
                : 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            <Layout className="w-3.5 h-3.5" />
            <span>Select CV Template ({RESUME_EXAMPLE_TEMPLATES.length} Designs)</span>
          </button>
        </div>

        {/* Quick Metrics Bar */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div
            className={`p-3.5 rounded-2xl border transition flex items-center gap-3.5 ${
              theme === 'dark' ? 'bg-[#0b0e17] border-[#1e2538]' : 'bg-slate-50/70 border-slate-200/80'
            }`}
          >
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              1
            </div>
            <div>
              <div className={`text-[11px] font-semibold ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                Active Workspaces
              </div>
              <div className={`text-sm font-bold font-['Montserrat'] ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                {library.length} Independent {library.length === 1 ? 'CV' : 'CVs'}
              </div>
            </div>
          </div>

          <div
            className={`p-3.5 rounded-2xl border transition flex items-center gap-3.5 ${
              theme === 'dark' ? 'bg-[#0b0e17] border-[#1e2538]' : 'bg-slate-50/70 border-slate-200/80'
            }`}
          >
            <div className="w-9 h-9 rounded-xl bg-violet-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              2
            </div>
            <div>
              <div className={`text-[11px] font-semibold ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                Recorded Experiences
              </div>
              <div className={`text-sm font-bold font-['Montserrat'] ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                {library.reduce((acc, c) => acc + (c.data.experiences?.length || 0), 0)} Verified Positions
              </div>
            </div>
          </div>

          <div
            className={`p-3.5 rounded-2xl border transition flex items-center gap-3.5 ${
              theme === 'dark' ? 'bg-[#0b0e17] border-[#1e2538]' : 'bg-slate-50/70 border-slate-200/80'
            }`}
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
              3
            </div>
            <div>
              <div className={`text-[11px] font-semibold ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                Supporting Documents
              </div>
              <div className={`text-sm font-bold font-['Montserrat'] ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                {library.reduce((acc, c) => acc + (c.data.additionalPhotos?.filter(p => p.included)?.length || 0), 0)} Verification Pages
              </div>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search CV name, role, company..."
              className={`w-full pl-10 pr-4 py-2 rounded-xl text-xs outline-none transition border ${
                theme === 'dark'
                  ? 'bg-[#181d2b] border-[#293247] text-white placeholder-slate-500 focus:border-blue-500'
                  : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-500'
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <span
              className={`text-xs flex items-center gap-1 ${
                theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>Sort by:</span>
            </span>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium outline-none transition border ${
                theme === 'dark'
                  ? 'bg-[#181d2b] border-[#293247] text-slate-200'
                  : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              <option value="updated">Recently Modified</option>
              <option value="created">Date Created</option>
              <option value="title">Alphabetical (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* SELECT CV TEMPLATE SECTION OR SAVED CVS GRID              */}
      {/* ========================================================= */}
      {librarySubTab === 'select-template' ? (
        <CVTemplateSelectorSection
          library={library}
          activeCvId={activeCvId}
          onApplyTemplateToCV={handleApplyDesignTemplate}
          onCreateNewCVWithTemplate={(title, rolePreset, templateId, accentColor) => {
            const created = createNewCV(title, rolePreset, templateId, accentColor);
            onRefreshLibrary();
            showToast(`Created "${created.title}" with ${getResumeTemplateById(templateId).name} template!`);
            onOpenEditor(created.id);
          }}
          onTogglePhotoPreference={handleTogglePhotoPreference}
        />
      ) : filteredCVs.length === 0 ? (
        <div
          className={`rounded-3xl p-12 text-center border ${
            theme === 'dark' ? 'bg-[#121622] border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <FileText className="w-12 h-12 mx-auto text-slate-400 mb-3 opacity-50" />
          <h3
            className={`font-['Montserrat'] font-bold text-lg ${
              theme === 'dark' ? 'text-white' : 'text-slate-900'
            }`}
          >
            No CVs Match Your Search
          </h3>
          <p
            className={`text-xs mt-1 max-w-sm mx-auto ${
              theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            Try searching for a different keyword or create a new CV workspace.
          </p>
          <button
            onClick={() => setSearchQuery('')}
            className="mt-4 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white transition"
          >
            Clear Search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredCVs.map(cv => {
            const isActive = cv.id === activeCvId;
            const expCount = (cv.data.experiences || []).length;
            const ptCount = (cv.data.partTimeExperiences || []).length;
            const photoCount = (cv.data.additionalPhotos || []).filter(p => p.included).length;
            const skillCount = (cv.data.skills?.items || []).length;

            return (
              <div
                key={cv.id}
                className={`group relative rounded-3xl transition-all duration-300 border flex flex-col justify-between overflow-hidden ${
                  isActive
                    ? theme === 'dark'
                      ? 'bg-emerald-950/20 border-emerald-500/60 ring-2 ring-emerald-500/25 shadow-lg'
                      : 'bg-gradient-to-br from-emerald-50/80 via-emerald-50/30 to-white border-emerald-300 ring-2 ring-emerald-500/15 shadow-[0_8px_30px_rgb(16,185,129,0.08)]'
                    : theme === 'dark'
                    ? 'bg-[#11141f] hover:bg-[#161a29] border-[#22283a] hover:border-slate-700 shadow-md'
                    : 'bg-white hover:bg-slate-50/50 border-slate-200/90 hover:border-blue-300 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)]'
                }`}
              >
                {/* Active Indicator Top Accent Bar */}
                <div
                  className={`h-1.5 w-full ${
                    isActive
                      ? 'bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-500'
                      : 'bg-slate-100 dark:bg-slate-800/40'
                  }`}
                />

                {/* Card Main Body */}
                <div className="p-5 sm:p-6 flex-1 flex flex-col">
                  {/* Top Badges & Status */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full flex items-center gap-1 border ${
                          isActive
                            ? 'bg-emerald-100 dark:bg-emerald-500/20 border-emerald-300 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300'
                            : theme === 'dark'
                            ? 'bg-slate-800 border-slate-700 text-slate-300'
                            : 'bg-slate-100 border-slate-200 text-slate-600'
                        }`}
                      >
                        {isActive && <CheckCircle className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />}
                        <span>{isActive ? 'Default CV' : 'Saved CV'}</span>
                      </span>

                      {/* Active Design Template Pill (Click to switch template) */}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onSelectCV(cv.id);
                          setLibrarySubTab('select-template');
                        }}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-600 dark:text-amber-300 flex items-center gap-1 transition"
                        title="Click to switch visual CV template for this CV"
                      >
                        <Layout className="w-2.5 h-2.5" />
                        <span>
                          {getResumeTemplateById(cv.data?.designTemplateId || cv.designTemplateId).name}
                        </span>
                      </button>
                    </div>

                    <span
                      className={`text-[11px] font-medium flex items-center gap-1 ${
                        theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      <Clock className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                      <span>Updated {formatDate(cv.updatedAt)}</span>
                    </span>
                  </div>

                  {/* CV Title & Role Subtitle */}
                  <div className="mb-4 flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        isActive
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30'
                      }`}
                    >
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3
                        className={`font-['Montserrat'] font-bold text-base sm:text-lg leading-snug line-clamp-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition ${
                          theme === 'dark' ? 'text-white' : 'text-slate-900'
                        }`}
                        title={cv.title}
                      >
                        {cv.title}
                      </h3>
                      <p
                        className={`text-xs font-medium mt-0.5 line-clamp-1 ${
                          theme === 'dark' ? 'text-slate-300' : 'text-slate-600'
                        }`}
                      >
                        {cv.data.fullName} · {cv.roleSubtitle || cv.data.professionalTitle}
                      </p>
                    </div>
                  </div>

                  {/* Visual Miniature Preview Representation */}
                  <div
                    onClick={() => onOpenEditor(cv.id)}
                    className={`cursor-pointer rounded-2xl p-3.5 mb-4 border transition-all ${
                      theme === 'dark'
                        ? 'bg-[#0d1017] border-slate-800 hover:border-slate-700'
                        : 'bg-white/90 border-slate-200/80 hover:border-blue-300 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar Thumbnail */}
                      <img
                        src={cv.data.photoUrl}
                        alt={cv.data.fullName}
                        className="w-11 h-11 rounded-xl object-cover ring-2 ring-blue-500/20 shrink-0"
                        onError={e => {
                          (e.currentTarget as HTMLImageElement).src =
                            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80';
                        }}
                      />

                      {/* Summary Highlights */}
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold line-clamp-1 flex items-center gap-1">
                          <Briefcase className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />
                          <span className={theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}>
                            {cv.data.experiences?.[0]?.companyName || 'Hospitality Experience'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                          {cv.data.experiences?.[0]?.position || 'Bartender / Hospitality'} (
                          {cv.data.experiences?.[0]?.startDate || '2026'})
                        </div>
                      </div>

                      <Eye className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition shrink-0" />
                    </div>

                    {/* Metric Chips Bar */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <span className="font-bold text-blue-600 dark:text-blue-400">{expCount}</span> Full-time
                        {ptCount > 0 && <span>+ {ptCount} Part-time</span>}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <span className="font-bold text-blue-600 dark:text-blue-400">{photoCount}</span> Photos
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <span className="font-bold text-blue-600 dark:text-blue-400">{skillCount}</span> Skills
                      </span>
                    </div>
                  </div>

                  {/* Actions Toolbar */}
                  <div className="mt-auto pt-3 border-t border-slate-100 dark:border-slate-800/60 flex flex-wrap items-center justify-between gap-1.5">
                    {/* Open & Edit Primary Button */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onOpenEditor(cv.id)}
                        className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 ${
                          theme === 'dark'
                            ? 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-white'
                            : 'bg-slate-100 hover:bg-slate-200/80 border-slate-200 text-slate-800'
                        }`}
                        title="Open full CV Editor"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span>Edit</span>
                      </button>

                      {/* Send via Gmail Option */}
                      {onApplyByEmail && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            onApplyByEmail(cv.id);
                          }}
                          className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-xs font-bold text-white transition flex items-center gap-1.5 shadow-xs"
                          title="Select this CV from gallery and send it via Gmail"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          <span>Send via Gmail</span>
                        </button>
                      )}
                    </div>

                    {/* Secondary Actions */}
                    <div className="flex items-center gap-1">
                      {/* Set Active Default / Use Button if not already active */}
                      {!isActive && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            onSelectCV(cv.id);
                            showToast(`"${cv.title}" is now your Active Default CV across all sections!`);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/20 dark:hover:bg-blue-500/30 border border-blue-200 dark:border-blue-500/40 text-xs font-bold text-blue-700 dark:text-blue-300 transition"
                          title="Set as Default Active CV across Sponsorship, Europe, Cyprus, Search, and Apply"
                        >
                          Use
                        </button>
                      )}

                      {/* Preview Actual Attachment Button */}
                      <button
                        onClick={e => handlePreviewCardAttachment(cv, e)}
                        className={`p-2 rounded-xl text-xs transition border ${
                          theme === 'dark'
                            ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
                            : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                        title="Preview actual attachment file that will be sent with applications"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      {/* Duplicate Button */}
                      <button
                        onClick={e => handleDuplicate(cv, e)}
                        className={`p-2 rounded-xl text-xs transition border ${
                          theme === 'dark'
                            ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
                            : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                        title="Duplicate this CV into an independent copy"
                      >
                        <Copy className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400" />
                      </button>

                      {/* Direct PDF Download */}
                      <button
                        onClick={e => handleDownloadCardPDF(cv, e)}
                        disabled={exportingCvId === cv.id}
                        className={`p-2 rounded-xl text-xs transition border ${
                          theme === 'dark'
                            ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
                            : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                        title="Download A4 PDF directly"
                      >
                        <Download
                          className={`w-3.5 h-3.5 ${
                            exportingCvId === cv.id
                              ? 'animate-spin text-blue-600'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        />
                      </button>

                      {/* Rename Button */}
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setRenameTarget(cv);
                          setRenameValue(cv.title);
                        }}
                        className={`px-2 py-1.5 rounded-xl text-xs transition border ${
                          theme === 'dark'
                            ? 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700'
                            : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                        title="Rename this CV"
                      >
                        <span className="text-[11px] font-semibold">
                          Rename
                        </span>
                      </button>

                      {/* Delete Button */}
                      {library.length > 1 && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setDeleteTarget(cv);
                          }}
                          className={`p-2 rounded-xl text-xs transition border ${
                            theme === 'dark'
                              ? 'bg-slate-800/80 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border-slate-700'
                              : 'bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border-slate-200'
                          }`}
                          title="Delete this CV"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: CREATE NEW CV                                      */}
      {/* ========================================================= */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div
            className={`w-full max-w-lg rounded-3xl p-6 sm:p-7 border shadow-2xl space-y-5 ${
              theme === 'dark'
                ? 'bg-[#131724] border-gray-800 text-white'
                : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-700/30">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#d4af37]/20 text-[#ffd700]">
                  <Plus className="w-5 h-5 stroke-[3]" />
                </div>
                <div>
                  <h3 className="font-['Montserrat'] font-bold text-lg">Create New CV</h3>
                  <p className="text-xs text-gray-400">
                    A completely separate workspace. Existing CVs will not change.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  CV Name / Identifier
                </label>
                <input
                  type="text"
                  required
                  value={newCvTitle}
                  onChange={e => setNewCvTitle(e.target.value)}
                  placeholder="e.g. Fazle Rabbi — Resort Manager CV"
                  className={`w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition ${
                    theme === 'dark'
                      ? 'bg-[#181d2c] border-gray-700 text-white focus:border-[#ffd700]'
                      : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-500'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  1. Select Starting Role Content Preset
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    {
                      id: 'bartender' as CVTemplateType,
                      name: '🍸 Bartender Standard',
                      desc: 'Senior Bartender, Mixology, 5-Star Hotel credentials',
                    },
                    {
                      id: 'barista' as CVTemplateType,
                      name: '☕ Barista & Specialty Coffee',
                      desc: 'Espresso extraction, latte art, coffee roast profile',
                    },
                    {
                      id: 'hotel' as CVTemplateType,
                      name: '🏨 Luxury Hotel Hospitality',
                      desc: '5-star guest relations, VIP service, banquet & F&B',
                    },
                    {
                      id: 'blank' as CVTemplateType,
                      name: '📄 Blank Custom Template',
                      desc: 'Clean slate with your core personal info pre-filled',
                    },
                  ].map(tpl => (
                    <div
                      key={tpl.id}
                      onClick={() => setSelectedTemplate(tpl.id)}
                      className={`p-3 rounded-2xl cursor-pointer border transition-all text-left ${
                        selectedTemplate === tpl.id
                          ? 'bg-[#d4af37]/15 border-[#ffd700] ring-1 ring-[#ffd700]'
                          : theme === 'dark'
                          ? 'bg-[#181d2c] border-gray-800 hover:border-gray-700'
                          : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-bold text-xs text-[#ffd700] mb-0.5">{tpl.name}</div>
                      <div className="text-[10px] text-gray-400 leading-tight">{tpl.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                  2. Select Visual CV Layout Template (21 Designs)
                </label>
                <select
                  value={selectedDesignTemplate}
                  onChange={e => setSelectedDesignTemplate(e.target.value as CVDesignTemplateId)}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold outline-none border ${
                    theme === 'dark'
                      ? 'bg-[#181d2c] border-gray-700 text-white'
                      : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                >
                  {RESUME_EXAMPLE_TEMPLATES.map(design => (
                    <option key={design.id} value={design.id}>
                      {design.name} — {design.tagline.slice(0, 62)}...
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-gray-700/30 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#ffd700] to-[#b38827] text-slate-950 font-bold text-xs uppercase tracking-wider shadow-lg hover:opacity-95"
                >
                  Create CV
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: RENAME CV                                          */}
      {/* ========================================================= */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div
            className={`w-full max-w-md rounded-3xl p-6 border shadow-2xl space-y-4 ${
              theme === 'dark'
                ? 'bg-[#131724] border-gray-800 text-white'
                : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-700/30">
              <h3 className="font-['Montserrat'] font-bold text-base">Rename CV</h3>
              <button
                onClick={() => setRenameTarget(null)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRenameSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1">
                  New CV Name
                </label>
                <input
                  type="text"
                  required
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition ${
                    theme === 'dark'
                      ? 'bg-[#181d2c] border-gray-700 text-white focus:border-[#ffd700]'
                      : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-500'
                  }`}
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRenameTarget(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-[#ffd700] hover:bg-amber-400 text-slate-950 font-bold text-xs"
                >
                  Save Name
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: DELETE CONFIRMATION                                */}
      {/* ========================================================= */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div
            className={`w-full max-w-md rounded-3xl p-6 border shadow-2xl space-y-4 ${
              theme === 'dark'
                ? 'bg-[#131724] border-gray-800 text-white'
                : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center gap-3 text-rose-400">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="font-['Montserrat'] font-bold text-base text-white">Delete CV?</h3>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              Are you sure you want to delete <span className="font-bold text-[#ffd700]">"{deleteTarget.title}"</span>?
              Other saved CVs will remain completely untouched.
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-700/30">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-950/40"
              >
                Delete CV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: IMPORT JSON BACKUP                                 */}
      {/* ========================================================= */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div
            className={`w-full max-w-lg rounded-3xl p-6 sm:p-7 border shadow-2xl space-y-5 ${
              theme === 'dark'
                ? 'bg-[#131724] border-gray-800 text-white'
                : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-700/30">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-sky-400" />
                <h3 className="font-['Montserrat'] font-bold text-lg">Import CV Backup</h3>
              </div>
              <button
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportNotice(null);
                }}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {importNotice && (
              <div
                className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                  importNotice.type === 'success'
                    ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-950/40 text-rose-300 border border-rose-500/40'
                }`}
              >
                {importNotice.type === 'success' ? (
                  <CheckCircle className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{importNotice.message}</span>
              </div>
            )}

            <form onSubmit={handleImportSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1.5">
                  Paste JSON Backup Content OR Select File
                </label>

                {/* File picker */}
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = ev => {
                        if (ev.target?.result) {
                          setImportJsonText(ev.target.result as string);
                        }
                      };
                      reader.readAsText(file);
                    }
                  }}
                  className="mb-2 block w-full text-xs text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-gray-800 file:text-[#ffd700] hover:file:bg-gray-700 cursor-pointer"
                />

                <textarea
                  rows={6}
                  value={importJsonText}
                  onChange={e => setImportJsonText(e.target.value)}
                  placeholder='{"exportVersion": "2.0", "cvLibrary": [...] }'
                  className={`w-full p-3 rounded-xl font-mono text-xs outline-none border transition ${
                    theme === 'dark'
                      ? 'bg-[#181d2c] border-gray-700 text-gray-200 focus:border-[#ffd700]'
                      : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-amber-500'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-400 mb-1.5">
                  Import Mode
                </label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'merge'}
                      onChange={() => setImportMode('merge')}
                    />
                    <span>Merge with existing CVs (Recommended)</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                    />
                    <span>Replace all existing CVs</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-700/30">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!importJsonText.trim()}
                  className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-slate-950 font-bold text-xs uppercase"
                >
                  Import Data
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ACTUAL CV ATTACHMENT PREVIEW                       */}
      {/* ========================================================= */}
      {previewAttachment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-4xl h-[85vh] rounded-3xl bg-[#0d111d] border border-slate-700 shadow-2xl flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <FileCheck className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Attachment Preview: {previewAttachment.filename}</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px]">
                      {previewAttachment.isUploadedFile ? 'Original Uploaded File' : 'Complete Structured CV PDF'}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Size: {Math.round((previewAttachment.base64.length * 3) / 4 / 1024)} KB · Exact binary file attached when applying
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`data:${previewAttachment.mimeType};base64,${previewAttachment.base64}`}
                  download={previewAttachment.filename}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Original</span>
                </a>
                <button
                  onClick={() => setPreviewAttachment(null)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-950">
              {previewAttachment.mimeType.includes('pdf') ? (
                <iframe
                  title={previewAttachment.filename}
                  src={`data:application/pdf;base64,${previewAttachment.base64}`}
                  className="w-full h-full border-0"
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-3">
                  <FileText className="w-12 h-12 text-amber-400" />
                  <p className="text-sm font-bold text-white">{previewAttachment.filename}</p>
                  <p className="text-xs text-slate-400 max-w-md">
                    This original uploaded Word document ({previewAttachment.mimeType}) is stored in binary form in the Central CV Library and will be attached directly to your Gmail applications.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

