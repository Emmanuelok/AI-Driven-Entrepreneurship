// Pure validation + matching + summarization for investor saved
// searches (Phase 75).
//
// A saved search is just a SearchCriteria object the investor named
// and persisted. The same object is used three places:
//   - the browse API to filter ventures
//   - the cron alert to decide which new ventures match
//   - the UI to render a human-readable summary chip
//
// Pure → tests + UI + cron + API all read the same predicate.

export type SearchCriteria = {
  // Sectors to match ANY of (empty = no sector filter).
  sectors: string[];
  // Stage to match exactly, or null for any.
  stage: "idea" | "discover" | "mvp" | "launch" | "scale" | null;
  // Exact region match, or null for any.
  region: string | null;
  // Only show ventures currently raising.
  raisingOnly: boolean;
  // Optional bounds on the ask (USD). Both inclusive; null = no bound.
  minRaiseUsd: number | null;
  maxRaiseUsd: number | null;
  // Free-text search over title/tagline. Null = no text filter.
  q: string | null;
};

export const VALID_STAGES = ["idea", "discover", "mvp", "launch", "scale"] as const;
export type Stage = typeof VALID_STAGES[number];

export const EMPTY_CRITERIA: SearchCriteria = {
  sectors: [],
  stage: null,
  region: null,
  raisingOnly: false,
  minRaiseUsd: null,
  maxRaiseUsd: null,
  q: null,
};

// Trim, lowercase, dedupe sector slugs. Drops blanks. Bounded length.
function normSectors(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const s = raw.trim().toLowerCase().slice(0, 40);
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= 12) break; // cap
  }
  return out;
}

function normStage(input: unknown): Stage | null {
  if (typeof input !== "string") return null;
  const s = input.trim().toLowerCase() as Stage;
  return (VALID_STAGES as readonly string[]).includes(s) ? s : null;
}

function normString(input: unknown, maxLen: number): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim().slice(0, maxLen);
  return s.length === 0 ? null : s;
}

function normNonNegInt(input: unknown, max = 1_000_000_000): number | null {
  if (input === null || input === undefined) return null;
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n)) return null;
  const floored = Math.floor(n);
  if (floored < 0) return null;
  return Math.min(floored, max);
}

// Normalize a partial untrusted input into a complete SearchCriteria.
// Always returns a valid object; invalid fields default to "no filter".
// Accepts `unknown` because callers pass freshly-parsed JSON / DB jsonb
// whose shape isn't statically known — the body defends every field.
export function normalizeCriteria(input: unknown): SearchCriteria {
  if (!input || typeof input !== "object") return { ...EMPTY_CRITERIA };
  const raw = input as Record<string, unknown>;
  const min = normNonNegInt(raw.minRaiseUsd ?? null);
  const max = normNonNegInt(raw.maxRaiseUsd ?? null);
  // Coerce ordering: if both set and min > max, swap.
  let minRaiseUsd = min, maxRaiseUsd = max;
  if (minRaiseUsd != null && maxRaiseUsd != null && minRaiseUsd > maxRaiseUsd) {
    [minRaiseUsd, maxRaiseUsd] = [maxRaiseUsd, minRaiseUsd];
  }
  return {
    sectors: normSectors(raw.sectors),
    stage: normStage(raw.stage),
    region: normString(raw.region, 60),
    raisingOnly: raw.raisingOnly === true || raw.raisingOnly === "1" || raw.raisingOnly === 1,
    minRaiseUsd,
    maxRaiseUsd,
    q: normString(raw.q, 120),
  };
}

// True when ANY filter is set. An "empty" search matches all ventures
// and is almost certainly a UX mistake — callers should warn.
export function hasAnyFilter(c: SearchCriteria): boolean {
  return (
    c.sectors.length > 0
    || c.stage != null
    || c.region != null
    || c.raisingOnly
    || c.minRaiseUsd != null
    || c.maxRaiseUsd != null
    || (c.q != null && c.q.length > 0)
  );
}

// ── Matching ────────────────────────────────────────────────────────

// Minimal venture shape for matching — keep small so the pure code
// doesn't need to know about full payloads. Both the cron and the
// browse API can build this from public_ventures rows.
export type MatchableVenture = {
  slug: string;
  title: string;
  tagline: string;
  sectors: string[];
  stage: Stage | string | null;
  is_raising: boolean;
  raising_amount_usd: number | null;
  region: string | null;
  updated_at: string;
};

export function matchVenture(venture: MatchableVenture, criteria: SearchCriteria): boolean {
  if (criteria.raisingOnly && !venture.is_raising) return false;

  if (criteria.stage && venture.stage !== criteria.stage) return false;

  if (criteria.region && (venture.region ?? "").toLowerCase() !== criteria.region.toLowerCase()) return false;

  if (criteria.sectors.length > 0) {
    const vsec = new Set((venture.sectors ?? []).map((s) => s.toLowerCase()));
    const anyMatch = criteria.sectors.some((s) => vsec.has(s.toLowerCase()));
    if (!anyMatch) return false;
  }

  // Raise bounds apply ONLY when the venture has a numeric ask. A
  // null ask isn't "outside" any bound; we treat it as unknown and
  // include it. If the user wanted ONLY priced rounds they can set
  // raisingOnly + minRaiseUsd=1.
  const ask = venture.raising_amount_usd;
  if (criteria.minRaiseUsd != null && ask != null && ask < criteria.minRaiseUsd) return false;
  if (criteria.maxRaiseUsd != null && ask != null && ask > criteria.maxRaiseUsd) return false;

  if (criteria.q && criteria.q.trim().length > 0) {
    const needle = criteria.q.toLowerCase();
    const hay = `${venture.title} ${venture.tagline}`.toLowerCase();
    if (!hay.includes(needle)) return false;
  }

  return true;
}

