import Anthropic from "@anthropic-ai/sdk";
import { aiUsageHeaders } from "@/lib/ai-headers";
import { rateLimit, rateLimited, clientIp } from "@/lib/rate-limit";
import { readSiteContext, siteSystemBlock } from "@/lib/site-brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Generate Ship-Hour wedge candidates tailored to THIS student.
//
// Stock PROBLEMS in lib/problems.ts are good but generic. A
// Mechatronics student staring at "1 in 3 Africans drink unsafe water"
// rightly thinks "this isn't my fight". We use the Site Brain (their
// field, region, genome, active venture) to produce 6 wedge cards
// that match their discipline — and where their genome says they
// have an unfair angle.
//
// Output JSON: { "candidates": [{ id, sector, region, title, affected, whyYou }] }

import { z } from "zod";
import { parseBodyWithRaw } from "@/lib/parse-body";

const Body = z.object({
  field: z.string().max(200).optional(),
  region: z.string().max(200).optional(),
  userHint: z.string().max(2000).optional(),
}).loose();
type Body = z.infer<typeof Body>;

const SYSTEM = `You generate 6 specific, attackable wedge problems for an African / developing-world undergraduate about to spend ONE HOUR shipping their first artifact. Pure JSON output.

Rules:
- Tie each wedge to the student's discipline (use their field from the context). If they're in Mechatronics, surface hardware/robotics/IoT wedges. If they're in Public Health, surface diagnostic / community-health-worker / vaccine-cold-chain wedges.
- Each wedge must be SOMETHING THEY COULD START IN ONE HOUR. No "build a national grid" — yes "WhatsApp price-broadcast for one Tamale co-op".
- Wedges should be specific to a region the student knows (default to their country/region if listed; otherwise use pan-African).
- Each \`affected\` line names a real archetype with a number ("33M smallholder farmers across Nigeria, Kenya, Ghana") — not "many people".
- \`whyYou\` is one sentence pointing at why THIS student is unfair-advantaged for it (their discipline, region, or genome signal).

JSON shape:
{
  "candidates": [
    {
      "id": "custom:<slug>",
      "sector": "Agriculture" | "Health" | "Education" | "Energy" | "Logistics" | "Water" | "Governance" | "Climate" | "Finance" | "...",
      "region": "Sahel" | "West Africa" | "Pan-African" | "<their country>" | "...",
      "title": "<8-12 word problem statement>",
      "affected": "<who suffers, with a number>",
      "whyYou": "<one sentence — the student's unfair angle>"
    }
  ]
}

Output exactly 6 candidates. No prose around the JSON. No markdown fences.`;

export async function POST(req: Request) {
  const rl = rateLimit({ scope: "wedge-candidates", ipKey: clientIp(req), maxCalls: 6 });
  if (!rl.ok) return rateLimited(rl);

  const parsed = await parseBodyWithRaw(req, Body);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const raw = parsed.raw;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json(fallback(body));

  const brain = siteSystemBlock(readSiteContext(raw));

  const ctx = [
    body.field && `Discipline: ${body.field}`,
    body.region && `Region: ${body.region}`,
    body.userHint && `User hint about what they want to work on: ${body.userHint}`,
  ].filter(Boolean).join("\n") || "No additional context — use the SANKOFA CONTEXT above to ground the wedges.";

  const client = new Anthropic({ apiKey });
  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: [{ type: "text", text: brain + SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `${ctx}\n\nGenerate 6 wedges this student could actually start in the next hour.` }],
    });
    const text = res.content.filter((c) => c.type === "text").map((c) => (c.type === "text" ? c.text : "")).join("").trim();
    const cleaned = text.replace(/^```json\n?|\n?```$/g, "").trim();
    try {
      const parsed = JSON.parse(cleaned) as { candidates?: unknown[] };
      const candidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
      return Response.json({ ok: true, candidates }, { headers: aiUsageHeaders(res) });
    } catch {
      return Response.json(fallback(body), { headers: aiUsageHeaders(res) });
    }
  } catch (e) {
    const fb = fallback(body);
    return Response.json({ ...fb, error: (e as Error).message }, { status: 502 });
  }
}

