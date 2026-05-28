"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, notFound } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";
import { Card, Button, Input, Textarea, Badge, Dialog } from "@/components/ui";
import {
  GraduationCap, Building2, ArrowLeft, UserPlus, Trash2, Plus, Crown, Pencil, Eye, Mail, X,
  Calendar, BookOpen, FlaskConical, Hammer, Rocket, Globe2, ClipboardList, Check, AlertCircle,
} from "lucide-react";
import { TRACKS } from "@/lib/curriculum";
import { PROBLEMS } from "@/lib/problems";
import { format } from "date-fns";

type Cohort = { id: string; owner_id: string; name: string; description: string | null; institution: string | null; created_at: string; updated_at: string };
type Member = { user_id: string; role: "owner" | "instructor" | "student"; email: string | null; display_name: string | null; joined_at: string };
type Invite = { id: string; email: string; role: string; expires_at: string; created_at: string };
type Assignment = { id: string; kind: "lesson" | "track" | "problem" | "build" | "venture" | "free"; target_id: string | null; title: string; description: string | null; due_at: string | null; created_at: string; created_by: string };

const KIND_ICON = { lesson: BookOpen, track: FlaskConical, problem: Globe2, build: Hammer, venture: Rocket, free: ClipboardList } as const;
const KIND_LABEL = { lesson: "Lesson", track: "Track", problem: "Problem", build: "Build", venture: "Venture", free: "Custom" } as const;

