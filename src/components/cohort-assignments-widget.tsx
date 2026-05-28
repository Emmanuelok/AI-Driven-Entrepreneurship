"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase";
import { Card, Badge } from "@/components/ui";
import { GraduationCap, Calendar, BookOpen, FlaskConical, Hammer, Rocket, Globe2, ClipboardList, ArrowRight } from "lucide-react";
import { format, isPast } from "date-fns";

// Dashboard widget: every assignment across every cohort the student
// belongs to, sorted by due date. Hidden when:
//   - The student isn't signed in to cloud (local-only experience)
//   - They aren't in any cohorts
//   - There are no assignments
// Best-effort: never breaks the dashboard if Supabase is unreachable.

type CohortRow = { id: string; name: string; role: "owner" | "instructor" | "student" };
type Assignment = {
  id: string;
  kind: "lesson" | "track" | "problem" | "build" | "venture" | "free";
  target_id: string | null;
  title: string;
  description: string | null;
  due_at: string | null;
};

type Item = Assignment & { cohortId: string; cohortName: string; status: "not_started" | "in_progress" | "completed" | "submitted" };

const STATUS_DOT: Record<Item["status"], string> = {
  not_started: "bg-muted/40",
  in_progress: "bg-amber",
  completed: "bg-emerald",
  submitted: "bg-indigo",
};
const STATUS_LABEL: Record<Item["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  submitted: "Submitted",
};

const ICON = { lesson: BookOpen, track: FlaskConical, problem: Globe2, build: Hammer, venture: Rocket, free: ClipboardList } as const;

export function CohortAssignmentsWidget() {
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const sb = supabaseBrowser();
        if (!sb) return;
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return;
        const headers = { Authorization: `Bearer ${session.access_token}` };

        const cRes = await fetch("/api/v2/cohorts", { headers });
        const cData = await cRes.json();
        const cohorts: CohortRow[] = (cData.results ?? []).filter((c: CohortRow) => c.role === "student");
        if (cohorts.length === 0) { setItems([]); return; }

        const all = await Promise.all(cohorts.map(async (c) => {
          const [aRes, pRes] = await Promise.all([
            fetch(`/api/v2/cohorts/${c.id}/assignments`, { headers }),
            fetch(`/api/v2/cohorts/${c.id}/progress`, { headers }),
          ]);
          const aData = await aRes.json();
          const pData = await pRes.json();
          const status = new Map<string, Item["status"]>();
          for (const r of (pData.results ?? []) as Array<{ assignment_id: string; status: Item["status"] }>) {
            status.set(r.assignment_id, r.status);
          }
          return ((aData.results ?? []) as Assignment[]).map((a) => ({
            ...a,
            cohortId: c.id,
            cohortName: c.name,
            status: status.get(a.id) ?? "not_started",
          }));
        }));
        const merged = all.flat();
        merged.sort((a, b) => {
          // Items with a due date first, ordered by due. Items without due go last.
          if (a.due_at && b.due_at) return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
          if (a.due_at) return -1;
          if (b.due_at) return 1;
          return 0;
        });
        // Hide items the student has already marked completed/submitted so
        // the dashboard stays a "what's next" list, not a history view.
        const pending = merged.filter((m) => m.status === "not_started" || m.status === "in_progress");
        setItems(pending.slice(0, 6));
      } catch {
        // Silent — dashboard keeps working.
      }
    })();
  }, []);

  if (items === null || items.length === 0) return null;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs uppercase tracking-[0.22em] text-emerald flex items-center gap-1.5">
          <GraduationCap className="size-3" /> Cohort assignments
        </h3>
        <Link href="/studio/cohorts" className="text-[10px] uppercase tracking-widest text-muted hover:text-emerald">All cohorts →</Link>
      </div>
      <ul className="space-y-1.5">
        {items.map((a) => {
          const Icon = ICON[a.kind];
          const overdue = a.due_at ? isPast(new Date(a.due_at)) : false;
          const targetHref =
            a.kind === "lesson" || a.kind === "track" ? `/studio/learn${a.target_id ? `/${a.target_id}` : ""}` :
            a.kind === "problem" ? `/studio/problems${a.target_id ? `/${a.target_id}` : ""}` :
            a.kind === "build" ? `/studio/build${a.target_id ? `/${a.target_id}` : ""}` :
            a.kind === "venture" ? `/studio/venture${a.target_id ? `/${a.target_id}` : ""}` :
            `/studio/cohorts/${a.cohortId}`;
          return (
            <li key={a.id}>
              <Link href={targetHref} className="block px-3 py-2.5 rounded-xl border border-border hover:border-emerald/40 transition group">
                <div className="flex items-start gap-3">
                  <Icon className="size-4 text-emerald shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-sm font-medium truncate">{a.title}</span>
                      {overdue && <Badge color="rust">overdue</Badge>}
                    </div>
                    <div className="text-[10px] text-muted flex items-center gap-2 flex-wrap">
                      <span className="truncate">{a.cohortName}</span>
                      <span className="inline-flex items-center gap-1" title={STATUS_LABEL[a.status]}>
                        <span className={`size-1.5 rounded-full ${STATUS_DOT[a.status]}`} />
                        {STATUS_LABEL[a.status]}
                      </span>
                      {a.due_at && (
                        <span className={`inline-flex items-center gap-1 ${overdue ? "text-rust" : ""}`}>
                          <Calendar className="size-2.5" /> {format(new Date(a.due_at), "MMM d")}
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="size-3.5 text-muted opacity-0 group-hover:opacity-100 transition" />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
