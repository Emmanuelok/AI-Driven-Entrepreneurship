import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

// Server-side sign-out: revoke all sessions for the user. The browser
// will also clear its local session via supabaseBrowser().auth.signOut().
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local" });
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing token" }, { status: 400 });
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin client unavailable" }, { status: 500 });
  const { data: user, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !user?.user) return Response.json({ ok: false, error: e1?.message ?? "no user" }, { status: 401 });
  await sb.auth.admin.signOut(user.user.id);
  return Response.json({ ok: true });
}
