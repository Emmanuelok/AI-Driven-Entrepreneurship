import Stripe from "stripe";

// Single Stripe client singleton. Returns null when STRIPE_SECRET_KEY
// isn't configured — every caller checks and falls back to the local
// "payments aren't wired" branch so the platform keeps working.

const KEY = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const APP_FEE_DEFAULT_PCT = Number(process.env.STRIPE_APP_FEE_PCT ?? 10);

let client: Stripe | null = null;
export function stripe(): Stripe | null {
  if (!KEY) return null;
  if (!client) {
    client = new Stripe(KEY, {
      // Pin the API version so a breaking Stripe change doesn't break us
      // silently. Bump when we test against a newer one.
      apiVersion: "2026-05-27.dahlia",
      typescript: true,
    });
  }
  return client;
}

export function isStripeConfigured(): boolean {
  return !!KEY;
}

export function isWebhookConfigured(): boolean {
  return !!WEBHOOK_SECRET;
}

export function getWebhookSecret(): string | null {
  return WEBHOOK_SECRET ?? null;
}

export function applicationFeePct(): number {
  return Number.isFinite(APP_FEE_DEFAULT_PCT) ? APP_FEE_DEFAULT_PCT : 10;
}

// Stripe Connect Express is available in most countries but not all of
// Africa yet. The seller picks their country at onboarding; we surface
// a clear message if they hit one Stripe doesn't support so they
// understand the platform isn't broken.
export function stripeSupportedCountries(): string[] {
  // Indicative subset — Stripe documents the canonical list. We surface
  // ones relevant to African student traffic so the UI hint is honest.
  return [
    "US", "GB", "CA", "AU", "NZ", "SG", "JP", "DE", "FR", "ES", "IT", "NL", "SE", "IE",
    "GH", "KE", "NG", "ZA",   // Stripe live or via Stripe Atlas
  ];
}
