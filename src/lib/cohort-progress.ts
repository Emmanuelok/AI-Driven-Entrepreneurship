"use client";

import { useEffect, useState, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase";

// Lightweight progress lookup + setter for a single cohort. Used by the
// cohort detail page (instructor matrix + student rows) and the
// dashboard widget.

export type ProgressStatus = "not_started" | "in_progress" | "completed" | "submitted";

export type ProgressRow = {
  user_id: string;
  assignment_id: string;
  status: ProgressStatus;
  score_pct: number | null;
  evidence_url: string | null;
  notes: string | null;
  updated_at: string;
};

export function useCohortProgress(cohortId: string) {
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [myRole, setMyRole] = useState<"owner" | "instructor" | "student" | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const sb = supabaseBrowser();
      if (!sb) { setLoading(false); return; }
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setLoading(false); return; }
      const res = await fetch(`/api/v2/cohorts/${cohortId}/progress`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (data.ok) {
        setRows(data.results ?? []);
        setMyRole(data.myRole ?? null);
      }
    } catch {
      // Silent — assignment views still render.
    } finally {
      setLoading(false);
    }
  }, [cohortId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: instructor watching the matrix should see new rows + edits
  // as students update. Students don't need realtime for their own rows.
  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb) return;
    let channel: ReturnType<typeof sb.channel> | null = null;
    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      channel = sb.channel(`cohort-progress:${cohortId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "cohort_progress", filter: `cohort_id=eq.${cohortId}` }, () => {
          refresh();
        })
        .subscribe();
    })();
    return () => { if (channel) sb.removeChannel(channel); };
  }, [cohortId, refresh]);

  const setStatus = useCallback(async (assignmentId: string, status: ProgressStatus, extra?: { scorePct?: number; evidenceUrl?: string; notes?: string }) => {
    try {
      const sb = supabaseBrowser();
      if (!sb) return { ok: false };
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return { ok: false };
      const res = await fetch(`/api/v2/cohorts/${cohortId}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ assignmentId, status, ...extra }),
      });
      const data = await res.json();
      if (data.ok) refresh();
      return data;
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }, [cohortId, refresh]);

  return { rows, myRole, loading, setStatus, refresh };
}
