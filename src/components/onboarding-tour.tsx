"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Sparkles, ArrowRight, X, Lightbulb, Hammer, Rocket, Brain, BookOpen, Wallet } from "lucide-react";

// First-time tour — appears once after a new user completes onboarding.
// Five steps, ~30 seconds total. Skippable; dismissal persists.
// Lives in /studio so it only shows after the user has crossed into the app.

const STORAGE_KEY = "sankofa-onboarding-tour-v1";

type Step = {
  id: string;
  title: string;
  body: string;
  icon: typeof Lightbulb;
  link?: { href: string; label: string };
};

const STEPS: Step[] = [
  {
    id: "welcome",
    icon: Sparkles,
    title: "Welcome to Sankofa Studio",
    body: "You just unlocked a learning platform, an AI build studio, and a full venture studio — all wired together. Let's take 30 seconds.",
  },
  {
    id: "brainstorm",
    icon: Lightbulb,
    title: "Start with an idea",
    body: "The Brainstorm canvas is your napkin. Sketch anything. When the idea is ready, one button ships it to AI Build Studio or Venture Studio with a complete starter.",
    link: { href: "/studio/brainstorm", label: "Open Brainstorm" },
  },
  {
    id: "build",
    icon: Hammer,
    title: "Ship real AI products",
    body: "AI Build Studio: live-preview HTML/CSS/JS, syntax-highlighted, Claude pair-programmer (Sage), and an eval harness so your agent doesn't regress between iterations.",
    link: { href: "/studio/build", label: "Open AI Build" },
  },
  {
    id: "venture",
    icon: Rocket,
    title: "Then turn it into a venture",
    body: "Venture Studio takes you from Lean Canvas to demo-day rehearsal — 12 tabs covering discovery, MVP, pitch, fundraise, OKRs, data room, legal, launch.",
    link: { href: "/studio/venture", label: "Open Venture" },
  },
  {
    id: "learn",
    icon: BookOpen,
    title: "Learn alongside building",
    body: "Learning Tracks, the SRS (spaced repetition), Practice Lab, and AI coaches (Akili, Tariq, Sage) follow you everywhere. Press ⌘K anytime to jump.",
    link: { href: "/studio/learn", label: "Open Learning" },
  },
];

export function OnboardingTour() {
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
      // Tiny delay so the dashboard paints before the modal appears.
      const t = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(t);
    } catch { /* noop */ }
  }, []);

  function dismiss(completed: boolean) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ completed, ts: Date.now() })); } catch { /* noop */ }
    setOpen(false);
  }

  if (!open) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-5"
        onClick={() => dismiss(false)}
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          className="relative w-full max-w-lg glass rounded-2xl overflow-hidden border border-emerald/30 shadow-2xl shadow-emerald/10"
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={() => dismiss(false)} className="absolute top-3 right-3 size-7 rounded-full hover:bg-surface-2 text-muted hover:text-foreground flex items-center justify-center z-10">
            <X className="size-3.5" />
          </button>

          <div className="p-7">
            <div className="flex items-center gap-3 mb-5">
              <div className="size-12 rounded-2xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center shadow-lg shadow-emerald/30">
                <s.icon className="size-6 text-black" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-emerald">
                  Step {step + 1} of {STEPS.length}
                </div>
                <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight">{s.title}</h2>
              </div>
            </div>

            <p className="text-foreground/95 leading-relaxed">{s.body}</p>

            {s.link && (
              <Link
                href={s.link.href}
                onClick={() => dismiss(true)}
                className="mt-5 inline-flex items-center gap-1.5 text-sm text-emerald hover:text-amber transition"
              >
                {s.link.label} <ArrowRight className="size-3.5" />
              </Link>
            )}

            <div className="mt-7 flex items-center justify-between">
              <div className="flex gap-1.5">
                {STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    className={`h-1.5 w-6 rounded-full transition ${i === step ? "bg-emerald" : i < step ? "bg-emerald/40" : "bg-border hover:bg-muted"}`}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => dismiss(false)} className="text-xs text-muted hover:text-foreground transition">
                  Skip
                </button>
                {last ? (
                  <button
                    onClick={() => dismiss(true)}
                    className="bg-emerald text-black font-medium px-5 py-2 rounded-full text-sm hover:bg-amber transition flex items-center gap-1.5"
                  >
                    Get started <ArrowRight className="size-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => setStep(step + 1)}
                    className="bg-emerald text-black font-medium px-5 py-2 rounded-full text-sm hover:bg-amber transition flex items-center gap-1.5"
                  >
                    Next <ArrowRight className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
