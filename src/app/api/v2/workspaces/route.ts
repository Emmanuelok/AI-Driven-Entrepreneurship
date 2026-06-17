import { z } from "zod";
import { nanoid } from "nanoid";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORKSPACE_KINDS = ["study_group", "project", "research", "learning_session", "paper", "generic"] as const;
const ACCENTS = ["emerald", "amber", "indigo", "rust"] as const;
const VISIBILITIES = ["private", "link", "public"] as const;

const CreateBody = z.object({
  id: z.string().min(4).max(64).optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  kind: z.enum(WORKSPACE_KINDS as unknown as readonly [string, ...string[]]).optional(),
  accent: z.enum(ACCENTS as unknown as readonly [string, ...string[]]).optional(),
  visibility: z.enum(VISIBILITIES as unknown as readonly [string, ...string[]]).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

// GET — every workspace the caller can read (owned + member of).
// POST — create a new workspace owned by the caller.
export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local", results: [] });
  const token = bearerToken(req);
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });
  const userId = u.user.id;

  // workspace_members already contains the owner (the insert trigger
  // adds them automatically), so a single join over members gives
  // every workspace the caller can see.
  const { data: memberships, error } = await sb
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const ids = (memberships ?? []).map((m) => (m as { workspace_id: string }).workspace_id);
  if (ids.length === 0) return Response.json({ ok: true, results: [] });

  // ?archived=1 includes archived; default hides them.
  const showArchived = new URL(req.url).searchParams.get("archived") === "1";
  let q = sb
    .from("workspaces")
    .select("id, owner_id, kind, title, description, accent, visibility, archived_at, updated_at, created_at")
    .in("id", ids)
    .order("updated_at", { ascending: false });
  if (!showArchived) q = q.is("archived_at", null);
  const { data: rows, error: e2 } = await q;
  if (e2) return Response.json({ ok: false, error: e2.message }, { status: 500 });

  const roleByWs = new Map<string, string>(
    (memberships ?? []).map((m) => [(m as { workspace_id: string }).workspace_id, (m as { role: string }).role]),
  );
  const results = (rows ?? []).map((r) => ({
    ...r,
    role: roleByWs.get((r as { id: string }).id) ?? "viewer",
  }));
  return Response.json({ ok: true, results });
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, mode: "local", error: "Sign in + Supabase required to create a workspace." });
  }
  const token = bearerToken(req);
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });
  const userId = u.user.id;

  const parsed = await parseBody(req, CreateBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // Client may supply an id (so local-first state can pre-claim one);
  // otherwise we generate it server-side. Either way the trigger on
  // insert will register the owner as the first member.
  const id = body.id ?? nanoid(12);
  const { error } = await sb.from("workspaces").insert({
    id,
    owner_id: userId,
    title: body.title,
    description: body.description ?? "",
    kind: body.kind ?? "generic",
    accent: body.accent ?? "emerald",
    visibility: body.visibility ?? "private",
    data: body.data ?? {},
  });
  if (error) {
    // Surface conflicts (id collision) and other Postgres errors crisply.
    const status = /duplicate key/i.test(error.message) ? 409 : 500;
    return Response.json({ ok: false, error: error.message }, { status });
  }

  // Best-effort: keep the cached email/display_name on the owner row
  // fresh so member lists render names without an auth.users join.
  await sb
    .from("workspace_members")
    .update({
      email: u.user.email ?? null,
      display_name: (u.user.user_metadata as { name?: string } | null)?.name ?? null,
    })
    .eq("workspace_id", id)
    .eq("user_id", userId);

  await sb.from("workspace_activity").insert({
    workspace_id: id,
    user_id: userId,
    kind: "created",
    title: "Workspace created",
    body: body.title,
  });

  return Response.json({ ok: true, id });
}
