import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { generateToken } from "@/lib/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  → list my MCP tokens (no secrets — just labels + metadata).
// POST → mint a new token. Returns the raw token EXACTLY ONCE. Body: { name }

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local", results: [] });
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });

  const { data } = await sb.from("mcp_tokens").select("id, name, last_used_at, created_at").eq("user_id", u.user.id).order("created_at", { ascending: false });
  return Response.json({ ok: true, results: data ?? [] });
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });

  let body: { name?: string };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const name = (body.name ?? "").trim().slice(0, 80);
  if (name.length < 2) return Response.json({ ok: false, error: "name_too_short" }, { status: 400 });

  const { raw, hash } = generateToken();
  const { data, error } = await sb.from("mcp_tokens").insert({
    user_id: u.user.id,
    name,
    token_hash: hash,
  }).select("id").single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Raw token returned ONCE — client copies it. We never store it
  // unhashed and can't show it again.
  return Response.json({ ok: true, id: data.id, token: raw, name });
}
