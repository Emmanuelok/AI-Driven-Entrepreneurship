"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

// Reusable @mention autocomplete: a hook that watches a textarea's
// caret, plus a render-prop dropdown. Lets any styled textarea
// (including bare ones with custom styling) get the same picker
// behavior without inheriting the wrapper's styling.
//
// MentionAutocompleteTextarea uses this hook under the hood; the
// build-studio chat input wires it onto its own bare textarea.

export type MentionCandidate = {
  id: string;
  display: string;
  token: string;
  hint?: string;
};

export function useMentionAutocomplete(opts: {
  value: string;
  candidates: MentionCandidate[];
  onChange: (next: string) => void;
}) {
  const { value, candidates, onChange } = opts;
  const ref = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [tokenStart, setTokenStart] = useState<number | null>(null);

  function scan() {
    const ta = ref.current;
    if (!ta) return;
    const caret = ta.selectionStart;
    const before = value.slice(0, caret);
    const match = before.match(/(?:^|[^a-zA-Z0-9_])@([a-zA-Z0-9._-]{0,30})$/);
    if (!match) { setOpen(false); setTokenStart(null); return; }
    setQuery(match[1].toLowerCase());
    setTokenStart(caret - match[1].length - 1);
    setOpen(true);
    setActive(0);
  }

  useEffect(() => { scan(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [value]);

  const filtered = useMemo(() => {
    if (!open) return [];
    return candidates.filter((c) =>
      c.token.toLowerCase().includes(query) || c.display.toLowerCase().includes(query)
    ).slice(0, 6);
  }, [open, query, candidates]);

  function insert(c: MentionCandidate) {
    const ta = ref.current;
    if (!ta || tokenStart === null) return;
    const caret = ta.selectionStart;
    const next = value.slice(0, tokenStart) + "@" + c.token + " " + value.slice(caret);
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => {
      const pos = tokenStart + 1 + c.token.length + 1;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  }

  // Returns a handler that the parent merges into the textarea's
  // onKeyDown. Returns true when the event was consumed (parent should
  // stop processing it).
  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!open || filtered.length === 0) return false;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % filtered.length); return true; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + filtered.length) % filtered.length); return true; }
    if (e.key === "Escape") { setOpen(false); return true; }
    if (e.key === "Tab" || (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.shiftKey)) {
      e.preventDefault();
      insert(filtered[active]);
      return true;
    }
    return false;
  }

  return { ref, open, filtered, active, insert, handleKey, onClick: scan };
}

// Overlay dropdown — paint it absolutely-positioned near the textarea.
//
// If `anchorRef` is provided, the dropdown auto-detects available
// viewport space and flips above/below to avoid clipping. Callers
// that want manual positioning (e.g. the build chat above-only case)
// can still override via className.
//
// The flip threshold (~220px) matches the dropdown's max content
// height + a footer + breathing room.
export function MentionDropdown({
  filtered, active, onInsert, className, anchorRef,
}: {
  filtered: MentionCandidate[]; active: number;
  onInsert: (c: MentionCandidate) => void;
  className?: string;
  anchorRef?: React.RefObject<HTMLElement | null>;
}) {
  const [direction, setDirection] = useState<"below" | "above">("below");

  useLayoutEffect(() => {
    if (!anchorRef?.current || filtered.length === 0) return;
    const el = anchorRef.current;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    setDirection(spaceBelow < 220 && spaceAbove > spaceBelow ? "above" : "below");
  }, [filtered.length, anchorRef]);

  if (filtered.length === 0) return null;
  // Auto-positioning is only applied when caller didn't pass a custom
  // className. We assume callers that wrap with their own positioning
  // know what they're doing.
  const autoPos = anchorRef
    ? (direction === "above"
        ? "absolute left-0 right-0 sm:right-auto sm:min-w-[240px] sm:max-w-[320px] bottom-full mb-1"
        : "absolute left-0 right-0 sm:right-auto sm:min-w-[240px] sm:max-w-[320px] top-full mt-1")
    : "";
  return (
    <div className={`z-50 rounded-xl border border-border bg-surface shadow-2xl overflow-hidden ${className ?? autoPos}`}>
      <ul className="max-h-56 overflow-y-auto py-1">
        {filtered.map((c, i) => (
          <li key={c.id}>
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onInsert(c); }}
              className={`w-full text-left px-3 py-1.5 text-xs transition ${i === active ? "bg-emerald/10 text-emerald" : "text-foreground hover:bg-surface-2"}`}
            >
              <div className="font-medium">{c.display}</div>
              <div className="text-[10px] text-muted">@{c.token}{c.hint ? ` · ${c.hint}` : ""}</div>
            </button>
          </li>
        ))}
      </ul>
      <div className="px-3 py-1.5 border-t border-border text-[10px] text-muted bg-surface-2/40">↑↓ to navigate · Tab/Enter to insert · Esc to dismiss</div>
    </div>
  );
}
