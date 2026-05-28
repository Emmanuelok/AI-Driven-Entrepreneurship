import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { rateLimit, rateLimited, clientIp } from "@/lib/rate-limit";
import { moderateOrBlock } from "@/lib/moderation";
import { createNotification, ownerOf } from "@/lib/notifications-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET    ?kind=...&slug=...     → list comments (newest first, hidden filtered out)
// POST   { kind, slug, body }   → post a comment, moderated pattern-only
// DELETE ?id=...                → delete YOUR comment

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local", results: [] });
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const slug = url.searchParams.get("slug");
  if (!kind || !slug) return Response.json({ ok: false, error: "missing fields" }, { status: 400 });

  const { data, error } = await sb
    .from("comments")
    .select("id, user_id, author_name, body, created_at")
    .eq("kind", kind).eq("slug", slug).eq("hidden", false)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, results: data ?? [] });
}

export async function POST(req: Request) {
  // 12 comments/min/IP — spam protection without throttling legit replies.
  const rl = rateLimit({ scope: "comments", ipKey: clientIp(req), maxCalls: 12 });
  if (!rl.ok) return rateLimited(rl);

  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" });
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth failed" }, { status: 401 });

  let body: { kind?: string; slug?: string; body?: string };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  if (!body.kind || !body.slug || !body.body) return Response.json({ ok: false, error: "missing fields" }, { status: 400 });

  const text = body.body.trim().slice(0, 2000);
  const blocked = await moderateOrBlock(text, { skipLLM: text.length < 400 });
  if (blocked) return blocked;

  // Author name: prefer the display_name in user_metadata, fall back to
  // email local-part. Cached at write time.
  const meta = (u.user.user_metadata ?? {}) as { name?: string; full_name?: string };
  const authorName = meta.name || meta.full_name || (u.user.email ? u.user.email.split("@")[0] : "anonymous");

  const { data, error } = await sb.from("comments").insert({
    user_id: u.user.id,
    author_name: authorName.slice(0, 60),
    kind: body.kind,
    slug: body.slug,
    body: text,
  }).select("id, user_id, author_name, body, created_at").single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Notify the artifact owner.
  const owner = await ownerOf(body.kind as "build" | "venture", body.slug);
  if (owner.userId) {
    const url = body.kind === "build" ? `/studio/marketplace/${body.slug}` : `/v/${body.slug}`;
    void createNotification({
      userId: owner.userId,
      kind: "comment",
      actorId: u.user.id,
      actorName: authorName,
      targetKind: body.kind as "build" | "venture",
      targetSlug: body.slug,
      title: `${authorName} commented on your ${body.kind}`,
      body: text.slice(0, 240),
      url,
    });
  }

  return Response.json({ ok: true, comment: data });
}

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
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ ok: false, error: "missing id" }, { status: 400 });

  await sb.from("comments").delete().eq("id", id).eq("user_id", u.user.id);
  return Response.json({ ok: true });
}
