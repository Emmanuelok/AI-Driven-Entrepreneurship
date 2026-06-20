import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";
import { normalizeCriteria } from "@/lib/saved-search";
import type { SavedSearchRow } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH  — edit title / criteria / alert_cadence
// DELETE — remove a saved search

const PatchBody = z.object({
  title: z.string().min(1).max(80).optional(),
  criteria: z.unknown().optional(),
  alertCadence: z.enum(["off", "weekly", "instant"]).optional(),
  // Phase 77: mark this search a public mandate on the thesis page.
  isPublic: z.boolean().optional(),
});

async function gate(req: Request, id: string) {
  if (!isSupabaseConfigured()) return { error: Response.json({ ok: false, mode: "local" }, { status: 503 }) };
  const token = bearerToken(req);
  if (!token) return { error: Response.json({ ok: false, error: "missing_token" }, { status: 401 }) };
  const sb = supabaseAdmin();
  if (!sb) return { error: Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 }) };
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return { error: Response.json({ ok: false, error: "auth_failed" }, { status: 401 }) };

  const { data: row } = await sb
    .from("investor_saved_searches")
    .select("id, user_id")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: Response.json({ ok: false, error: "not_found" }, { status: 404 }) };
  if ((row as { user_id: string }).user_id !== u.user.id) {
    return { error: Response.json({ ok: false, error: "forbidden" }, { status: 403 }) };
  }
  return { sb, userId: u.user.id };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(req, id);
  if ("error" in g) return g.error;
  const { sb } = g;

  const parsed = await parseBody(req, PatchBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) patch.title = body.title.trim().slice(0, 80);
  if (body.criteria !== undefined) patch.criteria = normalizeCriteria(body.criteria as Record<string, unknown>);
  if (body.alertCadence !== undefined) patch.alert_cadence = body.alertCadence;
  if (body.isPublic !== undefined) patch.is_public = body.isPublic;
  if (Object.keys(patch).length === 0) return Response.json({ ok: true, noop: true });

  const { data, error } = await sb
    .from("investor_saved_searches")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  const row = data as SavedSearchRow & { criteria: unknown };
  return Response.json({ ok: true, search: { ...row, criteria: normalizeCriteria(row.criteria) } });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(req, id);
  if ("error" in g) return g.error;
  const { sb } = g;
  const { error } = await sb.from("investor_saved_searches").delete().eq("id", id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
