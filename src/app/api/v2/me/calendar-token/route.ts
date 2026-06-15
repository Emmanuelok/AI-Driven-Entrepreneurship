import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  — return the caller's calendar feed token, minting one on first
//        call (idempotent). Used by the calendar page to show the
//        subscribe URL.
// POST  — rotate the token (invalidates any existing calendar
//        subscription). Body: {} — the action is the rotation itself.

async function resolveUser(req: Request) {
  const token = bearerToken(req);
  if (!token) return { error: Response.json({ ok: false, error: "missing_token" }, { status: 401 }) };
  const sb = supabaseAdmin();
  if (!sb) return { error: Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 }) };
  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u?.user) return { error: Response.json({ ok: false, error: "auth_failed" }, { status: 401 }) };
  return { sb, userId: u.user.id };
}

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const r = await resolveUser(req);
  if ("error" in r) return r.error;
  const { sb, userId } = r;

  // Upsert-on-read: ensure a row exists, then return it. The default
  // expression on `token` mints a fresh secret on insert.
  let { data } = await sb.from("calendar_tokens").select("token, created_at, rotated_at").eq("user_id", userId).maybeSingle();
  if (!data) {
    const ins = await sb.from("calendar_tokens").insert({ user_id: userId }).select("token, created_at, rotated_at").single();
    data = ins.data;
    if (ins.error) return Response.json({ ok: false, error: ins.error.message }, { status: 500 });
  }
  return Response.json({ ok: true, token: data!.token });
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const r = await resolveUser(req);
  if ("error" in r) return r.error;
  const { sb, userId } = r;

  // Rotate: a fresh random token + stamp rotated_at. gen_random_bytes
  // via SQL default only fires on insert, so we generate here.
  const fresh = cryptoRandomHex(24);
  const { data, error } = await sb
    .from("calendar_tokens")
    .upsert({ user_id: userId, token: fresh, rotated_at: new Date().toISOString() }, { onConflict: "user_id" })
    .select("token")
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, token: data!.token });
}

function cryptoRandomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}
