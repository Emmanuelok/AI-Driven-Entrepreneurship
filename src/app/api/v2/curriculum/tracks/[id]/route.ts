import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";
import { validateModules } from "@/lib/curriculum-track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Single track: read by id or slug, patch (owner), delete (owner),
// publish/unpublish via the patch endpoint.
//
// We accept either a slug or a uuid in the [id] segment so both
// /curriculum/tracks/uuid and /curriculum/tracks/slug forms work.

const PatchBody = z.object({
  title: z.string().min(2).max(160).optional(),
  tagline: z.string().max(280).optional(),
  description: z.string().max(8000).optional(),
  pillar: z.string().max(80).nullable().optional(),
  level: z.enum(["foundation", "intermediate", "advanced"]).optional(),
  duration_hours: z.number().min(0).max(10000).nullable().optional(),
  modules: z.array(z.record(z.string(), z.unknown())).optional(),
  is_published: z.boolean().optional(),
  is_public: z.boolean().optional(),
});

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

async function resolveTrack(sb: NonNullable<ReturnType<typeof supabaseAdmin>>, idOrSlug: string) {
  const col = isUuid(idOrSlug) ? "id" : "slug";
  const { data } = await sb
    .from("curriculum_tracks")
    .select("*")
    .eq(col, idOrSlug)
    .maybeSingle();
  return data as Record<string, unknown> | null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const track = await resolveTrack(sb, id);
  if (!track) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  // Visibility: published-and-public is world-visible to signed-in.
  // Owner or org member sees regardless. We make the decision here
  // rather than relying on RLS so we can return crisp 403/404.
  const t = track as { is_public: boolean; is_published: boolean; owner_user_id: string | null; organization_id: string | null };
  let allowed = t.is_public && t.is_published;

  const token = bearerToken(req);
  let viewerId: string | null = null;
  if (token) {
    const { data: u } = await sb.auth.getUser(token);
    viewerId = u?.user?.id ?? null;
  }

  if (!allowed && viewerId) {
    if (t.owner_user_id === viewerId) allowed = true;
    if (!allowed && t.organization_id) {
      const { data: role } = await sb.rpc("is_organization_member", {
        _organization_id: t.organization_id, _user_id: viewerId,
      });
      if (role) allowed = true;
    }
  }

  if (!allowed) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  return Response.json({ ok: true, track });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;

  const token = bearerToken(req);
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });

  const track = await resolveTrack(sb, id);
  if (!track) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  const t = track as { id: string; owner_user_id: string | null; organization_id: string | null; version: number };

  // Authority: owner can patch directly; org admin+ can patch org-
  // owned tracks.
  let allowed = t.owner_user_id === u.user.id;
  if (!allowed && t.organization_id) {
    const { data: role } = await sb.rpc("is_organization_member", {
      _organization_id: t.organization_id, _user_id: u.user.id,
    });
    const rl = role as string | null;
    allowed = rl === "owner" || rl === "admin";
  }
  if (!allowed) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  const parsed = await parseBody(req, PatchBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) patch.title = body.title;
  if (body.tagline !== undefined) patch.tagline = body.tagline;
  if (body.description !== undefined) patch.description = body.description;
  if (body.pillar !== undefined) patch.pillar = body.pillar;
  if (body.level !== undefined) patch.level = body.level;
  if (body.duration_hours !== undefined) patch.duration_hours = body.duration_hours;
  if (body.is_published !== undefined) patch.is_published = body.is_published;
  if (body.is_public !== undefined) patch.is_public = body.is_public;
  if (body.modules !== undefined) {
    const v = validateModules(body.modules);
    if (!v.ok) return Response.json({ ok: false, error: v.error }, { status: 400 });
    patch.modules = v.modules;
    // Bump version every time modules change so subscribed cohorts
    // can detect curriculum drift.
    patch.version = t.version + 1;
  }
  if (Object.keys(patch).length === 0) return Response.json({ ok: true, noop: true });

  const { data, error: e2 } = await sb.from("curriculum_tracks").update(patch).eq("id", t.id).select("*").single();
  if (e2) return Response.json({ ok: false, error: e2.message }, { status: 500 });
  return Response.json({ ok: true, track: data });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;

  const token = bearerToken(req);
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });
  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });

  const track = await resolveTrack(sb, id);
  if (!track) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  const t = track as { id: string; owner_user_id: string | null };
  if (t.owner_user_id !== u.user.id) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { error: e2 } = await sb.from("curriculum_tracks").delete().eq("id", t.id);
  if (e2) return Response.json({ ok: false, error: e2.message }, { status: 500 });
  return Response.json({ ok: true });
}
