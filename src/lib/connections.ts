// Shared types + helpers for the universal connections layer.
// See supabase/migrations/0016_connections.sql for the schema.

export type ConnectionKind =
  | "venture"
  | "build"
  | "sketch"
  | "letter"
  | "cohort"
  | "problem"
  | "lesson"
  | "mcp"
  | "mentor"
  | "marketplace";

export const CONNECTION_KINDS: ConnectionKind[] = [
  "venture", "build", "sketch", "letter", "cohort", "problem", "lesson", "mcp", "mentor", "marketplace",
];

export type ConnectionRow = {
  id: string;
  from_kind: ConnectionKind;
  from_id: string;
  to_kind: ConnectionKind;
  to_id: string;
  label: string | null;
  created_at: string;
};

// Suggested verbs by (from → to). Lets the picker default to a sensible
// label so users don't have to type one. They can always override.
const LABEL_HINTS: Partial<Record<`${ConnectionKind}->${ConnectionKind}`, string>> = {
  "sketch->venture": "seeded from",
  "sketch->build": "spec'd in",
  "letter->venture": "for",
  "letter->mentor": "to",
  "build->problem": "addresses",
  "build->venture": "MVP for",
  "build->cohort": "submitted to",
  "mcp->cohort": "submitted to",
  "venture->problem": "tackles",
  "venture->lesson": "applies",
  "venture->mentor": "advised by",
};

export function suggestedLabel(from: ConnectionKind, to: ConnectionKind): string | undefined {
  return LABEL_HINTS[`${from}->${to}`];
}

// Human-readable for badges. "Build → MVP for Lentil Co. (venture)"
export const KIND_LABEL: Record<ConnectionKind, string> = {
  venture: "Venture",
  build: "Build",
  sketch: "Sketch",
  letter: "Letter",
  cohort: "Cohort",
  problem: "Problem",
  lesson: "Lesson",
  mcp: "MCP server",
  mentor: "Mentor",
  marketplace: "Marketplace listing",
};

// Best-effort URL builder so a connection card can link to the linked
// entity. Returns null for kinds without a public detail page.
export function hrefForEntity(kind: ConnectionKind, id: string): string | null {
  switch (kind) {
    case "venture": return `/studio/venture/${encodeURIComponent(id)}`;
    case "build": return `/studio/build/${encodeURIComponent(id)}`;
    case "sketch": return `/studio/notebook?board=${encodeURIComponent(id)}`;
    case "letter": return `/studio/letters?id=${encodeURIComponent(id)}`;
    case "cohort": return `/studio/cohorts/${encodeURIComponent(id)}`;
    case "problem": return `/studio/problems/${encodeURIComponent(id)}`;
    case "lesson": return `/studio/learn/${encodeURIComponent(id)}`;
    case "mcp": return `/mcp/${encodeURIComponent(id)}`;
    case "marketplace": return `/studio/marketplace/${encodeURIComponent(id)}`;
    case "mentor": return `/studio/mentors/${encodeURIComponent(id)}`;
    default: return null;
  }
}
