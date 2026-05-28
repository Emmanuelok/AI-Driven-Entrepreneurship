import { logEvent, EventKind, EventLevel } from "@/lib/events";
import { rateLimit, rateLimited, clientIp } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Client-side reporter endpoint. Browser sends errors / breadcrumbs
// here, server tags with the IP hash + (optional) user id then writes
// to public.events. Rate-limited per IP so a misbehaving page can't
// flood the log.
//
// Body: { kind, level?, scope?, message?, ctx? }

type Body = {
  kind: EventKind;
  level?: EventLevel;
  scope?: string;
  message?: string;
  ctx?: Record<string, unknown>;
};

export async function POST(req: Request) {
  const rl = rateLimit({ scope: "events", ipKey: clientIp(req), maxCalls: 120 });
  if (!rl.ok) return rateLimited(rl);

  let body: Body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  if (!body.kind || !body.message) return Response.json({ ok: false, error: "missing fields" }, { status: 400 });

  // Optional user attribution from Authorization header.
  let userId: string | undefined;
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (token) {
    try {
      const sb = supabaseAdmin();
      const { data } = sb ? await sb.auth.getUser(token) : { data: { user: null } };
      userId = data?.user?.id;
    } catch { /* anonymous is fine */ }
  }

  // Truncate message + ctx so a bad caller can't write 50MB JSON.
  const message = body.message.slice(0, 2000);
  const ctx = JSON.stringify(body.ctx ?? {}).length > 8000 ? { truncated: true } : (body.ctx ?? {});

  await logEvent({
    kind: body.kind,
    level: body.level ?? "info",
    scope: body.scope?.slice(0, 120),
    message,
    ctx,
    userId,
    ip: clientIp(req),
    ua: req.headers.get("user-agent") ?? undefined,
  });

  return Response.json({ ok: true });
}
