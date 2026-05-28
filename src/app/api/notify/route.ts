import { sendEmail, emailShell } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Unified notification endpoint. Picks a templated email based on `event`,
// renders with the supplied payload, sends. Falls back to a local no-op
// when Resend isn't configured (so dev environments stay quiet).
//
// Used by:
//   - Interview synthesizer (when a clustering job completes)
//   - Pitch deck reviewer (when a coach posts feedback)
//   - Weekly digest cron (Sunday 6pm — what you shipped this week)
//   - Funding deadline alerts (T-3 days)
//
// Client posts: { event, to, data: {...} }

type Event = "interview-ready" | "deck-feedback" | "weekly-digest" | "funding-deadline" | "test";
type Payload = { event: Event; to: string; data?: Record<string, unknown> };

export async function POST(req: Request) {
  let body: Payload;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }

  if (!body.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.to)) {
    return Response.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }
  const tpl = TEMPLATES[body.event];
  if (!tpl) return Response.json({ ok: false, error: "unknown_event" }, { status: 400 });

  const rendered = tpl(body.data ?? {});
  const result = await sendEmail({
    to: body.to,
    subject: rendered.subject,
    html: emailShell({ heading: rendered.heading, body: rendered.body, cta: rendered.cta }),
    tags: [{ name: "event", value: body.event }],
  });
  return Response.json(result);
}

// ─── Templates ────────────────────────────────────────────────────────────
type Rendered = { subject: string; heading: string; body: string; cta?: { href: string; label: string } };

const TEMPLATES: Record<Event, (d: Record<string, unknown>) => Rendered> = {
  test: () => ({
    subject: "Sankofa — test email",
    heading: "It works.",
    body: "<p>If you can read this, Resend is wired and your team can ship product emails.</p>",
  }),
  "interview-ready": (d) => ({
    subject: `${d.ventureName ?? "Your venture"} — pattern synthesis ready`,
    heading: "Your interviews have a story.",
    body: `<p>Akili just finished synthesizing the ${d.count ?? "latest batch of"} discovery interviews you logged for <strong>${d.ventureName ?? "your venture"}</strong>. The clusters, personas, and next 3 moves are waiting on the Discover tab.</p>`,
    cta: d.url ? { href: String(d.url), label: "Open the synthesis" } : undefined,
  }),
  "deck-feedback": (d) => ({
    subject: `${d.coach ?? "A coach"} reviewed your pitch deck`,
    heading: `${d.coach ?? "A coach"} weighed in.`,
    body: `<p>You asked for eyes on your <strong>${d.ventureName ?? "pitch deck"}</strong>. Their notes are in.</p>${d.summary ? `<p style="border-left:3px solid #2cc295;padding-left:14px;color:#cfe0d8;">${escapeHtml(String(d.summary))}</p>` : ""}`,
    cta: d.url ? { href: String(d.url), label: "Read the full review" } : undefined,
  }),
  "weekly-digest": (d) => ({
    subject: `Sankofa weekly — ${d.shipped ?? 0} thing${(d.shipped as number) === 1 ? "" : "s"} shipped`,
    heading: "Your week in build.",
    body: `<p>You logged <strong>${d.interviews ?? 0}</strong> interviews, shipped <strong>${d.shipped ?? 0}</strong> MVP tasks, and ran <strong>${d.aiCalls ?? 0}</strong> AI calls (about $${(typeof d.aiSpend === "number" ? d.aiSpend : 0).toFixed(2)}).</p><p>Most-touched venture: <strong>${d.topVenture ?? "—"}</strong>. Streak: ${d.streak ?? 0} days.</p>`,
    cta: { href: "/studio", label: "Open your studio" },
  }),
  "funding-deadline": (d) => ({
    subject: `Deadline in 3 days: ${d.name ?? "funding opportunity"}`,
    heading: "Three days left.",
    body: `<p><strong>${d.name ?? "A funding opportunity"}</strong> closes on <strong>${d.deadline ?? "soon"}</strong>. You marked this one on your radar — now's the moment to push the application across the line.</p>`,
    cta: d.url ? { href: String(d.url), label: "Open the application" } : undefined,
  }),
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[c]!));
}
