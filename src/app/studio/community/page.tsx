"use client";

import { useState } from "react";
import { Card, Badge, Button, Input, Textarea, Dialog } from "@/components/ui";
import { Users, MessageSquare, Hash, Plus, Heart, Reply, Calendar, MapPin, ArrowRight } from "lucide-react";
import { useStore } from "@/store";
import { LiveBuildersStrip } from "@/components/live-builders-strip";

const CIRCLES = [
  { id: "agritech-wa", name: "Agritech West Africa", members: 487, sector: "Agriculture", region: "West Africa", desc: "Founders building for African farmers — cocoa, tomatoes, palm oil, livestock." },
  { id: "fintech-eag", name: "Fintech East Africa", members: 1203, sector: "Fintech", region: "East Africa", desc: "Mobile money, lending, savings, cross-border payments." },
  { id: "healthtech-pan", name: "Healthtech Pan-Africa", members: 312, sector: "Health", region: "Pan-African", desc: "Community health workers, telemedicine, supply chain, regulatory." },
  { id: "climate-sahel", name: "Climate × Sahel", members: 198, sector: "Climate", region: "Sahel", desc: "Adaptation tech for the most climate-vulnerable region on earth." },
  { id: "edtech-sa", name: "Edtech Southern Africa", members: 421, sector: "Education", region: "Southern Africa", desc: "From tutoring apps to vocational training platforms." },
  { id: "creative-pan", name: "Creative Economy", members: 654, sector: "Creative", region: "Pan-African", desc: "Music, fashion, design, film. Monetization and global distribution." },
  { id: "wia-founders", name: "Women in African Tech", members: 1837, sector: "All", region: "Pan-African", desc: "Solidarity, deals, intros, no fluff." },
  { id: "techstars-w24", name: "Sankofa W24 Cohort", members: 32, sector: "All", region: "Pan-African", desc: "Private circle for the Winter 2024 venture cohort." },
];

const FEED = [
  { id: "p1", author: "Kojo Mensah", role: "Co-founder, KubaCold", circle: "Agritech West Africa", time: "2h", body: "Just signed our 3rd LOI with a cooperative in Tamale. Anyone shipped solar-powered hardware to rural Ghana — what carrier handled customs cleanly?", likes: 14, replies: 6, tags: ["hardware", "logistics"] },
  { id: "p2", author: "Achieng' Otieno", role: "Founder, KiviPay", circle: "Fintech East Africa", time: "5h", body: "CBK just issued new guidance on agent network compliance. TL;DR: aggregator licenses are 90 days now, not 6 months. Filing tomorrow.", likes: 47, replies: 23, tags: ["regulatory", "Kenya"] },
  { id: "p3", author: "Adaeze Nwosu", role: "Med Student, UNILAG · Building TriageGPT", circle: "Healthtech Pan-Africa", time: "1d", body: "Looking for 2 CHWs in Lagos State to pilot our triage assistant. We'll pay for time. Reply if you can intro.", likes: 22, replies: 11, tags: ["pilot", "Lagos"] },
  { id: "p4", author: "Sage", role: "Bot · Daily prompt", circle: "Sankofa W24 Cohort", time: "8h", body: "**Today's exercise:** Pick the ONE assumption in your venture you're least sure about. Design a 48-hour experiment to test it. Post your design in reply.", likes: 89, replies: 41, tags: ["daily"] },
];

export default function CommunityPage() {
  const [composing, setComposing] = useState(false);
  const { notify } = useStore();

  return (
    <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2">Community</p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">Build alongside 18,000 African builders.</h1>
          <p className="mt-3 text-muted max-w-2xl">Cohorts, peer circles, daily prompts, regional meetups. The network compounds with you.</p>
        </div>
        <Button onClick={() => setComposing(true)}><Plus className="size-4" /> New post</Button>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        {/* Feed */}
        <div className="space-y-3">
          {FEED.map((p) => (
            <Card key={p.id} className="p-5">
              <div className="flex items-start gap-3">
                <div className="size-10 rounded-xl bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-semibold shrink-0">{p.author[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span className="font-medium">{p.author}</span>
                    <span className="text-muted text-xs">· {p.role}</span>
                  </div>
                  <div className="text-xs text-muted">in <span className="text-emerald">#{p.circle}</span> · {p.time}</div>
                  <p className="mt-3 text-foreground/95 leading-relaxed">{p.body}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {p.tags.map((t) => (<span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 border border-border text-muted">#{t}</span>))}
                  </div>
                  <div className="mt-4 flex items-center gap-5 text-xs text-muted">
                    <button className="flex items-center gap-1.5 hover:text-rust transition"><Heart className="size-3.5" /> {p.likes}</button>
                    <button className="flex items-center gap-1.5 hover:text-emerald transition"><Reply className="size-3.5" /> {p.replies}</button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <LiveBuildersStrip area="community" />
          <Card className="p-5">
            <h3 className="font-medium flex items-center gap-2 mb-4"><Users className="size-4 text-emerald" /> Your circles</h3>
            <div className="space-y-2">
              {CIRCLES.slice(0, 5).map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 group cursor-pointer">
                  <div className="min-w-0">
                    <div className="text-sm truncate group-hover:text-emerald transition">#{c.name}</div>
                    <div className="text-xs text-muted">{c.members} members · {c.region}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-medium flex items-center gap-2 mb-4"><MapPin className="size-4 text-emerald" /> Upcoming meetups</h3>
            <div className="space-y-3 text-sm">
              <div>
                <div className="font-medium">Lagos Founders' Friday</div>
                <div className="text-xs text-muted">June 14 · CcHub · 42 going</div>
              </div>
              <div>
                <div className="font-medium">Nairobi Hardware Hackathon</div>
                <div className="text-xs text-muted">June 21–23 · iHub · 88 going</div>
              </div>
              <div>
                <div className="font-medium">Cape Town Pitch Night</div>
                <div className="text-xs text-muted">July 5 · Workshop17 · 21 going</div>
              </div>
            </div>
          </Card>

          <Card className="p-5 bg-gradient-to-br from-emerald/10 to-amber/10">
            <h3 className="font-medium mb-2">Sankofa Cohort W24</h3>
            <p className="text-xs text-muted mb-3">Apply by July 1. 30 founders, 12-week intensive, $5k grant + mentor pairing.</p>
            <Button size="sm">Apply <ArrowRight className="size-3.5" /></Button>
          </Card>
        </div>
      </div>

      <Dialog open={composing} onClose={() => setComposing(false)} title="New post">
        <ComposeForm
          onSubmit={(body) => {
            notify({ title: "Posted to community", body: body.slice(0, 80) + (body.length > 80 ? "…" : "") });
            setComposing(false);
          }}
        />
      </Dialog>
    </div>
  );
}

function ComposeForm({ onSubmit }: { onSubmit: (body: string) => void }) {
  const [circle, setCircle] = useState("Agritech West Africa");
  const [body, setBody] = useState("");
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted mb-1.5">Circle</div>
        <select value={circle} onChange={(e) => setCircle(e.target.value)} className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none w-full">
          {CIRCLES.map((c) => <option key={c.id}>{c.name}</option>)}
        </select>
      </div>
      <Textarea placeholder="Ask, share, or seek intros. Be specific." value={body} onChange={(e) => setBody(e.target.value)} rows={6} />
      <div className="flex justify-end">
        <Button disabled={!body.trim()} onClick={() => onSubmit(body)}>Post</Button>
      </div>
    </div>
  );
}
