"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBuild } from "@/store/build";
import { Card, Button, Badge } from "@/components/ui";
import { GitFork, Eye, ArrowLeft, ExternalLink, Smartphone, Monitor, Tablet, DollarSign, Lock, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { injectConsoleBridge } from "@/components/build-tools";
import { Claps, Comments } from "@/components/social";
import { BuildPricingDialog, BuildPriceBadge } from "@/components/build-pricing-dialog";
import { RefundRequestButton } from "@/components/refund-request-button";
import { DiscountCodeInput } from "@/components/discount-code-input";

type Pricing = { price_cents: number; currency: string; application_fee_pct: number } | null;
type Purchase = { paid_at?: string; amount_cents?: number; currency?: string; isOwner?: boolean } | null;

type Build = {
  slug: string;
  title: string;
  description?: string;
  code: string;
  template_id?: string;
  tags: string[];
  forks: number;
  views: number;
  updated_at: string;
};

type Device = "phone" | "tablet" | "desktop";

export default function MarketplaceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const { createProject } = useBuild();
  const [build, setBuild] = useState<Build | null>(null);
  const [busy, setBusy] = useState(true);
  const [forking, setForking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [pricing, setPricing] = useState<Pricing>(null);
  const [purchase, setPurchase] = useState<Purchase>(null);
  const [discountCode, setDiscountCode] = useState<string | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/marketplace/build/${encodeURIComponent(slug)}`);
        const data = await res.json();
        if (data.ok) setBuild(data.build);
        else setError(data.error || "Couldn't load build.");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
      // Pricing is public; purchase needs auth.
      try {
        const pRes = await fetch(`/api/v2/marketplace/build/${encodeURIComponent(slug)}/pricing`);
        const pData = await pRes.json();
        if (pData.ok) setPricing(pData.pricing);
      } catch { /* silent */ }
      try {
        const sb = (await import("@/lib/supabase")).supabaseBrowser();
        if (sb) {
          const { data: { session } } = await sb.auth.getSession();
          if (session) {
            const uRes = await fetch(`/api/v2/marketplace/build/${encodeURIComponent(slug)}/purchase`, {
              headers: { Authorization: `Bearer ${session.access_token}` },
            });
            const uData = await uRes.json();
            if (uData.ok) setPurchase(uData.purchase);
          }
        }
      } catch { /* silent */ }
    })();
  }, [slug]);

  async function fork() {
    if (!build) return;
    setForking(true);
    try {
      const sb = (await import("@/lib/supabase")).supabaseBrowser();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (sb) {
        const { data: { session } } = await sb.auth.getSession();
        if (session) headers.Authorization = `Bearer ${session.access_token}`;
      }
      const res = await fetch("/api/marketplace/fork", {
        method: "POST",
        headers,
        body: JSON.stringify({ slug }),
      });
      if (res.status === 402) {
        // Paywall hit — kick to Stripe Checkout.
        await startCheckout();
        return;
      }
      const data = await res.json();
      if (!data.ok) { alert(data.error || "Couldn't fork."); return; }
      const pid = createProject(
        `${build.title} (fork)`,
        build.description || `Forked from /studio/marketplace/${slug}`,
        data.build.templateId || "blank-canvas",
        data.build.code,
      );
      router.push(`/studio/build/${pid}`);
    } finally {
      setForking(false);
    }
  }

  async function startCheckout() {
    try {
      const sb = (await import("@/lib/supabase")).supabaseBrowser();
      if (!sb) { alert("Cloud sync isn't configured."); return; }
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { alert("Sign in to purchase."); return; }
      const res = await fetch(`/api/v2/marketplace/build/${slug}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(discountCode ? { discountCode } : {}),
      });
      const data = await res.json();
      if (data.alreadyPaid) { setPurchase({ paid_at: new Date().toISOString() } as Purchase); return; }
      if (!data.ok || !data.url) { alert(data.message || data.error || "Couldn't start checkout."); return; }
      window.location.href = data.url;
    } catch (e) {
      alert((e as Error).message);
    }
  }

  if (busy) return <div className="max-w-5xl mx-auto px-5 py-12 text-sm text-muted">Loading…</div>;
  if (error || !build) {
    return (
      <div className="max-w-5xl mx-auto px-5 py-12">
        <Link href="/studio/marketplace" className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-4">
          <ArrowLeft className="size-3.5" /> Marketplace
        </Link>
        <p className="text-sm text-rust">{error || "Not found."}</p>
      </div>
    );
  }

  const deviceWidth = device === "phone" ? 390 : device === "tablet" ? 768 : "100%";
  const deviceHeight = device === "phone" ? 780 : device === "tablet" ? 900 : 700;

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 space-y-5">
      <Link href="/studio/marketplace" className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5">
        <ArrowLeft className="size-3.5" /> Marketplace
      </Link>

      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {build.template_id && <Badge color="muted">{build.template_id}</Badge>}
            {build.tags.map((t) => (
              <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 border border-border text-muted">{t}</span>
            ))}
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold leading-tight">{build.title}</h1>
          {build.description && <p className="mt-2 text-muted max-w-2xl">{build.description}</p>}
          <div className="mt-3 flex items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1"><GitFork className="size-3" /> {build.forks} forks</span>
            <span className="flex items-center gap-1"><Eye className="size-3" /> {build.views} views</span>
            <span>Updated {formatDistanceToNow(new Date(build.updated_at), { addSuffix: true })}</span>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <BuildPriceBadge pricing={pricing} />
          {purchase?.isOwner && (
            <Button variant="secondary" onClick={() => setPricingOpen(true)}>
              <DollarSign className="size-4" /> {pricing ? "Pricing" : "Sell this"}
            </Button>
          )}
          <Claps kind="build" slug={slug} />
          {pricing && pricing.price_cents > 0 && !purchase?.isOwner && !purchase?.paid_at ? (
            <div className="flex flex-col items-end gap-2">
              <Button onClick={startCheckout} size="lg">
                <Lock className="size-4" /> Buy for {(pricing.price_cents / 100).toFixed(2)} {pricing.currency.toUpperCase()}
              </Button>
              <DiscountCodeInput kind="build" refId={slug} onApplied={setDiscountCode} />
            </div>
          ) : (
            <Button onClick={fork} disabled={forking} size="lg">
              <GitFork className="size-4" /> {forking ? "Forking…" : "Fork to my studio"}
            </Button>
          )}
        </div>
      </header>

      {purchase?.paid_at && (
        <Card className="p-3 mt-4 mb-2 border border-emerald/30 bg-emerald/5">
          <div className="text-xs flex items-center gap-2 justify-between">
            <span className="text-emerald flex items-center gap-2">
              <Check className="size-3.5" />
              Purchased · {purchase.amount_cents ? `${(purchase.amount_cents / 100).toFixed(2)} ${(purchase.currency ?? "usd").toUpperCase()}` : "lifetime access"}
            </span>
            <RefundRequestButton kind="build" refId={slug} />
          </div>
        </Card>
      )}

      <BuildPricingDialog
        slug={slug}
        open={pricingOpen}
        onClose={() => setPricingOpen(false)}
        onSaved={async () => {
          const pRes = await fetch(`/api/v2/marketplace/build/${encodeURIComponent(slug)}/pricing`);
          const pData = await pRes.json();
          if (pData.ok) setPricing(pData.pricing);
        }}
      />

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <div className="text-xs text-muted">Live preview</div>
          <div className="flex items-center gap-1">
            <button onClick={() => setDevice("phone")} className={`size-7 rounded-md flex items-center justify-center transition ${device === "phone" ? "bg-emerald/15 text-emerald" : "text-muted hover:text-foreground"}`} aria-label="Phone width">
              <Smartphone className="size-3.5" />
            </button>
            <button onClick={() => setDevice("tablet")} className={`size-7 rounded-md flex items-center justify-center transition ${device === "tablet" ? "bg-emerald/15 text-emerald" : "text-muted hover:text-foreground"}`} aria-label="Tablet width">
              <Tablet className="size-3.5" />
            </button>
            <button onClick={() => setDevice("desktop")} className={`size-7 rounded-md flex items-center justify-center transition ${device === "desktop" ? "bg-emerald/15 text-emerald" : "text-muted hover:text-foreground"}`} aria-label="Desktop width">
              <Monitor className="size-3.5" />
            </button>
          </div>
        </div>
        <div className={`bg-black ${device === "desktop" ? "p-0" : "p-6 flex items-start justify-center"}`}>
          <div className="bg-white shadow-2xl overflow-hidden" style={{ width: deviceWidth, maxWidth: "100%", height: deviceHeight, borderRadius: device === "desktop" ? 0 : 8 }}>
            <iframe
              title="preview"
              srcDoc={injectConsoleBridge(build.code)}
              sandbox="allow-scripts allow-forms allow-modals allow-popups"
              className="w-full h-full border-0"
            />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <Comments kind="build" slug={slug} />
      </Card>

      <Card className="p-5">
        <div className="text-xs text-muted">
          Forks are independent copies. After forking, the original author won&apos;t see your changes
          unless you publish them as a new build. Be a good neighbor: credit the original in your
          description if your fork is heavily derived.
        </div>
        <div className="mt-3">
          <a href={`/api/marketplace/build/${slug}`} target="_blank" rel="noopener" className="text-xs text-emerald hover:text-amber inline-flex items-center gap-1">
            Raw JSON <ExternalLink className="size-3" />
          </a>
        </div>
      </Card>
    </div>
  );
}
