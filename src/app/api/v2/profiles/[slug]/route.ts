import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public profile read by slug. Anyone signed in can read; the RLS
// policy enforces is_public = true. We do the read with the service
// role (consistent with our other public-read patterns) and re-check
// is_public here so an authenticated caller doesn't see private rows
// just because they were authenticated.
//
// v2: also returns the verified state (institution email check,
// id check, peer-attestation count) via the profile_verified_state
// RPC + the list of attestations so the public page can render
// trust signals next to the persona panel without an extra round-trip.

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { slug } = await params;
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data } = await sb
    .from("user_profiles")
    .select("user_id, slug, account_type, display_name, headline, bio, country, city, primary_language, avatar_url, website_url, linkedin_url, twitter_url, persona_data, contact_policy, is_public, created_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!data || !(data as { is_public: boolean }).is_public) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const profile = data as { user_id: string };

  // Parallel: verified state aggregate + attestations list. Both are
  // additive — a profile renders fine without them, so we tolerate
  // failures silently.
  const [verifiedStateRes, attestationsRes] = await Promise.all([
    sb.rpc("profile_verified_state", { _user_id: profile.user_id }),
    sb
      .from("peer_attestations")
      .select("id, attestor_user_id, kind, body, created_at")
      .eq("attested_user_id", profile.user_id)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  // Hydrate attestor display_names + slugs so the public page can
  // render each vouch as "<name> · <role>" with a link to the
  // attestor's profile.
  const attRaw = (attestationsRes.data ?? []) as { id: string; attestor_user_id: string; kind: string; body: string; created_at: string }[];
  const attestorIds = Array.from(new Set(attRaw.map((a) => a.attestor_user_id)));
  const attestors = new Map<string, { display_name: string; slug: string | null; account_type: string }>();
  if (attestorIds.length > 0) {
    const { data: ps } = await sb
      .from("user_profiles")
      .select("user_id, display_name, slug, account_type")
      .in("user_id", attestorIds);
    for (const p of ps ?? []) {
      const r = p as { user_id: string; display_name: string; slug: string | null; account_type: string };
      attestors.set(r.user_id, { display_name: r.display_name, slug: r.slug, account_type: r.account_type });
    }
  }
  const attestations = attRaw.map((a) => ({
    id: a.id,
    kind: a.kind,
    body: a.body,
    created_at: a.created_at,
    attestor: attestors.get(a.attestor_user_id) ?? { display_name: "A member", slug: null, account_type: "general" },
  }));

  return Response.json({
    ok: true,
    profile: data,
    verified: (verifiedStateRes.data as Record<string, unknown> | null) ?? {
      institution_email: false, id_check: false, admin_verified: false, attestation_count: 0, verified: false,
    },
    attestations,
  });
}
