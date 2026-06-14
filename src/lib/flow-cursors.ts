"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { colorFromUserId } from "@/lib/flow-presence";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Phase 3c: live peer cursors on a flow canvas. Awareness-style
// ephemeral state — positions are fire-and-forget over a dedicated
// Supabase broadcast channel (NOT the durable Y.Doc transport, and NOT
// presence.track which is heavier and meant for join/leave). Coordinates
// are in canvas-plane space so they line up with nodes and scroll with
// the content.

export type FlowCursor = {
  userId: string;
  name: string;
  color: string; // deterministic from userId, matches presence chips
  x: number;
  y: number;
  at: number; // last-seen ms, for staleness pruning
};

const STALE_MS = 5000;
const SEND_INTERVAL_MS = 45; // ~22 fps cap

export function useFlowCursors(
  flowId: string,
  me: { userId: string; displayName: string } | null,
): { cursors: FlowCursor[]; sendCursor: (x: number, y: number) => void } {
  const [cursors, setCursors] = useState<FlowCursor[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const cursorsRef = useRef<Map<string, FlowCursor>>(new Map());
  const lastSentRef = useRef(0);

  useEffect(() => {
    if (!me) return;
    const sb = supabaseBrowser();
    if (!sb) return;

    const flush = () => setCursors(Array.from(cursorsRef.current.values()));
    const ch = sb.channel(`flow-cursor:${flowId}`, { config: { broadcast: { self: false } } });

    ch.on("broadcast", { event: "cursor" }, ({ payload }: { payload?: { userId?: string; name?: string; x?: number; y?: number } }) => {
      const p = payload;
      if (!p?.userId || typeof p.x !== "number" || typeof p.y !== "number") return;
      cursorsRef.current.set(p.userId, {
        userId: p.userId,
        name: p.name || "Member",
        color: colorFromUserId(p.userId),
        x: p.x,
        y: p.y,
        at: Date.now(),
      });
      flush();
    });
    ch.on("broadcast", { event: "cursor-leave" }, ({ payload }: { payload?: { userId?: string } }) => {
      const id = payload?.userId;
      if (!id) return;
      cursorsRef.current.delete(id);
      flush();
    });
    ch.subscribe();
    channelRef.current = ch;

    // Prune cursors from peers who went quiet (closed tab, lost focus).
    const prune = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [id, c] of cursorsRef.current) {
        if (now - c.at > STALE_MS) { cursorsRef.current.delete(id); changed = true; }
      }
      if (changed) flush();
    }, 2000);

    return () => {
      void ch.send({ type: "broadcast", event: "cursor-leave", payload: { userId: me.userId } }).catch(() => {});
      clearInterval(prune);
      void sb.removeChannel(ch);
      channelRef.current = null;
      cursorsRef.current.clear();
      setCursors([]);
    };
  }, [flowId, me?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendCursor = useCallback((x: number, y: number) => {
    const ch = channelRef.current;
    if (!ch || !me) return;
    const now = Date.now();
    if (now - lastSentRef.current < SEND_INTERVAL_MS) return;
    lastSentRef.current = now;
    void ch.send({ type: "broadcast", event: "cursor", payload: { userId: me.userId, name: me.displayName, x, y } }).catch(() => {});
  }, [me?.userId, me?.displayName]);

  return { cursors, sendCursor };
}
