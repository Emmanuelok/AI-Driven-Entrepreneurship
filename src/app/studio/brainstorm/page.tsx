"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useExt } from "@/store/extensions";
import { Card, Button, Input, Textarea, Dialog, EmptyState, Badge } from "@/components/ui";
import { Lightbulb, Plus, ArrowRight, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function BrainstormListPage() {
  const router = useRouter();
  const { brainstorms, createBrainstorm } = useExt();
  const [creating, setCreating] = useState(false);

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
            <Lightbulb className="size-3.5" /> Brainstorm
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">
            Visual canvas for thinking out loud.
          </h1>
          <p className="mt-3 text-muted max-w-2xl">
            Drag sticky notes. Cluster ideas. Let Akili surface unseen connections. The best ventures start as messy boards.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} size="lg"><Plus className="size-4" /> New canvas</Button>
      </div>

      {brainstorms.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="No canvases yet"
          body="Start one with a prompt — 'why is post-harvest loss in Northern Ghana so high?' — and let Akili populate the first 10 stickies."
          action={<Button onClick={() => setCreating(true)}><Plus className="size-4" /> Create canvas</Button>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {brainstorms.map((b) => (
            <Link
              key={b.id}
              href={`/studio/brainstorm/${b.id}`}
              className="glass rounded-2xl p-6 hover:border-emerald/40 transition group"
            >
              <div className="flex items-start justify-between mb-3">
                <Lightbulb className="size-5 text-amber" />
                <Badge color="muted">{b.stickies.length} stickies</Badge>
              </div>
              <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold leading-tight">{b.title}</h3>
              <p className="text-sm text-muted mt-1 line-clamp-2">{b.prompt}</p>
              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-muted">Updated {formatDistanceToNow(b.updatedAt, { addSuffix: true })}</span>
                <span className="text-emerald flex items-center gap-1">Open <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition" /></span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={creating} onClose={() => setCreating(false)} title="New brainstorm">
        <NewBrainstormForm
          onCreate={(title, prompt) => {
            const id = createBrainstorm(title, prompt);
            setCreating(false);
            router.push(`/studio/brainstorm/${id}`);
          }}
        />
      </Dialog>
    </div>
  );
}

function NewBrainstormForm({ onCreate }: { onCreate: (title: string, prompt: string) => void }) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const SUGGESTIONS = [
    "Why is post-harvest tomato loss so high in Northern Ghana?",
    "How might a CHW in rural Uganda diagnose pneumonia with $0 of new equipment?",
    "What wedge could bring 1M new African creators onto a fair-payment platform?",
    "Why do 40% of African SMEs fail in year 1?",
  ];
  return (
    <div className="space-y-4">
      <Input placeholder="Canvas title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Textarea placeholder="What's the question driving this brainstorm?" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
      <div>
        <div className="text-xs uppercase tracking-widest text-muted mb-2">Or pick a question to start</div>
        <div className="space-y-1.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => { setPrompt(s); setTitle(s.slice(0, 50)); }} className="block text-left w-full text-sm text-muted hover:text-foreground hover:bg-surface-2 rounded-lg p-2 transition">
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => title.trim() && prompt.trim() && onCreate(title, prompt)} disabled={!title.trim() || !prompt.trim()}>
          Create canvas <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
