import React, { createContext, useContext, useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

export type ThemeMode = 'dark' | 'light';

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  setTheme: () => {},
  toggleTheme: () => {},
});

const THEME_STORAGE_KEY = 'ccd_umbra_theme_mode_v3';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        return stored;
      }
    } catch (e) {
      console.warn('Could not read theme from localStorage:', e);
    }
    return 'dark';
  });

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
      localStorage.setItem('fazle_app_theme_mode', newTheme);
    } catch (e) {
      console.warn('Could not write theme to localStorage:', e);
    }
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

/**
 * Luxury Glassmorphism Theme Selector Component (Matches Reference Video Light / Dark Switcher)
 */
export const ThemeToggle: React.FC<{ className?: string; compact?: boolean }> = ({
  className = '',
  compact = false,
}) => {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={`inline-flex items-center p-1 rounded-full transition-all ${
        theme === 'dark'
          ? 'bg-[#14161b]/90 border border-white/[0.08] shadow-inner'
          : 'bg-slate-100 border border-slate-200/90 shadow-inner'
      } ${className}`}
      role="group"
      aria-label="Theme mode switcher"
    >
      {/* Light Mode Button */}
      <button
        type="button"
        onClick={() => setTheme('light')}
        aria-pressed={theme === 'light'}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-tight transition-all cursor-pointer ${
          theme === 'light'
            ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80 font-bold'
            : 'text-zinc-400 hover:text-zinc-200'
        }`}
        title="Switch to Light Mode"
      >
        <Sun className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-amber-500' : 'text-zinc-400'}`} />
        {!compact && <span>Light</span>}
        {compact && <span className="sr-only sm:not-sr-only text-[11px]">Light</span>}
      </button>

      {/* Dark Mode Button */}
      <button
        type="button"
        onClick={() => setTheme('dark')}
        aria-pressed={theme === 'dark'}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-tight transition-all cursor-pointer ${
          theme === 'dark'
            ? 'bg-white text-[#141517] shadow-md font-bold'
            : 'text-slate-500 hover:text-slate-800'
        }`}
        title="Switch to Dark Mode"
      >
        <Moon className={`w-3.5 h-3.5 ${theme === 'dark' ? 'text-[#141517] fill-[#141517]/20' : 'text-slate-500'}`} />
        {!compact && <span>Dark</span>}
        {compact && <span className="sr-only sm:not-sr-only text-[11px]">Dark</span>}
      </button>
    </div>
  );
};