// Returns the SUBSET of ventures matching criteria; preserves input order.
export function filterMatchingVentures(ventures: MatchableVenture[], criteria: SearchCriteria): MatchableVenture[] {
  return ventures.filter((v) => matchVenture(v, criteria));
}

// ── Summarization ──────────────────────────────────────────────────

// Human-readable label like:
//   "Climate, Fintech · Pre-seed · raising $200k+ · Nigeria"
// Used in the saved-searches list + the alert email subject.
export function summarizeCriteria(c: SearchCriteria): string {
  const parts: string[] = [];

  if (c.sectors.length > 0) {
    const shown = c.sectors.slice(0, 3).map(capitalize);
    const more = c.sectors.length - shown.length;
    parts.push(shown.join(", ") + (more > 0 ? ` +${more}` : ""));
  }
  if (c.stage) parts.push(stageLabel(c.stage));
  if (c.region) parts.push(c.region);
  if (c.raisingOnly || c.minRaiseUsd != null || c.maxRaiseUsd != null) {
    parts.push(raiseLabel(c));
  }
  if (c.q) parts.push(`"${c.q}"`);

  if (parts.length === 0) return "All ventures";
  return parts.join(" · ");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const STAGE_LABEL: Record<Stage, string> = {
  idea: "Idea",
  discover: "Discovery",
  mvp: "MVP",
  launch: "Launch",
  scale: "Scale",
};
export function stageLabel(s: string | null): string {
  if (!s) return "Any stage";
  return STAGE_LABEL[s as Stage] ?? capitalize(s);
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}

function raiseLabel(c: SearchCriteria): string {
  if (c.minRaiseUsd != null && c.maxRaiseUsd != null) return `raising ${fmtUsd(c.minRaiseUsd)}–${fmtUsd(c.maxRaiseUsd)}`;
  if (c.minRaiseUsd != null) return `raising ${fmtUsd(c.minRaiseUsd)}+`;
  if (c.maxRaiseUsd != null) return `raising up to ${fmtUsd(c.maxRaiseUsd)}`;
  return "raising now";
}

// ── Investor demand (Phase 76) ──────────────────────────────────────
//
// The founder-facing inverse of a saved search: given a venture and a
// set of investor saved searches, how many DISTINCT investors are
// watching for something this venture matches? Returns only a count +
// a coarse breakdown — never investor identities — so a founder can't
// enumerate who's watching, only that demand exists.

export type InvestorSearchRef = {
  // The investor who owns the search. Used only to dedupe — never
  // returned to the founder.
  userId: string;
  criteria: SearchCriteria;
  // Whether this search has weekly alerts on. A founder cares more
  // about investors who'll be actively pinged.
  alerting: boolean;
};

export type VentureDemand = {
  // Distinct investors with at least one matching search.
  investorCount: number;
  // Of those, how many have weekly alerts on (will be emailed when
  // this venture surfaces in their next run).
  alertingInvestorCount: number;
  // Total matching searches (an investor may have several).
  matchingSearchCount: number;
};

export function computeVentureDemand(venture: MatchableVenture, searches: InvestorSearchRef[]): VentureDemand {
  const investors = new Set<string>();
  const alertingInvestors = new Set<string>();
  let matchingSearchCount = 0;

  for (const s of searches) {
    // An "all ventures" search (no filter) shouldn't count as demand —
    // it's not a thesis, it'd match everything and inflate the signal.
    if (!hasAnyFilter(s.criteria)) continue;
    if (!matchVenture(venture, s.criteria)) continue;
    matchingSearchCount += 1;
    investors.add(s.userId);
    if (s.alerting) alertingInvestors.add(s.userId);
  }

  return {
    investorCount: investors.size,
    alertingInvestorCount: alertingInvestors.size,
    matchingSearchCount,
  };
}

// A short human nudge for the founder based on the demand signal.
export function demandNudge(d: VentureDemand): string {
  if (d.investorCount === 0) return "No investors are watching this space yet — publishing and tagging your sector helps.";
  if (d.alertingInvestorCount > 0) {
    return `${d.investorCount} investor${d.investorCount === 1 ? " is" : "s are"} watching your space — ${d.alertingInvestorCount} get${d.alertingInvestorCount === 1 ? "s" : ""} alerted when ventures like yours publish.`;
  }
  return `${d.investorCount} investor${d.investorCount === 1 ? " has" : "s have"} a saved search your venture matches.`;
}

// ── Title suggestions ──────────────────────────────────────────────

// Suggest a title for a saved search when the user hasn't provided one.
// Used by the API on create.
export function suggestTitle(c: SearchCriteria): string {
  if (!hasAnyFilter(c)) return "All ventures";
  const summary = summarizeCriteria(c);
  // Cap so the DB constraint (varchar 80 in the migration below) is
  // never violated.
  return summary.length <= 80 ? summary : summary.slice(0, 77) + "…";
}
