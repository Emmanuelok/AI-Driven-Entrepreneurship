import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { shouldInApp, type NotificationCategory } from "@/lib/notification-prefs";
import { pushToUser } from "@/lib/push-to-user";

// Server-side helper to create a notification for a user. Called from
// the social endpoints (clap, comment), marketplace fork, contact
// requests, workspace invites, agent runs, etc. Best-effort: never
// throws, never blocks the calling response if Supabase is unreachable.
//
// Self-notifications are skipped — claps on your own work, comments
// on your own venture don't surface in YOUR bell.
//
// Push: by default we ALSO dispatch a web-push to every device the
// recipient has subscribed (pushToUser is best-effort and respects
// the per-category prefs). Callers that explicitly don't want a push
// (e.g. low-signal background events) can pass push: false.

// v2: expanded to cover stakeholder + agent events. The underlying
// `kind` column is plain text so this stays additive — older clients
// just fall back to the system icon for unknown kinds.
export type NotificationKind =
  | "clap"
  | "comment"
  | "fork"
  | "system"
  | "contact_request"   // someone sent you a contact request
  | "contact_response"  // your contact request was accepted/declined
  | "workspace_invite"  // you got a workspace invite (typically via contact accept)
  | "verification"      // verification result (institution email, ID)
  | "agent_complete"    // an agent run you authorized finished
  | "mention";          // you were @-mentioned somewhere new

export type NotificationInsert = {
  userId: string;                                      // recipient
  kind: NotificationKind;
  actorId?: string | null;
  actorName?: string | null;
  targetKind?: "build" | "venture" | "profile" | "workspace" | "contact" | "agent" | null;
  targetSlug?: string | null;
  title: string;
  body?: string;
  url?: string;
  push?: boolean;                                      // default true
  pushCategory?: NotificationCategory;                 // pref gate; defaults by kind
};

// Per-kind defaults for which push-pref category gates the device push.
// Maps to the buckets in notification_prefs (push_mention/push_reply/
// push_announcement/push_system).
function defaultPushCategory(kind: NotificationKind): NotificationCategory {
  switch (kind) {
    case "comment":
    case "mention":
      return "mention";
    case "contact_request":
    case "contact_response":
    case "workspace_invite":
    case "clap":
    case "fork":
      return "reply";
    case "verification":
    case "agent_complete":
    case "system":
    default:
      return "system";
  }
}

export async function createNotification(n: NotificationInsert): Promise<void> {
  if (!isSupabaseConfigured()) return;
  if (!n.userId) return;
  if (n.actorId && n.actorId === n.userId) return;     // don't notify yourself

  // Honor in-app pref. System notifications use a separate gate from
  // social ones — the user might want clap/comment/fork off while
  // keeping security alerts on.
  const category = n.kind === "system" || n.kind === "verification" || n.kind === "agent_complete"
    ? "in_app_system"
    : "in_app_social";
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

  // Best-effort device push. The pushToUser helper is already a no-op
  // when VAPID isn't configured or the recipient has no subs, so this
  // is safe to always-await in callers that don't need the result.
  if (n.push !== false) {
    try {
      await pushToUser(
        n.userId,
        {
          title: n.title.slice(0, 200),
          body: n.body ? n.body.slice(0, 200) : "",
          url: n.url,
          // tag groups same-kind pushes so a flurry collapses on the
          // device into a single notification (Android behavior).
          tag: `${n.kind}-${n.targetSlug ?? n.targetKind ?? "x"}`,
        },
        { category: n.pushCategory ?? defaultPushCategory(n.kind) },
      );
    } catch { /* silent */ }
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
