/**
 * Mount point for the ZENVIK-AGENT (CCD) app inside the portfolio at /zenvik-agent.
 * Lazy-loaded through `virtual:zenvik-agent`, so none of this code or CSS is part of the
 * portfolio's first load.
 *
 * CSS isolation: the CCD stylesheet (index.css, Tailwind + html.dark/html.light rules) is
 * imported as a string and injected only while this component is mounted, then removed,
 * and ThemeProvider restores the <html> classes on unmount — so the portfolio is never restyled.
 */
import React, { Component, useLayoutEffect, useState } from 'react';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import ccdCss from './index.css?inline';
import { BACKEND_MESSAGE, installBackendShim } from './backend';

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Bodoni+Moda:wght@600;700&family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Jost:wght@400;600;700&family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=Playfair+Display:ital,wght@0,700;1,700&display=swap';

class ZenvikErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('[ZENVIK-AGENT]', error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="min-h-[60vh] flex items-center justify-center p-6 bg-[#131519] text-[#f4f4f5]">
        <div className="max-w-md text-center space-y-3">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-300">ZENVIK-AGENT</p>
          <h2 className="text-lg font-semibold">This screen couldn't open</h2>
          <p className="text-sm text-zinc-400">
            Some features need the ZENVIK-AGENT server. {BACKEND_MESSAGE.replace('Backend not connected. ', '')}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 rounded-xl bg-white text-[#141517] text-xs font-bold cursor-pointer"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}

export default function ZenvikAgentApp() {
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const style = document.createElement('style');
    style.dataset['zenvikAgent'] = 'styles';
    style.textContent = ccdCss;
    document.head.appendChild(style);

    const font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = FONT_HREF;
    font.dataset['zenvikAgent'] = 'fonts';
    document.head.appendChild(font);

    const uninstall = installBackendShim();
    setReady(true);
    return () => {
      uninstall();
      style.remove();
      font.remove();
    };
  }, []);

  if (!ready) return null;
  return (
    <ThemeProvider>
      <ZenvikErrorBoundary>
        <App />
      </ZenvikErrorBoundary>
    </ThemeProvider>
  );
}
