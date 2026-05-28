"use client";

import { Users2 } from "lucide-react";

// Stack of overlapping avatars showing who's currently viewing/editing
// the venture. Hidden when the venture isn't collaborative or no peers
// are present.

export function CoPresence({ presence, myUserId }: { presence: Array<{ userId: string; name: string }>; myUserId?: string }) {
  // Don't double-count the current user.
  const others = presence.filter((p) => p.userId !== myUserId);
  if (others.length === 0) return null;

  const shown = others.slice(0, 4);
  const extra = others.length - shown.length;

  return (
    <div className="inline-flex items-center gap-2" aria-label={`${others.length} other people viewing this venture`}>
      <div className="flex -space-x-2">
        {shown.map((p) => (
          <div
            key={p.userId}
            className="size-7 rounded-full bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-semibold text-[10px] border-2 border-surface"
            title={p.name}
          >
            {p.name[0]?.toUpperCase() || "?"}
          </div>
        ))}
        {extra > 0 && (
          <div className="size-7 rounded-full bg-surface-2 border-2 border-surface flex items-center justify-center text-[10px] text-muted">
            +{extra}
          </div>
        )}
      </div>
      <span className="text-xs text-muted flex items-center gap-1">
        <span className="size-1.5 rounded-full bg-emerald animate-pulse" /> live
      </span>
    </div>
  );
}
