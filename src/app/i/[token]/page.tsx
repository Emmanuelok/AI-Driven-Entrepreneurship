"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/store";
import { workspaceApi } from "@/lib/workspace-api";
import { Loader2, Users, Sparkles, ArrowRight, CheckCircle2, AlertTriangle, LinkIcon } from "lucide-react";
import { Spotlight } from "@/components/spotlight";

// Public invite-landing page. Anyone with the link sees a teaser:
// the workspace title, kind, member count, and the role they'd join
// as. Joining is a sign-in (if needed) + claim flow.
//
// Auth state model:
//   - logged out → "Sign in to join" button (deep link returns to /i/<t>)
//   - logged in  → "Join workspace" claims the seat then redirects
//   - already member → "Open workspace" deep link

const ACCENT_HEX: Record<string, string> = {
  emerald: "#2cc295",
  amber: "#f4a949",
  indigo: "#6c8cff",
  rust: "#d96444",
};

const KIND_TITLE: Record<string, string> = {
  study_group: "study group",
  project: "project",
  research: "research workspace",
  learning_session: "learning session",
  paper: "paper",
  generic: "workspace",
};

export default function InviteLandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { user, hydrated } = useStore();

  const [data, setData] = useState<Awaited<ReturnType<typeof workspaceApi.peekInvite>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Peek the invite. If the caller is signed in, the probe variant
  // also tells us whether they're already a member (so we can route
  // straight in instead of trying to re-join).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = user ? await workspaceApi.probeInvite(token) : await workspaceApi.peekInvite(token);
      if (cancelled) return;
      setData(r);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [token, user?.id]);

  async function onJoin() {
    if (!user) {
      const next = `/i/${token}`;
      router.push(`/sign-in?next=${encodeURIComponent(next)}`);
      return;
    }
    setJoining(true);
    setJoinError(null);
    const r = await workspaceApi.acceptInvite(token);
    setJoining(false);
    if (!r.ok) { setJoinError(r.error); return; }
    router.push(`/studio/workspaces/${r.workspaceId}`);
  }

  if (!hydrated || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="size-6 text-emerald animate-spin" />
      </div>
    );
  }

  if (!data || !data.ok) {
    const reason = data && !data.ok ? data.error : "unknown_error";
    return (
      <div className="min-h-screen flex items-center justify-center px-5">
        <div className="max-w-md text-center">
          <AlertTriangle className="size-10 text-amber mx-auto mb-4" />
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold mb-2">
            {reason === "expired"
              ? "This invite expired."
              : reason === "exhausted"
                ? "This link reached its use limit."
                : reason === "not_found"
                  ? "We can’t find that invite."
                  : "Something went wrong."}
          </h1>
          <p className="text-muted">Ask the workspace owner to send you a fresh link.</p>
          <Link href="/studio" className="inline-flex items-center gap-1.5 mt-6 text-emerald hover:underline text-sm">
            Go to your studio <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  const ws = data.workspace;
  const accent = ACCENT_HEX[ws.accent] ?? ACCENT_HEX.emerald;
  const kindWord = KIND_TITLE[ws.kind] ?? "workspace";
  const alreadyMember = data.alreadyMember;

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center px-5 py-12">
      {/* Accent ambient glow keyed to the workspace's chosen colour. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(60% 50% at 50% 0%, ${accent}1F 0%, transparent 60%), radial-gradient(50% 40% at 50% 100%, ${accent}14 0%, transparent 60%)`,
        }}
      />
      <Spotlight className="relative w-full max-w-lg rise" style={{ "--accent": accent } as React.CSSProperties}>
        <div className="glass rounded-3xl p-8 sm:p-10 shadow-2xl">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-emerald mb-6">
            <Sparkles className="size-3" /> You’ve been invited
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-[2rem] font-semibold leading-tight text-balance">
            Join <span style={{ color: accent }}>{ws.title}</span>
          </h1>
          {ws.description && (
            <p className="text-muted mt-3 leading-relaxed">{ws.description}</p>
          )}

          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <span className="flex items-center gap-1.5 text-muted">
              <Users className="size-3.5" /> {ws.memberCount} member{ws.memberCount === 1 ? "" : "s"}
            </span>
            <span className="text-muted">Type: {kindWord}</span>
            <span className="text-muted">You’d join as <span className="text-foreground">{data.invite.role}</span></span>
            {data.invite.emailTargeted && (
              <span className="flex items-center gap-1.5 text-amber">
                <LinkIcon className="size-3.5" /> personal invite
              </span>
            )}
          </div>

          {alreadyMember ? (
            <div className="mt-8">
              <Link
                href={`/studio/workspaces/${ws.id}`}
                className="inline-flex items-center gap-2 bg-emerald text-black font-semibold px-6 py-3 rounded-full hover:bg-amber transition shadow-lg shadow-emerald/30"
                style={{ background: accent }}
              >
                <CheckCircle2 className="size-4" /> Open workspace <ArrowRight className="size-4" />
              </Link>
              <p className="mt-2 text-xs text-muted">You’re already a member — no need to claim a seat.</p>
            </div>
          ) : (
            <div className="mt-8">
              <button
                onClick={onJoin}
                disabled={joining}
                className="inline-flex items-center gap-2 text-black font-semibold px-6 py-3 rounded-full transition shadow-lg disabled:opacity-60"
                style={{ background: accent, boxShadow: `0 8px 24px -8px ${accent}66` }}
              >
                {joining ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {user ? "Join workspace" : "Sign in to join"}
                <ArrowRight className="size-4" />
              </button>
              {joinError && (
                <p className="mt-3 text-xs text-rust">Couldn’t join: {joinError}</p>
              )}
              <p className="mt-3 text-xs text-muted">
                Joining will add you as a {data.invite.role}. You can leave any time.
              </p>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-border text-xs text-muted">
            Powered by <Link href="/" className="text-emerald hover:underline">Sankofa Studio</Link> — the collaborative learning + venture platform for African builders.
          </div>
        </div>
      </Spotlight>
    </div>
  );
}
