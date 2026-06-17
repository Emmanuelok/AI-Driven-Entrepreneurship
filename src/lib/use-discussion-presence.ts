"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { colorFromUserId } from "@/lib/flow-presence";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Lightweight typing-awareness for a workspace discussion. Mirrors the
// doc-presence pattern (one Supabase presence channel, re-track on
// transitions instead of rebuilding). The hook returns the set of OTHER
// members currently typing, plus a signalTyping() callback to debounce
// on each keystroke. Cheap on the wire: we only re-track when the
// typing flag actually flips.

export type TypingPeer = {
  userId: string;
  name: string;
  color: string;
};

export function useDiscussionTyping(
  workspaceId: string | null,
  me: { userId: string; name: string } | null,
): { typing: TypingPeer[]; signalTyping: () => void } {
  const [typing, setTyping] = useState<TypingPeer[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingRef = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!workspaceId || !me) return;
    const sb = supabaseBrowser();
    if (!sb) return;

    const ch = sb.channel(`workspace-discuss-typing:${workspaceId}`, { config: { presence: { key: me.userId } } });
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState() as Record<string, Array<{ user_id?: string; name?: string; typing?: boolean }>>;
      const seen = new Set<string>();
      const list: TypingPeer[] = [];
      for (const arr of Object.values(state)) {
        const p = arr[0];
        if (!p?.user_id || p.user_id === me.userId || !p.typing || seen.has(p.user_id)) continue;
        seen.add(p.user_id);
        list.push({ userId: p.user_id, name: p.name || "Member", color: colorFromUserId(p.user_id) });
      }
      setTyping(list);
    }).subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ user_id: me.userId, name: me.name, typing: false });
      }
    });
    channelRef.current = ch;

    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      void ch.untrack().catch(() => {});
      void sb.removeChannel(ch);
      channelRef.current = null;
      setTyping([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, me?.userId]);

  const signalTyping = useCallback(() => {
    const ch = channelRef.current;
    if (!ch || !me) return;
    if (!typingRef.current) {
      typingRef.current = true;
      void ch.track({ user_id: me.userId, name: me.name, typing: true }).catch(() => {});
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      typingRef.current = false;
      void ch.track({ user_id: me.userId, name: me.name, typing: false }).catch(() => {});
    }, 2000);
  }, [me?.userId, me?.name]);

  return { typing, signalTyping };
}
