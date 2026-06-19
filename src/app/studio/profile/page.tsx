"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { profileApi, type UserProfile, type Verification } from "@/lib/profile-api";
import { ACCOUNT_TYPES, getAccountTypeDef, type AccountType } from "@/lib/account-types";
import { Card, Button, Input, Textarea } from "@/components/ui";
import { ArrowLeft, Save, Loader2, ExternalLink, CheckCircle2, AlertCircle, User as UserIcon, BadgeCheck, Mail } from "lucide-react";

// Profile editor — the canonical surface where any user (any account
// type) maintains their platform-wide profile.
//
// Persona-specific fields render dynamically based on account_type so
// switching from "student" to "mentor" immediately reveals the
// mentor-specific questions (and keeps the existing fields cached in
// persona_data, so flipping back doesn't lose them).

export default function ProfileEditorPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await profileApi.getMyProfile();
      if (r.ok) setProfile(r.profile);
      setLoading(false);
    })();
  }, []);

  function patch<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setProfile((p) => (p ? { ...p, [key]: value } : p));
    setSaved(false);
  }

  function patchPersona(key: string, value: unknown) {
    setProfile((p) => (p ? { ...p, persona_data: { ...p.persona_data, [key]: value } } : p));
    setSaved(false);
  }

  async function save() {
    if (!profile) return;
    setSaving(true);
    setErr(null);
    const r = await profileApi.patchMyProfile({
      account_type: profile.account_type,
      display_name: profile.display_name,
      headline: profile.headline,
      bio: profile.bio,
      country: profile.country,
      city: profile.city,
      primary_language: profile.primary_language,
      avatar_url: profile.avatar_url || null,
      website_url: profile.website_url || null,
      linkedin_url: profile.linkedin_url || null,
      twitter_url: profile.twitter_url || null,
      is_public: profile.is_public,
      contact_policy: profile.contact_policy,
      persona_data: profile.persona_data,
    });
    setSaving(false);
    if (r.ok) {
      setProfile(r.profile);
      setSaved(true);
      setTimeout(() => setSaved(false), 2400);
    } else {
      setErr(r.error === "slug_taken" ? "That URL handle is already in use — try a different display name." : r.error);
    }
  }

  if (loading) return <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="size-6 text-emerald animate-spin" /></div>;
  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-14 text-center">
        <p className="text-muted mb-4">Your profile isn&apos;t available yet.</p>
        <Link href="/sign-in"><Button>Sign in</Button></Link>
      </div>
    );
  }

  const def = getAccountTypeDef(profile.account_type);

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/studio/me" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-5">
        <ArrowLeft className="size-3" /> My studio
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
            <UserIcon className="size-3.5" /> Profile
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
            Your profile across the platform.
          </h1>
          <p className="mt-3 text-muted max-w-2xl leading-relaxed">
            This is how you appear to other members. Set it public to be discoverable in the People directory, or keep it private until you&apos;re ready.
          </p>
        </div>
        {profile.slug && profile.is_public && (
          <Link href={`/people/${profile.slug}`} target="_blank" className="text-xs text-emerald hover:underline inline-flex items-center gap-1.5">
            View public page <ExternalLink className="size-3" />
          </Link>
        )}
      </div>

      {err && (
        <div className="mb-5 rounded-xl border border-rust/30 bg-rust/5 px-4 py-3 text-sm text-rust flex items-center gap-2">
          <AlertCircle className="size-4" /> {err}
        </div>
      )}

      <div className="space-y-5">
        {/* Account type */}
        <Card className="p-5">
          <h2 className="text-sm font-medium mb-1">Account type</h2>
          <p className="text-xs text-muted mb-4">Affects what you see across the platform and what other members see about you. You can change it any time.</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {ACCOUNT_TYPES.map((t) => {
              const active = profile.account_type === t.type;
              return (
                <button
                  key={t.type}
                  onClick={() => patch("account_type", t.type as AccountType)}
                  className={`text-left p-3 rounded-xl border transition ${active ? "border-emerald bg-emerald/10" : "border-border hover:border-muted hover:bg-surface-2"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{t.emoji}</span>
                    <span className="text-sm font-medium">{t.label}</span>
                  </div>
                  <p className="text-[11px] text-muted mt-1 leading-snug">{t.oneLiner}</p>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Basic identity */}
        <Card className="p-5">
          <h2 className="text-sm font-medium mb-3">Who you are</h2>
          <div className="space-y-4">
            <Labeled label="Display name">
              <Input value={profile.display_name} onChange={(e) => patch("display_name", e.target.value)} placeholder="Your full name" />
            </Labeled>
            <Labeled label="Headline" hint="One line. Appears below your name on your public profile.">
              <Input value={profile.headline} onChange={(e) => patch("headline", e.target.value)} placeholder="e.g. Building cold-chain logistics across West Africa" maxLength={160} />
            </Labeled>
            <Labeled label="Bio" hint="A few sentences. Shows on your public profile.">
              <Textarea value={profile.bio} onChange={(e) => patch("bio", e.target.value)} rows={4} placeholder="What you're working on, where you've been, what you care about." maxLength={2000} />
            </Labeled>
            <div className="grid grid-cols-2 gap-3">
              <Labeled label="Country"><Input value={profile.country} onChange={(e) => patch("country", e.target.value)} /></Labeled>
              <Labeled label="City"><Input value={profile.city} onChange={(e) => patch("city", e.target.value)} /></Labeled>
            </div>
            <Labeled label="Primary language">
              <Input value={profile.primary_language} onChange={(e) => patch("primary_language", e.target.value)} />
            </Labeled>
          </div>
        </Card>

        {/* Persona-specific */}
        <PersonaEditor profile={profile} patchPersona={patchPersona} />

        {/* Links */}
        <Card className="p-5">
          <h2 className="text-sm font-medium mb-3">Links</h2>
          <div className="space-y-3">
            <Labeled label="Website"><Input value={profile.website_url ?? ""} onChange={(e) => patch("website_url", e.target.value || null)} placeholder="https://" /></Labeled>
            <Labeled label="LinkedIn"><Input value={profile.linkedin_url ?? ""} onChange={(e) => patch("linkedin_url", e.target.value || null)} placeholder="https://linkedin.com/in/…" /></Labeled>
            <Labeled label="X / Twitter"><Input value={profile.twitter_url ?? ""} onChange={(e) => patch("twitter_url", e.target.value || null)} placeholder="https://x.com/…" /></Labeled>
            <Labeled label="Avatar URL" hint="A square image. We'll round it.">
              <Input value={profile.avatar_url ?? ""} onChange={(e) => patch("avatar_url", e.target.value || null)} placeholder="https://" />
            </Labeled>
          </div>
        </Card>

        {/* Trust + verification */}
        <VerificationSection />

        {/* Discovery + contact policy */}
        <Card className="p-5">
          <h2 className="text-sm font-medium mb-3">Visibility</h2>
          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={profile.is_public}
                onChange={(e) => patch("is_public", e.target.checked)}
                className="mt-1 size-4 accent-emerald"
              />
              <div>
                <div className="text-sm">Show me in the public People directory</div>
                <p className="text-[11px] text-muted leading-snug">When on, you appear at /people and your profile is reachable at /people/{profile.slug ?? "(generated on first save)"}. When off, only you can see it.</p>
              </div>
            </label>
            <div>
              <div className="text-xs uppercase tracking-widest text-muted mb-2">Contact policy</div>
              <div className="grid sm:grid-cols-3 gap-2">
                {([
                  { v: "open", label: "Open", desc: "Any signed-in member can DM or invite you" },
                  { v: "institution", label: "Same institution only", desc: "Only members of your institution" },
                  { v: "closed", label: "Closed", desc: "No inbound DMs or invites" },
                ] as const).map((o) => {
                  const active = profile.contact_policy === o.v;
                  return (
                    <button
                      key={o.v}
                      onClick={() => patch("contact_policy", o.v)}
                      className={`text-left p-3 rounded-xl border text-xs transition ${active ? "border-emerald bg-emerald/10" : "border-border hover:border-muted hover:bg-surface-2"}`}
                    >
                      <div className="font-medium text-sm">{o.label}</div>
                      <p className="text-[11px] text-muted leading-snug mt-0.5">{o.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        <div className="flex items-center gap-3 justify-end pt-2">
          {saved && <span className="text-xs text-emerald inline-flex items-center gap-1"><CheckCircle2 className="size-3" /> Saved</span>}
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save profile
          </Button>
        </div>

        <p className="text-[11px] text-muted text-center pt-2">
          You signed up as {def.emoji} <strong className="text-foreground">{def.label}</strong>. You can switch at any time — your data carries over.
        </p>
      </div>
    </div>
  );
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-muted mb-1.5">{label}</div>
      {children}
      {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </label>
  );
}

function PersonaEditor({ profile, patchPersona }: { profile: UserProfile; patchPersona: (key: string, value: unknown) => void }) {
  const p = profile.persona_data ?? {};

  function CSV({ label, k, placeholder, hint }: { label: string; k: string; placeholder?: string; hint?: string }) {
    const value = Array.isArray(p[k]) ? (p[k] as string[]).join(", ") : "";
    return (
      <Labeled label={label} hint={hint}>
        <Input
          value={value}
          onChange={(e) => patchPersona(k, e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
          placeholder={placeholder}
        />
      </Labeled>
    );
  }

  function Single({ label, k, placeholder, hint, type = "text" }: { label: string; k: string; placeholder?: string; hint?: string; type?: "text" | "number" | "url" }) {
    const raw = p[k];
    const value = raw == null ? "" : String(raw);
    return (
      <Labeled label={label} hint={hint}>
        <Input
          value={value}
          type={type}
          onChange={(e) => {
            const v = e.target.value;
            patchPersona(k, type === "number" ? (v === "" ? undefined : Number(v)) : v);
          }}
          placeholder={placeholder}
        />
      </Labeled>
    );
  }

  switch (profile.account_type) {
    case "mentor":
      return (
        <Card className="p-5">
          <h2 className="text-sm font-medium mb-1">Mentor details</h2>
          <p className="text-xs text-muted mb-4">Founders use these to filter mentors who actually fit their stage and sector.</p>
          <div className="space-y-3">
            <CSV label="Expertise" k="expertise" placeholder="e.g. distribution, B2B SaaS, fundraising, hiring" />
            <CSV label="Sectors" k="sectors" placeholder="e.g. fintech, agritech, healthtech" />
            <Single label="Years of experience" k="yearsExperience" type="number" placeholder="e.g. 8" />
            <Labeled label="Availability">
              <select
                value={String(p.availability ?? "both")}
                onChange={(e) => patchPersona("availability", e.target.value)}
                className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald w-full"
              >
                <option value="paid">Paid only</option>
                <option value="pro-bono">Pro-bono only</option>
                <option value="both">Both — case by case</option>
              </select>
            </Labeled>
            <Single label="Hourly rate (USD)" k="hourlyRate" type="number" placeholder="leave blank for pro-bono" />
            <CSV label="Past ventures" k="pastVentures" placeholder="e.g. Paystack (founding eng), Andela (early PM)" />
          </div>
        </Card>
      );
    case "investor":
      return (
        <Card className="p-5">
          <h2 className="text-sm font-medium mb-1">Investor details</h2>
          <p className="text-xs text-muted mb-4">Helps founders know whether you&apos;re the right fit before they reach out.</p>
          <div className="space-y-3">
            <Single label="Firm / fund (optional for angels)" k="firmName" placeholder="e.g. Ventures Platform, Angel" />
            <CSV label="Sectors of interest" k="sectors" placeholder="e.g. fintech, climate, healthtech" />
            <CSV label="Stages you back" k="stages" placeholder="e.g. pre-seed, seed, Series A" />
            <Single label="Typical check size (USD)" k="typicalCheckSize" type="number" placeholder="e.g. 50000" />
          </div>
        </Card>
      );
    case "funder":
      return (
        <Card className="p-5">
          <h2 className="text-sm font-medium mb-1">Program / grant details</h2>
          <div className="space-y-3">
            <Single label="Program name" k="programName" placeholder="e.g. Mozilla Builders Fellowship" />
            <CSV label="Focus areas" k="focusAreas" placeholder="e.g. African languages NLP, climate adaptation" />
            <Single label="Application URL" k="applicationUrl" type="url" placeholder="https://" />
            <Single label="Funding range" k="fundingRange" placeholder="e.g. $5k–$50k non-dilutive grants" />
          </div>
        </Card>
      );
    case "instructor":
      return (
        <Card className="p-5">
          <h2 className="text-sm font-medium mb-1">Instructor details</h2>
          <div className="space-y-3">
            <Single label="Institution" k="institution" placeholder="e.g. KNUST, UCT" />
            <Single label="Department" k="department" placeholder="e.g. School of Business" />
            <CSV label="Courses you teach" k="courses" placeholder="e.g. Entrepreneurship 401, AI for Founders" />
          </div>
        </Card>
      );
    case "journalist":
      return (
        <Card className="p-5">
          <h2 className="text-sm font-medium mb-1">Journalist details</h2>
          <div className="space-y-3">
            <Single label="Outlet" k="outletName" placeholder="e.g. TechCabal, Rest of World, freelance" />
            <CSV label="Beats" k="beats" placeholder="e.g. African fintech, climate, founder profiles" />
          </div>
        </Card>
      );
    case "institution":
      return (
        <Card className="p-5">
          <h2 className="text-sm font-medium mb-1">Institution details</h2>
          <div className="space-y-3">
            <Single label="Institution name" k="name" placeholder="e.g. African Leadership University" />
            <Labeled label="Kind">
              <select
                value={String(p.kind ?? "university")}
                onChange={(e) => patchPersona("kind", e.target.value)}
                className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald w-full"
              >
                <option value="university">University</option>
                <option value="accelerator">Accelerator</option>
                <option value="bootcamp">Bootcamp</option>
                <option value="school">Secondary school</option>
                <option value="other">Other</option>
              </select>
            </Labeled>
            <Single label="Partner since" k="partnersSince" placeholder="e.g. 2025" />
          </div>
        </Card>
      );
    case "student":
      return (
        <Card className="p-5">
          <h2 className="text-sm font-medium mb-1">Student details</h2>
          <div className="space-y-3">
            <Single label="Institution" k="institution" placeholder="e.g. KNUST, UNILAG" />
            <Single label="Field of study" k="field" placeholder="e.g. Agricultural Engineering" />
            <Single label="Year of study" k="year" type="number" placeholder="1–5" />
          </div>
        </Card>
      );
    default:
      return null;
  }
}

// Trust / verification panel on the editor. Shows current verifications
// (institution email = primary v2 path) and lets the user start a new
// one. Sends a magic link to the chosen email; the /verify/[token]
// landing page handles the claim.
function VerificationSection() {
  const [list, setList] = useState<Verification[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function load() {
    const r = await profileApi.listMyVerifications();
    if (r.ok) setList(r.results);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const verifiedInstitution = list.find((v) => v.kind === "email_institution" && v.status === "verified");
  const pendingInstitution = list.find((v) => v.kind === "email_institution" && v.status === "pending");

  async function startInstitution() {
    if (!email.trim() || busy) return;
    setBusy(true); setErr(null); setSentTo(null);
    const r = await profileApi.startInstitutionVerification(email.trim());
    setBusy(false);
    if (!r.ok) {
      setErr(r.error === "not_institutional"
        ? "That doesn't look institutional. Use the email your university or program gave you (e.g. ending in .edu, .ac.uk, .edu.gh)."
        : "Couldn't send. Try again.");
      return;
    }
    setSentTo(email.trim());
    void load();
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-medium mb-1 flex items-center gap-2">
        <BadgeCheck className="size-4 text-emerald" /> Trust + verification
      </h2>
      <p className="text-xs text-muted mb-4">
        Verified profiles carry a badge that other members can see. Founders are more likely to accept your outreach when you&apos;re verified.
      </p>

      {loading ? (
        <div className="text-xs text-muted">Loading…</div>
      ) : verifiedInstitution ? (
        <div className="rounded-xl border border-emerald/30 bg-emerald/5 p-4">
          <div className="flex items-center gap-2 text-sm text-emerald font-medium">
            <BadgeCheck className="size-4" /> Institution email verified
          </div>
          <p className="text-xs text-muted mt-1">
            <span className="text-foreground">{String(verifiedInstitution.evidence.email ?? "")}</span>
            {verifiedInstitution.evidence.institutionLabel ? <> · {String(verifiedInstitution.evidence.institutionLabel)}</> : null}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingInstitution && !sentTo && (
            <p className="text-xs text-amber">
              You have a pending verification for <span className="text-foreground">{String(pendingInstitution.evidence.email ?? "")}</span> — check that inbox.
            </p>
          )}
          {sentTo && (
            <div className="rounded-xl border border-emerald/30 bg-emerald/5 p-3 text-xs text-emerald">
              Check your inbox at <span className="text-foreground font-mono">{sentTo}</span> — the link expires in 24 hours.
            </div>
          )}
          <Labeled label="Institutional email" hint="Use the address your university, program, or organization issued you.">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourschool.edu" />
          </Labeled>
          {err && <p className="text-xs text-rust">{err}</p>}
          <div className="flex justify-end">
            <Button size="sm" onClick={startInstitution} disabled={!email.trim() || busy}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />} Send verification email
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
