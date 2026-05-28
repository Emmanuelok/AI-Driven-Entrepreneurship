import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public read of a single marketplace build. Bumps view counter.
// Returns the full code so the consumer can preview or fork.

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const { data, error } = await sb.from("public_builds").select("*").eq("slug", slug).maybeSingle();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  await sb.rpc("bump_build_views", { _slug: slug });

  return Response.json({ ok: true, build: data });
}
