"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { Dialog, Button, Input, Textarea } from "@/components/ui";
import { Store, Copy, Check, AlertCircle } from "lucide-react";

// Publish a build project to the public marketplace. Author picks a
// slug + tags + (optional) edited title/description. Requires sign-in
// (cloud sync). Returns the public URL on success.

export function PublishBuildButton({ projectId, name, description, code, templateId }: {
  projectId: string;
  name: string;
  description: string;
  code: string;
  templateId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40));
  const [title, setTitle] = useState(name);
  const [desc, setDesc] = useState(description);
  const [tagsRaw, setTagsRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function publish() {
    setBusy(true);
    setError(null);
    setUrl(null);
    try {
      const sb = supabaseBrowser();
      if (!sb) { setError("Cloud sync isn't configured. Set up Supabase to publish."); return; }
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setError("Sign in first to publish."); return; }
      const tags = tagsRaw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);

      const res = await fetch("/api/marketplace/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ buildId: projectId, slug, title, description: desc, code, templateId, tags }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error || "Couldn't publish."); return; }
      setUrl(data.url);
    } finally {
      setBusy(false);
    }
  }

  function copyUrl() {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setUrl(null); setError(null); }}
        className="size-8 rounded-lg text-muted hover:text-emerald hover:bg-surface-2 flex items-center justify-center transition"
        title="Publish to the marketplace"
        aria-label="Publish build to marketplace"
      >
        <Store className="size-4" />
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Publish to the Build Marketplace" size="md">
        <div className="space-y-3">
          <p className="text-sm text-muted leading-relaxed">
            Others can browse, preview, and fork your build into their own studio. They get the
            full code; you keep credit + fork stats. Forks don&apos;t edit your original.
          </p>

          {!url && (
            <>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Slug (public URL)</div>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="cassava-price-scout" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Title</div>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Description</div>
                <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} placeholder="What does it do? Who is it for?" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Tags (comma-separated)</div>
                <Input value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} placeholder="agritech, voice, rag" />
              </div>
              {error && (
                <div className="text-sm text-rust flex items-start gap-1.5">
                  <AlertCircle className="size-3.5 shrink-0 mt-0.5" />{error}
                </div>
              )}
              <div className="flex justify-end">
                <Button onClick={publish} disabled={busy || !slug.trim() || !title.trim()}>
                  <Store className="size-4" /> {busy ? "Publishing…" : "Publish"}
                </Button>
              </div>
            </>
          )}

          {url && (
            <div className="space-y-3">
              <div className="text-[10px] uppercase tracking-widest text-emerald">Published</div>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={url}
                  className="flex-1 bg-surface-2 border border-border rounded-xl px-3 py-2 text-xs font-mono outline-none"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button variant="secondary" onClick={copyUrl}>
                  {copied ? <Check className="size-4 text-emerald" /> : <Copy className="size-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted">Anyone with the link can preview + fork. Share it.</p>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
