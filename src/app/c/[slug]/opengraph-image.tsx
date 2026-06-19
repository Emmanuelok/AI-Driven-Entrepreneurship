import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { renderOgCard, clip, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Cohort on Sankofa Studio";

const KIND_KICKER: Record<string, string> = {
  course: "COURSE",
  program: "PROGRAM",
  accelerator: "ACCELERATOR",
  bootcamp: "BOOTCAMP",
  study_group: "STUDY GROUP",
  other: "COHORT",
};

const STATUS_BADGE: Record<string, string> = {
  open: "Enrolling",
  running: "Live now",
  ended: "Ended",
  draft: "",
  archived: "",
};

export default async function CohortOg({ params }: { params: { slug: string } }) {
  const { slug } = params;
  let title = "Cohort on Sankofa";
  let subtitle: string | undefined = "Sequence the work; ship the artifact.";
  let badge: string | undefined;
  let kicker = "COHORT";
  let accent: string | undefined;

  if (isSupabaseConfigured()) {
    const sb = supabaseAdmin();
    if (sb) {
      const { data } = await sb
        .from("cohorts")
        .select("name, description, kind, status, visibility, organization_id")
        .eq("slug", slug)
        .maybeSingle();
      const c = data as {
        name?: string; description?: string; kind?: string;
        status?: string; visibility?: string; organization_id?: string | null;
      } | null;
      if (c && c.visibility !== "private") {
        title = clip(c.name || "Cohort", 60);
        subtitle = clip(c.description || "Sequence the work; ship the artifact.", 160);
        kicker = KIND_KICKER[c.kind ?? "other"] ?? "COHORT";
        const statusLabel = STATUS_BADGE[c.status ?? ""];
        if (c.organization_id) {
          // Pull org name to enrich the badge.
          const { data: org } = await sb
            .from("organizations")
            .select("name")
            .eq("id", c.organization_id)
            .maybeSingle();
          const orgName = (org as { name?: string } | null)?.name;
          if (orgName) {
            badge = statusLabel ? `${orgName} · ${statusLabel}` : orgName;
          } else if (statusLabel) {
            badge = statusLabel;
          }
        } else if (statusLabel) {
          badge = statusLabel;
        }
        if (c.status === "open") accent = "#f4a949"; // amber = recruiting
      }
    }
  }

  return renderOgCard({ kicker, title, subtitle, badge, accent });
}
