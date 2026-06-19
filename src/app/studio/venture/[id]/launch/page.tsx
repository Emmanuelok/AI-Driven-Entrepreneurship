"use client";

import { use, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { useStore } from "@/store";
import { Card, Button, Input, Textarea, Badge } from "@/components/ui";
import { Megaphone, Save, Sparkles, MessageCircle, Copy, Plus, Trash2 } from "lucide-react";

type Launch = {
  headline?: string;
  subhead?: string;
  bullets?: string[];
  cta?: string;
  whatsappBlurb?: string;
  published?: boolean;
  slug?: string;
};

type Update = { id: string; month: string; highlights: string; lowlights: string; asks: string; metrics: string; created: number };

export default function LaunchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ventures, updateVenture } = useStore();
  const found = ventures.find((x) => x.id === id);

  const [launch, setLaunch] = useState<Launch>({});
  const [updates, setUpdates] = useState<Update[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [updMonth, setUpdMonth] = useState(new Date().toISOString().slice(0, 7));
  const [updDraft, setUpdDraft] = useState<{ highlights: string; lowlights: string; asks: string; metrics: string }>({ highlights: "", lowlights: "", asks: "", metrics: "" });
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    if (!found) return;
    setLaunch(found.publicLaunch ?? {});
    setUpdates(found.updates ?? []);
  }, [found?.id]);

  if (!found) { notFound(); return null; }
  const v = found;

  function save() { updateVenture(v.id, { publicLaunch: launch, updates }); }

  async function aiLaunchDraft() {
    setDrafting(true);
    try {
      const res = await fetch("/api/venture/launch-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ventureName: v.name,
          tagline: v.tagline,
          canvas: v.canvas,
          jtbd: v.jtbd,
          wedge: v.wedge,
          region: v.region,
        }),
      });
      const data = await res.json();
      if (data.headline) {
        setLaunch({ ...launch, headline: data.headline, subhead: data.subhead, bullets: data.bullets, cta: data.cta, whatsappBlurb: data.whatsappBlurb });
      }
    } finally {
      setDrafting(false);
    }
  }

  async function aiUpdateDraft() {
    setComposing(true);
    try {
      const res = await fetch("/api/venture/update-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ventureName: v.name,
          month: updMonth,
          metrics: v.metrics,
          fundingRaised: v.fundingRaised,
          interviews: v.interviews.length,
          mvpDone: v.mvpTasks.filter((t) => t.done).length,
          mvpTotal: v.mvpTasks.length,
          economics: v.economics,
        }),
      });
      const data = await res.json();
      if (data.highlights) setUpdDraft({ highlights: data.highlights, lowlights: data.lowlights, asks: data.asks, metrics: data.metrics });
    } finally {
      setComposing(false);
    }
  }

  function logUpdate() {
    if (!updDraft.highlights.trim()) return;
    setUpdates([{ id: Math.random().toString(36).slice(2, 8), month: updMonth, created: Date.now(), ...updDraft }, ...updates]);
    setUpdDraft({ highlights: "", lowlights: "", asks: "", metrics: "" });
  }

  function copyAllUpdate(u: Update) {
    const txt = `${v.name} — ${u.month} update

📈 Highlights
${u.highlights}

⚠️ Lowlights
${u.lowlights}

🙏 Asks
${u.asks}

📊 Metrics
${u.metrics}`;
    navigator.clipboard.writeText(txt);
  }

  function copyWhatsapp() {
    if (launch.whatsappBlurb) navigator.clipboard.writeText(launch.whatsappBlurb);
  }

  // Publish (or unpublish) this venture as a public investor profile.
  // Sends an explicit, redacted payload — the owner sees exactly what
  // goes public before the request fires.
  async function togglePublish() {
    const { supabaseBrowser } = await import("@/lib/supabase");
    const sb = supabaseBrowser();
    if (!sb) { alert("Cloud sync isn't configured. Set up Supabase to publish."); return; }
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { alert("Sign in first."); return; }

    if (launch.published && launch.slug) {
      const res = await fetch(`/api/public/publish?slug=${encodeURIComponent(launch.slug)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) { alert("Couldn't unpublish."); return; }
      setLaunch({ ...launch, published: false });
      updateVenture(v.id, { publicLaunch: { ...launch, published: false } });
      return;
    }

    const proposedSlug = (launch.slug || v.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    const slug = prompt("Pick a slug for the public URL — sankofa.studio/v/SLUG. Letters, digits, hyphens. 3-40 chars.", proposedSlug);
    if (!slug) return;

    // Public-safe projection — owner controls what's exposed. We
    // also alias name → title because the browse endpoint reads
    // payload->>title for search; keeping `name` for back-compat
    // with /v/[slug] readers that already use it.
    const publicPayload = {
      title: v.name,
      name: v.name,
      tagline: v.tagline,
      region: v.region,
      publicLaunch: { headline: launch.headline, subhead: launch.subhead, bullets: launch.bullets, cta: launch.cta, whatsappBlurb: launch.whatsappBlurb },
      metrics: { mrr: v.metrics?.mrr, customers: v.metrics?.customers },
      fundingRaised: v.fundingRaised,
      fundingTarget: v.fundingTarget,
      team: v.team?.map((t) => ({ name: t.name, role: t.role })),
      achievements: v.achievements,
      jtbd: v.jtbd ? { when: v.jtbd.when, iWantTo: v.jtbd.iWantTo, soICan: v.jtbd.soICan } : undefined,
      wedge: v.wedge ? { who: v.wedge.who } : undefined,
      pitchDeck: v.pitchDeck ? { slides: v.pitchDeck.slides?.slice(0, 6).map((s) => ({ title: s.title, body: s.body })) } : undefined,
      updates: v.updates?.slice(0, 1).map((u) => ({ month: u.month, highlights: u.highlights })),
    };

    // Derive the new discovery filters from existing venture state —
    // founders don't have to fill another form, and re-publishing
    // refreshes these automatically. v.phase doubles as the stage
    // filter; raise math comes from funding target vs raised; region
    // comes through as-is. Sectors stay empty here — the venture
    // doesn't carry them as a first-class field yet, and we'd rather
    // omit the column than guess wrong.
    const remainingRaise = Math.max(0, (v.fundingTarget ?? 0) - (v.fundingRaised ?? 0));
    const isRaising = remainingRaise > 0;
    // Map venture phases → public stage values accepted by the
    // publish API. "ideate" collapses to "idea" so we don't lose
    // pre-seed-shaped ventures from the stage filter.
    const stageMap: Record<string, string> = {
      ideate: "idea", idea: "idea", discover: "discover",
      mvp: "mvp", launch: "launch", scale: "scale",
    };
    const stage = stageMap[v.phase] ?? "idea";
    const res = await fetch("/api/public/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        ventureId: v.id,
        slug,
        payload: publicPayload,
        stage,
        region: v.region || undefined,
        isRaising,
        raisingAmountUsd: isRaising ? remainingRaise : undefined,
      }),
    });
    const data = await res.json();
    if (!data.ok) { alert(data.error || "Couldn't publish."); return; }
    setLaunch({ ...launch, published: true, slug: data.slug });
    updateVenture(v.id, { publicLaunch: { ...launch, published: true, slug: data.slug } });
  }

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-amber mb-1 flex items-center gap-1.5">
            <Megaphone className="size-3.5" /> Phase 4 — Launch & comms
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">Tell the world.</h2>
          <p className="text-sm text-muted mt-1 max-w-2xl">A one-pager that loads in 200ms. A WhatsApp blurb you can paste anywhere. Monthly investor updates that don&apos;t feel like homework.</p>
        </div>
        <Button onClick={save}><Save className="size-4" /> Save all</Button>
      </header>

      {/* Publish to the public investor profile */}
      <Card className={`p-5 ${launch.published ? "border border-emerald/30 bg-emerald/5" : ""}`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Megaphone className="size-4 text-amber shrink-0" />
              <h3 className="font-medium">Public investor profile</h3>
              {launch.published && <span className="text-[10px] uppercase tracking-widest text-emerald">Live</span>}
            </div>
            {launch.published && launch.slug ? (
              <a href={`/v/${launch.slug}`} target="_blank" rel="noopener" className="mt-1 inline-flex items-center gap-1 text-sm text-emerald hover:text-amber font-mono break-all">
                /v/{launch.slug}
              </a>
            ) : (
              <p className="mt-1 text-xs text-muted">
                Publish a redacted one-pager at <code>sankofa.studio/v/your-slug</code> — investors can view (and only view) without an account.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {launch.published && launch.slug && (
              <SagePolishButton slug={launch.slug} />
            )}
            <Button variant={launch.published ? "secondary" : "primary"} onClick={togglePublish}>
              {launch.published ? "Unpublish" : "Publish profile"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Public launch page builder */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium flex items-center gap-2"><Megaphone className="size-4 text-amber" /> Public one-pager</h3>
          <Button size="sm" variant="secondary" onClick={aiLaunchDraft} disabled={drafting}>
            <Sparkles className="size-4" /> {drafting ? "Drafting…" : "AI draft"}
          </Button>
        </div>

        <div className="grid lg:grid-cols-2 gap-5">
          <div className="space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Headline</div>
              <Input value={launch.headline ?? ""} onChange={(e) => setLaunch({ ...launch, headline: e.target.value })} placeholder="The grain price you deserve, the day you harvest." />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Subhead</div>
              <Textarea value={launch.subhead ?? ""} onChange={(e) => setLaunch({ ...launch, subhead: e.target.value })} rows={3} placeholder="Cassava farmers in Northern Region get same-day, fair-market quotes via WhatsApp." />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Bullets (one per line)</div>
              <Textarea
                value={(launch.bullets ?? []).join("\n")}
                onChange={(e) => setLaunch({ ...launch, bullets: e.target.value.split("\n").filter(Boolean) })}
                rows={5}
                placeholder={"30% higher prices for farmers in pilot\nNo app to download — works via WhatsApp\nPilot with 4 co-ops in Tamale belt"}
              />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted mb-1">CTA button text</div>
              <Input value={launch.cta ?? ""} onChange={(e) => setLaunch({ ...launch, cta: e.target.value })} placeholder="Join the waiting list" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted mb-1">WhatsApp blurb (under 280 chars)</div>
              <Textarea value={launch.whatsappBlurb ?? ""} onChange={(e) => setLaunch({ ...launch, whatsappBlurb: e.target.value })} rows={3} maxLength={280} placeholder="Hey! I'm building something for cassava farmers in Northern Region — fair prices on harvest day, all via WhatsApp. Sign up: https://sankofa.studio/v/123" />
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-muted">{(launch.whatsappBlurb ?? "").length}/280</span>
                <Button size="sm" variant="ghost" onClick={copyWhatsapp} disabled={!launch.whatsappBlurb}><Copy className="size-3" /> Copy</Button>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-2xl border border-border bg-gradient-to-br from-emerald/5 to-amber/5 p-8 flex flex-col">
            <Badge color="muted" className="self-start mb-4">Live preview</Badge>
            <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight">{launch.headline || "Your headline appears here."}</h2>
            <p className="mt-3 text-muted leading-relaxed">{launch.subhead || "And the subhead."}</p>
            {launch.bullets && launch.bullets.length > 0 && (
              <ul className="mt-5 space-y-2 text-sm">
                {launch.bullets.map((b, i) => (<li key={i} className="flex gap-2"><span className="text-emerald">→</span>{b}</li>))}
              </ul>
            )}
            <div className="mt-auto pt-5">
              <button className="w-full bg-emerald text-black font-medium px-5 py-3 rounded-full hover:bg-amber transition">
                {launch.cta || "Call-to-action"}
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Monthly investor updates */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium flex items-center gap-2"><MessageCircle className="size-4 text-emerald" /> Monthly investor update</h3>
          <div className="flex gap-2">
            <Input type="month" value={updMonth} onChange={(e) => setUpdMonth(e.target.value)} className="max-w-[160px] text-sm" />
            <Button size="sm" variant="secondary" onClick={aiUpdateDraft} disabled={composing}>
              <Sparkles className="size-4" /> {composing ? "Drafting…" : "AI draft"}
            </Button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Textarea placeholder="📈 Highlights — what worked" value={updDraft.highlights} onChange={(e) => setUpdDraft({ ...updDraft, highlights: e.target.value })} rows={4} />
          <Textarea placeholder="⚠️ Lowlights — what didn't" value={updDraft.lowlights} onChange={(e) => setUpdDraft({ ...updDraft, lowlights: e.target.value })} rows={4} />
          <Textarea placeholder="🙏 Asks — what you need from the room" value={updDraft.asks} onChange={(e) => setUpdDraft({ ...updDraft, asks: e.target.value })} rows={4} />
          <Textarea placeholder="📊 Metrics — MRR, customers, runway" value={updDraft.metrics} onChange={(e) => setUpdDraft({ ...updDraft, metrics: e.target.value })} rows={4} />
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={logUpdate} disabled={!updDraft.highlights.trim()}><Plus className="size-4" /> Log update</Button>
        </div>
      </Card>

      {/* Update history */}
      {updates.length > 0 && (
        <Card className="p-6">
          <h3 className="font-medium mb-4">Past updates</h3>
          <div className="space-y-3">
            {updates.map((u) => (
              <details key={u.id} className="border border-border rounded-xl">
                <summary className="px-4 py-3 cursor-pointer list-none flex items-center justify-between hover:bg-surface-2/40 transition">
                  <span className="font-medium text-sm">{u.month}</span>
                  <div className="flex gap-2">
                    <button onClick={(e) => { e.preventDefault(); copyAllUpdate(u); }} className="text-muted hover:text-emerald"><Copy className="size-3.5" /></button>
                    <button onClick={(e) => { e.preventDefault(); setUpdates(updates.filter((x) => x.id !== u.id)); }} className="text-muted hover:text-rust"><Trash2 className="size-3.5" /></button>
                  </div>
                </summary>
                <div className="px-4 pb-4 space-y-3 text-sm">
                  <Section title="📈 Highlights" body={u.highlights} />
                  <Section title="⚠️ Lowlights" body={u.lowlights} />
                  <Section title="🙏 Asks" body={u.asks} />
                  <Section title="📊 Metrics" body={u.metrics} />
                </div>
              </details>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  if (!body.trim()) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-emerald mb-1">{title}</div>
      <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{body}</p>
    </div>
  );
}

/* ─── Sage's pitch-polish dispatch ───
   Founder is the only one who can run it (the agent server-side
   checks owner_id). The polished pitch lands in /studio/agent-runs
   as a needs_approval run with hook/problem/solution/ask — the
   founder edits + republishes. We don't auto-apply. */
function SagePolishButton({ slug }: { slug: string }) {
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  async function run() {
    if (busy) return;
    setBusy(true);
    setHint("Sage is reading the venture…");
    const { profileApi } = await import("@/lib/profile-api");
    const r = await profileApi.startAgentRun({
      agent_kind: "venture_pitch_polish",
      title: `Polish pitch · ${slug}`,
      input: { ventureSlug: slug },
    });
    setBusy(false);
    if (!r.ok) {
      setHint("Couldn't start. Try again.");
      setTimeout(() => setHint(null), 3000);
      return;
    }
    setHint("Polish saved — review at /studio/agent-runs and republish if you want it.");
    setTimeout(() => setHint(null), 5000);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-emerald/40 text-emerald text-sm hover:bg-emerald/10 transition disabled:opacity-40"
        title="Sage reads the venture and produces a polished pitch (hook + problem + solution + ask). You decide whether to republish."
      >
        ✨ Polish with Sage
      </button>
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </div>
  );
}
