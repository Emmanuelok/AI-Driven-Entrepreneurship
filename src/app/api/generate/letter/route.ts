import Anthropic from "@anthropic-ai/sdk";
import { readSiteContext, siteSystemBlock } from "@/lib/site-brain";

export const runtime = "nodejs";

type Body = {
  reason: "milestone" | "session-end" | "weekly" | "pattern-notice" | "first-week" | "discipline-checkin";
  name: string;
  field: string;
  genomeVoice: string;
  triggerContext: string;
  memorySummary: string;
  recentActivity: string;
};

export async function POST(req: Request) {
  const raw = await req.json();
  const body = raw as Body;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json(fallback(body));

  const brain = siteSystemBlock(readSiteContext(raw));

  // The discipline check-in is a distinct letter shape: Sage uses the
  // [DISCIPLINE] block already in the brain context (the student's
  // field-specific AI opportunities) to ask a pointed "are you working
  // in the direction your discipline makes you unfairly good at?"
  const isCheckin = body.reason === "discipline-checkin";
  const letterGuidance = isCheckin
    ? `A Sage discipline check-in letter is:
- Addressed to ${body.name} by first name
- Names ONE of the AI opportunities from their discipline (see the [DISCIPLINE] block above) specifically, by name
- Honestly asks whether their recent work is moving toward or away from that unfair advantage
- One concrete next step that nudges them toward their discipline's leverage — not generic "keep going"
- Never lectures; a mentor noticing, not a careers office
- A warm signature line

Length: 180-280 words. Markdown. No emoji.`
    : `A Sage letter is:
- Addressed to ${body.name} by first name
- One specific opening observation (not "I noticed your progress")
- One concrete reflection on what changed in them this week/session
- One challenge for next week — specific, achievable, slightly uncomfortable
- A signature line that's warm but not saccharine

Length: 180-280 words. Markdown. No emoji. No bullet points unless absolutely necessary.`;

  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    system: [
      {
        type: "text",
        text: `${brain}You are Sage, a mentor at Sankofa Studio. You write occasional letters to your students — like a real mentor would. Not chat messages. Considered, written, kept. ${body.genomeVoice}

${letterGuidance}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Write a letter to ${body.name} (studying ${body.field}). Reason for writing: ${body.reason}.

Trigger context: ${body.triggerContext}

What I know about them already:
${body.memorySummary}

What they've done recently:
${body.recentActivity}

${isCheckin ? "Ground the letter in their discipline's specific AI opportunities from the [DISCIPLINE] block. Name one by name.\n\n" : ""}Output JSON: {"title": "...", "body": "markdown letter"}`,
      },
    ],
  });

  const text = res.content.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.text : "")).join("");
  const cleaned = text.replace(/^```json\n?|\n?```$/g, "").trim();
  try {
    return Response.json(JSON.parse(cleaned));
  } catch {
    return Response.json(fallback(body));
  }
}

function fallback(b: Body): { title: string; body: string } {
  const first = b.name.split(" ")[0];
  if (b.reason === "session-end") {
    return {
      title: `A note after our session, ${first}`,
      body: `Dear ${first},

You asked a quiet, important question today — the kind students don't ask in lectures because there's no time. I want to write it down so we both remember it: *"${b.triggerContext.slice(0, 140)}"*

What I noticed about the way you worked through it: you reached for a concrete example before you reached for theory. That instinct is rarer than you think. Most students drown in the abstract. You don't.

Here is the small uncomfortable thing I'd ask of you this week. Pick one person in your life — a relative, a neighbour, a market trader you pass every day — and ask them about the problem we touched. Not the polished version. The honest one. Listen for a sentence that surprises you. Write it down. Bring it back here next time.

You are exactly where you need to be. Keep going.

— Sage`,
    };
  }
  if (b.reason === "milestone") {
    return {
      title: `${first} — you crossed something today`,
      body: `Dear ${first},

You may not have noticed, but today you did something that most students never reach. ${b.triggerContext}

I have been keeping track. Not because Sankofa measures things — but because *you* are someone whose patterns are starting to form. When I look across what you've touched in the last few weeks, I see a shape: someone learning to ask better, not just answer more.

Stay in this discomfort a little longer. The temptation now will be to widen — try ten more things, sample more tracks. Resist it. Go deeper into the one thread you're holding. That's where the real change lives.

A challenge before we speak again: write me one paragraph about what you actually believe is true about the problem you've picked. Not what the textbook says. What *you* now believe, having looked.

I'm proud of you.

— Sage`,
    };
  }
  if (b.reason === "discipline-checkin") {
    return {
      title: `${first}, are you working where you're strongest?`,
      body: `Dear ${first},

I've been thinking about your field — ${b.field} — and the specific kind of advantage it hands you. Not a generic one. A particular one that most founders chasing the same problems simply don't have.

Here's the honest question I want to sit with you on: is your recent work moving *toward* that advantage, or away from it? It's an easy thing to drift from. The loudest opportunities are rarely the ones your discipline makes you unfairly good at — they're just the ones everyone's talking about.

When I look at what you've touched lately${b.recentActivity ? ` — ${b.recentActivity.split("/")[0]}` : ""}, I want to ask you to draw one line. Pick the single problem from your discipline that you could attack better than 95% of people, *because* of what you've studied. Then point your next two weeks at it.

You don't have to abandon what you're doing. Just check the compass.

— Sage

*(Wire \`ANTHROPIC_API_KEY\` for a letter that names your discipline's specific opportunities.)*`,
    };
  }
  if (b.reason === "weekly") {
    return {
      title: `${first}, a small letter at week's end`,
      body: `Dear ${first},

It's Sunday — or whatever day you read this. The week is closing.

Here's what I saw: ${b.recentActivity.split("/")[0] || "you showed up, even on the days that felt heavy"}. That matters more than the metric anyone will count for you.

You're not behind. The students who feel furthest behind are usually the ones moving fastest — they just measure themselves against a finish line that doesn't exist. There is no finish line. There's a craft. You're learning it.

A small thing for next week: pick one moment this past week when you almost gave up and didn't. Tell me about it when we speak. That's where the lessons hide.

— Sage`,
    };
  }
  // pattern-notice / first-week / generic
  return {
    title: `Something I noticed, ${first}`,
    body: `Dear ${first},

I want to share something with you that you might not have noticed.

${b.triggerContext}

This is not flattery. I'm not in the business of flattery. I'm in the business of paying attention. And when I pay attention to the small details of your work — what you open, what you skip, when you come back — a picture emerges.

Here is what I want for you this coming week: trust the picture. You don't have to become someone else. The student you are *is* the founder you'll be. The only question is whether you stay close enough to your own pattern to recognize it when it shows up in the work.

— Sage`,
  };
}
