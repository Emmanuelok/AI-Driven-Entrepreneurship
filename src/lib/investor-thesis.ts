// Pure model + logic for public investor theses (Phase 77).
//
// A thesis is an investor's opt-in public "what I back" statement.
// It's richer than a saved search (which is a private alert filter):
// a thesis carries prose, a check-size range, multiple stages/regions,
// and a cold-pitch policy. Founders browse published theses to find
// the right backers and pitch them directly.
//
// Pure → the editor, the public directory, the matching surface, and
// the unit tests all agree on validation + scoring + matching.

import type { MatchableVenture, Stage } from "./saved-search";
import { VALID_STAGES, stageLabel } from "./saved-search";

export type InvestorThesis = {
  // One-line positioning: "Pre-seed climate & fintech across West Africa".
  headline: string;
  // Longer prose — what they look for, how they help, anti-portfolio.
  statement: string;
  sectors: string[];
  stages: Stage[];
  regions: string[];
  // Inclusive check-size bounds in USD. null = unbounded on that side.
  checkMinUsd: number | null;
  checkMaxUsd: number | null;
  // Whether the investor invites cold pitches from founders.
  acceptsColdPitch: boolean;
  // Opt-in publish flag. False keeps the thesis a private draft.
  isPublished: boolean;
};

export const EMPTY_THESIS: InvestorThesis = {
  headline: "",
  statement: "",
  sectors: [],
  stages: [],
  regions: [],
  checkMinUsd: null,
  checkMaxUsd: null,
  acceptsColdPitch: false,
  isPublished: false,
};

// ── Normalization ───────────────────────────────────────────────────

function normStringArray(input: unknown, opts: { maxItems: number; maxLen: number; lower?: boolean }): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    let s = raw.trim().slice(0, opts.maxLen);
    if (opts.lower) s = s.toLowerCase();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= opts.maxItems) break;
  }
  return out;
}

