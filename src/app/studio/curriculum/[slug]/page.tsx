"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase";
import { curriculumApi } from "@/lib/cohort-api-v2";
import { type CurriculumTrack, type Module, type ModuleKind, type TrackLevel, totalMinutesFromModules, sortedModules } from "@/lib/curriculum-track";
import { Card, Button, Input, Textarea, Badge, Dialog } from "@/components/ui";
import { ArrowLeft, BookOpen, Plus, Trash2, GitFork, Save, ChevronUp, ChevronDown, Loader2, Eye, Hourglass, Pencil, CheckCircle2, Lock, Globe2, AlertCircle } from "lucide-react";

// /studio/curriculum/[slug] — track detail + editor.
//
// Two modes: VIEW (anyone with access) and EDIT (owners + org admins).
// The page detects ownership via the row's owner_user_id; if the
// viewer isn't the owner, the editor controls are hidden but they
// can still Fork to make their own copy.

const KIND_LABEL: Record<ModuleKind, string> = {
  concept: "Concept", interactive: "Interactive", code: "Code",
  lab: "Lab", venture: "Venture", reading: "Reading", milestone: "Milestone",
};

const LEVEL_COLOR: Record<TrackLevel, "muted" | "emerald" | "amber"> = {
  foundation: "emerald", intermediate: "amber", advanced: "muted",
};

