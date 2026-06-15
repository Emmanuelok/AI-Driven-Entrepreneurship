"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { useStore } from "@/store";
import { workspaceApi, type WorkspaceFile, type AttachmentKind } from "@/lib/workspace-api";

// useWorkspaceFiles — list files in a workspace (optionally scoped to
// one attached object) with realtime updates so new uploads from a peer
// surface immediately.
export function useWorkspaceFiles(workspaceId: string | null, attach?: { kind: AttachmentKind | "null"; id?: string }) {
  const { user } = useStore();
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [loading, setLoading] = useState(true);

  // String the filter into the effect deps without box-allocating each render.
  const filterKey = `${attach?.kind ?? ""}|${attach?.id ?? ""}`;

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    const res = await workspaceApi.listFiles(workspaceId, attach as Parameters<typeof workspaceApi.listFiles>[1]);
    if (res.ok) setFiles(res.results);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, filterKey]);

  useEffect(() => { setLoading(true); void refresh(); }, [refresh]);

  useEffect(() => {
    if (!workspaceId || !user) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    const ch = sb.channel(`workspace-files:${workspaceId}`);
    ch.on("postgres_changes" as never, { event: "*", schema: "public", table: "workspace_files", filter: `workspace_id=eq.${workspaceId}` }, () => { void refresh(); });
    ch.subscribe();
    return () => { void sb.removeChannel(ch); };
  }, [workspaceId, user?.id, refresh]);

  const remove = useCallback(async (fileId: string) => {
    if (!workspaceId) return;
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    await workspaceApi.deleteFile(workspaceId, fileId);
  }, [workspaceId]);

  return { files, loading, refresh, remove };
}