function normStages(input: unknown): Stage[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: Stage[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const s = raw.trim().toLowerCase() as Stage;
    if (!(VALID_STAGES as readonly string[]).includes(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function normNonNegInt(input: unknown, max = 1_000_000_000): number | null {
  if (input === null || input === undefined || input === "") return null;
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n)) return null;
  const floored = Math.floor(n);
  if (floored < 0) return null;
  return Math.min(floored, max);
}

function normString(input: unknown, maxLen: number): string {
  if (typeof input !== "string") return "";
  return input.trim().slice(0, maxLen);
}

export function normalizeThesis(input: unknown): InvestorThesis {
  if (!input || typeof input !== "object") return { ...EMPTY_THESIS };
  const raw = input as Record<string, unknown>;

  let checkMinUsd = normNonNegInt(raw.checkMinUsd);
  let checkMaxUsd = normNonNegInt(raw.checkMaxUsd);
  if (checkMinUsd != null && checkMaxUsd != null && checkMinUsd > checkMaxUsd) {
    [checkMinUsd, checkMaxUsd] = [checkMaxUsd, checkMinUsd];
  }

  return {
    headline: normString(raw.headline, 120),
    statement: normString(raw.statement, 4000),
    sectors: normStringArray(raw.sectors, { maxItems: 12, maxLen: 40, lower: true }),
    stages: normStages(raw.stages),
    regions: normStringArray(raw.regions, { maxItems: 10, maxLen: 60 }),
    checkMinUsd,
    checkMaxUsd,
    acceptsColdPitch: raw.acceptsColdPitch === true || raw.acceptsColdPitch === "1" || raw.acceptsColdPitch === 1,
    isPublished: raw.isPublished === true || raw.isPublished === "1" || raw.isPublished === 1,
  };
}

// ── Completeness ────────────────────────────────────────────────────

// A 0-100 score rewarding a filled-out thesis. Drives a "complete your
// thesis" nudge in the editor and gates publishing (we require a
// minimum so the directory isn't full of empty shells).
export const THESIS_PUBLISH_MIN_SCORE = 50;

export function thesisCompleteness(t: InvestorThesis): number {
  let score = 0;
  if (t.headline.trim().length >= 8) score += 25;
  if (t.statement.trim().length >= 40) score += 25;
  if (t.sectors.length > 0) score += 15;
  if (t.stages.length > 0) score += 15;
  if (t.regions.length > 0) score += 10;
  if (t.checkMinUsd != null || t.checkMaxUsd != null) score += 10;
  return Math.min(100, score);
}

// Whether the thesis is complete enough to publish.
export function canPublishThesis(t: InvestorThesis): boolean {
  return thesisCompleteness(t) >= THESIS_PUBLISH_MIN_SCORE;
}

// Ordered list of the next things to fill in, for the editor's
// "to publish, add…" hint. Empty when publishable.
export function missingForPublish(t: InvestorThesis): string[] {
  const missing: string[] = [];
  if (t.headline.trim().length < 8) missing.push("a headline");
  if (t.statement.trim().length < 40) missing.push("a thesis statement");
  if (t.sectors.length === 0) missing.push("at least one sector");
  if (t.stages.length === 0) missing.push("at least one stage");
  return missing;
}

// ── Formatting ──────────────────────────────────────────────────────

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}

export function formatCheckRange(t: Pick<InvestorThesis, "checkMinUsd" | "checkMaxUsd">): string | null {
  const { checkMinUsd: min, checkMaxUsd: max } = t;
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${fmtUsd(min)}–${fmtUsd(max)}`;
  if (min != null) return `${fmtUsd(min)}+`;
  return `up to ${fmtUsd(max!)}`;
}

// Short summary for a directory card / chip.
export function summarizeThesis(t: InvestorThesis): string {
  const parts: string[] = [];
  if (t.stages.length > 0) parts.push(t.stages.map((s) => stageLabel(s)).join("/"));
  if (t.sectors.length > 0) {
    const shown = t.sectors.slice(0, 3).map(capitalize);
    const more = t.sectors.length - shown.length;
    parts.push(shown.join(", ") + (more > 0 ? ` +${more}` : ""));
  }
  if (t.regions.length > 0) parts.push(t.regions.slice(0, 2).join(", "));
  const check = formatCheckRange(t);
  if (check) parts.push(`checks ${check}`);
  if (parts.length === 0) return "Open thesis";
  return parts.join(" · ");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Thesis ↔ venture matching ───────────────────────────────────────
//
// Founders see "investors whose thesis fits this venture". A thesis is
// broader than a saved search (multiple stages, a check RANGE rather
// than a single bound), so this has its own predicate rather than
// reusing matchVenture. A thesis matches a venture when, for every
// dimension the investor specified, the venture is consistent:
//   - sectors: ANY overlap (thesis empty = any)
//   - stages: venture stage ∈ thesis stages (thesis empty = any)
//   - regions: venture region ∈ thesis regions (thesis empty = any)
//   - check range: venture ask within [min,max] (null ask = unknown,
//     included; thesis with no range = any)

export function thesisMatchesVenture(t: InvestorThesis, v: MatchableVenture): boolean {
  if (t.sectors.length > 0) {
    const vsec = new Set((v.sectors ?? []).map((s) => s.toLowerCase()));
    if (!t.sectors.some((s) => vsec.has(s.toLowerCase()))) return false;
  }
  if (t.stages.length > 0) {
    if (!v.stage || !(t.stages as string[]).includes(String(v.stage))) return false;
  }
  if (t.regions.length > 0) {
    const vregion = (v.region ?? "").toLowerCase();
    if (!t.regions.some((r) => r.toLowerCase() === vregion)) return false;
  }
  const ask = v.raising_amount_usd;
  if (ask != null) {
    if (t.checkMinUsd != null && ask < t.checkMinUsd) return false;
    if (t.checkMaxUsd != null && ask > t.checkMaxUsd) return false;
  }
  return true;
}

// A relevance score (0-100) for ranking thesis matches — rewards more
// specific overlaps so a tightly-aligned investor ranks above a
// catch-all one. Only meaningful when thesisMatchesVenture is true.
export function thesisMatchScore(t: InvestorThesis, v: MatchableVenture): number {
  let score = 0;
  const vsec = new Set((v.sectors ?? []).map((s) => s.toLowerCase()));
  const sectorOverlap = t.sectors.filter((s) => vsec.has(s.toLowerCase())).length;
  if (sectorOverlap > 0) score += Math.min(40, sectorOverlap * 20);
  if (t.stages.length > 0 && v.stage && (t.stages as string[]).includes(String(v.stage))) score += 25;
  if (t.regions.length > 0 && v.region && t.regions.some((r) => r.toLowerCase() === v.region!.toLowerCase())) score += 20;
  const ask = v.raising_amount_usd;
  if (ask != null && (t.checkMinUsd != null || t.checkMaxUsd != null)) score += 15;
  return Math.min(100, score);
}