export default function CohortDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [cohort, setCohort] = useState<Cohort | null | "notfound">(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [myRole, setMyRole] = useState<"owner" | "instructor" | "student" | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const refresh = useCallback(async () => {
    const sb = supabaseBrowser();
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    const headers = { Authorization: `Bearer ${session.access_token}` };

    const [c, m, a] = await Promise.all([
      fetch(`/api/v2/cohorts/${id}`, { headers }),
      fetch(`/api/v2/cohorts/${id}/members`, { headers }),
      fetch(`/api/v2/cohorts/${id}/assignments`, { headers }),
    ]);
    if (c.status === 403 || c.status === 404) { setCohort("notfound"); return; }
    const cData = await c.json();
    const mData = await m.json();
    const aData = await a.json();
    setCohort(cData.cohort ?? null);
    setMyRole((cData.myRole ?? null) as typeof myRole);
    setMembers(mData.members ?? []);
    setInvites(mData.pendingInvites ?? []);
    setAssignments(aData.results ?? []);
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  if (cohort === "notfound") notFound();
  if (!cohort) return <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 text-sm text-muted">Loading…</div>;

  const isInstructor = myRole === "owner" || myRole === "instructor";

  async function deleteCohort() {
    if (!confirm(`Delete "${(cohort as Cohort).name}" and everything in it? This can't be undone.`)) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    const res = await fetch(`/api/v2/cohorts/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) router.push("/studio/cohorts");
  }

  async function removeMember(uid: string) {
    if (!confirm("Remove this member from the cohort?")) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    await fetch(`/api/v2/cohorts/${id}/members?userId=${encodeURIComponent(uid)}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${session.access_token}` },
    });
    refresh();
  }

  async function revokeInvite(invId: string) {
    const sb = supabaseBrowser();
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    await fetch(`/api/v2/cohorts/${id}/invites?id=${encodeURIComponent(invId)}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${session.access_token}` },
    });
    refresh();
  }

  async function deleteAssignment(aid: string) {
    if (!confirm("Remove this assignment? Members lose it from their list.")) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    await fetch(`/api/v2/cohorts/${id}/assignments/${aid}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${session.access_token}` },
    });
    refresh();
  }

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10">
      <Link href="/studio/cohorts" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-4">
        <ArrowLeft className="size-3" /> All cohorts
      </Link>

      <header className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
            <GraduationCap className="size-3.5" /> Cohort
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold leading-tight">{cohort.name}</h1>
          {cohort.institution && <div className="mt-2 text-sm text-muted flex items-center gap-1.5"><Building2 className="size-3.5" /> {cohort.institution}</div>}
          {cohort.description && <p className="mt-3 text-sm text-muted max-w-2xl">{cohort.description}</p>}
        </div>
        <div className="flex gap-2 shrink-0">
          {isInstructor && <Button variant="secondary" onClick={() => setInviteOpen(true)}><UserPlus className="size-4" /> Invite</Button>}
          {isInstructor && <Button onClick={() => setAssignOpen(true)}><Plus className="size-4" /> Assignment</Button>}
          {myRole === "owner" && <Button variant="ghost" onClick={deleteCohort}><Trash2 className="size-4 text-rust" /></Button>}
        </div>
      </header>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        {/* Assignments column */}
        <div>
          <h2 className="text-xs uppercase tracking-[0.22em] text-emerald mb-4 flex items-center gap-1.5">
            <ClipboardList className="size-3.5" /> Assignments ({assignments.length})
          </h2>
          {assignments.length === 0 ? (
            <Card className="p-6 text-sm text-muted italic">
              {isInstructor ? "Create the first assignment so members know what to work on." : "No assignments yet."}
            </Card>
          ) : (
            <ul className="space-y-2">
              {assignments.map((a) => {
                const Icon = KIND_ICON[a.kind];
                const targetHref =
                  a.kind === "lesson" || a.kind === "track" ? `/studio/learn${a.target_id ? `/${a.target_id}` : ""}` :
                  a.kind === "problem" ? `/studio/problems${a.target_id ? `/${a.target_id}` : ""}` :
                  a.kind === "build" ? `/studio/build${a.target_id ? `/${a.target_id}` : ""}` :
                  a.kind === "venture" ? `/studio/venture${a.target_id ? `/${a.target_id}` : ""}` :
                  null;
                const overdue = a.due_at && new Date(a.due_at) < new Date();
                return (
                  <li key={a.id} className="group">
                    <Card className="p-4 flex items-start gap-3">
                      <Icon className="size-4 text-emerald shrink-0 mt-1" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge color="muted">{KIND_LABEL[a.kind]}</Badge>
                          {a.due_at && (
                            <span className={`text-[10px] flex items-center gap-1 ${overdue ? "text-rust" : "text-muted"}`}>
                              <Calendar className="size-2.5" /> due {format(new Date(a.due_at), "MMM d")}
                            </span>
                          )}
                        </div>
                        <div className="font-medium text-sm">{a.title}</div>
                        {a.description && <p className="text-xs text-muted mt-1 leading-relaxed">{a.description}</p>}
                        {targetHref && (
                          <Link href={targetHref} className="mt-2 inline-block text-xs text-emerald hover:text-amber">Open →</Link>
                        )}
                      </div>
                      {isInstructor && (
                        <button onClick={() => deleteAssignment(a.id)} className="opacity-0 group-hover:opacity-100 transition text-muted hover:text-rust" aria-label="Delete assignment">
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Roster column */}
        <aside>
          <h2 className="text-xs uppercase tracking-[0.22em] text-amber mb-4">Roster ({members.length})</h2>
          <Card className="p-3">
            <ul className="space-y-1.5">
              {members.map((m) => (
                <li key={m.user_id} className="group flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-surface-2/60">
                  <div className="size-7 rounded-full bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-semibold text-[10px] shrink-0">
                    {(m.display_name || m.email || "?")[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{m.display_name || m.email || m.user_id}</div>
                    {m.display_name && m.email && <div className="text-[10px] text-muted truncate">{m.email}</div>}
                  </div>
                  <RoleBadge role={m.role} />
                  {isInstructor && m.role !== "owner" && m.user_id !== cohort.owner_id && (
                    <button onClick={() => removeMember(m.user_id)} className="opacity-0 group-hover:opacity-100 transition text-muted hover:text-rust" aria-label="Remove member">
                      <X className="size-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          {isInstructor && invites.length > 0 && (
            <>
              <h2 className="mt-6 text-xs uppercase tracking-[0.22em] text-amber mb-3">Pending ({invites.length})</h2>
              <Card className="p-3">
                <ul className="space-y-1.5">
                  {invites.map((inv) => (
                    <li key={inv.id} className="group flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-surface-2/60">
                      <Mail className="size-3.5 text-amber shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs truncate">{inv.email}</div>
                        <div className="text-[10px] text-muted">{inv.role}</div>
                      </div>
                      <button onClick={() => revokeInvite(inv.id)} className="opacity-0 group-hover:opacity-100 transition text-muted hover:text-rust" aria-label="Revoke invite">
                        <X className="size-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}
        </aside>
      </div>

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} cohortId={id} onDone={refresh} />
      <AssignmentDialog open={assignOpen} onClose={() => setAssignOpen(false)} cohortId={id} onDone={refresh} />
    </div>
  );
}

function RoleBadge({ role }: { role: "owner" | "instructor" | "student" }) {
  const cfg = {
    owner: { Icon: Crown, color: "text-amber border-amber/40 bg-amber/10" },
    instructor: { Icon: Pencil, color: "text-emerald border-emerald/40 bg-emerald/10" },
    student: { Icon: Eye, color: "text-muted border-border" },
  }[role];
  return (
    <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${cfg.color}`}>
      <cfg.Icon className="size-2.5" /> {role}
    </span>
  );
}

function InviteDialog({ open, onClose, cohortId, onDone }: { open: boolean; onClose: () => void; cohortId: string; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"student" | "instructor">("student");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function invite() {
    setBusy(true); setFeedback(null);
    try {
      const sb = supabaseBrowser();
      if (!sb) { setFeedback({ kind: "err", text: "Cloud sync isn't configured." }); return; }
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setFeedback({ kind: "err", text: "Sign in first." }); return; }
      const res = await fetch(`/api/v2/cohorts/${cohortId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!data.ok) { setFeedback({ kind: "err", text: data.error ?? "Couldn't invite." }); return; }
      setEmail("");
      setFeedback({ kind: "ok", text: data.mode === "added_directly" ? "Added — they're already on Sankofa." : "Invite sent (30 days)." });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Invite a member" size="md">
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="student@example.com" onKeyDown={(e) => { if (e.key === "Enter") invite(); }} />
          <select value={role} onChange={(e) => setRole(e.target.value as "student" | "instructor")} className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald" aria-label="Role">
            <option value="student">Student</option>
            <option value="instructor">Instructor</option>
          </select>
          <Button onClick={invite} disabled={busy || !email.trim()}>{busy ? "…" : "Invite"}</Button>
        </div>
        {feedback && (
          <div className={`text-xs flex items-start gap-1.5 ${feedback.kind === "err" ? "text-rust" : "text-emerald"}`}>
            {feedback.kind === "err" ? <AlertCircle className="size-3.5 shrink-0 mt-0.5" /> : <Check className="size-3.5 shrink-0 mt-0.5" />}
            {feedback.text}
          </div>
        )}
        <p className="text-[10px] text-muted">If the recipient already has a Sankofa account, they&apos;re added directly. Otherwise we email a 30-day token link.</p>
      </div>
    </Dialog>
  );
}

function AssignmentDialog({ open, onClose, cohortId, onDone }: { open: boolean; onClose: () => void; cohortId: string; onDone: () => void }) {
  const [kind, setKind] = useState<Assignment["kind"]>("track");
  const [targetId, setTargetId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-fill title from the selected track / problem so instructors
  // don't have to retype it.
  function syncTitleFromTarget(k: Assignment["kind"], tid: string) {
    if (k === "track") {
      const t = TRACKS.find((x) => x.id === tid);
      if (t && !title.trim()) setTitle(t.title);
    } else if (k === "problem") {
      const p = PROBLEMS.find((x) => x.id === tid);
      if (p && !title.trim()) setTitle(p.title);
    }
  }

  async function create() {
    setBusy(true); setError(null);
    try {
      const sb = supabaseBrowser();
      if (!sb) { setError("Cloud sync isn't configured."); return; }
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setError("Sign in first."); return; }
      const res = await fetch(`/api/v2/cohorts/${cohortId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          kind,
          targetId: targetId || undefined,
          title,
          description: description || undefined,
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error || "Couldn't create assignment."); return; }
      setKind("track"); setTargetId(""); setTitle(""); setDescription(""); setDueAt("");
      onDone(); onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="New assignment" size="md">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Kind</div>
            <select value={kind} onChange={(e) => { const k = e.target.value as Assignment["kind"]; setKind(k); setTargetId(""); }} className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm w-full outline-none focus:border-emerald">
              <option value="track">Learning track</option>
              <option value="lesson">Lesson</option>
              <option value="problem">Problem (hub)</option>
              <option value="build">AI Build project</option>
              <option value="venture">Venture milestone</option>
              <option value="free">Custom (no link)</option>
            </select>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Due (optional)</div>
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
        </div>

        {kind === "track" && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Track</div>
            <select value={targetId} onChange={(e) => { setTargetId(e.target.value); syncTitleFromTarget("track", e.target.value); }} className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm w-full outline-none focus:border-emerald">
              <option value="">—</option>
              {TRACKS.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
        )}

        {kind === "problem" && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Problem</div>
            <select value={targetId} onChange={(e) => { setTargetId(e.target.value); syncTitleFromTarget("problem", e.target.value); }} className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm w-full outline-none focus:border-emerald">
              <option value="">—</option>
              {PROBLEMS.map((p) => <option key={p.id} value={p.id}>{p.title.slice(0, 60)}</option>)}
            </select>
          </div>
        )}

        {(kind === "lesson" || kind === "build" || kind === "venture") && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Target id (optional)</div>
            <Input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder={kind === "lesson" ? "ai-fundamentals/intro-to-llms" : kind === "build" ? "build_id" : "venture_id"} />
            <p className="text-[10px] text-muted mt-1">Leave blank if you want the assignment to be a pointer-only.</p>
          </div>
        )}

        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Title</div>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Week 3 — Customer discovery scripts" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Description (optional)</div>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What members should do, how it'll be graded, what to submit." />
        </div>

        {error && <div className="text-xs text-rust flex items-start gap-1.5"><AlertCircle className="size-3.5 shrink-0 mt-0.5" />{error}</div>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={create} disabled={busy || title.trim().length < 2}>
            <Plus className="size-4" /> {busy ? "Creating…" : "Create assignment"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
