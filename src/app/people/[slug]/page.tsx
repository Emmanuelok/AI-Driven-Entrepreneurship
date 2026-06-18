"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";
import { profileApi, type UserProfile } from "@/lib/profile-api";
import { getAccountTypeDef } from "@/lib/account-types";
import { Card, Badge, Button, Textarea, Input, Dialog } from "@/components/ui";
import { ArrowLeft, Globe, Link as LinkIcon, AtSign, Mail, Loader2, MapPin, Send, CheckCircle2 } from "lucide-react";

// Public profile page rendered at /people/[slug]. Shows the same
// fields the directory teases plus the persona-specific data
// (mentor expertise, investor sectors, etc.) and contact CTAs.

export default function PublicProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  // Real Supabase auth id of the viewer (null when signed out). Used to
  // decide whether to show the contact composer and to hide it on your
  // own profile.
  const [viewerId, setViewerId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = supabaseBrowser();
        if (sb) {
          const { data } = await sb.auth.getSession();
          if (!cancelled) setViewerId(data.session?.user.id ?? null);
        }
      } catch { /* anonymous viewer is fine */ }
      const r = await profileApi.getProfileBySlug(slug);
      if (cancelled) return;
      if (r.ok) setProfile(r.profile);
      else setMissing(true);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) return <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="size-6 text-emerald animate-spin" /></div>;
  if (missing) { notFound(); return null; }
  if (!profile) return null;

  const def = getAccountTypeDef(profile.account_type);

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/people" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-6">
        <ArrowLeft className="size-3" /> People
      </Link>

      <div className="flex items-start gap-5 flex-wrap mb-7">
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar_url} alt="" className="size-24 rounded-3xl object-cover" />
        ) : (
          <div className="size-24 rounded-3xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-bold text-3xl shadow-lg shadow-emerald/20">
            {(profile.display_name || "?").trim().slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-1 flex items-center gap-1.5">
            {def.emoji} {def.label}
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
            {profile.display_name || "—"}
          </h1>
          {profile.headline && <p className="mt-2 text-lg text-muted leading-snug">{profile.headline}</p>}
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            {(profile.city || profile.country) && (
              <Badge color="muted"><span className="inline-flex items-center gap-1"><MapPin className="size-3" />{[profile.city, profile.country].filter(Boolean).join(", ")}</span></Badge>
            )}
            {profile.primary_language && <Badge color="muted">{profile.primary_language}</Badge>}
            <Badge color={profile.contact_policy === "open" ? "emerald" : profile.contact_policy === "institution" ? "amber" : "muted"}>
              {profile.contact_policy === "open" ? "Open to contact" : profile.contact_policy === "institution" ? "Same institution only" : "Not accepting contact"}
            </Badge>
          </div>
        </div>
      </div>

      {profile.bio && (
        <Card className="p-6 mb-5">
          <p className="text-foreground/95 leading-relaxed whitespace-pre-wrap">{profile.bio}</p>
        </Card>
      )}

      <PersonaPanel profile={profile} />

      {(profile.website_url || profile.linkedin_url || profile.twitter_url) && (
        <Card className="p-5 mt-5">
          <h3 className="text-[10px] uppercase tracking-widest text-muted mb-3">Links</h3>
          <div className="flex flex-wrap gap-2">
            {profile.website_url && (
              <a href={profile.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border hover:border-emerald/40 text-xs text-muted hover:text-foreground transition">
                <Globe className="size-3.5" /> Website
              </a>
            )}
            {profile.linkedin_url && (
              <a href={profile.linkedin_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border hover:border-emerald/40 text-xs text-muted hover:text-foreground transition">
                <LinkIcon className="size-3.5" /> LinkedIn
              </a>
            )}
            {profile.twitter_url && (
              <a href={profile.twitter_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border hover:border-emerald/40 text-xs text-muted hover:text-foreground transition">
                <AtSign className="size-3.5" /> X / Twitter
              </a>
            )}
          </div>
        </Card>
      )}

      {profile.contact_policy !== "closed" && (
        <ContactSection
          profile={profile}
          isSelf={!!viewerId && viewerId === profile.user_id}
          signedIn={!!viewerId}
        />
      )}
    </div>
  );
}

// Per-type detail panel: surfaces the persona_data fields the user
// filled in during onboarding or via the profile editor. Each type
// renders only the keys it knows about so a stale or empty field
// doesn't show up as an "Undefined".
function PersonaPanel({ profile }: { profile: UserProfile }) {
  const p = profile.persona_data ?? {};
  const t = profile.account_type;

  function Pills({ items }: { items: unknown }) {
    if (!Array.isArray(items) || items.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1.5 mt-2">
        {items.filter((x) => typeof x === "string" && x.trim()).map((x) => (
          <span key={String(x)} className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-surface-2 text-muted">{String(x)}</span>
        ))}
      </div>
    );
  }

  function Row({ label, value }: { label: string; value: unknown }) {
    if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) return null;
    return (
      <div className="flex items-baseline gap-3 text-sm">
        <span className="text-[10px] uppercase tracking-widest text-muted w-28 shrink-0">{label}</span>
        <span className="text-foreground/90">{String(value)}</span>
      </div>
    );
  }

  switch (t) {
    case "mentor":
      return (
        <Card className="p-5 mt-5">
          <h3 className="text-[10px] uppercase tracking-widest text-muted mb-3">Mentor profile</h3>
          <div className="space-y-2">
            <Row label="Availability" value={p.availability} />
            <Row label="Years experience" value={p.yearsExperience} />
            {p.hourlyRate ? <Row label="Hourly rate" value={`$${p.hourlyRate}`} /> : null}
          </div>
          {Array.isArray(p.expertise) && p.expertise.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Expertise</div>
              <Pills items={p.expertise} />
            </div>
          )}
          {Array.isArray(p.sectors) && p.sectors.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Sectors</div>
              <Pills items={p.sectors} />
            </div>
          )}
        </Card>
      );
    case "investor":
      return (
        <Card className="p-5 mt-5">
          <h3 className="text-[10px] uppercase tracking-widest text-muted mb-3">Investor profile</h3>
          <div className="space-y-2">
            <Row label="Firm" value={p.firmName} />
            <Row label="Check size" value={p.typicalCheckSize ? `$${(p.typicalCheckSize as number).toLocaleString()}` : undefined} />
          </div>
          {Array.isArray(p.sectors) && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Sectors</div>
              <Pills items={p.sectors} />
            </div>
          )}
          {Array.isArray(p.stages) && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Stages</div>
              <Pills items={p.stages} />
            </div>
          )}
        </Card>
      );
    case "funder":
      return (
        <Card className="p-5 mt-5">
          <h3 className="text-[10px] uppercase tracking-widest text-muted mb-3">Funder / program</h3>
          <div className="space-y-2">
            <Row label="Program" value={p.programName} />
            <Row label="Funding range" value={p.fundingRange} />
            {p.applicationUrl ? (
              <div className="flex items-baseline gap-3 text-sm">
                <span className="text-[10px] uppercase tracking-widest text-muted w-28 shrink-0">Apply</span>
                <a href={p.applicationUrl as string} target="_blank" rel="noopener noreferrer" className="text-emerald hover:underline truncate">{String(p.applicationUrl)}</a>
              </div>
            ) : null}
          </div>
          {Array.isArray(p.focusAreas) && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Focus areas</div>
              <Pills items={p.focusAreas} />
            </div>
          )}
        </Card>
      );
    case "instructor":
      return (
        <Card className="p-5 mt-5">
          <h3 className="text-[10px] uppercase tracking-widest text-muted mb-3">Instructor</h3>
          <div className="space-y-2">
            <Row label="Institution" value={p.institution} />
            <Row label="Department" value={p.department} />
          </div>
          {Array.isArray(p.courses) && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Courses</div>
              <Pills items={p.courses} />
            </div>
          )}
        </Card>
      );
    case "journalist":
      return (
        <Card className="p-5 mt-5">
          <h3 className="text-[10px] uppercase tracking-widest text-muted mb-3">Journalist</h3>
          <div className="space-y-2">
            <Row label="Outlet" value={p.outletName} />
          </div>
          {Array.isArray(p.beats) && (
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Beats</div>
              <Pills items={p.beats} />
            </div>
          )}
        </Card>
      );
    case "institution":
      return (
        <Card className="p-5 mt-5">
          <h3 className="text-[10px] uppercase tracking-widest text-muted mb-3">Institution</h3>
          <div className="space-y-2">
            <Row label="Name" value={p.name} />
            <Row label="Kind" value={p.kind} />
            <Row label="Partner since" value={p.partnersSince} />
          </div>
        </Card>
      );
    case "student":
      return (
        <Card className="p-5 mt-5">
          <h3 className="text-[10px] uppercase tracking-widest text-muted mb-3">Student / founder</h3>
          <div className="space-y-2">
            <Row label="Institution" value={p.institution} />
            <Row label="Field" value={p.field} />
            <Row label="Year" value={p.year} />
          </div>
        </Card>
      );
    default:
      return null;
  }
}

