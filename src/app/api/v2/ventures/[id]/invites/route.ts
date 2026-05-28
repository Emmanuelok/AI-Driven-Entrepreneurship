import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authVenture, requireRole } from "@/lib/venture-auth";
import { sendEmail, emailShell } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST   { email, role? }  — owner invites someone by email
// DELETE ?id=...            — owner revokes a pending invite

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authVenture(token, id);
  const forbidden = requireRole(me, "owner");
  if (forbidden) return forbidden;

  let body: { email?: string; role?: string };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const email = (body.email ?? "").trim().toLowerCase();
  const role = body.role === "viewer" ? "viewer" : "editor";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  // If the recipient already has a Sankofa account, just add them
  // directly. Otherwise create a pending invite.
  const { data: userByEmail } = await sb.auth.admin.listUsers({ page: 1, perPage: 1 });
  // Supabase doesn't ship a "find by email" out of the box; we use a
  // best-effort scan of the returned page. (For larger user bases, swap
  // for a dedicated profiles table lookup.)
  const existing = userByEmail?.users?.find((u) => (u.email ?? "").toLowerCase() === email);

  if (existing) {
    const { error } = await sb.from("venture_collaborators").upsert({
      venture_id: id,
      user_id: existing.id,
      role,
      email,
      display_name: (existing.user_metadata as { name?: string } | null)?.name ?? null,
      invited_by: me!.userId,
    }, { onConflict: "venture_id,user_id" });
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    return Response.json({ ok: true, mode: "added_directly" });
  }

  const { data: invite, error } = await sb.from("venture_invites").insert({
    venture_id: id,
    email,
    role,
    invited_by: me!.userId,
  }).select("id, token").single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Fire-and-forget email; never blocks the response.
  const { data: venture } = await sb.from("cloud_ventures").select("name").eq("id", id).maybeSingle();
  const origin = new URL(req.url).origin;
  const link = `${origin}/studio/venture?accept=${encodeURIComponent(invite.token)}`;
  void sendEmail({
    to: email,
    subject: `You've been invited to collaborate on "${venture?.name ?? "a Sankofa venture"}"`,
    html: emailShell({
      heading: `Join "${venture?.name ?? "this venture"}" on Sankofa`,
      body: `<p>${me!.email ?? "Someone"} added you as <strong>${role}</strong> on a Sankofa Studio venture.</p><p>Click below to accept. The link is good for 14 days.</p>`,
      cta: { href: link, label: "Accept invite" },
    }),
    tags: [{ name: "event", value: "venture-invite" }],
  });

  return Response.json({ ok: true, mode: "pending", inviteId: invite.id });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authVenture(token, id);
  const forbidden = requireRole(me, "owner");
  if (forbidden) return forbidden;

  const url = new URL(req.url);
  const inviteId = url.searchParams.get("id");
  if (!inviteId) return Response.json({ ok: false, error: "missing id" }, { status: 400 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  await sb.from("venture_invites").delete().eq("id", inviteId).eq("venture_id", id);
  return Response.json({ ok: true });
}
