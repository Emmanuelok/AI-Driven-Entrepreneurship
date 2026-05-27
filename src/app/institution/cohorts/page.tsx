"use client";

import Link from "next/link";
import { useExt } from "@/store/extensions";
import { Card, Badge, Stat, Button } from "@/components/ui";
import { Users, Calendar, CheckCircle2, Clock, ArrowLeft, GraduationCap, Trophy, Sparkles } from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Cell } from "recharts";

export default function CohortsPage() {
  const { cohorts } = useExt();
  const cohort = cohorts[0];

  if (!cohort) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-20 text-center">
        <p className="text-muted">No cohort loaded. Refresh to seed the demo cohort.</p>
      </div>
    );
  }

  const totalXP = cohort.members.reduce((s, m) => s + m.xp, 0);
  const avgXP = Math.round(totalXP / cohort.members.length);
  const top5 = [...cohort.members].sort((a, b) => b.xp - a.xp).slice(0, 5);
  const ventures = new Set(cohort.members.filter((m) => m.venture).map((m) => m.venture));

  const memberChart = cohort.members.sort((a, b) => b.xp - a.xp).map((m) => ({
    name: m.name.split(" ")[0],
    xp: m.xp,
    color: m.xp >= avgXP * 1.2 ? "#2cc295" : m.xp >= avgXP * 0.7 ? "#f4a949" : "#d96444",
  }));

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/institution" className="text-sm text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-6">
        <ArrowLeft className="size-3.5" /> Institution dashboard
      </Link>

      <div className="flex items-end justify-between flex-wrap gap-3 mb-8">
        <div>
          <Badge color="indigo">{cohort.institution}</Badge>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight mt-2">{cohort.name}</h1>
          <p className="mt-2 text-muted">
            {cohort.startDate} → {cohort.endDate} · {cohort.members.length} members · {ventures.size} ventures in motion
          </p>
        </div>
        <Button><Sparkles className="size-4" /> Send cohort prompt</Button>
      </div>

      <div className="grid sm:grid-cols-4 gap-3 mb-8">
        <Stat label="Members" value={cohort.members.length} color="emerald" />
        <Stat label="Total XP" value={totalXP.toLocaleString()} color="amber" />
        <Stat label="Avg level" value={Math.round(cohort.members.reduce((s, m) => s + m.level, 0) / cohort.members.length)} color="indigo" />
        <Stat label="Ventures spun up" value={ventures.size} color="rust" />
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4 mb-8">
        <Card className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2"><GraduationCap className="size-4 text-emerald" /> Member XP distribution</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={memberChart}>
              <CartesianGrid stroke="#1f2c28" strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke="#8aa39a" fontSize={11} />
              <YAxis stroke="#8aa39a" fontSize={11} />
              <Tooltip contentStyle={{ background: "#0f1614", border: "1px solid #1f2c28", borderRadius: 8 }} />
              <Bar dataKey="xp" radius={[6, 6, 0, 0]}>
                {memberChart.map((m, i) => <Cell key={i} fill={m.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="text-xs text-muted text-center mt-2">Green: ≥1.2× avg · Amber: 0.7–1.2× · Red: needs intervention</div>
        </Card>
        <Card className="p-5">
          <h3 className="font-medium mb-4 flex items-center gap-2"><Trophy className="size-4 text-amber" /> Top 5</h3>
          <div className="space-y-2">
            {top5.map((m, i) => (
              <div key={m.id} className="flex items-center gap-3">
                <div className="size-6 rounded-full bg-surface-2 flex items-center justify-center font-mono text-xs text-muted">{i + 1}</div>
                <div className="size-9 rounded-full bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-semibold text-xs">{m.name[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{m.name}</div>
                  <div className="text-xs text-muted truncate">{m.venture ?? "no venture yet"}</div>
                </div>
                <div className="text-right">
                  <div className="text-emerald font-mono text-sm">{m.xp}</div>
                  <div className="text-[10px] text-muted">Lv {m.level}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-6 mb-8">
        <h3 className="font-medium mb-5 flex items-center gap-2"><Calendar className="size-4 text-emerald" /> Cohort milestones</h3>
        <div className="space-y-3">
          {cohort.milestones.map((m) => {
            const icon = m.status === "done" ? CheckCircle2 : m.status === "in-progress" ? Clock : Calendar;
            const Icon = icon;
            return (
              <div key={m.id} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-surface-2/40">
                <Icon className={`size-5 ${m.status === "done" ? "text-emerald" : m.status === "in-progress" ? "text-amber" : "text-muted"}`} />
                <div className="flex-1">
                  <div className="font-medium">{m.title}</div>
                  <div className="text-xs text-muted">Due {m.due}</div>
                </div>
                <Badge color={m.status === "done" ? "emerald" : m.status === "in-progress" ? "amber" : "muted"}>{m.status}</Badge>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-6 overflow-x-auto">
        <h3 className="font-medium mb-5 flex items-center gap-2"><Users className="size-4 text-emerald" /> Roster</h3>
        <table className="w-full text-sm min-w-[600px]">
          <thead className="text-xs uppercase tracking-widest text-muted">
            <tr>
              <th className="text-left py-2">Member</th>
              <th className="text-left">Venture</th>
              <th className="text-right">XP</th>
              <th className="text-right">Level</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cohort.members.map((m) => (
              <tr key={m.id} className="border-t border-border hover:bg-surface-2/40 transition">
                <td className="py-3">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-full bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-semibold text-xs">{m.name[0]}</div>
                    <span className="font-medium">{m.name}</span>
                  </div>
                </td>
                <td className="text-muted">{m.venture ?? "—"}</td>
                <td className="text-right font-mono text-emerald">{m.xp}</td>
                <td className="text-right text-muted">Lv {m.level}</td>
                <td className="text-right"><button className="text-emerald hover:underline text-xs">Profile →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