function fallback(b: Body) {
  // Honest demo data — labeled so the student knows it's not bespoke.
  const field = (b.field ?? "general").toLowerCase();
  const hint = field.includes("eng") ? "engineering"
    : field.includes("health") || field.includes("med") ? "health"
    : field.includes("agr") ? "agriculture"
    : field.includes("comp") || field.includes("data") || field.includes("inform") ? "tech"
    : field.includes("law") ? "governance"
    : field.includes("edu") || field.includes("teach") ? "education"
    : "general";
  const seeds: Record<string, { sector: string; title: string; affected: string; whyYou: string }[]> = {
    engineering: [
      { sector: "Energy", title: "Battery-swap stations for boda-bodas underserved in mid-tier towns", affected: "180,000 boda-boda riders in Tanzania", whyYou: "You can spec the swap-cabinet hardware in CAD this afternoon." },
      { sector: "Water", title: "Solar-powered borehole monitoring USSD for rural co-ops", affected: "12,000 rural water points in Kenya alone", whyYou: "Microcontroller + sensors are your stack." },
      { sector: "Logistics", title: "Cold-chain failure SMS-alerting for last-mile vaccine routes", affected: "60% of clinics in Northern Nigeria see cold-chain breaks monthly", whyYou: "An ESP32 + thermistor proves it by Tuesday." },
    ],
    health: [
      { sector: "Health", title: "WhatsApp triage script for community health workers", affected: "150,000 CHWs across sub-Saharan Africa diagnose without tools", whyYou: "You know which symptoms a CHW shouldn't try to handle alone." },
      { sector: "Health", title: "Vaccine cold-chain break alerts via dumb-phone SMS", affected: "1 in 3 vaccines wasted in rural clinics", whyYou: "You've seen the freezer in your local clinic." },
      { sector: "Health", title: "Postnatal mom check-in voicebot in local language", affected: "70% of postpartum deaths in week-1 are preventable", whyYou: "Your degree lets you write the medical script." },
    ],
    agriculture: [
      { sector: "Agriculture", title: "Per-crate cold rental for one Tamale tomato co-op", affected: "33M smallholders across Nigeria, Kenya, Ghana", whyYou: "You can walk the market this weekend." },
      { sector: "Agriculture", title: "Pre-harvest price-broadcast WhatsApp for one district", affected: "Farmers lose 30-40% to bad price information", whyYou: "Your phone is already in the WhatsApp groups." },
      { sector: "Agriculture", title: "Aflatoxin self-test kit ordering for one cooperative", affected: "60% of maize fails EU thresholds in West Africa", whyYou: "Your lab knows the assay." },
    ],
    tech: [
      { sector: "Education", title: "Mobile-money receipts auto-organized into bookkeeping for SMEs", affected: "1.7M registered SMEs in Kenya alone", whyYou: "You can ship the M-Pesa SMS parser tonight." },
      { sector: "Governance", title: "Public-procurement contract scraper for one ministry", affected: "$148B/yr lost to procurement opacity in Africa", whyYou: "You can write the scraper in 90 minutes." },
      { sector: "Finance", title: "Stablecoin-rail invoicing for African freelancers paid in USD", affected: "5M+ African freelancers losing 5-8% to FX & wires", whyYou: "Your stack maps cleanly to one stablecoin SDK." },
    ],
    governance: [
      { sector: "Governance", title: "Court-judgment translation bot — English ↔ Twi/Yoruba/Hausa", affected: "20M people face court annually in non-mother-tongue jurisdictions", whyYou: "Your law degree + local language is the moat." },
      { sector: "Governance", title: "Local-council budget tracker for one district", affected: "300M urban Africans never see budget execution data", whyYou: "You know how to parse the gazette." },
      { sector: "Governance", title: "FOI-request templating bot for civic journalists", affected: "Few African newsrooms file FOI requests at scale", whyYou: "You know the law's deadlines and exceptions." },
    ],
    education: [
      { sector: "Education", title: "JAMB past-questions WhatsApp tutor with mother-tongue explanations", affected: "1.8M Nigerians sit JAMB every year", whyYou: "You sat it. You know which topics are gateways." },
      { sector: "Education", title: "Voice-note grading helper for primary-school teachers", affected: "800,000+ primary teachers across Anglophone Africa", whyYou: "You taught last summer; you know the bottleneck." },
      { sector: "Education", title: "Parent SMS digest of school attendance for one district", affected: "Truancy data invisible to parents in most schools", whyYou: "Your education-policy class showed you the lever." },
    ],
    general: [
      { sector: "Logistics", title: "WhatsApp-first delivery slot booking for one neighborhood", affected: "Last-mile costs 4x more in Lagos than London", whyYou: "You're one of the few who's lived both sides." },
      { sector: "Climate", title: "Rainfall early-warning SMS for one rural extension office", affected: "200M climate-vulnerable smallholders", whyYou: "Your studies give you the weather-data plumbing." },
      { sector: "Governance", title: "Land-title dispute mapping for one peri-urban district", affected: "60% of African urban land has no clear title", whyYou: "You can interview the land registry this week." },
    ],
  };
  const picks = seeds[hint];
  return {
    ok: true,
    demo: true,
    candidates: picks.map((p, i) => ({
      id: `custom:demo-${hint}-${i}`,
      sector: p.sector,
      region: "Pan-African",
      title: p.title,
      affected: p.affected,
      whyYou: p.whyYou,
    })),
  };
}
