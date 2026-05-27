"use client";

import { useStore } from "@/store";
import { Card, Badge } from "@/components/ui";
import { BADGES } from "@/lib/badges";
import { Award, Shield, ExternalLink, Lock } from "lucide-react";

export default function CredentialsPage() {
  const { user, unlockedBadges, xp, ventures, progress } = useStore();
  if (!user) return null;
  const completedCount = Object.values(progress).filter((p) => p.status === "completed").length;

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2">Verifiable credentials</p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">Credentials employers actually trust.</h1>
        <p className="mt-3 text-muted max-w-2xl">Every Sankofa credential is cryptographically signed, linked to your shipped work, and verifiable by any employer with a one-click attestation API.</p>
      </div>

      <Card className="p-6 mb-6 bg-gradient-to-r from-emerald/10 to-amber/10">
        <div className="flex items-start gap-4">
          <Shield className="size-6 text-emerald shrink-0" />
          <div>
            <h3 className="font-medium">How Sankofa credentials work</h3>
            <p className="text-sm text-muted mt-2 leading-relaxed">
              Each credential bundles: (1) the lesson or project, (2) AI-proctored skill demonstrations, (3) artifacts from your actual shipped work (interview recordings, code diffs, customer LOIs), (4) a hash anchored on-chain. Employers verify with a single GET to <code className="text-emerald bg-surface-2 px-1.5 py-0.5 rounded">api.sankofa.studio/verify</code>.
            </p>
          </div>
        </div>
      </Card>

      <section className="mb-8">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold mb-4 flex items-center gap-2">
          <Award className="size-5 text-amber" /> Earned ({unlockedBadges.length})
        </h2>
        {unlockedBadges.length === 0 ? (
          <Card className="p-8 text-center text-muted">Earn your first credential by completing a lesson, logging a customer interview, or shipping an MVP task.</Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {unlockedBadges.map((id) => {
              const b = BADGES.find((x) => x.id === id);
              if (!b) return null;
              return (
                <Card key={id} className="p-5 relative overflow-hidden">
                  <div className={`absolute -top-8 -right-8 size-24 rounded-full opacity-10 blur-2xl ${b.rarity === "legendary" ? "bg-amber" : b.rarity === "epic" ? "bg-indigo" : b.rarity === "rare" ? "bg-emerald" : "bg-muted"}`} />
                  <div className="relative">
                    <div className="flex items-start justify-between">
                      <div className="text-5xl">{b.emoji}</div>
                      <Badge color={b.rarity === "legendary" ? "amber" : b.rarity === "epic" ? "indigo" : "emerald"}>{b.rarity}</Badge>
                    </div>
                    <h3 className="font-medium mt-4">{b.name}</h3>
                    <p className="text-xs text-muted mt-1">{b.description}</p>
                    <button className="mt-4 text-xs text-emerald hover:underline flex items-center gap-1">
                      Public verification link <ExternalLink className="size-3" />
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold mb-4 flex items-center gap-2">
          <Lock className="size-5 text-muted" /> Locked ({BADGES.length - unlockedBadges.length})
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {BADGES.filter((b) => !unlockedBadges.includes(b.id)).map((b) => (
            <Card key={b.id} className="p-4 opacity-50">
              <div className="text-3xl grayscale">{b.emoji}</div>
              <div className="font-medium text-sm mt-2">{b.name}</div>
              <div className="text-xs text-muted mt-1">{b.description}</div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
