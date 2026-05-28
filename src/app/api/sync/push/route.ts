import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Push the client's current store snapshots to Postgres.
// Body: { stores: { [storeKey]: <json blob> } }
// One row per (user_id, store), upserted. Last-write-wins.

const STORE_TO_TABLE: Record<string, string> = {
  "sankofa-v1": "sankofa_main",
  "sankofa-build-v1": "sankofa_builds",
  "sankofa-sketch-v1": "sankofa_sketches",
  "sankofa-letters-v1": "sankofa_letters",
  "sankofa-ext-v1": "sankofa_ext",
  "sankofa-me-v1": "sankofa_me",
};

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" });

  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin client unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth failed" }, { status: 401 });
  const userId = u.user.id;

  let body: { stores?: Record<string, unknown> } = {};
  try { body = await req.json(); } catch {}
  const stores = body.stores ?? {};

  const pushed: string[] = [];
  const failed: { store: string; error: string }[] = [];

  for (const [key, blob] of Object.entries(stores)) {
    const table = STORE_TO_TABLE[key];
    if (!table) continue;
    const { error } = await sb.from(table).upsert({ user_id: userId, data: blob, updated_at: new Date().toISOString() });
    if (error) failed.push({ store: key, error: error.message });
    else pushed.push(key);
  }

  return Response.json({ ok: failed.length === 0, pushed, failed, syncedAt: new Date().toISOString() });
}
