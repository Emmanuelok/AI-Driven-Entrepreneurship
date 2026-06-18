"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useWorkspace } from "@/lib/use-workspace";
import { workspaceApi, type WorkspaceActivity } from "@/lib/workspace-api";
import { WorkspaceActivityList } from "@/components/workspace-activity-list";
import { Card, Button } from "@/components/ui";
import { ArrowLeft, Filter, Loader2, X, CalendarRange } from "lucide-react";

// Full audit log for one workspace. Filterable by kind, by member, and
// by date range; grouped by day for readability. Paginated 100 per page.

const PAGE_SIZE = 100;

export default function WorkspaceActivityLog({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const ws = useWorkspace(id);
  const [activity, setActivity] = useState<WorkspaceActivity[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [distinctKinds, setDistinctKinds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);

  // Filters
  const [selectedKinds, setSelectedKinds] = useState<Set<string>>(new Set());
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [since, setSince] = useState<string>("");
  const [until, setUntil] = useState<string>("");

  const filterKey = useMemo(
    () => `${Array.from(selectedKinds).sort().join(",")}|${selectedUser}|${since}|${until}|${offset}`,
    [selectedKinds, selectedUser, since, until, offset],
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const r = await workspaceApi.listActivity(id, {
        kinds: selectedKinds.size > 0 ? Array.from(selectedKinds) : undefined,
        userId: selectedUser || undefined,
        since: since ? new Date(since).toISOString() : undefined,
        until: until ? new Date(until).toISOString() : undefined,
        limit: PAGE_SIZE,
        offset,
      });
      if (cancelled) return;
      if (r.ok) {
        setActivity(r.results);
        setTotal(r.total);
        setDistinctKinds(r.distinctKinds);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, filterKey]);

  // Reset paging when filters change.
  useEffect(() => { setOffset(0); }, [selectedKinds, selectedUser, since, until]);

  const filtersActive = selectedKinds.size > 0 || !!selectedUser || !!since || !!until;
  function clearFilters() {
    setSelectedKinds(new Set());
    setSelectedUser("");
    setSince("");
    setUntil("");
  }

  if (ws.loading) {
    return <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="size-5 text-emerald animate-spin" /></div>;
  }
  if (ws.error || !ws.workspace) { notFound(); return null; }

  // Group by day for the list rendering.
  const groups = groupByDay(activity);

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
      <Link href={`/studio/workspaces/${id}`} className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-4">
        <ArrowLeft className="size-3" /> {ws.workspace.title}
      </Link>

      <div className="mb-6">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-1 flex items-center gap-1.5">
          <Filter className="size-3.5" /> Activity log
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold leading-tight">
          Everything that&apos;s happened here.
        </h1>
        {total !== null && (
          <p className="text-sm text-muted mt-2">{total.toLocaleString()} event{total === 1 ? "" : "s"} total</p>
        )}
      </div>

      <Card className="p-4 mb-6">
        {/* Member filter */}
        <div className="mb-3">
          <label className="block text-[10px] uppercase tracking-widest text-muted mb-1.5">Member</label>
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="w-full sm:w-auto bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-emerald"
          >
            <option value="">All members</option>
            {ws.members.map((m) => (
              <option key={m.user_id} value={m.user_id}>{m.display_name || m.email || "Member"}</option>
            ))}
          </select>
        </div>

        {/* Date range */}
        <div className="mb-3 flex items-center gap-2 flex-wrap text-sm">
          <span className="text-[10px] uppercase tracking-widest text-muted flex items-center gap-1.5"><CalendarRange className="size-3" /> Range</span>
          <input type="date" value={since} onChange={(e) => setSince(e.target.value)} className="bg-surface-2 border border-border rounded-lg px-2.5 py-1 text-sm outline-none focus:border-emerald" />
          <span className="text-muted">→</span>
          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="bg-surface-2 border border-border rounded-lg px-2.5 py-1 text-sm outline-none focus:border-emerald" />
        </div>

        {/* Kind chips */}
        {distinctKinds.length > 0 && (
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-muted mb-1.5">Kinds</label>
            <div className="flex gap-1.5 flex-wrap">
              {distinctKinds.map((k) => {
                const selected = selectedKinds.has(k);
                return (
                  <button
                    key={k}
                    onClick={() => setSelectedKinds((cur) => {
                      const next = new Set(cur);
                      if (next.has(k)) next.delete(k); else next.add(k);
                      return next;
                    })}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition ${selected ? "border-emerald/60 bg-emerald/10 text-emerald" : "border-border text-muted hover:text-foreground"}`}
                  >
                    {k}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {filtersActive && (
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs">
            <span className="text-muted">{activity.length} event{activity.length === 1 ? "" : "s"} match{activity.length === 1 ? "es" : ""}</span>
            <button onClick={clearFilters} className="text-emerald hover:underline inline-flex items-center gap-1">
              <X className="size-3" /> Clear filters
            </button>
          </div>
        )}
      </Card>

      {loading ? (
        <Card className="p-10 flex items-center justify-center"><Loader2 className="size-5 text-emerald animate-spin" /></Card>
      ) : activity.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">
          {filtersActive ? "Nothing matches those filters." : "No activity yet."}
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.label}>
              <h2 className="text-[10px] uppercase tracking-[0.25em] text-muted mb-2">{g.label}</h2>
              <Card className="p-5">
                <WorkspaceActivityList activity={g.items} members={ws.members} />
              </Card>
            </section>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && (offset > 0 || activity.length === PAGE_SIZE) && (
        <div className="mt-6 flex items-center justify-between text-sm">
          <Button variant="ghost" size="sm" onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))} disabled={offset === 0}>
            ← Newer
          </Button>
          <span className="text-xs text-muted">{offset + 1}–{offset + activity.length} of {total ?? "—"}</span>
          <Button variant="ghost" size="sm" onClick={() => setOffset((o) => o + PAGE_SIZE)} disabled={activity.length < PAGE_SIZE}>
            Older →
          </Button>
        </div>
      )}
    </div>
  );
}

function groupByDay(items: WorkspaceActivity[]): { label: string; items: WorkspaceActivity[] }[] {
  if (items.length === 0) return [];
  const byKey = new Map<string, WorkspaceActivity[]>();
  for (const it of items) {
    const d = new Date(it.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const arr = byKey.get(key) ?? [];
    arr.push(it);
    byKey.set(key, arr);
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today.getTime() - 86_400_000);
  return Array.from(byKey.entries()).map(([key, items]) => {
    const d = new Date(items[0].created_at);
    const ds = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    let label: string;
    if (ds.getTime() === today.getTime()) label = "Today";
    else if (ds.getTime() === yesterday.getTime()) label = "Yesterday";
    else label = ds.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: ds.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
    return { label, items };
  });
}
