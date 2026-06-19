"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { profileApi, type ProfileSummary } from "@/lib/profile-api";
import { ACCOUNT_TYPES, getAccountTypeDef, type AccountType } from "@/lib/account-types";
import { Card, Button } from "@/components/ui";
import { VerifiedBadgeBool } from "@/components/verified-badge";
import { Users, Search, Loader2, ArrowRight } from "lucide-react";

// Public people directory. Lists everyone who's opted into a public
// profile, filterable by account type and country. The empty state is
// honest — if nobody's opted in yet for a given filter, we say so.
//
// Sign-up CTAs at the bottom send unauthenticated visitors into the
// onboarding flow with ?as=<type> prefilled so they land already
// nudged toward the role they were browsing.

export default function PeopleDirectoryPage() {
  const [type, setType] = useState<AccountType | "all">("all");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ProfileSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Debounced refetch on filter change so each keystroke doesn't hit
  // the API. 250ms feels snappy without being chatty.
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await profileApi.listProfiles({ type: type === "all" ? undefined : type, q: q.trim() || undefined, limit: 36 });
      if (r.ok) { setRows(r.results); setTotal(r.total); }
      else { setRows([]); setTotal(0); }
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [type, q]);

  const typeTabs = useMemo(() => [{ type: "all" as const, label: "Everyone" }, ...ACCOUNT_TYPES.map((t) => ({ type: t.type, label: t.pluralLabel }))], []);

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
          <Users className="size-3.5" /> People
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
          The people building, advising, and backing on Sankofa.
        </h1>
        <p className="mt-3 text-muted max-w-2xl leading-relaxed">
          Founders, mentors, instructors, investors, funders, and journalists who&apos;ve opted into a public profile. Open a profile to see who someone is and how to reach them.
        </p>
      </div>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="size-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, headline, or keywords…"
            className="bg-surface-2 border border-border rounded-xl pl-10 pr-3 py-2.5 text-sm outline-none focus:border-emerald w-full"
          />
        </div>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-6 -mx-1 px-1">
        {typeTabs.map((t) => {
          const active = type === t.type;
          return (
            <button
              key={t.type}
              onClick={() => setType(t.type)}
              className={`px-3.5 py-1.5 rounded-full border text-xs whitespace-nowrap transition ${active ? "border-emerald bg-emerald/10 text-emerald" : "border-border text-muted hover:text-foreground hover:border-muted"}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="size-6 text-emerald animate-spin" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-muted leading-relaxed max-w-md mx-auto">
            {q.trim() || type !== "all"
              ? "Nobody matches those filters yet. Try a different account type or broaden your search."
              : "Nobody has published a public profile yet. Be the first — set your profile to public from your /studio/me page."}
          </p>
        </Card>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
            {rows.map((p) => (
              <ProfileCard key={p.user_id} p={p} />
            ))}
          </div>
          {total > rows.length && (
            <div className="text-center text-xs text-muted">Showing {rows.length} of {total}. Refine your filters to narrow down.</div>
          )}
        </>
      )}

      <Card className="mt-10 p-6 sm:p-8 bg-gradient-to-br from-emerald/5 to-amber/5">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold mb-3">
          Not registered yet?
        </h2>
        <p className="text-muted leading-relaxed mb-5 max-w-2xl">
          Anyone can register on the platform — pick the role that fits you. You can switch later or carry more than one.
        </p>
        <div className="flex flex-wrap gap-2">
          {ACCOUNT_TYPES.filter((t) => t.type !== "general").map((t) => (
            <Link key={t.type} href={`/studio/onboarding?as=${t.type}`}>
              <Button variant="secondary" size="sm">
                {t.emoji} Sign up as {t.label.toLowerCase()}
              </Button>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ProfileCard({ p }: { p: ProfileSummary }) {
  const def = getAccountTypeDef(p.account_type);
  const initials = (p.display_name || "?").trim().slice(0, 1).toUpperCase();
  return (
    <Link href={`/people/${p.slug}`} className="block group">
      <Card className="p-5 h-full hover:border-emerald/40 transition">
        <div className="flex items-start gap-3">
          {p.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.avatar_url} alt="" className="size-12 rounded-2xl object-cover" />
          ) : (
            <div className="size-12 rounded-2xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-semibold">
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="font-medium truncate group-hover:text-emerald transition inline-flex items-center gap-1.5">
              <span className="truncate">{p.display_name || "—"}</span>
              <VerifiedBadgeBool verified={p.verified} size="xs" />
            </div>
            <div className="text-[11px] text-muted truncate">
              {def.emoji} {def.label}{p.country ? ` · ${p.country}` : ""}
            </div>
          </div>
          <ArrowRight className="size-3.5 text-muted shrink-0 opacity-0 group-hover:opacity-100 transition" />
        </div>
        {p.headline && <p className="mt-3 text-sm text-muted leading-relaxed line-clamp-3">{p.headline}</p>}
      </Card>
    </Link>
  );
}
