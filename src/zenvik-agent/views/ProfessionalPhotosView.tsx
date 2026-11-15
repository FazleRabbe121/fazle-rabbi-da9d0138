import React, { useState, useRef } from 'react';
import {
  Image as ImageIcon,
  Upload,
  Trash2,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  Paperclip,
  Eye,
  FolderOpen,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import {
  ProfessionalPhotoItem,
  loadProfessionalPhotos,
  saveProfessionalPhotos,
  addProfessionalPhoto,
  removeProfessionalPhoto,
} from '../services/photoStorageService';

export const ProfessionalPhotosView: React.FC = () => {
  const { theme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [photos, setPhotos] = useState<ProfessionalPhotoItem[]>(() => loadProfessionalPhotos());
  const [selectedPreview, setSelectedPreview] = useState<ProfessionalPhotoItem | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const driveUrl = 'https://drive.google.com/drive/folders/1xVPTeJLJjcyigLGltGfwQlWDw_F3GDVN';

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      showToast('Photo size must be under 10 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1] || '';
      const newPhoto: ProfessionalPhotoItem = {
        id: `photo-${Date.now()}`,
        name: file.name,
        caption: 'Uploaded Professional Document / Photograph',
        url: result,
        base64: base64Data,
        mimeType: file.type || 'image/jpeg',
        sizeFormatted: `${(file.size / 1024).toFixed(0)} KB`,
        isDefaultAttached: true,
        uploadedAt: new Date().toISOString(),
      };

      const updated = addProfessionalPhoto(newPhoto);
      setPhotos(updated);
      showToast(`Added "${file.name}" to professional photo library.`);
    };
    reader.readAsDataURL(file);
  };

  const handleToggleDefault = (id: string) => {
    const updated = photos.map(p =>
      p.id === id ? { ...p, isDefaultAttached: !p.isDefaultAttached } : p
    );
    saveProfessionalPhotos(updated);
    setPhotos(updated);
  };

  const handleDeletePhoto = (id: string) => {
    const updated = removeProfessionalPhoto(id);
    setPhotos(updated);
    if (selectedPreview?.id === id) setSelectedPreview(null);
    showToast('Photo removed from library.');
  };

  const handleCopyDrive = () => {
    navigator.clipboard.writeText(driveUrl);
    setIsCopied(true);
    showToast('Portfolio Google Drive link copied!');
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*"
        className="hidden"
      />

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
            <div className="w-10 h-10 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">Professional Photos & Documents</h1>
              <p className="text-xs text-slate-400">
                Persistent photo library · Default attachments for Gmail applications · Google Drive portfolio
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-2 transition active:scale-95 shadow-md shadow-blue-600/20"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload New Photo</span>
            </button>
          </div>
        </div>
      </div>

      {/* Google Drive Portfolio Link Card */}
      <div
        className={`p-5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          theme === 'dark' ? 'bg-[#151c2e] border-blue-500/30' : 'bg-blue-50/60 border-blue-200'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0">
            <FolderOpen className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-xs text-white flex items-center gap-2">
              <span>Google Drive Video Portfolio & Verification Documents</span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/20 text-blue-300">
                Live Link
              </span>
            </div>
            <div className="text-[11px] text-slate-400 truncate mt-0.5">{driveUrl}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          <button
            type="button"
            onClick={handleCopyDrive}
            className="px-3 py-1.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition"
          >
            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{isCopied ? 'Copied' : 'Copy URL'}</span>
          </button>
          <a
            href={driveUrl}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open Drive</span>
          </a>
        </div>
      </div>

      {/* Photo Library Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {photos.map(photo => {
          return (
            <div
              key={photo.id}
              className={`rounded-2xl border overflow-hidden flex flex-col transition-all ${
                theme === 'dark' ? 'bg-[#101625] border-slate-800 hover:border-slate-700' : 'bg-white border-slate-200 shadow-xs'
              }`}
            >
              {/* Image Preview Container */}
              <div className="h-44 bg-slate-950 relative overflow-hidden group">
                <img
                  src={photo.url}
                  alt={photo.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <button
                  type="button"
                  onClick={() => setSelectedPreview(photo)}
                  className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-bold gap-1"
                >
                  <Eye className="w-4 h-4" />
                  <span>View Fullsize</span>
                </button>
              </div>

              {/* Photo Meta & Actions */}
              <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                <div>
                  <div className="font-bold text-xs text-white truncate" title={photo.name}>
                    {photo.name}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">
                    {photo.caption || 'Professional candidate photo'}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">Size: {photo.sizeFormatted || '180 KB'}</div>
                </div>

                <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={Boolean(photo.isDefaultAttached)}
                      onChange={() => handleToggleDefault(photo.id)}
                      className="rounded accent-blue-600"
                    />
                    <span>Attach to emails</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => handleDeletePhoto(photo.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                    title="Delete photo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Fullsize Image Modal */}
      {selectedPreview && (
        <div
          onClick={() => setSelectedPreview(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="max-w-2xl w-full rounded-3xl overflow-hidden border border-slate-700 bg-[#121826] p-4 space-y-3"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-white truncate">{selectedPreview.name}</span>
              <button
                type="button"
                onClick={() => setSelectedPreview(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[70vh] overflow-hidden rounded-xl">
              <img src={selectedPreview.url} alt="" className="w-full h-auto object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
