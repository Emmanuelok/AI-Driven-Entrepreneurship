"use client";

import { supabaseBrowser } from "@/lib/supabase";
import { useStore } from "@/store";
import { useBuild } from "@/store/build";
import { useSketch } from "@/store/sketch";
import { useEffect, useRef } from "react";

// Background indexer that keeps the user's search_index table in sync
// with their local stores. Watches zustand for changes, debounces, and
// pushes new/changed artifacts to /api/search/embed.
//
// What gets indexed:
//   - Each venture: name + tagline + each filled Lean Canvas block
//   - Each interview: name/role + notes (the gold)
//   - Each build project: name + description
//   - Each brainstorm board: title + prompt + stickies + text
//
// What doesn't get indexed: AI-generated body content (deck slides,
// synthesizer output) — those are derivable from the seeds above.

const DEBOUNCE_MS = 8_000;
const MAX_BATCH = 60;

type IndexItem = { kind: string; refId: string; refUrl?: string; title?: string; body: string };

// Hash the body so we don't push unchanged items repeatedly.
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function SearchIndexer() {
  const ventures = useStore((s) => s.ventures);
  const builds = useBuild((s) => s.projects);
  const boards = useSketch((s) => s.boards);
  const seenHashes = useRef<Map<string, string>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function buildBatch(): IndexItem[] {
      const items: IndexItem[] = [];

      for (const v of ventures) {
        items.push({
          kind: "venture",
          refId: v.id,
          refUrl: `/studio/venture/${v.id}`,
          title: v.name,
          body: `${v.name}. ${v.tagline}. ${v.region ?? ""}. ${Object.values(v.canvas ?? {}).join(" ")}`.slice(0, 4000),
        });
        for (const iv of v.interviews ?? []) {
          items.push({
            kind: "interview",
            refId: `${v.id}:${iv.id}`,
            refUrl: `/studio/venture/${v.id}/discover`,
            title: `${iv.name} — ${iv.role}`,
            body: `${iv.name} (${iv.role}) [${iv.verdict}]: ${iv.notes}`.slice(0, 4000),
          });
        }
      }
      for (const b of builds) {
        items.push({
          kind: "build",
          refId: b.id,
          refUrl: `/studio/build/${b.id}`,
          title: b.name,
          body: `${b.name}. ${b.description}. Template: ${b.templateId}.`.slice(0, 4000),
        });
      }
      for (const board of boards) {
        const notes = board.elements.flatMap((el) => {
          if (el.kind === "sticky" || el.kind === "text") return el.text ? [el.text] : [];
          if (el.kind === "frame") return el.label ? [el.label] : [];
          return [];
        }).slice(0, 30).join(" · ");
        items.push({
          kind: "brainstorm",
          refId: board.id,
          refUrl: `/studio/brainstorm/${board.id}`,
          title: board.title,
          body: `${board.title}. ${board.prompt}. ${notes}`.slice(0, 4000),
        });
      }

      // Only items whose content has actually changed since last push.
      const changed: IndexItem[] = [];
      for (const it of items) {
        const key = `${it.kind}:${it.refId}`;
        const h = hash(it.body);
        if (seenHashes.current.get(key) !== h) {
          changed.push(it);
          seenHashes.current.set(key, h);
          if (changed.length >= MAX_BATCH) break;
        }
      }
      return changed;
    }

    async function push() {
      const sb = supabaseBrowser();
      if (!sb) return; // local-only — search is disabled
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return; // signed out

      const items = buildBatch();
      if (items.length === 0) return;

      try {
        await fetch("/api/search/embed", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ items }),
        });
      } catch { /* indexing is best-effort */ }
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(push, DEBOUNCE_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [ventures, builds, boards]);

  return null;
}
