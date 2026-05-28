import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authCohort, requireCohortRole } from "@/lib/cohort-auth";
import { sendEmail, emailShell } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST   { email, role? }  — instructor invites a student (or co-instructor)
// DELETE ?id=...           — instructor revokes a pending invite

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authCohort(token, id);
  const forbidden = requireCohortRole(me, "instructor");
  if (forbidden) return forbidden;

  let body: { email?: string; role?: string };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const email = (body.email ?? "").trim().toLowerCase();
  const role = body.role === "instructor" ? "instructor" : "student";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  // Try to find an existing user; add them directly. (Same caveat as
  // venture invites — replace with a profiles-table lookup when the
  // user base grows past a single page of auth.users.)
  const { data: userByEmail } = await sb.auth.admin.listUsers({ page: 1, perPage: 1 });
  const existing = userByEmail?.users?.find((u) => (u.email ?? "").toLowerCase() === email);

  if (existing) {
    const { error } = await sb.from("cohort_members").upsert({
      cohort_id: id,
      user_id: existing.id,
      role,
      email,
      display_name: (existing.user_metadata as { name?: string } | null)?.name ?? null,
    }, { onConflict: "cohort_id,user_id" });
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({ ok: true, mode: "added_directly" });
  }

  const { data: invite, error } = await sb.from("cohort_invites").insert({
    cohort_id: id,
    email,
    role,
    invited_by: me!.userId,
  }).select("id, token").single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const { data: cohort } = await sb.from("cohorts").select("name, institution").eq("id", id).maybeSingle();
  const origin = new URL(req.url).origin;
  const link = `${origin}/studio/cohorts?accept=${encodeURIComponent(invite.token)}`;
  void sendEmail({
    to: email,
    subject: `You're invited to "${cohort?.name ?? "a cohort"}" on Sankofa`,
    html: emailShell({
      heading: `Join "${cohort?.name ?? "this cohort"}"`,
      body: `<p>${me!.email ?? "An instructor"}${cohort?.institution ? ` at ${cohort.institution}` : ""} invited you to a ${role === "instructor" ? "co-teaching" : "learning"} cohort on Sankofa Studio.</p><p>Click below to accept. The link is good for 30 days.</p>`,
      cta: { href: link, label: "Accept invite" },
    }),
    tags: [{ name: "event", value: "cohort-invite" }],
  });

  return Response.json({ ok: true, mode: "pending", inviteId: invite.id });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authCohort(token, id);
  const forbidden = requireCohortRole(me, "instructor");
  if (forbidden) return forbidden;

  const url = new URL(req.url);
  const inviteId = url.searchParams.get("id");
  if (!inviteId) return Response.json({ ok: false, error: "missing id" }, { status: 400 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });
  await sb.from("cohort_invites").delete().eq("id", inviteId).eq("cohort_id", id);
  return Response.json({ ok: true });
}
