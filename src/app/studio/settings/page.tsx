"use client";

import { useState } from "react";
import { useStore } from "@/store";
import { useAiUsage } from "@/store/ai-usage";
import { Card, Button, Input, Badge } from "@/components/ui";
import { User, Bell, Shield, Download, Trash2, KeyRound, Zap, Globe, AlertTriangle, Wallet } from "lucide-react";
import { PushToggle } from "@/components/push-toggle";
import { ByoKeyPanel } from "@/components/byo-key-panel";
import { SellerStatusPanel } from "@/components/seller-status-panel";

// Every persisted store name → human label, for export + nuke.
const STORE_KEYS: Record<string, string> = {
  "sankofa-v1": "Profile, XP, ventures, lessons, badges",
  "sankofa-build-v1": "AI Build Studio projects + eval suites",
  "sankofa-sketch-v1": "Brainstorm canvases",
  "sankofa-letters-v1": "Letters & writing artifacts",
  "sankofa-ext-v1": "Extensions & tool state",
  "sankofa-me-v1": "Genome, memories, activity log",
  "sankofa-ai-usage-v1": "AI usage history",
  "sankofa-byok-v1": "Your personal Anthropic API key (BYOK)",
  "sankofa-lang-v1": "Language preference",
};

export default function SettingsPage() {
  const { user, updateUser, signOut } = useStore();
  const { budgetDailyUsd, setBudget, totalToday, reset: resetUsage } = useAiUsage();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [institution, setInstitution] = useState(user?.institution ?? "");
  const [program, setProgram] = useState(user?.program ?? "");
  const [language, setLanguage] = useState(user?.primaryLanguage ?? "English");
  const [budgetDraft, setBudgetDraft] = useState(String(budgetDailyUsd));

  if (!user) return null;
  const dirty = name !== user.name || email !== user.email || institution !== user.institution || program !== user.program || language !== user.primaryLanguage;
  const t = totalToday();

  function save() {
    updateUser({ name, email, institution, program, primaryLanguage: language });
  }

  function exportData() {
    // Bundle every Sankofa store into one downloadable JSON (so the user
    // can carry their venture, builds, sketches across devices).
    const bundle: Record<string, unknown> = { exportedAt: new Date().toISOString(), schemaVersion: 1 };
    for (const key of Object.keys(STORE_KEYS)) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) bundle[key] = JSON.parse(raw);
      } catch { /* skip */ }
    }
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sankofa-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importData(file: File) {
    if (!confirm(`This replaces ALL local Sankofa data with the contents of ${file.name}. Continue?`)) return;
    try {
      const text = await file.text();
      const bundle = JSON.parse(text);
      for (const key of Object.keys(STORE_KEYS)) {
        if (bundle[key]) {
          localStorage.setItem(key, JSON.stringify(bundle[key]));
        }
      }
      alert("Imported. Reloading…");
      location.reload();
    } catch (e) {
      alert(`Import failed: ${(e as Error).message}`);
    }
  }

  function nuke() {
    const phrase = prompt("Delete EVERYTHING — ventures, builds, sketches, profile, AI history? Type DELETE to confirm.");
    if (phrase !== "DELETE") return;
    for (const key of Object.keys(STORE_KEYS)) {
      try { localStorage.removeItem(key); } catch { /* noop */ }
    }
    signOut();
    location.href = "/";
  }

  function saveBudget() {
    const n = parseFloat(budgetDraft);
    if (!Number.isFinite(n) || n < 0) return;
    setBudget(n);
  }

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2">Settings</p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">Your workspace.</h1>
      </div>

      <Card className="p-6 mb-6">
        <h2 className="font-medium flex items-center gap-2 mb-5"><User className="size-4 text-emerald" /> Profile</h2>
        <div className="space-y-4">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Institution"><Input value={institution} onChange={(e) => setInstitution(e.target.value)} /></Field>
          <Field label="Program"><Input value={program} onChange={(e) => setProgram(e.target.value)} /></Field>
          <Field label="Primary language">
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none w-full">
              {["English", "Pidgin", "Twi", "Yoruba", "Hausa", "Swahili", "Amharic", "French", "Wolof", "Zulu", "Igbo", "Akan"].map((l) => <option key={l}>{l}</option>)}
            </select>
          </Field>
          <div className="flex justify-end">
            <Button onClick={save} disabled={!dirty}>Save profile</Button>
          </div>
        </div>
      </Card>

      <Card className="p-6 mb-6">
        <h2 className="font-medium flex items-center gap-2 mb-3"><Zap className="size-4 text-amber" /> AI usage & budget</h2>
        <p className="text-xs text-muted mb-4">
          Every AI call (Sage, coaches, evals, synthesizer, rehearsal critique) reports its token use back to your browser.
          Set a daily soft budget — the topbar badge turns amber at 60%, rust at 100%, so you catch runaway loops before they hurt.
        </p>
        <div className="grid sm:grid-cols-3 gap-3 mb-4">
          <Stat label="Today" value={`$${t.usd.toFixed(2)}`} sub={`${t.calls} calls`} tone="emerald" />
          <Stat label="Tokens (in)" value={`${(t.tokensIn / 1000).toFixed(1)}k`} sub="prompt size" tone="amber" />
          <Stat label="Tokens (out)" value={`${(t.tokensOut / 1000).toFixed(1)}k`} sub="model output" tone="indigo" />
        </div>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Daily budget (USD, soft cap)</div>
            <Input type="number" step="0.5" value={budgetDraft} onChange={(e) => setBudgetDraft(e.target.value)} />
          </div>
          <Button variant="secondary" onClick={saveBudget}>Save budget</Button>
          <Button variant="ghost" onClick={() => { if (confirm("Clear local AI usage history?")) resetUsage(); }}>Clear history</Button>
        </div>
      </Card>

      <Card className="p-6 mb-6">
        <h2 className="font-medium flex items-center gap-2 mb-4"><KeyRound className="size-4 text-emerald" /> AI keys</h2>
        <ByoKeyPanel />
        <div className="mt-5 pt-5 border-t border-border">
          <div className="text-[10px] uppercase tracking-widest text-muted mb-2">Platform key (operator-set)</div>
          <p className="text-xs text-muted mb-2">Without a personal key above, AI runs on the platform-wide <code className="text-emerald">ANTHROPIC_API_KEY</code> set in deploy env. Demo mode kicks in when neither is configured.</p>
          <div className="bg-surface-2 rounded-xl p-3 font-mono text-[10px]">ANTHROPIC_API_KEY=sk-ant-…</div>
        </div>
      </Card>

      <Card className="p-6 mb-6">
        <h2 className="font-medium flex items-center gap-2 mb-4"><Wallet className="size-4 text-amber" /> Payments</h2>
        <SellerStatusPanel />
      </Card>

      <Card className="p-6 mb-6">
        <h2 className="font-medium flex items-center gap-2 mb-5"><Bell className="size-4 text-emerald" /> Notifications</h2>
        <div className="mb-5 pb-5 border-b border-border">
          <PushToggle />
        </div>
        <div className="space-y-3 text-sm">
          <div className="text-[10px] uppercase tracking-widest text-muted mb-2">In-product reminders</div>
          {[
            "Lesson reminders (daily)",
            "Mentor session reminders (24h before)",
            "Funding deadline alerts",
            "Community replies",
            "Cohort announcements",
          ].map((label) => (
            <label key={label} className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" defaultChecked className="accent-emerald" />
              {label}
            </label>
          ))}
        </div>
      </Card>

      <Card className="p-6 mb-6">
        <h2 className="font-medium flex items-center gap-2 mb-3"><Shield className="size-4 text-emerald" /> Privacy & data</h2>
        <p className="text-sm text-muted mb-4">Your Sankofa data lives in this browser. Export a JSON bundle to back up or move it. Import to restore from a backup. Everything below covers <strong>{Object.keys(STORE_KEYS).length}</strong> stores.</p>

        <div className="space-y-1.5 text-xs text-muted mb-5">
          {Object.entries(STORE_KEYS).map(([k, label]) => {
            const has = typeof localStorage !== "undefined" && localStorage.getItem(k);
            return (
              <div key={k} className="flex items-center gap-2">
                <span className={`size-1.5 rounded-full ${has ? "bg-emerald" : "bg-border"}`} />
                <span className="font-mono text-[10px] w-44 shrink-0 text-foreground/80">{k}</span>
                <span className="truncate">{label}</span>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" onClick={exportData}><Download className="size-4" /> Export all data</Button>
          <label className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-full bg-surface-2 border border-border hover:bg-surface cursor-pointer transition">
            <Globe className="size-4" /> Import backup
            <input type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importData(f); }} />
          </label>
        </div>
      </Card>

      <Card className="p-6 border border-rust/30 bg-rust/5">
        <h2 className="font-medium flex items-center gap-2 mb-3 text-rust"><AlertTriangle className="size-4" /> Danger zone</h2>
        <p className="text-sm text-muted mb-4">Delete every byte of Sankofa data stored on this device — profile, ventures, builds, sketches, AI history. This action cannot be undone. Export first if you want a backup.</p>
        <Button variant="danger" onClick={nuke}><Trash2 className="size-4" /> Delete account & all data</Button>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-muted mb-1.5">{label}</div>
      {children}
    </label>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "emerald" | "amber" | "indigo" }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold text-${tone}`}>{value}</div>
      <div className="text-[10px] text-muted">{sub}</div>
    </div>
  );
}
