"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Textarea } from "@/components/ui";

// Textarea wrapper with @mention autocomplete.
//
// When the caret sits inside an `@…` token (no whitespace yet), a
// floating dropdown lists matching candidates. Up/Down to navigate,
// Tab/Enter to insert, Esc to dismiss. Click-to-insert also works.
//
// We deliberately do NOT do a contenteditable rich textarea — too much
// fragility around mobile keyboards. The native textarea stays
// authoritative; we just track the caret and overlay a popover.

export type MentionCandidate = {
  id: string;        // user_id
  display: string;   // name shown in dropdown
  token: string;     // what gets inserted after the @
  hint?: string;     // second-line context ("instructor", "co-author")
};

export function MentionAutocompleteTextarea({
  value,
  onChange,
  candidates,
  placeholder,
  rows = 3,
  className,
  onKeyDownExtra,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  candidates: MentionCandidate[];
  placeholder?: string;
  rows?: number;
  className?: string;
  onKeyDownExtra?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [tokenStart, setTokenStart] = useState<number | null>(null);

  // Re-scan the caret position on every keystroke. Cheap.
  function scan() {
    const ta = ref.current;
    if (!ta) return;
    const caret = ta.selectionStart;
    const before = value.slice(0, caret);
    // Look back for the last @ that's not preceded by a letter / digit /
    // underscore. If the @-token has whitespace in it, we're past it.
    const match = before.match(/(?:^|[^a-zA-Z0-9_])@([a-zA-Z0-9._-]{0,30})$/);
    if (!match) { setOpen(false); setTokenStart(null); return; }
    setQuery(match[1].toLowerCase());
    setTokenStart(caret - match[1].length - 1); // position of '@'
    setOpen(true);
    setActive(0);
  }

  useEffect(() => {
    scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const filtered = useMemo(() => {
    if (!open) return [];
    const q = query;
    const matches = candidates.filter((c) => {
      return c.token.toLowerCase().includes(q) || c.display.toLowerCase().includes(q);
    });
    return matches.slice(0, 6);
  }, [open, query, candidates]);

  function insert(c: MentionCandidate) {
    const ta = ref.current;
    if (!ta || tokenStart === null) return;
    const caret = ta.selectionStart;
    const next = value.slice(0, tokenStart) + "@" + c.token + " " + value.slice(caret);
    onChange(next);
    setOpen(false);
    // Restore focus + caret after React paints.
    requestAnimationFrame(() => {
      const pos = tokenStart + 1 + c.token.length + 1;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (open && filtered.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % filtered.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + filtered.length) % filtered.length); return; }
      if (e.key === "Enter" || e.key === "Tab") {
        // Only steal Enter when there's an active candidate and the
        // caller hasn't claimed Cmd/Ctrl+Enter for send.
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          // let the parent handle send
        } else {
          e.preventDefault();
          insert(filtered[active]);
          return;
        }
      }
      if (e.key === "Escape") { setOpen(false); return; }
    }
    onKeyDownExtra?.(e);
  }

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        onClick={scan}
        rows={rows}
        placeholder={placeholder}
        className={className}
        autoFocus={autoFocus}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 left-2 right-2 sm:left-2 sm:right-auto sm:min-w-[240px] sm:max-w-[320px] rounded-xl border border-border bg-surface shadow-2xl overflow-hidden">
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); insert(c); }}
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
      )}
    </div>
  );
}
