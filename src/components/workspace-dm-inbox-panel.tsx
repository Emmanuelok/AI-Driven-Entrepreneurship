"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useDmInbox, type DmThreadRow } from "@/lib/use-dm-inbox";
import { MessageSquare, Loader2, UserPlus, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { WorkspaceMember } from "@/lib/workspace-api";

const WorkspaceDmDialog = dynamic(() => import("@/components/workspace-dm-dialog").then((m) => m.WorkspaceDmDialog), { ssr: false });

// The DM inbox: every conversation you have in this workspace, with
// unread badges, the other party's name + last-message preview, and
// "Last activity" sort. Includes a 'New conversation' picker so the
// user can start a DM without going to the member roster.
export function WorkspaceDmInboxPanel({ workspaceId, accent, members, myUserId }: {
  workspaceId: string;
  accent: string;
  members: WorkspaceMember[];
  myUserId: string | undefined;
}) {
  const { rows, loading, refresh } = useDmInbox(workspaceId);
  const [open, setOpen] = useState<{ id: string; name: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");

  const others = members.filter((m) => m.user_id !== myUserId);
  const matches = others.filter((m) => {
    if (!q.trim()) return true;
    const name = (m.display_name || m.email || "").toLowerCase();
    return name.includes(q.trim().toLowerCase());
  });

  return (
    <div className="glass rounded-2xl flex flex-col h-[640px] overflow-hidden relative">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-20 right-0 size-56 rounded-full blur-3xl opacity-15" style={{ background: accent }} />
      </div>

      <div className="relative flex items-center justify-between gap-3 px-5 py-3.5 border-b border-border">
        <div>
          <h2 className="font-medium text-sm flex items-center gap-1.5">
            <MessageSquare className="size-3.5 text-emerald" /> Direct messages
          </h2>
          <p className="text-[11px] text-muted">Private 1-on-1 conversations with members of this workspace.</p>
        </div>
        <button
          onClick={() => setPicking(true)}
          className="text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border hover:border-emerald/40 hover:bg-emerald/5 transition"
        >
          <UserPlus className="size-3.5" /> New
        </button>
      </div>

      <div className="relative flex-1 overflow-y-auto">
        {loading ? (
          <div className="h-full flex items-center justify-center"><Loader2 className="size-5 text-emerald animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="size-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: `${accent}1F`, border: `1px solid ${accent}55` }}>
              <MessageSquare className="size-5" style={{ color: accent }} />
            </div>
            <p className="text-sm text-muted max-w-xs mb-4">
              No direct messages yet. Start a private 1-on-1 with anyone in the workspace.
            </p>
            <button onClick={() => setPicking(true)} className="text-xs text-emerald hover:underline inline-flex items-center gap-1.5">
              <UserPlus className="size-3" /> Start a conversation
            </button>
          </div>
        ) : (
          <ul className="p-2 space-y-1">
            {rows.map((r) => (
              <DmRow key={r.id} row={r} onOpen={() => setOpen({ id: r.with_user_id, name: r.with_name })} />
            ))}
          </ul>
        )}
      </div>

      {/* New-conversation picker overlay */}
      {picking && (
        <div className="absolute inset-0 z-10 bg-background/85 backdrop-blur-sm flex flex-col">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Search className="size-4 text-emerald" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search members…"
              className="flex-1 bg-transparent outline-none text-sm"
            />
            <button onClick={() => { setPicking(false); setQ(""); }} className="text-xs text-muted hover:text-foreground px-2">Cancel</button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {matches.length === 0 ? (
              <p className="text-center text-xs text-muted italic py-8">No members match.</p>
            ) : (
              <ul className="space-y-0.5">
                {matches.map((m) => (
                  <li key={m.user_id}>
                    <button
                      onClick={() => {
                        const name = m.display_name || m.email || "Member";
                        setOpen({ id: m.user_id, name });
                        setPicking(false);
                        setQ("");
                      }}
                      className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-2/60 transition"
                    >
                      <div className="size-8 rounded-full bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-semibold text-xs shrink-0">
                        {(m.display_name || m.email || "?")[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{m.display_name || m.email || "Member"}</div>
                        <div className="text-[10px] text-muted">{m.role}</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {open && (
        <WorkspaceDmDialog
          workspaceId={workspaceId}
          withUserId={open.id}
          withName={open.name}
          accent={accent}
          members={members}
          onClose={() => { setOpen(null); void refresh(); }}
        />
      )}
    </div>
  );
}

function DmRow({ row, onOpen }: { row: DmThreadRow; onOpen: () => void }) {
  return (
    <li>
      <button
        onClick={onOpen}
        className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg transition ${row.unread ? "bg-emerald/5 hover:bg-emerald/10" : "hover:bg-surface-2/60"}`}
      >
        <div className="relative shrink-0">
          <div className="size-9 rounded-full bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-semibold text-xs">
            {row.with_name[0]?.toUpperCase() ?? "?"}
          </div>
          {row.unread && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-rust border-2 border-background" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm truncate ${row.unread ? "font-semibold text-foreground" : "font-medium text-foreground/90"}`}>{row.with_name}</span>
            <span className="ml-auto text-[10px] text-muted shrink-0">{formatDistanceToNow(new Date(row.last_message_at))} ago</span>
          </div>
          {row.last_message_preview ? (
            <p className={`text-xs truncate mt-0.5 ${row.unread ? "text-foreground/80" : "text-muted"}`}>
              {row.last_message_was_mine && <span className="text-muted">You: </span>}
              {row.last_message_preview}
            </p>
          ) : (
            <p className="text-xs text-muted italic mt-0.5">No messages yet.</p>
          )}
        </div>
      </button>
    </li>
  );
}
