// Account types — who can register on the platform, and what each
// type's onboarding + profile looks like.
//
// The shape here is the single source of truth: onboarding picker,
// profile editor, public profile page, and people directory all read
// from this module so adding a new account type means adding it once.

export type AccountType =
  | "student"
  | "mentor"
  | "instructor"
  | "investor"
  | "funder"
  | "journalist"
  | "institution"
  | "general";

export type AccountTypeDef = {
  type: AccountType;
  label: string;        // e.g. "Mentor"
  pluralLabel: string;  // e.g. "Mentors"
  // Pithy line shown in the chooser ("I'm building a venture", "I want
  // to advise founders", etc.).
  oneLiner: string;
  // The longer "what you get" pitch that earns the click on the
  // account-type chooser.
  pitch: string;
  // Emoji shown on the chooser card.
  emoji: string;
};

export const ACCOUNT_TYPES: AccountTypeDef[] = [
  {
    type: "student",
    label: "Student / Founder",
    pluralLabel: "Founders",
    oneLiner: "I'm a student or early founder building a venture.",
    pitch:
      "A discipline-aware studio with Sage as your AI advisor. Spaced-repetition decks for what you need to know. Customer-discovery scripts in your language. Verifiable credentials when you ship.",
    emoji: "🎓",
  },
  {
    type: "mentor",
    label: "Mentor",
    pluralLabel: "Mentors",
    oneLiner: "I want to advise founders — paid, pro-bono, or both.",
    pitch:
      "Get matched with founders who fit your sectors and stage. Run office hours, leave async voice notes, contribute to specific workspaces. Track your impact across the founders you've helped.",
    emoji: "🧭",
  },
  {
    type: "instructor",
    label: "Instructor / Faculty",
    pluralLabel: "Instructors",
    oneLiner: "I teach a course or run a program and want my cohort on the platform.",
    pitch:
      "Run a cohort with shared workspaces, aggregated student progress, instructor-set deadlines stamped with your authority, and verifiable credentials issued under your institution.",
    emoji: "📚",
  },
  {
    type: "investor",
    label: "Investor",
    pluralLabel: "Investors",
    oneLiner: "I write checks into early-stage African ventures.",
    pitch:
      "Browse a curated marketplace of Sankofa-incubated ventures with real artifacts (LOIs, pitches, traction). Get founder updates and a clean portfolio view as you back companies.",
    emoji: "💰",
  },
  {
    type: "funder",
    label: "Funder / Grant program",
    pluralLabel: "Funders",
    oneLiner: "I run a grant, fellowship, or non-dilutive program.",
    pitch:
      "Distribute applications to founders that match your focus areas. Receive structured progress reporting from grantees. Connect your application URL so eligible founders see it.",
    emoji: "🌱",
  },
  {
    type: "journalist",
    label: "Journalist",
    pluralLabel: "Journalists",
    oneLiner: "I cover the African startup ecosystem.",
    pitch:
      "Discover founders by sector, region, and stage. Reach out (with founder consent) for interviews. Founders can credit your coverage on their public profile.",
    emoji: "📰",
  },
  {
    type: "institution",
    label: "Institution admin",
    pluralLabel: "Institutions",
    oneLiner: "I represent a university, accelerator, or partner org.",
    pitch:
      "Set up your institution's presence, invite faculty under your umbrella, and run partnership-level reporting. Talk to partnerships to white-label cohorts under your brand.",
    emoji: "🏛️",
  },
  {
    type: "general",
    label: "Just exploring",
    pluralLabel: "Members",
    oneLiner: "I'm here to learn — not registered as any of the above.",
    pitch:
      "Full access to the public surfaces, the community spaces (as they open), and personal learning tools. You can switch your account type later if you decide to build, mentor, or invest.",
    emoji: "👋",
  },
];

export function getAccountTypeDef(t: AccountType): AccountTypeDef {
  return ACCOUNT_TYPES.find((d) => d.type === t) ?? ACCOUNT_TYPES[ACCOUNT_TYPES.length - 1];
}

// Persona-specific fields. Loose typing — server validates per-type.
export type StudentPersona = {
  institution?: string;
  schoolId?: string;
  departmentId?: string;
  programId?: string;
  year?: 1 | 2 | 3 | 4 | 5;
  field?: string;
};

export type MentorPersona = {
  expertise?: string[];
  yearsExperience?: number;
  availability?: "paid" | "pro-bono" | "both";
  hourlyRate?: number;
  sectors?: string[];
  pastVentures?: string[];
};

export type InstructorPersona = {
  institution?: string;
  department?: string;
  courses?: string[];
};

export type InvestorPersona = {
  firmName?: string;
  typicalCheckSize?: number;
  sectors?: string[];
  stages?: string[];
};

export type FunderPersona = {
  programName?: string;
  focusAreas?: string[];
  applicationUrl?: string;
  fundingRange?: string;
};

export type JournalistPersona = {
  outletName?: string;
  beats?: string[];
};

export type InstitutionPersona = {
  name?: string;
  kind?: "university" | "accelerator" | "bootcamp" | "school" | "other";
  partnersSince?: string;
};

// Generate a URL-safe profile slug from a display name. Conservative —
// strips diacritics, lowercases, replaces non-alphanumerics with
// dashes, collapses runs. The server enforces uniqueness; collisions
// get a short suffix appended.
export function slugifyName(name: string): string {
  return (name || "member")
    .normalize("NFD")
    // Strip Unicode combining diacritical marks (U+0300..U+036F) so
    // "Bjørn" → "bjorn", "Adwoa" stays "adwoa", etc.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "member";
}
