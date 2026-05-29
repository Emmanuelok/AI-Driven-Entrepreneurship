"use client";

import { Textarea } from "@/components/ui";
import { useMentionAutocomplete, MentionDropdown, type MentionCandidate } from "@/components/use-mention-autocomplete";

// Textarea wrapper with @mention autocomplete — the styled-UI flavor.
// Under the hood it uses the shared useMentionAutocomplete hook so
// any bare textarea (build studio chat, future surfaces) can pick up
// the same behavior without inheriting this wrapper's styling.
//
// Up/Down to navigate, Tab/Enter to insert, Esc to dismiss. Click-to-
// insert also works.

export type { MentionCandidate } from "@/components/use-mention-autocomplete";

export function MentionAutocompleteTextarea({
  value, onChange, candidates, placeholder, rows = 3, className, onKeyDownExtra, autoFocus,
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
  const a = useMentionAutocomplete({ value, candidates, onChange });

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (a.handleKey(e)) return;
    onKeyDownExtra?.(e);
  }

  return (
    <div className="relative">
      <Textarea
        ref={a.ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKey}
        onClick={a.onClick}
        rows={rows}
        placeholder={placeholder}
        className={className}
        autoFocus={autoFocus}
      />
      {a.open && (
        <MentionDropdown
          filtered={a.filtered}
          active={a.active}
          onInsert={a.insert}
          className="absolute mt-1 left-2 right-2 sm:left-2 sm:right-auto sm:min-w-[240px] sm:max-w-[320px]"
        />
      )}
    </div>
  );
}
