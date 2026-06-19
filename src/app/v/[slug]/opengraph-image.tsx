import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { renderOgCard, clip, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Venture on Sankofa Studio";

// Per-venture OG card. Title = venture name; subtitle = tagline; if
// the venture is_raising, the badge surfaces "Raising $N" so the
// preview itself hints at the opportunity for an investor scrolling.

export default async function VentureOg({ params }: { params: { slug: string } }) {
  const { slug } = params;
  let title = "A venture on Sankofa";
  let subtitle: string | undefined = "From classroom to creator.";
  let badge: string | undefined;
  let accent: string | undefined;

  if (isSupabaseConfigured()) {
    const sb = supabaseAdmin();
    if (sb) {
      const { data } = await sb
        .from("public_ventures")
        .select("payload, region, stage, is_raising, raising_amount_usd")
        .eq("slug", slug)
        .maybeSingle();
      const p = data as {
        payload?: Record<string, unknown>;
        region?: string | null;
        stage?: string | null;
        is_raising?: boolean;
        raising_amount_usd?: number | null;
      } | null;
      if (p) {
        const payload = p.payload ?? {};
        title = clip(String(payload.title ?? payload.name ?? slug), 60);
        subtitle = clip(String(payload.tagline ?? ""), 160) || "Built by an African student-founder.";

        // Stage gets accent treatment; raising flips to amber.
        if (p.is_raising) {
          accent = "#f4a949"; // amber for "open round"
          if (p.raising_amount_usd) {
            badge = `Raising $${(p.raising_amount_usd / 1000).toFixed(0)}k`;
          } else {
            badge = "Raising";
          }
        } else if (p.region) {
          badge = p.region;
        } else if (p.stage) {
          badge = p.stage[0].toUpperCase() + p.stage.slice(1);
        }
      }
    }
  }

  return renderOgCard({
    kicker: "VENTURE",
    title,
    subtitle,
    badge,
    accent,
  });
}
