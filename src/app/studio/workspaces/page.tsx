"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMyWorkspaces } from "@/lib/use-workspace";
import { workspaceApi, type WorkspaceKind, type WorkspaceAccent, type WorkspaceListing } from "@/lib/workspace-api";
import { Card, Button } from "@/components/ui";
import { Spotlight } from "@/components/spotlight";
import { McpInstallSnippets } from "@/components/mcp-install-snippets";
import { Plus, Users, ArrowRight, Sparkles, GraduationCap, FlaskConical, FileText, Lightbulb, Rocket, Loader2, Bot, ChevronDown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const KIND_OPTIONS: { id: WorkspaceKind; label: string; tagline: string; icon: typeof Sparkles; accent: WorkspaceAccent }[] = [
  { id: "study_group", label: "Study group", tagline: "Learn the same topic together", icon: GraduationCap, accent: "emerald" },
  { id: "project", label: "Project", tagline: "A team building one thing", icon: Rocket, accent: "indigo" },
  { id: "research", label: "Research", tagline: "Co-investigate a question", icon: FlaskConical, accent: "amber" },
  { id: "learning_session", label: "Learning session", tagline: "A timed jam — meet, learn, ship", icon: Lightbulb, accent: "amber" },
  { id: "paper", label: "Paper", tagline: "Manuscript draft → publication", icon: FileText, accent: "rust" },
  { id: "generic", label: "Generic workspace", tagline: "A blank space for anything", icon: Sparkles, accent: "emerald" },
];

const ACCENT_HEX: Record<WorkspaceAccent, string> = {
  emerald: "#2cc295",
  amber: "#f4a949",
  indigo: "#6c8cff",
  rust: "#d96444",
};

export default function WorkspacesHub() {
  const router = useRouter();
  const { loading, results, error, refresh } = useMyWorkspaces();
  const [creating, setCreating] = useState(false);

  const owned = useMemo(() => (results ?? []).filter((w) => w.role === "owner"), [results]);
  const joined = useMemo(() => (results ?? []).filter((w) => w.role !== "owner"), [results]);

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="rise flex items-end justify-between flex-wrap gap-4 mb-10">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
            <Users className="size-3.5" /> Workspaces
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl sm:text-[2.6rem] font-semibold leading-[1.05] text-balance">
            Build, learn, and ship — <span className="text-emerald italic">together</span>.
          </h1>
          <p className="mt-3 text-muted max-w-2xl leading-relaxed text-balance">
            Pick a topic, invite a friend, share the link. Whether it’s a study group across two continents
            or a research team at three universities, every workspace gets live presence, deadlines, and AI
            coaching out of the box.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} size="lg">
          <Plus className="size-4" /> New workspace
        </Button>
      </div>

      {error && (
        <Card className="p-4 mb-6 border-rust/30 bg-rust/5 text-sm text-rust">
          We couldn’t load your workspaces: {error}
        </Card>
      )}

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="glass rounded-2xl p-6 h-44 shimmer" />
          ))}
        </div>
      ) : (results?.length ?? 0) === 0 ? (
        <EmptyHub onCreate={() => setCreating(true)} />
      ) : (
        <>
          {owned.length > 0 && (
            <Section title="Workspaces you own">
              <Grid items={owned} />
            </Section>
          )}
          {joined.length > 0 && (
            <Section title="Workspaces you’ve joined">
              <Grid items={joined} />
            </Section>
          )}
        </>
      )}

      {!loading && <McpConnectCard />}

      {creating && (
        <CreateDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); refresh(); router.push(`/studio/workspaces/${id}`); }}
        />
      )}
    </div>
  );
}

