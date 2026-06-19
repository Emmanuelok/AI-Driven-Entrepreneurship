"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { orgApi, clientHasOrgRole, type Organization, type OrganizationMember, type OrganizationInvite, type OrganizationKind, type OrganizationRole } from "@/lib/org-api";
import { Card, Button, Input, Textarea, Dialog, Badge } from "@/components/ui";
import { VerifiedBadgeBool } from "@/components/verified-badge";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, Loader2, Building2, Users, Settings as SettingsIcon, Plus, Copy, Check, Trash2, AlertCircle, ExternalLink, LayoutDashboard, MailPlus, Globe, BadgeCheck, Archive } from "lucide-react";

// /studio/orgs/[id] — the admin dashboard for an organization.
//
// Tabs: Overview · Members · Invites · Settings. The visibility of
// each tab respects the caller's role: observers see Overview only;
// staff + instructor add Members; admins add Invites + Settings;
// owner adds the delete button to Settings.

type Tab = "overview" | "members" | "invites" | "settings";

export default function OrgDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const [org, setOrg] = useState<Organization | null>(null);
  const [myRole, setMyRole] = useState<OrganizationRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  async function loadOrg() {
    const r = await orgApi.get(id);
    if (!r.ok) { setMissing(true); setLoading(false); return; }
    setOrg(r.organization);
    setMyRole(r.myRole);
    setLoading(false);
  }
  useEffect(() => { void loadOrg(); }, [id]);

  if (loading) return <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="size-6 text-emerald animate-spin" /></div>;
  if (missing || !org) { notFound(); return null; }

  const isOwner = myRole === "owner";
  const isAdmin = clientHasOrgRole(myRole, "admin");
  const canInvite = isAdmin;
  const canSettings = isAdmin;

  const tabs = ([
    { id: "overview" as const, label: "Overview", show: true, Icon: LayoutDashboard },
    { id: "members" as const, label: "Members", show: true, Icon: Users },
    { id: "invites" as const, label: "Invites", show: canInvite, Icon: MailPlus },
    { id: "settings" as const, label: "Settings", show: canSettings, Icon: SettingsIcon },
  ] satisfies Array<{ id: Tab; label: string; show: boolean; Icon: typeof Building2 }>).filter((t) => t.show);

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/studio/orgs" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-4">
        <ArrowLeft className="size-3" /> All organizations
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
        <div className="flex items-start gap-4 min-w-0">
          {org.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logo_url} alt="" className="size-20 rounded-3xl object-cover" />
          ) : (
            <div className="size-20 rounded-3xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-bold text-3xl shadow-xl shadow-emerald/20 shrink-0">
              {org.name[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-1 flex items-center gap-1.5">
              <Building2 className="size-3.5" /> {org.kind}
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight inline-flex items-center gap-2 flex-wrap">
              <span>{org.name}</span>
              <VerifiedBadgeBool verified={org.is_verified} size="md" />
            </h1>
            <div className="mt-2 text-muted flex items-center gap-2 flex-wrap text-sm">
              {[org.city, org.country].filter(Boolean).join(", ") || <span className="text-muted/60">No location set</span>}
              {org.website_url && (
                <a href={org.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-emerald hover:underline">
                  <Globe className="size-3" /> Website
                </a>
              )}
              {myRole && <Badge color={myRole === "owner" ? "amber" : myRole === "admin" ? "indigo" : "muted"}>You: {myRole}</Badge>}
              {org.is_public && org.slug && (
                <Link href={`/o/${org.slug}`} target="_blank" className="text-xs text-emerald hover:underline inline-flex items-center gap-1">
                  Public page <ExternalLink className="size-3" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border mb-6 overflow-x-auto">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition flex items-center gap-1.5 whitespace-nowrap ${active ? "border-emerald text-foreground" : "border-transparent text-muted hover:text-foreground"}`}
            >
              <t.Icon className="size-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && <OverviewTab org={org} />}
      {tab === "members" && <MembersTab orgId={org.id} myRole={myRole!} ownerId={org.owner_user_id} />}
      {tab === "invites" && canInvite && <InvitesTab orgId={org.id} />}
      {tab === "settings" && canSettings && (
        <SettingsTab
          org={org}
          isOwner={isOwner}
          onChanged={loadOrg}
          onDeleted={() => router.push("/studio/orgs")}
        />
      )}
    </div>
  );
}

/* ─── Overview ─── */
function OverviewTab({ org }: { org: Organization }) {
  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <Card className="p-5 lg:col-span-2">
        <h2 className="text-sm font-medium mb-3">About</h2>
        {org.description ? (
          <p className="text-foreground/95 leading-relaxed whitespace-pre-wrap">{org.description}</p>
        ) : (
          <p className="text-muted italic text-sm">No description yet. Add one in Settings so prospective members understand what you do.</p>
        )}
      </Card>
      <Card className="p-5">
        <h2 className="text-sm font-medium mb-3 flex items-center gap-2">
          <BadgeCheck className="size-4 text-emerald" /> Trust
        </h2>
        {org.is_verified ? (
          <p className="text-sm text-emerald">This organization is verified.</p>
        ) : (
          <>
            <p className="text-xs text-muted leading-relaxed mb-2">
              Verify the org by setting its institution email domain (e.g. <code>knust.edu.gh</code>) AND verifying your own institutional email (Profile → Trust + verification). When both match, the verified badge turns on automatically.
            </p>
            <Link href="/studio/profile" className="text-xs text-emerald hover:underline">Open your profile →</Link>
          </>
        )}
      </Card>
      <Card className="p-5 lg:col-span-3 bg-gradient-to-br from-emerald/5 to-amber/5">
        <h2 className="text-sm font-medium mb-2">Cohorts under this organization</h2>
        <p className="text-xs text-muted leading-relaxed mb-4">
          Run cohorts under this organization to give them your brand, share admin staff, and roll their progress up to the org dashboard.
        </p>
        <p className="text-xs text-muted italic">Cohorts are stitched into the org in Phase 56.</p>
      </Card>
    </div>
  );
}

/* ─── Members ─── */
function MembersTab({ orgId, myRole, ownerId }: { orgId: string; myRole: OrganizationRole; ownerId: string }) {
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const canManage = clientHasOrgRole(myRole, "admin");

  async function load() {
    const r = await orgApi.listMembers(orgId);
    if (r.ok) setMembers(r.members);
    setLoading(false);
  }
  useEffect(() => { void load(); }, [orgId]);

  async function setRole(userId: string, role: Exclude<OrganizationRole, "owner">) {
    setBusy(userId);
    await orgApi.setMemberRole(orgId, userId, role);
    await load();
    setBusy(null);
  }

  async function remove(userId: string) {
    if (!confirm("Remove this member? They lose access to the organization immediately.")) return;
    setBusy(userId);
    await orgApi.removeMember(orgId, userId);
    await load();
    setBusy(null);
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="size-6 text-emerald animate-spin" /></div>;

  return (
    <Card className="p-5">
      <h2 className="text-sm font-medium mb-4 flex items-center gap-2">
        <Users className="size-4 text-emerald" /> {members.length + 1} member{members.length === 0 ? "" : "s"}
      </h2>
      <ul className="divide-y divide-border">
        {/* Owner row (denormalized — they may not have a members row) */}
        <li className="py-3 flex items-center gap-3">
          <div className="size-9 rounded-xl bg-gradient-to-br from-amber to-rust flex items-center justify-center text-black font-semibold text-xs shrink-0">
            O
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Organization owner</div>
            <div className="text-xs text-muted truncate">user · {ownerId.slice(0, 8)}…</div>
          </div>
          <Badge color="amber">owner</Badge>
        </li>
        {members.filter((m) => m.user_id !== ownerId).map((m) => (
          <li key={m.user_id} className="py-3 flex items-center gap-3">
            <div className="size-9 rounded-xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-semibold text-xs shrink-0">
              {(m.display_name || m.email || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{m.display_name || m.email || "Unnamed member"}</div>
              <div className="text-xs text-muted truncate">
                {m.email ?? "no email"} · joined {formatDistanceToNow(new Date(m.joined_at))} ago
              </div>
            </div>
            {canManage ? (
              <>
                <select
                  value={m.role}
                  disabled={busy === m.user_id}
                  onChange={(e) => void setRole(m.user_id, e.target.value as Exclude<OrganizationRole, "owner">)}
                  className="bg-surface-2 border border-border rounded-lg px-2 py-1 text-xs outline-none focus:border-emerald"
                >
                  <option value="observer">observer</option>
                  <option value="staff">staff</option>
                  <option value="instructor">instructor</option>
                  <option value="admin">admin</option>
                </select>
                <button
                  onClick={() => void remove(m.user_id)}
                  disabled={busy === m.user_id}
                  className="size-7 rounded-lg text-muted hover:text-rust hover:bg-rust/10 flex items-center justify-center transition"
                  title="Remove member"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </>
            ) : (
              <Badge color="muted">{m.role}</Badge>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ─── Invites ─── */
function InvitesTab({ orgId }: { orgId: string }) {
  const [invites, setInvites] = useState<OrganizationInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    const r = await orgApi.listInvites(orgId);
    if (r.ok) setInvites(r.results);
    setLoading(false);
  }
  useEffect(() => { void load(); }, [orgId]);

  function copyLink(token: string) {
    const url = `${window.location.origin}/org-invite/${token}`;
    navigator.clipboard.writeText(url);
    setCopied(token);
    setTimeout(() => setCopied(null), 1800);
  }

  async function revoke(inviteId: string) {
    if (!confirm("Revoke this invite? Anyone holding the link can no longer redeem it.")) return;
    await orgApi.revokeInvite(orgId, inviteId);
    await load();
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <MailPlus className="size-4 text-emerald" /> {invites.length} pending invite{invites.length === 1 ? "" : "s"}
        </h2>
        <Button size="sm" onClick={() => setCreating(true)}><Plus className="size-3.5" /> New invite</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="size-5 text-emerald animate-spin" /></div>
      ) : invites.length === 0 ? (
        <p className="text-sm text-muted italic">No pending invites. Create one to add staff or instructors.</p>
      ) : (
        <ul className="divide-y divide-border">
          {invites.map((i) => (
            <li key={i.id} className="py-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    {i.email ? <><span className="font-medium">{i.email}</span><span className="text-muted"> · single-use</span></> : <span className="font-medium">Share link</span>}
                  </div>
                  <div className="text-xs text-muted">
                    role: {i.role} · {i.uses}/{i.max_uses} used · expires {formatDistanceToNow(new Date(i.expires_at))} from now
                  </div>
                </div>
                <button
                  onClick={() => copyLink(i.token)}
                  className="text-xs inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-border hover:border-emerald/40 hover:bg-emerald/5 transition"
                >
                  {copied === i.token ? <><Check className="size-3 text-emerald" /> Copied</> : <><Copy className="size-3" /> Copy link</>}
                </button>
                <button
                  onClick={() => void revoke(i.id)}
                  className="size-7 rounded-lg text-muted hover:text-rust hover:bg-rust/10 flex items-center justify-center transition"
                  title="Revoke invite"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={creating} onClose={() => setCreating(false)} title="New invite">
        <NewInviteForm orgId={orgId} onCreated={() => { setCreating(false); void load(); }} />
      </Dialog>
    </Card>
  );
}

function NewInviteForm({ orgId, onCreated }: { orgId: string; onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<OrganizationRole, "owner">>("staff");
  const [linkShare, setLinkShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    const r = await orgApi.createInvite(orgId, {
      email: linkShare ? null : email.trim() || null,
      role,
    });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onCreated();
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={linkShare} onChange={(e) => setLinkShare(e.target.checked)} className="accent-emerald" />
        Link-share invite (no specific email)
      </label>
      {!linkShare && (
        <label className="block">
          <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Email</div>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="instructor@example.edu" />
        </label>
      )}
      <label className="block">
        <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Role</div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Exclude<OrganizationRole, "owner">)}
          className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald w-full"
        >
          <option value="observer">observer — read-only auditing</option>
          <option value="staff">staff — support, can view roster</option>
          <option value="instructor">instructor — can run cohorts</option>
          <option value="admin">admin — full org management</option>
        </select>
      </label>
      {err && <p className="text-xs text-rust">{err}</p>}
      <div className="flex justify-end">
        <Button onClick={submit} disabled={busy || (!linkShare && !email.trim())}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Create invite
        </Button>
      </div>
    </div>
  );
}

/* ─── Settings ─── */
function SettingsTab({ org, isOwner, onChanged, onDeleted }: {
  org: Organization;
  isOwner: boolean;
  onChanged: () => Promise<void>;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(org.name);
  const [kind, setKind] = useState<OrganizationKind>(org.kind);
  const [description, setDescription] = useState(org.description);
  const [country, setCountry] = useState(org.country);
  const [city, setCity] = useState(org.city);
  const [logoUrl, setLogoUrl] = useState(org.logo_url ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(org.website_url ?? "");
  const [institutionDomain, setInstitutionDomain] = useState(org.institution_domain ?? "");
  const [isPublic, setIsPublic] = useState(org.is_public);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    const r = await orgApi.patch(org.id, {
      name,
      kind,
      description,
      country,
      city,
      logo_url: logoUrl || null,
      website_url: websiteUrl || null,
      institution_domain: institutionDomain || null,
      is_public: isPublic,
    });
    setSaving(false);
    if (!r.ok) { setErr(r.error); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    await onChanged();
  }

  async function destroy() {
    if (!confirm(`Delete "${org.name}"? Cohorts under this org will become orphan (they'll still exist, just without an org parent). This cannot be undone.`)) return;
    const r = await orgApi.delete(org.id);
    if (r.ok) onDeleted();
  }

  return (
    <div className="space-y-5">
      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-medium mb-1">Organization profile</h2>
        <Labeled label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Labeled>
        <Labeled label="Kind">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as OrganizationKind)}
            className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald w-full"
          >
            <option value="university">University</option>
            <option value="accelerator">Accelerator</option>
            <option value="bootcamp">Bootcamp</option>
            <option value="school">School</option>
            <option value="program">Program / fellowship</option>
            <option value="other">Other</option>
          </select>
        </Labeled>
        <Labeled label="Description" hint="Shows on your public page.">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={2000} />
        </Labeled>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Country"><Input value={country} onChange={(e) => setCountry(e.target.value)} /></Labeled>
          <Labeled label="City"><Input value={city} onChange={(e) => setCity(e.target.value)} /></Labeled>
        </div>
        <Labeled label="Logo URL"><Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://" /></Labeled>
        <Labeled label="Website URL"><Input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://" /></Labeled>
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-medium mb-1">Trust + discovery</h2>
        <Labeled label="Institution email domain" hint="Setting this enables auto-verification when the owner has a verified institutional email matching this domain.">
          <Input value={institutionDomain} onChange={(e) => setInstitutionDomain(e.target.value)} placeholder="knust.edu.gh" />
        </Labeled>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="mt-1 size-4 accent-emerald" />
          <div>
            <div className="text-sm">Show this organization on its public page</div>
            <p className="text-[11px] text-muted leading-snug">
              When on, anyone can visit /o/{org.slug} and see your description, location, and public cohorts. When off, only members can read the org.
            </p>
          </div>
        </label>
      </Card>

      {err && <div className="rounded-xl border border-rust/30 bg-rust/5 px-4 py-3 text-sm text-rust flex items-center gap-2"><AlertCircle className="size-4" /> {err}</div>}

      <div className="flex items-center gap-3 justify-end">
        {saved && <span className="text-xs text-emerald inline-flex items-center gap-1"><Check className="size-3" /> Saved</span>}
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <SettingsIcon className="size-4" />} Save settings
        </Button>
      </div>

      {isOwner && (
        <Card className="p-5 border-rust/30 bg-rust/5">
          <h2 className="text-sm font-medium mb-1 flex items-center gap-2 text-rust"><Archive className="size-4" /> Danger zone</h2>
          <p className="text-xs text-muted leading-relaxed mb-3">
            Deleting this organization removes the org itself, all members, and all pending invites. Cohorts under this org become orphan (organization_id → null) but stay intact for their owner.
          </p>
          <Button variant="ghost" onClick={destroy}>
            <Trash2 className="size-4" /> Delete organization
          </Button>
        </Card>
      )}
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
