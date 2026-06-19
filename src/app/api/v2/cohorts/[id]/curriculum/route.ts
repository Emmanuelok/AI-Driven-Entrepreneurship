import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authCohort, requireCohortRole } from "@/lib/cohort-auth";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cohort ↔ curriculum track adoption.
//
// GET    — return the adopted track + its full module list (any
//          cohort member). Returns { adopted: null } when no track
//          is adopted yet.
// POST   — adopt a track. Body: { trackId }. Instructor+ only.
//          Adopting twice replaces (upsert on cohort_id PK).
// DELETE — detach the adopted track. Instructor+ only.

const PostBody = z.object({
  trackId: z.string().uuid(),
  startedAt: z.string().optional(),
});

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, adopted: null, mode: "local" });
  const { id } = await ctx.params;
  const me = await authCohort(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: link } = await sb
    .from("cohort_curriculum")
    .select("track_id, started_at, customizations, created_at")
    .eq("cohort_id", id)
    .maybeSingle();
  if (!link) return Response.json({ ok: true, adopted: null });

  const l = link as { track_id: string; started_at: string | null; customizations: Record<string, unknown>; created_at: string };
  const { data: track } = await sb
    .from("curriculum_tracks")
    .select("id, slug, title, tagline, description, pillar, level, duration_hours, modules, version, owner_user_id, organization_id")
    .eq("id", l.track_id)
    .maybeSingle();

  return Response.json({ ok: true, adopted: { link: l, track } });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const me = await authCohort(bearerToken(req), id);
  const forbidden = requireCohortRole(me, "instructor");
  if (forbidden) return forbidden;

  const parsed = await parseBody(req, PostBody);
  if (!parsed.ok) return parsed.response;
  const { trackId, startedAt } = parsed.data;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // The instructor must be able to READ the track (RLS gate). We
  // check by trying a read with the service role; if the track row
  // doesn't satisfy the view conditions we 403.
  const { data: track } = await sb
    .from("curriculum_tracks")
    .select("id, is_public, is_published, owner_user_id, organization_id")
    .eq("id", trackId)
    .maybeSingle();
  if (!track) return Response.json({ ok: false, error: "track_not_found" }, { status: 404 });
  const t = track as { is_public: boolean; is_published: boolean; owner_user_id: string | null; organization_id: string | null };
  let canRead = t.is_public && t.is_published;
  if (!canRead && t.owner_user_id === me!.userId) canRead = true;
  if (!canRead && t.organization_id) {
    const { data: role } = await sb.rpc("is_organization_member", {
      _organization_id: t.organization_id, _user_id: me!.userId,
    });
    if (role) canRead = true;
  }
  if (!canRead) return Response.json({ ok: false, error: "track_not_accessible" }, { status: 403 });

  const { error } = await sb.from("cohort_curriculum").upsert({
    cohort_id: id,
    track_id: trackId,
    started_at: startedAt ?? new Date().toISOString(),
  }, { onConflict: "cohort_id" });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const me = await authCohort(bearerToken(req), id);
  const forbidden = requireCohortRole(me, "instructor");
  if (forbidden) return forbidden;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });
  await sb.from("cohort_curriculum").delete().eq("cohort_id", id);
  return Response.json({ ok: true });
}
