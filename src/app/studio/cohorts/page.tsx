"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";
import { Card, Button, Input, Textarea, Badge, Dialog, EmptyState } from "@/components/ui";
import { GraduationCap, Plus, ArrowRight, Building2, Calendar, Users, AlertCircle, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type CohortRow = {
  id: string;
  name: string;
  description: string | null;
  institution: string | null;
  updated_at: string;
  owner_id: string;
  role: "owner" | "instructor" | "student";
};

export default function CohortsListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const acceptToken = searchParams.get("accept");

  const [cohorts, setCohorts] = useState<CohortRow[] | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [creating, setCreating] = useState(false);
  const [acceptMessage, setAcceptMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function refresh() {
    const sb = supabaseBrowser();
    if (!sb) { setSignedIn(false); return; }
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { setSignedIn(false); setCohorts([]); return; }
    setSignedIn(true);
    const res = await fetch("/api/v2/cohorts", { headers: { Authorization: `Bearer ${session.access_token}` } });
    const data = await res.json();
    setCohorts(data.results ?? []);
  }

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (!acceptToken) return;
    (async () => {
      try {
        const sb = supabaseBrowser();
        if (!sb) { setAcceptMessage({ kind: "error", text: "Cloud sync isn't configured." }); return; }
        const { data: { session } } = await sb.auth.getSession();
        if (!session) { setAcceptMessage({ kind: "error", text: "Sign in first, then click the invite link again." }); return; }
        const res = await fetch("/api/v2/cohorts/accept-invite", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ token: acceptToken }),
        });
        const data = await res.json();
        if (!data.ok) {
          setAcceptMessage({ kind: "error", text: data.error === "expired" ? "This invite has expired." : "Couldn't redeem the invite." });
          return;
        }
        setAcceptMessage({ kind: "success", text: "You're in. Opening the cohort…" });
        setTimeout(() => router.replace(`/studio/cohorts/${data.cohortId}`), 600);
      } catch (e) {
        setAcceptMessage({ kind: "error", text: (e as Error).message });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptToken]);

  if (signedIn === false) {
    return (
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
        <Header />
        <Card className="p-6 border border-amber/30 bg-amber/5">
          <div className="flex items-start gap-3">
            <AlertCircle className="size-5 text-amber shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium mb-1">Sign in to use cohorts</div>
              <p className="text-muted leading-relaxed">
                Cohorts let universities, accelerators, and study groups coordinate learning. They live in the cloud
                so members can see each other and shared assignments. Local-first studios stay local — cohorts opt
                you into the shared layer.
              </p>
              <Link href="/sign-in" className="mt-3 inline-block text-emerald hover:text-amber">Sign in →</Link>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Header onCreate={() => setCreating(true)} />

      {acceptMessage && (
        <Card className={`p-4 mb-6 border ${acceptMessage.kind === "error" ? "border-rust/30 bg-rust/5" : "border-emerald/30 bg-emerald/5"}`}>
          <div className="flex items-start gap-3">
            {acceptMessage.kind === "error" ? <AlertCircle className="size-4 text-rust shrink-0 mt-0.5" /> : <Check className="size-4 text-emerald shrink-0 mt-0.5" />}
            <p className={`text-sm ${acceptMessage.kind === "error" ? "text-rust" : "text-emerald"}`}>{acceptMessage.text}</p>
          </div>
        </Card>
      )}

      {cohorts === null ? (
        <div className="text-sm text-muted">Loading…</div>
      ) : cohorts.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No cohorts yet"
          body="Create one to run a class, accelerator batch, or study group. Invite members by email — they'll see your assignments in their dashboard."
          action={<Button onClick={() => setCreating(true)}><Plus className="size-4" /> Create a cohort</Button>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {cohorts.map((c) => (
            <Link key={c.id} href={`/studio/cohorts/${c.id}`} className="glass rounded-2xl p-5 hover:border-emerald/40 transition group">
              <div className="flex items-center justify-between mb-2">
                <Badge color={c.role === "owner" ? "amber" : c.role === "instructor" ? "emerald" : "muted"}>
                  {c.role === "owner" ? "owner" : c.role === "instructor" ? "instructor" : "student"}
                </Badge>
                <ArrowRight className="size-3.5 text-muted group-hover:text-emerald transition" />
              </div>
              <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold leading-tight">{c.name}</h3>
              {c.institution && (
                <div className="mt-1 text-xs text-muted flex items-center gap-1"><Building2 className="size-3" /> {c.institution}</div>
              )}
              {c.description && <p className="mt-2 text-xs text-muted line-clamp-2">{c.description}</p>}
              <div className="mt-3 text-[10px] text-muted flex items-center gap-1">
                <Calendar className="size-2.5" /> updated {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })}
              </div>
            </Link>
          ))}
        </div>
      )}

      <NewCohortDialog open={creating} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); router.push(`/studio/cohorts/${id}`); }} />
    </div>
  );
}

function Header({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
          <GraduationCap className="size-3.5" /> Cohorts
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
          Learn together. Build together.
        </h1>
        <p className="mt-3 text-muted max-w-2xl">
          Cohorts coordinate students, instructors, and assignments across the whole platform — learning
          tracks, problems, builds, and ventures. Built for universities, accelerators, and study groups.
        </p>
      </div>
      {onCreate && (
        <Button onClick={onCreate} size="lg">
          <Plus className="size-4" /> New cohort
        </Button>
      )}
    </div>
  );
}

function NewCohortDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true); setError(null);
    try {
      const sb = supabaseBrowser();
      if (!sb) { setError("Cloud sync isn't configured."); return; }
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setError("Sign in first."); return; }
      const res = await fetch("/api/v2/cohorts", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ name, institution: institution || undefined, description: description || undefined }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error || "Couldn't create cohort."); return; }
      onCreated(data.cohortId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="New cohort" size="md">
      <div className="space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Name</div>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="CS401 — Foundations of AI · Fall 2026" autoFocus />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Institution (optional)</div>
          <Input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Kwame Nkrumah University of Science and Technology" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Description (optional)</div>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="What this cohort is for, who's in it, what they'll ship by the end." />
        </div>
        {error && <div className="text-xs text-rust flex items-start gap-1.5"><AlertCircle className="size-3.5 shrink-0 mt-0.5" />{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={create} disabled={busy || name.trim().length < 2}>
            <Plus className="size-4" /> {busy ? "Creating…" : "Create cohort"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
