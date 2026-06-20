// Pure aggregation for the founder fundraising dashboard (Phase 72).
//
// Turns raw dataroom grants (with view tracking from Phase 70) into a
// fundraising-engagement picture: which investors are warm (viewed
// recently + repeatedly), which are cold (granted but never opened),
// and an overall "engagement temperature" per venture.
//
// Pure so the API + dashboard + tests agree on the scoring.

export type GrantSignal = {
  granteeUserId: string;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
};

export type InvestorTemperature = "hot" | "warm" | "cold" | "expired" | "revoked";

export type ScoredInvestor = {
  granteeUserId: string;
  temperature: InvestorTemperature;
  viewCount: number;
  daysSinceLastView: number | null;
  daysSinceGrant: number;
  everViewed: boolean;
};

export type VentureEngagement = {
  totalGrants: number;
  activeGrants: number;
  viewedGrants: number;     // grants that have been opened at least once
  totalViews: number;
  hotCount: number;
  warmCount: number;
  coldCount: number;        // active grant, never viewed
  // 0-100 score: rewards a high view-through rate + recent activity.
  engagementScore: number;
};

const DAY = 86_400_000;

function daysBetween(a: number, b: number): number {
  return Math.floor((a - b) / DAY);
}

// Classify a single grant into a temperature.
//   revoked / expired short-circuit.
//   hot  = viewed in the last 7 days AND 2+ total views
//   warm = ever viewed (but not hot)
//   cold = active grant, never opened
export function scoreInvestor(g: GrantSignal, now: Date = new Date()): ScoredInvestor {
  const nowMs = now.getTime();
  const everViewed = g.firstViewedAt != null;
  const daysSinceLastView = g.lastViewedAt ? daysBetween(nowMs, new Date(g.lastViewedAt).getTime()) : null;
  const daysSinceGrant = daysBetween(nowMs, new Date(g.grantedAt).getTime());

  let temperature: InvestorTemperature;
  if (g.revokedAt) {
    temperature = "revoked";
  } else if (g.expiresAt && new Date(g.expiresAt).getTime() < nowMs) {
    temperature = "expired";
  } else if (everViewed && daysSinceLastView != null && daysSinceLastView <= 7 && g.viewCount >= 2) {
    temperature = "hot";
  } else if (everViewed) {
    temperature = "warm";
  } else {
    temperature = "cold";
  }

  return {
    granteeUserId: g.granteeUserId,
    temperature,
    viewCount: g.viewCount,
    daysSinceLastView,
    daysSinceGrant,
    everViewed,
  };
}

export function aggregateVentureEngagement(grants: GrantSignal[], now: Date = new Date()): VentureEngagement {
  const scored = grants.map((g) => scoreInvestor(g, now));

  const totalGrants = grants.length;
  const activeGrants = scored.filter((s) => s.temperature !== "revoked" && s.temperature !== "expired").length;
  const viewedGrants = scored.filter((s) => s.everViewed).length;
  const totalViews = grants.reduce((acc, g) => acc + g.viewCount, 0);
  const hotCount = scored.filter((s) => s.temperature === "hot").length;
  const warmCount = scored.filter((s) => s.temperature === "warm").length;
  const coldCount = scored.filter((s) => s.temperature === "cold").length;

  // Engagement score: blend view-through rate (how many active grants
  // actually opened the room) with a hot bonus. Capped 0-100.
  let engagementScore = 0;
  if (activeGrants > 0) {
    const viewThrough = viewedGrants / activeGrants;          // 0..1
    const hotRate = hotCount / activeGrants;                  // 0..1
    engagementScore = Math.round((viewThrough * 70) + (hotRate * 30));
  }

  return {
    totalGrants,
    activeGrants,
    viewedGrants,
    totalViews,
    hotCount,
    warmCount,
    coldCount,
    engagementScore: Math.max(0, Math.min(100, engagementScore)),
  };
}

// Human label + accent for a temperature, for the UI.
export function temperatureMeta(t: InvestorTemperature): { label: string; accent: "rust" | "amber" | "muted" | "emerald" | "indigo" } {
  switch (t) {
    case "hot": return { label: "Hot", accent: "emerald" };
    case "warm": return { label: "Warm", accent: "amber" };
    case "cold": return { label: "Not opened", accent: "muted" };
    case "expired": return { label: "Expired", accent: "amber" };
    case "revoked": return { label: "Revoked", accent: "rust" };
  }
}

// A one-line nudge for the founder based on the aggregate.
export function engagementNudge(e: VentureEngagement): string {
  if (e.totalGrants === 0) return "No investors invited yet. Grant access from a venture's investor-access tab.";
  if (e.coldCount > 0 && e.viewedGrants === 0) return `${e.coldCount} investor${e.coldCount === 1 ? "" : "s"} ${e.coldCount === 1 ? "hasn't" : "haven't"} opened the room yet — a nudge might help.`;
  if (e.hotCount > 0) return `${e.hotCount} investor${e.hotCount === 1 ? " is" : "s are"} actively reviewing. Follow up while you're top of mind.`;
  if (e.coldCount > 0) return `${e.coldCount} granted investor${e.coldCount === 1 ? " hasn't" : "s haven't"} opened the room.`;
  return "Investors have reviewed your room. Keep the conversation going.";
}
