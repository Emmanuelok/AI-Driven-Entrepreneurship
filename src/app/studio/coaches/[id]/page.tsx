"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { ChatPanel } from "@/components/chat";
import { getCoach } from "@/lib/coaches";

export default function CoachChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const coach = getCoach(id);
  if (!coach) { notFound(); return null; }
  const iconBg = ({
    emerald: "from-emerald to-emerald-deep",
    amber: "from-amber to-amber-deep",
    indigo: "from-indigo to-indigo",
    rust: "from-rust to-amber-deep",
  } as Record<string, string>)[coach.color] ?? "from-emerald to-emerald-deep";

  return (
    <ChatPanel
      endpoint={`/api/coach/${coach.id}`}
      coachName={coach.name}
      coachShort={`${coach.role} · ${coach.short}`}
      starters={coach.starters}
      intro={coach.intro}
      iconBg={iconBg}
    />
  );
}
