import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET    → list the signed-in user's notifications (newest first, 100 max)
// PATCH  { ids?: string[], allRead?: boolean } → mark read
// DELETE ?id=... | ?all=1                      → delete one or wipe

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local", results: [], unread: 0 });
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth failed" }, { status: 401 });

  const [list, unread] = await Promise.all([
    sb.from("notifications")
      .select("id, kind, actor_name, target_kind, target_slug, title, body, url, read, created_at")
      .eq("user_id", u.user.id)
      .order("created_at", { ascending: false })
      .limit(100),
    sb.from("notifications").select("*", { count: "exact", head: true }).eq("user_id", u.user.id).eq("read", false),
  ]);

  if (list.error) return Response.json({ ok: false, error: list.error.message }, { status: 500 });
  return Response.json({ ok: true, results: list.data ?? [], unread: unread.count ?? 0 });
}

export async function PATCH(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" });
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth failed" }, { status: 401 });

  let body: { ids?: string[]; allRead?: boolean };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }

  if (body.allRead) {
    await sb.from("notifications").update({ read: true }).eq("user_id", u.user.id).eq("read", false);
  } else if (Array.isArray(body.ids) && body.ids.length > 0) {
    await sb.from("notifications").update({ read: true }).eq("user_id", u.user.id).in("id", body.ids.slice(0, 100));
  } else {
    return Response.json({ ok: false, error: "specify ids or allRead" }, { status: 400 });
  }
  return Response.json({ ok: true });
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
  if (url.searchParams.get("all") === "1") {
    await sb.from("notifications").delete().eq("user_id", u.user.id);
    return Response.json({ ok: true });
  }
  const id = url.searchParams.get("id");
  if (!id) return Response.json({ ok: false, error: "missing id or all=1" }, { status: 400 });
  await sb.from("notifications").delete().eq("user_id", u.user.id).eq("id", id);
  return Response.json({ ok: true });
}
