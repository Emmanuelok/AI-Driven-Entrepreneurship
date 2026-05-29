import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { shouldInApp } from "@/lib/notification-prefs";

// Server-side helper to create a notification for a user. Called from
// the social endpoints (clap, comment), marketplace fork, etc. Best-
// effort: never throws, never blocks the calling response if Supabase
// is unreachable.
//
// Self-notifications are skipped — claps on your own work, comments
// on your own venture don't surface in YOUR bell.

export type NotificationInsert = {
  userId: string;                                      // recipient
  kind: "clap" | "comment" | "fork" | "system";
  actorId?: string | null;
  actorName?: string | null;
  targetKind?: "build" | "venture" | null;
  targetSlug?: string | null;
  title: string;
  body?: string;
  url?: string;
};

export async function createNotification(n: NotificationInsert): Promise<void> {
  if (!isSupabaseConfigured()) return;
  if (!n.userId) return;
  if (n.actorId && n.actorId === n.userId) return;     // don't notify yourself

  // Honor in-app pref. System notifications use a separate gate from
  // social ones — the user might want clap/comment/fork off while
  // keeping security alerts on.
  const category = n.kind === "system" ? "in_app_system" : "in_app_social";
  if (!(await shouldInApp(n.userId, category))) return;

  try {
    const sb = supabaseAdmin();
    if (!sb) return;
    await sb.from("notifications").insert({
      user_id: n.userId,
      kind: n.kind,
      actor_id: n.actorId ?? null,
      actor_name: (n.actorName ?? "").slice(0, 60) || null,
      target_kind: n.targetKind ?? null,
      target_slug: n.targetSlug ?? null,
      title: n.title.slice(0, 200),
      body: n.body ? n.body.slice(0, 600) : null,
      url: n.url ?? null,
    });
  } catch {
    // Notifications failing should never break a write.
  }
}

// Look up the owner of a public artifact via the SQL helper added in
// migration 0006. Used by clap/comment to know who to notify.
export async function ownerOf(kind: "build" | "venture", slug: string): Promise<{ userId: string | null }> {
  if (!isSupabaseConfigured()) return { userId: null };
  try {
    const sb = supabaseAdmin();
    if (!sb) return { userId: null };
    const { data } = await sb.rpc("owner_of", { _kind: kind, _slug: slug });
    return { userId: (data as string | null) ?? null };
  } catch {
    return { userId: null };
  }
}
