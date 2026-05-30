import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { readSiteContext, siteSystemBlock } from "@/lib/site-brain";
import { parseBodyWithRaw } from "@/lib/parse-body";

export const runtime = "nodejs";

const ArtifactKind = z.enum(["problem-brief", "interview-script", "loi", "pricing-page", "outreach-script", "pitch-summary", "landing-copy"]);
type ArtifactKind = z.infer<typeof ArtifactKind>;

const Body = z.object({
  kind: ArtifactKind,
  ventureName: z.string().min(1).max(200),
  problem: z.string().max(8000),
  persona: z.object({
    name: z.string().max(200),
    role: z.string().max(200),
    location: z.string().max(200),
    pain: z.string().max(2000),
  }),
  sliceText: z.string().max(4000),
  whyMe: z.string().max(4000),
  genomeVoice: z.string().max(2000),
  userName: z.string().max(80),
  userField: z.string().max(200),
}).loose();
type Body = z.infer<typeof Body>;

const PROMPTS: Record<ArtifactKind, (b: Body) => { system: string; user: string }> = {
  "problem-brief": (b) => ({
    system: `You write founder-grade 1-page Problem Briefs. African / developing-world context. ${b.genomeVoice}`,
    user: `Generate a 1-page Problem Brief for ${b.userName}'s venture "${b.ventureName}".

Problem: ${b.problem}
Persona: ${b.persona.name}, ${b.persona.role}, ${b.persona.location}. Their specific pain: "${b.persona.pain}"
Slice we're attacking: ${b.sliceText}
Why ${b.userName} is the right person: ${b.whyMe}

Format (markdown):
# ${b.ventureName} — Problem Brief

## Who hurts (one specific person)
## The pain they live with
## What they try today (and why it fails)
## What we'll do differently
## How we'll know it's working (one number)
## Why now
## Why us

Keep total under 400 words. Specific. No corporate language.`,
  }),

  "interview-script": (b) => ({
    system: `You write Bob Moesta + Teresa Torres-grade customer-discovery scripts. ${b.genomeVoice}`,
    user: `Generate a 12-question discovery script ${b.userName} will use to interview ${b.persona.name} (${b.persona.role}, ${b.persona.location}) about: ${b.problem}

Rules:
- No leading questions, no pitching, no hypothetical "would you" questions
- Order: rapport → context → specific past behavior → existing workarounds → moments of pain → unmet wishes → close
- Every question extractable past behavior

Output: a clean markdown numbered list. After the questions, add a "Things to listen for" section with 5 specific words/phrases that signal real pain vs polite agreement.`,
  }),

  "loi": (b) => ({
    system: `You write Letters of Intent that close pilot customers. Plain language, not legal-heavy. ${b.genomeVoice}`,
    user: `Generate a Letter of Intent that ${b.userName} can send to ${b.persona.name} at ${b.persona.role}, ${b.persona.location}.

Venture: ${b.ventureName}
What we'll deliver: ${b.sliceText}
What we ask in return: a 30-day pilot, weekly check-ins, willingness to provide feedback. NO money at signing — money on day 30 if value is delivered.

Format the LOI as a real letter, addressed to ${b.persona.name}. Under 250 words. End with two signature blocks. Add a 'How to send this' note at the bottom (WhatsApp script + email subject + opening line). African context.`,
  }),

  "pricing-page": (b) => ({
    system: `You write conversion-optimized pricing pages. ${b.genomeVoice}`,
    user: `Generate a single pricing page for ${b.ventureName} aimed at people like ${b.persona.name}.

Slice we offer: ${b.sliceText}
Their pain: ${b.persona.pain}

Output as markdown, structured to render as HTML:
- A hero headline (8-12 words, specific outcome, not generic)
- One-line sub
- 3 tier offers (Pilot, Standard, Cooperative). Each tier: name, monthly price in local currency relevant to ${b.persona.location}, what's included (3 bullets), who it's for.
- A FAQ section with 4 questions a skeptical first customer would actually ask, with honest answers.
- A "Start the pilot" CTA copy.

Plain language. African market norms.`,
  }),

  "outreach-script": (b) => ({
    system: `You write the actual WhatsApp + email + voice-script lines founders use to reach first customers. ${b.genomeVoice}`,
    user: `${b.userName} needs to reach out to 10 people like ${b.persona.name} this week about ${b.ventureName}.

Generate 3 outreach scripts, each ≤ 80 words:

## WhatsApp (Pidgin / English blend natural for ${b.persona.location})
## Email subject + 4-sentence body
## 30-second voice note script (what to say in voice if they pick up)

After the scripts, add:
## Who to send to first (5 specific archetypes)
## When to send (best times of day / week for ${b.persona.location})
## How to follow up if no reply in 48h`,
  }),

  "pitch-summary": (b) => ({
    system: `You write 60-second pitch summaries that close meetings. ${b.genomeVoice}`,
    user: `Generate a 60-second pitch ${b.userName} can read aloud at a meetup or to a mentor.

Venture: ${b.ventureName}
Problem: ${b.problem}
Slice: ${b.sliceText}
Why us: ${b.whyMe}

Structure:
- One memorable opening sentence (anchor an unforgettable fact)
- The problem in one sentence about ${b.persona.name}
- The solution in one sentence
- The wedge / why us (15 seconds)
- The ask (15 seconds — specific, small)
- A closing line that makes them want to talk more

Under 150 words. Sound like a person, not a deck.`,
  }),

  "landing-copy": (b) => ({
    system: `You write landing page copy that converts. ${b.genomeVoice}`,
    user: `Generate landing page copy for ${b.ventureName}.

Target visitor: ${b.persona.name}, ${b.persona.role}, ${b.persona.location}
Their pain: ${b.persona.pain}
Our slice: ${b.sliceText}

Output structured markdown:
# HERO (8-12 word headline)
## SUB (one sentence with a number)
## PROBLEM (what visitors recognize about their own life)
## SOLUTION (what we do)
## HOW IT WORKS (3 steps)
## PROOF (what we'll show — even if it's a single pilot)
## CTA (primary + secondary)
## FAQ (3 honest questions)

No buzzwords. Local context.`,
  }),
};

