"use client";

import Link from "next/link";
import { motion, useScroll, useTransform, useInView, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, Brain, Compass, FlaskConical, Rocket, Sparkles, Globe2, Users,
  Trophy, CheckCircle2, Languages, Wifi, HeartHandshake, Bot, Lightbulb, Map,
  FileText, Notebook, Target, Paintbrush, Wallet, Network, MessageSquare, Zap,
  Quote, Play, Hammer, LinkIcon, Calendar, KanbanSquare, Paperclip,
} from "lucide-react";
import { ConstellationAfrica } from "@/components/constellation-africa";
import { HeroCanvas } from "@/components/hero-canvas";
import { STORIES, HOOKS } from "@/lib/landing-stories";
import { useStore } from "@/store";

export default function Landing() {
  return (
    <div className="flex flex-col bg-background">
      <Nav />
      <Scene1Hero />
      <Scene2Mirror />
      <Scene3LivingExamples />
      <Scene4ShipHour />
      <Scene5Pillars />
      <SceneTogether />
      <Scene6Voices />
      <Scene7Stakes />
      <Scene8Call />
      <Footer />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   NAV
   ────────────────────────────────────────────────────────────────────────────── */

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.4 }}
      className={`fixed top-0 inset-x-0 z-50 transition-all ${scrolled ? "glass border-b border-border" : "bg-transparent"}`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between px-5 sm:px-8 h-16">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo />
          <div className="flex flex-col leading-tight">
            <span className="font-[family-name:var(--font-display)] text-[17px] font-semibold tracking-tight">Sankofa Studio</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted">From classroom to creator</span>
          </div>
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm text-muted">
          <a href="#ship" className="hover:text-foreground transition">Ship Hour</a>
          <Link href="/studio/workspaces" className="hover:text-foreground transition">Workspaces</Link>
          <a href="#voices" className="hover:text-foreground transition">Voices</a>
          <Link href="/studio/atlas" className="hover:text-foreground transition">Atlas</Link>
          <Link href="/sign-in" className="hover:text-foreground transition">Sign in</Link>
        </nav>
        <Link href="/studio" className="flex items-center gap-1.5 bg-emerald text-black font-medium text-sm px-4 py-2 rounded-full hover:bg-amber transition shadow-lg shadow-emerald/30">
          Enter Studio <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </motion.header>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   SCENE 1 — HERO
   Africa constellation forms. Mouse-reactive. Big italic emerald headline.
   ────────────────────────────────────────────────────────────────────────────── */

function Scene1Hero() {
  const { scrollY } = useScroll();
  const opacity = useTransform(scrollY, [0, 400], [1, 0]);
  const y = useTransform(scrollY, [0, 400], [0, -80]);
  // Recognize returning users (mount-gated so SSR HTML stays identical
  // for visitors and the store only reads after hydration).
  const { user, streak, ventures } = useStore();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const returning = mounted && user ? { name: user.name.split(" ")[0], streak, venture: ventures[0] } : null;

  return (
    <section className="relative h-screen flex items-center justify-center overflow-hidden">
      <ConstellationAfrica />
      <motion.div style={{ opacity, y }} className="relative max-w-5xl px-5 sm:px-8 text-center">
        {returning ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            <Link
              href="/studio"
              className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-emerald mb-7 border border-emerald/30 bg-emerald/5 px-3 py-1.5 rounded-full backdrop-blur hover:bg-emerald/10 transition"
            >
              <span className="size-1.5 rounded-full bg-emerald pulse-dot" />
              Welcome back, {returning.name}
              {returning.streak > 0 && <> · day {returning.streak}</>}
              {returning.venture && <> · {returning.venture.name} is in {returning.venture.phase}</>}
              <ArrowRight className="size-3" />
            </Link>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-emerald mb-7 border border-emerald/30 bg-emerald/5 px-3 py-1.5 rounded-full backdrop-blur"
          >
            <span className="size-1.5 rounded-full bg-emerald pulse-dot" /> For the next generation of African problem-solvers
          </motion.div>
        )}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.8 }}
          className="font-[family-name:var(--font-display)] text-[52px] leading-[1] sm:text-[88px] sm:leading-[1] font-semibold tracking-tight"
        >
          Don&apos;t just <span className="text-emerald italic">learn</span>.<br />
          Ship a <span className="text-amber italic">venture</span> that<br />
          solves your continent.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.4 }}
          className="mt-8 max-w-2xl mx-auto text-lg sm:text-xl text-muted leading-relaxed"
        >
          The studio that takes you from the moment you open your laptop to the moment a real customer
          says <span className="text-foreground">yes</span> — within 60 minutes.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.8 }}
          className="mt-10 flex flex-col sm:flex-row gap-3 justify-center"
        >
          <Link
            href="/studio"
            className="group flex items-center justify-center gap-2 bg-emerald text-black font-semibold px-7 py-4 rounded-full hover:bg-amber transition text-base shadow-2xl shadow-emerald/30"
          >
            Begin Ship Hour <ArrowRight className="size-4 group-hover:translate-x-0.5 transition" />
          </Link>
          <a
            href="#mirror"
            className="flex items-center justify-center gap-2 border border-border bg-surface/60 backdrop-blur px-6 py-4 rounded-full hover:bg-surface-2 transition text-foreground/90 text-base"
          >
            <Play className="size-4" /> See what you&apos;d build
          </a>
        </motion.div>
      </motion.div>

      {/* Scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.2, duration: 0.6 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 text-xs uppercase tracking-[0.2em] text-muted flex flex-col items-center gap-2"
      >
        <span>Scroll</span>
        <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 1.8, repeat: Infinity }}>
          <div className="size-6 rounded-full border border-muted flex items-start justify-center pt-1.5">
            <div className="size-1 rounded-full bg-emerald" />
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   SCENE 2 — MIRROR
   "You're not generic." Auto-cycles HOOKS, showing what THIS field would experience.
   ────────────────────────────────────────────────────────────────────────────── */

function Scene2Mirror() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % HOOKS.length), 4200);
    return () => clearInterval(t);
  }, []);
  const hook = HOOKS[idx];

  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="mirror" ref={ref} className="relative py-32 sm:py-40 px-5 sm:px-8 overflow-hidden">
      <div className="absolute inset-0 grid-paper opacity-30" />
      <motion.div
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ duration: 0.8 }}
        className="relative max-w-5xl mx-auto text-center"
      >
        <p className="text-xs uppercase tracking-[0.25em] text-amber mb-6">A studio that morphs to you</p>
        <h2 className="font-[family-name:var(--font-display)] text-4xl sm:text-6xl font-semibold leading-[1.05] tracking-tight">
          You&apos;re <span className="italic text-emerald">not</span> a generic student.<br />
          Why should your platform be?
        </h2>
        <p className="mt-6 text-lg text-muted max-w-2xl mx-auto leading-relaxed">
          Sankofa morphs around your school, your major, your country, your language, your fears, and your style.
          Two students with the same major see different content. Two with the same town see different mentors.
        </p>

        <div className="relative h-44 mt-14 max-w-3xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="absolute inset-0 flex flex-col items-center justify-center"
            >
              <div className="text-xs uppercase tracking-[0.2em] text-emerald mb-3">If you study {hook.field}…</div>
              <p className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl leading-tight max-w-2xl">
                {hook.line}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-8 flex justify-center gap-1.5">
          {HOOKS.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={`h-1 rounded-full transition-all ${i === idx ? "w-10 bg-emerald" : "w-2 bg-border hover:bg-muted"}`}
            />
          ))}
        </div>
      </motion.div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   SCENE 3 — LIVING EXAMPLES
   Real (fictional) shipped artifacts cycling — feels like a live feed.
   ────────────────────────────────────────────────────────────────────────────── */

