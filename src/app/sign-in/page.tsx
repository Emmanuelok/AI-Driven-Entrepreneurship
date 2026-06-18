"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!data.ok) setError(data.error ?? "Something went wrong.");
      else setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-12 relative overflow-hidden">
      <div className="absolute inset-0 grid-paper opacity-25 pointer-events-none" />
      <div className="absolute -top-32 -right-32 size-[28rem] rounded-full bg-emerald/15 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 size-[28rem] rounded-full bg-amber/15 blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative w-full max-w-md"
      >
        <Link href="/" className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-6">
          <ArrowLeft className="size-3.5" /> Landing
        </Link>

        <div className="flex items-center gap-2.5 mb-7">
          <div className="size-10 rounded-xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-bold shadow-xl shadow-emerald/20">
            <span className="font-[family-name:var(--font-display)]">S</span>
          </div>
          <div className="leading-tight">
            <div className="font-[family-name:var(--font-display)] text-lg font-semibold">Sankofa Studio</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted">Sign in</div>
          </div>
        </div>

        {!sent ? (
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold leading-tight">
              Welcome back.
            </h1>
            <p className="mt-3 text-muted leading-relaxed">
              Enter the email you used when you set up your studio. We&apos;ll send you a sign-in link.
            </p>

            <form onSubmit={submit} className="mt-7 space-y-4">
              <label className="block">
                <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Email</div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@yourschool.edu"
                  className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-base outline-none focus:border-emerald w-full"
                  autoComplete="email"
                  autoFocus
                />
              </label>
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl border border-rust/30 bg-rust/5 text-sm text-rust">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              <button
                type="submit"
                disabled={!valid || busy}
                className="w-full bg-emerald text-black font-semibold px-6 py-3.5 rounded-full hover:bg-amber disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
              >
                <Mail className="size-4" /> {busy ? "Sending…" : "Send sign-in link"}
              </button>
            </form>

            <div className="mt-8 p-4 rounded-xl border border-amber/30 bg-amber/5 text-sm text-muted leading-relaxed">
              <div className="text-amber text-[10px] uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                <Sparkles className="size-3" /> First time here?
              </div>
              Don&apos;t have an account yet? <Link href="/studio" className="text-emerald hover:underline">Start fresh — 3 minutes to your studio</Link>.
              <div className="mt-3 pt-3 border-t border-amber/20 text-xs text-muted/80">
                Backend sync is rolling out. Today, your studio runs entirely on your device — sign-in becomes magic when the backend launches.
              </div>
            </div>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6">
            <div className="size-16 mx-auto rounded-full bg-emerald/15 flex items-center justify-center mb-5">
              <CheckCircle2 className="size-8 text-emerald" />
            </div>
            <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight">Check your inbox.</h2>
            <p className="mt-3 text-muted leading-relaxed">
              If a Sankofa account exists for <span className="text-foreground">{email}</span>, a sign-in link is on its way. Click it on this device and you&apos;re in.
            </p>
            <Link href="/studio" className="mt-7 inline-flex items-center gap-2 text-emerald hover:underline text-sm">
              Or continue device-local for now <ArrowRight className="size-3.5" />
            </Link>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
