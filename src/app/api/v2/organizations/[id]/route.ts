import { z } from "zod";
import { supabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { authOrganization, requireOrganizationRole } from "@/lib/organization-auth";
import { bearerToken } from "@/lib/workspace-auth";
import { parseBody } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET    — read this org's row + the caller's role. Member-only.
// PATCH  — update mutable fields. Admin+ only. Owner-transfer happens
//          through a separate route (not implemented in Phase 55 —
//          v2.1).
// DELETE — owner only. Cascades to members + invites; cohorts that
//          belonged here go orphan (organization_id → NULL) so a
//          deleted-by-mistake org doesn't take its cohorts with it.

const PatchBody = z.object({
  name: z.string().min(2).max(120).optional(),
  kind: z.enum(["university", "accelerator", "bootcamp", "school", "program", "other"]).optional(),
  description: z.string().max(2000).optional(),
  country: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  logo_url: z.string().url().nullable().optional(),
  website_url: z.string().url().nullable().optional(),
  institution_domain: z.string().max(120).nullable().optional(),
  is_public: z.boolean().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authOrganization(bearerToken(req), id);
  const forbid = requireOrganizationRole(me, "observer");
  if (forbid) return forbid;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  const { data } = await sb.from("organizations").select("*").eq("id", id).maybeSingle();
  if (!data) return Response.json({ ok: false, error: "not_found" }, { status: 404 });

  return Response.json({ ok: true, organization: data, myRole: me!.role });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authOrganization(bearerToken(req), id);
  const forbid = requireOrganizationRole(me, "admin");
  if (forbid) return forbid;

  const parsed = await parseBody(req, PatchBody);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // If institution_domain changed, recompute auto-verify state.
  // Only the owner's verification matters here (admins can't borrow
  // their own institution email to verify a different org).
  let extra: Record<string, unknown> = {};
  if (body.institution_domain !== undefined) {
    const { data: org } = await sb.from("organizations").select("owner_user_id, is_verified").eq("id", id).maybeSingle();
    const ownerId = (org as { owner_user_id: string } | null)?.owner_user_id;
    if (ownerId && body.institution_domain) {
      const { data: v } = await sb
        .from("verifications")
        .select("evidence")
        .eq("user_id", ownerId)
        .eq("kind", "email_institution")
        .eq("status", "verified")
        .maybeSingle();
      const verifiedDomain = (v as { evidence?: { domain?: string } } | null)?.evidence?.domain;
      if (verifiedDomain && verifiedDomain.toLowerCase() === body.institution_domain.toLowerCase()) {
        extra.is_verified = true;
      } else if ((org as { is_verified: boolean } | null)?.is_verified) {
        // Domain changed away from the verified one — drop the badge
        // until a re-verification happens.
        extra.is_verified = false;
      }
    } else if (!body.institution_domain) {
      // Removing the domain drops the auto-verified badge.
      extra.is_verified = false;
    }
  }

  const patch: Record<string, unknown> = { ...extra };
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.kind !== undefined) patch.kind = body.kind;
  if (body.description !== undefined) patch.description = body.description;
  if (body.country !== undefined) patch.country = body.country;
  if (body.city !== undefined) patch.city = body.city;
  if (body.logo_url !== undefined) patch.logo_url = body.logo_url;
  if (body.website_url !== undefined) patch.website_url = body.website_url;
  if (body.institution_domain !== undefined) {
    patch.institution_domain = body.institution_domain
      ? body.institution_domain.toLowerCase()
      : null;
  }
  if (body.is_public !== undefined) patch.is_public = body.is_public;
  if (body.settings !== undefined) patch.settings = body.settings;

  if (Object.keys(patch).length === 0) {
    return Response.json({ ok: true, noop: true });
  }

  const { data, error } = await sb.from("organizations").update(patch).eq("id", id).select("*").single();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, organization: data });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return Response.json({ ok: false, mode: "local" }, { status: 503 });
  const { id } = await params;
  const me = await authOrganization(bearerToken(req), id);
  const forbid = requireOrganizationRole(me, "owner");
  if (forbid) return forbid;

  const sb = supabaseAdmin();
  if (!sb) return Response.json({ ok: false, error: "admin_unavailable" }, { status: 500 });

  // Cohorts that belonged here get orphaned (organization_id → NULL via
  // the ON DELETE SET NULL clause in the migration). Members + invites
  // cascade. The owner_id on the cohort stays intact so the original
  // instructor still owns it.
  const { error } = await sb.from("organizations").delete().eq("id", id);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
