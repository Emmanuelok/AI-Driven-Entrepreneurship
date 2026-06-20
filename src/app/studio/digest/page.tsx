"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { profileApi } from "@/lib/profile-api";
import type { Digest } from "@/lib/digest";
import { Card, Badge, Button } from "@/components/ui";
import {
  Mail, ArrowLeft, Loader2, Send, CheckCircle2, AlertCircle, Sparkles,
  GraduationCap, TrendingUp, Bell,
} from "lucide-react";

// /studio/digest — on-demand personal digest. Previews the composed
// digest on screen and lets the user email it to themselves. No
// scheduler required; the user pulls it when they want it.

const WINDOWS = [
  { v: 7, label: "Last 7 days" },
  { v: 14, label: "Last 14 days" },
  { v: 30, label: "Last 30 days" },
];

export default function DigestPage() {
  const [days, setDays] = useState(7);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sentMsg, setSentMsg] = useState<string | null>(null);

  async function load(d: number) {
    setLoading(true);
    setErr(null);
    setSentMsg(null);
    const r = await profileApi.previewDigest(d);
    if (!r.ok) { setErr(r.error || "Failed to load"); setLoading(false); return; }
    setDigest(r.digest);
    setLoading(false);
  }

  useEffect(() => { load(days); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days]);

  async function send() {
    setSending(true);
    setSentMsg(null);
    const r = await profileApi.sendDigest(days);
    setSending(false);
    if (!r.ok) { setErr(r.error || "Send failed"); return; }
    if (!r.sent && r.reason === "empty") { setSentMsg("Nothing to send — it's a quiet week."); return; }
    setSentMsg(r.mode === "local" ? "Composed (email is in local mode — check server logs)." : "Sent to your inbox.");
  }

  const iconFor = (key: string) => key === "mentor" ? <GraduationCap className="size-4 text-indigo" /> : key === "founder" ? <TrendingUp className="size-4 text-emerald" /> : <Bell className="size-4 text-amber" />;

  return (
    <div className="max-w-2xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/studio" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-4">
        <ArrowLeft className="size-3" /> Studio
      </Link>

      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
          <Mail className="size-3.5" /> Your digest
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
          The week, in one note.
        </h1>
        <p className="mt-3 text-muted max-w-2xl leading-relaxed">
          Earnings, upcoming sessions, and which investors are circling your raise — composed on demand. Preview it here, then send it to your inbox.
        </p>
      </header>

      <div className="flex items-center gap-2 mb-5">
        {WINDOWS.map((w) => (
          <button
            key={w.v}
            onClick={() => setDays(w.v)}
            className={`px-3.5 py-1.5 rounded-full border text-xs transition ${days === w.v ? "border-emerald bg-emerald/10 text-emerald" : "border-border text-muted hover:text-foreground"}`}
          >
            {w.label}
          </button>
        ))}
      </div>

      {err && (
        <Card className="p-4 border-rust/40 mb-4 flex items-start gap-2">
          <AlertCircle className="size-4 text-rust mt-0.5" />
          <span className="text-sm text-rust">{err}</span>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-emerald animate-spin" /></div>
      ) : digest ? (
        <>
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-1">
              <Badge color="muted">Subject</Badge>
              <span className="text-xs text-muted">{digest.subject}</span>
            </div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold mt-3">{digest.heading}</h2>
            <p className="text-sm text-muted mt-2 leading-relaxed">{digest.intro}</p>

            {digest.isEmpty ? (
              <div className="mt-5 rounded-xl border border-border p-5 text-center">
                <Sparkles className="size-7 text-emerald mx-auto mb-2" />
                <p className="text-sm text-muted">No activity this window. As investors open your dataroom or founders book your time, it&apos;ll show up here.</p>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                {digest.sections.map((s) => (
                  <div key={s.key} className="rounded-xl border border-border p-4">
                    <div className="flex items-center gap-2 mb-2">
                      {iconFor(s.key)}
                      <h3 className="font-medium text-sm">{s.title}</h3>
                      {s.emphasis && <Badge color="emerald">{s.emphasis}</Badge>}
                    </div>
                    <ul className="space-y-1.5">
                      {s.lines.map((line, i) => (
                        <li key={i} className="text-sm text-muted leading-relaxed flex gap-2">
                          <span className="text-emerald mt-1.5 size-1 rounded-full bg-emerald shrink-0" />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
              <Link href={digest.cta.href.replace(/^https?:\/\/[^/]+/, "")} className="text-sm text-emerald hover:underline">
                {digest.cta.label} →
              </Link>
              <Button onClick={send} disabled={sending || digest.isEmpty}>
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                Email this to me
              </Button>
            </div>

            {sentMsg && (
              <div className="mt-3 text-sm text-emerald flex items-center gap-1.5">
                <CheckCircle2 className="size-4" /> {sentMsg}
              </div>
            )}
          </Card>

          <p className="text-xs text-muted mt-4 text-center">
            Digests are generated on demand — nothing is sent automatically. Pull yours whenever you want a snapshot.
          </p>
        </>
      ) : null}
    </div>
  );
}
