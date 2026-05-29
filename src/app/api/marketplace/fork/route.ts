import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { logEvent } from "@/lib/events";
import { createNotification } from "@/lib/notifications-server";

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

  // Audit + identify the forker (also used for paywall check below).
  let forkerId: string | undefined;
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (token) {
    const { data: u } = await sb.auth.getUser(token);
    forkerId = u?.user?.id;
  }

  // Paywall: if the build is priced AND the forker hasn't paid (and
  // isn't the owner), block here and tell the client to send them to
  // checkout. Owner forks are always free.
  const { data: pricing } = await sb.from("build_pricing").select("price_cents, currency").eq("slug", slug).maybeSingle();
  if (pricing && pricing.price_cents > 0 && forkerId !== build.owner_id) {
    if (!forkerId) {
      return Response.json({ ok: false, error: "auth_required", message: "Sign in to purchase this build." }, { status: 401 });
    }
    const { data: purchase } = await sb.from("build_purchases").select("paid_at").eq("slug", slug).eq("user_id", forkerId).maybeSingle();
    if (!purchase) {
      return Response.json({
        ok: false,
        error: "payment_required",
        message: `This build costs ${(pricing.price_cents / 100).toFixed(2)} ${pricing.currency.toUpperCase()}. Purchase it to fork.`,
        priceCents: pricing.price_cents,
        currency: pricing.currency,
      }, { status: 402 });
    }
  }

  await sb.rpc("bump_build_forks", { _slug: slug });
  await logEvent({ kind: "fork", scope: "marketplace", userId: forkerId, ctx: { from_slug: slug, original_owner: build.owner_id, paid: !!pricing } });

  // Tell the original author someone forked their work — best moment
  // for them to drop a comment back or follow the new builder.
  if (build.owner_id) {
    let forkerName = "Someone";
    if (forkerId) {
      const { data: actor } = await sb.auth.admin.getUserById(forkerId);
      const meta = (actor?.user?.user_metadata ?? {}) as { name?: string; full_name?: string };
      forkerName = meta.name || meta.full_name || (actor?.user?.email ? actor.user.email.split("@")[0] : "Someone");
    }
    void createNotification({
      userId: build.owner_id,
      kind: "fork",
      actorId: forkerId ?? null,
      actorName: forkerName,
      targetKind: "build",
      targetSlug: slug,
      title: `${forkerName} forked "${build.title}"`,
      body: "They'll iterate independently — but it means your work is useful to someone.",
      url: `/studio/marketplace/${slug}`,
    });
  }

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
