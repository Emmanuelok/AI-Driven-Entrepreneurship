import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Redeem a venture share token. Anyone with a valid token gets the
// venture payload to clone into their own account. Increments uses;
// rejects expired or exhausted tokens. No auth required to view the
// payload — but the client is responsible for adding it to a user's
// own store (which is auth-protected at the sync layer).

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, mode: "local", error: "Cloud sync required to import shares." });
  }
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  let body: { token?: string };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const token = (body.token ?? "").trim();
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 400 });

  const { data: share, error } = await sb.from("venture_shares").select("*").eq("token", token).maybeSingle();
  if (error || !share) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  if (new Date(share.expires_at) < new Date()) {
    return Response.json({ ok: false, error: "expired" }, { status: 410 });
  }
  if (share.uses >= share.max_uses) {
    return Response.json({ ok: false, error: "exhausted" }, { status: 410 });
  }

  // Increment uses (best-effort — not perfectly transactional but
  // good enough for a share-by-link feature).
  await sb.from("venture_shares").update({ uses: share.uses + 1 }).eq("token", token);

  return Response.json({
    ok: true,
    payload: share.payload,
    ownerId: share.owner_id,
    sharedAt: share.created_at,
    usesRemaining: Math.max(0, share.max_uses - share.uses - 1),
  });
}
