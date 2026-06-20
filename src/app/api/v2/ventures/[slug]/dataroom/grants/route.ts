import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";
import { computeExpiresAt } from "@/lib/dataroom-access";
import { createNotification } from "@/lib/notifications-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST   — grant dataroom access. Owner-only.
//          Body: { granteeUserId | granteeSlug, days?: number | null,
//                  reason?: string }
//          Upserts on (venture_slug, granted_to_user_id) so re-granting
//          extends the expiry rather than stacking rows. Sends a
//          notification to the grantee.
// DELETE — revoke. Owner-only. Sets revoked_at; doesn't drop the row
//          so the audit trail (view counts, granted_at) survives.
//          Query: ?grantId=…

const PostBody = z.object({
  granteeUserId: z.string().uuid().optional(),
  granteeSlug: z.string().min(1).max(60).optional(),
  days: z.number().int().nullable().optional(),
  reason: z.string().max(280).optional(),
}).refine((d) => d.granteeUserId || d.granteeSlug, { message: "granteeUserId or granteeSlug required" });

async function gateOwner(req: Request, slug: string) {
  if (!isSupabaseConfigured()) return { error: Response.json({ ok: false, mode: "local" }, { status: 503 }) };
  const token = bearerToken(req);
  if (!token) return { error: Response.json({ ok: false, error: "auth_required" }, { status: 401 }) };
  const sb = supabaseAdmin();
  if (!sb) return { error: Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 }) };
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return { error: Response.json({ ok: false, error: "auth_failed" }, { status: 401 }) };

  const { data: venture } = await sb
    .from("public_ventures")
    .select("slug, owner_id, payload")
    .eq("slug", slug)
    .maybeSingle();
  if (!venture) return { error: Response.json({ ok: false, error: "venture_not_found" }, { status: 404 }) };
  if ((venture as { owner_id: string }).owner_id !== u.user.id) {
    return { error: Response.json({ ok: false, error: "forbidden" }, { status: 403 }) };
  }
  return { sb, ownerId: u.user.id, venture: venture as { slug: string; owner_id: string; payload: Record<string, unknown> } };
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = await gateOwner(req, slug);
  if ("error" in g) return g.error;
  const { sb, ownerId, venture } = g;

  const parsed = await parseBody(req, PostBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // Resolve grantee user_id — accept either an explicit UUID or a
  // profile slug (more friendly for the UI).
  let granteeUserId = body.granteeUserId ?? null;
  if (!granteeUserId && body.granteeSlug) {
    const { data: p } = await sb
      .from("user_profiles")
      .select("user_id")
      .eq("slug", body.granteeSlug)
      .maybeSingle();
    granteeUserId = (p as { user_id?: string } | null)?.user_id ?? null;
  }
  if (!granteeUserId) return Response.json({ ok: false, error: "grantee_not_found" }, { status: 404 });
  if (granteeUserId === ownerId) return Response.json({ ok: false, error: "cannot_grant_to_self" }, { status: 400 });

  // Default expiry: 90 days. Owner can pass null to make it open-ended.
  const days = body.days === undefined ? 90 : body.days;
  const expiresAt = computeExpiresAt(new Date(), days);

  const { data, error } = await sb
    .from("venture_dataroom_grants")
    .upsert({
      venture_slug: slug,
      granted_to_user_id: granteeUserId,
      granted_by_user_id: ownerId,
      reason: body.reason ?? "",
      granted_at: new Date().toISOString(),
      expires_at: expiresAt?.toISOString() ?? null,
      revoked_at: null,
    }, { onConflict: "venture_slug,granted_to_user_id" })
    .select("*")
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Notify the grantee. Best-effort.
  const title = String((venture.payload as { title?: string }).title ?? slug);
  void createNotification({
    userId: granteeUserId,
    actorId: ownerId,
    kind: "verification",
    targetKind: "venture",
    targetSlug: slug,
    title: `Dataroom access granted: ${title}`,
    body: expiresAt ? `Expires ${expiresAt.toISOString().slice(0, 10)}.` : "Open-ended access.",
    url: `/v/${slug}/dataroom`,
  });

  return Response.json({ ok: true, grant: data });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = await gateOwner(req, slug);
  if ("error" in g) return g.error;
  const { sb } = g;

  const url = new URL(req.url);
  const grantId = url.searchParams.get("grantId");
  if (!grantId) return Response.json({ ok: false, error: "missing_grantId" }, { status: 400 });

  const { error } = await sb
    .from("venture_dataroom_grants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", grantId)
    .eq("venture_slug", slug);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
