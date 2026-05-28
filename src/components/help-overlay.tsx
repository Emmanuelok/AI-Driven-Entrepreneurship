"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Keyboard, X, MessageSquare, BookOpen, Bug, Shield, Hammer, Rocket, Lightbulb, Compass, FlaskConical } from "lucide-react";

// Help overlay — opens with `?` (or click the help button in the topbar).
// Shows keyboard shortcuts + quick links to docs + a way to ask Sage.
// Ignored when the user is typing into an input.

const SHORTCUTS: { keys: string[]; desc: string }[] = [
  { keys: ["⌘", "K"], desc: "Open the command palette (search, jump, run)" },
  { keys: ["?"], desc: "Show this help overlay" },
  { keys: ["Esc"], desc: "Close any open modal" },
  { keys: ["⌘", "↵"], desc: "Run preview / send chat (inside the studios)" },
  { keys: ["Tab"], desc: "Indent inside the code editor" },
  { keys: ["⇧", "S"], desc: "Quick-jump to Sage tutor" },
  { keys: ["⇧", "V"], desc: "Quick-jump to Venture Studio" },
  { keys: ["⇧", "B"], desc: "Quick-jump to Brainstorm" },
];

const LINKS = [
  { href: "/studio/tutor", icon: MessageSquare, label: "Ask Sage", sub: "AI tutor — answers anything about the platform or your domain" },
  { href: "/studio/learn", icon: BookOpen, label: "Learning Tracks", sub: "Structured learning paths across all disciplines" },
  { href: "/studio/build", icon: Hammer, label: "AI Build Studio", sub: "Live-preview HTML/CSS/JS + Claude pair-programmer" },
  { href: "/studio/venture", icon: Rocket, label: "Venture Studio", sub: "From idea to demo day — 12 tabs" },
  { href: "/studio/brainstorm", icon: Lightbulb, label: "Brainstorm Canvas", sub: "Infinite whiteboard with AI co-pilot" },
  { href: "/studio/lab", icon: FlaskConical, label: "Practice Lab", sub: "Hands-on coding in your browser" },
  { href: "/studio/atlas", icon: Compass, label: "Africa Atlas", sub: "Map your problem to its geography" },
  { href: "/studio/settings", icon: Shield, label: "Privacy & data", sub: "Export, import, delete your data" },
];

export function HelpOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
      // `?` outside of inputs (Shift+/ on most keyboards)
      if (e.key === "?" && !isTyping(e.target)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      // Quick-jumps when not typing
      if (!isTyping(e.target) && e.shiftKey) {
        const map: Record<string, string> = { S: "/studio/tutor", V: "/studio/venture", B: "/studio/brainstorm" };
        const dest = map[e.key.toUpperCase()];
        if (dest && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          window.location.href = dest;
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-5"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ y: 20, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 20, scale: 0.97 }}
            className="relative w-full max-w-3xl glass rounded-2xl overflow-hidden border border-emerald/30 shadow-2xl shadow-emerald/10 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-surface/95 backdrop-blur border-b border-border px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Keyboard className="size-5 text-emerald" />
                <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">Help & shortcuts</h2>
              </div>
              <button onClick={() => setOpen(false)} className="size-8 rounded-lg hover:bg-surface-2 text-muted hover:text-foreground flex items-center justify-center">
                <X className="size-4" />
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-6 p-6">
              <div>
                <h3 className="text-xs uppercase tracking-widest text-emerald mb-3">Keyboard shortcuts</h3>
                <div className="space-y-1.5">
                  {SHORTCUTS.map((s) => (
                    <div key={s.desc} className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg hover:bg-surface-2/50">
                      <span className="text-sm text-muted">{s.desc}</span>
                      <div className="flex gap-1 shrink-0">
                        {s.keys.map((k) => (
                          <kbd key={k} className="text-[10px] uppercase font-mono tracking-widest text-foreground/90 px-2 py-0.5 border border-border bg-surface-2 rounded">{k}</kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-xs uppercase tracking-widest text-amber mb-3">Jump to</h3>
                <div className="space-y-1">
                  {LINKS.map((l) => (
                    <a
                      key={l.href}
                      href={l.href}
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-surface-2 transition group"
                    >
                      <l.icon className="size-4 text-emerald shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{l.label}</div>
                        <div className="text-xs text-muted leading-snug truncate">{l.sub}</div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-border px-6 py-3 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted">
              <span>Press <kbd className="font-mono normal-case text-foreground/80">?</kbd> anywhere to open</span>
              <a href="https://github.com/anthropics/claude-code/issues" target="_blank" rel="noopener" className="flex items-center gap-1 hover:text-foreground transition">
                <Bug className="size-3" /> Report a bug
              </a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  return false;
}
