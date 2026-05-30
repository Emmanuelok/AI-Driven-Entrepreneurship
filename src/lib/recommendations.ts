import { allDepartments, Department } from "@/lib/disciplines";
import { TRACKS, Track } from "@/lib/curriculum";
import { AGENTS, Agent } from "@/lib/agents";
import { PROBLEMS, Problem } from "@/lib/problems";
import { MENTORS, Mentor } from "@/lib/mentors";
import { FUNDING, Funding } from "@/lib/funding";

// Resolve a user's field string into a discipline record.
// User.field looks like "Agricultural Engineering (College of Engineering)" or "General"
export function resolveDepartment(field: string | undefined): Department | undefined {
  if (!field) return undefined;
  const all = allDepartments();
  // exact name match first
  let match = all.find((d) => field.includes(d.name));
  if (match) return match;
  // fallback: substring match against keywords
  const lower = field.toLowerCase();
  match = all.find((d) => lower.includes(d.name.toLowerCase().split(" ")[0]));
  return match;
}

export type Recommendations = {
  department?: Department;
  tracks: Track[];
  agents: Agent[];
  problems: Problem[];
  mentors: Mentor[];
  funding: Funding[];
};

export function getRecommendations(field: string | undefined): Recommendations {
  const dept = resolveDepartment(field);
  if (!dept) {
    return {
      tracks: TRACKS.slice(0, 3),
      agents: AGENTS.slice(0, 6),
      problems: PROBLEMS.slice(0, 6),
      mentors: MENTORS.slice(0, 4),
      funding: FUNDING.slice(0, 6),
    };
  }

  const tracks = dept.relevantTracks.map((id) => TRACKS.find((t) => t.id === id)).filter((t): t is Track => !!t);
  const agents = dept.relevantAgents.map((id) => AGENTS.find((a) => a.id === id)).filter((a): a is Agent => !!a);

  // Problems: explicit ids first, then any matching sector
  const explicit = (dept.relevantProblemIds ?? []).map((id) => PROBLEMS.find((p) => p.id === id)).filter((p): p is Problem => !!p);
  const sectorMatch = PROBLEMS.filter((p) => dept.relevantSectors.includes(p.sector) && !explicit.includes(p));
  const problems = [...explicit, ...sectorMatch].slice(0, 8);

  // Mentors: scored overlap. We score every mentor (not just the
  // hits) so the recommendations list is stable and the "For your
  // discipline" toggle on the marketplace page can also use this
  // function downstream.
  const mentors = scoreMentors(MENTORS, dept).slice(0, 6);

  // Funding: prefer sources whose sectors overlap, or include "Any"
  const funding = FUNDING.filter((f) => f.sectors.includes("Any") || f.sectors.some((s) => dept.relevantSectors.includes(s))).slice(0, 8);

  return { department: dept, tracks, agents, problems, mentors, funding };
}

// ── Mentor scoring ────────────────────────────────────────────────────
// Score a single mentor against a department's relevantMentorExpertise.
// Direct (whole-tag) matches weight more than substring matches; we
// also give pro-bono mentors a small boost so they rank ahead when
// scores tie (rewards generosity, helps students afford mentorship).
export function scoreMentorAgainstDepartment(mentor: Mentor, dept: Department): number {
  let score = 0;
  for (const e of mentor.expertise) {
    const eLower = e.toLowerCase();
    for (const ex of dept.relevantMentorExpertise) {
      const exLower = ex.toLowerCase();
      if (eLower === exLower) score += 3;             // exact tag match
      else if (eLower.includes(exLower) || exLower.includes(eLower)) score += 2; // substring
    }
  }
  // Sector-bridge bonus: when a mentor's expertise overlaps the
  // department's relevant SECTORS (Health, Energy, etc.) but not its
  // explicit mentor-expertise list, count it lighter.
  for (const e of mentor.expertise) {
    const eLower = e.toLowerCase();
    for (const s of dept.relevantSectors) {
      if (eLower.includes(s.toLowerCase())) score += 1;
    }
  }
  if (mentor.pricePerHour === 0 && score > 0) score += 0.5; // pro-bono tiebreaker
  return score;
}

// Score + sort every mentor descending. Mentors with score 0 still
// appear at the bottom so a discipline with thin matches doesn't
// produce an empty list.
export function scoreMentors(mentors: Mentor[], dept: Department): Mentor[] {
  return mentors
    .map((m) => ({ m, s: scoreMentorAgainstDepartment(m, dept) }))
    .sort((a, b) => b.s - a.s || a.m.name.localeCompare(b.m.name))
    .map((x) => x.m);
}
