// Shared discount calculation: takes a base price + discount row,
// returns the discounted price (cents) and a label describing the
// adjustment. Capped at >= 0 so a $100 fixed code on a $50 product
// just makes it free, not negative.

export type DiscountRow = {
  id: string;
  code: string;
  kind: "percent" | "fixed";
  value: number;                                       // percent: 1-100; fixed: cents
  applies_to_kind?: string | null;
  applies_to_ref?: string | null;
  max_redemptions?: number | null;
  redemptions?: number;
  expires_at?: string | null;
};

export type DiscountResult = {
  ok: true;
  originalCents: number;
  discountedCents: number;
  savingsCents: number;
  label: string;                                       // e.g. "Early bird 25% off"
} | {
  ok: false;
  reason: "expired" | "exhausted" | "wrong_product" | "not_found";
  message: string;
};

export function applyDiscount(
  baseCents: number,
  discount: DiscountRow | null,
  context: { kind: "cohort" | "build"; refId: string; sellerId: string },
): DiscountResult {
  if (!discount) {
    return { ok: false, reason: "not_found", message: "No code found." };
  }
  if (discount.expires_at && new Date(discount.expires_at) < new Date()) {
    return { ok: false, reason: "expired", message: "This code has expired." };
  }
  if (typeof discount.max_redemptions === "number" && (discount.redemptions ?? 0) >= discount.max_redemptions) {
    return { ok: false, reason: "exhausted", message: "This code has been used up." };
  }
  // Product scope. If applies_to_kind/ref are set, they must match.
  if (discount.applies_to_kind && discount.applies_to_kind !== context.kind) {
    return { ok: false, reason: "wrong_product", message: "Code can't be used on this kind of product." };
  }
  if (discount.applies_to_ref && discount.applies_to_ref !== context.refId) {
    return { ok: false, reason: "wrong_product", message: "Code can't be used on this product." };
  }

  let discounted = baseCents;
  let label = "";
  if (discount.kind === "percent") {
    const pct = Math.max(1, Math.min(100, Math.floor(discount.value)));
    discounted = Math.max(0, Math.floor(baseCents - (baseCents * pct) / 100));
    label = `${discount.code.toUpperCase()} · ${pct}% off`;
  } else {
    const off = Math.max(1, Math.floor(discount.value));
    discounted = Math.max(0, baseCents - off);
    label = `${discount.code.toUpperCase()} · ${(off / 100).toFixed(2)} off`;
  }
  return {
    ok: true,
    originalCents: baseCents,
    discountedCents: discounted,
    savingsCents: baseCents - discounted,
    label,
  };
}