export async function POST(req: Request) {
  const parsed = await parseBodyWithRaw(req, Body);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const raw = parsed.raw;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const promptPair = PROMPTS[body.kind];
  if (!promptPair) return Response.json({ error: "unknown kind" }, { status: 400 });

  if (!apiKey) {
    return new Response(makeFallbackStream(body), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "x-mode": "demo" },
    });
  }

  const brain = siteSystemBlock(readSiteContext(raw));
  const { system, user } = promptPair(body);
  const client = new Anthropic({ apiKey });
  const stream = await client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: [{ type: "text", text: brain + system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const evt of stream) {
          if (evt.type === "content_block_delta" && evt.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(evt.delta.text));
          }
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`\n\n[error: ${(err as Error).message}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, { headers: { "Content-Type": "text/plain; charset=utf-8", "x-mode": "live" } });
}

function makeFallbackStream(b: Body): ReadableStream<Uint8Array> {
  const fallbacks: Record<ArtifactKind, string> = {
    "problem-brief": `# ${b.ventureName} — Problem Brief

## Who hurts
${b.persona.name}, ${b.persona.role} in ${b.persona.location}. Loses real money or time every week to: ${b.persona.pain}.

## The pain they live with
${b.problem}

## What they try today
Informal workarounds — selling at a discount the same day, borrowing, hoping. Nothing scales.

## What we'll do differently
${b.sliceText}. Specific. Measurable. Refundable if it doesn't work.

## How we'll know it's working
A weekly number tied to ${b.persona.name}'s pocket. Not vanity.

## Why now
Three things changed in the last 24 months: mobile penetration crossed the threshold for the target user, foundation models reached low-resource languages, and ${b.persona.location}'s regulatory environment opened up.

## Why us
${b.whyMe}.`,

    "interview-script": `# Discovery Script — ${b.persona.name}

1. **Opening.** Thanks for talking. Tell me what your typical Tuesday looks like.
2. Walk me through last week — what did you do, hour by hour, on the busiest day?
3. The last time you experienced [the pain], what exactly happened?
4. How often does that happen — once a week? once a month?
5. When it happens, what do you do first? Then?
6. Have you ever tried [adjacent solution]? What happened?
7. The last time it cost you money — how much, and what did you do?
8. Who else does it affect when it happens to you?
9. If you could wave a wand and change one thing, what would it be?
10. Who in your life is best at handling this? What do they do differently?
11. If I built something that did [slice], how would your week change?
12. Is there anything I should have asked? Who else like you should I talk to?

## Things to listen for
- "I cried…" / "It was the worst…" — real emotional pain, not theoretical
- A specific date or place ("last Tuesday at the Tamale market") — anchor in real memory
- Naming an existing workaround in detail — they've already tried things
- Volunteered numbers ("I lost 4 crates") — quantified pain
- Asking *you* a question — they're engaged, not just polite`,

    "loi": `Dear ${b.persona.name},

I'm ${b.userName}, ${b.userField}, and I've been studying ${b.problem.toLowerCase()} closely. I believe ${b.ventureName} can help.

What we propose: for the next 30 days, ${b.ventureName} will deliver ${b.sliceText.toLowerCase()} for your operation in ${b.persona.location}. There is no cost during this 30-day pilot.

In return, we ask only:
- A 20-minute conversation each week
- Honest feedback (especially when something isn't working)
- A reference to one other person like you, if you're satisfied

After 30 days, if ${b.ventureName} has delivered measurable value (we'll define the number together at the start), we will discuss a paid arrangement. If not, we shake hands and you owe us nothing.

I respect your time. This letter exists so we both know exactly what we're agreeing to.

Warmly,

${b.userName}
[phone] · [email]

_________________________      _________________________
${b.userName}                  ${b.persona.name}
Date:                          Date:

---

**How to send this**
- **WhatsApp opener:** "Mama ${b.persona.name.split(" ")[0]}, my name is ${b.userName}. I'm building something that might help with ${b.persona.pain.split(",")[0].toLowerCase()}. Can I send you a one-page letter and then call you Saturday morning?"
- **Email subject:** "A 30-day pilot at no cost — ${b.ventureName} × ${b.persona.location}"
- **Opening line:** "I've been studying [the pain] for months and your name keeps coming up."`,

    "pricing-page": `# ${b.ventureName}

## ${b.sliceText} — measurable in 30 days, or you owe us nothing.

We help ${b.persona.role.toLowerCase()}s in ${b.persona.location} cut [the pain] by 80% in their first month.

---

### Pilot (₵0 for 30 days)
Perfect for: first customers, skeptics, anyone testing
- Full ${b.ventureName} system, no cost
- Weekly 20-min check-ins
- We pay if you don't see results

### Standard (₵50 / month)
Perfect for: customers who've completed the pilot
- Everything in Pilot
- Priority support (under 4h response)
- Monthly impact report

### Cooperative (₵350 / month, up to 40 members)
Perfect for: chairman-led groups
- Everything in Standard, for all members
- Co-op-level analytics
- Direct line to your dedicated success person

---

## Frequently asked

**What if my situation is different from your other customers?**
That's exactly the point of the pilot. We adapt to your specific operation in the first 30 days, or you walk away.

**What happens if you go out of business?**
You keep all your data and we provide a 60-day transition window. We've also set aside escrow with [partner bank] for contingency.

**Why should I trust someone new with ${b.persona.pain.split(",")[0].toLowerCase()}?**
You shouldn't, yet. That's why the pilot is free. Trust comes from delivery, not promises.

**How do I cancel?**
WhatsApp the word "stop". Done. No paperwork.

---

[ **Start your 30-day pilot →** ]

(Press the button, fill in 3 fields, ${b.userName} will WhatsApp you within 12 hours.)`,

    "outreach-script": `## WhatsApp script
"Mama ${b.persona.name.split(" ")[0]}, my name is ${b.userName}. I'm a ${b.userField} student building something for people who lose money to ${b.persona.pain.split(",")[0].toLowerCase()}. Can I ask you 3 questions Saturday — no pitch, just listening? Even 10 minutes. 🙏"

## Email
**Subject:** A 10-minute conversation about ${b.persona.pain.split(",")[0].toLowerCase()} — no pitch

Hi ${b.persona.name},

I'm a ${b.userField} student researching ${b.problem.toLowerCase()}. Your name was mentioned by three people I trust. I'm not selling anything — I just want to listen to how you actually deal with this every week. Ten minutes, your call, your time.

If yes, what's a good time Saturday or Sunday?

— ${b.userName}

## Voice note (30 sec)
"Hi, this is ${b.userName}. I got your number from [intro source]. I'm not calling to sell anything — I'm a ${b.userField} student studying how people in ${b.persona.location} handle ${b.persona.pain.split(",")[0].toLowerCase()}, and I'd love to ask you a few questions for 10 minutes. If now isn't good, just send me 'later' and I'll wait. Thank you."

---

## Send to first
1. Your aunt or uncle in the field
2. Their chairperson or association head
3. A trader at the local market who's been there 5+ years
4. Someone whose business closed because of this problem
5. A former employee of an existing player in this space

## When to send (${b.persona.location})
- WhatsApp: **Tuesday–Thursday, 7–9pm** (after work, before sleep)
- Email: **Saturday morning 9–11am** (least crowded)
- Voice note: **Sunday after 6pm** (relaxed, family time)

## If no reply in 48h
Resend with: "${b.persona.name}, I know you're busy. If 10 minutes isn't possible, even 3 voice messages back-and-forth would help. Whatever works for you."`,

    "pitch-summary": `**${b.ventureName} — 60 seconds**

Last Tuesday, ${b.persona.name} — a ${b.persona.role.toLowerCase()} in ${b.persona.location} — lost 4 crates of tomatoes to spoilage. That's GHS 480 in one afternoon. She doesn't have insurance, no buyer guarantee, no cold storage. She has a phone.

The problem isn't unique: ${b.problem.toLowerCase()}. About 33 million smallholders across SSA live some version of this story every week.

${b.ventureName} delivers ${b.sliceText.toLowerCase()} — paid per crate, paid by results. Our Yendi pilot dropped post-harvest loss from 37% to 7% in six weeks.

Why us: ${b.whyMe}.

I'm not asking for money today. I'm asking for one introduction — to one ${b.persona.role.toLowerCase()} or one cooperative chairman in your network. If our pilot doesn't move the number, you'll never hear from me again. If it does, we'll come back and show you what 12 more co-ops looks like.

Will you make that one introduction?`,

    "landing-copy": `# Cut post-harvest loss to under 10% — or we owe you.

A 30-day pilot. No upfront cost. For ${b.persona.role.toLowerCase()}s in ${b.persona.location} who lose money every week to ${b.persona.pain.split(",")[0].toLowerCase()}.

## You know the feeling
You wake up Wednesday. Four crates of tomatoes from Tuesday's harvest are spoiled. You sell what you can at half price. The rest you give away or throw. By Friday you've earned less than your costs.

## What we do
We bring ${b.sliceText.toLowerCase()} to your stall or your cooperative. You pay per crate we save, not per month. If we don't save crates, you don't pay.

## How it works
1. We visit your operation and measure your baseline loss this week
2. We install ${b.ventureName} for 30 days, no cost to you
3. At day 30, we count what we saved. You pay only on results.

## Proof
Our Yendi pilot dropped post-harvest loss from 37% to 7%. ${b.persona.name} from Tamale Central put it like this: "First week in five years I didn't cry on a Wednesday."

## Start your pilot
**Three fields. 30 seconds. We WhatsApp you within 12 hours.**

[ **Start the pilot →** ]

Or: text "${b.ventureName}" to [phone]

## Honest questions
- *What if you don't deliver?* Then you owe us nothing — that's the entire point of the pilot.
- *How do you make money?* When pilots succeed, customers stay. ~70% have so far.
- *Is this safe for my produce?* Yes. We'll show you the hardware and the tests before installing.`,
  };

  const reply = fallbacks[b.kind] ?? `# Demo artifact\n\nWire ANTHROPIC_API_KEY for live generation.`;
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const tokens = reply.split(/(\s+)/);
      for (const t of tokens) {
        controller.enqueue(encoder.encode(t));
        await new Promise((r) => setTimeout(r, 6));
      }
      controller.close();
    },
  });
}
