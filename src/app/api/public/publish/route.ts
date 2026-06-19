import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { indexVenture, unindexVenture } from "@/lib/public-search-indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Publish a venture as a public profile. Owner picks the slug + the
// public-safe payload (we never auto-derive from sankofa_main, so the
// owner has explicit control over what leaks).
//
// Body: { ventureId, slug, payload, sectors?, stage?, isRaising?,
//         raisingAmountUsd?, region? }
// Returns: { ok, slug, url }
//
// The new filter fields (sectors, stage, is_raising, raising_amount,
// region) populate the columns added in 0043 so the investor browse
// surface can sort and filter without unpacking the jsonb payload on
// every query. They're all optional — omitting them leaves the row
// out of the corresponding filter chip but still reachable directly
// at /v/[slug].

type Body = {
  ventureId: string;
  slug: string;
  payload: unknown;
  sectors?: string[];
  stage?: string;
  isRaising?: boolean;
  raisingAmountUsd?: number;
  region?: string;
};

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

  // Light sanitization of filter fields. Drop weird values rather
  // than 400 — the payload is the source of truth, these are for
  // discovery filters and can be re-uploaded freely.
  const STAGES = ["idea", "discover", "mvp", "launch", "scale"];
  const cleanStage = body.stage && STAGES.includes(body.stage) ? body.stage : null;
  const cleanSectors = Array.isArray(body.sectors)
    ? body.sectors.map((s) => String(s).trim()).filter((s) => s.length > 0 && s.length <= 40).slice(0, 10)
    : [];
  const cleanRegion = typeof body.region === "string" && body.region.trim().length > 0
    ? body.region.trim().slice(0, 80)
    : null;
  const cleanRaisingAmount = typeof body.raisingAmountUsd === "number" && body.raisingAmountUsd >= 0 && body.raisingAmountUsd < 1e10
    ? Math.floor(body.raisingAmountUsd)
    : null;
  const cleanIsRaising = !!body.isRaising;

  const { error } = await sb.from("public_ventures").upsert({
    slug,
    owner_id: userId,
    venture_id: body.ventureId,
    payload: body.payload,
    sectors: cleanSectors,
    stage: cleanStage,
    is_raising: cleanIsRaising,
    raising_amount_usd: cleanRaisingAmount,
    region: cleanRegion,
    updated_at: new Date().toISOString(),
  });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Public search index sync.
  void indexVenture({
    slug,
    payload: body.payload as Record<string, unknown>,
    sectors: cleanSectors,
    stage: cleanStage,
    region: cleanRegion,
  });

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
  void unindexVenture(slug);
  return Response.json({ ok: true });
}
