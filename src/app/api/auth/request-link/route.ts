import { nanoid } from "nanoid";

export const runtime = "nodejs";

// Magic-link sign-in endpoint scaffold.
// Today this is a no-op that returns success — auth runs entirely in
// localStorage. When we plug in a real backend (Supabase / Convex /
// Resend), this endpoint will:
//   1. Validate the email
//   2. Generate a one-time token, persist hash + expiry in the auth table
//   3. Send the magic link via Resend / Postmark
//   4. Return success
//
// We keep the shape stable now so the client doesn't need rewrites later.

export async function POST(req: Request) {
  let body: { email?: string } = {};
  try {
    body = await req.json();
  } catch {}

  const email = (body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ ok: false, error: "Please enter a valid email." }, { status: 400 });
  }

  // Stub: pretend we sent the link. In production, send via Resend.
  const tokenId = nanoid(16);
  return Response.json({
    ok: true,
    sent: true,
    email,
    devToken: process.env.NODE_ENV === "production" ? undefined : tokenId,
    message: "If a Sankofa account exists, a sign-in link is on its way. Local-first mode is also active — your work syncs once you click the link.",
  });
}
