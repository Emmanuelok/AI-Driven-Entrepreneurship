import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";
import { parseInstitutionEmail } from "@/lib/institution-email";
import { sendEmail, emailShell } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Trust layer — own verifications.
//
// GET  — list every verification on the caller's account (pending +
//        verified). The profile page surfaces these so the user
//        understands what earns them the verified badge.
// POST — start a new verification. Today we support kind ==
//        "email_institution"; the caller passes the institutional
//        email they control, we mint a 24-hour token, persist the
//        pending row, and email a magic link that lands on
//        /verify/[token]. Sending falls back to local-mode no-op
//        when RESEND isn't configured, so dev still works.

const StartBody = z.object({
  kind: z.literal("email_institution"),
  email: z.string().email().max(200),
  institutionLabel: z.string().max(120).optional(),
});

function tokenHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function resolveCaller(req: Request) {
  const token = bearerToken(req);
  if (!token) return { error: Response.json({ ok: false, error: "missing_token" }, { status: 401 }) };
  const sb = supabaseAdmin();
  if (!sb) return { error: Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 }) };
  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u?.user) return { error: Response.json({ ok: false, error: "auth_failed" }, { status: 401 }) };
  return { sb, user: u.user };
}

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, results: [], mode: "local" });
  const r = await resolveCaller(req);
  if ("error" in r) return r.error;
  const { sb, user } = r;
  const { data } = await sb
    .from("verifications")
    .select("id, kind, status, evidence, verified_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return Response.json({ ok: true, results: data ?? [] });
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const r = await resolveCaller(req);
  if ("error" in r) return r.error;
  const { sb, user } = r;

  const parsed = await parseBody(req, StartBody);
  if (!parsed.ok) return parsed.response;
  const { email, institutionLabel } = parsed.data;

  // Gate at the institution-email shape — don't waste a Resend send
  // on a personal address. The caller may still claim verification
  // through admin-attested kinds (future) if they can't get an
  // institutional email.
  const parsedEmail = parseInstitutionEmail(email);
  if (!parsedEmail.ok) {
    return Response.json(
      {
        ok: false,
        error: "not_institutional",
        message: {
          invalid_shape: "That doesn't look like a valid email.",
          disposable: "Disposable inboxes aren't accepted — use your real institutional address.",
          personal_provider: "Use the email your institution gave you (.edu, .ac.uk, .edu.gh, etc.) — personal addresses like Gmail can't verify an institution.",
          not_institutional: "We didn't recognize that as an institutional domain. Use the address your university or program gave you.",
        }[parsedEmail.reason ?? "invalid_shape"],
      },
      { status: 400 },
    );
  }

  // Burn any pending row for this kind so the user can re-request
  // without hitting the unique-token-or-stale-pending bind.
  await sb
    .from("verifications")
    .delete()
    .eq("user_id", user.id)
    .eq("kind", "email_institution")
    .eq("status", "pending");

  const token = tokenHex(24);
  const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const evidence = {
    email: parsedEmail.email,
    domain: parsedEmail.domain,
    institutionLabel: institutionLabel?.trim() || parsedEmail.inferredLabel,
  };

  const { data: row, error } = await sb
    .from("verifications")
    .insert({
      user_id: user.id,
      kind: "email_institution",
      status: "pending",
      evidence,
      token,
      token_expires_at: expires,
    })
    .select("id")
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Send the magic link. The verify route validates the token + flips
  // status to 'verified'. Origin comes from the request URL so this
  // works in preview, prod, and ngrok-style dev.
  const origin = new URL(req.url).origin;
  const verifyUrl = `${origin}/verify/${token}`;
  void sendEmail({
    to: parsedEmail.email,
    subject: `Verify ${evidence.institutionLabel || parsedEmail.domain} on Sankofa`,
    html: emailShell({
      heading: `Verify your ${evidence.institutionLabel || parsedEmail.domain} email`,
      body: `
        <p>Someone (probably you) requested to verify <strong>${escapeHtml(parsedEmail.email)}</strong> on Sankofa.</p>
        <p>Click the button below within 24 hours to complete it. The link is single-use and tied to this request.</p>
        <p style="color:#8aa39a;font-size:12px;margin-top:18px;">If you didn't request this, you can ignore this email — no account is changed.</p>
      `,
      cta: { href: verifyUrl, label: `Verify my ${evidence.institutionLabel || "institution"} email` },
    }),
    tags: [{ name: "kind", value: "verify_institution" }],
  });

  return Response.json({
    ok: true,
    id: row!.id,
    domain: parsedEmail.domain,
    institutionLabel: evidence.institutionLabel,
    // Surface whether email delivery is live or local so the UI can
    // tell the user "check your inbox" vs "check the server logs" in
    // dev. Doesn't leak which env we're in — RESEND key presence is
    // a config fact, not a secret.
    delivery: process.env.RESEND_API_KEY ? "live" : "local",
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}
