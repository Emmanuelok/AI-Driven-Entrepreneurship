import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authOrganization, requireOrganizationRole, type OrganizationRole } from "@/lib/organization-auth";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET    — list members. Any member sees the roster; observers + staff
//          can see roles but not pending invites (those come from the
//          invites endpoint).
// PATCH  — change another member's role (admin+ only, can't promote
//          to owner — that's a separate transfer flow).
// DELETE — remove a member by user_id (admin+ to remove others; any
//          member can remove themselves except the owner).

const PatchBody = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["admin", "instructor", "staff", "observer"]),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, results: [], mode: "local" });
  const { id } = await params;
  const me = await authOrganization(bearerToken(req), id);
  const forbid = requireOrganizationRole(me, "observer");
  if (forbid) return forbid;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Include the owner's row even if organization_members doesn't have
  // one — the owner is always implicitly a member. We dedupe by
  // user_id.
  const [memRes, orgRes] = await Promise.all([
    sb.from("organization_members")
      .select("user_id, role, email, display_name, joined_at, invited_by")
      .eq("organization_id", id)
      .order("joined_at", { ascending: true }),
    sb.from("organizations").select("owner_user_id").eq("id", id).maybeSingle(),
  ]);

  const members = (memRes.data ?? []) as Array<{
    user_id: string; role: OrganizationRole; email: string | null;
    display_name: string | null; joined_at: string; invited_by: string | null;
  }>;

  return Response.json({
    ok: true,
    members,
    ownerUserId: (orgRes.data as { owner_user_id: string } | null)?.owner_user_id ?? null,
    myRole: me!.role,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authOrganization(bearerToken(req), id);
  const forbid = requireOrganizationRole(me, "admin");
  if (forbid) return forbid;

  const parsed = await parseBody(req, PatchBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // You can't change the owner's role through this endpoint. (The
  // owner's slot is special — if you want to transfer ownership,
  // that's a separate explicit flow.)
  const { data: org } = await sb.from("organizations").select("owner_user_id").eq("id", id).maybeSingle();
  if ((org as { owner_user_id: string } | null)?.owner_user_id === body.user_id) {
    return Response.json({ ok: false, error: "cannot_change_owner_role" }, { status: 400 });
  }

  const { error } = await sb
    .from("organization_members")
    .update({ role: body.role })
    .eq("organization_id", id)
    .eq("user_id", body.user_id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authOrganization(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const url = new URL(req.url);
  const targetUserId = url.searchParams.get("userId");
  if (!targetUserId) return Response.json({ ok: false, error: "missing_userId" }, { status: 400 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Owner can't be removed via this endpoint. Owners delete the org
  // itself, or transfer ownership first.
  const { data: org } = await sb.from("organizations").select("owner_user_id").eq("id", id).maybeSingle();
  if ((org as { owner_user_id: string } | null)?.owner_user_id === targetUserId) {
    return Response.json({ ok: false, error: "cannot_remove_owner" }, { status: 400 });
  }

  // Self-leave: any member can leave themselves.
  // Otherwise: admin+ required.
  if (targetUserId !== me.userId) {
    const forbid = requireOrganizationRole(me, "admin");
    if (forbid) return forbid;
  }

  const { error } = await sb
    .from("organization_members")
    .delete()
    .eq("organization_id", id)
    .eq("user_id", targetUserId);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
