"use client";

import { useCloudVenture } from "@/lib/cloud-venture";
import { Eye } from "lucide-react";

// Read-only banner shown on every venture subpage when the current user
// has 'viewer' access to a cloud venture. Server-side already rejects
// edits with 403; this is the UX hint that explains why their writes
// are being ignored.

export function VentureReadonlyBanner({ ventureId }: { ventureId: string }) {
  const cv = useCloudVenture(ventureId);
  if (cv.myRole !== "viewer") return null;
  return (
    <div className="bg-amber/10 border-b border-amber/30 text-amber" role="status" aria-live="polite">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-2 text-xs flex items-center gap-2">
        <Eye className="size-3.5" />
        <span><strong className="text-amber">Viewer mode</strong> — your changes won&apos;t save. Ask the owner for editor access.</span>
      </div>
    </div>
  );
}
