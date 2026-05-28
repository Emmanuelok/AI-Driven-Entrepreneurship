import { nanoid } from "nanoid";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

// Magic-link sign-in. Real Supabase OTP when the env is configured;
// graceful stub otherwise (platform still runs local-first).

export async function POST(req: Request) {
  let body: { email?: string; redirectTo?: string } = {};
  try {
    body = await req.json();
  } catch {}

  const email = (body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ ok: false, error: "Please enter a valid email." }, { status: 400 });
  }

  // Cloud path: Supabase OTP via service-role (so we can create the user
  // on first sign-in without requiring email-confirmation flows).
  if (isSupabaseConfigured()) {
    const sb = supabaseAdmin();
    if (sb) {
      const origin = new URL(req.url).origin;
      const redirectTo = body.redirectTo || `${origin}/api/auth/callback`;
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
      });
      if (error) {
        return Response.json({ ok: false, error: error.message }, { status: 502 });
      }
      return Response.json({
        ok: true,
        sent: true,
        email,
        mode: "supabase",
        message: "Sign-in link sent. Click it from this device — it's good for 60 minutes.",
      });
    }
  }

  // Local-first stub: no email actually sent, platform still works.
  return Response.json({
    ok: true,
    sent: true,
    email,
    mode: "local",
    devToken: process.env.NODE_ENV === "production" ? undefined : nanoid(16),
    message: "Local-first mode is active. Configure Supabase to enable real magic links and cross-device sync.",
  });
}
