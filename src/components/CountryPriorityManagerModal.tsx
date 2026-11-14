import React, { useState } from 'react';
import {
  Globe,
  ShieldCheck,
  Search,
  ExternalLink,
  BookOpen,
  Filter,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowUpDown,
  Sparkles,
  ChevronRight,
  Info,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import {
  CountryImmigrationProfile,
  PriorityGroup,
  loadCountryProfiles,
  saveCountryProfiles,
  updateCountryProfile,
} from '../services/countryPriorityService';

interface CountryImmigrationModalProps {
  country: CountryImmigrationProfile | null;
  onClose: () => void;
}

export const CountryImmigrationModal: React.FC<CountryImmigrationModalProps> = ({
  country,
  onClose,
}) => {
  const { theme } = useTheme();
  if (!country) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-xs">
      <div
        className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border p-6 sm:p-7 space-y-5 shadow-2xl ${
          theme === 'dark' ? 'bg-[#111728] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{country.flag}</span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-black">{country.countryName}</h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Priority Group {country.group}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Official Immigration & Hospitality Recruitment Profile · Researched: {country.researchDate}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        {/* Primary Route */}
        <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-purple-400" />
              <span>Primary Work Authorization Route</span>
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-200">
              {country.routeType}
            </span>
          </div>
          <p className="text-sm font-semibold text-white">{country.primaryWorkVisaRoute}</p>
          {country.seasonalQuotaRules && (
            <p className="text-xs text-slate-300 leading-relaxed pt-1">
              {country.seasonalQuotaRules}
            </p>
          )}
        </div>

        {/* Skills Pass (Malta specific) */}
        {country.skillsPassRequired && (
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-amber-300">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Tourism and Hospitality Skills Pass Mandatory</span>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              {country.skillsPassDetails}
            </p>
          </div>
        )}

        {/* Bangladeshi Passport Holder Practical Eligibility */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
            Bangladeshi Passport Holder Legal Feasibility
          </label>
          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 leading-relaxed">
            {country.bangladeshiEligibilityNotes}
          </div>
        </div>

        {/* Salary & Labor Market Testing */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
            Salary Threshold & Labor Market Clearance
          </label>
          <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 leading-relaxed">
            {country.currentSalaryOrLaborRequirement}
          </div>
        </div>

        {/* Critical Verification Checks */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
            Mandatory Verification Steps Before Classifying Job as Sponsorable
          </label>
          <ul className="space-y-1.5 text-xs text-slate-300">
            {country.criticalChecks.map((check, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>{check}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Official Authority Source Link */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800">
          <div className="text-[11px] text-slate-400">
            Authority: <strong>{country.officialImmigrationAuthority}</strong>
          </div>
          <a
            href={country.officialImmigrationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-purple-600/30"
          >
            <span>Visit Official Government Portal</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
};

export const CountryPriorityManagerModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onProfilesUpdated?: () => void;
}> = ({ isOpen, onClose, onProfilesUpdated }) => {
  const { theme } = useTheme();
  const [profiles, setProfiles] = useState<CountryImmigrationProfile[]>(() => loadCountryProfiles());
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [inspectCountry, setInspectCountry] = useState<CountryImmigrationProfile | null>(null);

  if (!isOpen) return null;

  const handleToggleActive = (id: string) => {
    const next = profiles.map(p => (p.id === id ? { ...p, activeSearch: !p.activeSearch } : p));
    setProfiles(next);
    saveCountryProfiles(next);
    onProfilesUpdated?.();
  };

  const handlePriorityChange = (id: string, newPriority: number) => {
    const next = profiles.map(p => (p.id === id ? { ...p, searchPriority: newPriority } : p));
    next.sort((a, b) => a.searchPriority - b.searchPriority);
    setProfiles(next);
    saveCountryProfiles(next);
    onProfilesUpdated?.();
  };

  const filtered = profiles.filter(p => {
    if (selectedGroup !== 'all' && p.group !== selectedGroup) return false;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-xs">
      <div
        className={`w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl border p-6 sm:p-7 space-y-5 shadow-2xl ${
          theme === 'dark' ? 'bg-[#111728] border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
        }`}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-purple-400" />
              <h3 className="text-xl font-black">Country Priority & Search Configuration</h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Editable immigration research database. Prioritize destinations without hardcoding false visa guarantees.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        {/* Priority Groups Summary Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setSelectedGroup('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              selectedGroup === 'all'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            All Destinations ({profiles.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedGroup('A')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              selectedGroup === 'A'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            Priority A — High Seasonal (Italy, Croatia, Greece, Malta, Spain, NZ)
          </button>
          <button
            type="button"
            onClick={() => setSelectedGroup('B')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              selectedGroup === 'B'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            Priority B — Continuous (UK, Australia, Belgium, NL, Portugal)
          </button>
          <button
            type="button"
            onClick={() => setSelectedGroup('C')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              selectedGroup === 'C'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            Priority C — European Markets (France, Germany, Ireland, Austria, etc.)
          </button>
        </div>

        {/* Country Table */}
        <div className="space-y-2.5">
          {filtered.map(country => (
            <div
              key={country.id}
              className={`p-3.5 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                country.activeSearch
                  ? theme === 'dark'
                    ? 'bg-[#151c2e] border-slate-800'
                    : 'bg-slate-50 border-slate-200'
                  : 'bg-slate-900/40 border-slate-800/60 opacity-60'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{country.flag}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white">{country.countryName}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-purple-500/20 text-purple-300">
                      Group {country.group}
                    </span>
                    <span className="text-xs text-slate-500">#{country.searchPriority}</span>
                  </div>
                  <div className="text-xs text-slate-400 truncate max-w-md">
                    {country.primaryWorkVisaRoute}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setInspectCountry(country)}
                  className="px-3 py-1.5 rounded-xl border border-purple-500/40 text-purple-300 hover:bg-purple-500/10 text-xs font-semibold flex items-center gap-1"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Immigration Rules</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleActive(country.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    country.activeSearch
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {country.activeSearch ? 'Active Search' : 'Paused'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-2 text-right">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-600/30"
          >
            Save & Return to Sponsorship Search
          </button>
        </div>
      </div>

      {inspectCountry && (
        <CountryImmigrationModal
          country={inspectCountry}
          onClose={() => setInspectCountry(null)}
        />
      )}
    </div>
  );
};
