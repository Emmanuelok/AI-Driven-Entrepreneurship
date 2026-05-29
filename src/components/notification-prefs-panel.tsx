"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { Card } from "@/components/ui";
import { Bell, AtSign, MessageSquare, Megaphone, ShieldAlert, Mail, Loader2, Check, Heart } from "lucide-react";

// Per-user notification preferences panel. Mount in Settings →
// Notifications. Reads/writes /api/v2/notification-prefs. Renders
// nothing while loading so toggles don't flicker between defaults
// and the real value.

type Prefs = {
  push_mention: boolean;
  push_reply: boolean;
  push_announcement: boolean;
  push_system: boolean;
  email_student_digest: boolean;
  email_instructor_digest: boolean;
  in_app_social: boolean;
  in_app_system: boolean;
};

const DEFAULTS: Prefs = {
  push_mention: true,
  push_reply: true,
  push_announcement: true,
  push_system: true,
  email_student_digest: true,
  email_instructor_digest: true,
  in_app_social: true,
  in_app_system: true,
};

const ROWS: { key: keyof Prefs; icon: React.ComponentType<{ className?: string }>; label: string; desc: string; group: "push" | "email" | "in_app" }[] = [
  { key: "push_mention",            icon: AtSign,         group: "push",  label: "@mentions",        desc: "When someone @-mentions you in a cohort thread or marketplace comment." },
  { key: "push_reply",              icon: MessageSquare,  group: "push",  label: "Replies",          desc: "When someone replies to a cohort thread you started." },
  { key: "push_announcement",       icon: Megaphone,      group: "push",  label: "Announcements",    desc: "Cohort-wide announcements from an instructor or owner." },
  { key: "push_system",             icon: ShieldAlert,    group: "push",  label: "System",           desc: "Account & security alerts. Rarely sent." },
  { key: "in_app_social",           icon: Heart,          group: "in_app", label: "Social activity", desc: "Claps, comments, and forks on your published ventures and builds." },
  { key: "in_app_system",           icon: ShieldAlert,    group: "in_app", label: "System events",   desc: "Account-level events surfaced in your bell. Rarely off." },
  { key: "email_student_digest",    icon: Mail,           group: "email", label: "Weekly digest",    desc: "Your Sankofa week — interviews, shipped tasks, AI spend. Sunday 6pm UTC." },
  { key: "email_instructor_digest", icon: Mail,           group: "email", label: "Instructor digest", desc: "If you own or co-instruct a cohort: completion rates, stuck students, pending questions. Monday 2pm UTC." },
];

export function NotificationPrefsPanel() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState<keyof Prefs | null>(null);
  const [savedHint, setSavedHint] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const sb = supabaseBrowser();
        if (!sb) { setPrefs(DEFAULTS); return; }
        const { data: { session } } = await sb.auth.getSession();
        if (!session) { setPrefs(DEFAULTS); return; }
        const res = await fetch("/api/v2/notification-prefs", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const data = await res.json();
        setPrefs({ ...DEFAULTS, ...(data.prefs ?? {}) });
      } catch { setPrefs(DEFAULTS); }
    })();
  }, []);

  async function toggle(key: keyof Prefs) {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next); setSaving(key);
    try {
      const sb = supabaseBrowser();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      await fetch("/api/v2/notification-prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ [key]: next[key] }),
      });
      setSavedHint(true);
      setTimeout(() => setSavedHint(false), 1200);
    } finally { setSaving(null); }
  }

  if (!prefs) return null;

  const pushRows = ROWS.filter((r) => r.group === "push");
  const inAppRows = ROWS.filter((r) => r.group === "in_app");
  const emailRows = ROWS.filter((r) => r.group === "email");

  return (
    <Card className="p-6 mb-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-medium flex items-center gap-2"><Bell className="size-4 text-emerald" /> Notifications</h2>
        {savedHint && <span className="text-[10px] uppercase tracking-widest text-emerald inline-flex items-center gap-1"><Check className="size-3" /> Saved</span>}
      </div>

      <p className="text-xs text-muted leading-relaxed mb-4">
        Every notification Sankofa sends — push to your devices, in-app bell, email digests — is opt-in per category. Toggle anything you don&apos;t want to hear about.
      </p>

      <div className="text-[10px] uppercase tracking-widest text-muted mb-2 mt-2">Push (device notifications)</div>
      <ul className="space-y-1.5 mb-5">
        {pushRows.map((r) => <Row key={r.key} row={r} value={prefs[r.key]} saving={saving === r.key} onToggle={() => toggle(r.key)} />)}
      </ul>

      <div className="text-[10px] uppercase tracking-widest text-muted mb-2 mt-2">In-app (bell)</div>
      <ul className="space-y-1.5 mb-5">
        {inAppRows.map((r) => <Row key={r.key} row={r} value={prefs[r.key]} saving={saving === r.key} onToggle={() => toggle(r.key)} />)}
      </ul>

      <div className="text-[10px] uppercase tracking-widest text-muted mb-2 mt-2">Email</div>
      <ul className="space-y-1.5">
        {emailRows.map((r) => <Row key={r.key} row={r} value={prefs[r.key]} saving={saving === r.key} onToggle={() => toggle(r.key)} />)}
      </ul>
    </Card>
  );
}

function Row({
  row, value, saving, onToggle,
}: {
  row: { key: string; icon: React.ComponentType<{ className?: string }>; label: string; desc: string };
  value: boolean; saving: boolean; onToggle: () => void;
}) {
  const Icon = row.icon;
  return (
    <li>
      <button
        onClick={onToggle}
        className="w-full text-left flex items-start gap-3 p-3 rounded-xl border border-border hover:border-emerald/40 bg-surface-2/30 transition"
      >
        <Icon className={`size-4 mt-0.5 shrink-0 ${value ? "text-emerald" : "text-muted"}`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{row.label}</div>
          <div className="text-[10px] text-muted leading-relaxed">{row.desc}</div>
        </div>
        <div className="shrink-0 mt-1">
          {saving ? (
            <Loader2 className="size-4 animate-spin text-muted" />
          ) : (
            <span className={`relative inline-block w-9 h-5 rounded-full transition ${value ? "bg-emerald" : "bg-border"}`}>
              <span className={`absolute top-0.5 size-4 rounded-full bg-surface transition-all ${value ? "left-[18px]" : "left-0.5"}`} />
            </span>
          )}
        </div>
      </button>
    </li>
  );
}
