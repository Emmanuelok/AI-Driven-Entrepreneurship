import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authCohort, requireCohortRole } from "@/lib/cohort-auth";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cohort ↔ Workspace bridge.
//
// GET    — list workspaces linked to this cohort. Any cohort member.
// POST   — attach an existing workspace to the cohort. The caller
//          must be (a) a cohort instructor and (b) an admin or owner
//          of the workspace they're attaching. Body: { workspaceId,
//          kind? }.
// DELETE — detach a workspace. ?workspaceId=…. Instructor only.

const PostBody = z.object({
  workspaceId: z.string().uuid(),
  kind: z.enum(["shared_room", "team_project", "per_student", "other"]).optional(),
});

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, results: [], mode: "local" });
  const { id } = await ctx.params;
  const me = await authCohort(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: links } = await sb
    .from("cohort_workspaces")
    .select("workspace_id, kind, added_at")
    .eq("cohort_id", id)
    .order("added_at", { ascending: true });

  // Hydrate workspace titles + accents for the dashboard.
  const ids = (links ?? []).map((l) => (l as { workspace_id: string }).workspace_id);
  let workspaces: Array<Record<string, unknown>> = [];
  if (ids.length > 0) {
    const { data } = await sb
      .from("workspaces")
      .select("id, title, description, accent, kind, archived_at")
      .in("id", ids);
    workspaces = (data ?? []) as Array<Record<string, unknown>>;
  }
  const byId = new Map(workspaces.map((w) => [(w as { id: string }).id, w]));

  const results = (links ?? []).map((l) => {
    const link = l as { workspace_id: string; kind: string; added_at: string };
    return { ...link, workspace: byId.get(link.workspace_id) ?? null };
  });
  return Response.json({ ok: true, results });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const me = await authCohort(bearerToken(req), id);
  const forbidden = requireCohortRole(me, "instructor");
  if (forbidden) return forbidden;

  const parsed = await parseBody(req, PostBody);
  if (!parsed.ok) return parsed.response;
  const { workspaceId, kind } = parsed.data;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Verify the caller is admin+ on the workspace they're attaching.
  // We don't want a cohort instructor borrowing arbitrary workspace
  // ids; they must own the room they're hanging on the cohort.
  const { data: wsRole } = await sb.rpc("is_workspace_member", {
    _workspace_id: workspaceId, _user_id: me!.userId,
  });
  const r = wsRole as string | null;
  if (r !== "owner" && r !== "admin") {
    return Response.json({ ok: false, error: "not_workspace_admin" }, { status: 403 });
  }

  const { error } = await sb
    .from("cohort_workspaces")
    .insert({
      cohort_id: id,
      workspace_id: workspaceId,
      kind: kind ?? "shared_room",
      added_by: me!.userId,
    });
  if (error) {
    if (error.code === "23505") {
      return Response.json({ ok: false, error: "already_attached" }, { status: 409 });
    }
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const me = await authCohort(bearerToken(req), id);
  const forbidden = requireCohortRole(me, "instructor");
  if (forbidden) return forbidden;

  const url = new URL(req.url);
  const wsId = url.searchParams.get("workspaceId");
  if (!wsId) return Response.json({ ok: false, error: "missing_workspaceId" }, { status: 400 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  await sb.from("cohort_workspaces").delete().eq("cohort_id", id).eq("workspace_id", wsId);
  return Response.json({ ok: true });
}
