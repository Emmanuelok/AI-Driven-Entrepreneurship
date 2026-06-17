"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { useStore } from "@/store";
import { workspaceApi, type Workspace, type WorkspaceMember, type WorkspaceDeadline, type WorkspaceActivity, type WorkspaceInvite, type WorkspaceRole, type WorkspaceListing } from "@/lib/workspace-api";
import type { RealtimeChannel } from "@supabase/supabase-js";

// useWorkspace(id) — the live "I'm in this workspace" hook.
//
// What it does:
//   1. Fetches the full workspace bundle (workspace + members + deadlines
//      + activity + invites + my role).
//   2. Subscribes to the workspace's Supabase realtime channel for both
//      postgres_changes (members/deadlines/activity changing on the
//      server) and presence (who else is in here right now).
//   3. Exposes a refetch() so callers can refresh after mutations
//      without waiting for the realtime echo.
//
// Re-render economy: we keep the channel alive across re-renders by
// pinning it in a ref and only tear down when the workspace id or the
// signed-in user id changes.

export type WorkspacePresence = { userId: string; name: string };

export type WorkspaceState = {
  loading: boolean;
  error: string | null;
  workspace: Workspace | null;
  members: WorkspaceMember[];
  deadlines: WorkspaceDeadline[];
  activity: WorkspaceActivity[];
  invites: WorkspaceInvite[];
  myRole: WorkspaceRole | null;
  presence: WorkspacePresence[];
  refetch: () => Promise<void>;
};

const INIT: Omit<WorkspaceState, "refetch"> = {
  loading: true,
  error: null,
  workspace: null,
  members: [],
  deadlines: [],
  activity: [],
  invites: [],
  myRole: null,
  presence: [],
};

export function useWorkspace(id: string | null | undefined): WorkspaceState {
  const { user } = useStore();
  const [state, setState] = useState<Omit<WorkspaceState, "refetch">>(INIT);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const refetch = useCallback(async () => {
    if (!id) return;
    const res = await workspaceApi.get(id);
    if (!res.ok) {
      setState((s) => ({ ...s, loading: false, error: res.error }));
      return;
    }
    setState((s) => ({
      ...s,
      loading: false,
      error: null,
      workspace: res.workspace,
      members: res.members,
      deadlines: res.deadlines,
      activity: res.activity,
      invites: res.invites,
      myRole: res.myRole,
    }));
  }, [id]);

  // Initial load whenever the id changes.
  useEffect(() => {
    if (!id) {
      setState(INIT);
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    void refetch();
  }, [id, refetch]);

  // Realtime channel — postgres_changes for content + presence for
  // "who's in the room". One channel per workspace, identified by user
  // so a refresh leaves a clean track behind.
  useEffect(() => {
    if (!id || !user) return;
    const sb = supabaseBrowser();
    if (!sb) return;

    const ch = sb.channel(`workspace:${id}`, { config: { presence: { key: user.id } } });

    // Any change to members/deadlines/activity → refetch the bundle.
    // It's chattier than a precise patch but keeps client state simple
    // and consistent under concurrency. Workspaces are small enough
    // that this is cheap.
    const onChange = () => { void refetch(); };
    ch.on("postgres_changes" as never, { event: "*", schema: "public", table: "workspace_members", filter: `workspace_id=eq.${id}` }, onChange);
    ch.on("postgres_changes" as never, { event: "*", schema: "public", table: "workspace_deadlines", filter: `workspace_id=eq.${id}` }, onChange);
    ch.on("postgres_changes" as never, { event: "*", schema: "public", table: "workspace_activity", filter: `workspace_id=eq.${id}` }, onChange);
    ch.on("postgres_changes" as never, { event: "UPDATE", schema: "public", table: "workspaces", filter: `id=eq.${id}` }, onChange);

    ch.on("presence", { event: "sync" }, () => {
      const raw = ch.presenceState() as Record<string, Array<{ user_id?: string; name?: string }>>;
      const seen = new Set<string>();
      const presence: WorkspacePresence[] = [];
      for (const arr of Object.values(raw)) {
        for (const p of arr) {
          if (!p.user_id || seen.has(p.user_id)) continue;
          seen.add(p.user_id);
          presence.push({ userId: p.user_id, name: p.name || "Member" });
        }
      }
      setState((s) => ({ ...s, presence }));
    });

    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ user_id: user.id, name: user.name || "Member" });
      }
    });
    channelRef.current = ch;

    return () => {
      void ch.untrack().catch(() => {});
      void sb.removeChannel(ch);
      channelRef.current = null;
    };
  }, [id, user?.id, user?.name, refetch]);

  return { ...state, refetch };
}

// useMyWorkspaces — the list view's data hook. Pure REST; the live
// updates come from re-mounting after a create/join.
export function useMyWorkspaces(opts?: { includeArchived?: boolean }): {
  loading: boolean;
  results: WorkspaceListing[];
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<{ loading: boolean; results: WorkspaceListing[]; error: string | null }>({
    loading: true,
    results: [],
    error: null,
  });

  const includeArchived = !!opts?.includeArchived;
  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    const res = await workspaceApi.list({ includeArchived });
    if (!res.ok) {
      setState({ loading: false, results: [], error: res.error });
      return;
    }
    setState({ loading: false, results: res.results, error: null });
  }, [includeArchived]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { ...state, refresh };
}
