"use client";

import Link from "next/link";
import { Card, Badge, Button, Stat } from "@/components/ui";
import { Building2, Users, GraduationCap, TrendingUp, Award, BookOpen, Globe2, ArrowLeft, ArrowRight } from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, LineChart, Line } from "recharts";

const COHORT_STATS = [
  { month: "Jan", active: 412, ventures: 18 },
  { month: "Feb", active: 487, ventures: 24 },
  { month: "Mar", active: 542, ventures: 31 },
  { month: "Apr", active: 598, ventures: 39 },
  { month: "May", active: 671, ventures: 47 },
];

const SKILL_DIST = [
  { skill: "Python", n: 487 },
  { skill: "AI/ML", n: 312 },
  { skill: "Cust. Disc.", n: 287 },
  { skill: "Calculus", n: 245 },
  { skill: "Pitching", n: 198 },
  { skill: "Statistics", n: 176 },
];

const TOP_VENTURES = [
  { name: "KubaCold", lead: "Ama Mensah", sector: "Agritech", traction: "$2.2k MRR", phase: "Launch" },
  { name: "TriageGPT", lead: "Adaeze Nwosu", sector: "Healthtech", traction: "11 pilot clinics", phase: "Discover" },
  { name: "KiviPay", lead: "Achieng' Otieno", sector: "Fintech", traction: "$8.4k MRR", phase: "Launch" },
  { name: "SahelWeather", lead: "Boubacar Diallo", sector: "Climate", traction: "1,200 farmers", phase: "MVP" },
];

export default function InstitutionPage() {
  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-2">
            <Building2 className="size-3.5" /> Institution dashboard · KNUST
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">Cohort growth, at a glance.</h1>
          <p className="mt-2 text-muted">Real-time view of your 671 active learners, 47 ventures in motion, and the skill density across cohorts.</p>
        </div>
        <Link href="/studio" className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5">
          <ArrowLeft className="size-3.5" /> Back to my view
        </Link>
      </div>

      <div className="grid sm:grid-cols-4 gap-3 mb-8">
        <Stat label="Active learners" value="671" sub="+12% MoM" color="emerald" />
        <Stat label="Ventures in motion" value="47" sub="11 with revenue" color="amber" />
        <Stat label="Lessons completed (mo)" value="4,892" sub="7.3 / learner" color="indigo" />
        <Stat label="Credentials issued (mo)" value="238" sub="employer-verifiable" color="rust" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <Card className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2"><TrendingUp className="size-4 text-emerald" /> Active learners + ventures (5 months)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={COHORT_STATS}>
              <CartesianGrid stroke="#1f2c28" strokeDasharray="3 3" />
              <XAxis dataKey="month" stroke="#8aa39a" fontSize={11} />
              <YAxis stroke="#8aa39a" fontSize={11} />
              <Tooltip contentStyle={{ background: "#0f1614", border: "1px solid #1f2c28", borderRadius: 8 }} />
              <Line type="monotone" dataKey="active" stroke="#2cc295" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="ventures" stroke="#f4a949" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2"><GraduationCap className="size-4 text-amber" /> Skill density (verified credentials)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={SKILL_DIST} layout="vertical">
              <CartesianGrid stroke="#1f2c28" strokeDasharray="3 3" />
              <XAxis type="number" stroke="#8aa39a" fontSize={11} />
              <YAxis dataKey="skill" type="category" stroke="#8aa39a" fontSize={11} width={80} />
              <Tooltip contentStyle={{ background: "#0f1614", border: "1px solid #1f2c28", borderRadius: 8 }} />
              <Bar dataKey="n" fill="#2cc295" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-medium flex items-center gap-2"><Award className="size-4 text-amber" /> Top ventures (Q2)</h3>
          <Link href="#" className="text-sm text-emerald hover:underline">All 47 →</Link>
        </div>
        <div className="grid gap-2">
          {TOP_VENTURES.map((v) => (
            <div key={v.name} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-surface-2/40 hover:bg-surface-2 transition">
              <div className="size-10 rounded-xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-semibold text-sm">{v.name[0]}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{v.name}</div>
                <div className="text-xs text-muted">Led by {v.lead} · {v.sector}</div>
              </div>
              <Badge color="emerald">{v.traction}</Badge>
              <Badge color="amber">{v.phase}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-6 lg:col-span-2 bg-gradient-to-br from-emerald/5 to-amber/5">
          <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold flex items-center gap-2">
            <Globe2 className="size-5 text-emerald" /> Partner program
          </h3>
          <p className="text-sm text-muted mt-2 leading-relaxed">
            Bring Sankofa Studio into your institution. Custom cohort tracks, mentor co-branding, employer pipeline access, and white-labeled credentials.
          </p>
          <ul className="mt-4 space-y-1.5 text-sm">
            <li className="text-foreground/90">→ Cohort licensing from $5,000/year (5,000 students)</li>
            <li className="text-foreground/90">→ Faculty dashboards + cohort progress reports</li>
            <li className="text-foreground/90">→ Co-branded portfolio domain (e.g. <code className="text-emerald">portfolio.knust.edu.gh</code>)</li>
            <li className="text-foreground/90">→ Direct employer attestation pipeline (Andela, Microsoft 4Africa, Google etc.)</li>
          </ul>
          <Button className="mt-5">Talk to partnerships <ArrowRight className="size-4" /></Button>
        </Card>

        <Card className="p-6">
          <h3 className="font-medium mb-3 flex items-center gap-2"><BookOpen className="size-4 text-amber" /> Recent faculty actions</h3>
          <ul className="space-y-3 text-sm">
            <li>
              <div className="text-foreground/90">Dr. Owusu added 24 problems to <em>Agric Econ 401</em>.</div>
              <div className="text-xs text-muted mt-0.5">2h ago</div>
            </li>
            <li>
              <div className="text-foreground/90">Cohort W24 started Track <em>AI for Your Field</em>.</div>
              <div className="text-xs text-muted mt-0.5">5h ago</div>
            </li>
            <li>
              <div className="text-foreground/90">Prof. M. approved 14 verifiable credentials.</div>
              <div className="text-xs text-muted mt-0.5">1d ago</div>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
