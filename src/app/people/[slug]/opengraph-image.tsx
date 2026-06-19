import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getAccountTypeDef } from "@/lib/account-types";
import { renderOgCard, clip, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Member profile on Sankofa Studio";

// Per-profile OG image. Renders the display name as the headline,
// the headline (one-liner) as the subtitle, and the account type
// in the kicker. Verified profiles get a "Verified" badge.

export default async function ProfileOg({ params }: { params: { slug: string } }) {
  const { slug } = params;

  let title = "Sankofa member";
  let subtitle: string | undefined = "From classroom to creator.";
  let kicker = "MEMBER";
  let badge: string | undefined;

  if (isSupabaseConfigured()) {
    const sb = supabaseAdmin();
    if (sb) {
      const { data } = await sb
        .from("user_profiles")
        .select("display_name, headline, account_type, country, is_public")
        .eq("slug", slug)
        .maybeSingle();
      const p = data as {
        display_name?: string; headline?: string;
        account_type?: string; country?: string; is_public?: boolean;
      } | null;
      if (p && p.is_public) {
        title = clip(p.display_name || "Member", 60);
        subtitle = clip(p.headline || "On Sankofa Studio", 140);
        const def = getAccountTypeDef((p.account_type as never) ?? "general");
        kicker = def.label.toUpperCase();

        // Best-effort verified probe — we hide the badge silently
        // when the lookup fails so a network blip can't break the
        // OG render.
        try {
          const { data: vrf } = await sb.rpc("profile_verified_state", { _user_id: (data as { user_id?: string } | null)?.user_id });
          if (vrf && (vrf as { verified?: boolean }).verified) {
            badge = p.country ? `Verified · ${p.country}` : "Verified";
          } else if (p.country) {
            badge = p.country;
          }
        } catch {
          if (p.country) badge = p.country;
        }
      }
    }
  }

  return renderOgCard({ kicker, title, subtitle, badge });
}
