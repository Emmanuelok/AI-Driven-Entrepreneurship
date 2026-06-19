"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { orgApi, type Organization, type OrganizationKind } from "@/lib/org-api";
import { Card, Button, Input, Textarea, Badge, Dialog } from "@/components/ui";
import { VerifiedBadgeBool } from "@/components/verified-badge";
import { Building2, Plus, Users, ArrowRight, Loader2, Sparkles, Globe2 } from "lucide-react";

// /studio/orgs — the landing for the Organizations layer.
//
// Two sections: orgs I own / am a member of (the primary list), and
// a discovery strip of public orgs I'm not in. The Create dialog
// opens straight into the wizard for a new org.

const KIND_LABELS: Record<OrganizationKind, string> = {
  university: "University",
  accelerator: "Accelerator",
  bootcamp: "Bootcamp",
  school: "School",
  program: "Program / fellowship",
  other: "Other",
};

const KIND_EMOJI: Record<OrganizationKind, string> = {
  university: "🏛️",
  accelerator: "🚀",
  bootcamp: "🏕️",
  school: "🏫",
  program: "🌱",
  other: "🏢",
};

export default function OrganizationsPage() {
  const router = useRouter();
  const [mine, setMine] = useState<Organization[]>([]);
  const [pub, setPub] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function load() {
    const r = await orgApi.list({ includePublic: true });
    if (r.ok) { setMine(r.mine); setPub(r.public); }
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="flex items-end justify-between gap-3 flex-wrap mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
            <Building2 className="size-3.5" /> Organizations
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
            Run cohorts under your institution.
          </h1>
          <p className="mt-3 text-muted max-w-2xl leading-relaxed">
            An Organization is the parent for universities, accelerators, bootcamps, and fellowship programs that want to run cohorts on Sankofa. Invite admin staff and instructors, run multiple cohorts side-by-side, see aggregate progress across the whole program.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="size-4" /> New organization</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-emerald animate-spin" /></div>
      ) : (
        <>
          <section className="mb-10">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold mb-3 flex items-center gap-2">
              Your organizations
              {mine.length > 0 && <span className="text-xs text-muted font-normal">({mine.length})</span>}
            </h2>
            {mine.length === 0 ? (
              <Card className="p-8 text-center">
                <Sparkles className="size-8 text-emerald mx-auto mb-3" />
                <p className="text-muted leading-relaxed max-w-md mx-auto mb-4">
                  You don&apos;t belong to an organization yet. If you run a university program, an accelerator cohort, or a fellowship — create one to start managing it here.
                </p>
                <Button onClick={() => setCreating(true)}><Plus className="size-4" /> Create the first one</Button>
              </Card>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {mine.map((o) => <OrgCard key={o.id} org={o} />)}
              </div>
            )}
          </section>

          {pub.length > 0 && (
            <section>
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold mb-3 flex items-center gap-2">
                <Globe2 className="size-4 text-amber" /> Public organizations
              </h2>
              <p className="text-sm text-muted mb-4">
                Universities and programs that have opened a public page. Visit one to see who&apos;s building under their banner.
              </p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {pub.map((o) => <OrgCard key={o.id} org={o} isPublic />)}
              </div>
            </section>
          )}
        </>
      )}

      <Dialog open={creating} onClose={() => setCreating(false)} title="New organization">
        <CreateForm onCreated={(o) => { setCreating(false); router.push(`/studio/orgs/${o.id}`); }} />
      </Dialog>
    </div>
  );
}

function OrgCard({ org, isPublic = false }: { org: Organization; isPublic?: boolean }) {
  const href = isPublic ? `/o/${org.slug}` : `/studio/orgs/${org.id}`;
  return (
    <Link href={href} className="block group">
      <Card className="p-5 h-full hover:border-emerald/40 transition flex flex-col">
        <div className="flex items-start gap-3">
          <div className="size-12 rounded-2xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-2xl shrink-0">
            {KIND_EMOJI[org.kind]}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium leading-tight group-hover:text-emerald transition truncate inline-flex items-center gap-1.5">
              <span className="truncate">{org.name}</span>
              <VerifiedBadgeBool verified={org.is_verified} size="xs" />
            </h3>
            <p className="text-[11px] text-muted mt-0.5 truncate">
              {KIND_LABELS[org.kind]}{(org.country || org.city) ? ` · ${[org.city, org.country].filter(Boolean).join(", ")}` : ""}
            </p>
          </div>
        </div>
        {org.description && <p className="mt-3 text-sm text-muted leading-relaxed line-clamp-3">{org.description}</p>}
        <div className="mt-auto pt-3 flex items-center justify-between text-[11px] text-muted">
          {org.myRole ? (
            <Badge color={org.myRole === "owner" ? "amber" : org.myRole === "admin" ? "indigo" : "muted"}>{org.myRole}</Badge>
          ) : (
            <span className="inline-flex items-center gap-1"><Users className="size-3" /> public</span>
          )}
          <ArrowRight className="size-3 opacity-0 group-hover:opacity-100 transition" />
        </div>
      </Card>
    </Link>
  );
}

function CreateForm({ onCreated }: { onCreated: (o: Organization) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<OrganizationKind>("university");
  const [description, setDescription] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [website, setWebsite] = useState("");
  const [institutionDomain, setInstitutionDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setErr(null);
    const r = await orgApi.create({
      name: name.trim(),
      kind,
      description: description.trim() || undefined,
      country: country.trim() || undefined,
      city: city.trim() || undefined,
      website_url: website.trim() || undefined,
      institution_domain: institutionDomain.trim() || undefined,
    });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onCreated(r.organization);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted leading-relaxed">
        You&apos;ll be the owner. You can invite admins and instructors after creation; cohorts get added one-by-one from the dashboard.
      </p>
      <Field label="Organization name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. KNUST Entrepreneurship Centre" autoFocus maxLength={120} />
      </Field>
      <Field label="Kind">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as OrganizationKind)}
          className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald w-full"
        >
          {(Object.keys(KIND_LABELS) as OrganizationKind[]).map((k) => (
            <option key={k} value={k}>{KIND_EMOJI[k]} {KIND_LABELS[k]}</option>
          ))}
        </select>
      </Field>
      <Field label="What you do" hint="One or two sentences — shown on your public page.">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={2000} placeholder="We run a 12-week venture program for final-year engineering students…" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Country"><Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Ghana" /></Field>
        <Field label="City"><Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Kumasi" /></Field>
      </div>
      <Field label="Website" hint="Optional.">
        <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.edu" />
      </Field>
      <Field label="Institution email domain" hint="Optional. When set, your verified institution email (if it matches) earns this org the verified badge.">
        <Input value={institutionDomain} onChange={(e) => setInstitutionDomain(e.target.value)} placeholder="knust.edu.gh" />
      </Field>
      {err && <p className="text-xs text-rust">{err}</p>}
      <div className="flex justify-end">
        <Button onClick={submit} disabled={!name.trim() || busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Create organization
        </Button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-widest text-muted mb-1.5">{label}</div>
      {children}
      {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </label>
  );
}
