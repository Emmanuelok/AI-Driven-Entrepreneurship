"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Realtime presence for one flow. Subscribes to the flow's presence
// channel and exposes who else is currently editing. Each presence
// payload carries a display name + a stable color so the canvas can
// render small avatar chips in the header.
//
// Phase 3a shipped row-change sync; this adds the "who is here right
// now" layer that makes co-edit feel safe — you can see when someone
// else is in the flow before you make conflicting edits.

export type FlowPresence = {
  userId: string;
  displayName: string;
  color: string;       // hex; deterministic from userId
  joinedAt: number;
};

// Stable 6-character hex color from a user id — small entropy is fine
// here, we just need same-user → same-color across sessions.
function colorFromUserId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffff;
  // Bias toward saturated colors by clamping the low byte up.
  return `#${((h | 0x404040) & 0xffffff).toString(16).padStart(6, "0")}`;
}

export function useFlowPresence(flowId: string, me: { userId: string; displayName: string } | null): FlowPresence[] {
  const [others, setOthers] = useState<FlowPresence[]>([]);

  useEffect(() => {
    if (!me) return;
    const sb = supabaseBrowser();
    if (!sb) return;

    let channel: RealtimeChannel | null = null;
    try {
      channel = sb.channel(`flow-presence:${flowId}`, {
        config: { presence: { key: me.userId } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          if (!channel) return;
          const state = channel.presenceState() as Record<string, Array<{ user_id: string; display_name: string; joined_at: number }>>;
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
            });
          }
          setOthers(peers);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && channel) {
            await channel.track({
              user_id: me.userId,
              display_name: me.displayName,
              joined_at: Date.now(),
            });
          }
        });
    } catch {
      // Realtime not available — silently render empty (Phase 2 sync
      // still works without it).
    }

    return () => {
      if (channel) {
        void channel.untrack().catch(() => {});
        void sb.removeChannel(channel);
      }
    };
  }, [flowId, me]);

  return others;
}

export { colorFromUserId };
