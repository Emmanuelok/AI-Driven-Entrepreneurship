import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { rateLimit, rateLimited, clientIp } from "@/lib/rate-limit";
import { moderateOrBlock } from "@/lib/moderation";
import { createNotification, ownerOf } from "@/lib/notifications-server";
import { resolveMentions } from "@/lib/mentions";
import { pushToUser } from "@/lib/push-to-user";

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
  const targetUrl = body.kind === "build" ? `/studio/marketplace/${body.slug}` : `/v/${body.slug}`;
  if (owner.userId) {
    void createNotification({
      userId: owner.userId,
      kind: "comment",
      actorId: u.user.id,
      actorName: authorName,
      targetKind: body.kind as "build" | "venture",
      targetSlug: body.slug,
      title: `${authorName} commented on your ${body.kind}`,
      body: text.slice(0, 240),
      url: targetUrl,
    });
  }

  // @mention fan-out scoped to prior commenters on the SAME artifact
  // (plus the artifact owner). This is the only safe surface — we
  // never resolve mentions against random Sankofa users, only people
  // already publicly talking on this thread.
  void (async () => {
    try {
      const { data: prior } = await sb.from("comments")
        .select("user_id, author_name")
        .eq("kind", body.kind!).eq("slug", body.slug!)
        .eq("hidden", false)
        .neq("user_id", u.user.id);
      const participants = new Map<string, { user_id: string; display_name: string | null; email: string | null }>();
      for (const p of prior ?? []) {
        if (!participants.has(p.user_id)) {
          participants.set(p.user_id, { user_id: p.user_id, display_name: p.author_name, email: null });
        }
      }
      // The artifact owner is implicitly mentionable — even if they
      // haven't commented yet. We don't know their display name from
      // ownerOf(), so the mention has to use their email localpart
      // (looked up below) to match.
      if (owner.userId && !participants.has(owner.userId)) {
        try {
          const { data: u2 } = await sb.auth.admin.getUserById(owner.userId);
          const meta = (u2?.user?.user_metadata ?? {}) as { name?: string; full_name?: string };
          const display = meta.name || meta.full_name || null;
          participants.set(owner.userId, { user_id: owner.userId, display_name: display, email: u2?.user?.email ?? null });
        } catch { /* skip */ }
      }
      const { userIds } = resolveMentions(text, Array.from(participants.values()));
      const notified = new Set<string>([u.user.id, owner.userId ?? ""]);
      for (const uid of userIds) {
        if (notified.has(uid)) continue;
        await pushToUser(uid, {
          title: `${authorName} mentioned you`,
          body: text.slice(0, 140),
          url: targetUrl,
          tag: `comment-mention:${body.slug}`,
        });
        notified.add(uid);
      }
    } catch { /* best-effort */ }
  })();

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
