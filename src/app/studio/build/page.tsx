"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useBuild } from "@/store/build";
import { useStore } from "@/store";
import { BUILD_TEMPLATES, templatesForDiscipline, getBuildTemplate, BuildTemplate } from "@/lib/build-templates";
import { Card, Button, Input, Badge, Dialog, EmptyState } from "@/components/ui";
import { SimilarButton } from "@/components/similar-button";
import { Zap, Plus, Sparkles, ArrowRight, Code, Cpu, Eye, Brain, Wrench, Hammer, FileText, Trash2, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const KIND_LABEL: Record<string, { label: string; icon: typeof Code; color: string }> = {
  "soft-ai": { label: "Soft AI", icon: Brain, color: "emerald" },
  "hard-ai": { label: "Hard AI", icon: Cpu, color: "rust" },
  "agentic": { label: "Agentic", icon: Sparkles, color: "amber" },
  "data": { label: "Data tool", icon: FileText, color: "indigo" },
  "voice": { label: "Voice", icon: Eye, color: "amber" },
  "vision": { label: "Vision", icon: Eye, color: "indigo" },
  "tool": { label: "Tool", icon: Wrench, color: "muted" },
};

export default function BuildHomePage() {
  const { projects, createProject, deleteProject } = useBuild();
  const { user } = useStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const acceptToken = searchParams.get("accept");
  const [picking, setPicking] = useState(false);
  const [selectedTpl, setSelectedTpl] = useState<BuildTemplate | null>(null);
  const [name, setName] = useState("");
  const [acceptMessage, setAcceptMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Redeem a build-collab invite token (?accept=…) — adds the signed-in
  // user as a collaborator on the build, then routes them straight in.
  useEffect(() => {
    if (!acceptToken) return;
    (async () => {
      try {
        const { supabaseBrowser } = await import("@/lib/supabase");
        const sb = supabaseBrowser();
        if (!sb) { setAcceptMessage({ kind: "error", text: "Cloud sync isn't configured here." }); return; }
        const { data: { session } } = await sb.auth.getSession();
        if (!session) { setAcceptMessage({ kind: "error", text: "Sign in first, then click the invite link again." }); return; }
        const res = await fetch("/api/v2/builds/accept-invite", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ token: acceptToken }),
        });
        const data = await res.json();
        if (!data.ok) {
          setAcceptMessage({ kind: "error", text: data.error === "expired" ? "This invite has expired." : "Couldn't redeem the invite." });
          return;
        }
        setAcceptMessage({ kind: "success", text: "You're in. Opening the build…" });
        setTimeout(() => router.replace(`/studio/build/${data.buildId}`), 600);
      } catch (e) {
        setAcceptMessage({ kind: "error", text: (e as Error).message });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptToken]);

  const tplOrder = templatesForDiscipline(user?.field);

  function begin(tpl: BuildTemplate, projectName: string) {
    const id = createProject(projectName || tpl.name, tpl.tagline, tpl.id, tpl.starterCode);
    router.push(`/studio/build/${id}`);
  }

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      {acceptMessage && (
        <div className={`mb-6 rounded-2xl p-4 text-sm ${acceptMessage.kind === "error" ? "border border-rust/30 bg-rust/5 text-rust" : "border border-emerald/30 bg-emerald/5 text-emerald"}`} role="status">
          {acceptMessage.text}
        </div>
      )}
      <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-emerald mb-2 flex items-center gap-1.5">
            <Hammer className="size-3.5" /> AI Build Studio
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl font-semibold leading-tight max-w-3xl">
            Build real AI products — by prompting, by coding, or both.
          </h1>
          <p className="mt-3 text-muted max-w-2xl leading-relaxed">
            Soft AI like chatbots and triage tools. Hard AI like robotic controllers. Anything in between.
            Describe what you want; the studio writes it. Edit the code if you want; the preview updates live.
            Ship it to a real URL when you&apos;re ready.
          </p>
        </div>
        <Button onClick={() => setPicking(true)} size="lg"><Plus className="size-4" /> New build</Button>
      </div>

      {/* Discipline hint */}
      {user?.field && (
        <Card className="p-4 mb-6 bg-gradient-to-br from-emerald/10 to-amber/10 border-emerald/30 flex items-center gap-3 flex-wrap">
          <Sparkles className="size-5 text-amber shrink-0" />
          <div className="text-sm">
            Tuned for <span className="font-medium text-foreground">{user.field}</span> — templates that match your discipline are highlighted first.
          </div>
        </Card>
      )}

      {/* Existing projects */}
      {projects.length > 0 && (
        <section className="mb-10">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold mb-4">Your builds</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map((p) => {
              const tpl = getBuildTemplate(p.templateId);
              const kindMeta = tpl ? KIND_LABEL[tpl.kind] : null;
              return (
                <Card key={p.id} className="p-5 hover:border-emerald/40 transition group relative">
                  <Link href={`/studio/build/${p.id}`} className="block">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-2xl">{tpl?.emoji ?? "✨"}</div>
                      {kindMeta && <Badge color={kindMeta.color as "emerald"}>{kindMeta.label}</Badge>}
                    </div>
                    <div className="font-medium leading-snug">{p.name}</div>
                    <p className="text-xs text-muted mt-1.5 line-clamp-2">{p.description}</p>
                    <div className="mt-4 flex items-center justify-between text-xs">
                      <span className="text-muted flex items-center gap-1"><Clock className="size-3" /> {formatDistanceToNow(p.updatedAt, { addSuffix: true })}</span>
                      <span className="text-emerald flex items-center gap-1 group-hover:gap-2 transition-all">Open <ArrowRight className="size-3" /></span>
                    </div>
                  </Link>
                  <div className="absolute top-3 right-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                    <SimilarButton seedTitle={p.name} seedBody={p.description || p.name} kind="build" excludeRefId={p.id} />
                    <button
                      onClick={() => { if (confirm(`Delete "${p.name}"?`)) deleteProject(p.id); }}
                      className="text-muted hover:text-rust size-7 flex items-center justify-center rounded"
                      aria-label={`Delete ${p.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Templates */}
      <section>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold mb-4">Start from a template</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tplOrder.map((t) => {
            const km = KIND_LABEL[t.kind];
            const matchesYou = t.disciplines.some((d) => user?.field?.toLowerCase().includes(d.toLowerCase().split(" ")[0]));
            return (
              <motion.button
                key={t.id}
                whileHover={{ y: -2 }}
                onClick={() => { setSelectedTpl(t); setName(t.name); }}
                className={`glass rounded-2xl p-5 text-left transition group relative overflow-hidden ${matchesYou ? "border-emerald/40 ring-1 ring-emerald/20" : "hover:border-emerald/30"}`}
              >
                {matchesYou && (
                  <div className="absolute top-3 right-3 text-[9px] uppercase tracking-widest text-emerald bg-emerald/15 px-2 py-0.5 rounded-full">
                    For you
                  </div>
                )}
                <div className="text-3xl mb-3">{t.emoji}</div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge color={km.color as "emerald"}>{km.label}</Badge>
                  <Badge color="muted">{t.level}</Badge>
                </div>
                <div className="font-medium">{t.name}</div>
                <p className="text-xs text-muted mt-1.5 line-clamp-2">{t.tagline}</p>
                {t.disciplines.length > 0 && (
                  <div className="mt-3 text-[10px] text-muted truncate">
                    {t.disciplines.slice(0, 2).join(" · ")}
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* Picker dialog */}
      <Dialog open={picking} onClose={() => setPicking(false)} title="New build" size="md">
        <p className="text-sm text-muted mb-4">Pick a template to start from. You can change anything.</p>
        <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto">
          {tplOrder.map((t) => (
            <button key={t.id} onClick={() => { setPicking(false); setSelectedTpl(t); setName(t.name); }} className="text-left p-3 rounded-xl border border-border hover:border-emerald/40 hover:bg-surface-2 transition">
              <div className="text-2xl mb-1">{t.emoji}</div>
              <div className="font-medium text-sm">{t.name}</div>
              <div className="text-xs text-muted line-clamp-2">{t.tagline}</div>
            </button>
          ))}
        </div>
      </Dialog>

      <Dialog open={selectedTpl !== null} onClose={() => setSelectedTpl(null)} title={selectedTpl ? `Start: ${selectedTpl.name}` : ""} size="md">
        {selectedTpl && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="text-4xl">{selectedTpl.emoji}</div>
              <div>
                <div className="font-medium">{selectedTpl.name}</div>
                <div className="text-xs text-muted">{selectedTpl.tagline}</div>
              </div>
            </div>
            <p className="text-sm text-muted leading-relaxed">{selectedTpl.longDescription}</p>
            <div>
              <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Project name</div>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={selectedTpl.name} />
            </div>
            <div className="text-xs">
              <div className="uppercase tracking-widest text-muted mb-2">Ideas you can extend with</div>
              <ul className="space-y-1 text-muted">
                {selectedTpl.extensionIdeas.map((idea) => <li key={idea}>· {idea}</li>)}
              </ul>
            </div>
            <Button onClick={() => begin(selectedTpl, name || selectedTpl.name)} className="w-full" size="lg">
              <Zap className="size-4" /> Open in Build Studio
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}
