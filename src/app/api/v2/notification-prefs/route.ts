import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { invalidateNotificationPrefs } from "@/lib/notification-prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET   → read my prefs (returns defaults if no row exists yet)
// PATCH → upsert my prefs with the supplied partial; never accepts
//         a user_id from the client — derived from the access token.

const FIELDS = [
  "push_mention", "push_reply", "push_announcement", "push_system",
  "email_student_digest", "email_instructor_digest",
] as const;
type Field = (typeof FIELDS)[number];

const DEFAULTS: Record<Field, boolean> = {
  push_mention: true,
  push_reply: true,
  push_announcement: true,
  push_system: true,
  email_student_digest: true,
  email_instructor_digest: true,
};

async function authedUserId(req: Request): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = supabaseAdmin();
  if (!sb) return null;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await sb.auth.getUser(token);
  return data?.user?.id ?? null;
}

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local", prefs: DEFAULTS });
  const me = await authedUserId(req);
  if (!me) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data } = await sb.from("notification_prefs")
    .select("push_mention, push_reply, push_announcement, push_system, email_student_digest, email_instructor_digest")
    .eq("user_id", me).maybeSingle();
  return Response.json({ ok: true, prefs: (data as Partial<Record<Field, boolean>>) ?? DEFAULTS });
}

export async function PATCH(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const me = await authedUserId(req);
  if (!me) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: Partial<Record<Field, boolean>>;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }

  // Whitelist + coerce. Anything outside FIELDS is silently dropped.
  const patch: Partial<Record<Field, boolean>> = {};
  for (const f of FIELDS) {
    if (typeof body[f] === "boolean") patch[f] = body[f]!;
  }
  if (Object.keys(patch).length === 0) return Response.json({ ok: false, error: "no_changes" }, { status: 400 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { error } = await sb.from("notification_prefs").upsert({ user_id: me, ...patch }, { onConflict: "user_id" });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Invalidate the 30s cache so the next push call sees the new pref
  // immediately (matters when the user toggles "off" right before
  // a teammate replies to them).
  invalidateNotificationPrefs(me);
  return Response.json({ ok: true });
}
