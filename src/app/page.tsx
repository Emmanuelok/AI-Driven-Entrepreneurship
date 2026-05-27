import Link from "next/link";
import {
  ArrowRight,
  Brain,
  Compass,
  Code2,
  FlaskConical,
  Rocket,
  Sparkles,
  Globe2,
  Users,
  Trophy,
  CheckCircle2,
  Languages,
  Wifi,
  HeartHandshake,
} from "lucide-react";

const STATS = [
  { v: "11M", l: "African tertiary grads / year — 6M unemployed within 12 months" },
  { v: "200:1", l: "Median student-to-lecturer ratio across SSA public universities" },
  { v: "$331B", l: "Unmet credit demand for African SMEs the next generation could serve" },
  { v: "600M", l: "Africans without reliable electricity — minigrid design takes weeks today" },
];

const COMBINED = [
  ["Brilliant", "Interactive STEM intuition"],
  ["Art of Problem Solving", "Olympiad-grade math mastery"],
  ["Khan Academy", "Free, structured academic learning"],
  ["Codecademy", "Interactive coding, in-browser"],
  ["Coursera / edX", "University-level structured paths"],
  ["Udacity", "AI & tech career tracks"],
  ["Duolingo", "Gamified daily habit loops"],
  ["Anki", "Spaced-repetition retention"],
  ["PhET", "Visual science simulations"],
  ["Labster", "Browser-based virtual labs"],
];

const MODULES = [
  {
    icon: Brain,
    title: "Sage — Your AI Tutor",
    desc: "A 1:1 tutor that speaks your language, knows your context (cedis, NEPA, M-Pesa, boda boda), and never tires. Works on a $50 phone with patchy network.",
    href: "/studio/tutor",
    color: "from-emerald to-emerald-deep",
  },
  {
    icon: Compass,
    title: "Adaptive Learning Tracks",
    desc: "STEM intuition, deep math, code, AI-for-your-field — all in one. Brilliant + AoPS + Khan + Codecademy in a single adaptive engine.",
    href: "/studio/learn",
    color: "from-amber to-amber-deep",
  },
  {
    icon: FlaskConical,
    title: "Practice Lab",
    desc: "Browser-based code playground, math problem grinder, physics simulations, virtual chemistry bench. No setup. Works offline.",
    href: "/studio/lab",
    color: "from-indigo to-indigo",
  },
  {
    icon: Rocket,
    title: "Venture Studio",
    desc: "The unique missing piece: take what you learn, pick a real problem, validate it, build the MVP, get to your first 10 paying customers — with an AI venture coach.",
    href: "/studio/venture",
    color: "from-rust to-amber-deep",
  },
  {
    icon: Globe2,
    title: "Local Problem Hub",
    desc: "A curated, evidence-backed database of the most urgent unsolved problems in African and developing-world communities. Pick one. Build for it.",
    href: "/studio/problems",
    color: "from-emerald to-indigo",
  },
];

