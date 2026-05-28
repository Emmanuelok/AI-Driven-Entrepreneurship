"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { useStore } from "@/store";

// Cloud venture state: a thin layer over /api/v2/ventures/:id with
// Supabase Realtime for live updates. Sits ALONGSIDE the existing
// local zustand venture store — the hook keeps the local store
// authoritative for reads (so the 12 venture subpages keep working
// unchanged) and pushes patches up to the cloud row, then listens
// for peer updates and writes them back into local.
//
// Conflict resolution: last-write-wins by server updated_at. Each
// local change debounces a PATCH; incoming Realtime events update the
// local store. No CRDT — good enough for tight pair-collab.

export type CloudVentureMember = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: "owner" | "editor" | "viewer";
};

export type CloudVentureState = {
  isCloud: boolean;                         // is the venture promoted to the cloud?
  loading: boolean;
  error: string | null;
  myRole: "owner" | "editor" | "viewer" | null;
  members: CloudVentureMember[];
  pendingInvites: Array<{ id: string; email: string; role: string }>;
  presence: Array<{ userId: string; name: string }>;
  serverUpdatedAt: string | null;
};

const PUSH_DEBOUNCE_MS = 800;
const PRESENCE_HEARTBEAT_MS = 30_000;

// Tracks per-venture sync wiring so two tabs viewing the same venture
// don't double-subscribe.
type Wiring = {
  pushTimer: ReturnType<typeof setTimeout> | null;
  lastLocalSnapshot: string;                // JSON of last pushed data
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

export function useCloudVenture(id: string) {
  const venture = useStore((s) => s.ventures.find((v) => v.id === id));
  const updateVenture = useStore((s) => s.updateVenture);

  const [state, setState] = useState<CloudVentureState>({
    isCloud: false,
    loading: true,
    error: null,
    myRole: null,
    members: [],
    pendingInvites: [],
    presence: [],
    serverUpdatedAt: null,
  });

  // Avoid pushing local changes back up when we just applied a remote one.
  const suppressNextPush = useRef(false);

  const fetchMeta = useCallback(async () => {
    try {
      const sb = supabaseBrowser();
      if (!sb) { setState((s) => ({ ...s, loading: false, isCloud: false })); return; }
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setState((s) => ({ ...s, loading: false, isCloud: false })); return; }

      const headers = { Authorization: `Bearer ${session.access_token}` };
      const [vRes, cRes] = await Promise.all([
        fetch(`/api/v2/ventures/${id}`, { headers }),
        fetch(`/api/v2/ventures/${id}/collaborators`, { headers }),
      ]);
      if (vRes.status === 403 || vRes.status === 404) {
        setState({ isCloud: false, loading: false, error: null, myRole: null, members: [], pendingInvites: [], presence: [], serverUpdatedAt: null });
        return;
      }
      const vData = await vRes.json();
      const cData = await cRes.json();

      // Pull server data into the local store (overwrite) — the cloud
      // is authoritative once promoted.
      if (vData.ok && vData.venture?.data && Object.keys(vData.venture.data).length > 0) {
        suppressNextPush.current = true;
        updateVenture(id, vData.venture.data);
      }

      setState({
        isCloud: !!vData.ok,
        loading: false,
        error: vData.error || null,
        myRole: (vData.myRole ?? null) as CloudVentureState["myRole"],
        members: cData.collaborators ?? [],
        pendingInvites: cData.pendingInvites ?? [],
        presence: [],
        serverUpdatedAt: vData.venture?.updated_at ?? null,
      });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Initial fetch + subscribe.
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

      // Postgres-changes channel: incoming updates to the cloud row.
      if (!w.channel) {
        const channel = sb.channel(`venture:${id}`, { config: { presence: { key: session.user.id } } });
        channel
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "cloud_ventures", filter: `id=eq.${id}` }, (payload) => {
            const next = payload.new as { data: unknown; updated_at: string };
            // Apply remote data to local store (skip if we authored it).
            suppressNextPush.current = true;
            updateVenture(id, next.data as Record<string, unknown>);
            setState((s) => ({ ...s, serverUpdatedAt: next.updated_at }));
          })
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "venture_collaborators", filter: `venture_id=eq.${id}` }, () => fetchMeta())
          .on("postgres_changes", { event: "DELETE", schema: "public", table: "venture_collaborators", filter: `venture_id=eq.${id}` }, () => fetchMeta())
          .on("presence", { event: "sync" }, () => {
            const raw = channel.presenceState() as Record<string, Array<{ user_id?: string; name?: string }>>;
            const presence: Array<{ userId: string; name: string }> = [];
            for (const [, entries] of Object.entries(raw)) {
              for (const e of entries) {
                if (e.user_id) presence.push({ userId: e.user_id, name: e.name || "anonymous" });
              }
            }
            // Dedupe by userId.
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

        // Presence heartbeat so other tabs see us as live.
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

  // Watch the local venture for changes. Whenever it changes and we
  // didn't just apply a remote patch, debounce-push to the cloud.
  useEffect(() => {
    if (!state.isCloud) return;
    if (!venture) return;
    if (state.myRole === "viewer") return;

    if (suppressNextPush.current) {
      // We just applied a remote patch; don't echo it back.
      suppressNextPush.current = false;
      return;
    }

    const snapshot = JSON.stringify(venture);
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
        const res = await fetch(`/api/v2/ventures/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ data: venture, name: venture.name }),
        });
        const data = await res.json();
        if (data.ok && data.updatedAt) setState((s) => ({ ...s, serverUpdatedAt: data.updatedAt }));
      } catch {
        // Network errors are recoverable on the next change.
      }
    }, PUSH_DEBOUNCE_MS);
  }, [id, venture, state.isCloud, state.myRole]);

  const upgrade = useCallback(async () => {
    if (!venture) return { ok: false, error: "no_local_venture" };
    try {
      const sb = supabaseBrowser();
      if (!sb) return { ok: false, error: "Cloud sync isn't configured. Set up Supabase to enable collaboration." };
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return { ok: false, error: "Sign in first." };

      const res = await fetch("/api/v2/ventures", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id: venture.id, name: venture.name, data: venture }),
      });
      const data = await res.json();
      if (!data.ok) return { ok: false, error: data.error || "Couldn't promote to cloud" };
      await fetchMeta();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }, [venture, fetchMeta]);

  const inviteByEmail = useCallback(async (email: string, role: "editor" | "viewer" = "editor") => {
    try {
      const sb = supabaseBrowser();
      if (!sb) return { ok: false, error: "Cloud sync isn't configured." };
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return { ok: false, error: "Sign in first." };
      const res = await fetch(`/api/v2/ventures/${id}/invites`, {
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
      const res = await fetch(`/api/v2/ventures/${id}/collaborators?userId=${encodeURIComponent(userId)}`, {
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
      const res = await fetch(`/api/v2/ventures/${id}/invites?id=${encodeURIComponent(inviteId)}`, {
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
