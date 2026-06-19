import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { createNotification } from "@/lib/notifications-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/v2/me/verifications/[token] — claim a pending
// email_institution verification. The /verify/[token] landing page
// requires the user to be signed in (so the token can only be claimed
// by the account that requested it, not by anyone who intercepted
// the link). On success we:
//   1. Flip the verifications row status to 'verified' + stamp
//      verified_at.
//   2. Mirror the institution label onto the profile's
//      persona_data.institution if the field is empty — they declared
//      it indirectly by proving the email.
//   3. Fire a notification (kind: 'verification') so the user sees a
//      green confirmation in the bell + a push to their phone.

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { token } = await params;

  const auth = bearerToken(req);
  if (!auth) return Response.json({ ok: false, error: "sign_in_required" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error: authErr } = await sb.auth.getUser(auth);
  if (authErr || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });
  const me = u.user.id;

  const { data: row } = await sb
    .from("verifications")
    .select("id, user_id, status, evidence, token_expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!row) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  const v = row as { id: string; user_id: string; status: string; evidence: Record<string, unknown>; token_expires_at: string | null };

  // Don't let one user claim another user's token even if they
  // intercepted it. The email already implies that, but we double-check.
  if (v.user_id !== me) return Response.json({ ok: false, error: "wrong_account" }, { status: 403 });
  if (v.status === "verified") return Response.json({ ok: true, alreadyVerified: true });
  if (v.token_expires_at && new Date(v.token_expires_at) < new Date()) {
    return Response.json({ ok: false, error: "expired" }, { status: 410 });
  }

  const { error: updErr } = await sb
    .from("verifications")
    .update({
      status: "verified",
      verified_at: new Date().toISOString(),
      // Burn the token — single-use semantic regardless of TTL.
      token: null,
    })
    .eq("id", v.id);
  if (updErr) return Response.json({ ok: false, error: updErr.message }, { status: 500 });

  // Best-effort mirror onto persona_data.institution if it's empty —
  // signing the email proved this institution claim.
  const institutionLabel = String((v.evidence?.institutionLabel as string | undefined) ?? "");
  if (institutionLabel) {
    const { data: profile } = await sb
      .from("user_profiles")
      .select("persona_data")
      .eq("user_id", me)
      .maybeSingle();
    const existing = (profile as { persona_data?: Record<string, unknown> } | null)?.persona_data ?? {};
    if (!existing.institution) {
      await sb
        .from("user_profiles")
        .update({ persona_data: { ...existing, institution: institutionLabel } })
        .eq("user_id", me);
    }
  }

  void createNotification({
    userId: me,
    kind: "verification",
    targetKind: "profile",
    title: `${institutionLabel || "Institution"} email verified`,
    body: "Your profile now carries the verified badge.",
    url: "/studio/profile",
  });

  return Response.json({ ok: true, institutionLabel });
}