function Scene3LivingExamples() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  return (
    <section ref={ref} className="relative py-24 sm:py-32 px-5 sm:px-8 border-y border-border bg-surface/30">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="mb-12 max-w-3xl"
        >
          <p className="text-xs uppercase tracking-[0.25em] text-emerald mb-4">Today on Sankofa</p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-5xl font-semibold leading-[1.1]">
            Students shipped <span className="text-emerald italic">real things</span> in the last hour.
          </h2>
          <p className="mt-5 text-muted text-lg leading-relaxed">
            Not lessons completed. Not certificates earned. <span className="text-foreground">Letters signed.
            Pitches delivered. First sales closed.</span> Each one started this morning.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {STORIES.map((s, i) => (
            <motion.article
              key={s.who}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.1 + i * 0.07 }}
              className="glass rounded-2xl p-5 hover:border-emerald/40 transition group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] uppercase tracking-widest text-emerald border border-emerald/40 bg-emerald/5 px-2 py-0.5 rounded-full">
                  {s.artifactKind}
                </div>
                <div className="text-[10px] text-muted font-mono">Minute {s.minutesIn}</div>
              </div>
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-bold text-sm shrink-0">{s.who[0]}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{s.who}</div>
                  <div className="text-[11px] text-muted truncate">{s.field} · {s.school}, {s.city}</div>
                </div>
              </div>
              <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold leading-tight mt-3">{s.shipped}</h3>
              <p className="mt-3 text-sm text-muted leading-relaxed line-clamp-4 italic">"{s.artifactExcerpt}"</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   SCENE 4 — SHIP HOUR (timeline)
   ────────────────────────────────────────────────────────────────────────────── */

const SHIP_STAGES = [
  { n: 1, title: "Pick your wedge", desc: "From the 30+ problems sized to your discipline.", min: 5 },
  { n: 2, title: "Find your person", desc: "One specific human. Name. Location. Pain.", min: 10 },
  { n: 3, title: "Practice the interview", desc: "Sage role-plays your customer. You sharpen questions.", min: 20 },
  { n: 4, title: "Slice it small", desc: "30 words or less. Validatable in 14 days.", min: 25 },
  { n: 5, title: "Build the artifacts", desc: "7 real deliverables: LOI, pricing, pitch, landing copy.", min: 50 },
  { n: 6, title: "Ship it", desc: "Send the WhatsApp. Email the LOI. Commit.", min: 55 },
  { n: 7, title: "Reflect", desc: "Memorialize what you learned. Set a 14-day goal.", min: 60 },
];

function Scene4ShipHour() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="ship" ref={ref} className="relative py-32 sm:py-40 px-5 sm:px-8 overflow-hidden">
      <div className="absolute -top-32 -right-32 size-96 rounded-full bg-amber/20 blur-3xl" />
      <div className="absolute -bottom-32 -left-32 size-96 rounded-full bg-emerald/20 blur-3xl" />
      <div className="relative max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <p className="text-xs uppercase tracking-[0.25em] text-amber mb-4">The 60-minute promise</p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-6xl font-semibold leading-[1.05]">
            Open your laptop at <span className="text-emerald italic">9:00 AM</span>.<br />
            Send a real customer a real offer by <span className="text-amber italic">10:00 AM</span>.
          </h2>
          <p className="mt-6 text-muted text-lg max-w-2xl mx-auto">
            Seven stages, guided by Sage. Each one ends with a real artifact you keep.
          </p>
        </motion.div>

        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute left-6 sm:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-emerald to-transparent" />

          {SHIP_STAGES.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, x: i % 2 === 0 ? -40 : 40 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.2 + i * 0.1 }}
              className={`relative flex items-center mb-8 ${i % 2 === 0 ? "sm:justify-start" : "sm:justify-end"}`}
            >
              <div className="absolute left-6 sm:left-1/2 -translate-x-1/2 size-12 rounded-full bg-surface-2 border-2 border-emerald flex items-center justify-center font-mono text-emerald font-semibold z-10 shadow-lg shadow-emerald/20">
                {s.n}
              </div>
              <div className={`pl-20 sm:pl-0 sm:w-[calc(50%-3rem)] ${i % 2 === 0 ? "sm:pr-12 sm:text-right" : "sm:pl-12"}`}>
                <div className="glass rounded-2xl p-5">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-emerald mb-2">
                    <span>Minute {s.min}</span>
                  </div>
                  <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold">{s.title}</h3>
                  <p className="text-sm text-muted mt-1.5">{s.desc}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 1.4 }}
          className="text-center mt-12"
        >
          <Link
            href="/studio/ship"
            className="inline-flex items-center gap-2 bg-emerald text-black font-semibold px-7 py-4 rounded-full hover:bg-amber transition text-base shadow-2xl shadow-emerald/30"
          >
            <Zap className="size-5" /> Begin Ship Hour
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   SCENE 5 — PILLARS
   ────────────────────────────────────────────────────────────────────────────── */

