"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useStore } from "@/store";
import {
  profileApi,
  type DataroomItem,
  type DataroomGrantRow,
} from "@/lib/profile-api";
import { accessSummary } from "@/lib/dataroom-access";
import { Card, Button, Input, Textarea, Badge, Dialog } from "@/components/ui";
import {
  ShieldCheck, Plus, Trash2, Pencil, Eye, EyeOff,
  FileText, BarChart3, Paperclip, Link as LinkIcon, StickyNote,
  Loader2, AlertCircle, UserPlus, Clock, ExternalLink,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// /studio/venture/[id]/investor-access — owner-only manage UI for the
// gated dataroom that lives at /v/[slug]/dataroom. The local-only
// "diligence checklist" still lives at /studio/venture/[id]/dataroom;
// this page is the shareable side.

type KindKey = DataroomItem["kind"];

const KIND_ICON: Record<KindKey, typeof FileText> = {
  doc: FileText,
  metric: BarChart3,
  file: Paperclip,
  link: LinkIcon,
  note: StickyNote,
};

const KIND_LABEL: Record<KindKey, string> = {
  doc: "Document",
  metric: "Metric",
  file: "File",
  link: "Link",
  note: "Note",
};

type Grantee = DataroomGrantRow & {
  grantee?: { display_name: string | null; slug: string | null };
};

export default function InvestorAccessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ventures } = useStore();
  const found = ventures.find((x) => x.id === id);

  const slug = found?.publicLaunch?.slug?.trim() || "";
  const published = Boolean(found?.publicLaunch?.published && slug);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<DataroomItem[]>([]);
  const [grants, setGrants] = useState<Grantee[]>([]);
  const [title, setTitle] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<DataroomItem | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!published) { setLoading(false); return; }
    setLoading(true);
    setErr(null);
    const r = await profileApi.getDataroom(slug);
    if (!r.ok) { setErr(r.error || "Failed to load dataroom"); setLoading(false); return; }
    setItems(r.items);
    setGrants(r.grants as Grantee[]);
    setTitle(r.venture.title);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slug, published]);

  if (!found) { notFound(); return null; }

  if (!published) {
    return (
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12 space-y-6">
        <header>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-1 flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" /> Investor access
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">Publish your venture first</h1>
        </header>
        <Card className="p-6 space-y-3">
          <p className="text-sm text-muted leading-relaxed">
            Gated documents and investor grants live on the published venture page.
            Once <strong className="text-fg">{found.name}</strong> has a public URL, you can curate items
            and share access with specific investors here.
          </p>
          <Link href={`/studio/venture/${id}/launch`}>
            <Button>Go to launch page</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const publicItems = items.filter((i) => i.visibility === "public");
  const gatedItems = items.filter((i) => i.visibility === "gated");
  const activeGrants = grants.filter((g) => !g.revoked_at);

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-1 flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" /> Investor access · {title}
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">{items.length} item{items.length === 1 ? "" : "s"} · {activeGrants.length} active grant{activeGrants.length === 1 ? "" : "s"}</h1>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Badge color="emerald">{publicItems.length} public</Badge>
            <Badge color="amber">{gatedItems.length} gated</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/v/${slug}/dataroom`} target="_blank">
            <Button variant="ghost"><ExternalLink className="size-4" /> View public page</Button>
          </Link>
          <Button onClick={() => setGrantOpen(true)}><UserPlus className="size-4" /> Grant access</Button>
          <Button onClick={() => setCreateOpen(true)}><Plus className="size-4" /> Add item</Button>
        </div>
      </header>

      {err && (
        <Card className="p-4 border-rust/40 flex items-start gap-2">
          <AlertCircle className="size-4 text-rust mt-0.5" />
          <span className="text-sm text-rust">{err}</span>
        </Card>
      )}

      {loading ? (
        <Card className="p-12 flex items-center justify-center">
          <Loader2 className="size-6 text-emerald animate-spin" />
        </Card>
      ) : (
        <>
          <Card className="p-5">
            <h3 className="font-medium mb-1">Items</h3>
            <p className="text-xs text-muted mb-4">
              Public items appear on your dataroom page for anyone. Gated items are visible only to investors you grant.
            </p>
            {items.length === 0 ? (
              <p className="text-sm text-muted">No items yet. Click <strong>Add item</strong> to put your first metric, doc or link in the room.</p>
            ) : (
              <div className="space-y-2">
                {items.map((it) => (
                  <ItemRow
                    key={it.id}
                    item={it}
                    onEdit={() => setEditing(it)}
                    onDelete={async () => {
                      if (!confirm(`Delete "${it.title}"?`)) return;
                      setBusy(true);
                      const r = await profileApi.deleteDataroomItem(slug, it.id);
                      setBusy(false);
                      if (r.ok) setItems(items.filter((x) => x.id !== it.id));
                      else setErr(r.error || "Delete failed");
                    }}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="font-medium mb-1">Investor grants</h3>
            <p className="text-xs text-muted mb-4">
              Each grant unlocks the gated items for one investor. Revoking keeps the audit trail but cuts off access immediately.
            </p>
            {grants.length === 0 ? (
              <p className="text-sm text-muted">No grants yet. Use <strong>Grant access</strong> to invite an investor by their profile handle.</p>
            ) : (
              <div className="space-y-2">
                {grants.map((g) => (
                  <GrantRow
                    key={g.id}
                    grant={g}
                    onRevoke={async () => {
                      if (!confirm("Revoke this investor's access?")) return;
                      setBusy(true);
                      const r = await profileApi.revokeDataroomGrant(slug, g.id);
                      setBusy(false);
                      if (r.ok) setGrants(grants.map((x) => x.id === g.id ? { ...x, revoked_at: new Date().toISOString() } : x));
                      else setErr(r.error || "Revoke failed");
                    }}
                  />
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Add dataroom item" size="md">
        <ItemForm
          busy={busy}
          onCancel={() => setCreateOpen(false)}
          onSubmit={async (payload) => {
            setBusy(true); setErr(null);
            const r = await profileApi.createDataroomItem(slug, payload);
            setBusy(false);
            if (r.ok) { setItems([...items, r.item]); setCreateOpen(false); }
            else setErr(r.error || "Create failed");
          }}
        />
      </Dialog>

      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit item" size="md">
        {editing && (
          <ItemForm
            initial={editing}
            busy={busy}
            onCancel={() => setEditing(null)}
            onSubmit={async (payload) => {
              setBusy(true); setErr(null);
              const r = await profileApi.patchDataroomItem(slug, editing.id, payload);
              setBusy(false);
              if (r.ok) { setItems(items.map((x) => x.id === editing.id ? r.item : x)); setEditing(null); }
              else setErr(r.error || "Save failed");
            }}
          />
        )}
      </Dialog>

      <Dialog open={grantOpen} onClose={() => setGrantOpen(false)} title="Grant investor access" size="md">
        <GrantForm
          busy={busy}
          onCancel={() => setGrantOpen(false)}
          onSubmit={async (payload) => {
            setBusy(true); setErr(null);
            const r = await profileApi.grantDataroom(slug, payload);
            setBusy(false);
            if (r.ok) {
              // Reload to hydrate grantee name.
              await load();
              setGrantOpen(false);
            } else setErr(r.error || "Grant failed");
          }}
        />
      </Dialog>
    </div>
  );
}

function ItemRow({ item, onEdit, onDelete }: { item: DataroomItem; onEdit: () => void; onDelete: () => void }) {
  const Icon = KIND_ICON[item.kind];
  return (
    <div className="group grid grid-cols-12 gap-3 items-center rounded-xl border border-border p-3 hover:border-emerald/40 transition">
      <div className="col-span-12 sm:col-span-7 flex items-center gap-3">
        <Icon className="size-4 text-emerald shrink-0" />
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{item.title}</div>
          {item.value && <div className="text-xs text-muted truncate">{item.value}</div>}
          {item.body && <div className="text-xs text-muted truncate">{item.body.slice(0, 120)}</div>}
        </div>
      </div>
      <div className="col-span-6 sm:col-span-3 flex items-center gap-2">
        <Badge color="muted">{KIND_LABEL[item.kind]}</Badge>
        {item.visibility === "public" ? (
          <Badge color="emerald"><Eye className="size-3 mr-1" /> Public</Badge>
        ) : (
          <Badge color="amber"><EyeOff className="size-3 mr-1" /> Gated</Badge>
        )}
      </div>
      <div className="col-span-6 sm:col-span-2 flex justify-end gap-1 opacity-60 group-hover:opacity-100 transition">
        <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-surface-2 text-muted hover:text-emerald" aria-label="Edit"><Pencil className="size-3.5" /></button>
        <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-surface-2 text-muted hover:text-rust" aria-label="Delete"><Trash2 className="size-3.5" /></button>
      </div>
    </div>
  );
}

function GrantRow({ grant, onRevoke }: { grant: Grantee; onRevoke: () => void }) {
  const summary = useMemo(() => {
    if (grant.revoked_at) return accessSummary({ state: "revoked" });
    if (grant.expires_at && new Date(grant.expires_at).getTime() < Date.now()) {
      return accessSummary({ state: "expired", grantExpiresAt: grant.expires_at });
    }
    const daysLeft = grant.expires_at
      ? Math.max(0, Math.floor((new Date(grant.expires_at).getTime() - Date.now()) / 86_400_000))
      : null;
    return accessSummary({
      state: "granted",
      grant: {
        granted_to_user_id: grant.granted_to_user_id,
        granted_at: grant.granted_at,
        expires_at: grant.expires_at,
        revoked_at: grant.revoked_at,
      },
      daysLeft,
    });
  }, [grant]);

  const name = grant.grantee?.display_name?.trim() || grant.grantee?.slug || grant.granted_to_user_id.slice(0, 8);
  const revoked = Boolean(grant.revoked_at);
  const expired = !revoked && grant.expires_at && new Date(grant.expires_at).getTime() < Date.now();

  return (
    <div className="group grid grid-cols-12 gap-3 items-center rounded-xl border border-border p-3 hover:border-emerald/40 transition">
      <div className="col-span-12 sm:col-span-5">
        <div className="text-sm font-medium flex items-center gap-2">
          {grant.grantee?.slug ? (
            <Link href={`/p/${grant.grantee.slug}`} className="hover:text-emerald">{name}</Link>
          ) : (
            <span>{name}</span>
          )}
          {revoked && <Badge color="rust">Revoked</Badge>}
          {expired && <Badge color="amber">Expired</Badge>}
        </div>
        <div className="text-xs text-muted mt-0.5">{summary}</div>
      </div>
      <div className="col-span-6 sm:col-span-4 text-xs text-muted">
        {grant.reason && <div className="italic">&ldquo;{grant.reason}&rdquo;</div>}
        <div className="flex items-center gap-1 mt-1">
          <Clock className="size-3" />
          Granted {formatDistanceToNow(new Date(grant.granted_at), { addSuffix: true })}
        </div>
      </div>
      <div className="col-span-4 sm:col-span-2 text-xs">
        <div className="flex items-center gap-1 text-muted"><Eye className="size-3" /> {grant.view_count} view{grant.view_count === 1 ? "" : "s"}</div>
        {grant.last_viewed_at && (
          <div className="text-[10px] text-muted mt-0.5">
            Last {formatDistanceToNow(new Date(grant.last_viewed_at), { addSuffix: true })}
          </div>
        )}
      </div>
      <div className="col-span-2 sm:col-span-1 flex justify-end">
        {!revoked && (
          <button onClick={onRevoke} className="p-1.5 rounded-lg hover:bg-surface-2 text-muted hover:text-rust" aria-label="Revoke"><Trash2 className="size-3.5" /></button>
        )}
      </div>
    </div>
  );
}

type ItemPayload = {
  kind: KindKey;
  title: string;
  body?: string;
  value?: string;
  visibility: "public" | "gated";
};

function ItemForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: DataroomItem;
  busy: boolean;
  onSubmit: (p: ItemPayload) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<KindKey>(initial?.kind ?? "doc");
  const [t, setT] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [value, setValue] = useState(initial?.value ?? "");
  const [visibility, setVisibility] = useState<"public" | "gated">(initial?.visibility ?? "gated");
  const showBody = kind === "doc" || kind === "note";
  const showValue = kind === "metric" || kind === "file" || kind === "link";
  const valueLabel = kind === "metric" ? "Value (e.g. $42k MRR)" : kind === "link" ? "URL" : "File URL";

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (!t.trim()) return; onSubmit({ kind, title: t.trim(), body: showBody ? body : "", value: showValue ? value : "", visibility }); }}
      className="space-y-4"
    >
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Kind</div>
        <div className="flex flex-wrap gap-2">
          {(["doc", "metric", "file", "link", "note"] as KindKey[]).map((k) => {
            const Icon = KIND_ICON[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition ${kind === k ? "border-emerald text-emerald bg-emerald/10" : "border-border text-muted hover:border-emerald/40"}`}
              >
                <Icon className="size-3.5" /> {KIND_LABEL[k]}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Title</div>
        <Input value={t} onChange={(e) => setT(e.target.value)} placeholder="e.g. Q2 2026 P&L" required maxLength={200} />
      </div>

      {showBody && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Body</div>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Markdown supported" rows={5} maxLength={20000} />
        </div>
      )}

      {showValue && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">{valueLabel}</div>
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === "link" ? "https://…" : ""} maxLength={500} />
        </div>
      )}

      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Visibility</div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setVisibility("public")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs ${visibility === "public" ? "border-emerald text-emerald bg-emerald/10" : "border-border text-muted"}`}>
            <Eye className="size-3.5" /> Public — anyone can see
          </button>
          <button type="button" onClick={() => setVisibility("gated")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs ${visibility === "gated" ? "border-amber text-amber bg-amber/10" : "border-border text-muted"}`}>
            <EyeOff className="size-3.5" /> Gated — investors only
          </button>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" type="button" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy || !t.trim()}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {initial ? "Save" : "Add item"}
        </Button>
      </div>
    </form>
  );
}

