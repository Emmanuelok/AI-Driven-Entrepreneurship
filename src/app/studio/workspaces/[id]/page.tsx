"use client";

import { use, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { useWorkspace } from "@/lib/use-workspace";
import { workspaceApi, inviteShareUrl, type DeadlineAuthority, type WorkspaceAccent, type WorkspaceDeadline, type WorkspaceInvite } from "@/lib/workspace-api";
import { useStore } from "@/store";
import { Card, Badge, Button } from "@/components/ui";
import { CoPresence } from "@/components/co-presence";
import { setByLabel, relativeDue, dueWindow, windowLabel } from "@/lib/deadline-schedule";
import { describeRule, type RecurrenceRule, type WeekdayCode } from "@/lib/recurrence";
import { usePersonalWorkspaceAgent } from "@/lib/workspace-agent-watcher";
import { useDiscussionUnread } from "@/lib/use-discussion-unread";
import { useDmInbox } from "@/lib/use-dm-inbox";
import { WorkspaceSynthesisCard } from "@/components/workspace-synthesis-card";
import { WorkspaceInsightsCard } from "@/components/workspace-insights-card";
import { WorkspaceSearchDialog } from "@/components/workspace-search-dialog";
import { WorkspaceActivityList } from "@/components/workspace-activity-list";
import { WorkspaceCalendarSubscribeCard } from "@/components/workspace-calendar-subscribe-card";

// Lazy-load the heavy tab panels: they only mount when their tab is
// active, so don't pay for them on the Overview tab. Loader stays simple
// — a small spinner placeholder — to keep CLS quiet.
const TabLoader = () => <div className="flex items-center justify-center py-12 text-muted">…</div>;
const WorkspaceDiscussionPanel = dynamic(() => import("@/components/workspace-discussion-panel").then((m) => m.WorkspaceDiscussionPanel), { ssr: false, loading: TabLoader });
const WorkspaceNotesPanel = dynamic(() => import("@/components/workspace-notes-panel").then((m) => m.WorkspaceNotesPanel), { ssr: false, loading: TabLoader });
const WorkspaceTasksPanel = dynamic(() => import("@/components/workspace-tasks-panel").then((m) => m.WorkspaceTasksPanel), { ssr: false, loading: TabLoader });
const WorkspaceAttachments = dynamic(() => import("@/components/workspace-attachments").then((m) => m.WorkspaceAttachments), { ssr: false, loading: TabLoader });
const WorkspaceSagePanel = dynamic(() => import("@/components/workspace-sage-panel").then((m) => m.WorkspaceSagePanel), { ssr: false, loading: TabLoader });
const WorkspaceDmDialog = dynamic(() => import("@/components/workspace-dm-dialog").then((m) => m.WorkspaceDmDialog), { ssr: false });
const WorkspaceDmInboxPanel = dynamic(() => import("@/components/workspace-dm-inbox-panel").then((m) => m.WorkspaceDmInboxPanel), { ssr: false, loading: TabLoader });
import { ArrowLeft, Users, Plus, Loader2, Calendar, Sparkles, Activity, LinkIcon, Copy, Check, Trash2, X, ArrowRight, UserMinus, CheckCircle2, Clock, ShieldCheck, MessageSquare, MessagesSquare, FileText, LayoutDashboard, Wand2, KanbanSquare, Paperclip, Repeat, Search, Archive, CopyPlus, Brain, Download } from "lucide-react";
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [dmWith, setDmWith] = useState<{ id: string; name: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [tab, setTab] = useState<"overview" | "tasks" | "discussion" | "notes" | "files" | "sage" | "dms">("overview");

  // Cmd/Ctrl+K opens the in-workspace search. Bypasses when the user is
  // already typing into an input/textarea/contentEditable so it doesn't
  // hijack the Build Studio's editor shortcut etc.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Automatic Workspace Agent: fires welcome on first sight (after the
  // baseline pass), action plans when a personal deadline enters the
  // urgent window, and acknowledgement notes when a deadline closes.
  usePersonalWorkspaceAgent({
    workspace: ws.workspace,
    members: ws.members,
    deadlines: ws.deadlines,
    myRole: ws.myRole,
  });

  // Unread badge on the Discussion tab — counts messages newer than my
  // watermark that aren't mine. Lives at the room level so it stays
  // accurate even while the user is reading another tab.
  const unread = useDiscussionUnread(id);
  // Same idea for DMs — total unread conversations.
  const dmInbox = useDmInbox(id);

  if (ws.loading) {
    return <div className="min-h-[50vh] flex items-center justify-center"><Loader2 className="size-6 text-emerald animate-spin" /></div>;
  }
  if (ws.error || !ws.workspace) { notFound(); return null; }

  const accent = ACCENT_HEX[ws.workspace.accent] ?? ACCENT_HEX.emerald;
  const isAdmin = ws.myRole === "owner" || ws.myRole === "admin";
  const isOwner = ws.myRole === "owner";
  const isArchived = !!ws.workspace.archived_at;
  const presenceForCoPresence = ws.presence.map((p) => ({ userId: p.userId, name: p.name }));

  async function toggleArchive() {
    const verb = isArchived ? "Restore" : "Archive";
    if (!confirm(`${verb} "${ws.workspace!.title}"?${isArchived ? "" : " It will be hidden from your hub and excluded from digests until you restore it."}`)) return;
    await workspaceApi.patch(id, { archived: !isArchived });
    ws.refetch();
  }

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
            <button
              onClick={() => setSearchOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border hover:border-emerald/40 hover:bg-emerald/5 transition text-sm text-muted hover:text-foreground"
              title="Search this workspace (⌘K)"
            >
              <Search className="size-3.5" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden sm:inline text-[10px] uppercase tracking-widest text-muted px-1.5 py-0.5 border border-border rounded">⌘K</kbd>
            </button>
            {isAdmin && !isArchived && (
              <Button onClick={() => setInviteOpen(true)}>
                <LinkIcon className="size-4" /> Invite
              </Button>
            )}
            <button
              onClick={() => setDuplicateOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border hover:border-emerald/40 hover:bg-emerald/5 transition text-sm text-muted hover:text-foreground"
              title="Spin up a new workspace from this one's structure"
            >
              <CopyPlus className="size-3.5" />
              <span className="hidden sm:inline">Duplicate</span>
            </button>
            {isOwner && (
              <button
                onClick={async () => {
                  setExporting(true);
                  const r = await workspaceApi.exportWorkspace(id);
                  setExporting(false);
                  if (!r.ok) alert(`Couldn't export: ${r.error}`);
                }}
                disabled={exporting}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border hover:border-emerald/40 hover:bg-emerald/5 transition text-sm text-muted hover:text-foreground disabled:opacity-50"
                title="Download a JSON archive of this workspace"
              >
                {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                <span className="hidden sm:inline">{exporting ? "Exporting…" : "Export"}</span>
              </button>
            )}
            {isOwner && (
              <button
                onClick={toggleArchive}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border hover:border-emerald/40 hover:bg-emerald/5 transition text-sm text-muted hover:text-foreground"
                title={isArchived ? "Restore this workspace" : "Archive this workspace"}
              >
                <Archive className="size-3.5" />
                <span className="hidden sm:inline">{isArchived ? "Restore" : "Archive"}</span>
              </button>
            )}
          </div>
        </div>

        {isArchived && (
          <div className="mb-6 p-4 rounded-2xl border border-amber/30 bg-amber/5 text-sm flex items-center justify-between gap-3 flex-wrap">
            <span className="flex items-center gap-2 text-amber"><Archive className="size-4" /> This workspace is archived — hidden from your hub, excluded from digests and the calendar.</span>
            {isOwner && <button onClick={toggleArchive} className="text-xs text-emerald hover:underline">Restore it</button>}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex items-center gap-1 border-b border-border mb-6 -mx-1 px-1 overflow-x-auto">
          {([
            { id: "overview", label: "Overview", icon: LayoutDashboard },
            { id: "tasks", label: "Tasks", icon: KanbanSquare },
            { id: "discussion", label: "Discussion", icon: MessageSquare },
            { id: "notes", label: "Notes", icon: FileText },
            { id: "files", label: "Files", icon: Paperclip },
            { id: "dms", label: "DMs", icon: MessagesSquare },
            { id: "sage", label: "Ask Sage", icon: Brain },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition flex items-center gap-1.5 whitespace-nowrap ${
                tab === t.id ? "border-emerald text-foreground" : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              <t.icon className="size-3.5" /> {t.label}
              {t.id === "discussion" && unread > 0 && tab !== "discussion" && (
                <span className="ml-1 inline-flex items-center justify-center text-[10px] font-bold rounded-full bg-rust text-white min-w-[16px] h-4 px-1" aria-label={`${unread} unread`}>
                  {unread > 60 ? "60+" : unread}
                </span>
              )}
              {t.id === "dms" && dmInbox.totalUnread > 0 && tab !== "dms" && (
                <span className="ml-1 inline-flex items-center justify-center text-[10px] font-bold rounded-full bg-rust text-white min-w-[16px] h-4 px-1" aria-label={`${dmInbox.totalUnread} unread conversations`}>
                  {dmInbox.totalUnread}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "tasks" && (
          <WorkspaceTasksPanel workspaceId={id} canEdit={ws.myRole !== "viewer"} members={ws.members} accent={accent} />
        )}

        {tab === "discussion" && (
          <WorkspaceDiscussionPanel workspaceId={id} members={ws.members} accent={accent} isAdmin={isAdmin} />
        )}

        {tab === "notes" && (
          <WorkspaceNotesPanel workspaceId={id} canEdit={ws.myRole !== "viewer"} accent={accent} />
        )}

        {tab === "files" && (
          <div className="glass rounded-2xl p-6">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold flex items-center gap-2 mb-1">
              <Paperclip className="size-5 text-emerald" /> Shared files
            </h2>
            <p className="text-sm text-muted mb-5 max-w-2xl">
              Drag-and-drop, paste, or click to upload. Up to 25 MB per file. Files attached to specific tasks or notes appear inline there — these are the floating ones.
            </p>
            <WorkspaceAttachments workspaceId={id} canEdit={ws.myRole !== "viewer"} attach={undefined} />
          </div>
        )}

        {tab === "sage" && (
          <WorkspaceSagePanel workspaceId={id} accent={accent} members={ws.members} />
        )}

        {tab === "dms" && (
          <WorkspaceDmInboxPanel workspaceId={id} accent={accent} members={ws.members} myUserId={user?.id} />
        )}

        {tab === "overview" && (
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <div className="space-y-6">
            {/* Personal 'your week here' insights */}
            <WorkspaceInsightsCard workspaceId={id} accent={accent} />

            {/* Sage's read — AI synthesis of the whole workspace */}
            <WorkspaceSynthesisCard workspaceId={id} accent={accent} />

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
              {/* Subscribe this workspace's deadlines into a calendar app */}
              {orderedDeadlines.length > 0 && (
                <div className="mt-4">
                  <WorkspaceCalendarSubscribeCard workspaceId={id} />
                </div>
              )}
            </section>

            {/* Activity */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold flex items-center gap-2">
                  <Activity className="size-5 text-amber" /> Activity
                  <span className="text-[10px] uppercase tracking-widest text-muted font-normal flex items-center gap-1.5 ml-1">
                    <span className="size-1.5 rounded-full bg-emerald animate-pulse" /> live
                  </span>
                </h2>
                <Link href={`/studio/workspaces/${id}/log`} className="text-xs text-emerald hover:underline">View all →</Link>
              </div>
              <Card className="p-5 max-h-[460px] overflow-y-auto">
                <WorkspaceActivityList activity={ws.activity} members={ws.members} />
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
                    {m.user_id !== user?.id && (
                      <button
                        onClick={() => setDmWith({ id: m.user_id, name: m.display_name || m.email || "Member" })}
                        className="size-7 rounded-lg text-muted hover:text-emerald hover:bg-emerald/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                        title={`Message ${m.display_name || m.email || "this member"} privately`}
                      >
                        <MessageSquare className="size-3.5" />
                      </button>
                    )}
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

      {duplicateOpen && (
        <DuplicateDialog
          sourceTitle={ws.workspace.title}
          accent={accent}
          onClose={() => setDuplicateOpen(false)}
          onDuplicated={(newId) => { setDuplicateOpen(false); router.push(`/studio/workspaces/${newId}`); }}
          workspaceId={id}
        />
      )}

      {dmWith && (
        <WorkspaceDmDialog
          workspaceId={id}
          withUserId={dmWith.id}
          withName={dmWith.name}
          accent={accent}
          members={ws.members}
          onClose={() => setDmWith(null)}
        />
      )}

      <WorkspaceSearchDialog
        workspaceId={id}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onJump={(t) => setTab(t)}
      />

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
          {d.recurrence_rule && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-emerald" title={describeRule(d.recurrence_rule)}>
              <Repeat className="size-2.5" /> {describeRule(d.recurrence_rule)}
            </span>
          )}
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
  // Recurrence — empty = one-shot. The picker compresses into one of:
  // none | daily | weekly:byDay[] | monthly. INTERVAL covers each.
  const [repeat, setRepeat] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [interval, setIntervalState] = useState(1);
  const [byDay, setByDay] = useState<WeekdayCode[]>([]);
  const [endKind, setEndKind] = useState<"never" | "count" | "until">("never");
  const [endCount, setEndCount] = useState(10);
  const [endUntil, setEndUntil] = useState("");
  // Smart parse: describe the deadline in words, let the agent fill the form.
  const [nlText, setNlText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsedNote, setParsedNote] = useState<string | null>(null);

  function buildRule(): RecurrenceRule | null {
    if (repeat === "none") return null;
    const rule: RecurrenceRule = { freq: repeat };
    if (interval > 1) rule.interval = interval;
    if (repeat === "weekly" && byDay.length > 0) rule.byDay = byDay;
    if (endKind === "count" && endCount > 0) rule.count = endCount;
    if (endKind === "until" && endUntil) rule.until = new Date(endUntil).toISOString();
    return rule;
  }

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
      recurrenceRule: buildRule(),
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

          <label className="block text-[10px] uppercase tracking-widest text-muted mb-2 flex items-center gap-1.5"><Repeat className="size-3" /> Repeat</label>
          <div className="flex gap-1.5 mb-3 flex-wrap">
            {(["none", "daily", "weekly", "monthly"] as const).map((r) => (
              <button key={r} onClick={() => setRepeat(r)} className={`px-3 py-1.5 rounded-full text-xs border transition ${repeat === r ? "border-emerald/60 bg-emerald/10 text-emerald" : "border-border text-muted hover:text-foreground"}`}>
                {r === "none" ? "One-shot" : r === "daily" ? "Daily" : r === "weekly" ? "Weekly" : "Monthly"}
              </button>
            ))}
          </div>
          {repeat !== "none" && (
            <div className="mb-4 p-3 rounded-xl border border-border bg-surface-2/30 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted">Every</span>
                <input type="number" min={1} max={365} value={interval} onChange={(e) => setIntervalState(Math.max(1, Math.min(365, Number(e.target.value) || 1)))} className="w-16 bg-surface-2 border border-border rounded-lg px-2 py-1 text-sm outline-none focus:border-emerald" />
                <span className="text-muted">{repeat === "daily" ? (interval === 1 ? "day" : "days") : repeat === "weekly" ? (interval === 1 ? "week" : "weeks") : (interval === 1 ? "month" : "months")}</span>
              </div>
              {repeat === "weekly" && (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">On</div>
                  <div className="flex gap-1">
                    {(["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as WeekdayCode[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => setByDay((cur) => cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d])}
                        className={`size-8 rounded-lg text-[11px] font-medium border transition ${byDay.includes(d) ? "border-emerald/60 bg-emerald/10 text-emerald" : "border-border text-muted hover:text-foreground"}`}
                        title={d}
                      >
                        {d[0]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Ends</div>
                <div className="flex gap-1.5 flex-wrap">
                  {(["never", "count", "until"] as const).map((k) => (
                    <button key={k} onClick={() => setEndKind(k)} className={`px-3 py-1 rounded-full text-[11px] border transition ${endKind === k ? "border-emerald/60 bg-emerald/10 text-emerald" : "border-border text-muted hover:text-foreground"}`}>
                      {k === "never" ? "Never" : k === "count" ? "After…" : "On…"}
                    </button>
                  ))}
                </div>
                {endKind === "count" && (
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <input type="number" min={1} max={999} value={endCount} onChange={(e) => setEndCount(Math.max(1, Math.min(999, Number(e.target.value) || 1)))} className="w-20 bg-surface-2 border border-border rounded-lg px-2 py-1 text-sm outline-none focus:border-emerald" />
                    <span className="text-muted">occurrences</span>
                  </div>
                )}
                {endKind === "until" && (
                  <input type="date" value={endUntil} onChange={(e) => setEndUntil(e.target.value)} className="mt-2 bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-emerald" />
                )}
              </div>
              <p className="text-[11px] text-emerald">{buildRule() ? describeRule(buildRule()!) : ""}</p>
            </div>
          )}

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

function DuplicateDialog({ workspaceId, sourceTitle, accent, onClose, onDuplicated }: {
  workspaceId: string; sourceTitle: string; accent: string; onClose: () => void; onDuplicated: (newId: string) => void;
}) {
  const [title, setTitle] = useState(`${sourceTitle} (copy)`);
  const [copyDeadlines, setCopyDeadlines] = useState(false);
  const [shiftDays, setShiftDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!title.trim()) { setErr("Give the new workspace a title."); return; }
    setBusy(true); setErr(null);
    const r = await workspaceApi.duplicate(workspaceId, { title: title.trim(), copyDeadlines, shiftDeadlinesDays: shiftDays });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onDuplicated(r.id);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-5 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="glass rounded-3xl max-w-md w-full p-7 relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="absolute -top-20 -right-20 size-48 rounded-full blur-3xl opacity-25" style={{ background: accent }} />
        <div className="relative">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold mb-1">Duplicate this workspace</h2>
          <p className="text-sm text-muted mb-5">
            Copies the task board structure (subtasks too) and note titles. Discussion, files, and members stay behind — you start fresh as the owner.
          </p>

          <label className="block text-[10px] uppercase tracking-widest text-muted mb-2">New title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald mb-5" />

          <label className="flex items-center gap-2 text-sm cursor-pointer mb-3">
            <input type="checkbox" checked={copyDeadlines} onChange={(e) => setCopyDeadlines(e.target.checked)} className="accent-emerald" />
            Also copy deadlines (open only, dates shifted forward)
          </label>
          {copyDeadlines && (
            <div className="flex items-center gap-2 text-sm mb-5 pl-6">
              <span className="text-muted">Shift forward by</span>
              <input type="number" min={0} max={365} value={shiftDays} onChange={(e) => setShiftDays(Math.max(0, Math.min(365, Number(e.target.value) || 0)))} className="w-16 bg-surface-2 border border-border rounded-lg px-2 py-1 text-sm outline-none focus:border-emerald" />
              <span className="text-muted">days</span>
            </div>
          )}

          {err && <p className="text-xs text-rust mb-3">{err}</p>}

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <CopyPlus className="size-3.5" />}
              Create copy
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
