"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { useStore } from "@/store";
import { workspaceApi, type WorkspaceMessage, type WorkspaceDoc, type WorkspaceDocMeta, type WorkspaceTask, type TaskStatus } from "@/lib/workspace-api";
import { buildSiteContextSnapshotAsync } from "@/lib/site-brain-snapshot";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ── Discussion ────────────────────────────────────────────────────────
// useWorkspaceMessages(id) — live discussion thread. Loads recent
// messages, subscribes to inserts via a dedicated realtime channel, and
// exposes send() which posts (and, when @sage is summoned, the route
// returns Sage's reply inline — but the realtime insert also delivers
// it, so we de-dupe by id).
export function useWorkspaceMessages(id: string | null) {
  const { user } = useStore();
  const [messages, setMessages] = useState<WorkspaceMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [agentThinking, setAgentThinking] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());

  const merge = useCallback((incoming: WorkspaceMessage[]) => {
    setMessages((prev) => {
      const next = [...prev];
      for (const m of incoming) {
        if (seenIds.current.has(m.id)) continue;
        seenIds.current.add(m.id);
        next.push(m);
      }
      next.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return next;
    });
  }, []);

  // Initial load.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    seenIds.current = new Set();
    setMessages([]);
    (async () => {
      const res = await workspaceApi.listMessages(id);
      if (cancelled) return;
      if (res.ok) merge(res.results);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, merge]);

  // Realtime inserts.
  useEffect(() => {
    if (!id || !user) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    const ch = sb.channel(`workspace-msgs:${id}`);
    ch.on("postgres_changes" as never, { event: "INSERT", schema: "public", table: "workspace_messages", filter: `workspace_id=eq.${id}` }, (payload: { new: WorkspaceMessage }) => {
      if (payload.new) merge([payload.new]);
      if (payload.new?.is_agent) setAgentThinking(false);
    });
    ch.subscribe();
    return () => { void sb.removeChannel(ch); };
  }, [id, user?.id, merge]);

  const send = useCallback(async (body: string): Promise<boolean> => {
    if (!id || !body.trim()) return false;
    setSending(true);
    // If the message summons Sage, show a thinking indicator until the
    // agent reply lands (via the POST response or realtime, whichever
    // first).
    const summonsSageLocal = /(^|[^a-z0-9_])@sage(\b)/i.test(body);
    if (summonsSageLocal) setAgentThinking(true);
    const siteContext = summonsSageLocal ? await buildSiteContextSnapshotAsync("workspace-discuss") : undefined;
    const res = await workspaceApi.sendMessage(id, body.trim(), siteContext);
    setSending(false);
    if (!res.ok) { setAgentThinking(false); return false; }
    merge([res.message, ...(res.agentReply ? [res.agentReply] : [])]);
    if (res.agentReply || !summonsSageLocal) setAgentThinking(false);
    return true;
  }, [id, merge]);

  return { messages, loading, sending, agentThinking, send };
}

// ── Notes ─────────────────────────────────────────────────────────────
// useWorkspaceDoc(id, docId) — load one note + autosave. Debounced 1.2s
// after the last keystroke. Handles the version-conflict 409 by pulling
// the winning copy and surfacing a conflict flag so the UI can warn
// before overwriting.
export function useWorkspaceDoc(workspaceId: string | null, docId: string | null) {
  const [doc, setDoc] = useState<WorkspaceDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "conflict" | "error">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<{ title: string; body: string } | null>(null);

  useEffect(() => {
    if (!workspaceId || !docId) { setDoc(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const res = await workspaceApi.getDoc(workspaceId, docId);
      if (cancelled) return;
      if (res.ok) { setDoc(res.doc); latestRef.current = { title: res.doc.title, body: res.doc.body }; }
      setLoading(false);
    })();
    return () => { cancelled = true; if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [workspaceId, docId]);

  // Realtime: if a PEER saves, pull their version in (unless we have
  // unsaved local edits in flight, in which case we leave the conflict
  // detection to the save round-trip).
  useEffect(() => {
    if (!workspaceId || !docId) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    const ch = sb.channel(`workspace-doc:${docId}`);
    ch.on("postgres_changes" as never, { event: "UPDATE", schema: "public", table: "workspace_docs", filter: `id=eq.${docId}` }, (payload: { new: WorkspaceDoc }) => {
      const incoming = payload.new;
      if (!incoming) return;
      setDoc((cur) => {
        if (!cur) return incoming;
        // Only adopt a strictly-newer version, and only when we're not
        // mid-edit on a diverging body.
        if (incoming.version > cur.version && saveState !== "saving") {
          latestRef.current = { title: incoming.title, body: incoming.body };
          return incoming;
        }
        return cur;
      });
    });
    ch.subscribe();
    return () => { void sb.removeChannel(ch); };
  }, [workspaceId, docId, saveState]);

  const queueSave = useCallback((next: { title?: string; body?: string }) => {
    if (!workspaceId || !docId) return;
    setDoc((cur) => (cur ? { ...cur, ...next } : cur));
    latestRef.current = { title: next.title ?? latestRef.current?.title ?? "", body: next.body ?? latestRef.current?.body ?? "" };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const cur = latestRef.current;
      setDoc((d) => {
        if (!d || !cur) return d;
        void (async () => {
          setSaveState("saving");
          const res = await workspaceApi.saveDoc(workspaceId, docId, { title: cur.title, body: cur.body, version: d.version });
          if (res.ok) {
            setDoc(res.doc);
            latestRef.current = { title: res.doc.title, body: res.doc.body };
            setSaveState("saved");
            setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
          } else if ((res as { error?: string }).error === "version_conflict") {
            setSaveState("conflict");
          } else {
            setSaveState("error");
          }
        })();
        return d;
      });
    }, 1200);
  }, [workspaceId, docId]);

  // Force-pull the winning copy after a conflict (discarding local edits).
  const reload = useCallback(async () => {
    if (!workspaceId || !docId) return;
    const res = await workspaceApi.getDoc(workspaceId, docId);
    if (res.ok) { setDoc(res.doc); latestRef.current = { title: res.doc.title, body: res.doc.body }; setSaveState("idle"); }
  }, [workspaceId, docId]);

  return { doc, loading, saveState, queueSave, reload };
}

