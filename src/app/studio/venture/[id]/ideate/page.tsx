"use client";

import { use, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { useStore } from "@/store";
import { Card, Button, Textarea, Badge, Input } from "@/components/ui";
import { Lightbulb, Save, Sparkles, Target, Compass, Zap } from "lucide-react";

// Lean Canvas, Strategyzer's 9-block, in the order Ash Maurya recommends —
// problem → segments → UVP → solution → channels → revenue → cost → metrics → unfair edge.
const BLOCKS: { key: string; placeholder: string; color: "emerald" | "amber" | "indigo" | "rust" | "muted"; lane: 1 | 2 | 3 }[] = [
  { key: "Problem", placeholder: "Top 3 problems your customer faces — in their words. Skip the ones they already have a 'good enough' workaround for.", color: "rust", lane: 1 },
  { key: "Customer", placeholder: "Be brutally specific. Not 'farmers' — '4-hectare cassava farmers in Northern Region who own a phone but no smartphone'.", color: "emerald", lane: 1 },
  { key: "Value prop", placeholder: "One sentence a 12-year-old understands. 'We help X do Y so they can Z.'", color: "amber", lane: 1 },
  { key: "Solution", placeholder: "The 3 minimum features that test your riskiest assumption. Resist the urge to design v3.", color: "amber", lane: 2 },
  { key: "Channels", placeholder: "How does customer #1 hear about you? Customer #100? Customer #10k? Different answers — that's fine.", color: "indigo", lane: 2 },
  { key: "Revenue", placeholder: "Subscription? Per-transaction? Marketplace cut? What does one customer pay this month?", color: "indigo", lane: 2 },
  { key: "Cost", placeholder: "Variable cost per customer (BOM + payment fees + ops). Don't forget MoMo charges.", color: "rust", lane: 3 },
  { key: "Metrics", placeholder: "The 1-2 numbers you will live or die by this quarter. Pick the leading indicator, not the lagging one.", color: "rust", lane: 3 },
  { key: "Unfair edge", placeholder: "Insight nobody else has, IP, distribution, network. 'We work hard' is NOT a moat.", color: "emerald", lane: 3 },
];

export default function IdeatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ventures, updateVenture } = useStore();
  const found = ventures.find((x) => x.id === id);

  const [canvas, setCanvas] = useState<Record<string, string>>({});
  const [jtbd, setJtbd] = useState({ when: "", iWantTo: "", soICan: "", today: "" });
  const [wedge, setWedge] = useState({ who: "", pain: "", alternative: "", insight: "" });
  const [assisting, setAssisting] = useState<string | null>(null);

  useEffect(() => {
    if (!found) return;
    setCanvas(found.canvas ?? {});
    if (found.jtbd) setJtbd(found.jtbd);
    if (found.wedge) setWedge(found.wedge);
  }, [found?.id]);

  if (!found) { notFound(); return null; }
  const v = found;

  const filled = BLOCKS.filter((b) => (canvas[b.key] ?? "").trim().length > 4).length;
  const dirty =
    JSON.stringify(canvas) !== JSON.stringify(v.canvas) ||
    JSON.stringify(jtbd) !== JSON.stringify(v.jtbd ?? { when: "", iWantTo: "", soICan: "", today: "" }) ||
    JSON.stringify(wedge) !== JSON.stringify(v.wedge ?? { who: "", pain: "", alternative: "", insight: "" });

  function save() { updateVenture(v.id, { canvas, jtbd, wedge }); }

  async function assist(blockKey: string) {
    setAssisting(blockKey);
    try {
      const res = await fetch("/api/venture/assist-canvas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          block: blockKey,
          ventureName: v.name,
          tagline: v.tagline,
          region: v.region,
          currentCanvas: canvas,
          jtbd,
          wedge,
        }),
      });
      const data = await res.json();
      if (data.text) setCanvas((c) => ({ ...c, [blockKey]: c[blockKey] ? `${c[blockKey]}\n\n${data.text}` : data.text }));
    } finally {
      setAssisting(null);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 space-y-8">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-amber mb-1 flex items-center gap-1.5">
            <Lightbulb className="size-3.5" /> Phase 1 — Frame the venture
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">Ideate</h2>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            Three frames, working together. JTBD names the job customers hire you for. Wedge picks
            the beachhead. Lean Canvas turns the hypothesis into 9 testable bets.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge color={filled >= 7 ? "emerald" : "amber"}>{filled}/9 blocks filled</Badge>
          <Button onClick={save} disabled={!dirty}>
            <Save className="size-4" /> {dirty ? "Save" : "Saved"}
          </Button>
        </div>
      </header>

      {/* JTBD */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Target className="size-4 text-emerald" />
          <h3 className="font-medium">Jobs-To-Be-Done</h3>
          <Badge color="muted">Clayton Christensen</Badge>
        </div>
        <p className="text-xs text-muted mb-4 max-w-2xl">
          Customers don&apos;t buy products — they hire products to do jobs. State the job in a single
          sentence. If it ends with a brand or feature, you&apos;re too close to the product.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="When (situation)" value={jtbd.when} onChange={(x) => setJtbd({ ...jtbd, when: x })} placeholder="When market prices crash before harvest…" />
          <Field label="I want to (motivation)" value={jtbd.iWantTo} onChange={(x) => setJtbd({ ...jtbd, iWantTo: x })} placeholder="…lock in a fair price for my crop…" />
          <Field label="So I can (outcome)" value={jtbd.soICan} onChange={(x) => setJtbd({ ...jtbd, soICan: x })} placeholder="…feed my family and replant next season." />
          <Field label="Today they (current behavior)" value={jtbd.today} onChange={(x) => setJtbd({ ...jtbd, today: x })} placeholder="Sell on harvest day at whatever the middleman offers." />
        </div>
      </Card>

      {/* Wedge */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Compass className="size-4 text-amber" />
          <h3 className="font-medium">Wedge — your beachhead</h3>
          <Badge color="muted">Geoffrey Moore</Badge>
        </div>
        <p className="text-xs text-muted mb-4 max-w-2xl">
          You can&apos;t boil the ocean on $0. Pick the narrowest, most-painful slice — the one where
          you&apos;ll be the obvious choice. You expand from there.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Who exactly" value={wedge.who} onChange={(x) => setWedge({ ...wedge, who: x })} placeholder="2-acre maize farmers in Tamale's belt who joined a co-op in 2024" />
          <Field label="What pain they feel TODAY" value={wedge.pain} onChange={(x) => setWedge({ ...wedge, pain: x })} placeholder="Price asymmetry — middlemen pay 30% below market" />
          <Field label="What alternative they currently use" value={wedge.alternative} onChange={(x) => setWedge({ ...wedge, alternative: x })} placeholder="Phone calls to a friend in Kumasi market, day-of-harvest" />
          <Field label="Your unique insight about them" value={wedge.insight} onChange={(x) => setWedge({ ...wedge, insight: x })} placeholder="The co-op chairman already runs a WhatsApp group. Distribution is solved." />
        </div>
      </Card>

      {/* Lean Canvas */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-emerald" />
            <h3 className="font-medium">Lean Canvas</h3>
            <Badge color="muted">Ash Maurya</Badge>
          </div>
          <p className="text-xs text-muted">Click <span className="text-emerald">AI assist</span> on any block to get Akili&apos;s first draft.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {BLOCKS.map((b) => (
            <Card key={b.key} className="p-5">
              <div className="flex items-center justify-between mb-3">
                <Badge color={b.color}>{b.key}</Badge>
                <button
                  onClick={() => assist(b.key)}
                  disabled={assisting === b.key}
                  className="text-[10px] uppercase tracking-widest text-emerald hover:text-amber transition flex items-center gap-1 disabled:opacity-50"
                >
                  <Zap className={`size-3 ${assisting === b.key ? "animate-pulse" : ""}`} />
                  {assisting === b.key ? "thinking" : "AI assist"}
                </button>
              </div>
              <Textarea
                placeholder={b.placeholder}
                value={canvas[b.key] ?? ""}
                onChange={(e) => setCanvas({ ...canvas, [b.key]: e.target.value })}
                rows={6}
                className="border-0 bg-transparent focus:border-0 p-0 text-sm"
              />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">{label}</div>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
