import React from 'react';
import { useTheme } from '../context/ThemeContext';

export const ZENVIK_ICON_SRC =
  '/assets/aistudio/file_00000000abf8820a8353e92b70669dc5_24b0e7a6.png';
export const ZENVIK_LOCKUP_SRC =
  '/assets/aistudio/file_00000000901c820a8cd48a0ef1e8c6a7_2ef7f518.png';

export interface CCDLogoProps {
  className?: string;
  size?: number;
  showSubtitle?: boolean;
  variant?: 'blue' | 'gold' | 'minimal';
  mode?: 'auto' | 'icon' | 'lockup';
  forceDark?: boolean;
  forceLight?: boolean;
}

/**
 * Official ZENVIK Brand Identity Component
 * Uses the exact uploaded ZENVIK icon and horizontal lockup assets without modification or distortion.
 * Automatically adapts between Light Mode and Dark Mode with ChatGPT / Claude-inspired minimal clarity.
 */
export const CCDLogo: React.FC<CCDLogoProps> = ({
  className = '',
  size = 40,
  showSubtitle = false,
  mode = 'auto',
  forceDark = false,
  forceLight = false,
}) => {
  const { theme } = useTheme();
  const isDark = forceLight ? false : forceDark ? true : theme === 'dark';
  const renderLockup = mode === 'lockup' || (mode === 'auto' && showSubtitle);

  if (renderLockup) {
    // Full official ZENVIK Agent horizontal lockup (exact uploaded asset proportions preserved)
    const lockupHeight = Math.max(28, Math.round(size * 0.92));
    return (
      <div
        className={`inline-flex items-center shrink-0 select-none ${className}`}
        title="ZENVIK Agent — AI Career & Employment Platform"
      >
        <div
          className="relative overflow-hidden shrink-0"
          style={{
            height: lockupHeight,
            aspectRatio: '1768 / 348',
          }}
        >
          <img
            src={ZENVIK_LOCKUP_SRC}
            alt="ZENVIK Agent — AI Career & Employment Platform"
            draggable={false}
            className={`block select-none pointer-events-none transition-all duration-200 ${
              isDark ? 'invert brightness-110 contrast-105' : ''
            }`}
            style={{
              width: '122.85%',
              maxWidth: 'none',
              height: 'auto',
              transform: 'translate(-9.67%, -25.69%)',
            }}
          />
        </div>
      </div>
    );
  }

  // Standalone Official ZENVIK Symbol Icon (exact uploaded icon proportions preserved)
  return (
    <div
      className={`inline-flex items-center gap-2.5 shrink-0 select-none ${className}`}
      title="ZENVIK Agent — AI Career & Employment Platform"
    >
      <div
        className={`relative flex items-center justify-center rounded-xl overflow-hidden shrink-0 transition-all duration-200 ${
          isDark
            ? 'bg-white/[0.06] border border-white/[0.1] shadow-xs'
            : 'bg-white border border-slate-200/90 shadow-xs'
        }`}
        style={{ width: size, height: size, aspectRatio: '1 / 1' }}
      >
        <img
          src={ZENVIK_ICON_SRC}
          alt="ZENVIK Official Logo"
          draggable={false}
          className={`w-[138%] h-[138%] max-w-none object-contain select-none pointer-events-none transition-all duration-200 ${
            isDark ? 'invert brightness-110' : ''
          }`}
        />
      </div>
    </div>
  );
};

export const ZenvikLogo = CCDLogo;
