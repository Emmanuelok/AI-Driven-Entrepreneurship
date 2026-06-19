import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";
import { slugifyName } from "@/lib/account-types";
import { indexProfile, unindexProfile } from "@/lib/public-search-indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Own profile read + write.
//
// GET   — return the caller's profile. Mints an empty row on first
//         read so the client can render the editor without an extra
//         POST round-trip.
// PATCH — partial update. The slug is auto-generated on first save
//         from display_name (with a uniqueness suffix on collision)
//         and only the user can rewrite it explicitly via the slug
//         field. account_type is changeable but we keep the existing
//         row's persona_data intact unless the caller sends new keys.

const ACCOUNT_TYPES = ["student", "mentor", "instructor", "investor", "funder", "journalist", "institution", "general"] as const;

const PatchBody = z.object({
  account_type: z.enum(ACCOUNT_TYPES).optional(),
  display_name: z.string().min(1).max(120).optional(),
  headline: z.string().max(160).optional(),
  bio: z.string().max(2000).optional(),
  country: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  primary_language: z.string().max(40).optional(),
  avatar_url: z.string().url().nullable().optional(),
  website_url: z.string().url().nullable().optional(),
  linkedin_url: z.string().url().nullable().optional(),
  twitter_url: z.string().url().nullable().optional(),
  // Persona data is a free-form record. Per-type shape validation
  // happens client-side; the server stores whatever shape the client
  // sends so adding fields doesn't require a route deploy.
  persona_data: z.record(z.string(), z.unknown()).optional(),
  is_public: z.boolean().optional(),
  contact_policy: z.enum(["open", "institution", "closed"]).optional(),
  // Explicit slug override (validates handle shape; uniqueness
  // enforced by the unique index — collision returns 409).
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
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

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const r = await resolveCaller(req);
  if ("error" in r) return r.error;
  const { sb, user } = r;

  let { data } = await sb.from("user_profiles").select("*").eq("user_id", user.id).maybeSingle();
  if (!data) {
    // Mint an empty profile so the editor has somewhere to write.
    const ins = await sb
      .from("user_profiles")
      .insert({ user_id: user.id, display_name: user.user_metadata?.full_name ?? "" })
      .select("*")
      .single();
    if (ins.error) return Response.json({ ok: false, error: ins.error.message }, { status: 500 });
    data = ins.data;
  }
  return Response.json({ ok: true, profile: data });
}

export async function PATCH(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const r = await resolveCaller(req);
  if ("error" in r) return r.error;
  const { sb, user } = r;

  const parsed = await parseBody(req, PatchBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // Ensure a row exists, then patch.
  const { data: existing } = await sb.from("user_profiles").select("user_id, slug, persona_data").eq("user_id", user.id).maybeSingle();
  if (!existing) {
    const ins = await sb.from("user_profiles").insert({ user_id: user.id }).select("user_id, slug, persona_data").single();
    if (ins.error) return Response.json({ ok: false, error: ins.error.message }, { status: 500 });
  }

  // Mint slug on first save if the caller didn't pass one.
  let nextSlug = body.slug;
  if (!nextSlug && !(existing as { slug?: string } | null)?.slug && body.display_name) {
    nextSlug = await mintUniqueSlug(sb, slugifyName(body.display_name), user.id);
  }

  // Merge persona_data shallowly so a PATCH for a single key doesn't
  // clobber unrelated stored fields.
  const mergedPersona = body.persona_data
    ? { ...(((existing as { persona_data?: Record<string, unknown> } | null)?.persona_data) ?? {}), ...body.persona_data }
    : undefined;

  const patch: Record<string, unknown> = {};
  if (body.account_type !== undefined) patch.account_type = body.account_type;
  if (body.display_name !== undefined) patch.display_name = body.display_name;
  if (body.headline !== undefined) patch.headline = body.headline;
  if (body.bio !== undefined) patch.bio = body.bio;
  if (body.country !== undefined) patch.country = body.country;
  if (body.city !== undefined) patch.city = body.city;
  if (body.primary_language !== undefined) patch.primary_language = body.primary_language;
  if (body.avatar_url !== undefined) patch.avatar_url = body.avatar_url;
  if (body.website_url !== undefined) patch.website_url = body.website_url;
  if (body.linkedin_url !== undefined) patch.linkedin_url = body.linkedin_url;
  if (body.twitter_url !== undefined) patch.twitter_url = body.twitter_url;
  if (body.is_public !== undefined) patch.is_public = body.is_public;
  if (body.contact_policy !== undefined) patch.contact_policy = body.contact_policy;
  if (mergedPersona !== undefined) patch.persona_data = mergedPersona;
  if (nextSlug) patch.slug = nextSlug;

  if (Object.keys(patch).length === 0) {
    return Response.json({ ok: true, profile: existing ?? null });
  }

  const { data, error } = await sb
    .from("user_profiles")
    .update(patch)
    .eq("user_id", user.id)
    .select("*")
    .single();
  if (error) {
    // Slug collision: unique violation code 23505.
    if (error.code === "23505") {
      return Response.json({ ok: false, error: "slug_taken" }, { status: 409 });
    }
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Public search index sync. If the profile is now public (or just
  // flipped to public) we index it; if it just flipped to private we
  // remove it. The full row from the DB is what gets indexed so the
  // body composition sees every persisted field, not just the patch.
  const row = data as {
    user_id: string; slug: string | null; account_type: string;
    display_name: string; headline: string; bio: string;
    country: string; city: string; primary_language: string;
    persona_data: Record<string, unknown>; is_public: boolean;
  };
  if (row.slug) {
    if (row.is_public) {
      void indexProfile({
        user_id: row.user_id, slug: row.slug, account_type: row.account_type,
        display_name: row.display_name, headline: row.headline, bio: row.bio,
        country: row.country, city: row.city, primary_language: row.primary_language,
        persona_data: row.persona_data ?? {},
      });
    } else {
      void unindexProfile(row.slug);
    }
  }

  return Response.json({ ok: true, profile: data });
}

// Mint a slug that's globally unique. Tries the candidate as-is, then
// candidate-2, candidate-3, … up to a small bound; falls back to a
// random suffix so we never block a save on collisions.
async function mintUniqueSlug(
  sb: NonNullable<ReturnType<typeof supabaseAdmin>>,
  base: string,
  selfId: string,
): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const { data } = await sb.from("user_profiles").select("user_id").eq("slug", candidate).maybeSingle();
    if (!data || (data as { user_id: string }).user_id === selfId) return candidate;
  }
  const suffix = Math.floor(Math.random() * 1e6).toString(36);
  return `${base}-${suffix}`;
}
