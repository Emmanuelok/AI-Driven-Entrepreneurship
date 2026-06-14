"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/use-workspace";
import { workspaceApi, inviteShareUrl, type DeadlineAuthority, type WorkspaceAccent, type WorkspaceDeadline, type WorkspaceInvite } from "@/lib/workspace-api";
import { useStore } from "@/store";
import { Card, Badge, Button } from "@/components/ui";
import { CoPresence } from "@/components/co-presence";
import { setByLabel, relativeDue, dueWindow, windowLabel } from "@/lib/deadline-schedule";
import { usePersonalWorkspaceAgent } from "@/lib/workspace-agent-watcher";
import { WorkspaceDiscussionPanel } from "@/components/workspace-discussion-panel";
import { WorkspaceNotesPanel } from "@/components/workspace-notes-panel";
import { ArrowLeft, Users, Plus, Loader2, Calendar, Sparkles, Activity, LinkIcon, Copy, Check, Trash2, X, ArrowRight, UserMinus, CheckCircle2, Clock, ShieldCheck, MessageSquare, FileText, LayoutDashboard, Wand2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const ACCENT_HEX: Record<WorkspaceAccent, string> = {
  emerald: "#2cc295",
  amber: "#f4a949",
  indigo: "#6c8cff",
  rust: "#d96444",
};

const AUTHORITIES: DeadlineAuthority[] = ["self", "admin", "instructor", "funder", "investor", "journal", "mentor"];

export default function WorkspaceRoom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useStore();
  const ws = useWorkspace(id);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const [tab, setTab] = useState<"overview" | "discussion" | "notes">("overview");

  // Automatic Workspace Agent: fires welcome on first sight (after the
  // baseline pass), action plans when a personal deadline enters the
  // urgent window, and acknowledgement notes when a deadline closes.
  usePersonalWorkspaceAgent({
    workspace: ws.workspace,
    members: ws.members,
    deadlines: ws.deadlines,
    myRole: ws.myRole,
  });

  if (ws.loading) {
    return <div className="min-h-[50vh] flex items-center justify-center"><Loader2 className="size-6 text-emerald animate-spin" /></div>;
  }
  if (ws.error || !ws.workspace) { notFound(); return null; }

  const accent = ACCENT_HEX[ws.workspace.accent] ?? ACCENT_HEX.emerald;
  const isAdmin = ws.myRole === "owner" || ws.myRole === "admin";
  const presenceForCoPresence = ws.presence.map((p) => ({ userId: p.userId, name: p.name }));

  // Sort deadlines: open first (closest first), then done/missed/cancelled.
  const orderedDeadlines = [...ws.deadlines].sort((a, b) => {
    const aOpen = a.status === "open" ? 0 : 1;
    const bOpen = b.status === "open" ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
  });

  return (
    <div className="relative">
      {/* Ambient accent glow */}
      <div
        className="absolute inset-0 -z-10 pointer-events-none"
        style={{ background: `radial-gradient(70% 50% at 100% 0%, ${accent}1a 0%, transparent 60%), radial-gradient(60% 40% at 0% 100%, ${accent}10 0%, transparent 60%)` }}
      />

      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
        <Link href="/studio/workspaces" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-4">
          <ArrowLeft className="size-3" /> Workspaces
        </Link>

        <div className="flex items-start justify-between gap-6 flex-wrap mb-8">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] mb-2" style={{ color: accent }}>
              <Sparkles className="size-3" /> {ws.workspace.kind.replace(/_/g, " ")}
            </div>
            <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">{ws.workspace.title}</h1>
            {ws.workspace.description && (
              <p className="mt-3 text-muted leading-relaxed max-w-3xl">{ws.workspace.description}</p>
            )}
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <Badge color="muted">{ws.members.length} member{ws.members.length === 1 ? "" : "s"}</Badge>
              <Badge color={ws.myRole === "owner" ? "amber" : ws.myRole === "admin" ? "indigo" : "muted"}>You: {ws.myRole}</Badge>
              {ws.workspace.visibility === "link" && <Badge color="emerald">Link-share enabled</Badge>}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <CoPresence presence={presenceForCoPresence} myUserId={user?.id} />
            {isAdmin && (
              <Button onClick={() => setInviteOpen(true)}>
                <LinkIcon className="size-4" /> Invite
              </Button>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-border mb-6 -mx-1 px-1 overflow-x-auto">
          {([
            { id: "overview", label: "Overview", icon: LayoutDashboard },
            { id: "discussion", label: "Discussion", icon: MessageSquare },
            { id: "notes", label: "Notes", icon: FileText },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition flex items-center gap-1.5 whitespace-nowrap ${
                tab === t.id ? "border-emerald text-foreground" : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              <t.icon className="size-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {tab === "discussion" && (
          <WorkspaceDiscussionPanel workspaceId={id} members={ws.members} accent={accent} />
        )}

        {tab === "notes" && (
          <WorkspaceNotesPanel workspaceId={id} canEdit={ws.myRole !== "viewer"} accent={accent} />
        )}

        {tab === "overview" && (
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <div className="space-y-6">
            {/* Deadlines */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold flex items-center gap-2">
                  <Calendar className="size-5 text-emerald" /> Deadlines
                </h2>
                <Button size="sm" variant="secondary" onClick={() => setDeadlineOpen(true)}>
                  <Plus className="size-3.5" /> Add deadline
                </Button>
              </div>
              {orderedDeadlines.length === 0 ? (
                <Card className="p-8 text-center text-sm text-muted italic">
                  No deadlines yet. Self-set ones keep you honest; admin-set ones are stamped with their source — instructor, funder, investor, mentor, journal.
                </Card>
              ) : (
                <div className="space-y-2">
                  {orderedDeadlines.map((d) => (
                    <DeadlineRow key={d.id} d={d} canEdit={isAdmin || (d.assignee_user_id === user?.id && d.set_by_role === "self")} workspaceId={id} onChange={ws.refetch} />
                  ))}
                </div>
              )}
            </section>

            {/* Activity */}
            <section>
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold flex items-center gap-2 mb-3">
                <Activity className="size-5 text-amber" /> Activity
              </h2>
              <Card className="p-5 max-h-[420px] overflow-y-auto">
                {ws.activity.length === 0 ? (
                  <p className="text-xs text-muted italic">Nothing yet. As members join, set deadlines, or edit content, it shows up here.</p>
                ) : (
                  <ol className="space-y-3">
                    {ws.activity.map((a) => (
                      <li key={a.id} className="flex gap-3 text-sm">
                        <span className="size-1.5 rounded-full mt-2 shrink-0" style={{ background: accent }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-foreground leading-snug">{a.title}</div>
                          {a.body && <div className="text-xs text-muted truncate">{a.body}</div>}
                          <div className="text-[10px] text-muted mt-0.5">{formatDistanceToNow(new Date(a.created_at))} ago</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </section>
          </div>

          {/* Sidebar: members + invites */}
          <aside className="space-y-4">
            <Card className="p-5">
              <h3 className="text-[10px] uppercase tracking-widest text-muted mb-3 flex items-center gap-1.5">
                <Users className="size-3" /> Members
              </h3>
              <div className="space-y-2">
                {ws.members.map((m) => (
                  <div key={m.user_id} className="flex items-center gap-3 group">
                    <div className="size-8 rounded-full bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-semibold text-xs shrink-0">
                      {(m.display_name || m.email || "?")[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{m.display_name || m.email || "Member"}</div>
                      <div className="text-[10px] text-muted">{m.role}{m.user_id === user?.id ? " · you" : ""}</div>
                    </div>
                    {isAdmin && m.role !== "owner" && m.user_id !== user?.id && (
                      <button
                        onClick={async () => {
                          if (!confirm(`Remove ${m.display_name || m.email || "this member"}?`)) return;
                          await workspaceApi.removeMember(id, m.user_id);
                          ws.refetch();
                        }}
                        className="size-7 rounded-lg text-muted hover:text-rust hover:bg-rust/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                        title="Remove member"
                      >
                        <UserMinus className="size-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            {isAdmin && ws.invites.length > 0 && (
              <Card className="p-5">
                <h3 className="text-[10px] uppercase tracking-widest text-muted mb-3 flex items-center gap-1.5">
                  <LinkIcon className="size-3" /> Active invites
                </h3>
                <div className="space-y-2">
                  {ws.invites.map((inv) => (
                    <InviteRow key={inv.id} invite={inv} workspaceId={id} onRevoke={ws.refetch} />
                  ))}
                </div>
              </Card>
            )}
          </aside>
        </div>
        )}
      </div>

      {inviteOpen && (
        <InviteDialog
          workspaceId={id}
          accent={accent}
          onClose={() => setInviteOpen(false)}
          onCreated={() => ws.refetch()}
        />
      )}
      {deadlineOpen && (
        <DeadlineDialog
          workspaceId={id}
          isAdmin={isAdmin}
          members={ws.members.map((m) => ({ userId: m.user_id, name: m.display_name || m.email || "Member" }))}
          myUserId={user?.id ?? ""}
          accent={accent}
          onClose={() => setDeadlineOpen(false)}
          onCreated={() => ws.refetch()}
        />
      )}
    </div>
  );
}

function DeadlineRow({ d, canEdit, workspaceId, onChange }: { d: WorkspaceDeadline; canEdit: boolean; workspaceId: string; onChange: () => void }) {
  const now = Date.now();
  const window = dueWindow(d as Parameters<typeof dueWindow>[0], now);
  const source = setByLabel(d.set_by_role);
  const isOpen = d.status === "open";
  const isOverdue = window === "overdue" || (isOpen && new Date(d.due_at).getTime() < now);

  return (
    <div className={`glass rounded-xl p-4 flex items-start gap-3 transition ${isOpen ? "" : "opacity-60"} ${isOverdue ? "border-rust/40" : ""}`}>
      <button
        disabled={!canEdit || !isOpen}
        onClick={async () => {
          await workspaceApi.patchDeadline(workspaceId, { id: d.id, status: "done" });
          onChange();
        }}
        className={`size-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 transition ${
          d.status === "done"
            ? "border-emerald bg-emerald text-black"
            : isOpen && canEdit
              ? "border-border hover:border-emerald"
              : "border-border"
        }`}
        title={canEdit && isOpen ? "Mark done" : "Done"}
      >
        {d.status === "done" && <CheckCircle2 className="size-3" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-medium ${d.status === "done" ? "line-through" : ""}`}>{d.title}</span>
          <Badge color={source.tone as Parameters<typeof Badge>[0]["color"]}>{source.label}</Badge>
          {window && <Badge color={window === "overdue" ? "rust" : window === "1d" || window === "6h" ? "amber" : "muted"}>{windowLabel(window)}</Badge>}
        </div>
        {d.detail && <p className="mt-1 text-sm text-muted leading-relaxed">{d.detail}</p>}
        <div className="mt-1.5 text-xs text-muted flex items-center gap-3">
          <span className="flex items-center gap-1"><Clock className="size-3" /> {relativeDue(d.due_at, now)}</span>
          <span>{new Date(d.due_at).toLocaleString()}</span>
        </div>
      </div>
      {canEdit && (
        <button
          onClick={async () => {
            if (!confirm("Delete this deadline?")) return;
            await workspaceApi.deleteDeadline(workspaceId, d.id);
            onChange();
          }}
          className="size-7 rounded-lg text-muted hover:text-rust hover:bg-rust/10 flex items-center justify-center transition"
          title="Delete"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function InviteRow({ invite, workspaceId, onRevoke }: { invite: WorkspaceInvite; workspaceId: string; onRevoke: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = inviteShareUrl(invite.token);

  return (
    <div className="text-sm">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs text-muted truncate">{invite.email ?? "Share link"}</span>
        <Badge color="muted">{invite.role}</Badge>
      </div>
      <div className="flex items-center gap-1">
        <input value={url} readOnly className="flex-1 bg-surface-2 border border-border rounded-lg px-2 py-1 text-[11px] outline-none truncate" />
        <button
          onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="size-7 rounded-lg border border-border hover:border-emerald/40 hover:bg-emerald/5 flex items-center justify-center transition shrink-0"
          title="Copy link"
        >
          {copied ? <Check className="size-3 text-emerald" /> : <Copy className="size-3" />}
        </button>
        <button
          onClick={async () => { await workspaceApi.revokeInvite(workspaceId, invite.id); onRevoke(); }}
          className="size-7 rounded-lg text-muted hover:text-rust hover:bg-rust/10 flex items-center justify-center transition shrink-0"
          title="Revoke"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="text-[10px] text-muted mt-1">
        {invite.uses}/{invite.max_uses} used · expires {formatDistanceToNow(new Date(invite.expires_at))} from now
      </div>
    </div>
  );
}

function InviteDialog({ workspaceId, accent, onClose, onCreated }: { workspaceId: string; accent: string; onClose: () => void; onCreated: () => void }) {
  const [mode, setMode] = useState<"link" | "email">("link");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "editor" | "viewer">("editor");
  const [maxUses, setMaxUses] = useState(25);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ url: string; uses: number; expiresAt: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit() {
    setBusy(true); setErr(null);
    const r = await workspaceApi.invite(workspaceId, {
      role,
      email: mode === "email" ? email.trim() : null,
      maxUses: mode === "link" ? maxUses : 1,
    });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setCreated({ url: inviteShareUrl(r.invite.token), uses: r.invite.max_uses, expiresAt: r.invite.expires_at });
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-5 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="glass rounded-3xl max-w-md w-full p-7 relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="absolute -top-20 -right-20 size-48 rounded-full blur-3xl opacity-25" style={{ background: accent }} />
        <div className="relative">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold mb-1">Invite collaborators</h2>
          <p className="text-sm text-muted mb-5">Anyone with a link can join — or send a personal invite to one email.</p>

          {created ? (
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-muted mb-2">Share this link</label>
              <div className="flex items-center gap-1 mb-3">
                <input value={created.url} readOnly className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm outline-none" />
                <button
                  onClick={() => { navigator.clipboard.writeText(created.url); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
                  className="px-3 py-2 rounded-lg border border-border hover:border-emerald/40 hover:bg-emerald/5 transition flex items-center gap-1.5 text-sm"
                >
                  {copied ? <><Check className="size-3.5 text-emerald" /> Copied</> : <><Copy className="size-3.5" /> Copy</>}
                </button>
              </div>
              <p className="text-xs text-muted">Up to {created.uses} use{created.uses === 1 ? "" : "s"} · expires {formatDistanceToNow(new Date(created.expiresAt))} from now.</p>
              <div className="mt-5 flex justify-end">
                <Button onClick={onClose}>Done</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex gap-2 mb-5">
                <button onClick={() => setMode("link")} className={`flex-1 px-3 py-2 rounded-lg text-sm border transition ${mode === "link" ? "border-emerald/50 bg-emerald/5 text-foreground" : "border-border text-muted hover:text-foreground"}`}>
                  <LinkIcon className="size-3.5 inline mr-1.5" /> Shareable link
                </button>
                <button onClick={() => setMode("email")} className={`flex-1 px-3 py-2 rounded-lg text-sm border transition ${mode === "email" ? "border-emerald/50 bg-emerald/5 text-foreground" : "border-border text-muted hover:text-foreground"}`}>
                  <ShieldCheck className="size-3.5 inline mr-1.5" /> Personal invite
                </button>
              </div>

              {mode === "email" && (
                <>
                  <label className="block text-[10px] uppercase tracking-widest text-muted mb-2">Email address</label>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="friend@school.edu"
                    type="email"
                    className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald mb-4"
                  />
                </>
              )}

              <label className="block text-[10px] uppercase tracking-widest text-muted mb-2">Role</label>
              <div className="flex gap-2 mb-5">
                {(["admin", "editor", "viewer"] as const).map((r) => (
                  <button key={r} onClick={() => setRole(r)} className={`px-3 py-1.5 rounded-full text-xs border transition ${role === r ? "border-emerald/50 bg-emerald/10 text-emerald" : "border-border text-muted hover:text-foreground"}`}>
                    {r}
                  </button>
                ))}
              </div>

              {mode === "link" && (
                <>
                  <label className="block text-[10px] uppercase tracking-widest text-muted mb-2">Max uses</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={maxUses}
                    onChange={(e) => setMaxUses(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                    className="w-32 bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald mb-5"
                  />
                </>
              )}

              {err && <p className="text-xs text-rust mb-3">{err}</p>}

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
                <Button onClick={submit} disabled={busy || (mode === "email" && !email.trim())}>
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}
                  Create invite
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DeadlineDialog({ workspaceId, isAdmin, members, myUserId, accent, onClose, onCreated }: {
  workspaceId: string;
  isAdmin: boolean;
  members: { userId: string; name: string }[];
  myUserId: string;
  accent: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [dueAt, setDueAt] = useState(defaultDueAt());
  const [setByRole, setSetByRole] = useState<DeadlineAuthority>("self");
  const [assignee, setAssignee] = useState<string>(""); // "" = self, "all" = workspace-wide
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Smart parse: describe the deadline in words, let the agent fill the form.
  const [nlText, setNlText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsedNote, setParsedNote] = useState<string | null>(null);

  async function smartParse() {
    const text = nlText.trim();
    if (!text || parsing) return;
    setParsing(true); setParsedNote(null); setErr(null);
    const r = await workspaceApi.parseDeadline(text, isAdmin);
    setParsing(false);
    if (!r) { setParsedNote("Couldn't read a date from that — try adding a day or time."); return; }
    if (r.title) setTitle(r.title);
    if (r.detail) setDetail(r.detail);
    if (isAdmin && r.setByRole) setSetByRole(r.setByRole);
    if (r.dueAt) {
      // Convert the ISO instant into the datetime-local input's format,
      // in the user's local timezone.
      const d = new Date(r.dueAt);
      if (!isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, "0");
        setDueAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
        setParsedNote("Filled the form below — adjust anything before saving.");
      } else {
        setParsedNote("Got the title; pick a date below.");
      }
    } else {
      setParsedNote("Got the title; I couldn't pin a date — pick one below.");
    }
  }

  async function submit() {
    if (!title.trim()) { setErr("Give the deadline a title."); return; }
    setBusy(true); setErr(null);
    const assigneeUserId = !assignee ? myUserId : assignee === "all" ? null : assignee;
    const r = await workspaceApi.addDeadline(workspaceId, {
      title: title.trim(),
      detail: detail.trim(),
      dueAt: new Date(dueAt).toISOString(),
      assigneeUserId,
      setByRole,
    });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-5 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="glass rounded-3xl max-w-lg w-full p-7 relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="absolute -top-20 -right-20 size-48 rounded-full blur-3xl opacity-25" style={{ background: accent }} />
        <div className="relative">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold mb-1">Add a deadline</h2>
          <p className="text-sm text-muted mb-5">
            Self-set deadlines hold YOU accountable. {isAdmin && "Admin-set deadlines can be stamped with a source (instructor, funder, investor, journal, mentor) so the team knows where they came from."}
          </p>

          {/* Smart parse */}
          <div className="mb-5 p-3 rounded-xl border border-emerald/25 bg-emerald/5">
            <label className="block text-[10px] uppercase tracking-widest text-emerald mb-2 flex items-center gap-1.5">
              <Wand2 className="size-3" /> Describe it in words
            </label>
            <div className="flex gap-2">
              <input
                value={nlText}
                onChange={(e) => setNlText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void smartParse(); } }}
                placeholder='e.g. "send revisions to the journal by next Friday 5pm"'
                className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald"
              />
              <Button size="sm" onClick={smartParse} disabled={parsing || !nlText.trim()}>
                {parsing ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                Parse
              </Button>
            </div>
            {parsedNote && <p className="mt-2 text-[11px] text-muted">{parsedNote}</p>}
          </div>

          <label className="block text-[10px] uppercase tracking-widest text-muted mb-2">What's due?</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Submit revised manuscript" autoFocus className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald mb-4" />

          <label className="block text-[10px] uppercase tracking-widest text-muted mb-2">Notes (optional)</label>
          <textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="What needs to happen before then?" rows={2} className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald mb-4 resize-none" />

          <label className="block text-[10px] uppercase tracking-widest text-muted mb-2">When?</label>
          <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald mb-4" />

          {isAdmin && (
            <>
              <label className="block text-[10px] uppercase tracking-widest text-muted mb-2">Set by</label>
              <select
                value={setByRole}
                onChange={(e) => setSetByRole(e.target.value as DeadlineAuthority)}
                className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald mb-4"
              >
                {AUTHORITIES.map((a) => <option key={a} value={a}>{setByLabel(a).label}</option>)}
              </select>

              <label className="block text-[10px] uppercase tracking-widest text-muted mb-2">Assign to</label>
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald mb-5"
              >
                <option value="">Just me</option>
                <option value="all">Everyone in the workspace</option>
                {members.filter((m) => m.userId !== myUserId).map((m) => (
                  <option key={m.userId} value={m.userId}>{m.name}</option>
                ))}
              </select>
            </>
          )}

          {err && <p className="text-xs text-rust mb-3">{err}</p>}

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Add deadline
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function defaultDueAt(): string {
  // Default to 7 days from now at 9am local time. Renders correctly in the
  // browser's <input type="datetime-local"> widget.
  const d = new Date(Date.now() + 7 * 86_400_000);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
