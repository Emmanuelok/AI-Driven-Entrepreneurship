"use client";

import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import {
  Sparkles, UserPlus, UserMinus, Calendar, CheckCircle2, AlertCircle,
  Pencil, Paperclip, MessageSquare, KanbanSquare, FileText, Link2,
  Archive, CopyPlus, Brain,
} from "lucide-react";
import { colorFromUserId } from "@/lib/flow-presence";
import type { WorkspaceActivity, WorkspaceMember } from "@/lib/workspace-api";

// Kind → icon + tint mapping. Driven by the activity row's `kind`
// column which is open-ended on purpose (so new triggers can be added
// without a migration). Unknown kinds fall through to a soft default
// rather than throwing.
type Tone = "emerald" | "amber" | "rust" | "indigo" | "muted";
const KIND_META: Record<string, { Icon: typeof Sparkles; tone: Tone }> = {
  joined: { Icon: UserPlus, tone: "emerald" },
  left: { Icon: UserMinus, tone: "muted" },
  removed: { Icon: UserMinus, tone: "rust" },
  created: { Icon: Sparkles, tone: "emerald" },
  deadline_added: { Icon: Calendar, tone: "indigo" },
  deadline_done: { Icon: CheckCircle2, tone: "emerald" },
  deadline_missed: { Icon: AlertCircle, tone: "rust" },
  content_edit: { Icon: Pencil, tone: "muted" },
  invite_created: { Icon: Link2, tone: "amber" },
  file_added: { Icon: Paperclip, tone: "indigo" },
  comment: { Icon: MessageSquare, tone: "emerald" },
  task_added: { Icon: KanbanSquare, tone: "amber" },
  task_done: { Icon: CheckCircle2, tone: "emerald" },
  doc_created: { Icon: FileText, tone: "indigo" },
  archived: { Icon: Archive, tone: "muted" },
  unarchived: { Icon: Archive, tone: "emerald" },
  duplicated: { Icon: CopyPlus, tone: "indigo" },
  agent_run: { Icon: Brain, tone: "emerald" },
};

const TONE_BG: Record<Tone, string> = {
  emerald: "bg-emerald/15 text-emerald border border-emerald/25",
  amber: "bg-amber/15 text-amber border border-amber/25",
  rust: "bg-rust/15 text-rust border border-rust/25",
  indigo: "bg-indigo/15 text-indigo border border-indigo/25",
  muted: "bg-surface-2 text-muted border border-border",
};

export function WorkspaceActivityList({ activity, members }: {
  activity: WorkspaceActivity[];
  members: WorkspaceMember[];
}) {
  if (activity.length === 0) {
    return <p className="text-xs text-muted italic">Nothing yet. As members join, set deadlines, or edit content, it shows up here in real time.</p>;
  }

  // Build a quick userId → display name map so we don't iterate the
  // member list for every row.
  const nameByUser = new Map<string, string>();
  for (const m of members) nameByUser.set(m.user_id, m.display_name || m.email || "Member");

  return (
    <ol className="space-y-2.5">
      <AnimatePresence initial={false}>
        {activity.map((a) => {
          const meta = KIND_META[a.kind] ?? { Icon: Sparkles, tone: "muted" as Tone };
          const actorName = a.user_id ? (nameByUser.get(a.user_id) ?? "Member") : "System";
          const initials = actorName[0]?.toUpperCase() ?? "?";
          // Deterministic per-user color via the existing colorFromUserId
          // (same helper used for presence chips), so the same person
          // always looks the same here as in Flow/Discussion.
          const avatarColor = a.user_id ? colorFromUserId(a.user_id) : "#1f2c28";
          return (
            <motion.li
              key={a.id}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="flex gap-3"
            >
              <div className="relative shrink-0">
                <div className="size-7 rounded-full flex items-center justify-center text-black font-semibold text-[10px]" style={{ background: avatarColor }} title={actorName}>
                  {initials}
                </div>
                <span className={`absolute -bottom-1 -right-1 size-4 rounded-full flex items-center justify-center ${TONE_BG[meta.tone]}`} title={a.kind}>
                  <meta.Icon className="size-2.5" />
                </span>
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="text-sm leading-snug">
                  <span className="text-foreground/90">{a.title}</span>
                </div>
                {a.body && <div className="text-xs text-muted truncate mt-0.5" title={a.body}>{a.body}</div>}
                <div className="text-[10px] text-muted mt-0.5" title={new Date(a.created_at).toLocaleString()}>
                  {actorName} · {formatDistanceToNow(new Date(a.created_at))} ago
                </div>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}
