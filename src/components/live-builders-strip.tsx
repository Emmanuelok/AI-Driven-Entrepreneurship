"use client";

import { usePulse } from "@/lib/use-pulse";
import { useGlobalPresence } from "@/lib/global-presence";
import { Radio, Zap } from "lucide-react";

// A thin "you are not alone" strip: broadcasts your own anonymized
// momentum and shows how many builders are live right now, how many are
// in deep flow, and the room's average momentum. Renders nothing when
// realtime isn't available (local-only mode) so it never shows a dead
// "0 builders" line.
export function LiveBuildersStrip({ area = "studio", className = "" }: { area?: string; className?: string }) {
  const pulse = usePulse();
  const peers = useGlobalPresence(pulse?.momentum ?? null, area);

  if (!peers.live || peers.builderCount === 0) return null;

  const others = peers.builderCount - 1; // exclude self for the headline
  const headline =
    others <= 0
      ? "You're the first one in the room right now."
      : `${others} other builder${others === 1 ? "" : "s"} building alongside you right now.`;

  return (
    <div className={`glass rounded-2xl px-4 py-3 flex items-center gap-3 flex-wrap ${className}`}>
      <span className="flex items-center gap-2 text-sm">
        <span className="relative flex size-2.5">
          <span className="animate-ping absolute inline-flex size-full rounded-full bg-emerald opacity-60" />
          <span className="relative inline-flex rounded-full size-2.5 bg-emerald" />
        </span>
        <Radio className="size-4 text-emerald" />
        <span className="font-medium">{headline}</span>
      </span>
      <span className="ml-auto flex items-center gap-3 text-xs text-muted">
        {peers.shippingCount > 0 && (
          <span className="flex items-center gap-1 text-amber">
            <Zap className="size-3" /> {peers.shippingCount} in deep flow
          </span>
        )}
        <span>room momentum <span className="font-mono text-emerald">{peers.avgMomentum}</span></span>
      </span>
    </div>
  );
}
