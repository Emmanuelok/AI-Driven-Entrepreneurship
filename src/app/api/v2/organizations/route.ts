import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";
import { slugifyOrgName } from "@/lib/organization-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — every org the caller can see: orgs they own, orgs they're a
//       member of, optionally including public orgs they're not in
//       (?include=public).
// POST — create a new org. Caller becomes owner + their organization_members
//        row is inserted in the same transaction-ish flow.

const KINDS = ["university", "accelerator", "bootcamp", "school", "program", "other"] as const;

const CreateBody = z.object({
  name: z.string().min(2).max(120),
  kind: z.enum(KINDS).optional(),
  description: z.string().max(2000).optional(),
  country: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  website_url: z.string().url().nullable().optional(),
  institution_domain: z.string().max(120).optional(),
  is_public: z.boolean().optional(),
});

async function resolveCaller(req: Request) {
  const token = bearerToken(req);
  if (!token) return { error: Response.json({ ok: false, error: "missing_token" }, { status: 401 }) };
  const sb = supabaseAdmin();
  if (!sb) return { error: Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 }) };
  const { data: u, error } = await sb.auth.getUser(token);
  if (error || !u?.user) return { error: Response.json({ ok: false, error: "auth_failed" }, { status: 401 }) };
  return { sb, user: u.user };
}

export async function GET(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: true, results: [], mode: "local" });
  const r = await resolveCaller(req);
  if ("error" in r) return r.error;
  const { sb, user } = r;

  const url = new URL(req.url);
  const includePublic = url.searchParams.get("include") === "public";

  // Two cheap queries: the orgs I OWN + the orgs I'm a MEMBER of.
  // RLS would let me read public orgs too, but for "my orgs" we want
  // strict membership.
  const [ownedRes, memberRes] = await Promise.all([
    sb.from("organizations").select("*").eq("owner_user_id", user.id),
    sb.from("organization_members").select("organization_id, role").eq("user_id", user.id),
  ]);

  const owned = (ownedRes.data ?? []) as Array<Record<string, unknown>>;
  const memberOrgIds = (memberRes.data ?? []).map((m) => (m as { organization_id: string }).organization_id);
  const memberRoles = new Map((memberRes.data ?? []).map((m) => [
    (m as { organization_id: string }).organization_id,
    (m as { role: string }).role,
  ]));

  // Pull the full rows for member orgs that aren't already covered by
  // owned. Single .in() query.
  const ownedIds = new Set(owned.map((o) => o.id as string));
  const memberOnlyIds = memberOrgIds.filter((id) => !ownedIds.has(id));
  let memberOrgs: Array<Record<string, unknown>> = [];
  if (memberOnlyIds.length > 0) {
    const { data } = await sb.from("organizations").select("*").in("id", memberOnlyIds);
    memberOrgs = (data ?? []) as Array<Record<string, unknown>>;
  }

  // Decorate each row with the caller's role.
  const mine: Array<Record<string, unknown>> = [
    ...owned.map((o) => ({ ...o, myRole: "owner" as const })),
    ...memberOrgs.map((o) => ({ ...o, myRole: memberRoles.get(o.id as string) ?? "observer" })),
  ];

  let publicResults: Array<Record<string, unknown>> = [];
  if (includePublic) {
    // Surface a handful of recent public orgs the caller isn't in,
    // for the discovery section. Skip ones already in `mine`.
    const mineIds = new Set(mine.map((o) => o.id as string));
    const { data } = await sb
      .from("organizations")
      .select("*")
      .eq("is_public", true)
      .order("updated_at", { ascending: false })
      .limit(24);
    publicResults = ((data ?? []) as Array<Record<string, unknown>>)
      .filter((o) => !mineIds.has(o.id as string))
      .map((o) => ({ ...o, myRole: null }));
  }

  return Response.json({ ok: true, mine, public: publicResults });
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const r = await resolveCaller(req);
  if ("error" in r) return r.error;
  const { sb, user } = r;

  const parsed = await parseBody(req, CreateBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // Mint a unique slug from the name. We try base, base-2, … then
  // give up to a random suffix — same pattern as user profile slugs.
  async function mintSlug(): Promise<string> {
    const base = slugifyOrgName(body.name);
    for (let i = 0; i < 6; i++) {
      const candidate = i === 0 ? base : `${base}-${i + 1}`;
      const { data } = await sb.from("organizations").select("id").eq("slug", candidate).maybeSingle();
      if (!data) return candidate;
    }
    return `${base}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  }
  const slug = await mintSlug();

  // Auto-verify when the institution_domain matches the owner's
  // verified email_institution. That makes the trust path painless
  // for instructors who've already proven their KNUST.edu.gh address.
  let is_verified = false;
  if (body.institution_domain) {
    const { data: v } = await sb
      .from("verifications")
      .select("evidence")
      .eq("user_id", user.id)
      .eq("kind", "email_institution")
      .eq("status", "verified")
      .maybeSingle();
    const verifiedDomain = (v as { evidence?: { domain?: string } } | null)?.evidence?.domain;
    if (verifiedDomain && verifiedDomain.toLowerCase() === body.institution_domain.toLowerCase()) {
      is_verified = true;
    }
  }

  const { data, error } = await sb
    .from("organizations")
    .insert({
      slug,
      name: body.name.trim(),
      kind: body.kind ?? "other",
      description: body.description ?? "",
      country: body.country ?? "",
      city: body.city ?? "",
      website_url: body.website_url ?? null,
      institution_domain: body.institution_domain?.toLowerCase() ?? null,
      is_public: body.is_public ?? false,
      is_verified,
      owner_user_id: user.id,
    })
    .select("*")
    .single();
  if (error || !data) return Response.json({ ok: false, error: error?.message ?? "insert_failed" }, { status: 500 });
  const org = data as { id: string };

  // Insert the owner's organization_members row. RLS lets the owner
  // (who is auth.uid()) insert through the policy, but we go via
  // service-role for consistency with the rest of the layer.
  await sb.from("organization_members").insert({
    organization_id: org.id,
    user_id: user.id,
    role: "owner",
    email: user.email,
    display_name: (user.user_metadata as { name?: string } | null)?.name ?? null,
  });

  return Response.json({ ok: true, organization: { ...data, myRole: "owner" } });
}
