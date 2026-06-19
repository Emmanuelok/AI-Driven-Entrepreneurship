import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authCohort, requireCohortRole } from "@/lib/cohort-auth";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — bulk invite a roster of emails (paste-from-spreadsheet flow).
// Body: { emails: string[], role?: 'student' | 'instructor' }
//
// We split the list into three buckets per row:
//   added       — email matched an existing Sankofa user; member row
//                 inserted at state='invited' so the cohort dashboard
//                 shows them as awaiting; the user sees the invite in
//                 their notifications. (Phase 57 wires the assignment
//                 acceptance flow that flips to 'active'.)
//   pending     — no user found; cohort_invites row created with a
//                 magic-link token.
//   skipped     — already a member of the cohort, malformed email,
//                 or duplicate inside the input list.
//
// The response carries per-row outcomes so the UI can show "23 added,
// 7 pending invites sent, 2 skipped (already members)".

const Body = z.object({
  emails: z.array(z.string()).min(1).max(200),
  role: z.enum(["student", "instructor"]).optional(),
});

type Outcome =
  | { email: string; status: "added" }
  | { email: string; status: "pending"; token: string }
  | { email: string; status: "skipped"; reason: "invalid" | "already_member" | "duplicate" };

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await ctx.params;
  const me = await authCohort(bearerToken(req), id);
  const forbidden = requireCohortRole(me, "instructor");
  if (forbidden) return forbidden;

  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;
  const role = parsed.data.role ?? "student";

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Normalize + dedupe input.
  const seen = new Set<string>();
  const outcomes: Outcome[] = [];
  const queue: string[] = [];
  for (const raw of parsed.data.emails) {
    const e = (raw ?? "").trim().toLowerCase();
    if (!e) continue;
    if (seen.has(e)) {
      outcomes.push({ email: e, status: "skipped", reason: "duplicate" });
      continue;
    }
    seen.add(e);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      outcomes.push({ email: e, status: "skipped", reason: "invalid" });
      continue;
    }
    queue.push(e);
  }

  // Pull existing roster once so each row's "already member?" check
  // is O(1) instead of one query per email.
  const { data: existingMembers } = await sb
    .from("cohort_members")
    .select("email")
    .eq("cohort_id", id);
  const memberEmails = new Set<string>(
    ((existingMembers ?? []) as Array<{ email: string | null }>)
      .map((m) => (m.email ?? "").toLowerCase())
      .filter((e) => e.length > 0),
  );

  // We don't have a profiles-by-email index, so fall back to the same
  // page-200 listUsers approach the single-invite route uses. For
  // batches up to 200 emails this is one round trip total.
  const allUsers = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  const byEmail = new Map<string, string>(
    (allUsers.data?.users ?? []).map((u) => [(u.email ?? "").toLowerCase(), u.id]),
  );

  for (const email of queue) {
    if (memberEmails.has(email)) {
      outcomes.push({ email, status: "skipped", reason: "already_member" });
      continue;
    }
    const userId = byEmail.get(email);
    if (userId) {
      const { error } = await sb.from("cohort_members").upsert({
        cohort_id: id,
        user_id: userId,
        role,
        email,
        state: role === "instructor" ? "active" : "invited",
      }, { onConflict: "cohort_id,user_id" });
      if (!error) outcomes.push({ email, status: "added" });
      else outcomes.push({ email, status: "skipped", reason: "invalid" });
    } else {
      const { data: invite, error } = await sb.from("cohort_invites").insert({
        cohort_id: id,
        email,
        role,
        invited_by: me!.userId,
      }).select("token").single();
      if (!error && invite) outcomes.push({ email, status: "pending", token: (invite as { token: string }).token });
      else outcomes.push({ email, status: "skipped", reason: "invalid" });
    }
  }

  const counts = {
    added: outcomes.filter((o) => o.status === "added").length,
    pending: outcomes.filter((o) => o.status === "pending").length,
    skipped: outcomes.filter((o) => o.status === "skipped").length,
  };
  return Response.json({ ok: true, counts, outcomes });
}
