# Sankofa Studio

> The AI-driven learning + venture studio that takes tertiary students across Africa and the developing world from **classroom to creator**.

Built as the foundation for the project _**AI-Driven Entrepreneurship in Higher Education**_ — equipping undergraduate and postgraduate students to apply AI to their fields, master entrepreneurship in theory and practice, and ship ventures that solve critical problems on the continent.

## What this is

A working, deployable MVP of a platform that combines — in one studio — the best of:

| Platform | What we absorbed |
|---|---|
| Brilliant | Interactive STEM intuition |
| Art of Problem Solving | Deep mathematical mastery |
| Khan Academy | Free, structured academic learning |
| Codecademy | In-browser interactive coding (Pyodide) |
| Coursera / edX | University-level structured tracks |
| Udacity | AI & tech career paths |
| Duolingo | Gamified habit loops (streaks, XP, levels) |
| Anki | Spaced-repetition retention |
| PhET | Physics simulations (live pendulum) |
| Labster | Browser-based virtual labs |

Plus the missing layer no global platform delivers: a **Venture Studio** that walks each learner from a real local problem → validated MVP → first paying customers — coached by **Sage**, an AI tutor that knows local context (tro-tros, M-Pesa, cedis, NEPA, Twi/Pidgin/Swahili, etc.).

## The unsolved pain point we built around

After mapping what every major platform does and doesn't do, and listening to stakeholder voices (students, lecturers, employers, career-services heads across SSA), the gap is:

> Students complete thousands of hours of online learning but graduate having **built nothing**. No global platform integrates: *learn a skill → apply it to a real local problem → build an MVP → ship to real users* — in the learner's language, with offline-tolerant AI tutoring that knows local context.

Sankofa Studio is structured around exactly this gap.

## What's in this MVP

- **Landing page** (`/`) — manifesto, stakes, modules, social proof, call-to-action
- **Studio dashboard** (`/studio`) — streak, XP, level progress, active venture, in-progress tracks
- **Sage AI Tutor** (`/studio/tutor`) — streaming chat with Claude (Sonnet 4.6); rich demo fallback when no API key
- **Learning tracks** (`/studio/learn`) — 5 curated tracks across STEM, math, code, AI-for-your-field, venture-building
- **Practice Lab** (`/studio/lab`) — in-browser Python sandbox (Pyodide), real-time pendulum physics simulator, AoPS-style math drill
- **Venture Studio** (`/studio/venture`) — full pipeline view, validation interview log, lean canvas, AI venture coach
- **Local Problem Hub** (`/studio/problems`) — 12 evidence-backed problems across Africa/developing world, each with AI-angle and skills mapping

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript · Turbopack
- Tailwind CSS v4 (custom design tokens; pan-African palette: emerald + amber + rust + kente patterns)
- `@anthropic-ai/sdk` — streaming Claude responses with prompt caching on the system prompt
- Pyodide CDN — Python 3.12 in the browser
- Canvas API — pendulum simulator (real ODE integration at 60fps)

## Run locally

```bash
bun install
bun dev
```

Open <http://localhost:3000>.

### Optional: enable live Claude

```bash
cp .env.example .env.local
# add ANTHROPIC_API_KEY=sk-ant-...
```

Without a key, Sage runs in a polished demo mode (typed-out, context-aware fallback responses).

## Deploy (the fastest way to see it online)

Push this branch to GitHub and click the Vercel button below — it auto-detects Next.js, builds, and deploys in ~90 seconds.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Emmanuelok/AI-Driven-Entrepreneurship&env=ANTHROPIC_API_KEY&envDescription=Optional%20%E2%80%94%20enables%20live%20Claude-powered%20Sage%20tutor)

After deploy, add `ANTHROPIC_API_KEY` in Project Settings → Environment Variables to switch Sage from demo → live.

## Roadmap (post-MVP)

- WhatsApp/USSD entry points so the platform works on feature phones
- 12 African-language voice tutoring (Twi, Yoruba, Hausa, Swahili, Amharic, Wolof, Zulu, Pidgin, etc.)
- Cryptographically-verifiable skill credentials with employer trust API
- University LMS integrations (LOI: UG, KNUST, UoN, Makerere, Wits)
- Venture-share revenue model — graduates pay forward 1% of equity, not tuition
- AGRA / Mastercard Foundation / GIZ partnership grants for under-served cohorts

---

_Project lead: Emmanuel Okraku · Built with care for the continent._
