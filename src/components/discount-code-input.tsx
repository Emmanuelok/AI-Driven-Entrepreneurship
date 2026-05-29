"use client";

import { useState } from "react";
import { Input, Button, Badge } from "@/components/ui";
import { Tag, Check, X, AlertCircle, Loader2 } from "lucide-react";

type Validation = {
  ok: true;
  code: string;
  label: string;
  originalCents: number;
  discountedCents: number;
  savingsCents: number;
  currency: string;
} | { ok: false; reason?: string; message?: string };

// "Have a code?" input shown on cohort + build checkout. Validates
// server-side; on success, surfaces a savings pill + reports the
// applied code up so the checkout request includes it.

export function DiscountCodeInput({ kind, refId, onApplied }: { kind: "cohort" | "build"; refId: string; onApplied: (code: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [validation, setValidation] = useState<Validation | null>(null);

  async function validate() {
    const trimmed = code.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const res = await fetch("/api/v2/payments/discount-codes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed, kind, refId }),
      });
      const data = await res.json();
      setValidation(data);
      if (data.ok) onApplied(trimmed.toUpperCase());
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setCode("");
    setValidation(null);
    onApplied(null);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-[10px] uppercase tracking-widest text-muted hover:text-emerald inline-flex items-center gap-1 transition">
        <Tag className="size-2.5" /> Have a code?
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setValidation(null); }}
          placeholder="EARLY25"
          onKeyDown={(e) => { if (e.key === "Enter") validate(); }}
          className="font-mono"
        />
        {validation?.ok ? (
          <Button variant="ghost" onClick={clear} aria-label="Remove code">
            <X className="size-4 text-rust" />
          </Button>
        ) : (
          <Button onClick={validate} disabled={busy || !code.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Apply"}
          </Button>
        )}
      </div>
      {validation && validation.ok && (
        <div className="text-xs flex items-center gap-2 text-emerald">
          <Check className="size-3.5" />
          <span>{validation.label}</span>
          <Badge color="emerald">
            −{(validation.savingsCents / 100).toFixed(2)} {validation.currency.toUpperCase()}
          </Badge>
        </div>
      )}
      {validation && !validation.ok && (
        <div className="text-xs text-rust flex items-start gap-1.5">
          <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
          {validation.message || "Code not valid for this product."}
        </div>
      )}
    </div>
  );
}
