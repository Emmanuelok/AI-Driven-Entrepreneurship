"use client";

import { useState } from "react";
import { useLang, LANGS, type Lang } from "@/lib/i18n";
import { Globe, Check } from "lucide-react";

// Compact language picker in the top bar. Updates the i18n store; any
// component using useT() re-renders. Strings still fall through to
// English for keys not yet translated.

export function LangSwitcher() {
  const { lang, setLang, hydrated } = useLang();
  const [open, setOpen] = useState(false);
  if (!hydrated) return null;
  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-surface-2 border border-border hover:border-emerald/40 transition"
        title="Language"
      >
        <Globe className="size-3" /> {current.flag} {current.code.toUpperCase()}
      </button>
      {open && (
        <div className="absolute right-0 top-10 w-60 glass rounded-xl overflow-hidden z-30 shadow-2xl">
          <div className="px-4 py-2.5 border-b border-border text-[10px] uppercase tracking-widest text-muted">
            Language
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => { setLang(l.code as Lang); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-surface-2 transition text-left ${l.code === lang ? "text-emerald" : "text-foreground"}`}
              >
                <span className="text-lg">{l.flag}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{l.native}</div>
                  <div className="text-[10px] text-muted truncate">{l.label}</div>
                </div>
                {l.code === lang && <Check className="size-3.5 text-emerald" />}
              </button>
            ))}
          </div>
          <div className="px-4 py-2 border-t border-border text-[10px] text-muted">
            Most strings still in English — translations rolling out.
          </div>
        </div>
      )}
    </div>
  );
}
