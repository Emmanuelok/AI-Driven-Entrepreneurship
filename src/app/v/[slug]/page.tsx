import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";

// Public investor profile. Static-render the SSR'd payload. No auth.
// Loads the payload server-side so the page is shareable + SEO-able.

type PublicPayload = {
  name?: string;
  tagline?: string;
  region?: string;
  publicLaunch?: { headline?: string; subhead?: string; bullets?: string[]; cta?: string; whatsappBlurb?: string };
  metrics?: { mrr?: number; customers?: number };
  fundingRaised?: number;
  fundingTarget?: number;
  team?: { name: string; role: string }[];
  achievements?: string[];
  jtbd?: { when?: string; iWantTo?: string; soICan?: string };
  wedge?: { who?: string };
  pitchDeck?: { slides?: { title: string; body: string }[] };
  updates?: { month: string; highlights: string }[];
};

async function fetchProfile(slug: string): Promise<{ payload: PublicPayload; views: number; updatedAt: string } | null> {
  // Derive the same origin we're served from so links resolve under
  // both vercel.app preview deployments and a custom domain.
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") || "https";
  const origin = host ? `${proto}://${host}` : "https://sankofa.studio";
  try {
    const res = await fetch(`${origin}/api/public/venture/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.ok) return null;
    return { payload: data.payload as PublicPayload, views: data.views ?? 0, updatedAt: data.updated_at };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const profile = await fetchProfile(slug);
  if (!profile) return { title: "Sankofa — venture not found" };
  const { payload } = profile;
  return {
    title: `${payload.publicLaunch?.headline || payload.name} — Sankofa`,
    description: payload.publicLaunch?.subhead || payload.tagline,
    openGraph: {
      title: payload.publicLaunch?.headline || payload.name,
      description: payload.publicLaunch?.subhead || payload.tagline,
      type: "website",
    },
  };
}

export default async function PublicVenturePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = await fetchProfile(slug);
  if (!profile) notFound();
  const { payload, views, updatedAt } = profile;

  const launch = payload.publicLaunch ?? {};
  const headline = launch.headline || payload.name || "Untitled venture";
  const subhead = launch.subhead || payload.tagline || "";

  return (
    <div className="min-h-screen bg-[#0a0f0d] text-[#e7efe9] font-sans">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute -top-40 -right-40 size-[40rem] rounded-full bg-[#2cc295]/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 size-[40rem] rounded-full bg-[#f4a949]/10 blur-3xl pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-6 sm:px-8 pt-16 sm:pt-24 pb-12">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="size-9 rounded-xl bg-gradient-to-br from-[#2cc295] to-[#f4a949] flex items-center justify-center text-black font-bold">
              <span style={{ fontFamily: "var(--font-display)" }}>S</span>
            </div>
            <div className="text-xs uppercase tracking-[0.22em] text-[#8aa39a]">Sankofa Studio · venture profile</div>
          </div>

          <h1 style={{ fontFamily: "var(--font-display)" }} className="text-4xl sm:text-6xl font-semibold leading-[1.05] tracking-tight">
            {headline}
          </h1>
          {subhead && <p className="mt-5 text-lg sm:text-xl text-[#cfe0d8] max-w-3xl leading-relaxed">{subhead}</p>}

          <div className="mt-6 flex flex-wrap gap-2 text-xs">
            {payload.region && <Pill>📍 {payload.region}</Pill>}
            {typeof payload.metrics?.mrr === "number" && payload.metrics.mrr > 0 && <Pill emerald>${payload.metrics.mrr.toLocaleString()} MRR</Pill>}
            {typeof payload.metrics?.customers === "number" && payload.metrics.customers > 0 && <Pill>{payload.metrics.customers} customers</Pill>}
            {typeof payload.fundingRaised === "number" && payload.fundingRaised > 0 && <Pill amber>${(payload.fundingRaised / 1000).toFixed(0)}k raised / pipelined</Pill>}
          </div>

          {launch.bullets && launch.bullets.length > 0 && (
            <ul className="mt-10 grid sm:grid-cols-3 gap-4">
              {launch.bullets.map((b, i) => (
                <li key={i} className="rounded-2xl border border-[#2a3a35] bg-[#141d1a]/60 p-5">
                  <div className="text-[10px] uppercase tracking-widest text-[#2cc295] mb-2">Why {i + 1}</div>
                  <div className="text-sm leading-relaxed">{b}</div>
                </li>
              ))}
            </ul>
          )}

          {launch.cta && (
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <button className="bg-[#2cc295] text-black font-semibold px-7 py-3 rounded-full hover:bg-[#f4a949] transition">
                {launch.cta}
              </button>
              <span className="text-xs text-[#6b8079]">Tap to express interest — we&apos;ll follow up.</span>
            </div>
          )}
        </div>
      </section>

      {/* JTBD + Wedge */}
      {(payload.jtbd?.when || payload.wedge?.who) && (
        <section className="border-t border-[#1f2c28]">
          <div className="max-w-5xl mx-auto px-6 sm:px-8 py-14 grid sm:grid-cols-2 gap-6">
            {payload.jtbd?.when && (
              <Card>
                <Label>The job</Label>
                <p className="mt-3 text-lg leading-relaxed">
                  <strong>When</strong> {payload.jtbd.when},{" "}
                  <strong>I want to</strong> {payload.jtbd.iWantTo},{" "}
                  <strong>so I can</strong> {payload.jtbd.soICan}.
                </p>
              </Card>
            )}
            {payload.wedge?.who && (
              <Card>
                <Label amber>Wedge</Label>
                <p className="mt-3 text-lg leading-relaxed">{payload.wedge.who}</p>
              </Card>
            )}
          </div>
        </section>
      )}

      {/* Pitch deck preview */}
      {payload.pitchDeck?.slides && payload.pitchDeck.slides.length > 0 && (
        <section className="border-t border-[#1f2c28] bg-[#0c1411]">
          <div className="max-w-5xl mx-auto px-6 sm:px-8 py-14">
            <h2 style={{ fontFamily: "var(--font-display)" }} className="text-3xl font-semibold mb-7">The pitch.</h2>
            <div className="space-y-4">
              {payload.pitchDeck.slides.slice(0, 6).map((s, i) => (
                <Card key={i}>
                  <div className="text-[10px] uppercase tracking-widest text-[#2cc295] mb-2">Slide {i + 1}</div>
                  <h3 style={{ fontFamily: "var(--font-display)" }} className="text-xl font-semibold leading-tight">{s.title}</h3>
                  <p className="mt-2 text-[#cfe0d8] leading-relaxed">{s.body}</p>
                </Card>
              ))}
            </div>
            {payload.pitchDeck.slides.length > 6 && (
              <p className="mt-4 text-sm text-[#6b8079] italic">
                {payload.pitchDeck.slides.length - 6} more slides on request.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Team */}
      {payload.team && payload.team.length > 0 && (
        <section className="border-t border-[#1f2c28]">
          <div className="max-w-5xl mx-auto px-6 sm:px-8 py-14">
            <h2 style={{ fontFamily: "var(--font-display)" }} className="text-3xl font-semibold mb-7">Team.</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {payload.team.map((t, i) => (
                <Card key={i}>
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full bg-gradient-to-br from-[#2cc295] to-[#f4a949] flex items-center justify-center text-black font-semibold">
                      {t.name[0]}
                    </div>
                    <div>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-[#8aa39a]">{t.role}</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Achievements + most recent update */}
      {((payload.achievements && payload.achievements.length > 0) || (payload.updates && payload.updates.length > 0)) && (
        <section className="border-t border-[#1f2c28] bg-[#0c1411]">
          <div className="max-w-5xl mx-auto px-6 sm:px-8 py-14 grid sm:grid-cols-2 gap-6">
            {payload.achievements && payload.achievements.length > 0 && (
              <Card>
                <Label>Milestones</Label>
                <div className="mt-3 flex flex-wrap gap-2">
                  {payload.achievements.map((a) => (
                    <span key={a} className="text-xs px-3 py-1.5 rounded-full bg-[#2cc295]/10 border border-[#2cc295]/30 text-[#2cc295]">{a}</span>
                  ))}
                </div>
              </Card>
            )}
            {payload.updates && payload.updates.length > 0 && (
              <Card>
                <Label amber>Latest update — {payload.updates[0].month}</Label>
                <p className="mt-3 text-[#cfe0d8] leading-relaxed whitespace-pre-wrap">{payload.updates[0].highlights}</p>
              </Card>
            )}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-[#1f2c28]">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 py-10 flex items-center justify-between flex-wrap gap-3 text-xs text-[#6b8079]">
          <div>{views} views · updated {new Date(updatedAt).toLocaleDateString()}</div>
          <Link href="/" className="text-[#2cc295] hover:text-[#f4a949] transition">
            Built on Sankofa Studio →
          </Link>
        </div>
      </footer>
    </div>
  );
}

function Pill({ children, emerald, amber }: { children: React.ReactNode; emerald?: boolean; amber?: boolean }) {
  const tone = emerald ? "border-[#2cc295]/40 text-[#2cc295] bg-[#2cc295]/5" : amber ? "border-[#f4a949]/40 text-[#f4a949] bg-[#f4a949]/5" : "border-[#2a3a35] text-[#8aa39a] bg-[#141d1a]";
  return <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border ${tone}`}>{children}</span>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-[#2a3a35] bg-[#141d1a]/60 p-6">{children}</div>;
}

function Label({ children, amber }: { children: React.ReactNode; amber?: boolean }) {
  return <div className={`text-[10px] uppercase tracking-[0.22em] ${amber ? "text-[#f4a949]" : "text-[#2cc295]"}`}>{children}</div>;
}
