"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { orgApi, type Organization, type OrganizationRole } from "@/lib/org-api";
import { supabaseBrowser } from "@/lib/supabase";
import { Card, Button, Badge } from "@/components/ui";
import { VerifiedBadgeBool } from "@/components/verified-badge";
import { Building2, Loader2, AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";

// /org-invite/[token] — landing page for organization invites.
// Mirrors /i/[token] (workspace invite). Unauthenticated visitors see
// the org preview + sign-in CTA; authenticated visitors get a Join
// button that POSTs to claim the invite.

type Phase = "loading" | "preview" | "joined" | "expired" | "exhausted" | "not_found" | "error";

export default function OrgInviteLandingPage({ params }: { params: Promise<{ token: string }> }) {
  const router = useRouter();
  const { token } = use(params);
  const [phase, setPhase] = useState<Phase>("loading");
  const [org, setOrg] = useState<Organization | null>(null);
  const [role, setRole] = useState<OrganizationRole | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [alreadyMember, setAlreadyMember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [emailMismatch, setEmailMismatch] = useState(false);

  async function load() {
    const sb = supabaseBrowser();
    let authed = false;
    if (sb) {
      const { data } = await sb.auth.getSession();
      authed = !!data.session;
    }
    setSignedIn(authed);
    const r = await orgApi.peekInvite(token, authed);
    if (!r.ok) {
      if (r.error === "expired") setPhase("expired");
      else if (r.error === "exhausted") setPhase("exhausted");
      else if (r.error === "not_found") setPhase("not_found");
      else setPhase("error");
      return;
    }
    setOrg(r.organization as unknown as Organization);
    setRole(r.invite.role);
    setAlreadyMember(r.alreadyMember);
    setPhase("preview");
  }
  useEffect(() => { void load(); }, [token]);

  async function join() {
    if (!signedIn) {
      router.push(`/sign-in?next=${encodeURIComponent(`/org-invite/${token}`)}`);
      return;
    }
    setBusy(true);
    const r = await orgApi.claimInvite(token);
    setBusy(false);
    if (!r.ok) { setPhase("error"); return; }
    setEmailMismatch(!!r.emailMismatch);
    setPhase("joined");
    setTimeout(() => router.push(`/studio/orgs/${r.organizationId}`), 1400);
  }

  if (phase === "loading") {
    return <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="size-6 text-emerald animate-spin" /></div>;
  }

  if (phase === "preview" && org) {
    return (
      <div className="max-w-lg mx-auto px-5 sm:px-8 py-16">
        <Card className="p-7 text-center">
          <div className="mx-auto mb-5">
            {org.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.logo_url} alt="" className="size-16 rounded-3xl mx-auto object-cover" />
            ) : (
              <div className="size-16 rounded-3xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-bold text-2xl mx-auto">
                {org.name[0]?.toUpperCase() ?? "?"}
              </div>
            )}
          </div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5 justify-center">
            <Building2 className="size-3" /> You&apos;ve been invited
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold mb-1 inline-flex items-center gap-2">
            {org.name}
            <VerifiedBadgeBool verified={org.is_verified} size="sm" />
          </h1>
          {role && (
            <div className="mt-2 mb-5">
              <Badge color={role === "admin" ? "indigo" : role === "instructor" ? "emerald" : "muted"}>Role: {role}</Badge>
            </div>
          )}
          {org.description && <p className="text-sm text-muted leading-relaxed mb-5">{org.description}</p>}

          {alreadyMember ? (
            <>
              <p className="text-sm text-emerald mb-4 inline-flex items-center gap-1.5 justify-center">
                <CheckCircle2 className="size-4" /> You&apos;re already a member.
              </p>
              <Link href={`/studio/orgs/${org.id}`}><Button>Open organization <ArrowRight className="size-4" /></Button></Link>
            </>
          ) : signedIn ? (
            <Button onClick={join} disabled={busy} size="lg">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              Join {org.name}
            </Button>
          ) : (
            <>
              <p className="text-xs text-muted mb-3">Sign in (or sign up) to accept this invite.</p>
              <Button onClick={join} size="lg"><ArrowRight className="size-4" /> Sign in to join</Button>
            </>
          )}
        </Card>
      </div>
    );
  }

  if (phase === "joined" && org) {
    return (
      <div className="max-w-md mx-auto px-5 sm:px-8 py-20 text-center">
        <Card className="p-8">
          <div className="size-14 mx-auto rounded-2xl bg-emerald/15 border border-emerald/30 flex items-center justify-center mb-4">
            <CheckCircle2 className="size-7 text-emerald" />
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold mb-2">Welcome to {org.name}.</h1>
          {emailMismatch && <p className="text-xs text-amber mb-2">Note: the invite was sent to a different email. You joined under your current account.</p>}
          <p className="text-muted leading-relaxed">Loading the org dashboard…</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-5 sm:px-8 py-20 text-center">
      <Card className="p-8">
        <div className="size-14 mx-auto rounded-2xl bg-rust/10 border border-rust/30 flex items-center justify-center mb-4">
          <AlertTriangle className="size-7 text-rust" />
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold mb-2">
          {phase === "expired" ? "Invite expired"
            : phase === "exhausted" ? "Invite fully used"
            : phase === "not_found" ? "Invite not recognized"
            : "Something went wrong"}
        </h1>
        <p className="text-muted leading-relaxed mb-5">
          {phase === "expired" && "This invite link is past its expiration date. Ask the organization admin to send a fresh one."}
          {phase === "exhausted" && "This invite link has been used the maximum number of times."}
          {phase === "not_found" && "We couldn't find an invite matching this link."}
          {phase === "error" && "Couldn't load the invite. Try again later."}
        </p>
        <Link href="/studio/orgs"><Button variant="secondary">Browse organizations</Button></Link>
      </Card>
    </div>
  );
}
