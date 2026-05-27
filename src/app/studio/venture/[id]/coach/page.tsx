"use client";

import { use } from "react";
import { ChatPanel } from "@/components/chat";
import { COACHES } from "@/lib/coaches";

export default function VentureCoachPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const c = COACHES.akili;
  return (
    <ChatPanel
      endpoint={`/api/coach/akili`}
      coachName="Akili"
      coachShort={`Venture coach · Working on venture ${id.slice(0, 6)}`}
      starters={c.starters}
      intro={c.intro}
      iconBg="from-amber to-amber-deep"
    />
  );
}
