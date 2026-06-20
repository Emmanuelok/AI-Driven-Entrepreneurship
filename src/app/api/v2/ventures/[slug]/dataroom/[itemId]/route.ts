import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH / DELETE — owner-only edits to a single dataroom item.

const PatchBody = z.object({
  kind: z.enum(["doc", "metric", "file", "link", "note"]).optional(),
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(20000).optional(),
  value: z.string().max(500).optional(),
  visibility: z.enum(["public", "gated"]).optional(),
  position: z.number().int().optional(),
});

async function gateOwner(req: Request, slug: string) {
  if (!isSupabaseConfigured()) return { error: Response.json({ ok: false, mode: "local" }, { status: 503 }) };
  const token = bearerToken(req);
  if (!token) return { error: Response.json({ ok: false, error: "auth_required" }, { status: 401 }) };
  const sb = supabaseAdmin();
  if (!sb) return { error: Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 }) };
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return { error: Response.json({ ok: false, error: "auth_failed" }, { status: 401 }) };

  const { data: venture } = await sb.from("public_ventures").select("owner_id").eq("slug", slug).maybeSingle();
  if (!venture) return { error: Response.json({ ok: false, error: "venture_not_found" }, { status: 404 }) };
  if ((venture as { owner_id: string }).owner_id !== u.user.id) {
    return { error: Response.json({ ok: false, error: "forbidden" }, { status: 403 }) };
  }
  return { sb, userId: u.user.id };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string; itemId: string }> }) {
  const { slug, itemId } = await params;
  const g = await gateOwner(req, slug);
  if ("error" in g) return g.error;
  const { sb } = g;

  const parsed = await parseBody(req, PatchBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const patch: Record<string, unknown> = {};
  if (body.kind !== undefined) patch.kind = body.kind;
  if (body.title !== undefined) patch.title = body.title;
  if (body.body !== undefined) patch.body = body.body;
  if (body.value !== undefined) patch.value = body.value;
  if (body.visibility !== undefined) patch.visibility = body.visibility;
  if (body.position !== undefined) patch.position = body.position;
  if (Object.keys(patch).length === 0) return Response.json({ ok: true, noop: true });

  const { data, error } = await sb
    .from("venture_dataroom_items")
    .update(patch)
    .eq("id", itemId)
    .eq("venture_slug", slug)
    .select("*")
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, item: data });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string; itemId: string }> }) {
  const { slug, itemId } = await params;
  const g = await gateOwner(req, slug);
  if ("error" in g) return g.error;
  const { sb } = g;
  const { error } = await sb.from("venture_dataroom_items").delete().eq("id", itemId).eq("venture_slug", slug);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
