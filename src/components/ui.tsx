"use client";

import { forwardRef, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost" | "danger" | "amber";
    size?: "sm" | "md" | "lg";
  }
>(({ className, variant = "primary", size = "md", ...props }, ref) => {
  const base = "inline-flex items-center justify-center gap-2 rounded-full font-medium transition disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0f0d]";
  const sz = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm", lg: "px-6 py-3 text-base" }[size];
  const v = {
    primary: "bg-emerald text-black hover:bg-amber",
    amber: "bg-amber text-black hover:bg-emerald",
    secondary: "border border-border bg-surface hover:bg-surface-2 text-foreground",
    ghost: "text-muted hover:text-foreground hover:bg-surface-2",
    danger: "bg-rust/15 text-rust border border-rust/30 hover:bg-rust/25",
  }[variant];
  return <button ref={ref} className={cn(base, sz, v, className)} {...props} />;
});
Button.displayName = "Button";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass rounded-2xl", className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 py-4 border-b border-border", className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6", className)} {...props} />;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald focus-visible:ring-2 focus-visible:ring-emerald/40 w-full placeholder:text-muted",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-emerald focus-visible:ring-2 focus-visible:ring-emerald/40 w-full placeholder:text-muted resize-y",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export function Badge({
  children,
  color = "emerald",
  className,
}: {
  children: ReactNode;
  color?: "emerald" | "amber" | "rust" | "indigo" | "muted";
  className?: string;
}) {
  const map = {
    emerald: "text-emerald border-emerald/40 bg-emerald/5",
    amber: "text-amber border-amber/40 bg-amber/5",
    rust: "text-rust border-rust/40 bg-rust/5",
    indigo: "text-indigo border-indigo/40 bg-indigo/5",
    muted: "text-muted border-border bg-surface-2",
  }[color];
  return (
    <span className={cn("text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full border inline-flex items-center gap-1.5", map, className)}>
      {children}
    </span>
  );
}

export function Progress({ value, max = 100, color = "emerald", className }: { value: number; max?: number; color?: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn("h-2 bg-surface-2 rounded-full overflow-hidden", className)}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `var(--color-${color}, var(--emerald))` }} />
    </div>
  );
}

export function Stat({ label, value, sub, color = "emerald" }: { label: string; value: ReactNode; sub?: string; color?: string }) {
  return (
    <Card className="p-5">
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className={`font-[family-name:var(--font-display)] text-3xl font-semibold mt-1`} style={{ color: `var(--color-${color}, var(--emerald))` }}>
        {value}
      </div>
      {sub && <div className="text-xs text-muted mt-2">{sub}</div>}
    </Card>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Card className="p-12 text-center">
      <Icon className="size-10 text-emerald mx-auto mb-4" />
      <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-muted max-w-md mx-auto">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </Card>
  );
}

export function Tabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 p-1 bg-surface-2 rounded-xl border border-border overflow-x-auto">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm transition shrink-0",
            value === o.value ? "bg-emerald text-black font-medium" : "text-muted hover:text-foreground",
          )}
        >
          {o.label}
          {typeof o.count === "number" && (
            <span className={cn("text-[10px] rounded-full px-1.5", value === o.value ? "bg-black/20" : "bg-border")}>{o.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  if (!open) return null;
  const w = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" }[size];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className={cn("relative glass rounded-2xl w-full overflow-hidden shadow-2xl", w)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h3 id="dialog-title" className="font-[family-name:var(--font-display)] text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-muted hover:text-foreground transition text-xl leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald rounded"
          >
            ×
          </button>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
