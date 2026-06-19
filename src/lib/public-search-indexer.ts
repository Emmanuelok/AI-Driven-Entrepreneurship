import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { embed } from "@/lib/embeddings";

// Pure-ish indexer for the public_search_index table.
//
// One row per (entity_kind, entity_id). Upsert: re-running on the same
// row updates the body + re-embeds. Composing the body is a small
// concern of its own so the search team can tune what gets indexed
// without touching the API routes.
//
// Best-effort: if embeddings fail or Supabase isn't configured we
// silently no-op — search just returns nothing for that entity until
// the next index pass.

export type IndexableProfile = {
  user_id: string;
  slug: string;
  account_type: string;
  display_name: string;
  headline: string;
  bio: string;
  country: string;
  city: string;
  primary_language: string;
  persona_data: Record<string, unknown>;
};

export type IndexableVenture = {
  slug: string;
  payload: Record<string, unknown>;
  sectors: string[];
  stage: string | null;
  region: string | null;
};

// Compose the searchable body for a profile. We weave persona-specific
// fields in so a query for "fintech mentor in Lagos" hits the right
// row even if the headline doesn't mention all three. Doubles as the
// snippet shown in search results when the query has no exact match.
export function composeProfileBody(p: IndexableProfile): string {
  const persona = p.persona_data ?? {};
  const tags = [
    ...(Array.isArray(persona.expertise) ? persona.expertise : []),
    ...(Array.isArray(persona.sectors) ? persona.sectors : []),
    ...(Array.isArray(persona.focusAreas) ? persona.focusAreas : []),
    ...(Array.isArray(persona.beats) ? persona.beats : []),
    ...(Array.isArray(persona.stages) ? persona.stages : []),
  ].filter((x): x is string => typeof x === "string");
  const persona_lines = [
    persona.institution && `institution: ${persona.institution}`,
    persona.field && `field: ${persona.field}`,
    persona.firmName && `firm: ${persona.firmName}`,
    persona.programName && `program: ${persona.programName}`,
    persona.outletName && `outlet: ${persona.outletName}`,
    persona.availability && `availability: ${persona.availability}`,
    persona.yearsExperience && `experience: ${persona.yearsExperience} years`,
  ].filter(Boolean) as string[];
  return [
    `${p.account_type}: ${p.display_name}`,
    p.headline,
    p.bio,
    [p.city, p.country].filter(Boolean).join(", "),
    p.primary_language && `language: ${p.primary_language}`,
    tags.length > 0 && `tags: ${tags.join(", ")}`,
    ...persona_lines,
  ].filter(Boolean).join("\n");
}

export function composeVentureBody(v: IndexableVenture): string {
  const payload = v.payload ?? {};
  const title = String(payload.title ?? payload.name ?? v.slug);
  const tagline = String(payload.tagline ?? "");
  // We keep this body compact — long pitch text would dilute the
  // signal. Sectors + stage + tagline are the highest-signal fields.
  return [
    `venture: ${title}`,
    tagline,
    v.region && `region: ${v.region}`,
    v.stage && `stage: ${v.stage}`,
    v.sectors.length > 0 && `sectors: ${v.sectors.join(", ")}`,
  ].filter(Boolean).join("\n");
}

// Upsert one (entity_kind, entity_id) row. Best-effort: failures are
// swallowed so the calling write isn't blocked on an embedding round-trip.
async function upsertRow(args: {
  entity_kind: "profile" | "venture";
  entity_id: string;
  href: string;
  title: string;
  body: string;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const sb = supabaseAdmin();
  if (!sb) return;
  try {
    const [vec] = await embed([args.body]);
    await sb.from("public_search_index").upsert(
      {
        entity_kind: args.entity_kind,
        entity_id: args.entity_id,
        href: args.href,
        title: args.title,
        body: args.body,
        embedding: vec ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "entity_kind,entity_id" },
    );
  } catch {
    // Indexer is best-effort by design.
  }
}

export async function indexProfile(p: IndexableProfile): Promise<void> {
  await upsertRow({
    entity_kind: "profile",
    entity_id: p.slug,
    href: `/people/${p.slug}`,
    title: p.display_name || p.slug,
    body: composeProfileBody(p),
  });
}

export async function unindexProfile(slug: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const sb = supabaseAdmin();
  if (!sb) return;
  try {
    await sb.from("public_search_index").delete().eq("entity_kind", "profile").eq("entity_id", slug);
  } catch { /* silent */ }
}

export async function indexVenture(v: IndexableVenture): Promise<void> {
  const title = String((v.payload?.title as string | undefined) ?? (v.payload?.name as string | undefined) ?? v.slug);
  await upsertRow({
    entity_kind: "venture",
    entity_id: v.slug,
    href: `/v/${v.slug}`,
    title,
    body: composeVentureBody(v),
  });
}

export async function unindexVenture(slug: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const sb = supabaseAdmin();
  if (!sb) return;
  try {
    await sb.from("public_search_index").delete().eq("entity_kind", "venture").eq("entity_id", slug);
  } catch { /* silent */ }
}
