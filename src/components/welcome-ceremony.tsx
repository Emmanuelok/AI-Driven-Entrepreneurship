"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore, level } from "@/store";
import { useMe } from "@/store/me";
import { Sparkles, ArrowRight, Brain, Compass, Rocket, Zap } from "lucide-react";
import Link from "next/link";
import { getRecommendations } from "@/lib/recommendations";

const WELCOME_KEY = "sankofa-welcomed-v1";

// Fires once for a newly signed-in user. A cinematic 5-beat sequence:
//  1. greeting
//  2. workspace forming
//  3. discipline tuning
//  4. ship promise
//  5. doorway in
// Total number of beats in the sequence (kept in sync with BEATS below).
const TOTAL_BEATS = 5;

export function WelcomeCeremony() {
  const [open, setOpen] = useState(false);
  const [beat, setBeat] = useState(0);
  const { user, xp, streak } = useStore();
  const { genome, remember } = useMe();

  // ────────────────────────────────────────────────────────────────────────
  // ALL HOOKS MUST RUN ON EVERY RENDER — no early returns above this line.
  // ────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined") return;
    try {
      const done = localStorage.getItem(WELCOME_KEY);
      if (!done) {
        setOpen(true);
        setBeat(0);
        remember({ fact: `First entered the studio on ${new Date().toLocaleDateString()}`, kind: "context", source: "system", importance: 3 });
      }
    } catch {
      // localStorage unavailable — skip silently
    }
  }, [user]);

  // Auto-advance beats. The duration table mirrors the BEATS array below.
  useEffect(() => {
    if (!open) return;
    const durations = [3200, 3800, 4400, 4200, -1];
    const d = durations[beat];
    if (d === undefined || d < 0) return;
    const t = setTimeout(() => setBeat((b) => b + 1), d);
    return () => clearTimeout(t);
  }, [beat, open]);

  if (!user || !open) return null;

  const close = () => {
    try { localStorage.setItem(WELCOME_KEY, "1"); } catch {}
    setOpen(false);
  };

  const rec = getRecommendations(user.field);
  const dept = rec.department;

  const BEATS = [
    {
      duration: 3200,
      content: (
        <Beat>
          <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1 }} className="text-[10px] uppercase tracking-[0.4em] text-emerald mb-6">
            Akwaaba
          </motion.div>
          <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.2, delay: 0.4 }} className="font-[family-name:var(--font-display)] text-5xl sm:text-7xl font-semibold leading-[1.02]">
            Welcome, <span className="text-emerald italic">{user.name.split(" ")[0]}</span>.
          </motion.h2>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 1.6 }} className="mt-6 text-lg text-muted max-w-md">
            Take a breath. This studio is being prepared for you specifically.
          </motion.p>
        </Beat>
      ),
    },
    {
      duration: 3800,
      content: (
        <Beat>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} className="text-[10px] uppercase tracking-[0.4em] text-amber mb-5">
            Building your workspace
          </motion.div>
          <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1 }} className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl font-semibold leading-tight max-w-2xl">
            Seeding your decks. Mapping your field. Tuning Sage's voice to yours.
          </motion.h2>
          <div className="mt-8 grid sm:grid-cols-3 gap-3 max-w-xl mx-auto text-sm text-left">
            {[
              { icon: Brain, label: "Sage tuned for you", delay: 0.2 },
              { icon: Compass, label: "Discipline-aware paths", delay: 0.6 },
              { icon: Rocket, label: "Venture seeds ready", delay: 1.0 },
            ].map((b) => (
              <motion.div
                key={b.label}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: b.delay }}
                className="glass rounded-xl p-3 flex items-center gap-2"
              >
                <b.icon className="size-4 text-emerald" />
                <span>{b.label}</span>
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: b.delay + 0.4 }} className="ml-auto text-emerald">✓</motion.span>
              </motion.div>
            ))}
          </div>
        </Beat>
      ),
    },
    {
      duration: 4400,
      content: (
        <Beat>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} className="text-[10px] uppercase tracking-[0.4em] text-emerald mb-5">
            Your field's first opportunity
          </motion.div>
          <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1 }} className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold leading-tight max-w-3xl">
            {dept ? <>For someone studying <span className="text-emerald italic">{dept.name.toLowerCase()}</span>, the first venture we&apos;d seed is:</> : <>Your first venture seed:</>}
          </motion.h2>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.6 }} className="mt-6 glass rounded-2xl p-6 max-w-xl">
            <Sparkles className="size-5 text-amber mb-2" />
            <p className="text-foreground/95 text-lg leading-relaxed">
              {dept?.suggestedVentureSeed ?? "A wedge venture in your local context — we'll surface it on day one of your Ship Hour."}
            </p>
          </motion.div>
        </Beat>
      ),
    },
    {
      duration: 4200,
      content: (
        <Beat>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} className="text-[10px] uppercase tracking-[0.4em] text-amber mb-5">
            The promise
          </motion.div>
          <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1 }} className="font-[family-name:var(--font-display)] text-4xl sm:text-6xl font-semibold leading-[1.05] max-w-3xl">
            In the next 60 minutes, you&apos;ll ship a <span className="text-emerald italic">real artifact</span>.
          </motion.h2>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.8 }} className="mt-6 text-lg text-muted max-w-xl">
            Not a lesson completed. Not a deck. A letter you could send to a real person today.
          </motion.p>
        </Beat>
      ),
    },
    {
      duration: -1, // wait for user click
      content: (
        <Beat>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8 }} className="size-24 mx-auto rounded-full bg-gradient-to-br from-emerald to-amber flex items-center justify-center shadow-2xl shadow-emerald/40 mb-7">
            <Sparkles className="size-10 text-black" />
          </motion.div>
          <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.3 }} className="font-[family-name:var(--font-display)] text-4xl sm:text-6xl font-semibold leading-[1.05]">
            Ready to cross the <span className="text-emerald italic">threshold</span>?
          </motion.h2>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.9 }} className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              onClick={close}
              href="/studio/ship"
              className="bg-emerald text-black font-semibold px-7 py-4 rounded-full hover:bg-amber transition flex items-center justify-center gap-2 text-base shadow-2xl shadow-emerald/40"
            >
              <Zap className="size-5" /> Begin my first Ship Hour
            </Link>
            <button
              onClick={close}
              className="border border-border bg-surface/60 backdrop-blur px-7 py-4 rounded-full hover:bg-surface-2 transition flex items-center justify-center gap-2 text-base"
            >
              I&apos;ll explore first <ArrowRight className="size-4" />
            </button>
          </motion.div>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5, duration: 0.6 }} className="mt-8 text-xs text-muted">
            Press ⌘J anywhere to call Sage. We&apos;re always one tap away.
          </motion.p>
        </Beat>
      ),
    },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="fixed inset-0 z-[200] bg-background flex items-center justify-center overflow-hidden"
        >
          {/* Layered backgrounds */}
          <div className="absolute inset-0 grid-paper opacity-30" />
          <div className="absolute -top-32 -right-32 size-[28rem] rounded-full bg-emerald/20 blur-3xl" />
          <div className="absolute -bottom-32 -left-32 size-[28rem] rounded-full bg-amber/20 blur-3xl" />

          {/* Skip */}
          <button onClick={close} className="absolute top-6 right-6 text-xs text-muted hover:text-foreground transition uppercase tracking-widest">Skip →</button>

          {/* Beat content */}
          <div className="relative max-w-3xl px-5 sm:px-8 text-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={beat}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6 }}
              >
                {BEATS[beat]?.content}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Beat indicator */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2">
            {BEATS.map((_, i) => (
              <div key={i} className={`h-1 rounded-full transition-all ${i === beat ? "w-10 bg-emerald" : i < beat ? "w-6 bg-emerald/40" : "w-2 bg-border"}`} />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Beat({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-center justify-center">{children}</div>;
}