function GrantForm({
  busy,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  onSubmit: (p: { granteeSlug: string; days: number | null; reason: string }) => void;
  onCancel: () => void;
}) {
  const [granteeSlug, setGranteeSlug] = useState("");
  const [days, setDays] = useState<number | null>(90);
  const [reason, setReason] = useState("");

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (!granteeSlug.trim()) return; onSubmit({ granteeSlug: granteeSlug.trim(), days, reason: reason.trim() }); }}
      className="space-y-4"
    >
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Investor profile handle</div>
        <Input value={granteeSlug} onChange={(e) => setGranteeSlug(e.target.value)} placeholder="e.g. jane-investor" required maxLength={60} />
        <p className="text-[11px] text-muted mt-1">The slug from their profile URL (sankofa.studio/p/<strong>handle</strong>).</p>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Duration</div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "30 days", v: 30 },
            { label: "90 days", v: 90 },
            { label: "1 year", v: 365 },
            { label: "Open-ended", v: null },
          ].map((opt) => (
            <button
              key={String(opt.v)}
              type="button"
              onClick={() => setDays(opt.v)}
              className={`px-3 py-1.5 rounded-lg border text-xs ${days === opt.v ? "border-emerald text-emerald bg-emerald/10" : "border-border text-muted"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Reason (optional)</div>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Diligence for seed round" maxLength={280} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" type="button" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy || !granteeSlug.trim()}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Grant access
        </Button>
      </div>
    </form>
  );
}
