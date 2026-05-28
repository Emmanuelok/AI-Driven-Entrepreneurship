"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Card, Badge } from "@/components/ui";
import { Rocket, GitBranch, Cloud, Key, Zap, Globe, Shield, ArrowRight, Hammer, GitMerge, Bot, Wrench, Brain, DollarSign, Activity } from "lucide-react";

type Lesson = {
  id: string;
  title: string;
  sub: string;
  icon: typeof Rocket;
  minutes: number;
  steps: { title: string; body: string; code?: string }[];
};

const LESSONS: Lesson[] = [
  {
    id: "git",
    title: "Git in 8 minutes",
    sub: "The four commands that get you 90% of the way",
    icon: GitBranch,
    minutes: 8,
    steps: [
      { title: "Why git exists", body: "Git is a time machine for code. Every save is a moment you can return to. Every team works on the same codebase without overwriting each other." },
      { title: "Initialize a project", body: "From inside your project folder, this turns it into a git project. You only do this once.", code: "git init" },
      { title: "Save a snapshot (a commit)", body: "Add tells git which files to include. Commit takes the snapshot with a message describing what changed.", code: "git add .\ngit commit -m \"Add the leaf scanner UI\"" },
      { title: "See what changed", body: "Status shows what's modified. Log shows your history.", code: "git status\ngit log --oneline" },
      { title: "Undo", body: "Reset to a previous commit. Be careful — this rewrites your history.", code: "git reset --hard HEAD~1   # back up one commit" },
      { title: "Practice", body: "Open your AI Build Studio project. Download the .html file. Run `git init` in that folder. Commit. You now have your first git history." },
    ],
  },
  {
    id: "github",
    title: "GitHub in 6 minutes",
    sub: "Your code, in the cloud, visible to anyone you choose",
    icon: GitMerge,
    minutes: 6,
    steps: [
      { title: "What GitHub is", body: "GitHub hosts your git project online. It's where you collaborate, share, and from which most deployments pull your code." },
      { title: "Create a repository", body: "Sign up at github.com → New repository → name it after your build → don't initialize with README (you'll push your own)." },
      { title: "Connect your local project", body: "Replace USER and REPO. Origin is your nickname for GitHub's copy.", code: "git remote add origin https://github.com/USER/REPO.git\ngit branch -M main\ngit push -u origin main" },
      { title: "Push new changes", body: "Every time you commit locally, push to share online.", code: "git add .\ngit commit -m \"Add Twi language option\"\ngit push" },
      { title: "Pull changes from others", body: "If a teammate pushed, pull their work down before you push yours.", code: "git pull" },
    ],
  },
  {
    id: "deploy",
    title: "Deploy to Vercel in 5 minutes",
    sub: "From localhost to a real URL anyone in the world can hit",
    icon: Cloud,
    minutes: 5,
    steps: [
      { title: "Sign up at vercel.com", body: "Sign in with GitHub. Vercel and GitHub work as one." },
      { title: "Import your project", body: "Click 'Add New → Project'. Pick your repo. Click Deploy. That's it." },
      { title: "Get your URL", body: "Vercel gives you a URL like https://your-app.vercel.app. Share it. Anyone can use your build." },
      { title: "Auto-deploy on every push", body: "From now on, every time you `git push`, Vercel rebuilds and updates the live URL. No manual deploy." },
      { title: "Custom domain (later)", body: "When you're ready, buy a domain (Namecheap, Cloudflare) and point it at Vercel. ~$10/year." },
    ],
  },
  {
    id: "env-vars",
    title: "Secrets & API keys",
    sub: "Never commit a key to git. Here's the safe pattern.",
    icon: Key,
    minutes: 4,
    steps: [
      { title: "Why this matters", body: "Anything in git is public to everyone with repo access — and on GitHub, often the world. API keys leaked to a public repo are scraped by bots within minutes and your account gets billed for crypto miners by sunset." },
      { title: "The .env file", body: "Create a file called .env.local in your project root. Put each secret on its own line.", code: "ANTHROPIC_API_KEY=sk-ant-...\nSTRIPE_SECRET=sk_test_..." },
      { title: "Tell git to ignore it", body: "Add to .gitignore — git will refuse to add it.", code: "# .gitignore\n.env\n.env.local\n.env*.local" },
      { title: "Set the same vars on Vercel", body: "Vercel project → Settings → Environment Variables. Paste each one. Now your deployed app has the keys without them ever touching git." },
      { title: "When you suspect a leak", body: "Rotate the key immediately in the provider's dashboard. Don't try to clean git history — assume the leak happened and roll the credential." },
    ],
  },
  {
    id: "api-integration",
    title: "Wire your build to an AI API",
    sub: "Turn your prototype into a working AI product",
    icon: Zap,
    minutes: 7,
    steps: [
      { title: "Pick a model", body: "For most builds: Claude (most reliable reasoning), GPT-4o (cheapest fast), or a small open model on Together / Groq." },
      { title: "Move the call to the server", body: "Never call AI APIs from the browser — your key would be exposed. Create an API route on your server that the frontend calls." },
      { title: "Example: serverless route", body: "In Next.js: src/app/api/triage/route.ts. The frontend POSTs to /api/triage. The server uses your key from .env.", code: "// src/app/api/triage/route.ts\nimport Anthropic from '@anthropic-ai/sdk';\nexport async function POST(req) {\n  const { symptoms } = await req.json();\n  const client = new Anthropic();\n  const res = await client.messages.create({\n    model: 'claude-sonnet-4-6',\n    max_tokens: 400,\n    messages: [{ role: 'user', content: `Triage: ${symptoms}` }],\n  });\n  return Response.json({ verdict: res.content[0].text });\n}" },
      { title: "Stream the response", body: "For long replies, stream so the user sees it appear word-by-word. The Anthropic SDK has .stream() on messages." },
      { title: "Cache and rate-limit", body: "Add a simple rate limit by IP. Cache common responses. Without these, a single hostile loop on your site can spend your monthly budget in an hour." },
    ],
  },
  {
    id: "agent-loop",
    title: "Build an AI agent (the loop)",
    sub: "What turns a chatbot into an agent — and why it matters",
    icon: Bot,
    minutes: 9,
    steps: [
      { title: "Chatbot vs agent", body: "A chatbot replies once and stops. An agent runs in a loop: think → act (call a tool) → observe the result → think again — until the goal is reached or it gives up. That loop is the whole secret." },
      { title: "Pick the agent's job", body: "Narrow beats broad. 'Answer questions about my course notes' ships in a weekend. 'Be a personal CFO' takes a year. Start with one verb and one noun: triage symptoms, price a basket, draft a follow-up." },
      { title: "Open the Tool-Use Agent template", body: "In the AI Build Studio, hit New project → 'Tool-using agent'. You get a working loop with three example tools (clock, calculator, fake search). Read every line — that's the entire pattern." },
      { title: "The minimal loop in pseudocode", body: "This is what's running under every 'agent framework' in the world. Don't let anyone gatekeep it.", code: "while not done and steps < MAX_STEPS:\n  reply = call_claude(messages, tools=TOOLS)\n  if reply.wants_tool:\n    result = run_tool(reply.tool_name, reply.tool_args)\n    messages.push(tool_result=result)\n  else:\n    done = True\n    final = reply.text" },
      { title: "Stop conditions matter", body: "Every agent needs a kill switch: max steps (e.g. 8), max tokens spent (e.g. $0.20), max wall-clock time (e.g. 30s), and a 'no progress' detector. Without these, a confused agent will spin forever and bill you." },
      { title: "Practice", body: "Add a 4th tool to the Tool-Use template — maybe `get_weather(city)` that returns a hardcoded value. Push it on the loop. Watch the agent decide when to call it." },
    ],
  },
  {
    id: "agent-prompts",
    title: "System prompts that actually work",
    sub: "The 200 words that decide whether your agent is useful",
    icon: Brain,
    minutes: 7,
    steps: [
      { title: "The system prompt is the job description", body: "If you wouldn't hire a human with these instructions, your agent will fail too. Be specific about role, scope, tone, what to refuse, and how to format answers." },
      { title: "The 5-part skeleton", body: "Identity. Goals. Available tools (with when to use each). Output format. Failure modes (what to do when stuck).", code: "You are SankofaTriage, a clinical triage assistant for rural\nclinics in Ghana. You speak plain English and Twi when asked.\n\nGOAL: Given symptoms, return a 3-tier urgency rating\n(home-care / clinic-today / hospital-now) and 1-2 next steps.\n\nTOOLS:\n- lookup_drug(name): drug interactions, only when a drug is\n  mentioned by the patient.\n- nearby_clinics(town): used only when urgency >= clinic-today.\n\nOUTPUT: Plain text, max 4 short paragraphs. No medical jargon.\n\nWHEN UNSURE: Refer to hospital-now. Never guess on dosages." },
      { title: "Few-shot beats explaining", body: "Two or three example interactions inside the system prompt teach the agent more than three paragraphs of rules. Show, don't tell." },
      { title: "Eval before you ship", body: "Write 10 hard inputs. Run them through your agent. Read every output. Tweak the prompt. Re-run. This is the loop that separates working agents from demos." },
      { title: "Version your prompts", body: "Save every prompt version with a date and a note about what changed. When the agent regresses, you can diff and find the breaking word." },
    ],
  },
  {
    id: "agent-tools",
    title: "Designing tools your agent can actually use",
    sub: "Bad tools are the #1 reason agents fail",
    icon: Wrench,
    minutes: 8,
    steps: [
      { title: "One verb per tool", body: "search_products is good. handle_inventory is bad — too vague, the agent won't know when to call it. Each tool should do exactly one thing the agent can name." },
      { title: "Describe inputs like you're talking to a 12-year-old", body: "The description IS the contract. Claude reads it and decides whether to call your tool. If it's vague, calls will be wrong.", code: "{\n  name: 'lookup_drug',\n  description: 'Look up a single drug by its generic\\n  name (e.g. \"paracetamol\", not \"Panadol\").\\n  Returns interactions and standard dose range.\\n  Use ONLY when a specific drug name appears in the\\n  user message.',\n  input_schema: { type:'object',\n    properties:{ name:{type:'string'} },\n    required:['name']\n  }\n}" },
      { title: "Validate inputs server-side", body: "Never trust the agent's arguments blindly. If a tool deletes data or spends money, validate the input shape, the user's permission, and the value range — before executing." },
      { title: "Return useful errors, not crashes", body: "If the tool fails, return `{ error: 'no_results', hint: 'try a shorter query' }`. The agent can recover. If it crashes, the loop dies." },
      { title: "Idempotent where possible", body: "If `send_email` runs twice because the agent retried, your user gets two emails. Either make tools idempotent (use a request_id) or warn the agent in the description that retries are dangerous." },
      { title: "The 5-tool rule", body: "Until you've shipped your third agent, keep it under 5 tools. More than that and Claude's tool selection accuracy drops — and so does your debug ability." },
    ],
  },
  {
    id: "agent-cost",
    title: "Streaming, memory, and not going broke",
    sub: "Cost, latency, and context — the three knobs every agent needs",
    icon: DollarSign,
    minutes: 8,
    steps: [
      { title: "Stream the visible reply", body: "Always stream the agent's final text response so users see it forming. Tool calls don't need to stream — they're fast. Use `?stream=1` on the Sankofa proxy or `.stream()` on the SDK." },
      { title: "Conversation memory ≠ infinite", body: "Cap message history. After 20 turns, summarize the first 15 into a single 'context so far' message. Long histories cost more on EVERY turn, not just the last." },
      { title: "Prompt caching = 90% off", body: "Anthropic's prompt caching makes the system prompt + tool definitions effectively free after the first hit. Mark long stable prefixes with `cache_control: { type:'ephemeral' }`.", code: "// Inside the API route\nsystem: [{\n  type: 'text',\n  text: BIG_SYSTEM_PROMPT,\n  cache_control: { type: 'ephemeral' }\n}]" },
      { title: "Pick the smallest model that works", body: "Haiku is 1/12th the price of Opus and finishes most tool-calling jobs just as well. Default to Sonnet, drop to Haiku for triage/classification, escalate to Opus only when reasoning fails." },
      { title: "Rate-limit per user", body: "A stuck loop on someone's phone can hit your API 60×/min. The Sankofa proxy already rate-limits per IP at 30/min — keep that on, and add a per-account cap once you have auth." },
      { title: "Watch the bill daily", body: "Log every call's input/output tokens to your DB. Build a tiny /admin dashboard that shows today's spend per user. You'll catch runaway loops before they cost more than dinner." },
    ],
  },
  {
    id: "agent-deploy",
    title: "Ship your first AI agent",
    sub: "End-to-end: Build Studio → GitHub → Vercel → live URL",
    icon: Activity,
    minutes: 12,
    steps: [
      { title: "Pick the template that fits", body: "Simple chat agent (a friendly Q&A bot for your discipline) is the shortest path to live. Tool-use agent if you need real actions. Voice agent if your users can't type. RAG agent if you have a corpus. Planner agent if the task has steps." },
      { title: "Make it yours in the Build Studio", body: "Open the template → change the system prompt to your domain → swap or add tools → test with 5 real inputs in the iframe. Don't leave the studio until each one feels right." },
      { title: "Download the file", body: "Hit the Export button. You get a single index.html. That's your agent — UI, logic, prompts, all in one file." },
      { title: "Put it on GitHub", body: "Make a new repo. Put your index.html and a one-paragraph README at the root.", code: "git init\ngit add index.html README.md\ngit commit -m \"Ship v1 of TriageAgent\"\ngit remote add origin https://github.com/USER/triage-agent.git\ngit push -u origin main" },
      { title: "Deploy to Vercel", body: "vercel.com → New Project → import the repo → Framework Preset = 'Other' → Deploy. 40 seconds later, live URL." },
      { title: "Wire your own API key (optional)", body: "If you want your agent to call Claude on YOUR key (not Sankofa's proxy), set `ANTHROPIC_API_KEY` in Vercel's Environment Variables, add a tiny serverless route `/api/chat`, and point your agent's fetch() there. See the 'Secrets & API keys' and 'Wire your build to an AI API' lessons above." },
      { title: "Show one person", body: "Send the URL on WhatsApp to a real intended user. Watch them. Note the first 3 things they're confused by. Fix two. Push. Done — Vercel auto-deploys." },
      { title: "What you just shipped", body: "An autonomous loop, with tools, with memory, with cost controls, on a public URL. That's an AI product. Most CS graduates have never done this. You did." },
    ],
  },
  {
    id: "first-customer",
    title: "Get your first real user",
    sub: "Deploy → share → listen",
    icon: Globe,
    minutes: 5,
    steps: [
      { title: "Pick one person", body: "Not 'farmers'. One named person you know. Send them your URL." },
      { title: "Sit with them", body: "Watch them use it. Don't explain. Don't apologize. Write down where they hesitate." },
      { title: "Ship two fixes that night", body: "Whatever made them hesitate: fix it. Push. Send the link again." },
      { title: "Three more people, same thing", body: "By person five your build is sharper than 80% of student projects at your university." },
      { title: "Save the receipts", body: "Screenshot the WhatsApps. Save the voice notes. These are your first proofs for a pitch deck." },
    ],
  },
];

