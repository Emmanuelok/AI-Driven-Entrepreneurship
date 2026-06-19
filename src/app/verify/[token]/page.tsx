"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";
import { profileApi } from "@/lib/profile-api";
import { Card, Button } from "@/components/ui";
import { BadgeCheck, Loader2, AlertTriangle, ArrowRight } from "lucide-react";

// Magic-link landing for institution-email verification. The token in
// the path is the capability; we just need the user to be signed in
// for the claim. If they aren't, we surface a sign-in CTA and they
// land back here after auth.

type Status = "verifying" | "verified" | "wrong_account" | "expired" | "not_found" | "needs_signin" | "error";

export default function VerifyTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [status, setStatus] = useState<Status>("verifying");
  const [institution, setInstitution] = useState("");

  useEffect(() => {
    (async () => {
      // Pre-check sign-in state — if they're anonymous, surface the
      // sign-in CTA before firing the claim (the claim would 401 and
      // we'd land on the same message).
      const sb = supabaseBrowser();
      if (sb) {
        const { data } = await sb.auth.getSession();
        if (!data.session) { setStatus("needs_signin"); return; }
      }

      const r = await profileApi.claimVerification(token);
      if (r.ok) {
        setStatus("verified");
        if (r.institutionLabel) setInstitution(r.institutionLabel);
      } else {
        if (r.error === "wrong_account") setStatus("wrong_account");
        else if (r.error === "expired") setStatus("expired");
        else if (r.error === "not_found") setStatus("not_found");
        else if (r.error === "sign_in_required" || r.error === "auth_failed") setStatus("needs_signin");
        else setStatus("error");
      }
    })();
  }, [token]);

  return (
    <div className="max-w-md mx-auto px-5 sm:px-8 py-20 text-center">
      {status === "verifying" && (
        <>
          <Loader2 className="size-8 text-emerald animate-spin mx-auto mb-5" />
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold">Verifying…</h1>
        </>
      )}
      {status === "verified" && (
        <Card className="p-8">
          <div className="size-14 mx-auto rounded-2xl bg-emerald/15 border border-emerald/30 flex items-center justify-center mb-4">
            <BadgeCheck className="size-7 text-emerald" />
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold mb-2">Verified.</h1>
          <p className="text-muted leading-relaxed mb-5">
            Your{institution ? <> <strong className="text-foreground">{institution}</strong></> : null} email is verified. Your profile now carries the verified badge.
          </p>
          <Link href="/studio/profile">
            <Button>Open profile <ArrowRight className="size-4" /></Button>
          </Link>
        </Card>
      )}
      {status === "needs_signin" && (
        <Card className="p-8">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold mb-2">Sign in to verify</h1>
          <p className="text-muted leading-relaxed mb-5">
            You need to be signed in to complete the verification. Open this link from the same browser you signed up with — or sign in below.
          </p>
          <Link href={`/sign-in?next=${encodeURIComponent(`/verify/${token}`)}`}>
            <Button>Sign in</Button>
          </Link>
        </Card>
      )}
      {(status === "wrong_account" || status === "expired" || status === "not_found" || status === "error") && (
        <Card className="p-8">
          <div className="size-14 mx-auto rounded-2xl bg-rust/10 border border-rust/30 flex items-center justify-center mb-4">
            <AlertTriangle className="size-7 text-rust" />
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold mb-2">
            {status === "expired" ? "Link expired" : status === "wrong_account" ? "Wrong account" : status === "not_found" ? "Link not recognized" : "Something went wrong"}
          </h1>
          <p className="text-muted leading-relaxed mb-5">
            {status === "expired" && "Verification links expire after 24 hours. Start a fresh one from your profile editor."}
            {status === "wrong_account" && "This link was issued for a different account. Sign in to that account and try again."}
            {status === "not_found" && "This verification link was already used or never existed."}
            {status === "error" && "Couldn't complete verification. Try again or start a fresh one from your profile editor."}
          </p>
          <Link href="/studio/profile">
            <Button variant="secondary">Back to profile</Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
