import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public read of a published venture. No auth required.
// Bumps the view counter on each read (cheap RPC, idempotent enough).

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, mode: "local", error: "Cloud sync required to view public profiles." }, { status: 503 });
  }
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const { data, error } = await sb.from("public_ventures").select("slug, venture_id, payload, views, published_at, updated_at").eq("slug", slug).maybeSingle();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  // Best-effort view bump; not awaited critical path.
  await sb.rpc("bump_venture_views", { _slug: slug });

  return Response.json({ ok: true, ...data });
}
