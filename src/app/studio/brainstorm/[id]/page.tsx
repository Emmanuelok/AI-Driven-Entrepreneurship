"use client";

import { use } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useSketch } from "@/store/sketch";
import { SketchCanvas } from "@/components/sketch-canvas";
import { ArrowLeft } from "lucide-react";

export default function BrainstormCanvasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const board = useSketch((s) => s.boards.find((b) => b.id === id));
  if (!board) { notFound(); return null; }

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      <header className="border-b border-border px-5 sm:px-8 py-3 flex items-center gap-4 shrink-0">
        <Link href="/studio/brainstorm" className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5 shrink-0">
          <ArrowLeft className="size-3.5" /> Canvases
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold truncate">{board.title}</h1>
          <p className="text-xs text-muted truncate">{board.prompt}</p>
        </div>
      </header>
      <div className="flex-1 relative overflow-hidden">
        <SketchCanvas boardId={id} />
      </div>
    </div>
  );
}
