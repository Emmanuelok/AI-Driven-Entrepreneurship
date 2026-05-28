import { supabaseAdmin } from "@/lib/supabase";

// Two ways to be admin:
//   1. A row in public.admins (long-lived, granted out of band)
//   2. Email matches SANKOFA_ADMIN_EMAILS env var (comma-separated)
//
// The env-based path lets you bootstrap the first admin without having
// to write to the database first.

export async function isAdmin(accessToken: string | undefined): Promise<{ ok: boolean; userId?: string; email?: string }> {
  if (!accessToken) return { ok: false };
  const sb = supabaseAdmin();
  if (!sb) return { ok: false };
  const { data: u, error } = await sb.auth.getUser(accessToken);
  if (error || !u?.user) return { ok: false };

  const email = (u.user.email ?? "").toLowerCase().trim();
  const envList = (process.env.SANKOFA_ADMIN_EMAILS ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  if (email && envList.includes(email)) return { ok: true, userId: u.user.id, email };

  const { data: row } = await sb.from("admins").select("user_id").eq("user_id", u.user.id).maybeSingle();
  if (row) return { ok: true, userId: u.user.id, email };

  return { ok: false, userId: u.user.id, email };
}
