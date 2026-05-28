import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { rateLimit, rateLimited, clientIp } from "@/lib/rate-limit";
import { logEvent } from "@/lib/events";
import { moderateOrBlock } from "@/lib/moderation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Publish a build to the public marketplace. Owner picks the slug,
// supplies title + description + tags + the runnable code. Moderated
// before insert — title + description go through the Stage-1 pattern
// check (no Stage 2 because code itself can include benign weapon/exploit
// keywords for cybersec students). Code is sandboxed at runtime via
// iframe sandbox; we don't try to vet it semantically.

type Body = {
  buildId: string;
  slug: string;
  title: string;
  description?: string;
  code: string;
  templateId?: string;
  tags?: string[];
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,40}$/;

export async function POST(req: Request) {
  const rl = rateLimit({ scope: "marketplace-publish", ipKey: clientIp(req), maxCalls: 6 });
  if (!rl.ok) return rateLimited(rl);

  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local", error: "Cloud sync required to publish." });

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
  if (!body.buildId || !body.title || !body.code) return Response.json({ ok: false, error: "missing fields" }, { status: 400 });

  const slug = (body.slug || "").trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    return Response.json({ ok: false, error: "Slug must be 3-40 chars: lowercase letters, digits, hyphens." }, { status: 400 });
  }

  // Moderate the user-visible text (title + description).
  const blocked = await moderateOrBlock(`${body.title}\n${body.description ?? ""}`, { skipLLM: true });
  if (blocked) return blocked;

  // Slug-collision check.
  const { data: existing } = await sb.from("public_builds").select("owner_id").eq("slug", slug).maybeSingle();
  if (existing && existing.owner_id !== userId) {
    return Response.json({ ok: false, error: "That slug is taken." }, { status: 409 });
  }

  // Tags: lowercase, dedupe, max 6.
  const tags = Array.from(new Set((body.tags ?? []).map((t) => String(t).trim().toLowerCase()).filter((t) => /^[a-z0-9-]+$/.test(t)))).slice(0, 6);

  const { error } = await sb.from("public_builds").upsert({
    slug,
    owner_id: userId,
    build_id: body.buildId,
    title: body.title.slice(0, 120),
    description: (body.description ?? "").slice(0, 800),
    code: body.code.slice(0, 200_000),
    template_id: body.templateId ?? null,
    tags,
    updated_at: new Date().toISOString(),
  });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  await logEvent({ kind: "publish", scope: "marketplace", userId, ctx: { slug, build_id: body.buildId, tags } });

  const origin = new URL(req.url).origin;
  return Response.json({ ok: true, slug, url: `${origin}/studio/marketplace/${slug}` });
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
  await sb.from("public_builds").delete().eq("slug", slug).eq("owner_id", u.user.id);
  return Response.json({ ok: true });
}
