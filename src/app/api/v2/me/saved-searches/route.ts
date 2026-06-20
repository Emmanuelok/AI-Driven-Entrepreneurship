import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";
import { normalizeCriteria, suggestTitle, type SearchCriteria } from "@/lib/saved-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — list the caller's saved searches, newest-edited first.
// POST — create a new saved search. The criteria is normalized via
//        the pure helper; title defaults to a human summary when
//        omitted.

const CreateBody = z.object({
  title: z.string().min(1).max(80).optional(),
  criteria: z.unknown(),
  alertCadence: z.enum(["off", "weekly", "instant"]).optional(),
});

async function resolveCaller(req: Request) {
  if (!isSupabaseConfigured()) return { error: Response.json({ ok: false, mode: "local" }, { status: 503 }) };
  const token = bearerToken(req);
  if (!token) return { error: Response.json({ ok: false, error: "missing_token" }, { status: 401 }) };
  const sb = supabaseAdmin();
  if (!sb) return { error: Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 }) };
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return { error: Response.json({ ok: false, error: "auth_failed" }, { status: 401 }) };
  return { sb, user: u.user };
}

export type SavedSearchRow = {
  id: string;
  title: string;
  criteria: SearchCriteria;
  alert_cadence: "off" | "weekly" | "instant";
  is_public: boolean;
  last_run_at: string | null;
  last_alert_at: string | null;
  match_count_total: number;
  created_at: string;
  updated_at: string;
};

export async function GET(req: Request) {
  const r = await resolveCaller(req);
  if ("error" in r) return r.error;
  const { sb, user } = r;

  const { data, error } = await sb
    .from("investor_saved_searches")
    .select("id, title, criteria, alert_cadence, is_public, last_run_at, last_alert_at, match_count_total, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const results = (data ?? []).map((row) => {
    const r = row as Omit<SavedSearchRow, "criteria"> & { criteria: unknown };
    return { ...r, criteria: normalizeCriteria(r.criteria) };
  });
  return Response.json({ ok: true, results });
}

export async function POST(req: Request) {
  const r = await resolveCaller(req);
  if ("error" in r) return r.error;
  const { sb, user } = r;

  const parsed = await parseBody(req, CreateBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const criteria = normalizeCriteria(body.criteria as Record<string, unknown>);
  const title = (body.title?.trim() || suggestTitle(criteria)).slice(0, 80);
  const cadence = body.alertCadence ?? "weekly";

  const { data, error } = await sb
    .from("investor_saved_searches")
    .insert({ user_id: user.id, title, criteria, alert_cadence: cadence })
    .select("*")
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, search: { ...(data as SavedSearchRow), criteria: normalizeCriteria((data as { criteria: unknown }).criteria) } });
}
