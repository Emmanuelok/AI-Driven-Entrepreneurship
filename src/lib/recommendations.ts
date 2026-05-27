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

  // Mentors: any whose expertise overlaps
  const mentors = MENTORS.filter((m) => m.expertise.some((e) => dept.relevantMentorExpertise.some((ex) => e.toLowerCase().includes(ex.toLowerCase()) || ex.toLowerCase().includes(e.toLowerCase())))).slice(0, 6);

  // Funding: prefer sources whose sectors overlap, or include "Any"
  const funding = FUNDING.filter((f) => f.sectors.includes("Any") || f.sectors.some((s) => dept.relevantSectors.includes(s))).slice(0, 8);

  return { department: dept, tracks, agents, problems, mentors, funding };
}
