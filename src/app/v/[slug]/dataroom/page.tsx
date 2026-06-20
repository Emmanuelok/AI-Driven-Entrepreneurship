"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { profileApi, type DataroomItem, type DataroomGrantRow } from "@/lib/profile-api";
import { accessSummary, type ViewerAccess } from "@/lib/dataroom-access";
import { Card, Badge, Button } from "@/components/ui";
import {
  ShieldCheck, FileText, BarChart3, Paperclip, Link as LinkIcon, StickyNote,
  Lock, ExternalLink, Loader2, AlertCircle, ArrowLeft, Clock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// /v/[slug]/dataroom — public viewer for a venture's dataroom.
// Anonymous/no-grant viewers see only `visibility='public'` items.
// Granted viewers see everything (and the view is logged server-side).
// Owners get an "Edit" link back to /studio/venture/[id]/investor-access.

const KIND_ICON: Record<DataroomItem["kind"], typeof FileText> = {
  doc: FileText,
  metric: BarChart3,
  file: Paperclip,
  link: LinkIcon,
  note: StickyNote,
};

export default function DataroomViewerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [access, setAccess] = useState<ViewerAccess | null>(null);
  const [items, setItems] = useState<DataroomItem[]>([]);
  const [grants, setGrants] = useState<DataroomGrantRow[]>([]);
  const [title, setTitle] = useState(slug);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await profileApi.getDataroom(slug);
      if (!alive) return;
      if (!r.ok) { setErr(r.error || "Failed to load"); setLoading(false); return; }
      setAccess(r.access);
      setItems(r.items);
      setGrants(r.grants as DataroomGrantRow[]);
      setTitle(r.venture.title);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [slug]);

  const summary = useMemo(() => access ? accessSummary(access) : "", [access]);
  const myGrant = useMemo(() => {
    if (!access || access.state !== "granted") return null;
    return grants[0] ?? null;
  }, [access, grants]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="size-6 text-emerald animate-spin" />
      </div>
    );
  }

  if (err) {
    return (
      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-12">
        <Card className="p-6 border-rust/40 flex items-start gap-3">
          <AlertCircle className="size-5 text-rust mt-0.5" />
          <div>
            <h2 className="font-medium mb-1">Could not load dataroom</h2>
            <p className="text-sm text-muted">{err}</p>
            <Link href={`/v/${slug}`} className="mt-3 inline-flex items-center gap-1 text-sm text-emerald hover:underline">
              <ArrowLeft className="size-3.5" /> Back to venture
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const gatedCount = items.filter((i) => i.visibility === "gated").length;
  const canSeeGated = access?.state === "owner" || access?.state === "granted";

  return (
    <div className="min-h-screen bg-[#0a0f0d] text-[#e7efe9]">
      <div className="max-w-4xl mx-auto px-5 sm:px-8 py-12 space-y-6">
        <Link href={`/v/${slug}`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-emerald">
          <ArrowLeft className="size-3" /> Back to {title}
        </Link>

        <header>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-1 flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" /> Investor dataroom
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold">{title}</h1>
          <p className="text-sm text-muted mt-2">{summary}</p>
        </header>

        {access?.state === "owner" && (
          <Card className="p-4 border-emerald/30 flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm">
              You&apos;re viewing as the owner. Edit items or grant access from the studio.
            </div>
            <OwnerEditLink slug={slug} />
          </Card>
        )}

        {access?.state === "granted" && myGrant && (
          <Card className="p-4 border-emerald/30">
            <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Your access</div>
            <div className="text-sm flex items-center gap-2 flex-wrap">
              <Badge color="emerald">Granted</Badge>
              {myGrant.expires_at ? (
                <span className="text-muted">Expires {new Date(myGrant.expires_at).toLocaleDateString()}</span>
              ) : (
                <span className="text-muted">Open-ended</span>
              )}
              {myGrant.reason && <span className="text-muted italic">· {myGrant.reason}</span>}
            </div>
          </Card>
        )}

        {access?.state === "expired" && (
          <Card className="p-4 border-amber/40 flex items-start gap-3">
            <Clock className="size-4 text-amber mt-0.5" />
            <div>
              <div className="text-sm font-medium">Your access has expired</div>
              <div className="text-xs text-muted mt-0.5">
                Ask the founder to renew if you still need access. Public items remain below.
              </div>
            </div>
          </Card>
        )}

        {access?.state === "revoked" && (
          <Card className="p-4 border-rust/40 flex items-start gap-3">
            <Lock className="size-4 text-rust mt-0.5" />
            <div>
              <div className="text-sm font-medium">Access revoked</div>
              <div className="text-xs text-muted mt-0.5">The founder has revoked your grant. Public items still appear below.</div>
            </div>
          </Card>
        )}

        {items.length === 0 ? (
          <Card className="p-8 text-center">
            <FileText className="size-8 text-muted mx-auto mb-2" />
            <p className="text-sm text-muted">No items in this dataroom yet.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((it) => <ItemCard key={it.id} item={it} />)}
            {!canSeeGated && gatedCount > 0 && (
              <Card className="p-5 border-amber/30 flex items-start gap-3">
                <Lock className="size-5 text-amber mt-0.5" />
                <div>
                  <div className="text-sm font-medium">{gatedCount} more item{gatedCount === 1 ? "" : "s"} behind a grant</div>
                  <div className="text-xs text-muted mt-1">
                    The founder shares the rest of the dataroom (cap table, financials, contracts, etc.) with investors who request access.
                    {access?.state === "anonymous" && " Sign in to request access."}
                  </div>
                  {access?.state === "anonymous" && (
                    <Link href="/signin" className="mt-2 inline-block">
                      <Button size="sm">Sign in to continue</Button>
                    </Link>
                  )}
                </div>
              </Card>
            )}
          </div>
        )}

        <footer className="pt-8 border-t border-border text-xs text-muted">
          {access?.state === "granted" && (
            <p>Views of this room are logged. Granted on {myGrant?.granted_at ? formatDistanceToNow(new Date(myGrant.granted_at), { addSuffix: true }) : "—"}.</p>
          )}
        </footer>
      </div>
    </div>
  );
}

function ItemCard({ item }: { item: DataroomItem }) {
  const Icon = KIND_ICON[item.kind];
  const looksLikeUrl = item.value?.startsWith("http://") || item.value?.startsWith("https://");

  return (
    <Card className="p-5 hover:border-emerald/30 transition">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-emerald/10 text-emerald p-2 shrink-0">
          <Icon className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium">{item.title}</h3>
            {item.visibility === "gated" && <Badge color="amber"><Lock className="size-3 mr-1" /> Gated</Badge>}
          </div>

          {item.kind === "metric" && item.value && (
            <div className="mt-2 font-[family-name:var(--font-display)] text-2xl text-emerald">{item.value}</div>
          )}

          {(item.kind === "link" || item.kind === "file") && item.value && (
            looksLikeUrl ? (
              <a
                href={item.value}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-sm text-emerald hover:underline break-all"
              >
                {item.value} <ExternalLink className="size-3.5" />
              </a>
            ) : (
              <div className="mt-2 text-sm text-muted">{item.value}</div>
            )
          )}

          {item.body && (item.kind === "doc" || item.kind === "note") && (
            <div className="mt-2 text-sm text-muted whitespace-pre-wrap leading-relaxed">{item.body}</div>
          )}
        </div>
      </div>
    </Card>
  );
}

function OwnerEditLink({ slug }: { slug: string }) {
  // The studio route is keyed by the local venture id, not the slug.
  // We don't have that on the server here, so the cleanest fallback is
  // /studio/ventures (the index) — the founder picks from there.
  return (
    <Link href={`/studio/ventures`}>
      <Button size="sm" variant="secondary">Edit in studio</Button>
    </Link>
  );
}
