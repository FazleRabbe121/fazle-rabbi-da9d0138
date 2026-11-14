import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  ExternalLink,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Search,
  Database,
  ArrowUpRight,
  Sparkles,
  ShieldCheck,
  FolderOpen,
  Trash2,
  Calendar,
  Building,
  Mail,
  Sliders,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import {
  getConnectedSpreadsheetId,
  setConnectedSpreadsheetId,
  getConnectedSpreadsheetName,
  isSheetsAutoSyncEnabled,
  setSheetsAutoSyncEnabled,
  getSpreadsheetDetails,
  createJobTrackerSpreadsheet,
  listUserSpreadsheets,
  syncAllApplicationsToSheet,
  overwriteSpreadsheetWithRecords,
  GoogleSpreadsheetItem,
  SpreadsheetDetails,
  SheetRowData,
  getSpreadsheetUrl,
  getValidSheetsToken,
} from '../services/sheetsService';
import { loadAppliedJobRecords, AppliedJobRecord } from '../services/jobDatabaseService';
import { getCachedUserEmail, getCachedGoogleToken, isGoogleTokenExpired, signInWithGoogle } from '../services/firebase';

export const GoogleSheetsTrackerView: React.FC = () => {
  const { theme } = useTheme();

  // State
  const [connectedId, setConnectedId] = useState<string | null>(() => getConnectedSpreadsheetId());
  const [connectedName, setConnectedName] = useState<string>(() => getConnectedSpreadsheetName());
  const [details, setDetails] = useState<SpreadsheetDetails | null>(null);
  const [userSheetsList, setUserSheetsList] = useState<GoogleSpreadsheetItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [autoSync, setAutoSync] = useState<boolean>(() => isSheetsAutoSyncEnabled());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showDrivePicker, setShowDrivePicker] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [customSheetTitle, setCustomSheetTitle] = useState<string>('Job Hunter AI - Applications Tracker');

  const appliedRecords = useMemo(() => loadAppliedJobRecords(), []);
  const userEmail = getCachedUserEmail();
  const token = getCachedGoogleToken();
  const isAuthValid = !!token && !isGoogleTokenExpired();

  // Load connected spreadsheet details
  const loadDetails = async (sheetId?: string) => {
    const idToLoad = sheetId || connectedId;
    if (!idToLoad) return;
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const data = await getSpreadsheetDetails(idToLoad);
      setDetails(data);
      setConnectedName(data.title);
      setConnectedSpreadsheetId(data.id, data.title);
    } catch (err: any) {
      console.error('Error loading spreadsheet:', err);
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Could not load Google Sheet details. Please check permissions.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (connectedId) {
      loadDetails(connectedId);
    }
  }, [connectedId]);

  // Handle Google Re-Authentication
  const handleConnectGoogle = async () => {
    try {
      setIsLoading(true);
      await signInWithGoogle();
      setStatusMessage({ type: 'success', text: 'Google Account successfully connected.' });
      if (connectedId) {
        await loadDetails(connectedId);
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to authenticate with Google.' });
    } finally {
      setIsLoading(false);
    }
  };

  // Create new Tracker Spreadsheet
  const handleCreateSheet = async () => {
    setIsCreating(true);
    setStatusMessage(null);
    try {
      const newSheet = await createJobTrackerSpreadsheet(customSheetTitle);
      setConnectedId(newSheet.id);
      setConnectedName(newSheet.title);
      setDetails(newSheet);

      // Auto-sync existing applications if any
      if (appliedRecords.length > 0) {
        setStatusMessage({ type: 'info', text: `Created "${newSheet.title}". Syncing ${appliedRecords.length} recorded jobs...` });
        const syncRes = await syncAllApplicationsToSheet(newSheet.id, appliedRecords);
        await loadDetails(newSheet.id);
        setStatusMessage({
          type: 'success',
          text: `Created Google Sheet and synced ${syncRes.added} application(s) successfully!`,
        });
      } else {
        setStatusMessage({
          type: 'success',
          text: `Created "${newSheet.title}" successfully in your Google Drive!`,
        });
      }
    } catch (err: any) {
      console.error('Failed to create sheet:', err);
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to create Google Sheet.' });
    } finally {
      setIsCreating(false);
    }
  };

  // Sync all applications to connected sheet (additive)
  const handleSyncNow = async () => {
    if (!connectedId) {
      setStatusMessage({ type: 'error', text: 'Please connect or create a Google Sheet first.' });
      return;
    }
    setIsSyncing(true);
    setStatusMessage(null);
    try {
      const result = await syncAllApplicationsToSheet(connectedId, appliedRecords);
      await loadDetails(connectedId);
      setStatusMessage({
        type: 'success',
        text: `Sync complete: ${result.added} new row(s) added, ${result.skipped} already up to date.`,
      });
    } catch (err: any) {
      console.error('Sync error:', err);
      setStatusMessage({ type: 'error', text: err?.message || 'Sync failed.' });
    } finally {
      setIsSyncing(false);
    }
  };

  // Fetch list of user's Google Drive spreadsheets
  const handleOpenDrivePicker = async () => {
    setShowDrivePicker(true);
    setIsLoading(true);
    try {
      const list = await listUserSpreadsheets();
      setUserSheetsList(list);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to list spreadsheets from Google Drive.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectExistingSheet = (item: GoogleSpreadsheetItem) => {
    setConnectedId(item.id);
    setConnectedName(item.name);
    setConnectedSpreadsheetId(item.id, item.name);
    setShowDrivePicker(false);
    setStatusMessage({ type: 'success', text: `Connected to "${item.name}". Loading data...` });
  };

  // Overwrite entire sheet after user confirmation
  const handleConfirmOverwrite = async () => {
    if (!connectedId) return;
    setShowConfirmModal(false);
    setIsSyncing(true);
    try {
      await overwriteSpreadsheetWithRecords(connectedId, appliedRecords);
      await loadDetails(connectedId);
      setStatusMessage({
        type: 'success',
        text: `Spreadsheet was reset and refreshed with all ${appliedRecords.length} application records.`,
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to overwrite sheet.' });
    } finally {
      setIsSyncing(false);
    }
  };

  // Filter rows for the table view
  const filteredRows = useMemo(() => {
    if (!details || !details.rows) return [];
    if (!searchQuery.trim()) return details.rows;
    const q = searchQuery.toLowerCase();
    return details.rows.filter(
      r =>
        r.company.toLowerCase().includes(q) ||
        r.position.toLowerCase().includes(q) ||
        r.location.toLowerCase().includes(q) ||
        r.recipientEmail.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q)
    );
  }, [details, searchQuery]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div
        className={`p-6 rounded-3xl border transition-all ${
          theme === 'dark' ? 'bg-[#101625] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-extrabold tracking-tight">Google Sheets Applications Tracker</h1>
                <span className="px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Live Cloud Sync
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Real-time bi-directional tracking · Auto-formats job leads, cover letters & status updates directly into your Google Drive
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isAuthValid ? (
              <button
                onClick={handleConnectGoogle}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2 transition-all shadow-md"
              >
                <Sparkles className="w-4 h-4" />
                Connect Google Account
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/40 border border-slate-700/60 text-[11px] text-slate-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>{userEmail}</span>
              </div>
            )}
          </div>
        </div>

        {/* Status Alert */}
        {statusMessage && (
          <div
            className={`mt-4 p-3 rounded-xl text-xs flex items-center gap-2 border ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : statusMessage.type === 'error'
                ? 'bg-red-500/10 border-red-500/30 text-red-300'
                : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : statusMessage.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}
      </div>

      {/* Connection & Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Active Spreadsheet Card */}
        <div
          className={`lg:col-span-2 p-6 rounded-3xl border flex flex-col justify-between ${
            theme === 'dark' ? 'bg-[#101625] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-800/60">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-bold text-white">Connected Spreadsheet</h2>
              </div>
              {connectedId && (
                <a
                  href={getSpreadsheetUrl(connectedId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-all"
                >
                  <span>Open in Google Sheets</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>

            {connectedId ? (
              <div className="mt-4 space-y-4">
                <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
                  <div className="text-xs text-slate-400">Spreadsheet Name</div>
                  <div className="text-base font-bold text-white mt-0.5">{connectedName}</div>
                  <div className="text-[11px] text-slate-500 font-mono mt-1 truncate">ID: {connectedId}</div>

                  <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-slate-800/60 text-center">
                    <div className="p-2 rounded-xl bg-slate-800/40">
                      <div className="text-lg font-extrabold text-emerald-400">{details?.totalRows ?? 0}</div>
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Rows in Sheet</div>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-800/40">
                      <div className="text-lg font-extrabold text-blue-400">{appliedRecords.length}</div>
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Local Apps</div>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-800/40">
                      <div className="text-lg font-extrabold text-purple-400">
                        {details?.sheets.length ?? 0}
                      </div>
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Tabs</div>
                    </div>
                  </div>
                </div>

                {/* Auto-Sync Toggle */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-800/30 border border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                      <RefreshCw className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">Auto-Sync on Send</div>
                      <div className="text-[11px] text-slate-400">
                        Automatically append every sent email application to this Google Sheet
                      </div>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoSync}
                      onChange={e => {
                        setAutoSync(e.target.checked);
                        setSheetsAutoSyncEnabled(e.target.checked);
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>
              </div>
            ) : (
              <div className="mt-8 py-8 text-center flex flex-col items-center">
                <div className="w-14 h-14 rounded-3xl bg-slate-800/60 text-slate-400 flex items-center justify-center mb-3">
                  <FileSpreadsheet className="w-7 h-7" />
                </div>
                <h3 className="text-sm font-bold text-white">No Google Sheet Connected Yet</h3>
                <p className="text-xs text-slate-400 max-w-sm mt-1 mb-5">
                  Create a pre-formatted tracker sheet with 1 click, or choose an existing spreadsheet from your Google Drive.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={handleCreateSheet}
                    disabled={isCreating}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-2 transition-all shadow-md"
                  >
                    {isCreating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Create Job Tracker Sheet
                  </button>
                  <button
                    onClick={handleOpenDrivePicker}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-2 transition-all"
                  >
                    <FolderOpen className="w-4 h-4" />
                    Pick from Drive
                  </button>
                </div>
              </div>
            )}
          </div>

          {connectedId && (
            <div className="mt-6 pt-4 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSyncNow}
                  disabled={isSyncing || isLoading}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-all shadow-md disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Syncing...' : 'Sync Now (Push Local Apps)'}
                </button>
                <button
                  onClick={() => loadDetails()}
                  disabled={isLoading}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenDrivePicker}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition-colors"
                >
                  Switch Sheet
                </button>
                <button
                  onClick={() => setShowConfirmModal(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Overwrite Sheet with Clean Copy"
                >
                  Full Re-sync
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Quick Tools Card */}
        <div
          className={`p-6 rounded-3xl border flex flex-col justify-between ${
            theme === 'dark' ? 'bg-[#101625] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div>
            <div className="flex items-center gap-2 pb-4 border-b border-slate-800/60">
              <Sliders className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-bold text-white">Create New Tracker</h2>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Spreadsheet Title
                </label>
                <input
                  type="text"
                  value={customSheetTitle}
                  onChange={e => setCustomSheetTitle(e.target.value)}
                  placeholder="e.g. Europe & Cyprus Job Tracker 2026"
                  className={`w-full px-3 py-2 rounded-xl text-xs border ${
                    theme === 'dark'
                      ? 'bg-[#161d2d] border-slate-800 text-white focus:border-blue-500'
                      : 'bg-white border-slate-300'
                  }`}
                />
              </div>

              <div className="p-3 rounded-2xl bg-slate-900/40 border border-slate-800 text-xs space-y-1.5 text-slate-400">
                <div className="font-semibold text-slate-300">Automated Column Structure:</div>
                <div className="grid grid-cols-2 gap-1 text-[11px]">
                  <span>• Date Applied</span>
                  <span>• Company</span>
                  <span>• Position</span>
                  <span>• Location</span>
                  <span>• Email Recruiter</span>
                  <span>• Status</span>
                  <span>• Match Score</span>
                  <span>• Job Source URL</span>
                  <span>• Cover Letter</span>
                  <span>• Last Updated</span>
                </div>
              </div>

              <button
                onClick={handleCreateSheet}
                disabled={isCreating}
                className="w-full py-2.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center gap-2 transition-all shadow-md mt-2"
              >
                {isCreating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {isCreating ? 'Creating in Google Drive...' : 'Create & Connect New Sheet'}
              </button>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800/60 text-[11px] text-slate-500 leading-relaxed">
            All spreadsheet changes sync to your real Google Drive storage. You can share this sheet with recruiters, mentors, or import it into Notion/Airtable anytime.
          </div>
        </div>
      </div>

      {/* Spreadsheet Data Viewer */}
      <div
        className={`rounded-3xl border overflow-hidden ${
          theme === 'dark' ? 'bg-[#101625] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white">Live Sheet Data Viewer</h3>
            <span className="text-xs text-slate-400">({filteredRows.length} displayed)</span>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              placeholder="Search in sheet rows..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={`w-full pl-9 pr-3 py-1.5 rounded-xl text-xs border ${
                theme === 'dark' ? 'bg-[#161d2d] border-slate-800 text-white' : 'bg-white border-slate-300'
              }`}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center">
            <RefreshCw className="w-6 h-6 animate-spin mb-2 text-emerald-400" />
            <div className="text-xs">Loading Google Sheet data...</div>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <FileSpreadsheet className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <div className="text-xs font-semibold text-slate-400">No application rows found in this sheet</div>
            <p className="text-[11px] mt-1 text-slate-500">
              {connectedId
                ? 'Click "Sync Now" above to push your locally recorded job applications to this spreadsheet.'
                : 'Connect or create a Google Sheet to start synchronizing.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/40 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Date Applied</th>
                  <th className="py-3 px-4">Company</th>
                  <th className="py-3 px-4">Position</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Recipient Email</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Match</th>
                  <th className="py-3 px-4">Source / Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredRows.map((r, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 text-slate-500 font-mono text-[10px]">{r.rowIndex}</td>
                    <td className="py-3 px-4 text-slate-300 flex items-center gap-1.5">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      {r.dateApplied || 'N/A'}
                    </td>
                    <td className="py-3 px-4 font-bold text-white">
                      <div className="flex items-center gap-1.5">
                        <Building className="w-3 h-3 text-blue-400" />
                        <span>{r.company}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-medium">{r.position}</td>
                    <td className="py-3 px-4 text-slate-400">{r.location || 'Europe / Global'}</td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3 h-3 text-emerald-400" />
                        <span>{r.recipientEmail}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {r.status || 'Applied'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-emerald-400">{r.matchScore || '95%'}</td>
                    <td className="py-3 px-4">
                      {r.jobUrl ? (
                        <a
                          href={r.jobUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 underline"
                        >
                          <span>Posting</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-slate-600 text-[10px]">Direct Email</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drive Spreadsheet Picker Modal */}
      {showDrivePicker && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-lg p-6 rounded-3xl border shadow-2xl ${
              theme === 'dark' ? 'bg-[#101625] border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Select Google Sheet from Drive</h3>
              </div>
              <button
                onClick={() => setShowDrivePicker(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="mt-4 max-h-80 overflow-y-auto space-y-2">
              {isLoading ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-400" />
                  Searching Google Drive for spreadsheets...
                </div>
              ) : userSheetsList.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  No spreadsheets found in your Google Drive.
                </div>
              ) : (
                userSheetsList.map(item => (
                  <div
                    key={item.id}
                    onClick={() => handleSelectExistingSheet(item)}
                    className="p-3 rounded-2xl bg-slate-900/50 hover:bg-slate-800/80 border border-slate-800 cursor-pointer transition-all flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div>
                        <div className="text-xs font-bold text-white">{item.name}</div>
                        <div className="text-[10px] text-slate-400">
                          Modified: {item.modifiedTime ? new Date(item.modifiedTime).toLocaleDateString() : 'N/A'}
                        </div>
                      </div>
                    </div>
                    <button className="px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white">
                      Select
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Destructive Re-sync (Skill Requirement) */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-md p-6 rounded-3xl border shadow-2xl ${
              theme === 'dark' ? 'bg-[#101625] border-red-500/30' : 'bg-white border-red-300'
            }`}
          >
            <div className="flex items-center gap-3 text-red-400 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-red-500/10 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">Confirm Sheet Overwrite</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Are you sure you want to overwrite all rows in <span className="font-bold text-white">"{connectedName}"</span>?
              This will clear existing spreadsheet data in the Applications tab and replace it with your current local application records ({appliedRecords.length} items).
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmOverwrite}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors"
              >
                Confirm Overwrite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
