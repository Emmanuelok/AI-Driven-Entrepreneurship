import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  → list cohorts I belong to (owned + membered), with role.
// POST → create a new cohort. Caller becomes the owner + an instructor
//        member. Body: { name, description?, institution? }

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, mode: "local", results: [] });
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth failed" }, { status: 401 });
  const userId = u.user.id;

  const [ownedRes, memberRes] = await Promise.all([
    sb.from("cohorts").select("id, name, description, institution, updated_at, owner_id").eq("owner_id", userId),
    sb.from("cohort_members").select("cohort_id, role").eq("user_id", userId),
  ]);
  if (ownedRes.error) return Response.json({ ok: false, error: ownedRes.error.message }, { status: 500 });

  const memberIds = (memberRes.data ?? []).map((m) => (m as { cohort_id: string }).cohort_id);
  const memberMeta = memberIds.length === 0 ? { data: [] as Array<{ id: string; name: string; description: string | null; institution: string | null; updated_at: string; owner_id: string }> } :
    await sb.from("cohorts").select("id, name, description, institution, updated_at, owner_id").in("id", memberIds);

  type Row = { id: string; name: string; description: string | null; institution: string | null; updated_at: string; owner_id: string; role: "owner" | "instructor" | "student" };
  const results: Row[] = [
    ...((ownedRes.data ?? []).map((c) => ({ ...(c as Omit<Row, "role">), role: "owner" as const }))),
    ...((memberMeta.data ?? []).map((c) => {
      const meta = c as Omit<Row, "role">;
      const m = (memberRes.data ?? []).find((x) => (x as { cohort_id: string }).cohort_id === meta.id);
      return { ...meta, role: ((m as { role: string } | undefined)?.role ?? "student") as Row["role"] };
    })),
  ];

  // Dedupe — owner rows already appear in cohort_members but we want
  // the strongest role to win.
  const dedup = new Map<string, Row>();
  for (const r of results) {
    const existing = dedup.get(r.id);
    if (!existing) dedup.set(r.id, r);
    else if (r.role === "owner" || (r.role === "instructor" && existing.role === "student")) dedup.set(r.id, r);
  }

  return Response.json({ ok: true, results: Array.from(dedup.values()) });
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local", error: "Cloud sync required for cohorts." });
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false, error: "missing token" }, { status: 401 });

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  const { data: u, error: e1 } = await sb.auth.getUser(token);
  if (e1 || !u?.user) return Response.json({ ok: false, error: "auth failed" }, { status: 401 });
  const userId = u.user.id;

  let body: { name?: string; description?: string; institution?: string };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const name = (body.name ?? "").trim();
  if (name.length < 2) return Response.json({ ok: false, error: "name_too_short" }, { status: 400 });

  const { data: created, error } = await sb.from("cohorts").insert({
    owner_id: userId,
    name: name.slice(0, 200),
    description: (body.description ?? "").slice(0, 2000) || null,
    institution: (body.institution ?? "").slice(0, 200) || null,
  }).select("id").single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Owner is also an instructor member so listing logic doesn't need to
  // special-case owners.
  const meta = (u.user.user_metadata ?? {}) as { name?: string };
  await sb.from("cohort_members").insert({
    cohort_id: created.id,
    user_id: userId,
    role: "instructor",
    email: u.user.email,
    display_name: meta.name ?? null,
  });

  return Response.json({ ok: true, cohortId: created.id });
}
