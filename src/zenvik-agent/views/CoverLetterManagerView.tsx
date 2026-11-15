import React, { useState, useEffect } from 'react';
import {
  Scroll,
  Copy,
  Check,
  Edit3,
  Sparkles,
  Eye,
  FileText,
  AlertCircle,
  Download,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import {
  DEFAULT_MASTER_COVER_LETTER,
  NEW_MASTER_COVER_LETTER_BARTENDER_BARISTA,
} from '../services/centralProfileService';
import {
  loadCVLibrary,
  getActiveCVId,
  setActiveCVId,
  loadSelectedCV,
} from '../services/cvStorage';
import { generatePersonalizedCoverLetterWithGemini } from '../services/gmailService';
import { generateCoverLetterPdfBase64 } from '../services/pdfExporter';
import { CVDocumentItem } from '../types/cv';

export const CoverLetterManagerView: React.FC = () => {
  const { theme } = useTheme();

  const [cvList, setCvList] = useState<CVDocumentItem[]>(() => loadCVLibrary());
  const [selectedCvId, setSelectedCvId] = useState<string>(() => getActiveCVId() || loadCVLibrary()[0]?.id || '');

  useEffect(() => {
    const syncLibrary = () => {
      const updated = loadCVLibrary();
      setCvList(updated);
      const activeId = getActiveCVId();
      if (activeId) setSelectedCvId(activeId);
    };
    window.addEventListener('central_cv_library_updated', syncLibrary);
    window.addEventListener('active_cv_changed', syncLibrary);
    return () => {
      window.removeEventListener('central_cv_library_updated', syncLibrary);
      window.removeEventListener('active_cv_changed', syncLibrary);
    };
  }, []);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('master-bartender-barista');
  const [isCopied, setIsCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(NEW_MASTER_COVER_LETTER_BARTENDER_BARISTA);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Gemini AI Personalization Studio Fields
  const [simEmployer, setSimEmployer] = useState('Four Seasons Hotel Limassol');
  const [simPosition, setSimPosition] = useState('Bartender & Mixologist');
  const [simLocation, setSimLocation] = useState('Limassol, Cyprus');
  const [simRequirements, setSimRequirements] = useState(
    '5-star hotel cocktail service, espresso & specialty coffee, HACCP hygiene, international guest relations'
  );
  const [simulatedLetter, setSimulatedLetter] = useState('');
  const [simulatedSubject, setSimulatedSubject] = useState('');
  const [isSimulated, setIsSimulated] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3200);
  };

  const templates = [
    {
      id: 'master-bartender-barista',
      title: 'Bartender & Barista — Master Cover Letter',
      description: 'Official master template featuring Cyprus hospitality, five-star experience & latte art craft',
      content: NEW_MASTER_COVER_LETTER_BARTENDER_BARISTA,
    },
    {
      id: 'fine-dining-mixologist',
      title: 'Luxury 5-Star Mixologist',
      description: 'Tailored for Michelin-starred hotel dining rooms, signature cocktail craft, and VIP guest engagement',
      content: DEFAULT_MASTER_COVER_LETTER,
    },
    {
      id: 'specialty-barista',
      title: 'Specialty Coffee & Barista Specialist',
      description: 'Focuses on espresso extraction, latte art techniques, and café operations',
      content: `Fazle Rabbi Boyati
Limassol Marina, Cyprus
+357 9550 2363 | fazle.rabbe.doc@gmail.com
LinkedIn: https://www.linkedin.com/in/fazle-rabbi-5785aa269

Dear Hiring Team,

I am writing to apply for the Barista position at your establishment. With over five years of specialty coffee craft and beverage service across international hotels and cafés, I am dedicated to delivering exquisite coffee and exceptional guest hospitality.

My background includes Sugar Boulangerie & Pâtisserie, The Westin Dhaka, and Gazebo Mare Limassol Marina. I specialize in dialling in espresso beans, milk texture and free-pour latte art, alongside stock management and high-volume café efficiency.

I am legally authorized to work in Cyprus, available immediately, and look forward to discussing how I can elevate your coffee offering.

Best regards,
Fazle Rabbi Boyati`,
    },
  ];

  const currentTemplate = templates.find(t => t.id === selectedTemplateId) || templates[0];
  const activeLetterText = isEditing ? editedText : isSimulated ? simulatedLetter : currentTemplate.content;
  const activeCvDoc = loadSelectedCV(selectedCvId);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    showToast('Cover letter copied to clipboard!');
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleGenerateWithGemini = async () => {
    setIsGeneratingAi(true);
    try {
      const res = await generatePersonalizedCoverLetterWithGemini({
        company: simEmployer || 'Prospective Hospitality Employer',
        jobTitle: simPosition || 'Bartender & Barista',
        location: simLocation || 'Europe',
        verifiedRequirements: simRequirements,
        selectedCvId,
      });
      setSimulatedLetter(res.coverLetter);
      setSimulatedSubject(res.subjectLine);
      setEditedText(res.coverLetter);
      setIsSimulated(true);
      setIsEditing(false);
      showToast(`Generated personalized cover letter with Gemini using CV: ${res.cvUsedName}`);
    } catch (err: any) {
      showToast(err?.message || 'Error generating cover letter with Gemini');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleDownloadPdfCoverLetter = () => {
    const b64 = generateCoverLetterPdfBase64({
      employer: simEmployer || 'Hiring Manager',
      jobTitle: simPosition || 'Hospitality Professional',
      country: simLocation || 'Europe',
      coverLetterText: activeLetterText,
    });
    const safeComp = (simEmployer || 'Employer').replace(/[^\w\d-_]/g, '_');
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${b64}`;
    link.download = `Cover_Letter_${safeComp}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Downloaded Cover_Letter_${safeComp}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 p-4 rounded-2xl bg-slate-900 border border-blue-500/50 text-white text-xs shadow-2xl animate-fade-in flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div
        className={`p-6 rounded-3xl border transition-all ${
          theme === 'dark' ? 'bg-[#101625] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold">
              <Scroll className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">Professional Cover Letter Studio</h1>
              <p className="text-xs text-slate-400">
                Gemini AI Personalization · Synchronized with Central CV Library · Email Body & Executive PDF Export
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPdfPreview(prev => !prev)}
              className="px-4 py-2.5 rounded-xl bg-indigo-600/20 border border-indigo-500/40 hover:bg-indigo-600/30 text-xs font-semibold text-indigo-300 flex items-center gap-2 transition"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{showPdfPreview ? 'Hide PDF Preview' : 'Preview PDF Cover Letter'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadPdfCoverLetter}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white flex items-center gap-2 transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </button>
            <button
              type="button"
              onClick={() => handleCopy(activeLetterText)}
              className="px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-xs font-semibold text-slate-200 flex items-center gap-2 transition"
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{isCopied ? 'Copied' : 'Copy Email Body'}</span>
            </button>
          </div>
        </div>

        {/* Central CV Library Active Selector Bar */}
        <div className="mt-5 p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <FileText className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-white">Active Central CV for Personalization:</span>
            <span className="text-emerald-400 font-semibold">
              {activeCvDoc.originalFile?.fileName || activeCvDoc.name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-slate-400 font-semibold">Switch CV:</label>
            <select
              value={selectedCvId}
              onChange={e => {
                setSelectedCvId(e.target.value);
                setActiveCVId(e.target.value);
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
            >
              {cvList.map(cv => (
                <option key={cv.id} value={cv.id}>
                  {cv.title} {cv.isUploadedFile ? `(Uploaded: ${cv.originalFile?.fileName || cv.name})` : '(Structured CV)'}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Template Selector Tabs */}
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 no-scrollbar border-t border-slate-800/60 pt-4">
          {templates.map(tpl => {
            const isActive = selectedTemplateId === tpl.id && !isSimulated;
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => {
                  setSelectedTemplateId(tpl.id);
                  setEditedText(tpl.content);
                  setIsEditing(false);
                  setIsSimulated(false);
                }}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition border ${
                  isActive
                    ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/20'
                    : 'bg-slate-900/40 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
                }`}
              >
                {tpl.title}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Cover Letter View / Editor (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          {showPdfPreview && (
            <div className="p-4 rounded-3xl bg-[#101625] border border-indigo-500/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-300 flex items-center gap-2">
                  <Eye className="w-4 h-4" /> Executive PDF Cover Letter Preview ({simEmployer})
                </span>
                <button
                  type="button"
                  onClick={() => setShowPdfPreview(false)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Close PDF Preview
                </button>
              </div>
              <iframe
                title="Executive Cover Letter PDF Preview"
                src={`data:application/pdf;base64,${generateCoverLetterPdfBase64({
                  employer: simEmployer || 'Hiring Manager',
                  jobTitle: simPosition || 'Hospitality Professional',
                  country: simLocation || 'Europe',
                  coverLetterText: activeLetterText,
                })}`}
                className="w-full h-[500px] rounded-2xl border border-slate-800 bg-white"
              />
            </div>
          )}

          <div
            className={`p-6 rounded-3xl border ${
              theme === 'dark' ? 'bg-[#101625] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/60">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-sm text-white">
                    {isSimulated
                      ? `Gemini Personalized Cover Letter — ${simEmployer} (${simPosition})`
                      : currentTemplate.title}
                  </h2>
                  {isSimulated && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Verified CV Facts Only
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {simulatedSubject ? `Recommended Email Subject: ${simulatedSubject}` : currentTemplate.description}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!isEditing) setEditedText(activeLetterText);
                    setIsEditing(!isEditing);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-semibold text-slate-300 flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{isEditing ? 'Done Editing' : 'Edit Letter'}</span>
                </button>
              </div>
            </div>

            <div className="mt-4">
              {isEditing ? (
                <textarea
                  rows={18}
                  value={editedText}
                  onChange={e => {
                    setEditedText(e.target.value);
                    if (isSimulated) setSimulatedLetter(e.target.value);
                  }}
                  className={`w-full p-4 rounded-2xl text-xs font-sans border leading-relaxed ${
                    theme === 'dark' ? 'bg-[#161d2d] border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-300'
                  }`}
                />
              ) : (
                <div
                  className={`p-6 rounded-2xl border text-xs sm:text-sm font-sans leading-relaxed whitespace-pre-wrap select-text ${
                    theme === 'dark' ? 'bg-[#161d2d]/60 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  {activeLetterText}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Gemini AI Cover Letter Personalization Sidebar (1 col) */}
        <div className="space-y-4">
          <div
            className={`p-6 rounded-3xl border space-y-4 ${
              theme === 'dark' ? 'bg-[#101625] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-sm text-white">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Gemini AI Cover Letter Generator</span>
            </div>
            <p className="text-xs text-slate-400">
              Generates a bespoke international hospitality cover letter using your active Central CV, employer name, job title, and verified requirements—without ever inventing qualifications.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Target Employer Name
                </label>
                <input
                  type="text"
                  value={simEmployer}
                  onChange={e => setSimEmployer(e.target.value)}
                  placeholder="e.g. Hotel Sacher Wien"
                  className={`w-full px-3 py-2 rounded-xl text-xs border ${
                    theme === 'dark' ? 'bg-[#161d2d] border-slate-800 text-white' : 'bg-white border-slate-300'
                  }`}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Job Title / Role
                </label>
                <input
                  type="text"
                  value={simPosition}
                  onChange={e => setSimPosition(e.target.value)}
                  placeholder="e.g. Bartender & Mixologist"
                  className={`w-full px-3 py-2 rounded-xl text-xs border ${
                    theme === 'dark' ? 'bg-[#161d2d] border-slate-800 text-white' : 'bg-white border-slate-300'
                  }`}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Work Location / Country
                </label>
                <input
                  type="text"
                  value={simLocation}
                  onChange={e => setSimLocation(e.target.value)}
                  placeholder="e.g. Vienna, Austria"
                  className={`w-full px-3 py-2 rounded-xl text-xs border ${
                    theme === 'dark' ? 'bg-[#161d2d] border-slate-800 text-white' : 'bg-white border-slate-300'
                  }`}
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Verified Role Requirements
                </label>
                <textarea
                  rows={3}
                  value={simRequirements}
                  onChange={e => setSimRequirements(e.target.value)}
                  placeholder="Key role requirements to align with your real CV experience..."
                  className={`w-full px-3 py-2 rounded-xl text-xs border ${
                    theme === 'dark' ? 'bg-[#161d2d] border-slate-800 text-white' : 'bg-white border-slate-300'
                  }`}
                />
              </div>

              <button
                type="button"
                onClick={handleGenerateWithGemini}
                disabled={isGeneratingAi}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-60 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md shadow-blue-600/20 transition"
              >
                {isGeneratingAi ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Generating with Gemini...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Generate with Gemini (Actual CV)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Rule Enforcement Notice */}
          <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 space-y-1.5">
            <div className="font-bold text-white flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-blue-400" />
              <span>Zero-Hallucination & Single Cover Letter Policy</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Gemini strictly uses your verified CV work history, education, and skills from the Central CV Library. No unverified employers, degrees, or credentials are ever invented.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

