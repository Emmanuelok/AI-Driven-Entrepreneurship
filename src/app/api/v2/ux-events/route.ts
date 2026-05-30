import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight UX event ingest. Fire-and-forget from the client; we
// derive user_id from the access token when present, otherwise the
// row is anonymous (still useful for fan-out / threshold tuning).
//
// Body: { kind: string, meta?: Record<string, unknown> }
//
// We deliberately don't return useful data — clients should treat
// this as a void.

type Body = { kind?: string; meta?: Record<string, unknown> };

// Whitelist of known event kinds. Anything outside this set is
// rejected so a typo or an injected client can't pollute the table.
const KNOWN_KINDS = new Set<string>([
  "companion_starter_clicked",
  "companion_proactive_shown",
  "companion_proactive_clicked",
  "companion_opened",
  "mcp_search",
]);

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local" });
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  let body: Body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const kind = (body.kind ?? "").trim();
  if (!kind || !KNOWN_KINDS.has(kind)) return Response.json({ ok: false, error: "unknown_kind" }, { status: 400 });

  // Resolve user_id from the access token if supplied. Anonymous is fine.
  let userId: string | null = null;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (token) {
    try {
      const { data } = await sb.auth.getUser(token);
      userId = data?.user?.id ?? null;
    } catch { /* anonymous fallthrough */ }
  }

  // Defensive cap on meta size — don't let a misbehaving client log a
  // 100KB blob per click.
  let meta: Record<string, unknown> | null = null;
  if (body.meta && typeof body.meta === "object") {
    try {
      const serialized = JSON.stringify(body.meta);
      if (serialized.length <= 2048) meta = body.meta;
    } catch { /* drop unserializable */ }
  }

  await sb.from("ux_events").insert({ user_id: userId, kind, meta });
  return Response.json({ ok: true });
}