// ── Tasks (Kanban) ────────────────────────────────────────────────────
// useWorkspaceTasks(id) — live board. Loads all tasks, subscribes to
// realtime changes, and exposes optimistic mutators so dragging/moving a
// card feels instant (the realtime echo reconciles to server truth).
export function useWorkspaceTasks(id: string | null) {
  const { user } = useStore();
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!id) return;
    const res = await workspaceApi.listTasks(id);
    if (res.ok) setTasks(res.results);
    setLoading(false);
  }, [id]);

  useEffect(() => { setLoading(true); void refresh(); }, [refresh]);

  useEffect(() => {
    if (!id || !user) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    const ch = sb.channel(`workspace-tasks:${id}`);
    ch.on("postgres_changes" as never, { event: "*", schema: "public", table: "workspace_tasks", filter: `workspace_id=eq.${id}` }, () => { void refresh(); });
    ch.subscribe();
    return () => { void sb.removeChannel(ch); };
  }, [id, user?.id, refresh]);

  const move = useCallback(async (taskId: string, status: TaskStatus) => {
    if (!id) return;
    // Optimistic: flip status locally, then persist.
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    const res = await workspaceApi.patchTask(id, { id: taskId, status });
    if (res.ok) setTasks((prev) => prev.map((t) => (t.id === res.task.id ? res.task : t)));
    else void refresh();
  }, [id, refresh]);

  const add = useCallback(async (payload: { title: string; detail?: string; status?: TaskStatus; assigneeUserId?: string | null; dueAt?: string | null }) => {
    if (!id) return false;
    const res = await workspaceApi.addTask(id, payload);
    if (res.ok) setTasks((prev) => [...prev, res.task]);
    return res.ok;
  }, [id]);

  const patch = useCallback(async (payload: { id: string; title?: string; detail?: string; assigneeUserId?: string | null; dueAt?: string | null }) => {
    if (!id) return;
    const res = await workspaceApi.patchTask(id, payload);
    if (res.ok) setTasks((prev) => prev.map((t) => (t.id === res.task.id ? res.task : t)));
    else void refresh();
  }, [id, refresh]);

  const remove = useCallback(async (taskId: string) => {
    if (!id) return;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    await workspaceApi.deleteTask(id, taskId);
  }, [id]);

  return { tasks, loading, move, add, patch, remove };
}

export function useWorkspaceDocList(id: string | null) {
  const [docs, setDocs] = useState<WorkspaceDocMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!id) return;
    const res = await workspaceApi.listDocs(id);
    if (res.ok) setDocs(res.results);
    setLoading(false);
  }, [id]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Realtime: keep the list fresh when notes are created/renamed.
  useEffect(() => {
    if (!id) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    const ch = sb.channel(`workspace-doclist:${id}`);
    ch.on("postgres_changes" as never, { event: "*", schema: "public", table: "workspace_docs", filter: `workspace_id=eq.${id}` }, () => { void refresh(); });
    ch.subscribe();
    return () => { void sb.removeChannel(ch); };
  }, [id, refresh]);

  return { docs, loading, refresh };
}
