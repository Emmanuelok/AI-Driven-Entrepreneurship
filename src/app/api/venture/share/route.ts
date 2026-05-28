import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Create a share token for a venture. The token can be redeemed by any
// signed-in Sankofa user via /api/venture/import-share — they get a
// clone of the venture in their own account (one-way, no live sync).
// True multi-user collaboration would require a venture-row refactor;
// this unblocks the common case of "send my deck to my co-founder".
//
// Body: { ventureId: string, payload: <venture object>, maxUses?: number }
// Returns: { token, shareUrl, expiresAt }

type Body = { ventureId: string; payload: unknown; maxUses?: number };

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, mode: "local", error: "Cloud sync required to share." });
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

  const { data, error } = await sb.from("venture_shares").insert({
    owner_id: userId,
    venture_id: body.ventureId,
    payload: body.payload,
    max_uses: Math.min(100, Math.max(1, body.maxUses ?? 25)),
  }).select("token, expires_at").single();

  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const origin = new URL(req.url).origin;
  return Response.json({
    ok: true,
    token: data.token,
    shareUrl: `${origin}/studio/venture?import=${encodeURIComponent(data.token)}`,
    expiresAt: data.expires_at,
  });
}
