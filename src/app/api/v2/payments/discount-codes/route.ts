import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  → list my discount codes (newest first).
// POST → create a code. Body: { code, kind: 'percent'|'fixed', value,
//        appliesToKind?: 'cohort'|'build', appliesToRef?: string,
//        maxRedemptions?: number, expiresAt?: ISOstring }

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local", results: [] });
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });

  const { data, error } = await sb.from("discount_codes")
    .select("id, code, kind, value, applies_to_kind, applies_to_ref, max_redemptions, redemptions, expires_at, created_at")
    .eq("seller_id", u.user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
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

  let body: { code?: string; kind?: string; value?: number; appliesToKind?: string; appliesToRef?: string; maxRedemptions?: number; expiresAt?: string };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }

  const code = (body.code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return Response.json({ ok: false, error: "invalid_code_format", message: "Codes are 3-40 chars: uppercase letters, digits, _ or -." }, { status: 400 });
  const kind = body.kind === "percent" || body.kind === "fixed" ? body.kind : null;
  if (!kind) return Response.json({ ok: false, error: "invalid_kind" }, { status: 400 });
  const value = Math.floor(body.value ?? 0);
  if (value <= 0) return Response.json({ ok: false, error: "value_must_be_positive" }, { status: 400 });
  if (kind === "percent" && value > 100) return Response.json({ ok: false, error: "percent_max_100" }, { status: 400 });

  const appliesToKind = body.appliesToKind === "cohort" || body.appliesToKind === "build" ? body.appliesToKind : null;
  const appliesToRef = (body.appliesToRef ?? "").trim() || null;

  // If scoped to a specific product, verify the caller owns it.
  if (appliesToKind && appliesToRef) {
    if (appliesToKind === "cohort") {
      const { data: c } = await sb.from("cohorts").select("owner_id").eq("id", appliesToRef).maybeSingle();
      if (!c || c.owner_id !== u.user.id) return Response.json({ ok: false, error: "not_your_cohort" }, { status: 403 });
    } else {
      const { data: b } = await sb.from("public_builds").select("owner_id").eq("slug", appliesToRef).maybeSingle();
      if (!b || b.owner_id !== u.user.id) return Response.json({ ok: false, error: "not_your_build" }, { status: 403 });
    }
  }

  const { data, error } = await sb.from("discount_codes").insert({
    seller_id: u.user.id,
    code,
    kind,
    value,
    applies_to_kind: appliesToKind,
    applies_to_ref: appliesToRef,
    max_redemptions: typeof body.maxRedemptions === "number" && body.maxRedemptions > 0 ? body.maxRedemptions : null,
    expires_at: body.expiresAt || null,
  }).select("id").single();
  if (error) {
    if (error.message?.toLowerCase().includes("uniq_discount_codes_seller_code")) {
      return Response.json({ ok: false, error: "duplicate_code", message: "You already have a code with that name." }, { status: 409 });
    }
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, id: data.id });
}
