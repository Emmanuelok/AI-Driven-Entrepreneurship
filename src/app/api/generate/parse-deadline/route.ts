import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { parseBody } from "@/lib/parse-body";
import { aiGuard } from "@/lib/ai-guard";

export const runtime = "nodejs";

// Smart-deadline parser. Turns a free-text line like
//   "submit the revised manuscript to the journal by next Friday 5pm"
// into a structured deadline:
//   { title, dueAt (ISO), setByRole, detail }
//
// The client passes the user's current time + timezone offset so
// relative phrases ("tomorrow", "in 3 days", "Friday") resolve to the
// right absolute instant. The model only proposes — the user confirms
// in the dialog before anything is saved.

const Body = z.object({
  text: z.string().min(2).max(500),
  // ISO string of the user's "now" + their UTC offset minutes, so the
  // model can anchor relative dates without guessing the timezone.
  nowIso: z.string().min(10).max(40),
  tzOffsetMinutes: z.number().int().min(-840).max(840),
  isAdmin: z.boolean().optional(),
});
type ParseBody = z.infer<typeof Body>;

const AUTHORITIES = ["self", "admin", "instructor", "funder", "investor", "journal", "mentor"] as const;

export async function POST(req: Request) {
  const parsed = await parseBody(req, Body);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const guard = await aiGuard({ req, scope: "parse-deadline", maxCalls: 40 });
  if (!guard.ok) return guard.response;
  if (!guard.apiKey) return Response.json(fallback(body));

  const client = new Anthropic({ apiKey: guard.apiKey });
  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system: [
        {
          type: "text",
          text: `You convert a natural-language deadline into structured JSON. The user's current local time is ${body.nowIso} (UTC offset ${body.tzOffsetMinutes} minutes). Resolve every relative phrase ("tomorrow", "next Friday", "in 3 days", "end of month") against THAT local time, then output the due moment as a UTC ISO-8601 string.

setByRole must be one of: ${AUTHORITIES.join(", ")}. Infer it from the text:
- a journal/review deadline → "journal"
- a funder/grant deadline → "funder"
- an investor deadline → "investor"
- an instructor/course/assignment deadline → "instructor"
- a mentor milestone → "mentor"
- otherwise → "self"
${body.isAdmin ? "" : 'The requester is NOT an admin, so always return setByRole "self" regardless of the text.'}

If no time of day is stated, default to 09:00 local. If the text is too vague to find any date, set dueAt to null.

Output ONLY JSON: {"title": "concise imperative title", "dueAt": "ISO-8601 UTC or null", "setByRole": "...", "detail": "any extra context, or empty string"}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: body.text }],
    });
    const text = res.content.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.text : "")).join("");
    const cleaned = text.replace(/^```json\n?|\n?```$/g, "").trim();
    const json = JSON.parse(cleaned);
    // Defensive: clamp setByRole for non-admins.
    if (!body.isAdmin) json.setByRole = "self";
    if (!AUTHORITIES.includes(json.setByRole)) json.setByRole = "self";
    return Response.json(json);
  } catch {
    return Response.json(fallback(body));
  }
}

// Deterministic fallback — a couple of common relative phrases handled
// without the model, so the feature degrades to "usable" rather than
// "broken" when there's no API key.
function fallback(b: ParseBody): { title: string; dueAt: string | null; setByRole: string; detail: string } {
  const now = new Date(b.nowIso);
  const lower = b.text.toLowerCase();
  let due: Date | null = null;
  if (/tomorrow/.test(lower)) due = addDays(now, 1);
  else if (/next week/.test(lower)) due = addDays(now, 7);
  else {
    const inN = lower.match(/in (\d+) days?/);
    if (inN) due = addDays(now, parseInt(inN[1]));
  }
  if (due) due.setHours(9, 0, 0, 0);
  return {
    title: b.text.replace(/\b(by|before|due|tomorrow|next week|in \d+ days?)\b/gi, "").trim().slice(0, 80) || b.text.slice(0, 80),
    dueAt: due ? due.toISOString() : null,
    setByRole: "self",
    detail: "",
  };
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
