"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { useBuild, type BuildChatMessage } from "@/store/build";

// Replace chat array in the local zustand store. Goes through setState
// directly because there's no action that wholesale-replaces chat —
// we don't want to expose one (only sync flows should overwrite chat).
function applyRemoteChat(projectId: string, chat: BuildChatMessage[]) {
  useBuild.setState((s) => ({
    projects: s.projects.map((p) => p.id === projectId ? { ...p, chat, updatedAt: Date.now() } : p),
  }));
}

// Cloud-build collaboration layer. Mirrors lib/cloud-venture.ts: opts a
// local build into a cloud row, subscribes to a Realtime channel, syncs
// patches both directions through the existing zustand build store so
// the AI Build Studio UI keeps working unchanged.

export type CloudBuildMember = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: "owner" | "editor" | "viewer";
};

export type CloudBuildState = {
  isCloud: boolean;
  loading: boolean;
  error: string | null;
  myRole: "owner" | "editor" | "viewer" | null;
  members: CloudBuildMember[];
  pendingInvites: Array<{ id: string; email: string; role: string }>;
  presence: Array<{ userId: string; name: string }>;
  serverUpdatedAt: string | null;
};

const PUSH_DEBOUNCE_MS = 1200;            // a little longer than venture — builds churn faster
const PRESENCE_HEARTBEAT_MS = 30_000;

type Wiring = {
  pushTimer: ReturnType<typeof setTimeout> | null;
  lastLocalSnapshot: string;
  channel: ReturnType<NonNullable<ReturnType<typeof supabaseBrowser>>["channel"]> | null;
  presenceInterval: ReturnType<typeof setInterval> | null;
  refCount: number;
};
const wirings = new Map<string, Wiring>();

function ensureWiring(id: string): Wiring {
  let w = wirings.get(id);
  if (!w) {
    w = { pushTimer: null, lastLocalSnapshot: "", channel: null, presenceInterval: null, refCount: 0 };
    wirings.set(id, w);
  }
  w.refCount++;
  return w;
}

function releaseWiring(id: string) {
  const w = wirings.get(id);
  if (!w) return;
  w.refCount--;
  if (w.refCount <= 0) {
    if (w.pushTimer) clearTimeout(w.pushTimer);
    if (w.presenceInterval) clearInterval(w.presenceInterval);
    if (w.channel) {
      const sb = supabaseBrowser();
      if (sb) sb.removeChannel(w.channel);
    }
    wirings.delete(id);
  }
}