// "Connect your AI agent" — surfaces the global Workspace MCP server so a
// user can drive their workspaces (read deadlines, post messages, create
// deadlines) from Claude Desktop / Cursor / any MCP client using their
// existing smcp_ token.
function McpConnectCard() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("/api/mcp/workspaces");
  useEffect(() => { setUrl(`${window.location.origin}/api/mcp/workspaces`); }, []);

  return (
    <section className="mt-12 rise rise-2">
      <Card className="p-5 sm:p-6">
        <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-3 text-left">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-indigo/10 border border-indigo/30 flex items-center justify-center shrink-0">
              <Bot className="size-4 text-indigo" />
            </div>
            <div>
              <h3 className="font-medium">Connect your AI agent</h3>
              <p className="text-xs text-muted">Drive these workspaces from Claude Desktop, Cursor, or any MCP client — list deadlines, post updates, create deadlines.</p>
            </div>
          </div>
          <ChevronDown className={`size-4 text-muted shrink-0 transition ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="mt-5 pt-5 border-t border-border">
            <p className="text-sm text-muted mb-3">
              This is a Model Context Protocol server exposing 8 tools over your workspaces. Mint a token in <Link href="/studio/settings" className="text-emerald hover:underline">Settings → MCP tokens</Link>, then drop this into your client:
            </p>
            <McpInstallSnippets serverName="sankofa-workspaces" url={url} />
          </div>
        )}
      </Card>
    </section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10 rise rise-1">
      <h2 className="text-[10px] uppercase tracking-[0.25em] text-muted mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Grid({ items }: { items: WorkspaceListing[] }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((w, i) => {
        const accent = ACCENT_HEX[w.accent] ?? ACCENT_HEX.emerald;
        const kind = KIND_OPTIONS.find((k) => k.id === w.kind) ?? KIND_OPTIONS[5];
        const Icon = kind.icon;
        return (
          <Spotlight key={w.id} style={{ "--accent": accent, animationDelay: `${60 + i * 60}ms` } as React.CSSProperties} className="rise">
            <Link
              href={`/studio/workspaces/${w.id}`}
              className="group glass lift rounded-2xl p-6 relative overflow-hidden block"
            >
              <div
                className="absolute -top-16 -right-16 size-48 rounded-full blur-3xl opacity-20 group-hover:opacity-40 transition"
                style={{ background: accent }}
              />
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="size-9 rounded-xl flex items-center justify-center" style={{ background: `${accent}1F`, border: `1px solid ${accent}55` }}>
                    <Icon className="size-4" style={{ color: accent }} />
                  </div>
                  <span className="text-[10px] uppercase tracking-widest text-muted">{kind.label}</span>
                </div>
                <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold leading-tight group-hover:text-emerald transition text-balance">{w.title}</h3>
                {w.description && (
                  <p className="mt-2 text-sm text-muted line-clamp-2 leading-relaxed">{w.description}</p>
                )}
                <div className="mt-4 flex items-center justify-between text-xs text-muted">
                  <span>Updated {formatDistanceToNow(new Date(w.updated_at))} ago</span>
                  <span className="text-emerald flex items-center gap-1">Open <ArrowRight className="size-3 group-hover:translate-x-0.5 transition" /></span>
                </div>
              </div>
            </Link>
          </Spotlight>
        );
      })}
    </div>
  );
}

function EmptyHub({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="text-center py-16 rise rise-1">
      <div className="size-16 rounded-3xl bg-gradient-to-br from-emerald to-amber mx-auto mb-5 flex items-center justify-center shadow-lg shadow-emerald/30">
        <Users className="size-7 text-black" />
      </div>
      <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">No workspaces yet.</h2>
      <p className="text-muted mt-2 max-w-md mx-auto">
        Start a study group with a friend, a project with your cohort, or a research workspace with collaborators across institutions.
      </p>
      <Button onClick={onCreate} size="lg" className="mt-6">
        <Plus className="size-4" /> Create your first workspace
      </Button>
    </div>
  );
}

function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [kind, setKind] = useState<WorkspaceKind>("study_group");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [accent, setAccent] = useState<WorkspaceAccent>("emerald");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selectedKind = KIND_OPTIONS.find((k) => k.id === kind)!;

  async function submit() {
    if (!title.trim()) { setErr("Give your workspace a title."); return; }
    setBusy(true); setErr(null);
    const r = await workspaceApi.create({ title: title.trim(), description: description.trim(), kind, accent });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onCreated(r.id);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-5 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="glass rounded-3xl max-w-lg w-full p-7 sm:p-9 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="absolute -top-20 -right-20 size-56 rounded-full blur-3xl opacity-25"
          style={{ background: ACCENT_HEX[accent] }}
        />
        <div className="relative">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold mb-1">Start a new workspace</h2>
          <p className="text-sm text-muted mb-6">{selectedKind.tagline}.</p>

          <label className="block text-[10px] uppercase tracking-widest text-muted mb-2">Workspace type</label>
          <div className="grid grid-cols-3 gap-2 mb-5">
            {KIND_OPTIONS.map((k) => {
              const Icon = k.icon;
              const active = k.id === kind;
              return (
                <button
                  key={k.id}
                  onClick={() => { setKind(k.id); setAccent(k.accent); }}
                  className={`p-3 rounded-xl border text-left transition group ${active ? "border-emerald/50 bg-emerald/5" : "border-border hover:border-emerald/30"}`}
                >
                  <Icon className={`size-4 mb-1.5 ${active ? "text-emerald" : "text-muted group-hover:text-foreground"}`} />
                  <div className="text-xs font-medium">{k.label}</div>
                </button>
              );
            })}
          </div>

          <label className="block text-[10px] uppercase tracking-widest text-muted mb-2">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={selectedKind.label === "Study group" ? "e.g. Linear Algebra weekly jam" : "What are you building?"}
            className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald mb-4"
            autoFocus
          />

          <label className="block text-[10px] uppercase tracking-widest text-muted mb-2">What’s it about? (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="One or two sentences your members will see."
            rows={3}
            className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald mb-5 resize-none"
          />

          <label className="block text-[10px] uppercase tracking-widest text-muted mb-2">Accent</label>
          <div className="flex gap-2 mb-6">
            {(Object.keys(ACCENT_HEX) as WorkspaceAccent[]).map((a) => (
              <button
                key={a}
                onClick={() => setAccent(a)}
                className={`size-8 rounded-full border-2 transition ${accent === a ? "scale-110" : "opacity-70 hover:opacity-100"}`}
                style={{ background: ACCENT_HEX[a], borderColor: accent === a ? "#fff" : "transparent" }}
                aria-label={`${a} accent`}
              />
            ))}
          </div>

          {err && <p className="text-xs text-rust mb-3">{err}</p>}

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Create workspace
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
