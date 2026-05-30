"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Realtime presence for one flow. Subscribes to the flow's presence
// channel and exposes who else is currently editing. Each presence
// payload carries a display name, a stable color, and the node id
// (if any) the user currently has selected — so the canvas can both
// render header avatars and tag individual nodes with the peer who's
// looking at them.

export type FlowPresence = {
  userId: string;
  displayName: string;
  color: string;       // hex; deterministic from userId
  joinedAt: number;
  selectedNodeId: string | null;
};

// Stable 6-character hex color from a user id — small entropy is fine
// here, we just need same-user → same-color across sessions.
function colorFromUserId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffff;
  return `#${((h | 0x404040) & 0xffffff).toString(16).padStart(6, "0")}`;
}

export function useFlowPresence(
  flowId: string,
  me: { userId: string; displayName: string } | null,
  selectedNodeId: string | null = null,
): FlowPresence[] {
  const [others, setOthers] = useState<FlowPresence[]>([]);
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  // Open / close the channel when the flow id or signed-in user changes.
  useEffect(() => {
    if (!me) return;
    const sb = supabaseBrowser();
    if (!sb) return;

    let ch: RealtimeChannel | null = null;
    try {
      ch = sb.channel(`flow-presence:${flowId}`, {
        config: { presence: { key: me.userId } },
      });

      ch.on("presence", { event: "sync" }, () => {
        if (!ch) return;
        const state = ch.presenceState() as Record<string, Array<{ user_id: string; display_name: string; joined_at: number; selected_node_id: string | null }>>;
        const peers: FlowPresence[] = [];
        for (const [key, presences] of Object.entries(state)) {
          if (key === me.userId) continue;
          const p = presences[0];
          if (!p) continue;
          peers.push({
            userId: p.user_id,
            displayName: p.display_name || "Member",
            color: colorFromUserId(p.user_id),
            joinedAt: p.joined_at,
            selectedNodeId: p.selected_node_id ?? null,
          });
        }
        setOthers(peers);
      }).subscribe(async (status) => {
        if (status === "SUBSCRIBED" && ch) {
          await ch.track({
            user_id: me.userId,
            display_name: me.displayName,
            joined_at: Date.now(),
            selected_node_id: selectedNodeId,
          });
        }
      });

      setChannel(ch);
    } catch { /* Realtime not available — silent */ }

    return () => {
      if (ch) {
        void ch.untrack().catch(() => {});
        void sb.removeChannel(ch);
      }
      setChannel(null);
    };
    // selectedNodeId intentionally NOT in deps — we patch via a
    // separate track() below to avoid tearing down/re-creating the
    // channel on every selection change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId, me?.userId]);

  // Patch the local presence payload when the selected node changes.
  useEffect(() => {
    if (!channel || !me) return;
    void channel.track({
      user_id: me.userId,
      display_name: me.displayName,
      joined_at: Date.now(),
      selected_node_id: selectedNodeId,
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, channel]);

  return others;
}

export { colorFromUserId };
