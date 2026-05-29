"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/store";
import { useMe } from "@/store/me";
import { PROBLEMS } from "@/lib/problems";
import { getRecommendations, resolveDepartment } from "@/lib/recommendations";
import { buildSiteContextSnapshotAsync } from "@/lib/site-brain-snapshot";
import { Markdown } from "@/components/markdown";
import { genomeVoiceInstruction, genomeSummary } from "@/lib/genome";
import {
  Sparkles, ArrowRight, ArrowLeft, Rocket, MapPin, Target, Wrench,
  Send, Copy, Check, Download, RefreshCcw, Trophy, Clock, Brain, Mic, X,
  CircleDot, CheckCircle2, GraduationCap, Wand2, Pencil, Loader2,
} from "lucide-react";
import { Button, Card, Badge, Input, Textarea } from "@/components/ui";

type Stage = "begin" | "wedge" | "persona" | "interview" | "slice" | "build" | "ship" | "reflect" | "done";

const STAGE_ORDER: Stage[] = ["begin", "wedge", "persona", "interview", "slice", "build", "ship", "reflect", "done"];
const STAGE_LABELS: Record<Stage, { title: string; minute: string }> = {
  begin: { title: "Begin", minute: "—" },
  wedge: { title: "Pick your wedge", minute: "0–5 min" },
  persona: { title: "Find your person", minute: "5–10 min" },
  interview: { title: "Practice the interview", minute: "10–20 min" },
  slice: { title: "Slice it small", minute: "20–25 min" },
  build: { title: "Build the artifacts", minute: "25–50 min" },
  ship: { title: "Ship it", minute: "50–55 min" },
  reflect: { title: "Reflect", minute: "55–60 min" },
  done: { title: "Done", minute: "60 min" },
};

export default function ShipHourPage() {
  const router = useRouter();
  const { user, createVenture } = useStore();
  const { genome, shipSession, startShipSession, updateShipSession, endShipSession, shipArtifact, artifacts } = useMe();

  const [stage, setStage] = useState<Stage>(shipSession?.stage ?? "begin");
  useEffect(() => { if (!shipSession) startShipSession(); }, []);
  useEffect(() => { if (shipSession && stage !== shipSession.stage) updateShipSession({ stage }); }, [stage]);

  if (!user) return null;
  const stageIdx = STAGE_ORDER.indexOf(stage);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Top progress bar */}
      <div className="border-b border-border px-5 sm:px-8 py-3 flex items-center gap-4 sticky top-14 z-10 glass">
        <Link href="/studio" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5"><ArrowLeft className="size-3" /> Exit</Link>
        <div className="flex items-center gap-2 text-xs">
          <Clock className="size-3.5 text-emerald" />
          <span className="font-mono">Ship Hour</span>
          <span className="text-muted">·</span>
          <span className="text-amber">{STAGE_LABELS[stage].title}</span>
          <span className="text-muted text-[10px] uppercase tracking-widest">{STAGE_LABELS[stage].minute}</span>
        </div>
        <div className="flex-1 flex items-center gap-1.5 max-w-md mx-auto">
          {STAGE_ORDER.slice(1, -1).map((s, i) => (
            <div key={s} className={`flex-1 h-1 rounded-full transition ${i < stageIdx ? "bg-emerald" : i === stageIdx - 1 ? "bg-emerald" : "bg-border"}`} />
          ))}
        </div>
        <div className="text-xs text-muted hidden sm:block">{genomeSummary(genome)}</div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {stage === "begin" && <Begin onStart={() => setStage("wedge")} userName={user.name.split(" ")[0]} field={user.field} />}
        {stage === "wedge" && <Wedge onNext={() => setStage("persona")} />}
        {stage === "persona" && <Persona onNext={() => setStage("interview")} />}
        {stage === "interview" && <Interview onNext={() => setStage("slice")} />}
        {stage === "slice" && <Slice onNext={() => setStage("build")} />}
        {stage === "build" && <Build onNext={() => setStage("ship")} />}
        {stage === "ship" && <Ship onNext={() => setStage("reflect")} />}
        {stage === "reflect" && <Reflect onNext={() => { endShipSession(); setStage("done"); }} />}
        {stage === "done" && <Done onRestart={() => { setStage("begin"); }} />}
      </div>
    </div>
  );
}