// Contact section: shows a real composer when the viewer is signed in
// (and it isn't their own profile). Server enforces the policy — we
// just open the door. Signed-out visitors get a sign-in nudge.
function ContactSection({ profile, isSelf, signedIn }: { profile: UserProfile; isSelf: boolean; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const firstName = profile.display_name?.split(" ")[0] || "this member";

  if (isSelf) {
    return (
      <Card className="p-5 mt-5">
        <p className="text-sm text-muted">This is your public profile. <Link href="/studio/profile" className="text-emerald hover:underline">Edit it</Link> or <Link href="/studio/inbox" className="text-emerald hover:underline">check your inbox</Link>.</p>
      </Card>
    );
  }

  const policyLine =
    profile.contact_policy === "institution"
      ? `${firstName} accepts contact from people at the same institution.`
      : `${firstName} is open to contact from members.`;

  return (
    <Card className="p-5 mt-5 bg-gradient-to-br from-emerald/5 to-amber/5">
      <h3 className="font-medium mb-2 flex items-center gap-2"><Mail className="size-4 text-emerald" /> Want to reach out?</h3>
      <p className="text-sm text-muted leading-relaxed mb-4">{policyLine}</p>
      {signedIn ? (
        <Button size="sm" onClick={() => setOpen(true)}><Send className="size-3.5" /> Send a message</Button>
      ) : (
        <Link href="/sign-in">
          <Button size="sm">Sign in to connect</Button>
        </Link>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={`Reach out to ${firstName}`}>
        <ContactComposer profile={profile} onSent={() => setOpen(false)} />
      </Dialog>
    </Card>
  );
}

function ContactComposer({ profile, onSent }: { profile: UserProfile; onSent: () => void }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    if (!body.trim() || sending) return;
    setSending(true);
    setErr(null);
    const r = await profileApi.sendContactRequest(profile.slug ?? "", {
      body: body.trim(),
      subject: subject.trim() || undefined,
      context: profile.account_type,
    });
    setSending(false);
    if (r.ok) {
      setSent(true);
      setTimeout(onSent, 1600);
    } else {
      const map: Record<string, string> = {
        already_pending: "You already have a pending request to this member.",
        closed: "This member has closed inbound contact.",
        institution_only: "This member only accepts contact from the same institution.",
        not_public: "This member isn't accepting contact right now.",
        auth_failed: "Please sign in to send a message.",
        self: "You can't message yourself.",
      };
      setErr(map[r.error] ?? "Couldn't send your message. Try again.");
    }
  }

  if (sent) {
    return (
      <div className="text-center py-6">
        <div className="size-14 mx-auto rounded-full bg-emerald/15 flex items-center justify-center mb-3">
          <CheckCircle2 className="size-7 text-emerald" />
        </div>
        <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold">Message sent</h3>
        <p className="mt-1.5 text-sm text-muted">
          {profile.display_name?.split(" ")[0] || "They"}&apos;ll see it in their inbox. If they accept, their reply lands in yours.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted leading-relaxed">
        Keep it specific — who you are, why you&apos;re reaching out, and what you&apos;re hoping for. A clear, short ask gets answered.
      </p>
      <label className="block">
        <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Subject (optional)</div>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Quick question on distribution in Ghana" maxLength={160} />
      </label>
      <label className="block">
        <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Message</div>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder={`Hi ${profile.display_name?.split(" ")[0] || "there"} — I'm building…`} maxLength={2000} />
        <div className="text-[11px] text-muted mt-1">{body.length}/2000</div>
      </label>
      {err && <p className="text-xs text-rust">{err}</p>}
      <div className="flex justify-end">
        <Button onClick={send} disabled={!body.trim() || sending}>
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send message
        </Button>
      </div>
    </div>
  );
}
