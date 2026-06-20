"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { profileApi } from "@/lib/profile-api";
import type { InvestorThesis } from "@/lib/investor-thesis";
import {
  thesisCompleteness, missingForPublish, summarizeThesis, formatCheckRange,
  EMPTY_THESIS,
} from "@/lib/investor-thesis";
import { VALID_STAGES, stageLabel } from "@/lib/saved-search";
import { Card, Badge, Button, Input, Textarea } from "@/components/ui";
import {
  Target, ArrowLeft, Loader2, AlertCircle, CheckCircle2, Eye, EyeOff,
  Save, Globe, Sparkles, ExternalLink, Mail,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase";

// /studio/investor/thesis — investor's public thesis editor.
// Shows a live completeness meter, gates publishing on the floor,
// and previews the public summary. Investors fill once; founders
// discover via /investors.

export default function ThesisEditorPage() {
  const [thesis, setThesis] = useState<InvestorThesis>(EMPTY_THESIS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [mySlug, setMySlug] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [t, me] = await Promise.all([profileApi.getMyThesis(), profileApi.getMyProfile()]);
      if (t.ok) setThesis(t.thesis);
      else setErr(t.error || "Failed to load");
      if (me.ok) setMySlug(me.profile.slug);
      setLoading(false);
    })();
  }, []);

  function set<K extends keyof InvestorThesis>(k: K, v: InvestorThesis[K]) {
    setThesis((t) => ({ ...t, [k]: v }));
    setSavedMsg(null);
  }

  const completeness = thesisCompleteness(thesis);
  const missing = missingForPublish(thesis);
  const canPublish = missing.length === 0;

  async function save(publishIntent: boolean) {
    setSaving(true); setErr(null); setSavedMsg(null);
    const next = { ...thesis, isPublished: publishIntent };
    const r = await profileApi.putMyThesis(next);
    setSaving(false);
    if (!r.ok) { setErr(r.error || "Save failed"); return; }
    setThesis(r.thesis);
    if (r.publishBlocked) setErr(`Saved as draft. To publish, add ${missingForPublish(r.thesis).join(", ")}.`);
    else setSavedMsg(r.thesis.isPublished ? "Published — founders can find you now." : "Saved as draft.");
  }

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="size-6 text-emerald animate-spin" /></div>;
  }

  const meterColor = completeness >= 80 ? "bg-emerald" : completeness >= 50 ? "bg-amber" : "bg-rust";

  return (
    <div className="max-w-2xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/studio/investor" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-4">
        <ArrowLeft className="size-3" /> Investor portal
      </Link>

      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
          <Target className="size-3.5" /> Your thesis
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
          What you back, in public.
        </h1>
        <p className="mt-3 text-muted max-w-2xl leading-relaxed">
          Publish your thesis so founders building in your space can find you and pitch the right deal. You stay in control — keep it a private draft until you&apos;re ready.
        </p>
      </header>

      {/* Completeness + status */}
      <Card className="p-4 mb-5">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            {thesis.isPublished
              ? <Badge color="emerald"><Eye className="size-3 mr-1" /> Published</Badge>
              : <Badge color="muted"><EyeOff className="size-3 mr-1" /> Draft</Badge>}
            <span className="text-xs text-muted">{completeness}% complete</span>
          </div>
          {thesis.isPublished && mySlug && (
            <Link href={`/investors/${mySlug}`} className="text-xs text-emerald hover:underline inline-flex items-center gap-1">
              View public page <ExternalLink className="size-3" />
            </Link>
          )}
        </div>
        <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
          <div className={`h-full ${meterColor} transition-all`} style={{ width: `${completeness}%` }} />
        </div>
        {!canPublish && (
          <p className="text-[11px] text-muted mt-2">To publish, add {missing.join(", ")}.</p>
        )}
      </Card>

      {err && (
        <Card className="p-4 border-rust/40 mb-4 flex items-start gap-2">
          <AlertCircle className="size-4 text-rust mt-0.5" />
          <span className="text-sm text-rust">{err}</span>
        </Card>
      )}

      <div className="space-y-4">
        <Field label="Headline" hint="One line — your positioning.">
          <Input value={thesis.headline} onChange={(e) => set("headline", e.target.value)} maxLength={120} placeholder="Pre-seed climate & fintech across West Africa" />
        </Field>

        <Field label="Thesis statement" hint="What you look for, how you help, what you avoid.">
          <Textarea value={thesis.statement} onChange={(e) => set("statement", e.target.value)} maxLength={4000} rows={6} placeholder="We back technical founders building…" />
        </Field>

        <Field label="Sectors" hint="Comma separated.">
          <Input
            value={thesis.sectors.join(", ")}
            onChange={(e) => set("sectors", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
            placeholder="climate, fintech, healthtech"
          />
        </Field>

        <Field label="Stages" hint="Tap to toggle.">
          <div className="flex flex-wrap gap-2">
            {VALID_STAGES.map((s) => {
              const on = thesis.stages.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => set("stages", on ? thesis.stages.filter((x) => x !== s) : [...thesis.stages, s])}
                  className={`px-3 py-1.5 rounded-full border text-xs transition ${on ? "border-emerald bg-emerald/10 text-emerald" : "border-border text-muted hover:text-foreground"}`}
                >
                  {stageLabel(s)}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Regions" hint="Comma separated.">
          <Input
            value={thesis.regions.join(", ")}
            onChange={(e) => set("regions", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
            placeholder="Nigeria, Ghana, Kenya"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Min check (USD)">
            <Input type="number" min={0} value={thesis.checkMinUsd ?? ""} onChange={(e) => set("checkMinUsd", e.target.value ? Number(e.target.value) : null)} placeholder="25000" />
          </Field>
          <Field label="Max check (USD)">
            <Input type="number" min={0} value={thesis.checkMaxUsd ?? ""} onChange={(e) => set("checkMaxUsd", e.target.value ? Number(e.target.value) : null)} placeholder="250000" />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={thesis.acceptsColdPitch} onChange={(e) => set("acceptsColdPitch", e.target.checked)} className="accent-emerald" />
          <Mail className="size-4 text-muted" /> Accept cold pitches from founders
        </label>
      </div>

      {/* Live preview */}
      <Card className="p-4 mt-5 bg-gradient-to-br from-emerald/5 to-transparent">
        <div className="text-[10px] uppercase tracking-widest text-muted mb-2 flex items-center gap-1.5">
          <Globe className="size-3" /> How founders will see you
        </div>
        <div className="font-medium">{thesis.headline || "Your headline"}</div>
        <div className="text-xs text-muted mt-1">{summarizeThesis(thesis)}</div>
        {formatCheckRange(thesis) && <Badge color="indigo" className="mt-2">Checks {formatCheckRange(thesis)}</Badge>}
      </Card>

      {savedMsg && (
        <div className="mt-4 text-sm text-emerald flex items-center gap-1.5">
          <CheckCircle2 className="size-4" /> {savedMsg}
        </div>
      )}

      <div className="mt-6 flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={() => save(false)} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save draft
        </Button>
        {thesis.isPublished ? (
          <Button variant="ghost" onClick={() => save(false)} disabled={saving}>
            <EyeOff className="size-4" /> Unpublish
          </Button>
        ) : (
          <Button onClick={() => save(true)} disabled={saving || !canPublish} title={canPublish ? "Publish your thesis" : `Add ${missing.join(", ")}`}>
            <Sparkles className="size-4" /> Publish
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">
        {label}{hint && <span className="normal-case tracking-normal text-muted/70"> — {hint}</span>}
      </div>
      {children}
    </div>
  );
}
