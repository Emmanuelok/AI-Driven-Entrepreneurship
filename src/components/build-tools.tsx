"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Dialog, Input, Button, Badge } from "@/components/ui";
import { SNIPPETS, searchSnippets, snippetsByCategory, Snippet } from "@/lib/build-snippets";
import { Search, Sparkles, Wrench, Terminal, AlertCircle, Info, X, Share2, Smartphone, ImageIcon, Wand2, RefreshCcw, Copy, Check } from "lucide-react";

/* ──────────────────────────────────────────────────────────────────────────
   CONSOLE PANEL — captures console.log / errors from the preview iframe
   via postMessage, surfaces them to the student, and lets them
   one-click "Fix with Sage."
   ──────────────────────────────────────────────────────────────────────── */

export type ConsoleEntry = { id: string; level: "log" | "warn" | "error"; text: string; ts: number };

export function BuildConsole({ entries, onClear, onFix }: { entries: ConsoleEntry[]; onClear: () => void; onFix: (errorText: string) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [entries.length]);

  const errors = entries.filter((e) => e.level === "error").length;
  const warns = entries.filter((e) => e.level === "warn").length;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <Terminal className="size-3.5 text-muted" />
          <span className="text-muted">Console</span>
          {errors > 0 && <span className="text-rust">{errors} error{errors > 1 ? "s" : ""}</span>}
          {warns > 0 && <span className="text-amber">{warns} warning{warns > 1 ? "s" : ""}</span>}
          <span className="text-muted/70">· {entries.length} logs</span>
        </div>
        <button onClick={onClear} className="text-muted hover:text-foreground transition flex items-center gap-1"><RefreshCcw className="size-3" /> Clear</button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-1 font-[family-name:var(--font-mono)] text-[11.5px] leading-snug bg-[#06100d]">
        {entries.length === 0 && (
          <div className="text-muted/70 italic px-2 py-3">No output yet. console.log() and errors from your preview will show here.</div>
        )}
        {entries.map((e) => (
          <div key={e.id} className={`group flex items-start gap-2 px-2 py-1 rounded ${e.level === "error" ? "bg-rust/10 text-rust" : e.level === "warn" ? "bg-amber/10 text-amber" : "text-foreground/80 hover:bg-surface-2"}`}>
            {e.level === "error" ? <AlertCircle className="size-3 shrink-0 mt-0.5" /> : e.level === "warn" ? <AlertCircle className="size-3 shrink-0 mt-0.5" /> : <Info className="size-3 shrink-0 mt-0.5 opacity-50" />}
            <div className="flex-1 min-w-0 break-words whitespace-pre-wrap">{e.text}</div>
            {e.level === "error" && (
              <button onClick={() => onFix(e.text)} className="opacity-0 group-hover:opacity-100 transition text-[10px] uppercase tracking-widest text-emerald bg-emerald/10 border border-emerald/30 px-2 py-0.5 rounded-full whitespace-nowrap">
                <Wand2 className="size-3 inline mr-1" /> Fix with Sage
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* The script the preview iframe runs to forward console output to the parent. */
export const CONSOLE_BRIDGE = `<script>
(function(){
  if (window.__sankofaBridgeInstalled) return;
  window.__sankofaBridgeInstalled = true;
  function send(level, args) {
    try {
      var text = Array.from(args).map(function(a){
        if (a === null || a === undefined) return String(a);
        if (typeof a === 'object') { try { return JSON.stringify(a, null, 2); } catch { return String(a); } }
        return String(a);
      }).join(' ');
      parent.postMessage({ __sankofa: true, level: level, text: text }, '*');
    } catch (e) {}
  }
  ['log','warn','error','info','debug'].forEach(function(k){
    var orig = console[k].bind(console);
    console[k] = function(){
      var lvl = (k === 'warn' || k === 'error') ? k : (k === 'info' ? 'log' : k);
      if (lvl !== 'debug') send(lvl === 'info' ? 'log' : lvl, arguments);
      orig.apply(console, arguments);
    };
  });
  window.addEventListener('error', function(e){
    send('error', [e.message + ' (' + (e.filename || 'inline') + ':' + (e.lineno||0) + ':' + (e.colno||0) + ')']);
  });
  window.addEventListener('unhandledrejection', function(e){
    send('error', ['Unhandled promise rejection: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason))]);
  });
})();
</script>`;

/** Injects the bridge script as early as possible into the user's HTML. */
export function injectConsoleBridge(html: string): string {
  if (!html.includes("<head>") && !html.includes("<head ")) return CONSOLE_BRIDGE + html;
  return html.replace(/<head([^>]*)>/i, (m) => m + CONSOLE_BRIDGE);
}

/* ──────────────────────────────────────────────────────────────────────────
   SNIPPET LIBRARY DIALOG — students one-click to drop a capability into
   their build (sends a tailored prompt to Sage).
   ──────────────────────────────────────────────────────────────────────── */

export function SnippetLibrary({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (s: Snippet) => void }) {
  const [q, setQ] = useState("");
  const results = searchSnippets(q);
  const grouped = snippetsByCategory();

  return (
    <Dialog open={open} onClose={onClose} title="Add a capability" size="lg">
      <p className="text-sm text-muted mb-3">Click any capability to ask Sage to wire it into your build.</p>
      <div className="flex items-center gap-2 bg-surface-2 border border-border rounded-xl px-3 py-2 mb-4">
        <Search className="size-4 text-muted" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: voice, vision, map, arduino…" className="flex-1 bg-transparent outline-none text-sm" />
      </div>
      <div className="max-h-[60vh] overflow-y-auto space-y-5">
        {q ? (
          <div className="grid sm:grid-cols-2 gap-2">
            {results.map((s) => <SnippetCard key={s.id} s={s} onPick={onPick} />)}
            {results.length === 0 && <p className="text-sm text-muted italic">Nothing matches "{q}". Try fewer words.</p>}
          </div>
        ) : (
          Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <div className="text-[10px] uppercase tracking-widest text-emerald mb-2">{cat}</div>
              <div className="grid sm:grid-cols-2 gap-2">
                {items.map((s) => <SnippetCard key={s.id} s={s} onPick={onPick} />)}
              </div>
            </div>
          ))
        )}
      </div>
    </Dialog>
  );
}

function SnippetCard({ s, onPick }: { s: Snippet; onPick: (s: Snippet) => void }) {
  return (
    <button onClick={() => onPick(s)} className="text-left p-3 rounded-xl border border-border hover:border-emerald/40 hover:bg-surface-2 transition group">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xl">{s.emoji}</div>
        <Sparkles className="size-3 text-muted opacity-0 group-hover:opacity-100 transition" />
      </div>
      <div className="font-medium text-sm">{s.name}</div>
      <div className="text-xs text-muted mt-1 line-clamp-2">{s.description}</div>
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   SHARE DIALOG — QR for mobile, copy link, copy raw HTML.
   ──────────────────────────────────────────────────────────────────────── */

export function ShareDialog({ open, onClose, html, projectName }: { open: boolean; onClose: () => void; html: string; projectName: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "html" | null>(null);
  const [pageUrl, setPageUrl] = useState("");

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    setPageUrl(window.location.href);
    QRCode.toDataURL(window.location.href, { width: 260, color: { dark: "#e7efe9", light: "#0a0f0d" }, margin: 1 }).then(setQr).catch(() => setQr(null));
  }, [open]);

  function copy(what: "link" | "html") {
    navigator.clipboard.writeText(what === "link" ? pageUrl : html);
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  }

  function downloadStandalone() {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${projectName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.html`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Share your build" size="md">
      <div className="space-y-5">
        <div className="text-sm text-muted">
          Three ways to share what you&apos;ve built — open it on your phone, send the studio URL to a friend, or download the standalone file.
        </div>

        <div className="grid sm:grid-cols-[180px_1fr] gap-4 items-start">
          <div className="bg-[#06100d] border border-border rounded-2xl p-3 flex items-center justify-center aspect-square">
            {qr ? (
              <img src={qr} alt="QR" className="w-full h-full object-contain" />
            ) : (
              <div className="size-12 rounded-full bg-emerald/15 animate-pulse" />
            )}
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-emerald mb-1.5 flex items-center gap-1.5">
              <Smartphone className="size-3.5" /> Open on your phone
            </div>
            <div className="text-sm text-muted leading-relaxed">Scan with your phone&apos;s camera to open the studio there. Useful for testing touch + camera + GPS on a real device.</div>
          </div>
        </div>

        <div className="space-y-2">
          <button onClick={() => copy("link")} className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border bg-surface-2 hover:border-emerald/40 transition group">
            <div className="text-left min-w-0">
              <div className="text-xs uppercase tracking-widest text-muted">Studio URL</div>
              <div className="text-sm truncate">{pageUrl}</div>
            </div>
            {copied === "link" ? <Check className="size-4 text-emerald shrink-0" /> : <Copy className="size-4 text-muted group-hover:text-foreground shrink-0" />}
          </button>
          <button onClick={() => copy("html")} className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border bg-surface-2 hover:border-emerald/40 transition group">
            <div className="text-left min-w-0">
              <div className="text-xs uppercase tracking-widest text-muted">Raw HTML</div>
              <div className="text-sm">Copy the full source ({html.length.toLocaleString()} chars)</div>
            </div>
            {copied === "html" ? <Check className="size-4 text-emerald shrink-0" /> : <Copy className="size-4 text-muted group-hover:text-foreground shrink-0" />}
          </button>
          <button onClick={downloadStandalone} className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border bg-surface-2 hover:border-emerald/40 transition group">
            <div className="text-left">
              <div className="text-xs uppercase tracking-widest text-muted">Standalone file</div>
              <div className="text-sm">Download .html — runs anywhere with no server</div>
            </div>
            <Share2 className="size-4 text-muted group-hover:text-foreground" />
          </button>
        </div>

        <div className="p-3 rounded-xl bg-amber/5 border border-amber/30 text-xs text-muted leading-relaxed">
          <span className="text-amber font-medium">Tip:</span> For a public URL anyone can hit (not just you), run through the <span className="text-emerald">/studio/ship-it</span> Vercel-deploy lesson — 5 minutes from here to a real domain.
        </div>
      </div>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   IMAGE-TO-BUILD DIALOG — paste a screenshot, Sage rebuilds the UI.
   ──────────────────────────────────────────────────────────────────────── */

export function ImageToBuildDialog({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (imageDataUrl: string, prompt: string) => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setDataUrl(null); setPrompt(""); }
  }, [open]);

  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (!open) return;
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      if (!item) return;
      const file = item.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setDataUrl(reader.result as string);
      reader.readAsDataURL(file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open]);

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Build from an image" size="md">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Paste a screenshot of any UI (Cmd/Ctrl+V) or upload one. Sage will rebuild it in your project — same layout, your design tokens, fully interactive.
        </p>
        {dataUrl ? (
          <div className="relative rounded-2xl overflow-hidden border border-border">
            <img src={dataUrl} alt="reference" className="w-full max-h-[40vh] object-contain bg-[#06100d]" />
            <button onClick={() => setDataUrl(null)} className="absolute top-2 right-2 size-7 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black">
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} className="w-full border-2 border-dashed border-border rounded-2xl p-8 hover:border-emerald/40 transition flex flex-col items-center gap-3">
            <ImageIcon className="size-8 text-muted" />
            <div className="text-sm font-medium">Paste an image, drop a file, or click to choose</div>
            <div className="text-xs text-muted">PNG / JPG / WebP up to 5MB</div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </button>
        )}
        <Input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Optional: any notes, e.g. 'use Twi labels' or 'make it offline-tolerant'" />
        <Button onClick={() => dataUrl && onSubmit(dataUrl, prompt)} disabled={!dataUrl} className="w-full" size="lg">
          <Wand2 className="size-4" /> Rebuild from this image
        </Button>
      </div>
    </Dialog>
  );
}