const PILLARS = [
  {
    icon: Hammer,
    title: "Build real AI products live",
    body: "An artifact studio with live preview: describe what you want, see it running. Soft AI, robotics controllers, anything. Edit the code if you want. Ship to a real URL.",
    color: "from-indigo to-emerald",
  },
  {
    icon: Brain,
    title: "A mentor who knows you",
    body: "Sage and 5 specialized AI coaches that remember your name, your field, your venture, your fears. Voice-first. Always one tap away.",
    color: "from-emerald to-emerald-deep",
  },
  {
    icon: Map,
    title: "The continent as your canvas",
    body: "32 evidence-backed problems plotted on a real Africa map. Filter by discipline, severity, country. Pick one. Build for it.",
    color: "from-amber to-amber-deep",
  },
  {
    icon: Lightbulb,
    title: "An infinite sketch studio",
    body: "Pen, sticky notes, arrows, shapes, frames. AI populates your board. Real whiteboard, not a stand-in.",
    color: "from-rust to-amber-deep",
  },
  {
    icon: Bot,
    title: "Specialized AI agents",
    body: "18 one-shot agents: investor email, financial model, brand kit, OKR writer, pitch coach, regulator prep. Real work, in seconds.",
    color: "from-indigo to-emerald",
  },
  {
    icon: FlaskConical,
    title: "Run real labs",
    body: "Python in your browser. Circuit builder. Wave interference. Acid-base titration. AoPS-class math drills. No setup, no install.",
    color: "from-indigo to-indigo",
  },
  {
    icon: Users,
    title: "Africa&apos;s best operators",
    body: "20+ booked mentors — Iyinoluwa Aboyeji, Ham Serunjogi, Rebecca Enonchong, Kola Aina, Shola Akinlade. Many pro-bono.",
    color: "from-amber to-emerald",
  },
  {
    icon: Network,
    title: "Workspaces that move",
    body: "Real collaboration: link-share invites, shared task board, co-edited notes, live discussion (Sage joins on @mention), deadlines from anyone — instructor, funder, journal. Cross-continent by default.",
    color: "from-emerald to-indigo",
  },
];

