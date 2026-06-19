// Heuristic for deciding whether an email address belongs to an
// institution (university, school) — used by the email_institution
// verification flow to (a) accept the address as plausibly
// institutional before sending the magic link, and (b) extract a
// human-readable institution label for the verification evidence.
//
// We're permissive at the gate (Africa has highly varied institutional
// domains, and false-negatives are worse than false-positives — a
// claimed verification still has to clear the magic-link). The TLD
// patterns target the .edu / academic-second-level conventions used
// across the continent, plus the global .edu fallback.
//
// Pure + deterministic; called from the API route, the onboarding
// hint, and the profile editor's pre-validate.

export type InstitutionEmailParse = {
  ok: boolean;
  email: string;          // normalized lowercase
  domain: string;         // empty when !ok
  // Human label inferred from the domain — e.g. "knust.edu.gh" → "KNUST".
  // The verification UI uses this as a default; the user can override.
  inferredLabel: string;
  reason?: "invalid_shape" | "disposable" | "personal_provider" | "not_institutional";
};

// A short, conservative deny-list of disposable + personal providers.
// Not exhaustive — we lean on the institutional TLD signal as the
// primary gate.
const DISPOSABLE_PROVIDERS = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "trashmail.com", "yopmail.com", "throwawaymail.com", "getnada.com",
]);
const PERSONAL_PROVIDERS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "ymail.com",
  "outlook.com", "hotmail.com", "live.com", "msn.com", "icloud.com",
  "me.com", "mac.com", "protonmail.com", "proton.me", "aol.com",
  "zoho.com", "gmx.com", "fastmail.com", "pm.me",
]);

// Patterns that strongly suggest an institutional domain. The first
// match wins — we don't try to disambiguate further.
const INSTITUTIONAL_PATTERNS: RegExp[] = [
  // Classic US/global academic
  /\.edu$/i,
  // UK + Commonwealth academic
  /\.ac\.[a-z]{2,4}$/i,
  // Common African + Asian academic TLD-2s
  /\.edu\.[a-z]{2,4}$/i,
  /\.sch\.[a-z]{2,4}$/i,
  // Government / public sector (sometimes hosts professorial accounts)
  /\.gov\.[a-z]{2,4}$/i,
  /\.gov$/i,
];

export function parseInstitutionEmail(raw: string): InstitutionEmailParse {
  const email = (raw ?? "").trim().toLowerCase();
  const m = email.match(/^([^\s@]+)@([^\s@]+\.[^\s@]+)$/);
  if (!m) return { ok: false, email, domain: "", inferredLabel: "", reason: "invalid_shape" };
  const domain = m[2];
  if (DISPOSABLE_PROVIDERS.has(domain)) {
    return { ok: false, email, domain, inferredLabel: "", reason: "disposable" };
  }
  if (PERSONAL_PROVIDERS.has(domain)) {
    return { ok: false, email, domain, inferredLabel: "", reason: "personal_provider" };
  }
  if (!INSTITUTIONAL_PATTERNS.some((p) => p.test(domain))) {
    return { ok: false, email, domain, inferredLabel: "", reason: "not_institutional" };
  }
  return { ok: true, email, domain, inferredLabel: inferLabel(domain) };
}

// Extract a useful human label from an institutional domain. Strategy:
// take the first label that isn't part of the TLD chain (edu, ac, gov,
// sch, plus the 2-letter country code) and uppercase it. So
// "ee.knust.edu.gh" → "KNUST", "imperial.ac.uk" → "IMPERIAL". When the
// domain has only one informative label, return it as-is.
export function inferLabel(domain: string): string {
  const parts = domain.toLowerCase().split(".");
  if (parts.length === 0) return "";
  // Strip trailing TLD-chain tokens.
  const tld = new Set(["edu", "ac", "gov", "sch", "com", "co", "net", "org"]);
  // Strip 2-letter country codes from the tail.
  while (parts.length > 1 && (tld.has(parts[parts.length - 1]) || parts[parts.length - 1].length === 2)) {
    parts.pop();
  }
  if (parts.length === 0) return "";
  // Take the LAST remaining label (closest to the TLD) — that's
  // typically the institution. Department subdomains live further left.
  const label = parts[parts.length - 1];
  return label.toUpperCase();
}
