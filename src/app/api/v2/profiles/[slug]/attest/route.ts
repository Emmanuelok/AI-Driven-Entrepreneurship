import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";
import { createNotification } from "@/lib/notifications-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Peer attestation — one user vouches for another in a specific role.
//
// POST   — create or update an attestation. Idempotent on (attestor,
//          attested, kind): re-posting edits the body via upsert.
// DELETE — revoke your own attestation. Caller specifies ?kind so
//          they can clear one role-vouch without affecting another.
//
// We notify the attested user on a fresh vouch (not on updates) so
// they see a one-shot "X vouched for you as a mentor" in their bell.

const PostBody = z.object({
  kind: z.enum(["mentor", "founder", "investor", "instructor", "funder", "collaborator"]),
  body: z.string().min(8).max(600),
});

async function resolveCaller(req: Request, slug: string) {
  const token = bearerToken(req);
  if (!token) return { error: Response.json({ ok: false, error: "missing_token" }, { status: 401 }) };
  const sb = supabaseAdmin();
  if (!sb) return { error: Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 }) };
  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u?.user) return { error: Response.json({ ok: false, error: "auth_failed" }, { status: 401 }) };

  const { data: target } = await sb
    .from("user_profiles")
    .select("user_id, display_name")
    .eq("slug", slug)
    .maybeSingle();
  if (!target) return { error: Response.json({ ok: false, error: "not_found" }, { status: 404 }) };

  return { sb, caller: u.user, target: target as { user_id: string; display_name: string } };
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { slug } = await params;
  const r = await resolveCaller(req, slug);
  if ("error" in r) return r.error;
  const { sb, caller, target } = r;

  if (target.user_id === caller.id) {
    return Response.json({ ok: false, error: "self_attestation" }, { status: 400 });
  }

  const parsed = await parseBody(req, PostBody);
  if (!parsed.ok) return parsed.response;
  const { kind, body } = parsed.data;

  // Check whether this is a fresh vouch (notify) or an edit (silent).
  const { data: existing } = await sb
    .from("peer_attestations")
    .select("id")
    .eq("attestor_user_id", caller.id)
    .eq("attested_user_id", target.user_id)
    .eq("kind", kind)
    .maybeSingle();

  const { data: upserted, error } = await sb
    .from("peer_attestations")
    .upsert(
      {
        attestor_user_id: caller.id,
        attested_user_id: target.user_id,
        kind,
        body: body.trim(),
      },
      { onConflict: "attestor_user_id,attested_user_id,kind" },
    )
    .select("id, body, created_at")
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  if (!existing) {
    // Pull the attestor's display name for a richer notification.
    const { data: attestorProfile } = await sb
      .from("user_profiles")
      .select("display_name")
      .eq("user_id", caller.id)
      .maybeSingle();
    const attestorName = (attestorProfile as { display_name?: string } | null)?.display_name || caller.email?.split("@")[0] || "A member";
    void createNotification({
      userId: target.user_id,
      actorId: caller.id,
      actorName: attestorName,
      kind: "verification",
      targetKind: "profile",
      targetSlug: slug,
      title: `${attestorName} vouched for you as a ${kind}`,
      body: body.slice(0, 200),
      url: `/people/${slug}`,
    });
  }

  return Response.json({ ok: true, attestation: upserted });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { slug } = await params;
  const r = await resolveCaller(req, slug);
  if ("error" in r) return r.error;
  const { sb, caller, target } = r;

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  if (!kind) return Response.json({ ok: false, error: "missing_kind" }, { status: 400 });

  await sb
    .from("peer_attestations")
    .delete()
    .eq("attestor_user_id", caller.id)
    .eq("attested_user_id", target.user_id)
    .eq("kind", kind);
  return Response.json({ ok: true });
}
