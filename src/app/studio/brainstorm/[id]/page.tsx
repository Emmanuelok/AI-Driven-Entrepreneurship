"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { notFound } from "next/navigation";
import { useSketch } from "@/store/sketch";
import { useBuild } from "@/store/build";
import { useStore } from "@/store";
import { getBuildTemplate } from "@/lib/build-templates";
import { SketchCanvas } from "@/components/sketch-canvas";
import { Dialog, Button, Badge } from "@/components/ui";
import { ArrowLeft, Rocket, Hammer, Sparkles, ArrowRight, Check } from "lucide-react";

type AiSpec = { templateId: string; projectName: string; description: string; openingPrompt: string };
type VentureSpec = {
  name: string; tagline: string; region: string;
  canvas: Record<string, string>;
  jtbd: { when: string; iWantTo: string; soICan: string; today: string };
  wedge: { who: string; pain: string; alternative: string; insight: string };
};

export default function BrainstormCanvasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const board = useSketch((s) => s.boards.find((b) => b.id === id));
  const { createProject } = useBuild();
  const { createVenture, updateVenture, user } = useStore();

  const [shipOpen, setShipOpen] = useState(false);
  const [destination, setDestination] = useState<"ai" | "venture" | null>(null);
  const [distilling, setDistilling] = useState(false);
  const [aiSpec, setAiSpec] = useState<AiSpec | null>(null);
  const [ventureSpec, setVentureSpec] = useState<VentureSpec | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!board) { notFound(); return null; }

  function extractNotes(): string[] {
    // Pull text from stickies, text elements, frame labels — drop pen/shape noise.
    const out: string[] = [];
    for (const el of board!.elements) {
      if (el.kind === "sticky" && el.text?.trim()) out.push(el.text.trim());
      else if (el.kind === "text" && el.text?.trim()) out.push(el.text.trim());
      else if (el.kind === "frame" && el.label?.trim()) out.push(`[Frame] ${el.label.trim()}`);
    }
    // Dedupe + cap
    return Array.from(new Set(out)).slice(0, 60);
  }

  async function distill(dest: "ai" | "venture") {
    setDestination(dest);
    setDistilling(true);
    setError(null);
    setAiSpec(null);
    setVentureSpec(null);
    try {
      const res = await fetch("/api/brainstorm/distill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: dest,
          boardTitle: board!.title,
          boardPrompt: board!.prompt,
          notes: extractNotes(),
          region: user?.country,
        }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      if (dest === "ai") setAiSpec(data as AiSpec);
      else setVentureSpec(data as VentureSpec);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDistilling(false);
    }
  }

  function shipToAI() {
    if (!aiSpec) return;
    const tpl = getBuildTemplate(aiSpec.templateId) || getBuildTemplate("blank-canvas")!;
    const pid = createProject(aiSpec.projectName || tpl.name, aiSpec.description || board!.prompt, tpl.id, tpl.starterCode);
    // Pre-load opening user message so Sage starts shaping immediately on open
    try {
      const KEY = `sankofa-build-opening-${pid}`;
      sessionStorage.setItem(KEY, aiSpec.openingPrompt);
    } catch { /* noop */ }
    router.push(`/studio/build/${pid}`);
  }

  function shipToVenture() {
    if (!ventureSpec) return;
    const vid = createVenture({
      name: ventureSpec.name || board!.title,
      tagline: ventureSpec.tagline || board!.prompt,
      region: ventureSpec.region || "",
      phase: "ideate",
      metrics: { interviewsTarget: 20, revenue: 0, customers: 0, mrr: 0 },
      mvpTasks: [],
      team: [],
      interviews: [],
      canvas: ventureSpec.canvas,
      achievements: [],
      fundingRaised: 0,
      fundingTarget: 50000,
    });
    // Layer JTBD + wedge in a follow-up update so all fields land
    updateVenture(vid, { jtbd: ventureSpec.jtbd, wedge: ventureSpec.wedge });
    router.push(`/studio/venture/${vid}`);
  }

  function close() {
    setShipOpen(false);
    setDestination(null);
    setAiSpec(null);
    setVentureSpec(null);
    setError(null);
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      <header className="border-b border-border px-5 sm:px-8 py-3 flex items-center gap-4 shrink-0">
        <Link href="/studio/brainstorm" className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5 shrink-0">
          <ArrowLeft className="size-3.5" /> Canvases
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold truncate">{board.title}</h1>
          <p className="text-xs text-muted truncate">{board.prompt}</p>
        </div>
        <button
          onClick={() => setShipOpen(true)}
          className="shrink-0 bg-emerald text-black font-medium px-4 py-2 rounded-full text-sm hover:bg-amber transition flex items-center gap-1.5"
        >
          <Rocket className="size-3.5" /> Ship this idea
        </button>
      </header>
      <div className="flex-1 relative overflow-hidden">
        <SketchCanvas boardId={id} />
      </div>

      {/* Ship dialog */}
      <Dialog open={shipOpen} onClose={close} title={destination ? "Review the draft" : "Ship this canvas"} size="lg">
        {!destination && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Akili will read your board (stickies, text, frame labels) and turn it into a
              starter you can keep editing in either studio. The board stays here — this just
              spawns a new project pre-filled with the idea.
            </p>
            <div className="grid sm:grid-cols-2 gap-3 mt-4">
              <button
                onClick={() => distill("ai")}
                className="text-left rounded-2xl border border-border hover:border-emerald/40 hover:bg-emerald/5 p-5 transition group"
              >
                <Hammer className="size-6 text-emerald mb-3" />
                <div className="font-medium mb-1">→ AI Build Studio</div>
                <p className="text-xs text-muted leading-relaxed">
                  Become a working AI product. Akili picks the best starter template,
                  names it, and writes the opening prompt for Sage. You&apos;re building in seconds.
                </p>
                <div className="mt-3 text-xs text-emerald flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                  Build it <ArrowRight className="size-3" />
                </div>
              </button>
              <button
                onClick={() => distill("venture")}
                className="text-left rounded-2xl border border-border hover:border-amber/40 hover:bg-amber/5 p-5 transition group"
              >
                <Rocket className="size-6 text-amber mb-3" />
                <div className="font-medium mb-1">→ Venture Studio</div>
                <p className="text-xs text-muted leading-relaxed">
                  Become a full venture. Akili distills a starting Lean Canvas, JTBD frame,
                  and wedge from your board. You land on the cockpit ready to talk to customers.
                </p>
                <div className="mt-3 text-xs text-amber flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                  Found it <ArrowRight className="size-3" />
                </div>
              </button>
            </div>
            <div className="text-xs text-muted pt-2 border-t border-border flex items-center gap-2">
              <Sparkles className="size-3" />
              {extractNotes().length} notes will be sent to Akili for distillation.
            </div>
          </div>
        )}

        {destination && distilling && (
          <div className="py-10 text-center">
            <Sparkles className="size-8 text-amber mx-auto mb-3 animate-pulse" />
            <p className="text-sm text-muted">
              Akili is reading your canvas and shaping a starter
              {destination === "ai" ? " AI product" : " venture"}…
            </p>
          </div>
        )}

        {error && <div className="mt-3 text-sm text-rust">{error}</div>}

        {destination === "ai" && aiSpec && !distilling && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-emerald/30 bg-emerald/5 p-4">
              <Badge color="emerald" className="mb-2">Template: {aiSpec.templateId}</Badge>
              <div className="font-[family-name:var(--font-display)] text-xl font-semibold">{aiSpec.projectName}</div>
              <p className="text-sm text-muted mt-1">{aiSpec.description}</p>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-amber mb-1.5">Opening message to Sage</div>
              <div className="rounded-xl border border-border bg-surface-2/40 p-3 text-sm leading-relaxed whitespace-pre-wrap">
                {aiSpec.openingPrompt}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDestination(null)}>Pick a different destination</Button>
              <Button onClick={shipToAI}><Check className="size-4" /> Open in Build Studio</Button>
            </div>
          </div>
        )}

        {destination === "venture" && ventureSpec && !distilling && (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="rounded-2xl border border-amber/30 bg-amber/5 p-4">
              <div className="font-[family-name:var(--font-display)] text-2xl font-semibold">{ventureSpec.name}</div>
              <p className="text-sm text-muted mt-1">{ventureSpec.tagline}</p>
              {ventureSpec.region && <div className="mt-1 text-xs text-muted">📍 {ventureSpec.region}</div>}
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-widest text-emerald mb-1.5">JTBD</div>
              <p className="text-sm text-muted">
                <strong className="text-foreground">When</strong> {ventureSpec.jtbd.when || "—"} <strong className="text-foreground">I want to</strong> {ventureSpec.jtbd.iWantTo || "—"} <strong className="text-foreground">so I can</strong> {ventureSpec.jtbd.soICan || "—"}. <strong className="text-foreground">Today they</strong> {ventureSpec.jtbd.today || "—"}.
              </p>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-widest text-amber mb-1.5">Wedge</div>
              <p className="text-sm text-muted">
                <strong className="text-foreground">Who:</strong> {ventureSpec.wedge.who || "—"} · <strong className="text-foreground">Pain:</strong> {ventureSpec.wedge.pain || "—"} · <strong className="text-foreground">Today they use:</strong> {ventureSpec.wedge.alternative || "—"} · <strong className="text-foreground">Insight:</strong> {ventureSpec.wedge.insight || "—"}
              </p>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-widest text-emerald mb-1.5">Lean canvas seed</div>
              <div className="grid sm:grid-cols-2 gap-2">
                {Object.entries(ventureSpec.canvas).map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-border p-3 text-xs">
                    <div className="text-emerald uppercase tracking-widest text-[10px] mb-1">{k}</div>
                    <div className="text-foreground/90 whitespace-pre-wrap leading-relaxed">{v}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-surface">
              <Button variant="ghost" onClick={() => setDestination(null)}>Pick a different destination</Button>
              <Button onClick={shipToVenture}><Check className="size-4" /> Open in Venture Studio</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
