"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { colorFromUserId } from "@/lib/flow-presence";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Presence + typing awareness for one shared note. Because notes use
// last-write-wins (not a character CRDT), the most useful "live"
// signal isn't cursors — it's knowing WHO ELSE is in the note and
// whether they're actively typing, so collaborators take turns instead
// of clobbering each other's saves.
//
// Transport: a Supabase presence channel per note. Each peer tracks
// { userId, name, color, typing }. We re-track (not rebuild) on typing
// changes so the channel stays put. Mirrors flow-presence.ts.

export type DocPeer = {
  userId: string;
  name: string;
  color: string;
  typing: boolean;
};

export function useDocPresence(
  docId: string | null,
  me: { userId: string; name: string } | null,
): { peers: DocPeer[]; signalTyping: () => void } {
  const [peers, setPeers] = useState<DocPeer[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingRef = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!docId || !me) return;
    const sb = supabaseBrowser();
    if (!sb) return;

    const ch = sb.channel(`workspace-doc-presence:${docId}`, { config: { presence: { key: me.userId } } });
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState() as Record<string, Array<{ user_id?: string; name?: string; typing?: boolean }>>;
      const seen = new Set<string>();
      const list: DocPeer[] = [];
      for (const arr of Object.values(state)) {
        const p = arr[0];
        if (!p?.user_id || p.user_id === me.userId || seen.has(p.user_id)) continue;
        seen.add(p.user_id);
        list.push({ userId: p.user_id, name: p.name || "Member", color: colorFromUserId(p.user_id), typing: !!p.typing });
      }
      setPeers(list);
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
      setPeers([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, me?.userId]);

  // Called on every keystroke; flips our presence to typing=true and
  // schedules a flip back to false after a short idle window. Cheap:
  // re-track only fires on the transitions, not per keystroke.
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
    }, 1800);
  }, [me?.userId, me?.name]);

  return { peers, signalTyping };
}
