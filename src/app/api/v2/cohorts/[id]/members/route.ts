import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authCohort, requireCohortRole } from "@/lib/cohort-auth";
import { canTransitionMemberState, type CohortMemberState } from "@/lib/cohort-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET    → list roster + pending invites (now surfaces state).
// PATCH  → change a member's state via the state machine (instructor+).
// DELETE → remove a student (instructor+) or self-leave.

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authCohort(token, id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const [members, invites] = await Promise.all([
    sb.from("cohort_members")
      .select("user_id, role, email, display_name, joined_at, state, completed_at, dropped_at")
      .eq("cohort_id", id)
      .order("joined_at"),
    me.role === "owner" || me.role === "instructor"
      ? sb.from("cohort_invites").select("id, email, role, expires_at, created_at, token").eq("cohort_id", id).gt("expires_at", new Date().toISOString())
      : Promise.resolve({ data: [] as Array<{ id: string; email: string; role: string; expires_at: string; created_at: string; token: string }> }),
  ]);

  return Response.json({
    ok: true,
    members: members.data ?? [],
    pendingInvites: invites.data ?? [],
    myRole: me.role,
  });
}

const PatchBody = z.object({
  userId: z.string().uuid(),
  state: z.enum(["invited", "active", "dropped", "completed"]),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authCohort(token, id);
  const forbidden = requireCohortRole(me, "instructor");
  if (forbidden) return forbidden;

  let raw: unknown;
  try { raw = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const parsed = PatchBody.safeParse(raw);
  if (!parsed.success) return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  const { userId, state } = parsed.data;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  // Current state, then gate the transition. The state machine is
  // identical in lib/cohort-state.ts; we use it server-side here so
  // illegal moves get a 400 with the current state for the UI to
  // refresh cleanly.
  const { data: cur } = await sb
    .from("cohort_members")
    .select("state")
    .eq("cohort_id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!cur) return Response.json({ ok: false, error: "member_not_found" }, { status: 404 });
  const curState = (cur as { state: CohortMemberState }).state;
  if (!canTransitionMemberState(curState, state)) {
    return Response.json({ ok: false, error: "illegal_state_transition", from: curState, to: state }, { status: 400 });
  }

  const patch: Record<string, unknown> = { state };
  if (state === "completed") patch.completed_at = new Date().toISOString();
  if (state === "dropped") patch.dropped_at = new Date().toISOString();
  // Re-activating clears the timestamps so the row reads cleanly.
  if (state === "active") { patch.completed_at = null; patch.dropped_at = null; }

  const { error } = await sb
    .from("cohort_members")
    .update(patch)
    .eq("cohort_id", id)
    .eq("user_id", userId);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const me = await authCohort(token, id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const url = new URL(req.url);
  const targetId = url.searchParams.get("userId");
  if (!targetId) return Response.json({ ok: false, error: "missing userId" }, { status: 400 });

  // Self-leave OK; instructor removing student OK; nothing else.
  if (targetId !== me.userId && me.role === "student") {
    return Response.json({ ok: false, error: "students_cannot_remove_others" }, { status: 403 });
  }
  if (targetId === me.userId && me.role === "owner") {
    return Response.json({ ok: false, error: "owner_cannot_leave_must_delete_cohort" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });
  const { error } = await sb.from("cohort_members").delete().eq("cohort_id", id).eq("user_id", targetId);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
