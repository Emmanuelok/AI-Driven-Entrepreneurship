"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  Brain, Compass, FlaskConical, Rocket, Globe2, LayoutDashboard, Users, Wallet,
  Award, BookMarked, Building2, Settings, FileText, Map, Sparkles, Bot, Trophy,
  TrendingUp, Folder, MessageSquare, Library, Notebook, Target, Paintbrush, Lightbulb,
  Network, Search as SearchIcon,
} from "lucide-react";
import { PROBLEMS } from "@/lib/problems";
import { MENTORS } from "@/lib/mentors";
import { AGENTS } from "@/lib/agents";
import { COACHES } from "@/lib/coaches";
import { useStore } from "@/store";
import { useBuild } from "@/store/build";
import { useSketch } from "@/store/sketch";
import { Hammer } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase";

type SemanticHit = { kind: string; ref_id: string; ref_url: string | null; title: string | null; body: string; similarity: number };

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [semanticHits, setSemanticHits] = useState<SemanticHit[]>([]);
  const [semanticBusy, setSemanticBusy] = useState(false);
  const router = useRouter();
  const { ventures, createVenture } = useStore();
  const builds = useBuild((s) => s.projects);
  const boards = useSketch((s) => s.boards);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Semantic search: debounced query of /api/search/query for ≥3-char
  // searches. Falls through silently when not signed in or backend is local-only.
  const semTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (semTimer.current) clearTimeout(semTimer.current);
    if (!open || search.trim().length < 3) { setSemanticHits([]); return; }
    semTimer.current = setTimeout(async () => {
      try {
        const sb = supabaseBrowser();
        if (!sb) return;
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return;
        setSemanticBusy(true);
        const res = await fetch("/api/search/query", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ q: search.trim(), limit: 6 }),
        });
        const data = await res.json();
        if (data.ok) setSemanticHits(data.results || []);
      } catch { /* silent — palette still works without it */ }
      finally { setSemanticBusy(false); }
    }, 280);
    return () => { if (semTimer.current) clearTimeout(semTimer.current); };
  }, [search, open]);

  function go(href: string) {
    setOpen(false);
    setSearch("");
    setSemanticHits([]);
    router.push(href);
  }

  return (
    <>
      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Command palette"
        className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4"
      >
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
        <div
          className="relative w-full max-w-2xl glass rounded-2xl overflow-hidden shadow-2xl shadow-emerald/10 border border-emerald/30"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
            <Sparkles className="size-5 text-emerald shrink-0" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Type a command, search anything…"
              className="flex-1 bg-transparent outline-none text-base placeholder:text-muted"
            />
            <kbd className="text-[10px] uppercase tracking-widest text-muted px-2 py-1 border border-border rounded">esc</kbd>
          </div>
          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="text-center text-muted py-10">No matches. Try "tutor", "pitch", "Mama Adwoa"…</Command.Empty>

            {semanticHits.length > 0 && (
              <Command.Group heading="Semantic matches" className="text-[10px] uppercase tracking-widest text-emerald px-2 mt-1 mb-1.5">
                {semanticHits.map((h) => (
                  <Item
                    key={`${h.kind}:${h.ref_id}`}
                    icon={kindIcon(h.kind)}
                    label={h.title || h.body.slice(0, 60)}
                    sub={`${h.kind} · ${(h.similarity * 100).toFixed(0)}% match · ${h.body.slice(0, 80)}`}
                    onSelect={() => h.ref_url ? go(h.ref_url) : undefined}
                  />
                ))}
              </Command.Group>
            )}
            {semanticBusy && search.trim().length >= 3 && semanticHits.length === 0 && (
              <div className="px-3 py-2 text-[10px] text-muted italic flex items-center gap-1.5">
                <SearchIcon className="size-2.5 animate-pulse" /> Searching your work…
              </div>
            )}

            <Command.Group heading="Quick actions" className="text-[10px] uppercase tracking-widest text-muted px-2 mt-1 mb-1.5">
              <Item icon={Brain} label="Ask Sage (AI tutor)" hint="⇧S" onSelect={() => go("/studio/tutor")} />
              <Item icon={BookMarked} label="Start daily SRS review" hint="⇧R" onSelect={() => go("/studio/srs")} />
              <Item icon={Lightbulb} label="New brainstorm canvas" hint="⇧B" onSelect={() => go("/studio/brainstorm")} />
              <Item icon={Rocket} label="Open Venture Studio" hint="⇧V" onSelect={() => go("/studio/venture")} />
              <Item
                icon={Sparkles}
                label="Create new venture"
                onSelect={() => {
                  const id = createVenture({ name: "Untitled venture", tagline: "Add a tagline", phase: "ideate", region: "" });
                  go(`/studio/venture/${id}`);
                }}
              />
            </Command.Group>

            <Command.Group heading="Navigate" className="text-[10px] uppercase tracking-widest text-muted px-2 mt-3 mb-1.5">
              <Item icon={LayoutDashboard} label="Dashboard" onSelect={() => go("/studio")} />
              <Item icon={Compass} label="Learning Tracks" onSelect={() => go("/studio/learn")} />
              <Item icon={FlaskConical} label="Practice Lab" onSelect={() => go("/studio/lab")} />
              <Item icon={Map} label="Atlas (Africa map)" onSelect={() => go("/studio/atlas")} />
              <Item icon={Lightbulb} label="Brainstorm Canvases" onSelect={() => go("/studio/brainstorm")} />
              <Item icon={Bot} label="AI Agents Marketplace" onSelect={() => go("/studio/agents")} />
              <Item icon={Trophy} label="Pitch Arena" onSelect={() => go("/studio/arena")} />
              <Item icon={Network} label="Conglomerate Portfolio" onSelect={() => go("/studio/conglomerate")} />
              <Item icon={FileText} label="Document Studio" onSelect={() => go("/studio/documents")} />
              <Item icon={Notebook} label="Notebook" onSelect={() => go("/studio/notebook")} />
              <Item icon={Target} label="OKRs" onSelect={() => go("/studio/okrs")} />
              <Item icon={Paintbrush} label="Brand Studio" onSelect={() => go("/studio/brand")} />
              <Item icon={Wallet} label="Investor Portal" onSelect={() => go("/studio/investor")} />
              <Item icon={Globe2} label="Problem Hub" onSelect={() => go("/studio/problems")} />
              <Item icon={Users} label="Mentors" onSelect={() => go("/studio/mentors")} />
              <Item icon={MessageSquare} label="Community" onSelect={() => go("/studio/community")} />
              <Item icon={Folder} label="Portfolio" onSelect={() => go("/studio/portfolio")} />
              <Item icon={Award} label="Credentials" onSelect={() => go("/studio/credentials")} />
              <Item icon={TrendingUp} label="Analytics" onSelect={() => go("/studio/analytics")} />
              <Item icon={Settings} label="Settings" onSelect={() => go("/studio/settings")} />
              <Item icon={Building2} label="Institution dashboard" onSelect={() => go("/institution")} />
            </Command.Group>

            <Command.Group heading="AI Coaches" className="text-[10px] uppercase tracking-widest text-muted px-2 mt-3 mb-1.5">
              {Object.values(COACHES).map((c) => (
                <Item key={c.id} icon={Brain} label={`${c.name} — ${c.role}`} onSelect={() => go(`/studio/coaches/${c.id}`)} />
              ))}
            </Command.Group>

            <Command.Group heading="AI Agents" className="text-[10px] uppercase tracking-widest text-muted px-2 mt-3 mb-1.5">
              {AGENTS.slice(0, 10).map((a) => (
                <Item key={a.id} icon={Bot} label={`${a.icon} ${a.name}`} sub={a.short} onSelect={() => go(`/studio/agents/${a.id}`)} />
              ))}
            </Command.Group>

            <Command.Group heading="Active ventures" className="text-[10px] uppercase tracking-widest text-muted px-2 mt-3 mb-1.5">
              {ventures.map((v) => (
                <Item key={v.id} icon={Rocket} label={v.name} sub={v.tagline} onSelect={() => go(`/studio/venture/${v.id}`)} />
              ))}
            </Command.Group>

            <Command.Group heading="AI builds" className="text-[10px] uppercase tracking-widest text-muted px-2 mt-3 mb-1.5">
              {builds.slice(0, 10).map((b) => (
                <Item key={b.id} icon={Hammer} label={b.name} sub={b.description} onSelect={() => go(`/studio/build/${b.id}`)} />
              ))}
            </Command.Group>

            <Command.Group heading="Brainstorm canvases" className="text-[10px] uppercase tracking-widest text-muted px-2 mt-3 mb-1.5">
              {boards.slice(0, 10).map((b) => (
                <Item key={b.id} icon={Lightbulb} label={b.title} sub={b.prompt} onSelect={() => go(`/studio/brainstorm/${b.id}`)} />
              ))}
            </Command.Group>

            <Command.Group heading="Problems" className="text-[10px] uppercase tracking-widest text-muted px-2 mt-3 mb-1.5">
              {PROBLEMS.slice(0, 8).map((p) => (
                <Item key={p.id} icon={Globe2} label={p.title.slice(0, 70)} sub={`${p.sector} · ${p.region}`} onSelect={() => go(`/studio/problems/${p.id}`)} />
              ))}
            </Command.Group>

            <Command.Group heading="Mentors" className="text-[10px] uppercase tracking-widest text-muted px-2 mt-3 mb-1.5">
              {MENTORS.slice(0, 8).map((m) => (
                <Item key={m.id} icon={Users} label={m.name} sub={`${m.role} · ${m.org}`} onSelect={() => go(`/studio/mentors/${m.id}`)} />
              ))}
            </Command.Group>
          </Command.List>
          <div className="px-4 py-2.5 border-t border-border flex items-center justify-between text-[10px] uppercase tracking-widest text-muted">
            <span>⌘K to open · ↑↓ to navigate · ↵ to select</span>
            <span className="text-emerald">Sankofa</span>
          </div>
        </div>
      </Command.Dialog>
    </>
  );
}

function kindIcon(kind: string) {
  switch (kind) {
    case "venture": return Rocket;
    case "interview": return Users;
    case "build": return Hammer;
    case "brainstorm": return Lightbulb;
    default: return SearchIcon;
  }
}

function Item({ icon: Icon, label, sub, hint, onSelect }: { icon: typeof Brain; label: string; sub?: string; hint?: string; onSelect: () => void }) {
  return (
    <Command.Item
      value={label + " " + (sub ?? "")}
      onSelect={onSelect}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm aria-selected:bg-emerald/15 aria-selected:border aria-selected:border-emerald/30 transition"
    >
      <Icon className="size-4 text-emerald shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="truncate">{label}</div>
        {sub && <div className="text-xs text-muted truncate">{sub}</div>}
      </div>
      {hint && <kbd className="text-[10px] uppercase tracking-widest text-muted px-1.5 py-0.5 border border-border rounded shrink-0">{hint}</kbd>}
    </Command.Item>
  );
}