/* ---------------- STAGE: BEGIN ---------------- */
function Begin({ onStart, userName, field }: { onStart: () => void; userName: string; field: string }) {
  return (
    <div className="min-h-full flex items-center justify-center px-5 py-16 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -right-32 size-96 rounded-full bg-emerald opacity-10 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 size-96 rounded-full bg-amber opacity-10 blur-3xl" />
        <div className="absolute inset-0 grid-paper opacity-30" />
      </div>
      <div className="relative max-w-2xl text-center">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-emerald mb-6 border border-emerald/30 bg-emerald/5 px-3 py-1.5 rounded-full">
          <span className="size-1.5 rounded-full bg-emerald pulse-dot" /> 60-minute guided experience · For {userName}
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-5xl sm:text-7xl font-semibold leading-[1] tracking-tight">
          Ship something <span className="text-emerald italic">real</span><br />in the next hour.
        </h1>
        <p className="mt-7 text-lg text-muted leading-relaxed max-w-xl mx-auto">
          Not a course. Not a deck. <span className="text-foreground">A real artifact</span> — a problem brief, a discovery script, a signed-letter template, a pricing page, and the WhatsApp message that sends them — all for a specific person, in a specific village, with a specific pain.
        </p>
        <p className="mt-5 text-base text-muted leading-relaxed max-w-xl mx-auto italic">
          We'll walk you through 7 stages. Sage works alongside you — listening, drafting, refining. At the end you'll have everything you need to message your first customer this week.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={onStart} size="lg" className="px-8">
            <Sparkles className="size-4" /> Begin Ship Hour
          </Button>
          <Link href="/studio/ship/library" className="text-sm text-muted hover:text-foreground transition px-4 py-3 rounded-full self-center">
            View your shipped artifacts →
          </Link>
        </div>
        <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl mx-auto text-xs">
          {[
            { n: "01", t: "Pick wedge", min: "5m" },
            { n: "02", t: "Find person", min: "5m" },
            { n: "03", t: "Practice interview", min: "10m" },
            { n: "04", t: "Slice it small", min: "5m" },
            { n: "05", t: "Build artifacts", min: "25m" },
            { n: "06", t: "Ship it", min: "5m" },
            { n: "07", t: "Reflect", min: "5m" },
          ].map((s) => (
            <div key={s.n} className="glass rounded-xl p-3">
              <div className="font-mono text-emerald">{s.n}</div>
              <div className="font-medium mt-1">{s.t}</div>
              <div className="text-muted text-[10px] mt-0.5">{s.min}</div>
            </div>
          ))}
        </div>
        <p className="mt-10 text-xs text-muted">{field} · We've shaped this hour around your discipline.</p>
      </div>
    </div>
  );
}

/* ---------------- STAGE: WEDGE ---------------- */
// Three modes so no student stares at maize-and-tomatoes when they're
// in Mechatronics or Public Health:
//   1. atlas     — stock PROBLEMS filtered to their department
//   2. generate  — Claude proposes 6 wedges from their field + brain
//   3. custom    — they describe their own in plain prose
type WedgeMode = "atlas" | "generate" | "custom";
type GeneratedWedge = { id: string; sector: string; region: string; title: string; affected: string; whyYou: string };

