"use client";

import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

// Recharts isolated into its own client component so the parent page
// can dynamic-import it. Keeps the ~100KB chart bundle off the
// initial venture cockpit load.

export function GrowthChart({ data }: { data: { week: string; mrr: number; customers: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid stroke="#1f2c28" strokeDasharray="3 3" />
        <XAxis dataKey="week" stroke="#8aa39a" fontSize={12} />
        <YAxis stroke="#8aa39a" fontSize={12} />
        <Tooltip contentStyle={{ background: "#0f1614", border: "1px solid #1f2c28", borderRadius: 8 }} />
        <Line type="monotone" dataKey="mrr" stroke="#2cc295" strokeWidth={2} dot={{ r: 3 }} name="MRR" />
        <Line type="monotone" dataKey="customers" stroke="#f4a949" strokeWidth={2} dot={{ r: 3 }} name="Customers" />
      </LineChart>
    </ResponsiveContainer>
  );
}
