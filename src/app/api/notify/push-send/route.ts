import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sendPush, isPushConfigured } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Send a push to a signed-in user across all their subscribed devices.
// Two callers: the user themselves (sending a test), or trusted server
// code (cron, AI job completion) using CRON_SECRET.
//
// Body: { userId?: string, title, body, url?, tag? }
//   - If `userId` omitted → send to the authenticated caller.
//   - If `userId` set → requires CRON_SECRET in ?secret= for trusted use.
// Auto-prunes subscriptions that come back with 410 Gone.

type Body = { userId?: string; title: string; body: string; url?: string; tag?: string };

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" });
  if (!isPushConfigured()) return Response.json({ ok: false, error: "vapid_not_configured" });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  let body: Body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  if (!body.title || !body.body) return Response.json({ ok: false, error: "missing fields" }, { status: 400 });

  let targetUserId = body.userId;

  // Trusted server caller path.
  const url = new URL(req.url);
  const cronSecret = url.searchParams.get("secret");
  if (body.userId && cronSecret) {
    if (cronSecret !== process.env.CRON_SECRET) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  } else {
    // Self-send: derive userId from the access token.
    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return Response.json({ ok: false, error: "missing token" }, { status: 401 });
    const { data: u, error: e1 } = await sb.auth.getUser(token);
    if (e1 || !u?.user) return Response.json({ ok: false, error: "auth failed" }, { status: 401 });
    targetUserId = u.user.id;
  }

  const { data: subs, error } = await sb.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", targetUserId);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  if (!subs || subs.length === 0) return Response.json({ ok: true, sent: 0, message: "no subscriptions" });

  const expired: string[] = [];
  let sent = 0;
  for (const s of subs) {
    const r = await sendPush(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      { title: body.title, body: body.body, url: body.url, tag: body.tag },
    );
    if (r.ok) sent++;
    else if (r.error?.startsWith("410")) expired.push(s.endpoint);
  }
  if (expired.length > 0) {
    await sb.from("push_subscriptions").delete().in("endpoint", expired);
  }
  return Response.json({ ok: true, sent, pruned: expired.length });
}
