import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pull all the user's store snapshots from Postgres.
// Returns: { stores: { [storeKey]: <json blob> }, updatedAt: { [storeKey]: iso } }

const TABLES = [
  ["sankofa-v1", "sankofa_main"],
  ["sankofa-build-v1", "sankofa_builds"],
  ["sankofa-sketch-v1", "sankofa_sketches"],
  ["sankofa-letters-v1", "sankofa_letters"],
  ["sankofa-ext-v1", "sankofa_ext"],
  ["sankofa-me-v1", "sankofa_me"],
] as const;

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" });

  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin client unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth failed" }, { status: 401 });
  const userId = u.user.id;

  const stores: Record<string, unknown> = {};
  const updatedAt: Record<string, string> = {};

  for (const [key, table] of TABLES) {
    const { data, error } = await sb.from(table).select("data, updated_at").eq("user_id", userId).maybeSingle();
    if (error || !data) continue;
    stores[key] = data.data;
    updatedAt[key] = data.updated_at;
  }

  return Response.json({ ok: true, stores, updatedAt });
}
