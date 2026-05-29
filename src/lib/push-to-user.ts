import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sendPush, isPushConfigured } from "@/lib/push";

// Server-side push helper. Fans out a notification to every device a
// user has subscribed, prunes 410 Gone subscriptions, and never throws
// — every caller is "best effort" (cohort reply, AI job done, cron),
// so we return a structured result instead.
//
// Use this from API routes that want to notify someone as a side
// effect (e.g. "your thread got a reply"). The /api/notify/push-send
// HTTP endpoint also uses this under the hood.

export async function pushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string; tag?: string },
): Promise<{ ok: boolean; sent: number; pruned: number; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, sent: 0, pruned: 0, error: "supabase_not_configured" };
  if (!isPushConfigured()) return { ok: false, sent: 0, pruned: 0, error: "vapid_not_configured" };

  const sb = supabaseAdmin();
  if (!sb) return { ok: false, sent: 0, pruned: 0, error: "admin_unavailable" };

  const { data: subs } = await sb.from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) return { ok: true, sent: 0, pruned: 0 };

  const expired: string[] = [];
  let sent = 0;
  for (const s of subs) {
    const r = await sendPush(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      payload,
    );
    if (r.ok) sent++;
    else if (r.error?.startsWith("410")) expired.push(s.endpoint);
  }
  if (expired.length > 0) {
    await sb.from("push_subscriptions").delete().in("endpoint", expired);
  }
  return { ok: true, sent, pruned: expired.length };
}