const PAIN_POINTS = [
  {
    icon: Languages,
    title: "No tutor speaks Twi, Hausa, or Wolof",
    detail: "Khanmigo, ChatGPT, every major tutor assumes English & US context. 70% of African learners are forced to translate before they can think.",
  },
  {
    icon: Wifi,
    title: "Bandwidth assumes Silicon Valley",
    detail: "Coursera videos buffer on 2G. A 50MB lesson eats a day's data budget. Nothing serious works offline.",
  },
  {
    icon: HeartHandshake,
    title: "Certificates employers don't trust",
    detail: "Andela rejects 98% of African applicants on first screen despite 'completed' courses. Paper credentials are worthless — but nothing replaces them.",
  },
  {
    icon: Rocket,
    title: "You graduate having built nothing",
    detail: "Years of lessons. Zero shipped products. No venture. No portfolio. No revenue. That's the cliff.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col">
      {/* NAV */}
      <header className="sticky top-0 z-50 glass">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-5 sm:px-8 h-16">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <div className="flex flex-col leading-tight">
              <span className="font-[family-name:var(--font-display)] text-[17px] font-semibold tracking-tight">Sankofa Studio</span>
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted">From classroom to creator</span>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm text-muted">
            <Link href="#why" className="hover:text-foreground transition">Why this exists</Link>
            <Link href="#modules" className="hover:text-foreground transition">Studio</Link>
            <Link href="/studio/problems" className="hover:text-foreground transition">Problem Hub</Link>
            <Link href="#pricing" className="hover:text-foreground transition">Access</Link>
          </nav>
          <Link
            href="/studio"
            className="flex items-center gap-1.5 bg-emerald text-black font-medium text-sm px-4 py-2 rounded-full hover:bg-emerald-deep hover:text-foreground transition"
          >
            Enter Studio <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-paper opacity-50 pointer-events-none" />
        <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-20 pb-24 sm:pt-28 sm:pb-32 relative">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-emerald mb-6 border border-emerald/30 bg-emerald/5 px-3 py-1.5 rounded-full">
            <span className="size-1.5 rounded-full bg-emerald pulse-dot" />
            For the next generation of African problem-solvers
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-[44px] leading-[1.05] sm:text-[68px] sm:leading-[1.02] font-semibold max-w-4xl tracking-tight">
            Don't just <span className="text-emerald italic">learn</span>.<br />
            Ship a <span className="text-amber italic">venture</span> that<br />
            solves your continent.
          </h1>
          <p className="mt-7 max-w-2xl text-lg sm:text-xl text-muted leading-relaxed">
            Sankofa Studio is the first learning platform that fuses Brilliant&apos;s intuition, AoPS&apos;s rigor, Khan&apos;s breadth, Codecademy&apos;s practice, Duolingo&apos;s habits, and Labster&apos;s simulations — and then takes you the last mile no one else does: from <span className="text-foreground">classroom to creator</span>.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row gap-3">
            <Link
              href="/studio"
              className="group flex items-center justify-center gap-2 bg-emerald text-black font-semibold px-6 py-3.5 rounded-full hover:bg-amber transition"
            >
              Enter the Studio
              <ArrowRight className="size-4 group-hover:translate-x-0.5 transition" />
            </Link>
            <Link
              href="/studio/problems"
              className="flex items-center justify-center gap-2 border border-border bg-surface px-6 py-3.5 rounded-full hover:bg-surface-2 transition text-foreground/90"
            >
              Browse the Problem Hub
            </Link>
          </div>

          {/* combined-platforms strip */}
          <div className="mt-16 sm:mt-20">
            <p className="text-xs uppercase tracking-[0.22em] text-muted mb-5">Everything from these — in one studio</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-border rounded-2xl overflow-hidden border border-border">
              {COMBINED.map(([name, role]) => (
                <div key={name} className="bg-surface p-4 hover:bg-surface-2 transition">
                  <div className="text-sm font-medium">{name}</div>
                  <div className="text-[11px] text-muted mt-1 leading-snug">{role}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* THE STAKES */}
      <section id="why" className="border-y border-border bg-surface/40 kente">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-16 sm:py-20">
          <div className="grid sm:grid-cols-2 gap-12 items-start">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-amber mb-4">The stakes</p>
              <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl font-semibold leading-tight">
                Africa graduates 11 million students a year. <br />Half are unemployed within a year.
              </h2>
              <p className="mt-5 text-muted leading-relaxed">
                The platforms above teach skills. None of them turn a learner into a <span className="text-foreground">founder who ships</span>. None speak Twi or Yoruba or Pidgin. None work when the lights go out for the third time today. None know that a tro-tro fare is denominated in cedis or that M-Pesa is the rail your venture must integrate with.
              </p>
              <p className="mt-4 text-muted leading-relaxed">
                We&apos;re building the missing layer.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {STATS.map((s) => (
                <div key={s.v} className="glass rounded-2xl p-5">
                  <div className="font-[family-name:var(--font-display)] text-3xl font-semibold text-emerald">{s.v}</div>
                  <div className="text-xs text-muted mt-2 leading-snug">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* THE PAIN POINT */}
      <section className="max-w-7xl mx-auto px-5 sm:px-8 py-20 sm:py-28">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.22em] text-rust mb-4">The unsolved problem we built around</p>
          <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-5xl font-semibold leading-[1.08]">
            The Learning-to-Venture gap — with contextual tutoring no global platform delivers.
          </h2>
          <p className="mt-6 text-lg text-muted leading-relaxed">
            Every other platform stops at &quot;you completed the course.&quot; Stakeholders — learners, tutors, parents, employers — say the same four things over and over. We listened.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-12">
          {PAIN_POINTS.map((p) => (
            <div key={p.title} className="glass rounded-2xl p-6 hover:border-emerald/40 transition group">
              <p.icon className="size-7 text-amber mb-4 group-hover:text-emerald transition" />
              <h3 className="font-semibold text-foreground">{p.title}</h3>
              <p className="mt-2 text-sm text-muted leading-relaxed">{p.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* MODULES */}
      <section id="modules" className="border-y border-border bg-surface/30">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-20 sm:py-28">
          <div className="flex items-end justify-between flex-wrap gap-6 mb-12">
            <div className="max-w-2xl">
              <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-4">The Studio</p>
              <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-5xl font-semibold leading-tight">
                Five modules. One pipeline. Classroom → creator.
              </h2>
            </div>
            <Link href="/studio" className="text-sm text-emerald flex items-center gap-1 hover:gap-2 transition-all">
              See it working <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            {MODULES.map((m) => (
              <Link
                key={m.title}
                href={m.href}
                className="glass rounded-3xl p-7 hover:border-emerald/40 transition group relative overflow-hidden"
              >
                <div className={`absolute -top-12 -right-12 size-40 rounded-full bg-gradient-to-br ${m.color} opacity-20 blur-3xl group-hover:opacity-40 transition`} />
                <m.icon className="size-9 mb-5 text-emerald" />
                <h3 className="font-[family-name:var(--font-display)] text-2xl font-semibold">{m.title}</h3>
                <p className="mt-3 text-muted leading-relaxed">{m.desc}</p>
                <div className="mt-6 flex items-center gap-1.5 text-sm text-emerald">
                  Try it <ArrowRight className="size-4 group-hover:translate-x-1 transition" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="max-w-7xl mx-auto px-5 sm:px-8 py-20 sm:py-28">
        <p className="text-xs uppercase tracking-[0.22em] text-amber mb-4">The journey</p>
        <h2 className="font-[family-name:var(--font-display)] text-3xl sm:text-5xl font-semibold leading-tight max-w-3xl">
          What every Sankofa graduate has shipped before they leave.
        </h2>
        <div className="mt-14 grid md:grid-cols-5 gap-4 relative">
          <div className="hidden md:block absolute top-7 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-emerald to-transparent" />
          {[
            { n: "01", t: "Master fundamentals", d: "STEM intuition + math rigor + code that ships." },
            { n: "02", t: "Pick a real problem", d: "From the Local Problem Hub — affecting people you know." },
            { n: "03", t: "Validate it", d: "AI-coached customer discovery — 20 interviews in 14 days." },
            { n: "04", t: "Build the MVP", d: "In the lab. With AI co-pilots. Even if you can't code." },
            { n: "05", t: "First 10 customers", d: "Ship. Charge. Iterate. Graduate as a founder." },
          ].map((s) => (
            <div key={s.n} className="relative">
              <div className="size-14 rounded-full bg-surface-2 border border-emerald/30 flex items-center justify-center font-mono text-emerald font-semibold relative z-10">
                {s.n}
              </div>
              <h3 className="mt-4 font-semibold">{s.t}</h3>
              <p className="mt-2 text-sm text-muted leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SOCIAL/CONTEXT */}
      <section className="border-y border-border bg-surface/40">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-20 grid lg:grid-cols-3 gap-10 items-start">
          <div className="lg:col-span-1">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-4">Stakeholder voices</p>
            <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight">
              We didn&apos;t imagine these problems. We heard them.
            </h2>
          </div>
          <div className="lg:col-span-2 grid sm:grid-cols-2 gap-4">
            {[
              {
                q: "I have 412 students in my Year 1 Calculus class. I cannot tutor anyone. The AI tutors all want me to switch to English.",
                a: "— Dr. A., Lecturer, University of Lagos",
              },
              {
                q: "I finished a 6-month Python bootcamp. Recruiters want a portfolio. I have nothing real to show them.",
                a: "— K., Computer Science graduate, KNUST",
              },
              {
                q: "My students can solve textbook problems perfectly. Ask them to model a real cocoa farm cooperative and they freeze.",
                a: "— Prof. M., University of Ghana",
              },
              {
                q: "Coursera certificates are not currency here. We need something employers actually verify.",
                a: "— Career services head, Nairobi",
              },
            ].map((t) => (
              <blockquote key={t.a} className="glass rounded-2xl p-6">
                <p className="leading-relaxed text-foreground/90">&ldquo;{t.q}&rdquo;</p>
                <footer className="text-xs text-muted mt-3">{t.a}</footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="pricing" className="max-w-7xl mx-auto px-5 sm:px-8 py-20 sm:py-28">
        <div className="glass rounded-3xl p-10 sm:p-16 relative overflow-hidden">
          <div className="absolute -top-24 -right-24 size-80 rounded-full bg-emerald opacity-10 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 size-80 rounded-full bg-amber opacity-10 blur-3xl" />
          <div className="relative max-w-3xl">
            <Sparkles className="size-9 text-amber mb-5" />
            <h2 className="font-[family-name:var(--font-display)] text-4xl sm:text-6xl font-semibold leading-[1.02]">
              Free for every African tertiary student. Forever.
            </h2>
            <p className="mt-6 text-lg text-muted leading-relaxed">
              Funded by venture-share agreements with successful Sankofa-built startups, partner university subscriptions, and our enterprise upskilling tier. Learners pay zero up front. We win when you win.
            </p>
            <div className="mt-9 flex flex-col sm:flex-row gap-3">
              <Link href="/studio" className="bg-emerald text-black font-semibold px-7 py-3.5 rounded-full hover:bg-amber transition flex items-center justify-center gap-2">
                Start learning free <ArrowRight className="size-4" />
              </Link>
              <Link href="#" className="border border-border bg-surface px-7 py-3.5 rounded-full hover:bg-surface-2 transition flex items-center justify-center gap-2">
                For universities & partners
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-7 gap-y-2 text-sm text-muted">
              {["No credit card", "Works on $50 phones", "Offline-tolerant", "12 African languages launching", "Verifiable credentials"].map((f) => (
                <span key={f} className="flex items-center gap-1.5"><CheckCircle2 className="size-4 text-emerald" />{f}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border py-12">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 flex flex-col sm:flex-row justify-between gap-6 text-sm text-muted">
          <div className="flex items-center gap-2.5">
            <Logo />
            <div>
              <div className="text-foreground font-medium">Sankofa Studio</div>
              <div className="text-xs">Built for the continent. Open to the world.</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <Link href="/studio">Studio</Link>
            <Link href="/studio/problems">Problem Hub</Link>
            <Link href="/studio/tutor">Sage AI Tutor</Link>
            <Link href="/studio/venture">Venture Studio</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Logo() {
  return (
    <div className="size-8 rounded-lg bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-bold text-sm shadow-lg shadow-emerald/20">
      <span className="font-[family-name:var(--font-display)]">S</span>
    </div>
  );
}