export function useCloudBuild(id: string) {
  const project = useBuild((s) => s.projects.find((p) => p.id === id));
  const updateCode = useBuild((s) => s.updateCode);
  // For full state restoration we go directly to the persisted store —
  // updating each field would require many actions.
  // We patch through a low-level set in the hook below.

  const [state, setState] = useState<CloudBuildState>({
    isCloud: false,
    loading: true,
    error: null,
    myRole: null,
    members: [],
    pendingInvites: [],
    presence: [],
    serverUpdatedAt: null,
  });

  const suppressNextPush = useRef(false);

  const fetchMeta = useCallback(async () => {
    try {
      const sb = supabaseBrowser();
      if (!sb) { setState((s) => ({ ...s, loading: false, isCloud: false })); return; }
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setState((s) => ({ ...s, loading: false, isCloud: false })); return; }

      const headers = { Authorization: `Bearer ${session.access_token}` };
      const [vRes, cRes] = await Promise.all([
        fetch(`/api/v2/builds/${id}`, { headers }),
        fetch(`/api/v2/builds/${id}/collaborators`, { headers }),
      ]);
      if (vRes.status === 403 || vRes.status === 404) {
        setState({ isCloud: false, loading: false, error: null, myRole: null, members: [], pendingInvites: [], presence: [], serverUpdatedAt: null });
        return;
      }
      const vData = await vRes.json();
      const cData = await cRes.json();

      // Apply remote state to local store. Code drives the live
      // preview; chat is the shared conversation with Sage (append-only
      // by convention — but the whole array is overwritten on sync so
      // simultaneous senders converge by LWW). Version log stays local
      // per device — it's personal undo history, not collaborative.
      if (vData.ok && vData.build?.data?.code) {
        suppressNextPush.current = true;
        updateCode(id, vData.build.data.code as string, "Pulled from cloud", "human");
      }
      if (vData.ok && Array.isArray(vData.build?.data?.chat)) {
        applyRemoteChat(id, vData.build.data.chat);
      }

      setState({
        isCloud: !!vData.ok,
        loading: false,
        error: vData.error || null,
        myRole: (vData.myRole ?? null) as CloudBuildState["myRole"],
        members: cData.collaborators ?? [],
        pendingInvites: cData.pendingInvites ?? [],
        presence: [],
        serverUpdatedAt: vData.build?.updated_at ?? null,
      });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    const w = ensureWiring(id);

    (async () => {
      await fetchMeta();
      if (cancelled) return;

      const sb = supabaseBrowser();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;

      if (!w.channel) {
        const channel = sb.channel(`build:${id}`, { config: { presence: { key: session.user.id } } });
        channel
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "cloud_builds", filter: `id=eq.${id}` }, (payload) => {
            const next = payload.new as { data: { code?: string; chat?: BuildChatMessage[] }; updated_at: string };
            if (next.data?.code !== undefined) {
              suppressNextPush.current = true;
              updateCode(id, next.data.code, "Remote update", "human");
            }
            if (Array.isArray(next.data?.chat)) {
              applyRemoteChat(id, next.data.chat);
            }
            setState((s) => ({ ...s, serverUpdatedAt: next.updated_at }));
          })
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "build_collaborators", filter: `build_id=eq.${id}` }, () => fetchMeta())
          .on("postgres_changes", { event: "DELETE", schema: "public", table: "build_collaborators", filter: `build_id=eq.${id}` }, () => fetchMeta())
          .on("presence", { event: "sync" }, () => {
            const raw = channel.presenceState() as Record<string, Array<{ user_id?: string; name?: string }>>;
            const presence: Array<{ userId: string; name: string }> = [];
            for (const [, entries] of Object.entries(raw)) {
              for (const e of entries) {
                if (e.user_id) presence.push({ userId: e.user_id, name: e.name || "anonymous" });
              }
            }
            const seen = new Set<string>();
            const unique = presence.filter((p) => seen.has(p.userId) ? false : (seen.add(p.userId), true));
            setState((s) => ({ ...s, presence: unique }));
          })
          .subscribe(async (status) => {
            if (status === "SUBSCRIBED") {
              const meta = (session.user.user_metadata ?? {}) as { name?: string; full_name?: string };
              const name = meta.name || meta.full_name || (session.user.email ?? "").split("@")[0] || "you";
              await channel.track({ user_id: session.user.id, name });
            }
          });
        w.channel = channel;

        w.presenceInterval = setInterval(() => {
          channel.track({ user_id: session.user.id, name: (session.user.email ?? "").split("@")[0] || "you" }).catch(() => undefined);
        }, PRESENCE_HEARTBEAT_MS);
      }
    })();

    return () => {
      cancelled = true;
      releaseWiring(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Watch local project; debounce-push code changes (the most valuable
  // collaborative field) up to the cloud row.
  useEffect(() => {
    if (!state.isCloud) return;
    if (!project) return;
    if (state.myRole === "viewer") return;

    if (suppressNextPush.current) {
      suppressNextPush.current = false;
      return;
    }

    // Snapshot the collaborative surface: code + chat. Versions stay
    // local; they're personal undo history, not pair-program state.
    const snapshot = JSON.stringify({ code: project.code, chatLen: project.chat.length, lastChatId: project.chat[project.chat.length - 1]?.id ?? null });
    const w = wirings.get(id);
    if (!w) return;
    if (w.lastLocalSnapshot === snapshot) return;
    w.lastLocalSnapshot = snapshot;

    if (w.pushTimer) clearTimeout(w.pushTimer);
    w.pushTimer = setTimeout(async () => {
      try {
        const sb = supabaseBrowser();
        if (!sb) return;
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return;
        const res = await fetch(`/api/v2/builds/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ data: { code: project.code, chat: project.chat }, name: project.name }),
        });
        const data = await res.json();
        if (data.ok && data.updatedAt) setState((s) => ({ ...s, serverUpdatedAt: data.updatedAt }));
      } catch {
        // Tolerated — next change retries.
      }
    }, PUSH_DEBOUNCE_MS);
  }, [id, project?.code, project?.name, project?.chat.length, state.isCloud, state.myRole]);

  const upgrade = useCallback(async () => {
    if (!project) return { ok: false, error: "no_local_build" };
    try {
      const sb = supabaseBrowser();
      if (!sb) return { ok: false, error: "Cloud sync isn't configured." };
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return { ok: false, error: "Sign in first." };
      const res = await fetch("/api/v2/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id: project.id, name: project.name, data: { code: project.code, chat: project.chat, templateId: project.templateId } }),
      });
      const data = await res.json();
      if (!data.ok) return { ok: false, error: data.error || "Couldn't promote build" };
      await fetchMeta();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }, [project, fetchMeta]);

  const inviteByEmail = useCallback(async (email: string, role: "editor" | "viewer" = "editor") => {
    try {
      const sb = supabaseBrowser();
      if (!sb) return { ok: false, error: "Cloud sync isn't configured." };
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return { ok: false, error: "Sign in first." };
      const res = await fetch(`/api/v2/builds/${id}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (data.ok) await fetchMeta();
      return data;
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }, [id, fetchMeta]);

  const removeMember = useCallback(async (userId: string) => {
    try {
      const sb = supabaseBrowser();
      if (!sb) return { ok: false };
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return { ok: false };
      const res = await fetch(`/api/v2/builds/${id}/collaborators?userId=${encodeURIComponent(userId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (data.ok) await fetchMeta();
      return data;
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }, [id, fetchMeta]);

  const revokeInvite = useCallback(async (inviteId: string) => {
    try {
      const sb = supabaseBrowser();
      if (!sb) return { ok: false };
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return { ok: false };
      const res = await fetch(`/api/v2/builds/${id}/invites?id=${encodeURIComponent(inviteId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (data.ok) await fetchMeta();
      return data;
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }, [id, fetchMeta]);

  return { ...state, upgrade, inviteByEmail, removeMember, revokeInvite };
}
