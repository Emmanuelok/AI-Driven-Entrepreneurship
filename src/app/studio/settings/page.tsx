"use client";

import { useState } from "react";
import { useStore } from "@/store";
import { Card, Button, Input, Badge } from "@/components/ui";
import { User, Bell, Globe, Shield, Download, Trash2, KeyRound } from "lucide-react";

export default function SettingsPage() {
  const { user, updateUser, signOut } = useStore();
  if (!user) return null;

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [institution, setInstitution] = useState(user.institution);
  const [program, setProgram] = useState(user.program);
  const [language, setLanguage] = useState(user.primaryLanguage);

  const dirty = name !== user.name || email !== user.email || institution !== user.institution || program !== user.program || language !== user.primaryLanguage;

  function save() {
    updateUser({ name, email, institution, program, primaryLanguage: language });
  }

  function exportData() {
    const data = useStore.getState();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sankofa-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function nuke() {
    if (!confirm("Delete all local Sankofa data on this device? This cannot be undone.")) return;
    localStorage.removeItem("sankofa-v1");
    signOut();
    location.href = "/";
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
              {["English", "Pidgin", "Twi", "Yoruba", "Hausa", "Swahili", "Amharic", "French", "Wolof", "Zulu"].map((l) => <option key={l}>{l}</option>)}
            </select>
          </Field>
          <div className="flex justify-end">
            <Button onClick={save} disabled={!dirty}>Save profile</Button>
          </div>
        </div>
      </Card>

      <Card className="p-6 mb-6">
        <h2 className="font-medium flex items-center gap-2 mb-5"><KeyRound className="size-4 text-emerald" /> API keys</h2>
        <div className="text-sm text-muted mb-3">Sage and the coaches run on Anthropic. Add your <code className="text-emerald">ANTHROPIC_API_KEY</code> to <code>.env.local</code> (local) or your Vercel project env vars (deployed) to switch from demo mode to live Claude responses.</div>
        <div className="bg-surface-2 rounded-xl p-4 font-mono text-xs">
          ANTHROPIC_API_KEY=sk-ant-…
        </div>
      </Card>

      <Card className="p-6 mb-6">
        <h2 className="font-medium flex items-center gap-2 mb-5"><Bell className="size-4 text-emerald" /> Notifications</h2>
        <div className="space-y-3 text-sm">
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
        <h2 className="font-medium flex items-center gap-2 mb-5"><Shield className="size-4 text-emerald" /> Privacy & data</h2>
        <p className="text-sm text-muted mb-4">All your Sankofa data lives in your browser&apos;s localStorage. Nothing leaves your device unless you ship something publicly (e.g. portfolio).</p>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" onClick={exportData}><Download className="size-4" /> Export my data</Button>
          <Button variant="danger" onClick={nuke}><Trash2 className="size-4" /> Reset all data</Button>
        </div>
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