export default function ShipItLessonsPage() {
  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-10">
        <p className="text-xs uppercase tracking-[0.25em] text-emerald mb-2 flex items-center gap-1.5">
          <Rocket className="size-3.5" /> Ship-it Lessons
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl sm:text-5xl font-semibold leading-tight max-w-3xl">
          From your laptop to a real URL anyone in the world can hit.
        </h1>
        <p className="mt-3 text-muted max-w-2xl leading-relaxed">
          Short lessons that always end with you having shipped something — from your first
          commit to a deployed AI agent. Built for the moment you&apos;ve made something in the
          AI Build Studio and you&apos;re ready to put it in front of a real person.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/studio/build" className="bg-emerald text-black font-medium px-5 py-2.5 rounded-full hover:bg-amber transition flex items-center gap-2 text-sm">
            <Hammer className="size-4" /> Open the AI Build Studio
          </Link>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {LESSONS.map((l, i) => (
          <motion.details
            key={l.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass rounded-2xl p-5 group"
          >
            <summary className="cursor-pointer list-none flex items-start gap-4">
              <div className="size-11 rounded-2xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center shrink-0 shadow-lg shadow-emerald/20">
                <l.icon className="size-5 text-black" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <Badge color="emerald">{l.minutes} min</Badge>
                  <Badge color="muted">{l.steps.length} steps</Badge>
                </div>
                <div className="font-[family-name:var(--font-display)] text-lg font-semibold leading-tight">{l.title}</div>
                <p className="text-sm text-muted mt-1">{l.sub}</p>
              </div>
              <ArrowRight className="size-4 text-muted group-open:rotate-90 transition-transform shrink-0 mt-2" />
            </summary>

            <div className="mt-5 pl-15 space-y-4">
              {l.steps.map((s, idx) => (
                <div key={idx} className="flex gap-3">
                  <div className="size-6 rounded-full bg-surface-2 border border-border flex items-center justify-center text-xs font-mono text-muted shrink-0 mt-0.5">{idx + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{s.title}</div>
                    <p className="text-sm text-muted mt-1 leading-relaxed">{s.body}</p>
                    {s.code && (
                      <pre className="mt-2 p-3 rounded-lg bg-[#06100d] border border-border text-xs text-emerald font-[family-name:var(--font-mono)] overflow-x-auto leading-relaxed">{s.code}</pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.details>
        ))}
      </div>

      <Card className="mt-10 p-7 bg-gradient-to-br from-emerald/10 to-amber/10 border-emerald/30">
        <Shield className="size-6 text-amber mb-3" />
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">A note on this layer</h2>
        <p className="mt-3 text-muted text-sm leading-relaxed max-w-2xl">
          Git, GitHub, Vercel, environment variables, API integration, rate-limiting — these are the
          unglamorous skills that separate students whose AI projects live on a laptop from students
          whose AI products live in the world. We&apos;ll keep adding lessons here as you ship.
        </p>
      </Card>
    </div>
  );
}

