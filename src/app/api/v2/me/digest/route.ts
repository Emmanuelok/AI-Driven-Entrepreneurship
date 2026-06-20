import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { buildDigestForUser } from "@/lib/digest-data";
import { renderDigestBodyHtml, renderDigestText } from "@/lib/digest";
import { sendEmail, emailShell } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  ?days=7 — preview the caller's personal digest (no email sent).
//                Returns the composed Digest model for on-screen render.
// POST ?days=7 — compose + email the digest to the caller's own
//                account email. On-demand (no scheduler) — the user
//                hits "send me my digest". Best-effort send; the
//                response reports the email mode (live/local).

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://sankofa.studio";

async function resolve(req: Request) {
  if (!isSupabaseConfigured()) return { error: Response.json({ ok: false, mode: "local" }, { status: 503 }) };
  const token = bearerToken(req);
  if (!token) return { error: Response.json({ ok: false, error: "missing_token" }, { status: 401 }) };
  const sb = supabaseAdmin();
  if (!sb) return { error: Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 }) };
  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u?.user) return { error: Response.json({ ok: false, error: "auth_failed" }, { status: 401 }) };
  return { sb, user: u.user };
}

function windowFromReq(req: Request): number {
  const days = parseInt(new URL(req.url).searchParams.get("days") ?? "7", 10);
  return Math.max(1, Math.min(30, Number.isFinite(days) ? days : 7));
}

async function displayName(sb: ReturnType<typeof supabaseAdmin>, userId: string, fallback: string): Promise<string> {
  if (!sb) return fallback;
  const { data } = await sb.from("user_profiles").select("display_name").eq("user_id", userId).maybeSingle();
  return (data as { display_name?: string } | null)?.display_name?.trim() || fallback;
}

export async function GET(req: Request) {
  const r = await resolve(req);
  if ("error" in r) return r.error;
  const { sb, user } = r;
  const windowDays = windowFromReq(req);
  const name = await displayName(sb, user.id, user.email?.split("@")[0] ?? "there");

  const digest = await buildDigestForUser(sb, user.id, { displayName: name, baseUrl: BASE, windowDays });
  return Response.json({ ok: true, digest });
}

export async function POST(req: Request) {
  const r = await resolve(req);
  if ("error" in r) return r.error;
  const { sb, user } = r;
  const windowDays = windowFromReq(req);
  const name = await displayName(sb, user.id, user.email?.split("@")[0] ?? "there");

  const digest = await buildDigestForUser(sb, user.id, { displayName: name, baseUrl: BASE, windowDays });

  // Nothing worth emailing — tell the caller so the UI can show a
  // friendly "all quiet" rather than sending an empty email.
  if (digest.isEmpty) {
    return Response.json({ ok: true, sent: false, reason: "empty", digest });
  }

  const to = user.email;
  if (!to) return Response.json({ ok: false, error: "no_email" }, { status: 400 });

  const html = emailShell({
    heading: digest.heading,
    body: renderDigestBodyHtml(digest),
    cta: digest.cta,
    footer: "You requested this digest from Sankofa Studio.",
  });
  const result = await sendEmail({
    to,
    subject: digest.subject,
    html,
    text: renderDigestText(digest),
    tags: [{ name: "type", value: "digest" }],
  });

  return Response.json({ ok: result.ok, sent: result.ok, mode: result.mode, error: result.error, digest });
}
