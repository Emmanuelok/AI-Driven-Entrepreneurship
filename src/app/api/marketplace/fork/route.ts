import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { logEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bump fork counter on a marketplace build + return the payload the
// client uses to spawn a local copy in the user's own AI Build Studio
// store. We don't write the local copy server-side (the store lives in
// the user's localStorage + their own sync row).

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin unavailable" }, { status: 500 });

  let body: { slug?: string };
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  const slug = body.slug?.trim();
  if (!slug) return Response.json({ ok: false, error: "missing_slug" }, { status: 400 });

  const { data: build, error } = await sb.from("public_builds").select("slug, title, description, code, template_id, owner_id").eq("slug", slug).maybeSingle();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  if (!build) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  await sb.rpc("bump_build_forks", { _slug: slug });

  // Audit: forks are interesting for the original author + for spotting
  // viral builds in operator dashboards.
  let forkerId: string | undefined;
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (token) {
    const { data: u } = await sb.auth.getUser(token);
    forkerId = u?.user?.id;
  }
  await logEvent({ kind: "fork", scope: "marketplace", userId: forkerId, ctx: { from_slug: slug, original_owner: build.owner_id } });

  return Response.json({
    ok: true,
    build: {
      title: build.title,
      description: build.description,
      code: build.code,
      templateId: build.template_id ?? "blank-canvas",
    },
  });
}
