"use client";

import { use, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { useStore } from "@/store";
import { Card, Button, Input, Textarea, Badge, EmptyState, Dialog } from "@/components/ui";
import { UserPlus, Plus, Sparkles, Save, Trash2, Users, GripVertical } from "lucide-react";
import { nanoid } from "nanoid";

type Role = NonNullable<NonNullable<ReturnType<typeof useStore.getState>["ventures"][number]["hiring"]>>["roles"][number];
type Candidate = NonNullable<NonNullable<ReturnType<typeof useStore.getState>["ventures"][number]["hiring"]>>["candidates"][number];

const STAGES: { id: Candidate["stage"]; label: string; color: "muted" | "indigo" | "amber" | "emerald" | "rust" }[] = [
  { id: "sourced", label: "Sourced", color: "muted" },
  { id: "screen", label: "Screen", color: "indigo" },
  { id: "interview", label: "Interview", color: "amber" },
  { id: "trial", label: "Trial", color: "amber" },
  { id: "offer", label: "Offer", color: "emerald" },
  { id: "hired", label: "Hired", color: "emerald" },
  { id: "passed", label: "Passed", color: "rust" },
];

export default function HirePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ventures, updateVenture } = useStore();
  const found = ventures.find((x) => x.id === id);

  const [roles, setRoles] = useState<Role[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [newRoleOpen, setNewRoleOpen] = useState(false);
  const [activeRoleId, setActiveRoleId] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);

  useEffect(() => {
    if (!found) return;
    setRoles(found.hiring?.roles ?? []);
    setCandidates(found.hiring?.candidates ?? []);
    if (!activeRoleId && found.hiring?.roles?.[0]) setActiveRoleId(found.hiring.roles[0].id);
  }, [found?.id]);

  if (!found) { notFound(); return null; }
  const v = found;

  function save(nextRoles = roles, nextCandidates = candidates) {
    updateVenture(v.id, { hiring: { roles: nextRoles, candidates: nextCandidates } });
  }

  async function createRole(draft: { title: string; type: Role["type"]; equityPct?: number; compensationUsd?: number; aiDraft: boolean }) {
    const id = nanoid(6);
    let description = "";
    let mustHaves: string[] = [];
    let niceHaves: string[] = [];
    if (draft.aiDraft) {
      setDrafting(true);
      try {
        const res = await fetch("/api/venture/role-spec", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ventureName: v.name,
            tagline: v.tagline,
            region: v.region,
            roleTitle: draft.title,
            type: draft.type,
            equityPct: draft.equityPct,
            compensationUsd: draft.compensationUsd,
            canvas: v.canvas,
            wedge: v.wedge,
          }),
        });
        const data = await res.json();
        description = data.description ?? "";
        mustHaves = data.mustHaves ?? [];
        niceHaves = data.niceHaves ?? [];
      } finally {
        setDrafting(false);
      }
    }
    const role: Role = { id, title: draft.title, type: draft.type, equityPct: draft.equityPct, compensationUsd: draft.compensationUsd, mustHaves, niceHaves, description, status: "open", createdAt: Date.now() };
    const nextRoles = [...roles, role];
    setRoles(nextRoles);
    setActiveRoleId(id);
    save(nextRoles, candidates);
    setNewRoleOpen(false);
  }

  function updateRole(id: string, patch: Partial<Role>) {
    const next = roles.map((r) => r.id === id ? { ...r, ...patch } : r);
    setRoles(next);
    save(next, candidates);
  }
  function removeRole(id: string) {
    const next = roles.filter((r) => r.id !== id);
    const nextC = candidates.filter((c) => c.roleId !== id);
    setRoles(next); setCandidates(nextC);
    save(next, nextC);
    if (activeRoleId === id) setActiveRoleId(next[0]?.id ?? null);
  }
  function addCandidate(name: string, contact: string) {
    if (!activeRoleId || !name.trim()) return;
    const cand: Candidate = { id: nanoid(6), roleId: activeRoleId, name, contact, stage: "sourced", addedAt: Date.now() };
    const next = [cand, ...candidates];
    setCandidates(next);
    save(roles, next);
  }
  function moveCandidate(id: string, stage: Candidate["stage"]) {
    const next = candidates.map((c) => c.id === id ? { ...c, stage } : c);
    setCandidates(next);
    save(roles, next);
  }
  function removeCandidate(id: string) {
    const next = candidates.filter((c) => c.id !== id);
    setCandidates(next);
    save(roles, next);
  }

  const activeRole = roles.find((r) => r.id === activeRoleId);
  const roleCandidates = activeRoleId ? candidates.filter((c) => c.roleId === activeRoleId) : [];

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-1 flex items-center gap-1.5">
            <UserPlus className="size-3.5" /> Hiring loop
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">{roles.filter((r) => r.status === "open").length} open · {candidates.length} candidates</h2>
          <p className="text-sm text-muted mt-1 max-w-2xl">Founder-grade role specs (no JD slop), interview scorecards tied to your wedge, lightweight ATS so nobody falls through the cracks.</p>
        </div>
        <Button onClick={() => setNewRoleOpen(true)}><Plus className="size-4" /> Open a role</Button>
      </header>

      {roles.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No roles open yet"
          body="Open your first role. Akili drafts the spec from your wedge + canvas. Candidates get a scorecard tied to what actually matters."
          action={<Button onClick={() => setNewRoleOpen(true)}><Plus className="size-4" /> Open a role</Button>}
        />
      ) : (
        <div className="grid lg:grid-cols-[280px_1fr] gap-5">
          {/* Role list */}
          <div className="space-y-2">
            {roles.map((r) => (
              <button
                key={r.id}
                onClick={() => setActiveRoleId(r.id)}
                className={`w-full text-left p-3 rounded-xl border transition ${activeRoleId === r.id ? "border-emerald/40 bg-emerald/5" : "border-border hover:border-muted bg-surface-2/40"}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <Badge color={r.status === "open" ? "emerald" : r.status === "interviewing" ? "amber" : r.status === "filled" ? "muted" : "rust"}>{r.status}</Badge>
                  <span className="text-[10px] text-muted">{r.type}</span>
                </div>
                <div className="font-medium text-sm">{r.title}</div>
                <div className="text-xs text-muted mt-0.5 flex gap-2">
                  {r.equityPct ? <span>{r.equityPct}% eq</span> : null}
                  {r.compensationUsd ? <span>${r.compensationUsd.toLocaleString()}</span> : null}
                  <span className="ml-auto">{candidates.filter((c) => c.roleId === r.id).length} cands</span>
                </div>
              </button>
            ))}
          </div>

          {/* Role detail + candidates */}
          {activeRole && (
            <div className="space-y-4">
              <Card className="p-5">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="font-medium">{activeRole.title}</h3>
                  <div className="flex items-center gap-2">
                    <select value={activeRole.status} onChange={(e) => updateRole(activeRole.id, { status: e.target.value as Role["status"] })} className="bg-surface-2 border border-border rounded-lg px-2 py-1 text-xs outline-none focus:border-emerald">
                      <option value="open">open</option>
                      <option value="interviewing">interviewing</option>
                      <option value="paused">paused</option>
                      <option value="filled">filled</option>
                    </select>
                    <button onClick={() => { if (confirm(`Remove ${activeRole.title}?`)) removeRole(activeRole.id); }} className="text-muted hover:text-rust">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-emerald mb-1.5">Description</div>
                    <Textarea value={activeRole.description} onChange={(e) => updateRole(activeRole.id, { description: e.target.value })} rows={8} className="text-xs" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-emerald mb-1.5">Must-haves (one per line)</div>
                    <Textarea
                      value={activeRole.mustHaves.join("\n")}
                      onChange={(e) => updateRole(activeRole.id, { mustHaves: e.target.value.split("\n").filter(Boolean) })}
                      rows={4}
                      className="text-xs"
                    />
                    <div className="text-[10px] uppercase tracking-widest text-amber mt-3 mb-1.5">Nice-to-haves</div>
                    <Textarea
                      value={activeRole.niceHaves.join("\n")}
                      onChange={(e) => updateRole(activeRole.id, { niceHaves: e.target.value.split("\n").filter(Boolean) })}
                      rows={3}
                      className="text-xs"
                    />
                  </div>
                </div>
              </Card>

              {/* Candidate kanban */}
              <Card className="p-5">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                  <h3 className="font-medium flex items-center gap-2"><Users className="size-4 text-emerald" /> Pipeline</h3>
                  <AddCandidate onAdd={addCandidate} />
                </div>
                <div className="grid grid-flow-col auto-cols-[minmax(160px,1fr)] sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-7 gap-2 overflow-x-auto pb-2">
                  {STAGES.map((s) => {
                    const here = roleCandidates.filter((c) => c.stage === s.id);
                    return (
                      <div key={s.id} className="rounded-xl border border-border bg-surface-2/30 p-2 min-w-[160px]">
                        <div className="flex items-center justify-between mb-2">
                          <Badge color={s.color}>{s.label}</Badge>
                          <span className="text-[10px] text-muted">{here.length}</span>
                        </div>
                        <div className="space-y-1.5">
                          {here.map((c) => (
                            <div key={c.id} className="rounded-lg border border-border bg-surface p-2 group">
                              <div className="flex items-start gap-1.5">
                                <GripVertical className="size-3 text-muted shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium truncate">{c.name}</div>
                                  {c.contact && <div className="text-[10px] text-muted truncate">{c.contact}</div>}
                                </div>
                              </div>
                              <div className="mt-1.5 flex items-center justify-between opacity-0 group-hover:opacity-100 transition">
                                <select
                                  value={c.stage}
                                  onChange={(e) => moveCandidate(c.id, e.target.value as Candidate["stage"])}
                                  className="text-[10px] bg-surface-2 border border-border rounded px-1.5 py-0.5 outline-none focus:border-emerald"
                                >
                                  {STAGES.map((x) => (<option key={x.id} value={x.id}>{x.label}</option>))}
                                </select>
                                <button onClick={() => removeCandidate(c.id)} className="text-muted hover:text-rust"><Trash2 className="size-3" /></button>
                              </div>
                            </div>
                          ))}
                          {here.length === 0 && <div className="text-[10px] text-muted text-center py-2 italic">empty</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      <NewRoleDialog open={newRoleOpen} onClose={() => setNewRoleOpen(false)} onCreate={createRole} drafting={drafting} />
    </div>
  );
}

function AddCandidate({ onAdd }: { onAdd: (name: string, contact: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Plus className="size-3" /> Candidate</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add candidate" size="sm">
        <div className="space-y-3">
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <Input placeholder="Contact (email / WhatsApp / LinkedIn)" value={contact} onChange={(e) => setContact(e.target.value)} />
          <div className="flex justify-end">
            <Button onClick={() => { onAdd(name, contact); setName(""); setContact(""); setOpen(false); }} disabled={!name.trim()}>Add</Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

function NewRoleDialog({ open, onClose, onCreate, drafting }: { open: boolean; onClose: () => void; onCreate: (d: { title: string; type: Role["type"]; equityPct?: number; compensationUsd?: number; aiDraft: boolean }) => void; drafting: boolean }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<Role["type"]>("full-time");
  const [equity, setEquity] = useState("");
  const [comp, setComp] = useState("");
  const [aiDraft, setAiDraft] = useState(true);
  return (
    <Dialog open={open} onClose={onClose} title="Open a role" size="md">
      <div className="space-y-3">
        <Input placeholder="Role title (e.g. Founding engineer, agritech ops lead)" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Type</div>
            <select value={type} onChange={(e) => setType(e.target.value as Role["type"])} className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm w-full outline-none focus:border-emerald">
              <option value="full-time">Full-time</option>
              <option value="part-time">Part-time</option>
              <option value="contractor">Contractor</option>
              <option value="advisor">Advisor</option>
            </select>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Equity %</div>
            <Input type="number" value={equity} onChange={(e) => setEquity(e.target.value)} placeholder="0.5" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Comp (USD/yr)</div>
            <Input type="number" value={comp} onChange={(e) => setComp(e.target.value)} placeholder="24000" />
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input type="checkbox" checked={aiDraft} onChange={(e) => setAiDraft(e.target.checked)} className="accent-emerald" />
          <Sparkles className="size-3.5 text-amber" /> Have Akili draft the spec + scorecard from your wedge
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onCreate({ title, type, equityPct: equity ? parseFloat(equity) : undefined, compensationUsd: comp ? parseFloat(comp) : undefined, aiDraft })}
            disabled={!title.trim() || drafting}
          >
            <Save className="size-4" /> {drafting ? "Akili is drafting…" : "Create role"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
