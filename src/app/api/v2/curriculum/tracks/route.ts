import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";
import { validateModules } from "@/lib/curriculum-track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Curriculum tracks — the library.
//
// GET    — list tracks the caller can see. Filter ?scope=mine (only
//          tracks owned by me / my orgs) or ?scope=public (only the
//          public library). Default returns both buckets so the UI can
//          render "Your tracks" + "Public library" in one query.
// POST   — create a new track. Caller becomes owner. Optional
//          organizationId attaches it to an org (caller must be
//          instructor+ on the org).

const CreateBody = z.object({
  title: z.string().min(2).max(160),
  tagline: z.string().max(280).optional(),
  description: z.string().max(8000).optional(),
  pillar: z.string().max(80).optional(),
  level: z.enum(["foundation", "intermediate", "advanced"]).optional(),
  duration_hours: z.number().min(0).max(10000).optional(),
  organization_id: z.string().uuid().nullable().optional(),
  modules: z.array(z.record(z.string(), z.unknown())).optional(),
});

async function resolveCaller(req: Request) {
  const token = bearerToken(req);
  if (!token) return { error: Response.json({ ok: false, error: "missing_token" }, { status: 401 }) };
  const sb = supabaseAdmin();
  if (!sb) return { error: Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 }) };
  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u?.user) return { error: Response.json({ ok: false, error: "auth_failed" }, { status: 401 }) };
  return { sb, user: u.user };
}

function slugifyTrack(title: string): string {
  return (title || "track")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "track";
}

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mine: [], public: [], mode: "local" });
  const r = await resolveCaller(req);
  if ("error" in r) return r.error;
  const { sb, user } = r;

  const cols = "id, slug, title, tagline, description, pillar, level, duration_hours, modules, organization_id, owner_user_id, forked_from, version, is_published, is_public, fork_count, created_at, updated_at";

  // The caller's tracks = anything they own + anything in an org they
  // belong to. We do this with two queries; the rows union cleanly.
  const orgIdsRes = await sb.from("organization_members")
    .select("organization_id").eq("user_id", user.id);
  const orgIds = ((orgIdsRes.data ?? []) as Array<{ organization_id: string }>).map((r) => r.organization_id);
  const orgOwnedRes = await sb.from("organizations").select("id").eq("owner_user_id", user.id);
  const ownedOrgIds = ((orgOwnedRes.data ?? []) as Array<{ id: string }>).map((r) => r.id);
  const allMineOrgIds = Array.from(new Set([...orgIds, ...ownedOrgIds]));

  const [ownedRes, orgRes, publicRes] = await Promise.all([
    sb.from("curriculum_tracks").select(cols).eq("owner_user_id", user.id),
    allMineOrgIds.length > 0
      ? sb.from("curriculum_tracks").select(cols).in("organization_id", allMineOrgIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    sb.from("curriculum_tracks")
      .select(cols)
      .eq("is_public", true)
      .eq("is_published", true)
      .order("updated_at", { ascending: false })
      .limit(60),
  ]);

  const mineSet = new Map<string, Record<string, unknown>>();
  for (const row of (ownedRes.data ?? []) as Array<Record<string, unknown>>) mineSet.set(row.id as string, row);
  for (const row of (orgRes.data ?? []) as Array<Record<string, unknown>>) mineSet.set(row.id as string, row);
  const mine = Array.from(mineSet.values());
  const mineIds = new Set(mine.map((r) => r.id as string));
  const pub = ((publicRes.data ?? []) as Array<Record<string, unknown>>).filter((r) => !mineIds.has(r.id as string));

  return Response.json({ ok: true, mine, public: pub });
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const r = await resolveCaller(req);
  if ("error" in r) return r.error;
  const { sb, user } = r;

  const parsed = await parseBody(req, CreateBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // If creating under an org, the caller must be instructor+.
  if (body.organization_id) {
    const { data: role } = await sb.rpc("is_organization_member", {
      _organization_id: body.organization_id, _user_id: user.id,
    });
    const rl = role as string | null;
    const allowed = rl === "owner" || rl === "admin" || rl === "instructor";
    if (!allowed) return Response.json({ ok: false, error: "not_authorized_for_org" }, { status: 403 });
  }

  const validated = body.modules ? validateModules(body.modules) : { ok: true as const, modules: [] };
  if (!validated.ok) return Response.json({ ok: false, error: validated.error }, { status: 400 });

  // Mint a unique slug. Up to 6 attempts then random suffix.
  async function mintSlug(): Promise<string> {
    const base = slugifyTrack(body.title);
    for (let i = 0; i < 6; i++) {
      const candidate = i === 0 ? base : `${base}-${i + 1}`;
      const { data } = await sb.from("curriculum_tracks").select("id").eq("slug", candidate).maybeSingle();
      if (!data) return candidate;
    }
    return `${base}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  }
  const slug = await mintSlug();

  const { data, error } = await sb.from("curriculum_tracks").insert({
    slug,
    owner_user_id: user.id,
    organization_id: body.organization_id ?? null,
    title: body.title,
    tagline: body.tagline ?? "",
    description: body.description ?? "",
    pillar: body.pillar ?? null,
    level: body.level ?? "foundation",
    duration_hours: body.duration_hours ?? null,
    modules: validated.modules,
  }).select("*").single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, track: data });
}
