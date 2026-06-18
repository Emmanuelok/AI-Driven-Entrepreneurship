"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { useStore } from "@/store";

// useDiscussionUnread — counts messages in this workspace that landed
// AFTER the caller's read watermark and weren't authored by the caller.
// Lives at the room level (not inside the Discussion panel) so the
// Discussion tab can render an unread badge while the user is reading
// another tab. Realtime: refetches on every new message OR every
// watermark advance the caller makes.

export function useDiscussionUnread(workspaceId: string | null): number {
  const { user } = useStore();
  const [unread, setUnread] = useState(0);
  const watermarkRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workspaceId || !user) { setUnread(0); return; }
    const sb = supabaseBrowser();
    if (!sb) { setUnread(0); return; }
    const { data: sess } = await sb.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return;
    // Pull the watermark + count in parallel for one round-trip latency.
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    const [readsRes] = await Promise.all([
      fetch(`/api/v2/workspaces/${workspaceId}/reads`, auth).then((r) => r.json()).catch(() => ({ ok: false })),
    ]);
    const me = (readsRes.ok ? readsRes.results : []).find((r: { user_id: string; last_read_at: string }) => r.user_id === user.id);
    const watermark = (me?.last_read_at as string | undefined) ?? new Date(0).toISOString();
    watermarkRef.current = watermark;

    // Count-only query via the existing list endpoint — we just need
    // the rows after the watermark. The /messages list returns at most
    // 60 newest-last; for counts up to that ceiling that's exact, beyond
    // which we cap at "60+". Good enough for a badge.
    const listRes = await fetch(`/api/v2/workspaces/${workspaceId}/messages`, auth).then((r) => r.json()).catch(() => ({ ok: false }));
    if (!listRes.ok) return;
    const ts = new Date(watermark).getTime();
    const after = (listRes.results as { user_id: string | null; created_at: string }[]).filter((m) => {
      const mt = new Date(m.created_at).getTime();
      return mt > ts && m.user_id !== user.id;
    });
    setUnread(after.length);
  }, [workspaceId, user?.id]);

  // Initial + on user change.
  useEffect(() => { void refresh(); }, [refresh]);

  // Realtime: any new message OR any watermark change for me → refresh.
  useEffect(() => {
    if (!workspaceId || !user) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    const ch = sb.channel(`workspace-unread:${workspaceId}`);
    ch.on("postgres_changes" as never, { event: "INSERT", schema: "public", table: "workspace_messages", filter: `workspace_id=eq.${workspaceId}` }, () => { void refresh(); });
    ch.on("postgres_changes" as never, { event: "*", schema: "public", table: "workspace_message_reads", filter: `workspace_id=eq.${workspaceId}` }, () => { void refresh(); });
    ch.subscribe();
    return () => { void sb.removeChannel(ch); };
  }, [workspaceId, user?.id, refresh]);

  return unread;
}
