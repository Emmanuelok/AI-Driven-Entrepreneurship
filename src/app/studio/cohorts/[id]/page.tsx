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
import { useCohortProgress, type ProgressStatus, type ProgressRow } from "@/lib/cohort-progress";
import { Circle, CheckCircle2, MinusCircle, Loader2, DollarSign, Lock } from "lucide-react";
import { RefundRequestButton } from "@/components/refund-request-button";
import { DiscountCodeInput } from "@/components/discount-code-input";
import { CohortPricingDialog, CohortPriceBadge } from "@/components/cohort-pricing-dialog";

type Cohort = { id: string; owner_id: string; name: string; description: string | null; institution: string | null; created_at: string; updated_at: string };
type Member = { user_id: string; role: "owner" | "instructor" | "student"; email: string | null; display_name: string | null; joined_at: string };
type Invite = { id: string; email: string; role: string; expires_at: string; created_at: string };
type Assignment = { id: string; kind: "lesson" | "track" | "problem" | "build" | "venture" | "free"; target_id: string | null; title: string; description: string | null; due_at: string | null; created_at: string; created_by: string };
type Pricing = { price_cents: number; currency: string; application_fee_pct: number } | null;
type Enrollment = { paid_at: string; amount_cents: number; currency: string } | null;

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
  const [pricingOpen, setPricingOpen] = useState(false);
  const [pricing, setPricing] = useState<Pricing>(null);
  const [enrollment, setEnrollment] = useState<Enrollment>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [discountCode, setDiscountCode] = useState<string | null>(null);

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

    // Pricing is public-read; enrollment is per-user.
    const [pRes, eRes] = await Promise.all([
      fetch(`/api/v2/cohorts/${id}/pricing`).then((r) => r.json()).catch(() => ({})),
      fetch(`/api/v2/cohorts/${id}/enrollment`, { headers }).then((r) => r.json()).catch(() => ({})),
    ]);
    setPricing(pRes.pricing ?? null);
    setEnrollment(eRes.enrollment ?? null);
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  if (cohort === "notfound") notFound();
  if (!cohort) return <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 text-sm text-muted">Loading…</div>;

  const isInstructor = myRole === "owner" || myRole === "instructor";

  // Progress lives in its own table; the hook handles read + realtime
  // subscribe so the instructor matrix updates as students check off.
  const progress = useCohortProgress(id);

  // Quick lookup: my own status on each assignment.
  const myProgressByAssignment = new Map<string, ProgressRow>();
  if (!isInstructor) {
    for (const r of progress.rows) {
      myProgressByAssignment.set(r.assignment_id, r);
    }
  }
  const studentProgressByPair = new Map<string, ProgressRow>();
  if (isInstructor) {
    for (const r of progress.rows) studentProgressByPair.set(`${r.user_id}:${r.assignment_id}`, r);
  }

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

  async function startCheckout() {
    setEnrolling(true);
    try {
      const sb = supabaseBrowser();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { alert("Sign in to enroll."); return; }
      const res = await fetch(`/api/v2/cohorts/${id}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(discountCode ? { discountCode } : {}),
      });
      const data = await res.json();
      if (data.alreadyPaid) { refresh(); return; }
      if (!data.ok || !data.url) { alert(data.message || data.error || "Couldn't start checkout."); return; }
      window.location.href = data.url;
    } finally {
      setEnrolling(false);
    }
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
          <CohortPriceBadge pricing={pricing} />
          {myRole === "owner" && <Button variant="secondary" onClick={() => setPricingOpen(true)}><DollarSign className="size-4" /> {pricing ? "Pricing" : "Set price"}</Button>}
          {isInstructor && <Button variant="secondary" onClick={() => setInviteOpen(true)}><UserPlus className="size-4" /> Invite</Button>}
          {isInstructor && <Button onClick={() => setAssignOpen(true)}><Plus className="size-4" /> Assignment</Button>}
          {myRole === "owner" && <Button variant="ghost" onClick={deleteCohort}><Trash2 className="size-4 text-rust" /></Button>}
        </div>
      </header>

      {/* Paywall — student hasn't paid and the cohort is priced */}
      {!isInstructor && pricing && pricing.price_cents > 0 && !enrollment && (
        <Card className="p-5 mb-6 border border-amber/30 bg-amber/5">
          <div className="flex items-start gap-3">
            <Lock className="size-5 text-amber shrink-0 mt-0.5" />
            <div className="flex-1 space-y-3">
              <div>
                <div className="font-medium">This cohort requires enrollment.</div>
                <p className="text-sm text-muted mt-1 leading-relaxed">
                  Pay <strong className="text-foreground">{(pricing.price_cents / 100).toFixed(2)} {pricing.currency.toUpperCase()}</strong> to access all assignments + roster + progress tracking. Stripe collects securely; refunds handled by the instructor.
                </p>
              </div>
              <DiscountCodeInput kind="cohort" refId={id} onApplied={setDiscountCode} />
            </div>
            <Button onClick={startCheckout} disabled={enrolling}>
              {enrolling ? "Opening Stripe…" : `Pay ${(pricing.price_cents / 100).toFixed(2)} ${pricing.currency.toUpperCase()}`}
            </Button>
          </div>
        </Card>
      )}

      {/* Enrollment confirmed banner */}
      {!isInstructor && enrollment && (
        <Card className="p-3 mb-6 border border-emerald/30 bg-emerald/5">
          <div className="text-xs flex items-center gap-2 justify-between">
            <span className="text-emerald flex items-center gap-2">
              <Check className="size-3.5" />
              Enrolled · paid {(enrollment.amount_cents / 100).toFixed(2)} {enrollment.currency.toUpperCase()} on {new Date(enrollment.paid_at).toLocaleDateString()}
            </span>
            <RefundRequestButton kind="cohort" refId={id} />
          </div>
        </Card>
      )}

      {/* Progress matrix — instructor view. Rows = students, cols = assignments. */}
      {isInstructor && assignments.length > 0 && members.some((m) => m.role === "student") && (
        <Card className="p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs uppercase tracking-[0.22em] text-emerald flex items-center gap-1.5">
              <Loader2 className={`size-3 ${progress.loading ? "animate-spin" : "opacity-0"}`} />
              Progress at a glance
            </h2>
            <span className="text-[10px] text-muted">Live — students update by checking off on their device</span>
          </div>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-widest text-muted">
                  <th className="text-left pb-2 pr-3 sticky left-0 bg-surface z-10">Student</th>
                  {assignments.map((a) => (
                    <th key={a.id} className="pb-2 px-2 font-normal align-bottom" title={a.title}>
                      <div className="rotate-0 sm:rotate-[-30deg] sm:origin-bottom-left max-w-[140px] truncate inline-block">{a.title}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.filter((m) => m.role === "student").map((s) => (
                  <tr key={s.user_id} className="border-t border-border hover:bg-surface-2/40">
                    <td className="py-1.5 pr-3 sticky left-0 bg-surface z-10 max-w-[160px] truncate">
                      {s.display_name || s.email || s.user_id}
                    </td>
                    {assignments.map((a) => {
                      const cell = studentProgressByPair.get(`${s.user_id}:${a.id}`);
                      return (
                        <td key={a.id} className="py-1.5 px-2 text-center">
                          <StatusDot status={cell?.status ?? "not_started"} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-3 text-[10px] text-muted flex-wrap">
            <Legend status="not_started" label="Not started" />
            <Legend status="in_progress" label="In progress" />
            <Legend status="completed" label="Completed" />
            <Legend status="submitted" label="Submitted" />
          </div>
        </Card>
      )}

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
                const myRow = myProgressByAssignment.get(a.id);
                const totalStudents = members.filter((m) => m.role === "student").length;
                const doneStudents = isInstructor
                  ? new Set(progress.rows.filter((r) => r.assignment_id === a.id && (r.status === "completed" || r.status === "submitted")).map((r) => r.user_id)).size
                  : 0;
                return (
                  <li key={a.id} className="group">
                    <Card className="p-4 flex items-start gap-3">
                      <Icon className="size-4 text-emerald shrink-0 mt-1" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge color="muted">{KIND_LABEL[a.kind]}</Badge>
                          {a.due_at && (
                            <span className={`text-[10px] flex items-center gap-1 ${overdue ? "text-rust" : "text-muted"}`}>
                              <Calendar className="size-2.5" /> due {format(new Date(a.due_at), "MMM d")}
                            </span>
                          )}
                          {isInstructor && totalStudents > 0 && (
                            <span className="text-[10px] text-muted">
                              {doneStudents}/{totalStudents} done
                            </span>
                          )}
                        </div>
                        <div className="font-medium text-sm">{a.title}</div>
                        {a.description && <p className="text-xs text-muted mt-1 leading-relaxed">{a.description}</p>}
                        <div className="mt-2 flex items-center gap-3 flex-wrap">
                          {targetHref && (
                            <Link href={targetHref} className="text-xs text-emerald hover:text-amber">Open →</Link>
                          )}
                          {!isInstructor && (
                            <StudentStatusControl
                              current={myRow?.status ?? "not_started"}
                              onChange={(s) => progress.setStatus(a.id, s)}
                            />
                          )}
                        </div>
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
      <CohortPricingDialog cohortId={id} open={pricingOpen} onClose={() => setPricingOpen(false)} onSaved={refresh} />
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

// ─── Progress UI helpers ────────────────────────────────────────────────
function StudentStatusControl({ current, onChange }: { current: ProgressStatus; onChange: (next: ProgressStatus) => void }) {
  const cfg = STATUS_CFG[current];
  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        onClick={() => onChange(advance(current))}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] uppercase tracking-widest transition ${cfg.color}`}
        aria-label={`Advance status from ${cfg.label}`}
        title="Click to advance status"
      >
        <cfg.Icon className="size-3" /> {cfg.label}
      </button>
      <select
        value={current}
        onChange={(e) => onChange(e.target.value as ProgressStatus)}
        className="bg-surface-2 border border-border rounded text-[10px] px-1.5 py-0.5 outline-none focus:border-emerald"
        aria-label="Pick status"
      >
        <option value="not_started">Not started</option>
        <option value="in_progress">In progress</option>
        <option value="completed">Completed</option>
        <option value="submitted">Submitted</option>
      </select>
    </div>
  );
}

