"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useBuild, BuildVersion } from "@/store/build";
import { useStore } from "@/store";
import { useMe } from "@/store/me";
import { getBuildTemplate } from "@/lib/build-templates";
import { genomeVoiceInstruction } from "@/lib/genome";
import { Markdown } from "@/components/markdown";
import {
  ArrowLeft, Send, Sparkles, Play, RefreshCcw, Download, Copy, Check,
  Maximize2, Minimize2, History, GitBranch, Rocket, Code as CodeIcon,
  MessageSquare, ExternalLink, Brain, Eye, Smartphone, Monitor, Tablet,
} from "lucide-react";

type Tab = "chat" | "code" | "history";
type Device = "phone" | "tablet" | "desktop";

export default function BuildStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { projects, updateCode, appendChat, updateLastAssistant, revertTo, renameProject, hydrated } = useBuild();
  const { user } = useStore();
  const { genome, logActivity, touchConcept } = useMe();

  const [tab, setTab] = useState<Tab>("chat");
  const [device, setDevice] = useState<Device>("phone");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fullscreenPreview, setFullscreenPreview] = useState(false);
  const [editorCode, setEditorCode] = useState("");
  const [previewKey, setPreviewKey] = useState(0);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const project = projects.find((p) => p.id === id);
  const template = project ? getBuildTemplate(project.templateId) : undefined;

  // Sync editor when project loads / external code change happens.
  useEffect(() => {
    if (project) setEditorCode(project.code);
  }, [project?.id, project?.code]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [project?.chat.length, busy]);

  if (!hydrated) {
    return <div className="min-h-[60vh] flex items-center justify-center text-muted text-sm">Loading your build…</div>;
  }
  if (!project) { notFound(); return null; }

  async function send(text?: string) {
    if (!project) return;
    const content = (text ?? prompt).trim();
    if (!content || busy) return;
    setPrompt("");
    appendChat(project.id, "user", content);
    appendChat(project.id, "assistant", "");
    setBusy(true);
    logActivity({ kind: "agent", title: `Build: ${content.slice(0, 60)}`, href: `/studio/build/${project.id}` });
    if (template) touchConcept(template.name, "build", 0.08, template.conceptsTouched);

    try {
      const res = await fetch("/api/build/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: content,
          currentCode: editorCode,
          templateName: template?.name,
          history: project.chat.slice(-6).map((m) => ({ role: m.role, content: m.content })),
          genomeVoice: genomeVoiceInstruction(genome),
          userName: user?.name,
          field: user?.field,
        }),
      });
      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      let acc = "";
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          updateLastAssistant(project.id, acc);
        }
      }
      // Extract the HTML doc from acc (it might have prose before/after; we accept either)
      const html = extractHtml(acc);
      if (html) {
        updateCode(project.id, html, content.slice(0, 80), "ai");
        setEditorCode(html);
        setPreviewKey((k) => k + 1);
      }
    } finally {
      setBusy(false);
    }
  }

  function runPreview() {
    if (!project) return;
    updateCode(project.id, editorCode, "Manual edit", "human");
    setPreviewKey((k) => k + 1);
  }

  function copyCode() {
    navigator.clipboard.writeText(editorCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function downloadCode() {
    if (!project) return;
    const blob = new Blob([editorCode], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function openInNewTab() {
    const blob = new Blob([editorCode], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }

  const deviceWidth = device === "phone" ? 390 : device === "tablet" ? 768 : 1280;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Top bar */}
      <header className="border-b border-border px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link href="/studio/build" className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5 shrink-0">
            <ArrowLeft className="size-3.5" />
          </Link>
          {template && <span className="text-xl shrink-0">{template.emoji}</span>}
          {editingName ? (
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={() => { if (project && draftName.trim()) renameProject(project.id, draftName.trim()); setEditingName(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingName(false); }}
              className="bg-surface-2 border border-emerald/40 rounded px-2 py-1 text-sm font-medium outline-none min-w-0 flex-1 max-w-xs"
            />
          ) : (
            <button onClick={() => { setDraftName(project.name); setEditingName(true); }} className="font-medium text-sm truncate hover:text-emerald transition" title="Click to rename">
              {project.name}
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={copyCode} title="Copy code" className="size-8 rounded-lg text-muted hover:text-foreground hover:bg-surface-2 flex items-center justify-center transition">
            {copied ? <Check className="size-4 text-emerald" /> : <Copy className="size-4" />}
          </button>
          <button onClick={downloadCode} title="Download .html" className="size-8 rounded-lg text-muted hover:text-foreground hover:bg-surface-2 flex items-center justify-center transition">
            <Download className="size-4" />
          </button>
          <button onClick={openInNewTab} title="Open standalone" className="size-8 rounded-lg text-muted hover:text-foreground hover:bg-surface-2 flex items-center justify-center transition">
            <ExternalLink className="size-4" />
          </button>
          <button onClick={() => alert("Hook this up to a deploy provider — see /studio/build for the deployment lesson.")} title="Deploy" className="ml-1 px-3 py-1.5 rounded-lg bg-emerald text-black text-xs font-semibold hover:bg-amber transition flex items-center gap-1.5">
            <Rocket className="size-3.5" /> Deploy
          </button>
        </div>
      </header>

      {/* Split layout */}
      <div className="flex-1 grid lg:grid-cols-2 overflow-hidden">
        {/* LEFT: tabs (chat / code / history) */}
        <div className={`flex flex-col border-r border-border min-h-0 ${fullscreenPreview ? "hidden" : ""}`}>
          <div className="border-b border-border px-3 py-2 flex items-center gap-1">
            {(["chat", "code", "history"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5 ${tab === t ? "bg-emerald/15 text-emerald" : "text-muted hover:text-foreground"}`}
              >
                {t === "chat" && <MessageSquare className="size-3.5" />}
                {t === "code" && <CodeIcon className="size-3.5" />}
                {t === "history" && <History className="size-3.5" />}
                {t === "chat" ? "Build with Sage" : t === "code" ? "Code" : `Versions (${project.versions.length})`}
              </button>
            ))}
          </div>

          {/* Chat tab */}
          {tab === "chat" && (
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                {project.chat.length === 0 && template && (
                  <div className="space-y-4">
                    <div className="flex items-start gap-2.5">
                      <div className="size-8 rounded-xl bg-gradient-to-br from-emerald to-emerald-deep flex items-center justify-center shrink-0 mt-0.5">
                        <Brain className="size-4 text-black" />
                      </div>
                      <div className="text-sm leading-relaxed text-foreground/95">
                        Akwaaba. We&apos;re starting with the <span className="text-emerald">{template.name}</span> template. The starter is rendering on the right.
                        <br /><br />
                        Tell me what you want to change or add. Examples:
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {template.extensionIdeas.slice(0, 4).map((idea) => (
                        <button key={idea} onClick={() => send(idea)} className="block w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:border-emerald/40 hover:bg-surface-2 transition">
                          {idea}
                        </button>
                      ))}
                    </div>
                    {template.conceptsTouched.length > 0 && (
                      <div className="pt-3 border-t border-border">
                        <div className="text-[10px] uppercase tracking-widest text-muted mb-2">Concepts you&apos;ll touch</div>
                        <div className="flex flex-wrap gap-1.5">
                          {template.conceptsTouched.map((c) => (
                            <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 border border-border text-muted">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {project.chat.map((m, i) => (
                  <ChatBubble key={m.id} role={m.role} content={m.content} busy={busy && i === project.chat.length - 1 && m.role === "assistant"} />
                ))}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); send(); }} className="border-t border-border p-3">
                <div className="glass rounded-xl flex items-end gap-2 p-2 pl-3">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                    placeholder={busy ? "Sage is building…" : "Tell Sage what to build or change…"}
                    rows={2}
                    disabled={busy}
                    className="flex-1 bg-transparent resize-none outline-none py-1.5 placeholder:text-muted text-foreground text-sm max-h-40"
                  />
                  <button type="submit" disabled={busy || !prompt.trim()} className="size-9 rounded-lg bg-emerald text-black hover:bg-amber disabled:opacity-30 transition flex items-center justify-center">
                    <Send className="size-4" />
                  </button>
                </div>
                <div className="mt-1.5 text-[10px] text-muted px-1">Sage will rewrite the whole HTML file on each turn. Use the Code tab if you want to hand-edit.</div>
              </form>
            </>
          )}

          {/* Code tab */}
          {tab === "code" && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-3 py-2 border-b border-border flex items-center justify-between text-xs">
                <span className="text-muted">index.html · {editorCode.length.toLocaleString()} chars</span>
                <button onClick={runPreview} className="px-3 py-1 rounded-full bg-emerald text-black font-medium flex items-center gap-1 hover:bg-amber transition">
                  <Play className="size-3" /> Run
                </button>
              </div>
              <textarea
                value={editorCode}
                onChange={(e) => setEditorCode(e.target.value)}
                onKeyDown={(e) => {
                  // Allow tab to indent
                  if (e.key === "Tab") {
                    e.preventDefault();
                    const t = e.target as HTMLTextAreaElement;
                    const s = t.selectionStart, en = t.selectionEnd;
                    const v = t.value;
                    t.value = v.substring(0, s) + "  " + v.substring(en);
                    t.selectionStart = t.selectionEnd = s + 2;
                    setEditorCode(t.value);
                  }
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    runPreview();
                  }
                }}
                spellCheck={false}
                className="flex-1 bg-[#06100d] text-foreground/95 font-[family-name:var(--font-mono)] text-[12px] leading-[1.6] p-4 outline-none resize-none w-full"
              />
              <div className="px-3 py-1.5 border-t border-border text-[10px] text-muted">⌘↵ to run · Tab to indent</div>
            </div>
          )}

          {/* History tab */}
          {tab === "history" && (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {project.versions.slice().reverse().map((v) => (
                <VersionRow key={v.id} v={v} isCurrent={v.code === project.code} onRevert={() => revertTo(project.id, v.id)} />
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: preview */}
        <div className={`flex flex-col bg-[#06100d] min-h-0 ${fullscreenPreview ? "col-span-2" : ""}`}>
          <div className="px-3 py-2 border-b border-border flex items-center justify-between bg-background/60">
            <div className="flex items-center gap-1">
              <Eye className="size-3.5 text-muted" />
              <span className="text-xs text-muted">Live preview</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setDevice("phone")} title="Phone" className={`size-7 rounded-md flex items-center justify-center transition ${device === "phone" ? "bg-emerald/15 text-emerald" : "text-muted hover:text-foreground hover:bg-surface-2"}`}>
                <Smartphone className="size-3.5" />
              </button>
              <button onClick={() => setDevice("tablet")} title="Tablet" className={`size-7 rounded-md flex items-center justify-center transition ${device === "tablet" ? "bg-emerald/15 text-emerald" : "text-muted hover:text-foreground hover:bg-surface-2"}`}>
                <Tablet className="size-3.5" />
              </button>
              <button onClick={() => setDevice("desktop")} title="Desktop" className={`size-7 rounded-md flex items-center justify-center transition ${device === "desktop" ? "bg-emerald/15 text-emerald" : "text-muted hover:text-foreground hover:bg-surface-2"}`}>
                <Monitor className="size-3.5" />
              </button>
              <div className="w-px h-4 bg-border mx-1" />
              <button onClick={() => setPreviewKey((k) => k + 1)} title="Reload preview" className="size-7 rounded-md text-muted hover:text-foreground hover:bg-surface-2 flex items-center justify-center transition">
                <RefreshCcw className="size-3.5" />
              </button>
              <button onClick={() => setFullscreenPreview((f) => !f)} title={fullscreenPreview ? "Split view" : "Full width"} className="size-7 rounded-md text-muted hover:text-foreground hover:bg-surface-2 flex items-center justify-center transition">
                {fullscreenPreview ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 flex items-start justify-center">
            <div
              className="bg-white rounded-lg overflow-hidden shadow-2xl transition-all"
              style={{ width: Math.min(deviceWidth, 100000), maxWidth: "100%", height: device === "phone" ? 780 : device === "tablet" ? 900 : "auto", minHeight: device === "desktop" ? 600 : undefined }}
            >
              <iframe
                key={previewKey}
                title="preview"
                srcDoc={project.code}
                sandbox="allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox"
                className="w-full h-full border-0"
                style={{ minHeight: device === "phone" ? 780 : 600 }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ role, content, busy }: { role: "user" | "assistant"; content: string; busy: boolean }) {
  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-emerald/15 border border-emerald/30 rounded-2xl rounded-tr-sm px-3 py-2 text-sm">
          {content}
        </div>
      </div>
    );
  }
  // Assistant: usually the response is the full HTML doc. Don't render that as markdown — show a status pill.
  const isHtml = /<!doctype|<html/i.test(content);
  return (
    <div className="flex items-start gap-2.5">
      <div className="size-8 rounded-xl bg-gradient-to-br from-emerald to-emerald-deep flex items-center justify-center shrink-0">
        <Brain className="size-4 text-black" />
      </div>
      <div className="flex-1 min-w-0">
        {isHtml ? (
          <div className="text-sm">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald/10 border border-emerald/30 text-emerald text-xs">
              <Sparkles className="size-3" /> Updated the preview · {content.length.toLocaleString()} chars
            </div>
            {busy && (
              <div className="mt-2 flex gap-1">
                <span className="size-1.5 rounded-full bg-emerald animate-pulse" />
                <span className="size-1.5 rounded-full bg-emerald animate-pulse" style={{ animationDelay: "0.15s" }} />
                <span className="size-1.5 rounded-full bg-emerald animate-pulse" style={{ animationDelay: "0.3s" }} />
              </div>
            )}
          </div>
        ) : content.length === 0 && busy ? (
          <div className="text-xs text-muted italic flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-emerald animate-pulse" />
            Sage is writing the code…
          </div>
        ) : (
          <div className="text-sm">
            <Markdown src={content} />
          </div>
        )}
      </div>
    </div>
  );
}

function VersionRow({ v, isCurrent, onRevert }: { v: BuildVersion; isCurrent: boolean; onRevert: () => void }) {
  return (
    <div className={`p-3 rounded-xl border ${isCurrent ? "border-emerald/40 bg-emerald/5" : "border-border bg-surface-2/40"} flex items-center gap-3`}>
      <GitBranch className={`size-4 ${isCurrent ? "text-emerald" : "text-muted"}`} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{v.note || "(no note)"}</div>
        <div className="text-[10px] text-muted">{v.source} · {new Date(v.ts).toLocaleTimeString()} · {v.code.length.toLocaleString()} chars</div>
      </div>
      {!isCurrent && (
        <button onClick={onRevert} className="text-xs text-emerald hover:underline">Revert</button>
      )}
      {isCurrent && <span className="text-[10px] text-emerald uppercase tracking-widest">current</span>}
    </div>
  );
}

// Extract the HTML document from a model response that may contain prose before/after.
function extractHtml(text: string): string | null {
  // Strip fenced code blocks
  const fence = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : text;
  const start = candidate.search(/<!doctype/i);
  if (start < 0) return null;
  const end = candidate.toLowerCase().lastIndexOf("</html>");
  if (end < 0) return null;
  return candidate.substring(start, end + "</html>".length).trim();
}
