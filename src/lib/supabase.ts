import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Supabase client — server & browser variants. Both return `null` when
// the env isn't configured so the platform keeps working in local-first
// mode without erroring. Wire SUPABASE_URL + SUPABASE_ANON_KEY (browser)
// and SUPABASE_SERVICE_ROLE_KEY (server only) to flip on cloud sync.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Browser-safe singleton. Uses the anon key — RLS policies (defined in
// schema.sql) enforce row-level access.
let browserClient: SupabaseClient | null = null;
export function supabaseBrowser(): SupabaseClient | null {
  if (!URL || !ANON) return null;
  if (!browserClient) {
    browserClient = createClient(URL, ANON, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return browserClient;
}

// Server-only client with the service role key. Bypasses RLS — only use
// inside trusted API routes that have already authenticated the caller.
export function supabaseAdmin(): SupabaseClient | null {
  if (!URL || !SERVICE) return null;
  return createClient(URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Server-side helper for routes that need the user but use the anon key
// (e.g. when the user's access token is forwarded via Authorization header).
export function supabaseServer(accessToken?: string): SupabaseClient | null {
  if (!URL || !ANON) return null;
  return createClient(URL, ANON, {
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
    auth: { persistSession: false },
  });
}

export function isSupabaseConfigured(): boolean {
  return !!URL && !!ANON;
}
