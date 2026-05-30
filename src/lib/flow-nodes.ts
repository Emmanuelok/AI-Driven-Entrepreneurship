// ─────────────────────────────────────────────────────────────────────────
// Flow node taxonomy.
//
// A flow is a directed graph of Sankofa-specific work nodes that take you
// from "I have a problem in mind" → "I've shipped a venture". Each node
// has:
//   - a kind   (see below) that determines what model / route is invoked
//   - a config (per-kind: prompt, problemId, model, etc.)
//   - an output (text / markdown / html / json, written by Run)
//
// Nodes can reference upstream nodes in their prompts via @<id-or-label>.
// On Run we resolve those refs against the upstream nodes' last outputs.
//
// The taxonomy intentionally matches the existing Sankofa funnel — every
// node maps to a discrete artifact the user would otherwise produce
// in the Ship Hour or Venture Studio — so a finished flow is one
// "Ship to venture" click from being a real venture record.
// ─────────────────────────────────────────────────────────────────────────

export type NodeKind =
  | "problem"      // pick an Atlas problem OR describe one
  | "persona"      // generate a target customer
  | "wedge"        // smallest validatable slice
  | "interview"    // Bob Moesta-style discovery script
  | "pitch"        // 60-sec spoken pitch
  | "landing"      // landing-page copy
  | "build"        // single-file HTML prototype
  | "compose"      // assemble a venture record from upstream nodes
  | "note";        // free-form sticky text (no AI)

export const NODE_META: Record<NodeKind, {
  label: string;
  short: string;
  hint: string;
  color: "emerald" | "amber" | "indigo" | "rust" | "muted";
  requiresAi: boolean;
}> = {
  problem:   { label: "Problem",   short: "What hurts?",        hint: "Anchor the work on a specific pain point.",       color: "emerald", requiresAi: false },
  persona:   { label: "Persona",   short: "Who hurts?",         hint: "Generate a real-sounding target customer.",       color: "amber",   requiresAi: true  },
  wedge:     { label: "Wedge",     short: "Smallest slice",     hint: "What can you validate this week?",                 color: "emerald", requiresAi: true  },
  interview: { label: "Interview", short: "Discovery script",   hint: "12 non-leading questions to extract past behavior.", color: "indigo",  requiresAi: true  },
  pitch:     { label: "Pitch",     short: "60-second pitch",    hint: "What you'd say at a meetup.",                      color: "amber",   requiresAi: true  },
  landing:   { label: "Landing",   short: "Landing copy",       hint: "Hero, sub, three bullets, CTA.",                  color: "indigo",  requiresAi: true  },
  build:     { label: "Build",     short: "HTML prototype",     hint: "A single-file working artifact.",                  color: "rust",    requiresAi: true  },
  compose:   { label: "Compose",   short: "Assemble venture",   hint: "Combine upstream nodes into one venture record.",  color: "emerald", requiresAi: false },
  note:      { label: "Note",      short: "Sticky note",        hint: "Free-form context — referenced by downstream prompts.", color: "muted", requiresAi: false },
};

// Ordered list for the palette UI.
export const NODE_KINDS_ORDERED: NodeKind[] = [
  "problem", "persona", "wedge", "interview", "pitch", "landing", "build", "compose", "note",
];
