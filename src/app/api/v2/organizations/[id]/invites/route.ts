import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authOrganization, requireOrganizationRole } from "@/lib/organization-auth";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";
import { createNotification } from "@/lib/notifications-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET    — list pending invites (admin+).
// POST   — create an invite. Email-targeted (single-use by default)
//          or link-share (max_uses 1..200). Admin+.
//          If we can detect that the email belongs to an EXISTING
//          Sankofa user, we ALSO fire an in-app + push notification
//          rather than waiting for them to find the email.
// DELETE — revoke (admin+). Body: { inviteId }.

const CreateBody = z.object({
  email: z.string().email().max(200).optional().nullable(),
  role: z.enum(["admin", "instructor", "staff", "observer"]).optional(),
  maxUses: z.number().int().min(1).max(200).optional(),
  expiresInDays: z.number().int().min(1).max(60).optional(),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, results: [], mode: "local" });
  const { id } = await params;
  const me = await authOrganization(bearerToken(req), id);
  const forbid = requireOrganizationRole(me, "admin");
  if (forbid) return forbid;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data } = await sb
    .from("organization_invites")
    .select("id, token, email, role, max_uses, uses, expires_at, created_at, invited_by")
    .eq("organization_id", id)
    .order("created_at", { ascending: false });

  return Response.json({ ok: true, results: data ?? [] });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authOrganization(bearerToken(req), id);
  const forbid = requireOrganizationRole(me, "admin");
  if (forbid) return forbid;

  const parsed = await parseBody(req, CreateBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const email = body.email ?? null;
  const role = body.role ?? "staff";
  // Email-targeted invites stay single-use to match the workspace +
  // cohort flow. Link-only invites default to 25 uses.
  const maxUses = body.maxUses ?? (email ? 1 : 25);
  const expiresAt = new Date(Date.now() + (body.expiresInDays ?? 14) * 86_400_000).toISOString();

  const { data: inviteRow, error } = await sb
    .from("organization_invites")
    .insert({
      organization_id: id,
      email,
      role,
      invited_by: me!.userId,
      max_uses: maxUses,
      expires_at: expiresAt,
    })
    .select("id, token, email, role, max_uses, uses, expires_at, created_at")
    .single();
  if (error || !inviteRow) return Response.json({ ok: false, error: error?.message ?? "insert_failed" }, { status: 500 });

  // Pre-notify if the email belongs to an existing user. We do this
  // best-effort — no email integration in this phase; the magic-link
  // landing page is served at /org-invite/[token] either way.
  if (email) {
    const { data: existing } = await sb
      .from("user_profiles")
      .select("user_id")
      .ilike("display_name", "%")
      .limit(0);
    // We can't query auth.users by email through RLS, but we CAN
    // probe by checking user_profiles' historical email field if we
    // had one. Until then, notification is best-effort via the
    // /org-invite landing.
    void existing; // (silences unused-var lint without leaking comment about future work)

    // Look up org name + invitee for the notification body.
    const { data: org } = await sb.from("organizations").select("name").eq("id", id).maybeSingle();
    const orgName = (org as { name: string } | null)?.name ?? "an organization";

    // Look up the auth user by email — service-role can do this via
    // the admin API.
    try {
      const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
      const match = list?.users?.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
      if (match) {
        void createNotification({
          userId: match.id,
          actorId: me!.userId,
          actorName: "Organization invite",
          kind: "workspace_invite",
          targetKind: "workspace",
          title: `You've been invited to ${orgName}`,
          body: `Role: ${role}. Click to join.`,
          url: `/org-invite/${inviteRow.token}`,
        });
      }
    } catch { /* silent: notification is a nice-to-have, the invite link works regardless */ }
  }

  return Response.json({ ok: true, invite: inviteRow });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authOrganization(bearerToken(req), id);
  const forbid = requireOrganizationRole(me, "admin");
  if (forbid) return forbid;

  const url = new URL(req.url);
  const inviteId = url.searchParams.get("inviteId");
  if (!inviteId) return Response.json({ ok: false, error: "missing_inviteId" }, { status: 400 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { error } = await sb
    .from("organization_invites")
    .delete()
    .eq("id", inviteId)
    .eq("organization_id", id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
