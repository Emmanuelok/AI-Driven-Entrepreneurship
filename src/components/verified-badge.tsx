"use client";

import { BadgeCheck } from "lucide-react";
import type { VerifiedState } from "@/lib/profile-api";

// The verified badge surfaced beside a member's display name on
// profile + directory cards. We're transparent about WHAT made them
// verified — hover surfaces the underlying signals (institution
// email check, peer attestation count, admin-attested) so nobody's
// fooled into thinking the badge means more than it does.

type Props = {
  state: Pick<VerifiedState, "institution_email" | "id_check" | "admin_verified" | "attestation_count" | "verified"> | undefined;
  size?: "xs" | "sm" | "md";
};

export function VerifiedBadge({ state, size = "sm" }: Props) {
  if (!state?.verified) return null;
  const px = size === "xs" ? "size-3" : size === "md" ? "size-4" : "size-3.5";

  const reasons: string[] = [];
  if (state.institution_email) reasons.push("institution email");
  if (state.id_check) reasons.push("ID check");
  if (state.admin_verified) reasons.push("admin attested");
  if (state.attestation_count >= 3) reasons.push(`${state.attestation_count} peer vouches`);
  const tooltip = reasons.length > 0 ? `Verified · ${reasons.join(" · ")}` : "Verified";

  return (
    <span
      className="inline-flex items-center gap-0.5 text-emerald shrink-0"
      title={tooltip}
      aria-label={tooltip}
    >
      <BadgeCheck className={px} />
    </span>
  );
}

// Compact verified-from-summary variant: when we only have the boolean
// (e.g. from the directory listing's annotation pass), we don't know
// which signals fired. The badge still renders with a generic tooltip.
export function VerifiedBadgeBool({ verified, size = "sm" }: { verified: boolean | undefined; size?: "xs" | "sm" | "md" }) {
  if (!verified) return null;
  return <VerifiedBadge state={{ institution_email: false, id_check: false, admin_verified: false, attestation_count: 0, verified: true }} size={size} />;
}
