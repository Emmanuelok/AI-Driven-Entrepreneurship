// Module + track shapes for the DB-driven curriculum (0049). Mirrors
// the jsonb shape stored in curriculum_tracks.modules so the editor +
// player + serializer all read off the same type.
//
// The schema is permissive on purpose — fields like resources +
// milestones are arrays so new module kinds (peer-review, group lab)
// can carry rich data without a migration. Validation happens at the
// API layer.

export type ModuleKind =
  | "concept"
  | "interactive"
  | "code"
  | "lab"
  | "venture"
  | "reading"
  | "milestone";

export type ResourceKind = "url" | "reading" | "video";

export type ModuleResource = {
  kind: ResourceKind;
  title: string;
  url: string;
};

export type Module = {
  id: string;
  order: number;
  title: string;
  summary: string;
  kind: ModuleKind;
  duration_min: number;
  resources: ModuleResource[];
  milestones: string[];
};

export type TrackLevel = "foundation" | "intermediate" | "advanced";

export type CurriculumTrack = {
  id: string;
  slug: string;
  organization_id: string | null;
  owner_user_id: string | null;
  forked_from: string | null;
  version: number;
  title: string;
  tagline: string;
  description: string;
  pillar: string | null;
  level: TrackLevel;
  duration_hours: number | null;
  modules: Module[];
  is_published: boolean;
  is_public: boolean;
  fork_count: number;
  created_at: string;
  updated_at: string;
};

// Compute the canonical "total minutes" from a track's module list.
// Used by the library card to show "42h" when the explicit
// duration_hours is unset.
export function totalMinutesFromModules(modules: Module[]): number {
  return modules.reduce((sum, m) => sum + (Number.isFinite(m.duration_min) ? m.duration_min : 0), 0);
}

// Sort modules by their .order field. Tolerates missing orders by
// falling back to array position.
export function sortedModules(modules: Module[]): Module[] {
  return [...modules]
    .map((m, i) => ({ ...m, order: typeof m.order === "number" ? m.order : i }))
    .sort((a, b) => a.order - b.order);
}

// Validate that a modules array is well-shaped enough to persist.
// Returns null on success, an error string on failure. We're strict
// about the things that would break the player (missing id, missing
// title) and lenient about the things that are stylistic.
export function validateModules(modules: unknown): { ok: true; modules: Module[] } | { ok: false; error: string } {
  if (!Array.isArray(modules)) return { ok: false, error: "modules_must_be_array" };
  if (modules.length > 200) return { ok: false, error: "too_many_modules" };
  const out: Module[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < modules.length; i++) {
    const raw = modules[i] as Record<string, unknown>;
    if (!raw || typeof raw !== "object") return { ok: false, error: `module_${i}_not_object` };
    const id = typeof raw.id === "string" && raw.id.length > 0 ? raw.id : `m-${i}-${Math.random().toString(36).slice(2, 6)}`;
    if (seenIds.has(id)) return { ok: false, error: `duplicate_module_id_${id}` };
    seenIds.add(id);
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    if (!title) return { ok: false, error: `module_${i}_missing_title` };
    const summary = typeof raw.summary === "string" ? raw.summary : "";
    const order = typeof raw.order === "number" ? raw.order : i;
    const duration_min = typeof raw.duration_min === "number" && raw.duration_min >= 0 ? raw.duration_min : 0;
    const kind: ModuleKind = (["concept", "interactive", "code", "lab", "venture", "reading", "milestone"] as ModuleKind[]).includes(raw.kind as ModuleKind)
      ? (raw.kind as ModuleKind)
      : "concept";
    const resources = Array.isArray(raw.resources) ? (raw.resources as ModuleResource[]).slice(0, 25) : [];
    const milestones = Array.isArray(raw.milestones) ? (raw.milestones as string[]).filter((m) => typeof m === "string").slice(0, 25) : [];
    out.push({ id, order, title, summary, kind, duration_min, resources, milestones });
  }
  return { ok: true, modules: out };
}
