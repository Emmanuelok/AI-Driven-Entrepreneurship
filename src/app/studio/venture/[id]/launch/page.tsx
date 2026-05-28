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