function Scene5Pillars() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  return (
    <section ref={ref} className="border-y border-border bg-surface/40 py-24 sm:py-32 px-5 sm:px-8">
      <div className="max-w-7xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.8 }} className="mb-12 max-w-3xl">
          <p className="text-xs uppercase tracking-[0.25em] text-emerald mb-4">{PILLARS.length} pillars · one studio</p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-5xl font-semibold leading-[1.05]">
            Built like nothing you&apos;ve used.
          </h2>
          <p className="mt-5 text-muted text-lg leading-relaxed">
            Every pillar exists because African and developing-world students were given the global
            platform and told to make it work. We rebuilt the platform.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PILLARS.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className="glass rounded-3xl p-7 hover:border-emerald/40 transition group relative overflow-hidden"
            >
              <div className={`absolute -top-10 -right-10 size-32 rounded-full bg-gradient-to-br ${p.color} opacity-15 blur-3xl group-hover:opacity-30 transition`} />
              <p.icon className="size-7 mb-5 text-emerald relative" />
              <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold relative">{p.title}</h3>
              <p className="mt-3 text-muted leading-relaxed text-sm relative" dangerouslySetInnerHTML={{ __html: p.body }} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   SCENE 5.5 — TOGETHER (Workspaces: cross-continent collaboration showcase)
   ────────────────────────────────────────────────────────────────────────────── */

function SceneTogether() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  return (
    <section ref={ref} className="relative py-24 sm:py-32 px-5 sm:px-8 overflow-hidden">
      {/* Ambient kente-toned bloom */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 size-[640px] rounded-full bg-emerald/10 blur-[120px]" />
        <div className="absolute bottom-0 right-1/3 size-[480px] rounded-full bg-indigo/10 blur-[100px]" />
      </div>

      <div className="relative max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="mb-14 max-w-3xl"
        >
          <p className="text-xs uppercase tracking-[0.25em] text-emerald mb-4 flex items-center gap-2">
            <Network className="size-3.5" /> Workspaces
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-5xl font-semibold leading-[1.05] text-balance">
            Different cities. Different organizations. <span className="text-emerald italic">One project.</span>
          </h2>
          <p className="mt-5 text-muted text-lg leading-relaxed text-balance">
            A workspace is the shared room where teams that span continents actually work. A study group
            across Accra, Nairobi, and Lagos. A research team at three universities. A founder and her
            two advisors in different time zones. Invite anyone with a link. Sage joins when you ask.
          </p>
        </motion.div>

        {/* Feature triptych */}
        <div className="grid lg:grid-cols-3 gap-4">
          {[
            {
              icon: LinkIcon,
              title: "Invite with a link",
              body: "A real shareable URL — email-optional. Multi-use. Roles up to admin. The friend you message lands on a beautiful page in their workspace's accent and joins with one click.",
              tone: "from-emerald to-emerald-deep",
            },
            {
              icon: KanbanSquare,
              title: "Tasks, notes, files, discussion",
              body: "A live Kanban board, co-edited markdown notes with typing presence, file attachments up to 25 MB, and a chat where @sage joins the conversation as a participant.",
              tone: "from-amber to-amber-deep",
            },
            {
              icon: Calendar,
              title: "Deadlines from anyone",
              body: "Self, instructor, funder, investor, journal, mentor — every deadline carries its source. Bell + push to phone + weekly email digest so nothing slips, anywhere.",
              tone: "from-indigo to-emerald",
            },
          ].map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.15 + i * 0.1 }}
              className="glass rounded-3xl p-7 relative overflow-hidden group hover:border-emerald/40 transition"
            >
              <div className={`absolute -top-12 -right-12 size-36 rounded-full bg-gradient-to-br ${f.tone} opacity-20 blur-3xl group-hover:opacity-40 transition`} />
              <f.icon className="size-7 mb-5 text-emerald relative" />
              <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold relative text-balance">{f.title}</h3>
              <p className="mt-3 text-muted leading-relaxed text-sm relative">{f.body}</p>
            </motion.div>
          ))}
        </div>

        {/* Sage as participant — pull-quote */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.55 }}
          className="mt-14 grid lg:grid-cols-2 gap-6 items-stretch"
        >
          <div className="glass rounded-3xl p-7 sm:p-9 relative overflow-hidden">
            <div className="absolute -bottom-12 -left-12 size-40 rounded-full bg-emerald/20 blur-3xl" />
            <div className="relative">
              <div className="text-[10px] uppercase tracking-[0.25em] text-emerald mb-3 flex items-center gap-2">
                <Brain className="size-3" /> Sage in the conversation
              </div>
              <p className="font-[family-name:var(--font-display)] text-2xl leading-snug">
                Type <span className="text-emerald">@sage</span> in any workspace discussion and the AI mentor reads the recent thread and replies as a participant — not a chatbot. Concise, specific, on-topic.
              </p>
              <p className="mt-4 text-sm text-muted">One-click <span className="text-foreground">workspace synthesis</span> reads every surface — discussion, notes, deadlines, tasks — and writes the team a status brief: where it stands, what&apos;s at risk, the three next moves.</p>
            </div>
          </div>
          <div className="glass rounded-3xl p-7 sm:p-9 relative overflow-hidden bg-gradient-to-br from-indigo/10 via-transparent to-emerald/10">
            <div className="absolute -top-12 -right-12 size-44 rounded-full bg-indigo/20 blur-3xl" />
            <div className="relative h-full flex flex-col">
              <div className="text-[10px] uppercase tracking-[0.25em] text-indigo mb-3 flex items-center gap-2">
                <Bot className="size-3" /> Drive it from your own agent
              </div>
              <p className="font-[family-name:var(--font-display)] text-2xl leading-snug">
                A built-in <span className="text-indigo">MCP server</span> exposes your workspaces to Claude Desktop, Cursor, or any MCP-aware client — 12 tools to list, read, post, and update.
              </p>
              <p className="mt-4 text-sm text-muted flex-1">List deadlines from your editor. Create tasks from a script. Post status updates from a CI job. The collaboration engine speaks the protocol agents use.</p>
              <Link href="/studio/workspaces" className="mt-5 self-start inline-flex items-center gap-2 text-sm text-emerald hover:underline">
                See it in the studio <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   SCENE 6 — VOICES (stakeholder quotes that animate in)
   ────────────────────────────────────────────────────────────────────────────── */

