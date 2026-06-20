// Pure access-gate decisions for the venture dataroom (Phase 66).
// The same logic runs server-side for the API gate AND on the client
// to decide whether to even render the dataroom shell. Keeping it
// pure means both surfaces agree on what's visible.

export type DataroomGrant = {
  granted_to_user_id: string;
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

export type ViewerAccess =
  | { state: "owner" }
  | { state: "granted"; grant: DataroomGrant; daysLeft: number | null }
  | { state: "expired"; grantExpiresAt: string }
  | { state: "revoked" }
  | { state: "no_grant" }
  | { state: "anonymous" };

// Decide what access a viewer has against a list of grants on the
// venture (typically all grants for that slug — caller filters before
// pass-through to avoid bringing every grant into the client).
// `now` is injected for testability.
export function resolveViewerAccess(args: {
  viewerUserId: string | null;
  ownerUserId: string;
  grants: DataroomGrant[];
  now?: Date;
}): ViewerAccess {
  if (!args.viewerUserId) return { state: "anonymous" };
  if (args.viewerUserId === args.ownerUserId) return { state: "owner" };

  const now = (args.now ?? new Date()).getTime();
  const mine = args.grants.find((g) => g.granted_to_user_id === args.viewerUserId);
  if (!mine) return { state: "no_grant" };

  if (mine.revoked_at) return { state: "revoked" };
  if (mine.expires_at && new Date(mine.expires_at).getTime() <= now) {
    return { state: "expired", grantExpiresAt: mine.expires_at };
  }

  const daysLeft = mine.expires_at
    ? Math.floor((new Date(mine.expires_at).getTime() - now) / 86_400_000)
    : null;

  return { state: "granted", grant: mine, daysLeft };
}

// Whether a viewer can READ a particular item, given their access
// state. Public items are always visible to signed-in viewers; gated
// items require owner OR active grant.
export function canViewItem(access: ViewerAccess, visibility: "public" | "gated"): boolean {
  if (visibility === "public") {
    // Anonymous still gets public items — they show on /v/[slug]
    // already. This branch is purely for completeness.
    return true;
  }
  return access.state === "owner" || access.state === "granted";
}

// A short human label for the access state. Used by the viewer's
// header strip ("Dataroom access expires in 47 days").
export function accessSummary(access: ViewerAccess): string {
  switch (access.state) {
    case "owner": return "You own this dataroom.";
    case "granted":
      if (access.daysLeft == null) return "Your access has no expiration.";
      if (access.daysLeft < 0) return "Your access has expired.";
      if (access.daysLeft === 0) return "Your access expires today.";
      return `Your access expires in ${access.daysLeft} day${access.daysLeft === 1 ? "" : "s"}.`;
    case "expired": return "Your access has expired.";
    case "revoked": return "Your access has been revoked by the founder.";
    case "no_grant": return "You don't have access to this dataroom.";
    case "anonymous": return "Sign in to view this dataroom.";
  }
}

// Sanitize / clamp a "grant for X days" input. The owner picks 30/90/
// 365 from the UI; we accept any positive integer up to 730 days
// (two years) and round to nearest day.
export function computeExpiresAt(grantedAt: Date, days: number | null): Date | null {
  if (days == null) return null; // open-ended grant
  if (!Number.isFinite(days) || days <= 0) return null;
  const clamped = Math.min(730, Math.max(1, Math.round(days)));
  return new Date(grantedAt.getTime() + clamped * 86_400_000);
}
