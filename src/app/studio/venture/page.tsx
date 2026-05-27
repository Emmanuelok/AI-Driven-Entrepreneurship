"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/store";
import { PROBLEMS } from "@/lib/problems";
import { Card, Button, Input, Textarea, Badge, EmptyState, Dialog } from "@/components/ui";
import { Rocket, Plus, ArrowRight, Users, Target, Wallet, Sparkles } from "lucide-react";

export default function VenturesPage() {
  const { ventures, createVenture } = useStore();
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="flex items-end justify-between flex-wrap gap-6 mb-10">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2">Venture Studio</p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">Your ventures, end to end.</h1>
          <p className="mt-3 text-muted max-w-2xl">Idea capture · validation · MVP · pitch · fundraise · growth — every phase tracked, every artifact in one place.</p>
        </div>
        <Button onClick={() => setCreating(true)} size="lg">
          <Plus className="size-4" /> New venture
        </Button>
      </div>

      {ventures.length === 0 ? (
        <EmptyState
          icon={Rocket}
          title="No ventures yet"
          body="Pick a problem from the Hub or start fresh with an idea you've been carrying."
          action={
            <div className="flex gap-2">
              <Link href="/studio/problems"><Button variant="secondary">Browse Problem Hub</Button></Link>
              <Button onClick={() => setCreating(true)}><Plus className="size-4" /> New venture</Button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-4">
          {ventures.map((v) => (
            <Link
              key={v.id}
              href={`/studio/venture/${v.id}`}
              className="glass rounded-3xl p-6 sm:p-8 hover:border-emerald/40 transition group grid lg:grid-cols-[1fr_auto] gap-6 items-center"
            >
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge color={v.phase === "scale" ? "amber" : v.phase === "launch" ? "emerald" : "indigo"}>Phase: {v.phase}</Badge>
                  {v.problemId && <Badge color="muted">{PROBLEMS.find((p) => p.id === v.problemId)?.sector ?? "Custom"}</Badge>}
                </div>
                <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">{v.name}</h2>
                <p className="text-muted mt-1">{v.tagline}</p>
                <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 text-sm text-muted">
                  <span className="flex items-center gap-1.5"><Users className="size-3.5 text-emerald" /> {v.team.length} on team</span>
                  <span className="flex items-center gap-1.5"><Target className="size-3.5 text-emerald" /> {v.interviews.length}/{v.metrics.interviewsTarget} interviews</span>
                  <span className="flex items-center gap-1.5"><Wallet className="size-3.5 text-emerald" /> ${v.metrics.mrr} MRR</span>
                </div>
              </div>
              <div className="bg-emerald text-black px-5 py-2.5 rounded-full font-medium flex items-center gap-2 group-hover:bg-amber transition shrink-0">
                Open <ArrowRight className="size-4" />
              </div>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={creating} onClose={() => setCreating(false)} title="Start a venture" size="lg">
        <NewVentureForm
          onCreate={(payload) => {
            const id = createVenture({
              ...payload,
              phase: "ideate",
              metrics: { interviewsTarget: 20, revenue: 0, customers: 0, mrr: 0 },
              mvpTasks: [],
              team: [],
              interviews: [],
              canvas: {},
              achievements: [],
              fundingRaised: 0,
              fundingTarget: 50000,
            });
            setCreating(false);
            router.push(`/studio/venture/${id}`);
          }}
        />
      </Dialog>
    </div>
  );
}

function NewVentureForm({ onCreate }: { onCreate: (p: { name: string; tagline: string; region: string; problemId?: string }) => void }) {
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [region, setRegion] = useState("");
  const [problemId, setProblemId] = useState("");

  return (
    <div className="space-y-4">
      <Input placeholder="Venture name" value={name} onChange={(e) => setName(e.target.value)} />
      <Textarea placeholder="One-line tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} rows={2} />
      <Input placeholder="Region / geography (e.g. Northern Ghana, Western Kenya)" value={region} onChange={(e) => setRegion(e.target.value)} />
      <div>
        <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Link to a Hub problem (optional)</div>
        <select value={problemId} onChange={(e) => setProblemId(e.target.value)} className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald w-full">
          <option value="" className="bg-surface">None — custom</option>
          {PROBLEMS.map((p) => (<option key={p.id} value={p.id} className="bg-surface">{p.title.slice(0, 80)}</option>))}
        </select>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => name.trim() && onCreate({ name, tagline, region, problemId: problemId || undefined })} disabled={!name.trim()}>
          <Sparkles className="size-4" /> Create venture
        </Button>
      </div>
    </div>
  );
}
