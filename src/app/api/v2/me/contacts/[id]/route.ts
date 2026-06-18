import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH — respond to a contact request the caller RECEIVED. Only the
// recipient may change status (RLS enforces this too). Accepting or
// declining stamps responded_at and may carry a reply_body that the
// sender then sees. Archiving just hides it from the active inbox.

const Body = z.object({
  status: z.enum(["accepted", "declined", "archived"]),
  reply_body: z.string().max(2000).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;

  const token = bearerToken(req);
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });
  const me = u.user.id;

  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;
  const { status, reply_body } = parsed.data;

  // Guard: the row must exist and be addressed to the caller.
  const { data: existing } = await sb
    .from("profile_contacts")
    .select("id, to_user_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!existing || (existing as { to_user_id: string }).to_user_id !== me) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const patch: Record<string, unknown> = { status, read_by_recipient: true };
  // Stamp the response time when moving out of 'pending' into a verdict.
  if (status === "accepted" || status === "declined") patch.responded_at = new Date().toISOString();
  if (reply_body !== undefined) patch.reply_body = reply_body;

  const { data, error } = await sb
    .from("profile_contacts")
    .update(patch)
    .eq("id", id)
    .eq("to_user_id", me)
    .select("id, status, reply_body, responded_at")
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, request: data });
}