function Wedge({ onNext }: { onNext: () => void }) {
  const { user } = useStore();
  const { shipSession, updateShipSession } = useMe();
  const dept = useMemo(() => resolveDepartment(user?.field), [user?.field]);
  const rec = useMemo(() => getRecommendations(user?.field), [user]);

  // The user's "pulled-toward" problem from their connection graph,
  // if any. Asynchronously fetched on mount; null until resolved or
  // when no pattern is strong enough. When set, we promote it to the
  // top of the Atlas pool with a "you keep coming back" banner.
  const [pulledTowardProblemId, setPulledTowardProblemId] = useState<string | null>(null);
  const [pulledTowardDegree, setPulledTowardDegree] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { fetchUserConnectionsCached } = await import("@/lib/connections-client");
        const { computeInsights } = await import("@/lib/insights");
        const rows = await fetchUserConnectionsCached();
        if (cancelled || rows.length === 0) return;
        const summary = computeInsights(rows, { builds: [], ventures: [] });
        if (summary.topProblem && summary.topProblem.degree >= 2) {
          // Only promote if it's a real Atlas problem we can present
          // as a card; mystery IDs (deleted, externally created) get
          // skipped silently.
          if (PROBLEMS.some((p) => p.id === summary.topProblem!.id)) {
            setPulledTowardProblemId(summary.topProblem.id);
            setPulledTowardDegree(summary.topProblem.degree);
          }
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const atlasPool = useMemo(() => {
    const ids = new Set<string>();
    const out: typeof PROBLEMS = [];
    // The pulled-toward problem always comes first, regardless of
    // discipline match — the user's behavioral signal beats any
    // static heuristic.
    if (pulledTowardProblemId) {
      const promoted = PROBLEMS.find((p) => p.id === pulledTowardProblemId);
      if (promoted) { ids.add(promoted.id); out.push(promoted); }
    }
    (rec.problems ?? []).forEach((p) => { if (!ids.has(p.id)) { ids.add(p.id); out.push(p); } });
    PROBLEMS.forEach((p) => { if (!ids.has(p.id) && p.severity >= 4) { ids.add(p.id); out.push(p); } });
    return out.slice(0, 9);
  }, [rec, pulledTowardProblemId]);

  const [mode, setMode] = useState<WedgeMode>("atlas");
  const [pickedId, setPickedId] = useState(shipSession?.wedge?.problemId ?? "");
  const [whyMe, setWhyMe] = useState(shipSession?.wedge?.whyMe ?? "");

  // AI-generated set + the user's freeform wedge.
  const [generated, setGenerated] = useState<GeneratedWedge[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genHint, setGenHint] = useState("");
  const [genError, setGenError] = useState<string | null>(null);

  const [customTitle, setCustomTitle] = useState("");
  const [customSector, setCustomSector] = useState("");
  const [customAffected, setCustomAffected] = useState("");

  // Lookup the picked wedge across all three sources.
  const picked: { id: string; title: string; sector?: string; region?: string; affected?: string; whyYou?: string } | null =
    pickedId.startsWith("custom:freeform")
      ? (customTitle.trim() ? { id: pickedId, title: customTitle, sector: customSector, affected: customAffected } : null)
      : pickedId.startsWith("custom:")
        ? generated.find((g) => g.id === pickedId) ?? null
        : PROBLEMS.find((p) => p.id === pickedId) ?? null;

  async function generateWedges() {
    setGenerating(true); setGenError(null);
    try {
      const res = await fetch("/api/generate/wedge-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field: user?.field,
          region: user?.country,
          userHint: genHint.trim() || undefined,
          siteContext: await buildSiteContextSnapshotAsync("wedge"),
        }),
      });
      const data = await res.json();
      if (!data.ok) { setGenError(data.error ?? "Couldn't generate wedges."); return; }
      setGenerated(data.candidates ?? []);
    } catch (e) {
      setGenError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  function save() {
    if (!picked || !whyMe.trim()) return;
    updateShipSession({ wedge: { problemId: picked.id, problemTitle: picked.title, whyMe } });
    onNext();
  }

  const fieldLabel = dept?.name ?? user?.field ?? null;

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-12">
      <StageHeader stage={1} title="Pick your wedge" subtitle="Of the problems your discipline equips you to attack, which one will you give your hour to?" />

      {/* Mode picker + discipline banner */}
      <div className="mt-6 flex items-center justify-between flex-wrap gap-3">
        {mode === "atlas" && (
          fieldLabel ? (
            <div className="text-xs text-muted inline-flex items-center gap-1.5">
              <GraduationCap className="size-3.5 text-emerald" />
              Showing wedges picked for <span className="text-foreground font-medium">{fieldLabel}</span>
            </div>
          ) : (
            <div className="text-xs text-amber inline-flex items-center gap-1.5">
              <GraduationCap className="size-3.5" />
              We couldn&apos;t match your field to a discipline — try <button onClick={() => setMode("generate")} className="underline hover:text-emerald">Generate for me</button> for something bespoke.
            </div>
          )
        )}
        <div className="flex gap-1 ml-auto">
          <ModeTab active={mode === "atlas"} onClick={() => { setMode("atlas"); setPickedId(""); }} icon={GraduationCap}>From the Atlas</ModeTab>
          <ModeTab active={mode === "generate"} onClick={() => { setMode("generate"); setPickedId(""); }} icon={Wand2}>Generate for me</ModeTab>
          <ModeTab active={mode === "custom"} onClick={() => { setMode("custom"); setPickedId("custom:freeform"); }} icon={Pencil}>Describe my own</ModeTab>
        </div>
      </div>

      {/* MODE 1 — stock Atlas problems filtered to discipline */}
      {mode === "atlas" && (
        <>
          {pulledTowardProblemId && (
            <div className="mt-6 rounded-2xl border border-amber/40 bg-amber/5 p-4 flex items-start gap-3">
              <Sparkles className="size-4 text-amber shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-xs uppercase tracking-widest text-amber mb-1">You keep coming back to this</div>
                <p className="text-sm text-foreground/95 leading-relaxed">
                  Your connection graph shows <strong>{pulledTowardDegree}</strong> edges tied to{" "}
                  <code className="text-amber font-mono">{pulledTowardProblemId}</code>. We&apos;ve promoted it to the top of the list — pick it if it&apos;s where your real fight is.
                </p>
              </div>
            </div>
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
            {atlasPool.map((p) => {
              const promoted = p.id === pulledTowardProblemId;
              return (
                <button
                  key={p.id}
                  onClick={() => setPickedId(p.id)}
                  className={`text-left glass rounded-2xl p-5 transition group border ${pickedId === p.id ? "border-emerald shadow-lg shadow-emerald/20" : promoted ? "border-amber/60 shadow-lg shadow-amber/10" : "border-border hover:border-emerald/40"}`}
                >
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-widest mb-3">
                    <Badge color="emerald">{p.sector}</Badge>
                    <span className="text-muted">{p.region}</span>
                  </div>
                  {promoted && (
                    <div className="text-[10px] uppercase tracking-widest text-amber mb-2 flex items-center gap-1">
                      <Sparkles className="size-2.5" /> From your graph
                    </div>
                  )}
                  <h3 className="font-medium leading-snug">{p.title}</h3>
                  <p className="mt-2 text-xs text-muted line-clamp-2">{p.affected}</p>
                  {pickedId === p.id && <CheckCircle2 className="size-5 text-emerald mt-3" />}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* MODE 2 — AI-generated wedges from discipline + site brain */}
      {mode === "generate" && (
        <div className="mt-6 space-y-4">
          <Card className="p-5">
            <p className="text-sm text-muted leading-relaxed mb-3">
              Sage will draft 6 wedges sized to your discipline{fieldLabel ? ` (${fieldLabel})` : ""}, your region, and what you&apos;ve been working on. Optionally hint at a direction.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="Optional: 'I want to work on water access' or 'something I can do without leaving campus'"
                value={genHint}
                onChange={(e) => setGenHint(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") generateWedges(); }}
              />
              <Button onClick={generateWedges} disabled={generating}>
                {generating ? <><Loader2 className="size-3.5 animate-spin" /> Drafting</> : <><Wand2 className="size-3.5" /> {generated.length > 0 ? "Re-draft" : "Generate"}</>}
              </Button>
            </div>
            {genError && <p className="text-xs text-rust mt-2">{genError}</p>}
          </Card>

          {generated.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {generated.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setPickedId(g.id)}
                  className={`text-left glass rounded-2xl p-5 transition border ${pickedId === g.id ? "border-emerald shadow-lg shadow-emerald/20" : "border-border hover:border-emerald/40"}`}
                >
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-widest mb-3">
                    <Badge color="emerald">{g.sector}</Badge>
                    <span className="text-muted">{g.region}</span>
                  </div>
                  <h3 className="font-medium leading-snug">{g.title}</h3>
                  <p className="mt-2 text-xs text-muted line-clamp-2">{g.affected}</p>
                  <p className="mt-2 text-[10px] text-amber italic line-clamp-2"><Sparkles className="size-2.5 inline mr-1" />Why you: {g.whyYou}</p>
                  {pickedId === g.id && <CheckCircle2 className="size-5 text-emerald mt-3" />}
                </button>
              ))}
            </div>
          )}

          {generated.length === 0 && !generating && (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-xs text-muted">
              No wedges yet — hit <strong className="text-foreground">Generate</strong> to draft 6 from your discipline.
            </div>
          )}
        </div>
      )}

      {/* MODE 3 — user describes their own */}
      {mode === "custom" && (
        <Card className="mt-6 p-6 space-y-4">
          <p className="text-sm text-muted leading-relaxed">
            Describe the problem in your own words. It can be anything — what matters is that <em>you</em> see the pain and could move on it this hour.
          </p>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">What&apos;s the problem? <span className="text-rust">*</span></div>
            <Textarea
              placeholder="One sentence. e.g. 'JAMB candidates in Northern Nigeria pay GHS-equivalent ₦15,000 for tutoring that's taught only in English, leaving Hausa-first students behind.'"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Sector / discipline</div>
              <Input
                placeholder={dept?.relevantSectors?.[0] ?? "Health, Education, Energy, …"}
                value={customSector}
                onChange={(e) => setCustomSector(e.target.value)}
              />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Who is affected?</div>
              <Input
                placeholder="e.g. 1.8M JAMB sitters/yr, Hausa-first"
                value={customAffected}
                onChange={(e) => setCustomAffected(e.target.value)}
              />
            </div>
          </div>
          {customTitle.trim() && (
            <div className="text-[10px] text-emerald flex items-center gap-1.5">
              <CheckCircle2 className="size-3" /> Wedge captured. Tell Sage why you&apos;re unfair-advantaged below.
            </div>
          )}
        </Card>
      )}

      {/* "Why you, specifically?" — same across all three modes */}
      {picked && (
        <Card className="mt-8 p-6 border-emerald/30 bg-emerald/5">
          <div className="text-xs uppercase tracking-widest text-emerald mb-3 flex items-center gap-1.5"><Sparkles className="size-3.5" /> Why you, specifically?</div>
          <p className="text-sm text-muted leading-relaxed mb-4">
            Write 2–3 sentences. Pretend an investor just asked. Not the polished version — the honest one.
          </p>
          <Textarea
            placeholder={picked.whyYou ? `Sage thinks: "${picked.whyYou}"\n\nNow tell us in your own words — what's actually true about you and this problem?` : "My mother sells tomatoes at Tamale Central. I watched her lose four crates last Tuesday. I know this market the way nobody else in my class does."}
            value={whyMe}
            onChange={(e) => setWhyMe(e.target.value)}
            rows={4}
          />
          <Button onClick={save} disabled={!whyMe.trim()} className="mt-4">
            Continue <ArrowRight className="size-4" />
          </Button>
        </Card>
      )}
    </div>
  );
}

function ModeTab({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-full border transition inline-flex items-center gap-1.5 ${active ? "border-emerald bg-emerald/10 text-emerald" : "border-border text-muted hover:text-foreground"}`}
    >
      <Icon className="size-2.5" /> {children}
    </button>
  );
}

/* ---------------- STAGE: PERSONA ---------------- */
function Persona({ onNext }: { onNext: () => void }) {
  const { shipSession, updateShipSession } = useMe();
  const [name, setName] = useState(shipSession?.persona?.name ?? "");
  const [role, setRole] = useState(shipSession?.persona?.role ?? "");
  const [location, setLocation] = useState(shipSession?.persona?.location ?? "");
  const [pain, setPain] = useState(shipSession?.persona?.pain ?? "");

  function save() {
    if (!name.trim() || !pain.trim()) return;
    updateShipSession({ persona: { name, role, location, pain } });
    onNext();
  }

  const SEEDS = [
    { name: "Mama Adwoa", role: "Tomato seller", location: "Tamale Central Market, Ghana", pain: "Loses 4 crates of tomatoes to spoilage every Tuesday, sells the rest at fire-sale prices" },
    { name: "Kofi Asante", role: "Cooperative chairman", location: "Yendi, Northern Ghana", pain: "His 28-farmer co-op pays GHS 1,200/mo from collective income to losses they can't prevent" },
    { name: "Adaeze Nwosu", role: "Community health worker", location: "Edo State, Nigeria", pain: "Diagnoses 30+ patients a day with no diagnostic tools beyond questions and a thermometer" },
  ];

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12">
      <StageHeader stage={2} title="Find your person" subtitle="Not a segment. Not a demographic. One human you can picture. They become the audience for everything we build today." />

      <Card className="mt-8 p-6">
        <div className="space-y-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Their name</div>
            <Input placeholder="Mama Adwoa" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Their role / how they spend their day</div>
            <Input placeholder="Tomato seller" value={role} onChange={(e) => setRole(e.target.value)} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Where they are</div>
            <Input placeholder="Tamale Central Market, Northern Ghana" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Their specific pain (write it like they would)</div>
            <Textarea placeholder="I cried on Tuesday. Four crates rotted in my stall and I sold the rest at half price to break even." value={pain} onChange={(e) => setPain(e.target.value)} rows={4} />
          </div>
          <Button onClick={save} disabled={!name.trim() || !pain.trim()} className="w-full">
            Continue with {name || "your person"} <ArrowRight className="size-4" />
          </Button>
        </div>
      </Card>

      <div className="mt-6 text-xs text-muted mb-3">Or borrow a seed persona (you can edit):</div>
      <div className="grid sm:grid-cols-3 gap-3">
        {SEEDS.map((s) => (
          <button key={s.name} onClick={() => { setName(s.name); setRole(s.role); setLocation(s.location); setPain(s.pain); }} className="text-left glass rounded-xl p-4 hover:border-emerald/40 transition">
            <div className="font-medium text-sm">{s.name}</div>
            <div className="text-xs text-muted mt-1">{s.role} · {s.location.split(",")[0]}</div>
            <div className="text-xs text-muted mt-2 line-clamp-2 italic">"{s.pain.slice(0, 80)}…"</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- STAGE: INTERVIEW (Sage role-plays) ---------------- */
function Interview({ onNext }: { onNext: () => void }) {
  const { shipSession } = useMe();
  const { user } = useStore();
  const persona = shipSession?.persona;
  const wedge = shipSession?.wedge;
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: 1e6, behavior: "smooth" }); }, [messages]);

  async function send(text: string) {
    if (!text.trim() || busy || !persona) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setBusy(true);
    setInput("");
    try {
      const res = await fetch("/api/coach/sage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m, i) => ({
            role: m.role,
            content: i === 0 ? `You are role-playing ${persona.name}, ${persona.role} in ${persona.location}. Their specific pain: ${persona.pain}. I'm a student practicing customer-discovery questions about: ${wedge?.problemTitle}. Stay in character. Be warm but reluctant — most real customers don't open up immediately. Answer in 1-3 sentences. If I ask a leading or hypothetical question, gently push back the way a real person would ("I don't know, I haven't tried that"). After 8 of my questions, break character briefly and offer me one specific suggestion to improve my interviewing.

My first message: ${m.content}` : m.content,
          })),
          context: { mode: "role-play", persona: persona.name },
        }),
      });
      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      let acc = "";
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          setMessages((m) => { const c = m.slice(); c[c.length - 1] = { role: "assistant", content: acc }; return c; });
        }
      }
    } finally {
      setBusy(false);
    }
  }

  if (!persona) return <div className="p-8 text-muted">Go back and pick a persona first.</div>;

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12">
      <StageHeader stage={3} title={`Practice with ${persona.name}`} subtitle="Sage will role-play this person. You ask discovery questions — no pitching, no leading. Get 8 questions in. Listen for the gold." />

      {!started ? (
        <Card className="mt-8 p-8 text-center">
          <Mic className="size-10 text-emerald mx-auto mb-4" />
          <h3 className="font-[family-name:var(--font-display)] text-2xl font-semibold">Ready to practice?</h3>
          <p className="mt-3 text-muted max-w-md mx-auto">{persona.name} is sitting across from you. You have ten minutes. Open with whatever feels right — but remember: their time is valuable, and they don't know you yet.</p>
          <Button onClick={() => { setStarted(true); }} className="mt-6" size="lg">
            <Sparkles className="size-4" /> Start interview
          </Button>
        </Card>
      ) : (
        <Card className="mt-8 overflow-hidden flex flex-col h-[60vh]">
          <div className="px-5 py-3 border-b border-border bg-surface-2/40 flex items-center gap-3 shrink-0">
            <div className="size-9 rounded-xl bg-gradient-to-br from-amber to-rust flex items-center justify-center text-black font-bold">
              {persona.name[0]}
            </div>
            <div>
              <div className="text-sm font-medium">{persona.name}</div>
              <div className="text-[10px] text-muted">{persona.role} · {persona.location}</div>
            </div>
            <div className="ml-auto text-xs text-muted">{messages.filter((m) => m.role === "user").length} questions in</div>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
            {messages.length === 0 && (
              <div className="text-sm text-muted italic">{persona.name} waits. Type your first question below.</div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={m.role === "user" ? "max-w-[80%] bg-emerald/15 border border-emerald/30 rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm" : "max-w-[80%] bg-surface-2 border border-border rounded-2xl rounded-tl-sm px-4 py-2.5"}>
                  {m.role === "user" ? <span>{m.content}</span> : <Markdown src={m.content} />}
                </div>
              </div>
            ))}
            {busy && (
              <div className="text-xs text-muted italic">{persona.name} is thinking…</div>
            )}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="border-t border-border p-3 flex gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask your question…" className="flex-1 bg-surface-2 border border-border rounded-xl px-4 py-2.5 outline-none focus:border-emerald text-sm" />
            <Button type="submit" disabled={busy || !input.trim()}><Send className="size-4" /></Button>
          </form>
        </Card>
      )}

      <div className="mt-6 flex items-center justify-between">
        <div className="text-xs text-muted">{messages.filter((m) => m.role === "user").length >= 5 ? "✓ Good — you've gotten past the polite layer" : "Aim for 8+ questions before moving on"}</div>
        <Button variant="secondary" onClick={onNext}>{messages.filter((m) => m.role === "user").length >= 5 ? "Continue" : "Skip"} <ArrowRight className="size-4" /></Button>
      </div>
    </div>
  );
}

/* ---------------- STAGE: SLICE ---------------- */
function Slice({ onNext }: { onNext: () => void }) {
  const { shipSession, updateShipSession } = useMe();
  const [text, setText] = useState(shipSession?.sliceText ?? "");
  const [vname, setVname] = useState(shipSession?.ventureName ?? "");

  const PROMPTS = [
    "Cut tomato spoilage from 35% to under 10% — for one cooperative — in 30 days, paid per crate saved.",
    "Generate a Twi-language discovery script + record 5 voice-note interviews for one CHW unit in 7 days.",
    "Build a WhatsApp catalog + checkout flow for one tailor's stall, processing 3 orders by Friday.",
  ];

  function save() {
    if (!text.trim() || !vname.trim()) return;
    updateShipSession({ sliceText: text, ventureName: vname });
    onNext();
  }

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12">
      <StageHeader stage={4} title="Slice it small" subtitle="The slice you can validate this week. One person. One outcome. A number. A deadline. If you can't fit it in 30 words, it's still too big." />

      <Card className="mt-8 p-6">
        <div className="space-y-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Working name for this slice</div>
            <Input placeholder="KubaCold Pilot" value={vname} onChange={(e) => setVname(e.target.value)} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-muted mb-1.5">The slice — exactly what you'll deliver</div>
            <Textarea placeholder="Cut tomato spoilage from 35% to under 10% — for one Yendi cooperative — in 30 days, paid only per crate saved." value={text} onChange={(e) => setText(e.target.value)} rows={4} />
            <div className="text-xs text-muted mt-1.5">{text.split(/\s+/).filter(Boolean).length} words {text.split(/\s+/).filter(Boolean).length > 30 && <span className="text-rust">· too long — try cutting</span>}</div>
          </div>
          <Button onClick={save} disabled={!text.trim() || !vname.trim()} className="w-full">
            Lock in this slice <ArrowRight className="size-4" />
          </Button>
        </div>
      </Card>

      <div className="mt-5 text-xs text-muted mb-2">Example slices that meet the bar:</div>
      <div className="grid gap-2">
        {PROMPTS.map((p) => (
          <button key={p} onClick={() => setText(p)} className="text-left glass rounded-xl px-4 py-3 text-sm hover:border-emerald/40 transition">
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- STAGE: BUILD (artifacts) ---------------- */
const ARTIFACT_PLAN: { kind: "problem-brief" | "interview-script" | "outreach-script" | "loi" | "pricing-page" | "pitch-summary" | "landing-copy"; title: string; desc: string }[] = [
  { kind: "problem-brief", title: "Problem Brief", desc: "1-page founder-grade summary" },
  { kind: "interview-script", title: "Discovery Script", desc: "12 questions ready to use" },
  { kind: "outreach-script", title: "Outreach Scripts", desc: "WhatsApp + Email + Voice" },
  { kind: "loi", title: "Letter of Intent", desc: "30-day no-cost pilot offer" },
  { kind: "pricing-page", title: "Pricing Page", desc: "3 tiers + FAQ + CTA" },
  { kind: "pitch-summary", title: "60-Second Pitch", desc: "What you'll say at the meetup" },
  { kind: "landing-copy", title: "Landing Page Copy", desc: "Hero + sections + CTA" },
];

function Build({ onNext }: { onNext: () => void }) {
  const { user } = useStore();
  const { shipSession, updateShipSession, genome, shipArtifact } = useMe();
  const [generatingKind, setGeneratingKind] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const [savedIds, setSavedIds] = useState<Record<string, string>>({});

  if (!shipSession || !shipSession.persona || !shipSession.sliceText || !shipSession.wedge || !shipSession.ventureName) {
    return <div className="p-8 text-muted">Complete earlier stages first.</div>;
  }
  const session = shipSession;
  const sessionPersona = session.persona!;
  const sessionWedge = session.wedge!;
  const sessionVentureName = session.ventureName!;
  const sessionSliceText = session.sliceText!;

  const ctx = {
    ventureName: sessionVentureName,
    problem: sessionWedge.problemTitle,
    persona: sessionPersona,
    sliceText: sessionSliceText,
    whyMe: sessionWedge.whyMe,
    genomeVoice: genomeVoiceInstruction(genome),
    userName: user?.name ?? "Founder",
    userField: user?.field ?? "",
  };

  async function generate(kind: typeof ARTIFACT_PLAN[number]["kind"]) {
    setGeneratingKind(kind);
    setOutputs((o) => ({ ...o, [kind]: "" }));
    try {
      const res = await fetch("/api/ship/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ...ctx }),
      });
      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      let acc = "";
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          setOutputs((o) => ({ ...o, [kind]: acc }));
        }
      }
      const def = ARTIFACT_PLAN.find((a) => a.kind === kind)!;
      const id = shipArtifact({ kind, title: `${def.title} — ${sessionVentureName}`, body: acc, ventureName: sessionVentureName });
      setSavedIds((s) => ({ ...s, [kind]: id }));
      updateShipSession({ artifactsCreated: [...(session.artifactsCreated ?? []), id] });
    } finally {
      setGeneratingKind(null);
    }
  }

  const createdCount = Object.keys(outputs).filter((k) => outputs[k]?.length > 100).length;

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-12">
      <StageHeader stage={5} title="Build the artifacts" subtitle="Each is a real, shippable deliverable. Press generate. Sage drafts in your voice. You edit. We save it to your shipped library." />

      <Card className="mt-6 p-4 bg-emerald/5 border-emerald/30 flex items-center gap-3 flex-wrap">
        <Sparkles className="size-5 text-emerald" />
        <div className="text-sm">
          Building for: <span className="text-foreground font-medium">{sessionPersona.name}</span> · {sessionPersona.location} · slice: <span className="text-foreground">{sessionSliceText.slice(0, 80)}…</span>
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-8">
        {ARTIFACT_PLAN.map((a) => {
          const has = !!outputs[a.kind];
          const isGen = generatingKind === a.kind;
          return (
            <Card key={a.kind} className={`p-5 ${has ? "border-emerald/40" : ""} flex flex-col`}>
              <div className="flex items-start justify-between mb-2">
                {has ? <CheckCircle2 className="size-5 text-emerald" /> : <CircleDot className="size-5 text-muted" />}
                {has && <Badge color="emerald">Drafted</Badge>}
              </div>
              <h3 className="font-medium">{a.title}</h3>
              <p className="text-xs text-muted mt-1 flex-1">{a.desc}</p>
              <Button onClick={() => generate(a.kind)} disabled={isGen} variant={has ? "secondary" : "primary"} size="sm" className="mt-4 w-full">
                {isGen ? <><RefreshCcw className="size-3.5 animate-spin" /> Generating…</> : has ? "Regenerate" : "Generate"}
              </Button>
            </Card>
          );
        })}
      </div>

      {Object.entries(outputs).map(([kind, body]) => body && (
        <ArtifactPreview key={kind} kind={kind} title={ARTIFACT_PLAN.find((a) => a.kind === kind)?.title ?? kind} body={body} />
      ))}

      <div className="mt-10 flex items-center justify-between">
        <div className="text-sm text-muted">{createdCount} of {ARTIFACT_PLAN.length} artifacts drafted</div>
        <Button onClick={onNext} disabled={createdCount === 0} size="lg">
          {createdCount >= 2 ? "Continue — let's ship" : "Continue anyway"} <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function ArtifactPreview({ kind, title, body }: { kind: string; title: string; body: string }) {
  const [copied, setCopied] = useState(false);
  function copy() { navigator.clipboard.writeText(body); setCopied(true); setTimeout(() => setCopied(false), 1500); }
  function download() {
    const blob = new Blob([body], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${kind}-${Date.now()}.md`; a.click(); URL.revokeObjectURL(a.href);
  }
  return (
    <Card className="mt-6 overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-surface-2/40 flex items-center justify-between">
        <div className="font-medium flex items-center gap-2"><Sparkles className="size-4 text-emerald" /> {title}</div>
        <div className="flex gap-1.5">
          <button onClick={copy} className="text-xs px-3 py-1 rounded-full border border-border hover:bg-surface flex items-center gap-1 transition">
            {copied ? <><Check className="size-3 text-emerald" /> Copied</> : <><Copy className="size-3" /> Copy</>}
          </button>
          <button onClick={download} className="text-xs px-3 py-1 rounded-full border border-border hover:bg-surface flex items-center gap-1 transition">
            <Download className="size-3" /> Download
          </button>
        </div>
      </div>
      <div className="p-6 max-h-96 overflow-y-auto">
        <Markdown src={body} />
      </div>
    </Card>
  );
}

/* ---------------- STAGE: SHIP ---------------- */
function Ship({ onNext }: { onNext: () => void }) {
  const { shipSession, artifacts } = useMe();
  const [committed, setCommitted] = useState<string[]>([]);

  const myArtifacts = useMemo(() => artifacts.filter((a) => shipSession?.artifactsCreated?.includes(a.id) || a.ventureName === shipSession?.ventureName), [artifacts, shipSession]);
  const outreach = myArtifacts.find((a) => a.kind === "outreach-script");
  const loi = myArtifacts.find((a) => a.kind === "loi");

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12">
      <StageHeader stage={6} title="Ship it" subtitle="You've drafted everything. Now do the thing that 95% of founders never do: actually send something to a real person today." />

      <Card className="mt-8 p-6">
        <h3 className="font-medium mb-4">Three things to ship this week — check what you commit to:</h3>
        <div className="space-y-3">
          {[
            { id: "wa", label: `Send your WhatsApp outreach script to 5 people who fit ${shipSession?.persona?.name ?? "your persona"}`, disabled: !outreach },
            { id: "loi", label: `Email or print the LOI and send it to ${shipSession?.persona?.name ?? "your first customer"}`, disabled: !loi },
            { id: "voice", label: `Record yourself reading the 60-second pitch out loud — share with one Sankofa peer`, disabled: false },
          ].map((task) => (
            <label key={task.id} className={`flex items-start gap-3 p-3 rounded-xl border transition ${committed.includes(task.id) ? "border-emerald bg-emerald/10" : "border-border hover:border-muted"} ${task.disabled ? "opacity-50" : "cursor-pointer"}`}>
              <input type="checkbox" disabled={task.disabled} checked={committed.includes(task.id)} onChange={(e) => setCommitted(e.target.checked ? [...committed, task.id] : committed.filter((c) => c !== task.id))} className="mt-1 accent-emerald" />
              <span className="text-sm flex-1">{task.label}</span>
              {task.disabled && <Badge color="muted">draft first</Badge>}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted mt-5 italic">
          The point of Ship Hour is not perfection — it's contact. Imperfect outreach that goes out beats perfect outreach that sits in your drafts. We mean this.
        </p>
        <Button onClick={onNext} disabled={committed.length === 0} className="w-full mt-5" size="lg">
          {committed.length === 3 ? "I'm committing to all three" : `I'm committing to ${committed.length} ${committed.length === 1 ? "thing" : "things"} this week`} <ArrowRight className="size-4" />
        </Button>
      </Card>
    </div>
  );
}

/* ---------------- STAGE: REFLECT ---------------- */
function Reflect({ onNext }: { onNext: () => void }) {
  const { shipSession, remember, setGoal } = useMe();
  const [learning, setLearning] = useState("");
  const [proudest, setProudest] = useState("");

  function save() {
    if (learning.trim()) remember({ fact: `Ship Hour learning: ${learning}`, kind: "context", source: "explicit", importance: 4 });
    if (proudest.trim()) remember({ fact: `Ship Hour proud moment: ${proudest}`, kind: "achievement", source: "explicit", importance: 5 });
    setGoal({ text: `Get 1 real reply on the ${shipSession?.ventureName ?? "venture"} outreach within 14 days`, category: "venture", deadline: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10) });
    onNext();
  }

  return (
    <div className="max-w-2xl mx-auto px-5 sm:px-8 py-12">
      <StageHeader stage={7} title="Reflect" subtitle="Two minutes. The reflection is what makes the hour stick." />
      <Card className="mt-8 p-6 space-y-5">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted mb-1.5">What surprised you in this hour?</div>
          <Textarea value={learning} onChange={(e) => setLearning(e.target.value)} rows={3} placeholder="e.g. The interview persona resisted my leading questions. I realized I was pitching, not listening." />
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-muted mb-1.5">What artifact are you proudest of?</div>
          <Textarea value={proudest} onChange={(e) => setProudest(e.target.value)} rows={3} placeholder="e.g. The LOI — I never imagined I could write a real letter to a cooperative chairman in 60 minutes." />
        </div>
        <Button onClick={save} className="w-full" size="lg">
          <Trophy className="size-4" /> Complete Ship Hour
        </Button>
      </Card>
    </div>
  );
}

/* ---------------- STAGE: DONE ---------------- */
function Done({ onRestart }: { onRestart: () => void }) {
  const { shipSession, artifacts } = useMe();
  const router = useRouter();
  const made = artifacts.filter((a) => shipSession?.artifactsCreated?.includes(a.id));

  return (
    <div className="min-h-full flex items-center justify-center px-5 py-16 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -right-32 size-96 rounded-full bg-emerald opacity-15 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 size-96 rounded-full bg-amber opacity-15 blur-3xl" />
      </div>
      <div className="relative max-w-2xl text-center">
        <div className="size-24 mx-auto rounded-full bg-emerald/15 flex items-center justify-center mb-6 float">
          <Trophy className="size-12 text-emerald" />
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-5xl sm:text-6xl font-semibold leading-[1.05]">
          You shipped <span className="text-emerald italic">{made.length}</span> real artifact{made.length === 1 ? "" : "s"}.
        </h1>
        <p className="mt-5 text-lg text-muted leading-relaxed">
          You have everything you need to message your first customer this week. The artifacts are saved in your library — copy, edit, send.
        </p>
        <div className="mt-8 grid sm:grid-cols-2 gap-2 max-w-md mx-auto text-left">
          {made.map((a) => (
            <div key={a.id} className="glass rounded-xl p-3 text-sm">
              <div className="font-medium truncate">{a.title.split(" — ")[0]}</div>
              <div className="text-xs text-muted truncate">{a.kind}</div>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={() => router.push("/studio/ship/library")} size="lg">
            <Rocket className="size-4" /> Open my shipped library
          </Button>
          <Button variant="secondary" onClick={onRestart}>
            <RefreshCcw className="size-4" /> Ship Hour again (different problem)
          </Button>
        </div>
      </div>
    </div>
  );
}

function StageHeader({ stage, title, subtitle }: { stage: number; title: string; subtitle: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.22em] text-amber mb-2 flex items-center gap-2">
        <span className="font-mono">Stage {stage}</span>
      </div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold leading-tight">{title}</h1>
      <p className="mt-3 text-muted max-w-2xl leading-relaxed">{subtitle}</p>
    </div>
  );
}