const VOICES = [
  { quote: "I have 412 students in my Year 1 Calculus class. I cannot tutor anyone. The AI tutors all want me to switch to English.", who: "Dr. A.", role: "Lecturer, University of Lagos" },
  { quote: "I finished a 6-month Python bootcamp. Recruiters want a portfolio. I have nothing real to show them.", who: "K.", role: "Computer Science graduate, KNUST" },
  { quote: "My students can solve textbook problems perfectly. Ask them to model a real cocoa farm cooperative and they freeze.", who: "Prof. M.", role: "University of Ghana" },
  { quote: "Coursera certificates are not currency here. We need something employers actually verify.", who: "B.", role: "Career services, Nairobi" },
  { quote: "I'm a CHW in Edo State. I diagnose pneumonia by guessing. My phone could do better — but no platform built for me.", who: "Adaeze N.", role: "Community Health Worker" },
  { quote: "I built three apps in school. None of them shipped. Now I'm here and I'm finally building something real.", who: "Y.", role: "BSc Engineering, KNUST" },
];

function Scene6Voices() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  return (
    <section id="voices" ref={ref} className="py-24 sm:py-32 px-5 sm:px-8">
      <div className="max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.8 }} className="text-center mb-16 max-w-3xl mx-auto">
          <p className="text-xs uppercase tracking-[0.25em] text-amber mb-4">Voices from the continent</p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-5xl font-semibold leading-[1.05]">
            We didn&apos;t imagine these problems.<br />We <span className="text-emerald italic">heard</span> them.
          </h2>
        </motion.div>
        <div className="grid sm:grid-cols-2 gap-5">
          {VOICES.map((v, i) => (
            <motion.blockquote
              key={v.who + i}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className="glass rounded-3xl p-7"
            >
              <Quote className="size-6 text-amber/40 mb-3" />
              <p className="text-foreground/95 text-lg leading-relaxed font-[family-name:var(--font-display)]">"{v.quote}"</p>
              <footer className="mt-5 flex items-center gap-3 text-sm">
                <div className="size-9 rounded-full bg-gradient-to-br from-amber to-rust flex items-center justify-center text-black font-semibold">{v.who[0]}</div>
                <div>
                  <div className="font-medium">{v.who}</div>
                  <div className="text-xs text-muted">{v.role}</div>
                </div>
              </footer>
            </motion.blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   SCENE 7 — STAKES (live counters)
   ────────────────────────────────────────────────────────────────────────────── */

function Counter({ to, suffix = "", decimals = 0 }: { to: number; suffix?: string; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const dur = 1800;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(to * eased);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, to]);
  return <span ref={ref}>{val.toFixed(decimals)}{suffix}</span>;
}

function Scene7Stakes() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  return (
    <section id="stakes" ref={ref} className="relative py-32 sm:py-40 px-5 sm:px-8 border-y border-border kente bg-surface/40">
      <div className="max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.8 }} className="text-center mb-16 max-w-3xl mx-auto">
          <p className="text-xs uppercase tracking-[0.25em] text-rust mb-4">The stakes</p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-5xl font-semibold leading-[1.05]">
            Every year, the continent loses generations to a status quo we can fix.
          </h2>
        </motion.div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { v: 11, suf: "M", label: "African tertiary grads / year", sub: "Half unemployed within 12 months" },
            { v: 200, suf: ":1", label: "Student-to-lecturer ratio (SSA median)", sub: "Nobody gets tutored" },
            { v: 331, suf: "B", label: "Unmet SME credit demand ($)", sub: "Markets begging for tools" },
            { v: 600, suf: "M", label: "Africans without reliable electricity", sub: "Minigrid design takes weeks" },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className="glass rounded-2xl p-6"
            >
              <div className="font-[family-name:var(--font-display)] text-5xl font-semibold text-emerald">
                <Counter to={s.v} suffix={s.suf} />
              </div>
              <div className="text-sm text-foreground mt-3">{s.label}</div>
              <div className="text-xs text-muted mt-1">{s.sub}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   SCENE 8 — CALL
   ────────────────────────────────────────────────────────────────────────────── */

function Scene8Call() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  return (
    <section ref={ref} className="relative py-32 sm:py-44 px-5 sm:px-8 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <HeroCanvas />
      </div>
      <div className="absolute -top-40 -right-40 size-[28rem] rounded-full bg-emerald opacity-20 blur-3xl" />
      <div className="absolute -bottom-40 -left-40 size-[28rem] rounded-full bg-amber opacity-20 blur-3xl" />
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 1 }}
        className="relative max-w-3xl mx-auto text-center"
      >
        <Sparkles className="size-10 text-amber mx-auto mb-6" />
        <h2 className="font-[family-name:var(--font-display)] text-4xl sm:text-7xl font-semibold leading-[1] tracking-tight">
          Today is the <span className="text-emerald italic">day</span>.
        </h2>
        <p className="mt-7 text-lg sm:text-xl text-muted leading-relaxed">
          Free for every African tertiary student. Forever. Works on a $50 phone. Offline-tolerant.
          The studio that knows you, and never lets you finish a year having shipped nothing.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/studio"
            className="bg-emerald text-black font-semibold px-8 py-4 rounded-full hover:bg-amber transition flex items-center justify-center gap-2 text-base shadow-2xl shadow-emerald/40"
          >
            Begin · 60 seconds to your workspace <ArrowRight className="size-4" />
          </Link>
          <Link href="/institution" className="border border-border bg-surface/60 backdrop-blur px-7 py-4 rounded-full hover:bg-surface-2 transition flex items-center justify-center gap-2 text-base">
            For universities & partners
          </Link>
        </div>
        <div className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-muted">
          {["No credit card", "Works on $50 phones", "Offline-tolerant", "12 African languages", "Verifiable credentials", "⌘K everywhere"].map((f) => (
            <span key={f} className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-emerald" />{f}</span>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   FOOTER
   ────────────────────────────────────────────────────────────────────────────── */

function Footer() {
  return (
    <footer className="border-t border-border py-14 px-5 sm:px-8">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between gap-8 text-sm text-muted">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <div className="text-foreground font-medium">Sankofa Studio</div>
            <div className="text-xs mt-0.5">Built for the continent. Open to the world.</div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-2">
          <Link href="/studio/ship" className="hover:text-foreground">Ship Hour</Link>
          <Link href="/studio/atlas" className="hover:text-foreground">Atlas</Link>
          <Link href="/studio/arena" className="hover:text-foreground">Arena</Link>
          <Link href="/studio/agents" className="hover:text-foreground">Agents</Link>
          <Link href="/studio/problems" className="hover:text-foreground">Problems</Link>
          <Link href="/studio/mentors" className="hover:text-foreground">Mentors</Link>
          <Link href="/studio/funding" className="hover:text-foreground">Funding</Link>
          <Link href="/institution" className="hover:text-foreground">Institutions</Link>
        </div>
      </div>
      <div className="max-w-7xl mx-auto mt-10 pt-6 border-t border-border text-xs text-muted/70">
        <em>Sankofa</em> — Twi: "go back and fetch what is needed." A reminder that the future is in our past.
      </div>
    </footer>
  );
}

function Logo() {
  return (
    <div className="size-8 rounded-lg bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-bold text-sm shadow-lg shadow-emerald/20">
      <span className="font-[family-name:var(--font-display)]">S</span>
    </div>
  );
}
