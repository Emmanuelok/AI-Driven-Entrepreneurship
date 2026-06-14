"use client";

import { useEffect } from "react";
import { useStore } from "@/store";
import { useMe } from "@/store/me";
import { useLetters } from "@/store/letters";
import { dueWindow, type DeadlineRow } from "@/lib/deadline-schedule";
import { buildSiteContextSnapshotAsync } from "@/lib/site-brain-snapshot";
import { genomeVoiceInstruction } from "@/lib/genome";
import type { WorkspaceDeadline, WorkspaceMember, Workspace, WorkspaceRole } from "@/lib/workspace-api";

// usePersonalWorkspaceAgent — the agentic auto-engine for a single
// workspace room.
//
// Watches three triggers per signed-in user:
//   1. welcome           — first time we observe a workspace I'm a
//                          member of with no prior memory, fire once.
//                          On rehydration we DON'T fire (the baseline
//                          marks us welcomed).
//   2. deadline_focus    — when any of my open deadlines enters the
//                          urgent window (1d or 6h), fire once per
//                          deadline. Re-fire is gated by the per-
//                          deadline key in workspaceSeen.fired.
//   3. stage_progress    — when I close a deadline (status → done),
//                          fire once per deadline.
//
// All fires go through /api/generate/workspace-agent and the result is
// dropped into useLetters() so the user finds it in their Letters inbox.
// We also push an in-app notification so the bell flashes.

type Args = {
  workspace: Workspace | null;
  members: WorkspaceMember[];
  deadlines: WorkspaceDeadline[];
  myRole: WorkspaceRole | null;
};

export function usePersonalWorkspaceAgent({ workspace, members, deadlines, myRole }: Args) {
  const { user, notify } = useStore();
  const { genome, workspaceSeen, setWorkspaceSeen } = useMe();
  const { writeLetter } = useLetters();

  // Build a stable signature of MY deadlines + their windows so the
  // effect re-runs precisely when something changes for me. Including
  // the workspace id + my user id guarantees we re-baseline if the
  // signed-in user swaps.
  const mineSig = !workspace || !user
    ? ""
    : `${workspace.id}:${user.id}:${myRole}|${deadlines
        .filter((d) => d.assignee_user_id === user.id || d.assignee_user_id === null)
        .map((d) => `${d.id}:${d.status}:${dueWindow(asScheduleRow(d), Date.now()) || "-"}`)
        .join(",")}`;

  useEffect(() => {
    if (!workspace || !user || !myRole) return;

    const seen = workspaceSeen[workspace.id];
    const fired = new Set<string>(seen?.fired ?? []);
    const now = Date.now();

    // First sight of this workspace by this device → baseline. Mark
    // any current "would-have-fired" trigger as already-fired so we
    // never replay history. The watcher's job is to react to NEW
    // events; rehydration must be a no-op.
    if (!seen) {
      fired.add("welcome");
      for (const d of deadlines) {
        if (d.assignee_user_id !== user.id && d.assignee_user_id !== null) continue;
        const w = dueWindow(asScheduleRow(d), now);
        if (w === "1d" || w === "6h" || w === "overdue") fired.add(`deadline_focus:${d.id}`);
        if (d.status === "done") fired.add(`stage_progress:${d.id}`);
      }
      setWorkspaceSeen(workspace.id, { fired: Array.from(fired), baselinedAt: now });
      return;
    }

    // Now react to NEW triggers.
    const fires: { key: string; trigger: "welcome" | "deadline_focus" | "stage_progress"; context: string; recipientLine: string }[] = [];
    const me = members.find((m) => m.user_id === user.id);
    const recipientName = me?.display_name || user.name || "there";

    if (!fired.has("welcome")) {
      fires.push({
        key: "welcome",
        trigger: "welcome",
        recipientLine: recipientName,
        context: `Recipient role: ${myRole}. Workspace was created ${new Date(workspace.created_at).toUTCString()}. There are ${members.length} members so far.`,
      });
    }

    for (const d of deadlines) {
      const mine = d.assignee_user_id === user.id || d.assignee_user_id === null;
      if (!mine) continue;
      const w = dueWindow(asScheduleRow(d), now);
      if ((w === "1d" || w === "6h") && d.status === "open") {
        const key = `deadline_focus:${d.id}`;
        if (!fired.has(key)) {
          fires.push({
            key,
            trigger: "deadline_focus",
            recipientLine: recipientName,
            context: `Deadline "${d.title}" is due ${new Date(d.due_at).toUTCString()}. Set by ${d.set_by_role}. Detail: ${d.detail || "(none)"}.`,
          });
        }
      }
      if (d.status === "done") {
        const key = `stage_progress:${d.id}`;
        if (!fired.has(key)) {
          fires.push({
            key,
            trigger: "stage_progress",
            recipientLine: recipientName,
            context: `Just closed: "${d.title}" (was set by ${d.set_by_role}).`,
          });
        }
      }
    }

    if (fires.length === 0) return;

    let cancelled = false;
    (async () => {
      const siteContext = await buildSiteContextSnapshotAsync("workspace-agent");
      const voice = (() => { try { return genomeVoiceInstruction(genome); } catch { return undefined; } })();

      for (const f of fires) {
        if (cancelled) return;
        try {
          const res = await fetch("/api/generate/workspace-agent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              trigger: f.trigger,
              workspaceTitle: workspace.title,
              workspaceKind: workspace.kind,
              recipientName: f.recipientLine,
              recipientRole: myRole,
              context: f.context,
              genomeVoice: voice,
              siteContext,
            }),
          });
          if (!res.ok) continue;
          const data = (await res.json()) as { title?: string; body?: string };
          if (!data.title || !data.body) continue;
          writeLetter({
            reason: `workspace:${f.trigger}`,
            title: data.title,
            body: data.body,
            triggeredBy: `${workspace.id}:${f.key}`,
            cta: { label: `Open ${workspace.title}`, href: `/studio/workspaces/${workspace.id}` },
          });
          notify({
            title: data.title,
            body: f.trigger === "welcome" ? "Sage wrote you a welcome letter." : "Sage wrote you a note.",
            href: `/studio/letters`,
          });
        } catch { /* swallow — the agent is best-effort, not critical */ }
        fired.add(f.key);
      }

      if (!cancelled) {
        setWorkspaceSeen(workspace.id, { fired: Array.from(fired), baselinedAt: now });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mineSig]);
}

function asScheduleRow(d: WorkspaceDeadline): DeadlineRow {
  return {
    id: d.id,
    workspace_id: d.workspace_id,
    assignee_user_id: d.assignee_user_id,
    title: d.title,
    due_at: d.due_at,
    status: d.status,
    set_by_role: d.set_by_role,
    last_reminded_at: d.last_reminded_at,
  };
}
