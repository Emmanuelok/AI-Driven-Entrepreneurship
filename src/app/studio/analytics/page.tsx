"use client";

import { useStore, level } from "@/store";
import { Card, Stat } from "@/components/ui";
import { TRACKS } from "@/lib/curriculum";
import { BarChart3, TrendingUp, Flame, Trophy } from "lucide-react";
import { BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, RadialBar, RadialBarChart, PolarAngleAxis } from "recharts";

export default function AnalyticsPage() {
  const { xp, streak, ventures, cards, decks, progress, bookings } = useStore();

  const completed = Object.values(progress).filter((p) => p.status === "completed").length;
  const inProgress = Object.values(progress).filter((p) => p.status === "in-progress").length;

  const trackData = TRACKS.map((t) => ({
    name: t.title.split(" ").slice(0, 2).join(" "),
    completed: Object.values(progress).filter((p) => p.trackId === t.id && p.status === "completed").length,
    total: t.lessons.length,
    color: t.color,
  }));

  const skillRadial = [
    { name: "Math", value: Math.min(100, completed * 20), fill: "#f4a949" },
    { name: "Code", value: Math.min(100, completed * 18), fill: "#6c8cff" },
    { name: "STEM", value: Math.min(100, completed * 22), fill: "#2cc295" },
    { name: "Venture", value: Math.min(100, ventures.length * 35), fill: "#d96444" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2">Personal analytics</p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">Your growth, made visible.</h1>
      </div>

      <div className="grid sm:grid-cols-4 gap-3 mb-8">
        <Stat label="XP earned" value={xp.toLocaleString()} color="emerald" sub={`Level ${level(xp)}`} />
        <Stat label="Streak" value={`${streak}d`} color="rust" sub="Keep it alive" />
        <Stat label="Lessons complete" value={completed} color="amber" sub={`${inProgress} in progress`} />
        <Stat label="Ventures shipped" value={ventures.length} color="indigo" sub={`${ventures.reduce((s, v) => s + v.interviews.length, 0)} interviews`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <Card className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2"><BarChart3 className="size-4 text-emerald" /> Track completion</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={trackData}>
              <CartesianGrid stroke="#1f2c28" strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke="#8aa39a" fontSize={11} />
              <YAxis stroke="#8aa39a" fontSize={11} />
              <Tooltip contentStyle={{ background: "#0f1614", border: "1px solid #1f2c28", borderRadius: 8 }} />
              <Bar dataKey="completed" fill="#2cc295" radius={[6, 6, 0, 0]} />
              <Bar dataKey="total" fill="#1f2c28" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2"><TrendingUp className="size-4 text-emerald" /> Skill mix</h3>
          <ResponsiveContainer width="100%" height={260}>
            <RadialBarChart innerRadius="30%" outerRadius="100%" data={skillRadial} startAngle={90} endAngle={-270}>
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar background dataKey="value" cornerRadius={6} />
              <Tooltip contentStyle={{ background: "#0f1614", border: "1px solid #1f2c28", borderRadius: 8 }} />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="flex justify-around mt-2 text-xs">
            {skillRadial.map((s) => (
              <div key={s.name} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: s.fill }} />
                {s.name}: {s.value}%
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2"><Flame className="size-4 text-rust" /> Habit health</h3>
          <div className="space-y-3">
            <Row label="Current streak" value={`${streak} day${streak === 1 ? "" : "s"}`} />
            <Row label="Total flashcards" value={cards.length.toString()} />
            <Row label="Decks active" value={decks.length.toString()} />
            <Row label="Mentor sessions booked" value={bookings.length.toString()} />
          </div>
        </Card>
        <Card className="p-6">
          <h3 className="font-medium mb-4 flex items-center gap-2"><Trophy className="size-4 text-amber" /> Venture pipeline</h3>
          {ventures.length === 0 ? (
            <p className="text-sm text-muted">No ventures yet.</p>
          ) : (
            <div className="space-y-3">
              {ventures.map((v) => (
                <div key={v.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium truncate">{v.name}</span>
                    <span className="text-muted text-xs">{v.phase}</span>
                  </div>
                  <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald rounded-full" style={{ width: `${(v.interviews.length / v.metrics.interviewsTarget) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="font-mono text-emerald">{value}</span>
    </div>
  );
}
