"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { useStore } from "@/store";
import { workspaceApi } from "@/lib/workspace-api";

// Per-workspace discussion read state:
//   - tracks every member's last_read_at watermark (live via realtime)
//   - exposes seenCount(messageCreatedAt) for "seen by N" rendering
//   - exposes markRead(at) to advance the caller's own watermark
//     (debounced + monotonic to avoid the API thrashing on every render).

export function useDiscussionReads(workspaceId: string | null) {
  const { user } = useStore();
  const [reads, setReads] = useState<Map<string, number>>(new Map());
  const lastSentRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    const r = await workspaceApi.getReads(workspaceId);
    if (!r.ok) return;
    const m = new Map<string, number>();
    for (const row of r.results) m.set(row.user_id, new Date(row.last_read_at).getTime());
    setReads(m);
  }, [workspaceId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Realtime: peers' watermark moves should update live so "seen by N"
  // counts stay honest.
  useEffect(() => {
    if (!workspaceId || !user) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    const ch = sb.channel(`workspace-reads:${workspaceId}`);
    ch.on("postgres_changes" as never, { event: "*", schema: "public", table: "workspace_message_reads", filter: `workspace_id=eq.${workspaceId}` }, () => { void refresh(); });
    ch.subscribe();
    return () => { void sb.removeChannel(ch); };
  }, [workspaceId, user?.id, refresh]);

  const seenCount = useCallback((createdAtIso: string): number => {
    const ts = new Date(createdAtIso).getTime();
    let n = 0;
    for (const t of reads.values()) if (t >= ts) n++;
    return n;
  }, [reads]);

  // Move the caller's own watermark forward. Monotonic: never sends an
  // earlier timestamp than the last one. Debounced to ~1 update / sec.
  const markRead = useCallback(async (at: string) => {
    if (!workspaceId) return;
    const ts = new Date(at).getTime();
    if (ts <= lastSentRef.current) return;
    if (Date.now() - lastSentRef.current < 1000 && lastSentRef.current > 0) return;
    lastSentRef.current = ts;
    await workspaceApi.markRead(workspaceId, at);
  }, [workspaceId]);

  const myLastRead = useMemo(() => (user ? reads.get(user.id) ?? 0 : 0), [reads, user?.id]);

  return { seenCount, markRead, myLastRead };
}
