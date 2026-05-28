"use client";

import { use, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { useStore } from "@/store";
import { Card, Button, Textarea, Badge } from "@/components/ui";
import { Lightbulb, Save, Sparkles, Plus } from "lucide-react";

const CANVAS_BLOCKS = [
  { key: "Problem", placeholder: "What painful problem are you solving? Be specific about who hurts.", color: "rust" },
  { key: "Customer", placeholder: "Who exactly? One person, not 'farmers'.", color: "emerald" },
  { key: "Value prop", placeholder: "What value do you deliver, in their words?", color: "amber" },
  { key: "Solution", placeholder: "What you'll build. The smallest wedge.", color: "amber" },
  { key: "Channels", placeholder: "How will you reach customer 1? Customer 100?", color: "indigo" },
  { key: "Revenue", placeholder: "How does money come in? What's the unit economic story?", color: "indigo" },
  { key: "Cost", placeholder: "BOM, ops, payback period.", color: "rust" },
  { key: "Metrics", placeholder: "The 1-2 numbers that tell you if it's working.", color: "rust" },
  { key: "Unfair edge", placeholder: "Why you. Why now. What competitors can't easily copy.", color: "emerald" },
];

export default function IdeatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { ventures, updateVenture } = useStore();
  const [canvas, setCanvas] = useState<Record<string, string>>({});

  const found = ventures.find((x) => x.id === id);

  useEffect(() => {
    if (found) setCanvas(found.canvas ?? {});
  }, [found?.id]);

  if (!found) { notFound(); return null; }
  const v = found;
  const dirty = JSON.stringify(canvas) !== JSON.stringify(v.canvas);

  function save() { updateVenture(v.id, { canvas }); }

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10">
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-amber mb-1 flex items-center gap-1.5">
            <Lightbulb className="size-3.5" /> Phase 1 — Ideate
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">Lean Canvas</h2>
          <p className="text-sm text-muted mt-1">Fill it in. Edit ruthlessly. The canvas is the conversation, not the contract.</p>
        </div>
        <Button onClick={save} disabled={!dirty}>
          <Save className="size-4" /> {dirty ? "Save canvas" : "Saved"}
        </Button>
      </div>

      <Card className="p-5 mb-6 bg-gradient-to-r from-emerald/10 to-amber/10">
        <div className="flex items-start gap-3">
          <Sparkles className="size-5 text-amber shrink-0 mt-0.5" />
          <div className="text-sm">
            <strong>Pro tip:</strong> If you can't fill a block in 30 seconds, it's a hypothesis — open the Discover tab and go ask a real person about it. Most founders fill the canvas with wishes instead of evidence.
          </div>
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {CANVAS_BLOCKS.map((b) => (
          <Card key={b.key} className="p-5">
            <div className="flex items-center justify-between mb-3">
              <Badge color={b.color as "emerald"}>{b.key}</Badge>
              {canvas[b.key] && <span className="size-1.5 rounded-full bg-emerald" />}
            </div>
            <Textarea
              placeholder={b.placeholder}
              value={canvas[b.key] ?? ""}
              onChange={(e) => setCanvas({ ...canvas, [b.key]: e.target.value })}
              rows={5}
              className="border-0 bg-transparent focus:border-0 p-0 text-sm"
            />
          </Card>
        ))}
      </div>
    </div>
  );
}
