// Real shipping moments shown in the landing's "Today on Sankofa" feed.
//
// In production this should be sourced from a real `public_artifacts`
// query (top recent artifacts shipped to the marketplace or pitched in
// the Arena). Until that surface lands, STORIES stays empty so the
// landing renders an honest empty-state instead of fabricated names.
//
// The HOOKS strip is the rotating "If you study X…" line on the Mirror
// scene; we keep a short set of discipline-agnostic lines that any
// visitor will find true. Field-specific hooks will be filled in once
// real shipped artifacts exist to back the claims.
export type Story = {
  who: string;
  field: string;
  school: string;
  city: string;
  shipped: string;
  artifactKind: "LOI" | "Pitch" | "Brand kit" | "Pricing" | "Interview script" | "Landing page" | "First sale";
  artifactExcerpt: string;
  minutesIn: number;
};

export const STORIES: Story[] = [];

export type Hook = { field: string; line: string };
export const HOOKS: Hook[] = [
  { field: "your discipline", line: "By tomorrow, you'll have shipped your first real artifact — a letter, a pitch, a landing page — to someone who can actually use it." },
  { field: "your context", line: "Tonight, your studio will know your country, your language, and the situations that matter where you live." },
  { field: "your craft", line: "This week, you'll move from idea to first conversation with a real customer — Sage will rehearse with you until you're ready." },
];
