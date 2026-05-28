"use client";

import CodeMirror from "@uiw/react-codemirror";
import { html } from "@codemirror/lang-html";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";

// Sankofa-tinted CodeMirror wrapper. Uses One Dark for tokens (battle-tested
// readability) but overrides the chrome to match our Studio palette so it
// disappears into the surface instead of looking like a different app.

const sankofaTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#06100d",
      color: "#e7efe9",
      fontSize: "12px",
      lineHeight: "1.6",
      height: "100%",
    },
    ".cm-scroller": {
      fontFamily: "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
    },
    ".cm-gutters": {
      backgroundColor: "#06100d",
      color: "#3d5048",
      border: "none",
      borderRight: "1px solid #1f2c28",
    },
    ".cm-activeLineGutter": { backgroundColor: "rgba(44,194,149,0.06)", color: "#2cc295" },
    ".cm-activeLine": { backgroundColor: "rgba(44,194,149,0.04)" },
    ".cm-cursor": { borderLeftColor: "#2cc295" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(44,194,149,0.18) !important",
    },
    ".cm-matchingBracket, .cm-nonmatchingBracket": {
      backgroundColor: "rgba(244,169,73,0.18)",
      outline: "1px solid #f4a949",
    },
  },
  { dark: true },
);

export function CodeEditor({
  value,
  onChange,
  onRun,
  readOnly = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onRun?: () => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      <CodeMirror
        value={value}
        height="100%"
        theme={[oneDark, sankofaTheme]}
        extensions={[html({ matchClosingTags: true, autoCloseTags: true })]}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          bracketMatching: true,
          autocompletion: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          closeBrackets: true,
          indentOnInput: true,
        }}
        onChange={(v) => onChange(v)}
        onKeyDown={(e) => {
          if (onRun && (e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onRun();
          }
        }}
        readOnly={readOnly}
        className="h-full text-[12px]"
        style={{ height: "100%" }}
      />
    </div>
  );
}
