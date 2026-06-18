"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { useStore } from "@/store";
import { workspaceApi } from "@/lib/workspace-api";

export type DmThreadRow = {
  id: string;
  with_user_id: string;
  with_name: string;
  last_message_at: string;
  last_message_preview: string | null;
  last_message_was_mine: boolean | null;
  unread: boolean;
};

// useDmInbox — lists every DM thread the caller has in this workspace,
// kept fresh by realtime listeners on:
//   - workspace_dm_messages INSERT (a new DM arrives → refresh)
//   - workspace_dm_reads      UPDATE for me (a watermark advance on
//                              another tab clears unread badges here)
//
// Returns the rows + a totalUnread for the tab badge.

export function useDmInbox(workspaceId: string | null) {
  const { user } = useStore();
  const [rows, setRows] = useState<DmThreadRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    const r = await workspaceApi.listDmThreads(workspaceId);
    if (r.ok) setRows(r.results);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { setLoading(true); void refresh(); }, [refresh]);

  // Realtime: a new DM in ANY of my threads, OR my watermark advancing.
  useEffect(() => {
    if (!workspaceId || !user) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    const ch = sb.channel(`workspace-dm-inbox:${workspaceId}`);
    // We can't filter the dm_messages INSERT by workspace_id (it's on
    // the thread, not the message), but the volume is low enough that
    // a refresh on every DM insert anywhere is fine — and it's gated
    // by the user already being on this workspace's page.
    ch.on("postgres_changes" as never, { event: "INSERT", schema: "public", table: "workspace_dm_messages" }, () => { void refresh(); });
    ch.on("postgres_changes" as never, { event: "*", schema: "public", table: "workspace_dm_reads" }, () => { void refresh(); });
    ch.subscribe();
    return () => { void sb.removeChannel(ch); };
  }, [workspaceId, user?.id, refresh]);

  const totalUnread = rows.filter((r) => r.unread).length;

  return { rows, loading, refresh, totalUnread };
}
