"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Card, Badge, Button } from "@/components/ui";
import { Rocket, GitBranch, Cloud, Key, Zap, Terminal, Globe, Database, Shield, ArrowRight, Hammer, GitMerge } from "lucide-react";

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
          Six short lessons. Every one ends with you having actually shipped something.
          Built for the moment you&apos;ve made something in the AI Build Studio and you&apos;re ready
          to put it in front of a real person.
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

