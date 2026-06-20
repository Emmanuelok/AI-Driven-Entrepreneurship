"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { profileApi, type SavedSearch } from "@/lib/profile-api";
import type { MatchableVenture, SearchCriteria } from "@/lib/saved-search";
import { summarizeCriteria, hasAnyFilter, stageLabel, VALID_STAGES } from "@/lib/saved-search";
import { Card, Badge, Button, Input, Dialog } from "@/components/ui";
import {
  Bookmark, ArrowLeft, Loader2, Sparkles, Play, Trash2, Pencil,
  Bell, BellOff, Flame, Globe2, AlertCircle, ArrowRight, Eye, EyeOff,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// /studio/investor/saved — investor's saved-search library.
// Each row shows the criteria summary, alert cadence, last-run /
// last-alert timestamps, and the lifetime match count. Run-now
// pulls live matches into an expandable preview without sending
// email; edit opens a criteria builder dialog; delete removes.

export default function SavedSearchesPage() {
  const [rows, setRows] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Per-row run-now preview state.
  const [previews, setPreviews] = useState<Record<string, MatchableVenture[]>>({});
  const [previewsTotal, setPreviewsTotal] = useState<Record<string, number>>({});

  // Edit dialog.
  const [editing, setEditing] = useState<SavedSearch | null>(null);

  async function load() {
    setLoading(true);
    const r = await profileApi.listSavedSearches();
    if (!r.ok) { setErr(r.error || "Failed to load"); setLoading(false); return; }
    setRows(r.results);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function runNow(s: SavedSearch) {
    setBusyId(s.id);
    const r = await profileApi.runSavedSearch(s.id, { limit: 12 });
    setBusyId(null);
    if (!r.ok) { setErr(r.error || "Run failed"); return; }
    setPreviews((p) => ({ ...p, [s.id]: r.matches }));
    setPreviewsTotal((p) => ({ ...p, [s.id]: r.total }));
  }

  async function toggleCadence(s: SavedSearch) {
    setBusyId(s.id);
    const next = s.alert_cadence === "off" ? "weekly" : "off";
    const r = await profileApi.patchSavedSearch(s.id, { alertCadence: next });
    setBusyId(null);
    if (!r.ok) { setErr(r.error || "Save failed"); return; }
    setRows((rs) => rs.map((x) => x.id === s.id ? r.search : x));
  }

  async function togglePublic(s: SavedSearch) {
    setBusyId(s.id);
    const r = await profileApi.patchSavedSearch(s.id, { isPublic: !s.is_public });
    setBusyId(null);
    if (!r.ok) { setErr(r.error || "Save failed"); return; }
    setRows((rs) => rs.map((x) => x.id === s.id ? r.search : x));
  }

  async function remove(s: SavedSearch) {
    if (!confirm(`Delete saved search "${s.title}"?`)) return;
    setBusyId(s.id);
    const r = await profileApi.deleteSavedSearch(s.id);
    setBusyId(null);
    if (r.ok) setRows((rs) => rs.filter((x) => x.id !== s.id));
    else setErr(r.error || "Delete failed");
  }

  return (
    <div className="max-w-4xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/studio/investor" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-4">
        <ArrowLeft className="size-3" /> Investor portal
      </Link>

      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
          <Bookmark className="size-3.5" /> Saved searches
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
          Your thesis, kept warm.
        </h1>
        <p className="mt-3 text-muted max-w-2xl leading-relaxed">
          Save the filters you actually use, and we&apos;ll email you weekly when new ventures match. Pause alerts without deleting the search — it stays available for one-tap runs.
        </p>
      </header>

      {err && (
        <Card className="p-4 border-rust/40 mb-4 flex items-start gap-2">
          <AlertCircle className="size-4 text-rust mt-0.5" />
          <span className="text-sm text-rust">{err}</span>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="size-6 text-emerald animate-spin" /></div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center">
          <Sparkles className="size-8 text-emerald mx-auto mb-3" />
          <p className="text-muted leading-relaxed max-w-md mx-auto mb-4">
            No saved searches yet. Pick the filters you care about on the investor portal and tap <strong>Save this search</strong>.
          </p>
          <Link href="/studio/investor"><Button>Browse ventures <ArrowRight className="size-3.5" /></Button></Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((s) => (
            <Card key={s.id} className="p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium">{s.title}</h3>
                    {s.alert_cadence === "weekly"
                      ? <Badge color="emerald"><Bell className="size-3 mr-1" /> Weekly alerts</Badge>
                      : <Badge color="muted"><BellOff className="size-3 mr-1" /> Alerts paused</Badge>}
                    {s.is_public && <Badge color="indigo"><Eye className="size-3 mr-1" /> On thesis</Badge>}
                  </div>
                  <p className="text-xs text-muted mt-1">{summarizeCriteria(s.criteria)}</p>
                  <div className="text-[11px] text-muted mt-2 flex flex-wrap gap-3">
                    {s.last_alert_at && <span>Last alerted {formatDistanceToNow(new Date(s.last_alert_at), { addSuffix: true })}</span>}
                    {!s.last_alert_at && s.last_run_at && <span>Last run {formatDistanceToNow(new Date(s.last_run_at), { addSuffix: true })}</span>}
                    {!s.last_alert_at && !s.last_run_at && <span>Never run yet</span>}
                    {s.match_count_total > 0 && <span>· {s.match_count_total} lifetime matches</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => runNow(s)} disabled={busyId === s.id}>
                    {busyId === s.id ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Run now
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleCadence(s)} disabled={busyId === s.id} aria-label="Toggle alerts">
                    {s.alert_cadence === "weekly" ? <BellOff className="size-4" /> : <Bell className="size-4" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => togglePublic(s)} disabled={busyId === s.id} aria-label="Toggle on thesis" title={s.is_public ? "Hide from your thesis page" : "Show on your thesis page as an active mandate"}>
                    {s.is_public ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(s)} aria-label="Edit"><Pencil className="size-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(s)} disabled={busyId === s.id} aria-label="Delete"><Trash2 className="size-4" /></Button>
                </div>
              </div>

              {previews[s.id] && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="text-xs text-muted mb-2">
                    {previewsTotal[s.id] === 0 ? "No live matches." : `${previewsTotal[s.id]} live match${previewsTotal[s.id] === 1 ? "" : "es"}`}
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {previews[s.id].slice(0, 6).map((v) => (
                      <Link key={v.slug} href={`/v/${v.slug}`} className="block">
                        <div className="rounded-lg border border-border p-2.5 hover:border-emerald/40 transition">
                          <div className="text-sm font-medium truncate">{v.title}</div>
                          {v.tagline && <p className="text-[11px] text-muted line-clamp-2 mt-0.5">{v.tagline}</p>}
                          <div className="text-[10px] text-muted mt-1 flex flex-wrap gap-2">
                            {v.is_raising && <span className="flex items-center gap-1"><Flame className="size-2.5" /> raising</span>}
                            {v.region && <span className="flex items-center gap-1"><Globe2 className="size-2.5" /> {v.region}</span>}
                            {v.stage && <span>{stageLabel(String(v.stage))}</span>}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit saved search" size="md">
        {editing && (
          <CriteriaForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={async (patch) => {
              const r = await profileApi.patchSavedSearch(editing.id, patch);
              if (r.ok) { setRows((rs) => rs.map((x) => x.id === editing.id ? r.search : x)); setEditing(null); }
              else setErr(r.error || "Save failed");
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

// Reusable criteria builder. Used here (edit) + on /studio/investor
// (create-from-current-filters via the SaveSearchButton component).
function CriteriaForm({ initial, onSave, onCancel }: {
  initial: SavedSearch;
  onSave: (patch: { title: string; criteria: SearchCriteria; alertCadence: "off" | "weekly" }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [criteria, setCriteria] = useState<SearchCriteria>(initial.criteria);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof SearchCriteria>(k: K, v: SearchCriteria[K]) {
    setCriteria((c) => ({ ...c, [k]: v }));
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setBusy(true);
        await onSave({ title: title.trim(), criteria, alertCadence: initial.alert_cadence === "off" ? "off" : "weekly" });
        setBusy(false);
      }}
      className="space-y-4"
    >
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Name</div>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required />
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Sectors (comma separated)</div>
        <Input
          value={criteria.sectors.join(", ")}
          onChange={(e) => set("sectors", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
          placeholder="climate, fintech"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Stage</div>
          <select
            value={criteria.stage ?? ""}
            onChange={(e) => set("stage", (e.target.value || null) as SearchCriteria["stage"])}
            className="bg-surface-2 border border-border rounded-xl px-3 py-2.5 text-sm w-full outline-none focus:border-emerald"
          >
            <option value="">Any stage</option>
            {VALID_STAGES.map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}
          </select>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Region</div>
          <Input value={criteria.region ?? ""} onChange={(e) => set("region", e.target.value || null)} placeholder="Nigeria" maxLength={60} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={criteria.raisingOnly} onChange={(e) => set("raisingOnly", e.target.checked)} className="accent-emerald" />
        Only raising now
      </label>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Min raise (USD)</div>
          <Input type="number" min={0} value={criteria.minRaiseUsd ?? ""} onChange={(e) => set("minRaiseUsd", e.target.value ? Number(e.target.value) : null)} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Max raise (USD)</div>
          <Input type="number" min={0} value={criteria.maxRaiseUsd ?? ""} onChange={(e) => set("maxRaiseUsd", e.target.value ? Number(e.target.value) : null)} />
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Keywords (title + tagline)</div>
        <Input value={criteria.q ?? ""} onChange={(e) => set("q", e.target.value || null)} maxLength={120} />
      </div>

      <p className="text-xs text-muted">
        Will match: <span className="text-emerald">{hasAnyFilter(criteria) ? summarizeCriteria(criteria) : "everything (consider narrowing)"}</span>
      </p>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" type="button" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy || !title.trim()}>
          {busy && <Loader2 className="size-4 animate-spin" />} Save
        </Button>
      </div>
    </form>
  );
}

