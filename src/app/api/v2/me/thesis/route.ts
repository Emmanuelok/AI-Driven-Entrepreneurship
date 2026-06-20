import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";
import {
  normalizeThesis, thesisCompleteness, canPublishThesis, missingForPublish,
  EMPTY_THESIS, type InvestorThesis,
} from "@/lib/investor-thesis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — the caller's own thesis (draft or published). Returns the
//       empty thesis when none exists yet so the editor renders.
// PUT — upsert the thesis. Publishing requires a completeness floor;
//       we reject the publish flip (but still save the draft) if the
//       thesis is too thin, returning what's missing.

const PutBody = z.object({
  thesis: z.unknown(),
});

async function resolveCaller(req: Request) {
  if (!isSupabaseConfigured()) return { error: Response.json({ ok: false, mode: "local" }, { status: 503 }) };
  const token = bearerToken(req);
  if (!token) return { error: Response.json({ ok: false, error: "missing_token" }, { status: 401 }) };
  const sb = supabaseAdmin();
  if (!sb) return { error: Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 }) };
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return { error: Response.json({ ok: false, error: "auth_failed" }, { status: 401 }) };
  return { sb, user: u.user };
}

function rowToThesis(row: Record<string, unknown> | null): InvestorThesis {
  if (!row) return { ...EMPTY_THESIS };
  return normalizeThesis({
    headline: row.headline,
    statement: row.statement,
    sectors: row.sectors,
    stages: row.stages,
    regions: row.regions,
    checkMinUsd: row.check_min_usd,
    checkMaxUsd: row.check_max_usd,
    acceptsColdPitch: row.accepts_cold_pitch,
    isPublished: row.is_published,
  });
}

export async function GET(req: Request) {
  const r = await resolveCaller(req);
  if ("error" in r) return r.error;
  const { sb, user } = r;

  const { data } = await sb.from("investor_theses").select("*").eq("user_id", user.id).maybeSingle();
  const thesis = rowToThesis(data as Record<string, unknown> | null);
  return Response.json({
    ok: true,
    thesis,
    completeness: thesisCompleteness(thesis),
    canPublish: canPublishThesis(thesis),
    missing: missingForPublish(thesis),
  });
}

export async function PUT(req: Request) {
  const r = await resolveCaller(req);
  if ("error" in r) return r.error;
  const { sb, user } = r;

  const parsed = await parseBody(req, PutBody);
  if (!parsed.ok) return parsed.response;

  const thesis = normalizeThesis(parsed.data.thesis);
  const completeness = thesisCompleteness(thesis);

  // Guard the publish flip: a thin thesis can be saved as a draft but
  // can't go public. We DON'T error — we just force is_published=false
  // and tell the caller what's missing, so the save still succeeds.
  let isPublished = thesis.isPublished;
  let publishBlocked = false;
  if (isPublished && !canPublishThesis(thesis)) {
    isPublished = false;
    publishBlocked = true;
  }

  // Was it published before? Preserve published_at on first publish.
  const { data: existing } = await sb.from("investor_theses").select("published_at, is_published").eq("user_id", user.id).maybeSingle();
  const wasPublished = (existing as { is_published?: boolean } | null)?.is_published ?? false;
  const priorPublishedAt = (existing as { published_at?: string | null } | null)?.published_at ?? null;
  const published_at = isPublished
    ? (wasPublished && priorPublishedAt ? priorPublishedAt : new Date().toISOString())
    : null;

  const { error } = await sb.from("investor_theses").upsert({
    user_id: user.id,
    headline: thesis.headline,
    statement: thesis.statement,
    sectors: thesis.sectors,
    stages: thesis.stages,
    regions: thesis.regions,
    check_min_usd: thesis.checkMinUsd,
    check_max_usd: thesis.checkMaxUsd,
    accepts_cold_pitch: thesis.acceptsColdPitch,
    is_published: isPublished,
    completeness,
    published_at,
  }, { onConflict: "user_id" });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const saved: InvestorThesis = { ...thesis, isPublished };
  return Response.json({
    ok: true,
    thesis: saved,
    completeness,
    canPublish: canPublishThesis(saved),
    missing: missingForPublish(saved),
    publishBlocked,
  });
}
