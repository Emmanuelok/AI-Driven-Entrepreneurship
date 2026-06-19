import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { renderOgCard, clip, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Organization on Sankofa Studio";

const KIND_LABEL: Record<string, string> = {
  university: "UNIVERSITY",
  accelerator: "ACCELERATOR",
  bootcamp: "BOOTCAMP",
  school: "SCHOOL",
  program: "PROGRAM",
  other: "ORGANIZATION",
};

export default async function OrgOg({ params }: { params: { slug: string } }) {
  const { slug } = params;
  let title = "Sankofa partner organization";
  let subtitle: string | undefined = "Running cohorts on Sankofa Studio.";
  let badge: string | undefined;
  let kicker = "ORGANIZATION";

  if (isSupabaseConfigured()) {
    const sb = supabaseAdmin();
    if (sb) {
      const { data } = await sb
        .from("organizations")
        .select("name, description, kind, country, is_verified, is_public")
        .eq("slug", slug)
        .maybeSingle();
      const o = data as {
        name?: string; description?: string; kind?: string;
        country?: string; is_verified?: boolean; is_public?: boolean;
      } | null;
      if (o && o.is_public) {
        title = clip(o.name || "Organization", 60);
        subtitle = clip(o.description || "Running cohorts on Sankofa Studio.", 160);
        kicker = KIND_LABEL[o.kind ?? "other"] ?? "ORGANIZATION";
        const parts: string[] = [];
        if (o.is_verified) parts.push("Verified");
        if (o.country) parts.push(o.country);
        if (parts.length > 0) badge = parts.join(" · ");
      }
    }
  }

  return renderOgCard({ kicker, title, subtitle, badge });
}
