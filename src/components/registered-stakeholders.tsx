"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { profileApi, type ProfileSummary } from "@/lib/profile-api";
import { getAccountTypeDef, type AccountType } from "@/lib/account-types";
import { Card } from "@/components/ui";
import { VerifiedBadgeBool } from "@/components/verified-badge";
import { Loader2, ArrowRight, BadgeCheck } from "lucide-react";

// A live strip of REGISTERED stakeholders of a given account type,
// pulled from the public profiles directory. Used on the mentors,
// funding, and (future) investor discovery pages so people who
// actually signed up in a given role are surfaced and contactable —
// distinct from the curated, real-world reference catalogs those
// pages also carry.
//
// Renders a compact "be the first / invite" hint when nobody has
// registered + opted public yet, so the section never looks broken
// and registered users understand where they'll appear.

export function RegisteredStakeholders({
  type,
  title,
  blurb,
  emptyHint,
  signupHref,
  limit = 6,
}: {
  type: AccountType;
  title: string;
  blurb: string;
  emptyHint: string;
  signupHref: string;
  limit?: number;
}) {
  const [rows, setRows] = useState<ProfileSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await profileApi.listProfiles({ type, limit });
      if (cancelled) return;
      if (r.ok) { setRows(r.results); setTotal(r.total); }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [type, limit]);

  const def = getAccountTypeDef(type);

  return (
    <section className="mb-8">
      <div className="flex items-end justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold flex items-center gap-2">
            <BadgeCheck className="size-5 text-emerald" /> {title}
          </h2>
          <p className="text-sm text-muted mt-0.5">{blurb}</p>
        </div>
        {total > rows.length && (
          <Link href={`/people?type=${type}`} className="text-xs text-emerald hover:underline shrink-0">
            See all {total} {def.pluralLabel.toLowerCase()} →
          </Link>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted py-4">
          <Loader2 className="size-4 animate-spin" /> Loading {def.pluralLabel.toLowerCase()}…
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-5 border-dashed">
          <p className="text-sm text-muted leading-relaxed">
            {emptyHint}{" "}
            <Link href={signupHref} className="text-emerald hover:underline">
              Register as {def.label.toLowerCase()} →
            </Link>
          </p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((p) => (
            <Link key={p.user_id} href={`/people/${p.slug}`} className="block group">
              <Card className="p-4 h-full hover:border-emerald/40 transition">
                <div className="flex items-start gap-3">
                  {p.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.avatar_url} alt="" className="size-11 rounded-2xl object-cover shrink-0" />
                  ) : (
                    <div className="size-11 rounded-2xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-semibold shrink-0">
                      {(p.display_name || "?").trim().slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate group-hover:text-emerald transition inline-flex items-center gap-1">
                      <span className="truncate">{p.display_name || "—"}</span>
                      <VerifiedBadgeBool verified={p.verified} size="xs" />
                    </div>
                    <div className="text-[11px] text-muted truncate">
                      {[p.city, p.country].filter(Boolean).join(", ") || def.label}
                    </div>
                  </div>
                  <ArrowRight className="size-3.5 text-muted shrink-0 opacity-0 group-hover:opacity-100 transition" />
                </div>
                {p.headline && <p className="mt-2.5 text-xs text-muted leading-relaxed line-clamp-2">{p.headline}</p>}
                <PersonaTags persona={p.persona_data} />
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

// Surface the most useful persona tags (sectors / expertise / focus
// areas) as chips, capped to keep cards compact.
function PersonaTags({ persona }: { persona: Record<string, unknown> }) {
  const pools = [persona.expertise, persona.sectors, persona.focusAreas, persona.beats].filter(Array.isArray) as unknown[][];
  const tags = pools.flat().filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 3);
  if (tags.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 border border-border text-muted">{t}</span>
      ))}
    </div>
  );
}