export default function TrackDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const router = useRouter();
  const { slug } = use(params);
  const [track, setTrack] = useState<CurriculumTrack | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [modules, setModules] = useState<Module[]>([]);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Track-level edits land in this object so we can save them together
  // with module changes in one PATCH.
  const [titleEdit, setTitleEdit] = useState("");
  const [taglineEdit, setTaglineEdit] = useState("");
  const [descriptionEdit, setDescriptionEdit] = useState("");
  const [levelEdit, setLevelEdit] = useState<TrackLevel>("foundation");

  async function load() {
    const sb = supabaseBrowser();
    if (sb) {
      const { data } = await sb.auth.getSession();
      setViewerId(data.session?.user.id ?? null);
    }
    const r = await curriculumApi.get(slug);
    if (!r.ok) { setMissing(true); setLoading(false); return; }
    setTrack(r.track);
    setModules(sortedModules(r.track.modules ?? []));
    setTitleEdit(r.track.title);
    setTaglineEdit(r.track.tagline);
    setDescriptionEdit(r.track.description);
    setLevelEdit(r.track.level);
    setLoading(false);
  }
  useEffect(() => { void load(); }, [slug]);

  if (loading) return <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="size-6 text-emerald animate-spin" /></div>;
  if (missing || !track) { notFound(); return null; }

  const canEdit = !!viewerId && (track.owner_user_id === viewerId);
  const canFork = !!viewerId; // any signed-in user can fork a track they can read
  const totalMin = totalMinutesFromModules(modules);

  function patchModule(idx: number, fields: Partial<Module>) {
    setModules((arr) => arr.map((m, i) => (i === idx ? { ...m, ...fields } : m)));
    setDirty(true);
  }

  function addModule() {
    const id = `m-${Date.now().toString(36)}`;
    setModules((arr) => [...arr, {
      id, order: arr.length, title: "Untitled module", summary: "",
      kind: "concept", duration_min: 30, resources: [], milestones: [],
    }]);
    setDirty(true);
  }

  function removeModule(idx: number) {
    if (!confirm("Remove this module?")) return;
    setModules((arr) => arr.filter((_, i) => i !== idx).map((m, i) => ({ ...m, order: i })));
    setDirty(true);
  }

  function move(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= modules.length) return;
    setModules((arr) => {
      const out = [...arr];
      [out[idx], out[next]] = [out[next], out[idx]];
      return out.map((m, i) => ({ ...m, order: i }));
    });
    setDirty(true);
  }

  async function save() {
    if (!track) return;
    setSaving(true);
    setErr(null);
    const r = await curriculumApi.patch(track.slug, {
      title: titleEdit,
      tagline: taglineEdit,
      description: descriptionEdit,
      level: levelEdit,
      modules,
    });
    setSaving(false);
    if (!r.ok) { setErr(r.error); return; }
    setTrack(r.track);
    setDirty(false);
    setSavedMsg("Saved");
    setTimeout(() => setSavedMsg(null), 2000);
  }

  async function togglePublish() {
    if (!track) return;
    const r = await curriculumApi.patch(track.slug, { is_published: !track.is_published });
    if (r.ok) setTrack(r.track);
  }

  async function togglePublic() {
    if (!track) return;
    const r = await curriculumApi.patch(track.slug, { is_public: !track.is_public });
    if (r.ok) setTrack(r.track);
  }

  async function fork() {
    const r = await curriculumApi.fork(track!.slug);
    if (r.ok) router.push(`/studio/curriculum/${r.track.slug}`);
  }

  async function destroy() {
    if (!confirm(`Delete "${track!.title}"? Cohorts that adopted it will need to pick a new track.`)) return;
    const r = await curriculumApi.delete(track!.slug);
    if (r.ok) router.push("/studio/curriculum");
  }

  return (
    <div className="max-w-4xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
      <Link href="/studio/curriculum" className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1.5 mb-5">
        <ArrowLeft className="size-3" /> Curriculum library
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald mb-2 flex items-center gap-1.5">
            <BookOpen className="size-3.5" /> Curriculum track
          </p>
          {editing ? (
            <Input value={titleEdit} onChange={(e) => { setTitleEdit(e.target.value); setDirty(true); }} className="text-3xl font-semibold" />
          ) : (
            <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight">{track.title}</h1>
          )}
          {editing ? (
            <Textarea value={taglineEdit} onChange={(e) => { setTaglineEdit(e.target.value); setDirty(true); }} rows={2} className="mt-2" placeholder="Tagline" />
          ) : (
            track.tagline && <p className="mt-2 text-muted leading-relaxed">{track.tagline}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2 items-center text-xs">
            <Badge color={LEVEL_COLOR[track.level]}>{track.level}</Badge>
            <Badge color="muted">{modules.length} module{modules.length === 1 ? "" : "s"}</Badge>
            <Badge color="muted"><span className="inline-flex items-center gap-1"><Hourglass className="size-3" />{Math.round(totalMin / 60) || track.duration_hours || 0}h</span></Badge>
            {track.is_published && track.is_public && <Badge color="emerald"><span className="inline-flex items-center gap-1"><Globe2 className="size-3" /> Public</span></Badge>}
            {!track.is_published && <Badge color="amber"><span className="inline-flex items-center gap-1"><Lock className="size-3" /> Draft</span></Badge>}
            {track.forked_from && <span className="text-[11px] text-muted">forked</span>}
            {track.fork_count > 0 && (
              <span className="text-[11px] text-muted inline-flex items-center gap-0.5"><GitFork className="size-3" /> {track.fork_count} fork{track.fork_count === 1 ? "" : "s"}</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {canFork && !canEdit && (
            <Button onClick={fork}><GitFork className="size-4" /> Fork</Button>
          )}
          {canEdit && !editing && (
            <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="size-4" /> Edit</Button>
          )}
          {canEdit && editing && (
            <>
              <Button variant="ghost" onClick={() => { setEditing(false); void load(); }}>Cancel</Button>
              <Button onClick={save} disabled={!dirty || saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save
              </Button>
            </>
          )}
        </div>
      </div>

      {savedMsg && (
        <div className="mb-5 rounded-xl border border-emerald/30 bg-emerald/5 px-4 py-2.5 text-sm text-emerald inline-flex items-center gap-2">
          <CheckCircle2 className="size-4" /> {savedMsg}
        </div>
      )}
      {err && (
        <div className="mb-5 rounded-xl border border-rust/30 bg-rust/5 px-4 py-2.5 text-sm text-rust inline-flex items-center gap-2">
          <AlertCircle className="size-4" /> {err}
        </div>
      )}

      {(editing || track.description) && (
        <Card className="p-5 mb-5">
          <h2 className="text-sm font-medium mb-2">About this track</h2>
          {editing ? (
            <Textarea value={descriptionEdit} onChange={(e) => { setDescriptionEdit(e.target.value); setDirty(true); }} rows={4} placeholder="What does this track teach? Who's it for?" />
          ) : (
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{track.description}</p>
          )}
        </Card>
      )}

      {/* Modules list */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">Modules</h2>
        {canEdit && editing && (
          <Button size="sm" variant="secondary" onClick={addModule}><Plus className="size-3.5" /> Add module</Button>
        )}
      </div>

      {modules.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted italic">No modules yet.</p>
          {canEdit && editing && <Button className="mt-3" onClick={addModule}><Plus className="size-4" /> Add the first module</Button>}
        </Card>
      ) : (
        <ol className="space-y-2.5">
          {modules.map((m, idx) => (
            <ModuleRow
              key={m.id}
              index={idx}
              total={modules.length}
              module={m}
              editing={editing && canEdit}
              onChange={(fields) => patchModule(idx, fields)}
              onMove={(dir) => move(idx, dir)}
              onRemove={() => removeModule(idx)}
            />
          ))}
        </ol>
      )}

      {canEdit && !editing && (
        <Card className="p-5 mt-8 space-y-3">
          <h2 className="text-sm font-medium">Track settings</h2>
          <div className="flex items-center gap-3 flex-wrap">
            <Button size="sm" variant="secondary" onClick={togglePublish}>
              {track.is_published ? "Unpublish" : "Publish"}
            </Button>
            <Button size="sm" variant="ghost" onClick={togglePublic}>
              {track.is_public ? "Make private" : "Add to public library"}
            </Button>
            <Button size="sm" variant="ghost" onClick={destroy}>
              <Trash2 className="size-3.5 text-rust" /> Delete track
            </Button>
          </div>
          <p className="text-[11px] text-muted leading-relaxed">
            Publish makes the track discoverable to cohorts adopting one. Public adds it to the library at /studio/curriculum.
          </p>
        </Card>
      )}
    </div>
  );
}

function ModuleRow({ index, total, module: m, editing, onChange, onMove, onRemove }: {
  index: number; total: number;
  module: Module; editing: boolean;
  onChange: (fields: Partial<Module>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li>
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <div className="size-7 rounded-lg bg-surface-2 border border-border flex items-center justify-center text-xs text-muted shrink-0">
            {index + 1}
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <Input
                value={m.title}
                onChange={(e) => onChange({ title: e.target.value })}
                className="font-medium"
              />
            ) : (
              <h3 className="font-medium text-sm">{m.title}</h3>
            )}
            <div className="mt-1 flex items-center gap-3 text-[11px] text-muted">
              <span>{KIND_LABEL[m.kind]}</span>
              <span>{m.duration_min} min</span>
              {m.milestones.length > 0 && <span>{m.milestones.length} milestone{m.milestones.length === 1 ? "" : "s"}</span>}
            </div>
            {!editing && m.summary && (
              <p className="mt-2 text-sm text-muted leading-relaxed">{m.summary}</p>
            )}
            {editing && expanded && (
              <div className="mt-3 space-y-3">
                <Textarea
                  value={m.summary}
                  onChange={(e) => onChange({ summary: e.target.value })}
                  rows={2}
                  placeholder="Summary — one sentence."
                />
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs">
                    <span className="text-muted block mb-1 uppercase tracking-widest">Kind</span>
                    <select
                      value={m.kind}
                      onChange={(e) => onChange({ kind: e.target.value as ModuleKind })}
                      className="bg-surface-2 border border-border rounded-lg px-2 py-1.5 outline-none w-full"
                    >
                      {(Object.keys(KIND_LABEL) as ModuleKind[]).map((k) => (
                        <option key={k} value={k}>{KIND_LABEL[k]}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs">
                    <span className="text-muted block mb-1 uppercase tracking-widest">Duration (min)</span>
                    <Input
                      type="number"
                      value={m.duration_min}
                      onChange={(e) => onChange({ duration_min: Math.max(0, Number(e.target.value) || 0) })}
                      min={0}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {editing && (
              <>
                <button onClick={() => setExpanded((v) => !v)} className="size-7 rounded-lg text-muted hover:text-foreground hover:bg-surface-2 flex items-center justify-center" title="Expand details">
                  <Eye className="size-3.5" />
                </button>
                <button onClick={() => onMove(-1)} disabled={index === 0} className="size-7 rounded-lg text-muted hover:text-foreground hover:bg-surface-2 flex items-center justify-center disabled:opacity-30" title="Move up">
                  <ChevronUp className="size-3.5" />
                </button>
                <button onClick={() => onMove(1)} disabled={index === total - 1} className="size-7 rounded-lg text-muted hover:text-foreground hover:bg-surface-2 flex items-center justify-center disabled:opacity-30" title="Move down">
                  <ChevronDown className="size-3.5" />
                </button>
                <button onClick={onRemove} className="size-7 rounded-lg text-muted hover:text-rust hover:bg-rust/10 flex items-center justify-center" title="Remove">
                  <Trash2 className="size-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </Card>
    </li>
  );
}
