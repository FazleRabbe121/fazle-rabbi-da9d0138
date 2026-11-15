import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowLeft, Loader2, ServerOff, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isUnlocked } from "@/lib/passcode";
import { setReturnTo } from "@/lib/return-to";

// The owner's ZENVIK-AGENT software (src/zenvik-agent/) is loaded only when this page opens.
const ZenvikAgentApp = lazy(() => import("virtual:zenvik-agent"));

const BACKEND_EVENT = "zenvik-agent:backend";
const API_URL = String(import.meta.env["VITE_ZENVIK_API_URL"] ?? "").trim();

const FEATURE_NAMES: [prefix: string, name: string][] = [
  ["/api/jobs", "Job search and applications"],
  ["/api/ai", "AI job tools"],
  ["/api/personal-ai", "AI assistant"],
  ["/api/agent", "AI agent"],
  ["/api/interview", "Interviews"],
  ["/api/recipe-book", "Recipe library sync"],
  ["/api/python-agent", "Python job hunter"],
  ["/api/finance", "Finance sync"],
  ["/api/validate-recipient", "Email checks"],
];
const featureName = (path: string) => FEATURE_NAMES.find(([p]) => path.startsWith(p))?.[1] ?? "This feature";

export const Route = createFileRoute("/zenvik-agent")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "ZENVIK-AGENT — Fazle Rabbi" },
      { name: "description", content: "Private ZENVIK-AGENT workspace." },
      { property: "og:title", content: "ZENVIK-AGENT — Fazle Rabbi" },
      { property: "og:description", content: "Private ZENVIK-AGENT workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  // Same gate as the recipe book: 4-digit passcode first, then sign-in.
  beforeLoad: async () => {
    if (!isUnlocked()) {
      setReturnTo("/zenvik-agent");
      throw redirect({ to: "/unlock" });
    }
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setReturnTo("/zenvik-agent");
      throw redirect({ to: "/login" });
    }
  },
  component: ZenvikAgentPage,
});

function ZenvikAgentPage() {
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const on = (e: Event) => {
      const path = (e as CustomEvent<{ path?: string }>).detail?.path ?? "";
      setNotice(featureName(path));
    };
    window.addEventListener(BACKEND_EVENT, on);
    return () => window.removeEventListener(BACKEND_EVENT, on);
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-background print:block print:h-auto">
      <header className="z-[70] flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-3 sm:px-5 print:hidden">
        <Link to="/" className="inline-flex items-center gap-2 font-display text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-primary">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          <span>Back to portfolio</span>
        </Link>
        <h1 className="font-display text-sm font-semibold uppercase tracking-[0.35em] text-gold-gradient">ZENVIK-AGENT</h1>
        <span
          className={`hidden items-center gap-1.5 font-display text-[0.6rem] uppercase tracking-[0.2em] sm:inline-flex ${API_URL ? "text-primary" : "text-muted-foreground"}`}
          title={API_URL ? `Server: ${API_URL}` : "The ZENVIK-AGENT server is not connected to this website."}
        >
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${API_URL ? "bg-primary" : "bg-muted-foreground"}`} />
          {API_URL ? "Server linked" : "Backend not connected"}
        </span>
      </header>

      {notice && (
        <div role="status" className="z-[70] flex shrink-0 items-start gap-3 border-b border-primary/30 bg-card px-4 py-2.5 text-sm text-foreground print:hidden">
          <ServerOff className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <p className="flex-1">
            <strong className="font-semibold text-primary">Backend not connected.</strong>{" "}
            {notice} needs the ZENVIK-AGENT server, which doesn't run on this website. Everything saved on this device still works.
          </p>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notice" className="rounded-sm p-1 text-muted-foreground hover:text-primary">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* translateZ makes this box the frame for the app's own fixed sidebar, bars and pop-ups. */}
      <div className="relative min-h-0 flex-1 [transform:translateZ(0)] print:static print:transform-none">
        <div className="absolute inset-0 overflow-y-auto print:static print:overflow-visible">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden /> Opening ZENVIK-AGENT…
              </div>
            }
          >
            <ZenvikAgentApp />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