const STATUS_CFG: Record<ProgressStatus, { Icon: typeof Circle; label: string; color: string; dot: string }> = {
  not_started: { Icon: Circle, label: "Not started", color: "text-muted border-border bg-surface-2", dot: "bg-muted/40" },
  in_progress: { Icon: Loader2, label: "In progress", color: "text-amber border-amber/40 bg-amber/5", dot: "bg-amber" },
  completed: { Icon: CheckCircle2, label: "Completed", color: "text-emerald border-emerald/40 bg-emerald/5", dot: "bg-emerald" },
  submitted: { Icon: MinusCircle, label: "Submitted", color: "text-indigo border-indigo/40 bg-indigo/5", dot: "bg-indigo" },
};

function advance(s: ProgressStatus): ProgressStatus {
  const order: ProgressStatus[] = ["not_started", "in_progress", "completed", "submitted"];
  return order[(order.indexOf(s) + 1) % order.length];
}

function StatusDot({ status }: { status: ProgressStatus }) {
  const cfg = STATUS_CFG[status];
  return (
    <span
      className={`inline-block size-2.5 rounded-full ${cfg.dot}`}
      title={cfg.label}
      aria-label={cfg.label}
    />
  );
}

function Legend({ status, label }: { status: ProgressStatus; label: string }) {
  const cfg = STATUS_CFG[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${cfg.dot}`} />
      {label}
    </span>
  );
}
