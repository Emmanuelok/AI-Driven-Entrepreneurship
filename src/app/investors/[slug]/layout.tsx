import type { Metadata } from "next";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { normalizeThesis, summarizeThesis } from "@/lib/investor-thesis";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://sankofa.studio";

// Per-investor thesis metadata. The page itself is a client component
// (for the live fetch); this layout supplies social + SEO metadata
// server-side so a shared thesis link renders a useful card. Investor
// theses are an outbound asset — founders share "here's a backer who
// fits us" — so the description has to stand on its own.

async function fetchThesisForSeo(slug: string): Promise<{ displayName: string; headline: string; summary: string } | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = supabaseAdmin();
  if (!sb) return null;

  const { data: profile } = await sb
    .from("user_profiles")
    .select("user_id, display_name, is_public")
    .eq("slug", slug)
    .maybeSingle();
  const p = profile as { user_id: string; display_name: string; is_public: boolean } | null;
  if (!p || !p.is_public) return null;

  const { data: row } = await sb.from("investor_theses").select("*").eq("user_id", p.user_id).maybeSingle();
  const t = row as Record<string, unknown> | null;
  if (!t || t.is_published !== true) return null;

  const thesis = normalizeThesis({
    headline: t.headline, statement: t.statement, sectors: t.sectors, stages: t.stages,
    regions: t.regions, checkMinUsd: t.check_min_usd, checkMaxUsd: t.check_max_usd,
    acceptsColdPitch: t.accepts_cold_pitch, isPublished: t.is_published,
  });
  return { displayName: p.display_name, headline: thesis.headline, summary: summarizeThesis(thesis) };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const seo = await fetchThesisForSeo(slug);
  if (!seo) {
    return { title: "Investor thesis — Sankofa Studio" };
  }
  const title = `${seo.displayName} — Investor thesis on Sankofa`;
  const description = (seo.headline ? `${seo.headline} · ` : "") + seo.summary;
  const url = `${BASE}/investors/${slug}`;
  return {
    title,
    description: description.slice(0, 220),
    alternates: { canonical: url },
    openGraph: { type: "profile", url, title, description: description.slice(0, 220), siteName: "Sankofa Studio" },
    twitter: { card: "summary_large_image", title, description: description.slice(0, 220) },
  };
}

export default function InvestorThesisLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
