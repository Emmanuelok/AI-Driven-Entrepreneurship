import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { indexProfile, indexVenture } from "@/lib/public-search-indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Backfill the public_search_index for entities that existed before
// the index was wired (or whenever the body composition changes and
// we want fresh embeddings everywhere). Gated by CRON_SECRET so it's
// safe to expose — the embed call is the expensive part.
//
// Use ?kind=profile or ?kind=venture to scope; default does both.
// Returns a {processed} count for logging.

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });

  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const kind = url.searchParams.get("kind");
  let profiles = 0;
  let ventures = 0;

  if (!kind || kind === "profile") {
    const { data } = await sb
      .from("user_profiles")
      .select("user_id, slug, account_type, display_name, headline, bio, country, city, primary_language, persona_data")
      .eq("is_public", true)
      .not("slug", "is", null)
      .limit(1000);
    for (const p of data ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await indexProfile(p as any);
      profiles++;
    }
  }
  if (!kind || kind === "venture") {
    const { data } = await sb
      .from("public_ventures")
      .select("slug, payload, sectors, stage, region")
      .limit(1000);
    for (const v of data ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await indexVenture(v as any);
      ventures++;
    }
  }

  return Response.json({ ok: true, processed: { profiles, ventures } });
}
