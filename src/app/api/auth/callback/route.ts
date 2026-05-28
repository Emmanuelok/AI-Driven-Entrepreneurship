import { NextResponse } from "next/server";
import { supabaseBrowser, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

// OAuth-style callback the Supabase magic-link redirects to.
// Supabase puts the token in the URL hash, which the client-side
// `detectSessionInUrl: true` handles automatically — this route's job
// is just to land the user on /studio with a friendly message.

export async function GET(req: Request) {
  const url = new URL(req.url);
  const errorMsg = url.searchParams.get("error_description") || url.searchParams.get("error");

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(new URL("/sign-in?error=Backend+not+configured", url.origin));
  }
  // The browser client will pick up the session from the hash.
  void supabaseBrowser();

  if (errorMsg) {
    return NextResponse.redirect(new URL(`/sign-in?error=${encodeURIComponent(errorMsg)}`, url.origin));
  }
  return NextResponse.redirect(new URL("/studio?welcome=back", url.origin));
}
