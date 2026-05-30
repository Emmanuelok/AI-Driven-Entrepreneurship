import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { resolveAuthedUserId } from "@/lib/authed-user";
import { parseBody } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET   → list the caller's flows (id, name, updated_at, node/edge counts only)
// POST  → upsert one flow with its full graph payload
//
// We don't enforce a per-flow size cap server-side; RLS + JSONB
// handle the rest. A pathological flow would be on the order of
// dozens of nodes — well under Postgres row limits.

const NodeShape = z.object({
  id: z.string().min(1).max(40),
  kind: z.string().min(1).max(40),
  x: z.number().finite(),
  y: z.number().finite(),
  label: z.string().max(120),
  config: z.record(z.string(), z.unknown()).optional().default({}),
  output: z.record(z.string(), z.unknown()).optional().nullable(),
  status: z.enum(["idle", "running", "ok", "error"]).default("idle"),
  error: z.string().max(2000).optional(),
}).loose();

const EdgeShape = z.object({
  id: z.string().min(1).max(40),
  fromNodeId: z.string().min(1).max(40),
  toNodeId: z.string().min(1).max(40),
});

const UpsertBody = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(4000).optional().default(""),
  nodes: z.array(NodeShape).max(200),
  edges: z.array(EdgeShape).max(400),
  // Client-side createdAt is informational; server overwrites updated_at.
  createdAt: z.number().int().positive().optional(),
});

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local", results: [] });
  const me = await resolveAuthedUserId(req);
  if (!me) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data, error } = await sb.from("cloud_flows")
    .select("id, name, description, data, created_at, updated_at")
    .eq("owner_id", me)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Trim the payload — for the index page we only need the headline
  // counts, not the full graph. The detail endpoint returns the
  // graph payload.
  const results = (data ?? []).map((r) => {
    const d = (r.data ?? {}) as { nodes?: unknown[]; edges?: unknown[] };
    return {
      id: r.id,
      name: r.name,
      description: r.description ?? "",
      nodeCount: Array.isArray(d.nodes) ? d.nodes.length : 0,
      edgeCount: Array.isArray(d.edges) ? d.edges.length : 0,
      updatedAt: r.updated_at,
      createdAt: r.created_at,
    };
  });

  return Response.json({ ok: true, results });
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const me = await resolveAuthedUserId(req);
  if (!me) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const parsed = await parseBody(req, UpsertBody);
  if (!parsed.ok) return parsed.response;
  const flow = parsed.data;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const data = {
    nodes: flow.nodes,
    edges: flow.edges,
  };

  const { error } = await sb.from("cloud_flows").upsert({
    id: flow.id,
    owner_id: me,
    name: flow.name,
    description: flow.description,
    data,
  }, { onConflict: "id" });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, id: flow.id });
}
