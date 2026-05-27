"use client";

import { ChatPanel } from "@/components/chat";
import { COACHES } from "@/lib/coaches";

export default function TutorPage() {
  const c = COACHES.sage;
  return (
    <ChatPanel
      endpoint="/api/coach/sage"
      coachName="Sage"
      coachShort="Your contextual AI tutor"
      starters={c.starters}
      intro={c.intro}
    />
  );
}
