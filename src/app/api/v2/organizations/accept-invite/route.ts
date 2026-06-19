import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Org invite redemption.
//
// GET  ?token=…           — peek (no auth). Returns the org's public-
//                          safe summary so /org-invite/[token] can
//                          render before the user signs in.
// GET  ?token=…&authed=1  — authed peek. Adds whether the caller is
//                          already a member so the UI can short-circuit
//                          the "Join" button.
// POST { token }          — claim. Requires Bearer auth. Idempotent for
//                          existing members.

const POST_BODY = z.object({ token: z.string().min(8).max(64) });

type Invite = {
  id: string;
  organization_id: string;
  email: string | null;
  role: "admin" | "instructor" | "staff" | "observer";
  max_uses: number;
  uses: number;
  expires_at: string;
};

async function fetchActive(sb: ReturnType<typeof supabaseAdmin>, token: string):
  Promise<{ invite: Invite; reason: null } | { invite: null; reason: string }> {
  if (!sb) return { invite: null, reason: "admin_unavailable" };
  const { data } = await sb
    .from("organization_invites")
    .select("id, organization_id, email, role, max_uses, uses, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!data) return { invite: null, reason: "not_found" };
  if (new Date(data.expires_at) < new Date()) return { invite: null, reason: "expired" };
  if (data.uses >= data.max_uses) return { invite: null, reason: "exhausted" };
  return { invite: data as Invite, reason: null };
}

async function orgSummary(sb: ReturnType<typeof supabaseAdmin>, orgId: string) {
  if (!sb) return null;
  const { data } = await sb
    .from("organizations")
    .select("id, slug, name, kind, description, logo_url, country, city, is_verified")
    .eq("id", orgId)
    .maybeSingle();
  return data ?? null;
}

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 400 });

  const sb = supabaseAdmin();
  const { invite, reason } = await fetchActive(sb, token);
  if (!invite) return Response.json({ ok: false, error: reason }, { status: 410 });

  const org = await orgSummary(sb, invite.organization_id);
  if (!org) return Response.json({ ok: false, error: "organization_missing" }, { status: 404 });

  // Optional authed peek so the redeem page can hide the Join button
  // when the caller is already in.
  const authed = url.searchParams.get("authed");
  let alreadyMember = false;
  if (authed && sb) {
    const auth = bearerToken(req);
    if (auth) {
      const { data: u } = await sb.auth.getUser(auth);
      if (u?.user) {
        const { data: row } = await sb
          .from("organization_members")
          .select("user_id")
          .eq("organization_id", invite.organization_id)
          .eq("user_id", u.user.id)
          .maybeSingle();
        alreadyMember = !!row;
      }
    }
  }

  return Response.json({
    ok: true,
    organization: org,
    invite: {
      role: invite.role,
      emailTargeted: !!invite.email,
      expiresAt: invite.expires_at,
      usesLeft: invite.max_uses - invite.uses,
    },
    alreadyMember,
  });
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });

  const token = bearerToken(req);
  if (!token) return Response.json({ ok: false, error: "sign_in_required" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });
  const userId = u.user.id;
  const userEmail = u.user.email ?? null;
  const displayName = (u.user.user_metadata as { name?: string } | null)?.name ?? null;

  const parsed = await parseBody(req, POST_BODY);
  if (!parsed.ok) return parsed.response;

  const { invite, reason } = await fetchActive(sb, parsed.data.token);
  if (!invite) return Response.json({ ok: false, error: reason }, { status: 410 });

  // Soft email-mismatch warning (still let them in — mirrors the
  // workspace + cohort flow).
  const emailMismatch = invite.email && userEmail && invite.email.toLowerCase() !== userEmail.toLowerCase();

  // Already a member? Short-circuit.
  const { data: existing } = await sb
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", invite.organization_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) {
    return Response.json({ ok: true, organizationId: invite.organization_id, role: existing.role, alreadyMember: true });
  }

  // Insert membership + bump uses. We accept rare over-count by one on
  // racey clicks — same as the workspace flow.
  const { error: insertErr } = await sb.from("organization_members").insert({
    organization_id: invite.organization_id,
    user_id: userId,
    role: invite.role,
    email: userEmail,
    display_name: displayName,
    invited_by: null,
  });
  if (insertErr) return Response.json({ ok: false, error: insertErr.message }, { status: 500 });

  await sb.from("organization_invites").update({ uses: invite.uses + 1 }).eq("id", invite.id);

  // Single-use email-targeted invites get cleaned up after redemption.
  if (invite.email && invite.max_uses === 1) {
    await sb.from("organization_invites").delete().eq("id", invite.id);
  }

  return Response.json({
    ok: true,
    organizationId: invite.organization_id,
    role: invite.role,
    alreadyMember: false,
    emailMismatch,
  });
}
