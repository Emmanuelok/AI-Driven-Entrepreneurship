"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { useStore } from "@/store";
import type { RealtimeChannel } from "@supabase/supabase-js";

// Live peer pulse: a single global Supabase presence channel where every
// signed-in builder broadcasts ONE anonymized number — their Pulse
// Engine momentum (0..100) — plus which area they're in. No names, no
// ids surfaced; the hook returns only aggregates. Mirrors the
// open-once / re-track-on-change pattern from flow-presence.ts so the
// channel isn't torn down every time momentum ticks.

export type PeerPulse = {
  builderCount: number;   // distinct builders present (includes you)
  shippingCount: number;  // those in deep flow (momentum ≥ 50)
  avgMomentum: number;    // mean momentum across present builders
  live: boolean;          // is the realtime channel actually connected
};

const EMPTY: PeerPulse = { builderCount: 0, shippingCount: 0, avgMomentum: 0, live: false };

export function useGlobalPresence(myMomentum: number | null, area = "studio"): PeerPulse {
  const { user } = useStore();
  const [pulse, setPulse] = useState<PeerPulse>(EMPTY);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Open the channel once per signed-in user.
  useEffect(() => {
    if (!user) return;
    const sb = supabaseBrowser();
    if (!sb) return;

    const ch = sb.channel("global-pulse", { config: { presence: { key: user.id } } });
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState() as Record<string, Array<{ momentum?: number; area?: string }>>;
      let count = 0;
      let shipping = 0;
      let sum = 0;
      for (const arr of Object.values(state)) {
        const p = arr[0];
        if (!p) continue;
        count++;
        const m = typeof p.momentum === "number" ? p.momentum : 0;
        sum += m;
        if (m >= 50) shipping++;
      }
      setPulse({
        builderCount: count,
        shippingCount: shipping,
        avgMomentum: count ? Math.round(sum / count) : 0,
        live: true,
      });
    }).subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void ch.track({ momentum: myMomentum ?? 0, area, at: Date.now() }).catch(() => {});
      }
    });

    channelRef.current = ch;
    return () => {
      void ch.untrack().catch(() => {});
      void sb.removeChannel(ch);
      channelRef.current = null;
      setPulse(EMPTY);
    };
    // myMomentum/area patched via the effect below — channel stays put.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Patch the broadcast payload when momentum or area changes, without
  // rebuilding the channel.
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch || myMomentum === null) return;
    void ch.track({ momentum: myMomentum, area, at: Date.now() }).catch(() => {});
  }, [myMomentum, area]);

  return pulse;
}
