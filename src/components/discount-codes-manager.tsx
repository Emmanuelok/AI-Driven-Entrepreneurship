"use client";

import { useEffect, useState, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { Card, Button, Input, Badge, Dialog } from "@/components/ui";
import { Tag, Plus, Trash2, AlertCircle, Check } from "lucide-react";
import { format } from "date-fns";

type Code = {
  id: string;
  code: string;
  kind: "percent" | "fixed";
  value: number;
  applies_to_kind: "cohort" | "build" | null;
  applies_to_ref: string | null;
  max_redemptions: number | null;
  redemptions: number;
  expires_at: string | null;
  created_at: string;
};

// Seller-side discount codes manager. Mounted inside the Payments
// section in Settings. Hidden when no codes AND seller isn't ready
// (so it doesn't feel like a dead panel for non-sellers).

export function DiscountCodesManager() {
  const [codes, setCodes] = useState<Code[] | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const sb = supabaseBrowser();
      if (!sb) return;
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setCodes([]); return; }
      const res = await fetch("/api/v2/payments/discount-codes", { headers: { Authorization: `Bearer ${session.access_token}` } });
      const data = await res.json();
      if (data.ok) setCodes(data.results ?? []);
    } catch { setCodes([]); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  if (codes === null) return null;
  if (codes.length === 0 && !creating) {
    return (
      <div className="mt-6 pt-6 border-t border-border">
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-widest text-emerald flex items-center gap-1.5">
            <Tag className="size-3" /> Discount codes
          </h3>
          <button onClick={() => setCreating(true)} className="text-[10px] uppercase tracking-widest text-muted hover:text-emerald inline-flex items-center gap-1 transition">
            <Plus className="size-2.5" /> New code
          </button>
        </div>
        <p className="text-[10px] text-muted mt-2">Create early-bird, scholarship, or referral codes that knock down the price for your buyers.</p>
        <NewCodeDialog open={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); refresh(); }} />
      </div>
    );
  }

  async function remove(id: string) {
    if (!confirm("Delete this code? Existing redemptions stay on file; new uses will be rejected.")) return;
    const sb = supabaseBrowser();
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    await fetch(`/api/v2/payments/discount-codes/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${session.access_token}` } });
    refresh();
  }

  return (
    <div className="mt-6 pt-6 border-t border-border space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-widest text-emerald flex items-center gap-1.5">
          <Tag className="size-3" /> Discount codes
        </h3>
        <Button size="sm" variant="secondary" onClick={() => setCreating(true)}><Plus className="size-3" /> New code</Button>
      </div>

      <ul className="space-y-2">
        {codes.map((c) => {
          const expired = c.expires_at && new Date(c.expires_at) < new Date();
          const exhausted = typeof c.max_redemptions === "number" && c.redemptions >= c.max_redemptions;
          const dead = expired || exhausted;
          return (
            <li key={c.id} className="group">
              <Card className={`p-3 flex items-center gap-3 ${dead ? "opacity-50" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{c.code}</span>
                    <Badge color={c.kind === "percent" ? "emerald" : "amber"}>
                      {c.kind === "percent" ? `${c.value}% off` : `${(c.value / 100).toFixed(2)} off`}
                    </Badge>
                    {dead && <Badge color="rust">{expired ? "expired" : "exhausted"}</Badge>}
                  </div>
                  <div className="text-[10px] text-muted mt-0.5">
                    {c.applies_to_kind ? `${c.applies_to_kind}: ${c.applies_to_ref}` : "Any product you sell"}
                    {" · "}
                    {c.redemptions}{c.max_redemptions ? ` / ${c.max_redemptions}` : ""} used
                    {c.expires_at && <> · expires {format(new Date(c.expires_at), "MMM d, yyyy")}</>}
                  </div>
                </div>
                <button onClick={() => remove(c.id)} className="opacity-0 group-hover:opacity-100 transition text-muted hover:text-rust" aria-label="Delete code">
                  <Trash2 className="size-3.5" />
                </button>
              </Card>
            </li>
          );
        })}
      </ul>

      <NewCodeDialog open={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); refresh(); }} />
    </div>
  );
}

function NewCodeDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState("");
  const [maxRed, setMaxRed] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true); setError(null);
    try {
      const sb = supabaseBrowser();
      if (!sb) { setError("Cloud sync isn't configured."); return; }
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { setError("Sign in first."); return; }
      const res = await fetch("/api/v2/payments/discount-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          code,
          kind,
          value: kind === "percent" ? parseInt(value || "0") : Math.round(parseFloat(value || "0") * 100),
          maxRedemptions: maxRed ? parseInt(maxRed) : undefined,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.message || data.error || "Couldn't create."); return; }
      onCreated();
      setCode(""); setValue(""); setMaxRed(""); setExpiresAt("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="New discount code" size="md">
      <div className="space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Code (uppercase letters, digits, _ or -)</div>
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="EARLY25" className="font-mono" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Kind</div>
            <select value={kind} onChange={(e) => setKind(e.target.value as "percent" | "fixed")} className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm w-full outline-none focus:border-emerald">
              <option value="percent">Percent off</option>
              <option value="fixed">Fixed amount off</option>
            </select>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">{kind === "percent" ? "Percent (1–100)" : "Amount (in main currency)"}</div>
            <Input type="number" step={kind === "percent" ? "1" : "0.01"} min="0" value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === "percent" ? "25" : "10.00"} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Max redemptions (optional)</div>
            <Input type="number" min="1" value={maxRed} onChange={(e) => setMaxRed(e.target.value)} placeholder="∞" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-1">Expires (optional)</div>
            <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
        </div>
        <p className="text-[10px] text-muted">This code applies to any of your products. Per-product codes can be added via the API; the UI nudge for that comes next session.</p>
        {error && (
          <div className="text-xs text-rust flex items-start gap-1.5"><AlertCircle className="size-3.5 shrink-0 mt-0.5" />{error}</div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || !code.trim() || !value}>
            <Check className="size-4" /> {busy ? "Creating…" : "Create"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
