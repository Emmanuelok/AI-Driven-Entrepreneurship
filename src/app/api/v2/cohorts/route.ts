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

  // v2: extend the columns we surface so the list page can show
  // status badges, slugs (for /c/[slug] links), and the org link.
  const cols = "id, name, description, institution, updated_at, owner_id, slug, status, kind, start_date, end_date, capacity, visibility, organization_id";
  const [ownedRes, memberRes] = await Promise.all([
    sb.from("cohorts").select(cols).eq("owner_id", userId),
    sb.from("cohort_members").select("cohort_id, role, state").eq("user_id", userId),
  ]);
  if (ownedRes.error) return Response.json({ ok: false, error: ownedRes.error.message }, { status: 500 });

  const memberIds = (memberRes.data ?? []).map((m) => (m as { cohort_id: string }).cohort_id);
  const memberMeta = memberIds.length === 0
    ? { data: [] as Array<Record<string, unknown>> }
    : await sb.from("cohorts").select(cols).in("id", memberIds);

  type Row = {
    id: string; name: string; description: string | null;
    institution: string | null; updated_at: string; owner_id: string;
    slug: string; status: string; kind: string;
    start_date: string | null; end_date: string | null;
    capacity: number | null; visibility: string;
    organization_id: string | null;
    role: "owner" | "instructor" | "student";
    state?: string;
  };
  const results: Row[] = [
    ...((ownedRes.data ?? []).map((c) => ({ ...(c as unknown as Omit<Row, "role" | "state">), role: "owner" as const }))),
    ...((memberMeta.data ?? []).map((c) => {
      const meta = c as unknown as Omit<Row, "role" | "state">;
      const m = (memberRes.data ?? []).find((x) => (x as { cohort_id: string }).cohort_id === meta.id);
      return {
        ...meta,
        role: ((m as { role: string } | undefined)?.role ?? "student") as Row["role"],
        state: (m as { state?: string } | undefined)?.state,
      };
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

  let body: {
    name?: string;
    description?: string;
    institution?: string;
    organizationId?: string;
    kind?: "course" | "program" | "accelerator" | "bootcamp" | "study_group" | "other";
    status?: "draft" | "open" | "running" | "ended" | "archived";
    visibility?: "private" | "link" | "public";
    startDate?: string;
    endDate?: string;
    capacity?: number;
  };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const name = (body.name ?? "").trim();
  if (name.length < 2) return Response.json({ ok: false, error: "name_too_short" }, { status: 400 });

  // If creating under an org, verify the caller has instructor+ role
  // on the org. Org-attached cohorts inherit the org's brand.
  if (body.organizationId) {
    const { data: role } = await sb.rpc("is_organization_member", {
      _organization_id: body.organizationId, _user_id: userId,
    });
    const r = role as string | null;
    const allowed = r === "owner" || r === "admin" || r === "instructor";
    if (!allowed) return Response.json({ ok: false, error: "not_authorized_for_org" }, { status: 403 });
  }

  // Mint a unique slug. Sanitize name → base, then probe candidates.
  // Bound the loop and fall back to a random suffix.
  const sbForSlug = sb;
  async function mintSlug(): Promise<string> {
    const base = (name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")) || "cohort";
    const trimmed = base.slice(0, 36);
    for (let i = 0; i < 6; i++) {
      const candidate = i === 0 ? trimmed : `${trimmed}-${i + 1}`;
      const { data } = await sbForSlug.from("cohorts").select("id").eq("slug", candidate).maybeSingle();
      if (!data) return candidate;
    }
    return `${trimmed}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  }
  const slug = await mintSlug();

  const { data: created, error } = await sb.from("cohorts").insert({
    owner_id: userId,
    name: name.slice(0, 200),
    description: (body.description ?? "").slice(0, 2000) || null,
    institution: (body.institution ?? "").slice(0, 200) || null,
    organization_id: body.organizationId ?? null,
    slug,
    kind: body.kind ?? "course",
    status: body.status ?? "draft",
    visibility: body.visibility ?? "private",
    start_date: body.startDate ?? null,
    end_date: body.endDate ?? null,
    capacity: typeof body.capacity === "number" ? body.capacity : null,
  }).select("id, slug").single();
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

  return Response.json({ ok: true, cohortId: created.id, slug: created.slug });
}
