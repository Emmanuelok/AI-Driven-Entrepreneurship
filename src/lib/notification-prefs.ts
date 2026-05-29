import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

// Per-user notification prefs (push + email) loaded with a tiny TTL
// cache so a single push fan-out doesn't hammer Postgres. Default to
// "allow" — both for users who've never visited Settings, and as a
// safe fallback when Supabase isn't configured locally.

export type NotificationCategory =
  | "mention"
  | "reply"
  | "announcement"
  | "system";

export type EmailCategory =
  | "email_student_digest"
  | "email_instructor_digest";

type Row = {
  user_id: string;
  push_mention: boolean;
  push_reply: boolean;
  push_announcement: boolean;
  push_system: boolean;
  email_student_digest: boolean;
  email_instructor_digest: boolean;
};

const TTL_MS = 30_000;
const cache = new Map<string, { ts: number; row: Row | null }>();

async function load(userId: string): Promise<Row | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.row;
  if (!isSupabaseConfigured()) return null;
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data } = await sb.from("notification_prefs")
    .select("user_id, push_mention, push_reply, push_announcement, push_system, email_student_digest, email_instructor_digest")
    .eq("user_id", userId)
    .maybeSingle();
  cache.set(userId, { ts: Date.now(), row: (data as Row) ?? null });
  return (data as Row) ?? null;
}

export function invalidateNotificationPrefs(userId: string) {
  cache.delete(userId);
}

// Returns true when the user wants this category. Default: yes.
export async function shouldPush(userId: string, category: NotificationCategory): Promise<boolean> {
  const row = await load(userId);
  if (!row) return true; // no row → default allow
  switch (category) {
    case "mention": return row.push_mention;
    case "reply": return row.push_reply;
    case "announcement": return row.push_announcement;
    case "system": return row.push_system;
  }
}

export async function shouldEmail(userId: string, category: EmailCategory): Promise<boolean> {
  const row = await load(userId);
  if (!row) return true;
  return row[category];
}
