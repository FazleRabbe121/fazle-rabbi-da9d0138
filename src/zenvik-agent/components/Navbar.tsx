import React from 'react';
import {
  Cloud,
  CloudOff,
  LogOut,
  ShieldAlert,
  Smartphone,
  FileText,
  Lock,
  Mail,
  Menu,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { CCDLogo } from './CCDLogo';
import { ThemeToggle, useTheme } from '../context/ThemeContext';

interface NavbarProps {
  user: User | null;
  isOnline: boolean;
  isCloudSynced: boolean;
  onGoogleSignIn: () => void;
  onLogout: () => void;
  onOpenRelapseModal: () => void;
  onOpenUrgeGuide: () => void;
  onOpenAndroidExport: () => void;
  onOpenCVBuilder?: () => void;
  onOpenApplyByEmail?: () => void;
  onLockApp?: () => void;
  onToggleMobileMenu?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  isOnline,
  isCloudSynced,
  onGoogleSignIn,
  onLogout,
  onOpenUrgeGuide,
  onOpenAndroidExport,
  onOpenCVBuilder,
  onOpenApplyByEmail,
  onLockApp,
  onToggleMobileMenu,
}) => {
  const { theme } = useTheme();

  return (
    <header
      className={`sticky top-0 z-40 w-full backdrop-blur-2xl px-4 sm:px-6 py-3 transition-all border-b ${
        theme === 'dark'
          ? 'bg-[#15171c]/85 border-white/[0.07] text-white'
          : 'bg-white/90 border-slate-200/80 text-slate-900 shadow-[0_2px_15px_-3px_rgba(15,23,42,0.04)]'
      }`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand Logo & Mobile Menu Toggle */}
        <div className="flex items-center gap-2.5 min-w-0">
          {onToggleMobileMenu && (
            <button
              type="button"
              onClick={onToggleMobileMenu}
              className={`lg:hidden p-2 rounded-xl border transition cursor-pointer shrink-0 ${
                theme === 'dark'
                  ? 'border-white/[0.08] hover:bg-white/[0.08] text-zinc-300 hover:text-white'
                  : 'border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
              title="Open Navigation Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          <div className="hidden sm:flex items-center">
            <CCDLogo size={38} showSubtitle={true} />
          </div>
          <div className="flex sm:hidden items-center">
            <CCDLogo size={30} showSubtitle={true} />
          </div>
        </div>

        {/* Action Controls & User Account */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Light / Dark Mode Toggle */}
          <ThemeToggle compact={true} />

          {/* Cloud Sync Status */}
          <div
            className={`hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold border ${
              isCloudSynced && isOnline
                ? theme === 'dark'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : theme === 'dark'
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}
            title={isCloudSynced ? 'Connected & Synced with Firebase Cloud' : 'Offline / Local Persistence Active'}
          >
            {isCloudSynced && isOnline ? (
              <>
                <Cloud className="w-3.5 h-3.5" />
                <span>Cloud Synced</span>
              </>
            ) : (
              <>
                <CloudOff className="w-3.5 h-3.5" />
                <span>Local Mode</span>
              </>
            )}
          </div>

          {/* Emergency Urge Guide Quick Button */}
          <button
            onClick={onOpenUrgeGuide}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold tracking-tight flex items-center gap-1.5 transition cursor-pointer ${
              theme === 'dark'
                ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/30'
                : 'bg-rose-50 hover:bg-rose-100/80 text-rose-600 border-rose-200'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Urge Protocol</span>
            <span className="sm:hidden">Urge</span>
          </button>

          {/* CV Builder Shortcut Button */}
          {onOpenCVBuilder && (
            <button
              onClick={onOpenCVBuilder}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                theme === 'dark'
                  ? 'bg-white/[0.06] hover:bg-white/[0.12] text-zinc-200 border-white/[0.1]'
                  : 'bg-violet-50 hover:bg-violet-100 text-violet-700 border-violet-200'
              }`}
              title="Open Dynamic CV Builder & Multiple CV Library"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">CV Library</span>
              <span className="sm:hidden">CVs</span>
            </button>
          )}

          {/* Apply by Email Quick Button */}
          {onOpenApplyByEmail && (
            <button
              onClick={onOpenApplyByEmail}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-md cursor-pointer ${
                theme === 'dark'
                  ? 'bg-white text-[#141517] hover:bg-zinc-100'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
              title="Apply by Email with attached CV"
            >
              <Mail className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Apply by Email</span>
              <span className="sm:hidden">Apply</span>
            </button>
          )}

          {/* Android APK & GitHub Center Shortcut */}
          <button
            onClick={onOpenAndroidExport}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
              theme === 'dark'
                ? 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-zinc-200'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200/90 text-slate-700'
            }`}
            title="Download Project ZIP, Push to GitHub & Build Android APK"
          >
            <Smartphone className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">APK &amp; GitHub</span>
            <span className="sm:hidden">APK</span>
          </button>

          {/* Google Sign-In or User Profile */}
          {user ? (
            <div
              className={`flex items-center gap-2 pl-2 border-l ${
                theme === 'dark' ? 'border-white/[0.08]' : 'border-slate-200'
              }`}
            >
              <div className="relative group">
                <div
                  className={`flex items-center gap-2 p-1 pr-2.5 rounded-full border cursor-pointer transition ${
                    theme === 'dark'
                      ? 'bg-[#1c1e24] border-white/[0.08]'
                      : 'bg-slate-50 border-slate-200/90 hover:bg-slate-100'
                  }`}
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'User'}
                      className="w-7 h-7 rounded-full object-cover ring-2 ring-white/20"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-white text-[#141517] font-extrabold text-xs flex items-center justify-center shadow-xs">
                      {(user.displayName || user.email || 'F')[0].toUpperCase()}
                    </div>
                  )}
                  <span
                    className={`text-xs font-semibold hidden md:inline max-w-[100px] truncate ${
                      theme === 'dark' ? 'text-zinc-200' : 'text-slate-800'
                    }`}
                  >
                    {user.displayName || user.email?.split('@')[0]}
                  </span>
                </div>
              </div>

              <button
                onClick={onLogout}
                title="Sign Out"
                className={`p-2 rounded-xl transition cursor-pointer ${
                  theme === 'dark'
                    ? 'text-zinc-400 hover:text-rose-400 hover:bg-white/5'
                    : 'text-slate-500 hover:text-rose-600 hover:bg-rose-50'
                }`}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onGoogleSignIn}
              className={`px-3.5 py-1.5 rounded-xl border text-xs font-semibold shadow-xs flex items-center gap-2 transition cursor-pointer ${
                theme === 'dark'
                  ? 'bg-white/[0.06] hover:bg-white/[0.12] border-white/[0.1] text-white'
                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.8 7.3l3.7 2.9C6.4 7.2 8.9 5 12 5z"
                />
                <path
                  fill="#4285F4"
                  d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.5 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.8 7.3C.7 9.5 0 10.7 0 12s.7 2.5 1.8 4.7l3.7-1.9z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.6-2.2-6.5-5.2L1.8 16c1.9 3.7 5.7 7 10.2 7z"
                />
              </svg>
              <span className="hidden sm:inline">Continue with Google</span>
              <span className="sm:hidden">Sign In</span>
            </button>
          )}

          {/* Quick Lock Application Button */}
          {onLockApp && (
            <button
              onClick={onLockApp}
              className={`p-2 rounded-xl transition border cursor-pointer ${
                theme === 'dark'
                  ? 'border-white/[0.08] text-zinc-400 hover:text-white hover:bg-white/5'
                  : 'border-slate-200 text-slate-500 hover:text-blue-600 hover:bg-slate-100'
              }`}
              title="Lock Application / Switch Passcode"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
