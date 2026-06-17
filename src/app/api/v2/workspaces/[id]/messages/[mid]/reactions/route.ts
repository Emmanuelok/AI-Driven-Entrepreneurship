import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authWorkspace, bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST   — add a reaction. Body: { emoji }. Idempotent (composite PK
//          ignores duplicates via ON CONFLICT DO NOTHING).
// DELETE — remove a reaction. Query: ?emoji=…

// We restrict emoji to a small fixed palette. This is safer than
// accepting any unicode: prevents abuse (very long strings, RTL marks,
// homoglyphs of slurs) and keeps the UI's chip-set predictable.
const ALLOWED = ["👍", "✅", "👀", "❤️", "🎉", "🤔", "🚀", "👏"] as const;

const PostBody = z.object({ emoji: z.string().min(1).max(8) });

function emojiAllowed(e: string): boolean {
  return (ALLOWED as readonly string[]).includes(e);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; mid: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id, mid } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const parsed = await parseBody(req, PostBody);
  if (!parsed.ok) return parsed.response;
  if (!emojiAllowed(parsed.data.emoji)) return Response.json({ ok: false, error: "emoji_not_allowed" }, { status: 400 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Verify the message actually belongs to this workspace before we
  // attach a reaction to it (defense in depth — the URL-path mid could
  // be anything otherwise).
  const { data: msg } = await sb.from("workspace_messages").select("workspace_id").eq("id", mid).maybeSingle();
  if (!msg || msg.workspace_id !== id) return Response.json({ ok: false, error: "message_not_in_workspace" }, { status: 404 });

  // ON CONFLICT DO NOTHING — composite PK guarantees idempotence.
  const { error } = await sb
    .from("workspace_message_reactions")
    .upsert({ message_id: mid, user_id: me.userId, emoji: parsed.data.emoji }, { onConflict: "message_id,user_id,emoji", ignoreDuplicates: true });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; mid: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id, mid } = await params;
  const me = await authWorkspace(bearerToken(req), id);
  if (!me) return Response.json({ ok: false, error: "not_a_member" }, { status: 403 });

  const emoji = new URL(req.url).searchParams.get("emoji");
  if (!emoji) return Response.json({ ok: false, error: "missing_emoji" }, { status: 400 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Same scope check as POST.
  const { data: msg } = await sb.from("workspace_messages").select("workspace_id").eq("id", mid).maybeSingle();
  if (!msg || msg.workspace_id !== id) return Response.json({ ok: false, error: "message_not_in_workspace" }, { status: 404 });

  const { error } = await sb
    .from("workspace_message_reactions")
    .delete()
    .eq("message_id", mid)
    .eq("user_id", me.userId)
    .eq("emoji", emoji);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
