import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — fork a track. The caller becomes owner of the new track; the
// modules + metadata are copied; forked_from points at the parent;
// the parent's fork_count is incremented (best-effort, so a slow row
// update doesn't block the response).
//
// Body: { organization_id?: uuid }
//
// The caller must be able to READ the parent track (RLS already
// enforces this; we double-check after the read). Forking a private
// track they can read is allowed — the parent stays untouched and
// the fork becomes a new owner-private track until they publish it.

const ForkBody = z.object({
  organization_id: z.string().uuid().nullable().optional(),
  title_override: z.string().min(2).max(160).optional(),
});

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;

  const token = bearerToken(req);
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });
  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });

  const parsed = await parseBody(req, ForkBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // If forking under an org, the caller must be instructor+.
  if (body.organization_id) {
    const { data: role } = await sb.rpc("is_organization_member", {
      _organization_id: body.organization_id, _user_id: u.user.id,
    });
    const rl = role as string | null;
    const allowed = rl === "owner" || rl === "admin" || rl === "instructor";
    if (!allowed) return Response.json({ ok: false, error: "not_authorized_for_org" }, { status: 403 });
  }

  const col = isUuid(id) ? "id" : "slug";
  const { data: parent } = await sb
    .from("curriculum_tracks")
    .select("id, slug, title, tagline, description, pillar, level, duration_hours, modules, is_public, is_published, fork_count, owner_user_id, organization_id")
    .eq(col, id)
    .maybeSingle();
  if (!parent) return Response.json({ ok: false, error: "parent_not_found" }, { status: 404 });
  const p = parent as Record<string, unknown> & {
    id: string; slug: string; title: string; tagline: string;
    description: string; pillar: string | null; level: "foundation" | "intermediate" | "advanced";
    duration_hours: number | null; modules: unknown[]; is_public: boolean;
    is_published: boolean; fork_count: number;
    owner_user_id: string | null; organization_id: string | null;
  };

  // Read gate: must satisfy at least one of the conditions in 0049 RLS.
  let canRead = p.is_public && p.is_published;
  if (!canRead && p.owner_user_id === u.user.id) canRead = true;
  if (!canRead && p.organization_id) {
    const { data: role } = await sb.rpc("is_organization_member", {
      _organization_id: p.organization_id, _user_id: u.user.id,
    });
    if (role) canRead = true;
  }
  if (!canRead) return Response.json({ ok: false, error: "forbidden" }, { status: 403 });

  // Mint a unique slug for the fork: parent-slug + "-fork" suffix
  // pattern with collision probing. Cheap to query.
  const forkBase = `${p.slug}-fork`.slice(0, 60);
  const sbForSlug = sb;
  async function mintSlug(): Promise<string> {
    for (let i = 0; i < 6; i++) {
      const candidate = i === 0 ? forkBase : `${forkBase}-${i + 1}`;
      const { data } = await sbForSlug.from("curriculum_tracks").select("id").eq("slug", candidate).maybeSingle();
      if (!data) return candidate;
    }
    return `${forkBase}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  }
  const slug = await mintSlug();

  const { data: fork, error: e2 } = await sb.from("curriculum_tracks").insert({
    slug,
    owner_user_id: u.user.id,
    organization_id: body.organization_id ?? null,
    forked_from: p.id,
    title: body.title_override ?? `${p.title} (fork)`,
    tagline: p.tagline,
    description: p.description,
    pillar: p.pillar,
    level: p.level,
    duration_hours: p.duration_hours,
    modules: p.modules,
    is_published: false,
    is_public: false,
  }).select("*").single();
  if (e2) return Response.json({ ok: false, error: e2.message }, { status: 500 });

  // Bump parent fork_count best-effort.
  void sb.from("curriculum_tracks")
    .update({ fork_count: p.fork_count + 1 })
    .eq("id", p.id);

  return Response.json({ ok: true, track: fork });
}
