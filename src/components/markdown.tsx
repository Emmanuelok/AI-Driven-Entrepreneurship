"use client";

export function renderMarkdown(src: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let s = esc(src);
  s = s.replace(/```(\w+)?\n([\s\S]*?)```/g, (_m, _lang, code) => `<pre><code>${code}</code></pre>`);
  s = s.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  s = s.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  s = s.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  s = s.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|\s)\*([^*]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/(?:^|\n)((?:- .+\n?)+)/g, (_m, block) => {
    const items = block.trim().split("\n").map((l: string) => l.replace(/^- /, "")).map((l: string) => `<li>${l}</li>`).join("");
    return `\n<ul>${items}</ul>`;
  });
  s = s.replace(/(?:^|\n)((?:\d+\. .+\n?)+)/g, (_m, block) => {
    const items = block.trim().split("\n").map((l: string) => l.replace(/^\d+\. /, "")).map((l: string) => `<li>${l}</li>`).join("");
    return `\n<ol>${items}</ol>`;
  });
  s = s
    .split(/\n{2,}/)
    .map((p) => (/^<(h\d|ul|ol|pre|blockquote)/.test(p.trim()) ? p : `<p>${p.replace(/\n/g, "<br />")}</p>`))
    .join("\n");
  return s;
}

export function Markdown({ src, className }: { src: string; className?: string }) {
  return (
    <div
      className={`prose-chat text-[15px] leading-relaxed text-foreground/95 ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(src) }}
    />
  );
}
