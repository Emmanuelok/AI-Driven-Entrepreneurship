import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { createNotification, ownerOf } from "@/lib/notifications-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST   { kind, slug }            → toggle clap on for the user (idempotent insert)
// DELETE ?kind=...&slug=...        → remove the user's clap
// GET    ?kind=...&slug=...        → { total, mine } — public read for counts

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local", total: 0, mine: false });
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const slug = url.searchParams.get("slug");
  if (!kind || !slug) return Response.json({ ok: false, error: "missing fields" }, { status: 400 });

  const { count } = await sb.from("claps").select("*", { count: "exact", head: true }).eq("kind", kind).eq("slug", slug);

  // Optional: also return whether the caller has clapped.
  let mine = false;
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (token) {
    const { data: u } = await sb.auth.getUser(token);
    if (u?.user) {
      const { data } = await sb.from("claps").select("id").eq("kind", kind).eq("slug", slug).eq("user_id", u.user.id).maybeSingle();
      mine = !!data;
    }
  }
  return Response.json({ ok: true, total: count ?? 0, mine });
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" });
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth failed" }, { status: 401 });

  let body: { kind?: string; slug?: string };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  if (!body.kind || !body.slug) return Response.json({ ok: false, error: "missing fields" }, { status: 400 });

  // Idempotent insert (RLS allows duplicate slot, unique constraint rejects dups).
  const { error: insertError } = await sb.from("claps").insert({ user_id: u.user.id, kind: body.kind, slug: body.slug });

  // Notify the artifact owner — but only on the FIRST clap (insertError null).
  // Re-clapping after an unclap shouldn't spam another notification.
  if (!insertError) {
    const owner = await ownerOf(body.kind as "build" | "venture", body.slug);
    if (owner.userId) {
      const meta = (u.user.user_metadata ?? {}) as { name?: string; full_name?: string };
      const actorName = meta.name || meta.full_name || (u.user.email ? u.user.email.split("@")[0] : "Someone");
      const url = body.kind === "build" ? `/studio/marketplace/${body.slug}` : `/v/${body.slug}`;
      void createNotification({
        userId: owner.userId,
        kind: "clap",
        actorId: u.user.id,
        actorName,
        targetKind: body.kind as "build" | "venture",
        targetSlug: body.slug,
        title: `${actorName} clapped for your ${body.kind}`,
        url,
      });
    }
  }

  // Always re-fetch the count so the client sees the latest authoritative total.
  const { count } = await sb.from("claps").select("*", { count: "exact", head: true }).eq("kind", body.kind).eq("slug", body.slug);

  return Response.json({ ok: true, total: count ?? 0, mine: true });
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
  const kind = url.searchParams.get("kind");
  const slug = url.searchParams.get("slug");
  if (!kind || !slug) return Response.json({ ok: false, error: "missing fields" }, { status: 400 });

  await sb.from("claps").delete().eq("user_id", u.user.id).eq("kind", kind).eq("slug", slug);
  const { count } = await sb.from("claps").select("*", { count: "exact", head: true }).eq("kind", kind).eq("slug", slug);
  return Response.json({ ok: true, total: count ?? 0, mine: false });
}
