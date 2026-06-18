import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";
import { canContact, contactBlockReason, institutionsMatch, type ContactPolicy } from "@/lib/contact-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — send a cold contact request to the profile owner identified by
// [slug]. Enforces the recipient's contact_policy server-side (the UI
// uses the same canContact() helper to show/hide the composer, but the
// server is the source of truth). One pending request per (sender,
// recipient) pair is enforced by a unique index — a duplicate returns
// 409 so the UI can say "you already have a pending request".

const Body = z.object({
  body: z.string().min(1).max(2000),
  subject: z.string().max(160).optional(),
  context: z.string().max(40).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { slug } = await params;

  const token = bearerToken(req);
  if (!token) return Response.json({ ok: false, error: "missing_token" }, { status: 401 });
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data: u, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !u?.user) return Response.json({ ok: false, error: "auth_failed" }, { status: 401 });
  const senderId = u.user.id;

  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;
  const { body, subject, context } = parsed.data;

  // Resolve the recipient by slug.
  const { data: recipient } = await sb
    .from("user_profiles")
    .select("user_id, is_public, contact_policy, persona_data")
    .eq("slug", slug)
    .maybeSingle();
  if (!recipient) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  const r = recipient as { user_id: string; is_public: boolean; contact_policy: ContactPolicy; persona_data: Record<string, unknown> };

  // Load the sender's own profile for the institution match + the
  // denormalized name/type we store on the request.
  const { data: senderProfile } = await sb
    .from("user_profiles")
    .select("display_name, account_type, persona_data")
    .eq("user_id", senderId)
    .maybeSingle();
  const sp = (senderProfile ?? {}) as { display_name?: string; account_type?: string; persona_data?: Record<string, unknown> };

  const senderInstitution = (sp.persona_data?.institution as string | undefined) ?? "";
  const recipientInstitution = (r.persona_data?.institution as string | undefined) ?? "";

  const gate = canContact({
    policy: r.contact_policy,
    isSelf: r.user_id === senderId,
    recipientPublic: r.is_public,
    sameInstitution: institutionsMatch(senderInstitution, recipientInstitution),
  });
  if (!gate.allowed) {
    return Response.json({ ok: false, error: gate.reason, message: contactBlockReason(gate.reason) }, { status: 403 });
  }

  const { data, error } = await sb
    .from("profile_contacts")
    .insert({
      from_user_id: senderId,
      to_user_id: r.user_id,
      from_name: sp.display_name || u.user.email?.split("@")[0] || "A member",
      from_account_type: sp.account_type || "general",
      context: context ?? "profile",
      subject: subject ?? "",
      body,
    })
    .select("id, status, created_at")
    .single();

  if (error) {
    // Unique index on one pending request per pair.
    if (error.code === "23505") {
      return Response.json({ ok: false, error: "already_pending", message: "You already have a pending request to this member." }, { status: 409 });
    }
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, request: data });
}
