// Storied realistic shipping moments to rotate through the landing's
// "Today on Sankofa" feed. Each is a real artifact a real student could ship.
export type Story = {
  who: string;
  field: string;
  school: string;
  city: string;
  shipped: string;
  artifactKind: "LOI" | "Pitch" | "Brand kit" | "Pricing" | "Interview script" | "Landing page" | "First sale";
  artifactExcerpt: string;
  minutesIn: number; // minutes into Ship Hour
};

export const STORIES: Story[] = [
  {
    who: "Ama Mensah",
    field: "Agricultural Engineering",
    school: "KNUST",
    city: "Tamale",
    shipped: "Signed a 30-day pilot with the Yendi tomato cooperative",
    artifactKind: "LOI",
    artifactExcerpt:
      "Dear Kofi, for the next 30 days KubaCold will deliver solar microcold storage at no upfront cost. After 30 days, if we've saved you at least 60% of weekly spoilage, we'll discuss a pilot extension at GHS 50/mo.",
    minutesIn: 38,
  },
  {
    who: "Adaeze Nwosu",
    field: "Medicine",
    school: "UNILAG",
    city: "Lagos",
    shipped: "Drafted a 12-question discovery script in Pidgin English",
    artifactKind: "Interview script",
    artifactExcerpt:
      "1. Walk me through the last patient you triaged. 2. When did you doubt your read on the symptoms? 3. What three tools you don't have would have changed the call?…",
    minutesIn: 21,
  },
  {
    who: "Boubacar Diallo",
    field: "Mechanical Engineering",
    school: "Université de Ouagadougou",
    city: "Ouagadougou",
    shipped: "Built a brand kit for SahelWeather in 18 minutes",
    artifactKind: "Brand kit",
    artifactExcerpt:
      "Name: SahelWeather (Hausa: 'kasance da sani'). Palette: dawn-sand #f4a949, mid-day-shade #2cc295, night-sky #0a0f0d. Voice: a wise farmer's voice — short, calm, never anxious.",
    minutesIn: 18,
  },
  {
    who: "Achieng' Otieno",
    field: "Computer Science",
    school: "University of Nairobi",
    city: "Nairobi",
    shipped: "First sale: ₦KSh 4,500 from a Kibera shopkeeper",
    artifactKind: "First sale",
    artifactExcerpt:
      "Mama Akinyi paid KSh 4,500 for her first month of KiviPay after a 12-minute WhatsApp demo. Sage drafted the demo script Wednesday. She paid Friday.",
    minutesIn: 60,
  },
  {
    who: "Kojo Asante",
    field: "Civil Engineering",
    school: "KNUST",
    city: "Kumasi",
    shipped: "Pitched at Lagos Founders' Friday — got 3 mentor intros",
    artifactKind: "Pitch",
    artifactExcerpt:
      "Last Tuesday, Mama Adwoa cried because four crates rotted. That's ₵480 in one afternoon. We've already saved 17 crates for one co-op. We're not asking for capital — we're asking for one introduction.",
    minutesIn: 51,
  },
  {
    who: "Esi Mensah",
    field: "Law",
    school: "University of Ghana",
    city: "Accra",
    shipped: "Wrote Wakili's 3-tier pricing page",
    artifactKind: "Pricing",
    artifactExcerpt:
      "Pilot (free, 30 days) · Standard ₵25/mo · Cooperative ₵180/mo for 20 small-claims cases. FAQ: 'What if you don't deliver?' Then we owe you. That's the entire point of the pilot.",
    minutesIn: 33,
  },
  {
    who: "Aminata Diop",
    field: "Public Health",
    school: "Cheikh Anta Diop University",
    city: "Dakar",
    shipped: "Landing page for HerHealth — translates between Wolof and French",
    artifactKind: "Landing page",
    artifactExcerpt:
      "Aw na yokk ay diké ñu nelaw? (Are you sleeping less than 5 hours?) Translation isn't enough. We listen. We learn. We answer in your tongue, in your context.",
    minutesIn: 42,
  },
  {
    who: "Tinashe Moyo",
    field: "Economics",
    school: "University of Cape Town",
    city: "Harare",
    shipped: "Signed first reseller in Harare — 8 stalls committed",
    artifactKind: "First sale",
    artifactExcerpt:
      "8 stalls × $12/mo committed for a 2-month trial. The pitch worked because we showed the spreadsheet, not the deck. Sage helped me build the spreadsheet.",
    minutesIn: 47,
  },
];

// One-line teasers that rotate in the personalized header strip.
export type Hook = { field: string; line: string };
export const HOOKS: Hook[] = [
  { field: "Agricultural Engineering", line: "By tomorrow, you'll have shipped a pay-per-crate cold-storage pilot offer for a real Tamale cooperative." },
  { field: "Medicine", line: "By tomorrow, you'll have a 12-question discovery script in your patients' first language — and 3 CHWs scheduled to talk to you." },
  { field: "Computer Science", line: "By tomorrow, you'll have shipped a WhatsApp-based bookkeeping bot to your first 5 mama-puts." },
  { field: "Law", line: "By tomorrow, you'll have a Twi-language legal-triage bot's landing page live with 3 LOIs in the queue." },
  { field: "Economics", line: "By tomorrow, you'll have a satellite-driven nowcasting demo on a spreadsheet a finance ministry intern can read." },
  { field: "Public Health", line: "By tomorrow, you'll have an outbreak-warning prototype that surveils Lagos State district reports in real time." },
  { field: "Mechanical Engineering", line: "By tomorrow, you'll have a minigrid feasibility tool that turns a satellite snapshot into a buildable spec." },
  { field: "Chemistry", line: "By tomorrow, you'll have a colorimetric water-quality strip + phone-vision app demo for one borehole community." },
  { field: "Design", line: "By tomorrow, you'll have brand-on-demand subscriptions live for 3 stalls in your local market." },
  { field: "Music", line: "By tomorrow, you'll have an Afrobeats royalty-tracking prototype with the first artist on board." },
];
