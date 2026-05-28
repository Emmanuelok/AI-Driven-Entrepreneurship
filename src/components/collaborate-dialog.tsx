"use client";

import { useState } from "react";
import { Dialog, Button, Input, Badge } from "@/components/ui";
import { useCloudVenture } from "@/lib/cloud-venture";
import { UserPlus, Crown, Eye, Pencil, X, AlertCircle, Cloud, Mail, Check } from "lucide-react";

// "Collaborate" dialog launched from the venture cockpit. Shows the
// current cloud state, lets the owner promote a local venture, invite
// collaborators by email, and remove members / pending invites.

export function CollaborateDialog({ ventureId, open, onClose }: { ventureId: string; open: boolean; onClose: () => void }) {
  const cv = useCloudVenture(ventureId);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [inviting, setInviting] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function promote() {
    setPromoting(true);
    setFeedback(null);
    const r = await cv.upgrade();
    setPromoting(false);
    if (!r.ok) setFeedback({ kind: "err", text: r.error ?? "Couldn't promote venture." });
    else setFeedback({ kind: "ok", text: "Venture is now collaborative. Invite a co-founder below." });
  }

  async function invite() {
    if (!email.trim()) return;
    setInviting(true);
    setFeedback(null);
    const r = await cv.inviteByEmail(email.trim(), role);
    setInviting(false);
    if (!r.ok) setFeedback({ kind: "err", text: r.error ?? "Couldn't invite." });
    else {
      setEmail("");
      setFeedback({ kind: "ok", text: r.mode === "added_directly" ? "Added — they're already on Sankofa." : "Invite sent. Link is good for 14 days." });
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Collaborate" size="md">
      {cv.loading ? (
        <div className="py-8 text-center text-sm text-muted">Loading…</div>
      ) : !cv.isCloud ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber/30 bg-amber/5 p-4 flex items-start gap-3">
            <Cloud className="size-5 text-amber shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium mb-1">This venture lives only on your device.</div>
              <p className="text-muted leading-relaxed">
                Promote it to the cloud to invite co-founders, edit together in real time, and access it from any device.
                Your existing data is preserved — it just becomes the source of truth.
              </p>
            </div>
          </div>
          {feedback && (
            <div className={`text-xs flex items-start gap-1.5 ${feedback.kind === "err" ? "text-rust" : "text-emerald"}`}>
              {feedback.kind === "err" ? <AlertCircle className="size-3.5 shrink-0 mt-0.5" /> : <Check className="size-3.5 shrink-0 mt-0.5" />}
              {feedback.text}
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={promote} disabled={promoting}>
              <Cloud className="size-4" /> {promoting ? "Promoting…" : "Make collaborative"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Members list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs uppercase tracking-widest text-emerald">Members</h3>
              <Badge color="muted">{cv.members.length}</Badge>
            </div>
            <ul className="space-y-1.5">
              {cv.members.map((m) => (
                <li key={m.user_id} className="group flex items-center gap-3 px-3 py-2 rounded-xl border border-border bg-surface-2/40">
                  <div className="size-7 rounded-full bg-gradient-to-br from-emerald to-amber flex items-center justify-center text-black font-semibold text-[10px] shrink-0">
                    {(m.display_name || m.email || "?")[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{m.display_name || m.email || m.user_id}</div>
                    {m.display_name && m.email && <div className="text-[10px] text-muted truncate">{m.email}</div>}
                  </div>
                  <RoleBadge role={m.role} />
                  {cv.myRole === "owner" && m.role !== "owner" && (
                    <button
                      onClick={() => cv.removeMember(m.user_id)}
                      aria-label="Remove member"
                      className="opacity-0 group-hover:opacity-100 transition text-muted hover:text-rust"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Pending invites */}
          {cv.pendingInvites.length > 0 && cv.myRole === "owner" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs uppercase tracking-widest text-amber">Pending invites</h3>
                <Badge color="muted">{cv.pendingInvites.length}</Badge>
              </div>
              <ul className="space-y-1.5">
                {cv.pendingInvites.map((inv) => (
                  <li key={inv.id} className="group flex items-center gap-3 px-3 py-2 rounded-xl border border-border bg-surface-2/40">
                    <Mail className="size-3.5 text-amber shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{inv.email}</div>
                      <div className="text-[10px] text-muted">invited as {inv.role}</div>
                    </div>
                    <button
                      onClick={() => cv.revokeInvite(inv.id)}
                      aria-label="Revoke invite"
                      className="opacity-0 group-hover:opacity-100 transition text-muted hover:text-rust"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Invite form */}
          {cv.myRole === "owner" && (
            <div className="space-y-2">
              <h3 className="text-xs uppercase tracking-widest text-emerald flex items-center gap-1.5">
                <UserPlus className="size-3" /> Invite a co-founder
              </h3>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="co-founder@example.com"
                  onKeyDown={(e) => { if (e.key === "Enter") invite(); }}
                />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
                  className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald"
                  aria-label="Role"
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <Button onClick={invite} disabled={inviting || !email.trim()}>
                  {inviting ? "…" : "Invite"}
                </Button>
              </div>
            </div>
          )}

          {feedback && (
            <div className={`text-xs flex items-start gap-1.5 ${feedback.kind === "err" ? "text-rust" : "text-emerald"}`}>
              {feedback.kind === "err" ? <AlertCircle className="size-3.5 shrink-0 mt-0.5" /> : <Check className="size-3.5 shrink-0 mt-0.5" />}
              {feedback.text}
            </div>
          )}

          <div className="text-[10px] text-muted leading-relaxed border-t border-border pt-3">
            Editors can change anything except member list. Viewers see read-only. Owner can transfer ownership or delete the venture entirely.
            Edits sync in real-time via Supabase Realtime — last write wins on simultaneous changes.
          </div>
        </div>
      )}
    </Dialog>
  );
}

function RoleBadge({ role }: { role: "owner" | "editor" | "viewer" }) {
  const cfg = {
    owner: { Icon: Crown, color: "text-amber border-amber/40 bg-amber/10" },
    editor: { Icon: Pencil, color: "text-emerald border-emerald/40 bg-emerald/10" },
    viewer: { Icon: Eye, color: "text-muted border-border" },
  }[role];
  return (
    <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${cfg.color}`}>
      <cfg.Icon className="size-2.5" /> {role}
    </span>
  );
}
