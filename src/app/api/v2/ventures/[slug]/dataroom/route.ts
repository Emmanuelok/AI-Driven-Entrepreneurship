import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";
import { resolveViewerAccess, canViewItem } from "@/lib/dataroom-access";
import { createNotification } from "@/lib/notifications-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  — list dataroom items for a venture. The response shape +
//        gating depends on the viewer's access:
//          - owner: every item + grant metadata for the manage UI
//          - granted: every item (records a view) + own grant
//          - other authed users: only items where visibility='public'
//          - anonymous: only items where visibility='public'
// POST — add an item. Owner only.

const PostBody = z.object({
  kind: z.enum(["doc", "metric", "file", "link", "note"]),
  title: z.string().min(1).max(200),
  body: z.string().max(20000).optional(),
  value: z.string().max(500).optional(),
  visibility: z.enum(["public", "gated"]).optional(),
  position: z.number().int().optional(),
});

async function resolveViewer(req: Request) {
  const token = bearerToken(req);
  if (!token) return { sb: null, user: null };
  const sb = supabaseAdmin();
  if (!sb) return { sb: null, user: null };
  const { data: u } = await sb.auth.getUser(token);
  return { sb, user: u?.user ?? null };
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { slug } = await params;
  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Resolve viewer (optional — anonymous viewers still get the public
  // subset).
  let viewerUserId: string | null = null;
  const token = bearerToken(req);
  if (token) {
    const { data: u } = await sb.auth.getUser(token);
    viewerUserId = u?.user?.id ?? null;
  }

  // The venture must exist + be published. We need owner_id to gate
  // the manage view.
  const { data: venture } = await sb
    .from("public_ventures")
    .select("slug, owner_id, payload")
    .eq("slug", slug)
    .maybeSingle();
  if (!venture) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  const v = venture as { slug: string; owner_id: string; payload: Record<string, unknown> };

  // Pull the items + grants in parallel.
  const [itemsRes, grantsRes] = await Promise.all([
    sb.from("venture_dataroom_items")
      .select("id, kind, title, body, value, position, visibility, created_at, updated_at")
      .eq("venture_slug", slug)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    sb.from("venture_dataroom_grants")
      .select("id, granted_to_user_id, granted_by_user_id, reason, granted_at, expires_at, revoked_at, first_viewed_at, last_viewed_at, view_count")
      .eq("venture_slug", slug),
  ]);

  const grants = (grantsRes.data ?? []) as Array<{
    id: string;
    granted_to_user_id: string;
    granted_by_user_id: string;
    reason: string;
    granted_at: string;
    expires_at: string | null;
    revoked_at: string | null;
    first_viewed_at: string | null;
    last_viewed_at: string | null;
    view_count: number;
  }>;

  // Decide viewer's access via the pure helper.
  const access = resolveViewerAccess({
    viewerUserId,
    ownerUserId: v.owner_id,
    grants: grants.map((g) => ({
      granted_to_user_id: g.granted_to_user_id,
      granted_at: g.granted_at,
      expires_at: g.expires_at,
      revoked_at: g.revoked_at,
    })),
  });

  const items = (itemsRes.data ?? []) as Array<{
    id: string; kind: string; title: string; body: string; value: string;
    position: number; visibility: "public" | "gated"; created_at: string; updated_at: string;
  }>;
  const visibleItems = items.filter((it) => canViewItem(access, it.visibility));

  // Record a view for the granted viewer (not the owner). If this is
  // the FIRST view of the room by this investor, notify the founder
  // so they can follow up while the room is hot — we detect it via
  // the existing grant row's first_viewed_at, which the RPC bumps
  // atomically. We notify pre-RPC based on the pre-view state.
  if (access.state === "granted" && viewerUserId) {
    const myGrant = grants.find((g) => g.granted_to_user_id === viewerUserId);
    const isFirstView = myGrant && myGrant.first_viewed_at === null;
    void sb.rpc("record_dataroom_view", { _venture_slug: slug, _viewer_user_id: viewerUserId });

    if (isFirstView) {
      // Resolve the viewer's display name for the founder's notification.
      const { data: viewer } = await sb
        .from("user_profiles")
        .select("display_name, slug")
        .eq("user_id", viewerUserId)
        .maybeSingle();
      const viewerName = (viewer as { display_name?: string; slug: string | null } | null)?.display_name ?? "An investor";
      const ventureTitle = String((v.payload as { title?: string }).title ?? v.slug);
      void createNotification({
        userId: v.owner_id,
        actorId: viewerUserId,
        kind: "verification",
        targetKind: "venture",
        targetSlug: v.slug,
        title: `${viewerName} opened your dataroom`,
        body: `First view of ${ventureTitle}.`,
        url: `/v/${v.slug}/dataroom`,
      });
    }
  }

  // Hydrate grantee display names for owner's manage list.
  let hydratedGrants: Array<Record<string, unknown>> = [];
  if (access.state === "owner") {
    const grantee_ids = Array.from(new Set(grants.map((g) => g.granted_to_user_id)));
    let nameById = new Map<string, { display_name: string | null; slug: string | null }>();
    if (grantee_ids.length > 0) {
      const { data: profiles } = await sb
        .from("user_profiles")
        .select("user_id, display_name, slug")
        .in("user_id", grantee_ids);
      nameById = new Map(((profiles ?? []) as Array<{ user_id: string; display_name: string | null; slug: string | null }>)
        .map((p) => [p.user_id, { display_name: p.display_name, slug: p.slug }]));
    }
    hydratedGrants = grants.map((g) => ({
      ...g,
      grantee: nameById.get(g.granted_to_user_id) ?? { display_name: null, slug: null },
    }));
  } else {
    // Viewers only see their own grant.
    hydratedGrants = grants
      .filter((g) => g.granted_to_user_id === viewerUserId)
      .map((g) => ({ ...g }));
  }

  return Response.json({
    ok: true,
    access,
    venture: { slug: v.slug, owner_id: v.owner_id, title: String((v.payload as { title?: string }).title ?? v.slug) },
    items: visibleItems,
    grants: hydratedGrants,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { slug } = await params;
  const r = await resolveViewer(req);
  if (!r.sb || !r.user) return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { sb, user } = r;

  const parsed = await parseBody(req, PostBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // Owner check.
  const { data: venture } = await sb.from("public_ventures").select("slug, owner_id").eq("slug", slug).maybeSingle();
  if (!venture) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  if ((venture as { owner_id: string }).owner_id !== user.id) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  // Default position to the end of the list.
  let position = body.position;
  if (position == null) {
    const { data: max } = await sb
      .from("venture_dataroom_items")
      .select("position")
      .eq("venture_slug", slug)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    position = ((max as { position?: number } | null)?.position ?? -1) + 1;
  }

  const { data, error } = await sb
    .from("venture_dataroom_items")
    .insert({
      venture_slug: slug,
      owner_user_id: user.id,
      kind: body.kind,
      title: body.title,
      body: body.body ?? "",
      value: body.value ?? "",
      visibility: body.visibility ?? "gated",
      position,
    })
    .select("*")
    .single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, item: data });
}
