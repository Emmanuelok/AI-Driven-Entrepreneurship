"use client";

import { useEffect, useState } from "react";
import { workspaceApi } from "@/lib/workspace-api";
import { Card } from "@/components/ui";
import { TrendingUp, CheckCircle2, Calendar, MessageSquare, Paperclip, Loader2, Flame } from "lucide-react";

type Insights = Awaited<ReturnType<typeof workspaceApi.getInsights>>;

const MOMENTUM_META: Record<string, { label: string; tone: string; ring: string }> = {
  "on-fire": { label: "On fire", tone: "text-rust", ring: "ring-rust/30" },
  steady: { label: "Steady", tone: "text-emerald", ring: "ring-emerald/30" },
  light: { label: "Light", tone: "text-amber", ring: "ring-amber/30" },
  quiet: { label: "Quiet", tone: "text-muted", ring: "ring-border" },
};

// Personal 'your week here' card. Renders the pure-computed insights for
// the signed-in member: headline + a compact stat row. Hidden entirely
// when the user has had zero activity (no point showing four zeros).
export function WorkspaceInsightsCard({ workspaceId, accent }: { workspaceId: string; accent: string }) {
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await workspaceApi.getInsights(workspaceId, 7);
      if (cancelled) return;
      setData(r);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [workspaceId]);

  if (loading) {
    return (
      <Card className="p-5 flex items-center justify-center min-h-[100px]">
        <Loader2 className="size-5 text-emerald animate-spin" />
      </Card>
    );
  }
  if (!data || !data.ok) return null;
  const i = data.insights;
  // Nothing happened — don't occupy space with zeros.
  if (i.totalEvents === 0) return null;

  const m = MOMENTUM_META[i.momentum] ?? MOMENTUM_META.quiet;

  return (
    <Card className={`p-6 relative overflow-hidden ring-1 ${m.ring}`}>
      <div className="absolute -top-16 -right-16 size-40 rounded-full blur-3xl opacity-15" style={{ background: accent }} />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="size-4 text-emerald" /> Your week here
          </h2>
          <span className={`text-[10px] uppercase tracking-widest flex items-center gap-1 ${m.tone}`}>
            {i.momentum === "on-fire" && <Flame className="size-3" />} {m.label}
          </span>
        </div>
        <p className="text-sm text-foreground/90 leading-relaxed mb-4">{i.headline}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat icon={CheckCircle2} value={i.tasksClosed} label="tasks closed" tone="text-emerald" />
          <Stat icon={Calendar} value={i.deadlinesHit} label="deadlines hit" tone="text-indigo" />
          <Stat icon={MessageSquare} value={i.messagesSent} label="messages" tone="text-amber" />
          <Stat icon={Paperclip} value={i.filesAdded} label="files shared" tone="text-rust" />
        </div>
      </div>
    </Card>
  );
}

function Stat({ icon: Icon, value, label, tone }: { icon: typeof TrendingUp; value: number; label: string; tone: string }) {
  return (
    <div className="rounded-xl bg-surface-2/40 border border-border p-3">
      <div className={`flex items-center gap-1.5 ${tone}`}>
        <Icon className="size-3.5" />
        <span className="font-[family-name:var(--font-display)] text-2xl font-semibold">{value}</span>
      </div>
      <div className="text-[10px] uppercase tracking-widest text-muted mt-1">{label}</div>
    </div>
  );
}
