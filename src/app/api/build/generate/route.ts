import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { readSiteContext, siteSystemBlock } from "@/lib/site-brain";
import { parseBodyWithRaw } from "@/lib/parse-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  prompt: z.string().min(1).max(16000),
  currentCode: z.string().max(200_000),
  templateName: z.string().max(200).optional(),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(20_000),
  })).max(40).optional(),
  genomeVoice: z.string().max(2000).optional(),
  userName: z.string().max(80).optional(),
  field: z.string().max(200).optional(),
  // Vision: base64 data URLs can get large; cap at ~5MB.
  imageDataUrl: z.string().max(7_000_000).optional(),
}).loose();
type Body = z.infer<typeof Body>;

const SYSTEM = `You are an expert front-end engineer pair-programming with a student inside the Sankofa Studio AI Build Studio.

CORE CONTRACT
- Your output is a SINGLE self-contained HTML file: HTML + <style> + <script> in one document.
- It MUST render in a sandboxed iframe with no network access (unless explicitly allowed). No external CDN scripts unless the user asks. Use only vanilla JS, CSS, and standard browser APIs.
- The whole document must start with <!doctype html> and end with </html>.
- Default to a clean dark UI matching: bg #0a0f0d, text #e7efe9, accent #2cc295, warn #f4a949, danger #d96444. Mobile-first.
- African / developing-world context where the student's domain calls for it.
- Comment the tricky parts so the student learns.

WHEN MODIFYING EXISTING CODE
- Preserve everything that works.
- Make the smallest change that achieves what was asked.
- If the change is big, restructure cleanly — but still ship a single file.
- Never reply with explanations or markdown around the code. Reply ONLY with the full updated HTML file. No backticks. No prose. Just the file.

WHEN STARTING FROM SCRATCH
- Build a tiny but real working artifact, not a placeholder.
- Make it interactive on first render.

If the user asks a question (instead of a build request), reply normally with a SHORT explanation followed by an updated HTML file. But default to: code, code, code.

Do not include <link rel="stylesheet"> from external sources. Do not include <script src="..."> from CDNs unless the user explicitly requests it. Web Speech API, Web Serial, Canvas, fetch to same-origin are all fine.`;

export async function POST(req: Request) {
  const parsed = await parseBodyWithRaw(req, Body);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const brain = siteSystemBlock(readSiteContext(parsed.raw));

  if (!apiKey) {
    return new Response(makeFallback(body), { headers: { "Content-Type": "text/plain; charset=utf-8", "x-mode": "demo" } });
  }

  type ContentBlock =
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: string; data: string } };
  type MultiMsg = { role: "user" | "assistant"; content: string | ContentBlock[] };
  const messages: MultiMsg[] = [];

  // Trim history to last 8 turns
  for (const m of (body.history ?? []).slice(-8)) messages.push(m);

  // Always include the current code as the latest context
  if (body.imageDataUrl && body.imageDataUrl.startsWith("data:image/")) {
    // Vision call: send the image alongside the text instruction.
    const m = body.imageDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (m) {
      const mediaType = m[1];
      const data = m[2];
      messages.push({
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data } },
          { type: "text", text: `Rebuild the UI shown in the image inside my project.\n\nCurrent code (replace it entirely):\n\n${body.currentCode || "(empty)"}\n\nAdditional notes from me: ${body.prompt || "(none)"}\n\nMatch the layout and visual hierarchy of the image. Use Sankofa's design tokens (dark bg #0a0f0d, emerald accent, amber, mobile-first). Make it interactive on first render.` },
        ],
      });
    }
  } else {
    messages.push({
      role: "user",
      content: `Current code in the editor:\n\n${body.currentCode || "(empty)"}\n\n---\n\nMy request: ${body.prompt}`,
    });
  }

  const sysParts: string[] = [brain, SYSTEM];
  if (body.userName || body.field) sysParts.push(`\n\nThe student is ${body.userName ?? "a learner"}${body.field ? ` studying ${body.field}` : ""}.`);
  if (body.genomeVoice) sysParts.push(`\n\nVoice instruction for this student: ${body.genomeVoice}`);
  if (body.templateName) sysParts.push(`\n\nThis project is built from the "${body.templateName}" template.`);

  const client = new Anthropic({ apiKey });
  const stream = await client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 6000,
    system: [{ type: "text", text: sysParts.join(""), cache_control: { type: "ephemeral" } }],
    // The Anthropic SDK accepts text-only or multi-modal content; cast to its
    // expected shape since our local MultiMsg type is broader.
    messages: messages as unknown as Parameters<typeof client.messages.stream>[0]["messages"],
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
        controller.enqueue(encoder.encode(`<!-- error: ${(err as Error).message} -->`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, { headers: { "Content-Type": "text/plain; charset=utf-8", "x-mode": "live" } });
}

function makeFallback(b: Body): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const reply = `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #0a0f0d; color: #e7efe9; font-family: -apple-system, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { max-width: 420px; padding: 28px; border: 1px solid #2a3a35; border-radius: 18px; background: #141d1a; text-align: center; }
  h1 { margin: 0 0 10px; font-size: 22px; }
  p { color: #8aa39a; line-height: 1.6; font-size: 14px; }
  .accent { color: #2cc295; }
  code { background: #1f2c28; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
</style></head>
<body>
  <div class="card">
    <h1>🔌 Demo mode</h1>
    <p>Your prompt was: "${b.prompt.replace(/[<>]/g, "")}"</p>
    <p>To get a live build, set <code>ANTHROPIC_API_KEY</code> on your Vercel project. Then I'll generate the full HTML/CSS/JS file for what you asked.</p>
    <p class="accent">For now, the canvas is yours — edit the code directly in the editor pane.</p>
  </div>
</body></html>`;
  return new ReadableStream({
    async start(controller) {
      const tokens = reply.split(/(\s+)/);
      for (const t of tokens) {
        controller.enqueue(encoder.encode(t));
        await new Promise((r) => setTimeout(r, 4));
      }
      controller.close();
    },
  });
}
