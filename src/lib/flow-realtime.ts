"use client";

import { supabaseBrowser } from "@/lib/supabase";
import { fetchCloudFlow } from "@/lib/flow-sync";
import { useFlow } from "@/store/flow";

// Realtime co-edit for Flow Studio. Subscribes to the cloud_flows row
// for one flow and, on remote UPDATE, refetches the full graph and
// merges via upsertFromCloud (which preserves unsaved local edits via
// last-write-wins).
//
// Conflict resolution semantics:
//   - The Phase 2 schedulePush already debounces local writes.
//   - upsertFromCloud only accepts a remote row when remote.updatedAt
//     is STRICTLY later than the local copy. So a remote edit shipped
//     after our local edit wins; otherwise ours stays.
//   - We deliberately echo-suppress: a refetch triggered by our own
//     just-pushed write will return the same updatedAt we already
//     have, which fails the strict-later check, so it's a no-op.
//
// Returns an unsubscribe function. Caller is responsible for cleanup
// (typically inside a useEffect).

export function subscribeToFlow(id: string): () => void {
  const sb = supabaseBrowser();
  if (!sb) return () => {};

  let cancelled = false;
  const channel = sb.channel(`flow:${id}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "cloud_flows", filter: `id=eq.${id}` },
      () => {
        if (cancelled) return;
        // Refetch the full graph and merge. The fetch is cheap (one
        // round trip per remote save) and avoids us having to decode
        // jsonb diff payloads client-side.
        void (async () => {
          const fresh = await fetchCloudFlow(id);
          if (cancelled || !fresh) return;
          useFlow.getState().upsertFromCloud(fresh);
        })();
      },
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "cloud_flows", filter: `id=eq.${id}` },
      () => {
        if (cancelled) return;
        useFlow.getState().deleteFlow(id);
      },
    )
    .subscribe();

  return () => {
    cancelled = true;
    void sb.removeChannel(channel);
  };
}
