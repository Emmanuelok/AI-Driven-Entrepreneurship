import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Publish a venture as a public profile. Owner picks the slug + the
// public-safe payload (we never auto-derive from sankofa_main, so the
// owner has explicit control over what leaks).
//
// Body: { ventureId, slug, payload }
// Returns: { ok, slug, url }

type Body = { ventureId: string; slug: string; payload: unknown };

const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,40}$/;

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, mode: "local", error: "Cloud sync required to publish." });
  }

  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth failed" }, { status: 401 });
  const userId = u.user.id;

  let body: Body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  if (!body.ventureId || !body.payload) return Response.json({ ok: false, error: "missing fields" }, { status: 400 });

  const slug = (body.slug || "").trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    return Response.json({ ok: false, error: "Slug must be 3-40 chars: lowercase letters, digits, hyphens. Start with letter or digit." }, { status: 400 });
  }

  // Reject if someone else already owns this slug.
  const { data: existing } = await sb.from("public_ventures").select("owner_id").eq("slug", slug).maybeSingle();
  if (existing && existing.owner_id !== userId) {
    return Response.json({ ok: false, error: "That slug is taken." }, { status: 409 });
  }

  const { error } = await sb.from("public_ventures").upsert({
    slug,
    owner_id: userId,
    venture_id: body.ventureId,
    payload: body.payload,
    updated_at: new Date().toISOString(),
  });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const origin = new URL(req.url).origin;
  return Response.json({ ok: true, slug, url: `${origin}/v/${slug}` });
}

// Unpublish — owner only.
export async function DELETE(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" });

  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth failed" }, { status: 401 });

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  if (!slug) return Response.json({ ok: false, error: "missing slug" }, { status: 400 });

  await sb.from("public_ventures").delete().eq("slug", slug).eq("owner_id", u.user.id);
  return Response.json({ ok: true });
}
